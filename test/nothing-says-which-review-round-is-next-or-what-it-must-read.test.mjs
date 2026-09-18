// NOTHING SAID WHICH REVIEW ROUND WAS NEXT, OR WHAT THAT ROUND HAD TO READ.
//
// docs/KNOWN-DEFECTS.md's header makes a second review round CONDITIONAL and
// bounds what it reads. Two halves of that were unanswerable from this
// repository until 2026-09-18:
//
//   1. WHICH ROUND. `--record-review` appends one row per call, and a re-record
//      after a rebase (ADR-0014 rebinds a record to the merging bytes) was
//      indistinguishable from a fresh cold read. `scripts/change-price.mjs` said
//      so in its own output — "records are not rounds, so this count is an UPPER
//      BOUND" — and the review history of this repo carries the proof: the 19:58
//      row of 2026-09-18 says "this is a re-record after a rebase" inside its
//      free-text `tests` array, because there was no field for it.
//   2. WHAT IT READS. A later round's subject is the delta, and the rule of
//      record bounds it there. Measured the same day: round 1 took 6.9 minutes and round 2 took 3.6, and
//      the second was cheap only because a human named the bytes by hand.
//
// THE ASSERTION THAT MATTERS MOST IS THE FIRST ONE BELOW, AND IT IS A REFUSAL.
// The obvious design is "round 1's fixes touched only review-irrelevant paths,
// so round 2 is not owed". It is wrong, and the counter-example is a commit in
// this repository rather than an argument — see the test. So the only NOT-OWED
// this prices is an EMPTY delta, and everything else is owed or is cannot-tell
// and therefore owed.
//
// Everything here drives exported pure functions with synthetic records, except
// the three that cannot be answered any other way: the two CLI refusals (driven
// as real subprocesses, which exit before writing anything), the default floor
// of `changedPaths` (compared against the git commands it has always run), and
// the reader sweep (read from the tracked tree).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { nextRound, ROUND_VERDICTS, attribute } from "../scripts/change-price.mjs";
import { recordReview, changedPaths, REVIEW_KINDS, REVIEW_SCHEMA, TIERS } from "../scripts/proof-plan.mjs";
import { REVIEW_TIER_IRRELEVANT } from "../scripts/observed-tree.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRANCH = "a-slice-under-test";
const OPENED = "2026-09-18T10:00:00.000Z";
const PLAN = { slice: "a slice under test", branch: BRANCH, openedAt: OPENED };

/** One review history row, as `recordReview` appends it. */
const rec = (over = {}) => ({ schema: REVIEW_SCHEMA, branch: BRANCH, ranAt: "2026-09-18T11:00:00.000Z", commit: "c0ffee1", nothingFound: true, ...over });
/** A history file that exists and holds these rows, as `observe()` hands them over. */
const kept = (rows) => ({ file: "qa-artifacts/review-history.jsonl", exists: true, rows, malformed: 0 });

/**
 * The block, driven through the REAL attribution rule rather than a shape built
 * to suit it — a test that hand-assembles `attributed` would pass while the two
 * halves disagreed about which rows belong to the slice.
 */
const round = ({ rows = [], deltas = {}, reviewState = "owed", dirty = false, mergeBase = "base000", plan = PLAN } = {}) =>
  nextRound({
    reviewState,
    attributed: attribute(kept(rows), { branch: BRANCH, openedAt: plan?.openedAt ?? null }),
    deltas,
    dirty,
    mergeBase,
  });

