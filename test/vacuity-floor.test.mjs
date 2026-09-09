// AN INTACT REGION MUST CONTAIN ENGINE CODE — ADR-0010.
//
// ADR-0008 measured the hole and left it: a scratch tree holding two
// declarations and nothing else locks, and `checkHarnessIntegrity` calls it
// `intact`. It is not lying — the region really is unmodified since it was
// locked. It is simply not a lane, and "unmodified" and "is a lane" are two
// questions that one status field was answering as though they were one.
//
// The reachable defect was never a missing gate deep in the lane; it was a
// FALSE SENTENCE in the shared voice. `describeIntegrity` is what
// `upgrade --harness`, `harden`, `prooflane upgrade` and any hosted checker
// render, and over a region with no engine in it that sentence read
// "N files verified".
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkHarnessIntegrity, describeIntegrity, writeHarnessLock } from "../packages/harness/src/lib/harness-lock.mjs";
import { hashHarnessRegion, isEngineModule } from "../packages/harness/src/lib/harness-region.mjs";

/** ADR-0008's probe, verbatim: declarations and nothing else. */
function vacuousTree(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vacuity-"));
  fs.mkdirSync(path.join(root, "qa", "lib"), { recursive: true });
  fs.writeFileSync(path.join(root, "qa", "verified-surface.json"), '{"surface":["src"]}\n');
  fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), '{"schema":"harness-manifest/1"}\n');
  for (const [rel, body] of Object.entries(extra)) fs.writeFileSync(path.join(root, ...rel.split("/")), body);
  writeHarnessLock(root, { version: "0.0.0-test" });
  return root;
}

test("engine code is the lane — not the declarations, not the record, not the adopter's profile", () => {
  assert.equal(isEngineModule("qa/verify.mjs"), true);
  assert.equal(isEngineModule("qa/lib/spec-coverage.mjs"), true);
  assert.equal(isEngineModule("qa/harness-manifest.json"), false, "a declaration is what the lane READS");
  assert.equal(isEngineModule("qa/verified-surface.json"), false);
  assert.equal(isEngineModule("qa/harness-source.json"), false, "the provenance record is about the lane, not the lane");
  assert.equal(
    isEngineModule("qa/lib/profiles/cmp/index.mjs"),
    false,
    "a region holding a profile and no spine is still a lane with no engine in it",
  );
  assert.equal(isEngineModule("src/Main.kt"), false, "outside the region entirely");
});

test("a region of declarations is intact AND vacuous — both, because they answer different questions", () => {
  const root = vacuousTree();
  try {
    const r = checkHarnessIntegrity(root);
    assert.equal(r.status, "intact", "status is honest: nothing has changed since the lock");
    assert.equal(r.vacuous, true, "and it is still not a lane");
    assert.equal(r.engineFiles, 0);
    assert.equal(r.fileCount, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the shared voice refuses to call it verified — the reachable half of the fix", () => {
  const root = vacuousTree();
  try {
    const said = describeIntegrity(checkHarnessIntegrity(root));
    assert.match(said, /not a lane/);
    assert.doesNotMatch(said, /files verified/, "this is the exact sentence four commands used to print over an empty region");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ONE engine module clears the floor — the claim is 'contains the engine', not 'contains enough of it'", () => {
  const root = vacuousTree({ "qa/verify.mjs": "// the lane\n" });
  try {
    const r = checkHarnessIntegrity(root);
    assert.equal(r.vacuous, false);
    assert.equal(r.engineFiles, 1);
    assert.match(describeIntegrity(r), /files verified/, "a real lane still describes normally");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("no existing lane changes verdict: a tree that can RUN the lane always has engine files", () => {
  // Why this floor costs adopters nothing. verify.mjs derives its root from its
  // own location, so its own module is always inside the region it hashes —
  // which is also why the step's FAIL branch is unreachable through today's
  // entry points, and why the fix had to land in the shared voice instead.
  const region = hashHarnessRegion(path.join(path.resolve("."), "template"));
  assert.ok(region.engineFiles > 20, `a stamped app's region carries the lane: ${region.engineFiles} engine files`);
  assert.ok(region.engineFiles < region.fileCount, "and carries declarations beside it");
});
