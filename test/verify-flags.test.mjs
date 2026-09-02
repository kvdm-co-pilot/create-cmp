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
  const m = verifySrc.match(/local: \[([\s\S]*?)\n  \],/);
  assert.ok(m, "the local profile is a literal array the test can read");
  const order = [...m[1].matchAll(/\bstep([A-Za-z0-9]+?)(?:Memo)?,/g)].map((x) => x[1]);
  const at = (name) => order.indexOf(name);
  for (const cheap of ["UnitTests", "Conformance", "GoldenTrees", "A11y"]) {
    assert.ok(at(cheap) >= 0, `${cheap} is in the local profile`);
    assert.ok(at(cheap) < at("ReleaseBuild"), `${cheap} (${at(cheap)}) reports before releaseBuild (${at("ReleaseBuild")})`);
  }
  assert.ok(at("Build") < at("UnitTests"), "the debug build still precedes the tests that need it");
});

// S4 — the fourth verdict and the deadline are wired where they must be.
test("the lane: every step runs under a deadline, a throw or timeout is one ERROR row, and ERROR fails the lane", () => {
  assert.match(verifySrc, /CURRENT_STEP_DEADLINE_MS = stepDeadlineMs\(expectedByStep\.byName\.get\(stepName\)\)/, "the deadline is set per step from its own history");
  assert.match(verifySrc, /timeout: CURRENT_STEP_DEADLINE_MS/, "and every subprocess inherits it");
  assert.match(verifySrc, /if \(spawnTimedOut\(res\)\) throw new StepTimeout/, "a deadline is thrown, never read as a failed exit");
  assert.match(verifySrc, /result = stepErrorResult\(stepName, err, Date\.now\(\) - stepStarted\)/, "the loop catches into ERROR and keeps going");
  assert.match(verifySrc, /s\.verdict === "FAIL" \|\| s\.verdict === "ERROR"\) \? "FAIL" : "PASS"/, "ERROR fails the lane");
  assert.match(verifySrc, /result\.verdict === "ERROR" \? "⊘"/, "and wears its own mark");
});

// S6 — the nightly stage, and the receipt naming what it attests.
test("nightly: a profile that forces the determinism probe and names its stage on the receipt", () => {
  assert.match(verifySrc, /stepsForProfile\.nightly = \[\.\.\.stepsForProfile\.ci\]/, "same steps as ci — what differs is what is forced and what the receipt may mean");
  assert.match(verifySrc, /const determinism = args\.includes\("--determinism"\) \|\| profile === "nightly"/, "the probe is not opt-in at nightly");
  assert.match(verifySrc, /stage: STAGE_OF_PROFILE\[profile\] \?\? profile/, "every receipt names its stage");
  assert.match(verifySrc, /local: "change", ci: "merge", nightly: "nightly", release: "release"/, "the mapping is stated once");
  assert.match(verifySrc, /use scaffold \| local \| ci \| nightly \| release/, "and the profile vocabulary admits it");
});
