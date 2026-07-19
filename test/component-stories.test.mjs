// Component ↔ story parity (STUDIO-REDESIGN.md §3.3): every @Composable in
// presentation/components carries a preview-registry story with a derivable
// `component.<kebab-name>` id, enforced by the template's own lane step
// (qa/lib/component-stories.mjs). These tests cover the gate's decision
// logic (positive, negative-with-the-right-message, orphan, honest SKIPs),
// the SHIPPED template's parity (the static ComponentStories.kt must cover
// the whole registry), and the generated PreviewRegistry.kt wiring —
// `+ componentStories()` always, plus the conditional PlaceholderScreen
// story exactly when a custom tab writes PlaceholderScreen.kt into the
// components dir.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateComponentStoryParity,
  componentStoryId,
  kebabCase,
  findComposableNames,
} from "../template/qa/lib/component-stories.mjs";
import { tabInfos, renderPreviewRegistryKt } from "../src/lib/tabs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, "..", "template");

const DEFAULT_TABS = [
  { label: "Home", icon: "home" },
  { label: "Profile", icon: "person" },
];

// --- id derivation ----------------------------------------------------------

test("kebabCase/componentStoryId: ids derive mechanically from the composable name", () => {
  assert.equal(kebabCase("AppHeader"), "app-header");
  assert.equal(kebabCase("AppPrimaryButton"), "app-primary-button");
  assert.equal(kebabCase("ContentStateContainer"), "content-state-container");
  assert.equal(kebabCase("NavItem"), "nav-item");
  assert.equal(kebabCase("Spinner"), "spinner");
  assert.equal(componentStoryId("ListItemCard"), "component.list-item-card");
});

test("findComposableNames: counts every @Composable fun, including internal/private and object members", () => {
  const text = `
/** doc */
@Composable
fun AppHeader(title: String) {}

@Composable
internal fun NavItem(label: String) {}

object Defaults {
    @Composable
    fun Spinner(tag: String) {}
}

fun notComposable() {}
`;
  assert.deepEqual(findComposableNames(text), ["AppHeader", "NavItem", "Spinner"]);
});

// --- the gate's decision logic on fixtures ----------------------------------

