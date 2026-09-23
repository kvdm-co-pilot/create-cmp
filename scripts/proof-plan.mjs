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
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deriveTierNeed } from "../packages/harness/src/lib/affected-tests.mjs";
import {
  observedTreeHash,
  DEVICE_TIER_IRRELEVANT,
  REVIEW_TIER_TRIGGERS,
  REVIEW_TIER_IRRELEVANT,
  REVIEW_SKIP,
} from "./observed-tree.mjs";
import { stampedOutput, describeStampedDiff } from "./stamped-output.mjs";
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

const TIERS = Object.freeze({
  suite: { when: "per-commit", cost: "~50s", cmd: "npm test" },
  frameworkCheck: { when: "per-commit", cost: "~4s", cmd: "node scripts/framework-check.mjs" },
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
 */
export function obligation(plan = read(), paths = changedPaths(), branch = currentBranch(), { fleetRecord = readFleetRecord() } = {}) {
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

  const dev = tierState(need.required, plan, plan?.discharged, readStamped, {
    key: "stampedHash",
    proves: (now) => recordMeetsTier(fleetRecord, TIERS.device, now),
    // A discharge is a record's copy, so it is judged as one — one rule, one
    // function, whichever file the bytes are sitting in.
    attests: (d, now) => recordMeetsTier(asRecord(d), TIERS.device, now),
  });
  const rev = tierState(reviewNeed.required, plan, plan?.reviewDischarged, () => ({ hash: observedTreeHash(REPO_ROOT, REVIEW_TIER_TRIGGERS, { skip: REVIEW_SKIP }) }));
  return { ...dev, need, ...base, review: { ...rev, need: reviewNeed } };
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
function readStamped(root = REPO_ROOT) {
  try {
    return stampedOutput(root);
  } catch (err) {
    return { hash: null, files: null, unanswerable: err?.message ?? String(err) };
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
function tierState(required, plan, discharged, read, { key = "treeHash", proves = null, attests = null } = {}) {
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
  const shortfall = m && !m.ok && m.about ? m : null;
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
 * @param {object|null} record `qa-artifacts/fleet-latest.json`, or null
 * @param {{requires: string, cmd: string}} tier the tier the record must satisfy
 * @param {string} now the digest of the app this tree stamps
 * @returns {{ok: true, proof: object} | {ok: false, exit: 1|2, code: string, about: boolean, reason: string}}
 */
export function recordMeetsTier(record, tier, now) {
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
  if (record.stampedOutputHash !== now) {
    return no("other-app", 1, `the recorded device run describes another app (${record.stampedOutputHash.slice(0, 7)} → ${String(now).slice(0, 7)}) — this tree stamps something else. ${rerun}`);
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
      stampedHash: record.stampedOutputHash,
      stampedFiles: record.stampedOutputFiles ?? null,
      from: "qa-artifacts/fleet-latest.json",
    },
  };
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
    stampedOutputFiles: discharged?.stampedFiles ?? null,
    verdict: discharged?.verdict ?? null,
    rung: discharged?.rung ?? null,
    ranAt: discharged?.at ?? null,
  };
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
  const settled = isSettled(o.state) && isSettled(o.review?.state ?? "none");
  const ended = o.plan ?? o.stale ?? null;
  if (settled && ended) {
    const own = Boolean(o.plan);
    const event = own || !branchExists(ended.branch) ? "closed" : "cleared";
    appendHistory(
      historyFile,
      planEvent(event, ended, { via, onBranch: o.branch ?? null, device: own ? o.state : null, review: own ? (o.review?.state ?? "none") : null, now }),
    );
    fs.rmSync(planPath, { force: true });
  }
  return { closed: settled, removed: Boolean(settled && ended), state: o.state, reviewState: o.review?.state ?? "none" };
}

/** Whether a local branch of this name exists. Unanswerable counts as existing, so a doubt records `cleared`, never a false `closed`. */
function localBranchExists(name) {
  if (!name) return false;
  const r = sh("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]);
  return r.status !== 1;
}

/** One history row about a plan: what happened to it, when, and the plan as it stood. */
function planEvent(event, plan, { via = null, onBranch = null, device = null, review = null, now = new Date() } = {}) {
  return { schema: PLAN_EVENT_SCHEMA, event, via, at: now.toISOString(), onBranch, device, review, plan: withoutManifest(plan) };
}

/**
 * The plan as the HISTORY keeps it: everything except the stamped app's file
 * manifest, which is hundreds of rows describing a tree that is gone by the
 * time anyone reads the row. The count survives — "how big was the app this
 * slice proved" is a question the history can still answer — and the digest
 * survives, so two rows can still be compared.
 */
function withoutManifest(plan) {
  if (!plan?.discharged?.stampedFiles) return plan;
  const { stampedFiles, ...rest } = plan.discharged;
  return { ...plan, discharged: { ...rest, stampedFileCount: Object.keys(stampedFiles).length } };
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
    // Whether the suite has ALREADY run over these bytes — the line a reviewer or
    // an author reads before spending a minute re-deriving it (scripts/suite-record.mjs).
    if (name === "suite" && o.suite) L.push(`      ${describeSuiteStatus(o.suite)}`);
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
      // FOUR WAYS A RUN CAN BE OWED, and they want different actions, so they
      // are different sentences. Only the last of them is "go and run it".
      //
      // The first is where a record on disk WAS read and did not carry the
      // tier: too low a rung, a FAIL over these same bytes, a stamp that broke.
      // `recordMeetsTier` has already said which in one sentence, and saying
      // only "OWED" over it is what sends an agent to re-run the same
      // insufficient command. (There is no separate FAIL branch here: a failing
      // run is one of that function's answers, with its own words.)
      if (o.shortfall) {
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
        "REOPENED — the stamped app moved after the device run",
        `${describeStampedDiff(o.plan.discharged.stampedFiles, o.reading?.files)}.\n      The run at ${o.plan.discharged.at} describes an app that no longer exists (${String(o.plan.discharged.stampedHash).slice(0, 7)} → ${o.now.slice(0, 7)}).\n      The device tier is the LAST gate: either revert what moved, or accept a second run.\n      This is the ordering mistake that cost three device runs in one session on 2026-09-08.`,
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

/**
 * THE TWO KINDS OF THING A REVIEW RECORD CAN BE, named, because a row that does
 * not say which is indistinguishable from the other.
 *
 * `round` is a reader that read a diff. `rerecord` is the same reader
 * confirming the same finding against bytes that moved under it — the case
 * docs/KNOWN-DEFECTS.md's header settles, and it is the header that settles it;
 * this is a vocabulary, not a second statement of the rule.
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
    const kept = Object.fromEntries(["plans", "reviews", "fleet"].map((k) => [k, readHistory(historyPath(REPO_ROOT, k))]));
    const summary = summarize({ plans: kept.plans.rows, reviews: kept.reviews.rows, fleet: kept.fleet.rows });
    const malformed = kept.plans.malformed + kept.reviews.malformed + kept.fleet.malformed;
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
    const rec = readFleetRecord();
    const stamped = stampedOutput(REPO_ROOT);
    const now = stamped.hash;
    // ONE reading, the same one the schedule prints and the merge gate refuses
    // on: digest, verdict AND rung. Reading the verdict without the rung is
    // reading half a record — a fleet check is PASS at whatever level it was
    // told to require, and `--min-level L1` attaches no device.
    const m = recordMeetsTier(rec, TIERS.device, now);
    if (!m.ok) {
      process.stderr.write(`${m.reason}\n${m.code === "other-app" ? `${describeStampedDiff(rec.stampedOutputFiles, stamped.files)}\n` : ""}`);
      process.exit(m.exit);
    }
    plan.discharged = { at: m.proof.at, stampedHash: now, stampedFiles: stamped.files, verdict: m.proof.verdict, rung: m.proof.rung };
    write(plan);
    process.stdout.write(`${render(obligation(plan))}\n`);
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
export { TIERS, read, changedPaths, currentBranch, isTrunk, REVIEW_SCHEMA, REVIEW_PATH };
