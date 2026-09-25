// THREE PLACES `scripts/change-price.mjs` STATES MORE THAN IT DERIVED.
//
// The program's own header sets the standard these assertions hold it to: "AN
// ADVISORY THAT BLUFFS IS WORSE THAN NONE. Where it does not know, it says so
// and names what would settle it." Each test below drives the exported pure
// functions with an input the program already meets, and shows an assertion in
// the output that the input does not support.
//
// Each is written as the CLASS, not the instance:
//
//   1. a governing document is read as prose, so an edit to the rules this
//      program cites is priced as a copy edit — and clause B says "NO, and this
//      half IS decidable" while the document is sitting in the paths it listed;
//   2. a `*-history.jsonl` line that did not parse leaves the count it was part
//      of, and the count is still presented as what the records show;
//   3. a tier that owed nothing and recorded a run is called "within" on one row
//      and "OVER" on another, from the same table, on the same shape of input.
//
// And one place it stated LESS than it derived: an open Firebase L2 run, owed by
// proof-plan as its own tier, was priced nowhere and its runs counted nowhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { laneOf, classifyPath, spendOf, price, render as renderPrice, SPEND_KINDS } from "../scripts/change-price.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The documents `change-price.mjs` takes its OWN authority from, each named by
 * docs/NORTH-STAR.md §12 as keeping authority over a rule.
 *
 * Not the whole of §12's table — several of its rows are a historical record or
 * an execution log, and which of those carry a decision is a human's call. These
 * three are not a call: every verdict this program prints cites one of them, so
 * a diff that moves one moves the program's own answer. `laneOf` already states
 * the reasoning, for docs/NORTH-STAR.md, in rule 4's own `why`: "an edit to the
 * document that exists to HOLD decisions is that clause by construction — it
 * either records one or unmakes one." It applies to one document and stops.
 */
const GOVERNING = ["docs/CHANGE-FLOW-DESIGN.md", "docs/GATE-RULES.md", "docs/PRINCIPLES.md"];

test("a governing document §12 names is read as prose, so rewriting the rules is priced as a copy edit", () => {
  const northStar = fs.readFileSync(path.join(REPO_ROOT, "docs", "NORTH-STAR.md"), "utf8");
  const map = northStar.slice(northStar.indexOf("## 12."));

  for (const doc of GOVERNING) {
    // The premise, checked against the document rather than asserted here: §12's
    // table gives this document authority. If that stops being true, this test
    // should be read again rather than trusted.
    assert.ok(map.includes(`\`${doc}\``), `docs/NORTH-STAR.md §12 no longer names ${doc} — re-read this test before changing the program`);

    assert.notEqual(
      classifyPath(doc),
      "prose",
      `classifyPath("${doc}") is "prose", so a diff that rewrites a document NORTH-STAR §12 gives authority over carries, to this program, no more weight than a typo fix`,
    );
  }

  // What that costs, on a diff this repository actually has: commit 1aa9661,
  // "docs(principles): seven governing rules, placed where every session
  // actually loads them" — the commit that WROTE docs/PRINCIPLES.md and
  // docs/GATE-RULES.md.
  const sevenRules = laneOf(
    ["AGENTS.md", "docs/EVIDENCE-ECONOMICS-PLAN.md", "docs/GATE-RULES.md", "docs/PRINCIPLES.md", "template/CLAUDE.md"],
    ["docs(principles): seven governing rules, placed where every session actually loads them"],
  );
  assert.notEqual(
    sevenRules.row,
    "Copy/content edit",
    `writing seven governing rules is priced "${sevenRules.headline}" — §3's Copy/content edit row is "a clause edit only if the copy is specified", and seven rules an agent is bound by are not copy`,
  );

  // And the self-referential one: the program reads §3's entry-point table to
  // decide every lane it prints, and prices a rewrite of that table as a copy edit.
  const rewriteTheRouter = laneOf(["docs/CHANGE-FLOW-DESIGN.md"], ["docs(flow): the entry-point table, rewritten"]);
  assert.notEqual(
    rewriteTheRouter.row,
    "Copy/content edit",
    "a diff that rewrites §3's own entry-point table is priced by the program that reads §3 as a copy edit",
  );

  // The bluff proper. Clause B is the half the program says IS decidable, and it
  // answers a flat NO over a diff holding a document §12 governs.
  const withGateRules = laneOf(["docs/GATE-RULES.md", "scripts/some-gate.mjs"], ["feat(gate): a new rule"]);
  const b = (withGateRules.clauses ?? []).find((c) => c.clause.startsWith("B"));
  assert.ok(b, "a `feat` over code is the AMBIGUOUS verdict, which states both clauses");
  assert.equal(
    /^NO/.test(b.answer) && b.detail.includes("docs/GATE-RULES.md"),
    true,
    `clause B answers "${b.answer}" — "${b.detail}" — while docs/GATE-RULES.md is in the diff it just enumerated. Either the answer is not NO, or the detail must name what it did not look at.`,
  );
});