test("THE FALSIFICATION: a delta of nothing but `docs/` and `*.md` is STILL OWED — adc947c is the reason", () => {
  // MEASURED, NOT ARGUED. `git show --stat adc947c` is round 1's fix on the
  // KD-123 slice: it touched `agents/cmp-orchestrator.md` and
  // `docs/KNOWN-DEFECTS.md`, and nothing else. Both match
  // REVIEW_TIER_IRRELEVANT, so a path-based triviality rule prices round 2 NOT
  // OWED. Round 2 ran anyway and found a BLOCKING defect in that very fix —
  // KD-120's row in the one-screen table still carried a question the entry had
  // answered, and that table is what the header rule sends a reviewer to first
  // (fixed in 06c5aa1). Two more the same shape: a false justification in a code
  // comment (KD-121) and a wrong count in a test file's header comment (KD-123
  // item 3). Prose is not a proxy for trivial, and neither is a comment.
  const r = round({
    rows: [rec({ round: 1, kind: "round", commit: "adc947c" })],
    deltas: { adc947c: ["agents/cmp-orchestrator.md", "docs/KNOWN-DEFECTS.md"] },
  });
  assert.notEqual(r.verdict, ROUND_VERDICTS.notOwed, "the delta that produced a blocking finding must never be priced as nothing to read");
  assert.equal(r.verdict, ROUND_VERDICTS.owed);
  assert.equal(r.round, 2);

  // THE CLASS, DERIVED FROM THE DECLARATION ITSELF so a root added to
  // REVIEW_TIER_IRRELEVANT is covered the day it is added: a delta made of one
  // representative of every irrelevant root is still not NOT-OWED. That
  // declaration answers "does this DIFF owe a review at all" — a different
  // question wearing the same words, and it is applied to the whole diff by
  // `proof-plan.mjs`, never to the delta.
  const representative = (entry) => (entry.startsWith("*") ? `sample${entry.slice(1)}` : `${entry}sample`);
  const irrelevant = REVIEW_TIER_IRRELEVANT.map(representative);
  assert.ok(irrelevant.length >= 4, "REVIEW_TIER_IRRELEVANT has lost members — this sweep no longer covers what it claims");
  for (const p of irrelevant) {
    const one = round({ rows: [rec({ round: 1, kind: "round", commit: "aaaaaa1" })], deltas: { aaaaaa1: [p] } });
    assert.notEqual(one.verdict, ROUND_VERDICTS.notOwed, `a delta of ${p} alone is priced as nothing to read — that is the rule adc947c refutes`);
  }
});

test("THE ONE NOT-OWED CASE: an empty delta means round 1 needed no fixes, so round 2 has nothing to read", () => {
  const r = round({ rows: [rec({ round: 1, kind: "round", commit: "beefbee" })], deltas: { beefbee: [] } });
  assert.equal(r.verdict, ROUND_VERDICTS.notOwed);
  assert.equal(r.round, null);
  assert.match(r.why.join(" "), /empty/, "it says what came back empty");
  assert.match(r.read.cmds.join(" "), /beefbee/, "and names the command, so the claim can be checked rather than believed");

  // A delta git COULD NOT READ is not an empty one. The record's commit may not
  // survive a rebase, which is ordinary, and unknown is owed.
  const unreadable = round({ rows: [rec({ round: 1, kind: "round", commit: "beefbee" })], deltas: { beefbee: null } });
  assert.equal(unreadable.verdict, ROUND_VERDICTS.cannotTell);
  assert.equal(unreadable.round, 2);

  // And an empty delta is only trusted where the ATTRIBUTION was whole: a row
  // that could not be dated was dropped, so the earliest record this anchored on
  // may not be the earliest that exists, and a smaller anchor hides round 1's
  // own fixes behind an empty answer.
  const dropped = nextRound({
    reviewState: "owed",
    attributed: attribute(kept([rec({ round: 1, kind: "round", commit: "beefbee" }), rec({ ranAt: "not a date" })]), { branch: BRANCH, openedAt: OPENED }),
    deltas: { beefbee: [] },
  });
  assert.equal(dropped.verdict, ROUND_VERDICTS.cannotTell);
  assert.match(dropped.why.join(" "), /ranAt/, "and it names the rows it could not place");
});

