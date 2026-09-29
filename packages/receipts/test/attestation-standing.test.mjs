// Unit tests for attestationStanding — the report line that says which rungs
// someone other than the receipt's producer vouches for (docs/adr/0017).
// Discovered by the repo root's `node --test` and runnable standalone via
// `npm test` inside packages/receipts/.

import { test } from "node:test";
import assert from "node:assert/strict";

import { attestationStanding } from "../src/receipt-validate.mjs";

const receiptAt = (rung, extra = {}) => ({
  verdict: "PASS",
  evidenceLevel: { rung, name: "rung", satisfiedBy: ["step"] },
  ...extra,
});

test("with no verified attestation, every rung the receipt claims is self-attested", () => {
  const s = attestationStanding(receiptAt("L2"));
  assert.deepEqual(s.claimed, ["L0", "L1", "L2"]);
  assert.deepEqual(s.attested, []);
  assert.deepEqual(s.selfAttested, ["L0", "L1", "L2"]);
  assert.equal(s.line, "attestation — CI-attested: none · self-attested: L0, L1, L2");
});

test("a field the producer writes is not an attestation: the receipt cannot vouch for itself", () => {
  const s = attestationStanding(
    receiptAt("L2", { attestation: { by: "ci" }, producedBy: "ci", attestedThrough: "L2" }),
  );
  assert.deepEqual(s.attested, []);
  assert.deepEqual(s.selfAttested, ["L0", "L1", "L2"]);
});

test("a caller-verified attestation through L1 splits an L2 receipt at L1", () => {
  const s = attestationStanding(receiptAt("L2"), { attestedThrough: "L1" });
  assert.deepEqual(s.attested, ["L0", "L1"]);
  assert.deepEqual(s.selfAttested, ["L2"]);
  assert.equal(s.line, "attestation — CI-attested: L0, L1 · self-attested: L2");
});

test("an attestation above the claimed rung attests only what the receipt claims", () => {
  const s = attestationStanding(receiptAt("L1"), { attestedThrough: "L3" });
  assert.deepEqual(s.attested, ["L0", "L1"]);
  assert.deepEqual(s.selfAttested, []);
});

test("a receipt with no rung claims nothing, and an unknown attested rung attests nothing", () => {
  assert.equal(attestationStanding({ verdict: "PASS" }).line, "attestation — no rung claimed, nothing to attest");
  assert.deepEqual(attestationStanding(null).claimed, []);
  const s = attestationStanding(receiptAt("L1"), { attestedThrough: "L9" });
  assert.deepEqual(s.attested, []);
  assert.deepEqual(s.selfAttested, ["L0", "L1"]);
});
