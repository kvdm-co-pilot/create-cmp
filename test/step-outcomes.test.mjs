// A step that executed nothing knows nothing, and must not accuse the change.
// (docs/proposals/evidence-economics.md C3.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { StepTimeout, spawnTimedOut, stepDeadlineMs, stepErrorResult } from "../packages/harness/src/lib/step-outcomes.mjs";
// Stage 0 PR 6b.2: the instrumented-test verdict reads a Gradle invocation and
// a device's JUnit output, so it is the cmp profile's — the spine keeps only
// the neutral helpers (deadlines, timeouts, throw → one ERROR row).
import { androidChecksOutcome } from "../packages/harness/src/lib/profiles/cmp/android-checks.mjs";

test("PLANTED: the 2026-09-02 collision — Gradle failed, zero tests ran — is 'did not execute', never 'your behavior is broken'", () => {
  const o = androidChecksOutcome({ ok: false, out: "FAILED\nINSTALL_FAILED_UPDATE_INCOMPATIBLE" }, { tests: 0, failures: 0, errors: 0 });
  assert.equal(o.verdict, "ERROR", "the fourth verdict: could not run — still red for the lane, never an accusation");
  assert.equal(o.executed, false);
  assert.match(o.reason, /DID NOT EXECUTE/);
  assert.match(o.reason, /not accusing it/);
  assert.match(o.reason, /connectedDebugAndroidTest --rerun/, "and it hands over the rerun command");
  assert.doesNotMatch(o.reason, /behavior claim is broken/, "the accusation is withdrawn");
});

test("no JUnit results at all reads the same way as zero tests", () => {
  const o = androidChecksOutcome({ ok: false, out: "" }, null);
  assert.equal(o.executed, false);
  assert.match(o.reason, /DID NOT EXECUTE/);
});

test("a real assertion failure keeps the behaviour message — fix the behavior, not the test", () => {
  const o = androidChecksOutcome({ ok: false, out: "IntroLifecycleTest > playsOnce FAILED" }, { tests: 8, failures: 1, errors: 0 });
  assert.equal(o.verdict, "FAIL");
  assert.equal(o.executed, true);
  assert.match(o.reason, /1 of 8 tests/);
  assert.match(o.reason, /behavior claim is broken/);
  assert.match(o.reason, /playsOnce FAILED/, "the failing test rides in the tail");
});

test("a green run is PASS and records that it executed", () => {
  const o = androidChecksOutcome({ ok: true, out: "" }, { tests: 8, failures: 0, errors: 0 });
  assert.equal(o.verdict, "PASS");
  assert.equal(o.executed, true);
  assert.equal(o.reason, undefined);
});

// S4 — deadlines. A step with no bound is a hang waiting to happen: androidChecks
// sat at 0.5% CPU waiting on a device, and the only signal was silence.
test("PLANTED: a subprocess that outlives its deadline is a TIMEOUT, told apart from a real non-zero exit", () => {
  const hung = spawnSync("sleep 5", { shell: true, timeout: 150, killSignal: "SIGTERM" });
  assert.equal(spawnTimedOut(hung), true, "a killed-at-deadline run is a timeout");
  const failed = spawnSync("exit 3", { shell: true, timeout: 5000 });
  assert.equal(spawnTimedOut(failed), false, "a real failure is not");
  const fine = spawnSync("true", { shell: true, timeout: 5000 });
  assert.equal(spawnTimedOut(fine), false);
});

test("the deadline comes from the step's own measured history: ×3, floored at 5 min, capped at 30, unknown gets the cap", () => {
  const MIN = 60_000;
  assert.equal(stepDeadlineMs(52_000), 5 * MIN, "a 52s step still gets five minutes — a cold daemon is slow, not wedged");
  assert.equal(stepDeadlineMs(4 * MIN), 12 * MIN, "three times usual");
  assert.equal(stepDeadlineMs(20 * MIN), 30 * MIN, "never past thirty — past that it IS wedged");
  assert.equal(stepDeadlineMs(null), 30 * MIN, "a first run is never cut short");
  assert.equal(stepDeadlineMs(0), 30 * MIN);
});

