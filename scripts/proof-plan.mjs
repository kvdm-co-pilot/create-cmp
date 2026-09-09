// WHAT THIS SLICE WILL OWE, DECLARED BEFORE THE WORK STARTS.
//
// THE DEFECT THIS EXISTS TO CLOSE. `deriveTierNeed` answers WHETHER a tier is
// required and nothing anywhere answers WHEN. So `scripts/fit-test.mjs` printed
// "fleet L2 REQUIRED" the moment any commit touched the harness source, and an
// agent reading that at the moment of decision ran a three-and-a-half-minute
// emulator suite. On 2026-09-08 that happened three times in one session, and
// the third was triggered by a COMMENT and a message string changing in
// `evidence-level.mjs` — twenty minutes after the same agent had written down
// that re-running a device suite for a comment is ceremony. Naming it did not
// stop it, because at the moment of decision the program was the thing in front
// of the reader, saying REQUIRED.
//
// That is the whole lesson and it is bigger than this file: EIGHTEEN documents
// in this repository state the device-tier rule and not one of them is a
// program. The one memory that states it says "gate a RELEASE at L2" — a slice
// boundary — while the program obliged the tier per COMMIT. Prose and program
// disagreed, and the program won, as it always will: prose is read once at the
// start of a session and the program speaks at the moment of the decision. The
// fix for a rule that keeps getting lost is never a nineteenth restatement.
//
// SO: the obligation ACCRUES across a slice and is DISCHARGED once, at the end.
//
//   node scripts/proof-plan.mjs --open "<what this slice is>"
//   node scripts/proof-plan.mjs                     what is owed right now
//   node scripts/proof-plan.mjs --discharge         record that the device tier ran
//   node scripts/proof-plan.mjs --record-review     write the review record (the reviewer's own output)
//   node scripts/proof-plan.mjs --discharge-review  record that a review of this tree happened
//   node scripts/proof-plan.mjs --close             refuse if anything is still owed
//
// THE SECOND AT-CLOSE TIER: A REVIEW (ADR-0014, Karel 2026-09-09 — "gating its
// existence, never its content"). A qualifying slice owes a review record, and
// `gh pr merge` is refused until one exists that describes THIS tree. The gate
// is DELIBERATELY SHALLOW: it asks whether a review of these exact bytes
// happened and never reads what it found. A record saying "nothing found"
// satisfies it. That weakness is not an oversight to be fixed by inspecting
// findings — a gate that scored a review's quality would put an uncalibrated
// LLM judgement in the refusal path, which is the one thing PRINCIPLES.md §2
// forbids and the whole reason ADR-0014's first half exists. What the gate buys
// is the HABIT, not the judgement: the record is bound to a tree, so it cannot
// be recycled across changes, and what reviews produce can be counted over time.
//
// THE ORDERING RULE, AND WHY IT IS THE HONEST ANSWER. A device run proves a
// TREE. Any later edit to a trigger path — a comment included, because nothing
// here can tell a comment from a statement without parsing every language it
// might meet — leaves the run describing a tree that no longer exists. Rather
// than pretend some edits are safe, this makes the ordering explicit: the
// device tier is the LAST gate, and a trigger path edited after a discharge
// REOPENS the slice and says so. The agent that discharged and then edited docs
// is told exactly that, instead of silently paying for a second run. Cheaper
// than either alternative — a smarter hash that must understand every
// ecosystem's syntax, or an exception list that decides comments are harmless
// and is wrong the first time someone edits a string a test asserts on.
//
// Exit 0 when nothing is owed, 1 when something is, 2 when the question could
// not be answered — the same three outcomes `scripts/stage-gate.mjs` uses, and
// for the same reason: "I could not check" is not "I checked and it is broken".
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deriveTierNeed } from "../packages/harness/src/lib/affected-tests.mjs";
import {
  observedTreeHash,
  DEVICE_TIER_TRIGGERS,
  DEVICE_TIER_IRRELEVANT,
  REVIEW_TIER_TRIGGERS,
  REVIEW_TIER_IRRELEVANT,
  REVIEW_SKIP,
} from "./observed-tree.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_PATH = path.join(REPO_ROOT, "qa-artifacts", "proof-plan.json");
const SCHEMA = "prooflane-proof-plan/1";

/**
 * Where the reviewer leaves its record, and what shape it has to be in.
 *
 * `qa-artifacts/` because that is already this repo's home for generated run
 * output and is already a lane-output prefix
 * (`packages/harness/src/lib/affected-tests.mjs` LANE_OUTPUT_PREFIXES), so
 * writing a record can never be mistaken for a change to the tree it describes.
 */
