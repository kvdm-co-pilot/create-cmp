// THE LIBRARY REFUSES WHAT THE HARNESS REFUSES AS PROOF OF DONE (KD-266).
//
// The harness's done-check (qa/receipt-check.mjs) refused a fast-mode receipt,
// a nightly or smoke stage/profile, and an environment SKIP before it ever
// called this library — so a hosted validator calling only the library
// (Gatekeeper's validateCommit → validateReceiptForTree) said "valid" to all
// six. The refusals now live here, once; the harness calls them.
//
// A SKIP with no `skipKind` on a current receipt is NOT refused unless the
// caller supplies a legacy name/reason list — tokenDrift's "inspector endpoint
// not reachable" SKIP is emitted on every headless L2 run without one (KD-5),
// and a move that started refusing it would refuse every headless receipt.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { computeInputsHash } from "../src/inputs-hash.mjs";
import { checkDoneEvidence, validateReceiptForTree, RECEIPT_REL_PATH } from "../src/index.mjs";

const base = () => ({
  schema: "cmp-evidence/1",
  profile: "local",
  stage: "change",
  mode: "full",
  verdict: "PASS",
  pack: { id: "cmp", version: null },
  steps: [
    { name: "harnessIntegrity", verdict: "PASS", durationMs: 12 },
    { name: "androidBuild", verdict: "PASS", durationMs: 21_800 },
    { name: "unitTests", verdict: "PASS", durationMs: 9_500 },
  ],
});

const withStep = (step) => ({ ...base(), steps: [...base().steps, step] });

// [label, receipt, refusal id, the named reason must match]
const PLANTED = [
  ["fast mode", { ...base(), mode: "fast" }, "fast-mode", /the last verify run was --fast \(inner-loop only\)/],
  ["nightly stage", { ...base(), stage: "nightly" }, "nightly", /the last verify run was the nightly stage/],
  ["nightly profile", { ...base(), profile: "nightly" }, "nightly", /the last verify run was the nightly stage/],
  ["smoke stage", { ...base(), stage: "smoke" }, "smoke", /the last verify run was the smoke profile/],
  ["smoke profile", { ...base(), profile: "smoke" }, "smoke", /the last verify run was the smoke profile/],
  [
    "environment SKIP",
    withStep({ name: "e2eCoverage", verdict: "SKIP", skipKind: "environment", reason: "no device attached", durationMs: 0 }),
    "environment-skip",
    /a tier did not run — e2eCoverage: no device attached\. Those steps skipped for an environmental reason/,
  ],
];

for (const [label, receipt, id, why] of PLANTED) {
  test(`checkDoneEvidence refuses a ${label} receipt by its named reason`, () => {
    const res = checkDoneEvidence(receipt);
    assert.equal(res.ok, false, `${label} must be refused`);
    assert.equal(res.refusal, id);
    assert.match(res.detail, why);
    assert.match(res.detail, /`node qa\/verify\.mjs`/, "the default lane command is named");
  });
}

test("checkDoneEvidence names the lane with the caller's own spelling", () => {
  const res = checkDoneEvidence({ ...base(), mode: "fast" }, { laneCommand: 'cd "/x y" && node qa/verify.mjs' });
  assert.match(res.detail, /\(`cd "\/x y" && node qa\/verify\.mjs`\)/);
});

test("an unedited change-stage receipt is done evidence", () => {
  assert.equal(checkDoneEvidence(base()).ok, true);
});

test("a STRUCTURE skip is honest and accepted", () => {
  const r = withStep({ name: "integrationTests", verdict: "SKIP", skipKind: "structure", reason: "no integration sources", durationMs: 0 });
  assert.equal(checkDoneEvidence(r).ok, true);
});

test("KD-5: tokenDrift's unlabelled SKIP on a current receipt is NOT refused — with or without the legacy lists", () => {
  const r = withStep({
    name: "tokenDrift",
    verdict: "SKIP",
    reason: "inspector endpoint not reachable on :9500 (debug app not running?) — launch the debug build to enable the live tier",
    durationMs: 3,
  });
  assert.equal(checkDoneEvidence(r).ok, true, "no lists: nothing is assumed");
  const legacySkips = { names: ["e2eSmoke", "tokenDrift", "androidChecks"], reasons: ["no Android device", "maestro CLI not installed"] };
  assert.equal(checkDoneEvidence(r, { legacySkips }).ok, true, "its reason text is none of the legacy environmental ones");
});

