// WHICH LANE THIS CHANGE IS ON, AND WHAT THAT LANE THEREFORE OWES.
//
// THE DEFECT THIS EXISTS TO CLOSE. This repo's CLAUDE.md says "the rules that
// are programs, and which program — ask these, not a document", and names four.
// `scripts/proof-plan.mjs` answers which TIERS a change owes and WHEN. Nothing
// answered which LANE it is on — and the lane is what sets the ceremony. That
// rule existed only as prose: docs/CHANGE-FLOW-DESIGN.md §3's entry-point table,
// where a bug fix (spec right, code wrong) is the direct lane with the contract
// "untouched — the clause already says the correct behavior" and "none; receipt
// is the record", and docs/PRINCIPLES.md §4, which prices the change stage at
// ~90 s and carries the episode in its own words: "A doc-link fix cost twenty
// minutes because a suite-scaled step sat in the per-change lane and the receipt
// bound the whole tree."
//
// MEASURED 2026-09-18: an operator drove SIX direct-lane bug fixes with
// brief-lane ceremony — mutation-checking every new test, which is a rule in no
// document here (docs/GATE-RULES.md Rule 1 asks for a KEPT PLANT when a new GATE
// is wired, and nothing more), and taking a second review round routinely, which
// docs/KNOWN-DEFECTS.md's header makes conditional. It cost an afternoon.
// Nothing in the system noticed, because every gate in this product refuses too
// LITTLE proof and NOTHING refuses too much: over-proof produces green receipts
// and burns only wall-clock, which no receipt records.
//
// AND WHICH REVIEW ROUND IS NEXT, added the night of 2026-09-18 for the same
// reason one file over: the review rule is conditional, its condition turns on
// what round 1's fixes were, and nothing recorded which record was a round. PART
// 4 says what it can read and hands back what it cannot; its own header carries
// the measured counter-example that keeps a path-based triviality rule out.
//
//   node scripts/change-price.mjs          the block below, for this tree
//   node scripts/change-price.mjs --json   the same facts, as data
//
// IT IS ADVISORY, AND THE ALWAYS-ZERO EXIT IS THE DESIGN RATHER THAN AN
// OVERSIGHT. It refuses nothing, gates nothing, and is wired into no hook, no
// `.claude/settings.json` entry, no package.json script and no CI; every path
// through it ends at the one exit-code literal in this file, zero. A program
// that refuses is a new GATE: it would owe GATE-RULES Rule 1 a calibrated kept
// plant, and it would add the mechanism NORTH-STAR §10 Q3 presumes against.
// Worse, the thing it would refuse on is a JUDGEMENT — does this change carry
// decisions a future contributor could plausibly unmake? — which is the
// uncalibrated instrument in a refusal path that PRINCIPLES.md §2 forbids and
// ADR-0014's first half exists to keep out. So the next reader tempted to
// "upgrade" this into a gate should know there is nothing to wire: it never says
// no. The defence against over-proof is the `owes` block READ BEFORE THE WORK,
// not a refusal after it.
//
// AN ADVISORY THAT BLUFFS IS WORSE THAN NONE. Where it does not know, it says so
// and names what would settle it. §3's rule has two clauses, and a diff answers
// AT MOST one of them. Whether the change carries decisions is never visible in
// a diff, so that half is always handed back to the human it belongs to with the
// two things that settle it named. Whether anything already signed moved is
// usually visible in the paths — but not when what moved is one of the documents
// NORTH-STAR §12 gives authority over, where the path is the same for a typo and
// for a rewritten rule, so that half is handed back too rather than answered NO
// over a diff holding the rulebook this program cites.
//
// IT WRITES NOTHING AND KEEPS NO BOOK OF ITS OWN. Every fact below is read from
// what this repo already writes — the git diff, the commit subjects, the
// declared plan, and the `qa-artifacts/*-history.jsonl` records. A second
// bookkeeping would be a second thing to keep true, and the whole complaint
// above is about ceremony nobody costed.
//
// NORTH-STAR §10 Q4, OUT LOUD. The conventional-commit vocabulary and the path
// patterns below are a GRAMMAR — the half of Q4 that hides, because it names no
// stack. They are facts about CREATE-CMP'S OWN GOVERNANCE LAYOUT: `docs/adr/`,
// `docs/features/`, the eight documents NORTH-STAR §12 gives authority over
// (GOVERNING_DOCS below), and a commit convention this repository's own log
// follows. They live in create-cmp's `scripts/`, on the
// same shelf as DEVICE_TIER_IRRELEVANT in `scripts/observed-tree.mjs`, and
// `packages/harness/src/` — the core an adopter ships — learns nothing from this
// file and imports nothing from it. An adopter's lane is unchanged by it.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The branch is read through `currentBranch()` and never spelled here: the two
// spellings disagree on a detached HEAD, which is where CI runs
// (test/the-current-branch-is-read-two-ways.test.mjs).
import { obligation, changedPaths, currentBranch, read, REVIEW_KINDS, TIERS } from "./proof-plan.mjs";
import { historyPath, readHistory } from "./lib/proof-history.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCHEMA = "prooflane-change-price/1";

function sh(cmd, args) {
  return spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — THE LANE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The commit types that decide nothing on their own. Derived from §3's table:
 * every row whose Lane column reads `direct` names a change of one of these
 * shapes, and `feat` is deliberately absent — §3's "New feature" row is the
 * brief lane whenever it adds a surface.
 */
export const DIRECT_TYPES = Object.freeze(["fix", "docs", "test", "chore", "refactor", "perf", "style", "build", "ci", "revert"]);

/**
 * THE EIGHT DOCUMENTS docs/NORTH-STAR.md §12 GIVES AUTHORITY OVER A RULE: its
 * table minus the rows that are a proposal or a research file, plus NORTH-STAR
 * itself, which is not a row in its own table — §12's first line is "This
 * document governs". A hardcoded fact about create-cmp's own governance layout,
 * on the same shelf as
 * DEVICE_TIER_IRRELEVANT in `scripts/observed-tree.mjs`, and read by
 * `classifyPath` as a contract: every verdict this program prints cites one of
 * these, so a diff that moves one is moving the rule the verdict rests on.
 *
 * WHAT IS DELIBERATELY NOT HERE. §12 also names `docs/proposals/PACKAGE-SPLIT.md`
 * and `docs/proposals/AGNOSTIC-HARNESS-ARCHITECTURE.md`, and three research rows
 * naming four files (`docs/research/VISION.md`, `GATEKEEPER-PRODUCT.md`,
 * `AGENTIC-MOBILE-STUDIO.md`, `launch/discovery-plan.md`). Whether an edit to a
 * proposal or an internal research file carries a decision a contributor could
 * unmake is a human's call; these eight are not a call.
 *
 * THIS IS THE ONE THING IN THIS FILE THAT WANTS RE-CHECKING WHEN §12 CHANGES,
 * because its failure is silent and points the wrong way: a document §12 gains
 * that this list does not is read as prose and priced CHEAPER than it is, which
 * is the one direction a program written against over-proof must not err in when
 * the governance itself is what is being edited.
 */
export const GOVERNING_DOCS = Object.freeze(["docs/NORTH-STAR.md", "docs/CHANGE-FLOW-DESIGN.md", "docs/EVIDENCE-ECONOMICS-PLAN.md", "docs/GATE-RULES.md", "docs/GENESIS-FLOW-DESIGN.md", "docs/HARNESS-PLAN.md", "docs/PRINCIPLES.md", "docs/ROADMAP.md"]);

const TYPE_RE = /^([a-zA-Z]+)(\([^)]*\))?!?:/;