const hist = (rows, malformed = 0) => ({ file: "qa-artifacts/x-history.jsonl", exists: true, rows, malformed });
const BRANCH = "a-slice-under-test";
const PLAN = { slice: "a slice under test", branch: BRANCH, openedAt: "2026-09-18T10:00:00.000Z" };
const ran = (at) => ({ branch: BRANCH, ranAt: at });

test("a history line that did not parse leaves the count, and the count is still shown as what the records show", () => {
  // `readHistory` counts unreadable lines ON PURPOSE — scripts/lib/proof-history.mjs:
  // "a line that does not parse is skipped and COUNTED, so a torn write shows up
  // in the report instead of silently shrinking it." `renderHistory` prints that
  // count. This reader takes `malformed` from the same call and drops it, and the
  // render it feeds is headed "what the kept records show".
  //
  // The direction of the error is the reason it matters: every lost line makes
  // the spend look SMALLER, and understating spend is the one mistake a program
  // written to catch over-proof cannot afford.
  const rows = spendOf({
    branch: BRANCH,
    plan: PLAN,
    device: "owed",
    review: "owed",
    histories: {
      suite: hist([ran("2026-09-18T11:00:00.000Z"), ran("2026-09-18T12:00:00.000Z")], 2),
      fleet: hist([ran("2026-09-18T11:00:00.000Z")], 1),
      reviews: hist([ran("2026-09-18T11:00:00.000Z")], 1),
    },
  });

  for (const r of rows) {
    const text = JSON.stringify(r);
    assert.ok(
      r.malformed > 0 || /did not parse|malformed|unreadable/i.test(text),
      `the ${r.what} row reports "${r.recorded} record(s) / ${r.owed} owed — ${r.verdict}" and says nothing about the line(s) that did not parse, so a torn write is read as a run that never happened: ${text}`,
    );
  }
});

test("a tier that owed no run and recorded one is called OVER on the device row and `within` on the review row", () => {
  // Same table, same shape of input, opposite answer. `proof-plan.mjs` says a
  // tier is `none` on a diff that cannot oblige it — a docs-only slice is `none`
  // for both, REVIEW_TIER_IRRELEVANT being ["docs/", "*.md", …] — and
  // `recordReview()` appends to review-history.jsonl whether or not one was owed.
  // So a review round on a docs-only slice is pure over-proof, and this is the
  // program that exists to name it.
  const rows = spendOf({
    branch: BRANCH,
    plan: PLAN,
    device: "none",
    review: "none",
    histories: {
      suite: hist([]),
      fleet: hist([ran("2026-09-18T11:00:00.000Z")]),
      reviews: hist([ran("2026-09-18T11:00:00.000Z"), ran("2026-09-18T12:00:00.000Z")]),
    },
  });

  // The premise: this is the same situation on both rows, and the device row
  // already answers it the way the program's whole thesis requires.
  const device = rows.find((r) => r.what === "device");
  assert.equal(device.owed, 0);
  assert.match(device.verdict, /^OVER/, "the device row prices its excess against the `owed` it prints");

  // The invariant, over every row: a verdict is a claim about the `owed` beside
  // it, so no row may print `N recorded / 0 owed` and call it within budget.
  for (const r of rows) {
    if (r.recorded === null || r.recorded === 0 || r.owed !== 0) continue;
    assert.notEqual(
      r.verdict,
      "within",
      `the ${r.what} row prints "${r.recorded} record(s) / ${r.owed} owed" and calls it "within" — its verdict is computed against a number it does not show${r.note ? `, and its note pleads an allowance nothing was owed for: "${r.note}"` : ""}`,
    );
  }
});

