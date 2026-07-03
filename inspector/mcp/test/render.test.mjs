import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadTree } from "../src/lib/tree.mjs";
import { auditA11y } from "../src/lib/a11y.mjs";
import { renderTreeSvg, countRenderable } from "../src/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tree = loadTree(join(here, "..", "fixtures", "tree.json"));
const a11yTree = loadTree(join(here, "..", "fixtures", "a11y-tree.json"));

const count = (s, re) => (s.match(re) || []).length;

test("every footprint node becomes exactly one base rect", () => {
  const svg = renderTreeSvg(tree);
  const { total, drawn } = countRenderable(tree);
  assert.equal(total, 7, "fixture has 7 nodes");
  assert.equal(drawn, 7, "all 7 have non-zero bounds");
  // base rects carry data-path; overlays (clickable/chip/a11y) do not.
  assert.equal(count(svg, /data-path="/g), drawn);
});

test("token-annotated nodes carry a resolved-values chip", () => {
  const svg = renderTreeSvg(tree);
  // card_one/card_two: resolved { color:#FFFFFF, radius:16dp/24dp } -> sorted keys
  assert.ok(svg.includes("color #FFFFFF · radius 16"), "card chip text present");
  assert.ok(svg.includes("radius 24"), "drifting card's chip shows its own value");
  // root: resolved { padding:16dp } -> abbreviated
  assert.ok(svg.includes(">pad 16<"), "padding chip abbreviated to 'pad 16'");
  // tokenized nodes are visually distinct + chips are marked
  assert.equal(count(svg, /class="tokenized"/g), 6, "6 of 7 fixture nodes are tokenized");
  assert.ok(count(svg, /class="token-chip-text"/g) >= 6);
});

test("clickable nodes get the distinct outline", () => {
  const svg = renderTreeSvg(tree);
  // card_one + card_two are clickable:true in the fixture
  assert.equal(count(svg, /class="clickable"/g), 2);
  assert.ok(svg.includes('stroke-dasharray="5 3"'), "outline is dashed to stand apart");
});

test("testTags render as mono labels; text nodes show their text", () => {
  const svg = renderTreeSvg(tree);
  assert.ok(svg.includes(">home_title<"), "testTag label present");
  assert.ok(svg.includes(">Home<"), "node text present");
  assert.ok(svg.includes(">Card One<"));
});

test("legend row and footer line are emitted", () => {
  const svg = renderTreeSvg(tree);
  assert.ok(svg.includes('class="legend"'));
  assert.ok(svg.includes(">tokenized<") && svg.includes(">clickable<"));
  assert.ok(
    svg.includes("7 nodes · headless-jvm · schemaVersion 1"),
    "footer: <nodeCount> nodes · <source> · schemaVersion <n>"
  );
});

test("a11y overlay adds danger marks for each violated node", () => {
  const audit = auditA11y(a11yTree);
  assert.ok(audit.violations.length > 0, "fixture plants violations");
  const plain = renderTreeSvg(a11yTree);
  const overlaid = renderTreeSvg(a11yTree, { a11y: audit });
  assert.equal(count(plain, /class="a11y-violation"/g), 0);
  // icon_unlabeled has 2 violations on ONE node -> one danger rect + one label
  assert.equal(count(overlaid, /class="a11y-violation"/g), 1);
  assert.ok(overlaid.includes("missing-label, touch-target-too-small"), "rules listed sorted");
  assert.ok(overlaid.includes(">a11y violation<"), "legend gains the danger entry");
});

test("maxDepth limits drawn rects; scale is honoured", () => {
  const rootOnly = renderTreeSvg(tree, { maxDepth: 0 });
  assert.equal(count(rootOnly, /data-path="/g), 1);
  // fixture root is 360 wide; scale 1 -> svg width = 360 + margins (392)
  const unscaled = renderTreeSvg(tree, { scale: 1 });
  assert.ok(unscaled.includes('width="392"'), "explicit scale respected");
});

test("output is deterministic — two renders are byte-equal", () => {
  const a = renderTreeSvg(tree, { a11y: auditA11y(tree) });
  const b = renderTreeSvg(tree, { a11y: auditA11y(tree) });
  assert.equal(a, b);
});

test("XML-unsafe text is escaped", () => {
  const nasty = {
    schemaVersion: 1,
    source: "headless-jvm",
    root: {
      testTag: "t",
      text: 'a <b> & "c"',
      contentDescription: null,
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      designToken: null,
      children: [],
    },
  };
  const svg = renderTreeSvg(nasty);
  assert.ok(svg.includes("a &lt;b&gt; &amp; &quot;c&quot;"));
  assert.ok(!svg.includes("<b>"));
});
