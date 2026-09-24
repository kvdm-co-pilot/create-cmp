// NOTHING SAID WHICH LANE A CHANGE WAS ON, SO SIX BUG FIXES BOUGHT A BRIEF'S CEREMONY.
//
// `scripts/proof-plan.mjs` answers which TIERS a change owes and when. The LANE
// — which sets the ceremony around the work — lived only in prose
// (docs/CHANGE-FLOW-DESIGN.md §3). Measured 2026-09-18: six direct-lane bug
// fixes were driven with brief-lane ceremony, including a mutation check on
// every new test (a rule in no document here) and a routine second review round
// (docs/KNOWN-DEFECTS.md makes it conditional). It cost an afternoon, and no
// gate noticed — every gate in this product refuses too LITTLE proof, and
// nothing refuses too much.
//
// WHAT THESE ASSERTIONS ARE FOR. Two things, and the second is the one prose
// cannot hold:
//
//   1. the routing itself — a `fix:` over `scripts/` is the DIRECT lane, and
//      the ceremony that lane owes says no grill and no brief;
//   2. the ADVISORY's honesty — where the diff cannot settle §3's rule, the
//      output must say so and name who settles it, and the program must never
//      grow a refusal. The last test reads the module's own bytes for that,
//      because an "upgrade" to a gate would pass every behavioural assertion
//      here while changing what the file IS.
//
// Everything below drives the exported pure functions with synthetic inputs.
// Nothing here runs the suite, shells out to git, writes to qa-artifacts/, or
// depends on this tree's own diff — the live answer is what the command prints,
// not what a test asserts about the day it was written.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { laneOf, owesFor, spendOf, price, CEREMONY, DIRECT_TYPES } from "../scripts/change-price.mjs";
import { TIERS } from "../scripts/proof-plan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The ceremony text for one item on one lane. */
// `review: "owed"` — the review row's ceremony is what these tests read; on a
// diff proof-plan says owes no review, the row says NOT OWED instead
// (test/a-docs-only-change-is-told-it-owes-a-review-round.test.mjs).
const owed = (lane, item) => owesFor(lane, { paths: [], device: "none", review: "owed" }).find((r) => r.item === item);

/** A history file that exists and holds these rows, as `observe()` hands them over. */
const kept = (rows) => ({ file: "qa-artifacts/x-history.jsonl", exists: true, rows, malformed: 0 });
const BRANCH = "a-slice-under-test";
const PLAN = { slice: "a slice under test", branch: BRANCH, openedAt: "2026-09-18T10:00:00.000Z" };
const ran = (at) => ({ branch: BRANCH, ranAt: at });

test("THE 2026-09-18 CASE: only `fix:` commits over scripts/ read DIRECT, and name the bug-fix row", () => {
  // The single most important assertion in this file. If this ever reads
  // anything but DIRECT, the afternoon that paid for this program is back.
  const l = laneOf(["scripts/suite-record.mjs", "test/suite-record.test.mjs"], [
    "fix(suite): the door expands a glob the way npm does, or declines",
    "fix(suite): a tree that is not installed is refused by name",
    "fix(suite): the door and npm read one workspaces declaration",
  ]);
  assert.equal(l.lane, "direct");
  assert.match(l.row, /^Bug fix \(spec right, code wrong\)/, "the row named is §3's, not a summary of it");
  assert.match(l.headline, /DIRECT/);
  assert.equal(l.commits, 3);
  assert.deepEqual(l.types, { fix: 3 }, "the evidence is the types actually seen");
  assert.match(l.why.join(" "), /fix x3/);
});

test("a `feat:` over code is AMBIGUOUS — clause B answered NO by the diff, clause A handed back, neither guessed", () => {
  const l = laneOf(["packages/harness/src/lib/thing.mjs"], ["feat(harness): a new surface"]);
  assert.equal(l.lane, "ambiguous");
  assert.equal(l.row, null, "an unanswered lane names no row of §3's table");

  const b = l.clauses.find((c) => c.clause.startsWith("B"));
  assert.match(b.answer, /^NO/, "blast radius into signed contracts IS decidable from the diff");
  assert.match(b.detail, /docs\/adr\/.*docs\/features\/.*docs\/NORTH-STAR\.md/, "it says which paths it looked for");

  const a = l.clauses.find((c) => c.clause.startsWith("A"));
  assert.match(a.answer, /NOT DECIDABLE/);
  assert.match(a.detail, /triage restatement/, "it names the human's answer as what settles it");
  assert.match(a.detail, /docs\/features\/<name>\.md/, "and the artifact whose appearance settles it instead");

  // Why it got here, in the diff's own terms — and the row that would apply.
  assert.match(l.why.join(" "), /feat x1/);
  assert.match(l.why.join(" "), /New feature/);
});