function fixture({ components = {}, inspector = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-story-parity-"));
  const componentsDir = path.join(
    root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo", "presentation", "components",
  );
  const inspectorDir = path.join(
    root, "composeApp", "src", "desktopMain", "kotlin", "com", "acme", "demo", "inspector",
  );
  if (components !== null) {
    fs.mkdirSync(componentsDir, { recursive: true });
    for (const [name, text] of Object.entries(components)) {
      fs.writeFileSync(path.join(componentsDir, name), text);
    }
  }
  if (inspector !== null) {
    fs.mkdirSync(inspectorDir, { recursive: true });
    for (const [name, text] of Object.entries(inspector)) {
      fs.writeFileSync(path.join(inspectorDir, name), text);
    }
  }
  return root;
}

const WIDGET_KT = `package com.acme.demo.presentation.components

import androidx.compose.runtime.Composable

@Composable
fun Widget(title: String) {}
`;

test("parity gate: component with a matching story -> PASS", () => {
  const root = fixture({
    components: { "Widget.kt": WIDGET_KT },
    inspector: { "ComponentStories.kt": `fun componentStories() = listOf(story("component.widget", "Widget"))` },
  });
  try {
    const r = evaluateComponentStoryParity(root);
    assert.equal(r.verdict, "PASS");
    assert.equal(r.details.components, 1);
    assert.equal(r.details.stories, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parity gate: component with NO story -> FAIL naming the component and the expected id", () => {
  const root = fixture({
    components: { "Widget.kt": WIDGET_KT },
    inspector: { "ComponentStories.kt": `fun componentStories() = emptyList<ScreenPreview>()` },
  });
  try {
    const r = evaluateComponentStoryParity(root);
    assert.equal(r.verdict, "FAIL");
    assert.match(r.reason, /\[Widget\]/, "names the component");
    assert.match(r.reason, /component\.widget/, "names the expected story id");
    assert.match(r.reason, /ComponentStories\.kt/, "names where to add it");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parity gate: a story id with no matching component -> FAIL (stale story, both directions like specCoverage)", () => {
  const root = fixture({
    components: { "Widget.kt": WIDGET_KT },
    inspector: {
      "ComponentStories.kt": `fun componentStories() = listOf(story("component.widget", "W"), story("component.ghost", "G"))`,
    },
  });
  try {
    const r = evaluateComponentStoryParity(root);
    assert.equal(r.verdict, "FAIL");
    assert.match(r.reason, /"component\.ghost"/);
    assert.match(r.reason, /no matching @Composable/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parity gate: honest SKIPs — no components dir, or no desktopMain inspector sources", () => {
  const noComponents = fixture({ components: null, inspector: { "PreviewRegistry.kt": "" } });
  const noInspector = fixture({ components: { "Widget.kt": WIDGET_KT }, inspector: null });
  try {
    assert.equal(evaluateComponentStoryParity(noComponents).verdict, "SKIP");
    const r = evaluateComponentStoryParity(noInspector);
    assert.equal(r.verdict, "SKIP");
    assert.match(r.reason, /inspector/);
  } finally {
    fs.rmSync(noComponents, { recursive: true, force: true });
    fs.rmSync(noInspector, { recursive: true, force: true });
  }
});

// --- the shipped template ---------------------------------------------------

test("shipped template: every registry composable has a story (the static ComponentStories.kt covers the whole registry)", () => {
  const r = evaluateComponentStoryParity(TEMPLATE);
  assert.equal(r.verdict, "PASS", r.reason);
  assert.equal(r.details.components, r.details.stories);
  assert.ok(r.details.components >= 14, `expected the 14 registry composables, saw ${r.details.components}`);
});

test("shipped template: story ids are well-formed `component.<kebab>` (dot-separated, filesystem-safe on Windows)", () => {
  const stories = fs.readFileSync(
    path.join(TEMPLATE, "composeApp", "src", "desktopMain", "kotlin", "com", "example", "app", "inspector", "ComponentStories.kt"),
    "utf8",
  );
  const ids = [...stories.matchAll(/"(component\.[^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 14);
  for (const id of ids) {
    assert.match(id, /^component\.[a-z0-9]+(?:-[a-z0-9]+)*$/, `${id} is kebab-case after the dot`);
    assert.ok(!id.includes(":"), `${id} carries no colon (Windows path safety)`);
  }
});

// --- generated registry wiring ----------------------------------------------

test("renderPreviewRegistryKt: default tabs stay byte-identical to the static template file (which now appends componentStories())", () => {
  const generated = renderPreviewRegistryKt(tabInfos(DEFAULT_TABS));
  const statik = fs.readFileSync(
    path.join(TEMPLATE, "composeApp", "src", "desktopMain", "kotlin", "com", "example", "app", "inspector", "PreviewRegistry.kt"),
    "utf8",
  );
  assert.equal(generated, statik);
  assert.match(generated, /\) \+ componentStories\(\)/);
  assert.ok(!generated.includes("placeholderScreenStories"), "no placeholder story without a placeholder tab");
});

test("renderPreviewRegistryKt: a custom tab (which writes PlaceholderScreen.kt into the registry) also gets the PlaceholderScreen story", () => {
  const generated = renderPreviewRegistryKt(
    tabInfos([
      { label: "Feed", icon: "star" },
      { label: "Settings", icon: "settings" },
    ]),
  );
  assert.match(generated, /\) \+ componentStories\(\) \+ placeholderScreenStories\(\)/);
  assert.match(generated, /"component\.placeholder-screen"/);
  assert.match(generated, /StoryHost \{ PlaceholderScreen\(/);
});
