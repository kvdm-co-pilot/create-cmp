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

// --- CV-1 W3b: signature extraction (kdoc, paramsParsed, facts, usedInScreens) ---

test("getComponentsData: kdoc is extracted verbatim from the doc comment directly above @Composable; absent when there isn't one", () => {
  const { root, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "AppHeader.kt"),
      [
        "package com.acme.demo.presentation.components",
        "",
        "/**",
        " * The screen header — replaces the three hand-copied headline `Text`s.",
        " *",
        " * Deliberately not an M3 TopAppBar.",
        " */",
        "@Composable",
        "fun AppHeader(title: String, screenTag: String) { Text(title) }",
        "",
        "@Composable",
        "fun Undocumented() { Text(\"hi\") }",
      ].join("\n"),
    );
    const data = getComponentsData(root);
    const header = data.components.find((c) => c.name === "AppHeader");
    assert.equal(
      header.kdoc,
      "The screen header — replaces the three hand-copied headline `Text`s.\n\nDeliberately not an M3 TopAppBar.",
    );
    const undocumented = data.components.find((c) => c.name === "Undocumented");
    assert.equal(undocumented.kdoc, null, "no comment directly above -> null, never a guess");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: paramsParsed splits name/type/default per parameter, preserving scanned order", () => {
  const { root, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "ListItemCard.kt"),
      [
        "package com.acme.demo.presentation.components",
        "@Composable",
        "fun ListItemCard(",
        "  title: String,",
        "  onClick: () -> Unit,",
        "  modifier: Modifier = Modifier,",
        "  subtitle: String? = null,",
        ") { }",
      ].join("\n"),
    );
    const data = getComponentsData(root);
    const card = data.components.find((c) => c.name === "ListItemCard");
    assert.deepEqual(card.paramsParsed, [
      { raw: "title: String", name: "title", type: "String", default: null },
      { raw: "onClick: () -> Unit", name: "onClick", type: "() -> Unit", default: null },
      { raw: "modifier: Modifier = Modifier", name: "modifier", type: "Modifier", default: "Modifier" },
      { raw: "subtitle: String? = null", name: "subtitle", type: "String?", default: "null" },
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: facts are derived from the component's OWN body — screenTag tags, a11y floor, tokens, designToken self-report", () => {
  const { root, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "ScreenColumn.kt"),
      [
        "package com.acme.demo.presentation.components",
        "@Composable",
        "fun ScreenColumn(screenTag: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {",
        "  val base = modifier",
        '    .semantics { testTag = "${screenTag}_screen" }',
        "    .designToken(tokens = listOf(\"PaddingPage\"), resolved = mapOf(\"padding\" to \"16dp\"))",
        "    .padding(AppTokens.PaddingPage)",
        "  Column(base, content = content)",
        "}",
      ].join("\n"),
    );
    const data = getComponentsData(root);
    const col = data.components.find((c) => c.name === "ScreenColumn");
    assert.deepEqual(col.facts.derivedTags, ["screen"]);
    assert.equal(col.facts.selfReportsDesignToken, true);
    assert.deepEqual(col.facts.tokensReferenced, ["AppTokens.PaddingPage"]);
    assert.deepEqual(col.facts.a11yFloorEvidence, [], "no a11y evidence in this body -> empty, not fabricated");
    assert.deepEqual(col.facts.contentUiStateArms, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: facts are scoped PER COMPOSABLE — a sibling's a11y floor/tags don't bleed into another composable in the same file", () => {
  const { root, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "AppButton.kt"),
      [
        "package com.acme.demo.presentation.components",
        "@Composable",
        "fun AppPrimaryButton(text: String, onClick: () -> Unit) {",
        "  Button(onClick = onClick, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)) { Text(text) }",
        "}",
        "@Composable",
        "fun Decorative() {",
        "  Box(Modifier.size(4.dp))",
        "}",
      ].join("\n"),
    );
    const data = getComponentsData(root);
    const btn = data.components.find((c) => c.name === "AppPrimaryButton");
    const decorative = data.components.find((c) => c.name === "Decorative");
    assert.deepEqual(btn.facts.a11yFloorEvidence, ["48.dp"]);
    assert.deepEqual(decorative.facts.a11yFloorEvidence, [], "Decorative's own body has no 48dp — not inherited from its sibling");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: facts pick up ContentUiState arms and insets APIs when present in the body", () => {
  const { root, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "ContentStateContainer.kt"),
      [
        "package com.acme.demo.presentation.components",
        "@Composable",
        "fun <T> ContentStateContainer(state: ContentUiState<T>, screenTag: String, content: @Composable (T) -> Unit) {",
        "  when (state) {",
        "    is ContentUiState.Loading -> {}",
        "    is ContentUiState.Error -> {}",
        "    is ContentUiState.Empty -> {}",
        "    is ContentUiState.Content -> content(state.data)",
        "  }",
        "}",
        "@Composable",
        "fun BaseScreen(content: @Composable () -> Unit) {",
        "  Box(Modifier.statusBarsPadding().navigationBarsPadding()) { content() }",
        "}",
      ].join("\n"),
    );
    const data = getComponentsData(root);
    const container = data.components.find((c) => c.name === "ContentStateContainer");
    assert.deepEqual(container.facts.contentUiStateArms.sort(), ["Content", "Empty", "Error", "Loading"]);
    const base = data.components.find((c) => c.name === "BaseScreen");
    assert.deepEqual(base.facts.insetsApis.sort(), ["navigationBarsPadding", "statusBarsPadding"]);
    assert.deepEqual(base.facts.contentUiStateArms, [], "BaseScreen doesn't reference ContentUiState — none fabricated");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: usedInScreens is the *Screen.kt subset of usedIn", () => {
  const { root, pkgDir, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "AppButton.kt"),
      ["package com.acme.demo.presentation.components", "@Composable", "fun AppButton() { }"].join("\n"),
    );
    const homeDir = path.join(pkgDir, "presentation", "home");
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, "HomeScreen.kt"),
      ["@Composable", "fun HomeScreen() { AppButton() }"].join("\n"),
    );
    fs.writeFileSync(
      path.join(homeDir, "HomeViewModel.kt"),
      ["// not a screen, but could reference the name in a comment: AppButton()"].join("\n"),
    );
    const data = getComponentsData(root);
    const btn = data.components.find((c) => c.name === "AppButton");
    assert.deepEqual(btn.usedInScreens, [
      "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/home/HomeScreen.kt",
    ]);
    assert.equal(btn.usedIn.length, 2, "usedIn (unfiltered) still includes the non-screen file");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getComponentsData: an unclosed signature still reports honest empty facts/kdoc/paramsParsed, never a guess", () => {
  const { root, componentsDir } = makeFixtureProject();
  try {
    fs.writeFileSync(
      path.join(componentsDir, "Broken.kt"),
      ["package com.acme.demo.presentation.components", "@Composable", "fun Broken(text: String"].join("\n"),
    );
    const data = getComponentsData(root);
    const broken = data.components.find((c) => c.name === "Broken");
    assert.equal(broken.parseError, true);
    assert.deepEqual(broken.paramsParsed, []);
    assert.deepEqual(broken.facts.derivedTags, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