test("an ADR in the diff is BRIEF, and the empty ADR form on its own is not", () => {
  const withAdr = laneOf(["docs/adr/0017-something.md", "scripts/x.mjs"], ["docs(adr): record it"]);
  assert.equal(withAdr.lane, "brief");
  assert.match(withAdr.row, /Architecture change/);
  assert.match(withAdr.why.join(" "), /0017-something/);

  // `docs/adr/template.md` is the form an ADR is written FROM. Editing it
  // records no decision, so it must not route a docs edit into the brief lane.
  const templateOnly = laneOf(["docs/adr/template.md"], ["docs(adr): tidy the form"]);
  assert.equal(templateOnly.lane, "direct", "the template carries no decision");
});

test("a `docs:` commit over docs/KNOWN-DEFECTS.md alone is DIRECT — a copy edit is not a brief", () => {
  const l = laneOf(["docs/KNOWN-DEFECTS.md"], ["docs(log): KD-113 — the two readers spell a nameless workspace two ways"]);
  assert.equal(l.lane, "direct");
  assert.equal(l.row, "Copy/content edit");

  // And before it is committed, when there is no type to read at all: prose
  // nothing has signed is still a copy edit, not an open question.
  const uncommitted = laneOf(["docs/KNOWN-DEFECTS.md", "README.md"], []);
  assert.equal(uncommitted.lane, "direct");
  assert.equal(uncommitted.row, "Copy/content edit");
});

test("git that could not answer reads UNKNOWN and claims no lane — `I could not check` is not `I checked`", () => {
  const l = laneOf(null, ["fix: something"]);
  assert.equal(l.lane, "unknown");
  assert.equal(l.row, null);
  assert.match(l.why.join(" "), /git merge-base HEAD origin\/main/, "the failed command is named");
  assert.equal(owesFor(l.lane).length, 0, "no ceremony is priced where no lane is known — that would imply a choice exists");

  const noSubjects = laneOf(["scripts/x.mjs"], null);
  assert.equal(noSubjects.lane, "unknown");
  assert.match(noSubjects.why.join(" "), /git log --format=%s/);
});

test("an empty diff reads NONE — there is no change to price", () => {
  const l = laneOf([], []);
  assert.equal(l.lane, "none");
  assert.equal(owesFor(l.lane).length, 0);
});

test("THE LINE THE WHOLE SLICE IS: the direct lane owes NO grill and NO brief", () => {
  const grill = owed("direct", "grill");
  assert.deepEqual(Object.keys(grill.owed), ["direct"], "one lane renders one column — a second would be noise");
  assert.match(grill.owed.direct, /^NO\b/);
  assert.match(grill.owed.direct, /never grilled/);

  const brief = owed("direct", "brief");
  assert.match(brief.owed.direct, /^NO\b/);

  // The brief lane still owes both, so the contrast is a real one.
  assert.match(owed("brief", "grill").owed.brief, /frontier/);
  assert.match(owed("brief", "brief").owed.brief, /docs\/features\/<name>\.md/);

  // Ambiguous renders BOTH columns, so the reader sees what the open question costs.
  const ambiguous = owesFor("ambiguous", { paths: [], device: "none", review: "none" }).find((r) => r.item === "grill");
  assert.deepEqual(Object.keys(ambiguous.owed), ["direct", "brief"]);

  // And the whole table is a frozen constant that cites its source, row by row —
  // not prose assembled inside a print statement, where nobody can check it.
  assert.equal(Object.isFrozen(CEREMONY), true);
  assert.equal(DIRECT_TYPES.includes("feat"), false, "§3's New feature row is the brief lane");
  for (const r of CEREMONY) {
    assert.ok(r.cite && r.cite.length > 4, `the ${r.item} row carries no citation`);
    assert.ok(r.direct && r.brief, `the ${r.item} row does not price both lanes`);
  }
});

test("the review row says ONE round and names `more than trivial` as the condition for a second", () => {
  // Pinned against an edit that makes round 2 routine — which is half of what
  // the 2026-09-18 afternoon actually bought.
  const r = owed("direct", "review");
  assert.match(r.owed.direct, /one round/i);
  assert.match(r.owed.direct, /more than trivial/);
  assert.match(r.owed.direct, /no third/);
  assert.match(r.note, /does not guess/, "the program says it cannot judge triviality rather than judging it");
  assert.match(r.cite, /KNOWN-DEFECTS/, "and it points at the rule of record");
});

