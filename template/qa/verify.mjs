#!/usr/bin/env node
// The verify lane — this project's single verification gate.
//
//   node qa/verify.mjs [--profile smoke|scaffold|local|ci|nightly|release|feature] [--base <ref>] [--fast] [--dry-run] [--json]
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
import { gradeEvidence } from "./lib/evidence-level.mjs";
import { evidenceLadderFor } from "./lib/evidence-ladder.mjs";
import { updateReadmeBadge, README_REL_PATH } from "./lib/evidence-badge.mjs";
// The `--html` snapshot (LIVE-CONSOLE.md D3a) and the Rule 0 record it reports
// beside the run. Both are OUTPUTS derived from artifacts — neither can change
// a verdict, and the second is only ever read.
import { SNAPSHOT_REL, snapshotHtml } from "./lib/evidence-html.mjs";
import { readFrameworkRecord } from "./lib/framework-record.mjs";
import { appendFlightRecord, buildFlightEntry, machineClass, neverRunTiers, readFlightJournal } from "./lib/flight-recorder.mjs";
import { StepTimeout, spawnTimedOut } from "./lib/step-outcomes.mjs";
import { expectedDurations, laneVerdict, runLane, stepDisplayName } from "./lib/lane-runner.mjs";
import { resolveHarnessManifest } from "./lib/harness-manifest.mjs";
import { loadProfile, loadProfileSync } from "./lib/profile-loader.mjs";
import { laneMarkerPath, laneStepsPath } from "./lib/lane-markers.mjs";
import { checkHarnessIntegrity, describeIntegrity, LOCK_PATH } from "./lib/harness-lock.mjs";
import { readHarnessSource } from "./lib/harness-source.mjs";
import { readReceipt } from "./lib/receipt-validate.mjs";
import { readLadder } from "./lib/evidence-level.mjs";
import { REATTEST_FLAG, capLevel, mergeRows, planReattest } from "./lib/reattest.mjs";

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
const USAGE = `node qa/verify.mjs [--profile smoke|scaffold|local|ci|nightly|release|feature] [--base <ref>] [--fast] [--reattest-approvals] [--dry-run] [--json] [--html] [--help]

The verify lane — this project's single verification gate. Runs every
verification step this project carries, aggregates a typed PASS/FAIL
verdict, and writes the evidence receipt to qa/evidence/latest.json (commit
it with your change — see CLAUDE.md). Exit code: 0 = PASS, 1 = FAIL.

Flags:
  --profile <smoke|scaffold|local|ci|nightly|release|feature>
                                 which step set to run (default: local)
  --base <ref>                   feature profile only: the ref the branch's
                                 change is measured against (git diff
                                 <ref>...HEAD; default origin/main). CI passes
                                 HEAD^1 — a pull request's merge commit's
                                 first parent is the base branch's tip
  --dry-run                      print the steps the resolved profile would
                                 run — and, for the feature profile, the scope
                                 it derived (features, test filter, flows, and
                                 whether anything a test can see changed) —
                                 then exit 0 having run nothing and written no
                                 receipt. With --json, one JSON object
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
  --reattest-approvals           AFTER A SIGNATURE: re-issue the receipt in
                                  seconds instead of minutes. Allowed only when
                                  qa/approvals.json is the ONLY attested file
                                  that changed since a full, PASSing,
                                  done-evidence receipt — proven by recomputing
                                  every other file's hash, not assumed. Re-runs
                                  the steps that read the ledger plus the lane's
                                  self-check; carries every other row forward,
                                  marked, naming the run it came from. Never
                                  raises the evidence rung. Refused (with the
                                  reason) on any other change, and under CI,
                                  which runs its own checks
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
  --events                       one NDJSON object per finished step, on STDERR.
                                 stdout keeps its contract (one receipt with --json);
                                 stderr carries progress. Combine them freely.
                                 The same objects are ALSO appended to
                                 qa/.lane-steps.ndjson (truncated per run,
                                 gitignored) so a console that was not running
                                 can still render the run afterwards.
  --html                         also write qa/evidence/latest.html — this run
                                 as ONE self-contained page: no server, no
                                 script, no external fetch, so it opens from a
                                 file:// URL and attaches to a PR. Opt-in on
                                 purpose (docs/proposals/LIVE-CONSOLE.md D3a);
                                 writing it every run was rejected as churn
  --help, -h                     print this usage and exit 0 without
                                  running anything

Profiles — WHAT EACH ONE IS FOR. Which steps each runs is your profile's, and
they are listed under "This project" below.
  smoke     the smallest end-to-end lane: the pack's pure-Node gates only,
            through the real runner, receipt and journal. Seconds. Proves the
            FRAMEWORK returns, both ways; never the change (its receipt is
            refused as done-evidence). Driven by qa/framework-check.mjs.
  scaffold  what a stamp-time verify proves — enough to trust a fresh tree
  local     everything; steps needing a resource this host lacks SKIP, and the
            reason is recorded rather than swallowed
  ci        everything; SKIPs are recorded so the pipeline stays honest
  nightly   everything ci proves with the determinism probe FORCED ON (it
            doubles the host test tier — the budget a scheduled run has and a
            per-change run does not). Proves the HARNESS, not a change: its
            receipt is refused as done-evidence by qa/receipt-check.mjs.
            Schedule it; never wait on it.
  release   everything ci proves PLUS the pack's ship-time step; run it before
            cutting a release, never per-change
  feature   the pre-merge check: only what the branch's change touches — its
            feature's tests and its own e2e flow, scoped by the --fast
            filter's rules over git diff <base>...HEAD. A docs-only change
            scopes to nothing. Writes qa/evidence/latest-feature.json (never
            the receipt-of-record), earns no rung, and is refused as
            done-evidence: it proves one feature, and the nightly proves the
            tree
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
const RECOGNIZED_FLAGS = new Set(["--profile", "--base", "--json", "--fast", "--determinism", "--no-journal", "--events", "--html", "--dry-run", REATTEST_FLAG]);
for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];
  if (arg === "--profile" || arg === "--base") {
    i += 1; // consume its value (missing/invalid value keeps the existing exit-2 behavior below)
    continue;
  }
  if (RECOGNIZED_FLAGS.has(arg)) continue;
  console.error(`unknown argument "${arg}" — run node qa/verify.mjs --help`);
  process.exit(2);
}

const args = rawArgs;
// --reattest-approvals (qa/lib/reattest.mjs). Read before the profile, because
// a re-attest re-issues the profile the carried receipt RAN — `local` by
// default would build the pack for a profile the receipt never had.
const reattest = args.includes(REATTEST_FLAG);
const previousReceipt = reattest ? readReceipt(ROOT) : null;
const profile = args.includes("--profile")
  ? args[args.indexOf("--profile") + 1]
  : reattest && typeof previousReceipt?.profile === "string"
    ? previousReceipt.profile
    : "local";
const asJson = args.includes("--json");
// Step events go to STDERR, deliberately. `--json` prints ONE object on stdout
// and both qa/watch.mjs and qa/refusal-demo.mjs parse it that way; interleaving
// step lines there would break every existing reader for the benefit of a new
// one. stdout stays the result, stderr becomes the progress — the oldest
// convention there is, and it lets a caller consume both at once.
const asEvents = args.includes("--events");
// The shareable snapshot (docs/proposals/LIVE-CONSOLE.md D3a, 2026-09-09): this
// run as one self-contained file beside the receipt. OPT-IN — D3b, writing it
// on every run, was rejected as churn, and this flag is the whole of that
// decision. It is an OUTPUT derived from the receipt, exactly like the README
// badge: written after the verdict, unable to change one.
const asHtml = args.includes("--html");
// The same events, ALSO left behind as an artifact (docs/proposals/LIVE-CONSOLE.md
// Phase B, decided 2026-09-09). stderr reaches whoever is holding the pipe;
// qa/.lane-steps.ndjson reaches whoever arrives afterwards — a console that
// was not running when the lane ran still renders the run, because the file is
// still on disk. That is the whole reason the console TAILS a file instead of
// the lane PUSHING to a console: the console never becomes the thing that runs
// the lane, and every value on its page is read from an artifact.
//
// TRUNCATED at the start of each run, so the file is exactly one run: bounded
// on a watcher that runs the fast lane on every save, and unambiguous for the
// reader (the last `run/start` line wins).
//
// WHERE it goes is qa/lib/lane-markers.mjs's to say, beside the in-flight
// marker and for the same reasons — it is transient lane state, not evidence,
// so it is gitignored, excluded from the receipt's hashed input surface, and a
// lane OUTPUT for the fast filter. One spelling of the path: the lane writes
// it, the console reads it, and neither may guess where the other put it.
const STEPS_STREAM_PATH = laneStepsPath(ROOT);
const appendStepStream = asEvents
  ? (obj, { truncate = false } = {}) => {
      try {
        fs.mkdirSync(path.dirname(STEPS_STREAM_PATH), { recursive: true });
        const line = `${JSON.stringify(obj)}\n`;
        if (truncate) fs.writeFileSync(STEPS_STREAM_PATH, line);
        else fs.appendFileSync(STEPS_STREAM_PATH, line);
      } catch {
        /* an unwritable qa/ must never fail the lane it narrates */
      }
    }
  : null;
const emitStepEvent = asEvents
  ? (obj) => {
      try {
        process.stderr.write(`${JSON.stringify(obj)}\n`);
      } catch {
        /* a blocked or closed stderr must never fail the lane */
      }
      appendStepStream(obj);
    }
  : null;
const fast = args.includes("--fast");
const dryRun = args.includes("--dry-run");
// --base names the feature profile's comparison ref, and only that profile
// reads it — so anywhere else it is refused by name rather than ignored.
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : undefined;
if (args.includes("--base") && (!base || base.startsWith("--"))) {
  console.error("--base needs a git ref, e.g. --base origin/main");
  process.exit(2);
}
if (base !== undefined && profile !== "feature") {
  console.error(`--base belongs to the feature profile, not "${profile}" — run --profile feature --base ${base}`);
  process.exit(2);
}
if (fast && profile === "feature") {
  console.error("--fast cannot be combined with --profile feature: the feature profile is already scoped to the branch's change, and --fast would drop the e2e flow it exists to run.");
  process.exit(2);
}
// A fast run writes its own file. Before 2026-09-08 it wrote latest.json, so a
// resident watcher's next pass overwrote the checkpoint's receipt with a fast
// one the Stop hook refuses — the agent had done everything right and was told
// it had not. latest-fast.json is never committed (template gitignore) and is
// read by nothing that grades; latest.json stays the single receipt-of-record.
// The feature profile writes its own file for the same reason: it proves one
// feature, and the receipt-of-record a Stop hook reads must stay the full lane's.
const RECEIPT_FILE = fast ? "latest-fast.json" : profile === "feature" ? "latest-feature.json" : "latest.json";
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
if (reattest && (fast || determinism)) {
  console.error(
    `${REATTEST_FLAG} cannot be combined with ${fast ? "--fast" : "--determinism"}: a re-attest re-runs only the steps that read qa/approvals.json and carries a FULL run's rows forward — it is neither the inner loop nor a probe.`,
  );
  process.exit(2);
}
// nightly FORCES the probe (above), so it is a profile that owns it — without
// it in this list, `--profile nightly` refused itself with exit 2 on every
// run from the day the profile shipped, and nothing ran it until a stamped
// app's scheduled CI did (2026-11-14).
if (determinism && profileExplicit && profile !== "ci" && profile !== "release" && profile !== "nightly") {
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
const pack = loaded.profile.steps({ ROOT, HERE, fast, determinism, profile, mode, base, sh, tryGit, tryGitLines, DEGRADED_PATHS });
const { stepsForProfile, DEVICE_STEPS, FAST_EXCLUDED_NAMES, STEP_FN_BY_NAME } = pack;

// ── The evidence ladder, resolved once, before a step runs ──────────────────
// The ladder has TWO spellings — the profile's top-level `ladder` and the
// pack's `evidenceLadder` — and this line used to read only the second one,
// while the Stop hook read only the first. Both spellings are legitimate and
// qa/lib/evidence-ladder.mjs carries the argument for the precedence; what was
// not legitimate is that a profile declaring only the spelling `harness init`
// SEEDS was graded at no rung with nothing said about it. Resolved here rather
// than at the grading call so the refusal — two declarations that disagree —
// lands before any work is done, and so the rung the receipt records and the
// rung a no-lane reader would compute come from the same bytes.
const resolvedLadder = evidenceLadderFor(loaded.profile, pack);
if (!resolvedLadder.ok) {
  console.error(resolvedLadder.reason);
  process.exit(2);
}

if (!stepsForProfile[profile]) {
  console.error(`Unknown profile "${profile}" — use smoke | scaffold | local | ci | nightly | release | feature.`);
  process.exit(2);
}

// ── --reattest-approvals: a signature costs what a signature costs ──────────
// The whole decision is qa/lib/reattest.mjs's (planReattest) — this block only
// gathers the facts it decides over, runs the few steps it names through the
// SAME runner, and writes a receipt that says which rows ran now and which were
// carried. Exits here; nothing below runs on a re-attest.
if (reattest) {
  const reattestStartedAt = Date.now();
  const current = computeInputsHash(ROOT);
  const integrityNow = checkHarnessIntegrity(ROOT);
  // The legacy-SKIP fallback is resolved exactly as qa/receipt-check.mjs
  // resolves it, so "is the carried receipt done-evidence" has one answer.
  const declaredLegacy = loaded.profile?.legacySkipReasons;
  const legacySkips =
    resolvedLadder.ladder && Array.isArray(declaredLegacy) && declaredLegacy.length
      ? { names: readLadder(resolvedLadder.ladder).l2Execution, reasons: declaredLegacy }
      : null;
  const plan = planReattest({
    previous: previousReceipt,
    current,
    harnessSha: integrityNow.sha256 ?? null,
    ledgerReaders: pack.approvalsLedgerReaders,
    requestedProfile: profileExplicit ? profile : null,
    ci: process.env.CI === "true" || process.env.CI === "1",
    legacySkips,
  });
  if (!plan.ok) {
    if (plan.noop) {
      console.log(`✅ ${plan.reason} (qa/evidence/latest.json). Nothing written.`);
      process.exit(0);
    }
    console.error(`✗ ${REATTEST_FLAG} refused — ${plan.reason}`);
    process.exit(2);
  }
  const rerunFns = stepsForProfile[profile].filter((fn) => plan.rerun.includes(stepDisplayName(fn)));
  if (rerunFns.length !== plan.rerun.length) {
    const have = rerunFns.map((fn) => stepDisplayName(fn));
    console.error(`✗ ${REATTEST_FLAG} refused — the "${profile}" profile has no step for ${plan.rerun.filter((n) => !have.includes(n)).join(", ")}; run the full lane (node qa/verify.mjs)`);
    process.exit(2);
  }
  if (!asJson) {
    console.log(
      `♻ re-attest (approvals only): every attested file except qa/approvals.json is byte-identical to the full run of ${plan.from.generatedAt}` +
        `${plan.from.commit ? ` (commit ${String(plan.from.commit).slice(0, 7)})` : ""}.\n` +
        `  re-running now: ${plan.rerun.join(", ")} · carrying forward ${plan.carried.length} step(s) from that run, each marked on the receipt`,
    );
  }
  const rerunLane = runLane({
    steps: rerunFns,
    markerPath: LANE_MARKER,
    expected: { byName: new Map(), laneMs: null },
    startedAt: reattestStartedAt,
    setDeadline: (ms) => {
      CURRENT_STEP_DEADLINE_MS = ms;
    },
    print: asJson ? null : (line) => console.log(line),
    receiptPath: "qa/evidence/latest.json",
    narrator: null,
    onFinally: () => pack.releaseLease(),
    compileStepName: pack.compileStepName,
    stepDeadlines: pack.stepDeadlines,
  });
  const merged = mergeRows(previousReceipt.steps, rerunLane.steps, plan.rerun);
  const reVerdict = laneVerdict(merged);
  const reGrade = gradeEvidence(merged, profile, { mode: "full", ladder: resolvedLadder.ladder, plants: loaded.profile.plants });
  // NEVER UP: the rung is the lower of what the merged rows grade to and what
  // the carried receipt held. A FAIL has no rung at all.
  const reLevel = reVerdict === "PASS" ? capLevel(reGrade.level, previousReceipt.evidenceLevel ?? null) : null;
  const vouch = rerunLane.steps.find((r) => r && r.harness && typeof r.harness === "object");
  const h = vouch?.harness ?? integrityNow;
  const harnessSummary = { name: h.name, version: h.version, sha256: h.sha256, status: h.status, intact: h.status === "intact" };
  const provenance = readHarnessSource(ROOT);
  if (provenance?.source) harnessSummary.source = provenance.source;
  if (h.status === "modified") Object.assign(harnessSummary, { modified: h.modified, missing: h.missing, extra: h.extra });
  const undeclaredNow = undeclaredTopLevel(ROOT);
  const reReceipt = {
    schema: "prooflane-evidence/1",
    profile,
    stage: previousReceipt.stage ?? ({ smoke: "smoke", scaffold: "scaffold", local: "change", ci: "merge", nightly: "nightly", release: "release" }[profile] ?? profile),
    // "full": what the rows on this receipt attest is a full run — the carried
    // rows ARE one, and `reattest` says which rows were re-run when.
    mode: "full",
    verdict: reVerdict,
    commit: {
      sha: tryGit("rev-parse HEAD"),
      dirty: tryGitLines("status --porcelain").map((l) => l.slice(3)).sort(),
    },
    inputs: {
      hash: current.hash,
      fileCount: current.fileCount,
      hashWithoutApprovals: current.hashWithoutApprovals,
      ...(undeclaredNow.length ? { undeclared: undeclaredNow } : {}),
    },
    steps: merged,
    reattest: {
      kind: "approvals-only",
      rerun: plan.rerun,
      carriedForward: plan.carried,
      // The run every carried row was EARNED in — the original full run, even
      // when the receipt on disk was itself a re-attest.
      from: plan.from,
      // The receipt this one replaced, for the audit trail in git history.
      replaced: { inputsHash: previousReceipt.inputs.hash, generatedAt: previousReceipt.generatedAt },
    },
    harness: harnessSummary,
    pack: { id: pack.id, version: typeof loaded.profile?.version === "string" ? loaded.profile.version : null },
    strength: previousReceipt.strength ?? { onDeviceSteps: [] },
    evidenceLevel: reLevel,
    // The artifacts the carried rows were proven with — this run built none.
    artifacts: Array.isArray(previousReceipt.artifacts) ? previousReceipt.artifacts : [],
    toolVersions: { node: process.version, platform: `${process.platform}-${process.arch}` },
    generatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, "latest.json"), `${JSON.stringify(reReceipt, null, 2)}\n`);
  const reBadge = updateReadmeBadge(ROOT);
  if (!noJournal) {
    // Journalled as mode "reattest" with ONLY the rows that ran: a carried row
    // re-journalled would count a build twice and teach the narrator that a
    // full lane takes two seconds.
    const appended = appendFlightRecord(
      ROOT,
      buildFlightEntry({
        profile,
        mode: "reattest",
        verdict: reVerdict,
        evidenceLevel: reLevel,
        pack: { id: pack.id },
        steps: rerunLane.steps,
        sha: reReceipt.commit.sha,
        durationMs: Date.now() - reattestStartedAt,
        onDeviceSteps: [],
        degraded: DEGRADED_PATHS,
      }),
    );
    if (!appended.ok) console.error(`· flight recorder: journal append failed (${appended.reason})`);
  }
  if (asJson) {
    console.log(JSON.stringify(reReceipt, null, 2));
  } else {
    const levelText = reLevel ? ` · ${reLevel.rung} ${reLevel.name} · pack ${pack.id}` : "";
    console.log(
      `\n${reVerdict === "PASS" ? "✅" : "❌"} verify lane [RE-ATTESTED — approvals only]: ${reVerdict}${levelText} — ` +
        `re-ran ${plan.rerun.join(", ")}; ${plan.carried.length} step(s) carried from ${plan.from.generatedAt}. ` +
        `Receipt written to qa/evidence/latest.json${reBadge.changed ? ` and ${README_REL_PATH}'s evidence badge refreshed` : ""} (commit ${reBadge.changed ? "them" : "it"} with your signature)`,
    );
  }
  process.exit(reVerdict === "PASS" ? 0 : 1);
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
// FAST_EXCLUDED_NAMES — whichever steps THIS profile calls expensive. --fast
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

// ── --dry-run: what would run, and nothing else ─────────────────────────────
// No marker, no receipt, no journal line: a question about the lane must not
// leave a trace the lane's readers would mistake for a run. The stamped CI
// asks it of the feature profile before it boots an emulator, so a docs-only
// pull request reports `run: false` and costs one checkout.
if (dryRun) {
  const plan = {
    profile,
    steps: laneSteps.map((fn) => stepDisplayName(fn)).filter(Boolean),
    scope: typeof pack.describeScope === "function" ? pack.describeScope() : null,
  };
  if (asJson) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(`dry run — profile ${profile}: ${plan.steps.join(", ") || "(no steps)"}`);
    if (plan.scope) {
      const sc = plan.scope;
      console.log(`  scope since ${sc.base}: ${sc.run ? sc.reason : `nothing to test — ${sc.reason}`}`);
      if (sc.run) {
        console.log(`  unit tests: ${sc.unit.mode === "filtered" ? sc.unit.patterns.join(", ") : `all — ${sc.unit.reason}`}`);
        console.log(`  flows: ${sc.flows.join(", ") || "(none)"} — ${sc.flowsReason}`);
      }
    }
  }
  process.exit(0);
}
if (fast) {
  console.error(
    [
      "⚡⚡ FAST MODE — INNER LOOP ONLY, NOT THE DONE-GATE ⚡⚡",
      `   skipping this profile's expensive steps: ${fastExcluded.join(", ") || "(none in this profile)"}`,
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
    return expectedDurations(readFlightJournal(ROOT).entries, { machine: machineClass(process.env) });
  } catch {
    return { byName: new Map(), laneMs: null }; // narration is optional; the lane never depends on its own journal
  }
})();
// The stream's opening line, written BEFORE the first step runs. It is what
// makes the file readable rather than merely appendable: a reader learns the
// run's identity (so an arriving row can be told from the previous run's), how
// many steps there are, and their NAMES — which is the only way a console can
// say "unitTests — not yet" instead of inventing a placeholder for a step it
// cannot name. Nothing here is a claim about the run's outcome.
const RUN_ID = `${laneStartedAt}-${process.pid}`;
const RUN_STARTED_AT = new Date(laneStartedAt).toISOString();
if (appendStepStream) {
  appendStepStream(
    {
      event: "run",
      phase: "start",
      runId: RUN_ID,
      startedAt: RUN_STARTED_AT,
      profile,
      mode,
      total: laneSteps.length,
      steps: laneSteps.map((fn) => stepDisplayName(fn)).filter(Boolean),
    },
    { truncate: true },
  );
}
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
  // A red row that cuts its reason short names where the whole of it is (KD-285).
  receiptPath: path.relative(ROOT, path.join(EVIDENCE_DIR, RECEIPT_FILE)),
  // One NDJSON line per finished step, on stderr, only when asked. A console
  // can append a row while the lane runs instead of learning the whole story
  // from the receipt after it ends.
  onStep: emitStepEvent
    ? (result, { index, total }) =>
        emitStepEvent({
          event: "step",
          // Which run this row belongs to, and when it landed. Both exist for
          // the reader that arrives LATER (the artifact's whole point): the id
          // tells an appended row from the previous run's, and the instant is
          // how the next step's elapsed time is counted without the console
          // keeping a clock of its own.
          runId: RUN_ID,
          at: new Date().toISOString(),
          index,
          total,
          name: result.name,
          verdict: result.verdict,
          durationMs: result.durationMs ?? null,
          // What this step USUALLY costs, from this project's own flight
          // journal. It rides along because "impossibly fast" is meaningless
          // without it: a 6ms gate and a 52-second build are both suspicious
          // at 10x under their own history and at no fixed number
          // (evidence-must-attest-execution — a build cache can replay a PASS).
          expectedMs: expectedByStep.byName.get(result.name) ?? null,
          layer: result.layer ?? null,
          // The step's own words, never this file's: a note explains a SKIP and
          // a reason explains a FAIL, and rewording either is how a console
          // starts telling a story the lane did not.
          note: result.note ?? null,
          // VERBATIM, newlines and all. This used to be the first line only,
          // which was right while stderr's only reader was a terminal and
          // wrong the moment the events became the console's FAIL row:
          // LIVE-CONSOLE.md requires that row to show "the tool's own reason
          // and its own fix, verbatim", and a reason truncated at the emitter
          // cannot be shown verbatim anywhere downstream. The human one-line
          // row is still one line — that truncation belongs to `print` above,
          // not to the machine event.
          reason: result.reason ? String(result.reason) : null,
        })
    : null,
  narrator: { entry: path.join(HERE, "lib", "lane-narrator.mjs"), root: ROOT },
  // The device lease (if a device step took it) is held to the very end of the
  // run — see the scope decision at leaseDeviceForStep. Release is idempotent
  // and never deletes a foreign holder's lease.
  onFinally: () => pack.releaseLease(),
  // WHICH step's failure makes every verdict behind it meaningless is the
  // PACK's to name, never the spine's to guess (lane-runner.mjs's
  // compileShortCircuit). Passed unconditionally, so the KEY is always present:
  // presence is what tells the runner "this caller knows about the
  // declaration", and a pack that declares nothing then short-circuits on
  // NOTHING rather than inheriting another stack's step name. Writing
  // `pack.compileStepName ?? "build"` here would put the literal back and
  // undo the fix.
  compileStepName: pack.compileStepName,
  // How long a step may take before it is wedged — the pack's judgement about
  // its own toolchain, never the spine's about somebody else's. A pack that
  // declares none gets the fallback and its ERROR rows say so.
  stepDeadlines: pack.stepDeadlines,
});
const steps = lane.steps;
// The stream's closing line. It is what lets a reader tell a lane that is
// still running from a lane that DIED: an open stream that has gone silent
// past the harness's own lane-marker bound is reported as stopped, never as
// forever-running, and a step is never called "pending" (LIVE-CONSOLE §3.2).
// `completed` is written from the rows the lane actually produced, so a
// short-circuited run (a compile FAIL that made the rest meaningless) says so
// instead of leaving the remainder looking like work still to come.
if (appendStepStream) {
  appendStepStream({
    event: "run",
    phase: "end",
    runId: RUN_ID,
    endedAt: new Date().toISOString(),
    verdict: lane.verdict,
    durationMs: lane.durationMs ?? null,
    completed: steps.length,
    total: laneSteps.length,
  });
}
// CACHED counts as PASS for the lane verdict (it IS a prior PASS, reused only
// in fast mode on an unchanged input set) — but it stays CACHED on the
// receipt, visibly distinct. ERROR fails the lane: "I could not check this" is
// not green; only the ACCUSATION is withheld. (laneVerdict, qa/lib/lane-runner.mjs)
const verdict = lane.verdict;

