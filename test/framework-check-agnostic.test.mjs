// Rule 0's instrument, held to Rule 0 — differentially, in two ecosystems.
//
// packages/harness/src/lib/framework-check.mjs decides which plants a tree can
// support and judges each planted run. Every decision it makes is about
// SOMEBODY ELSE'S stack, so a stack fact learned in here does not refuse — it
// produces a wrong verdict, quietly, on a run that still prints PASS. Two were
// found by execution on 2026-09-06; both had survived review, the agnostic lint
// (test/agnostic-lint.test.mjs, which strips comments and greps for Compose
// paths — neither defect has a word to grep for) and the whole suite.
//
//   A. The flow citation was matched by `/^#\s*SPEC:/` and nothing else. A
//      journey written in any C-family language cites its clause and the
//      selector answers `no "# SPEC:" citation in N flow file(s)` — both
//      e2eCoverage plants silently unavailable, reported as an ⓘ line under a
//      PASS. Worse than wrong: the core's OWN fallback marker
//      (spec-model.mjs `DEFAULT_GRAMMAR.citationMarker`) has accepted `//` all
//      along, so the instrument disagreed with the scanner it plants against,
//      about the same file, in the same tree.
//
//   B. The two floor plants named the receipt row they expect: `step:
//      "harnessIntegrity"`. That is a name the cmp pack chose
//      (lib/profiles/cmp/steps-cmp.mjs:345); REQUIRED_EXPORTS never mentions
//      it and a profile author cannot discover it. A pack spelling its
//      self-check `harness_integrity` has both floor plants look for a row
//      that does not exist, and the instrument reports "the guard did not FAIL
//      BY NAME" about a guard that failed, by name, on the row beside it.
//      lib/receipt-validate.mjs `checkLaneVouching` had the identical defect
//      one layer out and settled the principle on 2026-09-05: the row that
//      vouches is the row CARRYING THE VOUCHING DATA (`step.harness` is an
//      object), not the row with a particular name.
//
//   C. B was fixed on the two plants it was reported against, and the other
//      five kept their literals — `specCoverage` on the three spec plants,
//      `e2eCoverage` on the two flow ones. Same defect, same file, one fix
//      later, which is what a fix applied to instances does. Measured on a
//      `harness init` skeleton whose two steps were renamed to snake_case and
//      nothing else: `planted "orphaned citation" and the lane said FAIL
//      (specCoverage: no row) — the guard did not FAIL BY NAME`, over a
//      `spec_coverage` row that had named the orphan correctly. Worse than B
//      because it ABORTS: the spec plants run first, so the two plants B fixed
//      never executed on that tree at all. Which step catches which plant is
//      now the pack's word (`plants.observedBy`), and a pack that names none
//      gets an assertion over the lane rather than cmp's spelling by default.
//
// Every test here is the one shape that can catch this class: the same logical
// input through two unlike profiles, with the same verdict required
// (test/differential-conformance.test.mjs). A convention-shaped assumption has
// no word to grep for, but it always makes the second ecosystem disagree with
// the first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cmp from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import * as alien from "./fixtures/profiles/py-alien/index.mjs";
import { specModelFrom } from "../packages/harness/src/lib/spec-model.mjs";
import { grammar as cmpGrammar } from "../packages/harness/src/lib/profiles/cmp/declarations.mjs";
import { evaluateReceipt } from "../packages/harness/src/lib/receipt-validate.mjs";
import {
  DEFAULT_BOUND_MS,
  FLOOR_KINDS,
  PLANT_KINDS,
  assessPlantRun,
  flowCitation,
  plantRow,
  selectPlants, assessCoverage } from "../packages/harness/src/lib/framework-check.mjs";

/** A profile's declarations, through the real builder — never a hand-made grammar. */
function grammarOf(profile) {
  const r = specModelFrom(profile, {});
  assert.equal(r.ok, true, r.ok ? "" : `fixture profile is unusable: ${r.reason}`);
  return r.model.grammar;
}

// ── Two ecosystems whose journeys are not YAML ───────────────────────────────
// Neither fixture profile in test/fixtures/profiles/ has flows: ktor-backend
// and py-alien both declare `flows: null`, which is exactly why the flow half
// of this instrument had only ever been answered in one dialect. These two
// declare journeys in a language whose comment is not `#`.

