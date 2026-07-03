import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadTree } from "../src/lib/tree.mjs";
import { getNode, assertToken, layoutGaps } from "../src/lib/query.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tree = loadTree(join(here, "..", "fixtures", "tree.json"));

test("getNode hits by testTag", () => {
  const node = getNode(tree, "home_title");
  assert.ok(node);
  assert.equal(node.text, "Home");
  assert.equal(node.bounds.width, 328);
});

test("getNode misses cleanly", () => {
  assert.equal(getNode(tree, "does_not_exist"), null);
});

test("assertToken passes when resolved value matches", () => {
  const node = getNode(tree, "card_one");
  const r = assertToken(node, "radius", "16dp");
  assert.equal(r.pass, true);
  assert.equal(r.actual, "16dp");
  assert.equal(r.expected, "16dp");
});

test("assertToken fails when resolved value differs", () => {
  const node = getNode(tree, "card_two");
  const r = assertToken(node, "radius", "16dp");
  assert.equal(r.pass, false);
  assert.equal(r.actual, "24dp");
});

test("assertToken fails gracefully on missing key / null node", () => {
  const node = getNode(tree, "card_one");
  const r = assertToken(node, "nonexistentKey", "x");
  assert.equal(r.pass, false);
  assert.equal(r.actual, null);

  const r2 = assertToken(null, "radius", "16dp");
  assert.equal(r2.pass, false);
  assert.equal(r2.actual, null);
});

test("layoutGaps computes vertical gap and deltas between stacked nodes", () => {
  // home_title: y=16 h=40 (bottom=56). home_subtitle_raw: y=64 h=20.
  const a = getNode(tree, "home_title");
  const b = getNode(tree, "home_subtitle_raw");
  const g = layoutGaps(a, b);
  assert.equal(g.gapY, 8); // 64 - (16+40)
  assert.equal(g.gapX, 0); // same x-span, overlapping horizontally
  assert.equal(g.dxLeft, 0); // both x=16
  assert.equal(g.dyTop, 48); // 64 - 16
});

test("layoutGaps computes horizontal gap for side-by-side boxes", () => {
  const a = { bounds: { x: 0, y: 0, width: 100, height: 50 } };
  const b = { bounds: { x: 120, y: 0, width: 100, height: 50 } };
  const g = layoutGaps(a, b);
  assert.equal(g.gapX, 20); // 120 - 100
  assert.equal(g.gapY, 0);
  assert.equal(g.dxLeft, 120);
});

test("layoutGaps throws a clear error when bounds are missing", () => {
  assert.throws(() => layoutGaps({}, getNode(tree, "home_title")), /no bounds/);
});
