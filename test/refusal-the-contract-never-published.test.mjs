// The mirror image of test/contract-refusals-nobody-performs.test.mjs, which
// holds one direction of the same rule: a refusal the contract PUBLISHES must be
// one the loader PERFORMS. This file holds the other direction, which nothing
// held until the general gap refusal landed on 2026-09-10.
//
// evidence-ladder.mjs states the rule itself, ten lines above the block that
// breaks it:
//
//   "The refusal TEXT is the contract's, never a second copy: a message written
//    here would drift from the one `explain` prints, and an author who read one
//    and hit the other is exactly who this object exists for."
//
// The new block writes its own text for two of the three gaps it refuses, and it
// knows it does — `const published = CONTRACT.ladder.fields[field].refusal;`
// followed by `(published ? … : "")`, because for `l1Required` and `l2Execution`
// there is nothing to quote. Only `l3Execution` publishes a refusal, and it is
// the precedent: same shape, one rung up, spelled where the author reads it.
//
// What the author reads instead, at the moment of declaring, is the opposite:
//
//   $ node qa/profile.mjs explain ladder.l0Required
//   … Declare none and this profile earns no L0 — and therefore no rung above
//     it, since the rungs are climbed in order.
//   OPTIONAL — declaring nothing is a valid, honest answer.
//
// and profile-contract.mjs says it once more in its own comment on that field:
// "A ladder that omits l0Required does not get refused — it gets no L0, which is
// the honest grade". A ladder that omits l0Required and names l1Required IS
// refused now, and the refusal is not advisory: verify.mjs:396 prints it and
// exits 2 before a single step runs. One fact, two spellings, and the one in the
// adopter's own tree — the one `explain` prints and the one the skeleton ships —
// is the wrong one.
//
// EITHER ANSWER CLOSES THIS. Publish the refusal on one of the two fields it
// names, or stop performing it. What is not an answer is a lane that refuses to
// start over a state the contract beside it calls a valid, honest answer.
//
// This test PASSES on 337e06e and FAILS on 329d66c: the refusal is new, the
// contract it contradicts is not.
import { test } from "node:test";
import assert from "node:assert/strict";

import { CONTRACT, explain } from "../packages/harness/src/lib/profile-contract.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";

/** The step-name fields in the order the rungs are climbed — L0 up to L3. */
const CHAIN = ["l0Required", "l1Required", "l2Execution", "l3Execution"];

test("the loader refuses ladder states the contract publishes no refusal for — and calls a valid, honest answer", () => {
  for (const field of CHAIN) {
    assert.ok(
      Object.hasOwn(CONTRACT.ladder.fields, field),
      `\`${field}\` is not a field of the contract any more — this file is asserting nothing until the chain is respelled`,
    );
  }

  const unpublished = [];
  for (let i = 1; i < CHAIN.length; i++) {
    const field = CHAIN[i];
    const below = CHAIN[i - 1];
    // A ladder declared up to `field`, with the rung beneath it left undeclared
    // — the gap, spelled the only way it can be spelled.
    const ladder = {};
    for (let j = 0; j <= i; j++) ladder[CHAIN[j]] = [`step${j}`];
    delete ladder[below];

    const resolved = evidenceLadderFor({ id: "adopter", ladder }, null);
    if (resolved.ok) continue; // not refused — there is nothing to publish
    if (CONTRACT.ladder.fields[field].refusal || CONTRACT.ladder.fields[below].refusal) continue;

    const printed = explain(`ladder.${below}`) ?? "";
    unpublished.push(
      `${field} without ${below}:\n` +
        `    the loader refuses it — ${resolved.reason}\n` +
        `    the contract publishes refusal: null on BOTH ${field} and ${below}, so ` +
        `\`node qa/profile.mjs explain ladder.${below}\` prints no "REFUSED WHEN IT …" line at all — ` +
        `it ends "${printed.split("\n").filter(Boolean).pop()}"`,
    );
  }

  assert.deepEqual(
    unpublished,
    [],
    `a refusal an author can hit is a refusal \`explain\` has to print. \`l3Execution\` publishes its gap ` +
      `("${CONTRACT.ladder.fields.l3Execution.refusal}") and is the precedent; these do not:\n  ` +
      unpublished.join("\n  ") +
      `\n  verify.mjs exits 2 on a refused ladder before any step runs, so this is the lane refusing to start ` +
      `over a state the contract shipped beside it calls "OPTIONAL — declaring nothing is a valid, honest answer".`,
  );
});
