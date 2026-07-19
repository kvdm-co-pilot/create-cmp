// architecture.mjs — Architecture tab data: a real walk of
// composeApp/src/commonMain/kotlin/** grouped into layers, the governed
// contract (specs/app-base.spec.md via specs.mjs, reused not forked), and the
// exemplar `home` feature's real files on disk. Every section degrades
// honestly (never fabricated) when its source is missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLayerMap,
  getGovernedContract,
  getFeatureShape,
  getArchitectureData,
  deriveLayerRules,
  getDependencyGraph,
  getArchitectureDoc,
} from "../src/lib/architecture.mjs";

/** A minimal generated-project fixture with a real layer tree + exemplar home feature. */
function makeFixtureProject({ withSpec = true, withHome = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-architecture-"));
  const pkgDir = path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo");

  const presentationDir = path.join(pkgDir, "presentation");
  fs.mkdirSync(path.join(presentationDir, "theme"), { recursive: true });
  fs.writeFileSync(path.join(presentationDir, "theme", "Theme.kt"), "object AcmeColors\n");
  fs.mkdirSync(path.join(presentationDir, "navigation"), { recursive: true });
  fs.writeFileSync(path.join(presentationDir, "navigation", "AppNavHost.kt"), "object AppNavHost\n");

  if (withHome) {
    fs.mkdirSync(path.join(presentationDir, "home"), { recursive: true });
    fs.writeFileSync(path.join(presentationDir, "home", "HomeScreen.kt"), "@Composable fun HomeScreen() {}\n");
    fs.writeFileSync(path.join(presentationDir, "home", "HomeViewModel.kt"), "class HomeViewModel\n");
    fs.mkdirSync(path.join(pkgDir, "domain", "model"), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "domain", "model", "Item.kt"), "data class Item(val id: String)\n");
    fs.mkdirSync(path.join(pkgDir, "domain", "repository"), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "domain", "repository", "ItemRepository.kt"), "interface ItemRepository\n");
    fs.mkdirSync(path.join(pkgDir, "domain", "usecase"), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "domain", "usecase", "GetItemsUseCase.kt"), "class GetItemsUseCase\n");
    fs.mkdirSync(path.join(pkgDir, "data", "remote"), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "data", "remote", "ItemRepositoryImpl.kt"), "class ItemRepositoryImpl\n");
    fs.mkdirSync(path.join(root, "composeApp", "src", "commonTest", "kotlin", "com", "acme", "demo", "testing", "fakes"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(
        root,
        "composeApp",
        "src",
        "commonTest",
        "kotlin",
        "com",
        "acme",
        "demo",
        "testing",
        "fakes",
        "FakeItemRepository.kt",
      ),
      "class FakeItemRepository\n",
    );
  }

  fs.mkdirSync(path.join(pkgDir, "di"), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, "di", "AppModule.kt"), "object AppModule\n");

  // "data" layer deliberately absent (besides remote/ItemRepositoryImpl.kt above when
  // withHome) so the layer-map empty-state path is exercised by a caller that wants it.

  if (withSpec) {
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "specs", "app-base.spec.md"),
      ["# Spec: app-base", "", "- **ARCH-01** — Given the shell, When it renders, Then layers stay separated."].join(
        "\n",
      ),
    );
    fs.writeFileSync(path.join(root, "specs", "home.spec.md"), "# Spec: home\n\n- **HOME-01** — Given X, Then Y.\n");
  }

  return root;
}

