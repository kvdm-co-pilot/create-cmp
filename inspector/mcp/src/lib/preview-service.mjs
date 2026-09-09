// preview-service.mjs — the resident preview loop ("Storybook for CMP", phase 1).
//
// One long-lived service per project, owned by the MCP server, so neither the human
// nor the agent ever runs Gradle by hand:
//
//   watch composeApp/src  ──debounce──►  :composeApp:renderScreens (serialized, queued)
//        ▲                                        │
//        │                                        ▼
//   edit & save                    composeApp/build/previews/<id>/{tree.json, screen.png}
//                                                 │
//                                                 ▼
//                    local HTTP server: live gallery (/) + SSE reload (/events)
//                    + static previews (/previews/*) + JSON status (/status)
//
// The human opens ONE URL once; every save re-renders and the page reloads itself.
// The agent gets the same state structurally (status(), changed screen ids, per-screen
// node/token/a11y summaries) — pixels flow to the human, structure flows to the AI.
//
// Design notes:
// - The render runner is INJECTED (runRender) so the core is unit-testable without
//   Gradle; the default runner shells to `./gradlew :composeApp:renderScreens -q`.
//   Renders are serialized; changes arriving mid-render queue exactly one follow-up.
// - fs.watch(recursive) is used where supported (macOS/Windows/modern Linux); on
//   ENOSYS/ERR_FEATURE_UNAVAILABLE it falls back to a 2s mtime poll — same debounce.
// - The gallery page is regenerated in-memory per render from manifest.json + the
//   trees, reusing the pure render/a11y libs (wireframe SVG inline; PNGs served
//   statically with a version cache-buster, not base64 — the page stays light).

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderTreeSvg } from "./render.mjs";
import { auditA11y } from "./a11y.mjs";
import { buildStatus, diskBuildId, loadedBuildId, runningFrom, sourceRoots } from "./build-id.mjs";
import { proveChange } from "./prove.mjs";
import { gradleEnv } from "./jdk.mjs";
import { fetchLiveCatalog } from "./live.mjs";
import {
  getApprovalsData,
  approveArtifact as approveArtifactViaLib,
  reopenArtifact as reopenArtifactViaLib,
  getFeatureBoard as getFeatureBoardViaLib,
  acceptFeature as acceptFeatureViaLib,
  getGovernedArtifacts as getGovernedArtifactsViaLib,
  getJournal as getJournalViaLib,
  getWalksData as getWalksDataViaLib,
} from "./approvals-bridge.mjs";
import {
  getCommentsData,
  addComment as addCommentViaLib,
  resolveComment as resolveCommentViaLib,
} from "./comments-bridge.mjs";
import { getProjectSpecsData } from "./specs.mjs";
import { resolveProjectLayout, DEFAULT_LAYOUT, MANIFEST_REL_PATH } from "./project-layout.mjs";
import { getArchitectureData } from "./architecture.mjs";
import { getLastReceipt, listReceiptHistory } from "./receipt-bridge.mjs";
// The lane's live step stream (LIVE-CONSOLE.md Phase B): read for the page,
// tailed for the SSE. The bridge supplies bytes and a clock; console-now.mjs
// owns every question about what they mean.
import { readStepStream, watchStepStream } from "./steps-bridge.mjs";
// Rule 0's last result and the profile's own ladder (LIVE-CONSOLE.md Phase C).
// Both are READS: the record the instrument left behind, and the ladder the
// profile declares — neither runs anything, because a page load that plants
// into the tree is what D4b was rejected for.
import { readTrustRecord } from "./trust-bridge.mjs";
import { readLadderStanding } from "./ladder-bridge.mjs";
import { getComponentsData } from "./components.mjs";
import { getVariantsData } from "./variants.mjs";
import { getComponentDriftInfo } from "./component-drift.mjs";
import { getHandRolledStateViolations } from "./handrolled-state.mjs";
import { getWalkthroughData, WALKTHROUGH_REL_DIR } from "./walkthrough-data.mjs";
import { getLiveDeviceStatus, createLiveSession } from "./live-session.mjs";
import { getDigestData } from "./digest.mjs";
import { getApprovalAnchoredDiff } from "./approval-diff.mjs";
// The console itself now lives in the harness package — NORTH-STAR §9, stage
// 0.5: distribution has to ship it, and it could not while it lived here.
// packages/harness/src/console/ holds the page (galleryHtml), the shell, the
// overview and the fifteen section renderers; what stayed in this file is the
// resident loop that FEEDS them — the Gradle render pipeline, the watcher, the
// HTTP server and the readers that parse Kotlin. PACKAGE-SPLIT.md §3 calls that
// half "the eyes" and puts it in a separate package from the console. The
// import direction is studio -> harness, never back.
//
// Only two symbols cross for this file's own use: deriveHumanQueue (the ONE
// derivation of the human queue, shared with the page so the rail and the
// status endpoint cannot disagree) and componentStoryCards.
import { deriveHumanQueue } from "prooflane-harness/console/console-shell.mjs";
import { componentStoryCards, galleryHtml } from "prooflane-harness/console/preview-service.mjs";
// nowFrame turns "one line landed in the stream" into the exact instruction
// the page acts on. It lives in the console, not here, so a row appended live
// and a row drawn on a reload come out of the same function.
import { nowFrame } from "prooflane-harness/console/console-now.mjs";
import { setConsoleCopy } from "prooflane-harness/console/console-tabs.mjs";
import { loadProfileSync } from "prooflane-harness/lib/profile-loader.mjs";

// Re-exported at their historical import site so every existing caller — the
// MCP server, bin/console.mjs, scripts/stage05-gate.mjs, and the console tests
// — keeps working without knowing the console moved. One definition, two doors.
export { galleryHtml, isComponentStoryId, componentStoryCards } from "prooflane-harness/console/preview-service.mjs";
import { getTokenUsage } from "./design-language.mjs";
import { getIntentData } from "./intent.mjs";

const execFileAsync = promisify(execFile);

// The build this PROCESS loaded, captured exactly once, at module load. It must
// never be recomputed: recomputing would silently track the disk and make the
// staleness comparison always report "fresh" — the precise lie it exists to
// catch. Evaluated here (module scope) so it is pinned before any file on disk
// can change under a long-running console.
const LOADED_BUILD = loadedBuildId();

// The worker's "respawn me" exit code (studio-self-renewal R2). EX_TEMPFAIL from
// sysexits.h — an arbitrary number would do, but a borrowed convention says
// "temporary, retry" to anything that reads exit codes. bin/console.mjs respawns
// on THIS code and no other, so a crash can never turn into a restart loop.
export const EX_RENEW = 75;
// Long enough that a multi-file save (a formatter, a rebase, a branch switch)
// settles into ONE renewal instead of a burst of them.
const RENEW_DEBOUNCE_MS = 1500;
const RENEW_QUIESCE_POLL_MS = 2000;
// S3: how long after the last source save the Drive strip refreshes its
// observed activity line. A save storm is one refresh.
const ACTIVITY_BROADCAST_MS = 2000;
// How long findLiveConsole will wait out a declared renewal before calling the
// console gone. One node boot, with headroom — never a general retry budget.
const RENEW_REJOIN_MS = 15_000;
const RENEW_REJOIN_TRIES = 8;
const RENEW_REJOIN_POLL_MS = 250;

/**
 * The renewal POLICY, as one pure decision (studio-self-renewal R3/R4) — kept
 * out of the timers so it can be stated, read and tested as a rule rather than
 * inferred from the order of callbacks.
 *
 *   "none"       nothing to adopt; we are already running the code on disk
 *   "stand-down" an armed renewal whose reason went away (an undone edit, a
 *                branch switched away and back) — renewing to the build we
 *                already serve is a free outage and a cold daemon for nothing
 *   "defer"      there is new code, but a render or a lane is mid-flight and
 *                a renewal must never interrupt one
 *   "renew"      new code, and nothing in flight
 *
 * @param {{diskId: string|null, loadedId: string|null, armed: boolean, blockedBy: string|null}} p
 * @returns {"none"|"stand-down"|"defer"|"renew"}
 */
export function renewalDecision({ diskId, loadedId, armed, blockedBy }) {
  // An unknown hash on either side is not evidence of change (refusal over
  // fabrication — the same stance buildStatus takes with `stale: null`).
  if (diskId === null || loadedId === null || diskId === loadedId) return armed ? "stand-down" : "none";
  return blockedBy ? "defer" : "renew";
}

const DEFAULT_PORT = 9600;
const DEFAULT_DAEMON_PORT = 9601;
const PORT_ATTEMPTS = 10;
const DEBOUNCE_MS = 400;
// Classes events arrive DURING recompile; the hot swap applies shortly after the last
// write. A longer trailing debounce here avoids rendering once with pre-swap code.
const CLASSES_DEBOUNCE_MS = 1500;
const POLL_FALLBACK_MS = 2000;
// Governed-surface watch: a short trailing debounce coalesces the several
// write events one editor save (or one CLI run) produces into ONE broadcast.
const GOVERNANCE_DEBOUNCE_MS = 200;
// A ledger write made by this server has already broadcast; the file watcher's
// echo of that same write is suppressed inside this window so agents listening
// on the stream are never double-notified for one decision.
const SELF_WRITE_ECHO_MS = 1500;
const DAEMON_BOOT_TIMEOUT_MS = 240000; // first boot may compile + download a JBR
const DAEMON_RENDER_TIMEOUT_MS = 120000;
// The hot recompiler is a SEPARATE Gradle daemon whose output we cannot observe. If a
// source change produces no in-JVM reload within this window, the service runs its own
// compile check to fetch the compiler's verdict (the only way a broken edit surfaces).
const COMPILE_WATCHDOG_MS = 20000;
// A render that lands before the hot swap composes pre-swap code. When the daemon is
// reload-aware, such stale renders are retried on this cadence until the swap lands.
const STALE_RETRY_MS = 2500;
const MAX_STALE_RETRIES = 3;

// ── Verify-lane coexistence (the "eyes + gate always on" keystone) ──────────────
// The preview service and `qa/verify.mjs` both spawn Gradle against the same project
// and share composeApp/build/kspCaches; KSP's incremental storage is single-owner, so
// concurrent builds throw "Storage for [...] is already registered" and one side dies
// (historically: render-failed + a manual preview_stop/--stop/rm dance). Two defenses:
//   1. COORDINATE — the lane stamps qa/.lane-in-progress for its duration; renders
//      DEFER while it exists. mtime-bounded so a crashed lane never wedges the eyes.
//   2. SELF-HEAL — a spawn that still collides clears kspCaches and retries once.
// The lane marker is core state under qa/ (the project's qa/lib/lane-markers.mjs,
// Stage 0 PR 6a); the render marker below stays under composeApp/build because
// it is THIS provider's.
const LANE_MARKER_REL = ["qa", ".lane-in-progress"];
const LANE_MARKER_STALE_MS = 30 * 60 * 1000;
const LANE_POLL_MS = 5000;
export const KSP_COLLISION_RE = /Storage for \[[^\]]*\] is already registered/;

// Defense 1 covers the lane, which announces itself. It does NOT cover an ad-hoc
// `./gradlew` an operator types by hand — that stamps no marker, so a render can be
// launched into the middle of it. What breaks is not KSP but the CLASSPATH: while a
// foreign build rewrites composeApp/build/classes, `renderScreens` (a JavaExec off
// that output) can start against a half-written classes dir and die with
// "Could not find or load main class …PreviewHarnessKt". Nothing is wrong with the
// tree — the class is on disk moments later.
//
// So this is a RACE, not a failure, and the console must not report it as one. A
// matching error defers and re-schedules (like the lane) instead of setting
// lastError/rendererLastOutcome. Only if it survives MAX_TRANSIENT_RETRIES does it
// surface — at which point it is no longer transient and the operator needs to see it.
export const TRANSIENT_RENDER_RE =
  /Could not find or load main class|java\.lang\.(?:ClassNotFoundException|NoClassDefFoundError)|Timeout waiting to lock|Could not create service of type/;
const TRANSIENT_RETRY_MS = 4000;
const MAX_TRANSIENT_RETRIES = 12; // ~48s of quiet cover — a foreign `desktopTest --rerun` fits
// Past the quiet window the console STATES that it is stuck (it must never show pixels
// without saying how old they are) — but it keeps trying on this slower cadence, because
// the condition that broke the render is usually someone else's build finishing.
const STUCK_RETRY_MS = 30000;

// The SYMMETRIC half: while the preview service itself has a Gradle invocation in
// flight (a `renderScreens`/`compileKotlinDesktop` task, or the resident
// `hotRunDesktop` daemon client), it stamps .cmp-render-in-progress the same way —
// so `qa/verify.mjs`'s shGradle can defer/self-heal around an active render exactly
// as the daemon defers around an active lane. mtime-bounded (consumers treat it as
// stale after 5 minutes) so a crashed daemon never wedges the lane.
export const RENDER_MARKER_REL = ["composeApp", "build", ".cmp-render-in-progress"];

// ── One console per project (the pile-up guard) ─────────────────────────────────
// Nothing used to stop a second preview service binding the same projectDir. Each one
// runs its OWN render loop against the SAME composeApp/build, so they collide on the
// classes dir (the "Could not find or load main class" race), and the human ends up
// reading whichever stale console they happened to bookmark. Three abandoned services
// were found running against one project — two of them eight days old.
//
// The registry lives in the OS temp dir keyed by the resolved projectDir, NOT under
// composeApp/build: this is process coordination, not a build artifact, and a
// `gradle clean` must not silently drop the guard while a console is still serving.
//
// Liveness is PROVEN, never assumed: the recorded pid must exist AND its port must
// answer as a console for this same project. A crashed service therefore never wedges
// the next start — the stale record is simply taken over.
export function consoleRegistryPath(projectDir) {
  const key = crypto.createHash("sha1").update(path.resolve(projectDir)).digest("hex").slice(0, 12);
  return path.join(os.tmpdir(), `cmp-console-${key}.json`);
}


