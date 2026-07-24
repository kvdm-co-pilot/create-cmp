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

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { renderTreeSvg } from "./render.mjs";
import { auditA11y } from "./a11y.mjs";
import { gradleEnv } from "./jdk.mjs";
import { fetchLiveCatalog } from "./live.mjs";
import {
  getApprovalsData,
  approveArtifact as approveArtifactViaLib,
  reopenArtifact as reopenArtifactViaLib,
} from "./approvals-bridge.mjs";
import {
  getCommentsData,
  addComment as addCommentViaLib,
  resolveComment as resolveCommentViaLib,
} from "./comments-bridge.mjs";
import { getSpecsData } from "./specs.mjs";
import { getArchitectureData } from "./architecture.mjs";
import { getLastReceipt, listReceiptHistory } from "./receipt-bridge.mjs";
import { getComponentsData } from "./components.mjs";
import { getVariantsData } from "./variants.mjs";
import { getComponentDriftInfo } from "./component-drift.mjs";
import { getHandRolledStateViolations } from "./handrolled-state.mjs";
import { getWalkthroughData, WALKTHROUGH_REL_DIR } from "./walkthrough-data.mjs";
import { getLiveDeviceStatus, createLiveSession } from "./live-session.mjs";
import { getDigestData } from "./digest.mjs";
import { getApprovalAnchoredDiff } from "./approval-diff.mjs";
import { renderShellPage, statusGlyph, artifactStatusHtml, railReceiptHtml, receiptGlyph, formatAgeCoarse } from "./console-shell.mjs";
import {
  designLanguageBodyHtml,
  componentsBodyHtml,
  approvalsTabHtml,
  specsTabHtml,
  architectureTabHtml,
  evidenceBodyHtml,
  commentsTabHtml,
  screensBodyHtml,
  intentBodyHtml,
  walkthroughTabHtml,
  liveDeviceTabHtml,
  digestTabHtml,
} from "./console-tabs.mjs";
import { getTokenUsage } from "./design-language.mjs";
import { getIntentData } from "./intent.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_PORT = 9600;
const DEFAULT_DAEMON_PORT = 9601;
const PORT_ATTEMPTS = 10;
const DEBOUNCE_MS = 400;
// Classes events arrive DURING recompile; the hot swap applies shortly after the last
// write. A longer trailing debounce here avoids rendering once with pre-swap code.
const CLASSES_DEBOUNCE_MS = 1500;
const POLL_FALLBACK_MS = 2000;
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
//   1. COORDINATE — the lane stamps .cmp-lane-in-progress for its duration; renders
//      DEFER while it exists. mtime-bounded so a crashed lane never wedges the eyes.
//   2. SELF-HEAL — a spawn that still collides clears kspCaches and retries once.
const LANE_MARKER_REL = ["composeApp", "build", ".cmp-lane-in-progress"];
const LANE_MARKER_STALE_MS = 30 * 60 * 1000;
const LANE_POLL_MS = 5000;
export const KSP_COLLISION_RE = /Storage for \[[^\]]*\] is already registered/;

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

// Component-story registry entries (§3.3): `component.<kebab-name>` ids from
// ComponentStories.kt. Rendered by the same pipeline as every other entry,
// but they are component documentation, not screens — the gallery keeps them
// out of the Screens grid/counts and the Components section shows each at the
// top of its entry.
const COMPONENT_STORY_ID_RE = /^component\.(.+)$/;

/** True when a registry id is a component story, not a screen. */
export function isComponentStoryId(id) {
  return COMPONENT_STORY_ID_RE.test(String(id));
}

/**
 * Every CURRENTLY RENDERED component-story entry, keyed by its kebab name
 * (`component.app-header` → `"app-header"`), for componentsBodyHtml. A
 * project whose registry predates component stories yields `{}` — the
 * Components section then states the absence per entry, never an error.
 * @param {Array<{screen: {id: string, title: string, png: string}}>} cards
 * @returns {Record<string, {id: string, title: string, png: string}>}
 */
