// qa/lib/framework-check.mjs — the decisions Rule 0's in-tree instrument makes
// before it touches anything: which plants this project can support, which it
// cannot and WHY, whether that is enough to make a claim at all, and how to
// judge each run. Pure data in, pure data out, so these run in microseconds —
// which is the same discipline the module exists to enforce.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BOUND_MS,
  CALIBRATION_BUDGET_MS,
  PLANT_KINDS,
  FLOOR_KINDS,
  firstClauseId,
  flowCitation,
  clauseFamily,
  selectPlants,
  assessCoverage,
  assessPlantRun,
  assessGreenRun,
  assessCalibrationCost,
} from "../packages/harness/src/lib/framework-check.mjs";

const SPEC = `# Home\n\n- **HOME-01** — Given the app opens, Then the shell renders.\n- **HOME-02** — Given loading completes, Then items are listed.\n`;
const FLOW = `# E2E smoke\n\n# SPEC: HOME-02 — the items render\n- launchApp\n`;

const fullTree = () => ({
  specs: [{ rel: "specs/home.spec.md", text: SPEC }],
  flows: [{ rel: "qa/e2e/smoke.yaml", text: FLOW }],
  harnessLib: ["qa/lib/spec-coverage.mjs", "qa/lib/verify.mjs"],
  testDir: "composeApp/src/commonTest/kotlin/com/example",
});

const kinds = (plants) => plants.map((p) => p.kind);
const reasonFor = (unavailable, kind) => unavailable.find((u) => u.kind === kind)?.reason ?? "";

// ── Reading the tree ────────────────────────────────────────────────────────

test("firstClauseId takes the first clause id, and only from a spec list item", () => {
  assert.equal(firstClauseId(SPEC), "HOME-01");
  assert.equal(firstClauseId("- **NOT-A-CLAUSE** because the id needs digits"), null);
  assert.equal(firstClauseId("**HOME-01** — not a list item"), null);
  assert.equal(firstClauseId(undefined), null);
});

test("flowCitation reads a `# SPEC:` tag and ignores a mention mid-line", () => {
  assert.equal(flowCitation(FLOW), "HOME-02");
  // The stamped smoke flow opens with "# E2E smoke — Maestro flow. SPEC: A, B."
  // That is prose ABOUT the flow, not a citation the coverage scan binds to.
  assert.equal(flowCitation("# E2E smoke — Maestro flow. SPEC: SHELL-01, HOME-02.\n"), null);
  assert.equal(flowCitation(""), null);
});

test("clauseFamily takes the prefix, and falls back rather than throwing", () => {
  assert.equal(clauseFamily("HOME-02"), "HOME");
  assert.equal(clauseFamily("PAY2-14"), "PAY2");
  assert.equal(clauseFamily("nonsense"), "SPEC");
  assert.equal(clauseFamily(null), "SPEC");
});

// ── Selecting plants ────────────────────────────────────────────────────────

test("a stamped Compose tree supports every plant", () => {
  const { plants, unavailable } = selectPlants(fullTree());
  assert.deepEqual(unavailable, []);
  assert.deepEqual(kinds(plants).sort(), Object.values(PLANT_KINDS).sort());
});

test("the planted clause ids come from the tree's own family and cannot collide with a live clause", () => {
  const { plants } = selectPlants(fullTree());
  const unbound = plants.find((p) => p.kind === PLANT_KINDS.UNBOUND_CITATION);
  const tier = plants.find((p) => p.kind === PLANT_KINDS.TIER_UNMET);
  assert.deepEqual(unbound.names, ["HOME-99"]);
  assert.deepEqual(tier.names, ["HOME-98"]);
  // And the plant renames a clause that is REAL — planting garbage would only
  // prove the gate rejects garbage, never that it was reading.
  const orphan = plants.find((p) => p.kind === PLANT_KINDS.ORPHANED_CITATION);
  assert.equal(orphan.target.clause, "HOME-01");
  assert.deepEqual(orphan.names, ["HOME-01"]);
});

test("no specs: the three spec plants are unavailable, each saying why", () => {
  const { plants, unavailable } = selectPlants({ ...fullTree(), specs: [] });
  for (const kind of [PLANT_KINDS.ORPHANED_CITATION, PLANT_KINDS.UNBOUND_CITATION, PLANT_KINDS.TIER_UNMET]) {
    assert.ok(!kinds(plants).includes(kind), `${kind} should not be planted`);
    assert.match(reasonFor(unavailable, kind), /no spec files/);
  }
  // The region plants survive — that is the floor, and it is what lets a
  // non-Compose adopter still prove its lane returns.
  assert.ok(kinds(plants).includes(PLANT_KINDS.NARROWED_SURFACE));
  assert.ok(kinds(plants).includes(PLANT_KINDS.EDITED_LANE));
});