/**
 * This tree, now — the two facts console-standing.mjs needs to say whether the
 * receipt still describes it. Impure by necessity and therefore HERE, in the
 * server that already reads the project directory, rather than in the pure
 * module that decides what the answer means.
 *
 * Every failure is the same answer: null. A directory that is not a git
 * repository, a git that is not installed, a detached state — none of them make
 * a proof stale, they make its standing unknown, and the strip says so in the
 * standard absence form instead of guessing.
 */
async function treeState(projectDir) {
  try {
    const head = (await execFileAsync("git", ["-C", projectDir, "rev-parse", "HEAD"])).stdout.trim();
    if (!head) return null;
    const status = (await execFileAsync("git", ["-C", projectDir, "status", "--porcelain"])).stdout;
    return { head, dirtyCount: status.split("\n").filter((l) => l.trim()).length };
  } catch {
    return null;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0 tests existence without touching the process
    return true;
  } catch (err) {
    return err && err.code === "EPERM"; // exists but owned by someone else
  }
}

/**
 * The console already serving `projectDir`, or null. Both checks matter: a pid alone
 * can be a recycled number, and a port alone can be someone else's server.
 * @returns {Promise<{pid: number, port: number, url: string, startedAt: string}|null>}
 */
export async function findLiveConsole(projectDir, { probe } = {}) {
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(consoleRegistryPath(projectDir), "utf8"));
  } catch {
    return null;
  }
  if (!rec || typeof rec.pid !== "number" || typeof rec.port !== "number") return null;
  // Deliberately NOT skipping our own pid: two services inside one process collide just
  // as badly as two processes, and the probe below settles it either way — a record left
  // by our own crashed predecessor simply fails to answer.
  if (!processAlive(rec.pid)) return null;
  // Probe /status — cheap, constant-cost JSON — NEVER "/": the gallery page
  // derives the whole governed surface (git subprocess, approval board,
  // ~700KB of HTML) and under boot-time load blew the 2s budget, so a BUSY
  // console read as a dead one. The guard then let a second service start,
  // overwrite this record, and delete it on stop — observed 2026-07-28. A
  // liveness probe must cost the server nothing, or load defeats it.
  const ask = () =>
    probe
      ? probe(rec)
      : fetch(`http://127.0.0.1:${rec.port}/status`, { signal: AbortSignal.timeout(2000) })
          .then((r) => r.ok)
          .catch(() => false);
  if (await ask()) return rec;
  // A record marked `renewing` is a console that is COMING BACK on this same
  // port (studio-self-renewal R2): the worker exited for its supervisor to
  // respawn it, which takes one node boot. Reporting "no console" in that
  // sub-second window is how a second console gets started against the same
  // build directory — the 2026-07-28 failure the guard above exists to prevent.
  // Bounded, and only ever entered when the record itself declares a renewal.
  if (rec.renewing === true && Date.now() - Date.parse(rec.renewingAt ?? "") < RENEW_REJOIN_MS) {
    for (let i = 0; i < RENEW_REJOIN_TRIES; i += 1) {
      await new Promise((r) => setTimeout(r, RENEW_REJOIN_POLL_MS));
      let fresh;
      try {
        fresh = JSON.parse(fs.readFileSync(consoleRegistryPath(projectDir), "utf8"));
      } catch {
        continue;
      }
      // The respawned worker rewrites the record with its own pid; probe THAT.
      if (fresh && typeof fresh.port === "number" && fresh.renewing !== true) {
        const back = probe
          ? await probe(fresh)
          : await fetch(`http://127.0.0.1:${fresh.port}/status`, { signal: AbortSignal.timeout(2000) })
              .then((r) => r.ok)
              .catch(() => false);
        if (back) return fresh;
      }
    }
  }
  return null;
}

/**
 * The standalone console launcher (bin/console.mjs), resolved from wherever
 * THIS module is running: a repo/npm checkout (src/lib → ../../bin) or the
 * committed bundle (dist/server.mjs → ../bin — the bundle inlines this
 * module, so import.meta.url is dist/). null when neither exists — the
 * caller then falls back rather than failing.
 */
export function consoleLauncherPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "..", "..", "bin", "console.mjs"), // src/lib/ → package root
    path.join(here, "..", "bin", "console.mjs"), // dist/ → package root
    path.join(here, "console.mjs"), // bin/ (defensive)
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

/**
 * The console is a RESIDENT, not a passenger (walk-legibility L6): adopt the
 * console already serving `projectDir`, else spawn the standalone launcher
 * DETACHED — its own process group, stdio ignored, unref'd — so the human's
 * window structurally survives every MCP-server respawn (the 2026-07-28
 * failure class: three respawns in a day, each killing the page under the
 * cursor). Fail-open by contract: every failure returns null and the caller
 * degrades; ensuring a status surface may never block the work.
 *
 * @param {string} projectDir
 * @param {{port?: number, spawnImpl?: Function, launcher?: string,
 *   probe?: Function, waitMs?: number, pollMs?: number, log?: Function}} [opts]
 *   test seams: spawnImpl/launcher/probe; waitMs bounds the boot wait.
 * @returns {Promise<{pid: number, port: number, url: string, started: boolean}|null>}
 *   `started: true` = this call spawned it (the caller may claim stop rights);
 *   `started: false` = adopted one already serving. null = could not ensure.
 */
export async function ensureConsole(projectDir, opts = {}) {
  const { port, hot, spawnImpl = spawn, probe, waitMs = 90000, pollMs = 500, log = () => {} } = opts;
  try {
    const live = await findLiveConsole(projectDir, { probe });
    if (live) return { ...live, started: false };
    const launcher = opts.launcher ?? consoleLauncherPath();
    if (launcher === null) {
      log("ensureConsole: no standalone launcher found beside this build — skipping");
      return null;
    }
    const args = [launcher, path.resolve(projectDir)];
    if (typeof port === "number") args.push(String(port));
    if (hot === true) args.push("--hot");
    const child = spawnImpl(process.execPath, args, { detached: true, stdio: "ignore" });
    if (child && typeof child.unref === "function") child.unref();
    log(`ensureConsole: spawned detached console (pid ${child?.pid ?? "?"}) for ${projectDir}`);
    // The console binds its port and writes the registry BEFORE its first
    // render, so this normally settles in a few seconds; the generous ceiling
    // covers a cold Gradle daemon. Poll the same liveness proof adoption uses.
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs));
      const now = await findLiveConsole(projectDir, { probe });
      if (now) return { ...now, started: true };
    }
    log("ensureConsole: spawned console did not answer within the boot window");
    return null;
  } catch (err) {
    log(`ensureConsole: ${err && err.message ? err.message : err}`);
    return null;
  }
}

// The record carries the console's own build handshake (studio-self-renewal R5)
// so every consumer stays dumb: qa/lib/walk.mjs reads a boolean instead of
// hashing the inspector's sources (impossible from a scaffolded app, where the
// inspector is an npm package elsewhere) and instead of an HTTP call inside a
// per-prompt hook. The console owns the fact; the record carries it.
function writeConsoleRegistry(projectDir, port, extra = {}) {
  try {
    fs.writeFileSync(
      consoleRegistryPath(projectDir),
      `${JSON.stringify({ pid: process.pid, port, url: `http://127.0.0.1:${port}/`, projectDir: path.resolve(projectDir), startedAt: new Date().toISOString(), build: LOADED_BUILD.id, buildStale: false, ...extra })}\n`,
    );
  } catch {
    /* the guard is best-effort — never block a console from starting over bookkeeping */
  }
}

/**
 * Re-stamp OUR record's fields in place (same pid, same port) — used to publish
 * `buildStale` the moment the worker observes it, so the fact is visible on the
 * per-prompt inject and the statusline even while a renewal waits for quiescence
 * (studio-self-renewal R4/R5). Never touches a record owned by another process.
 */
function updateConsoleRegistry(projectDir, patch) {
  try {
    const p = consoleRegistryPath(projectDir);
    const rec = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!rec || rec.pid !== process.pid) return;
    fs.writeFileSync(p, `${JSON.stringify({ ...rec, ...patch })}\n`);
  } catch {
    /* bookkeeping only — never throw at a console over its own registry line */
  }
}

function clearConsoleRegistry(projectDir) {
  try {
    const p = consoleRegistryPath(projectDir);
    const rec = JSON.parse(fs.readFileSync(p, "utf8"));
    if (rec && rec.pid === process.pid) fs.rmSync(p, { force: true });
  } catch {
    /* never throw on teardown */
  }
}

