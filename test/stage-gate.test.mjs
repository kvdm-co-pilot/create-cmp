// The gate that decides whether a stage is finished must itself be checkable.
//
// Its whole claim is that an exit criterion is a COMMAND rather than a
// sentence, so the failure mode to guard is a criterion that quietly stops
// being evaluated — a stage listed as passing because nothing ran, which is the
// vacuous green one level up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGES, evaluate } from "../scripts/stage-gate.mjs";

test("every stage either carries commands or says NO PREDICATE — never a silent pass", () => {
  for (const s of STAGES) {
    const hasCriteria = Array.isArray(s.criteria) && s.criteria.length > 0;
    assert.ok(hasCriteria || typeof s.pending === "string", `stage ${s.id}: must have criteria or an honest pending reason`);
    if (!hasCriteria) {
      assert.ok(s.pending.length > 60, `stage ${s.id}: "pending" must say what is missing, not merely that something is`);
      assert.equal(evaluate(s).state, "pending");
    }
  }
});

test("a stage's criteria are commands or recorded evidence — never a judgement", () => {
  for (const s of STAGES) {
    for (const c of s.criteria ?? []) {
      assert.ok(typeof c.what === "string" && c.what.length > 0, `stage ${s.id}: every criterion is named`);
      assert.ok(Array.isArray(c.cmd) || c.fleet === true, `stage ${s.id}: "${c.what}" must be runnable, not read`);
    }
  }
});

test("stage 0 has not silently lost its criteria", () => {
  // The regression that would matter most: the stage that exited keeps the
  // three things that let it exit, so a later change cannot quietly un-prove it.
  const zero = STAGES.find((s) => s.id === "0");
  assert.ok(zero, "stage 0 is listed");
  assert.equal(zero.criteria.length, 3, "differential conformance, cold adoption, fleet");
  assert.ok(zero.exited, "and it records when it exited");
  const what = zero.criteria.map((c) => c.what).join(" | ");
  for (const needed of ["differential", "cold adoption", "fleet"]) {
    assert.match(what, new RegExp(needed, "i"), `stage 0 must still assert ${needed}`);
  }
});

test("the road is the road — every stage on it is gated here", () => {
  assert.deepEqual(STAGES.map((s) => s.id), ["0", "0.5", "1", "2", "3"], "a stage added to §9 must be added here too");
});
