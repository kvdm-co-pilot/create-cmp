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
