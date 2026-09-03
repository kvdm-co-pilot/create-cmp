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
    const result = getSpecsData(empty);
    assert.equal(result.available, false);
    assert.equal(result.specsDir, "specs/", "names the directory it looked in (the layout's), so the empty state is specific");
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

// ── The project's OWN scanner is the law when it ships one ───────────────────
// payment-blueprint's specs are `### ID — title` headings with a `status:` line;
// its lane's specCoverage reads all thirteen files and this console said "no
// clauses parsed" about every one. The console now bridges to the project's
// qa/lib/spec-coverage.mjs (scanSpecClauses/scanCitations) exactly as it
// bridges to approvals.mjs, and falls back to its own scan otherwise.
import { getProjectSpecsData, resetSpecsBridgeCache } from "../src/lib/specs.mjs";

function adopterFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-specs-adopter-"));
  fs.mkdirSync(path.join(root, "specs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "specs", "money.spec.md"),
    ["# Spec: money", "", "### MN-01 — The table is the single source of truth", "", "status: active", "", "- **Given** a currency", "", "### MN-02 — Lookup trims", "", "status: draft", ""].join("\n"),
  );
  fs.mkdirSync(path.join(root, "services", "core", "src", "test", "kotlin"), { recursive: true });
  fs.writeFileSync(path.join(root, "services", "core", "src", "test", "kotlin", "MoneyTest.kt"), "class MoneyTest {\n  // SPEC: MN-01\n  @Test fun t() {}\n}\n");
  fs.mkdirSync(path.join(root, "qa", "lib"), { recursive: true });
  // An adopter-shaped scanner: {clauses: Map} and {citations: Array}, with specFiles().
  fs.writeFileSync(
    path.join(root, "qa", "lib", "spec-coverage.mjs"),
    `import fs from "node:fs"; import path from "node:path";
export function specFiles(root) { return fs.readdirSync(path.join(root, "specs")).filter((f) => f.endsWith(".spec.md")).map((f) => "specs/" + f).sort(); }
export function scanSpecClauses(root) {
  const clauses = new Map();
  for (const rel of specFiles(root)) {
    const lines = fs.readFileSync(path.join(root, rel), "utf8").split("\\n");
    lines.forEach((line, i) => {
      const m = line.match(/^###\\s+([A-Z][A-Z0-9]*-\\d{2,})\\s+—\\s+(.+)$/);
      if (!m) return;
      const status = (lines.slice(i + 1, i + 6).map((l) => l.match(/^status:\\s*(\\w+)/)).find(Boolean) || [])[1] || "active";
      clauses.set(m[1], { id: m[1], title: m[2].trim(), status, file: rel, line: i + 1 });
    });
  }
  return { clauses, malformed: [], duplicates: [] };
}
export function scanCitations(root) {
  return { citations: [{ id: "MN-01", file: "services/core/src/test/kotlin/MoneyTest.kt", line: 2 }, { id: "MN-99", file: "services/core/src/test/kotlin/MoneyTest.kt", line: 9 }], unparsable: [], unbound: [] };
}
`,
  );
  return root;
}

test("getProjectSpecsData: bridges to the project's scanner — its grammar, its citations, its file order; prose falls back to the clause title", async () => {
  const root = adopterFixture();
  try {
    const data = await getProjectSpecsData(root);
    assert.equal(data.available, true, data.reason);
    assert.equal(data.source, "project-lib");
    assert.equal(data.files.length, 1);
    assert.equal(data.files[0].file, "money.spec.md");
    assert.equal(data.files[0].relPath, "specs/money.spec.md");
    const ids = data.files[0].clauses.map((c) => c.id);
    assert.deepEqual(ids, ["MN-01", "MN-02"], "the console's own `- **ID**` grammar found nothing here; the project's did");
    const mn01 = data.files[0].clauses[0];
    assert.equal(mn01.prose, "The table is the single source of truth", "title stands in for prose the console grammar cannot read");
    assert.equal(mn01.cited, true);
    assert.deepEqual(mn01.citedBy, [{ file: "services/core/src/test/kotlin/MoneyTest.kt", line: 2 }]);
    assert.equal(mn01.status, "active");
    const mn02 = data.files[0].clauses[1];
    assert.equal(mn02.withdrawn, false, "draft is live-but-uncounted, never struck through");
    assert.equal(mn02.cited, false);
    assert.deepEqual(data.orphanCitations, [{ id: "MN-99", file: "services/core/src/test/kotlin/MoneyTest.kt", line: 9, reason: "cites no clause in any spec file" }]);
  } finally {
    resetSpecsBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getProjectSpecsData: without a project scanner, the console's own scan runs under the manifest's specs dir and citation roots", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-specs-manifest-"));
  try {
    fs.mkdirSync(path.join(root, "qa"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), JSON.stringify({ specs: "contracts", citationRoots: ["src"] }));
    fs.mkdirSync(path.join(root, "contracts"), { recursive: true });
    fs.writeFileSync(path.join(root, "contracts", "api.spec.md"), "# Spec: api\n\n- **API-01** — Given a request, Then a response.\n- **API-02** — Given nothing, Then nothing.\n");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "ApiTest.kt"), "class ApiTest {\n  // SPEC: API-01\n  fun t() {}\n}\n");
    const data = await getProjectSpecsData(root);
    assert.equal(data.available, true);
    assert.equal(data.source, "console-scan");
    assert.equal(data.specsDir, "contracts/");
    assert.equal(data.files[0].relPath, "contracts/api.spec.md");
    assert.deepEqual(
      data.files[0].clauses.map((c) => [c.id, c.cited]),
      [["API-01", true], ["API-02", false]],
      "citations found under the manifest's roots, not under composeApp/src",
    );
    assert.deepEqual(data.files[0].clauses[0].citedBy, [{ file: "src/ApiTest.kt", line: 2 }]);

    fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), "{ nope");
    const refused = await getProjectSpecsData(root);
    assert.equal(refused.available, false);
    assert.match(refused.reason, /not valid JSON/);
  } finally {
    resetSpecsBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