test("A LEGACY RECORD SAYS NEITHER ROUND NOR KIND, AND UNKNOWN RESOLVES THE EXPENSIVE WAY", () => {
  // Every record written before 2026-09-18 is this shape, and none is rewritten.
  const legacy = round({ rows: [rec({ commit: "1111111" })], deltas: { 1111111: ["scripts/x.mjs"] } });
  assert.equal(legacy.verdict, ROUND_VERDICTS.cannotTell);
  assert.equal(legacy.round, 2, "at least one round has happened, so the next one is round 2");
  assert.match(legacy.why.join(" "), /upper bound|none says which round/i, "the count is reported as a bound, not as a fact");
  assert.ok(legacy.settles.some((s) => s.includes("--round")), "and it hands back what would settle it");

  // FIVE unstated records are still not a spent cap. A row nobody can read can
  // only ADD rounds; reading it as two would end the review on a guess, and the
  // one thing this block must never do is say the reading is finished when it
  // cannot tell.
  const five = round({ rows: Array.from({ length: 5 }, (_, i) => rec({ commit: `row${i}`, ranAt: `2026-09-18T1${i}:30:00.000Z` })), deltas: { row0: ["scripts/x.mjs"] } });
  assert.notEqual(five.verdict, ROUND_VERDICTS.capSpent);
  assert.equal(five.verdict, ROUND_VERDICTS.cannotTell);
  assert.match(five.read.cmds[0], /row0/, "and it anchors on the EARLIEST record, which spans the most bytes");
});

test("THE CAP IS SPENT WHEN A RECORD SAYS ROUND 2 — and a re-record of round 2 is still round 2", () => {
  const spent = round({
    rows: [rec({ round: 1, kind: "round", commit: "aaa" }), rec({ round: 2, kind: "round", commit: "bbb", ranAt: "2026-09-18T12:00:00.000Z" })],
    deltas: { aaa: ["scripts/x.mjs"], bbb: ["scripts/x.mjs"] },
  });
  assert.equal(spent.verdict, ROUND_VERDICTS.capSpent);
  assert.equal(spent.round, null, "no round is next");
  assert.equal(spent.read, null, "and nothing is handed to a reader who is not going to read");
  assert.match(spent.why.join(" "), /KNOWN-DEFECTS/, "what remains has one destination, and the rule of record is pointed at rather than restated");

  // A re-record attests the round it names whichever way it was written — the
  // reader confirmed those bytes — so it cannot lower the highest round seen.
  const rerecorded = round({
    rows: [rec({ round: 1, kind: "round", commit: "aaa" }), rec({ round: 2, kind: "rerecord", commit: "bbb", ranAt: "2026-09-18T12:00:00.000Z" })],
    deltas: { aaa: ["scripts/x.mjs"] },
  });
  assert.equal(rerecorded.verdict, ROUND_VERDICTS.capSpent);

  // And an unstated row alongside a stated round 2 does not reopen the cap: an
  // unread row can only add rounds.
  const mixed = round({
    rows: [rec({ round: 2, kind: "round", commit: "bbb" }), rec({ commit: "ccc", ranAt: "2026-09-18T13:00:00.000Z" })],
    deltas: { bbb: ["scripts/x.mjs"], ccc: ["scripts/x.mjs"] },
  });
  assert.equal(mixed.verdict, ROUND_VERDICTS.capSpent);
});

