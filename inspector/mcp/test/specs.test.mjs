// specs.mjs — Specs tab data: clause parsing (mirrors qa/verify.mjs's
// stepSpecCoverage grammar) + a lightweight "cited anywhere" coverage badge.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listSpecFiles, parseSpecClauses, getSpecsData } from "../src/lib/specs.mjs";

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-specs-"));
  fs.mkdirSync(path.join(root, "specs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "specs", "home.spec.md"),
    [
      "# Spec: home",
      "",
      "> intro line, not a clause",
      "",
      "- **HOME-01** — Given the Home screen opens, When items load,",
      "  Then a loading indicator is shown.",
      "- **HOME-02** — Given items are listed, When tapped, Then it navigates.",
      "- ~~**HOME-03** — Given old behavior, When invoked, Then it did the old thing.~~",
      "",
    ].join("\n"),
  );
  fs.mkdirSync(path.join(root, "composeApp", "src", "commonTest", "kotlin"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "composeApp", "src", "commonTest", "kotlin", "HomeTest.kt"),
    "class HomeTest {\n  // SPEC: HOME-01\n  fun test() {}\n}\n",
  );
  return root;
}

test("listSpecFiles: [] with no specs/ dir; sorted *.spec.md file names otherwise", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-specs-empty-"));
  try {
    assert.deepEqual(listSpecFiles(empty), []);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }

  const root = makeFixture();
  try {
    assert.deepEqual(listSpecFiles(root), ["home.spec.md"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parseSpecClauses: joins continuation-line prose, flags + strips ~~ from a withdrawn clause", () => {
  const root = makeFixture();
  try {
    const clauses = parseSpecClauses(root, "home.spec.md");
    assert.equal(clauses.length, 3);

    assert.equal(clauses[0].id, "HOME-01");
    assert.equal(clauses[0].withdrawn, false);
    assert.equal(clauses[0].prose, "Given the Home screen opens, When items load, Then a loading indicator is shown.");

    assert.equal(clauses[1].id, "HOME-02");
    assert.equal(clauses[1].withdrawn, false);

    assert.equal(clauses[2].id, "HOME-03");
    assert.equal(clauses[2].withdrawn, true);
    assert.doesNotMatch(clauses[2].prose, /~~/, "the strikethrough markers are stripped from the display prose");
    assert.match(clauses[2].prose, /Given old behavior/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getSpecsData: cited=true for a tagged clause, false for an uncited live clause, null for withdrawn", () => {
  const root = makeFixture();
  try {
    const data = getSpecsData(root);
    assert.equal(data.available, true);
    assert.equal(data.files.length, 1);
    assert.equal(data.files[0].file, "home.spec.md");
    const byId = new Map(data.files[0].clauses.map((c) => [c.id, c]));
    assert.equal(byId.get("HOME-01").cited, true, "// SPEC: HOME-01 exists in the fixture's commonTest file");
    assert.equal(byId.get("HOME-02").cited, false, "no test cites HOME-02");
    assert.equal(byId.get("HOME-03").cited, null, "withdrawn clauses are coverage-exempt (N/A, not false)");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getSpecsData: {available:false} when the project has no specs/ directory — never fabricated", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-specs-empty2-"));
  try {
    assert.deepEqual(getSpecsData(empty), { available: false });
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test("getSpecsData: citedBy names the citing test's file:line (RTM §3.5) — empty for uncited and withdrawn clauses", () => {
  const root = makeFixture();
  try {
    const byId = new Map(getSpecsData(root).files[0].clauses.map((c) => [c.id, c]));
    assert.deepEqual(byId.get("HOME-01").citedBy, [
      { file: "composeApp/src/commonTest/kotlin/HomeTest.kt", line: 2 },
    ]);
    assert.deepEqual(byId.get("HOME-02").citedBy, []);
    assert.deepEqual(byId.get("HOME-03").citedBy, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getSpecsData: orphanCitations surfaces both defect directions — a tag citing a withdrawn clause, and a tag citing no clause at all", () => {
  const root = makeFixture();
  try {
    fs.writeFileSync(
      path.join(root, "composeApp", "src", "commonTest", "kotlin", "StaleTest.kt"),
      "class StaleTest {\n  // SPEC: HOME-03, HOME-99\n  fun test() {}\n}\n",
    );
    const data = getSpecsData(root);
    const byId = new Map(data.orphanCitations.map((o) => [o.id, o]));
    assert.equal(byId.get("HOME-03").reason, "cites a withdrawn clause");
    assert.equal(byId.get("HOME-99").reason, "cites no clause in any spec file");
    assert.equal(byId.get("HOME-03").file, "composeApp/src/commonTest/kotlin/StaleTest.kt");
    assert.equal(byId.get("HOME-03").line, 2);
    // A citation of a withdrawn clause is an orphan, never coverage.
    const clause = getSpecsData(root).files[0].clauses.find((c) => c.id === "HOME-03");
    assert.equal(clause.cited, null);
    assert.deepEqual(clause.citedBy, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getSpecsData: a clean tree yields orphanCitations: [] — the scan ran and found nothing, distinct from not running", () => {
  const root = makeFixture();
  try {
    assert.deepEqual(getSpecsData(root).orphanCitations, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
