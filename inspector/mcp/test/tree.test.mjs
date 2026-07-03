import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadTree, walk, findByTestTag } from "../src/lib/tree.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TREE = join(here, "..", "fixtures", "tree.json");

test("loadTree loads from a file path", () => {
  const tree = loadTree(TREE);
  assert.equal(tree.schemaVersion, 1);
  assert.equal(tree.root.testTag, "home_root");
});

test("loadTree accepts an already-parsed object", () => {
  const obj = { schemaVersion: 1, source: "x", root: { testTag: "r", children: [] } };
  const tree = loadTree(obj);
  assert.equal(tree.root.testTag, "r");
});

test("loadTree accepts a JSON string", () => {
  const tree = loadTree('{"schemaVersion":1,"source":"x","root":{"testTag":"r","children":[]}}');
  assert.equal(tree.root.testTag, "r");
});

test("loadTree throws a clear error on a missing file", () => {
  assert.throws(() => loadTree("/no/such/tree.json"), /not found/);
});

test("loadTree throws a clear error when root is missing", () => {
  assert.throws(() => loadTree({ schemaVersion: 1 }), /no 'root'/);
});

test("walk yields every node with a stable dotted path", () => {
  const tree = loadTree(TREE);
  const entries = [...walk(tree)];
  const paths = entries.map((e) => e.path);
  assert.equal(entries.length, 7); // root + 4 direct children + 2 card labels
  assert.equal(paths[0], "root");
  assert.ok(paths.includes("root.children[0]"));
  assert.ok(paths.includes("root.children[2].children[0]"));
});

test("findByTestTag returns node+path on hit, null on miss", () => {
  const tree = loadTree(TREE);
  const hit = findByTestTag(tree, "card_two");
  assert.ok(hit);
  assert.equal(hit.node.testTag, "card_two");
  assert.equal(hit.path, "root.children[3]");
  assert.equal(findByTestTag(tree, "nope"), null);
});
