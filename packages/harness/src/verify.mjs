#!/usr/bin/env node
// The verify lane — this project's single verification gate.
//
//   node qa/verify.mjs [--profile smoke|scaffold|local|ci|nightly|release] [--fast] [--json]
//
// Runs every verification step this project carries, aggregates a typed
// PASS/FAIL verdict, and writes the evidence receipt to qa/evidence/latest.json.
// `--fast` is the INNER LOOP: the resolved profile minus the device/release
// tier, with unchanged pure-Node steps reused from the step cache (CACHED)
// and unit tests scoped to the working-tree change — its receipt records
// mode "fast" and can never satisfy the done-gate.
// The receipt is COMMITTED with your change (see CLAUDE.md — a change is not
// done without it). Binary artifacts under qa-artifacts/ are never committed;
// the receipt references them by path + sha256.
//
// Verdicts per step: PASS | FAIL | SKIP | ERROR (could not run — a deadline, zero
// tests, a throw; never an accusation, never evidence). The lane verdict is PASS iff no step
// FAILed. SKIPs are recorded with reasons — green-with-gaps is visible, never
// silent. Exit code: 0 = PASS, 1 = FAIL.
//
// Profiles:
//   scaffold — spec coverage + build + unit tests (what `create-cmp --verify` proves at stamp time)
//   local    — everything; device-dependent steps SKIP when no device is attached
//   ci       — everything; SKIPs are recorded so the pipeline stays honest
//   release  — everything ci proves PLUS the release-APK smoke (releaseSmoke): the
//              ship-time profile, run before cutting a release, never per-change

import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash, undeclaredTopLevel } from "./lib/inputs-hash.mjs";
import { evidenceLevel } from "./lib/evidence-level.mjs";
import { updateReadmeBadge, README_REL_PATH } from "./lib/evidence-badge.mjs";
import { appendFlightRecord, buildFlightEntry, neverRunTiers, readFlightJournal } from "./lib/flight-recorder.mjs";
import { StepTimeout, spawnTimedOut } from "./lib/step-outcomes.mjs";
import { expectedDurations, runLane, stepDisplayName } from "./lib/lane-runner.mjs";
import { resolveHarnessManifest } from "./lib/harness-manifest.mjs";
import { loadProfile, loadProfileSync } from "./lib/profile-loader.mjs";
import { laneMarkerPath } from "./lib/lane-markers.mjs";
import { checkHarnessIntegrity, describeIntegrity, LOCK_PATH } from "./lib/harness-lock.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const EVIDENCE_DIR = path.join(ROOT, "qa", "evidence");
const ARTIFACTS_DIR = path.join(ROOT, "qa-artifacts");

