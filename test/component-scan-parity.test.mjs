// R7 parity pin — the component-scan mirror between the template's lane gate
// (template/qa/lib/component-stories.mjs) and the console's components scan
// (inspector/mcp/src/lib/components.mjs). The two packages CANNOT import each
// other in shipped form (the template goes out standalone; inspector/mcp owns
// the console), so each carries its own copy of the kebab-case derivation and
// the @Composable-window scan heuristic, with sync-comments on both sides.
// Sync-comments alone don't stop drift — this repo-root test does: it imports
// BOTH copies and pins them to identical behavior over vectors chosen to
// expose divergence (consecutive capitals, digits, generics before/after the
// name, object members, expression bodies). If one side changes, this fails
// naming the other side to update.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  kebabCase as templateKebabCase,
  componentStoryId as templateStoryId,
  findComposableNames,
} from "../template/qa/lib/component-stories.mjs";
import {
  kebabCase as inspectorKebabCase,
  componentStoryId as inspectorStoryId,
  getComponentsData,
} from "../inspector/mcp/src/lib/components.mjs";

const NAME_VECTORS = [
  "AppHeader",
  "AppPrimaryButton",
  "ContentStateContainer",
  "ListItemCard",
  "NavItem",
  "Spinner",
  "HTTPHeader", // consecutive capitals
  "AppB2BCard", // digit between capitals
  "Screen1Column", // digit between words
  "AppUIState", // acronym mid-word
  "A", // single letter
  "AB", // all caps, short
];

test("kebabCase parity: template and inspector derive identical ids for every vector", () => {
  for (const name of NAME_VECTORS) {
    assert.equal(
      templateKebabCase(name),
      inspectorKebabCase(name),
      `kebabCase("${name}") diverged — template/qa/lib/component-stories.mjs and inspector/mcp/src/lib/components.mjs must stay in sync`,
    );
    assert.equal(
      templateStoryId(name),
      inspectorStoryId(name),
      `componentStoryId("${name}") diverged between the template gate and the console scan`,
    );
  }
});

// One fixture file exercising the scan heuristic's edge shapes. Both scanners
// must agree on WHICH composables exist in it — the lane gate requires a story
// per name it finds, and the console renders a card per name it finds; a
// disagreement means a component card with no story requirement (or vice versa).
const FIXTURE_KT = `package com.acme.demo.presentation.components

import androidx.compose.runtime.Composable

/** Plain component. */
@Composable
fun AppHeader(title: String) {
    Text(title)
}

/** Generic BEFORE the name (the real ContentStateContainer shape). */
@Composable
fun <T> ContentStateContainer(state: T, screenTag: String) {
    Box {}
}

object AppButtonDefaults {
    /** Object member. */
    @Composable
    fun Primary(onClick: () -> Unit) {
        Button(onClick) {}
    }

    @Composable
    internal fun Secondary(onClick: () -> Unit = {}) {
        Button(onClick) {}
    }
}

/** Expression body. */
@Composable
private fun Divider(modifier: Modifier = Modifier) = HorizontalDivider(modifier)
`;

test("composable-scan parity: both heuristics find the same composable names in the same source", () => {
  const templateNames = [...findComposableNames(FIXTURE_KT)].sort();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-scan-parity-"));
  try {
    const componentsDir = path.join(
      root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo", "presentation", "components",
    );
    fs.mkdirSync(componentsDir, { recursive: true });
    fs.writeFileSync(path.join(componentsDir, "Fixture.kt"), FIXTURE_KT);

    const data = getComponentsData(root);
    assert.equal(data.available, true);
    const inspectorNames = data.components.map((c) => c.name).sort();

    assert.deepEqual(
      inspectorNames,
      templateNames,
      "the @Composable scan heuristics diverged — template/qa/lib/component-stories.mjs (findComposableNames) and inspector/mcp/src/lib/components.mjs (scanComposables) must stay in sync",
    );
    // The heuristic itself must actually see the edge shapes, or this pin is vacuous.
    assert.deepEqual(templateNames, ["AppHeader", "ContentStateContainer", "Divider", "Primary", "Secondary"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
