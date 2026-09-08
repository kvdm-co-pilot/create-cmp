// PROOF IS SCHEDULED, NOT TRIGGERED — the regression that costs an emulator.
//
// GATE-RULES Rule 4. On 2026-09-08 a device suite costing three and a half
// minutes and an emulator ran THREE TIMES in one session, and the third was
// triggered by a comment and a message string changing in one file — twenty
// minutes after the same agent had written down, in that session, that doing so
// was ceremony. Naming it did not stop it, because the line the agent read at
// the moment of decision said `fleet L2 REQUIRED`.
//
// So the assertion that matters most in this file is a NEGATIVE one: the word
// REQUIRED must not appear on that line mid-slice. `deriveTierNeed` answers
// WHETHER a tier can be skipped and always did; what did not exist was an
// answer to WHEN, and a tier with no schedule runs now.
//
// These tests never write `qa-artifacts/proof-plan.json` — that is live working
// state — and never run a device tier, which would be the very cost this exists
// to stop paying.
import { test } from "node:test";
import assert from "node:assert/strict";

import { obligation, TIERS, isTrunk } from "../scripts/proof-plan.mjs";
import { render } from "../scripts/fit-test.mjs";

/** A slice is a branch — a plan is bound to the one it was opened on. */
const BRANCH = "feat/a-slice-under-test";

/** A declared slice, in memory. The real one lives in qa-artifacts and is not touched. */
const slice = (over = {}) => ({
  schema: "prooflane-proof-plan/1",
  slice: "a slice under test",
  branch: BRANCH,
  openedAt: "2026-09-08T10:00:00.000Z",
  base: "0".repeat(40),
  declared: { suite: "per-commit", frameworkCheck: "per-commit", device: "at-close" },
  discharged: null,
  ...over,
});

const DOCS_ONLY = ["docs/NORTH-STAR.md", "test/foo.test.mjs", "scripts/bar.mjs"];
const TRIGGER = ["packages/harness/src/lib/evidence-level.mjs"];

test("the device tier is declared at-close — the schedule is data, not a habit", () => {
  // The two cheap tiers run continuously because they cost seconds and catch
  // the most; the expensive one runs once. If this ever reads "per-commit" the
  // whole rule has been undone by a one-word edit, so it is pinned.
  assert.equal(TIERS.device.when, "at-close", "the device tier runs once, at the end of a slice");
  assert.equal(TIERS.suite.when, "per-commit");
  assert.equal(TIERS.frameworkCheck.when, "per-commit");
});

test("a docs-only change owes NOTHING — the derivation that was already right stays right", () => {
  // This half was never broken: deriveTierNeed correctly declared docs, tests
  // and scripts unable to affect a device. Asserted so that adding the WHEN
  // dimension cannot regress the WHETHER one.
  const o = obligation(slice(), DOCS_ONLY, BRANCH);
  assert.equal(o.state, "none");
  assert.equal(o.need.required, false);
});

test("THE REGRESSION: a harness-source change mid-slice is OWED and NOT DUE, and never says REQUIRED", () => {
  const o = obligation(slice(), TRIGGER, BRANCH);
  assert.equal(o.need.required, true, "the derivation still says the tier cannot be skipped");
  assert.equal(o.state, "owed", "but it is owed at slice close, not now");

  // The negative assertion. `REQUIRED` is the word an agent acted on three times
  // in one session; a mid-slice line must not contain it, in any casing, because
  // what a reader does at the moment of decision is decided by this string and
  // by nothing in any document.
  const line = JSON.stringify(o);
  assert.ok(!/REQUIRED/.test(line), "the word REQUIRED must not appear in a mid-slice obligation");
});

test("an undeclared slice is told to declare one — the point is knowing BEFORE the work", () => {
  // Karel, 2026-09-08: "we need to make it part of the workflow to before
  // starting work optimising the tests and when to run them". A slice that
  // knows up front it will need an emulator can be scoped differently; one that
  // knows it will not never pays for one. So an obligation with no declared
  // slice is not silently treated as owed-now — it asks for the declaration.
  const o = obligation(null, TRIGGER, BRANCH);
  assert.equal(o.state, "undeclared");
});

test("a discharge is READ from the run's record, never asserted — and a stale or failing run discharges nothing", () => {
  // A discharge that trusted its caller would be exactly the shape of claim this
  // product exists to refuse (G1). The state machine's own half of that is here:
  // a recorded discharge only counts while it still describes this tree.
  const hash = "a".repeat(64);
  const discharged = slice({ discharged: { at: "2026-09-08T10:30:00.000Z", treeHash: hash, verdict: "PASS", rung: "L2" } });

  const o = obligation(discharged, TRIGGER, BRANCH);
  // The live tree hash will not equal a fabricated one, so this is the reopened
  // branch — which is the assertion: a discharge keyed to different bytes does
  // not carry over.
  assert.equal(o.state, "reopened", "a discharge that describes other bytes does not discharge this tree");
  assert.notEqual(o.now, hash);
});

