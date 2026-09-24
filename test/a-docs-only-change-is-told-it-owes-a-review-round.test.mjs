// A DOCS-ONLY CHANGE WAS TOLD IT OWES A REVIEW ROUND.
//
// `scripts/proof-plan.mjs` has said NOT OWED for the review tier over a
// docs-only diff since the tier existed (REVIEW_TIER_IRRELEVANT,
// scripts/observed-tree.mjs). `scripts/change-price.mjs` — the program an agent
// reads BEFORE the work to decide the ceremony — printed "one round on the diff"
// over the same diff, in the owes block, above a round block that said NO ROUND.
// The owes block is the one an agent acts on; it bought the round.
//
// WHAT IS ASSERTED. Over a diff proof-plan says owes no review, the review row
// says NOT OWED in every column, with proof-plan's OWN reason — quoted, never
// re-derived from paths here — and the proof-tiers note says the same. And the
// counter-case, which is the half that keeps this from becoming "docs never get
// a review" by accident: ONE `scripts/` path in the same diff makes the review
// owed, and the row goes back to pricing a round.
//
// Both obligations are DERIVED by proof-plan's own `obligation()`, not written
// as fixtures, so this asserts the two programs agree rather than that a
// fixture agrees with itself. Neither diff reaches the runtime tier (docs/ and
// scripts/ are both declared unable to affect it), so nothing is stamped; the
// counter-case hashes this tree for the review tier, which is a read.
import { test } from "node:test";
import assert from "node:assert/strict";

import { obligation, TIERS } from "../scripts/proof-plan.mjs";
import { price } from "../scripts/change-price.mjs";

const BRANCH = "a-slice-under-test";
const PLAN = {
  schema: "prooflane-proof-plan/1",
  slice: "a slice under test",
  branch: BRANCH,
  openedAt: "2026-09-24T10:00:00.000Z",
  base: "0".repeat(40),
  declared: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.when])),
  discharged: null,
  reviewDischarged: null,
};
const kept = { file: "qa-artifacts/x-history.jsonl", exists: true, rows: [], malformed: 0 };
const HISTORIES = { suite: kept, fleet: kept, reviews: kept };

const priced = (paths, subjects) => {
  const o = obligation(PLAN, paths, BRANCH, { fleetRecord: null });
  return { o, m: price({ branch: BRANCH, paths, subjects, dirty: false, o, histories: HISTORIES }) };
};

test("over a docs-only diff the review row says NOT OWED in every column, with proof-plan's reason", () => {
  const { o, m } = priced(["docs/proposals/a-note.md", "README.md"], ["docs(proposals): a note", "docs(readme): a line"]);
  assert.equal(o.review.state, "none", "the premise: proof-plan says a docs-only diff owes no review");
  const reason = o.review.need.reason;
  assert.ok(reason, "proof-plan gives a reason");

  const review = m.owes.find((r) => r.item === "review");
  assert.ok(review, "the owes block still has a review row — it says NOT OWED rather than vanishing");
  for (const [lane, text] of Object.entries(review.owed)) {
    assert.match(text, /^NOT OWED/, `the ${lane} column prices a round over a diff that owes none: "${text}"`);
    assert.ok(text.includes(reason), `the ${lane} column quotes proof-plan's reason rather than its own: "${text}"`);
    assert.equal(/one round/i.test(text), false, `the ${lane} column still says "one round"`);
  }
  assert.equal(review.note, null, "the note about pricing round 2 is dropped — there is no round to price");

  const tiers = m.owes.find((r) => r.item === "proof tiers");
  assert.match(tiers.note, /review is NOT OWED on this diff/);
  assert.ok(tiers.note.includes(reason), "the proof-tiers note quotes the same reason");

  assert.equal(m.round.round, null, "and the round block, which already agreed, still does");
  const spentReview = m.spent.find((r) => r.what === "review");
  assert.equal(spentReview.owed, 0);
});

test("COUNTER-CASE: one scripts/ path in the same diff owes a review, and the row prices a round again", () => {
  const { o, m } = priced(["docs/proposals/a-note.md", "scripts/change-price.mjs"], ["docs(proposals): a note", "fix(price): a line"]);
  assert.notEqual(o.review.state, "none", "a script is exactly what wants a second reader — proof-plan owes a review");

  const review = m.owes.find((r) => r.item === "review");
  for (const [lane, text] of Object.entries(review.owed)) {
    assert.equal(/NOT OWED/.test(text), false, `the ${lane} column waved off a review this diff owes: "${text}"`);
  }
  assert.ok(Object.values(review.owed).some((t) => /one round/i.test(t)), "the row prices the round again");
  assert.match(review.note, /does not guess/, "with the note about round 2 back");

  const tiers = m.owes.find((r) => r.item === "proof tiers");
  assert.equal(/NOT OWED/.test(tiers.note), false, "the proof-tiers note does not say NOT OWED either");
});
