// A step that executed nothing knows nothing, and must not accuse the change.
// (docs/proposals/evidence-economics.md C3.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { androidChecksOutcome } from "../packages/harness/src/lib/step-outcomes.mjs";

test("PLANTED: the 2026-09-02 collision — Gradle failed, zero tests ran — is 'did not execute', never 'your behavior is broken'", () => {
  const o = androidChecksOutcome({ ok: false, out: "FAILED\nINSTALL_FAILED_UPDATE_INCOMPATIBLE" }, { tests: 0, failures: 0, errors: 0 });
  assert.equal(o.verdict, "FAIL", "still red — a tier that could not execute is not evidence");
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