/** Playwright/Detox-shaped: the journey is a TypeScript file and cites with `//`. */
const TS_JOURNEYS = {
  id: "ts-journeys",
  protocol: 1,
  layout: {
    specs: "contracts",
    citationRoots: ["src", "journeys"],
    citationExts: [".ts"],
    sourceRoots: ["src"],
    flows: { dir: "journeys", exts: [".spec.ts"] },
  },
  grammar: {
    citationMarker: /^\/\/\s*SPEC:/,
    lineComment: /^\/\//,
    blockComment: { open: "/*", close: "*/" },
    testDeclaration: /\b(?:test|it)\s*\(/,
    typeDeclaration: /^(?:export\s+)?(?:abstract\s+)?class\b/,
    bindingWindow: 5,
  },
  tiers: {
    names: ["unit", "journey"],
    hostOnly: ["unit"],
    satisfying: { unit: ["unit", "journey"], journey: ["journey"] },
    journey: "journey",
    forFile: (rel) => (rel.startsWith("journeys/") ? "journey" : "unit"),
  },
};

/** A marker in NEITHER core fallback: proof the marker is READ, not widened. */
const LUA_JOURNEYS = {
  ...TS_JOURNEYS,
  id: "lua-journeys",
  layout: { ...TS_JOURNEYS.layout, citationExts: [".lua"], flows: { dir: "journeys", exts: [".lua"] } },
  grammar: { ...TS_JOURNEYS.grammar, citationMarker: /^--\s*SPEC:/, lineComment: /^--/, blockComment: { open: "--[[", close: "]]" } },
};

// ── A. the citation marker is the profile's ─────────────────────────────────

test("the plant selector and the coverage scanner must agree on what a citation is", () => {
  // Not a style question. lib/spec-coverage.mjs `scanCitations` counts a
  // citation when the profile's marker matches the trimmed line, and its
  // fallback — DEFAULT_GRAMMAR.citationMarker — accepts `//` and `#` alike.
  // While the selector accepted only `#`, a `// SPEC:` journey was coverage to
  // the gate and invisible to the instrument that proves the gate reads. The
  // two must be one answer, or the plant that "could not be made" is a plant
  // whose target the lane is happily scanning.
  // Each grammar reads ITS marker, and the selector agrees with the scanner under that grammar.
  for (const [line, g] of [["// SPEC: HOME-02", cmpGrammar], ["# SPEC: HOME-02", grammarOf(alien)]]) {
    assert.ok(g.citationMarker.test(line), `the scanner's marker reads ${line}`);
    assert.equal(flowCitation(`${line} — the items render\n`, g), "HOME-02", `so must the plant selector: ${line}`);
  }
  // And with no grammar at all, nothing is a citation — the lane refuses such a profile first.
  assert.equal(flowCitation("// SPEC: HOME-02\n"), null);
});

test("a journey cites in ITS language's comment — four grammars, one answer", () => {
  const cases = [
    { name: "cmp (declares both dialects: `//` in Kotlin, `#` in Maestro YAML)", grammar: grammarOf(cmp), flow: "# E2E smoke\n\n# SPEC: HOME-02 — the items render\n- launchApp\n" },
    { name: "py-alien (declares its own)", grammar: grammarOf(alien), flow: '"""home journey"""\n\n# SPEC: HOME-02\ndef test_home():\n    pass\n' },
    { name: "ts-journeys (a C-family journey)", grammar: grammarOf(TS_JOURNEYS), flow: 'import { test } from "@playwright/test";\n\n// SPEC: HOME-02 — the items render\ntest("home lists items", async () => {});\n' },
    { name: "lua-journeys (a marker in neither fallback)", grammar: grammarOf(LUA_JOURNEYS), flow: "-- home journey\n\n-- SPEC: HOME-02 — the items render\nfunction test_home() end\n" },
  ];
  for (const c of cases) {
    assert.equal(flowCitation(c.flow, c.grammar), "HOME-02", `${c.name}: the citation this journey carries must be read`);
  }
});

test("a marker the profile does NOT declare is not a citation — this reads the grammar, it does not stop reading", () => {
  // The cheap way to make the test above pass is to accept any line mentioning
  // SPEC. That would make the instrument disagree with the scanner in the other
  // direction: a Lua project's scanCitations never counts `# SPEC:`, so a plant
  // selected off one would strip a line the gate was not reading and the lane
  // would stay green — a plant that proves nothing while reporting that it did.
  const lua = grammarOf(LUA_JOURNEYS);
  assert.equal(flowCitation("# SPEC: HOME-02\n", lua), null);
  assert.equal(flowCitation("// SPEC: HOME-02\n", lua), null);
  // And prose ABOUT a flow is not a citation in any grammar — the marker opens
  // the line or it is not a marker. (The stamped smoke flow's own header reads
  // "# E2E smoke — Maestro flow. SPEC: SHELL-01, HOME-02.")
  for (const g of [cmpGrammar, grammarOf(alien), grammarOf(TS_JOURNEYS), lua]) {
    assert.equal(flowCitation("# E2E smoke — Maestro flow. SPEC: SHELL-01, HOME-02.\n", g), null);
    assert.equal(flowCitation("", g), null);
    assert.equal(flowCitation(undefined, g), null);
  }
});

const SPEC = "# Home\n\n- **HOME-01** — Given the app opens, Then the shell renders.\n- **HOME-02** — Given loading completes, Then items are listed.\n";

/** The same tree — a spec, one citing journey, a lane, a test dir — in each ecosystem's dialect. */
const DIALECTS = [
  {
    name: "cmp (Maestro YAML journeys)",
    profile: cmp,
    flowsDir: "qa/e2e",
    flowRel: "qa/e2e/smoke.yaml",
    flow: "# E2E smoke\n\n# SPEC: HOME-02 — the items render\n- launchApp\n",
    testDir: "composeApp/src/commonTest/kotlin/com/example",
    unmeetableTier: "e2e",
    // THE PROFILE'S OWN DECLARATION, imported rather than retyped. A hand-made
    // copy here would keep passing on the day the profile stopped declaring
    // it, which is the failure this whole file is about.
    observedBy: cmp.plants.observedBy,
  },
  {
    name: "ts-journeys (TypeScript journeys)",
    profile: TS_JOURNEYS,
    flowsDir: "journeys",
    flowRel: "journeys/home.spec.ts",
    flow: 'import { test } from "@playwright/test";\n\n// SPEC: HOME-02 — the items render\ntest("home lists items", async () => {});\n',
    testDir: "src/__tests__",
    unmeetableTier: "journey",
  },
];

const treeFor = (d) => ({
  specs: [{ rel: "specs/home.spec.md", text: SPEC }],
  flows: [{ rel: d.flowRel, text: d.flow }],
  flowsDir: d.flowsDir,
  harnessLib: ["qa/lib/spec-coverage.mjs", "qa/lib/verify.mjs"],
  testDir: d.testDir,
  unmeetableTier: d.unmeetableTier,
  observedBy: d.observedBy ?? null,
  grammar: grammarOf(d.profile),
});

test("the same journey in two dialects supports the same plants", () => {
  const selected = DIALECTS.map((d) => ({ d, ...selectPlants(treeFor(d)) }));
  for (const s of selected) {
    assert.deepEqual(
      s.unavailable,
      [],
      `${s.d.name}: a plant reported unavailable on a tree that has everything — ${s.unavailable.map((u) => `${u.kind}: ${u.reason}`).join("; ")}`,
    );
    // The two the marker decides. Without them, e2eCoverage is a gate this
    // instrument has never read, on a project that has journeys.
    const kinds = s.plants.map((p) => p.kind);
    assert.ok(kinds.includes(PLANT_KINDS.FEATURE_WITHOUT_FLOW), `${s.d.name}: no feature-without-flow plant`);
    assert.ok(kinds.includes(PLANT_KINDS.NESTED_FLOW), `${s.d.name}: no nested-flow plant`);
  }
  assert.deepEqual(
    selected[1].plants.map((p) => p.kind).sort(),
    selected[0].plants.map((p) => p.kind).sort(),
    "the two ecosystems disagree about what can be planted, which means the core learned a stack fact",
  );
  // The nested-flow plant hides the journey inside the flows directory the
  // PROFILE declares, never a constant.
  const nested = selected[1].plants.find((p) => p.kind === PLANT_KINDS.NESTED_FLOW);
  assert.equal(nested.target.nestInto, "journeys/wip");
});

// ── B. the row that vouches is the row carrying the vouching data ───────────

const floorPlants = () => selectPlants(treeFor(DIALECTS[0])).plants.filter((p) => FLOOR_KINDS.includes(p.kind));

/** A FAIL the floor plants must recognise, with the pack's own step spelling. */
const integrityFailReceipt = (stepName) => ({
  verdict: "FAIL",
  steps: [
    { name: "spec_coverage", verdict: "PASS", durationMs: 3 },
    {
      name: stepName,
      verdict: "FAIL",
      durationMs: 9,
      // The findings object cmp's stepHarnessIntegrity attaches to every row it
      // writes (lib/profiles/cmp/steps-cmp.mjs:345) — and the only part of this
      // row the schema documents as the integrity check's own output.
      harness: { status: "modified", modified: ["qa/lib/spec-coverage.mjs"], missing: [] },
      reason: "modified  qa/lib/spec-coverage.mjs\nmodified  qa/verified-surface.json\nRestore them or re-lock.",
    },
  ],
});

test("the floor plants read the row that VOUCHES, whatever the pack spells it", () => {
  // cmp says harnessIntegrity; py-alien's steps() says harness_integrity
  // (test/fixtures/profiles/py-alien/index.mjs); the third is a pack that
  // chose a word neither of them would guess. All three carry `harness`, so
  // all three are the same row and must produce the same verdict.
  for (const plant of floorPlants()) {
    for (const stepName of ["harnessIntegrity", "harness_integrity", "attestsItsOwnLane"]) {
      assert.deepEqual(
        assessPlantRun({ receipt: integrityFailReceipt(stepName) }, plant, DEFAULT_BOUND_MS),
        { ok: true },
        `${plant.kind} did not recognise the vouching row when the pack called it "${stepName}"`,
      );
    }
  }
});

test("the floor plants still BITE — a row that stayed green, or no vouching row at all, is refused", () => {
  for (const plant of floorPlants()) {
    // The plant was made and the guard did not fire. This is the finding the
    // whole instrument exists to produce; loosening the row lookup must not
    // cost it.
    const green = { verdict: "PASS", steps: [{ name: "harness_integrity", verdict: "PASS", harness: { status: "intact" } }] };
    const stillGreen = assessPlantRun({ receipt: green }, plant, DEFAULT_BOUND_MS);
    assert.equal(stillGreen.ok, false, `${plant.kind}: a guard that stayed green must be refused`);
    assert.match(stillGreen.reason, /did not FAIL BY NAME/);
    assert.match(stillGreen.reason, /harness_integrity: PASS/, "and it names the row it actually read");

    // It failed, and named nothing this plant is about.
    const silent = {
      verdict: "FAIL",
      steps: [{ name: "harness_integrity", verdict: "FAIL", harness: { status: "modified" }, reason: "something went wrong" }],
    };
    assert.equal(assessPlantRun({ receipt: silent }, plant, DEFAULT_BOUND_MS).ok, false, `${plant.kind}: FAIL is not FAIL BY NAME`);

    // A receipt with no self-vouching row at all is not a pass by default: the
    // message has to say what it looked for, because "no row" over a receipt
    // that never carried one is a lane defect, not a plant defect.
    const nothing = { verdict: "FAIL", steps: [{ name: "spec_coverage", verdict: "FAIL", reason: "HOME-01" }] };
    const v = assessPlantRun({ receipt: nothing }, plant, DEFAULT_BOUND_MS);
    assert.equal(v.ok, false);
    assert.match(v.reason, /harness/, `${plant.kind}: the refusal must name what it looked for`);
  }
});

test("a plant that names a step is still matched BY NAME — the vouching lookup is not global", () => {
  // The floor plants are the two whose row is identified by its data. Every
  // other plant asserts a specific gate: specCoverage FAILing must not be
  // satisfied by the integrity row FAILing beside it, or a broken lock would
  // read as a working spec gate.
  const spec = selectPlants(treeFor(DIALECTS[0])).plants.find((p) => p.kind === PLANT_KINDS.ORPHANED_CITATION);
  const receipt = {
    verdict: "FAIL",
    steps: [
      { name: "harnessIntegrity", verdict: "FAIL", harness: { status: "modified" }, reason: "modified  qa/lib/spec-coverage.mjs — HOME-01" },
      { name: "specCoverage", verdict: "PASS", durationMs: 4 },
    ],
  };
  const v = assessPlantRun({ receipt }, spec, DEFAULT_BOUND_MS);
  assert.equal(v.ok, false, "the spec plant must be judged on the specCoverage row, not on whichever row failed");
  assert.match(v.reason, /specCoverage: PASS/);
});

test("the Stop-hook pattern matches the refusal in both dialects", () => {
  // The floor plants also assert that the hook refuses the FORGED receipt — the
  // top-level verdict edited to PASS over rows that say the lane cannot vouch
  // for itself — FOR THE RIGHT REASON, via `hookPattern` matched against the
  // hook's stderr (packages/harness/src/framework-check.mjs). The pattern named
  // `harnessIntegrity`, so on a pack that spells its row differently the hook
  // refused correctly and the instrument called that a framework defect: an
  // adopter's Rule 0 check fails on a working lane, with a message about the
  // hook rather than about the name.
  const forged = (stepName) => ({
    schema: "cmp-evidence/1",
    pack: { id: "cmp", version: null },
    profile: "local",
    stage: "change",
    verdict: "PASS",
    inputs: { hash: "deadbeef" },
    steps: [
      { name: "spec_coverage", verdict: "PASS", durationMs: 3 },
      { name: stepName, verdict: "FAIL", durationMs: 9, harness: { status: "modified" }, reason: "modified  qa/lib/spec-coverage.mjs" },
    ],
  });
  for (const plant of floorPlants()) {
    for (const stepName of ["harnessIntegrity", "harness_integrity"]) {
      // The real validator behind the hook (qa/receipt-check.mjs --hook prints
      // this reason verbatim), with the recomputed hash agreeing so the refusal
      // can only come from the vouching check.
      const r = evaluateReceipt(forged(stepName), () => ({ hash: "deadbeef" }));
      assert.equal(r.valid, false, `${stepName}: the forged receipt must be refused`);
      assert.match(
        r.reason,
        new RegExp(plant.hookPattern, "i"),
        `${plant.kind}: the hook refused "${stepName}" correctly and hookPattern did not recognise the refusal:\n${r.reason}`,
      );
    }
  }
});

test("the instrument refuses a tree it cannot calibrate — same rule, both ecosystems", () => {
  // assessCoverage is the floor: the two REGION plants need nothing but a lane,
  // so if neither can be made there is no harness here to check and the
  // instrument must say so rather than report a vacuous PASS over nothing.
  // Stack-independent by construction — but "by construction" is the claim that
  // has been wrong five times, so it is executed against both.
  const floor = [{ kind: "narrowed-surface" }, { kind: "edited-lane" }];

  for (const [label, extra] of [
    ["cmp (Kotlin)", { kind: "orphaned-citation" }],
    ["py-alien (Python)", { kind: "unbound-citation" }],
  ]) {
    assert.equal(assessCoverage([...floor, extra]).ok, true, `${label}: a tree with both region plants is calibratable`);
    const noFloor = assessCoverage([extra]);
    assert.equal(noFloor.ok, false, `${label}: no region plant means no lane to check`);
    assert.match(noFloor.reason, /no machine-owned lane|no plant could be made/, `${label}: and it names the real cause`);
    // Exactly one of the two floor plants is not enough, and the refusal must
    // name WHICH is missing rather than blaming the tree in general.
    const half = assessCoverage([floor[0], extra]);
    assert.equal(half.ok, false, `${label}: the region plants are the floor, both of them`);
    assert.match(half.reason, /edited-lane/, `${label}: the missing one is named`);
  }
});

// ── C. which step catches a plant is the PACK's word, and absence is honest ──
//
// The five plants B did not reach. Everything below is the same shape as B: the
// same logical plant judged against the same logical receipt in two spellings,
// with the same verdict required. The two new properties are that a pack which
// says nothing is not handed cmp's spelling, and that saying nothing still
// leaves a gate that bites.

/** The three spec plants and the two flow plants — every plant that is not a floor plant. */
const GATE_PLANTS = Object.freeze([
  PLANT_KINDS.ORPHANED_CITATION,
  PLANT_KINDS.UNBOUND_CITATION,
  PLANT_KINDS.TIER_UNMET,
  PLANT_KINDS.FEATURE_WITHOUT_FLOW,
  PLANT_KINDS.NESTED_FLOW,
]);

/** The cmp tree, with whatever `observedBy` the case is about. */
const treeObserving = (observedBy) => ({ ...treeFor(DIALECTS[0]), observedBy });

const plantOfKind = (tree, kind) => selectPlants(tree).plants.find((p) => p.kind === kind);

test("the core carries NO pack's step name — a tree that declares none produces plants that name none", () => {
  // The structural half of the fix, and the one that makes a regression loud.
  // Reintroducing `step: "specCoverage"` anywhere in the selector fails here
  // without needing a receipt, a profile or a lane, because the literal itself
  // is the defect: it is asserted against every profile there will ever be.
  const plants = selectPlants(treeObserving(null)).plants;
  const named = plants.filter((p) => !FLOOR_KINDS.includes(p.kind) && p.step !== null);
  assert.deepEqual(
    named.map((p) => `${p.kind}: ${p.step}`),
    [],
    "a plant carries a step name no profile declared — that name belongs to one pack and is being asserted against all of them",
  );
  // And the floor plants are untouched: their row is found by the data it
  // carries, so `step` there is a documented fallback, not a requirement.
  assert.equal(plants.filter((p) => FLOOR_KINDS.includes(p.kind)).every((p) => p.vouching === true), true);
});

test("cmp's spellings reach its plants through its OWN declaration, and cmp does not move", () => {
  // The regression guard for the reference product (G5). These are the exact
  // strings the engine's framework-check prints, and they must still come out
  // — from lib/profiles/cmp/plants.mjs, where they are true, rather than from
  // the core, where they were a claim about everyone.
  assert.ok(cmp.plants.observedBy, "the cmp profile must declare which of its steps observes each plant kind");
  const byKind = Object.fromEntries(selectPlants(treeObserving(cmp.plants.observedBy)).plants.map((p) => [p.kind, p.step]));
  assert.deepEqual(
    {
      [PLANT_KINDS.ORPHANED_CITATION]: byKind[PLANT_KINDS.ORPHANED_CITATION],
      [PLANT_KINDS.UNBOUND_CITATION]: byKind[PLANT_KINDS.UNBOUND_CITATION],
      [PLANT_KINDS.TIER_UNMET]: byKind[PLANT_KINDS.TIER_UNMET],
      [PLANT_KINDS.FEATURE_WITHOUT_FLOW]: byKind[PLANT_KINDS.FEATURE_WITHOUT_FLOW],
      [PLANT_KINDS.NESTED_FLOW]: byKind[PLANT_KINDS.NESTED_FLOW],
    },
    {
      [PLANT_KINDS.ORPHANED_CITATION]: "specCoverage",
      [PLANT_KINDS.UNBOUND_CITATION]: "specCoverage",
      [PLANT_KINDS.TIER_UNMET]: "specCoverage",
      [PLANT_KINDS.FEATURE_WITHOUT_FLOW]: "e2eCoverage",
      [PLANT_KINDS.NESTED_FLOW]: "e2eCoverage",
    },
  );
  // Every gate plant is covered by the declaration. A kind cmp forgot would
  // quietly fall to the lane-wide assertion, which is honest but blunter than
  // the reference product should ever settle for.
  for (const kind of GATE_PLANTS) assert.ok(cmp.plants.observedBy[kind], `cmp declares no step for ${kind}`);
});

test("the same plant, two spellings, one verdict — the pack's name is read, not assumed", () => {
  // B's test for the floor plants, applied to the five it did not cover. Same
  // logical receipt, same clause, same violation; only the row's NAME differs,
  // and the instrument must reach the same answer in both ecosystems.
  const orphanFail = (stepName) => ({
    verdict: "FAIL",
    steps: [
      { name: stepName === "specCoverage" ? "harnessIntegrity" : "harness_integrity", verdict: "PASS", harness: { status: "intact" } },
      { name: stepName, verdict: "FAIL", reason: "HOME-01 is declared but never cited from a test (specs/home.spec.md)" },
    ],
  });
  for (const stepName of ["specCoverage", "spec_coverage", "checkPromises"]) {
    const plant = plantOfKind(treeObserving({ [PLANT_KINDS.ORPHANED_CITATION]: stepName }), PLANT_KINDS.ORPHANED_CITATION);
    assert.equal(plant.step, stepName);
    assert.deepEqual(
      assessPlantRun({ receipt: orphanFail(stepName) }, plant, DEFAULT_BOUND_MS),
      { ok: true },
      `the orphaned-citation plant did not recognise the coverage row when the pack called it "${stepName}"`,
    );
    // And the sharpness a declaration buys is intact: the row it NAMED is the
    // row judged. A broken lock quoting the planted clause id beside a green
    // coverage gate is the exact mix-up this instrument exists to catch.
    const wrongRow = {
      verdict: "FAIL",
      steps: [
        { name: "harness_integrity", verdict: "FAIL", harness: { status: "modified" }, reason: "modified  qa/lib/spec-coverage.mjs — HOME-01" },
        { name: stepName, verdict: "PASS", durationMs: 4 },
      ],
    };
    const v = assessPlantRun({ receipt: wrongRow }, plant, DEFAULT_BOUND_MS);
    assert.equal(v.ok, false, `${stepName}: a green coverage gate beside a red lock must still be the finding`);
    assert.match(v.reason, new RegExp(`${stepName}: PASS`));
  }
});

test("a pack that declares NOTHING still has its gate calibrated — over the lane, and it says which row it read", () => {
  // The default, and the whole reason there is no `?? "specCoverage"`. A pack
  // that never heard of `observedBy` gets an assertion it can pass honestly:
  // some row went red naming what was planted. Weaker than a named row on
  // purpose — that is what a pack gets for not saying — and infinitely
  // stronger than looking for a row that cannot exist.
  const plant = plantOfKind(treeObserving(null), PLANT_KINDS.ORPHANED_CITATION);
  assert.equal(plant.step, null);
  const receipt = {
    verdict: "FAIL",
    steps: [
      { name: "harness_integrity", verdict: "PASS", harness: { status: "intact" } },
      { name: "spec_coverage", verdict: "FAIL", reason: "HOME-01 is declared but never cited from a test (specs/home.spec.md)" },
    ],
  };
  assert.deepEqual(assessPlantRun({ receipt }, plant, DEFAULT_BOUND_MS), { ok: true });
  assert.equal(plantRow(receipt.steps, plant)?.name, "spec_coverage", "the runner prints the row that actually went red, never `undefined`");
});

test("THE KEPT PLANT for the lane-wide branch: it refuses a green lane, and a red one that named nothing", () => {
  // GATE-RULES Rule 1 — the widened lookup is a new refusal, so it is not wired
  // until a plant makes it fail BY NAME. Both directions, because the failure
  // mode of a widened assertion is that it stops refusing anything.
  const plant = plantOfKind(treeObserving(null), PLANT_KINDS.ORPHANED_CITATION);

  const green = { verdict: "PASS", steps: [{ name: "spec_coverage", verdict: "PASS", durationMs: 4 }] };
  const stillGreen = assessPlantRun({ receipt: green }, plant, DEFAULT_BOUND_MS);
  assert.equal(stillGreen.ok, false, "a guard that stayed green on its own planted violation is the finding");
  assert.match(stillGreen.reason, /did not FAIL BY NAME/);
  assert.match(stillGreen.reason, /orphaned-citation/, "the refusal names which plant it is about");
  assert.match(stillGreen.reason, /plants\.observedBy/, "and names the declaration that would make the assertion sharp");

  const silent = { verdict: "FAIL", steps: [{ name: "spec_coverage", verdict: "FAIL", reason: "coverage is incomplete" }] };
  const notByName = assessPlantRun({ receipt: silent }, plant, DEFAULT_BOUND_MS);
  assert.equal(notByName.ok, false, "FAIL is not FAIL BY NAME, declared step or not");
  assert.match(notByName.reason, /did not NAME HOME-01/);
  assert.match(notByName.reason, /^spec_coverage FAILed/, "reported against the row the lane actually reddened");
  assert.match(notByName.reason, /coverage is incomplete/, "quoting what that row said, so the reader is not sent hunting");
});

test("the flow plants are the pack's word too — the fix is the CLASS, not the three it was reported on", () => {
  // `e2eCoverage` is cmp's name for the journey gate and was a literal in the
  // selector exactly as `specCoverage` was. A pack whose journeys are
  // TypeScript and whose gate is called `journeys` must be judged on ITS row.
  const ts = { ...treeFor(DIALECTS[1]), observedBy: { [PLANT_KINDS.FEATURE_WITHOUT_FLOW]: "journeys" } };
  const plant = plantOfKind(ts, PLANT_KINDS.FEATURE_WITHOUT_FLOW);
  assert.equal(plant.step, "journeys");
  const receipt = { verdict: "FAIL", steps: [{ name: "journeys", verdict: "FAIL", reason: "1 feature: [checkout] has no journey" }] };
  assert.deepEqual(assessPlantRun({ receipt }, plant, DEFAULT_BOUND_MS), { ok: true });
  // Undeclared, the same receipt still bites — and a lane that named no feature
  // at all is still refused, so widening did not cost the pattern assertion.
  const bare = plantOfKind({ ...treeFor(DIALECTS[1]), observedBy: null }, PLANT_KINDS.FEATURE_WITHOUT_FLOW);
  assert.equal(bare.step, null);
  assert.deepEqual(assessPlantRun({ receipt }, bare, DEFAULT_BOUND_MS), { ok: true });
  const vague = { verdict: "FAIL", steps: [{ name: "journeys", verdict: "FAIL", reason: "coverage is incomplete" }] };
  assert.match(assessPlantRun({ receipt: vague }, bare, DEFAULT_BOUND_MS).reason, /named nothing matching/);
});

// ── D. the same claim, RUN — because reading is what missed it twice ────────
//
// Everything above judges a hand-built receipt. That is how B was fixed, and B
// came back the very next section down (C), because a unit test over a plant
// object cannot notice that the OTHER plants still carry a literal. NORTH-STAR
// §9.1's lesson is the whole reason this block exists: "a stack assumption that
// names no stack cannot be found by reading, only by running", and all eight
// wrong verdicts it lists were found by executing in an ecosystem the code had
// never met. So one runs — the real CLI, a real foreign repo, the real
// instrument, the real lane — and it is the cheapest of the eight to keep,
// because `harness init` builds the ecosystem for us.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO_ROOT, "bin", "create-cmp.mjs");

const git = (cwd, args) => spawnSync("git", args, { cwd, encoding: "utf8" });
const node = (cwd, args) => spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });

