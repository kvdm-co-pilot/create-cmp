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
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { obligation, TIERS, isTrunk, close, outstanding, reviewDischarge, REVIEW_SCHEMA } from "../scripts/proof-plan.mjs";
import { render } from "../scripts/fit-test.mjs";
import { filesFor, REVIEW_TIER_TRIGGERS, REVIEW_TIER_IRRELEVANT, REVIEW_SKIP } from "../scripts/observed-tree.mjs";
import { deriveTierNeed, deriveAffectedFilter } from "../packages/harness/src/lib/affected-tests.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  assert.equal(o.trunk, true, "and says so as data, because the hook treats trunk-none differently from docs-only-none");
  assert.equal(obligation(null, DOCS_ONLY, BRANCH).trunk, undefined, "a docs-only branch is not trunk");
});

test("close(): refuses while anything is owed, and only removes a plan when there is one to remove", () => {
  // Never exercised against the live plan file — the removing branch needs a
  // plan or a stale plan in the obligation, and neither is handed in here.
  assert.equal(close({ state: "owed", plan: slice(), stale: null }).closed, false);
  assert.equal(close({ state: "reopened", plan: slice(), stale: null }).closed, false);
  const r = close({ state: "none", plan: null, stale: null });
  assert.equal(r.closed, true);
  assert.equal(r.removed, false, "nothing to remove");
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

// ─────────────────────────────────────────────────────────────────────────────
// THE SECOND AT-CLOSE TIER: A REVIEW (ADR-0014).
//
// Karel, 2026-09-09: "gating its existence, never its content". The tests below
// pin BOTH halves of that sentence, and the second half is the one most likely
// to be "improved" away by a later reader who thinks a gate that accepts
// "nothing found" is broken. It is not broken; it is the decision. A gate that
// graded a review's findings would put an uncalibrated LLM judgement in the
// refusal path, which PRINCIPLES.md §2 forbids and which is the entire reason
// ADR-0014's first half — the reviewer's output is a failing test — exists.
// ─────────────────────────────────────────────────────────────────────────────

/** Prose only. Not the same list as DOCS_ONLY above: that one is docs-only FOR A DEVICE. */
const PROSE_ONLY = ["docs/NORTH-STAR.md", "README.md", "skills/cmp-audit/SKILL.md"];
/** A path a device run cannot see and a reader very much wants to. */
const REVIEW_TRIGGER = ["scripts/proof-plan.mjs"];

const reviewed = (over = {}) => ({ at: "2026-09-09T12:00:00.000Z", treeHash: "b".repeat(64), commit: null, tests: [], decisions: [], nothingFound: true, ...over });
const record = (over = {}) => ({ schema: REVIEW_SCHEMA, ranAt: "2026-09-09T12:00:00.000Z", observedHash: "c".repeat(64), commit: null, tests: [], decisions: [], nothingFound: true, ...over });

test("the review is declared at-close, beside the device tier — a second thing a slice owes", () => {
  assert.equal(TIERS.review.when, "at-close", "a review is bought once, over the finished slice");
  assert.equal(TIERS.device.when, "at-close");
});

test("A REVIEW IS OWED WHERE A DEVICE RUN IS NOT — the trigger set is broader on purpose", () => {
  // The whole reason review needs its own set. `scripts/` is declared unable to
  // affect fleet L2 and that is right — nothing in it reaches a phone. It is
  // also where this repo's gates live, so a change there is exactly the change
  // that wants a second reader. One derivation cannot answer both questions.
  const o = obligation(slice(), REVIEW_TRIGGER, BRANCH);
  assert.equal(o.state, "none", "no emulator: scripts/ cannot change what runs on a device");
  assert.equal(o.review.state, "owed", "but a reader: scripts/ is where the refusals live");
  assert.match(o.review.need.reason, /not declared irrelevant to a review/);
  assert.ok(!/REQUIRED/.test(JSON.stringify(o)), "and the word an agent acted on three times stays gone");
});

test("A DOCS-ONLY SLICE OWES NO REVIEW — ADR-0014's exemption, as a program rather than a sentence", () => {
  const o = obligation(slice(), PROSE_ONLY, BRANCH);
  assert.equal(o.review.state, "none");
  assert.equal(o.review.need.required, false);
  assert.match(o.review.need.reason, /every changed path is declared unable to affect a review/);
  // And the honest cost of drawing the line where a program can see it: a SKILL
  // is an instruction an agent executes, and it is still markdown. ADR-0014
  // names the trigger set as the lever if that proves wrong.
  assert.equal(obligation(slice(), ["skills/cmp-audit/SKILL.md"], BRANCH).review.state, "none");
});

test("a review discharges nothing without a record — read from the reviewer's own output, never asserted", () => {
  const r = reviewDischarge(null, "a".repeat(64));
  assert.equal(r.ok, false);
  assert.equal(r.exit, 2, "'no record' is 'I could not check', not 'I checked and it failed'");
  assert.match(r.message, /no review is recorded/);
});

test("A RECORD THAT DESCRIBES ANOTHER TREE DISCHARGES NOTHING — a review is of BYTES, not of a branch name", () => {
  // The defect this closes: a review run on Monday, three commits landed on
  // Tuesday, and a record still sitting in qa-artifacts saying a review
  // happened. It did — of code that no longer exists.
  const r = reviewDischarge(record({ observedHash: "c".repeat(64) }), "d".repeat(64));
  assert.equal(r.ok, false);
  assert.equal(r.exit, 1, "this one IS a checked failure, not an unanswerable question");
  assert.match(r.message, /does not describe this tree/);
  assert.match(r.message, /ccccccc → ddddddd/, "and names both trees, so a reader can see what moved");
});

test("an unrecognised record is refused rather than read as if its fields meant what we assume", () => {
  const r = reviewDischarge(record({ schema: "something-else/9" }), "c".repeat(64));
  assert.equal(r.ok, false);
  assert.equal(r.exit, 2);
  assert.match(r.message, /not "prooflane-review\/1"/);
});

test('GATING ITS EXISTENCE, NEVER ITS CONTENT: "nothing found" discharges, and that is the decision, not a hole', () => {
  // The accepted weakness of ADR-0014, pinned so it cannot be quietly "fixed".
  // A gate that read findings would be an uncalibrated instrument in the
  // refusal path (PRINCIPLES.md §2). What is bought here is the HABIT — bound
  // to a tree so it cannot be recycled — not the judgement.
  const now = "c".repeat(64);
  const empty = reviewDischarge(record({ nothingFound: true, tests: [], decisions: [] }), now);
  assert.equal(empty.ok, true, "a lazy review satisfies the gate — deliberately");
  assert.equal(empty.discharged.treeHash, now, "and is bound to these exact bytes");
  assert.equal(empty.discharged.nothingFound, true, "which is RECORDED, so a finding rate can be counted over time");

  // Content is carried through untouched and unscored: no minimum, no ranking.
  const rich = reviewDischarge(record({ nothingFound: false, tests: ["the record cannot be recycled"], decisions: ["one paragraph"] }), now);
  assert.equal(rich.ok, true);
  assert.deepEqual(rich.discharged.tests, ["the record cannot be recycled"]);
  assert.deepEqual(rich.discharged.decisions, ["one paragraph"]);
});

test("REOPENED: reviewed, then a trigger path moves — the review inherits the ordering rule", () => {
  // The same sequence that cost three device runs on 2026-09-08, applied to the
  // reader: a review describes a tree, and an edit after it leaves the record
  // describing a tree that no longer exists.
  const o = obligation(slice({ reviewDischarged: reviewed() }), REVIEW_TRIGGER, BRANCH);
  assert.equal(o.review.state, "reopened");
  assert.notEqual(o.review.now, reviewed().treeHash);
  assert.ok(o.plan.reviewDischarged, "and it still remembers the review it had, so a reader can see what moved");
});

test("a reviewed slice over an UNCHANGED tree stays discharged — the read is bought once", () => {
  const live = obligation(slice(), REVIEW_TRIGGER, BRANCH).review.now;
  const o = obligation(slice({ reviewDischarged: reviewed({ treeHash: live }) }), REVIEW_TRIGGER, BRANCH);
  assert.equal(o.review.state, "discharged");
});

test("a plan written before reviews existed owes one — an absent field is an unmet obligation, not an exemption", () => {
  const o = obligation(slice(), REVIEW_TRIGGER, BRANCH);
  assert.equal(o.plan.reviewDischarged, undefined, "the fixture is a pre-ADR-0014 plan");
  assert.equal(o.review.state, "owed");
});

test("close() and the exit code hold BOTH at-close tiers — a slice cannot close with a review owed", () => {
  const withReview = (state) => ({ state: "none", plan: slice(), stale: null, review: { state } });
  assert.equal(close(withReview("owed")).closed, false, "device settled, review owed — still open");
  assert.equal(close(withReview("reopened")).closed, false);
  assert.equal(close(withReview("undeclared")).closed, false);
  assert.equal(close({ state: "none", plan: null, stale: null, review: { state: "discharged" } }).closed, true);
  assert.deepEqual(outstanding({ state: "owed", review: { state: "reopened" } }), ["device (OWED)", "review (REOPENED)"]);
  assert.deepEqual(outstanding({ state: "discharged", review: { state: "none" } }), []);
});

test("every obligation carries a review block — including trunk, where nothing is owed", () => {
  // The hook reads o.review; an obligation that sometimes omitted it would fail
  // open at exactly the moment the answer mattered.
  for (const paths of [PROSE_ONLY, REVIEW_TRIGGER, null]) assert.ok(obligation(slice(), paths, BRANCH).review, JSON.stringify(paths));
  const trunk = obligation(null, [], "main");
  assert.equal(trunk.review.state, "none");
  assert.equal(trunk.review.trunk, true);
});

test("THE RECORD CANNOT INVALIDATE ITSELF — qa-artifacts is a lane output, and the review hash never reaches it", () => {
  // Writing the record is not a change to the tree the record describes. Two
  // ways that could have been false, both checked: if `qa-artifacts` were not a
  // lane-output prefix, the record would oblige a review OF ITSELF, forever;
  // and if it were under a hash root, the record would be stale the instant it
  // landed — the always-on warning observed-tree.mjs exists to avoid.
  const REC = "qa-artifacts/review-latest.json";
  assert.equal(deriveTierNeed([...PROSE_ONLY, REC], { irrelevantRoots: REVIEW_TIER_IRRELEVANT, tierName: "a review" }).required, false);
  assert.ok(!filesFor(REPO_ROOT, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }).some((p) => p.startsWith("qa-artifacts")));

  // And --fast must not fall open because a review ran: the same thing Phase B's
  // step stream had to be added to LANE_OUTPUT_PREFIXES for.
  const mapping = { broadImpact: () => null, patternsFor: (paths) => ({ patterns: ["Pattern"], sourcePaths: paths }) };
  assert.deepEqual(deriveAffectedFilter(["src/index.mjs", REC], mapping), deriveAffectedFilter(["src/index.mjs"], mapping));
});

test("EVERY PATH THAT OBLIGES A REVIEW IS A PATH THAT CAN REOPEN ONE — the two halves cannot disagree", () => {
  // The hole this refuses: a directory nobody listed as a hash root, whose
  // edits oblige a review (fail-open) but can never invalidate one. An author
  // could discharge the review and then rewrite it freely. Walked with the REAL
  // walker over the REAL tracked tree, so a new top-level directory fails this
  // test the day it lands rather than the day someone needs the guarantee.
  const tracked = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(tracked.length > 100, "the tree was listed");
  const hashed = new Set(filesFor(REPO_ROOT, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }));
  const holes = tracked.filter((p) => deriveTierNeed([p], { irrelevantRoots: REVIEW_TIER_IRRELEVANT, tierName: "a review" }).required && !hashed.has(p));
  assert.deepEqual(holes, [], `these paths oblige a review but cannot reopen one — add a root to REVIEW_TIER_TRIGGERS or declare them in REVIEW_TIER_IRRELEVANT:\n${holes.join("\n")}`);
});
