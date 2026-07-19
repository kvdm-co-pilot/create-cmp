// components.mjs — Design System tab's Components section: a static scan of
// presentation/components/*.kt for @Composable signatures, incl. multiline
// parameter lists and default values, plus each component's used-in list
// (call sites elsewhere under presentation/**). A signature the scanner can't
// cleanly bound is reported honestly (name + file, parseError:true) — never
// guessed at.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getComponentsData } from "../src/lib/components.mjs";

function makeFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-components-"));
  const pkgDir = path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo");
  const componentsDir = path.join(pkgDir, "presentation", "components");
  fs.mkdirSync(componentsDir, { recursive: true });
  return { root, pkgDir, componentsDir };
}

test("getComponentsData: {available:false} when there's no 'presentation' directory at all", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-components-empty-"));
  try {
    const data = getComponentsData(root);
    assert.equal(data.available, false);
    assert.match(data.reason, /presentation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: {available:false} when presentation/components doesn't exist", () => {
  const { root, pkgDir } = makeFixtureProject();
  try {
    fs.rmSync(path.join(pkgDir, "presentation", "components"), { recursive: true, force: true });
    fs.mkdirSync(path.join(pkgDir, "presentation"), { recursive: true });
    const data = getComponentsData(root);
    assert.equal(data.available, false);
    assert.match(data.reason, /presentation\/components/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: {available:true, components:[]} when the dir exists but is empty", () => {
  const { root } = makeFixtureProject();
  try {
    assert.deepEqual(getComponentsData(root), { available: true, components: [] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: single-line signature, params split correctly, used-in found across presentation/**", () => {
  const { root, pkgDir, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "AppButton.kt"),
      [
        "package com.acme.demo.presentation.components",
        "",
        "@Composable",
        "fun AppButton(text: String, onClick: () -> Unit) {",
        "  Button(onClick = onClick) { Text(text) }",
        "}",
      ].join("\n"),
    );
    const homeDir = path.join(pkgDir, "presentation", "home");
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, "HomeScreen.kt"),
      ["@Composable", "fun HomeScreen() {", '  AppButton(text = "Go", onClick = {})', "}"].join("\n"),
    );

    const data = getComponentsData(root);
    assert.equal(data.available, true);
    assert.equal(data.components.length, 1);
    const btn = data.components[0];
    assert.equal(btn.name, "AppButton");
    assert.equal(btn.file, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/AppButton.kt");
    assert.deepEqual(btn.params, ["text: String", "onClick: () -> Unit"]);
    assert.equal(btn.parseError, false);
    assert.deepEqual(btn.usedIn, ["composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: multiline parameter list with a default value containing nested parens is split correctly", () => {
  const { root, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "Card.kt"),
      [
        "package com.acme.demo.presentation.components",
        "",
        "@Composable",
        "fun Card(",
        "  title: String,",
        "  modifier: Modifier = Modifier.padding(8.dp),",
        "  content: @Composable () -> Unit = {},",
        ") {",
        "  Box(modifier) { content() }",
        "}",
      ].join("\n"),
    );
    const data = getComponentsData(root);
    assert.equal(data.available, true);
    const card = data.components.find((c) => c.name === "Card");
    assert.ok(card, "Card component found");
    assert.equal(card.parseError, false);
    assert.deepEqual(card.params, [
      "title: String",
      "modifier: Modifier = Modifier.padding(8.dp)",
      "content: @Composable () -> Unit = {}",
    ]);
    assert.deepEqual(card.usedIn, [], "no call sites elsewhere — honest empty list");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: an unclosed signature (unbalanced parens) is reported honestly — name + file, parseError:true, no guessed params", () => {
  const { root, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "Broken.kt"),
      ["package com.acme.demo.presentation.components", "", "@Composable", "fun Broken(text: String"].join("\n"),
    );
    const data = getComponentsData(root);
    assert.equal(data.available, true);
    const broken = data.components.find((c) => c.name === "Broken");
    assert.ok(broken);
    assert.equal(broken.parseError, true);
    assert.deepEqual(broken.params, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: multiple components in one file, used-in excludes the component's OWN file", () => {
  const { root, pkgDir, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "Chips.kt"),
      [
        "package com.acme.demo.presentation.components",
        "",
        "@Composable",
        "fun Chip(label: String) { Text(label) }",
        "",
        "@Composable",
        "fun ChipRow(labels: List<String>) {",
        "  labels.forEach { Chip(it) }", // self-referencing call, same file — excluded from usedIn
        "}",
      ].join("\n"),
    );
    const profileDir = path.join(pkgDir, "presentation", "profile");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      path.join(profileDir, "ProfileScreen.kt"),
      ["@Composable", "fun ProfileScreen() {", '  Chip("admin")', "}"].join("\n"),
    );

    const data = getComponentsData(root);
    const chip = data.components.find((c) => c.name === "Chip");
    const chipRow = data.components.find((c) => c.name === "ChipRow");
    assert.deepEqual(chip.usedIn, [
      "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/profile/ProfileScreen.kt",
    ]);
    assert.deepEqual(chipRow.usedIn, [], "no call sites for ChipRow outside its own file");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
