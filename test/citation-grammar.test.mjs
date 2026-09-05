// THE GRAMMAR IS THE PROFILE'S — proved by execution, in languages the spine
// never spoke.
//
// Why this file exists, and why its absence was the defect. The harness claims
// to be stack-agnostic. Until 2026-09-05 that claim was guarded by two things:
// `test/agnostic-lint.test.mjs`, which greps core modules for banned words like
// `composeApp` and `gradlew`, and `test/second-stack-conformance.test.mjs`,
// which checks a foreign profile's DECLARATIONS. Neither executes a scan.
//
// So when `spec-coverage.mjs` held
//
//   TEST_DECL_RE = /@Test\b|\bfun\s+`[^`]+`\s*\(|\b(?:test|it)\s*\(/
//
// nothing could see it. No stack NAME appears in that regex, so the lint passed;
// no scan ran in a third language, so the conformance suite passed. A Python
// service adopting the harness found every one of its twenty `# SPEC:` markers,
// bound none of them, and read "declared but never cited" — a message pointing
// at the spec file, which was not the problem. It cost six minutes and was
// escaped only by monkey-patching `RegExp.prototype.exec` in the running
// process. A promise proved at a tier that cannot observe it, in the suite of
// the product built to refuse exactly that.
//
// Every test below runs the real scanner over a real tree. If a future change
// re-hardcodes a language, these fail — a grep never could.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { specModelFrom, DEFAULT_GRAMMAR } from "../packages/harness/src/lib/spec-model.mjs";
import { scanSpecClauses, scanCitations, citationIsBound, citationScanDiagnostic } from "../packages/harness/src/lib/spec-coverage.mjs";

/** A profile for one language: sources under src/, tests under tests/. */
function profileFor(id, ext, grammar) {
  return {
    id,
    protocol: 1,
    layout: { specs: "specs", citationRoots: ["src", "tests"], citationExts: [ext], flows: null },
    tiers: {
      names: ["unit"],
      hostOnly: ["unit"],
      satisfying: { unit: ["unit"] },
      journey: null,
      forFile: (rel) => (rel.startsWith("tests/") ? "unit" : "other"),
    },
    ...(grammar ? { grammar } : {}),
  };
}

/** A tree with one clause and one genuinely-bound citation in `testSource`. */
function treeWith(ext, testSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grammar-"));
  fs.mkdirSync(path.join(root, "specs"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "specs", "app.spec.md"), "# App\n\n- **APP-01** it adds two numbers\n");
  fs.writeFileSync(path.join(root, "tests", `test_app${ext}`), testSource);
  return root;
}

const PYTHON_TEST = `import pytest

# SPEC: APP-01
def test_adds():
    assert 1 + 2 == 3
`;

const GO_TEST = `package app

import "testing"

// SPEC: APP-01
func TestAdds(t *testing.T) {
\tif 1+2 != 3 {
\t\tt.Fatal("no")
\t}
}
`;