// Receipt STRENGTH — a green that reached the harder tier and a green that did
// not are different claims, and the difference should never live only in the
// SKIP lines. Which steps needed a resource the host may not have is the pack's
// (DEVICE_STEPS, which also drives --fast); those that actually RAN are named on
// the receipt.
//
// THE LABEL IS THE PACK'S TOO. The core used to compose it here, and its
// negative case was the word "desktop-only" — printed on the verdict line of
// every lane in every repo, including a backend service with no desktop and no
// device. A profile could name its device steps and still could not name the
// CATEGORY, so the most-read string the lane emits asserted a stack fact the
// core has no way to know. Now the core prints what it is handed and prints
// NOTHING when it is handed nothing: silence is honest, a borrowed noun is not.
const onDeviceSteps = steps.filter((s) => DEVICE_STEPS.includes(s.name) && s.verdict === "PASS").map((s) => s.name);
const strengthLabel = typeof pack.strengthLabel === "function" ? pack.strengthLabel(onDeviceSteps) : null;

// Receipt RUNG — the evidence ladder (qa/lib/evidence-level.mjs): the coarse,
// named grade (L0 scaffold / L1 desktop / L2 device / L3 release) DERIVED from
// which steps actually ran and PASSed. The strength string above stays as the
// fine print; the rung is added alongside, never in place of it. null on FAIL —
// a failed lane has no rung. null on a --fast run too: the inner loop is a
// signal, never evidence, so a fast receipt derives NO rung at all.
// The ladder is the PROFILE's, in either of the two places a profile may
// declare it (resolved above, qa/lib/evidence-ladder.mjs): a profile that
// declares none in either earns no rung (a backend graded by another stack's
// step names was L0 by construction — wrong, not conservative).
//
// AND THE BADGE FLOOR: the profile's `plants` declaration goes to the grader
// too, because a ladder is a vocabulary and plants are what prove the steps
// under it still bite. A profile shipping none earns NO rung however green its
// lane (NORTH-STAR §8.9, §6.7, §3's third *never*) — measured on two adopters
// differing in exactly one export, both of which earned L1 until 2026-09-08.
// `.why` is the sentence for a rung that is absent: derived by the same call,
// so the grade and its explanation can never disagree.
const grade = gradeEvidence(steps, profile, { mode, ladder: resolvedLadder.ladder, plants: loaded.profile.plants });
const level = grade.level;

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
  // PROVENANCE (ADR-0008): where these bytes came from, when the tree records
  // it. Omitted entirely when unrecorded — absent means "not known", and every
  // receipt minted before the record existed is in that state. Never defaulted
  // to `local`, which would invent an origin for all of them. It is reported,
  // never consulted: no verdict, gate or level reads this field.
  const provenance = readHarnessSource(ROOT);
  if (provenance?.source) summary.source = provenance.source;
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
const STAGE_OF_PROFILE = { smoke: "smoke", scaffold: "scaffold", local: "change", ci: "merge", nightly: "nightly", release: "release", feature: "feature" };
// Computed once: `harness` and `pack` both read it, and checkHarnessIntegrity
// hashes the whole region.
const harnessSummary = harnessForReceipt();
const receipt = {
  // ADR-0007: the format name is ROUTING METADATA, not part of the claim, so
  // this rename asserts nothing new and expires nothing old. Readers accept
  // both names for the life of /1; `cmp-evidence/1` stopped being WRITTEN here
  // and never stops being READ.
  schema: "prooflane-evidence/1",
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
    // The same digest with qa/approvals.json left out (qa/lib/inputs-hash.mjs).
    // It is what lets a later signature re-attest in seconds — the proof that
    // nothing BUT the ledger moved (--reattest-approvals, qa/lib/reattest.mjs).
    hashWithoutApprovals: inputs.hashWithoutApprovals,
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
  // ADR-0008 (accepted 2026-09-08): the pack's version is the PROFILE'S OWN —
  // `export const version` — or null. Never the harness lock's number, which is
  // a version of the wrong thing: a profile declaring 0.3.1 was minting receipts
  // that said 0.20.0 (NORTH-STAR §9.2).
  pack: { id: pack.id, version: typeof loaded.profile?.version === "string" ? loaded.profile.version : null },
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
fs.writeFileSync(path.join(EVIDENCE_DIR, RECEIPT_FILE), `${JSON.stringify(receipt, null, 2)}\n`);
// latest.json is the single receipt-of-record. Commit it with your change: the
// studio console's Evidence audit trail reconstructs the full history from the
// git log of this file — every commit is one verified, attributed state.

// The README's evidence badge is DERIVED from the receipt just written — an
// output, never a gate, so it runs after the verdict and cannot change it. It
// renders the rung together with the commit it was attested against, so the
// sentence stays true as the tree moves on (qa/lib/evidence-badge.mjs).
const badge = updateReadmeBadge(ROOT);

// ── The shareable snapshot (LIVE-CONSOLE.md D3a) ────────────────────────────
// One file, no server, opens from a file:// URL. Derived from the receipt just
// written plus the two artifacts the console's own rows read — the profile's
// ladder (already resolved above, before a step ran) and Rule 0's record, if
// this tree has one. A failed write is a note, never a verdict: this is an
// output like the badge, and a renderer that could fail a lane would be the
// recorder breaking the thing it observes.
const snapshot = (() => {
  if (!asHtml) return null;
  try {
    const html = snapshotHtml({
      receipt,
      ladder: resolvedLadder.ladder,
      frameworkRecord: readFrameworkRecord(ROOT),
      appName: path.basename(ROOT),
    });
    const rel = fast ? SNAPSHOT_REL.replace("latest.html", "latest-fast.html") : SNAPSHOT_REL;
    fs.writeFileSync(path.join(ROOT, ...rel.split("/")), html);
    return { ok: true, rel };
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
})();
if (snapshot && !snapshot.ok) console.error(`  ⓘ --html: could not write the snapshot — ${snapshot.reason}`);

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
        // The grader travels with the grade — §8.9's comparability rule is
        // unenforceable in a journal that records rungs without packs.
        pack: { id: pack.id },
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
    `\n${verdict === "PASS" ? "⚡⚡" : "❌"} verify lane [FAST — INNER LOOP ONLY, NOT DONE]: ${verdict} (skipped: ${fastExcluded.join(", ") || "none"}) — this fast receipt satisfies no done-gate; run the full lane (node qa/verify.mjs) once before you finish`,
  );
} else {
  // The rung NEVER appears without the pack that defines it. §8.9 makes one
  // pack's L2 and another's different claims that must be "shown as such", and
  // this is the line an agent reads on every single run — the surface where a
  // bare rung would do the most quiet damage. Only the pack's ID: `pack.version`
  // is the profile's own or null (ADR-0008), and a null is not worth a column.
  console.log(`\n${verdict === "PASS" ? "✅" : "❌"} verify lane: ${verdict}${level ? ` · ${level.rung} ${level.name} · pack ${pack.id}` : ""}${strengthLabel ? ` (${strengthLabel})` : ""} — receipt written to qa/evidence/latest.json${badge.changed ? ` and ${README_REL_PATH}'s evidence badge refreshed` : ""} (commit ${badge.changed ? "them" : "it"} with your change)`);
  // A GREEN LANE THAT EARNED NO RUNG SAYS WHY, on the line a human is already
  // reading. Silence here is the exact shape of the defect that cost a foreign
  // author their grade — a lane that passed, a rung that never appeared, and
  // nothing anywhere connecting the two (NORTH-STAR §9.2). On a FAILed lane the
  // absence explains itself, so this stays quiet and lets the red row speak.
  if (verdict === "PASS" && !level && grade.why) console.log(`  ⓘ ${grade.why}`);
}

// The snapshot is NAMED when it was asked for — a file written silently is a
// file nobody attaches to anything. Outside the verdict branches, so a --fast
// run that asked for one is told where its own file went (latest-fast.html) as
// plainly as a full run is; `--json` stays one object on stdout.
if (!asJson && snapshot && snapshot.ok) {
  console.log(`  ⓘ snapshot written to ${snapshot.rel} — one self-contained page, no server`);
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
