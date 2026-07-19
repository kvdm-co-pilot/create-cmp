// handrolled-state.mjs — a console-side mirror of the ARCH-11 gate concept
// (docs/proposals/component-system-deep-dive.md §6.4): presentation/** files
// outside components/ that reference a raw M3 progress indicator directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getHandRolledStateViolations } from "../src/lib/handrolled-state.mjs";

function makeFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-arch11-"));
  const pkgDir = path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo");
  fs.mkdirSync(pkgDir, { recursive: true });
  return { root, pkgDir };
}

test("getHandRolledStateViolations: {available:false} when there's no 'presentation' directory at all", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-arch11-empty-"));
  try {
    const data = getHandRolledStateViolations(root);
    assert.equal(data.available, false);
    assert.match(data.reason, /presentation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getHandRolledStateViolations: {available:true, violations:[]} when nothing hand-rolls a progress indicator", () => {
  const { root, pkgDir } = makeFixtureProject();
  try {
    const homeDir = path.join(pkgDir, "presentation", "home");
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, "HomeScreen.kt"),
      ["@Composable", "fun HomeScreen() { ContentStateContainer(state = state, screenTag = \"home\") { } }"].join("\n"),
    );
    assert.deepEqual(getHandRolledStateViolations(root), { available: true, violations: [] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getHandRolledStateViolations: flags a screen that references CircularProgressIndicator directly, with line numbers", () => {
  const { root, pkgDir } = makeFixtureProject();
  try {
    const homeDir = path.join(pkgDir, "presentation", "home");
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, "HomeScreen.kt"),
      [
        "@Composable",
        "fun HomeScreen() {",
        "  if (loading) {",
        "    CircularProgressIndicator()",
        "  }",
        "}",
      ].join("\n"),
    );
    const data = getHandRolledStateViolations(root);
    assert.equal(data.available, true);
    assert.equal(data.violations.length, 1);
    assert.equal(data.violations[0].file, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt");
    assert.deepEqual(data.violations[0].indicators, [{ name: "CircularProgressIndicator", lines: [4] }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getHandRolledStateViolations: EXCLUDES presentation/components/** — that's where these indicators are SUPPOSED to live", () => {
  const { root, pkgDir } = makeFixtureProject();
  try {
    const componentsDir = path.join(pkgDir, "presentation", "components");
    fs.mkdirSync(componentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(componentsDir, "ContentStateContainer.kt"),
      ["@Composable", "fun Spinner() { CircularProgressIndicator() }"].join("\n"),
    );
    assert.deepEqual(getHandRolledStateViolations(root), { available: true, violations: [] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getHandRolledStateViolations: both indicator names are detected independently, multiple hits collect multiple line numbers", () => {
  const { root, pkgDir } = makeFixtureProject();
  try {
    const detailDir = path.join(pkgDir, "presentation", "detail");
    fs.mkdirSync(detailDir, { recursive: true });
    fs.writeFileSync(
      path.join(detailDir, "DetailScreen.kt"),
      [
        "@Composable",
        "fun DetailScreen() {",
        "  LinearProgressIndicator()",
        "  if (x) CircularProgressIndicator()",
        "  if (y) CircularProgressIndicator()",
        "}",
      ].join("\n"),
    );
    const data = getHandRolledStateViolations(root);
    const entry = data.violations[0];
    const byName = Object.fromEntries(entry.indicators.map((i) => [i.name, i.lines]));
    assert.deepEqual(byName.LinearProgressIndicator, [3]);
    assert.deepEqual(byName.CircularProgressIndicator, [4, 5]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
