// The lane's own argument surface has to be internally consistent.
//
// It was not: 0.13.0 added `--no-journal`, wired its consumer, and never added
// it to RECOGNIZED_FLAGS. The strict unknown-argument check — which exists to
// catch typos — then rejected a flag the harness itself passes, so qa/watch.mjs
// exited 2 on every save without ever running the lane. The daily inner loop
// was dead for a whole release and nothing noticed, because no test read the
// two lists against each other.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifySrc = fs.readFileSync(path.join(REPO_ROOT, "packages/harness/src/verify.mjs"), "utf8");
const watchSrc = fs.readFileSync(path.join(REPO_ROOT, "packages/harness/src/watch.mjs"), "utf8");
// S8b: the CMP steps and their profile compositions live in the step pack now.
const packSrc = fs.readFileSync(path.join(REPO_ROOT, "packages/harness/src/lib/profiles/cmp/steps-cmp.mjs"), "utf8");

/** The flags verify.mjs declares it accepts. */
function recognizedFlags() {
  const m = verifySrc.match(/const RECOGNIZED_FLAGS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, "RECOGNIZED_FLAGS must be a literal Set the tests can read");
  return new Set([...m[1].matchAll(/"(--[a-z0-9-]+)"/g)].map((x) => x[1]));
}

/** Every flag verify.mjs actually reads out of its own argv. */
function consumedFlags() {
  return new Set([...verifySrc.matchAll(/args\.includes\("(--[a-z0-9-]+)"\)/g)].map((m) => m[1]));
}

test("every flag verify.mjs CONSUMES is one it RECOGNIZES", () => {
  const recognized = recognizedFlags();
  const missing = [...consumedFlags()].filter((f) => !recognized.has(f));
  assert.deepEqual(
    missing,
    [],
    `consumed but not recognized — the lane would reject its own flag: ${missing.join(", ")}`,
  );
});

