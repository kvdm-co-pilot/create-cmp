// An approval must record WHO signed it (payment-blueprint F11).
//
// The approvals gate exists so a human signs off on a governed artifact's hash.
// Before this, an approved row was {artifact, status, hash, approvedAt, via?} —
// and `via` is the SURFACE ("cli"/"console"), not an identity. So the row could
// not distinguish a human's sign-off from an agent's, and an agent that
// invalidated an approval could clear it by re-approving. That is the gate
// guarding against accident but not against the population it is pointed at.
//
// MIGRATION for an existing app: every approvals.json row written before this
// lacks `approvedBy`, so the gate FAILs naming each one. Fix is one re-approval
// per artifact — `node qa/approve.mjs <artifact> --as "Name <email>"` — after
// which the row carries its signer. Nothing else changes: hashes, statuses and
// the journal are untouched.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { approveArtifact, evaluateApprovalsGate, loadApprovals, saveApprovals } from "../packages/harness/src/lib/approvals.mjs";
import { installHarnessLib } from "./helpers/harness-fixture.mjs";

/** A tree with one resolvable governed artifact (exemplar-spec), needing no scaffold. */
function tinyProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "approvals-signer-"));
  installHarnessLib(dir);
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "specs/home.spec.md"), "### HM-01 — a clause\n\nstatus: active\n");
  return dir;
}

test("approving without a signer is refused, and the refusal names the flag", () => {
  const dir = tinyProject();
  const res = approveArtifact(dir, "exemplar-spec", { via: "cli" });
  assert.equal(res.ok, false, "an approval with no signer must be refused");
  assert.match(res.reason, /--as/, "the refusal must name the flag that fixes it");
  assert.match(res.reason, /signer/i);
});

test("approving with a signer records it on the row and in the result", () => {
  const dir = tinyProject();
  const res = approveArtifact(dir, "exemplar-spec", { via: "cli", approvedBy: "Ada Lovelace <ada@example.com>" });
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.approvedBy, "Ada Lovelace <ada@example.com>");
  const row = loadApprovals(dir).artifacts.find((a) => a.artifact === "exemplar-spec");
  assert.equal(row.approvedBy, "Ada Lovelace <ada@example.com>", "the persisted row must carry the signer");
});

test("a whitespace-only signer is not a signer", () => {
  const dir = tinyProject();
  assert.equal(approveArtifact(dir, "exemplar-spec", { approvedBy: "   " }).ok, false);
});

test("a legacy approved row with no signer FAILs the gate, and the message says how to fix it", () => {
  const dir = tinyProject();
  const ok = approveArtifact(dir, "exemplar-spec", { approvedBy: "Ada <ada@example.com>" });
  assert.equal(ok.ok, true, ok.reason);

  // Exactly the shape every pre-migration app has on disk.
  const state = loadApprovals(dir);
  for (const a of state.artifacts) delete a.approvedBy;
  saveApprovals(dir, state);

  const gate = evaluateApprovalsGate(dir);
  assert.equal(gate.verdict, "FAIL", "an unsigned approval must not pass as signed");
  assert.match(gate.reason, /without a signer/i);
  assert.match(gate.reason, /--as/, "the migration instruction must be in the failure itself");
});

test("re-approving with a signer clears the failure", () => {
  const dir = tinyProject();
  approveArtifact(dir, "exemplar-spec", { approvedBy: "Ada <ada@example.com>" });
  const state = loadApprovals(dir);
  for (const a of state.artifacts) delete a.approvedBy;
  saveApprovals(dir, state);
  assert.equal(evaluateApprovalsGate(dir).verdict, "FAIL");

  approveArtifact(dir, "exemplar-spec", { approvedBy: "Ada <ada@example.com>" });
  assert.notEqual(evaluateApprovalsGate(dir).verdict, "FAIL", "one re-approval is the whole migration");
});
