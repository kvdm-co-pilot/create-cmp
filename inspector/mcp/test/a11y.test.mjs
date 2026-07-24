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

// ---------------------------------------------------------------------------
// contrast — SPEC: VL-EYES (§3.1 audit_a11y contrast). Inline fixture trees
// (not the shared a11y-tree.json) so this stays independent of its exact counts.
// ---------------------------------------------------------------------------

const node = (over = {}) => ({
  testTag: null,
  text: null,
  contentDescription: null,
  role: null,
  clickable: false,
  disabled: false,
  bounds: { x: 0, y: 0, width: 100, height: 40 },
  designToken: null,
  children: [],
  ...over,
});

test("low-contrast fires when a node resolves both fg and bg below the ratio", () => {
  const contrastTree = {
    schemaVersion: 1,
    root: node({
      children: [
        node({
          testTag: "white_on_white",
          designToken: { tokens: [], resolved: { color: "#FFFFFF", backgroundColor: "#FFFFFF" } },
        }),
      ],
    }),
  };
  const { violations } = auditA11y(contrastTree);
  const hits = violations.filter((v) => v.testTag === "white_on_white");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, "low-contrast");
  assert.match(hits[0].detail, /1\.00:1/);
  assert.match(hits[0].detail, />= 4\.5:1/);
});

test("high-contrast (black on white) does not fire", () => {
  const contrastTree = {
    schemaVersion: 1,
    root: node({
      children: [
        node({
          testTag: "black_on_white",
          designToken: { tokens: [], resolved: { color: "#000000", backgroundColor: "#FFFFFF" } },
        }),
      ],
    }),
  };
  const { violations } = auditA11y(contrastTree);
  assert.equal(violations.filter((v) => v.testTag === "black_on_white").length, 0);
});

test("low-contrast is skipped when only one of fg/bg is known (never a guess)", () => {
  const contrastTree = {
    schemaVersion: 1,
    root: node({
      children: [
        node({
          testTag: "fg_only",
          designToken: { tokens: [], resolved: { color: "#FFFFFF" } },
        }),
      ],
    }),
  };
  const { violations } = auditA11y(contrastTree);
  assert.equal(violations.filter((v) => v.rule === "low-contrast").length, 0);
});

test("low-contrast is skipped when a color value is unparseable (e.g. a dimension)", () => {
  const contrastTree = {
    schemaVersion: 1,
    root: node({
      children: [
        node({
          testTag: "bad_values",
          designToken: { tokens: [], resolved: { color: "16dp", backgroundColor: "#FFFFFF" } },
        }),
      ],
    }),
  };
  const { violations } = auditA11y(contrastTree);
  assert.equal(violations.filter((v) => v.rule === "low-contrast").length, 0);
});

test("minContrastRatio is configurable", () => {
  const contrastTree = {
    schemaVersion: 1,
    root: node({
      children: [
        node({
          testTag: "borderline",
          designToken: { tokens: [], resolved: { color: "#767676", backgroundColor: "#FFFFFF" } },
        }),
      ],
    }),
  };
  assert.equal(auditA11y(contrastTree, { minContrastRatio: 4.5 }).violations.length, 0);
  assert.equal(auditA11y(contrastTree, { minContrastRatio: 7 }).violations.length, 1);
});

test("a clickable node with low contrast fails its pass too (not just the contrast rule)", () => {
  const contrastTree = {
    schemaVersion: 1,
    root: node({
      children: [
        node({
          testTag: "clickable_low_contrast",
          clickable: true,
          text: "Tap me",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          designToken: { tokens: [], resolved: { color: "#FEFEFE", backgroundColor: "#FFFFFF" } },
        }),
      ],
    }),
  };
  const { violations, passCount } = auditA11y(contrastTree);
  assert.equal(violations.filter((v) => v.testTag === "clickable_low_contrast" && v.rule === "low-contrast").length, 1);
  assert.equal(passCount, 0, "the clickable node has a violation, so it must not count as a pass");
});

// ---------------------------------------------------------------------------
// scroll-clipped touch targets — DOGFOODING-FINDINGS "a11y audit correctness".
// `bounds` is the visible slice after ancestor clipping; the additive `size`
// field is the full composed size, and touch targets are judged on it. The
// numbers below are the real false positive: a Fuelled Foods row measured
// 371x36 at the 891px viewport fold while composing 371x88.
// ---------------------------------------------------------------------------

const clipNode = (over = {}) => ({
  testTag: null,
  text: "Chicken breast",
  contentDescription: null,
  clickable: true,
  bounds: { x: 20, y: 855, width: 371, height: 36 },
  designToken: null,
  children: [],
  ...over,
});
const clipTree = (children) => ({ schemaVersion: 1, root: { ...clipNode({ text: null, clickable: false }), bounds: { x: 0, y: 0, width: 411, height: 891 }, children } });

test("a fold-clipped row (bounds 371x36, size 371x88) is NOT a touch-target violation", () => {
  const { violations, passCount } = auditA11y(
    clipTree([clipNode({ testTag: "foods_item_7", size: { width: 371, height: 88 } })])
  );
  assert.deepEqual(violations, [], "clipping is a scroll-position artifact, not an a11y defect");
  assert.equal(passCount, 1);
});

test("a genuinely small target stays flagged — size confirms what bounds report", () => {
  const { violations } = auditA11y(
    clipTree([clipNode({ testTag: "tiny_icon", bounds: { x: 0, y: 0, width: 40, height: 40 }, size: { width: 40, height: 40 } })])
  );
  const hits = violations.filter((v) => v.testTag === "tiny_icon" && v.rule === "touch-target-too-small");
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /40x40px/);
});

test("old trees without `size` are judged on bounds, as before (back-compat)", () => {
  const { violations } = auditA11y(
    clipTree([clipNode({ testTag: "legacy_clipped_row" })]) // no size field: 371x36 flags
  );
  assert.equal(
    violations.filter((v) => v.testTag === "legacy_clipped_row" && v.rule === "touch-target-too-small").length,
    1
  );
});

test("a fully scrolled-out row (bounds height 0, real composed size) is not flagged", () => {
  const { violations } = auditA11y(
    clipTree([clipNode({ testTag: "offscreen_row", bounds: { x: 20, y: 891, width: 371, height: 0 }, size: { width: 371, height: 88 } })])
  );
  assert.deepEqual(violations, []);
});
