import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { loadTree } from "../src/lib/tree.mjs";
import { findDrift, diffAgainstDesignSystem } from "../src/lib/drift.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tree = loadTree(join(here, "..", "fixtures", "tree.json"));
const catalog = JSON.parse(
  readFileSync(join(here, "..", "fixtures", "design-system.json"), "utf8")
);

test("findDrift catches the un-tokenized text node", () => {
  const drift = findDrift(tree);
  const tags = drift.map((d) => d.testTag);
  assert.ok(tags.includes("home_subtitle_raw"), "should flag the untokenized subtitle");
});

test("findDrift does NOT flag tokenized nodes", () => {
  const drift = findDrift(tree);
  const tags = drift.map((d) => d.testTag);
  assert.ok(!tags.includes("home_title"));
  assert.ok(!tags.includes("card_one"));
  assert.ok(!tags.includes("card_two"));
});

test("findDrift includes path, bounds and a reason", () => {
  const entry = findDrift(tree).find((d) => d.testTag === "home_subtitle_raw");
  assert.equal(entry.path, "root.children[1]");
  assert.equal(entry.bounds.width, 328);
  assert.match(entry.reason, /un-tokenized/);
});

test("diffAgainstDesignSystem catches the contradicting radius on card_two", () => {
  const drift = diffAgainstDesignSystem(tree, catalog);
  const hit = drift.find((d) => d.token === "RadiusCard" && d.path === "root.children[3]");
  assert.ok(hit, "card_two RadiusCard (24dp) should contradict declared 16dp");
  assert.equal(hit.declared, "16dp");
  assert.match(hit.resolved, /24dp/);
});

test("diffAgainstDesignSystem passes clean tokenized nodes (card_one)", () => {
  const drift = diffAgainstDesignSystem(tree, catalog);
  // card_one radius=16dp matches RadiusCard=16dp; Surface=#FFFFFF matches.
  const cardOne = drift.filter((d) => d.path === "root.children[2]");
  assert.equal(cardOne.length, 0, "card_one should not drift");
});

test("diffAgainstDesignSystem is case-insensitive on colors and ignores unknown tokens", () => {
  const t = {
    schemaVersion: 1,
    source: "t",
    root: {
      testTag: "n",
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      designToken: { tokens: ["Surface", "SomeUnknownToken"], resolved: { color: "#ffffff" } },
      children: [],
    },
  };
  const drift = diffAgainstDesignSystem(t, catalog);
  assert.equal(drift.length, 0, "#ffffff should match #FFFFFF, unknown token ignored");
});