test("THE KEPT PLANT, RUN: a pack whose steps are snake_case has its gates calibrated, not accused", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "snake-steps-"));
  const dir = path.join(base, "cartsvc");
  try {
    // A Python service: no Compose, no Gradle, no YAML journeys, and a clause
    // that is genuinely cited from a genuinely running test.
    fs.mkdirSync(path.join(dir, "app"), { recursive: true });
    fs.mkdirSync(path.join(dir, "t"), { recursive: true });
    fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "app", "cart.py"), "class Cart:\n    def __init__(self, items=None):\n        self.items = items or []\n\n    def total(self):\n        return sum(self.items)\n");
    fs.writeFileSync(path.join(dir, "t", "test_cart.py"), "from app.cart import Cart\n\n\n# SPEC: CART-01\ndef test_total():\n    assert Cart([1, 2]).total() == 3\n");
    fs.writeFileSync(path.join(dir, "specs", "cart.spec.md"), "# Cart\n\n- **CART-01** — Given items, Then the cart totals its line items.\n");
    git(dir, ["init", "-q", "."]);
    git(dir, ["add", "-A"]);
    git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);

    const init = node(dir, [CLI, "harness", "init", "--profile", "snake-steps", "--target-dir", dir]);
    assert.equal(init.status, 0, `harness init failed:\n${init.stdout}${init.stderr}`);

    // THE ONE EDIT. The skeleton `harness init` writes spells its two steps
    // `harnessIntegrity` and `specCoverage`, because it was written by the same
    // people who wrote cmp. Renaming them is the whole experiment: nothing else
    // about this project changes, the lane stays green, and every gate still
    // fails by name — so anything that breaks here broke on a SPELLING.
    const profileRel = path.join("qa", "lib", "profiles", "snake-steps", "index.mjs");
    const profileAbs = path.join(dir, profileRel);
    const renamed = fs.readFileSync(profileAbs, "utf8").replace(/specCoverage/g, "spec_coverage").replace(/harnessIntegrity/g, "harness_integrity");
    assert.match(renamed, /name: "spec_coverage"/, "the rename must actually reach the step row's name");
    fs.writeFileSync(profileAbs, renamed);

    // The profile is inside the lock region (NORTH-STAR §6 #6), so an edited
    // profile cannot certify itself until the lock is re-taken over the files
    // this project owns. Without this the baseline is red and the run says so.
    const relock = node(dir, [CLI, "harness", "relock", "--target-dir", dir]);
    assert.equal(relock.status, 0, `harness relock failed:\n${relock.stdout}${relock.stderr}`);
    git(dir, ["add", "-A"]);
    git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "snake_case steps"]);

    const before = git(dir, ["status", "--porcelain"]).stdout;
    const rule0 = node(dir, [path.join(dir, "qa", "framework-check.mjs")]);

    // Before the fix this exits 1 with: planted "orphaned citation" and the
    // lane said FAIL (specCoverage: no row) — the guard did not FAIL BY NAME.
    // The lane had FAILed; `spec_coverage` had named the orphan; the only thing
    // wrong was that the core was looking for another pack's word. And because
    // the spec plants run first, the two floor plants below never ran at all.
    assert.equal(rule0.status, 0, `Rule 0 must PASS on a pack that spells its steps differently:\n${rule0.stdout}${rule0.stderr}`);
    assert.match(rule0.stdout, /framework check: PASS/);
    assert.match(rule0.stdout, /spec_coverage FAIL naming CART-01/, "the coverage gate must be read on THIS pack's row, by name");
    assert.match(rule0.stdout, /harness_integrity FAIL naming qa\/verified-surface\.json/, "and the floor plants must reach the point of running");
    assert.match(rule0.stdout, /harness_integrity FAIL naming modified/);
    assert.doesNotMatch(rule0.stdout, /specCoverage|harnessIntegrity/, "no cmp spelling may appear in a run that has nothing to do with cmp");

    // And the sharper assertion is DISCOVERABLE from a green run. `observedBy`
    // is as undiscoverable today as `harnessIntegrity` was, and a declaration
    // that only ever surfaces in a refusal repeats §9.1 one level quieter, so
    // the instrument names it while everything is still green.
    assert.match(
      rule0.stdout,
      /orphaned-citation\s+asserted over the whole lane .* `plants\.observedBy` names no step/,
      "a plant asserting over the lane must SAY so, and name the declaration that narrows it",
    );

    // Rule 0's restore contract, on a tree the instrument has never seen.
    assert.equal(git(dir, ["status", "--porcelain"]).stdout, before, "framework-check must leave the tree as it found it");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("an ERRORed step is not a gate firing — the lane-wide lookup prefers the row that actually refused", () => {
  // Found by attacking the widened lookup rather than by a run: the first draft
  // took FAIL and ERROR rows alike, in receipt order, so a step that blew up
  // BEFORE the coverage gate would be judged instead of it — and an ERROR is
  // never `FAIL`, so the instrument would have reported "the guard did not FAIL
  // BY NAME" about a gate that had just failed by name two rows down. The same
  // wrong sentence as C, arriving through the fix for C.
  const plant = plantOfKind(treeObserving(null), PLANT_KINDS.ORPHANED_CITATION);
  const receipt = {
    verdict: "FAIL",
    steps: [
      { name: "py_build", verdict: "ERROR", reason: "the toolchain is missing — HOME-01 never got as far as being checked" },
      { name: "spec_coverage", verdict: "FAIL", reason: "HOME-01 is declared but never cited from a test" },
    ],
  };
  assert.equal(plantRow(receipt.steps, plant)?.name, "spec_coverage");
  assert.deepEqual(assessPlantRun({ receipt }, plant, DEFAULT_BOUND_MS), { ok: true });

  // And an ERROR alone is still refused, with the row's own words, because a
  // step that fell over has proven nothing about whether the gate reads.
  const errored = { verdict: "FAIL", steps: [{ name: "py_build", verdict: "ERROR", reason: "the toolchain is missing" }] };
  const v = assessPlantRun({ receipt: errored }, plant, DEFAULT_BOUND_MS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /py_build: ERROR/);
  assert.match(v.reason, /did not FAIL BY NAME/);
});