const REVIEW_PATH = path.join(REPO_ROOT, "qa-artifacts", "review-latest.json");
const REVIEW_SCHEMA = "prooflane-review/1";

/**
 * The tiers this repo can run, and WHEN each is due. This is the declaration
 * the rule used to live in prose: the fast ones run continuously because they
 * cost seconds and catch the most, and the device tier runs ONCE, at the end of
 * a slice, because it costs minutes and can only answer a question about a
 * finished tree.
 *
 * `at-close` is not a weaker claim than `per-commit`. The same run happens; it
 * happens once, over everything the slice changed, instead of once per commit
 * over a tree nobody is going to ship.
 */
const TIERS = Object.freeze({
  suite: { when: "per-commit", cost: "~50s", cmd: "npm test" },
  frameworkCheck: { when: "per-commit", cost: "~4s", cmd: "node scripts/framework-check.mjs" },
  device: { when: "at-close", cost: "~3.5min + an emulator", cmd: 'CMP_AVD=Medium_Phone_API_35 node scripts/fleet-check.mjs --min-level L2' },
  // `cmd` is the runnable half; `how` is the part no shell can express, because
  // what produces a review is an agent reading a diff, not a program. Both are
  // printed, so the line an agent reads at the moment of decision says who does
  // the work AND what records it.
  review: {
    when: "at-close",
    cost: "~one read of the diff",
    cmd: "node scripts/proof-plan.mjs --discharge-review",
    how: "invoke the staff-reviewer on this diff (.claude/agents/staff-reviewer.md); it writes qa-artifacts/review-latest.json — or `node scripts/proof-plan.mjs --record-review --nothing-found` if it found nothing",
  },
});

function sh(cmd, args) {
  return spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/**
 * Every path this slice has touched: committed since the trunk, plus the
 * working tree. `null` when git cannot answer — and the difference between
 * "nothing changed" and "could not tell" is the whole point of returning it:
 * an empty list is a tree that IS trunk and owes nothing, while `null` fails
 * open through `deriveTierNeed` and owes the tier, because an unanswerable
 * question costs a device run rather than a missed regression.
 */
function changedPaths() {
  const base = sh("git", ["merge-base", "HEAD", "origin/main"]);
  if (base.status !== 0) return null;
  const diff = sh("git", ["diff", "--name-only", `${base.stdout.trim()}...HEAD`]);
  if (diff.status !== 0) return null;
  const dirty = sh("git", ["status", "--porcelain"]);
  if (dirty.status !== 0) return null;
  const out = new Set();
  for (const l of diff.stdout.split("\n")) if (l.trim()) out.add(l.trim());
  for (const l of dirty.stdout.split("\n")) {
    if (!l.trim()) continue;
    // A rename is two changed paths: the trigger that vanished and wherever it went.
    for (const p of l.slice(3).trim().split(" -> ")) out.add(p);
  }
  return [...out];
}

/** The branch this tree is on; "" when detached, null when git cannot say. */
function currentBranch() {
  const r = sh("git", ["branch", "--show-current"]);
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Trunk is not a slice. A slice is a branch — that is what trunk-based means here. */
const isTrunk = (branch) => !branch || branch === "main";

function read() {
  try {
    const p = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
    return p && p.schema === SCHEMA ? p : null;
  } catch {
    return null;
  }
}

function write(plan) {
  fs.mkdirSync(path.dirname(PLAN_PATH), { recursive: true });
  fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);
}

/**
 * What this slice owes, right now.
 *
 * `required` is the existing derivation and is untouched — it answers whether
 * the device tier CAN be skipped, and it deliberately fails open, so an
 * unclassified path costs a device run rather than a missed regression. What is
 * added here is only the second half: when it is due.
 *
 * TWO THINGS THE 2026-09-08 AUDIT FOUND, the day after this file landed:
 *
 * A clean `main` reported OWED. `deriveTierNeed` fails open on an empty list —
 * right for the lane, which cannot see its diff, and wrong here, where git
 * answered and the answer was "nothing". A tree that IS trunk owes nothing:
 * whatever it owed was owed by the slice that produced it and collected at
 * that slice's merge. So the empty case is decided here, before the derivation.
 *
 * And the previous slice's plan was still on disk, applying itself to whatever
 * came next. A plan is bound to the branch it was opened on — a slice IS a
 * branch under trunk-based development — so a leftover is named as stale and
 * never silently reused.
 */
export function obligation(plan = read(), paths = changedPaths(), branch = currentBranch()) {
  const stale = plan && plan.branch !== branch ? plan : null;
  if (stale) plan = null;
  const base = { plan, stale, branch };

  if (Array.isArray(paths) && paths.length === 0) {
    const where = branch ? ` (${branch})` : "";
    // `trunk` is read by the hook: "none because the diff is docs-only" makes a
    // device run pure waste, while "none because this IS trunk" is the one
    // place a device run is legitimate without a slice — a release proof.
    const reason = `nothing has changed since origin/main and the working tree is clean — this tree is trunk${where}, and whatever it owed was collected when its slice merged`;
    const none = { required: false, obliging: [], reason };
    return { state: "none", trunk: true, ...base, need: none, review: { state: "none", trunk: true, need: none } };
  }
  const need = deriveTierNeed(paths, { irrelevantRoots: DEVICE_TIER_IRRELEVANT, tierName: "fleet L2" });
  // A review is owed on a broader set than a device run: `scripts/` and `test/`
  // cannot reach a phone and are declared irrelevant to the device tier, but a
  // rewritten gate or a test that quietly stops refusing something is exactly
  // what wants a second reader (see REVIEW_TIER_IRRELEVANT for the whole
  // reasoning). Derived by the same fail-open function, so an unclassified path
  // costs a read of the diff rather than an unreviewed change.
  const reviewNeed = deriveTierNeed(paths, { irrelevantRoots: REVIEW_TIER_IRRELEVANT, tierName: "a review" });

  const dev = tierState(need.required, plan, plan?.discharged, () => observedTreeHash(REPO_ROOT, DEVICE_TIER_TRIGGERS));
  const rev = tierState(reviewNeed.required, plan, plan?.reviewDischarged, () => observedTreeHash(REPO_ROOT, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }));
  return { ...dev, need, ...base, review: { ...rev, need: reviewNeed } };
}