/** The conventional type of one subject, lowercased, or null when the subject declares none. */
export function commitType(subject) {
  const m = TYPE_RE.exec(String(subject ?? ""));
  return m ? m[1].toLowerCase() : null;
}

/**
 * What KIND of thing a changed path is, in the only three categories the lane
 * rule needs.
 *
 * `contract` is not "important" — it is "already signed, or the artifact that
 * declares a routing". §2's primitives table settles the second one in a
 * sentence: "Location is the opt-in — every doc in `docs/features/` is
 * governed". `docs/adr/template.md` is the empty form an ADR is written FROM, so
 * it carries no decision and is prose.
 *
 * The eight in GOVERNING_DOCS are the third: not signed by an approval, but
 * named by §12 as keeping authority over a rule. Calling them prose priced a
 * rewrite of §3's own entry-point table as a copy edit.
 */
export function classifyPath(p) {
  const f = String(p ?? "").split(path.sep).join("/");
  if (f === "docs/adr/template.md") return "prose";
  if (f.startsWith("docs/adr/")) return "contract";
  if (f.startsWith("docs/features/")) return "contract";
  if (GOVERNING_DOCS.includes(f)) return "contract";
  return f.endsWith(".md") ? "prose" : "code";
}

const tally = (xs) => {
  const out = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
};

const listTypes = (counts) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => `${t} x${n}`)
    .join(", ");

/**
 * WHICH ROW OF §3's TABLE a set of direct-lane commit types is — SPELLED AS §3
 * SPELLS IT, with the citation that names the row. Precedence rather than a
 * lookup, because a slice mixing `fix` and `docs` is a bug fix that also touched
 * its own docs — the fix is what the change IS.
 *
 * `refactor`, `perf`, `style`, `test`, `ci` and `revert` reach the last line, and
 * it returns NO ROW on purpose: §3's table names none for that shape, and the
 * summary that stood here ("a change that decides nothing") was this file putting
 * words in §3's mouth and citing the table for them. What routes those types is
 * the blockquote above the table, so that is what gets cited.
 */
function directRow(counts) {
  if (counts.fix) return { row: "Bug fix (spec right, code wrong)", cite: 'docs/CHANGE-FLOW-DESIGN.md §3, row "Bug fix"' };
  if (counts.docs) return { row: "Copy/content edit", cite: 'docs/CHANGE-FLOW-DESIGN.md §3, row "Copy/content edit"' };
  if (counts.chore || counts.build) return { row: "Version upgrade", cite: 'docs/CHANGE-FLOW-DESIGN.md §3, row "Version upgrade"' };
  return { row: null, cite: "docs/CHANGE-FLOW-DESIGN.md §3, the brief/direct blockquote — its table names no row for this shape" };
}

/**
 * The lane, from the diff and the commit subjects. Ordered rules, FIRST MATCH
 * WINS — the order IS the routing, so a change that moves a signed contract is
 * never read as a bug fix because its commits happened to say `fix`.
 *
 * `paths` or `subjects` may be null: git could not answer. That is a third
 * outcome and not a lane — `proof-plan.mjs`'s reason, and `stage-gate.mjs`'s:
 * "I could not check" is not "I checked".
 *
 * @param {string[]|null} paths every path this change has touched
 * @param {string[]|null} subjects the commit subjects since the merge-base
 */
