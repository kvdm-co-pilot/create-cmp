import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadTree } from "../src/lib/tree.mjs";
import { auditA11y } from "../src/lib/a11y.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tree = loadTree(join(here, "..", "fixtures", "a11y-tree.json"));

test("audit catches BOTH violations on the tiny unlabeled icon", () => {
  const { violations } = auditA11y(tree);
  const hits = violations.filter((v) => v.testTag === "icon_unlabeled");
  assert.equal(hits.length, 2);
  const rules = hits.map((v) => v.rule).sort();
  assert.deepEqual(rules, ["missing-label", "touch-target-too-small"]);
  // report carries path + bounds
  for (const v of hits) {
    assert.equal(v.path, "root.children[0]");
    assert.deepEqual(v.bounds, { x: 304, y: 16, width: 40, height: 40 });
    assert.ok(v.detail.length > 0);
  }
});

test("a proper 56px labeled button passes clean and counts as a pass", () => {
  const { violations, passCount } = auditA11y(tree);
  assert.equal(violations.filter((v) => v.testTag === "primary_button").length, 0);
  assert.ok(passCount >= 1);
});

test("descendant text counts as a label (nav item labeled by child)", () => {
  const { violations } = auditA11y(tree);
  const hits = violations.filter((v) => v.testTag === "nav_item_labeled_by_child");
  assert.equal(hits.length, 0, "child text should satisfy the label rule");
});

test("empty contentDescription warns, does not violate", () => {
  const { violations, warnings, warningCount } = auditA11y(tree);
  assert.equal(warningCount, 1);
  assert.equal(warnings[0].testTag, "decor_badge");
  assert.equal(warnings[0].rule, "empty-content-description");
  assert.equal(violations.filter((v) => v.testTag === "decor_badge").length, 0);
});

test("nodes missing the optional fields are skipped gracefully (old trees)", () => {
  // The 20x20 legacy node has no `clickable` field — it must NOT be flagged.
  const { violations } = auditA11y(tree);
  assert.equal(violations.filter((v) => v.testTag === "legacy_node_no_optional_fields").length, 0);

  // A whole pre-extension tree audits without crashing and yields nothing.
  const oldTree = {
    schemaVersion: 1,
    root: { testTag: "r", text: null, bounds: { x: 0, y: 0, width: 5, height: 5 }, designToken: null, children: [] },
  };
  const res = auditA11y(oldTree);
  assert.deepEqual(res.violations, []);
  assert.equal(res.passCount, 0);
});

test("minTouchTargetPx is configurable: at 30px the 40x40 icon passes size, keeps missing-label", () => {
  const { violations } = auditA11y(tree, { minTouchTargetPx: 30 });
  const hits = violations.filter((v) => v.testTag === "icon_unlabeled");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, "missing-label");
});

test("audit summary counts: fixture yields exactly 2 violations, 1 warning", () => {
  const res = auditA11y(tree);
  assert.equal(res.violations.length, 2);
  assert.equal(res.warningCount, 1);
  // clickable nodes that passed everything: primary_button + nav_item_labeled_by_child
  assert.equal(res.passCount, 2);
});