test("every flag qa/watch.mjs passes to the lane is accepted by the lane", () => {
  // The exact failure: watch spawns `--fast --json --no-journal`, and the lane
  // rejected the third.
  const spawnLine = watchSrc.match(/spawn\(\s*process\.execPath,\s*\[([^\]]*)\]/s);
  assert.ok(spawnLine, "watch.mjs must spawn the lane with a literal arg list");
  const passed = [...spawnLine[1].matchAll(/"(--[a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(passed.length > 0, "watch passes at least one flag");

  const recognized = recognizedFlags();
  const rejected = passed.filter((f) => !recognized.has(f));
  assert.deepEqual(
    rejected,
    [],
    `watch.mjs would exit 2 on every save — lane rejects: ${rejected.join(", ")}`,
  );
});

test("every recognized flag is documented in --help", () => {
  const usage = verifySrc.match(/const USAGE = `([\s\S]*?)`;/);
  assert.ok(usage, "verify.mjs has a USAGE block");
  const undocumented = [...recognizedFlags()].filter((f) => !usage[1].includes(f));
  assert.deepEqual(undocumented, [], `recognized but undocumented: ${undocumented.join(", ")}`);
});

// The slowest step used to run ninth of sixteen, AHEAD of unit tests,
// conformance, goldens and a11y — so a red unit test was reported only once R8
// had finished. Order costs nothing on a green run and buys back every minute
// on a red one. Pinned on the local profile literal, which ci and release extend.
test("local profile: the cheap high-signal tier reports before releaseBuild", () => {
  const m = packSrc.match(/local: \[([\s\S]*?)\n  \],/);
  assert.ok(m, "the local profile is a literal array the test can read (in the step pack since S8b)");
  const order = [...m[1].matchAll(/\bstep([A-Za-z0-9]+?)(?:Memo)?,/g)].map((x) => x[1]);
  const at = (name) => order.indexOf(name);
  for (const cheap of ["UnitTests", "Conformance", "GoldenTrees", "A11y"]) {
    assert.ok(at(cheap) >= 0, `${cheap} is in the local profile`);
    assert.ok(at(cheap) < at("ReleaseBuild"), `${cheap} (${at(cheap)}) reports before releaseBuild (${at("ReleaseBuild")})`);
  }
  assert.ok(at("Build") < at("UnitTests"), "the debug build still precedes the tests that need it");
});

// S4 — the fourth verdict and the deadline are wired where they must be —
// and after S8a, WHERE they must be is the runner, not this file.
const runnerSrc = fs.readFileSync(path.join(REPO_ROOT, "packages/harness/src/lib/lane-runner.mjs"), "utf8");
test("the lane: sh() throws on a deadline; the RUNNER sets it per step, catches into ERROR, fails the lane on ERROR, and wears the mark", () => {
  assert.match(verifySrc, /timeout: CURRENT_STEP_DEADLINE_MS/, "every subprocess inherits the running step's deadline");
  assert.match(verifySrc, /if \(spawnTimedOut\(res\)\) throw new StepTimeout/, "a deadline is thrown, never read as a failed exit");
  assert.match(verifySrc, /setDeadline: \(ms\) => \{\s*CURRENT_STEP_DEADLINE_MS = ms;/, "verify.mjs hands the runner the slot sh() reads");
  assert.match(verifySrc, /const lane = runLane\(\{/, "verify.mjs composes the runner");
  assert.doesNotMatch(verifySrc, /stepErrorResult\(/, "and no longer owns the catch — the spine does");
  assert.match(runnerSrc, /setDeadline\(stepDeadlineMs\(expected\.byName\.get\(name\)\)\)/, "the deadline is set per step from its own history");
  assert.match(runnerSrc, /result = stepErrorResult\(name, err, Date\.now\(\) - stepStarted\)/, "the loop catches into ERROR and keeps going");
  assert.match(runnerSrc, /s\.verdict === "FAIL" \|\| s\.verdict === "ERROR"\)\) \? "FAIL" : "PASS"/, "ERROR fails the lane");
  assert.match(runnerSrc, /verdict === "ERROR" \? "⊘"/, "and wears its own mark");
});

// S6 — the nightly stage, and the receipt naming what it attests.
test("nightly: a profile that forces the determinism probe and names its stage on the receipt", () => {
  assert.match(packSrc, /stepsForProfile\.nightly = \[\.\.\.stepsForProfile\.ci\]/, "same steps as ci — what differs is what is forced and what the receipt may mean");
  assert.match(verifySrc, /const determinism = args\.includes\("--determinism"\) \|\| profile === "nightly"/, "the probe is not opt-in at nightly");
  assert.match(verifySrc, /stage: STAGE_OF_PROFILE\[profile\] \?\? profile/, "every receipt names its stage");
  assert.match(verifySrc, /smoke: "smoke", scaffold: "scaffold", local: "change", ci: "merge", nightly: "nightly", release: "release"/, "the mapping is stated once");
  assert.match(verifySrc, /use smoke \| scaffold \| local \| ci \| nightly \| release/, "and the profile vocabulary admits it");
});

// S8b — the split itself: verify.mjs is the spine and owns no step; the pack
// owns every step and borrows the spine's helpers explicitly.
test("S8b: verify.mjs defines no step; the pack defines them all and is composed with an explicit ctx", () => {
  assert.doesNotMatch(verifySrc, /^function step[A-Z]/m, "no step body lives in the spine");
  assert.doesNotMatch(verifySrc, /^const step[A-Z]\w* = /m);
  // Stage 0 PR 2: the pack is no longer named — it is whatever profile the
  // manifest declares, loaded by id. The borrowing is still one visible line;
  // what changed is that the spine no longer knows the pack's name.
  // Stage 0 PR 6a: the ctx carries no build tool. GRADLEW, the --rerun flag and
  // the KSP/render coexistence wrapper were the spine knowing what Gradle is;
  // they are the pack's now, built from `fast` and the profile's own buildDir.
  assert.match(verifySrc, /const pack = loaded\.profile\.steps\(\{ ROOT, HERE, fast, determinism, profile, mode, sh, tryGit, tryGitLines, DEGRADED_PATHS \}\)/, "the borrowing is visible in one line");
  for (const gradleism of [/\bGRADLEW\b/, /\bshGradle\b/, /const RERUN =/, /kspCaches/]) {
    assert.doesNotMatch(verifySrc.replace(/^\s*\/\/.*$/gm, ""), gradleism, `the spine carries no build-tool knowledge: ${gradleism}`);
  }
  assert.doesNotMatch(verifySrc, /createCmpSteps/, "the spine names no profile");
  assert.match(verifySrc, /onFinally: \(\) => pack\.releaseLease\(\)/, "the device lease is the pack's; the spine only asks it to let go");
  assert.match(verifySrc, /probe = pack\.stepDeterminism\(\)/, "the bare probe goes through the pack too");
  for (const name of ["stepHarnessIntegrity", "stepSpecCoverage", "stepBuild", "stepReleaseBuild", "stepUnitTests", "stepTokenDrift", "stepE2eSmoke", "stepAndroidChecks", "stepReleaseSmoke", "stepDeterminism", "stepAuditCadence"]) {
    assert.match(packSrc, new RegExp(`function ${name}\\(`), `${name} is in the pack`);
  }
  assert.match(packSrc, /export function createCmpSteps\(ctx\)/);
  assert.doesNotMatch(packSrc, /process\.argv|RECOGNIZED_FLAGS|writeFileSync\(path\.join\(EVIDENCE_DIR/, "the pack reads no argv and writes no receipt");
});