/**
 * The five states, once, for both at-close tiers.
 *
 * Written once rather than twice on purpose: two copies of a state machine
 * drift in one of them, and the one that drifts is whichever is read less. The
 * hash is a thunk because it costs hundreds of file reads and is only ever
 * needed in the two states that compare against it.
 *
 * The last branch is the ORDERING RULE both tiers inherit: discharged, then a
 * trigger path moved, means the record describes a tree that no longer exists.
 * Saying REOPENED is the point — an agent that edits after the last gate should
 * be told it has reopened the slice, not silently charged for another run.
 */
function tierState(required, plan, discharged, hash) {
  if (!required) return { state: "none" };
  if (!plan) return { state: "undeclared" };
  const now = hash();
  if (!discharged) return { state: "owed", now };
  return { state: discharged.treeHash === now ? "discharged" : "reopened", now };
}

/**
 * Close the slice: remove the plan when nothing is owed. The merge hook calls
 * this after `gh pr merge` so a finished slice's plan never lies around to be
 * named stale by the next one — the 2026-09-08 audit found PR #84's still there.
 */
export function close(o = obligation()) {
  const isSettled = (s) => s === "none" || s === "discharged";
  // BOTH at-close tiers, or the plan stays: a slice that closed with a review
  // owed would be a slice whose next reader is told nothing is outstanding.
  const settled = isSettled(o.state) && isSettled(o.review?.state ?? "none");
  const had = Boolean(o.plan || o.stale);
  if (settled && had) fs.rmSync(PLAN_PATH, { force: true });
  return { closed: settled, removed: settled && had, state: o.state, reviewState: o.review?.state ?? "none" };
}

/** What is still outstanding, by tier name — the sentence `--close` refuses with. */
export function outstanding(o) {
  const open = (s) => s === "owed" || s === "reopened" || s === "undeclared";
  const out = [];
  if (open(o.state)) out.push(`device (${o.state.toUpperCase()})`);
  if (open(o.review?.state)) out.push(`review (${o.review.state.toUpperCase()})`);
  return out;
}

