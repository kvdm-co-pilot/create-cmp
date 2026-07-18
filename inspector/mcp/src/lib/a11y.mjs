// a11y.mjs — accessibility audit over the tree contract.
// Pure logic only — no fs, no MCP imports; unit-testable.
//
// Rules (violations):
//   touch-target-too-small — a clickable node whose width or height is below the
//                            minimum touch target (default 48px; the harness dumps
//                            at density 1 so px == dp there — pass a different
//                            minTouchTargetPx for device-density trees).
//   missing-label          — a clickable node with no text, no contentDescription,
//                            and no descendant text: nothing for a screen reader.
//   low-contrast           — a node whose designToken.resolved exposes BOTH a foreground
//                            and a background color (see FG_KEYS/BG_KEYS below) with a WCAG
//                            contrast ratio below minContrastRatio (default 4.5:1, WCAG AA
//                            for normal text). Fires ONLY when both colors parse cleanly —
//                            never a false positive from a missing/ambiguous value. Not
//                            gated on clickable: any node can carry the wrong contrast.
// Rules (warnings):
//   empty-content-description — contentDescription === "" (redundant/empty; either
//                               label it or drop the attribute).
//
// Trees produced before the role/clickable/disabled contract extension are handled
// gracefully: nodes without `clickable` are simply skipped, never crashed on.

import { walk } from "./tree.mjs";
import { contrastRatio } from "./contrast.mjs";

// Resolved-key aliases the codebase's `.designToken(resolved = mapOf(...))` calls use in
// practice (see HomeScreen.kt's "color" example) plus the common Material naming. First match
// wins on each side — this is a heuristic, not a schema, which is exactly why a hit REQUIRES
// both a fg and a bg key to resolve to a genuinely parseable color before it fires.
const FG_KEYS = ["color", "textColor", "contentColor", "foreground", "foregroundColor"];
const BG_KEYS = ["backgroundColor", "background", "containerColor", "surfaceColor"];

function findColorPair(resolved) {
  if (!resolved || typeof resolved !== "object") return null;
  const fgKey = FG_KEYS.find((k) => typeof resolved[k] === "string");
  const bgKey = BG_KEYS.find((k) => typeof resolved[k] === "string");
  if (!fgKey || !bgKey) return null;
  return { fgKey, fg: resolved[fgKey], bgKey, bg: resolved[bgKey] };
}

/**
 * Audit a tree for accessibility faults.
 *
 * @param {object} tree  a full tree ({root}) or bare node.
 * @param {{minTouchTargetPx?: number, minContrastRatio?: number}} [opts]
 * @returns {{
 *   violations: Array<{path:string, testTag:string|null, rule:string, detail:string, bounds:object|null}>,
 *   warnings:   Array<{path:string, testTag:string|null, rule:string, detail:string, bounds:object|null}>,
 *   warningCount: number,
 *   passCount: number
 * }}  passCount = clickable nodes that passed every check.
 */
export function auditA11y(tree, opts = {}) {
  const minTouchTargetPx =
    typeof opts.minTouchTargetPx === "number" && opts.minTouchTargetPx > 0
      ? opts.minTouchTargetPx
      : 48;
  const minContrastRatio =
    typeof opts.minContrastRatio === "number" && opts.minContrastRatio > 0
      ? opts.minContrastRatio
      : 4.5;

  const violations = [];
  const warnings = [];
  let passCount = 0;

  for (const { node, path } of walk(tree)) {
    const entryBase = {
      path,
      testTag: node.testTag ?? null,
      bounds: node.bounds ?? null,
    };

    // Warn on redundant/empty contentDescription regardless of clickability.
    if (node.contentDescription === "") {
      warnings.push({
        ...entryBase,
        rule: "empty-content-description",
        detail: 'contentDescription is an empty string ("") — either label the node or drop the attribute',
      });
    }

    // Contrast applies to ANY node that resolves both a fg and bg color — not gated on
    // clickable (text contrast matters whether or not the node is interactive). Tracked in
    // `violated` too, so a clickable node with bad contrast doesn't count as a pass below.
    let violated = false;
    const pair = findColorPair(node.designToken && node.designToken.resolved);
    if (pair) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      if (ratio != null && ratio < minContrastRatio) {
        violations.push({
          ...entryBase,
          rule: "low-contrast",
          detail:
            `contrast ratio ${ratio.toFixed(2)}:1 between ${pair.fgKey} (${pair.fg}) and ` +
            `${pair.bgKey} (${pair.bg}) — WCAG AA requires >= ${minContrastRatio}:1`,
        });
        violated = true;
      }
    }

    // Interactive checks only apply to nodes that self-report clickable:true.
    // Old trees without the optional field are skipped gracefully.
    if (node.clickable !== true) continue;

    const b = node.bounds;
    if (
      b &&
      typeof b.width === "number" &&
      typeof b.height === "number" &&
      (b.width < minTouchTargetPx || b.height < minTouchTargetPx)
    ) {
      violations.push({
        ...entryBase,
        rule: "touch-target-too-small",
        detail: `clickable node is ${b.width}x${b.height}px; minimum touch target is ${minTouchTargetPx}x${minTouchTargetPx}px`,
      });
      violated = true;
    }

    const hasOwnLabel =
      (node.text != null && node.text !== "") ||
      (node.contentDescription != null && node.contentDescription !== "");
    if (!hasOwnLabel && !hasDescendantText(node)) {
      violations.push({
        ...entryBase,
        rule: "missing-label",
        detail: "clickable node has no text, no contentDescription, and no descendant text — invisible to screen readers",
      });
      violated = true;
    }

    if (!violated) passCount++;
  }

  return { violations, warnings, warningCount: warnings.length, passCount };
}

function hasDescendantText(node) {
  for (const child of node.children || []) {
    if (child.text != null && child.text !== "") return true;
    if (child.contentDescription != null && child.contentDescription !== "") return true;
    if (hasDescendantText(child)) return true;
  }
  return false;
}