test("WHAT THE ROUND MUST READ IS A COMMAND, NOT AN INSTRUCTION TO GO AND WORK IT OUT", () => {
  // Round 1, with nothing recorded: the whole diff, from the merge base this
  // program already computed.
  const first = round({ rows: [], mergeBase: "8bd782a" });
  assert.equal(first.round, 1);
  assert.equal(first.verdict, ROUND_VERDICTS.owed);
  assert.deepEqual(first.read.cmds, ["git diff 8bd782a...HEAD"]);

  // Round 2: the delta since round 1's record, by commit.
  const second = round({ rows: [rec({ round: 1, kind: "round", commit: "adc947c" })], deltas: { adc947c: ["scripts/x.mjs"] } });
  assert.deepEqual(second.read.cmds, ["git diff adc947c..HEAD"]);
  assert.match(second.read.what, /not the whole diff again/, "the saving is the point, so it is said");

  // A DIRTY TREE ADDS THE SECOND HALF OF WHAT WAS ACTUALLY READ. `changedPaths`
  // unions the range with `git status --porcelain`, so a delta called non-empty
  // can be non-empty entirely in uncommitted bytes — and a reader sent to `git
  // diff` alone would see nothing and conclude the opposite of what this said.
  const dirty = round({ rows: [rec({ round: 1, kind: "round", commit: "adc947c" })], deltas: { adc947c: ["scripts/x.mjs"] }, dirty: true });
  assert.equal(dirty.read.cmds.length, 2);
  assert.match(dirty.read.cmds[1], /git status --porcelain/);
});

test("WHERE PROOF-PLAN SAYS THE REVIEW TIER IS NOT OWED AT ALL, NO ROUND IS PRICED — and that answer is quoted, not recomputed", () => {
  // The one place REVIEW_TIER_IRRELEVANT reaches this block: through
  // proof-plan's own state over the WHOLE diff. A second derivation here would
  // be the second spelling this repository keeps finding (KD-113, KD-124).
  const none = round({ reviewState: "none", rows: [] });
  assert.equal(none.verdict, ROUND_VERDICTS.noTier);
  assert.equal(none.round, null);

  // And where proof-plan could not answer, neither does this.
  const unknown = round({ reviewState: "unknown", rows: [] });
  assert.equal(unknown.verdict, ROUND_VERDICTS.cannotTell);
  assert.ok(unknown.settles.length, "it hands back what would settle it");

  // A tier that is DISCHARGED while no record belongs to this slice is a
  // contradiction, not a zero: counting from zero there would price round 1 as
  // if the discharge had not happened, so it says it cannot tell instead.
  const orphan = round({ reviewState: "discharged", rows: [] });
  assert.equal(orphan.verdict, ROUND_VERDICTS.cannotTell);
});

