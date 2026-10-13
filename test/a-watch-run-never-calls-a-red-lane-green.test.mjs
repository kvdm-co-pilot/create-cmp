// INVARIANT: the watch's verdict line agrees with the lane's verdict function.
// A run whose steps make laneVerdict say FAIL never reads "green", and its
// verdict line names every step that turned it red.
//
// formatRunBlock (template/qa/watch.mjs) counts a step as failed only when its
// verdict is "FAIL". laneVerdict (lane-runner.mjs) turns the lane red on FAIL
// OR ERROR. So a fast run whose only red step ERRORed — a step that threw, or
// hit its deadline (stepErrorResult) — prints
//
//   ── watch run #1: FAIL in 1.0s — fast tier green (fast lane — a signal, not evidence)
//
// which tells the agent the tier is green in the same line that says FAIL.
// Two readers deciding "is this step red" differently is the class; the test
// derives red from laneVerdict so the two cannot drift again.
import { test } from "node:test";
import assert from "node:assert/strict";

import { laneVerdict } from "../packages/harness/src/lib/lane-runner.mjs";
import { formatRunBlock } from "../template/qa/watch.mjs";

const VERDICTS = ["PASS", "SKIP", "CACHED", "FAIL", "ERROR"];

function verdictLine(steps) {
  const block = formatRunBlock({
    n: 1,
    startedAtIso: "2026-10-13T00:00:00.000Z",
    trigger: ["composeApp/src/commonMain/kotlin/Foo.kt"],
    receipt: { verdict: laneVerdict(steps), steps },
    exitCode: laneVerdict(steps) === "PASS" ? 0 : 1,
    durationMs: 1000,
  });
  return block.split("\n").find((l) => l.startsWith("── watch run #1:"));
}

for (const red of VERDICTS.filter((v) => laneVerdict([{ verdict: v }]) === "FAIL")) {
  test(`a fast run whose one red step is ${red} is never called green, and the step is named`, () => {
    const steps = [
      { name: "specCoverage", verdict: "PASS", durationMs: 5 },
      { name: "unitTests", verdict: red, durationMs: 5, reason: "DID NOT RUN — the step passed its deadline\nlook at the Gradle daemon" },
    ];
    const line = verdictLine(steps);
    assert.doesNotMatch(line, /green/, `laneVerdict says FAIL and the watch says green:\n${line}`);
    assert.match(line, /unitTests/, `the verdict line does not name the step that turned the run red:\n${line}`);
  });
}

test("a run with no red step is still called green (the property is not vacuous)", () => {
  const line = verdictLine([{ name: "specCoverage", verdict: "PASS", durationMs: 5 }, { name: "a11y", verdict: "SKIP", durationMs: 1, reason: "no screens" }]);
  assert.match(line, /green/);
});
