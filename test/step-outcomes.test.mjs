// A step that executed nothing knows nothing, and must not accuse the change.
// (docs/proposals/evidence-economics.md C3.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { StepTimeout, androidChecksOutcome, spawnTimedOut, stepDeadlineMs, stepErrorResult } from "../packages/harness/src/lib/step-outcomes.mjs";

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

test("a deadline becomes ONE ERROR row that names the cause and the checks — and does not accuse the change", () => {
  const r = stepErrorResult("releaseBuild", new StepTimeout("./gradlew assembleRelease", 12 * 60_000), 720_100);
  assert.equal(r.verdict, "ERROR");
  assert.equal(r.name, "releaseBuild");
  assert.match(r.reason, /DID NOT COMPLETE — no result within its deadline \(12 min\)/);
  assert.match(r.reason, /not accusing it/);
  assert.match(r.reason, /gradlew --status/);
  assert.match(r.reason, /adb devices/);
  assert.deepEqual(r.details, { executed: false, kind: "deadline" });
});

test("a step that THROWS is an ERROR row too — it used to crash the whole lane", () => {
  const r = stepErrorResult("goldenTrees", new TypeError("Cannot read properties of undefined"), 40);
  assert.equal(r.verdict, "ERROR");
  assert.match(r.reason, /DID NOT RUN — the step threw/);
  assert.match(r.reason, /Cannot read properties of undefined/);
  assert.match(r.reason, /Nothing here is a claim about your change/);
  assert.equal(r.details.kind, "threw");
});
