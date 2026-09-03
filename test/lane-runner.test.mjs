// The lane's step loop as a function (evidence-economics S8a) — the spine,
// separated from the steps. Proven here with FAKE steps and a REAL marker
// file: what the runner does around a step is identical for a Compose app and
// a Kotlin backend, and that is the point of it existing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expectedDurations, laneVerdict, runLane, stepDisplayName, verdictMark } from "../packages/harness/src/lib/lane-runner.mjs";
import { StepTimeout } from "../packages/harness/src/lib/step-outcomes.mjs";

function markerIn(dir) {
  return path.join(dir, "composeApp", "build", ".cmp-lane-in-progress");
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cmp-runner-"));
const ok = (name) => Object.defineProperty(() => ({ name, verdict: "PASS", durationMs: 1 }), "name", { value: `step${name[0].toUpperCase()}${name.slice(1)}` });

test("names: stepUnitTests → unitTests, the Memo suffix is dropped, anonymous is null", () => {
  assert.equal(stepDisplayName(function stepUnitTests() {}), "unitTests");
  assert.equal(stepDisplayName(function stepSpecCoverageMemo() {}), "specCoverage");
  assert.equal(stepDisplayName(() => {}), null);
});

test("expectedDurations: the LAST FULL run's per-step durations; fast runs and old-format entries are passed over", () => {
  const e = expectedDurations([
    { mode: "full", durationMs: 90_000, steps: [{ name: "build", durationMs: 50_000 }] },
    { mode: "full", durationMs: 120_000, steps: [{ name: "build", durationMs: 70_000 }, { name: "unitTests", durationMs: 20_000 }] },
    { mode: "fast", durationMs: 5_000, steps: [{ name: "build", durationMs: 1 }] },
  ]);
  assert.equal(e.byName.get("build"), 70_000);
  assert.equal(e.byName.get("unitTests"), 20_000);
  assert.equal(e.laneMs, 120_000);
  assert.deepEqual([...expectedDurations([]).byName.keys()], []);
});

test("runLane: rows in order; the marker carries each step's narration while it runs and is gone after", () => {
  const dir = tmp();
  const seen = [];
  const peek = Object.defineProperty(
    () => {
      seen.push(JSON.parse(fs.readFileSync(markerIn(dir), "utf8")));
      return { name: "peek", verdict: "PASS", durationMs: 1 };
    },
    "name",
    { value: "stepPeek" },
  );
  const deadlines = [];
  const lane = runLane({
    steps: [ok("build"), peek, ok("unitTests")],
    markerPath: markerIn(dir),
    expected: { byName: new Map([["peek", 4 * 60_000]]), laneMs: 300_000 },
    setDeadline: (ms) => deadlines.push(ms),
    print: null,
  });
  assert.deepEqual(lane.steps.map((s) => s.name), ["build", "peek", "unitTests"]);
  assert.equal(lane.verdict, "PASS");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].step, "peek");
  assert.equal(seen[0].index, 2);
  assert.equal(seen[0].total, 3);
  assert.equal(seen[0].expectedStepMs, 4 * 60_000, "the marker quotes the journal, never a guess");
  assert.equal(seen[0].expectedLaneMs, 300_000);
  assert.ok(!fs.existsSync(markerIn(dir)), "the marker never outlives the loop");
  assert.deepEqual(deadlines, [30 * 60_000, 12 * 60_000, 30 * 60_000], "unknown → the 30-min ceiling; 4 min → ×3");
});

test("PLANTED: a step that THROWS is one ERROR row named after the step; the lane keeps going and FAILs", () => {
  const dir = tmp();
  const boom = Object.defineProperty(
    () => {
      throw new TypeError("Cannot read properties of undefined");
    },
    "name",
    { value: "stepGoldenTrees" },
  );
  const lines = [];
  const lane = runLane({ steps: [ok("build"), boom, ok("a11y")], markerPath: markerIn(dir), print: (l) => lines.push(l) });
  assert.deepEqual(lane.steps.map((s) => s.verdict), ["PASS", "ERROR", "PASS"], "the throw did not end the lane");
  assert.equal(lane.steps[1].name, "goldenTrees");
  assert.match(lane.steps[1].reason, /DID NOT RUN — the step threw/);
  assert.equal(lane.verdict, "FAIL", "could not check is not green");
  assert.match(lines[1], /^⊘ goldenTrees: ERROR — DID NOT RUN/, "and it wears the could-not-run mark, not ✗");
});