test("specs present but clause-free says so, and counts them", () => {
  const { unavailable } = selectPlants({ ...fullTree(), specs: [{ rel: "specs/a.spec.md", text: "# no clauses here\n" }] });
  assert.match(reasonFor(unavailable, PLANT_KINDS.ORPHANED_CITATION), /no clause of the form.*1 spec file/s);
});

test("no Kotlin test directory: the two citation plants stand down, the rename still runs", () => {
  const { plants, unavailable } = selectPlants({ ...fullTree(), testDir: null });
  assert.ok(kinds(plants).includes(PLANT_KINDS.ORPHANED_CITATION));
  assert.match(reasonFor(unavailable, PLANT_KINDS.UNBOUND_CITATION), /nowhere to live/);
  assert.match(reasonFor(unavailable, PLANT_KINDS.TIER_UNMET), /nowhere to live/);
});

test("no flows, or flows that cite nothing: both e2e plants stand down with a reason", () => {
  const none = selectPlants({ ...fullTree(), flows: [] });
  assert.match(reasonFor(none.unavailable, PLANT_KINDS.FEATURE_WITHOUT_FLOW), /no qa\/e2e flows/);
  assert.match(reasonFor(none.unavailable, PLANT_KINDS.NESTED_FLOW), /no qa\/e2e flows/);

  const uncited = selectPlants({ ...fullTree(), flows: [{ rel: "qa/e2e/smoke.yaml", text: "- launchApp\n" }] });
  assert.match(reasonFor(uncited.unavailable, PLANT_KINDS.FEATURE_WITHOUT_FLOW), /nothing to lose/);
});

test("both e2e plants target EVERY citing flow — one line removed from one flow is not the violation", () => {
  const { plants } = selectPlants({
    ...fullTree(),
    flows: [
      { rel: "qa/e2e/smoke.yaml", text: FLOW },
      { rel: "qa/e2e/checkout.yaml", text: "# SPEC: PAY-01\n- launchApp\n" },
      { rel: "qa/e2e/nothing.yaml", text: "- launchApp\n" },
    ],
  });
  for (const kind of [PLANT_KINDS.FEATURE_WITHOUT_FLOW, PLANT_KINDS.NESTED_FLOW]) {
    const plant = plants.find((p) => p.kind === kind);
    assert.deepEqual(plant.target.flows, ["qa/e2e/smoke.yaml", "qa/e2e/checkout.yaml"]);
  }
});

test("the lane plant prefers spec-coverage.mjs but takes any region file rather than standing down", () => {
  const { plants } = selectPlants({ ...fullTree(), harnessLib: ["qa/lib/zzz.mjs"] });
  assert.equal(plants.find((p) => p.kind === PLANT_KINDS.EDITED_LANE).target.file, "qa/lib/zzz.mjs");
});

test("no region files at all: the lane plant stands down and coverage refuses", () => {
  const { plants, unavailable } = selectPlants({ specs: [], flows: [], harnessLib: [], testDir: null });
  assert.match(reasonFor(unavailable, PLANT_KINDS.EDITED_LANE), /no machine-owned lane files/);
  // NARROWED_SURFACE needs nothing, so one floor plant survives — and a partial
  // floor is still a refusal: half a region check is not a region check.
  assert.deepEqual(kinds(plants), [PLANT_KINDS.NARROWED_SURFACE]);
  const verdict = assessCoverage(plants);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, new RegExp(PLANT_KINDS.EDITED_LANE));
});

// ── Refusing to make a vacuous claim ────────────────────────────────────────

test("assessCoverage refuses an empty plant list rather than reporting a green nothing", () => {
  const verdict = assessCoverage([]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /no plant could be made at all/);
  assert.match(verdict.reason, /qa\/lib/);
});

test("assessCoverage accepts exactly the floor", () => {
  assert.deepEqual(assessCoverage(FLOOR_KINDS.map((kind) => ({ kind }))), { ok: true });
});

// ── Judging a run ───────────────────────────────────────────────────────────

const plant = { label: "orphaned citation", step: "specCoverage", names: ["HOME-01"] };
const failReceipt = (reason) => ({ verdict: "FAIL", steps: [{ name: "specCoverage", verdict: "FAIL", reason }] });

test("a planted run that FAILs by name passes", () => {
  assert.deepEqual(assessPlantRun({ receipt: failReceipt("HOME-01 is cited by nothing") }, plant, DEFAULT_BOUND_MS), { ok: true });
});

test("a hang is named as a hang, with the bound that caught it", () => {
  const v = assessPlantRun({ hung: true, ms: 10_000 }, plant, 10_000);
  assert.equal(v.ok, false);
  assert.match(v.reason, /did not return inside 10000ms — the framework HANGS/);
});

