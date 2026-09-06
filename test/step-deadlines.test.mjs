// HOW LONG IS TOO LONG IS A FACT ABOUT THE STACK.
//
// `stepDeadlineMs` derives a step's deadline from its own measured history —
// three times what it usually takes — which is exactly right and stack-free.
// The GUARDS on that derivation were not: never under five minutes, never over
// thirty, and an unknown step gets the ceiling. Thirty minutes is a judgement
// about how long a build can honestly take before it is wedged, and it was made
// once, for one toolchain. A cold `xcodebuild`, a cold `cargo test` against an
// empty target dir, or a Gradle daemon starting on a cold CI runner can all
// exceed it honestly — and the lane kills the step and writes an ERROR row,
// which is a wrong verdict about a healthy build.
//
// The function has always accepted overrides. Nothing supplied them: there was
// no channel from the profile to this call, so the numbers were unreachable
// from the place that knows the stack. That is the defect — not the constants.
//
// This file follows the precedent already set one function below, in
// `stepErrorResult`: "WHERE TO LOOK is the pack's to say, never the spine's."
// So is how long to wait.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { stepDeadlineMs, resolveStepDeadlines, DEFAULT_STEP_DEADLINES, stepErrorResult, StepTimeout } from "../packages/harness/src/lib/step-outcomes.mjs";
import { runLane } from "../packages/harness/src/lib/lane-runner.mjs";
import * as cmp from "../packages/harness/src/lib/profiles/cmp/index.mjs";

const MIN = 60_000;

test("a pack may declare its own bounds — a cold toolchain is not killed at thirty minutes", () => {
  // The falsifying case: an Xcode or Rust pack whose first run legitimately
  // takes an hour. Under the old ceiling it was cut short and told its build
  // was wedged.
  const slow = resolveStepDeadlines({ floorMs: 10 * MIN, ceilingMs: 180 * MIN });
  assert.equal(stepDeadlineMs(null, slow), 180 * MIN, "an unmeasured step gets THIS pack's ceiling");
  assert.equal(stepDeadlineMs(90 * MIN, slow), 180 * MIN, "and 3x a 90-minute step is capped there, not at 30");
  assert.equal(stepDeadlineMs(1000, slow), 10 * MIN, "and the floor is this pack's too");
});

test("a pack that declares nothing keeps today's numbers exactly", () => {
  const fallback = resolveStepDeadlines(undefined);
  assert.equal(fallback.floorMs, 5 * MIN);
  assert.equal(fallback.ceilingMs, 30 * MIN);
  assert.equal(fallback.isDefault, true, "and it KNOWS it inherited them");
  // The historical assertions, unchanged — this is the no-regression guard.
  assert.equal(stepDeadlineMs(52_000, fallback), 5 * MIN);
  assert.equal(stepDeadlineMs(4 * MIN, fallback), 12 * MIN);
  assert.equal(stepDeadlineMs(20 * MIN, fallback), 30 * MIN);
  assert.equal(stepDeadlineMs(null, fallback), 30 * MIN);
});

test("a partial declaration takes what it names and inherits the rest, and is not 'default'", () => {
  const partial = resolveStepDeadlines({ ceilingMs: 120 * MIN });
  assert.equal(partial.ceilingMs, 120 * MIN);
  assert.equal(partial.floorMs, DEFAULT_STEP_DEADLINES.floorMs, "the unnamed bound falls back");
  assert.equal(partial.isDefault, false, "a pack that declared anything has chosen, so it is not told about the knob");
});

test("a malformed declaration is refused into the fallback rather than trusted", () => {
  for (const bad of [{ ceilingMs: -1 }, { ceilingMs: "an hour" }, { floorMs: 0 }, { ceilingMs: NaN }, null, 42, "x"]) {
    const r = resolveStepDeadlines(bad);
    assert.equal(r.ceilingMs, DEFAULT_STEP_DEADLINES.ceilingMs, `${JSON.stringify(bad)} must not become a deadline`);
    assert.equal(r.floorMs, DEFAULT_STEP_DEADLINES.floorMs);
  }
  // A floor above the ceiling is incoherent; the ceiling wins, because cutting
  // a step short is the failure this whole mechanism exists to avoid.
  const inverted = resolveStepDeadlines({ floorMs: 90 * MIN, ceilingMs: 10 * MIN });
  assert.ok(stepDeadlineMs(1000, inverted) <= inverted.ceilingMs, "no deadline may exceed the declared ceiling");
});

test("the ERROR row names the knob when the deadline was inherited, and does not when it was chosen", () => {
  // The half of this defect that is not a number: a killed step gave an adopter
  // no way to learn the bound existed, let alone that it was someone else's.
  const err = new StepTimeout("cargo test --all", 30 * MIN);
  const inherited = stepErrorResult("slow_tests", err, 30 * MIN, { deadlineWasDefault: true });
  assert.match(inherited.reason, /stepDeadlines/, "the adopter must be told which knob to turn");
  assert.equal(inherited.verdict, "ERROR");

  const chosen = stepErrorResult("slow_tests", err, 30 * MIN, { deadlineWasDefault: false });
  assert.doesNotMatch(chosen.reason, /stepDeadlines/, "a pack that already chose is not lectured about its own choice");
  // Everything the row said before is still said.
  for (const r of [inherited.reason, chosen.reason]) {
    assert.match(r, /DID NOT COMPLETE/);
    assert.match(r, /is not accusing it/);
    assert.match(r, /cargo test --all/);
  }
});

test("the runner reads the pack's bounds — the channel that did not exist", () => {
  // stepDeadlineMs always took overrides; nothing supplied them. This asserts
  // the wiring, which is the whole finding.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deadline-"));
  try {
    const seen = [];
    const step = Object.defineProperty(() => ({ name: "slow_build", verdict: "PASS", durationMs: 1 }), "name", { value: "slow_build" });
    runLane({
      steps: [step],
      markerPath: path.join(dir, "marker"),
      expected: { byName: new Map(), laneMs: null },
      setDeadline: (ms) => seen.push(ms),
      stepDeadlines: { floorMs: 10 * MIN, ceilingMs: 180 * MIN },
    });
    assert.deepEqual(seen, [180 * MIN], "an unmeasured step got the PACK's ceiling, not the spine's");

    const legacy = [];
    runLane({
      steps: [step],
      markerPath: path.join(dir, "marker2"),
      expected: { byName: new Map(), laneMs: null },
      setDeadline: (ms) => legacy.push(ms),
    });
    assert.deepEqual(legacy, [30 * MIN], "and a caller that declares nothing is unchanged");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the cmp pack owns its numbers rather than inheriting them", () => {
  // The pack builds real paths from its ctx, so it gets a real (throwaway) one.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-pack-"));
  const pack = cmp.steps({
    ROOT: root,
    HERE: path.join(root, "qa"),
    fast: false,
    determinism: false,
    profile: "smoke",
    mode: "smoke",
    sh: () => ({ status: 0, stdout: "", stderr: "" }),
    tryGit: () => "",
    tryGitLines: () => [],
    DEGRADED_PATHS: [],
  });
  fs.rmSync(root, { recursive: true, force: true });
  assert.ok(pack.stepDeadlines, "cmp declares its bounds");
  const r = resolveStepDeadlines(pack.stepDeadlines);
  assert.equal(r.floorMs, 5 * MIN, "and they are exactly today's, so the shipped lane does not move");
  assert.equal(r.ceilingMs, 30 * MIN);
  assert.equal(r.isDefault, false, "declared, not inherited — the numbers are now a choice with an owner");
});
