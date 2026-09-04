// A receipt's PASS must be supported by its own rows (payment-blueprint F2/F3).
//
// Lives in packages/receipts because that is the SOURCE OF TRUTH:
// scripts/sync-harness.mjs copies packages/receipts/src/receipt-validate.mjs into
// packages/harness/src/lib/ and template/qa/lib/, so a change made in the vendored
// copy is silently deleted by the next sync. prooflane-receipts also publishes
// independently, so its behaviour needs a test that travels with it.
//
// The receipt is necessarily excluded from the inputs hash it carries — a file
// cannot hash itself — so steps[] is the only thing between this gate and a text
// editor, and the top-level verdict is the most editable field on it.
//
// Two real failures downstream motivated this. A receipt whose verdict was
// changed from FAIL to PASS by hand validated cleanly, because nothing compared
// the verdict to the rows. And a lane was made green by DELETING
// harness.lock.json, which downgraded harnessIntegrity from FAIL to SKIP and
// took the lane's verdict with it — a lane vouching for a tree with nothing
// vouching for the lane.
//
// MIGRATION for an existing app: receipts written before harnessIntegrity
// existed, or by a lane that SKIPs it, become invalid and the Stop hook says
// why. The fix is one full lane run, which writes a receipt carrying the row.
// No approvals, hashes or specs are touched.

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkLaneVouching, evaluateReceipt } from "../src/receipt-validate.mjs";

const receipt = (steps, verdict = "PASS") => ({
  verdict,
  profile: "local",
  inputs: { hash: "abc" },
  steps,
});
const ok = (name) => ({ name, verdict: "PASS", durationMs: 1000 });

test("a lane that vouched for itself passes", () => {
  const r = checkLaneVouching(receipt([ok("harnessIntegrity"), ok("build"), ok("unitTests")]));
  assert.equal(r.ok, true, r.detail);
});

test("THE FORGERY: a PASS verdict over a FAILing row is refused, and the row is named", () => {
  const r = checkLaneVouching(
    receipt([ok("harnessIntegrity"), { name: "specCoverage", verdict: "FAIL", durationMs: 12 }]),
  );
  assert.equal(r.ok, false);
  assert.match(r.detail, /specCoverage/);
  assert.match(r.detail, /more specific truth/);
});

test("an ERROR row is refused too — 'could not check' is not green", () => {
  const r = checkLaneVouching(receipt([ok("harnessIntegrity"), { name: "loadTest", verdict: "ERROR", durationMs: 5 }]));
  assert.equal(r.ok, false);
  assert.match(r.detail, /loadTest \(ERROR\)/);
});

test("THE DELETED LOCK: no harnessIntegrity row at all is refused", () => {
  const r = checkLaneVouching(receipt([ok("build"), ok("unitTests")]));
  assert.equal(r.ok, false);
  assert.match(r.detail, /no harnessIntegrity row/);
  assert.match(r.detail, /vouches/);
});

test("a SKIPped harnessIntegrity cannot carry a PASS", () => {
  // Exactly what deleting harness.lock.json used to produce.
  const r = checkLaneVouching(
    receipt([{ name: "harnessIntegrity", verdict: "SKIP", reason: "no lock", durationMs: 0 }, ok("build")]),
  );
  assert.equal(r.ok, false);
  assert.match(r.detail, /did not vouch for itself/);
});

test("a receipt with no steps is refused", () => {
  assert.equal(checkLaneVouching(receipt([])).ok, false);
  assert.equal(checkLaneVouching({ verdict: "PASS" }).ok, false);
});

test("evaluateReceipt refuses an unvouched receipt end to end", () => {
  const r = evaluateReceipt(receipt([ok("build")]), () => ({ hash: "abc", fileCount: 3 }));
  assert.equal(r.valid, false);
  assert.match(r.reason, /harnessIntegrity/);
});

test("evaluateReceipt still accepts a properly vouched one", () => {
  const r = evaluateReceipt(receipt([ok("harnessIntegrity"), ok("build")]), () => ({ hash: "abc", fileCount: 3 }));
  assert.equal(r.valid, true, r.reason);
});
