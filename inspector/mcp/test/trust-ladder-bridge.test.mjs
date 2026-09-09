// The two Phase C bridges, against REAL trees (LIVE-CONSOLE.md Phase C).
//
// What is worth testing here is not the derivations — qa/lib owns those and
// test/console-trust.test.mjs and test/console-ladder.test.mjs gate them. It is
// the two ways a bridge can be wrong in a way no pure test can see:
//
//   1. IT LOOKS IN THE WRONG PLACE. The ladder bridge's first real page load
//      asked the profile loader for a profile with no id and got back a refusal
//      about `undefined` — an honest-looking "no ladder" on a project that
//      declares one. The manifest NAMES the profile; asking without that name
//      is the same defect project-layout.mjs was carved out to end, one door
//      along.
//   2. IT RUNS SOMETHING. D4b was rejected because a page load must not start
//      the Rule 0 instrument (it plants into real files) — so the trust bridge
//      must read a file and nothing else, and a tree with no record must come
//      back as an absence rather than as a run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readTrustRecord } from "../src/lib/trust-bridge.mjs";
import { readLadderStanding } from "../src/lib/ladder-bridge.mjs";
import { FRAMEWORK_RECORD_REL } from "prooflane-harness/lib/framework-record.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** A real adopted tree: `prooflane init` into a git repo, committed. */
function seedProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trust-ladder-bridge-"));
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
  git("init", "-q");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "main.py"), "def add(a, b):\n    return a + b\n");
  execFileSync(process.execPath, [path.join(REPO, "packages/harness/bin/prooflane.mjs"), "init"], { cwd: dir, stdio: "ignore" });
  git("add", "-A");
  execFileSync("git", ["-C", dir, "-c", "user.email=x@y", "-c", "user.name=x", "commit", "-qm", "init"], { stdio: "ignore" });
  return dir;
}

test("the trust bridge READS: no record is an absence with a name, and nothing is run to find out", () => {
  const dir = seedProject();
  try {
    const before = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
    const state = readTrustRecord(dir);
    assert.equal(state.available, false);
    assert.match(state.reason, /no Rule 0 record/);
    assert.equal(state.relPath, FRAMEWORK_RECORD_REL, "and it names where it looked");
    // The rejected option, asserted as a property of the tree: reading the row
    // must not have planted anything, run a lane, or written a file.
    assert.equal(execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" }), before);

    execFileSync(process.execPath, [path.join(dir, "qa", "framework-check.mjs"), "--record"], { cwd: dir, stdio: "ignore" });
    const after = readTrustRecord(dir);
    assert.equal(after.available, true);
    assert.equal(after.verdict, "PASS");
    assert.equal(after.plants, after.failedByName, "every plant it ran refused by name");
    assert.equal(after.treeIdentical, true);
    assert.ok(after.ageMs >= 0 && after.ageMs < 5 * 60_000, "read against the reader's clock, from the record's own stamp");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the ladder bridge asks the MANIFEST which profile this is — not the loader with no name", () => {
  const dir = seedProject();
  try {
    // As seeded: a profile with no ladder. The honest answer is the grader's
    // own sentence, and NOT a refusal about a profile id of `undefined`, which
    // is what asking the loader without the manifest produces.
    const bare = readLadderStanding(dir, null);
    assert.equal(bare.available, false);
    assert.match(bare.reason, /declares no `ladder`/);
    assert.equal(/undefined/.test(bare.reason), false, "a project that declares a profile must never be described as having none");

    // A SECOND tree, with a ladder declared the way `harness init` seeds it
    // (top level), and the row fills in — against the rung the RECEIPT records,
    // never a fresh grading.
    //
    // A second TREE and not the same one edited, deliberately: the profile
    // loader requires the module, and require caches by absolute path for the
    // life of the process. That is the console's existing behaviour for profile
    // data (preview-service.mjs loads the profile once for its copy), and this
    // test states it rather than pretending the page hot-reloads a declaration.
    const dir2 = seedProject();
    const manifest = JSON.parse(fs.readFileSync(path.join(dir2, "qa", "harness-manifest.json"), "utf8"));
    const profileAbs = path.join(dir2, "qa", "lib", "profiles", manifest.profile.id, "index.mjs");
    fs.appendFileSync(
      profileAbs,
      `\nexport const ladder = { l0Required: ["harnessIntegrity"], l1Required: ["specCoverage"], deviceExecution: ["integration"], release: "shipIt", names: { L0: "green", L1: "static", L2: "integrated", L3: "shipped" } };\n`,
    );
    const stand = readLadderStanding(dir2, {
      available: true,
      evidenceLevel: { rung: "L1", name: "static", satisfiedBy: [] },
      steps: [{ name: "harnessIntegrity", verdict: "PASS" }, { name: "specCoverage", verdict: "PASS" }],
    });
    assert.equal(stand.available, true, stand.reason);
    assert.equal(stand.earned, "L1", "the receipt's rung, verbatim");
    assert.deepEqual(stand.rungs.map((r) => r.id), ["L0", "L1", "L2", "L3"]);
    assert.equal(stand.next.id, "L2");
    assert.deepEqual(stand.next.unmet, ["integration"], "this profile's own step name");
    fs.rmSync(dir2, { recursive: true, force: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
