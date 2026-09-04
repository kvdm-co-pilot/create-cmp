// Signing N artifacts costs ONE receipt invalidation, not N.
//
// A signature changes qa/approvals.json's `status`, and the approvals gate
// reads `status` — so the projection in inputs-hash.mjs deliberately keeps it,
// and a signature legitimately moves the receipt's input hash. That is correct,
// and it has a cost the flow was paying badly: signed one at a time AFTER a
// green lane, N signatures invalidate the receipt N times, cost N lane re-runs,
// and produce N bookkeeping commits.
//
// Measured in payment-blueprint's log on 2026-09-04: 21 commits in one session,
// of which 8 were "sign the approval" / "bind the green receipt" carrying no
// product content, and every code change cost two to three commits. It gets
// worse as a repo accumulates governed artifacts, which is what makes a session
// start fast and grind later.
//
// Two halves to the fix, and this file pins both: sign them together, and sign
// BEFORE the final lane run so the receipt you keep already covers them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash } from "../packages/harness/src/lib/inputs-hash.mjs";
import { approveArtifact, loadApprovals } from "../packages/harness/src/lib/approvals.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIGNER = "Karel <k@example.com>";

// The CLI resolves its root from its OWN location, not cwd — deliberately, so a
// stray invocation cannot write approvals into whatever directory you happen to
// be in. That means testing it needs a real stamped app with the CLI inside it,
// which is also the honest test: it exercises the file an adopter actually runs.
let APP = null;
function stampedApp() {
  if (APP) return APP;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "approve-batch-"));
  const dir = path.join(base, "BatchApp");
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), dir, "--yes", "--name", "BatchApp", "--package", "com.example.batchapp", "--no-ios", "--no-firebase", "--no-verify"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 },
  );
  if (r.status !== 0) throw new Error(`stamp failed: ${r.stdout}${r.stderr}`);
  APP = dir;
  return dir;
}

/** A pristine copy of the stamped app — each test starts from the same bytes. */
function freshApp() {
  const src = stampedApp();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "approve-batch-run-"));
  fs.cpSync(src, dir, { recursive: true });
  return dir;
}

const run = (dir, args) => spawnSync(process.execPath, [path.join(dir, "qa", "approve.mjs"), ...args], { cwd: dir, encoding: "utf8" });

test("N signatures in one command move the input hash ONCE", () => {
  const dir = freshApp();
  const before = computeInputsHash(dir).hash;

  approveArtifact(dir, "exemplar-spec", { via: "cli", approvedBy: SIGNER });
  const afterOne = computeInputsHash(dir).hash;
  approveArtifact(dir, "intent", { via: "cli", approvedBy: SIGNER });
  const afterTwo = computeInputsHash(dir).hash;

  // Each signature genuinely moves it — that is the cost being managed, not a
  // bug: the approvals gate reads `status`, so the receipt must not survive a
  // status change it never saw.
  assert.notEqual(before, afterOne, "a signature must move the receipt's input hash");
  assert.notEqual(afterOne, afterTwo, "so must the second");

  // Signed together from a clean tree, the same two signatures land in one
  // write and the hash moves exactly once — one lane run covers both.
  const dir2 = freshApp();
  const before2 = computeInputsHash(dir2).hash;
  assert.equal(before2, before, "the two fixtures start identical");
  const r = run(dir2, ["exemplar-spec", "intent", "--as", SIGNER]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(computeInputsHash(dir2).hash, afterTwo, "batch signing lands on the same state as signing one at a time");
  assert.equal(loadApprovals(dir2).artifacts.filter((a) => a.status === "approved").length, 2);
});

test("the batch tells the reader the ordering rule — sign, then run the lane", () => {
  const dir = freshApp();
  const r = run(dir, ["exemplar-spec", "intent", "--as", SIGNER]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 signatures in one write/);
  assert.match(r.stdout, /Run the lane AFTER signing, not before/);
  // The WHY has to travel with the instruction, or it reads as a style
  // preference and gets dropped the first time someone is in a hurry.
  assert.match(r.stdout, /signing after a green run costs you that run/);
});

test("one artifact still reads as one signature, with no batch footer", () => {
  const dir = freshApp();
  const r = run(dir, ["exemplar-spec", "--as", SIGNER]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /✓ approved exemplar-spec/);
  assert.doesNotMatch(r.stdout, /in one write/);
});

test("a signer is still required for a batch — the refusal cannot be dodged by naming more artifacts", () => {
  const dir = freshApp();
  const r = run(dir, ["exemplar-spec", "intent"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /approve needs a signer/);
  assert.equal(loadApprovals(dir).artifacts.filter((a) => a.status === "approved").length, 0);
});

test("one bad artifact in a batch reports that one and still signs the rest", () => {
  // Refusing the whole batch would push the reader straight back to signing one
  // at a time, which is the cost this exists to remove.
  const dir = freshApp();
  const r = run(dir, ["exemplar-spec", "not-an-artifact", "--as", SIGNER]);
  assert.equal(r.status, 1, "a batch with a failure still exits non-zero");
  assert.match(r.stdout, /✓ approved exemplar-spec/);
  assert.match(r.stderr, /not-an-artifact/);
  assert.equal(loadApprovals(dir).artifacts.filter((a) => a.status === "approved").length, 1);
});

test("--status and the other verbs are not swallowed as artifact names", () => {
  const dir = freshApp();
  const r = run(dir, ["--status"]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /✓ approved/);
});