test("getLayerMap: {available:false} when no 'presentation' dir exists anywhere on disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-architecture-empty-"));
  try {
    const map = getLayerMap(root);
    assert.equal(map.available, false);
    assert.match(map.reason, /presentation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLayerMap: real walk finds presentation/domain/data/di, files listed under each, di honest empty when absent", () => {
  const root = makeFixtureProject();
  try {
    const map = getLayerMap(root);
    assert.equal(map.available, true);
    assert.equal(map.appPackage, "com.acme.demo");
    const byId = new Map(map.layers.map((l) => [l.id, l]));

    assert.equal(byId.get("presentation").present, true);
    assert.ok(byId.get("presentation").files.includes("theme/Theme.kt"));
    // navigation is part of presentation — no separate box, just a subdir in the listing.
    assert.ok(byId.get("presentation").files.includes("navigation/AppNavHost.kt"));
    assert.ok(byId.get("presentation").files.includes("home/HomeScreen.kt"));

    assert.equal(byId.get("domain").present, true);
    assert.ok(byId.get("domain").files.includes("model/Item.kt"));

    assert.equal(byId.get("data").present, true);
    assert.ok(byId.get("data").files.includes("remote/ItemRepositoryImpl.kt"));

    assert.equal(byId.get("di").present, true);
    assert.ok(byId.get("di").files.includes("AppModule.kt"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLayerMap: a layer directory that doesn't exist renders present:false with an empty file list (honest empty state)", () => {
  const root = makeFixtureProject({ withHome: false });
  try {
    // Remove the 'di' dir entirely for this case.
    fs.rmSync(path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo", "di"), {
      recursive: true,
      force: true,
    });
    const map = getLayerMap(root);
    const di = map.layers.find((l) => l.id === "di");
    assert.equal(di.present, false);
    assert.deepEqual(di.files, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLayerMap: an 'other' top-level package (e.g. core) is surfaced, never silently dropped", () => {
  const root = makeFixtureProject();
  try {
    const coreDir = path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo", "core", "format");
    fs.mkdirSync(coreDir, { recursive: true });
    fs.writeFileSync(path.join(coreDir, "Formatter.kt"), "object Formatter\n");
    const map = getLayerMap(root);
    assert.equal(map.otherPackages.length, 1);
    assert.equal(map.otherPackages[0].name, "core");
    assert.ok(map.otherPackages[0].files.includes("format/Formatter.kt"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getGovernedContract: {available:false} when specs/app-base.spec.md is missing", () => {
  const root = makeFixtureProject({ withSpec: false });
  try {
    const gc = getGovernedContract(root);
    assert.equal(gc.available, false);
    assert.match(gc.reason, /app-base\.spec\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getGovernedContract: parses specs/app-base.spec.md via specs.mjs's parseSpecClauses (reused, not forked)", () => {
  const root = makeFixtureProject();
  try {
    const gc = getGovernedContract(root);
    assert.equal(gc.available, true);
    assert.equal(gc.file, "app-base.spec.md");
    assert.equal(gc.clauses.length, 1);
    assert.equal(gc.clauses[0].id, "ARCH-01");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getFeatureShape: {available:false} with no 'presentation' dir at all", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-architecture-empty2-"));
  try {
    const shape = getFeatureShape(root);
    assert.equal(shape.available, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getFeatureShape: {available:false} when presentation/home is empty/missing and no exemplar domain/data/spec files resolve", () => {
  const root = makeFixtureProject({ withHome: false, withSpec: false });
  try {
    const shape = getFeatureShape(root);
    assert.equal(shape.available, false);
    assert.match(shape.reason, /no home-feature files/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getFeatureShape: real walk of presentation/home + the known domain/data/spec files, only what's actually on disk", () => {
  const root = makeFixtureProject();
  try {
    const shape = getFeatureShape(root);
    assert.equal(shape.available, true);
    assert.ok(
      shape.files.includes(
        "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt",
      ),
    );
    assert.ok(
      shape.files.includes("composeApp/src/commonMain/kotlin/com/acme/demo/domain/model/Item.kt"),
    );
    assert.ok(
      shape.files.includes("composeApp/src/commonMain/kotlin/com/acme/demo/data/remote/ItemRepositoryImpl.kt"),
    );
    assert.ok(
      shape.files.includes(
        "composeApp/src/commonTest/kotlin/com/acme/demo/testing/fakes/FakeItemRepository.kt",
      ),
    );
    assert.ok(shape.files.includes("specs/home.spec.md"));
    // Files the fixture never created (e.g. the desktopTest golden-tree test) must
    // NEVER be fabricated into the list.
    assert.ok(!shape.files.some((f) => f.includes("HomeGoldenTreeTest")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getFeatureShape: picks up a REAL extra file under presentation/home that the exemplar list doesn't name (e.g. DetailScreen.kt)", () => {
  const root = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(
        root,
        "composeApp",
        "src",
        "commonMain",
        "kotlin",
        "com",
        "acme",
        "demo",
        "presentation",
        "home",
        "DetailScreen.kt",
      ),
      "@Composable fun DetailScreen() {}\n",
    );
    const shape = getFeatureShape(root);
    assert.ok(
      shape.files.includes(
        "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/DetailScreen.kt",
      ),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getArchitectureData: bundles all sections in one call, including the new dependency graph + doc mirror", () => {
  const root = makeFixtureProject();
  try {
    const data = getArchitectureData(root);
    assert.equal(data.layerMap.available, true);
    assert.equal(data.governedContract.available, true);
    assert.equal(data.featureShape.available, true);
    assert.equal(data.dependencyGraph.available, true);
    assert.equal(data.doc.available, false, "no docs/ARCHITECTURE.md in this fixture — honest, not fabricated");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- deriveLayerRules (drift surface: forbidden edges FROM the clause prose itself) ---

// Real ARCH-01/02/09/10 prose shapes (template/specs/app-base.spec.md), trimmed to the
// load-bearing "Given any file in `X` ... Then none resolve into `Y`[, `Z`, or `W`]" shape
// this parser targets — a change to that shape in the real spec should be caught by the
// live-doc E2E test (preview-service.test.mjs), not just these controlled fixtures.
const ARCH_01 = {
  id: "ARCH-01",
  withdrawn: false,
  prose:
    "Given any file in `presentation`, When its imports are inspected, Then none resolve into the `data` layer (presentation depends on domain only).",
};
const ARCH_02 = {
  id: "ARCH-02",
  withdrawn: false,
  prose:
    "Given any file in `domain`, When its imports are inspected, Then none resolve into `presentation`, `data`, or `di`, and none reference platform types (domain is pure Kotlin).",
};
const ARCH_09 = {
  id: "ARCH-09",
  withdrawn: false,
  prose: "Given any file in `data`, When its imports are inspected, Then none resolve into `presentation` or `di` (data never reaches upward).",
};
const ARCH_10 = {
  id: "ARCH-10",
  withdrawn: false,
  prose: "Given any file in `core`, When its imports are inspected, Then none resolve into `presentation`, `data`, or `di` (core is leaf utility code; `domain` at most).",
};
const ARCH_03 = {
  id: "ARCH-03",
  withdrawn: false,
  prose: "Given any ViewModel class, When the test sources are inspected, Then a corresponding *ViewModelTest exists.",
};

test("deriveLayerRules: extracts {from,to,clauseId} from the real ARCH-01/02/09/10 clause shape", () => {
  const rules = deriveLayerRules([ARCH_01, ARCH_02, ARCH_09, ARCH_10]);
  const pairs = rules.map((r) => `${r.from}->${r.to}`).sort();
  assert.deepEqual(pairs, [
    "core->data",
    "core->di",
    "core->presentation",
    "data->di",
    "data->presentation",
    "domain->data",
    "domain->di",
    "domain->presentation",
    "presentation->data",
  ]);
  assert.ok(rules.every((r) => /^ARCH-\d\d$/.test(r.clauseId)));
});

test("deriveLayerRules: a clause with a different shape (ARCH-03: test pairing) contributes no rule — never guessed at", () => {
  assert.deepEqual(deriveLayerRules([ARCH_03]), []);
});

test("deriveLayerRules: a withdrawn clause is skipped even if it matches the shape", () => {
  assert.deepEqual(deriveLayerRules([{ ...ARCH_01, withdrawn: true }]), []);
});

test("deriveLayerRules: empty/undefined clauses -> empty rules, never a crash", () => {
  assert.deepEqual(deriveLayerRules([]), []);
  assert.deepEqual(deriveLayerRules(undefined), []);
});

// --- getDependencyGraph (drift surface: observed edges + violations with file:line) ---

/** A fixture with a real presentation/domain/data/di tree, and an OPTIONAL deliberate data->presentation violating import. */
function makeDependencyFixtureProject({ withViolation = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-dep-graph-"));
  const pkgDir = path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo");

  const presentationDir = path.join(pkgDir, "presentation", "home");
  fs.mkdirSync(presentationDir, { recursive: true });
  fs.writeFileSync(
    path.join(presentationDir, "HomeViewModel.kt"),
    ["package com.acme.demo.presentation.home", "", "import com.acme.demo.domain.usecase.GetItemsUseCase", "", "class HomeViewModel"].join("\n"),
  );

  const domainDir = path.join(pkgDir, "domain", "usecase");
  fs.mkdirSync(domainDir, { recursive: true });
  fs.writeFileSync(path.join(domainDir, "GetItemsUseCase.kt"), "package com.acme.demo.domain.usecase\n\nclass GetItemsUseCase\n");

  const dataDir = path.join(pkgDir, "data", "remote");
  fs.mkdirSync(dataDir, { recursive: true });
  const dataImports = ["package com.acme.demo.data.remote", "", "import com.acme.demo.domain.usecase.GetItemsUseCase"];
  if (withViolation) dataImports.push("import com.acme.demo.presentation.theme.Theme");
  dataImports.push("", "class ItemRepositoryImpl");
  fs.writeFileSync(path.join(dataDir, "ItemRepositoryImpl.kt"), dataImports.join("\n"));

  const diDir = path.join(pkgDir, "di");
  fs.mkdirSync(diDir, { recursive: true });
  fs.writeFileSync(
    path.join(diDir, "AppModule.kt"),
    ["package com.acme.demo.di", "", "import com.acme.demo.data.remote.ItemRepositoryImpl", "import com.acme.demo.domain.usecase.GetItemsUseCase", "", "object AppModule"].join("\n"),
  );

  return { root, pkgDir };
}

test("getDependencyGraph: {available:false} when no 'presentation' dir exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-dep-graph-empty-"));
  try {
    const graph = getDependencyGraph(root, []);
    assert.equal(graph.available, false);
    assert.match(graph.reason, /presentation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getDependencyGraph: observes real edges (presentation->domain, data->domain, di->data, di->domain) with counts and file:line evidence", () => {
  const { root } = makeDependencyFixtureProject();
  try {
    const graph = getDependencyGraph(root, [ARCH_01, ARCH_02, ARCH_09, ARCH_10]);
    assert.equal(graph.available, true);
    assert.equal(graph.rulesApplied, true);
    const byKey = new Map(graph.edges.map((e) => [`${e.from}->${e.to}`, e]));
    assert.ok(byKey.has("presentation->domain"));
    assert.equal(byKey.get("presentation->domain").violation, false);
    assert.ok(byKey.has("data->domain"));
    assert.ok(byKey.has("di->data"));
    assert.ok(byKey.has("di->domain"));
    assert.equal(graph.violations.length, 0, "no violating import was injected in this fixture");
    const evidence = byKey.get("presentation->domain").occurrences[0];
    assert.equal(evidence.file, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeViewModel.kt");
    assert.equal(evidence.line, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getDependencyGraph: a deliberately-injected data->presentation import is flagged violation:true with the clause id and file:line", () => {
  const { root } = makeDependencyFixtureProject({ withViolation: true });
  try {
    const graph = getDependencyGraph(root, [ARCH_01, ARCH_02, ARCH_09, ARCH_10]);
    const edge = graph.edges.find((e) => e.from === "data" && e.to === "presentation");
    assert.ok(edge, "the data->presentation edge is observed");
    assert.equal(edge.violation, true);
    assert.equal(edge.clauseId, "ARCH-09");
    assert.equal(graph.violations.length, 1);
    assert.equal(graph.violations[0].file, "composeApp/src/commonMain/kotlin/com/acme/demo/data/remote/ItemRepositoryImpl.kt");
    assert.equal(graph.violations[0].clauseId, "ARCH-09");
    assert.ok(graph.violations[0].line > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getDependencyGraph: rulesApplied:false when no governed clauses resolve any rule — an empty violations list then means 'unchecked', never 'clean'", () => {
  const { root } = makeDependencyFixtureProject({ withViolation: true });
  try {
    const graph = getDependencyGraph(root, []);
    assert.equal(graph.rulesApplied, false);
    const edge = graph.edges.find((e) => e.from === "data" && e.to === "presentation");
    assert.equal(edge.violation, false, "no rule was available to check it against");
    assert.equal(graph.violations.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- getArchitectureDoc (authored form: mirrors docs/ARCHITECTURE.md's own structure) ---

const DOC_FIXTURE = `# Architecture

## 1. Purpose & quality goals

This app's purpose is recorded elsewhere.

| Quality (ISO/IEC 25010) | Scenario | Backing |
|---|---|---|
| Maintainability | A layer violation is named as a clause | \`[enforced: ARCH-01..05]\` |
| Reliability (offline) | Cached data still renders offline | \`[advisory]\` today |

## 3. System context

This app talks to Firebase and Room.

| Integration | What | Where in the tree | Notes |
|---|---|---|---|
| Firebase | Auth/Firestore | data/remote/FirebaseConfig.kt | Emulator-backed in debug |

## 4. Platform & deployment view

| Source set | Role |
|---|---|
| commonMain | Shared UI + logic |
| androidMain | Android entry point |

| Declaration | commonMain (expect) | androidMain |
|---|---|---|
| NetworkMonitor | core/connectivity/NetworkMonitor.kt | ConnectivityManager |

## 6. Runtime view

**The UDF loop:** Screen collects state, calls a use case.

1. **Cold start.** The app boots and composes the shell.
2. **Load.** A screen loads data through a use case.

## 7. Crosscutting policies

### Error handling \`[enforced: ARCH-06/07/08]\`

- **AppResult<T>** is the boundary type.
- ViewModels contain no try/catch.

## 8. Decisions & glossary

| ADR | Title | Status |
|---|---|---|
| [0001](./adr/0001-x.md) | Adopt the harness conventions | accepted |
`;

function makeDocFixtureProject(docText = DOC_FIXTURE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-arch-doc-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "ARCHITECTURE.md"), docText);
  return root;
}

test("getArchitectureDoc: {available:false} when docs/ARCHITECTURE.md is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-arch-doc-empty-"));
  try {
    const doc = getArchitectureDoc(root);
    assert.equal(doc.available, false);
    assert.match(doc.reason, /ARCHITECTURE\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getArchitectureDoc: parses the §1 quality-attribute table verbatim", () => {
  const root = makeDocFixtureProject();
  try {
    const doc = getArchitectureDoc(root);
    assert.equal(doc.available, true);
    assert.equal(doc.qualityAttributes.available, true);
    assert.deepEqual(doc.qualityAttributes.headers, ["Quality (ISO/IEC 25010)", "Scenario", "Backing"]);
    assert.equal(doc.qualityAttributes.rows.length, 2);
    assert.equal(doc.qualityAttributes.rows[0][0], "Maintainability");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getArchitectureDoc: parses §3's intro prose + integration table", () => {
  const root = makeDocFixtureProject();
  try {
    const doc = getArchitectureDoc(root);
    assert.equal(doc.systemContext.available, true);
    assert.match(doc.systemContext.intro, /Firebase and Room/);
    assert.deepEqual(doc.systemContext.table.headers, ["Integration", "What", "Where in the tree", "Notes"]);
    assert.equal(doc.systemContext.table.rows[0][0], "Firebase");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getArchitectureDoc: parses §4's source-set table AND the second (expect/actual) table", () => {
  const root = makeDocFixtureProject();
  try {
    const doc = getArchitectureDoc(root);
    assert.equal(doc.platformView.available, true);
    assert.deepEqual(doc.platformView.headers, ["Source set", "Role"]);
    assert.equal(doc.platformView.rows.length, 2);
    assert.ok(doc.platformView.expectActual);
    assert.equal(doc.platformView.expectActual.headers[0], "Declaration");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getArchitectureDoc: §6/§7 hand back raw section markdown (rendering is console-tabs.mjs's job, not this module's)", () => {
  const root = makeDocFixtureProject();
  try {
    const doc = getArchitectureDoc(root);
    assert.equal(doc.runtimeView.available, true);
    assert.match(doc.runtimeView.body, /Cold start/);
    assert.equal(doc.crosscuttingPolicies.available, true);
    assert.match(doc.crosscuttingPolicies.body, /Error handling/);
    assert.match(doc.crosscuttingPolicies.body, /ARCH-06\/07\/08/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getArchitectureDoc: parses the §8 ADR index table", () => {
  const root = makeDocFixtureProject();
  try {
    const doc = getArchitectureDoc(root);
    assert.equal(doc.decisions.available, true);
    assert.match(doc.decisions.rows[0][0], /0001/);
    assert.equal(doc.decisions.rows[0][2], "accepted");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getArchitectureDoc: a table-less §1 (edited by hand) degrades that sub-section honestly, without hiding the rest of the doc", () => {
  const root = makeDocFixtureProject(DOC_FIXTURE.replace(/\| Quality[^]*?\| \`\[advisory\]\` today \|\n\n/, ""));
  try {
    const doc = getArchitectureDoc(root);
    assert.equal(doc.available, true);
    assert.equal(doc.qualityAttributes.available, false);
    assert.match(doc.qualityAttributes.reason, /1\. Purpose/);
    assert.equal(doc.systemContext.available, true, "an unrelated section is unaffected");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getArchitectureDoc: against the REAL template/docs/ARCHITECTURE.md — every sub-section resolves, nothing crashes", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const templateDoc = path.join(here, "..", "..", "..", "template", "docs", "ARCHITECTURE.md");
  if (!fs.existsSync(templateDoc)) return; // best-effort — this package doesn't statically depend on template/
  const root = makeDocFixtureProject(fs.readFileSync(templateDoc, "utf8"));
  try {
    const doc = getArchitectureDoc(root);
    assert.equal(doc.available, true);
    assert.equal(doc.qualityAttributes.available, true);
    assert.equal(doc.systemContext.available, true);
    assert.equal(doc.platformView.available, true);
    assert.equal(doc.runtimeView.available, true);
    assert.equal(doc.crosscuttingPolicies.available, true);
    assert.equal(doc.decisions.available, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