test("A RECORD SAYS WHAT IT IS: `round` and `kind` are written when given, absent when not, and the schema does not move", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prooflane-round-"));
  try {
    const said = recordReview({ nothingFound: true, round: 2, kind: "rerecord" }, { root, now: new Date("2026-09-18T12:00:00.000Z") });
    assert.equal(said.round, 2);
    assert.equal(said.kind, "rerecord");
    assert.equal(said.schema, REVIEW_SCHEMA, "the fields are additive and optional, so a /1 reader still reads exactly what it knew");

    // ABSENT, NOT NULL. A key present with a null value and a key missing mean
    // the same thing to every reader, and both mean unknown — but only the
    // missing one cannot be mistaken for a recorded answer.
    const silent = recordReview({ nothingFound: true }, { root, now: new Date("2026-09-18T12:05:00.000Z") });
    assert.equal("round" in silent, false);
    assert.equal("kind" in silent, false);

    // And the row on disk carries them, because the history is what gets counted.
    const rows = fs.readFileSync(path.join(root, "qa-artifacts", "review-history.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(rows[0].round, 2);
    assert.equal(rows[0].kind, "rerecord");
    assert.equal("round" in rows[1], false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("A VALUE THAT DOES NOT PARSE IS REFUSED RATHER THAN WRITTEN — a record nobody can act on looks like an answer", () => {
  // Driven as real subprocesses. Both refusals happen before anything is
  // written, so this leaves no record behind — which is the behaviour being
  // asserted as much as the exit code.
  const run = (...args) => spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "proof-plan.mjs"), "--record-review", ...args, "--nothing-found"], { cwd: REPO_ROOT, encoding: "utf8" });

  const badKind = run("--kind", "rerecrd");
  assert.equal(badKind.status, 2, `--kind rerecrd was accepted: ${badKind.stdout}${badKind.stderr}`);
  assert.match(badKind.stderr, /--kind takes/);
  for (const k of REVIEW_KINDS) assert.match(badKind.stderr, new RegExp(k), "the refusal names the vocabulary it will take");

  const badRound = run("--round", "0");
  assert.equal(badRound.status, 2, `--round 0 was accepted: ${badRound.stdout}${badRound.stderr}`);
  assert.match(badRound.stderr, /whole number/);

  const notANumber = run("--round", "two");
  assert.equal(notANumber.status, 2);
});

test("THE DEFAULT FLOOR OF `changedPaths` IS WHERE IT ALWAYS WAS — the generalisation sits under a refusal", () => {
  // `changedPaths()` feeds `obligation()`, which feeds the proof gate. Giving it
  // a `since` argument for the round block must not move what the NO-ARGUMENT
  // call reads, so the answer is compared against the three git commands it has
  // always run, executed here.
  const git = (...args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  const base = git("merge-base", "HEAD", "origin/main").trim();
  const expected = new Set(
    git("diff", "--name-only", `${base}...HEAD`).split("\n").map((l) => l.trim()).filter(Boolean),
  );
  for (const l of git("status", "--porcelain").split("\n")) {
    if (!l.trim()) continue;
    for (const p of l.slice(3).trim().split(" -> ")) expected.add(p);
  }
  assert.deepEqual([...changedPaths()].sort(), [...expected].sort(), "the no-argument call no longer reads the merge-base with origin/main union the working tree");

  // The floor MOVES when it is given one, and for a commit that is an ancestor
  // of HEAD the merge-base spelling and the two-dot spelling are the same
  // answer — which is what makes the printed command the command that was read.
  assert.deepEqual([...changedPaths(base)].sort(), [...expected].sort());

  // And from HEAD, only the bytes nobody has committed remain.
  const fromHead = changedPaths("HEAD");
  assert.ok(Array.isArray(fromHead));
  assert.ok(fromHead.length <= expected.size);
  for (const p of fromHead) assert.ok(expected.has(p), `${p} is in the delta since HEAD but not in the slice's own diff`);
});

test("EVERY TEXT THAT TELLS A READER TO RUN `--record-review` TELLS THEM TO SAY WHICH ROUND", () => {
  // A field nothing populates is worse than no field: unknown resolves to OWED,
  // so a reader who is never told to pass `--round` buys a review round nobody
  // needed, every slice, forever. Derived from the tracked tree rather than a
  // list, so a new reader is swept the day it is written. Tests are excluded —
  // a test is not a text anybody acts on — and prose that MENTIONS the flag
  // without spelling the command is not an instruction to run it.
  const tracked = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const offenders = [];
  const check = (where, text) => {
    for (const line of String(text).split("\n")) {
      if (!/proof-plan\.mjs --record-review/.test(line)) continue;
      if (!/--round/.test(line)) offenders.push(`${where}: ${line.trim().slice(0, 120)}`);
    }
  };
  let invocations = 0;
  for (const f of tracked) {
    if (f.startsWith("test/") || f.endsWith(".jsonl")) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(REPO_ROOT, f), "utf8");
    } catch {
      continue;
    }
    invocations += (text.match(/proof-plan\.mjs --record-review/g) ?? []).length;
    check(f, text);
  }
  // What the gate PRINTS, taken from the program rather than from a copy of its
  // source — the same reading `the-review-rule-is-stated-twice` takes.
  check("scripts/proof-plan.mjs TIERS.review.how (printed)", TIERS.review.how);

  assert.ok(invocations >= 3, `only ${invocations} invocation(s) of --record-review were found in the tree — this sweep has lost its subject`);
  assert.deepEqual(offenders, [], `these tell a reader to record a review and not to say which round it is, so the row they write cannot be counted:\n    ${offenders.join("\n    ")}`);
});
