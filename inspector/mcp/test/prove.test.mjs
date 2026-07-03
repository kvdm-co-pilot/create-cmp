import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

import { loadTree } from "../src/lib/tree.mjs";
import { proveChange } from "../src/lib/prove.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "..", "fixtures", "tree.json");
const catalog = JSON.parse(readFileSync(join(here, "..", "fixtures", "design-system.json"), "utf8"));

const freshTree = () => loadTree(JSON.parse(readFileSync(fixture, "utf8")));

// A clean before/after pair: strip the fixture's PLANTED drift (card_two radius
// 24dp vs declared 16dp) so regression checks start from a clean slate.
function cleanTree() {
  const t = freshTree();
  t.root.children[3].designToken.resolved.radius = "16dp";
  return t;
}

test("identical trees -> verdict no-change, nothing reported", () => {
  const res = proveChange({ beforeTree: cleanTree(), afterTree: cleanTree(), catalog });
  assert.equal(res.verdict, "no-change");
  assert.deepEqual(res.changes, []);
  assert.deepEqual(res.regressions.drift, []);
  assert.deepEqual(res.regressions.a11y, []);
  assert.equal(res.regressions.driftChecked, true);
});

test("bounds move + text change -> changes listed, verdict proven-clean", () => {
  const before = cleanTree();
  const after = cleanTree();
  after.root.children[0].text = "Dashboard"; // home_title text change
  after.root.children[2].bounds.y = 140; // card_one moved 40px down
  const res = proveChange({ beforeTree: before, afterTree: after, catalog });

  assert.equal(res.verdict, "proven-clean");
  const kinds = res.changes.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["bounds-moved", "text-changed"]);
  const text = res.changes.find((c) => c.kind === "text-changed");
  assert.equal(text.before, "Home");
  assert.equal(text.after, "Dashboard");
});

test("planted drift in the after tree -> changed-with-regressions", () => {
  const before = cleanTree();
  const after = cleanTree();
  after.root.children[3].designToken.resolved.radius = "24dp"; // RadiusCard declared 16dp
  const res = proveChange({ beforeTree: before, afterTree: after, catalog });

  assert.equal(res.verdict, "changed-with-regressions");
  assert.ok(res.changes.some((c) => c.kind === "designToken-changed"), "the edit itself is a change");
  assert.equal(res.regressions.drift.length, 1);
  assert.equal(res.regressions.drift[0].token, "RadiusCard");
  assert.equal(res.regressions.drift[0].declared, "16dp");
});

test("a11y regression in the after tree -> changed-with-regressions", () => {
  const before = cleanTree();
  const after = cleanTree();
  after.root.children.push({
    testTag: "tiny_unlabeled",
    text: null,
    contentDescription: null,
    clickable: true,
    bounds: { x: 0, y: 700, width: 20, height: 20 },
    designToken: { tokens: [], resolved: {} },
    children: [],
  });
  const res = proveChange({ beforeTree: before, afterTree: after, catalog });

  assert.equal(res.verdict, "changed-with-regressions");
  assert.ok(res.changes.some((c) => c.kind === "node-added"));
  const rules = res.regressions.a11y.map((v) => v.rule).sort();
  assert.deepEqual(rules, ["missing-label", "touch-target-too-small"]);
});

test("no catalog -> drift check skipped honestly (driftChecked:false), a11y still runs", () => {
  const before = cleanTree();
  const after = cleanTree();
  after.root.children[0].text = "Dashboard";
  const res = proveChange({ beforeTree: before, afterTree: after });
  assert.equal(res.regressions.driftChecked, false);
  assert.deepEqual(res.regressions.drift, []);
  assert.equal(res.verdict, "proven-clean");
});

test("missing inputs fail loudly", () => {
  assert.throws(() => proveChange({ beforeTree: cleanTree() }), /both beforeTree and afterTree/);
});
