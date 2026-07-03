// prove.mjs — the "verified dev loop" primitive: prove what a code change did.
//
// Pure COMPOSITION of existing libs (snapshot + drift + a11y), no new logic:
// diff a BEFORE tree (typically a pre-edit golden snapshot) against an AFTER
// tree (typically the live app post-reload), then regression-check the AFTER
// tree for design-system drift and a11y faults.
//
//   verdict:
//     "no-change"                — the trees are structurally identical
//     "proven-clean"             — changes exist and the AFTER tree is regression-free
//     "changed-with-regressions" — changes exist AND drift and/or a11y violations found
//
// Pure logic only — no fs, no MCP imports; the server resolves sources/catalogs.

import { diffTrees } from "./snapshot.mjs";
import { diffAgainstDesignSystem } from "./drift.mjs";
import { auditA11y } from "./a11y.mjs";

/**
 * @param {object} params
 * @param {object} params.beforeTree        the pre-change tree (full doc or bare node)
 * @param {object} params.afterTree         the post-change tree
 * @param {object} [params.catalog]         declared design-system catalog { colors, dimens };
 *                                          when absent, the drift check is skipped
 *                                          (regressions.driftChecked = false).
 * @param {number} [params.tolerancePx=1]   bounds-move tolerance for the structural diff
 * @param {number} [params.minTouchTargetPx] a11y touch-target minimum (default 48)
 * @returns {{
 *   changes: Array<{path:string, kind:string, before:any, after:any}>,
 *   regressions: { drift: Array, driftChecked: boolean, a11y: Array },
 *   verdict: "proven-clean"|"changed-with-regressions"|"no-change"
 * }}
 */
export function proveChange({ beforeTree, afterTree, catalog, tolerancePx, minTouchTargetPx } = {}) {
  if (!beforeTree || !afterTree) {
    throw new Error("proveChange: both beforeTree and afterTree are required.");
  }

  // What changed? (current = after, golden = before)
  const changes = diffTrees(afterTree, beforeTree, tolerancePx ?? 1);

  // Did the AFTER state regress? Drift needs an instrumented tree + a catalog;
  // uiautomator trees carry no tokens, so the drift check is skipped, not faked.
  const driftChecked = catalog != null && afterTree.source !== "uiautomator";
  const drift = driftChecked ? diffAgainstDesignSystem(afterTree, catalog) : [];
  const a11y = auditA11y(afterTree, { minTouchTargetPx }).violations;

  let verdict;
  if (changes.length === 0) verdict = "no-change";
  else if (drift.length > 0 || a11y.length > 0) verdict = "changed-with-regressions";
  else verdict = "proven-clean";

  return {
    changes,
    regressions: { drift, driftChecked, a11y },
    verdict,
  };
}