export function laneOf(paths, subjects) {
  const types = subjects === null ? null : subjects.map(commitType);
  const counts = types === null ? {} : tally(types.map((t) => t ?? "(no conventional type)"));
  const commits = types === null ? null : types.length;
  const base = { types: counts, commits };

  // 0 — git did not answer. Name the command and claim nothing.
  if (paths === null || subjects === null) {
    const failed = [];
    if (paths === null) failed.push("`git merge-base HEAD origin/main`, `git diff --name-only <base>...HEAD` or `git status --porcelain` (proof-plan.mjs changedPaths)");
    if (subjects === null) failed.push("`git log --format=%s <merge-base>..HEAD`");
    return {
      ...base,
      lane: "unknown",
      row: null,
      headline: "UNKNOWN — git could not answer, so no lane is claimed",
      why: [`${failed.join(" and ")} did not answer.`, "Nothing below is derived from a guess: an advisory that bluffs here is worse than none at all."],
      cite: "no row applies — there is no readable diff to route",
    };
  }

  // 1 — nothing changed. There is no change to price.
  if (paths.length === 0) {
    return {
      ...base,
      lane: "none",
      row: null,
      headline: "NONE — nothing has changed since origin/main and the working tree is clean",
      why: ["There is no change to price. Whatever this tree owed was collected when the slice that produced it merged."],
      cite: "no row applies — §3 routes a change, and there is none",
    };
  }

  const kinds = paths.map(classifyPath);
  const contracts = paths.filter((p, i) => kinds[i] === "contract");
  const adr = contracts.filter((p) => String(p).startsWith("docs/adr/"));
  const features = contracts.filter((p) => String(p).startsWith("docs/features/"));
  // UNDER docs/adr/ AND NOT A CONTRACT — the empty form an ADR is written FROM,
  // which `classifyPath` reads as prose because it carries no decision. The
  // conclusion that follows is right, but the sentence that used to carry it
  // ("no path under docs/adr/ … moved") is FALSE of a diff holding this file,
  // and that sentence is the one a reader checks their own diff against. So
  // where it is present it is NAMED, not denied.
  const forms = paths.filter((p, i) => kinds[i] !== "contract" && String(p).startsWith("docs/adr/"));

  // 2 — an ADR is in the diff. §3's "Architecture change" row decides for us.
  if (adr.length) {
    return {
      ...base,
      lane: "brief",
      row: "Architecture change (layer rules, policies)",
      headline: "BRIEF — an ADR is in the diff",
      why: [
        `${adr.join(", ")} — §3's "Architecture change" row is the brief lane, and its Decide column reads "brief + ADR": the brief is owed BESIDE the ADR, not instead of it.`,
      ],
      cite: 'docs/CHANGE-FLOW-DESIGN.md §3, row "Architecture change"',
    };
  }

  // 3 — the brief lane's own artifact is in the diff, so the routing is already declared.
  if (features.length) {
    return {
      ...base,
      lane: "brief",
      row: "New feature, or a change to an existing feature",
      headline: "BRIEF — a feature brief is in the diff",
      why: [
        `${features.join(", ")} — §2: "Location is the opt-in — every doc in \`docs/features/\` is governed".`,
        "The brief lane's own artifact is being written, so this change has already declared its lane; the rest of §4 follows from that.",
      ],
      cite: "docs/CHANGE-FLOW-DESIGN.md §2, the primitives table (Feature brief)",
    };
  }

  // THERE IS NO RULE 4. One stood here and routed docs/NORTH-STAR.md to the
  // brief lane, reasoning that an edit to the document that HOLDS decisions
  // carries one by construction. It does not: a typo fix in a governing document
  // and a rewritten rule are the same path, and pricing the first as a brief is
  // the over-proof this program exists to stop. The eight §12 documents are
  // `contract` to `classifyPath` instead, which blocks rule 5 and drops such a
  // diff through to rule 7 — AMBIGUOUS, with clause B saying out loud that the
  // path cannot tell. That is the honest verdict, and it costs fewer lines.

  const parsed = types ?? [];
  const offTable = parsed.filter((t) => t === null || !DIRECT_TYPES.includes(t));

  // 5 — every commit declares a type that decides nothing, and nothing signed or
  // governing moved. The third condition is LIVE now that rule 4 is gone: rules 2
  // and 3 return for an ADR and for a feature brief, but one of §12's eight
  // reaches here and is stopped by `contracts.length === 0`. A `docs:` commit
  // over docs/GATE-RULES.md is not a copy edit, and falls through to rule 7.
  if (commits > 0 && offTable.length === 0 && contracts.length === 0) {
    const { row, cite } = directRow(counts);
    return {
      ...base,
      lane: "direct",
      row,
      headline: row ? `DIRECT — ${row}` : "DIRECT — §3's table names no row for this shape",
      why: [
        `Every commit declares a type that decides nothing: ${listTypes(counts)}.`,
        forms.length ? `And nothing already signed moved — ${forms.join(", ")} is under docs/adr/, but it is the empty form an ADR is written FROM and carries no decision to sign — so there is no blast radius.` : "And no path under docs/adr/, docs/features/, or the eight documents NORTH-STAR §12 gives authority over, moved — so there is no blast radius into anything already signed.",
        ...(row ? [] : ["§3's table names no row for this shape, so the lane comes from the blockquote above it: the two sentences above ARE its two clauses, both answered no."]),
      ],
      cite,
    };
  }

  // 6 — nothing is committed yet and the whole diff is prose nothing has signed.
  if (commits === 0 && kinds.every((k) => k === "prose")) {
    return {
      ...base,
      lane: "direct",
      row: "Copy/content edit",
      headline: "DIRECT — Copy/content edit",
      why: [
        `Nothing is committed yet, and all ${paths.length} changed path(s) are prose that nothing has signed.`,
        '§3\'s Contract column for this row: "clause edit only if the copy is specified; else none".',
      ],
      cite: 'docs/CHANGE-FLOW-DESIGN.md §3, row "Copy/content edit"',
    };
  }

  // 7 — the honest answer. One clause of §3's rule is answered by the diff and
  // the other is not, so they are reported apart rather than averaged into a guess.
  const reached = [];
  // Rules 2 and 3 returned for every contract that is an ADR or a feature brief,
  // so a contract still here is one of §12's eight, and clause B below says so.
  if (contracts.length) reached.push(`${contracts.join(", ")} is in this diff — a document NORTH-STAR §12 gives authority over a rule`);
  // WHAT THE DIFF HOLDS IS COUNTED, NOT ASSERTED. This said "the diff contains
  // code" on every shape that reached here, which was true only while rule 4
  // routed the all-markdown governing-doc diffs away; deleting that rule dropped
  // them in and the sentence went on claiming code over diffs with none. The
  // tally is `classifyPath`'s three categories, counted over this diff's paths.
  if (commits === 0) reached.push(`no commits yet, so there is no declared type to read, and the diff contains ${listTypes(tally(kinds))} — commit with a conventional type, or say the lane in the restatement`);
  else if (offTable.length) {
    const read = offTable.includes("feat") ? "a `feat` is §3's \"New feature\" row, which is the brief lane when it adds a new surface" : "not a type §3's table routes to the direct lane";
    reached.push(`${listTypes(tally(offTable.map((t) => t ?? "(no conventional type)")))} — ${read}`);
  }

  // CLAUSE B IS DERIVED, NOT A FIXED NO. It answered a flat "NO, and this half IS
  // decidable" over a diff that held docs/GATE-RULES.md — one of the documents
  // this program takes its own authority from — because the three paths it
  // listed were the only ones it looked at. A path does not say whether a
  // governing edit was a typo or a new rule, so where one is present this says
  // it cannot tell, and names the document.
  const blastRadius = contracts.length
    ? {
        answer: `NOT DECIDABLE — ${contracts.join(", ")} is in this diff`,
        detail: `${contracts.join(", ")}: docs/NORTH-STAR.md §12 gives it authority over a rule, and the rules cited by every verdict this program prints are in that table. Whether THIS edit carries a decision a contributor could unmake is not visible in the path — a typo fix and a rewritten clause move the same file — so it is handed back: the human's answer at the triage restatement settles it, and "The human can overrule in a word" (§3).`,
      }
    : {
        answer: "NO — and this half IS decidable",
        detail: `${forms.length ? `${forms.join(", ")} is under docs/adr/, but it is the empty form an ADR is written FROM and carries no decision to sign; nothing else here is signed either` : "nothing under docs/adr/, docs/features/, or docs/NORTH-STAR.md and the seven other documents §12 gives authority over, is in this diff"}. Were it otherwise this would have routed BRIEF above (an ADR, a feature brief) or said NOT DECIDABLE here (a §12 document).`,
      };
  return {
    ...base,
    lane: "ambiguous",
    row: null,
    headline: contracts.length
      ? "AMBIGUOUS — NEITHER of §3's two clauses is answered by the diff, and one of them is about this diff's own governing document"
      : "AMBIGUOUS — one of §3's two clauses is answered by the diff, and the other is not",
    why: [`Why it got here: ${reached.join("; ")}.`],
    cite: "docs/CHANGE-FLOW-DESIGN.md §3, the brief/direct blockquote",
    clauses: [
      { clause: "B — blast radius into contracts already signed", ...blastRadius },
      {
        clause: "A — decisions a future contributor could plausibly unmake",
        answer: "NOT DECIDABLE from paths and commit subjects",
        detail:
          "nothing in a diff says whether a decision was made. Two things settle it, and neither is here: the human's answer at the triage restatement — \"The human can overrule in a word\" (§3) — or the appearance of docs/features/<name>.md, the brief lane's own artifact, which declares the lane by existing.",
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — WHAT THAT LANE OWES
// ─────────────────────────────────────────────────────────────────────────────

const FRAMEWORK_CHECK = /(^|\/)framework-check\.mjs$/;

/**
 * The ceremony, as data. One row per item, each carrying the citation it
 * implements, so a reader can go and check the claim rather than take this
 * file's word for it — the standard this whole repository is built on.
 *
 * `note` is the part that is not a constant: what THIS diff can say about the
 * row and, for the two rows the 2026-09-18 episode over-paid, what it cannot. A
 * row that quietly reported only the half it can see would be the bluff this
 * program exists not to be.
 */
export const CEREMONY = Object.freeze([
  Object.freeze({
    item: "triage",
    direct: "restate the change in one or two plain sentences and name the lane, before any tool runs",
    brief: "the same — a silent route is a routing error even when the lane was right",
    cite: "docs/CHANGE-FLOW-DESIGN.md §3",
  }),
  Object.freeze({
    item: "grill",
    // QUOTED WHOLE, PARENTHESIS AND ALL. The elision here read "never grilled …
    // a bug fix, an emergency fix, or a spike, never" and cut out the only thing
    // §3 allows the direct lane — the one inline question — which is the half an
    // agent reading this row actually needs.
    direct: 'NO — "The direct lane is never grilled (one inline question at most, only when the restatement cannot be made unambiguous); a bug fix, an emergency fix, or a spike, never"',
    brief: "yes — the frontier, in numbered rounds of at most five, after the restatement and before the brief",
    cite: "docs/CHANGE-FLOW-DESIGN.md §3, docs/features/grill-me.md",
  }),
  Object.freeze({
    item: "brief",
    direct: "NO — there is no artifact to write",
    brief: "docs/features/<name>.md, signed before the contract, with no open question left in it",
    cite: "docs/CHANGE-FLOW-DESIGN.md §4 steps 2-4",
  }),
  Object.freeze({
    item: "design signature",
    direct: "NO",
    brief: "only when the change has a UI surface — a pure-logic change has no design artifact and skips this honestly",
    cite: "docs/CHANGE-FLOW-DESIGN.md §4 step 5",
  }),
  Object.freeze({
    item: "contract",
    direct: "only if a signed artifact is touched; a pure bug fix touches none — the clause already states the truth",
    brief: "reopen every declared spec, amend or add clauses, and have them re-approved before the code moves",
    cite: "docs/CHANGE-FLOW-DESIGN.md §3 table, §4 step 6, §5 step 2",
  }),
  Object.freeze({
    // A POINTER, NOT A SECOND STATEMENT. The review rule has already drifted
    // once in a copy that was accurate for exactly one day (KD-12), and this
    // repo's rule is that a rule stated twice drifts in one. So this row names
    // the rule of record and the single judgement it turns on, and stops.
    item: "review",
    direct: 'one round on the diff. Whether a second is owed is a judgement about round 1\'s fixes ("more than trivial"), and there is no third',
    brief: "the same — the lane does not change how many rounds a slice gets",
    cite: "docs/KNOWN-DEFECTS.md (its header is the rule of record; this points at it rather than restating it)",
    // WHERE PROOF-PLAN SAYS THE DIFF OWES NO REVIEW, THE ROW SAYS SO. It printed
    // "one round on the diff" over a docs-only change, and an agent reading the
    // ceremony at the moment of deciding bought a review the gate never asks
    // for. Whether a review is owed at all is proof-plan's answer
    // (REVIEW_TIER_IRRELEVANT, scripts/observed-tree.mjs); it is quoted with its
    // reason, never re-derived here from the paths.
    notOwed: (ctx) =>
      ctx.review === "none"
        ? `NOT OWED — \`node scripts/proof-plan.mjs\` says this diff owes no review: ${ctx.reviewReason ?? "its reason was not handed over"}`
        : null,
    note: () =>
      "this cannot know whether the fixes from round 1 were more than trivial, because nothing records it, and it does not guess. " +
      "What it CAN read is in the `round` block below: which round is next, the literal command that round has to read, and whether it is owed — where the records cannot settle that, the block says OWED rather than picking.",
  }),
  Object.freeze({
    item: "kept plant",
    direct: "owed when this change WIRES A NEW GATE, and not otherwise — mutation-checking every new test is a rule in no document here",
    brief: "the same — a gate is calibrated because it is a gate, never because the lane was ceremonious",
    cite: "docs/GATE-RULES.md Rule 1",
    note: (ctx) => {
      const hits = (ctx.paths ?? []).filter((p) => FRAMEWORK_CHECK.test(String(p)));
      const seen = hits.length
        ? `this diff touches ${hits.join(", ")}, which is where a kept plant lives, so Rule 1 may well apply`
        : "this diff touches no framework-check.mjs, which is where a kept plant lives";
      return `${seen}. And the limit, plainly: nothing here can tell a new GATE from a new TEST by path alone, so if this change does wire a gate, Rule 1 applies and this advisory cannot see it.`;
    },
  }),
  Object.freeze({
    item: "proof tiers",
    direct: "whatever `node scripts/proof-plan.mjs` says — one record, read first",
    brief: "the same — the tier schedule is not a function of the lane",
    cite: "docs/GATE-RULES.md Rule 4, scripts/proof-plan.mjs",
    note: (ctx) =>
      `right now it says L2 run ${String(ctx.device ?? "unknown").toUpperCase()}, Firebase L2 run ${String(ctx.firebase ?? "unknown").toUpperCase()}, review ${String(ctx.review ?? "unknown").toUpperCase()}.` +
      (ctx.review === "none" ? ` The review is NOT OWED on this diff — proof-plan's reason: ${ctx.reviewReason ?? "not handed over"}.` : "") +
      " The schedule itself is that program's and is not restated here.",
  }),
  Object.freeze({
    item: "budget",
    direct: "the change stage is ~90 s; merge is minutes",
    brief: "the same — a brief's cost is the human's reading, not a longer lane",
    cite: "docs/PRINCIPLES.md §4",
  }),
]);

/** The ceremony rendered for one lane — or, when the lane is unanswered, for both. */
export function owesFor(lane, ctx = {}) {
  const columns = lane === "direct" || lane === "brief" ? [lane] : lane === "ambiguous" ? ["direct", "brief"] : [];
  if (!columns.length) return [];
  return CEREMONY.map((row) => {
    // A row that is not owed on THIS diff says so in every column, and drops the
    // note that explains how to price it — there is nothing to price.
    const not = row.notOwed ? row.notOwed(ctx) : null;
    return {
      item: row.item,
      cite: row.cite,
      owed: Object.fromEntries(columns.map((c) => [c, not ?? row[c]])),
      note: not ? null : row.note ? row.note(ctx) : null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — WHAT HAS ALREADY BEEN SPENT
// ─────────────────────────────────────────────────────────────────────────────

const stamp = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
};

/**
 * Which recorded runs belong to this change.
 *
 * THE SAME RULE `summarize()` IN scripts/lib/proof-history.mjs APPLIES, WITH THE
 * UPPER BOUND ABSENT, BECAUSE THIS PLAN HAS NOT CLOSED YET. There, a run is a
 * slice's when `row.branch === plan.branch` and `openedAt <= ranAt <= planClosedAt`.
 * Here the slice is still open, so there is no closedAt to bound it with, and
 * what is left is branch plus `ranAt >= openedAt`. That is deliberately not a
 * SECOND attribution rule — a second one would be a second thing to keep true,
 * and everything on this page argues against exactly that.
 *
 * With no plan declared for this branch there is no `openedAt` at all, so the
 * count falls back to the branch alone and SAYS SO: a branch name gets reused,
 * and a count that quietly spans two slices is worse than one that names its limit.
 *
 * THREE POPULATIONS, NOT TWO. A row on this branch that cannot be DATED is not a
 * row belonging to another slice, and `(stamp(r.ranAt) ?? -Infinity) >= from`
 * gave both the same silent drop: "not mine" and "I could not tell" came out as
 * one answer. The second is counted as `undated` and reported, because every row
 * lost that way makes the spend look SMALLER, and understating spend is the one
 * direction a program written against over-proof cannot afford to be wrong in.
 *
 * THE ROWS COME BACK, NOT ONLY THE COUNT, and `recorded` is their length rather
 * than a separately computed number. `nextRound` below needs the commit each
 * record was written at, and a second walk of the same file under a second
 * filter would be a second attribution rule — the KD-124 shape, which is one
 * rule spelled in two files with no shared code. They are returned IN FILE
 * ORDER, which is chronological by construction: `appendHistory` appends one
 * line per write and nothing rewrites the file.
 */
export function attribute(history, { branch, openedAt = null }) {
  if (!history?.exists) return { recorded: null, rows: [], byBranchOnly: false, undated: 0 };
  const rows = (history.rows ?? []).filter((r) => r && r.branch === branch);
  const from = stamp(openedAt);
  if (from === null) return { recorded: rows.length, rows, byBranchOnly: true, undated: 0 };
  const dated = rows.filter((r) => stamp(r.ranAt) !== null);
  const mine = dated.filter((r) => stamp(r.ranAt) >= from);
  return { recorded: mine.length, rows: mine, byBranchOnly: false, undated: rows.length - dated.length };
}

/**
 * HOW MANY SUITE RUNS A CHANGE OWES: ONE. The cadence is READ from
 * `scripts/proof-plan.mjs`'s TIERS — the one table — and not from the plan on
 * disk. `--open` copies TIERS' cadences into the plan as `declared`, and that
 * copy is a snapshot: every plan opened before 2026-09-24 says `per-commit`,
 * which this row used to multiply by the commit count, pricing four runs where
 * the rule owes one. A cadence stated twice drifts in one, and the copy that
 * drifts is the one nobody updates, so the copy is not read for the count. Where
 * it differs from TIERS it is NAMED, so a reader who opens the plan and finds
 * "per-commit" there is told which of the two this priced and why.
 *
 * `at-close` means once over the finished batch, so the count is 1 whatever the
 * commit count. A cadence this function does not know is priced the same way —
 * the direction that runs the suite less often — and says so.
 */
function suiteOwed(plan) {
  const cadence = TIERS.suite.when;
  const declared = plan?.declared?.suite ?? null;
  const known = cadence === "at-close";
  const how = known
    ? `owed count: ONE run — the cadence is read from TIERS in scripts/proof-plan.mjs: ${cadence}, due ${TIERS.suite.due}.`
    : `owed count: ONE run — TIERS in scripts/proof-plan.mjs declares "${cadence}", which this row does not know how to price, so it prices the least it could mean.`;
  const stale =
    declared && declared !== cadence
      ? `this branch's plan still declares suite "${declared}" — a copy \`--open\` wrote from an older TIERS. It is NOT what this priced: TIERS is the one table, and the plan's copy is stale.`
      : null;
  return { owed: 1, how, stale };
}

/**
 * Why the review row's count is not the unit docs/KNOWN-DEFECTS.md's rule is
 * about.
 *
 * ITS LAST SENTENCE USED TO BE THE REASON AND IS NOW THE POINTER. It read
 * "nothing here records which of these rows was a round", which was true of the
 * tree until `--record-review` grew `--round` and `--kind` in this same slice —
 * and a sentence a reader checks their own records against is the worst place
 * for a fact that has stopped being one. What is unchanged is the COUNT: this
 * row counts every row, re-records included, so it is still an upper bound. What
 * changed is that a row can now say, and the `round` block below reads it.
 */
const REVIEW_IS_RECORDS =
  "records are not rounds, so this count is an UPPER BOUND on rounds and is never called over: proof-plan REOPENS the review obligation whenever a trigger path moves after a record, and every --record-review appends a row, " +
  "so a slice that took exactly two rounds with one post-review fix in between holds three. The rule about ROUNDS — two, and no third — is docs/KNOWN-DEFECTS.md's header. This row counts every record; which of them SAY they are a round is read in the round block, and a row that says nothing is counted here anyway.";

/**
 * ONE VERDICT RULE, APPLIED TO EVERY ROW. There were three, and they gave one
 * shape two answers: `1 recorded / 0 owed` read `OVER by 1` on the device row
 * and `within` on the review row, from the same table on the same input.
 * `recorded` against `owed` decides it, and the two modifiers below are facts
 * about the ROW'S UNIT rather than exceptions carved for a row:
 *
 *   `reopened` — proof-plan has voided what was recorded: a trigger path moved
 *     after it, so the spend is real and the evidence is gone. That is never
 *     `within` at any count, which is what the device row used to print beside
 *     an `extra` calling itself over-proof by definition.
 *   `rounds` — the review row counts RECORDS against a rule about ROUNDS. It
 *     reports the count and is never called OVER (REVIEW_IS_RECORDS says why),
 *     and it is not called `within` above its owed either, because it cannot
 *     tell — a verdict either way would be a number pretending to be the other.
 */
function verdictOf({ recorded, owed, reopened, rounds }) {
  if (recorded === null) return "no record kept";
  if (reopened) return "REOPENED — nothing recorded here is standing";
  if (recorded <= owed) return "within";
  return rounds ? `ABOVE the ${owed} owed — records, not rounds` : `OVER by ${recorded - owed}`;
}

const SUITE_OVER =
  "what this looked like before anything recorded it, from scripts/suite-record.mjs's own header: 295 full-suite runs, 4.6 to 6.6 per merged change, 4.5 hours (docs/research/g2-measure/, 2026-09-07 to 09-17). A run over bytes a recorded run already covers is read, not repeated.";
const DEVICE_REOPENED =
  "proof-plan says REOPENED: the app this tree stamps moved after the run, so the run describes an app that no longer exists and now proves nothing. That is the 2026-09-08 failure, and it is over-proof by definition — the spend is real and the evidence is gone.";
const FIREBASE_REOPENED =
  "proof-plan says REOPENED: the app this tree stamps with Firebase added moved after its run, so the run describes an app that no longer exists and now proves nothing — over-proof by the same definition as the L2 run's.";
const REVIEW_REOPENED =
  "proof-plan says REOPENED: a trigger path moved after the last record, so a fresh record is owed for the SAME round. That is the mechanism that makes this count records and not rounds, and here it is happening.";

/**
 * What the kept records show, against what this change owed — one row per tier,
 * every row built by the one rule above, and every row carrying what it could
 * NOT read: the lines that did not parse, and the rows it could not date.
 */
export function spendOf({ branch, plan, device, review, firebase = "unknown", histories }) {
  const openedAt = plan?.openedAt ?? null;
  const suite = suiteOwed(plan);
  const tier = (what, kind, owed, { state = null, rounds = false, extra = [], note = null, over = null, reopened = null }) => {
    const history = histories[kind];
    const { recorded, byBranchOnly, undated } = attribute(history, { branch, openedAt });
    const malformed = history.malformed ?? 0;
    const voided = state === "reopened";
    const excess = recorded === null ? 0 : recorded - owed;
    const lines = [...extra];
    // NO COMMAND IS CITED HERE, BECAUSE NONE REPORTS THIS. The pointer that
    // stood here sent the reader to `proof-plan.mjs --history` for "the same
    // file": that command reads plans, reviews and fleet — never
    // qa-artifacts/suite-history.jsonl — and prints ONE malformed count summed
    // over the three, so a reader checking a suite row's number against it is
    // told 0. The file is named instead; the disclosure is the whole point.
    if (malformed) lines.push(`${malformed} line(s) of ${history.file} did not parse and are not counted — the count above is of what was left.`);
    if (undated) lines.push(`${undated} row(s) on this branch carry no readable ranAt and are not counted either — "I could not tell" is not "not mine", and one expression was answering both.`);
    if (voided) lines.push(reopened);
    const verdict = verdictOf({ recorded, owed, reopened: voided, rounds });
    return { what, file: history.file, recorded, owed, malformed, undated, byBranchOnly, verdict, note: note ?? (excess > 0 && over ? over(excess, owed) : null), extra: lines };
  };
  return [
    tier("suite", "suite", suite.owed, { extra: [suite.how, ...(suite.stale ? [suite.stale] : [])], over: () => SUITE_OVER }),
    tier("device", "fleet", device === "none" ? 0 : 1, { state: device, over: (excess, owed) => `${excess} run(s) beyond the ${owed} this change owed, at ~3.5 min and an emulator each.`, reopened: DEVICE_REOPENED }),
    // THE FIREBASE L2 RUN, counted from its own history kind so a Firebase run
    // is never a default device run twice over. Built only when that history was
    // handed in: observe() always hands it (SPEND_KINDS), and a pure caller that
    // predates the kind gets the rows it asked for rather than a throw — or a
    // "does not exist" about a file nobody looked for.
    ...(histories["fleet-firebase"]
      ? [tier("firebase", "fleet-firebase", firebase === "none" ? 0 : 1, { state: firebase, over: (excess, owed) => `${excess} run(s) beyond the ${owed} this change owed, at ${TIERS.firebase.cost} each.`, reopened: FIREBASE_REOPENED })]
      : []),
    tier("review", "reviews", review === "none" ? 0 : 1, { state: review, rounds: true, note: REVIEW_IS_RECORDS, reopened: REVIEW_REOPENED }),
  ];
}

/**
 * The line that matters more than the counts above it, and the reason the `owes`
 * block is the defence while this block is not.
 */
export const SPEND_LIMIT =
  "nothing in this repository records a grill, a brief round, a mutation check or a hand-run plant. " +
  "So this half CANNOT see the ceremony the 2026-09-18 episode actually over-paid: it sees four tiers that write records, and those were not the problem. " +
  "The only defence against the rest is the owes block above, read BEFORE the work.";

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — THE NEXT REVIEW ROUND: WHICH ONE, WHAT IT READS, WHETHER IT IS OWED
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE DEFECT THIS PART CLOSES, and the one it refuses to close by guessing.
 *
 * The `owes` review row above says a second round turns on a judgement about
 * round 1's fixes and that this program does not make it. That was the whole
 * answer until 2026-09-18, and it left two things unsaid that cost more than the
 * judgement would have:
 *
 *   WHICH ROUND IS NEXT. `--record-review` appends a row per call and a
 *   re-record after a rebase (ADR-0014 rebinds a record to the merging bytes)
 *   was indistinguishable from a fresh cold read, so nothing could count rounds
 *   — REVIEW_IS_RECORDS above says exactly that, out loud. `recordReview` now
 *   takes `round` and `kind` (scripts/proof-plan.mjs, REVIEW_KINDS), and this
 *   reads them. Absent means UNKNOWN and resolves the expensive way.
 *
 *   WHAT THAT ROUND MUST READ. A later round's subject is bounded, and
 *   docs/KNOWN-DEFECTS.md's header is where that bound is stated; this points at
 *   it and prints the bytes. Measured 2026-09-18 on the KD-123 slice: round 1
 *   took 6.9 minutes and round 2 took 3.6, and the only reason the second was
 *   cheap is that a human said by hand which bytes to read. So the literal
 *   command is printed. That half is where the time actually goes.
 *
 * THE RULE THAT IS NOT HERE, AND THE MEASUREMENT THAT KEEPS IT OUT. The obvious
 * design is "if round 1's fixes touched only review-irrelevant paths, round 2 is
 * not owed". It is wrong, and the counter-example is in this repository: commit
 * adc947c is round 1's fix on the KD-123 slice, and it touched
 * `agents/cmp-orchestrator.md` and `docs/KNOWN-DEFECTS.md` — both matching
 * REVIEW_TIER_IRRELEVANT (`scripts/observed-tree.mjs`: `docs/`, `*.md`,
 * `*.gitkeep`, `inspector/mcp/dist/`). A path rule would have said NOT OWED.
 * Round 2 then found a BLOCKING defect in it. Two more the same way: a false
 * justification in a code comment (KD-121) and a wrong count in a test file's
 * header comment (KD-123). So "comment-only" and "prose-only" are not proxies
 * for trivial either, and none of the three is implemented.
 *
 * REVIEW_TIER_IRRELEVANT answers "does this DIFF owe a review at all", which is
 * a different question from "were round 1's fixes trivial" wearing the same
 * words. It is consumed here only through `reviewState` — proof-plan's own
 * answer over the WHOLE diff — and never applied to the delta. The delta is
 * asked one question, and it is not about paths: is it EMPTY.
 *
 * WHICH MAKES THE ONE NOT-OWED CASE THE ONLY ONE IT CAN BE: round 1 required no
 * fixes, so there is nothing for round 2 to read. Everything else is OWED, or is
 * CANNOT TELL and therefore OWED — the asymmetry is deliberate and is Karel's
 * call (docs/features/price-the-next-review-round.md): this advisory's errors do
 * not cost paperwork like the lane half's do. They cost a skipped review.
 */

/** The five things this can answer, spelled once so the render and the tests read the same words. */
export const ROUND_VERDICTS = Object.freeze({
  owed: "OWED",
  notOwed: "NOT OWED",
  cannotTell: "CANNOT TELL — SO OWED",
  capSpent: "CAP SPENT — no third round",
  noTier: "NO ROUND — the review tier is not owed on this diff at all",
});

const ROUND_CITE = "docs/KNOWN-DEFECTS.md (its header is the rule of record; this counts against it rather than restating it)";

/** A stated round number, or null. A row that says nothing says nothing — never 0, never "the first". */
const statedRound = (r) => (Number.isInteger(r?.round) && r.round >= 1 ? r.round : null);
/** A stated kind, or null — measured against proof-plan's vocabulary rather than a second copy of it. */
const statedKind = (r) => (REVIEW_KINDS.includes(r?.kind) ? r.kind : null);

/** The whole diff, as a command a reader can run — round 1's reading. */
const wholeDiffCmd = (mergeBase) => `git diff ${mergeBase ?? "$(git merge-base HEAD origin/main)"}...HEAD`;

/**
 * What to read, as the commands that were actually run to price it. `dirty` adds
 * the second half rather than being left implicit: `changedPaths` unions the
 * range with `git status --porcelain`, so a delta this calls non-empty can be
 * non-empty entirely in bytes nobody has committed, and a reader sent to `git
 * diff` alone would see nothing and conclude the opposite.
 */
const reading = (what, cmds, dirty) => ({ what, cmds: dirty ? [...cmds, "git status --porcelain   # the uncommitted half, which the delta above counts too"] : cmds });

/**
 * Which round is next, what it must read, and whether it is owed — from the
 * records and the tree, and from nothing else.
 *
 * @param {object} arg
 * @param {string} arg.reviewState proof-plan's state for the review tier on this diff
 * @param {{recorded: number|null, rows: object[], byBranchOnly: boolean, undated: number}} arg.attributed `attribute()`'s answer over the review history
 * @param {Record<string, string[]|null>} arg.deltas paths changed since each record's commit; null where git could not answer
 * @param {boolean} arg.dirty whether anything is uncommitted
 * @param {string|null} arg.mergeBase this branch's merge-base with origin/main, for the round-1 command
 */
export function nextRound({ reviewState, attributed = { recorded: null, rows: [], byBranchOnly: false, undated: 0 }, deltas = {}, dirty = false, mergeBase = null }) {
  const rows = attributed.rows ?? [];
  const undated = attributed.undated ?? 0;
  const V = ROUND_VERDICTS;
  const base = {
    cite: ROUND_CITE,
    records: { attributed: attributed.recorded, stating: rows.filter((r) => statedRound(r) !== null).length, undated, byBranchOnly: Boolean(attributed.byBranchOnly) },
  };

  // 0 — the tier itself is not owed, and that is proof-plan's answer, quoted.
  // This block prices ROUNDS of a review; whether a review is owed at all is
  // derived from REVIEW_TIER_IRRELEVANT over the whole diff, one program over,
  // and re-deriving it here would be the second spelling this file's own
  // attribution comment refuses.
  if (reviewState === "none") {
    return { ...base, round: null, verdict: V.noTier, headline: "no round is priced — `node scripts/proof-plan.mjs` says the review tier is NOT OWED on this diff", why: ["That answer is proof-plan's, over the whole diff, and its reason is printed there rather than restated here.", "A round is a round OF a review. Where none is owed there is no first round to be next."], read: null, settles: [] };
  }

  // 1 — proof-plan could not answer, so neither can this.
  if (reviewState === "unknown") {
    return { ...base, round: 1, verdict: V.cannotTell, headline: "CANNOT TELL — proof-plan could not say whether a review is owed, so this prices the first round anyway", why: ["`node scripts/proof-plan.mjs` returned no readable state for the review tier."], read: reading("the whole diff — there is nothing yet to read a delta against", [wholeDiffCmd(mergeBase)], dirty), settles: ["run `node scripts/proof-plan.mjs` and read the review line: it says NOT OWED, OWED, DISCHARGED or REOPENED, and this follows it."] };
  }

  const doubt = [];
  if (undated) doubt.push(`${undated} record(s) on this branch carry no readable ranAt and could not be attributed, so the count below is a floor and the earliest record this could anchor on may not be the earliest that exists.`);
  if (attributed.byBranchOnly) doubt.push('no plan is declared for this branch, so records are attributed by branch name alone and may span two slices — `node scripts/proof-plan.mjs --open "<what you are building>"` bounds them.');

  // 2 — nothing is attributed to this slice: round 1 is what is next, and the
  // whole diff is what it reads. A DISCHARGED tier with no attributable record
  // is a contradiction rather than a zero, and is not counted as one.
  if (!rows.length) {
    const stale = reviewState === "discharged" || reviewState === "reopened";
    return {
      ...base,
      round: 1,
      verdict: stale || doubt.length ? V.cannotTell : V.owed,
      headline: stale ? `ROUND 1 — but proof-plan says the review tier is ${reviewState.toUpperCase()} while no record here belongs to this slice` : "ROUND 1 — nothing has read this diff yet",
      why: [
        attributed.recorded === null ? "no review history file exists, so no record can be attributed to this slice." : `${attributed.recorded} record(s) are attributed to this slice.`,
        ...(stale ? [`A record discharged or reopened these bytes, and none of the rows on this branch fall inside this slice — the two disagree, and this counts from zero rather than assuming a round it cannot see.`] : []),
        ...doubt,
      ],
      read: reading("the whole diff — round 1 reads all of it", [wholeDiffCmd(mergeBase)], dirty),
      settles: stale || doubt.length ? ["record the next review with `--round <n>`, and the rows after it can be counted rather than bounded."] : [],
    };
  }

  // WHICH RECORD ROUND 2 READS FROM. The rows that SAY they are round 1 if any
  // say anything, else all of them; the first in file order, which is the
  // earliest written. Earliest is the conservative pick on purpose — an earlier
  // anchor spans more bytes, and every byte it adds is one round 2 was going to
  // be told to read anyway. A later one could hide round 1's own fixes.
  const firsts = rows.filter((r) => statedRound(r) === 1);
  const anchor = (firsts.length ? firsts : rows)[0];
  const sha = anchor?.commit ?? null;
  const delta = sha ? (deltas[sha] ?? null) : null;
  const shortSha = sha ? String(sha).slice(0, 7) : null;
  const deltaRead = reading(
    `the delta since ${shortSha ?? "round 1's record"} — the record ${firsts.length ? "that says it is round 1" : "written first on this slice"}, not the whole diff again`,
    [`git diff ${sha ?? "<the commit of round 1's record>"}..HEAD`],
    dirty,
  );

  // 3 — the cap. A row saying `round: 2` attests that a second round happened
  // whether it was a fresh read or a re-confirmation of one, so the highest
  // STATED round decides this and an unstated row cannot lower it — an unread
  // row can only add rounds, never subtract one.
  const maxStated = rows.reduce((m, r) => Math.max(m, statedRound(r) ?? 0), 0);
  if (maxStated >= 2) {
    return {
      ...base,
      round: null,
      verdict: V.capSpent,
      headline: `CAP SPENT — a record on this slice states round ${maxStated}`,
      why: [
        `${rows.length} record(s) attributed here, the highest stating round ${maxStated}.`,
        "A third round is not the remedy for whatever round 2 left open; docs/KNOWN-DEFECTS.md's header says what is, and its own file is where it goes.",
        ...doubt,
      ],
      read: null,
      settles: [],
    };
  }

  // 4 — THE ONE NOT-OWED CASE. Nothing has changed since the anchor record, so
  // round 1 required no fixes and round 2 has nothing to read. It is a fact
  // about the SIZE of the delta and never about what is in it: see the header
  // of this part, and adc947c.
  if (Array.isArray(delta) && delta.length === 0 && !undated) {
    const undischarged = reviewState === "owed" || reviewState === "reopened";
    return {
      ...base,
      round: null,
      verdict: V.notOwed,
      headline: "NOT OWED — nothing has changed since the review record, so a further round has nothing to read",
      why: [
        `${deltaRead.cmds[0]} came back empty${dirty ? ", and the working tree adds nothing either" : " and the working tree is clean"}.`,
        "Round 1 required no fixes. This is the only ground on which this block says NOT OWED, and it is the size of the delta rather than anything about the paths in it.",
        ...(undischarged ? [`proof-plan still reports the review tier ${reviewState.toUpperCase()} — that is a RECORD owed for these bytes (\`--record-review\`, then \`--discharge-review\`), which is not another round.`] : []),
        ...doubt,
      ],
      read: deltaRead,
      settles: [],
    };
  }

  // 5 — round 2, owed. Which of the two ways it is owed depends on whether the
  // records can be counted at all, and the difference is stated rather than
  // averaged: a reader who is told CANNOT TELL can go and make it tellable.
  const unstated = rows.filter((r) => statedRound(r) === null).length;
  const rerecords = rows.filter((r) => statedKind(r) === "rerecord").length;
  const why = [];
  if (maxStated === 1) why.push(`${rows.length} record(s) attributed to this slice, the highest stating round 1${rerecords ? `, of which ${rerecords} say they are a re-record rather than a round` : ""}.`);
  else why.push(`${rows.length} record(s) attributed to this slice, and none says which round it is — so at least one round has happened and this is an upper bound of ${rows.length}, not a count.`);
  if (delta === null) why.push(sha ? `\`git diff ${sha}..HEAD\` could not be read — the commit may not survive in this tree, which a rebase makes ordinary — so the delta is unknown and unknown is owed.` : "the record carries no commit, so there is no floor to measure a delta from.");
  else why.push(`${delta.length} path(s) have changed since ${shortSha}, so there is something for round 2 to read.`);
  why.push(...doubt);

  const tellable = maxStated === 1 && !unstated && !doubt.length && Array.isArray(delta);
  const settles = [];
  if (unstated || !maxStated) settles.push("record each review with `--round <n>` and, where it is a re-confirmation rather than a read, `--kind rerecord` — with those, this counts rounds instead of bounding them.");
  if (delta === null) settles.push(sha ? `make the anchor commit readable (\`git cat-file -e ${sha}\`), or record the next round on a commit this tree has.` : "a record with a commit — `recordReview` writes one whenever git can answer.");
  if (doubt.length) settles.push('a declared plan and dated rows bound the attribution: `node scripts/proof-plan.mjs --open "<what you are building>"`.');

  return {
    ...base,
    round: 2,
    verdict: tellable ? V.owed : V.cannotTell,
    headline: tellable ? "ROUND 2 — owed, and it reads the delta rather than the diff" : "ROUND 2 — the records cannot settle whether it is owed, so it is",
    why,
    read: deltaRead,
    settles,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MODEL, AND THE TWO WAYS IT IS PRINTED
// ─────────────────────────────────────────────────────────────────────────────

/** The history kinds the spent block counts — `fleet-firebase` is the Firebase L2 run's own. */
export const SPEND_KINDS = Object.freeze(["suite", "fleet", "fleet-firebase", "reviews"]);

/** Everything this program reads, gathered in one place so the rest is pure. */
export function observe({ root = REPO_ROOT } = {}) {
  const paths = changedPaths();
  const base = sh("git", ["merge-base", "HEAD", "origin/main"]);
  let subjects = null;
  if (base.status === 0) {
    const log = sh("git", ["log", "--format=%s", `${base.stdout.trim()}..HEAD`]);
    if (log.status === 0) subjects = log.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  const st = sh("git", ["status", "--porcelain"]);
  const dirty = st.status === 0 ? Boolean(st.stdout.trim()) : null;
  const branch = currentBranch();
  const o = obligation(read(), paths, branch);
  const histories = Object.fromEntries(
    SPEND_KINDS.map((kind) => {
      const file = historyPath(root, kind);
      return [kind, { file: path.relative(root, file), exists: fs.existsSync(file), ...readHistory(file) }];
    }),
  );
  // WHAT HAS CHANGED SINCE EACH REVIEW RECORD THIS SLICE OWNS. Read here, where
  // everything else this program reads is read, so `price` stays pure and a test
  // can drive every branch of PART 4 without a repository in a state. The rows
  // come from `attribute` rather than a filter written for this — one
  // attribution rule, called twice — and `changedPaths(sha)` is proof-plan's own
  // union of the range with the working tree, called with a different floor.
  const reviews = attribute(histories.reviews, { branch, openedAt: o?.plan?.openedAt ?? null });
  const deltas = {};
  for (const sha of new Set((reviews.rows ?? []).map((r) => r?.commit).filter(Boolean))) deltas[sha] = changedPaths(sha);
  return { branch, paths, subjects, dirty, o, histories, deltas, mergeBase: base.status === 0 ? base.stdout.trim() : null };
}

/** The whole answer, from those observations — pure, so a test can drive every branch of it. */
export function price({ branch, paths, subjects, dirty, o, histories, deltas = {}, mergeBase = null }) {
  const { types, commits, ...lane } = laneOf(paths, subjects);
  const device = o?.state ?? "unknown";
  const review = o?.review?.state ?? "unknown";
  const firebase = o?.firebase?.state ?? "unknown";
  const plan = o?.plan ?? null;
  const stale = o?.stale ?? null;
  const slice = plan
    ? plan.slice
    : stale
      ? `none declared for this branch — a plan for "${stale.slice}" on branch ${stale.branch ?? "unknown"} is on disk and does not apply here`
      : "none declared for this branch";

  // `none` and `unknown` get NO columns: rendering a ceremony there would imply
  // a choice exists, and in one case there is no change and in the other no
  // readable diff.
  const priceable = lane.lane !== "none" && lane.lane !== "unknown";
  return {
    schema: SCHEMA,
    branch: branch ?? null,
    slice,
    diff: { paths: paths === null ? null : paths.length, commits, dirty, types },
    lane,
    owes: priceable ? owesFor(lane.lane, { paths: paths ?? [], device, review, firebase, reviewReason: o?.review?.need?.reason ?? null }) : [],
    round: priceable
      ? nextRound({
          reviewState: review,
          attributed: attribute(histories.reviews, { branch, openedAt: plan?.openedAt ?? null }),
          deltas,
          dirty: Boolean(dirty),
          mergeBase,
        })
      : null,
    spent: priceable ? spendOf({ branch, plan, device, review, firebase, histories }) : [],
  };
}

const ITEM = 16;
const WIDTH = 96;

function wrapText(text, room = WIDTH) {
  const out = [];
  let line = "";
  for (const w of String(text).split(" ")) {
    if (line && `${line} ${w}`.length > Math.max(24, room)) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/** Wrapped prose at one indent. */
const at = (indent, text) => wrapText(text, WIDTH - indent).map((l) => `${" ".repeat(indent)}${l}`);

/** One labelled, wrapped, aligned row — the register of proof-plan.mjs's render(). */
function row(indent, label, width, text) {
  const pad = `${indent}${" ".repeat(width)}`;
  return wrapText(text, WIDTH - pad.length).map((l, i) => (i === 0 ? `${indent}${label.padEnd(width)}${l}` : `${pad}${l}`));
}

export function render(m) {
  const L = [];
  L.push("change price — which lane this change is on, what it owes, which review round is next, and what it already cost");
  L.push("ADVISORY: this refuses nothing, gates nothing, and exits 0 on every path. The header says why.");
  L.push("");
  L.push(`  ${"branch".padEnd(9)}${m.branch || "(detached)"}`);
  L.push(...row("  ", "slice", 9, m.slice));
  L.push(...row("  ", "diff", 9, diffLine(m)));
  L.push("");
  L.push(...row("  ", "lane", 9, m.lane.headline));
  for (const w of m.lane.why) L.push(...at(6, w));
  for (const c of m.lane.clauses ?? []) {
    L.push(`      clause ${c.clause}`);
    L.push(...at(10, `${c.answer} — ${c.detail}`));
  }
  L.push(...at(6, `cite: ${m.lane.cite}`));

  if (m.owes.length) {
    L.push("");
    L.push(
      m.lane.lane === "ambiguous"
        ? "  owes — BOTH columns, because the lane is unanswered. This is exactly what that one question costs:"
        : `  owes — the ${m.lane.lane} lane`,
    );
    for (const r of m.owes) {
      const cols = Object.entries(r.owed);
      if (cols.length === 1) {
        L.push(...row("      ", r.item, ITEM, cols[0][1]));
      } else {
        L.push(`      ${r.item}`);
        for (const [name, text] of cols) L.push(...row("          ", name, 9, text));
      }
      if (r.note) L.push(...at(10, r.note));
      L.push(...at(10, `— ${r.cite}`));
    }
  }

  if (m.round) {
    L.push("");
    L.push(...row("  ", "round", 9, m.round.headline));
    L.push(...at(6, `verdict: ${m.round.verdict}`));
    for (const w of m.round.why) L.push(...at(6, w));
    if (m.round.read) {
      L.push(...at(6, `reads: ${m.round.read.what}`));
      for (const c of m.round.read.cmds) L.push(`          ${c}`);
    }
    for (const settle of m.round.settles) L.push(...at(6, `what would settle it: ${settle}`));
    L.push(...at(6, `cite: ${m.round.cite}`));
  }

  if (m.spent.length) {
    L.push("");
    L.push("  spent — what the kept records show, attributed to this branch");
    for (const r of m.spent) {
      const counts = r.recorded === null ? `no record kept — ${r.file} does not exist` : `${r.recorded} record(s) / ${r.owed} owed`;
      // `what` stays the data key ("device"); the printed name is the tier's.
      L.push(`      ${({ device: "L2 run", firebase: "Firebase L2 run" }[r.what] ?? r.what).padEnd(ITEM)}${r.recorded === null ? counts : `${counts.padEnd(26)}${r.verdict}`}`);
      if (r.byBranchOnly) L.push(...at(10, 'attributed by branch alone — no plan is declared for this branch, so there is no opened-at to bound it by. Fix: node scripts/proof-plan.mjs --open "<what you are building>"'));
      if (r.note) L.push(...at(10, r.note));
      for (const e of r.extra ?? []) L.push(...at(10, e));
    }
    L.push("");
    L.push(...at(6, SPEND_LIMIT));
  }
  return L.join("\n");
}

function diffLine(m) {
  if (m.diff.paths === null) return "git could not answer — see the lane block";
  if (m.diff.paths === 0) return "no path has changed since origin/main, and the working tree is clean";
  const types = Object.keys(m.diff.types).length ? listTypes(m.diff.types) : "no commits yet, so there is no declared type to read";
  return `${m.diff.paths} path(s), ${m.diff.commits} commit(s)${m.diff.dirty ? ", working tree dirty" : ""} — ${types}`;
}

function main() {
  const m = price(observe());
  process.stdout.write(process.argv.slice(2).includes("--json") ? `${JSON.stringify(m, null, 2)}\n` : `${render(m)}\n`);
  // THE ONLY EXIT-CODE LITERAL IN THIS FILE, on the only way out of it. See the
  // header: a program that refuses is a gate, and this one deliberately is not.
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
