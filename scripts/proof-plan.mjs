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
//   node scripts/proof-plan.mjs --record-review --round <n> [--kind round|rerecord]
//                                                   write the review record (the reviewer's own output)
//   node scripts/proof-plan.mjs --discharge-review  record that a review of this tree happened
//   node scripts/proof-plan.mjs --rekey             re-derive an OLD-rule fleet record's digest under
//                                                   the current rule (a stamp of its commit, no L2 run)
//   node scripts/proof-plan.mjs --close             refuse if anything is still owed
//   node scripts/proof-plan.mjs --history [--json]  what settled slices cost, from the kept records
//
// NOTHING IS DELETED WITHOUT BEING KEPT. A settled plan, every review record and
// every device run are appended to `qa-artifacts/*-history.jsonl` as they are
// written (scripts/lib/proof-history.mjs says why), so the cost of a slice is
// read from this repository rather than reconstructed from session logs.
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
// THE ORDERING RULE, AND WHY IT IS THE HONEST ANSWER. A device run proves an
// APP — the one `create-cmp` stamps out of this tree. Any later edit that
// changes those bytes, a comment in a shipped file included, leaves the run
// describing an app that no longer exists, and the rule is explicit about it:
// the device tier is the LAST gate, and a change to the stamped app after a
// discharge REOPENS the slice and says which files moved.
//
// AND THE OTHER HALF, WHICH IS THE WHOLE POINT OF ASKING IT THIS WAY: an edit
// that leaves the stamped app byte-identical costs NOTHING. This repo's own
// engine sources (`src/`, `bin/`), its tests, its scripts and its docs all
// RUN during a stamp or sit beside it, and none of their bytes land in the app.
// Until 2026-09-22 they obliged a 3.5-minute emulator run all the same, because
// the tier was scheduled by input paths — a proxy for the question, and wrong
// in both directions (scripts/stamped-output.mjs has the measurements). Karel:
// "it's a template; it does not need to rerun after every change; if we are
// running it again without code changes to the template then something is
// wrong."
//
// Exit 0 when nothing is owed, 1 when something is, 2 when the question could
// not be answered — the same three outcomes `scripts/stage-gate.mjs` uses, and
// for the same reason: "I could not check" is not "I checked and it is broken".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deriveTierNeed } from "../packages/harness/src/lib/affected-tests.mjs";
import {
  observedTreeHash,
  deviceTierNeed,
  REVIEW_TIER_TRIGGERS,
  REVIEW_TIER_IRRELEVANT,
  REVIEW_SKIP,
} from "./observed-tree.mjs";
import {
  stampedApps,
  FIREBASE_FLEET_RECORD,
  describeStampedDiff,
  stampScratchApp,
  hashStampedTree,
  ruleOfRecord,
  STAMPED_OUTPUT_RULE,
  STAMPED_OUTPUT_RULES,
} from "./stamped-output.mjs";
import { rungMeets, normalizeLevel } from "./evidence-rung.mjs";
import { appendHistory, historyPath, readHistory, summarize, renderHistory, PLAN_EVENT_SCHEMA } from "./lib/proof-history.mjs";
import { suiteStatus, describeSuiteStatus } from "./suite-record.mjs";

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
 * Where `--rekey` leaves what it re-derived, and the shape it is in.
 *
 * BESIDE the fleet record, never IN it: `qa-artifacts/fleet-latest.json` is
 * what an L2 run measured, and a program that rewrote its digest afterwards
 * would be a record whose central field nobody measured. The rekey says what it
 * did and how it knows — the commit it re-stamped, the old rule's digest it
 * reproduced first, and the new rule's digest of the same stamp — and every
 * reader accepts it only for the ONE run it names (`rekeyNamesRun`).
 */
const REKEY_PATH = path.join(REPO_ROOT, "qa-artifacts", "fleet-rekey-latest.json");
const REKEY_SCHEMA = "prooflane-fleet-rekey/1";

/**
 * The tiers this repo can run, and WHEN each is due. This is the declaration
 * the rule used to live in prose. EVERY tier is `at-close`: the suite and
 * framework-check run once, over the finished batch, before the PR, and the
 * device tier runs once, at the end of a slice, because it costs minutes and can
 * only answer a question about a finished tree.
 *
 * `at-close` is not a weaker claim than `per-commit`. The same run happens; it
 * happens once, over everything the slice changed, instead of once per commit
 * over a tree nobody is going to ship. The two cheap tiers said `per-commit`
 * until 2026-09-24, and an agent reading that at the moment of decision ran the
 * whole suite after every fix — the measured cost is in scripts/suite-record.mjs's
 * header (295 runs, 4.6 to 6.6 per merged change). Karel, 2026-09-24: once, at
 * close. What the merge REQUIRES is unchanged by this: no merge gate here reads
 * a suite run, and none did before.
 *
 * WHAT MOVED, AND WHAT DID NOT. Only `when` and the printed `due` sentence
 * changed. `render()` used to skip a tier whose `when` was `at-close`, which
 * was a stand-in for "has its own block below" — so the flip alone would have
 * hidden the suite and framework-check rows. It now skips by NAME (OWN_BLOCK).
 */
/**
 * THE RUNG THE DEVICE TIER DEMANDS, DECLARED ONCE.
 *
 * A fleet check is PASS at whatever level it was TOLD to require: `--min-level
 * L1` runs the desktop lane, never attaches a device, and writes
 * `{verdict: "PASS", rung: "L1"}`. So "PASS" is half a sentence, and a reader
 * that stops there discharges the device tier with a run that never reached a
 * device — measured 2026-09-22, review round 1 of the stamped-app schedule:
 * a rung-L1 record over matching bytes printed DISCHARGED and `gh pr merge`
 * went through with the tier's own question unasked.
 *
 * It was three spellings before this: the `--min-level L2` inside the command
 * this tier prints, nothing at all where a record is accepted, and `rung >= 2`
 * in the publish gate. Now the command is BUILT from this constant and every
 * reader holds a record to `TIERS.device.requires` through `recordMeetsTier`,
 * so moving the bar moves all of them or none.
 */
export const DEVICE_TIER_LEVEL = "L2";

/**
 * WHEN THE TWO CHEAP TIERS ARE DUE, AS THE SENTENCE AN AGENT READS. Printed under
 * each of them by `render()`, and read by `scripts/change-price.mjs` rather than
 * copied, so there is one statement of it. It says what NOT to do because the
 * habit it replaces — a suite run after every fix — is the one an agent falls
 * into without being told.
 */
const CHEAP_TIER_DUE = "once, over the finished batch, before the PR — never per fix or per commit";