export function componentStoryCards(cards) {
  const out = {};
  for (const { screen } of cards) {
    const m = COMPONENT_STORY_ID_RE.exec(screen.id);
    if (!m) continue;
    out[m[1]] = { id: screen.id, title: screen.title, png: screen.png };
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

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The studio console page (docs/STUDIO-REDESIGN.md §2): ONE shell — the
 * sidebar ordering/coverage rail, the per-page header grammar, and the
 * provenance footers — with every section contributing only a document body
 * (console-shell.mjs owns all chrome; sections may not invent their own).
 * Pure: (state) -> html. PNGs are referenced via /previews/… with a version
 * cache-buster; wireframe SVGs are inlined (SVG is structured text). Cards
 * changed in THIS render get the CHANGED flag plus a hover before/after
 * compare (screen.prev.png is the pre-render copy); every card keeps a
 * persistent "changed #N" badge from `changedVersions` so attribution
 * outlives the next render.
 * @param {object} state { appName, viewport, cards, version, changed, changedVersions, error,
 *   approvals, specs, designSystem, architecture, components, comments, variants, componentsMeta,
 *   architectureMeta, lastReceipt, receiptHistory, treeHash, tokenUsage, intent }
 */
export function galleryHtml(state) {
  const {
    appName,
    viewport,
    cards,
    version,
    changed = [],
    changedVersions = {},
    error = null,
    approvals = { available: false },
    specs = { available: false },
    designSystem = { available: false },
    architecture = { layerMap: { available: false }, governedContract: { available: false }, featureShape: { available: false } },
    components = { available: false },
    comments = { available: false },
    variants = { available: false },
    componentsMeta = {},
    architectureMeta = {},
    lastReceipt = null,
    receiptHistory = { available: false },
    treeHash = null,
    tokenUsage = null,
    intent = { available: false },
    // PW-5: the productization surfaces — each degrades to an honest empty
    // state when its data provider wasn't wired by the caller.
    walkthrough = { available: false, runs: [] },
    liveDevice = null,
    liveSession = null,
    digest = null,
    anchoredDiffs = null,
  } = state;
  const width = viewport?.width ?? 411;
  // §3.3: component stories render through the same pipeline but are not
  // screens — the Screens grid, screen count, and changed-count all exclude
  // them; the Components section picks them up via componentsMeta below.
  const screenCards = cards.filter(({ screen }) => !isComponentStoryId(screen.id));
  const changedScreens = changed.filter((id) => !isComponentStoryId(id));
  // Rail badge (§7.3): count of OPEN comments next to the Comments item.
  // Always rendered (hidden at 0) so the SSE "comment" handler can always
  // find #comments-badge to update in place.
  const openCommentCount = comments.available ? comments.comments.filter((c) => c.status === "open").length : 0;
  // §2 mode presentation: the Design-language candidates strip is genesis-
  // mode only — derived from the design-system ARTIFACT's own live status
  // (undefined when approvals data isn't available at all, which reads as
  // steward — the safe default: no strip rather than a fabricated one).
  const designSystemStatus = approvals.available
    ? (approvals.statuses.find((s) => s.id === "design-system") || {}).status
    : undefined;

  // Governed-artifact records: rail glyphs + page status lines (§2 header
  // grammar). Sections without an exact one-artifact mapping get NO glyph —
  // never a borrowed status.
  const artifactRecord = (id) =>
    approvals.available ? approvals.statuses.find((s) => s.id === id) || null : null;
  const dsRecord = artifactRecord("design-system");
  const archRecord = architectureMeta.approval ?? artifactRecord("architecture");
  const componentsRecord = componentsMeta.approval ?? artifactRecord("components");
  const intentRecord = artifactRecord("intent");

  // Evidence (§3.6): the receipt the whole console leans on. Some callers wire
  // it via architectureMeta.lastReceipt (the older Wave C path) — one receipt
  // serves the rail glyph, the rail foot, the status lines, the Screens rows'
  // clause badges, and the Evidence section.
  const effectiveReceipt = lastReceipt || architectureMeta.lastReceipt || null;

  // Open comments, attributed to the section their target lives in — the §2
  // header's open-comment count. Component comments ride the design-system
  // target type with a "component:<Name>" token (the §7.3 contract), so they
  // attribute to the Components section. Unknown/general targets count under
  // Comments.
  const sectionOfTarget = (t) => {
    if (!t || typeof t !== "object") return "comments";
    if (t.type === "design-system") {
      return String(t.token || "").startsWith("component:") ? "components" : "design-system";
    }
    if (t.type === "architecture") return "architecture";
    if (t.type === "screen" || t.type === "element") return "screens";
    // §3.0: the Intent brief's comment affordances ride the spec-line type
    // (file specs/intent.md, clauseId = the section heading) — they attribute
    // to the Intent section, not Specs.
    if (t.type === "spec-line") return t.file === "specs/intent.md" ? "intent" : "specs";
    return "comments";
  };
  const openBySection = {};
  if (comments.available) {
    for (const c of comments.comments) {
      if (c.status !== "open") continue;
      const s = sectionOfTarget(c.target);
      openBySection[s] = (openBySection[s] || 0) + 1;
    }
  }
  const openNote = (id) => {
    const n = openBySection[id] || 0;
    return n ? ` &middot; &#9998; ${n} open comment${n === 1 ? "" : "s"}` : "";
  };

  // --- section bodies (§3 professional forms, console-tabs.mjs) -------------

  // §3.4: the screen × state matrix. The expanded rows read the same specs
  // data as the RTM and the same receipt as Evidence — one derivation each.
  const screensBody = screensBodyHtml({
    cards: screenCards,
    changed: changedScreens,
    changedVersions,
    version,
    specs,
    lastReceipt: effectiveReceipt,
  });

  // --- §2 header status lines: one glance answers "what is this, is it
  // signed, has it moved". Artifact-governed pages use the artifact grammar;
  // the rest state only what their own data shows (evidence-or-silence). ----

  // The matrix's rows are BASE screens; @state variants render as columns
  // inside their row — the header count must match the rows the reader sees,
  // not the raw card count (caught by the wave-final browser walk: "7
  // screens" over a 4-row matrix).
  const baseScreenCount = screenCards.filter(({ screen }) => !String(screen.id).includes("@")).length;
  const screensStatus = `render #${version} &middot; ${baseScreenCount} screen${baseScreenCount === 1 ? "" : "s"}${
    changedScreens.length ? ` &middot; <span class="chg">${changedScreens.length} changed this render</span>` : ""
  }${openNote("screens")}`;

  // Intent (§3.0): the artifact status when there is one, plus the brief's
  // own fill state — both derived, neither borrowed. No intent.md at all
  // states the §3.0 pending line here too.
  const intentStatusParts = [];
  {
    const rec = artifactStatusHtml(intentRecord);
    if (rec) intentStatusParts.push(rec);
    if (intent.available && intent.sections) {
      const filled = intent.sections.filter((s) => s.filled).length;
      intentStatusParts.push(`${filled} of ${intent.sections.length} sections captured`);
    }
  }
  const intentStatus =
    (intentStatusParts.join(" &middot; ") || "not yet captured &mdash; conversation 0 pending") + openNote("intent");

  const dsStatus = (artifactStatusHtml(dsRecord) || "the visual vocabulary — tokens, contrast, candidates") + openNote("design-system");
  const archStatus = (artifactStatusHtml(archRecord) || "the layer contract and its live conformance") + openNote("architecture");

  // Components: the artifact status when there is one, plus the registry's
  // live size when the scan resolved — both are facts, neither is borrowed.
  const componentsStatusParts = [];
  {
    const rec = artifactStatusHtml(componentsRecord);
    if (rec) componentsStatusParts.push(rec);
    if (components.available && components.components) {
      const n = components.components.length;
      componentsStatusParts.push(`${n} component${n === 1 ? "" : "s"} in the registry`);
    }
  }
  const componentsStatus =
    (componentsStatusParts.join(" &middot; ") || "no components scan available") + openNote("components");

  const specsStatus = specs.available
    ? `${specs.files.length} spec file${specs.files.length === 1 ? "" : "s"} &middot; ${specs.files.reduce((n, f) => n + f.clauses.length, 0)} clauses${openNote("specs")}`
    : "no specs/ directory found";

  let evidenceStatus = "no verify receipt yet";
  if (effectiveReceipt && effectiveReceipt.available) {
    const age = typeof effectiveReceipt.ageMs === "number" ? formatAgeCoarse(effectiveReceipt.ageMs) : "age unknown";
    evidenceStatus = `verify ${esc(effectiveReceipt.verdict || "?")} &middot; ${esc(age)}${
      effectiveReceipt.stale ? ` &middot; <span class="status-drift">stale &mdash; tree changed since</span>` : ""
    }`;
  }

  let approvalsStatus = "approvals not available in this project";
  if (approvals.available && approvals.statuses) {
    const count = (st) => approvals.statuses.filter((s) => s.status === st).length;
    const parts = [`${approvals.statuses.length} governed artifact${approvals.statuses.length === 1 ? "" : "s"}`];
    if (count("approved")) parts.push(`${count("approved")} signed`);
    if (count("changed-since-approval")) parts.push(`<span class="status-drift">${count("changed-since-approval")} drifted</span>`);
    if (count("reopened")) parts.push(`<span class="status-reopen">${count("reopened")} reopened</span>`);
    if (count("unreviewed")) parts.push(`${count("unreviewed")} unsigned`);
    approvalsStatus = parts.join(" &middot; ");
  }

  const commentsStatus = comments.available
    ? `${openCommentCount} open &middot; ${comments.comments.length - openCommentCount} resolved`
    : "comments ledger not available in this project";

  // Rail + sections share one order: the genesis definition order (§2), with
  // the cross-cutting ledgers (Approvals, Comments) after the artifact pages.
  // Screens stays the DEFAULT page — the daily hot-reload surface.
  const railItems = [
    // §3.0: Intent is genesis order 0 — the root artifact everything else is
    // expressed in — so it leads the rail. The rest follows the REVISED
    // definition order (spec-first behavior, UI-first visuals): architecture,
    // then the exemplar's surfaces (Specs, Screens), then the design system
    // and components — which lock on / are distilled from those screens.
    { id: "intent", label: "Intent", glyph: statusGlyph(intentRecord) },
    { id: "architecture", label: "Architecture", glyph: statusGlyph(archRecord) },
    { id: "specs", label: "Specs", glyph: null },
    { id: "screens", label: "Screens", glyph: null, active: true },
    { id: "design-system", label: "Design language", glyph: statusGlyph(dsRecord) },
    { id: "components", label: "Components", glyph: statusGlyph(componentsRecord) },
    // §3.6: the Evidence item's glyph derives from the latest receipt itself
    // (✓ fresh PASS · ✗ FAIL · ⚠ stale · ○ none) — receiptGlyph, the same
    // derivation the rail foot uses.
    { id: "evidence", label: "Evidence", glyph: receiptGlyph(effectiveReceipt) },
    // A2: the walkthrough report is evidence-adjacent — derived from committed
    // manifests, so it sits right after Evidence in the arc.
    { id: "walkthrough", label: "Walkthrough", glyph: null },
    { id: "approvals", label: "Approvals", glyph: null },
    {
      id: "comments",
      label: "Comments",
      glyph: null,
      badgeHtml: `<span class="tab-badge" id="comments-badge"${openCommentCount === 0 ? " hidden" : ""}>${openCommentCount}</span>`,
    },
    // B4: the returning human's first read — everything since they last looked.
    { id: "digest", label: "Digest", glyph: null },
    // A1: the console arc ends DRIVE — Live device is deliberately the final
    // section: define → preview → approve → verify → report → drive. The glyph
    // follows statusGlyph's {ch, cls, label} shape (a bare string renders as
    // "undefined" — the rail template reads g.ch/g.cls).
    {
      id: "live-device",
      label: "Live device",
      glyph: liveDevice && liveDevice.reachable ? { ch: "●", cls: "glyph-signed", label: "device connected" } : null,
    },
  ];

  const sections = [
    {
      id: "intent",
      title: "Intent",
      statusHtml: intentStatus,
      bodyHtml: intentBodyHtml(intent),
    },
    {
      id: "architecture",
      title: "Architecture",
      statusHtml: archStatus,
      bodyHtml: architectureTabHtml(architecture, architectureMeta),
    },
    // §3.5: the RTM's last-receipt column reads the same receipt as Evidence.
    { id: "specs", title: "Specs", statusHtml: specsStatus, bodyHtml: specsTabHtml(specs, { lastReceipt: effectiveReceipt }) },
    {
      id: "screens",
      title: "Screens",
      statusHtml: screensStatus,
      headExtraHtml: `<div class="screens-toolbar"><input id="filter" type="search" placeholder="filter screens&hellip;"></div>`,
      bodyHtml: screensBody,
      active: true,
      fullBleed: true,
    },
    {
      id: "design-system",
      title: "Design language",
      statusHtml: dsStatus,
      bodyHtml: designLanguageBodyHtml(designSystem, {
        usage: tokenUsage,
        variants,
        artifactStatus: designSystemStatus,
      }),
    },
    {
      id: "components",
      title: "Components",
      statusHtml: componentsStatus,
      // §3.3 story pickup: the section gets the current render's story cards
      // plus the changed-attribution vocabulary the Screens grid uses
      // (version cache-buster, persistent changed-#N chips). componentStories
      // is derived here when the caller didn't pass one, so a bare
      // galleryHtml({cards}) still shows story renders.
      bodyHtml: componentsBodyHtml(components, {
        componentStories: componentStoryCards(cards),
        ...componentsMeta,
        version,
        changedVersions,
      }),
    },
    { id: "evidence", title: "Evidence", statusHtml: evidenceStatus, bodyHtml: evidenceBodyHtml(effectiveReceipt, receiptHistory) },
    {
      id: "walkthrough",
      title: "Walkthrough",
      statusHtml: walkthrough.available
        ? `<span class="status-line">latest run ${walkthrough.runs[0].generatedAt}</span>`
        : `<span class="status-line">no runs yet</span>`,
      bodyHtml: walkthroughTabHtml(walkthrough),
    },
    { id: "approvals", title: "Approvals", statusHtml: approvalsStatus, bodyHtml: approvalsTabHtml(approvals, { anchoredDiffs }) },
    { id: "comments", title: "Comments", statusHtml: commentsStatus, bodyHtml: commentsTabHtml(comments) },
    {
      id: "digest",
      title: "Digest",
      statusHtml: `<span class="status-line">since you last looked</span>`,
      bodyHtml: digestTabHtml(digest),
    },
    {
      id: "live-device",
      title: "Live device",
      statusHtml:
        liveDevice && liveDevice.reachable
          ? `<span class="status-line">connected — ${liveDevice.appId}</span>`
          : `<span class="status-line">not connected</span>`,
      bodyHtml: liveDeviceTabHtml(liveDevice, liveSession),
      fullBleed: true,
    },
  ];

  const bodyScript = `
  const pill = document.getElementById("pill");
  // §2: the rail glyphs and page-status lines are drift surfaces — they must
  // track approval/comment changes without a full reload (the same no-flash
  // rule the panel swaps follow). Buttons and inputs are never replaced, so
  // their listeners survive: only glyph spans and status-line innerHTML move.
  function syncShellFromDoc(doc) {
    doc.querySelectorAll(".rail-nav .tab-btn").forEach((freshBtn) => {
      const curGlyph = document.querySelector('.rail-nav .tab-btn[data-tab="' + freshBtn.dataset.tab + '"] .glyph');
      const freshGlyph = freshBtn.querySelector(".glyph");
      if (curGlyph && freshGlyph) {
        curGlyph.className = freshGlyph.className;
        curGlyph.textContent = freshGlyph.textContent;
        curGlyph.title = freshGlyph.title || "";
      }
    });
    doc.querySelectorAll(".tab-panel").forEach((freshPanel) => {
      const curStatus = document.querySelector('.tab-panel[data-tab="' + freshPanel.dataset.tab + '"] .page-status');
      const freshStatus = freshPanel.querySelector(".page-status");
      if (curStatus && freshStatus) curStatus.innerHTML = freshStatus.innerHTML;
    });
  }
  const es = new EventSource("/events");
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "rendering") { pill.textContent = "rendering…"; pill.className = "rendering"; }
    if (msg.type === "render") location.reload();
    // Approvals refresh IN PLACE (no location.reload()): a full reload on every
    // approval flashes the page, drops scroll, and blanks assistive/agent views
    // of the document mid-navigation — an approval only changes the Approvals
    // tab's markup, so swap exactly that panel from a re-fetched page.
    if (msg.type === "approval") {
      fetch("/").then((r) => r.text()).then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const fresh = doc.querySelector("#tab-approvals");
        const cur = document.querySelector("#tab-approvals");
        if (fresh && cur) {
          const wasActive = cur.classList.contains("active");
          cur.innerHTML = fresh.innerHTML;
          if (wasActive) cur.classList.add("active");
          wireApproveButtons(cur);
          wireReopenButtons(cur);
          syncShellFromDoc(doc);
        } else {
          location.reload(); // fallback: unexpected markup — the old behavior
        }
      }).catch(() => location.reload());
    }
    // Comments refresh IN PLACE too (§7.3, same VL-6 pattern as approvals):
    // one SSE event covers BOTH a new comment (POST /api/comment, console)
    // and a resolution (resolve_comment, agent) — either way, only the
    // Comments tab's markup and the tab-bar open-count badge changed.
    if (msg.type === "comment") {
      fetch("/").then((r) => r.text()).then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const freshPanel = doc.querySelector("#tab-comments");
        const curPanel = document.querySelector("#tab-comments");
        if (freshPanel && curPanel) {
          const wasActive = curPanel.classList.contains("active");
          curPanel.innerHTML = freshPanel.innerHTML;
          if (wasActive) curPanel.classList.add("active");
        } else {
          location.reload();
          return;
        }
        const freshBadge = doc.querySelector("#comments-badge");
        const curBadge = document.querySelector("#comments-badge");
        if (freshBadge && curBadge) {
          curBadge.textContent = freshBadge.textContent;
          curBadge.hidden = freshBadge.hidden;
        }
        syncShellFromDoc(doc);
      }).catch(() => location.reload());
    }
    if (msg.type === "error") {
      pill.textContent = msg.source === "compile" ? "compile failed" : "render failed";
      pill.className = "error";
    }
  };
  es.onerror = () => { pill.textContent = "disconnected"; pill.className = "error"; };
  // Screen filter — survives the SSE-triggered reloads via sessionStorage.
  // §3.4: it filters matrix ROWS (one row per screen, states stay together).
  const filter = document.getElementById("filter");
  filter.value = sessionStorage.getItem("previewFilter") || "";
  const applyFilter = () => {
    const q = filter.value.trim().toLowerCase();
    sessionStorage.setItem("previewFilter", q);
    document.querySelectorAll(".matrix-row").forEach((c) => {
      c.style.display = !q || c.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };
  filter.addEventListener("input", applyFilter);
  applyFilter();
  // Tabs — deep-linkable via location.hash (#approvals bookmarks/shares the tab,
  // and automation can land on any tab by URL), with sessionStorage as the
  // fallback so SSE-triggered reloads keep the tab even without a hash.
  const tabBtns = [...document.querySelectorAll(".tab-btn")];
  const panels = [...document.querySelectorAll(".tab-panel")];
  const validTab = (t) => tabBtns.some((b) => b.dataset.tab === t);
  function showTab(tab) {
    sessionStorage.setItem("previewTab", tab);
    if (("#" + tab) !== location.hash) history.replaceState(null, "", "#" + tab);
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle("active", p.dataset.tab === tab));
  }
  tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  window.addEventListener("hashchange", () => {
    const t = location.hash.slice(1);
    if (validTab(t)) showTab(t);
  });
  const fromHash = location.hash.slice(1);
  showTab(validTab(fromHash) ? fromHash : (sessionStorage.getItem("previewTab") || "screens"));
  // Approvals — POST /api/approve; a successful approve is confirmed by the
  // server's SSE "approval" broadcast above (which swaps the Approvals panel
  // in place), not by this handler mutating state itself — the two never race.
  // Wiring lives in a function because the SSE swap replaces the panel's DOM
  // and must re-attach these listeners to the fresh buttons.
  function wireApproveButtons(scope) {
  scope.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const artifact = btn.dataset.artifact;
      const errBox = document.getElementById("approve-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Approving…";
      try {
        const res = await fetch("/api/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifact }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "approval refused"; }
          btn.disabled = false;
          btn.textContent = original;
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wireApproveButtons(document);
  // Reopen (§2/§3) — POST /api/reopen; confirmed the same way approve is: the
  // server's SSE "approval" broadcast (reopen reuses that event type — it's
  // still just "an artifact's status changed", the same in-place refresh
  // covers both) swaps the Approvals panel, not this handler. An older
  // project lib without reopenArtifact surfaces its refusal in #approve-error
  // — never a crash (GENESIS-FLOW-DESIGN.md §3 "honest degrade").
  function wireReopenButtons(scope) {
  scope.querySelectorAll(".reopen-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const artifact = btn.dataset.artifact;
      const errBox = document.getElementById("approve-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Reopening…";
      try {
        const res = await fetch("/api/reopen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifact }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "reopen refused"; }
          btn.disabled = false;
          btn.textContent = original;
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wireReopenButtons(document);
  // Pick (§2 candidates strip) — POSTs the EXISTING /api/comment endpoint with
  // target {type:"design-system", token:"variant:<name>"}, text "pick:<name>"
  // — no new decision machinery; the agent observes it via
  // review_comments{waitForComment}. The token field is REQUIRED by the §7.3
  // comments contract for design-system targets (the gate proved the library
  // refuses a token-less pick with 409); "variant:<name>" is the synthetic
  // token id for a candidate, mirroring the "component:<Name>" convention. A
  // successful pick is confirmed by the same "comment" SSE broadcast every
  // other comment produces (refreshes the Comments tab + badge); this handler
  // just gives immediate button feedback so the human isn't left guessing.
  function wirePickButtons(scope) {
  scope.querySelectorAll(".pick-btn").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const name = btn.dataset.variant;
      const errBox = document.getElementById("pick-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Picking…";
      try {
        const res = await fetch("/api/comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: { type: "design-system", token: "variant:" + name }, text: "pick:" + name }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "pick refused"; }
          btn.disabled = false;
          btn.textContent = original;
        } else {
          btn.textContent = "Picked";
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wirePickButtons(document);
  // Comments (§7.3) — every 💬 control (screens, spec clauses, tokens,
  // components, architecture nodes) opens the same inline popover and POSTs
  // to /api/comment; a successful post is confirmed by the server's SSE
  // "comment" broadcast (which refreshes the Comments tab + badge in place),
  // not by this handler — same non-racing split as wireApproveButtons.
  // dataset.wired guards against double-binding across repeated calls
  // (initial load + no-op re-scans of the same, never-swapped card markup).
  function wireCommentButtons(scope) {
    scope.querySelectorAll(".comment-ctl").forEach((ctl) => {
      const btn = ctl.querySelector(".comment-btn");
      const pop = ctl.querySelector(".comment-popover");
      if (!btn || !pop || btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", () => { pop.hidden = !pop.hidden; });
      const cancelBtn = pop.querySelector(".comment-cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", () => { pop.hidden = true; });
      const submitBtn = pop.querySelector(".comment-submit");
      if (submitBtn) submitBtn.addEventListener("click", async () => {
        const textEl = pop.querySelector(".comment-text");
        const ttEl = pop.querySelector(".comment-testtag");
        const errEl = pop.querySelector(".comment-error");
        if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
        let target;
        try { target = JSON.parse(ctl.dataset.target); } catch { target = { type: "general" }; }
        if (ttEl && ttEl.value.trim()) target = { type: "element", screen: target.screen, testTag: ttEl.value.trim() };
        submitBtn.disabled = true;
        try {
          const res = await fetch("/api/comment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target, text: textEl ? textEl.value : "" }),
          });
          const body = await res.json();
          if (!body.ok) {
            if (errEl) { errEl.hidden = false; errEl.textContent = body.reason || "comment refused"; }
          } else {
            pop.hidden = true;
            if (textEl) textEl.value = "";
            if (ttEl) ttEl.value = "";
          }
        } catch (err) {
          if (errEl) { errEl.hidden = false; errEl.textContent = String(err); }
        } finally {
          submitBtn.disabled = false;
        }
      });
    });
  }
  wireCommentButtons(document);
  // A1 — the Start-live-session chain: POST kicks it off server-side; the page
  // then polls /live/status and reloads when the chain finishes (success or
  // fail — either way the section re-renders the honest per-step outcomes).
  const liveBtn = document.getElementById("live-start-btn");
  if (liveBtn) {
    liveBtn.addEventListener("click", async () => {
      const errBox = document.getElementById("live-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      liveBtn.disabled = true;
      liveBtn.textContent = "Starting…";
      try {
        const res = await fetch("/live/start", { method: "POST" });
        const body = await res.json();
        if (!body.started) throw new Error(body.reason || "did not start");
        const poll = setInterval(async () => {
          try {
            const st = await (await fetch("/live/status")).json();
            if (!st.running) { clearInterval(poll); location.reload(); }
          } catch { /* transient poll failure — keep polling */ }
        }, 2000);
      } catch (err) {
        liveBtn.disabled = false;
        liveBtn.textContent = "Start live session";
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
      }
    });
  }
`;

  return renderShellPage({
    appName,
    railItems,
    // §3.6: the rail-foot verify line doubles as the deep link to Evidence —
    // the same .tab-btn/data-tab wiring the nav items use (showTab picks it
    // up with no new JS mechanism), styled back to a quiet meta line by the
    // shell's .rail-foot .tab-btn rules.
    railFootHtml: `<button type="button" class="tab-btn" data-tab="evidence" title="open Evidence">${railReceiptHtml(effectiveReceipt)}</button>`,
    sections,
    error,
    // §3.4 geometry from the render viewport: uniform cell width keeps the
    // matrix's columns aligned without a shared grid; the expanded wireframe
    // gets the roomier single-pane width.
    extraCss: `  .matrix-cell img, .matrix-cell.matrix-none { width: ${Math.round(width * 0.38)}px; }
  .matrix-col { width: ${Math.round(width * 0.38)}px; }
  .row-detail .wire svg { width: ${Math.round(width * 0.7)}px; }
  /* PW-5 surfaces: walkthrough grid, live-device embed, digest lists, B5 diff */
  .wt-grid { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; }
  .wt-card { width: 210px; }
  .wt-card img { width: 100%; border-radius: 8px; border: 1px solid var(--line); }
  .wt-meta { font-size: var(--fs-meta); color: var(--muted); margin-top: 4px; }
  .wt-notwalked li, .wt-history li, .digest-list li { font-size: var(--fs-meta); color: var(--muted); margin: 3px 0; }
  .ok-inline { color: var(--ok, #7dc87d); }
  .bad-inline { color: var(--err, #d07d7d); }
  .live-remote { width: 100%; height: 72vh; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
  .live-steps li { font-size: var(--fs-meta); margin: 3px 0; }
  .live-step-ok { color: var(--ok, #7dc87d); }
  .live-step-fail { color: var(--err, #d07d7d); }
  .live-step-running { color: var(--muted); }
  #live-start-btn { font: inherit; font-size: var(--fs-meta); font-weight: 600; padding: 8px 16px; cursor: pointer; }
  .approval-diff { max-height: 420px; overflow: auto; font-size: 12px; background: var(--surface); border-radius: 8px; padding: 10px; }
  .approval-diff-row td { border-top: none; }`,
    bodyScript,
    provenance: { treeHash, version },
  });
}

// --- the service --------------------------------------------------------------------

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
    ((dir) =>
      withKspSelfHeal(dir, log, () =>
        execFileAsync(
          "./gradlew",
          [":composeApp:renderScreens", "-q", "--console=plain"],
          { cwd: dir, timeout: 600000, maxBuffer: 16 * 1024 * 1024, env: gradleEnv() },
        ),
      ));
  const runCompileCheck =
    opts.runCompileCheck ||
    ((dir) =>
      withKspSelfHeal(dir, log, () =>
        execFileAsync(
          "./gradlew",
          [":composeApp:compileKotlinDesktop", "-q", "--console=plain"],
          { cwd: dir, timeout: 300000, maxBuffer: 16 * 1024 * 1024, env: gradleEnv() },
        ),
      ));
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
  let viewport = null;
  const sseClients = new Set();

  function touch(what) {
    lastActivity = { what, at: new Date().toISOString() };
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

  /** Design System tab data: previews-dir catalog first, else a best-effort live fetch. */
  async function getDesignSystemData() {
    const catalogPath = path.join(previewsDir, "design-system.json");
    if (fs.existsSync(catalogPath)) {
      try {
        return { available: true, source: "previews", catalog: JSON.parse(fs.readFileSync(catalogPath, "utf8")) };
      } catch (err) {
        log(`design-system.json at ${catalogPath} is not valid JSON (${err.message}) — trying a live session`);
      }
    }
    try {
      const catalog = await fetchLiveCatalog({ timeoutMs: 800 });
      return { available: true, source: "live", catalog };
    } catch {
      return { available: false };
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

  /** Reload previews dir into cards + tree map. Throws if the dir/manifest is missing. */
  function loadPreviews() {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(previewsDir, "manifest.json"), "utf8"),
    );
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
    child.stdout?.on("data", noteDaemonOutput);
    child.stderr?.on("data", noteDaemonOutput);
    child.on?.("exit", (code) => {
      log(`daemon gradle client exited (${code})`);
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
    if (rendering) {
      renderQueued = true;
      return;
    }
    // Coexistence defense 1: a verify lane holds the project — defer instead of
    // colliding on kspCaches. The render is not lost; it re-schedules until the
    // marker clears (or goes stale), then runs.
    if (laneInProgress(projectDir)) {
      touch("lane-defer");
      log("verify lane in progress — deferring render until it finishes");
      scheduleRender(LANE_POLL_MS);
      return;
    }
    rendering = true;
    touch("render-start");
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
      lastError = err && err.message ? err.message : String(err);
      lastErrorSource = "render";
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

  function scheduleRender(delayMs = DEBOUNCE_MS) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void renderCycle(), delayMs);
  }

  const IGNORE = /(^|[\\/])(build|\.gradle|\.idea|\.DS_Store)([\\/]|$)/;

  function startWatching() {
    try {
      watcher = fs.watch(srcDir, { recursive: true }, (_event, filename) => {
        if (filename && IGNORE.test(filename)) return;
        touch("src-change");
        noteSrcChange(); // daemon mode: mark swap-pending + arm the compile watchdog
        // Daemon mode: the hot agent recompiles on save and the classes watcher fires
        // once fresh classes land — rendering now would race it with stale code.
        if (mode === "daemon" && classesWatcher) return;
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
          noteSrcChange();
          scheduleRender();
        }
      }, POLL_FALLBACK_MS);
      log(`watching ${srcDir} (poll fallback)`);
    }
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
        const specs = getSpecsData(projectDir);
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
        const [liveDevice, digest] = await Promise.all([
          getLiveDeviceStatus({ port: inspectorPort }),
          getDigestData(projectDir, { execFileAsync }),
        ]);
        const anchoredDiffs = {};
        if (approvals.available) {
          for (const s of approvals.statuses) {
            if (s.status !== "changed-since-approval") continue;
            anchoredDiffs[s.id] = await getApprovalAnchoredDiff(projectDir, s.id, { execFileAsync }).catch(
              (err) => ({ available: false, reason: err.message })
            );
          }
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          galleryHtml({
            appName,
            viewport,
            cards,
            version,
            changed: lastChanged,
            changedVersions: Object.fromEntries(changedAt),
            error: lastError,
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
            tokenUsage,
            intent,
            walkthrough,
            liveDevice,
            liveSession: liveSession.status(),
            digest,
            anchoredDiffs,
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
        res.write(`data: ${JSON.stringify({ type: "hello", version })}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }
      if (url.pathname === "/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(status(), null, 2));
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
        const result = await approveArtifactViaLib(projectDir, artifact);
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("approval");
          broadcast({ type: "approval", artifact });
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
        const result = await reopenArtifactViaLib(projectDir, artifact);
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("reopen");
          // Reuses the "approval" SSE event type on purpose (design doc §3: "SSE
          // `approval` event — existing in-place refresh covers the panel") — the
          // client's approval-swap handler doesn't care WHICH transition fired,
          // only that the Approvals panel needs a re-fetch.
          broadcast({ type: "approval", artifact });
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

  function status() {
    return {
      projectDir,
      url: port ? `http://127.0.0.1:${port}/` : null,
      previewsDir,
      mode,
      daemon: { url: daemonUrl, active: mode === "daemon" },
      version,
      rendering,
      lastError,
      lastErrorSource,
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

  return {
    /** Initial render (unless fresh previews already exist), then serve + watch. */
    async start() {
      if (!fs.existsSync(path.join(projectDir, "composeApp"))) {
        throw new Error(
          `'${projectDir}' does not look like a create-cmp app (no composeApp/).`,
        );
      }
      if (fs.existsSync(path.join(previewsDir, "manifest.json"))) {
        // Serve what's on disk immediately; a fresh render still runs right after,
        // so the human sees SOMETHING at once and current state seconds later.
        loadPreviews();
      }
      await listen(opts.port || DEFAULT_PORT);
      startWatching();
      void renderCycle();
      if (hot) void ensureDaemon();
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
      // Best-effort daemon teardown: ask the JVM to exit, then kill the gradle client.
      fetch(`${daemonUrl}/shutdown`, { signal: AbortSignal.timeout(1500) }).catch(() => {});
      if (daemonChild) daemonChild.kill("SIGTERM");
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
    /** Test seam: feed daemon-child output through the compile-failure scanner. */
    _noteDaemonOutput: noteDaemonOutput,
    /** Test seam: simulate a source-change event (swap-pending + watchdog arming). */
    _noteSrcChange: noteSrcChange,
  };
}