test("a deadline becomes ONE ERROR row that names the cause and the PACK's checks — and does not accuse the change", () => {
  // Stage 0 PR 6b.2: where to look is the pack's to say. The spine used to end
  // this message with "check `./gradlew --status` and `adb devices`" — confident
  // wrong advice in a repo that has neither.
  const hint = "A wedged Gradle daemon or a device that stopped answering are the usual causes; check `./gradlew --status` and `adb devices`.";
  const r = stepErrorResult("releaseBuild", new StepTimeout("./gradlew assembleRelease", 12 * 60_000), 720_100, { hint });
  assert.equal(r.verdict, "ERROR");
  assert.equal(r.name, "releaseBuild");
  assert.match(r.reason, /DID NOT COMPLETE — no result within its deadline \(12 min\)/);
  assert.match(r.reason, /not accusing it/);
  assert.match(r.reason, /gradlew --status/);
  assert.match(r.reason, /adb devices/);
  assert.match(r.reason, /Re-run the step alone/);
  assert.deepEqual(r.details, { executed: false, kind: "deadline" });
});

test("with NO hint the message says what it honestly knows and stops — no build tool, no device, no invented advice", () => {
  const r = stepErrorResult("integrationTests", new StepTimeout("./mvnw verify", 9 * 60_000), 540_000);
  assert.equal(r.verdict, "ERROR");
  assert.match(r.reason, /DID NOT COMPLETE — no result within its deadline \(9 min\)/);
  assert.match(r.reason, /not accusing it/);
  assert.match(r.reason, /Re-run the step alone/);
  for (const tool of [/gradlew/, /adb/, /Gradle/, /daemon/]) {
    assert.doesNotMatch(r.reason, tool, `a hintless step must not be told to check ${tool}`);
  }
  assert.match(r.reason, /\.\/mvnw verify/, "it still names the command that did not return");
});

test("the cmp pack marks its build and device steps with its own where-to-look sentence", async () => {
  const { createCmpSteps } = await import("../packages/harness/src/lib/profiles/cmp/steps-cmp.mjs");
  const pack = createCmpSteps({
    ROOT: process.cwd(), HERE: process.cwd(), fast: false, determinism: false, profile: "local", mode: "full",
    sh: () => ({ ok: true, out: "" }), tryGit: () => null, tryGitLines: () => [], DEGRADED_PATHS: [],
  });
  for (const [name, fn] of Object.entries(pack.STEP_FN_BY_NAME)) {
    assert.match(fn.timeoutHint ?? "", /gradlew --status/, `${name} carries the pack's hint`);
  }
});

test("a step that THROWS is an ERROR row too — it used to crash the whole lane", () => {
  const r = stepErrorResult("goldenTrees", new TypeError("Cannot read properties of undefined"), 40);
  assert.equal(r.verdict, "ERROR");
  assert.match(r.reason, /DID NOT RUN — the step threw/);
  assert.match(r.reason, /Cannot read properties of undefined/);
  assert.match(r.reason, /Nothing here is a claim about your change/);
  assert.equal(r.details.kind, "threw");
});

// ── Maestro directory run → per-flow outcome ────────────────────────────────
import { parseMaestroJunit, maestroOutcome } from "../packages/harness/src/lib/profiles/cmp/maestro.mjs";

const JUNIT_ALL_GREEN = `<?xml version="1.0"?><testsuites><testsuite name="Test Suite" tests="3" failures="0">
<testcase id="meals" name="meals" classname="meals" status="SUCCESS"/>
<testcase id="smoke" name="smoke" classname="smoke" status="SUCCESS"/>
<testcase id="week" name="week" classname="week" status="SUCCESS"/>
</testsuite></testsuites>`;
const JUNIT_ONE_RED = JUNIT_ALL_GREEN.replace(
  '<testcase id="week" name="week" classname="week" status="SUCCESS"/>',
  '<testcase id="week" name="week" classname="week" status="ERROR"><failure message="Assertion is false: id: week_title">Element not found</failure></testcase>',
);
const FLOWS = ["qa/e2e/meals.yaml", "qa/e2e/smoke.yaml", "qa/e2e/week.yaml"];

