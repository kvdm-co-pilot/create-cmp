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
// minutes because a suite-scaled step sat in the per-change lane."
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
// and names what would settle it. §3's rule has two clauses, and a diff can
// answer exactly one of them: whether anything already signed moved is visible
// in the paths; whether the change carries decisions is not, and that half is
// handed back to the human it belongs to with the two things that settle it
// named.
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
// `docs/features/`, `docs/NORTH-STAR.md`, and a commit convention this
// repository's own log follows. They live in create-cmp's `scripts/`, on the
// same shelf as DEVICE_TIER_TRIGGERS in `scripts/observed-tree.mjs`, and
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
import { obligation, changedPaths, currentBranch, read } from "./proof-plan.mjs";
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
 */
export function classifyPath(p) {
  const f = String(p ?? "").split(path.sep).join("/");
  if (f === "docs/adr/template.md") return "prose";
  if (f.startsWith("docs/adr/")) return "contract";
  if (f.startsWith("docs/features/")) return "contract";
  if (f === "docs/NORTH-STAR.md") return "contract";
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
 * WHICH ROW OF §3's TABLE a set of direct-lane commit types is. Precedence
 * rather than a lookup, because a slice mixing `fix` and `docs` is a bug fix
 * that also touched its own docs — the fix is what the change IS.
 */
function directRow(counts) {
  if (counts.fix) return "Bug fix (spec right, code wrong) — contract untouched; the clause already says the correct behavior";
  if (counts.docs) return "Copy/content edit";
  if (counts.chore || counts.build) return "Version upgrade, or a change that decides nothing";
  return "no decision to record and nothing signed in the diff";
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
  const northStar = paths.filter((p) => String(p) === "docs/NORTH-STAR.md");

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

  // 4 — NORTH-STAR. There is NO row for it in §3's table, and none is invented
  // here; what decides is the RULE above the table, and its first clause is met
  // by the document's own purpose.
  if (northStar.length) {
    return {
      ...base,
      lane: "brief",
      row: null,
      headline: "BRIEF — docs/NORTH-STAR.md is in the diff",
      why: [
        "§3's table has no row for the governing document, and this invents none.",
        'What decides is the blockquote above the table — brief lane iff the change carries "decisions a future contributor could plausibly unmake" — and an edit to the document that exists to HOLD decisions is that clause by construction: it either records one or unmakes one.',
      ],
      cite: "docs/CHANGE-FLOW-DESIGN.md §3, the brief/direct blockquote, clause A",
    };
  }

  const parsed = types ?? [];
  const offTable = parsed.filter((t) => t === null || !DIRECT_TYPES.includes(t));

  // 5 — every commit declares a type that decides nothing, and nothing signed
  // moved. Rules 2-4 already returned for every category `classifyPath` calls a
  // contract, so the third condition cannot be false here today; it is written
  // out anyway, because the day a fourth contract category is added is the day a
  // silent fall-through here would route a signed change into the direct lane.
  if (commits > 0 && offTable.length === 0 && contracts.length === 0) {
    const row = directRow(counts);
    return {
      ...base,
      lane: "direct",
      row,
      headline: `DIRECT — ${row}`,
      why: [
        `Every commit declares a type that decides nothing: ${listTypes(counts)}.`,
        "And no path under docs/adr/, docs/features/ or docs/NORTH-STAR.md moved, so there is no blast radius into anything already signed.",
      ],
      cite: "docs/CHANGE-FLOW-DESIGN.md §3, the entry-point table",
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
        "§3's Contract column for this row: a clause edit only if the copy is specified; otherwise none.",
      ],
      cite: 'docs/CHANGE-FLOW-DESIGN.md §3, row "Copy/content edit"',
    };
  }

  // 7 — the honest answer. One clause of §3's rule is answered by the diff and
  // the other is not, so they are reported apart rather than averaged into a guess.
  const reached =
    commits === 0
      ? "no commits yet and the diff contains code, so there is no declared type to read — commit with a conventional type, or say the lane in the restatement"
      : `${listTypes(tally(offTable.map((t) => t ?? "(no conventional type)")))} — ${
          offTable.includes("feat")
            ? "a `feat` is §3's \"New feature\" row, which is the brief lane when it adds a new surface"
            : "not a type §3's table routes to the direct lane"
        }`;
  return {
    ...base,
    lane: "ambiguous",
    row: null,
    headline: "AMBIGUOUS — one of §3's two clauses is answered by the diff, and the other is not",
    why: [`Why it got here: ${reached}.`],
    cite: "docs/CHANGE-FLOW-DESIGN.md §3, the brief/direct blockquote",
    clauses: [
      {
        clause: "B — blast radius into contracts already signed",
        answer: "NO, and this half IS decidable",
        detail: `nothing under docs/adr/, docs/features/ or docs/NORTH-STAR.md is in this diff (${contracts.length} such path(s)). Were it otherwise, this would have routed as BRIEF before reaching here.`,
      },
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
    direct: 'NO — "The direct lane is never grilled … a bug fix, an emergency fix, or a spike, never"',
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
    note: () => "this cannot know whether the fixes from round 1 were more than trivial, because nothing records it, and it does not guess",
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
      `right now it says device ${String(ctx.device ?? "unknown").toUpperCase()}, review ${String(ctx.review ?? "unknown").toUpperCase()}. The schedule itself is that program's and is not restated here.`,
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
  return CEREMONY.map((row) => ({
    item: row.item,
    cite: row.cite,
    owed: Object.fromEntries(columns.map((c) => [c, row[c]])),
    note: row.note ? row.note(ctx) : null,
  }));
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
 */
export function attribute(history, { branch, openedAt = null }) {
  if (!history?.exists) return { recorded: null, byBranchOnly: false };
  const rows = (history.rows ?? []).filter((r) => r && r.branch === branch);
  const from = stamp(openedAt);
  if (from === null) return { recorded: rows.length, byBranchOnly: true };
  return { recorded: rows.filter((r) => (stamp(r.ranAt) ?? -Infinity) >= from).length, byBranchOnly: false };
}

/**
 * What the kept records show, against what this change owed.
 *
 * The suite's cadence is per-commit, so its owed count is the commits plus the
 * working tree when it is dirty — one run for the bytes nobody has committed
 * yet. The two at-close tiers owe one each, or none when `proof-plan` says none.
 */
export function spendOf({ branch, plan, device, review, commits, dirty, histories }) {
  const openedAt = plan?.openedAt ?? null;
  const suite = attribute(histories.suite, { branch, openedAt });
  const fleet = attribute(histories.fleet, { branch, openedAt });
  const reviews = attribute(histories.reviews, { branch, openedAt });

  const suiteOwed = Math.max(1, (commits ?? 0) + (dirty ? 1 : 0));
  const deviceOwed = device === "none" ? 0 : 1;
  const reviewOwed = review === "none" ? 0 : 1;

  const rows = [];

  rows.push({
    what: "suite",
    file: histories.suite.file,
    recorded: suite.recorded,
    owed: suiteOwed,
    byBranchOnly: suite.byBranchOnly,
    ...(suite.recorded === null
      ? { verdict: "no record kept" }
      : suite.recorded - suiteOwed > 0
        ? {
            verdict: `OVER by ${suite.recorded - suiteOwed}`,
            note:
              "what this looked like before anything recorded it, from scripts/suite-record.mjs's own header: 295 full-suite runs, 4.6 to 6.6 per merged change, 4.5 hours (docs/research/g2-measure/, 2026-09-07 to 09-17). A run over bytes a recorded run already covers is read, not repeated.",
          }
        : { verdict: "within" }),
  });

  const deviceRow = {
    what: "device",
    file: histories.fleet.file,
    recorded: fleet.recorded,
    owed: deviceOwed,
    byBranchOnly: fleet.byBranchOnly,
    ...(fleet.recorded === null
      ? { verdict: "no record kept" }
      : fleet.recorded - deviceOwed > 0
        ? { verdict: `OVER by ${fleet.recorded - deviceOwed}`, note: `${fleet.recorded - deviceOwed} run(s) beyond the one this change owed, at ~3.5 min and an emulator each.` }
        : { verdict: "within" }),
  };
  if (device === "reopened") {
    deviceRow.extra = [
      "proof-plan says REOPENED: a trigger path moved after the run, so the run describes a tree that no longer exists and now proves nothing. That is the 2026-09-08 failure, and it is over-proof by definition — the spend is real and the evidence is gone.",
    ];
  }
  rows.push(deviceRow);

  rows.push({
    what: "review",
    file: histories.reviews.file,
    recorded: reviews.recorded,
    owed: reviewOwed,
    byBranchOnly: reviews.byBranchOnly,
    ...(reviews.recorded === null
      ? { verdict: "no record kept" }
      : reviews.recorded >= 3
        ? { verdict: `OVER by ${reviews.recorded - 2}`, note: "docs/KNOWN-DEFECTS.md caps a slice at two rounds and admits no third." }
        : reviews.recorded === 2
          ? {
              verdict: "within",
              note: 'a second round is allowed when the fixes from round 1 were "more than trivial". The record does not say which, so this is NOT called over — and it is not endorsed either.',
            }
          : { verdict: "within" }),
  });

  return rows;
}

/**
 * The line that matters more than the counts above it, and the reason the `owes`
 * block is the defence while this block is not.
 */
export const SPEND_LIMIT =
  "nothing in this repository records a grill, a brief round, a mutation check or a hand-run plant. " +
  "So this half CANNOT see the ceremony the 2026-09-18 episode actually over-paid: it sees three tiers that write records, and those were not the problem. " +
  "The only defence against the rest is the owes block above, read BEFORE the work.";

// ─────────────────────────────────────────────────────────────────────────────
// THE MODEL, AND THE TWO WAYS IT IS PRINTED
// ─────────────────────────────────────────────────────────────────────────────

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
    ["suite", "fleet", "reviews"].map((kind) => {
      const file = historyPath(root, kind);
      return [kind, { file: path.relative(root, file), exists: fs.existsSync(file), ...readHistory(file) }];
    }),
  );
  return { branch, paths, subjects, dirty, o, histories };
}

/** The whole answer, from those observations — pure, so a test can drive every branch of it. */
export function price({ branch, paths, subjects, dirty, o, histories }) {
  const { types, commits, ...lane } = laneOf(paths, subjects);
  const device = o?.state ?? "unknown";
  const review = o?.review?.state ?? "unknown";
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
    owes: priceable ? owesFor(lane.lane, { paths: paths ?? [], device, review }) : [],
    spent: priceable ? spendOf({ branch, plan, device, review, commits: commits ?? 0, dirty: Boolean(dirty), histories }) : [],
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
  L.push("change price — which lane this change is on, what it owes, and what it already cost");
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

  if (m.spent.length) {
    L.push("");
    L.push("  spent — what the kept records show, attributed to this branch");
    for (const r of m.spent) {
      const counts = r.recorded === null ? `no record kept — ${r.file} does not exist` : `${r.recorded} record(s) / ${r.owed} owed`;
      L.push(`      ${r.what.padEnd(ITEM)}${r.recorded === null ? counts : `${counts.padEnd(26)}${r.verdict}`}`);
      if (r.byBranchOnly) {
        L.push(
          ...at(
            10,
            'attributed by branch alone — no plan is declared for this branch, so there is no opened-at to bound it by. Fix: node scripts/proof-plan.mjs --open "<what you are building>"',
          ),
        );
      }
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