test("PLANTED: a deadline (StepTimeout) is an ERROR row that does not accuse the change", () => {
  const dir = tmp();
  const slow = Object.defineProperty(
    () => {
      throw new StepTimeout("./gradlew assembleRelease", 12 * 60_000);
    },
    "name",
    { value: "stepReleaseBuild" },
  );
  const lane = runLane({ steps: [slow], markerPath: markerIn(dir), print: null });
  assert.equal(lane.steps[0].verdict, "ERROR");
  assert.match(lane.steps[0].reason, /DID NOT COMPLETE — no result within its deadline \(12 min\)/);
  assert.match(lane.steps[0].reason, /not accusing it/);
});

test("a FAILed build short-circuits — nothing downstream is meaningful — and onFinally still runs", () => {
  const dir = tmp();
  let finalized = 0;
  const bad = Object.defineProperty(() => ({ name: "build", verdict: "FAIL", reason: "compile error", durationMs: 1 }), "name", { value: "stepBuild" });
  const lane = runLane({ steps: [bad, ok("unitTests")], markerPath: markerIn(dir), print: null, onFinally: () => (finalized += 1) });
  assert.deepEqual(lane.steps.map((s) => s.name), ["build"]);
  assert.equal(lane.verdict, "FAIL");
  assert.equal(finalized, 1);
  assert.ok(!fs.existsSync(markerIn(dir)));
});

test("onFinally runs even when a step throws, and a throwing finalizer never hides the rows", () => {
  const dir = tmp();
  let ran = false;
  const boom = Object.defineProperty(() => { throw new Error("x"); }, "name", { value: "stepConformance" });
  const lane = runLane({
    steps: [boom],
    markerPath: markerIn(dir),
    print: null,
    onFinally: () => {
      ran = true;
      throw new Error("finalizer exploded");
    },
  });
  assert.equal(ran, true);
  assert.equal(lane.steps.length, 1);
});

test("verdicts: CACHED counts as PASS; SKIP never fails; FAIL and ERROR do", () => {
  assert.equal(laneVerdict([{ verdict: "PASS" }, { verdict: "CACHED" }, { verdict: "SKIP" }]), "PASS");
  assert.equal(laneVerdict([{ verdict: "PASS" }, { verdict: "FAIL" }]), "FAIL");
  assert.equal(laneVerdict([{ verdict: "PASS" }, { verdict: "ERROR" }]), "FAIL");
  assert.deepEqual(["PASS", "CACHED", "SKIP", "ERROR", "FAIL"].map(verdictMark), ["✓", "⚡", "→", "⊘", "✗"]);
});

test("layer: a step function tagged with fn.layer stamps its receipt row; a row that names its own layer keeps it; untagged rows carry none", () => {
  const dir = tmp();
  const backend = Object.defineProperty(() => ({ name: "compositeBuild", verdict: "PASS", durationMs: 1 }), "name", { value: "stepCompositeBuild" });
  backend.layer = "backend";
  const selfTagged = Object.defineProperty(() => ({ name: "gitleaks", verdict: "PASS", durationMs: 1, layer: "security" }), "name", { value: "stepGitleaks" });
  selfTagged.layer = "wrong";
  const lane = runLane({
    steps: [backend, selfTagged, ok("plain")],
    markerPath: markerIn(dir),
    expected: { byName: new Map(), laneMs: null },
    setDeadline: () => {},
    print: null,
  });
  assert.deepEqual(lane.steps.map((s) => s.layer), ["backend", "security", undefined]);
});