test("parseMaestroJunit: one row per flow, failure message carried; missing/unparsable → null, never a fabricated list", () => {
  assert.deepEqual(parseMaestroJunit(JUNIT_ALL_GREEN), [{ flow: "meals", ok: true }, { flow: "smoke", ok: true }, { flow: "week", ok: true }]);
  const red = parseMaestroJunit(JUNIT_ONE_RED);
  assert.deepEqual(red[2], { flow: "week", ok: false, message: "Assertion is false: id: week_title" });
  assert.equal(parseMaestroJunit(null), null);
  assert.equal(parseMaestroJunit("<testsuites/>"), null);
});

test("maestroOutcome: PASS lists every flow; PLANTED one red flow → FAIL naming it; fewer rows than flows → ERROR, not a claim", () => {
  const pass = maestroOutcome({ ok: true, out: "" }, parseMaestroJunit(JUNIT_ALL_GREEN), FLOWS);
  assert.equal(pass.verdict, "PASS");
  assert.deepEqual(pass.details.flows, FLOWS);
  assert.equal(pass.details.results.length, 3);

  const fail = maestroOutcome({ ok: false, out: "boom" }, parseMaestroJunit(JUNIT_ONE_RED), FLOWS);
  assert.equal(fail.verdict, "FAIL");
  assert.match(fail.reason, /1 of 3 flows failed — week \(Assertion is false: id: week_title\)/);

  const partial = maestroOutcome({ ok: true, out: "" }, parseMaestroJunit(JUNIT_ALL_GREEN), [...FLOWS, "qa/e2e/extra.yaml"]);
  assert.equal(partial.verdict, "ERROR");
  assert.match(partial.reason, /reported 3 flows but qa\/e2e holds 4/);

  const noReport = maestroOutcome({ ok: false, out: "driver died" }, null, FLOWS);
  assert.equal(noReport.verdict, "FAIL");
  assert.match(noReport.reason, /no per-flow report was written/);
  const noReportGreen = maestroOutcome({ ok: true, out: "" }, null, FLOWS);
  assert.equal(noReportGreen.verdict, "PASS");
  assert.match(noReportGreen.reason, /verdict from the exit code only/);
});

// ── The post-run device-log sweep is scoped to the app under test ───────────
import { deviceLogIncidents } from "../packages/harness/src/lib/profiles/cmp/maestro.mjs";

test("PLANTED (2026-09-03, first self-booted lane): an ANR in ANOTHER app on the emulator is not our red; our own ANR and our own FATAL EXCEPTION are", () => {
  const log = [
    "09-03 19:39:29.594   527  2969 E ActivityManager: ANR in com.karel.bratometer",
    "09-03 19:39:30.000   527  2969 E ActivityManager: ANR in com.fleet.check:remote",
    "09-03 19:39:31.000  1234  1234 E AndroidRuntime: FATAL EXCEPTION: main",
    "09-03 19:39:31.001  1234  1234 E AndroidRuntime: Process: com.other.app, PID: 1234",
    "09-03 19:39:32.000  2222  2222 E AndroidRuntime: FATAL EXCEPTION: main",
    "09-03 19:39:32.001  2222  2222 E AndroidRuntime: Process: com.fleet.check, PID: 2222",
  ].join("\n");
  const ours = deviceLogIncidents(log, ["com.fleet.check"]);
  assert.equal(ours.scoped, true);
  assert.deepEqual(ours.lines, [
    "09-03 19:39:30.000   527  2969 E ActivityManager: ANR in com.fleet.check:remote",
    "09-03 19:39:32.000  2222  2222 E AndroidRuntime: FATAL EXCEPTION: main",
  ]);
  const unscoped = deviceLogIncidents(log, []);
  assert.equal(unscoped.scoped, false);
  assert.equal(unscoped.lines.length, 4, "with no appId known, every incident counts — and the reason says so");
  assert.deepEqual(deviceLogIncidents("", ["com.fleet.check"]).lines, []);
  assert.equal(deviceLogIncidents(log, ["__PACKAGE__"]).scoped, false, "an unreplaced token is not an app id");
});
