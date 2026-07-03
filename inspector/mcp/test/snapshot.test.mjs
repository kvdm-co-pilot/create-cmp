import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadTree } from "../src/lib/tree.mjs";
import { normalizeTree, diffTrees } from "../src/lib/snapshot.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TREE = join(here, "..", "fixtures", "tree.json");

const clone = (o) => JSON.parse(JSON.stringify(o));

test("normalizeTree drops source, rounds bounds, sorts resolved keys", () => {
  const raw = {
    schemaVersion: 1,
    source: "headless-jvm",
    root: {
      testTag: "n",
      bounds: { x: 16.4, y: 15.6, width: 100.49, height: 47.5 },
      designToken: { tokens: ["T"], resolved: { zeta: "1dp", alpha: "2dp" } },
      children: [],
    },
  };
  const n = normalizeTree(raw);
  assert.equal(n.source, undefined);
  assert.deepEqual(n.root.bounds, { x: 16, y: 16, width: 100, height: 48 });
  assert.deepEqual(Object.keys(n.root.designToken.resolved), ["alpha", "zeta"]);
  // nullable fields materialize as null; optional fields stay absent
  assert.equal(n.root.text, null);
  assert.equal("clickable" in n.root, false);
});

test("normalizeTree keeps optional fields when present", () => {
  const n = normalizeTree({
    schemaVersion: 1,
    root: { testTag: "n", role: "Button", clickable: true, disabled: false, bounds: { x: 0, y: 0, width: 1, height: 1 }, children: [] },
  });
  assert.equal(n.root.role, "Button");
  assert.equal(n.root.clickable, true);
  assert.equal(n.root.disabled, false);
});

test("diffTrees: identical tree diffs empty (raw vs normalized golden)", () => {
  const tree = loadTree(TREE);
  const golden = normalizeTree(tree);
  assert.deepEqual(diffTrees(tree, golden), []);
});

test("diffTrees catches a text change with before/after", () => {
  const golden = loadTree(TREE);
  const current = clone(golden);
  current.root.children[0].text = "Hello";
  const diffs = diffTrees(current, golden);
  assert.equal(diffs.length, 1);
  assert.deepEqual(diffs[0], {
    path: "root.children[0]",
    kind: "text-changed",
    before: "Home",
    after: "Hello",
  });
});

test("diffTrees catches a testTag change", () => {
  const golden = loadTree(TREE);
  const current = clone(golden);
  current.root.children[0].testTag = "renamed_title";
  const diffs = diffTrees(current, golden);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "testTag-changed");
  assert.equal(diffs[0].before, "home_title");
  assert.equal(diffs[0].after, "renamed_title");
});

test("diffTrees catches a designToken change", () => {
  const golden = loadTree(TREE);
  const current = clone(golden);
  current.root.children[2].designToken.resolved.radius = "24dp";
  const diffs = diffTrees(current, golden);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "designToken-changed");
  assert.equal(diffs[0].path, "root.children[2]");
  assert.equal(diffs[0].before.resolved.radius, "16dp");
  assert.equal(diffs[0].after.resolved.radius, "24dp");
});

test("diffTrees bounds tolerance: 1px move passes at default, fails at tolerance 0", () => {
  const golden = loadTree(TREE);
  const current = clone(golden);
  current.root.children[0].bounds.y += 1; // exactly tolerance
  assert.deepEqual(diffTrees(current, golden), []); // default tolerancePx=1
  const strict = diffTrees(current, golden, 0);
  assert.equal(strict.length, 1);
  assert.equal(strict[0].kind, "bounds-moved");
});

test("diffTrees flags a move beyond tolerance with before/after bounds", () => {
  const golden = loadTree(TREE);
  const current = clone(golden);
  current.root.children[3].bounds.x += 5;
  const diffs = diffTrees(current, golden);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "bounds-moved");
  assert.equal(diffs[0].path, "root.children[3]");
  assert.equal(diffs[0].before.x, 16);
  assert.equal(diffs[0].after.x, 21);
});

test("diffTrees reports node-added and node-removed by path", () => {
  const golden = loadTree(TREE);

  const added = clone(golden);
  added.root.children.push({
    testTag: "new_banner",
    text: "New!",
    bounds: { x: 0, y: 400, width: 360, height: 40 },
    children: [],
  });
  const addDiffs = diffTrees(added, golden);
  assert.equal(addDiffs.length, 1);
  assert.equal(addDiffs[0].kind, "node-added");
  assert.equal(addDiffs[0].path, "root.children[4]");
  assert.equal(addDiffs[0].after.testTag, "new_banner");
  assert.equal(addDiffs[0].before, null);

  const removed = clone(golden);
  removed.root.children[2].children = [];
  const rmDiffs = diffTrees(removed, golden);
  assert.equal(rmDiffs.length, 1);
  assert.equal(rmDiffs[0].kind, "node-removed");
  assert.equal(rmDiffs[0].path, "root.children[2].children[0]");
  assert.equal(rmDiffs[0].before.testTag, "card_one_label");
});

test("diffTrees catches a clickable regression", () => {
  const golden = loadTree(TREE);
  const current = clone(golden);
  current.root.children[2].clickable = false; // card_one lost its click handler
  const diffs = diffTrees(current, golden);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "clickable-changed");
  assert.equal(diffs[0].before, true);
  assert.equal(diffs[0].after, false);
});

test("diffTrees: optional-field absence is graceful (old golden vs new dump)", () => {
  // Golden saved before the contract extension: no role/clickable/disabled anywhere.
  const oldGolden = {
    schemaVersion: 1,
    root: { testTag: "n", text: "x", bounds: { x: 0, y: 0, width: 10, height: 10 }, designToken: null, children: [] },
  };
  // New dump carries the explicit neutral values.
  const newDump = {
    schemaVersion: 1,
    source: "headless-jvm",
    root: {
      testTag: "n", text: "x", role: null, clickable: false, disabled: false,
      bounds: { x: 0, y: 0, width: 10, height: 10 }, designToken: null, children: [],
    },
  };
  assert.deepEqual(diffTrees(newDump, oldGolden), []);
});