// ── Argument parsing — strict, and first thing this file does ──────────────
// An unrecognized flag used to fall through silently and start the full
// multi-minute lane (`--help` ran the whole lane for ~2 minutes before being
// killed). Same refusal-over-fabrication stance as qa/approve.mjs, which
// refuses an unknown artifact by name rather than guessing: an unknown
// argument here is refused by name, not swallowed into "run everything".
const USAGE = `node qa/verify.mjs [--profile smoke|scaffold|local|ci|nightly|release] [--fast] [--json] [--help]

The verify lane — this project's single verification gate. Runs every
verification step this project carries, aggregates a typed PASS/FAIL
verdict, and writes the evidence receipt to qa/evidence/latest.json (commit
it with your change — see CLAUDE.md). Exit code: 0 = PASS, 1 = FAIL.

Flags:
  --profile <smoke|scaffold|local|ci|nightly|release>
                                 which step set to run (default: local)
  --fast                         INNER LOOP ONLY — run the resolved profile
                                  minus this pack's expensive tier (named
                                  under "This project" below), unconditionally,
                                  device attached or not. Also reuses the
                                  pure-Node steps' last PASS when their inputs
                                  are unchanged (verdict CACHED), and lets the
                                  pack scope its own build and test steps to
                                  the working-tree change. The
                                  receipt records mode "fast", derives no
                                  evidence rung, and can NEVER satisfy the
                                  done-gate — run the full lane once before
                                  you call it done
  --determinism                  run the timezone determinism probe: the
                                  pack's host test tier executes TWICE, under
                                  TZ=Etc/GMT+12 (UTC-12) and TZ=Etc/GMT-14
                                  (UTC+14), and the probe FAILs naming every
                                  test whose verdict or failure output
                                  differs — a nondeterminism leak ARCH-13's
                                  static net missed. Bare (no --profile) it
                                  runs JUST the probe and writes no receipt;
                                  with --profile ci (or release) it runs
                                  inside the lane and lands on the receipt.
                                  Never combinable with --fast
  --no-journal                   skip the qa/flight-recorder.jsonl append.
                                  qa/watch.mjs passes this on every
                                  save-triggered run: journalling each save
                                  would add hundreds of committed lines a day
                                  and leave a permanently dirty tree inside
                                  the loop the recorder exists to observe. The
                                  gap is disclosed in the retrospective's own
                                  output
  --json                         print the receipt as JSON instead of the
                                  human-readable step-by-step log
  --help, -h                     print this usage and exit 0 without
                                  running anything

Profiles:
  smoke     the smallest end-to-end lane: every pure-Node gate through the real
            runner, receipt and journal — no build tool, no device. Seconds. Proves the
            FRAMEWORK returns, both ways; never the change (its receipt is refused
            as done-evidence). Driven by qa/framework-check.mjs.
  scaffold  spec coverage + build + unit tests (what a stamp-time verify proves)
  local     everything; device-dependent steps SKIP when no device is
            attached
  ci        everything; SKIPs are recorded so the pipeline stays honest
  nightly   everything ci proves with the determinism probe FORCED ON (it doubles
            the host test tier — the budget a scheduled run has and a per-change run
            does not). Proves the HARNESS, not a change: its receipt is refused as
            done-evidence by qa/receipt-check.mjs. Schedule it; never wait on it.
  release   everything ci proves PLUS the pack's ship-time step; run it before
            cutting a release, never per-change
`;

/**
 * What THIS project's lane actually runs, appended to the neutral usage above.
 *
 * The help text used to enumerate a Compose app's step names — releaseBuild,
 * tokenDrift, e2eSmoke, androidChecks — so `--help` in any other repo
 * described a lane that repo does not have. The step names belong to the pack,
 * so they are read from it. A project with no usable manifest still gets full
 * help plus the one line that says why the rest is missing: `--help` must
 * never refuse, and must never invent a lane either.
 * @param {string} root
 * @returns {string}
 */