test("the legacy reason-text fallback applies ONLY when the caller passes the lists", () => {
  const r = withStep({ name: "e2eSmoke", verdict: "SKIP", reason: "no Android device/emulator attached (adb)", durationMs: 0 });
  assert.equal(checkDoneEvidence(r).ok, true, "no lists (Gatekeeper): no legacy fallback");
  const legacySkips = { names: ["e2eSmoke"], reasons: ["no Android device", "(adb"] };
  const res = checkDoneEvidence(r, { legacySkips });
  assert.equal(res.ok, false);
  assert.equal(res.refusal, "environment-skip");
  assert.match(res.detail, /e2eSmoke: no Android device\/emulator attached \(adb\)/);
  // A name outside the list is not read by reason text, whatever it says.
  assert.equal(checkDoneEvidence(r, { legacySkips: { names: ["other"], reasons: ["no Android device"] } }).ok, true);
  // An empty reason list is no fallback.
  assert.equal(checkDoneEvidence(r, { legacySkips: { names: ["e2eSmoke"], reasons: [] } }).ok, true);
});

test("an explicit skipKind wins over the legacy reason text", () => {
  const r = withStep({ name: "e2eSmoke", verdict: "SKIP", skipKind: "structure", reason: "no Android device here", durationMs: 0 });
  assert.equal(checkDoneEvidence(r, { legacySkips: { names: ["e2eSmoke"], reasons: ["no Android device"] } }).ok, true);
});

// ── the hosted composite — the path Gatekeeper's validateCommit calls ───────

function withReceiptTree(edit, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-done-evidence-"));
  try {
    fs.mkdirSync(path.join(root, "composeApp/src/commonMain/kotlin"), { recursive: true });
    fs.writeFileSync(path.join(root, "composeApp/src/commonMain/kotlin/Main.kt"), "fun main() {}\n");
    fs.mkdirSync(path.join(root, "qa"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa/verify.mjs"), "// lane stub\n");
    fs.writeFileSync(path.join(root, "settings.gradle.kts"), 'rootProject.name = "fake"\n');
    const { hash, fileCount } = computeInputsHash(root);
    const receipt = edit({ ...base(), commit: { sha: null, dirty: [] }, inputs: { hash, fileCount }, generatedAt: new Date().toISOString() });
    fs.mkdirSync(path.join(root, path.dirname(RECEIPT_REL_PATH)), { recursive: true });
    fs.writeFileSync(path.join(root, RECEIPT_REL_PATH), JSON.stringify(receipt));
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("validateReceiptForTree: the control receipt is valid", () => {
  withReceiptTree((r) => r, (root) => {
    const res = validateReceiptForTree({ root });
    assert.equal(res.status, "valid", res.reason);
    assert.ok(res.checks.some((c) => c.id === "done-evidence" && c.ok));
  });
});

for (const [label, planted, id, why] of PLANTED) {
  test(`validateReceiptForTree refuses a ${label} receipt that still binds to the tree`, () => {
    const { schema: _s, steps, ...fields } = planted;
    withReceiptTree((r) => ({ ...r, ...fields, steps }), (root) => {
      const res = validateReceiptForTree({ root });
      assert.equal(res.status, "invalid", `${label}: ${res.reason}`);
      const failed = res.checks.filter((c) => !c.ok).map((c) => c.id);
      assert.deepEqual(failed, ["done-evidence"], "refused on the planted field alone — the hash still binds");
      assert.match(res.reason, why);
      assert.ok(id);
    });
  });
}

test("validateReceiptForTree passes the legacy lists through, and applies none without them", () => {
  const legacyStep = { name: "e2eSmoke", verdict: "SKIP", reason: "no Android device/emulator attached (adb)", durationMs: 0 };
  withReceiptTree((r) => ({ ...r, steps: [...r.steps, legacyStep] }), (root) => {
    assert.equal(validateReceiptForTree({ root }).status, "valid");
    const res = validateReceiptForTree({ root, legacySkips: { names: ["e2eSmoke"], reasons: ["no Android device"] } });
    assert.equal(res.status, "invalid");
    assert.match(res.reason, /a tier did not run — e2eSmoke/);
  });
});
