// The lock answers "which lane is this, and is it unmodified?" — locally,
// offline, on every run. These pin the three states it can report and the
// boundary of what it does NOT claim.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LOCK_PATH,
  readHarnessLock,
  writeHarnessLock,
  checkHarnessIntegrity,
  describeIntegrity,
} from "../packages/harness/src/lib/harness-lock.mjs";

function tmpApp(files = { "qa/verify.mjs": "lane()", "qa/lib/x.mjs": "helper()" }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-lock-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return root;
}

test("a freshly locked tree reads back intact", () => {
  const root = tmpApp();
  const { fileCount } = writeHarnessLock(root, { version: "0.14.0" });
  assert.equal(fileCount, 2);

  const r = checkHarnessIntegrity(root);
  assert.equal(r.status, "intact");
  assert.equal(r.version, "0.14.0");
  assert.equal(r.name, "create-cmp-harness");
  assert.equal(r.sha256, r.recordedSha256);
  assert.match(describeIntegrity(r), /create-cmp-harness 0\.14\.0 — 2 files verified/);
});

test("the tamper this exists to catch: a green-forcing edit to verify.mjs", () => {
  const root = tmpApp();
  writeHarnessLock(root, { version: "0.14.0" });
  fs.writeFileSync(path.join(root, "qa/verify.mjs"), "lane() // steps.forEach(s => s.verdict = 'PASS')");

  const r = checkHarnessIntegrity(root);
  assert.equal(r.status, "modified");
  assert.deepEqual(r.modified, ["qa/verify.mjs"]);
  assert.notEqual(r.sha256, r.recordedSha256);
  assert.match(describeIntegrity(r), /1 modified/);
});

test("a missing lock is `unlocked` — distinct from `modified`", () => {
  // Nothing is known to be wrong, but nothing is proven either. A gate that
  // cannot tell those apart teaches people to ignore it.
  const root = tmpApp();
  const r = checkHarnessIntegrity(root);
  assert.equal(r.status, "unlocked");
  assert.equal(r.version, null);
  assert.equal(r.recordedSha256, null);
  assert.deepEqual(r.modified, []);
  assert.match(describeIntegrity(r), /lane version is unrecorded/);
});

test("a corrupt or truncated lock reads as `unlocked`, never as intact", () => {
  const root = tmpApp();
  writeHarnessLock(root, { version: "0.14.0" });
  for (const junk of ["", "{", "null", "[]", '{"schema":"x"}', '{"files":null}']) {
    fs.writeFileSync(path.join(root, LOCK_PATH), junk);
    const r = checkHarnessIntegrity(root);
    assert.notEqual(r.status, "intact", `${JSON.stringify(junk)} must not read as intact`);
  }
});

test("deleted and unrecorded lane files are reported separately from modified ones", () => {
  const root = tmpApp();
  writeHarnessLock(root, { version: "0.14.0" });
  fs.rmSync(path.join(root, "qa/lib/x.mjs"));
  fs.writeFileSync(path.join(root, "qa/extra.mjs"), "who put this here");

  const r = checkHarnessIntegrity(root);
  assert.equal(r.status, "modified");
  assert.deepEqual(r.missing, ["qa/lib/x.mjs"]);
  assert.deepEqual(r.extra, ["qa/extra.mjs"]);
  assert.deepEqual(r.modified, []);
});

test("app-owned files are outside the lock entirely", () => {
  // Editing a golden, an approval or a spec must never read as lane tampering.
  const root = tmpApp();
  writeHarnessLock(root, { version: "0.14.0" });
  for (const rel of ["qa/approvals.json", "qa/golden/home.json", "qa/e2e/smoke.yaml", "specs/app.spec.md"]) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "changed by the app");
  }
  assert.equal(checkHarnessIntegrity(root).status, "intact");
});

test("the lock is not part of the region it describes", () => {
  // A manifest inside its own manifest could never settle: writing it would
  // change the hash it just recorded.
  const root = tmpApp();
  writeHarnessLock(root, { version: "0.14.0" });
  const first = readHarnessLock(root);
  assert.ok(!(LOCK_PATH in first.files));
  writeHarnessLock(root, { version: "0.14.0" });
  assert.equal(readHarnessLock(root).sha256, first.sha256, "re-locking is stable");
});

test("writing a lock without a version is refused", () => {
  const root = tmpApp();
  for (const bad of [undefined, "", null, 14]) {
    assert.throws(() => writeHarnessLock(root, { version: bad }), /version is required/);
  }
});