function projectSection(root) {
  const manifest = resolveHarnessManifest(root);
  if (!manifest.ok) return `\nThis project:\n  ${manifest.reason}\n`;
  const loaded = loadProfileSync(root, manifest.manifest.profile);
  if (!loaded.ok) return `\nThis project:\n  ${loaded.reason}\n`;
  let pack;
  try {
    pack = loaded.profile.steps({
      ROOT: root, HERE: path.join(root, "qa"), fast: false, determinism: false, profile: "local", mode: "full",
      sh: () => ({ ok: true, out: "" }), tryGit: () => null, tryGitLines: () => [], DEGRADED_PATHS: [],
    });
  } catch (err) {
    return `\nThis project:\n  profile "${loaded.profile.id}" could not describe its steps: ${err && err.message ? err.message : String(err)}\n`;
  }
  const names = (fns) => (Array.isArray(fns) ? fns.map((fn) => stepDisplayName(fn)).filter(Boolean) : []);
  const lines = [`\nThis project (profile "${loaded.profile.id}"):`];
  for (const [name, fns] of Object.entries(pack.stepsForProfile ?? {})) {
    const list = names(fns);
    if (list.length) lines.push(`  ${name.padEnd(9)} ${list.join(", ")}`);
  }
  const excluded = Array.isArray(pack.FAST_EXCLUDED_NAMES) ? pack.FAST_EXCLUDED_NAMES : [];
  if (excluded.length) lines.push(`  --fast omits: ${excluded.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

const rawArgs = process.argv.slice(2);

if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  console.log(USAGE + projectSection(ROOT));
  process.exit(0);
}

// Every flag this file CONSUMES must be listed here, or the strict check below
// rejects it. `--no-journal` was consumed but unlisted in 0.13.0, which meant
// qa/watch.mjs — whose spawn passes exactly these flags — exited 2 on every
// save without ever running the lane. test/verify-flags.test.mjs now pins
// consumed ⊆ recognized and watch's spawn ⊆ recognized so the class cannot
// recur.
const RECOGNIZED_FLAGS = new Set(["--profile", "--json", "--fast", "--determinism", "--no-journal"]);
for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];
  if (arg === "--profile") {
    i += 1; // consume its value (missing/invalid value keeps the existing exit-2 behavior below)
    continue;
  }
  if (RECOGNIZED_FLAGS.has(arg)) continue;
  console.error(`unknown argument "${arg}" — run node qa/verify.mjs --help`);
  process.exit(2);
}

const args = rawArgs;
const profile = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : "local";
const asJson = args.includes("--json");
const fast = args.includes("--fast");
// --no-journal suppresses the flight-recorder append (qa/watch.mjs passes it).
// See the append site below for why the inner loop must not write here.
const noJournal = args.includes("--no-journal");
const mode = fast ? "fast" : "full";

// ── --determinism: the timezone double-run probe (roadmap §10 item 8) ───────
// Refusals up front, by name (same stance as unknown arguments above):
//  - never with --fast: the probe deliberately runs the JVM test tier twice,
//    and --fast is the inner loop that exists to not pay such costs — the
//    combination is a contradiction, so it is refused rather than silently
//    resolved either way.
//  - only the ci profile (and release, which inherits ci) carries the probe's
//    lane row; asking for it in local/scaffold is refused with the two ways
//    that DO work, instead of silently running a step the requested profile
//    does not own.
// evidence-economics S6: the nightly stage carries the probe unconditionally —
// a scheduled run is exactly where a deliberate double-run belongs.
const determinism = args.includes("--determinism") || profile === "nightly";
const profileExplicit = args.includes("--profile");
if (determinism && fast) {
  console.error(
    "--determinism cannot be combined with --fast: the probe runs the JVM test tier twice by design, and --fast is the inner loop. Run it alone (node qa/verify.mjs --determinism) or inside a full ci/release lane (--profile ci --determinism).",
  );
  process.exit(2);
}
if (determinism && profileExplicit && profile !== "ci" && profile !== "release") {
  console.error(
    `--determinism belongs to the ci profile (release inherits it), not "${profile}" — run --profile ci --determinism, or bare --determinism to run the probe alone.`,
  );
  process.exit(2);
}

// `--rerun` (evidence integrity: no build cache replaying a PASS from a
// different tree) is the pack's to apply — it knows its build tool. The pack
// reads `fast` from ctx and scopes the flag to FULL mode itself.

// The running step's deadline (evidence-economics S4). Set by the step loop
// before each step from the journal's measured duration for it; every
// subprocess the step spawns inherits it. A step with no deadline is a hang
// waiting to happen: androidChecks sat at 0.5% CPU waiting on a device with
// no bound at all, and the only signal was silence. Module-level because the
// lane is sequential and single-threaded — one step runs at a time.
let CURRENT_STEP_DEADLINE_MS = 30 * 60_000;

function sh(cmd, opts = {}) {
  const started = Date.now();
  // maxBuffer: a build tool's first-run output easily exceeds spawnSync's 1MB
  // default, which would surface as a bogus FAIL (status null / ENOBUFS).
  const res = spawnSync(cmd, {
    shell: true,
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: CURRENT_STEP_DEADLINE_MS,
    killSignal: "SIGTERM",
    ...opts,
  });
  // A deadline is not a failure of the thing under test — it is a failure to
  // test. Thrown, so the step loop records ERROR instead of the step reading
  // a null exit status as "the behaviour is broken".
  if (spawnTimedOut(res)) throw new StepTimeout(cmd, opts.timeout ?? CURRENT_STEP_DEADLINE_MS);
  const ok = res.status === 0 && !res.error;
  return { ok, status: res.status, error: res.error?.message, out: `${res.stdout ?? ""}${res.stderr ?? ""}`, durationMs: Date.now() - started };
}

// ── The lane marker ─────────────────────────────────────────────────────────
// Stamped for the run's duration and rewritten at every step start (the
// narration the narrator, the watcher, the Stop hook and the chain view read).
// Core state, under qa/, beside the agent hold — qa/lib/lane-markers.mjs.
// Coexistence with the eyes' own builds (the render marker, the KSP self-heal)
// is the pack's: it knows its build tool and its build directory.
const LANE_MARKER = laneMarkerPath(ROOT);

// Degraded-path activations observed during this run — self-heals and
// fallbacks that kept the lane moving without failing it. Collected for the
// flight recorder (qa/lib/flight-recorder.mjs): a degradation that fires
// once is a shrug, one that fires every run for a month is the tooling
// quietly rotting under a green lane — and only a journal can tell those
// two apart.
const DEGRADED_PATHS = [];

function tryGit(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/**
 * Line-oriented git output, WITHOUT [tryGit]'s trim. `git status --porcelain`
 * has significant leading whitespace: an unstaged modification is `" M path"`,
 * so trimming the whole blob eats the first line's leading space — and a fixed
 * `slice(3)` then swallows that path's first character. The receipt would name
 * a file that does not exist. Only trailing newlines are dropped here.
 */
function tryGitLines(cmd) {
  try {
    const out = execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.replace(/\n+$/, "").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ── The stack profile (qa/harness-manifest.json → qa/lib/profiles/<id>/) ─────
// Every step this lane runs comes from the profile the MANIFEST names, loaded
// by id — never imported by name. This runner does not know what Compose is;
// it knows the shape of a profile (qa/lib/profile-loader.mjs) and asks the
// project which one it uses. No manifest, no profile, no lane: there is no
// default, and each refusal names the command that fixes it. Refused before a
// single step runs, on the same exit code as an unknown argument — the lane
// was asked to do something it cannot honestly do.
const manifest = resolveHarnessManifest(ROOT);
if (!manifest.ok) {
  console.error(manifest.reason);
  process.exit(2);
}
const loaded = await loadProfile(ROOT, manifest.manifest.profile);
if (!loaded.ok) {
  console.error(loaded.reason);
  process.exit(2);
}
const pack = loaded.profile.steps({ ROOT, HERE, fast, determinism, profile, mode, sh, tryGit, tryGitLines, DEGRADED_PATHS });
const { stepsForProfile, DEVICE_STEPS, FAST_EXCLUDED_NAMES, STEP_FN_BY_NAME } = pack;


if (!stepsForProfile[profile]) {
  console.error(`Unknown profile "${profile}" — use smoke | scaffold | local | ci | nightly | release.`);
  process.exit(2);
}

// ── Bare --determinism: the probe, nothing else, and NO receipt ─────────────
// "Run it alone" means alone: no other steps, and deliberately no
// qa/evidence/latest.json. The done-gate (qa/receipt-check.mjs) validates a
// receipt by verdict + content hash — a receipt whose steps are one probe
// would satisfy it while attesting almost nothing, so a probe-only run must
// never mint one. The lane marker IS still stamped: the probe runs the pack's
// own build steps and owes every other watcher the same courtesy as the lane.
if (determinism && !profileExplicit) {
  fs.mkdirSync(path.dirname(LANE_MARKER), { recursive: true });
  fs.writeFileSync(LANE_MARKER, `${process.pid} ${new Date().toISOString()}\n`);
  let probe;
  try {
    probe = pack.stepDeterminism();
  } finally {
    fs.rmSync(LANE_MARKER, { force: true });
  }
  if (asJson) {
    console.log(JSON.stringify(probe, null, 2));
  } else {
    const mark = probe.verdict === "PASS" ? "✓" : "✗";
    console.log(`${mark} determinism: ${probe.verdict}${probe.note ? ` (${probe.note})` : ""}${probe.reason ? ` — ${probe.reason}` : ""}`);
    console.log("\n(probe-only run — no receipt written; the full lane is where evidence is earned)");
  }
  process.exit(probe.verdict === "FAIL" ? 1 : 0);
}

// ── --fast: the inner loop, mechanically unable to claim done ───────────────
// The genuinely slow tier is the pack's own: whatever it names in
// FAST_EXCLUDED_NAMES (on mobile, the device and release steps). --fast
// filters that tier out of whatever profile resolved, UNCONDITIONALLY — so a
// small change gets its did-I-break-anything-obvious signal without paying
// for the expensive half. The rest of the profile still runs, but cheaply:
// the pure-Node steps reuse an unchanged PASS from the step cache (CACHED —
// see the memoization block above), and the pack scopes its own test steps to
// the working-tree change (it reads `fast` from ctx). The loophole is closed
// at the receipt, not by convention: mode "fast" is recorded, no evidence
// rung is derived (qa/lib/evidence-level.mjs), and qa/receipt-check.mjs
// refuses a fast receipt as done evidence.
const FAST_EXCLUDED_FNS = new Set(FAST_EXCLUDED_NAMES.map((name) => STEP_FN_BY_NAME[name]));
const laneSteps = fast
  ? stepsForProfile[profile].filter((fn) => !FAST_EXCLUDED_FNS.has(fn))
  : stepsForProfile[profile];
const fastExcluded = fast
  ? FAST_EXCLUDED_NAMES.filter((name) => stepsForProfile[profile].includes(STEP_FN_BY_NAME[name]))
  : [];

if (fast) {
  console.error(
    [
      "⚡⚡ FAST MODE — INNER LOOP ONLY, NOT THE DONE-GATE ⚡⚡",
      `   skipping the device/release tier: ${fastExcluded.join(", ") || "(none in this profile)"}`,
      '   this run\'s receipt records mode "fast", earns no evidence rung, and can NEVER satisfy "done"',
      "   run the full lane once (node qa/verify.mjs) before you finish",
    ].join("\n"),
  );
}

// Stamp the lane marker for the run's duration (coexistence defense 1 above);
// always removed, even on a failing step, so the eyes only ever defer briefly.
//
// N2 (docs/features/drive-narration.md): the marker is REWRITTEN at each step
// start with the lane's own narration — current step name, position, and the
// expected durations read from the journal's last full run (never memory;
// walk-legibility L4's rule, per step). Every other consumer of this marker
// is mtime-only (qa/watch.mjs, the preview daemon), so the content is free
// to carry meaning for deriveChain's windshield — and the per-step rewrite
// also refreshes mtime, so a lane longer than the 5-minute freshness bound
// no longer reads as stale to its own watchers mid-run.
const laneStartedAt = Date.now(); // for the flight-recorder entry's durationMs
// The step loop is the SPINE (qa/lib/lane-runner.mjs, evidence-economics S8a):
// marker narration, per-step deadlines, the pulse, throw/timeout → one ERROR
// row, the mark, the verdict. This file supplies only what is this project's:
// the steps, the marker path, the subprocess deadline hook, the device lease.
const expectedByStep = (() => {
  try {
    return expectedDurations(readFlightJournal(ROOT).entries);
  } catch {
    return { byName: new Map(), laneMs: null }; // narration is optional; the lane never depends on its own journal
  }
})();
const lane = runLane({
  steps: laneSteps,
  markerPath: LANE_MARKER,
  expected: expectedByStep,
  startedAt: laneStartedAt,
  // sh() reads the running step's deadline from this module-level slot.
  setDeadline: (ms) => {
    CURRENT_STEP_DEADLINE_MS = ms;
  },
  // Human runs print a row per step and get the pulse; --json gets neither
  // (a narrator during a machine run is a lane doing something unasked).
  print: asJson ? null : (line) => console.log(line),
  narrator: { entry: path.join(HERE, "lib", "lane-narrator.mjs"), root: ROOT },
  // The device lease (if a device step took it) is held to the very end of the
  // run — see the scope decision at leaseDeviceForStep. Release is idempotent
  // and never deletes a foreign holder's lease.
  onFinally: () => pack.releaseLease(),
});
const steps = lane.steps;
// CACHED counts as PASS for the lane verdict (it IS a prior PASS, reused only
// in fast mode on an unchanged input set) — but it stays CACHED on the
// receipt, visibly distinct. ERROR fails the lane: "I could not check this" is
// not green; only the ACCUSATION is withheld. (laneVerdict, qa/lib/lane-runner.mjs)
const verdict = lane.verdict;

// Receipt STRENGTH — a desktop-only green and an on-device green are different
// claims, and the difference should never live only in the SKIP lines. Device-
// dependent steps that actually RAN (PASSed) are named on the receipt and in the
// verdict line: "PASS (on-device: e2eSmoke)" vs "PASS (desktop-only)".
// (DEVICE_STEPS itself is defined above the lane — it also drives --fast.)
const onDeviceSteps = steps.filter((s) => DEVICE_STEPS.includes(s.name) && s.verdict === "PASS").map((s) => s.name);
const strengthLabel = onDeviceSteps.length ? `on-device: ${onDeviceSteps.join("+")}` : "desktop-only";

// Receipt RUNG — the evidence ladder (qa/lib/evidence-level.mjs): the coarse,
// named grade (L0 scaffold / L1 desktop / L2 device / L3 release) DERIVED from
// which steps actually ran and PASSed. The strength string above stays as the
// fine print; the rung is added alongside, never in place of it. null on FAIL —
// a failed lane has no rung. null on a --fast run too: the inner loop is a
// signal, never evidence, so a fast receipt derives NO rung at all.
// The ladder is the PACK's: a pack that declares none earns no rung (a
// backend graded by Compose step names was L0 by construction — wrong, not
// conservative).
const level = evidenceLevel(steps, profile, { mode, ladder: pack.evidenceLadder ?? null });

// Artifacts: hash whatever the run left under qa-artifacts/ (never committed).
const artifacts = [];
if (fs.existsSync(ARTIFACTS_DIR)) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else artifacts.push({ path: path.relative(ROOT, p), sha256: createHash("sha256").update(fs.readFileSync(p)).digest("hex") });
    }
  };
  walk(ARTIFACTS_DIR);
  artifacts.sort((a, b) => a.path.localeCompare(b.path));
}

// Bind the receipt to the content of the verified surface (ADR-0005), NOT the
// parent SHA (rebase/merge-fragile). Must be computed before latest.json is
// written — the receipt is an output and must never hash itself.
/**
 * The receipt's harness summary — compact by design. The per-file detail lives
 * on the harnessIntegrity step; this is the part a receipt-holder needs to
 * identify the lane, plus the names of any modified files (an auditor told
 * "not intact" and not told which files has been given a rumour, not a fact).
 */
function harnessForReceipt() {
  const row = steps.find((st) => st.name === "harnessIntegrity");
  const r = row?.harness ?? checkHarnessIntegrity(ROOT);
  const summary = {
    name: r.name,
    version: r.version,
    sha256: r.sha256,
    status: r.status,
    intact: r.status === "intact",
  };
  if (r.status === "modified") {
    summary.modified = r.modified;
    summary.missing = r.missing;
    summary.extra = r.extra;
  }
  return summary;
}

const inputs = computeInputsHash(ROOT);
// What the surface does NOT cover, at the top level. A surface is an allowlist,
// and a new top-level directory is simply unmatched: no error, silently
// unattested (payment-blueprint's finding, 2026-09-03). This is a REPORT on the
// receipt, never a gate — the Compose default deliberately leaves docs/, the
// README and the wrapper out — so a reader can see the gap and decide.
const undeclared = undeclaredTopLevel(ROOT);
if (undeclared.length) {
  console.log(`  ⓘ inputs: ${undeclared.length} top-level entr${undeclared.length === 1 ? "y is" : "ies are"} outside the verified surface (unattested): ${undeclared.join(", ")}`);
}

// The receipt. Deterministic key order; ONE volatile timestamp field.
// commit.sha is the parent HEAD at run time (you cannot know the sha of the
// commit the receipt will be part of); commit.dirty lists what was uncommitted.
// The STAGE a receipt attests (evidence-economics S6): what "done" means at
// this gate, named on the receipt so an evidence rung can never be read as
// more than its stage allows. scaffold → scaffold, local → change (per commit),
// ci → merge, nightly → nightly (proves the harness, never a change), release →
// release. Receipts predating this field are read as their profile's stage.
const STAGE_OF_PROFILE = { smoke: "smoke", scaffold: "scaffold", local: "change", ci: "merge", nightly: "nightly", release: "release" };
// Computed once: `harness` and `pack` both read it, and checkHarnessIntegrity
// hashes the whole region.
const harnessSummary = harnessForReceipt();
const receipt = {
  schema: "cmp-evidence/1",
  profile,
  stage: STAGE_OF_PROFILE[profile] ?? profile,
  // "full" is the done-gate; "fast" (--fast) excluded the device/release tier
  // and is REFUSED by qa/receipt-check.mjs — a fast run can never end a session
  // as "done". Receipts predating this field are treated as full.
  mode,
  verdict,
  commit: {
    sha: tryGit("rev-parse HEAD"),
    dirty: tryGitLines("status --porcelain").map((l) => l.slice(3)).sort(),
  },
  inputs: {
    hash: inputs.hash,
    fileCount: inputs.fileCount,
    // Top-level entries the surface leaves unattested (see above). Absent when
    // there are none, so a receipt whose surface covers everything keeps its
    // exact prior shape.
    ...(undeclared.length ? { undeclared } : {}),
  },
  steps,
  // WHICH LANE issued this verdict. A receipt that cannot name its own harness
  // can only be checked against the tree it came from; naming the version and
  // the region digest lets a third party who holds the receipt ask the harder
  // question — was this the real published lane? — without the tree at all.
  //
  // `intact` is the LOCAL claim only: unmodified since installed. It is a
  // checksum, not a signature, and someone who edits the lane can edit this
  // too. What they cannot edit is what the registry published under that
  // version, which is why `version` + `sha256` travel together.
  harness: harnessSummary,
  // WHICH PACK produced these rows. `harness` says which lane ran; `pack` says
  // which step pack the lane loaded — and the two can differ once a profile is
  // versioned on its own. Without this a cmp L2 and a backend pack's L2 are the
  // same bytes on the wire and an auditor cannot tell "device e2e passed" from
  // "integration tests passed" (AGNOSTIC-HARNESS-ARCHITECTURE.md §8). Named
  // `pack` because `profile` is taken by the RUN profile (scaffold/local/ci/…);
  // the collision is resolved at schema/2, not here. The pack declares its id;
  // its version is the lock's until the profile loader gives it its own.
  pack: { id: pack.id, version: harnessSummary.version },
  strength: { onDeviceSteps },
  evidenceLevel: level,
  artifacts,
  toolVersions: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  },
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(path.join(EVIDENCE_DIR, "latest.json"), `${JSON.stringify(receipt, null, 2)}\n`);
// latest.json is the single receipt-of-record. Commit it with your change: the
// studio console's Evidence audit trail reconstructs the full history from the
// git log of this file — every commit is one verified, attributed state.

// The README's evidence badge is DERIVED from the receipt just written — an
// output, never a gate, so it runs after the verdict and cannot change it. It
// renders the rung together with the commit it was attested against, so the
// sentence stays true as the tree moves on (qa/lib/evidence-badge.mjs).
const badge = updateReadmeBadge(ROOT);

// ── Flight recorder (roadmap §10 item 5) — the lane journals its own run ────
// One JSON line per run into qa/flight-recorder.jsonl (committed, and
// excluded from the receipt's hashed surface — qa/lib/flight-recorder.mjs
// carries the whole rationale). Appended AFTER the receipt so the entry
// records the final verdict and rung. A failed append must never fail the
// lane — a recorder that breaks the thing it observes is worse than no
// recorder — so the failure degrades to a note in the lane's own output,
// which is itself the honest record of the degradation.
//
// --no-journal is the ONE exemption, and qa/watch.mjs passes it on every
// save-triggered run. Same rule the README badge obeys, for the same reason:
// THE INNER LOOP DOES NOT WRITE TO COMMITTED FILES. A watcher journaling every
// save would add hundreds of lines a day to a committed file — turning the
// app's history into keystroke noise and leaving a permanently-dirty tree in
// the loop the recorder exists to observe. What survives is every full lane
// and every DELIBERATE fast run, which is what the retrospective's questions
// actually rest on (SKIP reasons, degraded paths, the longest stretch with no
// full lane). qa/retrospective.mjs discloses the exemption in its own output
// so the fast-vs-full ratio is never read as a complete census.
const flight = noJournal
  ? { ok: true, skipped: true }
  : appendFlightRecord(
      ROOT,
      buildFlightEntry({
        profile,
        mode,
        verdict,
        evidenceLevel: level,
        steps,
        sha: receipt.commit.sha,
        durationMs: Date.now() - laneStartedAt,
        onDeviceSteps,
        degraded: DEGRADED_PATHS,
      }),
    );
if (!flight.ok) {
  console.error(`· flight recorder: journal append failed (${flight.reason}) — the lane verdict is unaffected, but this run is missing from qa/flight-recorder.jsonl`);
}

if (asJson) {
  console.log(JSON.stringify(receipt, null, 2));
  if (fast) {
    console.error(`⚡⚡ FAST MODE verdict: ${verdict} — INNER LOOP ONLY, not done. Skipped: ${fastExcluded.join(", ") || "(none)"}. Run the full lane (node qa/verify.mjs) before you finish.`);
  }
} else if (fast) {
  // Deliberately NOT the full lane's verdict-line shape: fast-green must never
  // be mistakable for done-green.
  console.log(
    `\n${verdict === "PASS" ? "⚡⚡" : "❌"} verify lane [FAST — INNER LOOP ONLY, NOT DONE]: ${verdict} (skipped device/release tier: ${fastExcluded.join(", ") || "none"}) — this fast receipt satisfies no done-gate; run the full lane (node qa/verify.mjs) once before you finish`,
  );
} else {
  console.log(`\n${verdict === "PASS" ? "✅" : "❌"} verify lane: ${verdict}${level ? ` · ${level.rung} ${level.name}` : ""} (${strengthLabel}) — receipt written to qa/evidence/latest.json${badge.changed ? ` and ${README_REL_PATH}'s evidence badge refreshed` : ""} (commit ${badge.changed ? "them" : "it"} with your change)`);
}

// A TIER THAT HAS NEVER RUN HERE. A SKIP is non-fatal by design — absence of a
// device is not a broken promise — but "non-fatal" quietly became "invisible":
// maestro was never installed on one machine, so e2eSmoke skipped on every one
// of 37 recorded runs while the lane said PASS each time. The end-to-end flow
// had never executed once, and nothing ever said so. A single skip is a fact;
// skipping EVERY recorded run is a different fact, and only the journal can
// tell them apart. Counted here, from the journal, and stated once per run.
if (!asJson && !fast) {
  try {
    const never = neverRunTiers(steps, readFlightJournal(ROOT).entries);
    if (never.length > 0) {
      console.log("\n⚠ tiers that have NEVER run on this machine (skipped every recorded run — the lane still says PASS):");
      for (const n of never) {
        console.log(`  ${n.name} — skipped in all ${n.runs} recorded full runs. ${n.reason.split("\n")[0]}`);
      }
      console.log("  A promise that only this tier could observe has never been checked here.");
    }
  } catch {
    /* the journal is a convenience for this note; never let it colour a verdict */
  }
}

// The audit-cadence nudges print in the human path, not only inside the
// receipt JSON — a ship-time report that lives only in a JSON field is a
// report nobody reads at ship time. Nudges only; a gate this is not.
if (!asJson) {
  const auditStep = steps.find((s) => s.name === "auditCadence");
  const auditLines = auditStep?.details?.lines ?? [];
  if (auditLines.length > 0) {
    console.log("\naudit cadence (report, never a gate):");
    for (const l of auditLines) console.log(`  ${l}`);
  }
}

process.exit(verdict === "PASS" ? 0 : 1);