export function render(o) {
  const L = [];
  const t = TIERS.device;
  L.push("proof plan — what this slice owes (NORTH-STAR §7)\n");
  if (o.plan) L.push(`  slice   ${o.plan.slice}\n  branch  ${o.plan.branch}\n  opened  ${o.plan.openedAt}\n`);
  else if (o.branch !== undefined) L.push(`  branch  ${o.branch || "(detached)"}${isTrunk(o.branch) ? " — trunk, not a slice" : ""}\n`);
  if (o.stale) L.push(`  (a plan from slice "${o.stale.slice}" on branch ${o.stale.branch ?? "unknown"} is still on disk and does not apply here — --close removes it)\n`);

  for (const [name, tier] of Object.entries(TIERS)) {
    if (tier.when === "at-close") continue;
    L.push(`  ${name.padEnd(16)} ${tier.when.padEnd(12)} ${tier.cost.padEnd(22)} ${tier.cmd}`);
  }

  const line = (verdict, detail) => L.push(`  ${"device (fleet L2)".padEnd(16)} ${verdict}\n      ${detail}`);
  switch (o.state) {
    case "none":
      line("NOT OWED", o.need.reason);
      break;
    case "undeclared":
      line(
        "OWED — but no slice is declared",
        `${o.need.reason}.\n      ${isTrunk(o.branch) ? "You are on trunk — branch first (git switch -c <name>), then declare the slice" : "Declare the slice first"}: node scripts/proof-plan.mjs --open "<what you are building>".\n      Declaring up front is the point — a slice that knows it will need an emulator can be\n      scoped differently, and one that knows it will not never pays for one.`,
      );
      break;
    case "owed":
      line(
        "OWED — discharge at slice close, NOT NOW",
        `${o.need.reason}.\n      This is the last gate. Run it when everything else is green and you are about to open\n      the PR — ${t.cost}:\n        ${t.cmd}\n      Then: node scripts/proof-plan.mjs --discharge`,
      );
      break;
    case "discharged":
      line("DISCHARGED", `ran at ${o.plan.discharged.at} — verdict ${o.plan.discharged.verdict}, rung ${o.plan.discharged.rung ?? "none"}, and no trigger path has moved since`);
      break;
    case "reopened":
      line(
        "REOPENED — a trigger path moved after the device run",
        `the run at ${o.plan.discharged.at} describes a tree that no longer exists (${o.plan.discharged.treeHash.slice(0, 7)} → ${o.now.slice(0, 7)}).\n      The device tier is the LAST gate: either revert what moved, or accept a second run.\n      This is the ordering mistake that cost three device runs in one session on 2026-09-08.`,
      );
      break;
  }
  renderReview(o, L);
  return L.join("\n");
}

/**
 * The review's half of the same block. It states, every time it is OWED, that
 * the gate never reads the findings — because the reader most likely to
 * over-read this line is an agent deciding what to write in the record, and the
 * honest answer ("nothing found" is a valid record) has to come from the
 * program, not from a document it read at session start.
 */
function renderReview(o, L) {
  const r = o.review;
  if (!r) return;
  const t = TIERS.review;
  const d = o.plan?.reviewDischarged;
  const found = (x) => {
    const bits = [];
    if (x?.tests?.length) bits.push(`${x.tests.length} test(s): ${x.tests.join(", ")}`);
    if (x?.decisions?.length) bits.push(`${x.decisions.length} decision(s) handed up`);
    if (x?.nothingFound) bits.push("nothing found");
    return bits.length ? bits.join("; ") : "an empty record";
  };
  const line = (verdict, detail) => L.push(`  ${"review".padEnd(16)} ${verdict}\n      ${detail}`);
  switch (r.state) {
    case "none":
      line("NOT OWED", r.need.reason);
      break;
    case "undeclared":
      line(
        "OWED — but no slice is declared",
        `${r.need.reason}.\n      ${isTrunk(o.branch) ? "You are on trunk — branch first (git switch -c <name>), then declare the slice" : "Declare the slice first"}: node scripts/proof-plan.mjs --open "<what you are building>".`,
      );
      break;
    case "owed":
      line(
        "OWED — at slice close, before the merge",
        `${r.need.reason}.\n      ${t.how}\n      Then: ${t.cmd}\n      What the gate checks is that a review of THESE bytes happened. It never reads what the\n      review found, and "nothing found" is a valid record (ADR-0014, "gating its existence,\n      never its content").`,
      );
      break;
    case "discharged":
      line("DISCHARGED", `a review of this exact tree is recorded at ${d?.at ?? "an unstated time"} — ${found(d)}, and no trigger path has moved since`);
      break;
    case "reopened":
      line(
        "REOPENED — a trigger path moved after the review",
        `the review at ${d?.at ?? "an unstated time"} describes a tree that no longer exists (${String(d?.treeHash ?? "").slice(0, 7)} → ${String(r.now).slice(0, 7)}).\n      Either revert what moved, or have the new bytes read: ${t.cmd} after a fresh record.`,
      );
      break;
  }
}