test("the kept-plant row says the rule is `wires a gate`, NOT `every new test`", () => {
  // The other half of the afternoon: mutation-checking every new test is a rule
  // in no document in this repository.
  const r = owed("direct", "kept plant");
  assert.match(r.owed.direct, /WIRES A NEW GATE/);
  assert.match(r.owed.direct, /mutation-checking every new test is a rule in no document here/);
  assert.match(r.cite, /GATE-RULES\.md Rule 1/);

  // The one path-level signal it has, and the limit it states either way.
  const touched = owesFor("direct", { paths: ["scripts/framework-check.mjs"], device: "none", review: "none" }).find((x) => x.item === "kept plant");
  assert.match(touched.note, /scripts\/framework-check\.mjs/);
  const untouched = owed("direct", "kept plant");
  assert.match(untouched.note, /touches no framework-check\.mjs/);
  for (const n of [touched.note, untouched.note]) assert.match(n, /nothing here can tell a new GATE from a new TEST by path alone/);
});

test("review RECORDS are counted and never called OVER — a record is an upper bound on a round, not a round", () => {
  // THIS TEST ASSERTED THE OPPOSITE UNTIL REVIEW ROUND 1 SHOWED IT WAS WRONG. It
  // pinned `3 records → OVER by 1`, which is a false accusation of the very
  // defect this program exists to detect: `proof-plan.mjs` REOPENS the review
  // obligation whenever a trigger path moves after a record, and every
  // `--record-review` appends a row, so records ≥ rounds always and the gap
  // grows with each post-review fix. A slice that took exactly two legitimate
  // rounds with one re-record in between holds THREE rows. Recovering rounds
  // from records would take a second bookkeeping, which this program refuses to
  // keep — so the count is reported as the upper bound it is, the rule about
  // rounds is pointed at rather than applied, and the row says which is which.
  const spend = (n) =>
    spendOf({
      branch: BRANCH,
      plan: PLAN,
      device: "none",
      review: "owed",
      histories: {
        suite: kept([]),
        fleet: kept([]),
        reviews: kept(Array.from({ length: n }, (_, i) => ran(`2026-09-18T1${i + 1}:00:00.000Z`))),
      },
    }).find((r) => r.what === "review");

  const three = spend(3);
  assert.equal(three.recorded, 3, "the count is reported — that half was never the defect");
  assert.equal(/OVER/.test(three.verdict), false, `three records are not three rounds, and "${three.verdict}" must not accuse the operator of a third`);
  assert.match(three.verdict, /records, not rounds/, "the verdict names the unit it is counting");
  assert.match(three.note, /upper bound/i, "and says the number is an upper bound on rounds");
  assert.match(three.note, /reopen/i, "for the reason that makes it one");
  assert.match(three.note, /KNOWN-DEFECTS/, "the rule about rounds is pointed at, never restated");

  // The cross-row invariant, on this row: a count above its own printed `owed`
  // is not "within" either. This row cannot tell, and says so both ways.
  const two = spend(2);
  assert.equal(two.verdict, three.verdict, "one rule, not a branch per count");
  assert.notEqual(two.verdict, "within");

  assert.equal(spend(1).verdict, "within", "at or under what it owed, the ordinary rule applies");
});

