// e2e-coverage.mjs — every real feature (a screen + a spec) has a device
// journey: one live clause cited from a flow the lane runs. PLANTED both ways.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateE2eCoverage } from "../packages/harness/src/lib/e2e-coverage.mjs";

const PKG = "composeApp/src/commonMain/kotlin/com/acme/demo";
function project({ flows = {}, briefs = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-e2ecov-"));
  const w = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  // Two real features (screen + spec), one placeholder (screen, no spec), one unrouted.
  w(`${PKG}/presentation/home/HomeScreen.kt`, "package com.acme.demo.presentation.home\n@Composable\nfun HomeScreen() {}\n");
  w(`${PKG}/presentation/meal/MealScreen.kt`, "package com.acme.demo.presentation.meal\n@Composable\nfun MealScreen() {}\n");
  w(`${PKG}/presentation/profile/ProfileScreen.kt`, "package com.acme.demo.presentation.profile\n@Composable\nfun ProfileScreen() {}\n");
  w(`${PKG}/presentation/lab/LabScreen.kt`, "package com.acme.demo.presentation.lab\n@Composable\nfun LabScreen() {}\n");
  w(`${PKG}/presentation/navigation/AppNavHost.kt`, "package com.acme.demo.presentation.navigation\nfun nav() { HomeScreen(); MealScreen(); ProfileScreen() }\n");
  w("specs/home.spec.md", "# home\n\n- **HOME-01** — Given x, Then y.\n- **HOME-02** — Given a, Then b.\n");
  w("specs/meal.spec.md", "# meal\n\n- **MEAL-01** — Given m, Then n.\n- ~~**MEAL-02** — old.~~\n");
  w("specs/lab.spec.md", "# lab\n\n- **LAB-01** — Given l, Then l.\n");
  w("docs/features/lab.md", "# lab\n\n```json cmp:feature\n{ \"screens\": true, \"unrouted\": true }\n```\n");
  w("composeApp/src/commonTest/kotlin/com/acme/demo/MealTest.kt", "class MealTest {\n  // SPEC: MEAL-01\n  @Test fun t() {}\n}\n");
  fs.mkdirSync(path.join(root, "qa", "e2e"), { recursive: true });
  for (const [name, text] of Object.entries(flows)) w(`qa/e2e/${name}`, text);
  return root;
}

test("PASS when every real feature has a flow citing one of its live clauses; placeholder and unrouted screens are reported, never failed", () => {
  const root = project({
    flows: {
      "smoke.yaml": "appId: x\n---\n# SPEC: HOME-02\n- launchApp\n",
      "meal.yaml": "appId: x\n---\n# SPEC: MEAL-01\n- launchApp\n",
    },
  });
  try {
    const r = evaluateE2eCoverage(root);
    assert.equal(r.verdict, "PASS", r.reason);
    const byName = Object.fromEntries(r.details.features.map((f) => [f.name, f]));
    assert.deepEqual(byName.home.e2eCited, ["HOME-02"]);
    assert.equal(byName.home.status, "covered");
    assert.equal(byName.meal.liveClauses, 1, "withdrawn clauses do not count");
    assert.equal(byName.profile.status, "unspecified", "a screen without a spec is not yet real — reported, not failed");
    assert.equal(byName.lab.status, "unrouted");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PLANTED: a real feature whose clauses are proven only on the JVM FAILs by name, naming the flow file to write", () => {
  const root = project({ flows: { "smoke.yaml": "appId: x\n---\n# SPEC: HOME-02\n- launchApp\n" } });
  try {
    const r = evaluateE2eCoverage(root);
    assert.equal(r.verdict, "FAIL");
    assert.match(r.reason, /1 feature has a screen and a spec but no device journey/);
    assert.match(r.reason, /\[meal\] specs\/meal\.spec\.md has 1 live clause — write the journey in qa\/e2e\/meal\.yaml/);
    assert.doesNotMatch(r.reason, /\[home\]/);
    assert.doesNotMatch(r.reason, /\[profile\]/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a citation only counts from a flow the lane RUNS: a nested flow, or a skeleton citing nothing, leaves the feature uncovered; a spec with no live clauses is named as such", () => {
  const root = project({
    flows: {
      "smoke.yaml": "appId: x\n---\n# SPEC: HOME-02\n- launchApp\n",
      "meal.yaml": "appId: x\n---\n# TODO(meal): cite MEAL-01\n- launchApp\n",
      "wip/meal2.yaml": "appId: x\n---\n# SPEC: MEAL-01\n- launchApp\n",
    },
  });
  try {
    const r = evaluateE2eCoverage(root);
    assert.equal(r.verdict, "FAIL");
    assert.match(r.reason, /\[meal\]/);
    fs.writeFileSync(path.join(root, "specs", "meal.spec.md"), "# meal\n\n- ~~**MEAL-01** — gone.~~\n");
    const empty = evaluateE2eCoverage(root);
    assert.match(empty.reason, /\[meal\] specs\/meal\.spec\.md has no live clauses — promise the behaviour there first/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("no qa/e2e harness → SKIP (structure), never a verdict about journeys that cannot exist", () => {
  const root = project();
  try {
    fs.rmSync(path.join(root, "qa", "e2e"), { recursive: true, force: true });
    const r = evaluateE2eCoverage(root);
    assert.equal(r.verdict, "SKIP");
    assert.match(r.reason, /no qa\/e2e\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── Brief doneness: a UI feature is proven on a device ──────────────────────
import { deriveFeatureStatus } from "../packages/harness/src/lib/feature-brief.mjs";

test("a screens:true brief whose clauses are all cited from the JVM is NOT done, and says why; one flow citation makes it done; an unrouted screen needs none", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-brief-e2e-"));
  const w = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  try {
    w("docs/features/meal.md", "# meal\n\n```json cmp:feature\n{ \"screens\": true }\n```\n");
    w("specs/meal.spec.md", "# meal\n\n- **MEAL-01** — Given m, Then n.\n");
    w("composeApp/src/commonTest/kotlin/com/acme/demo/MealTest.kt", "class MealTest {\n  // SPEC: MEAL-01\n  @Test fun t() {}\n}\n");
    fs.mkdirSync(path.join(root, "qa", "e2e"), { recursive: true });
    const receipt = { verdict: "PASS", attestsTree: true };
    const brief = { name: "meal", rel: "docs/features/meal.md" };

    const jvmOnly = deriveFeatureStatus(root, brief, { receipt });
    assert.equal(jvmOnly.covered, 1);
    assert.equal(jvmOnly.e2eCovered, 0);
    assert.equal(jvmOnly.needsJourney, true);
    assert.equal(jvmOnly.provenDone, false);
    assert.match(jvmOnly.doneReason, /1\/1 clauses cited, but none from a qa\/e2e flow — a UI feature is proven on a device: write the journey in qa\/e2e\/meal\.yaml/);

    w("qa/e2e/meal.yaml", "appId: x\n---\n# SPEC: MEAL-01\n- launchApp\n");
    const withFlow = deriveFeatureStatus(root, brief, { receipt });
    assert.equal(withFlow.e2eCovered, 1);
    assert.equal(withFlow.provenDone, true, withFlow.doneReason);

    w("docs/features/meal.md", "# meal\n\n```json cmp:feature\n{ \"screens\": true, \"unrouted\": true }\n```\n");
    fs.rmSync(path.join(root, "qa", "e2e", "meal.yaml"));
    const unrouted = deriveFeatureStatus(root, brief, { receipt });
    assert.equal(unrouted.needsJourney, false);
    assert.equal(unrouted.provenDone, true, "no journey exists for a screen that is not reachable yet");

    w("docs/features/meal.md", "# meal\n\n```json cmp:feature\n{ \"screens\": false }\n```\n");
    assert.equal(deriveFeatureStatus(root, brief, { receipt }).provenDone, true, "a pure-logic feature has no device journey to prove");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