const PYTHON_GRAMMar = { testDeclaration: /^\s*(?:async\s+)?def\s+test\w*\s*\(|^\s*class\s+Test\w*\s*[(:]/ };
const GO_GRAMMAR = { testDeclaration: /^\s*func\s+(?:Test|Benchmark|Example)\w*\s*\(/ };

test("THE DEFECT, still reproducible: the fallback grammar binds nothing in Python or Go", () => {
  // Kept as a live demonstration rather than a comment. If someone widens the
  // fallback to cover these, this test tells them — and that is the moment to
  // ask whether the fallback should exist at all, not to quietly re-hardcode.
  assert.equal(citationIsBound(["# SPEC: APP-01", "def test_adds():"], 0), false, "python def test_");
  assert.equal(citationIsBound(["# SPEC: APP-01", "async def test_adds():"], 0), false, "python async def");
  assert.equal(citationIsBound(["// SPEC: APP-01", "func TestAdds(t *testing.T) {"], 0), false, "go func Test");
  assert.equal(citationIsBound(["// SPEC: APP-01", "#[test]"], 0), false, "rust #[test]");
  // And the two it does know, which is why nobody noticed.
  assert.equal(citationIsBound(["// SPEC: APP-01", "@Test fun adds() {}"], 0), true, "kotlin");
  assert.equal(citationIsBound(["// SPEC: APP-01", 'test("adds", () => {})'], 0), true, "javascript");
});

test("PYTHON: a profile that declares its grammar gets its citations counted, end to end", () => {
  const root = treeWith(".py", PYTHON_TEST);
  try {
    // Without a declared grammar: the marker is found and thrown away.
    const bare = specModelFrom(profileFor("py-bare", ".py"), {});
    assert.equal(bare.ok, true);
    const none = scanCitations(root, bare.model);
    assert.equal(none.length, 0, "the fallback grammar cannot bind a Python test");
    assert.equal(none.markersSeen, 1, "…and it SAW the marker, which is what makes the silence a lie");

    // With one: the same tree, the same scanner, a real citation.
    const declared = specModelFrom(profileFor("py", ".py", PYTHON_GRAMMar), {});
    assert.equal(declared.ok, true);
    const tags = scanCitations(root, declared.model);
    assert.equal(tags.length, 1, "a declared grammar binds the citation");
    assert.equal(tags[0].id, "APP-01");
    assert.equal(tags[0].tier, "unit");

    // And the clause is genuinely covered, which is the verdict that matters.
    const clauses = scanSpecClauses(root, declared.model);
    assert.ok(clauses.has("APP-01"));
    assert.ok(tags.some((t) => t.id === "APP-01"), "APP-01 is cited, so specCoverage passes it");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("GO: a second non-JVM language, same seam, no core change", () => {
  const root = treeWith(".go", GO_TEST);
  try {
    const bare = scanCitations(root, specModelFrom(profileFor("go-bare", ".go"), {}).model);
    assert.equal(bare.length, 0);
    assert.equal(bare.markersSeen, 1);

    const tags = scanCitations(root, specModelFrom(profileFor("go", ".go", GO_GRAMMAR), {}).model);
    assert.equal(tags.length, 1, "Go binds once its profile says what a Go test looks like");
    assert.equal(tags[0].id, "APP-01");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the scan SAYS SO when it found markers and bound none — the sentence that was missing", () => {
  const root = treeWith(".py", PYTHON_TEST);
  try {
    const model = specModelFrom(profileFor("py-bare", ".py"), {}).model;
    const tags = scanCitations(root, model);
    const said = citationScanDiagnostic(tags, model);
    assert.ok(said, "a scan that saw markers and kept none must explain itself");
    assert.match(said, /1 SPEC marker found and none bound/);
    assert.match(said, /Kotlin\/JVM \+ JavaScript fallback/, "it must name WHY, not just that");
    assert.match(said, /grammar\.testDeclaration/, "and the field that fixes it");
    assert.match(said, /Python `def test_`/, "with a pattern the reader can copy");

    // Silent in the two cases where it would be noise: nothing written at all,
    // and everything binding correctly.
    const declared = specModelFrom(profileFor("py", ".py", PYTHON_GRAMMar), {}).model;
    assert.equal(citationScanDiagnostic(scanCitations(root, declared), declared), null, "silent when citations bind");
    const empty = Object.assign([], { markersSeen: 0 });
    assert.equal(citationScanDiagnostic(empty, model), null, "silent when the project wrote none");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a profile may declare its grammar as a source STRING, not only a RegExp", () => {
  // A profile is data as much as code, and a manifest-driven or generated
  // profile will hand over strings. Refusing them would push every adopter into
  // regex-literal syntax for no reason.
  const model = specModelFrom(profileFor("py-str", ".py", { testDeclaration: "^\\s*def\\s+test\\w*\\s*\\(" }), {}).model;
  assert.ok(model.grammar.testDeclaration instanceof RegExp);
  assert.equal(citationIsBound(["# SPEC: APP-01", "def test_adds():"], 0, model.grammar), true);
  // An UNPARSEABLE pattern falls back rather than throwing mid-lane: a broken
  // profile must not take the whole run down with a SyntaxError from a scanner.
  const broken = specModelFrom(profileFor("py-bad", ".py", { testDeclaration: "([unclosed" }), {}).model;
  assert.deepEqual(broken.grammar.testDeclaration, DEFAULT_GRAMMAR.testDeclaration);
});

test("field-by-field override: declaring one pattern keeps the rest, and cmp is untouched", async () => {
  const model = specModelFrom(profileFor("partial", ".py", { bindingWindow: 2 }), {}).model;
  assert.equal(model.grammar.bindingWindow, 2);
  assert.deepEqual(model.grammar.testDeclaration, DEFAULT_GRAMMAR.testDeclaration, "undeclared fields keep the fallback");
  assert.equal(model.grammar.isDefault, false, "…but the profile no longer counts as undeclared");

  // The whole point of a fallback is that the first stack does not move. If
  // this fails, a Compose app's coverage changed and the fleet gate will say so.
  const cmp = await import("../packages/harness/src/lib/profiles/cmp/index.mjs");
  const cmpModel = specModelFrom(cmp, {}).model;
  assert.equal(citationIsBound(["// SPEC: HOME-01", "@Test", "fun renders() {}"], 0, cmpModel.grammar), true);
  assert.equal(citationIsBound(["// SPEC: HOME-01", "class HomeTest {"], 0, cmpModel.grammar), false, "a type declaration still refuses");
});

// ── Comment syntax: the second half of the grammar, found by audit the same
// ── day the first half landed. Both cases below were live defects.

const PY_FULL = {
  citationMarker: /^(?:\/\/|#)\s*SPEC:/,
  testDeclaration: /^\s*(?:async\s+)?def\s+test\w*\s*\(/,
  typeDeclaration: /^\s*class\s+\w+/,
  lineComment: /^#/,
  blockComment: { open: '"""', close: '"""' },
  bindingWindow: 5,
};

test("a comment line is SKIPPED, not counted — the window measures distance from the TEST", () => {
  // Measured defect: `//` and `*` lines were skipped and everything else counted,
  // so five `#` prose lines between a Python citation and its test exhausted the
  // window and discarded the citation — while the byte-identical Kotlin
  // arrangement bound fine. Given/When/Then comments under a citation are
  // idiomatic, so this silently punished the projects documenting themselves best.
  const five = ["# a", "# b", "# c", "# d", "# e"];
  assert.equal(citationIsBound(["# SPEC: APP-01", ...five, "def test_add():"], 0, PY_FULL), true);
  // Kotlin, unchanged — the fallback still skips `//` and `*`.
  assert.equal(citationIsBound(["// SPEC: APP-01", "// a", "// b", "// c", "// d", "// e", "@Test fun a() {}"], 0), true);
  // And the window still BITES: real code between tag and test is still distance.
  const code = ["val a = 1", "val b = 2", "val c = 3", "val d = 4", "val e = 5"];
  assert.equal(citationIsBound(["// SPEC: APP-01", ...code, "@Test fun a() {}"], 0), false, "the window must still close on real code");
});

test("a citation inside a BLOCK comment never binds — the laundering hole, in every language", () => {
  // The binder exists to stop a tag vouching for a test it is not attached to.
  // `insideBlockComment` scanned for `/*` and `*/` alone, so a `# SPEC:` inside a
  // Python docstring counted as a real citation over whatever test followed —
  // the same drift payment-blueprint hit, reopened for every non-C-family language.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grammar-doc-"));
  try {
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.mkdirSync(path.join(root, "tests"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs", "app.spec.md"), "# App\n\n- **APP-01** it adds\n- **APP-02** it multiplies\n");
    fs.writeFileSync(
      path.join(root, "tests", "test_app.py"),
      [
        "def helper():",
        '    """',
        "    Design notes:",
        "    # SPEC: APP-02",
        '    """',
        "    return 1",
        "",
        "# SPEC: APP-01",
        "def test_adds():",
        "    assert helper() == 1",
      ].join("\n") + "\n",
    );
    const model = specModelFrom(profileFor("py", ".py", PY_FULL), {}).model;
    const ids = scanCitations(root, model).map((t) => t.id).sort();
    assert.deepEqual(ids, ["APP-01"], "the docstring citation must not count; the real one must");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