/** The review record on disk, or null. Never throws — an absent record is a state, not a crash. */
export function readReviewRecord(file = REVIEW_PATH) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Whether a review record discharges the obligation for THESE bytes — pure, so
 * the refusal path is testable without a repo in a particular state.
 *
 * The same rule the device discharge applies, for the same reason: a discharge
 * that trusts an argument is a claim, and this whole product exists to refuse
 * exactly that shape. The record's `observedHash` is compared against the hash
 * this program computes now; a record that describes a different tree
 * discharges nothing, however recently it was written.
 *
 * WHAT IS DELIBERATELY NOT CHECKED: anything the review FOUND. The device
 * discharge refuses a record whose verdict is not PASS; a review has no verdict
 * to refuse — by ADR-0014 the reviewer holds no verb, and a gate that graded
 * findings would be the uncalibrated instrument in the refusal path that the
 * whole design avoids. Only shape is checked, and only so that an unrecognised
 * file is refused rather than read as if its fields meant what we assume.
 *
 * @returns {{ok: true, discharged: object} | {ok: false, exit: 1|2, message: string}}
 */
export function reviewDischarge(record, now) {
  if (!record) {
    return {
      ok: false,
      exit: 2,
      message: `no review is recorded — ${TIERS.review.how}\n  A discharge is read from that record, never asserted.\n`,
    };
  }
  if (record.schema !== REVIEW_SCHEMA) {
    return { ok: false, exit: 2, message: `the record at qa-artifacts/review-latest.json says schema "${record.schema ?? "none"}", not "${REVIEW_SCHEMA}" — refusing rather than reading fields whose meaning is a guess\n` };
  }
  if (record.observedHash !== now) {
    return {
      ok: false,
      exit: 1,
      message: `the recorded review does not describe this tree (${String(record.observedHash).slice(0, 7)} → ${now.slice(0, 7)}) — it cannot discharge anything. A review is of BYTES, not of a branch name; have the current ones read.\n`,
    };
  }
  return {
    ok: true,
    discharged: {
      at: record.ranAt ?? null,
      treeHash: now,
      commit: record.commit ?? null,
      tests: Array.isArray(record.tests) ? record.tests : [],
      decisions: Array.isArray(record.decisions) ? record.decisions : [],
      nothingFound: Boolean(record.nothingFound),
    },
  };
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.indexOf(n);

  if (flag("--open") !== -1) {
    const name = argv[flag("--open") + 1];
    if (!name || name.startsWith("--")) {
      process.stderr.write('--open needs a name: node scripts/proof-plan.mjs --open "the ladder seam"\n');
      process.exit(2);
    }
    const branch = currentBranch();
    if (isTrunk(branch)) {
      process.stderr.write(`${branch || "a detached HEAD"} is trunk, not a slice — branch first (git switch -c <name>), then declare\n`);
      process.exit(2);
    }
    const base = sh("git", ["merge-base", "HEAD", "origin/main"]);
    write({
      schema: SCHEMA,
      slice: name,
      branch,
      openedAt: new Date().toISOString(),
      base: base.status === 0 ? base.stdout.trim() : null,
      declared: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.when])),
      discharged: null,
      reviewDischarged: null,
    });
    process.stdout.write(`${render(obligation())}\n`);
    process.exit(0);
  }

  if (flag("--record-review") !== -1) {
    // The reviewer's own output, written down. WHAT it found is taken from the
    // caller, because only the reviewer knows it and ADR-0014 records content
    // without judging it. WHICH TREE it read is not: that is computed here, so
    // no caller can assert that a review describes bytes it never saw. The one
    // thing refused is silence by omission — a record with no findings and no
    // explicit "nothing found" says nothing at all, so it is not written.
    const opt = (n) => (flag(n) !== -1 ? argv[flag(n) + 1] : null);
    const list = (v) => (v && !v.startsWith("--") ? v.split(";").map((s) => s.trim()).filter(Boolean) : []);
    const tests = list(opt("--tests"));
    const decisions = list(opt("--decisions"));
    const nothingFound = flag("--nothing-found") !== -1;
    if (!tests.length && !decisions.length && !nothingFound) {
      process.stderr.write(
        'a review record needs what the review produced: --tests "name; name" and/or --decisions "one line; one line", or --nothing-found if that is the honest result.\n' +
          "Nothing here judges the answer — an empty record is refused only because it records nothing, not because it found nothing.\n",
      );
      process.exit(2);
    }
    if (nothingFound && (tests.length || decisions.length)) {
      process.stderr.write("--nothing-found contradicts the findings passed with it — one record cannot say both\n");
      process.exit(2);
    }
    const head = sh("git", ["rev-parse", "HEAD"]);
    const record = {
      schema: REVIEW_SCHEMA,
      ranAt: new Date().toISOString(),
      // WHICH TREE was read, as content — the same binding the fleet record
      // uses and for the same reason: a review predates the commit that carries
      // it, so a commit-keyed record reads stale the moment it lands. The commit
      // is kept beside it as provenance a human can read, never as the key.
      observedHash: observedTreeHash(REPO_ROOT, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }),
      commit: head.status === 0 ? head.stdout.trim() : null,
      tests,
      decisions,
      nothingFound,
    };
    fs.mkdirSync(path.dirname(REVIEW_PATH), { recursive: true });
    fs.writeFileSync(REVIEW_PATH, `${JSON.stringify(record, null, 2)}\n`);
    process.stdout.write(`review recorded — qa-artifacts/review-latest.json, tree ${record.observedHash.slice(0, 7)}\nNow: ${TIERS.review.cmd}\n`);
    process.exit(0);
  }

  if (flag("--discharge-review") !== -1) {
    const plan = read();
    const branch = currentBranch();
    if (!plan || plan.branch !== branch) {
      process.stderr.write(plan
        ? `the plan on disk belongs to slice "${plan.slice}" on branch ${plan.branch ?? "unknown"}, not ${branch || "this detached HEAD"} — declare one here first\n`
        : 'no slice is declared — node scripts/proof-plan.mjs --open "<what you are building>"\n');
      process.exit(2);
    }
    const r = reviewDischarge(readReviewRecord(), observedTreeHash(REPO_ROOT, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }));
    if (!r.ok) {
      process.stderr.write(r.message);
      process.exit(r.exit);
    }
    plan.reviewDischarged = r.discharged;
    write(plan);
    process.stdout.write(`${render(obligation(plan))}\n`);
    process.exit(0);
  }

  if (flag("--discharge") !== -1) {
    const plan = read();
    const branch = currentBranch();
    if (!plan || plan.branch !== branch) {
      process.stderr.write(plan
        ? `the plan on disk belongs to slice "${plan.slice}" on branch ${plan.branch ?? "unknown"}, not ${branch || "this detached HEAD"} — declare one here first\n`
        : 'no slice is declared — node scripts/proof-plan.mjs --open "<what you are building>"\n');
      process.exit(2);
    }
    // Read the run rather than take the caller's word for it: a discharge that
    // trusts an argument is a claim, and this whole product exists to refuse
    // exactly that shape. The record fleet-check writes is the evidence.
    let rec;
    try {
      rec = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "qa-artifacts", "fleet-latest.json"), "utf8"));
    } catch {
      process.stderr.write("no device run is recorded — run the fleet check first; a discharge is read from its record, never asserted\n");
      process.exit(2);
    }
    const now = observedTreeHash(REPO_ROOT, DEVICE_TIER_TRIGGERS);
    if (rec.observedHash !== now) {
      process.stderr.write(`the recorded device run does not describe this tree (${String(rec.observedHash).slice(0, 7)} → ${now.slice(0, 7)}) — it cannot discharge anything\n`);
      process.exit(1);
    }
    if (rec.verdict !== "PASS") {
      process.stderr.write(`the recorded device run is ${rec.verdict}, not PASS — a failing run discharges nothing\n`);
      process.exit(1);
    }
    plan.discharged = { at: rec.ranAt, treeHash: now, verdict: rec.verdict, rung: rec.rung ?? null };
    write(plan);
    process.stdout.write(`${render(obligation(plan))}\n`);
    process.exit(0);
  }

  const o = obligation();
  if (flag("--close") !== -1) {
    process.stdout.write(`${render(o)}\n`);
    if (close(o).closed) {
      process.stdout.write("\nslice closed — nothing owed.\n");
      process.exit(0);
    }
    process.stdout.write(`\nslice NOT closed — still owed: ${outstanding(o).join(", ")}.\n`);
    process.exit(1);
  }

  process.stdout.write(`${render(o)}\n`);
  process.exit(outstanding(o).length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
export { TIERS, read, changedPaths, currentBranch, isTrunk, REVIEW_SCHEMA, REVIEW_PATH };
