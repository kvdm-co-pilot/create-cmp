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
import { getLayerMap, getGovernedContract, getFeatureShape, getArchitectureData } from "../src/lib/architecture.mjs";

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

test("getArchitectureData: bundles all three sections in one call", () => {
  const root = makeFixtureProject();
  try {
    const data = getArchitectureData(root);
    assert.equal(data.layerMap.available, true);
    assert.equal(data.governedContract.available, true);
    assert.equal(data.featureShape.available, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
