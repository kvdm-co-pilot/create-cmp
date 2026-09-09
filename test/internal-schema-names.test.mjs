// NO INTERNAL ARTIFACT IS NAMED AFTER ONE STACK — ADR-0007's principle, applied
// to the six that the receipt's rename left behind.
//
// The receipt moved to `prooflane-evidence/1` because "the artefact we invite
// people to audit was named after one stack". Six others were not: the journal,
// the lock, the audit record, the approvals ledger, the step cache and the
// comments ledger — all of them files a stamped app COMMITS, so a Go or Python
// project's repository carried `cmp` on every line of them.
//
// WHAT MADE THIS MORE THAN A FIND-AND-REPLACE is that their readers differ, and
// the difference decides what a rename costs:
//
//   never read      the journal, the lock, the audit record — free.
//   tolerant        approvals (`parsed.schema ?? DEFAULT`) — free.
//   silently resets the step cache — a needless cold rebuild, no correctness
//                   stake.
//   REFUSES         the comments ledger — an unknown schema throws. Renaming
//                   without accepting the old name would make an adopter's
//                   existing ledger unreadable, and those comments are theirs.
//
// So the two that validate accept BOTH names for the life of /1 and write only
// the new one — ADR-0007's enum, applied where it is load-bearing rather than
// cosmetic.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FLIGHT_SCHEMA } from "../packages/harness/src/lib/flight-recorder.mjs";
import { LOCK_SCHEMA } from "../packages/harness/src/lib/harness-lock.mjs";
import { AUDIT_RECORD_SCHEMA } from "../packages/harness/src/lib/audit-cadence.mjs";
import { APPROVALS_SCHEMA } from "../packages/harness/src/lib/approvals.mjs";
import { STEP_CACHE_SCHEMA, STEP_CACHE_SCHEMAS, loadStepCache, STEP_CACHE_REL_PATH } from "../packages/harness/src/lib/step-cache.mjs";
import { COMMENTS_SCHEMA, COMMENTS_SCHEMAS, listComments, COMMENTS_REL_PATH } from "../packages/harness/src/lib/comments.mjs";

test("every internal schema id names the harness, not one of its stacks", () => {
  for (const [what, id] of [
    ["journal", FLIGHT_SCHEMA],
    ["lock", LOCK_SCHEMA],
    ["audit record", AUDIT_RECORD_SCHEMA],
    ["approvals", APPROVALS_SCHEMA],
    ["step cache", STEP_CACHE_SCHEMA],
    ["comments", COMMENTS_SCHEMA],
  ]) {
    assert.match(id, /^prooflane-/, `the ${what} still declares "${id}"`);
    assert.doesNotMatch(id, /^cmp-/, `the ${what} is named after one stack`);
  }
});

test("the comments ledger still READS the old name — renaming must not eat an adopter's own words", () => {
  // The one artifact in this rename where getting it wrong destroys user data.
  assert.deepEqual(COMMENTS_SCHEMAS, ["cmp-comments/1", "prooflane-comments/1"]);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comments-legacy-"));
  try {
    fs.mkdirSync(path.join(root, path.dirname(COMMENTS_REL_PATH)), { recursive: true });
    fs.writeFileSync(
      path.join(root, COMMENTS_REL_PATH),
      `${JSON.stringify({ schema: "cmp-comments/1", comments: [{ id: "c1", status: "open", note: "written before the rename" }] }, null, 2)}\n`,
    );
    const read = listComments(root);
    assert.equal(read.comments.length, 1, "an existing ledger is still readable");
    assert.equal(read.comments[0].note, "written before the rename");
    assert.equal(read.schema, COMMENTS_SCHEMA, "and reports under the current name — read both, write one");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an unknown schema is STILL refused — accepting the old name is not accepting anything", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comments-unknown-"));
  try {
    fs.mkdirSync(path.join(root, path.dirname(COMMENTS_REL_PATH)), { recursive: true });
    fs.writeFileSync(path.join(root, COMMENTS_REL_PATH), `${JSON.stringify({ schema: "someone-elses/9", comments: [] })}\n`);
    assert.throws(() => listComments(root), /refusing to read an unknown-schema ledger/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the step cache reads the old name too — the stake is a cold rebuild, and it is still not paid", () => {
  assert.deepEqual(STEP_CACHE_SCHEMAS, ["cmp-step-cache/1", STEP_CACHE_SCHEMA]);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cache-legacy-"));
  try {
    fs.mkdirSync(path.join(root, path.dirname(STEP_CACHE_REL_PATH)), { recursive: true });
    const steps = { build: { inputsHash: "a".repeat(64), verdict: "PASS", at: "2026-09-01T00:00:00.000Z" } };
    fs.writeFileSync(path.join(root, STEP_CACHE_REL_PATH), JSON.stringify({ schema: "cmp-step-cache/1", steps }));
    assert.deepEqual(loadStepCache(root).steps, steps, "an existing cache survives the upgrade");

    fs.writeFileSync(path.join(root, STEP_CACHE_REL_PATH), JSON.stringify({ schema: "unknown/1", steps }));
    assert.deepEqual(loadStepCache(root).steps, {}, "and a cache we cannot read is a cache we do not have");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