test("REOPENED: discharged, then a trigger path moves — the slice reopens instead of silently re-arming", () => {
  // This is the exact 2026-09-08 sequence, encoded. The device tier is the LAST
  // gate; the mistake was editing a trigger file after discharging, which is a
  // sequencing error and is reported as one rather than as a second bill.
  const o = obligation(slice({ discharged: { at: "2026-09-08T10:30:00.000Z", treeHash: "b".repeat(64), verdict: "PASS", rung: "L2" } }), TRIGGER, BRANCH);
  assert.equal(o.state, "reopened");
  assert.ok(o.plan.discharged, "and it still remembers the run it had, so a reader can see what moved");
});

test("a discharged slice over an UNCHANGED tree stays discharged — the tier is bought once", () => {
  // The positive case, and the whole economic point: once the obligation is
  // discharged and nothing device-relevant has moved, further commits in the
  // slice cost nothing. Keyed to the live tree hash so the assertion is about
  // this repository rather than about a fixture.
  const live = obligation(slice(), TRIGGER, BRANCH).now;
  const o = obligation(slice({ discharged: { at: "2026-09-08T10:30:00.000Z", treeHash: live, verdict: "PASS", rung: "L2" } }), TRIGGER, BRANCH);
  assert.equal(o.state, "discharged");
});

test("the LINE an agent reads: quiet mid-slice, loud at close — loudness follows WHEN", () => {
  // This is the surface the whole episode happened on. `fit-test.mjs` printed
  // "fleet L2 REQUIRED" and "NO RECORD" on every mid-slice commit, and an agent
  // acted on it three times in one session. Neither string was wrong; both were
  // said at the wrong TIME, which is indistinguishable from being wrong to the
  // reader who has to decide what to do next.
  const base = { suite: null, frameworkCheck: null, device: { required: true, reason: "1 changed path feeds fleet L2" }, fleet: { present: false } };

  const midSlice = render({ ...base, owed: { state: "owed" } });
  assert.ok(!/REQUIRED/.test(midSlice), "mid-slice, the line must not say REQUIRED");
  assert.ok(!/NO RECORD/.test(midSlice), "nor NO RECORD — an absent record mid-slice is the expected state");
  assert.match(midSlice, /NOT NOW/, "it says when instead");
  assert.match(midSlice, /due at close/);

  // And the guarantee the old test was protecting is untouched: with no slice
  // declared, an absent record is still the failure mode and still shouts.
  const undeclared = render({ ...base, owed: { state: "undeclared" } });
  assert.match(undeclared, /NO RECORD/, "silence is still the failure mode where a run is actually due");

  // A discharged slice says so rather than going quiet, so a reader can tell
  // "already bought" from "not needed".
  assert.match(render({ ...base, owed: { state: "discharged" } }), /DISCHARGED/);
});

test("a tree that IS trunk owes nothing — the 2026-09-08 audit found a clean main saying OWED", () => {
  // `deriveTierNeed([])` fails open ("no change to reason about") because the
  // lane cannot see its diff. Here git answered, and the answer was "nothing":
  // this tree is origin/main, and whatever it owed was collected when its slice
  // merged. The day after Rule 4 landed, a clean main printed OWED and told the
  // reader to run an emulator over a tree that had changed by zero bytes.
  const o = obligation(null, [], "main");
  assert.equal(o.state, "none");
  assert.equal(o.need.required, false);
  assert.match(o.need.reason, /trunk/);
});

test("but a diff git could NOT determine still fails open — 'could not tell' is not 'nothing changed'", () => {
  const o = obligation(slice(), null, BRANCH);
  assert.equal(o.state, "owed");
  assert.match(o.need.reason, /cannot tell/);
});

test("a plan is bound to its branch: the last slice's plan does not carry over, and is named as stale", () => {
  // The same audit found PR #84's plan still on disk after the merge, applying
  // itself to whatever came next. A leftover is reported, never reused.
  const o = obligation(slice({ branch: "feat/the-previous-slice" }), TRIGGER, BRANCH);
  assert.equal(o.state, "undeclared", "a stale plan is no plan");
  assert.equal(o.stale.slice, "a slice under test", "and the reader is told which one is lying around");
  assert.equal(o.plan, null);
  // A plan written before branches were recorded has no branch at all — stale too.
  assert.equal(obligation(slice({ branch: undefined }), TRIGGER, BRANCH).state, "undeclared");
});

test("trunk is not a slice — --open refuses on main and on a detached HEAD", () => {
  assert.equal(isTrunk("main"), true);
  assert.equal(isTrunk(""), true, "detached");
  assert.equal(isTrunk(null), true, "git could not say");
  assert.equal(isTrunk("feat/anything"), false);
});
