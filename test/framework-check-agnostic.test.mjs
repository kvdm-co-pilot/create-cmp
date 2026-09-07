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
// Every test here is the one shape that can catch this class: the same logical
// input through two unlike profiles, with the same verdict required
// (test/differential-conformance.test.mjs). A convention-shaped assumption has
// no word to grep for, but it always makes the second ecosystem disagree with
// the first.
import { test } from "node:test";
import assert from "node:assert/strict";

import * as cmp from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import * as alien from "./fixtures/profiles/py-alien/index.mjs";
import { DEFAULT_GRAMMAR, specModelFrom } from "../packages/harness/src/lib/spec-model.mjs";
import { evaluateReceipt } from "../packages/harness/src/lib/receipt-validate.mjs";
import {
  DEFAULT_BOUND_MS,
  FLOOR_KINDS,
  PLANT_KINDS,
  assessPlantRun,
  flowCitation,
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
  for (const line of ["// SPEC: HOME-02", "# SPEC: HOME-02"]) {
    assert.ok(DEFAULT_GRAMMAR.citationMarker.test(line), `the scanner's fallback marker reads ${line}`);
    assert.equal(flowCitation(`${line} — the items render\n`), "HOME-02", `so must the plant selector: ${line}`);
  }
});

test("a journey cites in ITS language's comment — four grammars, one answer", () => {
  const cases = [
    { name: "cmp (declares no grammar — the core's fallback)", grammar: grammarOf(cmp), flow: "# E2E smoke\n\n# SPEC: HOME-02 — the items render\n- launchApp\n" },
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
  for (const g of [DEFAULT_GRAMMAR, grammarOf(alien), grammarOf(TS_JOURNEYS), lua]) {
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
