// VERDICT-BEARING CORE FUNCTIONS, RUN AGAINST A SECOND ECOSYSTEM.
//
// The lint that guards this harness's agnosticism greps core modules for banned
// words — `composeApp`, `gradlew`. It cannot see the defect class that actually
// costs adopters, because that class names no stack at all:
//
//   an unanchored regex that happens to work with one tool's attribute order
//   a filename prefix that is one build tool's convention
//   a directory literal where a declared path was available
//   a condition that never asks whether the optional thing is present
//
// Every one of those produces a WRONG VERDICT rather than a refusal, and every
// one passed review, passed the lint, and passed 1,458 tests. They were found by
// an adversarial audit on 2026-09-05 and each is reproduced below as its own
// falsifying input, so a regression is a red test rather than a silent green in
// somebody else's repository.
//
// The principle, which is the audit's and is worth stating: **two profiles or it
// isn't parameterised.** A grammar- or convention-shaped assumption has no word
// to grep for, but it always produces a different verdict on the second
// ecosystem than on the first. That difference is the only reliable detector.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseJUnitOutcomes, compareOutcomes } from "../packages/harness/src/lib/determinism.mjs";
import { deriveFeatureStatus } from "../packages/harness/src/lib/feature-brief.mjs";
import { specModelFrom } from "../packages/harness/src/lib/spec-model.mjs";

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("JUnit: `name` is not read out of `classname` — the attribute ORDER is the tool's, not ours", () => {
  // `attr()` matched `name="…"` unanchored, so it found the tail of
  // `classname="…"` whenever a writer emitted classname first. Gradle emits name
  // first and worked by luck; pytest, jest-junit and gotestsum all emit
  // classname first. Every test in a class then collapsed onto one
  // `classname.classname` key, last-write-wins — so a real timezone flip, which
  // is the ONLY thing the determinism probe exists to catch, was reported as
  // deterministic.
  const dir = tmp("junit-order-");
  try {
    fs.writeFileSync(
      path.join(dir, "junit.xml"),
      `<testsuite>
  <testcase classname="tests.test_cart" name="test_today_bucket"><failure message="date rolled: 2026-09-05 != 2026-09-04"/></testcase>
  <testcase classname="tests.test_cart" name="test_add"/>
</testsuite>`,
    );
    const out = parseJUnitOutcomes(dir);
    assert.deepEqual(Object.keys(out).sort(), ["tests.test_cart.test_add", "tests.test_cart.test_today_bucket"]);
    assert.equal(out["tests.test_cart.test_today_bucket"].status, "fail", "the red test must survive as itself");

    // And the probe now sees the flip it was blind to.
    const green = parseJUnitOutcomes(tmpWith(`<testsuite><testcase classname="tests.test_cart" name="test_today_bucket"/><testcase classname="tests.test_cart" name="test_add"/></testsuite>`));
    const diffs = compareOutcomes(out, green, "TZ=UTC-12", "TZ=UTC+14");
    assert.ok(
      diffs.some((d) => d.test === "tests.test_cart.test_today_bucket" && d.kind === "verdict-flip"),
      "a test red in one leg and green in the other is a verdict-flip, whatever the writer's attribute order",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpWith(xml) {
  const d = tmp("junit-leg-");
  fs.writeFileSync(path.join(d, "junit.xml"), xml);
  return d;
}

test("JUnit: the report FILENAME is not one build tool's prefix", () => {
  // `TEST-*.xml` is the Ant/Gradle/Surefire convention. pytest writes
  // `junit.xml`, jest-junit `junit.xml`, gotestsum `junit.xml`, cargo2junit
  // `results.xml`, `dotnet test --logger junit` `TestResults.xml`. Each parsed
  // to {} — and an empty leg compared against an empty leg yields no
  // differences, so the probe passed having read nothing at all.
  for (const name of ["junit.xml", "results.xml", "TestResults.xml", "TEST-cart.xml"]) {
    const dir = tmp("junit-name-");
    try {
      fs.writeFileSync(path.join(dir, name), `<testsuite><testcase classname="c" name="t"/></testsuite>`);
      assert.equal(Object.keys(parseJUnitOutcomes(dir)).length, 1, `${name} must be read`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  // A non-XML file is still ignored, and an XML file with no test cases still
  // contributes nothing — the `<testcase` match is the real filter.
  const dir = tmp("junit-junk-");
  try {
    fs.writeFileSync(path.join(dir, "notes.txt"), "not xml");
    fs.writeFileSync(path.join(dir, "coverage.xml"), "<coverage line-rate=\"0.9\"/>");
    assert.deepEqual(parseJUnitOutcomes(dir), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A brief + spec pair under a NON-default spec directory. */
function projectWithSpecsAt(specsDir, { journey = null } = {}) {
  const root = tmp("brief-");
  fs.mkdirSync(path.join(root, specsDir), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "features"), { recursive: true });
  fs.writeFileSync(path.join(root, specsDir, "cart.spec.md"), "# Cart\n\n- **CART-01** it totals\n- **CART-02** it taxes\n");
  fs.writeFileSync(
    path.join(root, "docs", "features", "cart.md"),
    // The real fence is ```json cmp:feature with a JSON body — see
    // FEATURE_FENCE_RE. A fixture that invents its own syntax declares nothing
    // and then blames the code under test for not seeing it.
    "# cart\n\n```json cmp:feature\n{\"screens\": true}\n```\n\n**Spec:** " + specsDir + "/cart.spec.md\n",
  );
  const profile = {
    id: "svc",
    protocol: 1,
    layout: { specs: specsDir, citationRoots: ["src"], citationExts: [".py"], flows: null },
    // A journey tier must be one of `names` — the model validator refuses
    // otherwise, correctly, and this fixture must not smuggle an invalid profile
    // past it and then blame the code under test.
    tiers: {
      names: journey ? ["unit", journey] : ["unit"],
      hostOnly: ["unit"],
      satisfying: { unit: ["unit"] },
      journey,
      forFile: () => "unit",
    },
  };
  const built = specModelFrom(profile, {});
  assert.equal(built.ok, true, built.ok ? "" : built.reason);
  return { root, model: built.model };
}

test("feature doneness reads the DECLARED spec directory, not the literal `specs/`", () => {
  // `deriveFeatureStatus` hardcoded `specs/${name}.spec.md` while the lane's own
  // scanner read `model.specsDir`. A project declaring `"specs": "docs/specs"` —
  // a legal, validated manifest field — got specExists false, total 0, and
  // provenDone false forever, with the Features view telling a human to start
  // writing a spec that already existed. spec-coverage.mjs's header says these
  // two readers exist so they can never disagree about the same clause.
  const { root, model } = projectWithSpecsAt("docs/specs");
  try {
    const status = deriveFeatureStatus(root, { name: "cart", rel: "docs/features/cart.md" }, { model, citations: [], receipt: { verdict: "PASS", attestsTree: true } });
    assert.equal(status.specExists, true, "the spec that exists must be found where the profile says it is");
    assert.equal(status.specRel, "docs/specs/cart.spec.md");
    assert.equal(status.total, 2, "its clauses must be counted");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a null journey tier does not make every feature permanently un-done", () => {
  // `tiers.journey` is documented as nullable — "or null when this stack has no
  // journey tier" — and a backend, a CLI or a library declares exactly that.
  // `needsJourney` never asked, so a feature with `screens: true` demanded a
  // citation from a tier that does not exist, and the remedy printed was
  // literally "add a null test that cites one of its clauses".
  const cited = [
    { id: "CART-01", tier: "unit", file: "src/a.py", line: 1 },
    { id: "CART-02", tier: "unit", file: "src/a.py", line: 2 },
  ];
  const receipt = { verdict: "PASS", attestsTree: true };

  const nullJourney = projectWithSpecsAt("specs", { journey: null });
  try {
    const s = deriveFeatureStatus(nullJourney.root, { name: "cart", rel: "docs/features/cart.md" }, { model: nullJourney.model, citations: cited, receipt });
    assert.equal(s.needsJourney, false, "a stack with no journey tier cannot owe a journey");
    assert.equal(s.provenDone, true, "every clause cited, receipt PASS, tree attested — that is done");
  } finally {
    fs.rmSync(nullJourney.root, { recursive: true, force: true });
  }

  // And the requirement still BITES where a journey tier exists: this is the
  // gate that stops a UI feature being called done on host tests alone.
  const withJourney = projectWithSpecsAt("specs", { journey: "e2e" });
  try {
    const s = deriveFeatureStatus(withJourney.root, { name: "cart", rel: "docs/features/cart.md" }, { model: withJourney.model, citations: cited, receipt });
    assert.equal(s.needsJourney, true);
    assert.equal(s.provenDone, false, "a surface proved only on the host is not done");
    assert.match(s.doneReason, /e2e/, "and the remedy names the real tier, never `null`");
  } finally {
    fs.rmSync(withJourney.root, { recursive: true, force: true });
  }
});
