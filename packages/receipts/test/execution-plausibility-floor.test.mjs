// AN ABSOLUTE WALL-TIME FLOOR CANNOT BE STATED STACK-INDEPENDENTLY.
//
// `minExecutedMs: 5000` refused any PASS receipt whose executed gates summed to
// less, saying "a receipt this fast cannot attest a real lane run". For a Gradle
// lane that is true. For a Go service, a Rust crate, a Python package or a
// TypeScript library it is simply false: those lanes honestly finish in
// hundreds of milliseconds, and the harness accused them of fabricating
// evidence — the one accusation this product cannot afford to make wrongly.
//
// The defect is not the number. It is that ONE receipt does not carry what
// would be needed to choose a number: there is no start time, no top-level
// duration, and no baseline, so nothing on it can be cross-checked against
// anything else on it. `generatedAt` is a timestamp, not an interval. A floor
// is therefore a fact about the STACK, and the validator does not know the
// stack — which is why it must be the notary's policy rather than the
// validator's default.
//
// What survives is everything that IS stack-independent, and those are the
// checks that actually catch fabrication: a receipt with no steps, a receipt
// whose every step is a SKIP or an ERROR, and a step whose duration is not a
// real non-negative number.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExecutionPlausibility, DEFAULT_POLICY } from "../src/receipt-validate.mjs";

/** A real backend lane: five honest gates, 812ms total. Nothing about it is fake. */
const FAST_BUT_HONEST = {
  steps: [
    { name: "harness_integrity", verdict: "PASS", durationMs: 8 },
    { name: "spec_coverage", verdict: "PASS", durationMs: 21 },
    { name: "py_build", verdict: "PASS", durationMs: 143 },
    { name: "py_tests_fast", verdict: "PASS", durationMs: 612 },
    { name: "py_lint", verdict: "PASS", durationMs: 28 },
  ],
};

test("an honest fast lane is not accused of fabricating evidence", () => {
  const r = checkExecutionPlausibility(FAST_BUT_HONEST);
  assert.equal(r.ok, true, `a real 812ms lane must be accepted — got: ${r.detail}`);
  assert.equal(r.executedMs, 812);
  assert.equal(r.executedSteps, 5);
});

test("no absolute floor is asserted by default — the validator does not know the stack", () => {
  assert.equal(
    DEFAULT_POLICY.minExecutedMs,
    null,
    "a default floor is a claim about the stack, and one receipt carries nothing to justify one",
  );
});

test("a notary that HAS a baseline may still set a floor, and it still bites", () => {
  // Gatekeeper sees a repo's receipt history and can say "this lane has taken
  // 30s every time for a month, and today it claims 42ms". That is a real
  // finding — made with data the receipt alone does not carry.
  const r = checkExecutionPlausibility({ steps: [{ name: "build", verdict: "PASS", durationMs: 42 }] }, { minExecutedMs: 5000 });
  assert.equal(r.ok, false);
  assert.match(r.detail, /42ms/, "the measured number is named");
  assert.match(r.detail, /5000ms/, "and so is the floor it was measured against");
  // And the message must attribute the floor to whoever set it, rather than
  // asserting a universal truth about receipts that this module cannot know.
  assert.doesNotMatch(
    r.detail,
    /cannot attest a real lane run/,
    "the validator must not assert that a fast receipt cannot be real — for many stacks it is",
  );
});

test("every stack-independent fabrication check survives untouched", () => {
  const cases = [
    [{ steps: [] }, /no verify-lane steps/, "a receipt with no steps executed nothing"],
    [{ steps: [{ name: "e2e", verdict: "SKIP", durationMs: 0 }] }, /every step .* is a SKIP/, "an all-SKIP lane verified nothing"],
    [{ steps: [{ name: "b", verdict: "PASS", durationMs: -5 }] }, /invalid duration/, "a negative duration is not a measurement"],
    [{ steps: [{ name: "b", verdict: "PASS", durationMs: "fast" }] }, /invalid duration/, "nor is a string"],
    [{ steps: [{ name: "b", verdict: "PASS" }] }, /invalid duration/, "nor is an absent one"],
    [{ steps: [{ name: "b", verdict: "ERROR", durationMs: 1_800_000 }] }, /SKIP|verified nothing/, "thirty wasted minutes are not evidence"],
  ];
  for (const [receipt, pattern, why] of cases) {
    const r = checkExecutionPlausibility(receipt);
    assert.equal(r.ok, false, why);
    assert.match(r.detail, pattern, why);
  }
});

test("the numbers are reported even when nothing is refused, so a notary can decide", () => {
  const r = checkExecutionPlausibility(FAST_BUT_HONEST);
  assert.equal(typeof r.executedMs, "number");
  assert.equal(typeof r.executedSteps, "number");
});
