// THE PLAN TOLD AN AGENT TO RUN THE SUITE AFTER EVERY FIX.
//
// Until 2026-09-24 `scripts/proof-plan.mjs` declared the suite and
// framework-check `per-commit`, printed that word in the row an agent reads at
// the moment of deciding, and ended every suite line that was not fresh with
// "— run npm test". An agent reading that mid-slice did what it said: a full
// suite after each fix. The measured cost is in scripts/suite-record.mjs's
// header. Karel, 2026-09-24: once, at close.
//
// WHAT IS ASSERTED, and why each half is its own assertion:
//
//   1. the DECLARATION — both cheap tiers are `at-close` and carry one `due`
//      sentence, read from TIERS, never a copy;
//   2. the PRINTED ROW — `render()` used to skip every `at-close` tier because
//      that stood in for "has a block of its own"; the flip alone would have
//      hidden both rows, which is the opposite of telling the agent anything.
//      So the rows are asserted present, with the due sentence under each, and
//      the L2 run and review blocks are asserted to appear exactly once;
//   3. the STATUS LINE — no state of the suite record ends in an order to run
//      it. Whether a record covers these bytes is a fact; when the suite is due
//      is the tier's sentence, one line above.
//
// Pure: the obligation is derived over a docs-only diff (no stamp, no hash),
// and the suite states are built from literal records. Nothing here runs the
// suite or a runtime tier.
import { test } from "node:test";
import assert from "node:assert/strict";

import { TIERS, CHEAP_TIER_DUE, obligation, render } from "../scripts/proof-plan.mjs";
import { describeSuiteStatus } from "../scripts/suite-record.mjs";

const BRANCH = "a-slice-under-test";
const PLAN = {
  schema: "prooflane-proof-plan/1",
  slice: "a slice under test",
  branch: BRANCH,
  openedAt: "2026-09-24T10:00:00.000Z",
  base: "0".repeat(40),
  declared: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.when])),
  discharged: null,
  reviewDischarged: null,
};
const DOCS_ONLY = ["docs/proposals/a-note.md", "README.md"];

test("both cheap tiers are declared at-close and carry ONE due sentence, which says never per fix or per commit", () => {
  for (const name of ["suite", "frameworkCheck"]) {
    assert.equal(TIERS[name].when, "at-close", `${name} is due once, at close`);
    assert.equal(TIERS[name].due, CHEAP_TIER_DUE, `${name} reads the one sentence rather than carrying its own copy`);
  }
  assert.match(CHEAP_TIER_DUE, /^once, over the finished batch, before the PR/);
  assert.match(CHEAP_TIER_DUE, /never per fix or per commit$/);
});

test("the printed plan shows both cheap rows with the due sentence, and still shows the L2 run and review exactly once", () => {
  const o = obligation(PLAN, DOCS_ONLY, BRANCH, { fleetRecord: null });
  const out = render({ ...o, suite: { state: "absent", record: null, now: null } });
  const lines = out.split("\n");

  for (const name of ["suite", "frameworkCheck"]) {
    const at = lines.findIndex((l) => l.startsWith(`  ${name.padEnd(16)} `));
    assert.notEqual(at, -1, `the ${name} row is gone from the plan — a \`when === "at-close"\` skip would do exactly this:\n${out}`);
    assert.equal(lines[at + 1].trim(), `due ${CHEAP_TIER_DUE}`, `the line under the ${name} row says when it is due`);
  }
  assert.equal(/per-commit/.test(out), false, `the plan an agent reads mid-slice still says per-commit:\n${out}`);

  // Skipped by NAME in the cheap-tier loop, rendered by their own blocks — once.
  // The runtime tier's block prints as `L2 run` (its data key is still `device`).
  assert.equal(lines.filter((l) => l.startsWith(`  ${"L2 run".padEnd(16)} `)).length, 1, "the L2 run block appears once");
  assert.equal(lines.filter((l) => l.startsWith(`  ${"review".padEnd(16)} `)).length, 1, "the review block appears once");
});

test("no suite status line orders a run — whether a record covers these bytes is a fact, and WHEN is the due line", () => {
  const rec = (over = {}) => ({ verdict: "PASS", counts: { tests: 3, pass: 3, fail: 0 }, ranAt: "2026-09-24T09:00:00.000Z", node: process.version, scope: "declared", ...over });
  const states = [
    { state: "fresh", record: rec() },
    { state: "stale", record: rec() },
    { state: "moved", record: rec() },
    { state: "other-node", record: rec({ node: "v0.0.0" }) },
    { state: "narrowed", record: rec({ scope: "narrowed", narrowedBy: ["a name pattern"] }) },
    { state: "incomplete", record: rec({ verdict: "INCOMPLETE" }) },
    { state: "absent", record: null },
  ];
  for (const s of states) {
    const line = describeSuiteStatus({ ...s, now: "a".repeat(40) });
    assert.equal(/\brun npm test\b/i.test(line), false, `the ${s.state} line still ends in an order: "${line}"`);
  }
  // The fresh line is the one that SHOULD speak in the imperative, and it tells
  // the reader to run LESS.
  assert.match(describeSuiteStatus({ state: "fresh", record: rec(), now: "a".repeat(40) }), /do not re-run it/);
});