/** Stamp the render-in-progress marker for the duration of a Gradle invocation. */
export function stampRenderMarker(projectDir) {
  try {
    const p = path.join(projectDir, ...RENDER_MARKER_REL);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${process.pid} ${new Date().toISOString()}\n`);
  } catch {
    /* best-effort — a missed marker only costs the lane a possible collision,
       already guarded by SELF-HEAL (withKspSelfHeal / shGradle) */
  }
}

/**
 * Refresh the render marker's mtime without rewriting it — a no-op when no marker
 * is currently stamped. Wired into `touch()` so any observed activity (daemon
 * output, a render settling, a source change) keeps a long-running invocation
 * (the resident daemon client, or a slow cold first render) from going stale under
 * the consumer's 5-minute window.
 */
export function touchRenderMarker(projectDir) {
  try {
    const now = new Date();
    fs.utimesSync(path.join(projectDir, ...RENDER_MARKER_REL), now, now);
  } catch {
    /* no marker currently stamped — nothing to refresh */
  }
}

/** Clear the render-in-progress marker (called in a finally on every exit path). */
export function clearRenderMarker(projectDir) {
  try {
    fs.rmSync(path.join(projectDir, ...RENDER_MARKER_REL), { force: true });
  } catch {
    /* already gone */
  }
}

/**
 * The app's display name for the console shell: settings.gradle(.kts)'s
 * `rootProject.name` (the engine stamps the real app name there), falling back to
 * the directory basename only when no settings file resolves — "Fuelled · studio",
 * never "create-cmp-showcase · studio".
 */
export function resolveAppName(projectDir) {
  for (const f of ["settings.gradle.kts", "settings.gradle"]) {
    try {
      const text = fs.readFileSync(path.join(projectDir, f), "utf8");
      const m = text.match(/rootProject\.name\s*=\s*["']([^"']+)["']/);
      if (m) return m[1];
    } catch {
      /* try the next form */
    }
  }
  return path.basename(projectDir);
}

/**
 * What this project can show (evidence-economics S2). The console used to
 * refuse any project without composeApp/ — but Drive, walks, approvals,
 * evidence, comments, the chain and the retrospective derive from qa/ alone.
 * Only Screens, preview, live device and token drift need a Compose app.
 * payment-blueprint ran a fifteen-phase programme under the full governance
 * stack with no window at all, because its window was welded to the pixels.
 *
 *   governance — qa/ exists: the human's window is available
 *   screens    — composeApp/ exists: the render pipeline can run
 *
 * Neither → the project is not something this console can serve, and start()
 * says so. Pure; the same answer the page and /status carry.
 * @param {string} projectDir
 * @returns {{governance: boolean, screens: boolean}}
 */
export function detectCapabilities(projectDir) {
  const has = (rel) => {
    try {
      return fs.statSync(path.join(projectDir, rel)).isDirectory();
    } catch {
      return false;
    }
  };
  return { governance: has("qa"), screens: has("composeApp") };
}

/** True while a verify lane holds the project (fresh marker file present). */
export function laneInProgress(projectDir, { now = Date.now } = {}) {
  try {
    const st = fs.statSync(path.join(projectDir, ...LANE_MARKER_REL));
    return now() - st.mtimeMs < LANE_MARKER_STALE_MS;
  } catch {
    return false;
  }
}

/** Run a Gradle invocation; on the KSP storage collision, clear kspCaches and retry once. */
export async function withKspSelfHeal(projectDir, log, run) {
  try {
    return await run();
  } catch (err) {
    const text = `${err && err.message ? err.message : err}${err && err.stdout ? err.stdout : ""}${err && err.stderr ? err.stderr : ""}`;
    if (!KSP_COLLISION_RE.test(text)) throw err;
    log("KSP cache collision (concurrent Gradle — verify lane?) — clearing kspCaches, retrying once");
    fs.rmSync(path.join(projectDir, "composeApp", "build", "kspCaches"), { recursive: true, force: true });
    return await run();
  }
}

/**
 * The app's base package — needed to address the daemon main class
 * (<package>.inspector.PreviewDaemonKt). create-cmp >= 0.5 apps carry it in
 * create-cmp.json; older apps fall back to the Android namespace declaration.
 */
export function detectAppPackage(projectDir) {
  const spec = path.join(projectDir, "create-cmp.json");
  if (fs.existsSync(spec)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(spec, "utf8")).package;
      if (pkg) return pkg;
    } catch {}
  }
  const gradle = path.join(projectDir, "composeApp", "build.gradle.kts");
  if (fs.existsSync(gradle)) {
    const m = fs.readFileSync(gradle, "utf8").match(/namespace\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error(
    "cannot detect the app package (no create-cmp.json `package`, no `namespace` in composeApp/build.gradle.kts)",
  );
}

// --- pure helpers (unit-tested) ----------------------------------------------------

/** Per-screen structural summary used by /status, the gallery meta line, and the agent. */
export function summarizeTree(tree) {
  let nodes = 0;
  let tokenized = 0;
  let tagged = 0;
  (function walk(n) {
    nodes++;
    if (n.designToken) tokenized++;
    if (n.testTag) tagged++;
    (n.children || []).forEach(walk);
  })(tree.root);
  return { nodes, tokenized, tagged };
}

/**
 * Which screens changed between two render generations, by comparing the serialized
 * tree content (bounds jitter included — the tree is already integer-rounded).
 * @param {Map<string,string>|null} prev  screen id -> tree JSON string (previous render)
 * @param {Map<string,string>} next       screen id -> tree JSON string (current render)
 * @returns {string[]} changed/added/removed screen ids, gallery order preserved by caller
 */
export function diffScreenTrees(prev, next) {
  if (!prev) return [];
  const changed = [];
  for (const [id, json] of next) {
    if (!prev.has(id) || prev.get(id) !== json) changed.push(id);
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) changed.push(id);
  }
  return changed;
}

// Preview-registry state-variant id suffix, e.g. "home@empty" -> "empty" (see
// docs/proposals/component-system-deep-dive.md §6.5's `ScreenPreview("home@empty", …)`
// convention, and template/CLAUDE.md's UI feedback loop section).
const STATE_VARIANT_ID_RE = /^(.+)@(loading|empty|error)$/;

/**
 * Every CURRENTLY RENDERED preview-registry entry whose id carries a
 * `@loading`/`@empty`/`@error` suffix, grouped by state — the Components
 * section's "live variant render" evidence (CV-1 W3b). These variants are
 * ordinary gallery cards (registered in inspector/PreviewRegistry.kt like any
 * other screen); this just reclassifies the CURRENT render's `cards` by id
 * shape. Absent variants (no state-suffixed entries registered yet — e.g. a
 * project whose PreviewRegistry.kt predates §6.5) yields empty arrays per
 * state, never an error — the console degrades honestly (see
 * console-tabs.mjs's liveVariantsHtml).
 * @param {Array<{screen: {id: string, title: string, png: string}}>} cards
 * @returns {{loading: object[], empty: object[], error: object[]}}
 */
export function stateVariantCards(cards) {
  const out = { loading: [], empty: [], error: [] };
  for (const { screen } of cards) {
    const m = STATE_VARIANT_ID_RE.exec(screen.id);
    if (!m) continue;
    out[m[2]].push({ id: screen.id, title: screen.title, png: screen.png, baseScreen: m[1] });
  }
  return out;
}

/**
 * Compile-failure lines in Compose Hot Reload / Gradle recompile output. In daemon mode
 * a broken edit produces NO render (no classes are written, so no trigger fires) — these
 * markers are the only signal, so the service promotes them into lastError. Kotlin
 * compiler errors arrive as `e: file://… error` lines; Gradle adds task/BUILD FAILED.
 * @returns {string[]} the matching lines (empty = no failure in this chunk)
 */
export function extractCompileErrors(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        /^e: /.test(l) ||
        /Compilation failed/i.test(l) ||
        /^> Task :\S+ FAILED$/.test(l) ||
        /^BUILD FAILED/.test(l),
    );
}

// --- the service --------------------------------------------------------------------

/**
 * The console renders the PROFILE's words, not the shell's. The shell's tab
 * helpers carry neutral copy; the profile a project declares may export
 * `console` (a copy object) and this host — the one place that knows the
 * project root — sets it once. Best effort: a project with no loadable profile
 * renders the neutral words, which is correct for it.
 */
function applyConsoleCopy(projectDir) {
  try {
    const loaded = loadProfileSync(projectDir);
    setConsoleCopy(loaded && loaded.ok ? loaded.profile?.console ?? null : null);
  } catch {
    setConsoleCopy(null);
  }
}

/**
 * Create (not yet start) a preview service for one project.
 *
 * @param {object} opts
 * @param {string} opts.projectDir              create-cmp app root (has composeApp/)
 * @param {string} [opts.appName]               gallery heading (default: dir basename)
 * @param {number} [opts.port]                  first port to try (default 9600, +1 up to 10x)
 * @param {(dir:string)=>Promise<void>} [opts.runRender]  render runner (default: gradlew)
 * @param {(msg:string)=>void} [opts.log]
 */
export function createPreviewService(opts) {
  const projectDir = path.resolve(opts.projectDir);
  applyConsoleCopy(projectDir);
  const appName = opts.appName || resolveAppName(projectDir);
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");
  const srcDir = path.join(projectDir, "composeApp", "src");
  const log = opts.log || (() => {});
  const hot = opts.hot !== false; // phase 2 on by default; falls back to gradle transparently
  const daemonUrl = opts.daemonUrl || `http://127.0.0.1:${opts.daemonPort || DEFAULT_DAEMON_PORT}`;
  // Gradle spawns get gradleEnv(): a resolved JAVA_HOME propagated through the
  // child env — the MCP server often runs outside a login shell, and the fix must
  // NEVER be a hand-edit to the tracked `gradlew` (see jdk.mjs). withKspSelfHeal
  // is coexistence defense 2 (see laneInProgress below for defense 1).
  const runRender =
    opts.runRender ||
    (async (dir) => {
      stampRenderMarker(dir);
      try {
        return await withKspSelfHeal(dir, log, () =>
          execFileAsync(
            "./gradlew",
            [":composeApp:renderScreens", "-q", "--console=plain"],
            { cwd: dir, timeout: 600000, maxBuffer: 16 * 1024 * 1024, env: gradleEnv() },
          ),
        );
      } finally {
        clearRenderMarker(dir);
      }
    });
  const runCompileCheck =
    opts.runCompileCheck ||
    (async (dir) => {
      stampRenderMarker(dir);
      try {
        return await withKspSelfHeal(dir, log, () =>
          execFileAsync(
            "./gradlew",
            [":composeApp:compileKotlinDesktop", "-q", "--console=plain"],
            { cwd: dir, timeout: 300000, maxBuffer: 16 * 1024 * 1024, env: gradleEnv() },
          ),
        );
      } finally {
        clearRenderMarker(dir);
      }
    });
  const watchdogMs = opts.watchdogMs ?? COMPILE_WATCHDOG_MS;
  const staleRetryMs = opts.staleRetryMs ?? STALE_RETRY_MS;

  // A1 — one live-session chain per service; /live/start + /live/status drive it.
  const inspectorPort = opts.inspectorPort ?? 9500;
  const liveSession = createLiveSession({
    projectDir,
    port: inspectorPort,
    gradleEnv,
    log,
    exec: (cmd, cmdArgs, o = {}) => {
      if (o.detach) {
        const child = spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" });
        child.unref();
        return Promise.resolve({ stdout: "" });
      }
      return execFileAsync(cmd, cmdArgs, {
        cwd: o.cwd,
        env: o.env,
        timeout: o.timeoutMs ?? 30_000,
        maxBuffer: 16 * 1024 * 1024,
      });
    },
  });

  let server = null;
  let port = null;
  let watcher = null;
  let classesWatcher = null;
  // When this server last wrote a ledger itself (approve/reopen/accept/comment)
  // — the governed-surface watcher suppresses its echo of that write.
  let lastSelfLedgerWriteAt = 0;
  let mode = "gradle"; // "gradle" (task per render) | "daemon" (resident hot JVM)
  let daemonChild = null;
  let daemonBootDeadline = null;
  let pollTimer = null;
  let debounceTimer = null;
  let rendering = false;
  let renderQueued = false;
  let version = 0;
  let lastError = null;
  let lastErrorSource = null; // "render" | "compile" — what produced lastError
  // Renderer health (FI-9 Change B) — the render PIPELINE's own up/down signal,
  // tracked independently of lastError/lastErrorSource so a later, unrelated
  // compile-watchdog message can never overwrite the fact that renders
  // themselves are failing ("the eyes are stale" vs. "your edit didn't build").
  // Updated ONLY by actual render attempts in renderCycle(), never by
  // compileWatchdog. rendererLastErrorText mirrors the render-specific error
  // message for the console banner; it is intentionally NOT part of the public
  // `renderer` status shape (kept to the four documented fields).
  let rendererLastOutcome = "never"; // "ok" | "failed" | "never"
  let rendererLastSuccessAt = null; // ISO
  let rendererLastAttemptAt = null; // ISO
  let rendererConsecutiveFailures = 0;
  // Consecutive transient (foreign-build) deferrals for the CURRENT render attempt;
  // reset on any settled outcome so each new race gets the full retry budget.
  let transientRetries = 0;
  // FRESHNESS (the console's core promise: pixels are never shown without a truthful
  // provenance). Both are wall-clock ms, derived from real events — never claimed:
  //   lastRenderAt   — when the previews ON DISK were produced (manifest mtime at load,
  //                    NOT "now", so a service that boots onto week-old previews says so).
  //   srcChangedAt   — when a watched source file last changed.
  // stale ⇔ srcChangedAt > lastRenderAt. renderPhase says what is being done about it.
  let lastRenderAt = null;
  let srcChangedAt = null;
  let renderPhase = "idle"; // "idle" | "rendering" | "waiting-build" | "waiting-lane" | "stuck"
  // Which source generation the CURRENT pixels actually cover. Captured when a render
  // starts and committed only when it succeeds, so a save that lands mid-render leaves
  // the result honestly stale instead of being swallowed by "the render finished after
  // the save, therefore it included it" — which is not true and is unfalsifiable by
  // timestamps alone (manifest mtime and a save can land in the same millisecond).
  let renderCoversSrcAt = null;
  // Whether a render is genuinely pending. The console may only say "queued" when this
  // is true — a promise of a refresh that is not coming is the same lie as a stale
  // screen presented as current.
  let renderScheduled = false;
  let renderPhaseDetail = null;
  let rendererLastErrorText = null;
  let lastActivity = null; // { what, at } — last observed signal, so the agent can tell "quiet" from "dead"
  let compileErrorLines = []; // accumulated hot-recompile failures (cleared on next good render)
  let lastChanged = [];
  let prevTrees = null; // current generation: screen id -> tree JSON
  let prevGenTrees = null; // the generation BEFORE that — preview_diff's automatic `before`
  const changedAt = new Map(); // screen id -> render version that last changed it
  const renderWaiters = new Set(); // waitForRender() promises pending a render/compile outcome
  const approvalWaiters = new Set(); // waitForApprovalDecision() promises pending a status change
  let approvalPollTimer = null; // only ticks while approvalWaiters is non-empty
  const commentWaiters = new Set(); // waitForNewComment() promises pending a NEW comment id
  let commentPollTimer = null; // only ticks while commentWaiters is non-empty
  let daemonReloadCount = -1; // last successful-reload count seen from the daemon (-1 = unknown)
  let daemonReloadErrors = -1; // last failed-swap count seen from the daemon
  let daemonReloadHooked = false; // daemon has the in-JVM after-reload hook
  let pendingSrcChange = false; // daemon mode: a save whose swap outcome is unconfirmed
  let staleRetries = 0;
  let watchdogTimer = null;
  let cards = [];
  // Set by start(); defaults to the full console so every pre-existing caller
  // and test seam behaves exactly as before start() has run.
  let capabilities = { governance: true, screens: true };
  let activityBroadcastTimer = null;
  let viewport = null;
  const sseClients = new Set();

  function touch(what) {
    lastActivity = { what, at: new Date().toISOString() };
    touchRenderMarker(projectDir); // no-op unless a render marker is currently stamped
  }

  /** Resolve every pending waitForRender with the (just-updated) status. */
  function settleWaiters() {
    for (const w of renderWaiters) {
      clearTimeout(w.timer);
      w.resolve({ timedOut: false, ...status() });
    }
    renderWaiters.clear();
  }

  /**
   * The agent's post-edit primitive: resolves with { timedOut, ...status() } when the
   * NEXT render cycle completes (success or failure) OR a hot-recompile failure is
   * detected (in daemon mode a broken edit produces no render at all — the compile
   * error is the outcome). One call replaces polling /status over HTTP.
   */
  function waitForRender(timeoutMs = 120000) {
    return new Promise((resolve) => {
      const w = { resolve };
      w.timer = setTimeout(() => {
        renderWaiters.delete(w);
        resolve({ timedOut: true, ...status() });
      }, timeoutMs);
      renderWaiters.add(w);
    });
  }

  /**
   * Every governed artifact's live status, via the project's own qa/lib/approvals.mjs
   * (approvals-bridge.mjs — never forked here). Same shape the Approvals tab renders:
   * { available: false } for projects predating the approvals wave, else
   * { available: true, statuses: [...] }.
   */
  function approvalStatusSnapshot() {
    return getApprovalsData(projectDir);
  }

  /** Artifact ids whose (status, hash, approvedAt) differ, or that appeared/disappeared. */
  function diffApprovalStatusIds(beforeStatuses, afterStatuses) {
    const beforeMap = new Map(beforeStatuses.map((s) => [s.id, `${s.status}|${s.hash}|${s.approvedAt}`]));
    const changed = [];
    const afterIds = new Set();
    for (const s of afterStatuses) {
      afterIds.add(s.id);
      if (beforeMap.get(s.id) !== `${s.status}|${s.hash}|${s.approvedAt}`) changed.push(s.id);
    }
    for (const s of beforeStatuses) {
      if (!afterIds.has(s.id)) changed.push(s.id);
    }
    return changed;
  }

  function ensureApprovalPoll() {
    if (approvalPollTimer) return;
    approvalPollTimer = setInterval(() => void checkApprovalWaiters(), 1000);
  }
  function maybeStopApprovalPoll() {
    if (approvalWaiters.size === 0 && approvalPollTimer) {
      clearInterval(approvalPollTimer);
      approvalPollTimer = null;
    }
  }

  /**
   * Settle any waitForApprovalDecision() calls whose snapshot has since changed.
   * Called immediately after a successful POST /api/approve (event-driven, near-
   * instant) AND on a 1s poll while waiters are pending (so an approval recorded
   * OUTSIDE this server — `node qa/approve.mjs` from a terminal — is caught too;
   * design doc §4 permits either "poll or event-driven off the POST handler").
   */
  async function checkApprovalWaiters() {
    if (approvalWaiters.size === 0) return;
    const now = await approvalStatusSnapshot();
    const nowStatuses = now.available ? now.statuses : [];
    for (const w of [...approvalWaiters]) {
      const changed = diffApprovalStatusIds(w.beforeStatuses, nowStatuses);
      if (changed.length > 0 || now.available !== w.beforeAvailable) {
        clearTimeout(w.timer);
        approvalWaiters.delete(w);
        w.resolve({ timedOut: false, available: now.available, changed, statuses: nowStatuses });
      }
    }
    maybeStopApprovalPoll();
  }

  /** Resolve every pending waitForApprovalDecision immediately (service stopping). */
  function settleApprovalWaiters() {
    for (const w of approvalWaiters) {
      clearTimeout(w.timer);
      w.resolve({ timedOut: false, available: w.beforeAvailable, changed: [], statuses: w.beforeStatuses });
    }
    approvalWaiters.clear();
    if (approvalPollTimer) {
      clearInterval(approvalPollTimer);
      approvalPollTimer = null;
    }
  }

  /**
   * The agent's approval primitive (VERIFICATION-LAYER-DESIGN.md §4): without
   * waitForDecision, the current snapshot. With it, blocks until ANY governed
   * artifact's status CHANGES — exactly waitForRender's blocking+timeout shape,
   * applied to approvals instead of renders. Resolves immediately with
   * {available:false} in a project with no approvals library — there is no
   * decision to wait for.
   */
  async function waitForApprovalDecision(timeoutMs = 120000) {
    const before = await approvalStatusSnapshot();
    if (!before.available) {
      return { timedOut: false, available: false, changed: [], statuses: [] };
    }
    return new Promise((resolve) => {
      const w = { resolve, beforeStatuses: before.statuses, beforeAvailable: before.available };
      w.timer = setTimeout(async () => {
        approvalWaiters.delete(w);
        const now = await approvalStatusSnapshot();
        resolve({ timedOut: true, available: now.available, changed: [], statuses: now.available ? now.statuses : [] });
        maybeStopApprovalPoll();
      }, timeoutMs);
      approvalWaiters.add(w);
      ensureApprovalPoll();
    });
  }

  // --- comments (§7.3) -------------------------------------------------------------

  /**
   * The full comment ledger, via the project's own qa/lib/comments.mjs
   * (comments-bridge.mjs — never forked here). Same shape the Comments tab
   * renders: { available: false } for projects predating the comments wave,
   * else { available: true, schema, comments: [...] }.
   */
  function commentsSnapshot(status) {
    return getCommentsData(projectDir, status ? { status } : undefined);
  }

  function ensureCommentPoll() {
    if (commentPollTimer) return;
    commentPollTimer = setInterval(() => void checkCommentWaiters(), 1000);
  }
  function maybeStopCommentPoll() {
    if (commentWaiters.size === 0 && commentPollTimer) {
      clearInterval(commentPollTimer);
      commentPollTimer = null;
    }
  }

  /**
   * Settle any waitForNewComment() calls once a comment id appears that
   * wasn't in their `before` snapshot — mirrors checkApprovalWaiters' split
   * (event-driven off the POST handler + a 1s poll fallback for a comment
   * recorded OUTSIDE this server, e.g. `node qa/comment.mjs` from a
   * terminal), but keyed on NEW ids specifically (unlike approvals, a
   * resolve() should NOT wake a waitForNewComment() caller — only a fresh
   * comment landing does).
   */
  async function checkCommentWaiters() {
    if (commentWaiters.size === 0) return;
    const now = await commentsSnapshot();
    const nowComments = now.available ? now.comments : [];
    for (const w of [...commentWaiters]) {
      const added = nowComments.filter((c) => !w.beforeIds.has(c.id));
      if (added.length > 0 || now.available !== w.beforeAvailable) {
        clearTimeout(w.timer);
        commentWaiters.delete(w);
        w.resolve({ timedOut: false, available: now.available, added, comments: nowComments });
      }
    }
    maybeStopCommentPoll();
  }

  /** Resolve every pending waitForNewComment immediately (service stopping). */
  function settleCommentWaiters() {
    for (const w of commentWaiters) {
      clearTimeout(w.timer);
      w.resolve({ timedOut: false, available: w.beforeAvailable, added: [], comments: [] });
    }
    commentWaiters.clear();
    if (commentPollTimer) {
      clearInterval(commentPollTimer);
      commentPollTimer = null;
    }
  }

  /**
   * The agent's comment primitive (VERIFICATION-LAYER-DESIGN.md §7.3): without
   * waitForComment, the current snapshot. With it, blocks until a NEW comment
   * lands (an id absent from the `before` snapshot) — same blocking+timeout
   * shape as waitForApprovalDecision, applied to "a human left feedback"
   * instead of "a human decided". Resolves immediately with
   * {available:false} in a project with no comments library.
   */
  async function waitForNewComment(timeoutMs = 120000) {
    const before = await commentsSnapshot();
    if (!before.available) {
      return { timedOut: false, available: false, added: [], comments: [] };
    }
    const beforeIds = new Set(before.comments.map((c) => c.id));
    return new Promise((resolve) => {
      const w = { resolve, beforeIds, beforeAvailable: before.available };
      w.timer = setTimeout(async () => {
        commentWaiters.delete(w);
        const now = await commentsSnapshot();
        resolve({ timedOut: true, available: now.available, added: [], comments: now.available ? now.comments : [] });
        maybeStopCommentPoll();
      }, timeoutMs);
      commentWaiters.add(w);
      ensureCommentPoll();
    });
  }

  /**
   * The agent's resolve primitive (§7.3): closes the loop AFTER acting on a
   * comment, recording author "agent" and the note (what was done). A
   * successful resolve broadcasts the same SSE "comment" event a new comment
   * does — the Comments tab shows the resolution either way.
   */
  async function resolveCommentById(id, note) {
    const result = await resolveCommentViaLib(projectDir, id, { note, author: "agent" });
    if (result.ok) {
      touch("comment-resolved");
      broadcast({ type: "comment" });
      void checkCommentWaiters();
    }
    return result;
  }

  /**
   * Design System tab data: previews-dir catalog first, else a best-effort live fetch.
   *
   * `sourcePath` is the file this reader ACTUALLY looked at, project-relative,
   * and it is reported on both branches — including the absent one, where it is
   * the thing that did not exist. It is here because the console used to print
   * that path from a literal of its own: after the console moved into
   * packages/harness (NORTH-STAR §9, stage 0.5) it may not name a stack, and a
   * literal was the wrong mechanism anyway — it would have named
   * composeApp/build/previews/design-system.json to a project whose previews
   * live somewhere else. The reader knows the path; the renderer should not
   * have to guess it.
   */
  async function getDesignSystemData() {
    const catalogPath = path.join(previewsDir, "design-system.json");
    const sourcePath = path.relative(projectDir, catalogPath).split(path.sep).join("/");
    if (fs.existsSync(catalogPath)) {
      try {
        return { available: true, source: "previews", sourcePath, catalog: JSON.parse(fs.readFileSync(catalogPath, "utf8")) };
      } catch (err) {
        log(`design-system.json at ${catalogPath} is not valid JSON (${err.message}) — trying a live session`);
      }
    }
    try {
      const catalog = await fetchLiveCatalog({ timeoutMs: 800 });
      return { available: true, source: "live", sourcePath, catalog };
    } catch {
      return { available: false, sourcePath };
    }
  }

  const VARIANT_NAME_RE = /^[a-z0-9-]+$/;

  /**
   * §2 "Design-language candidates": stash the CURRENT render outputs (each
   * screen's screen.png from the last completed render, held in `cards`) plus
   * design-system.json into composeApp/build/previews/variants/<name>/,
   * REPLACING that variant if one already exists — an rmSync then copy, both
   * synchronous, so no caller ever observes a half-written variant directory.
   * The MCP tool's zod schema is the first gate on `name`, but this primitive
   * is also a direct test seam — never trust a caller's regex alone, so the
   * shape is re-checked here too.
   * @param {string} name
   * @returns {{ok:true, name:string, screens:string[], designSystemStashed:boolean, dir:string} | {ok:false, reason:string}}
   */
  function snapshotVariant(name) {
    if (typeof name !== "string" || !VARIANT_NAME_RE.test(name)) {
      return {
        ok: false,
        reason: `invalid variant name "${name}" — must match [a-z0-9-]+ (lowercase letters, digits, hyphens)`,
      };
    }
    if (cards.length === 0) {
      return {
        ok: false,
        reason: "no current render to stash — call preview {projectDir} and wait for a render to complete first",
      };
    }
    const variantDir = path.join(previewsDir, "variants", name);
    try {
      fs.rmSync(variantDir, { recursive: true, force: true }); // replace, per §2
      fs.mkdirSync(variantDir, { recursive: true });
    } catch (err) {
      return { ok: false, reason: `could not prepare ${variantDir}: ${err && err.message ? err.message : err}` };
    }
    const screens = [];
    for (const { screen } of cards) {
      const src = path.join(previewsDir, screen.png);
      if (!fs.existsSync(src)) continue; // honest: only stash what actually rendered
      const dst = path.join(variantDir, screen.png);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      screens.push(screen.id);
    }
    let designSystemStashed = false;
    const dsSrc = path.join(previewsDir, "design-system.json");
    if (fs.existsSync(dsSrc)) {
      fs.copyFileSync(dsSrc, path.join(variantDir, "design-system.json"));
      designSystemStashed = true;
    }
    touch("variant-snapshot");
    return { ok: true, name, screens, designSystemStashed, dir: variantDir };
  }

  /**
   * Every daemon-child output line flows through here: logged, and scanned for
   * compile failures so a broken edit is VISIBLE (lastError + SSE error + settled
   * waiters) instead of silent — without this, daemon mode gives no signal at all
   * when the hot recompile fails (no classes written -> no render trigger).
   */
  function noteDaemonOutput(chunk) {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) log(`[daemon] ${line.trimEnd()}`);
    }
    touch("daemon-output");
    const errs = extractCompileErrors(text);
    if (errs.length) {
      compileErrorLines.push(...errs);
      lastError = compileErrorLines.join("\n");
      lastErrorSource = "compile";
      touch("compile-failed");
      log(`compile FAILED (hot recompile): ${errs[0]}`);
      broadcast({ type: "error", error: lastError, source: "compile" });
      settleWaiters();
    }
  }

  function broadcast(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const res of sseClients) res.write(data);
  }

  /**
   * The derived next step for an approval event, when the signed artifact
   * belongs to a feature's walk (its brief or its spec). {} for everything
   * else — genesis artifacts and closing re-approvals enrich nothing; a
   * signature advances the walk only where the walk has a next step to name
   * (CHANGE-FLOW-DESIGN.md §4: forward signatures hand off, closing
   * signatures just close).
   */
  /**
   * Everything currently waiting on the HUMAN, as actionable items — the
   * guided-flow queue the post-decision prompt walks them through. Each item
   * names the action in plain words and the tab where its signature control
   * lives (sign-where-you-read), so "Take me there" is one click.
   */
  async function pendingOnHuman(excludeArtifact) {
    // ONE derivation for the whole console (console-shell.mjs deriveHumanQueue —
    // the strip reads the same function, so the prompt and the strip can never
    // tell different stories). Notably it INCLUDES a reopened brief once its
    // redesign derives provenDone: at that point the work is finished and
    // proven, and what remains is exactly the human's signature (07-28 audit,
    // fix 3 — before this, the Features card said "waiting on you" while this
    // queue said nothing was). A reopened artifact still mid-redesign stays
    // out: it waits on the WORK, not the human.
    try {
      const [snap, board] = await Promise.all([approvalStatusSnapshot(), getFeatureBoardViaLib(projectDir)]);
      return deriveHumanQueue(
        {
          statuses: snap.available ? snap.statuses : [],
          features: board.available ? board.board.features : [],
        },
        excludeArtifact,
      );
    } catch {
      /* an unreadable ledger yields an empty queue, never a crash */
      return [];
    }
  }

  /**
   * The post-decision hand-off payload (whatNext): what just happened, the
   * walk's derived next step, and the human's remaining queue. Every decision
   * endpoint returns it so the console can PROMPT — "do you want to …" —
   * instead of leaving the human to infer the flow's next move.
   */
  async function whatNextAfter(did, artifactId) {
    return {
      did,
      ...(await nextStepFor(artifactId)),
      pending: await pendingOnHuman(artifactId),
    };
  }

  async function nextStepFor(artifactId) {
    const featureName = artifactId.startsWith("feature-brief:")
      ? artifactId.slice("feature-brief:".length)
      : artifactId.startsWith("feature-design:")
        ? artifactId.slice("feature-design:".length)
        : artifactId.startsWith("feature-spec:")
          ? artifactId.slice("feature-spec:".length)
          : null;
    if (!featureName) return {};
    try {
      const board = await getFeatureBoardViaLib(projectDir);
      const feature = board.available ? board.board.features.find((f) => f.name === featureName) : null;
      return feature && feature.nextStep ? { feature: featureName, next: feature.nextStep } : {};
    } catch {
      return {};
    }
  }

  /** Reload previews dir into cards + tree map. Throws if the dir/manifest is missing. */
  function loadPreviews() {
    const manifestPath = path.join(previewsDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    // The manifest's mtime is when these pixels were actually produced. Using it (rather
    // than Date.now()) is what makes a freshly-started service honest about previews it
    // found on disk from a previous run instead of presenting them as a new render.
    try {
      lastRenderAt = fs.statSync(manifestPath).mtimeMs;
    } catch {
      lastRenderAt = Date.now();
    }
    viewport = manifest.viewport;
    const trees = new Map();
    cards = manifest.screens.map((screen) => {
      const treeJson = fs.readFileSync(path.join(previewsDir, screen.tree), "utf8");
      trees.set(screen.id, treeJson);
      const tree = JSON.parse(treeJson);
      const a11y = auditA11y(tree);
      return {
        screen,
        svg: renderTreeSvg(tree, { a11y }),
        summary: summarizeTree(tree),
        a11y: { pass: a11y.pass, violations: a11y.violations },
      };
    });
    lastChanged = diffScreenTrees(prevTrees, trees);
    prevGenTrees = prevTrees;
    prevTrees = trees;
    version++;
    for (const id of lastChanged) changedAt.set(id, version);
  }

  /**
   * The last two generations of a screen's tree, for preview_diff: `before` is the
   * previous render's tree (null until a second render exists), `after` the current.
   */
  function treesFor(id) {
    return {
      before: prevGenTrees?.get(id) ?? null,
      after: prevTrees?.get(id) ?? null,
      version,
    };
  }

  /**
   * preview_diff's whole computation, moved to where the state lives
   * (console-protocol.md decision 3): the previous tree generation exists only
   * in THIS process's memory, so the diff must happen here — a client in
   * another process can only receive the verdict, never the inputs. Refusals
   * are {ok:false, reason} in the tools' own wording, so the wire adds nothing.
   */
  function diffScreen({ screen, tolerancePx, minTouchTargetPx } = {}) {
    const { before, after, version: v } = treesFor(screen);
    if (!after) {
      const known = cards.map((c) => c.screen.id).join(", ");
      return { ok: false, reason: `Screen '${screen}' is not in the current render. Known screens: ${known || "(none yet)"}.` };
    }
    if (!before) {
      return {
        ok: false,
        reason:
          `No previous generation for '${screen}' yet — the diff compares the last two renders. ` +
          "Edit code, then preview_status { waitForRender: true }, then call this again.",
      };
    }
    let catalog;
    const catalogPath = path.join(previewsDir, "design-system.json");
    if (fs.existsSync(catalogPath)) catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    return {
      ok: true,
      screen,
      fromVersion: v - 1,
      toVersion: v,
      ...proveChange({
        beforeTree: JSON.parse(before),
        afterTree: JSON.parse(after),
        catalog,
        tolerancePx,
        minTouchTargetPx,
      }),
    };
  }

  /**
   * Copy each screen's current PNG to screen.prev.png before a render overwrites it,
   * so the gallery can show hover before/after on changed cards.
   */
  function snapshotPngs() {
    for (const { screen } of cards) {
      const src = path.join(previewsDir, screen.png);
      const dst = path.join(previewsDir, String(screen.png).replace(/screen\.png$/, "screen.prev.png"));
      try {
        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
      } catch {}
    }
  }

  async function daemonFetch(pathname, timeoutMs) {
    const res = await fetch(`${daemonUrl}${pathname}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json()).error || "";
      } catch {}
      throw new Error(`daemon ${pathname} -> HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return res.json();
  }

  function noteDaemonReload(r) {
    if (typeof r.reloadCount === "number") daemonReloadCount = r.reloadCount;
    if (typeof r.reloadErrors === "number") daemonReloadErrors = r.reloadErrors;
    if (typeof r.reloadHooked === "boolean") daemonReloadHooked = r.reloadHooked;
  }

  /**
   * Healthy AND ours. The daemon port is machine-global: a second checkout
   * previewed at the same time answers /health here just as convincingly, and
   * adopting it would render THAT project's screens under this project's name.
   * `previewsDir` (PreviewDaemon.kt's /health) is the identity check.
   *
   * A daemon that doesn't report `previewsDir` predates that field; it is
   * adopted, because refusing would break reuse for every already-running
   * daemon, but the log says plainly that the project went unverified.
   */
  async function daemonHealthy() {
    let health;
    try {
      health = await daemonFetch("/health", 2000);
    } catch {
      return false;
    }
    const theirs = health && typeof health.previewsDir === "string" ? path.resolve(health.previewsDir) : null;
    if (theirs && theirs !== path.resolve(previewsDir)) {
      log(`a daemon is running on ${daemonUrl} but serves ${theirs} — not this project; staying on the gradle path`);
      return false;
    }
    if (!theirs) log(`daemon on ${daemonUrl} reports no previewsDir (older build) — reusing it unverified`);
    noteDaemonReload(health);
    return true;
  }

  /**
   * A source change in daemon mode: mark the swap outcome as unconfirmed (renders wait
   * for the reload via afterReload) and arm the compile watchdog — the hot recompiler
   * is a separate Gradle daemon whose failures are otherwise INVISIBLE (a broken edit
   * writes no classes, so nothing else ever fires).
   */
  function noteSrcChange() {
    if (mode !== "daemon") return;
    pendingSrcChange = true;
    staleRetries = 0;
    clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => void compileWatchdog(), watchdogMs);
  }

  function confirmSwapOutcome() {
    pendingSrcChange = false;
    staleRetries = 0;
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }

  async function compileWatchdog() {
    if (!pendingSrcChange || mode !== "daemon") return;
    log("no hot swap observed since the last save — running a compile check");
    try {
      await runCompileCheck(projectDir);
      log("compile check ok — refreshed classes will trigger the next render");
      confirmSwapOutcome(); // the edit builds; whatever renders next is the outcome
      scheduleRender(staleRetryMs);
    } catch (err) {
      const all = [err && err.message, err && err.stdout, err && err.stderr]
        .filter(Boolean)
        .join("\n");
      const errs = extractCompileErrors(all);
      lastError = errs.length ? errs.join("\n") : all;
      lastErrorSource = "compile";
      confirmSwapOutcome(); // outcome delivered; the next save re-arms
      touch("compile-failed");
      log(`compile FAILED: ${(errs[0] || String(err && err.message)).slice(0, 300)}`);
      broadcast({ type: "error", error: lastError, source: "compile" });
      settleWaiters();
    }
  }

  const spawnDaemon =
    opts.spawnDaemon ||
    (() => {
      const appPackage = detectAppPackage(projectDir);
      return spawn(
        "./gradlew",
        [
          ":composeApp:hotRunDesktop",
          `--mainClass=${appPackage}.inspector.PreviewDaemonKt`,
          "--auto",
          "--console=plain",
          "-q",
        ],
        { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"], env: gradleEnv() },
      );
    });

  /** Wire a spawned daemon child's streams/exit into the service (also for injected spawns). */
  function adoptDaemonChild(child) {
    // The daemon's `hotRunDesktop` client is itself a Gradle invocation that stays
    // "in flight" for as long as the process runs — not a single discrete task like
    // runRender/runCompileCheck — so it gets the marker for its whole lifetime,
    // refreshed by touch() (wired to noteDaemonOutput below) rather than cleared
    // between renders.
    stampRenderMarker(projectDir);
    child.stdout?.on("data", noteDaemonOutput);
    child.stderr?.on("data", noteDaemonOutput);
    child.on?.("exit", (code) => {
      log(`daemon gradle client exited (${code})`);
      clearRenderMarker(projectDir);
      if (mode === "daemon") {
        mode = "gradle";
        if (classesWatcher) {
          classesWatcher.close();
          classesWatcher = null;
        }
      }
      daemonChild = null;
    });
  }

  /**
   * Bring the resident daemon up in the BACKGROUND: reuse a healthy one on the port,
   * else spawn `hotRunDesktop --mainClass=<pkg>.inspector.PreviewDaemonKt --auto` and
   * poll /health. Until it's up, renders take the gradle path; once up, the classes
   * dir becomes the render trigger (the hot agent recompiles on save; freshly written
   * classes are the "code landed" signal).
   */
  async function ensureDaemon() {
    if (await daemonHealthy()) {
      enterDaemonMode("reusing already-running daemon");
      return;
    }
    try {
      daemonChild = spawnDaemon();
      adoptDaemonChild(daemonChild);
    } catch (err) {
      log(`daemon spawn failed (${err.message}) — staying on the gradle path`);
      return;
    }
    daemonBootDeadline = Date.now() + DAEMON_BOOT_TIMEOUT_MS;
    while (Date.now() < daemonBootDeadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (!daemonChild) return; // exited during boot
      if (await daemonHealthy()) {
        enterDaemonMode("daemon booted");
        return;
      }
    }
    log("daemon did not become healthy in time — staying on the gradle path");
  }

  function enterDaemonMode(why) {
    mode = "daemon";
    log(`${why} — warm renders via ${daemonUrl}`);
    watchClasses();
    // A hot swap may already have landed while we were booting; render once now.
    scheduleRender();
  }

  function watchClasses() {
    if (classesWatcher) return;
    const classesDir = path.join(projectDir, "composeApp", "build", "classes", "kotlin", "desktop", "main");
    try {
      classesWatcher = fs.watch(classesDir, { recursive: true }, () => {
        touch("classes-change");
        scheduleRender(CLASSES_DEBOUNCE_MS);
      });
      log(`watching ${classesDir} (post-hot-swap render trigger)`);
    } catch {
      // Classes dir not there yet (or recursive unsupported): the src watcher still
      // triggers renders; the daemon serves them warm either way.
      classesWatcher = null;
      log("classes dir not watchable — src watcher remains the trigger");
    }
  }

  async function renderCycle() {
    if (!capabilities.screens) return; // nothing to render, and nothing to render with
    if (rendering) {
      renderQueued = true;
      return;
    }
    // Coexistence defense 1: a verify lane holds the project — defer instead of
    // colliding on kspCaches. The render is not lost; it re-schedules until the
    // marker clears (or goes stale), then runs.
    if (laneInProgress(projectDir)) {
      touch("lane-defer");
      renderPhase = "waiting-lane";
      renderPhaseDetail = "a verify lane is running";
      log("verify lane in progress — deferring render until it finishes");
      broadcast({ type: "freshness" });
      scheduleRender(LANE_POLL_MS);
      return;
    }
    rendering = true;
    renderScheduled = false;
    const coveringSrcAt = srcChangedAt; // the generation THIS attempt is about to cover
    renderPhase = "rendering";
    renderPhaseDetail = null;
    broadcast({ type: "freshness" });
    touch("render-start");
    rendererLastAttemptAt = new Date().toISOString(); // renderer health: every attempt counts, success or not
    snapshotPngs(); // keep the pre-render pixels for the gallery's before/after compare
    broadcast({ type: "rendering" });
    let suppressSettle = false;
    try {
      let reloadAdvanced = false;
      let swapFailed = false;
      if (mode === "daemon") {
        try {
          // Swap-aware render: after a save, ask the daemon to hold the render until
          // the in-JVM reload actually lands (classes on disk precede the swap).
          const wantReload = daemonReloadHooked && pendingSrcChange;
          const query = wantReload ? `&afterReload=${daemonReloadCount}` : "";
          const prevReload = daemonReloadCount;
          const prevErrors = daemonReloadErrors;
          const r = await daemonFetch(`/render?screen=all${query}`, DAEMON_RENDER_TIMEOUT_MS);
          noteDaemonReload(r);
          reloadAdvanced = daemonReloadCount > prevReload;
          swapFailed = prevErrors >= 0 && daemonReloadErrors > prevErrors;
          log(
            `daemon rendered ${r.rendered.length} screens in ${r.ms}ms` +
              (wantReload ? ` (swap ${reloadAdvanced ? "landed" : swapFailed ? "FAILED" : "NOT observed"})` : ""),
          );
        } catch (err) {
          log(`daemon render failed (${err.message}) — falling back to the gradle path`);
          mode = "gradle";
          await runRender(projectDir);
        }
      } else {
        await runRender(projectDir);
      }
      loadPreviews();
      // Renderer health: the Gradle/daemon call it took to get here succeeded —
      // the pipeline itself is alive, independent of whether the swap/stale
      // checks below still have something to say about THIS render's content.
      rendererLastOutcome = "ok";
      rendererLastSuccessAt = new Date().toISOString();
      rendererConsecutiveFailures = 0;
      rendererLastErrorText = null;
      transientRetries = 0;
      renderPhase = "idle";
      renderPhaseDetail = null;
      renderCoversSrcAt = coveringSrcAt;
      lastError = null;
      lastErrorSource = null;
      compileErrorLines = [];
      if (swapFailed) {
        // The agent could not apply the swap (typically a structural change beyond
        // Compose Hot Reload). Previews show pre-swap code — say so, don't retry.
        lastError =
          "hot swap FAILED to apply (structural change beyond the reload agent?) — " +
          "previews show pre-swap code; restart the preview to pick the change up";
        lastErrorSource = "reload";
        confirmSwapOutcome();
        touch("swap-failed");
        log(`render #${version}: ${lastError}`);
        broadcast({ type: "error", error: lastError, source: "reload" });
        return;
      }
      // Stale render: a save is pending, the swap hasn't landed, and nothing changed —
      // we likely composed pre-swap code. Retry shortly instead of a false `changed: []`
      // (when the daemon lacks the reload hook this is time-based and bounded).
      const stale =
        mode === "daemon" &&
        pendingSrcChange &&
        !reloadAdvanced &&
        lastChanged.length === 0;
      if (stale && staleRetries < MAX_STALE_RETRIES) {
        staleRetries++;
        suppressSettle = true; // waiters get the retry's outcome, not this stale one
        touch("render-stale");
        log(`render #${version} preceded the hot swap — retry ${staleRetries}/${MAX_STALE_RETRIES} in ${staleRetryMs}ms`);
        scheduleRender(staleRetryMs);
      } else {
        if (stale) {
          touch("swap-not-observed");
          log(
            `no hot swap observed after ${MAX_STALE_RETRIES} retries — settling with the current render ` +
              "(a no-op edit, or a structural change the hot agent can't apply; restart preview to heal the latter)",
          );
        } else {
          touch("render-ok");
        }
        confirmSwapOutcome();
        log(`render #${version} ok${lastChanged.length ? ` (changed: ${lastChanged.join(", ")})` : ""}`);
        broadcast({ type: "render", version, changed: lastChanged });
      }
    } catch (err) {
      const errText = err && err.message ? err.message : String(err);
      // A foreign Gradle build is rewriting the classes dir under us (see
      // TRANSIENT_RENDER_RE): defer and retry rather than reporting a failure the
      // tree does not actually have. The previous render stays on screen, unlabelled
      // — which is the truth: nothing new has been proven, nothing is broken.
      if (TRANSIENT_RENDER_RE.test(errText)) {
        transientRetries++;
        suppressSettle = true; // waiters get the retry's outcome, not this race
        const quiet = transientRetries <= MAX_TRANSIENT_RETRIES;
        // Within the quiet window this is an ordinary collision and the console just says
        // it is waiting. Past it, the console STOPS being quiet — it still shows the last
        // good render, but labelled stuck, with how old it is. It never stops retrying:
        // the usual cause is another build that will finish.
        renderPhase = quiet ? "waiting-build" : "stuck";
        renderPhaseDetail = quiet
          ? "another build is using the project"
          : `another build has held the project for a while — still retrying (${errText.split("\n")[0]})`;
        if (!quiet) {
          // Past the quiet window the pipeline is genuinely not producing pixels, and
          // renderer health is what `preview_status` consumers (agents) read. Staying
          // "ok" here would be the same lie the banner used to tell, moved to the API.
          rendererLastOutcome = "failed";
          rendererConsecutiveFailures += 1;
          rendererLastErrorText = errText;
        }
        touch(quiet ? "render-deferred" : "render-stuck");
        log(
          `render deferred (attempt ${transientRetries}) — a foreign Gradle invocation is rewriting ` +
            `the classes dir; retrying in ${quiet ? TRANSIENT_RETRY_MS : STUCK_RETRY_MS}ms`,
        );
        broadcast({ type: "freshness" });
        scheduleRender(quiet ? TRANSIENT_RETRY_MS : STUCK_RETRY_MS);
        return;
      }
      transientRetries = 0;
      // A real failure. Report it — AND keep trying, so a transient cause we did not
      // classify still heals itself rather than leaving a dead console until someone saves.
      renderPhase = "stuck";
      renderPhaseDetail = errText.split("\n")[0];
      scheduleRender(STUCK_RETRY_MS);
      lastError = errText;
      lastErrorSource = "render";
      // Renderer health: the render PIPELINE failed outright (Gradle/daemon call
      // threw) — distinct from a compile error in the user's code. Tracked here
      // only, so a later unrelated compileWatchdog message never masks it.
      rendererLastOutcome = "failed";
      rendererConsecutiveFailures += 1;
      rendererLastErrorText = lastError;
      touch("render-failed");
      log(`render FAILED: ${lastError}`);
      broadcast({ type: "error", error: lastError, source: "render" });
    } finally {
      rendering = false;
      if (renderQueued) {
        renderQueued = false;
        void renderCycle();
      } else if (!suppressSettle) {
        settleWaiters(); // no follow-up pending — this cycle IS the outcome waiters asked for
      }
    }
  }

  /** Every watched source change funnels here — the one place freshness can be stamped. */
  function noteSourceChanged() {
    srcChangedAt = Date.now();
  }

  function scheduleRender(delayMs = DEBOUNCE_MS) {
    clearTimeout(debounceTimer);
    renderScheduled = true;
    debounceTimer = setTimeout(() => void renderCycle(), delayMs);
  }

  // ── Self-renewal ────────────────────────────────────────────────────────
  // docs/features/studio-self-renewal.md. The console detects its own staleness
  // in three places and, before this, every one of them ended in the same
  // sentence — "restart it" — a verb only the human held, and only by
  // interrupting the work they were trying to watch. The verb belongs to the
  // process that owns the fact (R1): the worker observes its own sources, waits
  // for a moment when nothing is in flight, and exits EX_RENEW for the
  // supervisor in bin/console.mjs to respawn with a fresh module graph.
  //
  // SOURCE MODE ONLY (R3). A scaffolded app runs the committed bundle, whose
  // sources cannot change under it — hashing on every save there would be cost
  // with no finding available.
  let serviceApi = null;
  let selfWatchers = [];
  let renewTimer = null;
  let renewQuiesceTimer = null;
  let renewArmed = false;

  /** What a renewal would interrupt right now, or null when nothing would (R4). */
  function renewalBlockedBy() {
    if (rendering || renderScheduled) return "a render is in flight";
    if (laneInProgress(projectDir)) return "a verify lane is running";
    if (daemonBootDeadline && Date.now() < daemonBootDeadline) return "the render daemon is booting";
    return null;
  }

  function attemptRenewal() {
    const blocked = renewalBlockedBy();
    const decision = renewalDecision({
      diskId: diskBuildId(),
      loadedId: LOADED_BUILD.id,
      armed: renewArmed,
      blockedBy: blocked,
    });
    if (decision === "none") return;
    if (decision === "stand-down") {
      renewArmed = false;
      clearTimeout(renewQuiesceTimer);
      updateConsoleRegistry(projectDir, { buildStale: false });
      log("own sources returned to the build already running — renewal stood down");
      return;
    }
    if (decision === "defer") {
      // Deferred, never dropped: re-check on a timer. The registry already
      // carries buildStale, so a deferred renewal stays VISIBLE on the inject
      // and the statusline — which is exactly when the human needs to know.
      log(`own sources changed; renewal deferred — ${blocked}`);
      clearTimeout(renewQuiesceTimer);
      renewQuiesceTimer = setTimeout(attemptRenewal, RENEW_QUIESCE_POLL_MS);
      return;
    }
    log(`own sources changed — renewing; the supervisor respawns this worker with the new code`);
    try {
      broadcast({ type: "renewing" });
    } catch {
      /* the page learns either way: its EventSource reconnects and the hello's
         build id differs, which triggers the same reload (R6) */
    }
    // The service's own teardown, not a second copy of it: closes the server,
    // clears the registry and the render marker, and shuts the Gradle daemon
    // down rather than orphaning it.
    const handoffPort = port;
    try {
      if (serviceApi) serviceApi.stop();
    } catch {
      /* a teardown that throws must not become a console that never comes back */
    }
    // stop() released the record. Leave a HANDOFF in its place, owned by the
    // supervisor's pid (our parent — it outlives this process by design), so a
    // `preview` call landing in the respawn window waits for the console coming
    // back instead of starting a second one against the same build directory.
    try {
      fs.writeFileSync(
        consoleRegistryPath(projectDir),
        `${JSON.stringify({
          pid: process.ppid,
          port: handoffPort,
          url: `http://127.0.0.1:${handoffPort}/`,
          projectDir: path.resolve(projectDir),
          startedAt: new Date().toISOString(),
          renewing: true,
          renewingAt: new Date().toISOString(),
          buildStale: true,
        })}\n`,
      );
    } catch {
      /* the handoff is an optimization; without it the window is simply visible */
    }
    process.exit(EX_RENEW);
  }

  function onSelfSourceChange() {
    clearTimeout(renewTimer);
    renewTimer = setTimeout(() => {
      // Recompute rather than trust the event. Editors save atomically and
      // touch files whose CONTENT is unchanged; a renewal with nothing to adopt
      // is a free outage and a cold daemon for no reason.
      // Arm only when there is genuinely new code to adopt: editors save
      // atomically and touch files whose CONTENT is unchanged, and a renewal
      // with nothing to adopt is a free outage. renewalDecision owns the rest,
      // including standing an armed renewal down when an edit is undone.
      if (renewalDecision({ diskId: diskBuildId(), loadedId: LOADED_BUILD.id, armed: renewArmed, blockedBy: null }) === "renew" && !renewArmed) {
        renewArmed = true;
        updateConsoleRegistry(projectDir, { buildStale: true });
      }
      attemptRenewal();
    }, RENEW_DEBOUNCE_MS);
  }

  function watchSelfSources() {
    if (runningFrom().mode !== "source") return; // R3 — a bundle cannot go stale under itself
    for (const dir of sourceRoots()) {
      try {
        selfWatchers.push(
          fs.watch(dir, { recursive: true }, (_event, filename) => {
            if (filename && !String(filename).endsWith(".mjs")) return; // the hash covers .mjs only
            onSelfSourceChange();
          }),
        );
      } catch {
        /* a watch we cannot open is a renewal we do not get — never fatal, and
           the stale banner still tells the human what happened */
      }
    }
    if (selfWatchers.length) log(`watching own sources for renewal (${selfWatchers.length} root(s), source mode)`);
  }

  const IGNORE = /(^|[\\/])(build|\.gradle|\.idea|\.DS_Store)([\\/]|$)/;

  function startWatching() {
    try {
      watcher = fs.watch(srcDir, { recursive: true }, (_event, filename) => {
        if (filename && IGNORE.test(filename)) return;
        touch("src-change");
        // S3: real work moves the Drive strip. The chain's observed tier now
        // counts writes since the request; a source save is one, so the strip
        // refreshes on what the agent DID, not only on what it declared.
        // Debounced: a save storm is one refresh.
        clearTimeout(activityBroadcastTimer);
        activityBroadcastTimer = setTimeout(() => broadcast({ type: "governance" }), ACTIVITY_BROADCAST_MS);
        noteSourceChanged(); // freshness: the pixels on screen are now behind the source
        noteSrcChange(); // daemon mode: mark swap-pending + arm the compile watchdog
        // Daemon mode: the hot agent recompiles on save and the classes watcher fires
        // once fresh classes land — rendering now would race it with stale code.
        //
        // But that hand-off is not guaranteed: a save that produces NO new classes (a
        // no-op save, a comment-only edit, a recompile that yields nothing) never fires
        // the classes watcher, and the render would never happen — leaving the console
        // permanently stale while promising a refresh that was not coming. Arm a fallback
        // so the state always settles; a redundant render simply confirms freshness.
        if (mode === "daemon" && classesWatcher) {
          scheduleRender(watchdogMs);
          return;
        }
        scheduleRender();
      });
      log(`watching ${srcDir} (fs events)`);
    } catch {
      // Recursive watch unsupported → cheap mtime poll over the source tree.
      let lastStamp = scanStamp();
      pollTimer = setInterval(() => {
        const stamp = scanStamp();
        if (stamp !== lastStamp) {
          lastStamp = stamp;
          touch("src-change");
          noteSourceChanged();
          noteSrcChange();
          scheduleRender();
        }
      }, POLL_FALLBACK_MS);
      log(`watching ${srcDir} (poll fallback)`);
    }
  }

  // --- the governed surface, watched -----------------------------------------
  // The console's live-truth promise used to hold only for changes the CONSOLE
  // ITSELF made: SSE events fired from its own POST handlers, and the file
  // watcher covered composeApp/src (the render surface) alone. So the two most
  // common events in the change flow — an agent writing a spec or a brief, and
  // `node qa/approve.mjs` run in a terminal — left the page stale until a
  // manual refresh, which is exactly the lie this console exists to prevent.
  // These watchers close it: the governed files are watched, and a change
  // broadcasts the same events the in-place swaps already listen for.
  // The layout decides WHICH specs dir and WHICH receipt file to watch. A
  // refused manifest watches the default paths (the page says why it is
  // refused); watching nothing would freeze the page as well as blind it.
  const watchLayoutResolved = resolveProjectLayout(projectDir);
  const watchLayout = watchLayoutResolved.ok ? watchLayoutResolved.layout : DEFAULT_LAYOUT;
  const receiptRelParts = watchLayout.receipt.split("/");
  const receiptBase = receiptRelParts.pop();
  const receiptDirRel = receiptRelParts.join("/") || ".";
  const GOVERNANCE_WATCHES = [
    { rel: watchLayout.specs, kind: "governance" },
    // Mirrors FEATURES_DIR_REL in the project's own qa/lib/feature-brief.mjs;
    // this package cannot import that file statically (it lives in the generated app).
    { rel: "docs/features", kind: "governance" },
    { rel: "qa", kind: "ledger", only: new Set(["approvals.json", "comments.json"]) },
    // The live chain's ephemeral files (studio-drive-mode): a plan advance or
    // a new request must move the Drive strip without a manual reload — and the
    // closed-chain trail (drive-narration N5) moves the Recent-requests fold.
    { rel: "qa", kind: "governance", only: new Set([".plan.json", ".request.json", ".plan-history.jsonl"]) },
    // The lane's own narration (drive-narration N2): verify.mjs rewrites the
    // lane marker at each step start, so watching it makes the Drive strip's
    // observed line advance step-by-step while the full check runs. The dir is
    // non-recursively watched and the `only` filter drops Gradle's churn.
    // mkdir: the build dir does not exist before the first Gradle run, and a
    // watch skipped at startup never retries — verify.mjs mkdirs the same path
    // before stamping, so pre-creating it is claiming nothing Gradle owns.
    { rel: "composeApp/build", kind: "governance", only: new Set([".cmp-render-in-progress"]), mkdir: true },
    { rel: "qa", kind: "governance", only: new Set([".lane-in-progress"]) },
    { rel: receiptDirRel, kind: "governance", only: new Set([receiptBase]) },
    // The manifest itself: editing it re-points every reader, so the page
    // must re-render (the watch set is fixed for the process — a moved
    // receipt path takes effect on the next console start, and the page's
    // layout line names the manifest so that is visible).
    { rel: "qa", kind: "governance", only: new Set([MANIFEST_REL_PATH.split("/").pop()]) },
  ];
  const pendingGovernance = new Set();
  let governanceWatchers = [];
  /** The lane's step-stream tail (LIVE-CONSOLE Phase B) — see watchStepTail. */
  let stepTail = null;
  let governanceTimer = null;

  function flushGovernance() {
    const kinds = [...pendingGovernance];
    pendingGovernance.clear();
    for (const kind of kinds) {
      if (kind === "approval") {
        // Suppress the echo of the console's OWN ledger write: that path
        // already broadcast (with its derived next step), and a duplicate
        // would double-notify every agent listening on the stream.
        if (Date.now() - lastSelfLedgerWriteAt < SELF_WRITE_ECHO_MS) continue;
        touch("approval");
        broadcast({ type: "approval", origin: "file" });
        void checkApprovalWaiters();
      } else if (kind === "comment") {
        if (Date.now() - lastSelfLedgerWriteAt < SELF_WRITE_ECHO_MS) continue;
        touch("comment");
        broadcast({ type: "comment", origin: "file" });
        void checkCommentWaiters();
      } else {
        touch("governance-change");
        broadcast({ type: "governance" });
      }
    }
  }

  function watchGovernance() {
    for (const w of GOVERNANCE_WATCHES) {
      const abs = path.join(projectDir, w.rel);
      if (!fs.existsSync(abs)) {
        // mkdir only where the pipeline that stamps into it exists. Creating
        // composeApp/build inside a governance-only project would manufacture
        // a composeApp/ directory — and flip the project's own capability on
        // the next start. A console must never edit the project it observes.
        if (!w.mkdir || !capabilities.screens) continue; // a project without it simply has nothing to watch
        try {
          fs.mkdirSync(abs, { recursive: true });
        } catch {
          continue;
        }
      }
      try {
        const watcher = fs.watch(abs, (_event, filename) => {
          const base = filename ? path.basename(filename) : "";
          if (w.only && !w.only.has(base)) return;
          pendingGovernance.add(w.kind === "ledger" ? (base === "comments.json" ? "comment" : "approval") : "governance");
          clearTimeout(governanceTimer);
          governanceTimer = setTimeout(flushGovernance, GOVERNANCE_DEBOUNCE_MS);
        });
        governanceWatchers.push(watcher);
      } catch {
        /* unwatchable path — the page still updates on the next interaction */
      }
    }
    if (governanceWatchers.length > 0) log("watching the governed surface (specs, docs/features, qa ledgers, receipt)");
  }

  // ── the lane's step stream, tailed (LIVE-CONSOLE.md Phase B) ───────────────
  //
  // The lane writes qa/.lane-steps.ndjson; this reads the lines it appends
  // and REBROADCASTS them on the SSE the page is already holding open. That is
  // the whole transport: no new port, no push endpoint, no dependency, and
  // nothing here can start a lane or produce a verdict.
  //
  // What goes on the wire is not the raw line. `nowFrame` (the console's) turns
  // the freshly-read file into the exact instruction the page acts on — the
  // head's markup and the markup of the ROWS THAT CHANGED — so the page derives
  // nothing and a row appended live is byte-identical to the same row on a
  // reload. Re-reading the whole file per line is deliberate and cheap: it is
  // one run's worth of lines, and it means a client that connected halfway
  // through still gets a consistent frame rather than a diff against a state it
  // never had.
  function watchStepTail() {
    stepTail = watchStepStream(projectDir, (event) => {
      if (sseClients.size === 0) return; // nobody is watching; the file is still the record
      broadcast(nowFrame(readStepStream(projectDir), event));
    });
    if (stepTail.path) log(`watching the lane's step stream (${path.relative(projectDir, stepTail.path)})`);
  }

  function scanStamp() {
    let stamp = 0;
    (function walk(dir) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (IGNORE.test(p)) continue;
        if (e.isDirectory()) walk(p);
        else {
          try {
            stamp = Math.max(stamp, fs.statSync(p).mtimeMs);
          } catch {}
        }
      }
    })(srcDir);
    return stamp;
  }

  /** Buffer a request body (JSON POSTs only — bounded so a bad client can't OOM the service). */
  function readBody(req, limitBytes = 1_000_000) {
    return new Promise((resolve, reject) => {
      let data = "";
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > limitBytes) {
          reject(new Error("request body too large"));
          req.destroy();
          return;
        }
        data += chunk;
      });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      if (url.pathname === "/") {
        const [approvals, designSystem, comments, lastReceipt] = await Promise.all([
          approvalStatusSnapshot(),
          getDesignSystemData(),
          commentsSnapshot(),
          getLastReceipt(projectDir),
        ]);
        // The project's own scanner when it ships one (qa/lib/spec-coverage.mjs),
        // else the console's scan — both under the project's declared layout.
        const specs = await getProjectSpecsData(projectDir);
        // §3.0: the product brief — specs/intent.md parsed in its own order.
        const intent = getIntentData(projectDir);
        // §3.6: prior receipts, if this project keeps any beyond latest.json —
        // the Evidence timeline's source (absence renders the standardized line).
        const receiptHistory = listReceiptHistory(projectDir);
        const architecture = getArchitectureData(projectDir);
        const components = getComponentsData(projectDir);
        const variants = getVariantsData(projectDir);
        // CV-1 W3b: the components artifact's own approval record (drives
        // the per-card badge), mtime-based per-file drift evidence (only
        // meaningful once that record is changed-since-approval), the
        // ARCH-11-style hand-rolled-state scan, and any live state-variant
        // renders already sitting in the current generation's `cards`.
        const componentsApprovalRecord = approvals.available
          ? approvals.statuses.find((s) => s.id === "components") || null
          : null;
        const componentsDrift = components.available
          ? getComponentDriftInfo(
              projectDir,
              components.components.map((c) => c.file),
              componentsApprovalRecord,
            )
          : { available: false, reason: "components scan unavailable" };
        const handRolledViolations = getHandRolledStateViolations(projectDir);
        // §3.1: per-token usage counts from the real commonMain tree — only
        // meaningful when there is a catalog to count against.
        const tokenUsage = designSystem.available
          ? getTokenUsage(projectDir, designSystem.catalog || {})
          : { available: false, reason: "no design-system catalog to count against" };
        const componentsMeta = {
          approval: componentsApprovalRecord,
          drift: componentsDrift,
          violations: handRolledViolations,
          stateVariants: stateVariantCards(cards),
          // §3.3: each component's own story render (component.<kebab> ids),
          // shown at the top of its Components-page entry.
          componentStories: componentStoryCards(cards),
        };
        // AD-1: the "architecture" governed artifact's own live status record
        // (same lookup pattern as componentsApprovalRecord above) — drives the
        // Architecture tab's own approval badge + genesis/steward banner.
        // Wave C item 1: the last verify-lane receipt (receipt-bridge.mjs),
        // read fresh every request — drives each ARCH-* clause row's
        // last-receipt status in the governed contract.
        const architectureMeta = {
          approval: approvals.available ? approvals.statuses.find((s) => s.id === "architecture") || null : null,
          lastReceipt,
        };
        // §2 provenance footer: the project's git HEAD, when there is one.
        // Not a git repo (or no git) -> null; the footer then says "the live
        // tree" without a hash rather than fabricating one.
        let treeHash = null;
        try {
          const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
            cwd: projectDir,
            timeout: 3000,
          });
          treeHash = stdout.trim() || null;
        } catch {}
        // PW-5 surfaces. Walkthrough + digest read committed ledgers; the live
        // probe is sub-second; B5's anchored diffs run ONLY for artifacts
        // currently drifted (bounded per-request work — zero when nothing is).
        const walkthrough = getWalkthroughData(projectDir);
        const [liveDevice, digest, featureBoard, governedArtifacts, journal, walksData] = await Promise.all([
          getLiveDeviceStatus({ port: inspectorPort }),
          getDigestData(projectDir, { execFileAsync }),
          getFeatureBoardViaLib(projectDir),
          getGovernedArtifactsViaLib(projectDir),
          getJournalViaLib(projectDir),
          getWalksDataViaLib(projectDir),
        ]);
        const anchoredDiffs = {};
        if (approvals.available) {
          for (const s of approvals.statuses) {
            // `reopened` gets the anchored diff too. It is NOT drift — that
            // distinction is the GATE's (drift FAILs, redesign SKIPs) and was
            // over-applied here: "what has moved since the bytes I signed" is
            // the same question with the same answer either way, and a
            // sanctioned redesign is precisely the one a human is being asked
            // to re-sign, so it needs MORE explanation, not none.
            if (s.status !== "changed-since-approval" && s.status !== "reopened") continue;
            anchoredDiffs[s.id] = await getApprovalAnchoredDiff(projectDir, s.id, { execFileAsync }).catch(
              (err) => ({ available: false, reason: err.message })
            );
          }
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          galleryHtml({
            capabilities,
            layout: resolveProjectLayout(projectDir),
            appName,
            viewport,
            cards,
            version,
            changed: lastChanged,
            changedVersions: Object.fromEntries(changedAt),
            error: lastError,
            errorSource: lastErrorSource,
            renderer: rendererHealth(),
            rendererLastErrorText,
            freshness: freshness(),
            approvals,
            specs,
            designSystem,
            architecture,
            components,
            comments,
            variants,
            componentsMeta,
            architectureMeta,
            lastReceipt,
            receiptHistory,
            treeHash,
            tree: await treeState(projectDir),
            // The *now* row, SERVER-rendered from the file on every page load
            // — which is what makes a run that happened while the console was
            // down still visible when it comes back up.
            now: readStepStream(projectDir),
            // The *trust* and *ladder* rows (LIVE-CONSOLE Phase C), read on the
            // page load like everything else here. Both are file reads and a
            // profile import — no lane is started, no instrument is run, and
            // nothing is planted: D4b's rejection is kept at the call site as
            // well as in the bridges.
            trust: readTrustRecord(projectDir),
            ladder: readLadderStanding(projectDir, lastReceipt),
            tokenUsage,
            intent,
            features: featureBoard,
            walks: walksData,
            walkthrough,
            liveDevice,
            liveSession: liveSession.status(),
            digest,
            anchoredDiffs,
            governedArtifacts,
            journal,
            build: buildStatus(LOADED_BUILD.id),
          }),
        );
        return;
      }
      if (url.pathname === "/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        // The hello carries the build the SERVER is running; the page carries the
        // build it was DRAWN by (CMP_CONSOLE_BUILD). A difference means this page
        // predates a renewal — the client reloads itself once (R6). EventSource
        // reconnects on its own, so this costs the human nothing to trigger.
        res.write(`data: ${JSON.stringify({ type: "hello", version, build: LOADED_BUILD.id })}\n\n`);
        // The *now* rows, in full, on every connect AND every automatic
        // reconnect (LIVE-CONSOLE Phase B). A page that was open through a
        // disconnection cannot know which lines it missed, and a console that
        // left it guessing would be presenting a frozen list as live — so the
        // whole frame is sent once, read from the file, and the page replaces
        // what it has. This is the only place the rows are ever REPLACED
        // rather than appended, and it is the one moment where replacing them
        // is the honest act.
        //
        // ONLY when there is a run to report. A frame whose content is "there
        // is nothing" instructs the page to do nothing it is not already
        // doing — the server-rendered block states that absence already — and
        // §4's evidence-or-silence rules out broadcasting an empty state on a
        // stream every other client is also reading.
        const nowOnConnect = readStepStream(projectDir);
        if (nowOnConnect.available) res.write(`data: ${JSON.stringify(nowFrame(nowOnConnect, null))}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }
      if (url.pathname === "/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(status(), null, 2));
        return;
      }
      // ── The console protocol (docs/proposals/console-protocol.md) ─────────
      // The MCP tools' wire: thin routes over service methods that already
      // exist, so the tools work identically against a console this process
      // started and one another process started (one wire, whoever started
      // the process). The waits are LONG-POLLS — hold, then answer with the
      // same snapshot-plus-timedOut shape the in-process methods return —
      // because that IS the tools' contract; Node bounds request receipt, not
      // response time, so the hold is safe.
      const jsonOut = (code, body) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      // timeoutMs: a bad value falls back to the service default rather than
      // erroring — a wait with a mistyped timeout should still wait.
      const timeoutParam = () => {
        const raw = Number.parseInt(url.searchParams.get("timeoutMs") ?? "", 10);
        return Number.isInteger(raw) && raw > 0 ? raw : undefined;
      };
      if (url.pathname === "/api/render-wait") {
        jsonOut(200, await waitForRender(timeoutParam()));
        return;
      }
      if (url.pathname === "/api/diff") {
        const screen = url.searchParams.get("screen");
        if (!screen) {
          jsonOut(400, { ok: false, reason: "missing `screen` query parameter" });
          return;
        }
        const num = (name) => {
          const raw = url.searchParams.get(name);
          return raw === null ? undefined : Number(raw);
        };
        const result = diffScreen({ screen, tolerancePx: num("tolerancePx"), minTouchTargetPx: num("minTouchTargetPx") });
        jsonOut(result.ok ? 200 : 409, result);
        return;
      }
      if (url.pathname === "/api/variant") {
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          jsonOut(400, { ok: false, reason: `invalid JSON body: ${err.message}` });
          return;
        }
        if (!body.name || typeof body.name !== "string") {
          jsonOut(400, { ok: false, reason: "missing `name` (string) in the request body" });
          return;
        }
        const result = snapshotVariant(body.name);
        jsonOut(result.ok ? 200 : 409, result);
        return;
      }
      if (url.pathname === "/api/approvals") {
        jsonOut(200, await approvalStatusSnapshot());
        return;
      }
      if (url.pathname === "/api/approval-wait") {
        jsonOut(200, await waitForApprovalDecision(timeoutParam()));
        return;
      }
      if (url.pathname === "/api/comments") {
        jsonOut(200, await commentsSnapshot(url.searchParams.get("status") ?? undefined));
        return;
      }
      if (url.pathname === "/api/comment-wait") {
        jsonOut(200, await waitForNewComment(timeoutParam()));
        return;
      }
      if (url.pathname === "/api/resolve-comment") {
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          jsonOut(400, { ok: false, reason: `invalid JSON body: ${err.message}` });
          return;
        }
        if (!body.id || typeof body.id !== "string" || !body.note || typeof body.note !== "string") {
          jsonOut(400, { ok: false, reason: "missing `id` (string) and/or `note` (string) in the request body" });
          return;
        }
        jsonOut(200, await resolveCommentById(body.id, body.note));
        return;
      }
      if (url.pathname === "/api/approve") {
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: `invalid JSON body: ${err.message}` }));
          return;
        }
        const artifact = body && body.artifact;
        if (!artifact || typeof artifact !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `artifact` (string) in the request body" }));
          return;
        }
        // The signer travels with the request. The console asks the human once
        // per session; the server never fabricates one, so a request without it
        // gets the library's own refusal rather than a signature nobody made.
        const approvedBy = body && typeof body.approvedBy === "string" ? body.approvedBy.trim() : "";
        const result = await approveArtifactViaLib(projectDir, artifact, approvedBy || undefined);
        if (result.ok) result.whatNext = await whatNextAfter(`Signed ${artifact}`, artifact);
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("approval");
          lastSelfLedgerWriteAt = Date.now();
          // A signature HANDS OFF (CHANGE-FLOW-DESIGN.md §4): when the signed
          // artifact belongs to a feature's walk, the event carries the
          // DERIVED next step + owner, so a listening agent receives "brief
          // signed → next: contract" instead of a bare id it must re-derive.
          broadcast({ type: "approval", artifact, ...(await nextStepFor(artifact)) });
          void checkApprovalWaiters(); // settle any waitForApprovalDecision() faster than the 1s poll
        }
        return;
      }
      if (url.pathname === "/api/reopen") {
        // §2/§3 Reopen for redesign — same request/response shape as /api/approve
        // (POST, {artifact}, {ok,...}|{ok:false,reason}), because it's the same
        // KIND of thing: one governed artifact's status transitioning via the
        // project's own approvals library. Deliberately NOT folded into
        // /api/approve as a mode flag — "approve" and "reopen" are opposite
        // directions of the same door, and conflating them in one endpoint would
        // make a client-side bug (wrong flag) silently do the wrong transition.
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: `invalid JSON body: ${err.message}` }));
          return;
        }
        const artifact = body && body.artifact;
        if (!artifact || typeof artifact !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `artifact` (string) in the request body" }));
          return;
        }
        // `reason` (07-28 audit, fix 2) rides through to the project's own
        // library, which refuses without it — the refusal wording is the
        // library's, verbatim, same as every other transition.
        const result = await reopenArtifactViaLib(projectDir, artifact, {
          reason: typeof body.reason === "string" ? body.reason : undefined,
        });
        if (result.ok) result.whatNext = await whatNextAfter(`Reopened ${artifact} for redesign`, artifact);
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("reopen");
          // Reuses the "approval" SSE event type on purpose (design doc §3: "SSE
          // `approval` event — existing in-place refresh covers the panel") — the
          // client's approval-swap handler doesn't care WHICH transition fired,
          // only that the Approvals panel needs a re-fetch.
          lastSelfLedgerWriteAt = Date.now();
          broadcast({ type: "approval", artifact });
          void checkApprovalWaiters();
        }
        return;
      }
      if (url.pathname === "/api/feature/accept") {
        // The human's bookend on a feature brief. Same shape as /api/approve —
        // and its own endpoint for the same reason /api/reopen is: acceptance
        // is a distinct transition with distinct refusals (not provenDone,
        // brief drifted), and conflating transitions behind one endpoint lets
        // a client bug do the wrong one silently. There is deliberately NO
        // deliver endpoint and no deliver anywhere: doneness is DERIVED, never
        // claimed (CHANGE-FLOW-DESIGN.md §2) — the library refuses acceptance
        // until the derivation holds.
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: `invalid JSON body: ${err.message}` }));
          return;
        }
        const name = body && body.name;
        if (!name || typeof name !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `name` (string — the brief's docs/features/<name>.md name) in the request body" }));
          return;
        }
        const result = await acceptFeatureViaLib(projectDir, name);
        if (result.ok) result.whatNext = await whatNextAfter(`Accepted ${name} — its card closes into history`, `feature-brief:${name}`);
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("feature-accept");
          lastSelfLedgerWriteAt = Date.now();
          broadcast({ type: "approval", artifact: `feature-brief:${name}`, ...(await nextStepFor(`feature-brief:${name}`)) });
          void checkApprovalWaiters();
        }
        return;
      }
      if (url.pathname === "/api/comment") {
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: `invalid JSON body: ${err.message}` }));
          return;
        }
        const target = body && body.target;
        const text = body && body.text;
        if (!target || typeof target !== "object") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `target` (object) in the request body" }));
          return;
        }
        if (typeof text !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `text` (string) in the request body" }));
          return;
        }
        // author is ALWAYS "human-console" here — the console is the only caller of
        // this route; an agent adds evidence via tools, never via this endpoint.
        const result = await addCommentViaLib(projectDir, { target, text, author: "human-console" });
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("comment");
          lastSelfLedgerWriteAt = Date.now();
          broadcast({ type: "comment" });
          void checkCommentWaiters(); // settle any waitForNewComment() faster than the 1s poll
        }
        return;
      }
      if (url.pathname === "/live/start" && req.method === "POST") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(liveSession.start()));
        return;
      }
      if (url.pathname === "/live/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(liveSession.status()));
        return;
      }
      if (url.pathname.startsWith("/walkthrough/")) {
        // Static walkthrough evidence (A2): pngs, trees, report.html — same
        // traversal constraint as /previews/, rooted at the evidence dir.
        const wtRoot = path.join(projectDir, WALKTHROUGH_REL_DIR);
        const rel = decodeURIComponent(url.pathname.slice("/walkthrough/".length));
        const file = path.normalize(path.join(wtRoot, rel));
        if (!file.startsWith(wtRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const type = file.endsWith(".png")
          ? "image/png"
          : file.endsWith(".json")
            ? "application/json"
            : file.endsWith(".html")
              ? "text/html; charset=utf-8"
              : "application/octet-stream";
        res.writeHead(200, { "content-type": type });
        fs.createReadStream(file).pipe(res);
        return;
      }
      if (url.pathname.startsWith("/previews/")) {
        // Static previews: constrain to previewsDir (no traversal).
        const rel = decodeURIComponent(url.pathname.slice("/previews/".length));
        const file = path.normalize(path.join(previewsDir, rel));
        if (!file.startsWith(previewsDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const type = file.endsWith(".png")
          ? "image/png"
          : file.endsWith(".json")
            ? "application/json"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : "application/octet-stream";
        res.writeHead(200, { "content-type": type });
        fs.createReadStream(file).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    } catch (err) {
      // A route handler threw (e.g. a filesystem error mid-request) — never let an
      // async request listener's rejection go unhandled (Node treats that as fatal).
      log(`request handler error (${req.method} ${req.url}): ${err && err.message ? err.message : err}`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
      } else {
        res.end();
      }
    }
  }

  function listen(startPort) {
    return new Promise((resolvePromise, reject) => {
      let attempt = 0;
      const tryPort = (p) => {
        const srv = http.createServer(handleRequest);
        srv.once("error", (err) => {
          if (err.code === "EADDRINUSE" && attempt < PORT_ATTEMPTS - 1) {
            attempt++;
            tryPort(p + 1);
          } else {
            reject(err);
          }
        });
        srv.listen(p, "127.0.0.1", () => {
          server = srv;
          port = p;
          resolvePromise(p);
        });
      };
      tryPort(startPort);
    });
  }

  /**
   * The render PIPELINE's own health (FI-9 Change B) — "is Gradle/the daemon
   * actually producing pixels", independent of lastError/lastErrorSource (which
   * a compile-check message can overwrite). "never" = no render has been
   * attempted yet since this service started.
   */
  function rendererHealth() {
    return {
      lastOutcome: rendererLastOutcome,
      lastSuccessAt: rendererLastSuccessAt,
      lastAttemptAt: rendererLastAttemptAt,
      consecutiveFailures: rendererConsecutiveFailures,
    };
  }

  /**
   * The console's core promise, DERIVED: are the pixels on screen current, and if not,
   * what is being done about it. Never claimed — `state` falls out of comparing when the
   * previews were produced against when a source file last changed.
   *
   *   never    — nothing has rendered; there is nothing to show.
   *   fresh    — the previews were produced after the last source change.
   *   stale    — a source change is not yet reflected. `phase` says why:
   *              rendering / waiting-build / waiting-lane / stuck.
   *
   * `ageMs` lets every surface state how old what it is showing actually is, which is
   * what a service that boots onto previews from a previous run owes the reader.
   */
  function freshness() {
    const uncovered = srcChangedAt !== null && srcChangedAt !== renderCoversSrcAt;
    const working =
      renderPhase === "stuck" || renderPhase === "waiting-build" || renderPhase === "waiting-lane";
    const state =
      lastRenderAt === null ? "never" : uncovered || working ? "stale" : "fresh";
    // "queued" is only true when a render is genuinely pending. If we are stale with
    // nothing scheduled and nothing running, say SO — that is a state the reader needs
    // (it means a save did not reach the renderer), not one to paper over.
    const pending = renderScheduled || rendering;
    return {
      state,
      phase: state === "stale" && renderPhase === "idle" && !pending ? "unrefreshed" : renderPhase,
      pending,
      detail: renderPhaseDetail,
      lastRenderAt: lastRenderAt === null ? null : new Date(lastRenderAt).toISOString(),
      sourceChangedAt: srcChangedAt === null ? null : new Date(srcChangedAt).toISOString(),
      ageMs: lastRenderAt === null ? null : Math.max(0, Date.now() - lastRenderAt),
    };
  }

  function status() {
    const layoutResolved = resolveProjectLayout(projectDir);
    return {
      projectDir,
      // The layout this console reads the project through — the manifest's
      // or the default — so `--status` shows WHERE it looks before a reader
      // wonders why a pane is empty. A refused manifest is reported as such.
      layout: layoutResolved.ok
        ? { source: layoutResolved.source, manifest: layoutResolved.relPath, ...layoutResolved.layout }
        : { source: "refused", manifest: layoutResolved.relPath, reason: layoutResolved.reason },
      // Which build is serving this, and is it the build on disk? Captured ONCE
      // at module load (LOADED_BUILD, below) and compared against disk on every
      // read — a process cannot notice its own staleness any other way, and
      // twice in two days a stale console lied to a human about its own code.
      build: buildStatus(LOADED_BUILD.id),
      capabilities,
      url: port ? `http://127.0.0.1:${port}/` : null,
      previewsDir,
      mode,
      daemon: { url: daemonUrl, active: mode === "daemon" },
      version,
      rendering,
      lastError,
      lastErrorSource,
      renderer: rendererHealth(),
      freshness: freshness(),
      lastActivity,
      changedLastRender: lastChanged,
      screens: cards.map(({ screen, summary, a11y }) => ({
        id: screen.id,
        title: screen.title,
        ...summary,
        a11yPass: a11y.pass,
        a11yViolations: a11y.violations.length,
        lastChangedVersion: changedAt.get(screen.id) ?? null,
        tree: path.join(previewsDir, screen.tree),
        png: path.join(previewsDir, screen.png),
      })),
    };
  }

  // Named so self-renewal can call the service's own teardown before it exits
  // for the supervisor (studio-self-renewal R4) — one teardown path, not two.
  const api = {
    /** Initial render (unless fresh previews already exist), then serve + watch. */
    async start() {
      capabilities = detectCapabilities(projectDir);
      if (!capabilities.governance && !capabilities.screens) {
        throw new Error(
          `'${projectDir}' has neither qa/ (the governance surface) nor composeApp/ (the render pipeline) — nothing here for the console to serve.`,
        );
      }
      if (!capabilities.screens) {
        log("no composeApp/ — serving the governance window only (Drive, walks, approvals, evidence, comments); screens and live device absent");
      }
      // One console per project. A second service against the same tree would run its
      // own render loop against the same build dir — the collision that produced the
      // "Could not find or load main class" failures, plus a second URL showing a
      // different truth. `takeover: true` is the deliberate override.
      if (opts.takeover !== true) {
        const live = await findLiveConsole(projectDir, opts.probeConsole);
        if (live) {
          const err = new Error(
            `A studio console is already serving this project at ${live.url} ` +
              `(pid ${live.pid}, since ${live.startedAt}). Open that one — a second console would ` +
              `run its own renders against the same build directory and the two would disagree. ` +
              `To replace it: stop pid ${live.pid}, or start with takeover: true.`,
          );
          err.code = "CMP_CONSOLE_ALREADY_RUNNING";
          err.existing = live;
          throw err;
        }
      }
      if (capabilities.screens && fs.existsSync(path.join(previewsDir, "manifest.json"))) {
        // Serve what's on disk immediately; a fresh render still runs right after,
        // so the human sees SOMETHING at once and current state seconds later.
        loadPreviews();
      }
      await listen(opts.port || DEFAULT_PORT);
      // Claim the project only once we are actually listening — a service that failed
      // to bind must never leave a record that blocks the next honest attempt.
      writeConsoleRegistry(projectDir, port);
      // The governance watchers are the window; the render pipeline is a
      // capability on top of it. Without composeApp/ there is no source tree to
      // watch, no classes to hot-swap, nothing to render and no daemon to boot.
      watchGovernance();
      watchStepTail();
      watchSelfSources();
      if (capabilities.screens) {
        startWatching();
        void renderCycle();
        if (hot) void ensureDaemon();
      }
      return status();
    },
    stop() {
      clearTimeout(debounceTimer);
      clearInterval(pollTimer);
      clearTimeout(watchdogTimer);
      settleWaiters(); // don't leave agents hanging on a stopped service
      settleApprovalWaiters(); // ditto for pending waitForApprovalDecision() calls
      settleCommentWaiters(); // ditto for pending waitForNewComment() calls
      daemonBootDeadline = 0; // abort any in-flight boot poll
      if (classesWatcher) classesWatcher.close();
      clearTimeout(governanceTimer);
      for (const w of governanceWatchers) w.close();
      governanceWatchers = [];
      if (stepTail) stepTail.close();
      stepTail = null;
      clearTimeout(renewTimer);
      clearTimeout(renewQuiesceTimer);
      for (const w of selfWatchers) w.close();
      selfWatchers = [];
      // Best-effort daemon teardown: ask the JVM to exit, then kill the gradle client.
      fetch(`${daemonUrl}/shutdown`, { signal: AbortSignal.timeout(1500) }).catch(() => {});
      if (daemonChild) daemonChild.kill("SIGTERM");
      // Belt-and-braces: the exit event above clears this too, but that fires
      // asynchronously once the killed process actually exits — clear synchronously
      // here as well so a stopped service never leaves a marker for the lane to see.
      clearRenderMarker(projectDir);
      clearConsoleRegistry(projectDir); // release the project for the next console
      if (watcher) watcher.close();
      for (const res of sseClients) res.end();
      sseClients.clear();
      if (server) server.close();
      const final = status();
      server = null;
      port = null;
      return final;
    },
    status,
    waitForRender,
    treesFor,
    /** preview_diff's computation, where the previous generation lives (console-protocol.md §3). */
    diffScreen,
    /** Current approval statuses (§4 tab data) — {available:false} with no approvals library. */
    approvalStatusSnapshot,
    /** Blocks until any governed artifact's status changes (or timeoutMs elapses). */
    waitForApprovalDecision,
    /** Current comment ledger (§7.3 tab data) — {available:false} with no comments library. */
    commentsSnapshot,
    /** Blocks until a NEW comment lands (or timeoutMs elapses). */
    waitForNewComment,
    /** The agent's resolve primitive — records author "agent" + the note. */
    resolveComment: resolveCommentById,
    /** §2 candidates strip primitive: stash the current render as a named variant (replaces if present). */
    snapshotVariant,
    /** Test seam: force one render cycle without touching the filesystem watcher. */
    _renderCycle: renderCycle,
    // Test seam: simulate a save without depending on fs.watch timing (which is
    // platform-dependent and would make the freshness assertions flaky).
    _noteSourceChangedForTest: noteSourceChanged,
    /** Test seam: feed daemon-child output through the compile-failure scanner. */
    _noteDaemonOutput: noteDaemonOutput,
    /** Test seam: simulate a source-change event (swap-pending + watchdog arming). */
    _noteSrcChange: noteSrcChange,
  };
  serviceApi = api;
  return api;
}