// AN OPEN FIREBASE L2 RUN IS PRICED. proof-plan owes it as its own tier
// (`o.firebase`, TIERS.firebase) with its own record and its own history kind
// (`fleet-firebase`, scripts/lib/proof-history.mjs), so an advisory that read
// only `o.state` and `o.review.state` priced a slice owing a Firebase run as if
// it owed nothing there, and counted none of the runs it bought. Read beside
// the other two, and counted by the one attribution rule.
const FB_NEED = { required: true, obliging: ["template/firebase/x.kt"], reason: "1 changed path(s) feed the Firebase L2 run" };
const allHistories = (fb) => ({ suite: hist([]), fleet: hist([]), reviews: hist([]), "fleet-firebase": fb });
const priceWith = (firebase, fb = hist([])) =>
  price({
    branch: BRANCH,
    paths: ["scripts/a-module.mjs"],
    subjects: ["fix(a): a line"],
    dirty: false,
    o: { state: "none", plan: PLAN, review: { state: "none", need: { reason: "r" } }, firebase: { state: firebase, need: FB_NEED } },
    histories: allHistories(fb),
  });

test("an open Firebase L2 run appears in the priced obligations — the proof-tiers note and its own spent row", () => {
  const m = priceWith("owed");
  const tiers = m.owes.find((r) => r.item === "proof tiers");
  assert.match(tiers.note, /Firebase L2 run OWED/, `the proof-tiers note reads o.state and o.review.state and not o.firebase.state: "${tiers.note}"`);
  const fb = m.spent.find((r) => r.what === "firebase");
  assert.ok(fb, `the spent block has no Firebase row: ${JSON.stringify(m.spent.map((r) => r.what))}`);
  assert.equal(fb.owed, 1);
  assert.equal(fb.verdict, "within");
  assert.match(renderPrice(m), /^ {6}Firebase L2 run +0 record\(s\) \/ 1 owed +within$/m, "the printed line has the L2 run line's shape");
  assert.ok(SPEND_KINDS.includes("fleet-firebase"), "observe() reads the fleet-firebase history the row is counted from");
});

test("the Firebase row takes the one verdict rule: a run no tier owed is OVER, a moved app is REOPENED", () => {
  const over = priceWith("none", hist([ran("2026-09-18T11:00:00.000Z")])).spent.find((r) => r.what === "firebase");
  assert.equal(over.owed, 0);
  assert.match(over.verdict, /^OVER by 1/);
  const reopened = priceWith("reopened", hist([ran("2026-09-18T11:00:00.000Z")])).spent.find((r) => r.what === "firebase");
  assert.match(reopened.verdict, /^REOPENED/);
  // Advisory still: a pure caller that hands no Firebase history gets the rows it
  // handed, not a throw — every other caller in this suite predates the kind.
  assert.doesNotThrow(() => spendOf({ branch: BRANCH, plan: PLAN, device: "owed", review: "owed", firebase: "owed", histories: { suite: hist([]), fleet: hist([]), reviews: hist([]) } }));
});