test("no receipt is distinguished from a wrong verdict", () => {
  const v = assessPlantRun({ receipt: null, exit: 1, stderr: "boom" }, plant, DEFAULT_BOUND_MS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /returned no receipt \(exit 1\)/);
  assert.match(v.reason, /boom/);
});

test("a guard that stays green on its own planted violation is the finding", () => {
  const v = assessPlantRun({ receipt: { verdict: "PASS", steps: [{ name: "specCoverage", verdict: "PASS" }] } }, plant, DEFAULT_BOUND_MS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /the lane said PASS \(specCoverage: PASS\) — the guard did not FAIL BY NAME/);
});

test("a step that FAILs but names nothing is refused — failing is not the same as failing by name", () => {
  const v = assessPlantRun({ receipt: failReceipt("something went wrong") }, plant, DEFAULT_BOUND_MS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /did not NAME HOME-01/);
});

test("a missing row reads as no row, not as a crash", () => {
  const v = assessPlantRun({ receipt: { verdict: "FAIL", steps: [] } }, plant, DEFAULT_BOUND_MS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /specCoverage: no row/);
});

test("reasonPattern asserts FAIL BY NAME where the name cannot be known in advance", () => {
  const p = { label: "feature without a flow", step: "e2eCoverage", names: [], reasonPattern: String.raw`\[[^\]\s]+\]` };
  const named = { verdict: "FAIL", steps: [{ name: "e2eCoverage", verdict: "FAIL", reason: "1 feature: [home] has no journey" }] };
  const unnamed = { verdict: "FAIL", steps: [{ name: "e2eCoverage", verdict: "FAIL", reason: "coverage is incomplete" }] };
  assert.deepEqual(assessPlantRun({ receipt: named }, p, DEFAULT_BOUND_MS), { ok: true });
  assert.match(assessPlantRun({ receipt: unnamed }, p, DEFAULT_BOUND_MS).reason, /named nothing matching/);
});

test("the baseline must be green, and a red one says fix the tree first", () => {
  const red = { receipt: { verdict: "FAIL", steps: [{ name: "archDoc", verdict: "FAIL", reason: "drifted\nmore detail" }] } };
  const v = assessGreenRun(red, "baseline", DEFAULT_BOUND_MS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /the baseline run is FAIL \(archDoc: drifted\)/);
  assert.match(v.reason, /fix the tree before calibrating/);
  assert.deepEqual(assessGreenRun({ receipt: { verdict: "PASS", steps: [] } }, "baseline", DEFAULT_BOUND_MS), { ok: true });
});

test("a red re-run after the revert points at the revert, not at the tree", () => {
  const v = assessGreenRun({ receipt: { verdict: "FAIL", steps: [] } }, "revert", DEFAULT_BOUND_MS);
  assert.match(v.reason, /the plants were not the only cause, or a revert did not restore the tree/);
});

// ── The cost of the calibration is part of the finding ──────────────────────

test("cycles inside the budget report no note", () => {
  const cost = assessCalibrationCost([
    { label: "baseline", ms: 200 },
    { label: "orphaned citation", ms: 210 },
  ]);
  assert.equal(cost.withinBudget, true);
  assert.equal(cost.note, null);
  assert.equal(cost.totalMs, 410);
  assert.equal(cost.slowest.label, "orphaned citation");
});

test("a cycle past the budget is a finding naming the cycle, the time and the rule", () => {
  // payment-blueprint's measured case: calibrating through a composite Gradle
  // build at 30–60 s per cycle, which violated Rule 1's "seconds each" from the
  // first plant and was noticed three occurrences later.
  const cost = assessCalibrationCost([
    { label: "baseline", ms: 300 },
    { label: "detekt rule", ms: 45_000 },
  ]);
  assert.equal(cost.withinBudget, false);
  assert.match(cost.note, /"detekt rule" took 45000ms against a 5000ms budget/);
  assert.match(cost.note, /four steps, seconds each/);
  assert.match(cost.note, /paid on every plant forever/);
});

test("an empty or malformed cycle list is within budget rather than a crash", () => {
  assert.deepEqual(assessCalibrationCost([]), { withinBudget: true, slowest: null, totalMs: 0, note: null });
  assert.deepEqual(assessCalibrationCost(null), { withinBudget: true, slowest: null, totalMs: 0, note: null });
  assert.equal(assessCalibrationCost([{ label: "x" }, { label: "y", ms: 10 }]).totalMs, 10);
});

test("the budget is smaller than the hang bound — a slow cycle is a finding long before it is a hang", () => {
  assert.ok(CALIBRATION_BUDGET_MS < DEFAULT_BOUND_MS);
});