test("a change owes ONE suite run whatever its commit count, read from proof-plan's TIERS — and more is OVER", () => {
  // IT PRICED ONE RUN PER COMMIT UNTIL 2026-09-24, from a plan's `declared`
  // copy of the cadence. The rule is once, over the finished batch (TIERS in
  // scripts/proof-plan.mjs); a price of four for three commits and a dirty tree
  // told an agent that four runs were owed, and it ran them.
  //
  // THE ROW IS HANDED NO COMMIT COUNT. `spendOf` read `commits` and `dirty` only
  // to multiply the price, and stopped reading them when the cadence became
  // at-close — so a call that still hands them in varies nothing the function
  // reads (test/option-keys-the-callee-never-reads.test.mjs refuses one). The
  // rows below vary what `spendOf` does read; "whatever its commit count" is
  // asserted at the end, in `price()`, which is where the count still exists.
  const spend = (recorded, { plan = PLAN } = {}) =>
    spendOf({
      branch: BRANCH,
      plan,
      device: "none",
      review: "none",
      histories: {
        suite: kept(Array.from({ length: recorded }, (_, i) => ran(`2026-09-18T1${i}:00:00.000Z`))),
        fleet: kept([]),
        reviews: kept([]),
      },
    }).find((r) => r.what === "suite");

  const over = spend(7);
  assert.equal(over.owed, 1, "ONE run is owed — over the finished batch");
  assert.match(over.verdict, /^OVER by 6$/);
  assert.match(over.note, /295 full-suite runs/, "the measured baseline is quoted from suite-record.mjs's header");
  assert.ok(over.extra.some((l) => l.includes(TIERS.suite.due)), "the row prints the cadence it read, from TIERS and not a copy");

  assert.equal(spend(1).verdict, "within");
  assert.equal(spend(2).verdict, "OVER by 1", "a second run over the same batch is the habit this row exists to show");

  // A PLAN OPENED BEFORE THE CHANGE still carries `declared.suite: "per-commit"`.
  // It is not read for the count — TIERS is the one table — and it is NAMED, so
  // a reader who opens the plan and finds "per-commit" there knows why the row
  // disagrees with it.
  const oldPlan = { ...PLAN, declared: { suite: "per-commit", frameworkCheck: "per-commit", device: "at-close", review: "at-close" } };
  const fromOld = spend(0, { plan: oldPlan });
  assert.equal(fromOld.owed, 1, "a stale per-commit copy does not multiply the price");
  assert.ok(fromOld.extra.some((l) => /still declares suite "per-commit"/.test(l) && /stale/.test(l)), `the stale copy is named: ${fromOld.extra.join(" | ")}`);
  const fromCurrent = spend(0, { plan: { ...PLAN, declared: { suite: TIERS.suite.when } } });
  assert.equal(fromCurrent.extra.some((l) => /still declares/.test(l)), false, "a plan that agrees with TIERS is not called stale");

  // WHATEVER THE COMMIT COUNT, where the count exists: `price()` derives it from
  // the commit subjects and hands the suite row none of it. A price that ever
  // scaled with commits again — through any argument — reddens here.
  const o = { state: "none", review: { state: "none" }, plan: PLAN };
  const histories = { suite: kept([]), fleet: kept([]), reviews: kept([]) };
  for (const [subjects, dirty] of [
    [[], false],
    [["fix(a): one", "fix(a): two", "fix(a): three"], true],
    [["fix(a): one", "fix(a): two", "fix(a): three", "fix(a): four", "fix(a): five"], true],
  ]) {
    const m = price({ branch: BRANCH, paths: ["scripts/a-module.mjs"], subjects, dirty, o, histories });
    assert.equal(m.diff.commits, subjects.length, "the premise: the commit count reached price()");
    const suite = m.spent.find((r) => r.what === "suite");
    assert.equal(suite?.owed, 1, `${subjects.length} commit(s)${dirty ? " and a dirty tree" : ", clean"} owe ONE suite run, not ${suite?.owed}`);
  }

  // A record from before this slice opened is not this slice's spend — the
  // proof-history attribution rule, with the upper bound absent because the
  // plan has not closed.
  const earlier = spendOf({
    branch: BRANCH,
    plan: PLAN,
    device: "none",
    review: "none",
    histories: { suite: kept([ran("2026-09-17T09:00:00.000Z"), ran("2026-09-18T11:00:00.000Z")]), fleet: kept([]), reviews: kept([]) },
  }).find((r) => r.what === "suite");
  assert.equal(earlier.recorded, 1, "the run from before openedAt belongs to whatever came before");

  // An absent file is not a zero — it is no record kept, and says so.
  const absent = spendOf({
    branch: BRANCH,
    plan: PLAN,
    device: "none",
    review: "none",
    histories: { suite: { file: "qa-artifacts/suite-history.jsonl", exists: false, rows: [], malformed: 0 }, fleet: kept([]), reviews: kept([]) },
  }).find((r) => r.what === "suite");
  assert.equal(absent.recorded, null);
  assert.equal(absent.verdict, "no record kept");
});

test("THE ADVISORY NEVER REFUSES — the only exit-code literal in the module is 0", () => {
  // Behaviour cannot pin this: a future `process.exit(1)` on some path would
  // pass every assertion above while changing what this file IS. A program that
  // refuses is a new gate — it would owe GATE-RULES Rule 1 a calibrated plant
  // and add the mechanism NORTH-STAR §10 Q3 presumes against — so the bytes are
  // read instead.
  const source = fs.readFileSync(path.join(REPO_ROOT, "scripts", "change-price.mjs"), "utf8");
  const codes = [...source.matchAll(/process\.exit\(\s*([^)]*)\s*\)/g)].map((m) => m[1].trim());
  assert.deepEqual(codes, ["0"], `change-price.mjs exits with ${codes.join(", ")} — it is advisory and exits 0 on every path, including where it cannot answer`);
  assert.equal(/process\.exitCode/.test(source), false, "nor by the other spelling of a non-zero exit");

  // And it is wired into nothing: a gate is a thing something invokes.
  const settings = fs.readFileSync(path.join(REPO_ROOT, ".claude", "settings.json"), "utf8");
  const pkg = fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8");
  for (const [where, text] of [[".claude/settings.json", settings], ["package.json", pkg]]) {
    assert.equal(text.includes("change-price"), false, `${where} invokes change-price.mjs — an advisory that refuses nothing is useless as a gate, and wiring it implies it does`);
  }
});
