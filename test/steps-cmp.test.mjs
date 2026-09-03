// The CMP step pack (evidence-economics S8b). Constructing the pack must
// EXECUTE NOTHING — no Gradle, no adb, no git — and hand back the lane's
// composition by name, so the same spine can be handed a different pack.
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

import { createCmpSteps } from "../packages/harness/src/lib/steps-cmp.mjs";
import { stepDisplayName } from "../packages/harness/src/lib/lane-runner.mjs";

function ctx(overrides = {}) {
  const trap = (what) => () => {
    throw new Error(`${what} must not run while the pack is only being constructed`);
  };
  return {
    ROOT: os.tmpdir(),
    HERE: os.tmpdir(),
    GRADLEW: "./gradlew",
    RERUN: " --rerun",
    fast: false,
    determinism: false,
    profile: "local",
    mode: "full",
    sh: trap("sh"),
    shGradle: trap("shGradle"),
    tryGit: trap("tryGit"),
    tryGitLines: trap("tryGitLines"),
    DEGRADED_PATHS: [],
    ...overrides,
  };
}

test("constructing the pack runs nothing — every borrowed helper is a trap and none fires", () => {
  const pack = createCmpSteps(ctx());
  assert.ok(pack.stepsForProfile.local.length > 0);
});

test("the profiles, by name and in order — the cheap tier before releaseBuild, device steps last, nightly = ci", () => {
  const pack = createCmpSteps(ctx());
  const names = (profile) => pack.stepsForProfile[profile].map(stepDisplayName);
  assert.deepEqual(names("scaffold"), ["harnessIntegrity", "specCoverage", "approvals", "componentStories", "reachability", "archDoc", "schemaHistory", "build", "unitTests"]);
  // smoke (GATE-RULES Rule 0): every pure-Node gate and NO Gradle — the lane that proves the framework returns.
  assert.deepEqual(names("smoke"), ["harnessIntegrity", "specCoverage", "approvals", "componentStories", "reachability", "archDoc", "schemaHistory"]);
  assert.ok(!names("smoke").includes("build") && !names("smoke").includes("unitTests"), "smoke never touches Gradle");
  assert.deepEqual(names("local"), [
    "harnessIntegrity", "specCoverage", "approvals", "componentStories", "reachability", "archDoc", "schemaHistory",
    "build", "unitTests", "conformance", "goldenTrees", "tokenDrift", "a11y", "releaseBuild", "e2eSmoke", "androidChecks",
  ]);
  assert.deepEqual(names("ci"), [...names("local"), "determinism"]);
  assert.deepEqual(names("nightly"), names("ci"));
  assert.deepEqual(names("release"), [...names("ci"), "auditCadence", "releaseSmoke"]);
});

test("the device/slow tier is one list, and every fast-excluded name maps to a function", () => {
  const pack = createCmpSteps(ctx());
  assert.deepEqual(pack.DEVICE_STEPS, ["e2eSmoke", "tokenDrift", "androidChecks", "releaseSmoke"]);
  assert.deepEqual(pack.FAST_EXCLUDED_NAMES, [...pack.DEVICE_STEPS, "releaseBuild"]);
  for (const n of pack.FAST_EXCLUDED_NAMES) assert.equal(typeof pack.STEP_FN_BY_NAME[n], "function", n);
});

test("releaseLease is safe with no lease held, and the determinism probe is exposed for the bare run", () => {
  const pack = createCmpSteps(ctx());
  assert.doesNotThrow(() => pack.releaseLease());
  assert.equal(typeof pack.stepDeterminism, "function");
  // Opt-in and unrequested: the probe SKIPs without touching Gradle.
  const r = pack.stepDeterminism();
  assert.equal(r.verdict, "SKIP");
  assert.match(r.reason, /opt-in/);
});

test("layers: every step in every profile carries the layer it proves — device steps `device`, the harness's own checks `spine`, the app's JVM tier `compose`", () => {
  const pack = createCmpSteps(ctx());
  const seen = new Map();
  for (const [profile, fns] of Object.entries(pack.stepsForProfile)) {
    for (const fn of fns) {
      assert.equal(typeof fn.layer, "string", `${profile}: ${stepDisplayName(fn)} has no layer`);
      seen.set(stepDisplayName(fn), fn.layer);
    }
  }
  for (const name of pack.DEVICE_STEPS) assert.equal(seen.get(name), "device", name);
  assert.equal(seen.get("harnessIntegrity"), "spine");
  assert.equal(seen.get("specCoverage"), "spine");
  assert.equal(seen.get("approvals"), "spine");
  assert.equal(seen.get("archDoc"), "spine");
  assert.equal(seen.get("build"), "compose");
  assert.equal(seen.get("unitTests"), "compose");
  assert.equal(seen.get("releaseBuild"), "compose");
  assert.equal(seen.get("determinism"), "spine");
});