const TIERS = Object.freeze({
  suite: { when: "at-close", due: CHEAP_TIER_DUE, cost: "~50s", cmd: "npm test" },
  frameworkCheck: { when: "at-close", due: CHEAP_TIER_DUE, cost: "~4s", cmd: "node scripts/framework-check.mjs" },
  device: {
    when: "at-close",
    cost: "~3.5min + an emulator",
    // What a record must REACH, and the command that produces one — the same
    // constant, so an agent is never told to run a check whose output this tier
    // would then refuse.
    requires: DEVICE_TIER_LEVEL,
    cmd: `CMP_AVD=Medium_Phone_API_35 node scripts/fleet-check.mjs --min-level ${DEVICE_TIER_LEVEL}`,
  },
  // `cmd` is the runnable half; `how` is the part no shell can express, because
  // what produces a review is an agent reading a diff, not a program. Both are
  // printed, so the line an agent reads at the moment of decision says who does
  // the work AND what records it.
  review: {
    when: "at-close",
    cost: "~one read of the diff",
    cmd: "node scripts/proof-plan.mjs --discharge-review",
    // A POINTER, AND NOT A SUMMARY OF WHAT IT POINTS AT. The four lines that
    // stood here paraphrased the rule beside the pointer to it, and were stale
    // within a day of the rule changing — they still said "a round ends when it
    // produces no new defect" after the rule became "two rounds, and no third"
    // (KD-12). A rule stated twice drifts in one, which this repo's own CLAUDE.md
    // says, and the second statement is always the one nobody updates.
    how:
      "invoke the staff-reviewer on this diff (.claude/agents/staff-reviewer.md); it writes qa-artifacts/review-latest.json — or `node scripts/proof-plan.mjs --record-review --round 1 --nothing-found` if it found nothing.\n" +
      "      SAY WHICH ROUND IT IS: --round <n>, and --kind round|rerecord where the row is a re-confirmation rather than a read.\n" +
      "      Omit them and the row cannot be counted, so `node scripts/change-price.mjs` prices the next round OWED on the ground that it cannot tell.\n" +
      "      HOW MANY ROUNDS, what blocks, where everything else goes, and how the last round records: the header of\n" +
      "      docs/KNOWN-DEFECTS.md. That is the rule's one statement. This line names it and stops.",
  },
  // THE FIREBASE L2 RUN (GATE-RULES Rule 4, KD-206). The same lane, over the
  // app `create-cmp add firebase --no-verify` leaves on the default stamp, with
  // the Firebase Emulator Suite serving what that app declares. It has its own
  // digest (`stampedApps`, scripts/stamped-output.mjs) and its own record
  // (FIREBASE_FLEET_RECORD), so an overlay edit owes this run and not the
  // default one, and a template edit owes both. Same bar as the default tier:
  // one constant, so the two L2 runs can never be held to different levels.
  firebase: {
    when: "at-close",
    cost: "~4.5min + an emulator + the Firebase Emulator Suite",
    requires: DEVICE_TIER_LEVEL,
    cmd: `CMP_AVD=Medium_Phone_API_35 node scripts/fleet-check.mjs --min-level ${DEVICE_TIER_LEVEL} --with-firebase`,
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
 *
 * `since` MOVES THE FLOOR AND NOTHING ELSE. With no argument this is exactly
 * what it has always been — the merge-base with `origin/main`, three-dot — and
 * that path is pinned by a test, because this function sits under a refusal
 * (`obligation` → the proof gate) and a generalisation that quietly moved what
 * a gate reads would be the defect, not the feature. Given a commit it answers
 * "what has changed SINCE that commit", which is what
 * `scripts/change-price.mjs` needs to price a second review round: the union
 * with the working tree is the half that matters there, since round 1's fixes
 * are uncommitted for most of the time they exist, and an empty delta is the
 * one thing that makes a further round not owed.
 *
 * TWO DOTS THERE, THREE HERE, deliberately: the range is also PRINTED to the
 * reader as the command to run (beside `git status --porcelain`, which is the
 * other half of what this reads), so it must be the range that was read. For a
 * commit that is an ancestor of HEAD the two spellings are the same answer. For
 * one that is not — an orphan left behind by the rebase ADR-0014 rebinds a
 * record across — two dots report that commit's content as changed too, which
 * overstates the delta. Overstating it says OWED, and that is the direction
 * this is allowed to be wrong in.
 */
function changedPaths(since = null) {
  let range;
  if (since === null) {
    const base = sh("git", ["merge-base", "HEAD", "origin/main"]);
    if (base.status !== 0) return null;
    range = `${base.stdout.trim()}...HEAD`;
  } else {
    range = `${since}..HEAD`;
  }
  const diff = sh("git", ["diff", "--name-only", range]);
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
 *
 * `fleetRecord` is handed in for the same reason `plan`, `paths` and `branch`
 * are: a test that asserts what a fixture owes must not be answered by whatever
 * device run this particular laptop happens to have on disk. Pass `null` for
 * "no run is recorded here".
 *
 * `firebaseRecord` is the Firebase L2 run's record, handed in for the same
 * reason. A caller that injects `fleetRecord` and says nothing about Firebase
 * gets NO Firebase record, not this laptop's: the callers that inject one do
 * it precisely so that no machine's disk answers them, and a second record
 * read behind their back would undo that for the new tier.
 */
export function obligation(plan = read(), paths = changedPaths(), branch = currentBranch(), opts = {}) {
  const fleetRecord = opts.fleetRecord === undefined ? readFleetRecord() : opts.fleetRecord;
  const firebaseRecord = opts.firebaseRecord !== undefined ? opts.firebaseRecord : opts.fleetRecord !== undefined ? null : readFirebaseRecord();
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
    // The Firebase block is carried here too, so a reader of `o.firebase` never
    // meets an undefined tier on trunk — the one place a release proof runs.
    return { state: "none", trunk: true, ...base, need: none, review: { state: "none", trunk: true, need: none }, firebase: { state: "none", trunk: true, need: none } };
  }
  // `deviceTierNeed`, not `deriveTierNeed` over the list directly: markdown
  // under `template/` ships into the stamped app, so it is asked about and the
  // digest judges it (KD-207, scripts/observed-tree.mjs DEVICE_TIER_SHIPPED).
  const need = deviceTierNeed(paths, { tierName: "the L2 run" });
  // A review is owed on a broader set than a device run: `scripts/` and `test/`
  // cannot reach a phone and are declared irrelevant to the device tier, but a
  // rewritten gate or a test that quietly stops refusing something is exactly
  // what wants a second reader (see REVIEW_TIER_IRRELEVANT for the whole
  // reasoning). Derived by the same fail-open function, so an unclassified path
  // costs a read of the diff rather than an unreviewed change.
  const reviewNeed = deriveTierNeed(paths, { irrelevantRoots: REVIEW_TIER_IRRELEVANT, tierName: "a review" });

  // The Firebase L2 run is owed on exactly the paths the L2 run is — the same
  // function over the same list; only the sentence names the other run. What
  // tells the two apart is the DIGEST each is keyed on, not the paths.
  const firebaseNeed = deviceTierNeed(paths, { tierName: "the Firebase L2 run" });

  // ONE STAMP FOR BOTH L2 TIERS. `stampedApps` stamps the scratch app once,
  // hashes it, runs `add firebase --no-verify` on the same directory under the
  // same cap, and hashes again (KD-208: no second stamp, no fifth bound). The
  // thunk is shared and memoised, so whichever tier asks first pays for both
  // digests and a tier that is not required never asks.
  let apps = null;
  const stamped = () => (apps ??= readStampedApps());
  // A discharge with no rule was written before the digest had one: rule 1.
  const sameRule = (d) => (Object.hasOwn(d, "stampedRule") ? d.stampedRule : 1) === STAMPED_OUTPUT_RULE;
  const dev = tierState(need.required, plan, plan?.discharged, () => stamped().default, {
    key: "stampedHash",
    proves: (now) => recordMeetsTier(fleetRecord, TIERS.device, now),
    // A discharge is a record's copy, so it is judged as one — one rule, one
    // function, whichever file the bytes are sitting in.
    attests: (d, now) => recordMeetsTier(asRecord(d), TIERS.device, now),
    sameRule,
  });
  // An unanswerable Firebase half (`{hash: null, unanswerable}`) reads OWED
  // with its reason through `tierState`'s first branch — never DISCHARGED.
  const fb = tierState(firebaseNeed.required, plan, plan?.firebaseDischarged, () => stamped().firebase, {
    key: "stampedHash",
    proves: (now) => firebaseRecordMeets(firebaseRecord, now),
    // `rekey: null`: the rekey record re-derives the DEFAULT run only (KD-256),
    // so it never speaks for a Firebase record.
    attests: (d, now) => recordMeetsTier(asRecord(d), TIERS.firebase, now, { rekey: null }),
    sameRule,
  });
  const rev = tierState(reviewNeed.required, plan, plan?.reviewDischarged, () => ({ hash: observedTreeHash(REPO_ROOT, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }) }));
  return { ...dev, need, ...base, review: { ...rev, need: reviewNeed }, firebase: { ...fb, need: firebaseNeed } };
}

/**
 * The app this tree stamps — or WHY IT COULD NOT BE ASKED, which is a state and
 * not a crash.
 *
 * A tree with no `bin/create-cmp.mjs`, a stamp that dies, a stamp that outruns
 * its cap: none of those can say whether these bytes were proven, and an
 * exception here would take the whole schedule down with it — including inside
 * the PreToolUse hook, where "could not answer" refuses every command it
 * classifies. So it degrades to OWED and says what happened: more proof, never
 * less, which is the same direction `deriveTierNeed` fails in.
 */
function readStampedApps(root = REPO_ROOT) {
  try {
    // A failed ADD is already a state inside `stampedApps` — only the Firebase
    // half is unanswerable. A failed STAMP throws, and costs both halves.
    return stampedApps(root);
  } catch (err) {
    const unanswerable = err?.message ?? String(err);
    return { default: { hash: null, files: null, unanswerable }, firebase: { hash: null, files: null, unanswerable } };
  }
}

/**
 * The five states, once, for both at-close tiers.
 *
 * Written once rather than twice on purpose: two copies of a state machine
 * drift in one of them, and the one that drifts is whichever is read less. The
 * reading is a thunk because it is the expensive half — a stamp for the device
 * tier, hundreds of file reads for the review — and `not required` never needs
 * it.
 *
 * THE TWO TIERS DIFFER IN ONE PARAMETER, and it is the honest difference
 * between them: the device tier has an ARTIFACT to compare (`proves`, the run
 * recorded against the app this tree stamps), and a review has none — a review
 * is a reader on a diff, so the only thing that can attest one is the record
 * this slice wrote.
 *
 * The last branch is the ORDERING RULE both tiers inherit: discharged, then the
 * thing it was bound to moved, means the record describes something that no
 * longer exists. Saying REOPENED is the point — an agent that edits after the
 * last gate should be told it has reopened the slice, not silently charged for
 * another run.
 */
function tierState(required, plan, discharged, read, { key = "treeHash", proves = null, attests = null, sameRule = null } = {}) {
  if (!required) return { state: "none" };
  const reading = read();
  const now = reading.hash;
  // Asked, and unanswerable. OWED is the honest answer — a tier whose question
  // cannot be put costs a run, never a missed regression — and the reason
  // travels with it so the refusal names the real problem.
  if (typeof now !== "string") return { state: "owed", now: null, reading, unanswerable: reading.unanswerable ?? "the tree could not be read" };
  // THE EVIDENCE OUTRANKS THE BOOKKEEPING, and only for the bytes it describes.
  // A device run of THESE EXACT BYTES, at the level this tier declares, is the
  // answer to whether they were proved — whoever ran it and whatever slice it
  // was attributed to — so a slice that changed nothing the app can see is
  // discharged by the run already on disk, without an emulator and without a
  // second command. `recordMeetsTier` is the whole of that question, rung
  // included: a run that never reached a device is PASS at L1 and proves
  // nothing this tier asks.
  const m = proves ? proves(now) : null;
  if (m?.ok) return { state: "discharged", now, reading, proof: m.proof };
  // A record ABOUT these bytes that falls short is carried either way, because
  // the reader needs to know that the record on disk was seen and why it did
  // not help — "ran at L1, this tier requires L2" is an action; a bare OWED is
  // an agent running the same L1 command again.
  //
  // `other-rule` travels too, although it is not ABOUT these bytes: it is the
  // one answer whose action is not an L2 run at all but `--rekey`, and a bare
  // OWED would send an agent to buy the run a stamp could have settled.
  const shortfall = m && !m.ok && (m.about || m.code === "other-rule") ? m : null;
  // A FAILING run over these exact bytes is new evidence and it outranks a
  // plan that says otherwise: the app is unchanged, so what failed then fails
  // now. A run at too LOW a rung is not evidence against anything — it simply
  // cannot carry this tier — so it never voids a discharge that can.
  if (shortfall?.code === "verdict") return { state: "owed", now, reading, shortfall };
  if (!plan) return { state: "undeclared", now, reading, shortfall };
  if (!discharged) return { state: "owed", now, reading, shortfall };
  const was = discharged[key];
  // A discharge written before this criterion existed is bound to something
  // else entirely (the old input-path hash). It is not compared and not
  // reinterpreted: it counts as no discharge, and the reader is told why.
  if (typeof was !== "string") return { state: "owed", now, reading, unbound: discharged, shortfall };
  // A discharge copied under ANOTHER digest rule is not compared either: its
  // hash and `now` were taken by different rules, so "they differ" would be
  // REOPENED for an app that may not have moved. It counts as no discharge;
  // the record it was copied from is what `--rekey` re-derives, and once that
  // is done the record discharges the tier through `proves` above.
  if (sameRule && !sameRule(discharged)) return { state: "owed", now, reading, shortfall };
  if (was !== now) return { state: "reopened", now, reading, shortfall, proof: null };
  // THE DISCHARGE ITSELF IS HELD TO THE TIER, by the same function and for the
  // same reason: it is a COPY of a record, so a plan written from a rung-L1 run
  // — or from before any reader asked for a rung — carries what L1 carries,
  // which is not what this tier asks. Without this the hole the review found
  // would survive one `--discharge` older than the fix.
  const carried = attests ? attests(discharged, now) : { ok: true, proof: discharged };
  if (!carried.ok) return { state: "owed", now, reading, shortfall: shortfall ?? carried };
  return { state: "discharged", now, reading, shortfall, proof: { ...carried.proof, from: "this slice's own discharge" } };
}

/**
 * WHETHER A DEVICE RUN'S RECORD PROVES WHAT A TIER ASKS OF IT — the one place
 * that question is answered, for every reader.
 *
 * There were four readers and four different fractions of the question:
 * `fleetProof` checked the digest, `tierState` added `verdict === "PASS"`,
 * `--discharge` repeated both by hand, and only the publish gate ever asked for
 * a RUNG (`rung >= 2`, spelled as a number). A fleet check is PASS at whatever
 * level it was told to require, so the three that skipped the rung discharged
 * the device tier with `--min-level L1` runs — the documented desktop-only
 * invocation, which attaches no device at all.
 *
 * ORDER MATTERS, and each step answers in its own words, because the action a
 * reader should take differs: a record about another app is not a broken stamp,
 * a broken stamp is not an old record, and a run at L1 is not a failed run.
 *
 * `about` says whether the record describes THESE exact stamped bytes. It is
 * how a caller knows the difference between "this record has nothing to say
 * here" (fall through to whatever else attests the tree) and "this record is
 * about this app and it does not carry the tier" (say so, and say which).
 *
 * `exit` follows the three outcomes this repo uses everywhere: 1 for checked
 * and failed, 2 for could not check.
 *
 * THE DIGEST RULE (scripts/stamped-output.mjs, STAMPED_OUTPUT_RULE) is asked
 * before the digest is compared: two rules' digests of one app differ, so a
 * record taken under another rule is not "another app" — it is a question
 * this function cannot put yet (`other-rule`, exit 2). It is answered by
 * `node scripts/proof-plan.mjs --rekey`, which re-stamps the record's commit
 * and writes the current rule's digest BESIDE the record; that rekey is read
 * here, lazily and only when the rules differ, and accepted only when it names
 * this exact run — same `ranAt`, same commit, the record's own digest as its
 * starting point, and the record's rule to this tree's. Anything else is not
 * about this record and is ignored, never half-applied.
 *
 * @param {object|null} record `qa-artifacts/fleet-latest.json`, or null
 * @param {{requires: string, cmd: string}} tier the tier the record must satisfy
 * @param {string} now the digest of the app this tree stamps
 * @param {{rekey?: object|null|(() => object|null)}} [opts] the rekey record, or a thunk for it — read from qa-artifacts/ by default
 * @returns {{ok: true, proof: object} | {ok: false, exit: 1|2, code: string, about: boolean, reason: string}}
 */
export function recordMeetsTier(record, tier, now, { rekey = () => readRekeyRecord() } = {}) {
  const required = tier?.requires ?? null;
  const rerun = `Run the tier once: ${tier?.cmd ?? "the fleet check"}`;
  const no = (code, exit, reason, about = false) => ({ ok: false, exit, code, about, reason });

  if (!record) return no("none", 2, "no device run is recorded — a discharge is read from its record, never asserted");
  // ABSENT vs NULL is the difference between two records with nothing in common
  // but a missing digest, and telling them apart is the difference between a
  // reader who runs the check again and one who fixes the stamp first.
  if (!Object.hasOwn(record, "stampedOutputHash")) {
    return no("pre-criterion", 2, `the recorded device run carries no stampedOutputHash — it predates the stamped-app criterion and counts as no record. ${rerun}; nothing here will invent a digest for a run nobody measured.`);
  }
  if (record.stampedOutputHash === null) {
    const why = typeof record.stampedOutputError === "string" && record.stampedOutputError ? `: ${record.stampedOutputError}` : " (the run recorded no reason)";
    return no("stamp-failed", 2, `the recorded device run could not hash the app it stamped${why} — so it says nothing about these bytes, however recently it ran. FIX THE STAMP FIRST: another run records the same absent digest until it works.`);
  }
  if (typeof record.stampedOutputHash !== "string") {
    return no("malformed", 2, `the recorded device run's stampedOutputHash is ${typeof record.stampedOutputHash}, not a digest — refusing rather than reading a field whose meaning is a guess. ${rerun}`);
  }
  // WHICH RULE the digest was taken under, before it is compared with one
  // taken under this tree's.
  const recordRule = ruleOfRecord(record);
  let hash = record.stampedOutputHash;
  let files = record.stampedOutputFiles ?? null;
  let rekeyed = null;
  if (recordRule !== STAMPED_OUTPUT_RULE) {
    const rk = typeof rekey === "function" ? rekey() : rekey;
    if (!rekeyNamesRun(rk, record)) {
      const other = rk && typeof rk === "object" ? ` (qa-artifacts/fleet-rekey-latest.json is there, and names ${typeof rk.ranAt === "string" ? `the run at ${rk.ranAt}` : "no run"} — not this one)` : "";
      return no(
        "other-rule",
        2,
        `the recorded L2 run's digest was taken under stamped-output rule ${JSON.stringify(recordRule)}, and this tree computes rule ${STAMPED_OUTPUT_RULE} — two rules' digests of one app differ, so nothing here can yet say whether it describes these bytes${other}. ` +
          `Run \`node scripts/proof-plan.mjs --rekey\` INSTEAD of the L2 run: it re-stamps the commit the run was recorded at, proves that stamp reproduces the recorded digest under rule ${JSON.stringify(recordRule)}, and writes the rule-${STAMPED_OUTPUT_RULE} digest beside the record — seconds, and no L2 run. If the rekeyed app is still not this tree's, the L2 run is owed then, and this line will say so.`,
      );
    }
    rekeyed = { rule: recordRule, hash: record.stampedOutputHash, at: rk.rekeyedAt ?? null };
    hash = rk.toHash;
    files = rk.toFiles ?? null;
  }
  if (hash !== now) {
    return {
      ...no("other-app", 1, `the recorded L2 run describes another app (${hash.slice(0, 7)} → ${String(now).slice(0, 7)}${rekeyed ? `, its digest re-derived under rule ${STAMPED_OUTPUT_RULE} by --rekey` : ""}) — this tree stamps something else. ${rerun}`),
      // The manifest that was compared, so a caller that names WHICH files
      // moved diffs like with like — a rekeyed record's own manifest is the
      // old rule's.
      files,
    };
  }

  // From here the record is ABOUT the app this tree stamps, so whatever it says
  // is this tier's answer rather than a record that simply does not apply.
  if (record.verdict !== "PASS") {
    return no("verdict", 1, `the recorded device run over these exact bytes is ${record.verdict ?? "unstated"}, not PASS — a failing run discharges nothing. ${rerun}`, true);
  }
  if (!rungMeets(record.rung, required)) {
    return no(
      "rung",
      1,
      `the recorded device run ran at ${normalizeLevel(record.rung) ?? `rung none (${record.rung ?? "unstated"})`}, and this tier requires ${required} — a fleet check is PASS at whatever level it was told to require, and --min-level L1 never attaches a device. Re-run at the level: ${tier?.cmd ?? "the fleet check"}`,
      true,
    );
  }
  return {
    ok: true,
    proof: {
      at: record.ranAt ?? null,
      verdict: record.verdict,
      rung: normalizeLevel(record.rung),
      requires: required,
      stampedHash: hash,
      stampedFiles: files,
      stampedRule: STAMPED_OUTPUT_RULE,
      ...(rekeyed ? { rekeyedFrom: rekeyed } : {}),
      from: rekeyed ? "qa-artifacts/fleet-latest.json, its digest re-derived by qa-artifacts/fleet-rekey-latest.json" : "qa-artifacts/fleet-latest.json",
    },
  };
}

/**
 * Whether a rekey record re-derives THIS fleet record — every field that
 * identifies the run, or it says nothing about it.
 *
 * `ranAt` and `commit` name the run; `fromHash` and `fromRule` say the rekey
 * started from this record's own digest (which `--rekey` reproduced before it
 * wrote anything); `toRule` says it was re-derived to the rule this tree
 * computes. A rekey of the run before, of the same run under a third rule, or
 * of a record that was since overwritten by a new run, matches none of them.
 */
export function rekeyNamesRun(rk, record) {
  if (!rk || typeof rk !== "object" || !record || typeof record !== "object") return false;
  return (
    rk.schema === REKEY_SCHEMA &&
    typeof rk.ranAt === "string" &&
    rk.ranAt === record.ranAt &&
    typeof rk.commit === "string" &&
    rk.commit === record.commit &&
    typeof rk.fromHash === "string" &&
    rk.fromHash === record.stampedOutputHash &&
    rk.fromRule === ruleOfRecord(record) &&
    rk.toRule === STAMPED_OUTPUT_RULE &&
    typeof rk.toHash === "string" &&
    /^[0-9a-f]{64}$/.test(rk.toHash)
  );
}

/** The rekey record `--rekey` wrote, or null. Never throws — read only when a record's rule differs. */
export function readRekeyRecord(file = REKEY_PATH) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * A plan's `discharged` block in the shape of the record it was copied from, so
 * `recordMeetsTier` can judge it without a second spelling of the same rule.
 * A discharge written before the criterion has no `stampedHash`, and reads here
 * exactly as a record with no digest does — as no proof at all.
 */
function asRecord(discharged) {
  return {
    ...(Object.hasOwn(discharged ?? {}, "stampedHash") ? { stampedOutputHash: discharged.stampedHash } : {}),
    // A discharge written before the digest had a rule carries none, and reads
    // as the record it was copied from did: rule 1.
    ...(Object.hasOwn(discharged ?? {}, "stampedRule") ? { stampedOutputRule: discharged.stampedRule } : {}),
    stampedOutputFiles: discharged?.stampedFiles ?? null,
    verdict: discharged?.verdict ?? null,
    rung: discharged?.rung ?? null,
    ranAt: discharged?.at ?? null,
  };
}

/**
 * WHETHER A RECORD PROVES THE FIREBASE L2 RUN: it must SAY it served the
 * Firebase Emulator Suite (`coverage.firebase === true`, written by
 * `fleet-check --with-firebase`), and then meet the tier exactly as any record
 * meets its tier — digest, rule, verdict, rung — through `recordMeetsTier`.
 * A record without that field is a default-shaped run sitting in the Firebase
 * file, and says nothing about the emulator redirect this tier exists to prove.
 * `rekey: null` because `--rekey` re-derives the default run's record only (KD-256).
 */
export function firebaseRecordMeets(record, now) {
  if (record && record.coverage?.firebase !== true) {
    return {
      ok: false,
      exit: 2,
      code: "no-coverage",
      about: true,
      reason: `the recorded Firebase run (${FIREBASE_FLEET_RECORD}) does not say it served the Firebase Emulator Suite — coverage.firebase is ${JSON.stringify(record.coverage?.firebase)}, not true — so it proves at most the default app. Run the tier once: ${TIERS.firebase.cmd}`,
    };
  }
  const m = recordMeetsTier(record, TIERS.firebase, now, { rekey: null });
  return m.ok ? { ...m, proof: { ...m.proof, from: FIREBASE_FLEET_RECORD } } : m;
}

/** The Firebase L2 run's record, or null. Never throws. */
export function readFirebaseRecord(file = path.join(REPO_ROOT, FIREBASE_FLEET_RECORD)) {
  return readFleetRecord(file);
}

/** The device run's record, or null. Never throws — an absent record is a state, not a crash. */
export function readFleetRecord(file = path.join(REPO_ROOT, "qa-artifacts", "fleet-latest.json")) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * What a rekey's stamp may cost. NOT `STAMP_CAP_MS`: that cap exists because
 * `obligation()` stamps inside a hook with a 10s budget, and `--rekey` is a
 * command an agent runs on purpose, once, over a tree it has just unpacked.
 * A rekey killed at 3s on a busy laptop is a refusal for a reason that is not
 * true.
 */
const REKEY_STAMP_TIMEOUT_MS = 120_000;

/**
 * `git archive <commit> | tar -x` into `dir`, as two processes with the bytes
 * held between them — no shell, so nothing in a commit string is ever parsed
 * by one (it is also checked to be a full hex sha before this is called).
 */
function extractCommit(root, commit, dir) {
  const tarball = spawnSync("git", ["archive", "--format=tar", commit], { cwd: root, maxBuffer: 1024 * 1024 * 1024 });
  if (tarball.status !== 0) return `git archive ${commit} exited ${tarball.status ?? tarball.signal}: ${String(tarball.stderr ?? "").trim().split("\n").slice(-1)[0] || "no stderr"}`;
  const untar = spawnSync("tar", ["-x", "-f", "-", "-C", dir], { input: tarball.stdout, maxBuffer: 64 * 1024 * 1024 });
  if (untar.status !== 0) return `tar -x exited ${untar.status ?? untar.signal}: ${String(untar.stderr ?? "").trim().split("\n").slice(-1)[0] || "no stderr"}`;
  return null;
}

/**
 * RE-DERIVE AN OLD-RULE FLEET RECORD'S DIGEST UNDER THE CURRENT RULE — from
 * the commit it ran on, and never by editing it.
 *
 * WHY THIS EXISTS: raising STAMPED_OUTPUT_RULE (scripts/stamped-output.mjs)
 * makes every PASS record on every laptop incomparable with the tree beside
 * it. The honest options were an L2 run per laptop to re-prove apps that did
 * not move, or a translation that shows its work. This is the second, and its
 * work is: unpack the record's commit OUTSIDE the repository, stamp it with
 * that commit's own `create-cmp`, hash the stamp under the record's rule and
 * REFUSE unless that reproduces the recorded digest exactly — only then is the
 * same stamp hashed under the current rule and written to
 * `qa-artifacts/fleet-rekey-latest.json`. The reproduction is the proof that
 * the stamp is the app the run proved; without it the new digest would be a
 * claim about some other app.
 *
 * REFUSED, each for its own reason and before anything is stamped: no record,
 * no digest on it, a record already under the current rule (nothing to do), a
 * rule this module cannot compute, a verdict other than PASS or a rung below
 * the tier (a rekey would re-label a run that discharges nothing), no commit
 * (nothing to re-stamp), a run over a dirty tree (the commit is not the tree it
 * proved — `treeWasDirty` must be explicitly false), no `ranAt` (the rekey is
 * keyed by it), or a commit this checkout does not have.
 *
 * It appends no history row (the orchestrator's answer 7, 2026-09-24): the
 * history counts what proving COST, and a rekey proves nothing new.
 *
 * @returns {{ok: true, rekey: object, message: string} | {ok: false, exit: 1|2, message: string}}
 */
export function rekey({ root = REPO_ROOT, record = readFleetRecord(), out = REKEY_PATH, now = new Date(), stampTimeoutMs = REKEY_STAMP_TIMEOUT_MS } = {}) {
  const refuse = (exit, why) => ({ ok: false, exit, message: `--rekey refused: ${why}\n` });
  const runIt = `run the L2 run instead: ${TIERS.device.cmd}`;
  if (!record) return refuse(2, `no L2 run is recorded (qa-artifacts/fleet-latest.json) — there is no digest to re-derive. ${runIt}`);
  if (typeof record.stampedOutputHash !== "string") return refuse(2, `the recorded run carries no stampedOutputHash (${record.stampedOutputHash === null ? "its stamp failed" : "it predates the stamped-app criterion"}) — a rekey starts from a digest the run measured, and there is none. ${runIt}`);
  const fromRule = ruleOfRecord(record);
  if (fromRule === STAMPED_OUTPUT_RULE) return refuse(1, `the recorded run's digest is already under rule ${STAMPED_OUTPUT_RULE}, the rule this tree computes — there is nothing to rekey. \`node scripts/proof-plan.mjs\` reads it as it is.`);
  if (!STAMPED_OUTPUT_RULES.includes(fromRule)) return refuse(2, `the recorded run's digest is under rule ${JSON.stringify(fromRule)}, which this module cannot compute (it computes ${STAMPED_OUTPUT_RULES.join(", ")}) — so it cannot be reproduced, and nothing is re-derived without reproducing it first. ${runIt}`);
  if (record.verdict !== "PASS") return refuse(1, `the recorded run is ${record.verdict ?? "unstated"}, not PASS — a failing run discharges nothing under any rule, and a rekey would only re-label it. ${runIt}`);
  if (!rungMeets(record.rung, TIERS.device.requires)) return refuse(1, `the recorded run ran at ${normalizeLevel(record.rung) ?? "rung none"}, below the ${TIERS.device.requires} this tier requires — a rekey would re-label a run that cannot carry the tier. ${runIt}`);
  if (typeof record.commit !== "string" || !/^[0-9a-f]{40}$/.test(record.commit)) return refuse(2, `the recorded run names no commit (${JSON.stringify(record.commit ?? null)}) — there is nothing to re-stamp, so its app cannot be reproduced. ${runIt}`);
  if (record.treeWasDirty !== false) return refuse(1, `the recorded run was over a ${record.treeWasDirty === true ? "DIRTY" : "possibly dirty (treeWasDirty is not recorded as false)"} tree — commit ${record.commit.slice(0, 7)} is not the tree it proved, so re-stamping it proves nothing about that run. ${runIt}`);
  if (typeof record.ranAt !== "string" || !record.ranAt) return refuse(2, `the recorded run carries no ranAt — a rekey is accepted only for the run it names, and this one cannot be named. ${runIt}`);
  const has = spawnSync("git", ["cat-file", "-e", `${record.commit}^{commit}`], { cwd: root, stdio: "ignore" });
  if (has.status !== 0) return refuse(2, `this checkout does not have commit ${record.commit.slice(0, 7)} — \`git fetch\` it, then --rekey again. Nothing was stamped.`);

  // OUTSIDE the repository, always: a stamp that wrote into the tree would
  // change the tree it is measuring.
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-rekey-")));
  const tree = path.join(scratch, "tree");
  let app = null;
  try {
    fs.mkdirSync(tree);
    const unpacked = extractCommit(root, record.commit, tree);
    if (unpacked) return refuse(2, `could not unpack commit ${record.commit.slice(0, 7)} (${unpacked}). Nothing was written.`);
    // The commit's own create-cmp stamps its own app, with this checkout's
    // installed dependencies — node_modules is not in a commit.
    const modules = path.join(root, "node_modules");
    if (fs.existsSync(modules)) fs.symlinkSync(fs.realpathSync(modules), path.join(tree, "node_modules"), "dir");
    try {
      app = stampScratchApp(tree, { timeoutMs: stampTimeoutMs });
    } catch (err) {
      return refuse(2, `re-stamping commit ${record.commit.slice(0, 7)} failed: ${err?.message ?? err}. Nothing was written.`);
    }
    const from = hashStampedTree(app.appDir, { rule: fromRule });
    if (from.hash !== record.stampedOutputHash) {
      return refuse(
        1,
        `re-stamping commit ${record.commit.slice(0, 7)} does NOT reproduce the recorded digest under rule ${fromRule} (${from.hash.slice(0, 7)}, the record says ${record.stampedOutputHash.slice(0, 7)}) — ${describeStampedDiff(record.stampedOutputFiles, from.files)}. The stamp is not the app the run proved, so no digest is re-derived from it. ${runIt}`,
      );
    }
    const to = hashStampedTree(app.appDir, { rule: STAMPED_OUTPUT_RULE });
    const rk = {
      schema: REKEY_SCHEMA,
      ranAt: record.ranAt,
      commit: record.commit,
      fromRule,
      fromHash: record.stampedOutputHash,
      toRule: STAMPED_OUTPUT_RULE,
      toHash: to.hash,
      toFiles: to.files,
      rekeyedAt: now.toISOString(),
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(rk, null, 2)}\n`);
    return {
      ok: true,
      rekey: rk,
      message:
        `rekeyed the L2 run at ${record.ranAt} (commit ${record.commit.slice(0, 7)}): re-stamped, reproduced rule ${fromRule} ${record.stampedOutputHash.slice(0, 7)}, ` +
        `rule ${STAMPED_OUTPUT_RULE} ${to.hash.slice(0, 7)} — written to ${path.relative(root, out) || out}. The fleet record is unchanged.\n`,
    };
  } finally {
    app?.dispose();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Close the slice: remove the plan when nothing is owed. The merge hook calls
 * this after `gh pr merge` so a finished slice's plan never lies around to be
 * named stale by the next one — the 2026-09-08 audit found PR #84's still there.
 *
 * Removed from the working state, KEPT in the history — and kept under the name
 * that is true, which review of the slice that added the history showed is not
 * always `closed` (KD-59):
 *
 *   - the plan of THIS branch, settled: `closed`, with the tiers' states as they
 *     stood at close.
 *   - a plan from ANOTHER branch, found after `gh pr merge --delete-branch` has
 *     moved the checkout to trunk and deleted that branch: `closed` — it is the
 *     slice the merge just landed. Its tier states are the ones in the plan; the
 *     obligation computed on trunk says `none` and describes trunk, not the slice.
 *   - a plan from another branch whose branch STILL EXISTS: `cleared`. Something
 *     else merged or closed; this plan's slice did not end here, and recording it
 *     as closed would hand it a lifetime spanning two slices.
 */
export function close(o = obligation(), { planPath = PLAN_PATH, historyFile = historyPath(REPO_ROOT, "plans"), via = null, now = new Date(), branchExists = localBranchExists } = {}) {
  const isSettled = (s) => s === "none" || s === "discharged";
  // BOTH at-close tiers, or the plan stays: a slice that closed with a review
  // owed would be a slice whose next reader is told nothing is outstanding.
  // And the Firebase L2 run, for the same reason: an obligation without the
  // block (a caller's stub) reads as not owed, never as settled-by-omission of a
  // tier that was computed.
  const settled = isSettled(o.state) && isSettled(o.review?.state ?? "none") && isSettled(o.firebase?.state ?? "none");
  const ended = o.plan ?? o.stale ?? null;
  if (settled && ended) {
    const own = Boolean(o.plan);
    const event = own || !branchExists(ended.branch) ? "closed" : "cleared";
    appendHistory(
      historyFile,
      planEvent(event, ended, { via, onBranch: o.branch ?? null, device: own ? o.state : null, review: own ? (o.review?.state ?? "none") : null, firebase: own ? (o.firebase?.state ?? "none") : null, now }),
    );
    fs.rmSync(planPath, { force: true });
  }
  return { closed: settled, removed: Boolean(settled && ended), state: o.state, reviewState: o.review?.state ?? "none", firebaseState: o.firebase?.state ?? "none" };
}

/** Whether a local branch of this name exists. Unanswerable counts as existing, so a doubt records `cleared`, never a false `closed`. */
function localBranchExists(name) {
  if (!name) return false;
  const r = sh("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]);
  return r.status !== 1;
}

/** One history row about a plan: what happened to it, when, and the plan as it stood. */
function planEvent(event, plan, { via = null, onBranch = null, device = null, review = null, firebase = null, now = new Date() } = {}) {
  return { schema: PLAN_EVENT_SCHEMA, event, via, at: now.toISOString(), onBranch, device, review, firebase, plan: withoutManifest(plan) };
}

/**
 * The plan as the HISTORY keeps it: everything except the stamped app's file
 * manifest, which is hundreds of rows describing a tree that is gone by the
 * time anyone reads the row. The count survives — "how big was the app this
 * slice proved" is a question the history can still answer — and the digest
 * survives, so two rows can still be compared.
 */
function withoutManifest(plan) {
  if (!plan?.discharged?.stampedFiles && !plan?.firebaseDischarged?.stampedFiles) return plan;
  const strip = (d) => {
    if (!d?.stampedFiles) return d;
    const { stampedFiles, ...rest } = d;
    return { ...rest, stampedFileCount: Object.keys(stampedFiles).length };
  };
  return { ...plan, discharged: strip(plan.discharged), ...(Object.hasOwn(plan, "firebaseDischarged") ? { firebaseDischarged: strip(plan.firebaseDischarged) } : {}) };
}

/**
 * Declare a slice. A plan already on disk is not silently overwritten: it is kept
 * in the history as `replaced`, because a slice abandoned for another is still a
 * slice that cost something.
 */
export function openPlan({ name, branch, base = null }, { planPath = PLAN_PATH, historyFile = historyPath(REPO_ROOT, "plans"), now = new Date() } = {}) {
  let existing = null;
  try {
    const p = JSON.parse(fs.readFileSync(planPath, "utf8"));
    if (p && p.schema === SCHEMA) existing = p;
  } catch {
    existing = null;
  }
  if (existing) appendHistory(historyFile, planEvent("replaced", existing, { via: "open", onBranch: branch, now }));
  const plan = {
    schema: SCHEMA,
    slice: name,
    branch,
    openedAt: now.toISOString(),
    base,
    declared: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.when])),
    discharged: null,
    reviewDischarged: null,
  };
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

/** What is still outstanding, by tier name — the sentence `--close` refuses with. */
export function outstanding(o) {
  const open = (s) => s === "owed" || s === "reopened" || s === "undeclared";
  const out = [];
  // "L2 run" is the PRINTED name (Karel, 2026-09-24); the tier's data key is
  // still `device` — TIERS.device, a plan's `declared.device` — see KD-6.
  if (open(o.state)) out.push(`L2 run (${o.state.toUpperCase()})`);
  if (open(o.review?.state)) out.push(`review (${o.review.state.toUpperCase()})`);
  if (open(o.firebase?.state)) out.push(`Firebase L2 run (${o.firebase.state.toUpperCase()})`);
  return out;
}

/** The tiers `render()` prints in a block of their own, and so skips in the cheap-tier loop. */
const OWN_BLOCK = new Set(["device", "review", "firebase"]);

export function render(o) {
  const L = [];
  const t = TIERS.device;
  L.push("proof plan — what this slice owes (NORTH-STAR §7)\n");
  if (o.plan) L.push(`  slice   ${o.plan.slice}\n  branch  ${o.plan.branch}\n  opened  ${o.plan.openedAt}\n`);
  else if (o.branch !== undefined) L.push(`  branch  ${o.branch || "(detached)"}${isTrunk(o.branch) ? " — trunk, not a slice" : ""}\n`);
  if (o.stale) L.push(`  (a plan from slice "${o.stale.slice}" on branch ${o.stale.branch ?? "unknown"} is still on disk and does not apply here — --close removes it)\n`);

  for (const [name, tier] of Object.entries(TIERS)) {
    // BY NAME, NOT BY `when`. These two have their own blocks below; the suite
    // and framework-check are `at-close` too, and a `when` test would hide them.
    if (OWN_BLOCK.has(name)) continue;
    L.push(`  ${name.padEnd(16)} ${tier.when.padEnd(12)} ${tier.cost.padEnd(22)} ${tier.cmd}`);
    if (tier.due) L.push(`      due ${tier.due}`);
    // Whether the suite has ALREADY run over these bytes — the line a reviewer or
    // an author reads before spending a minute re-deriving it (scripts/suite-record.mjs).
    if (name === "suite" && o.suite) L.push(`      ${describeSuiteStatus(o.suite)}`);
  }

  const line = (verdict, detail) => L.push(`  ${"L2 run".padEnd(16)} ${verdict}\n      ${detail}`);
  switch (o.state) {
    case "none":
      line("NOT OWED", o.need.reason);
      break;
    case "undeclared":
      line(
        "OWED — but no slice is declared",
        `${o.need.reason}.\n      ${isTrunk(o.branch) ? "You are on trunk — branch first (git switch -c <name>), then declare the slice" : "Declare the slice first"}: node scripts/proof-plan.mjs --open "<what you are building>".\n      Declaring up front is the point — a slice that knows it will need an L2 run can be\n      scoped differently, and one that knows it will not never pays for one.${
          // The same sentence the OWED branch leads with: an old-rule record
          // may settle this with a stamp, and an undeclared slice is exactly
          // the one about to be told to buy a run.
          o.shortfall?.code === "other-rule" ? `\n      And before any L2 run: ${o.shortfall.reason}\n      Now: node scripts/proof-plan.mjs --rekey` : ""
        }`,
      );
      break;
    case "owed":
      // FOUR WAYS A RUN CAN BE OWED, and they want different actions, so they
      // are different sentences. Only the last of them is "go and run it".
      //
      // The first is where a record on disk WAS read and did not carry the
      // tier: too low a rung, a FAIL over these same bytes, a stamp that broke.
      // `recordMeetsTier` has already said which in one sentence, and saying
      // only "OWED" over it is what sends an agent to re-run the same
      // insufficient command. (There is no separate FAIL branch here: a failing
      // run is one of that function's answers, with its own words.)
      //
      // Before all four: a record under ANOTHER DIGEST RULE. What it owes is
      // not an L2 run but a stamp — `--rekey` — and the line says that first,
      // because the run it would otherwise send an agent to is 3.5 minutes
      // spent re-proving an app that may not have moved.
      if (o.shortfall?.code === "other-rule") {
        line(
          "OWED — the run on record is keyed under another digest rule: REKEY it, do not re-run it",
          `${o.shortfall.reason}\n      ${o.need.reason}.\n      Now: node scripts/proof-plan.mjs --rekey`,
        );
      } else if (o.shortfall) {
        line(
          `OWED — the run on record does not carry this tier (${o.shortfall.code})`,
          `${o.shortfall.reason}\n      ${o.need.reason}.`,
        );
      } else if (o.unanswerable) {
        line(
          "OWED — the app this tree stamps could not be produced",
          `${o.need.reason}.\n      ${o.unanswerable}. Nothing here can say whether these bytes were proven, and a question that\n      cannot be put is owed rather than waved through. Fix the stamp first — everything else about\n      this tier is downstream of it.`,
        );
      } else if (o.unbound) {
        line(
          "OWED — the recorded run predates the stamped-app criterion",
          `this slice's discharge carries no stampedHash, and no fleet record carries a stampedOutputHash for\n      these bytes. It is bound to the old input-path hash, which says nothing about the app this tree stamps,\n      so it counts as NO record — no hash is invented for it. Run the tier once — ${t.cost}:\n        ${t.cmd}\n      Then: node scripts/proof-plan.mjs --discharge`,
        );
      } else {
        line(
          "OWED — discharge at slice close, NOT NOW",
          `${o.need.reason}.\n      What discharges it is the app this tree STAMPS: a PASS run recorded against these exact stamped bytes,\n      whichever slice bought it. This is the last gate. Run it when everything else is green and you are\n      about to open the PR — ${t.cost}:\n        ${t.cmd}\n      Then: node scripts/proof-plan.mjs --discharge`,
        );
      }
      break;
    case "discharged": {
      const p = o.proof ?? o.plan?.discharged ?? {};
      line(
        "DISCHARGED",
        `the stamped app is byte-identical to the one proven at ${p.at ?? "an unstated time"} — verdict ${p.verdict ?? "unstated"}, rung ${p.rung ?? "none"} against the ${t.requires} this tier requires${p.from ? `, read from ${p.from}` : ""}.\n      This tier is scheduled by what the tree STAMPS, not by which input paths moved: an edit the app never\n      sees — engine source, a test, a doc — costs nothing here.`,
      );
      break;
    }
    case "reopened":
      line(
        "REOPENED — the stamped app moved after the L2 run",
        `${describeStampedDiff(o.plan.discharged.stampedFiles, o.reading?.files)}.\n      The run at ${o.plan.discharged.at} describes an app that no longer exists (${String(o.plan.discharged.stampedHash).slice(0, 7)} → ${o.now.slice(0, 7)}).\n      The L2 run is the LAST gate: either revert what moved, or accept a second run.\n      This is the ordering mistake that cost three L2 runs in one session on 2026-09-08.`,
      );
      break;
  }
  renderReview(o, L);
  renderFirebase(o, L);
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

/**
 * The Firebase L2 run's block, printed AFTER the review's. Its label is
 * "Firebase L2 run" and deliberately not anything that starts with "L2 run ":
 * readers of this output anchor the default tier's block on that label.
 *
 * Fewer sentences than the default tier's, on purpose: this tier has no
 * pre-criterion history to explain and no rekey of its own (`--rekey`
 * re-derives the default run's record only — KD-256), so a record
 * that does not carry it is named by `recordMeetsTier`'s or
 * `firebaseRecordMeets`'s own reason and nothing is paraphrased over it.
 */
function renderFirebase(o, L) {
  const f = o.firebase;
  if (!f) return;
  const t = TIERS.firebase;
  const d = o.plan?.firebaseDischarged;
  const line = (verdict, detail) => L.push(`  ${"Firebase L2 run".padEnd(16)} ${verdict}\n      ${detail}`);
  switch (f.state) {
    case "none":
      line("NOT OWED", f.need.reason);
      break;
    case "undeclared":
      line(
        "OWED — but no slice is declared",
        `${f.need.reason}.\n      ${isTrunk(o.branch) ? "You are on trunk — branch first (git switch -c <name>), then declare the slice" : "Declare the slice first"}: node scripts/proof-plan.mjs --open "<what you are building>".`,
      );
      break;
    case "owed":
      if (f.shortfall) {
        line(`OWED — the run on record does not carry this tier (${f.shortfall.code})`, `${f.shortfall.reason}\n      ${f.need.reason}.`);
      } else if (f.unanswerable) {
        line(
          "OWED — the app this tree stamps with Firebase added could not be produced",
          `${f.need.reason}.\n      ${f.unanswerable}. Nothing here can say whether these bytes were proven, and a question that\n      cannot be put is owed rather than waved through. The default L2 run is judged on its own digest.`,
        );
      } else {
        line(
          "OWED — discharge at slice close, NOT NOW",
          `${f.need.reason}.\n      What discharges it is the app this tree stamps with \`create-cmp add firebase --no-verify\` applied: a PASS run\n      recorded against those exact bytes in ${FIREBASE_FLEET_RECORD}, with coverage.firebase. Run it last — ${t.cost}:\n        ${t.cmd}\n      Then: node scripts/proof-plan.mjs --discharge`,
        );
      }
      break;
    case "discharged": {
      const p = f.proof ?? d ?? {};
      line(
        "DISCHARGED",
        `the app this tree stamps with Firebase added is byte-identical to the one proven at ${p.at ?? "an unstated time"} — verdict ${p.verdict ?? "unstated"}, rung ${p.rung ?? "none"} against the ${t.requires} this tier requires${p.from ? `, read from ${p.from}` : ""}.`,
      );
      break;
    }
    case "reopened":
      line(
        "REOPENED — the Firebase app moved after its L2 run",
        `${describeStampedDiff(d?.stampedFiles, f.reading?.files)}.\n      The run at ${d?.at ?? "an unstated time"} describes an app that no longer exists (${String(d?.stampedHash).slice(0, 7)} → ${String(f.now).slice(0, 7)}).\n      Either revert what moved, or accept a second Firebase L2 run: ${t.cmd}`,
      );
      break;
  }
}

/**
 * `--discharge`, as a function of what it read: the plan, the two digests of
 * ONE stamp (`stampedApps`), and each tier's own record. Nothing here takes a
 * caller's word — every field it writes is copied from a record that met its
 * tier.
 *
 * The DEFAULT tier keeps its semantics exactly: discharged from
 * `qa-artifacts/fleet-latest.json`, and a record that does not meet it is the
 * exit (`recordMeetsTier`'s 1 or 2). The FIREBASE tier, when it is required,
 * is discharged only from FIREBASE_FLEET_RECORD meeting the Firebase digest
 * (`firebaseRecordMeets`); when it does not meet, the reason is returned as a
 * note and the exit is left as the default tier made it. Each tier is written
 * from its own record whatever the other one did — one record never
 * discharges both.
 */
export function discharge(plan, { apps, fleetRecord = null, firebaseRecord = null, firebaseRequired = false } = {}) {
  const next = { ...plan };
  const notes = [];
  const now = apps.default.hash;
  // ONE reading, the same one the schedule prints and the merge gate refuses
  // on: digest, verdict AND rung. Reading the verdict without the rung is
  // reading half a record — a fleet check is PASS at whatever level it was
  // told to require, and `--min-level L1` attaches no device.
  const m = recordMeetsTier(fleetRecord, TIERS.device, now);
  if (m.ok) {
    // `stampedRule` rides with the digest for the reason the record's does:
    // a discharge is only comparable with a digest taken under its rule.
    next.discharged = {
      at: m.proof.at,
      stampedHash: now,
      stampedFiles: apps.default.files,
      stampedRule: apps.default.rule,
      verdict: m.proof.verdict,
      rung: m.proof.rung,
      ...(m.proof.rekeyedFrom ? { rekeyedFrom: m.proof.rekeyedFrom } : {}),
    };
  } else {
    notes.push(`${m.reason}${m.code === "other-app" ? `\n${describeStampedDiff(m.files ?? fleetRecord.stampedOutputFiles, apps.default.files)}` : ""}`);
  }
  if (firebaseRequired) {
    const fb = apps.firebase;
    if (typeof fb?.hash !== "string") {
      notes.push(`the Firebase L2 run is not discharged — ${fb?.unanswerable ?? "the Firebase app was not stamped"}`);
    } else {
      const f = firebaseRecordMeets(firebaseRecord, fb.hash);
      if (f.ok) {
        next.firebaseDischarged = { at: f.proof.at, stampedHash: fb.hash, stampedFiles: fb.files, stampedRule: fb.rule, verdict: f.proof.verdict, rung: f.proof.rung };
      } else {
        notes.push(`the Firebase L2 run is not discharged — ${f.reason}${f.code === "other-app" ? `\n${describeStampedDiff(f.files ?? firebaseRecord.stampedOutputFiles, fb.files)}` : ""}`);
      }
    }
  }
  return { ok: m.ok, exit: m.ok ? 0 : m.exit, plan: next, notes, wrote: m.ok || next.firebaseDischarged !== plan?.firebaseDischarged };
}

/**
 * THE TWO KINDS OF THING A REVIEW RECORD CAN BE, named, because a row that does
 * not say which is indistinguishable from the other.
 *
 * `round` is a reader that read a diff. `rerecord` is a recorded round's
 * finding confirmed against bytes that moved under it — who reads for it and
 * when it is owed, docs/KNOWN-DEFECTS.md's header settles, and it is the header
 * that settles it; this is a vocabulary, not a second statement of the rule.
 *
 * MEASURED IN THIS REPOSITORY'S OWN EVIDENCE, 2026-09-18: the 19:58 row of
 * `qa-artifacts/review-history.jsonl` carries the words "this is a re-record
 * after a rebase" INSIDE its free-text `tests` array, because there was no field
 * to put it in. Nothing can count that, so `scripts/change-price.mjs` can only
 * ever call its row count an upper bound on rounds.
 */
export const REVIEW_KINDS = Object.freeze(["round", "rerecord"]);

/**
 * Write the reviewer's record, and keep it. WHAT was found comes from the caller
 * (only the reviewer knows it); WHICH TREE was read is computed here, so no caller
 * can assert that a review describes bytes it never saw. The latest record is what
 * a discharge reads; the history row is the same record with the branch it was
 * written on, so a review can be attributed to its slice after the plan is gone.
 *
 * `round` AND `kind` ARE OPTIONAL, AND ABSENT MEANS UNKNOWN — never zero, never
 * "the first". Every record written before these existed is missing them and
 * none is rewritten: backfilling would be a guess recorded as a fact, in the one
 * file this product holds up as evidence. What reads them resolves unknown
 * CONSERVATIVELY: `scripts/change-price.mjs` prices the next round OWED where it
 * cannot tell, because an error there costs paperwork in one direction and a
 * SKIPPED review in the other, and only one of those is recoverable.
 *
 * THE SCHEMA STRING DOES NOT MOVE, AND THAT IS THE DECISION RATHER THAN AN
 * OVERSIGHT. `reviewDischarge` below refuses outright on a schema it does not
 * recognise — "refusing rather than reading fields whose meaning is a guess" —
 * so bumping to /2 would refuse every record already on disk, including one
 * written minutes earlier by a slice in flight, over two fields that are
 * additive and optional. A schema version exists to stop a reader misreading a
 * field whose MEANING changed; nothing here changed meaning. A /1 reader that
 * has never heard of `round` reads exactly the fields it knows, and they still
 * say what they said.
 */
export function recordReview({ tests = [], decisions = [], nothingFound = false, round = null, kind = null }, { root = REPO_ROOT, now = new Date() } = {}) {
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["branch", "--show-current"]);
  const record = {
    schema: REVIEW_SCHEMA,
    ranAt: now.toISOString(),
    // WHICH TREE was read, as content — the same binding the fleet record
    // uses and for the same reason: a review predates the commit that carries
    // it, so a commit-keyed record reads stale the moment it lands. The commit
    // is kept beside it as provenance a human can read, never as the key.
    observedHash: observedTreeHash(root, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }),
    commit: head.status === 0 ? head.stdout.trim() : null,
    tests,
    decisions,
    nothingFound,
    // Written only when the caller said so. A key present with a null value and
    // a key absent read the same to everything downstream, and both mean
    // unknown — but the absent one cannot be mistaken for a recorded null.
    ...(round === null ? {} : { round }),
    ...(kind === null ? {} : { kind }),
  };
  const latest = path.join(root, "qa-artifacts", "review-latest.json");
  fs.mkdirSync(path.dirname(latest), { recursive: true });
  fs.writeFileSync(latest, `${JSON.stringify(record, null, 2)}\n`);
  appendHistory(historyPath(root, "reviews"), { ...record, branch: branch.status === 0 ? branch.stdout.trim() || null : null });
  return record;
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
    openPlan({ name, branch, base: base.status === 0 ? base.stdout.trim() : null });
    process.stdout.write(`${render(obligation())}\n`);
    process.exit(0);
  }

  if (flag("--history") !== -1) {
    const kept = Object.fromEntries(["plans", "reviews", "fleet", "fleet-firebase"].map((k) => [k, readHistory(historyPath(REPO_ROOT, k))]));
    const summary = summarize({ plans: kept.plans.rows, reviews: kept.reviews.rows, fleet: kept.fleet.rows, firebase: kept["fleet-firebase"].rows });
    const malformed = kept.plans.malformed + kept.reviews.malformed + kept.fleet.malformed + kept["fleet-firebase"].malformed;
    process.stdout.write(flag("--json") !== -1 ? `${JSON.stringify({ ...summary, malformed }, null, 2)}\n` : `${renderHistory(summary, { malformed })}\n`);
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
    // WHICH ROUND THIS IS, AND WHETHER IT IS ONE. Both optional, and a value
    // that does not parse is REFUSED rather than written: this is the same
    // refusal `--nothing-found` against findings already makes, for the same
    // reason. A record carrying `kind: "rerecrd"` reads as unknown forever and
    // looks like an answer, and the one thing this command will not do is write
    // down something nobody can act on. Omit them and the row says nothing,
    // which is honest; misspell them and it would say something false.
    const roundArg = opt("--round");
    const round = roundArg === null ? null : Number(roundArg);
    if (roundArg !== null && (!Number.isInteger(round) || round < 1)) {
      process.stderr.write(`--round takes a whole number from 1 — "${roundArg}" is not one. Which round a record is decides what the NEXT one has to read, so a guess here is worse than silence.\n`);
      process.exit(2);
    }
    const kind = opt("--kind");
    if (kind !== null && !REVIEW_KINDS.includes(kind)) {
      process.stderr.write(`--kind takes ${REVIEW_KINDS.join(" or ")} — not "${kind}". What separates them, and what a re-record is for, is the header of docs/KNOWN-DEFECTS.md.\n`);
      process.exit(2);
    }
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
    const record = recordReview({ tests, decisions, nothingFound, round, kind });
    // WHAT THE ROW WILL SAY IT IS, back to its writer. A field nobody sees go in
    // is a field nobody notices missing, and unknown is the state that costs a
    // round downstream — so the absence is printed as loudly as the value.
    const said = round === null && kind === null
      ? "it does NOT say which round it is — `node scripts/change-price.mjs` will price the next round OWED because it cannot tell. Add --round <n> [--kind round|rerecord]"
      : `round ${round ?? "unstated"}, kind ${kind ?? "unstated"}`;
    process.stdout.write(`review recorded — qa-artifacts/review-latest.json, tree ${record.observedHash.slice(0, 7)}\n${said}\nNow: ${TIERS.review.cmd}\n`);
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

  if (flag("--rekey") !== -1) {
    // A stamp of the recorded commit, never an L2 run and never an edit of the
    // fleet record — see `rekey`. What it prints after is the schedule as it
    // now reads, so the agent sees at once whether the rekeyed run carries it.
    const r = rekey();
    if (!r.ok) {
      process.stderr.write(r.message);
      process.exit(r.exit);
    }
    process.stdout.write(`${r.message}\n${render({ ...obligation(), suite: suiteStatus() })}\n`);
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
    // exactly that shape. The records fleet-check writes are the evidence, and
    // ONE stamp answers both digests — the one `obligation()` reads too.
    const r = discharge(plan, {
      apps: stampedApps(REPO_ROOT),
      fleetRecord: readFleetRecord(),
      firebaseRecord: readFirebaseRecord(),
      firebaseRequired: deviceTierNeed(changedPaths(), { tierName: "the Firebase L2 run" }).required,
    });
    if (r.wrote) write(r.plan);
    if (!r.ok) {
      process.stderr.write(`${r.notes.join("\n")}\n`);
      process.exit(r.exit);
    }
    process.stdout.write(`${r.notes.map((n) => `${n}\n`).join("")}${render(obligation(r.plan))}\n`);
    process.exit(0);
  }

  const o = { ...obligation(), suite: suiteStatus() };
  if (flag("--close") !== -1) {
    process.stdout.write(`${render(o)}\n`);
    if (close(o, { via: "close" }).closed) {
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
export { TIERS, CHEAP_TIER_DUE, read, changedPaths, currentBranch, isTrunk, REVIEW_SCHEMA, REVIEW_PATH, REKEY_SCHEMA, REKEY_PATH };
