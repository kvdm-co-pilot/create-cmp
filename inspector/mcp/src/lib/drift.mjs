// drift.mjs — token-drift detection over the tree contract.
// Two flavors:
//   findDrift(tree)  — nodes with a visual footprint but NO designToken
//                      (a "possible raw value / un-tokenized" element).
//   diffAgainstDesignSystem(tree, catalog) — nodes whose *resolved* token value
//                      contradicts the declared design-system catalog.
// No MCP imports; unit-testable.

import { walk } from "./tree.mjs";

/**
 * A node has a "visual footprint" if it occupies space (non-zero bounds) AND is
 * something a designer would style — i.e. it renders text OR it is a styling
 * surface. We approximate the latter as: has text present, OR its designToken is
 * absent (so if it also renders and has no token, it's suspicious).
 *
 * Concretely, per the contract: flag nodes that
 *   (1) have non-zero bounds (width>0 AND height>0), AND
 *   (2) (text is present) OR (designToken is present === false), AND
 *   (3) have NO designToken.
 *
 * @param {object} tree
 * @returns {Array<{ path:string, testTag:(string|null), text:(string|null),
 *                    bounds:object, reason:string }>}
 */
export function findDrift(tree) {
  const out = [];
  for (const { node, path } of walk(tree)) {
    // Skip the synthetic render-host root — the full-viewport container the headless
    // renderer wraps content in. It has no semantics of its own (no tag/text/token),
    // so flagging it is pure noise, not a real un-tokenized element.
    if (
      path === "root" &&
      node.testTag == null &&
      node.text == null &&
      node.designToken == null
    ) {
      continue;
    }

    const b = node.bounds;
    const hasFootprint =
      b && typeof b.width === "number" && typeof b.height === "number" &&
      b.width > 0 && b.height > 0;
    if (!hasFootprint) continue;

    const hasToken = node.designToken != null;
    if (hasToken) continue;

    const textPresent = node.text != null && node.text !== "";
    // Condition: (text present) OR (designToken present is FALSE). Since we've
    // already established the token is absent, the second clause is always true
    // for a footprint node — so any footprint node without a token qualifies,
    // and text presence sharpens the reason.
    const reason = textPresent
      ? "renders text with no design token (possible raw value / un-tokenized)"
      : "has a visual footprint but no design token (possible raw value / un-tokenized)";

    out.push({
      path,
      testTag: node.testTag ?? null,
      text: node.text ?? null,
      bounds: b,
      reason,
    });
  }
  return out;
}

/**
 * Diff every tokenized node's resolved values against the declared catalog.
 * For each named token in node.designToken.tokens, look it up in catalog.dimens
 * then catalog.colors. If the declared value exists AND some resolved value on
 * the node contradicts it, report a drift entry.
 *
 * Matching a token name to a resolved key: we compare the declared catalog value
 * against every resolved value on the node; a drift is reported when NONE of the
 * node's resolved values equal the declared value (i.e. the node claims to use
 * `token` but nothing it resolved matches what `token` is declared to be).
 *
 * @param {object} tree
 * @param {object} catalog  { colors:{[name]:hex}, dimens:{[name]:val} }
 * @returns {Array<{ path:string, token:string, declared:string, resolved:string }>}
 */
export function diffAgainstDesignSystem(tree, catalog) {
  const colors = (catalog && catalog.colors) || {};
  const dimens = (catalog && catalog.dimens) || {};
  const out = [];

  for (const { node, path } of walk(tree)) {
    const dt = node.designToken;
    if (!dt || !Array.isArray(dt.tokens) || dt.tokens.length === 0) continue;
    const resolved = dt.resolved && typeof dt.resolved === "object" ? dt.resolved : {};
    const resolvedValues = Object.values(resolved).map(normalize);

    for (const token of dt.tokens) {
      let declared;
      if (Object.prototype.hasOwnProperty.call(dimens, token)) declared = dimens[token];
      else if (Object.prototype.hasOwnProperty.call(colors, token)) declared = colors[token];
      else continue; // token not in catalog — nothing to diff against

      const declaredNorm = normalize(declared);
      // If the node resolved NO value matching the declared token, it drifts.
      const matches = resolvedValues.includes(declaredNorm);
      if (!matches) {
        out.push({
          path,
          token,
          declared,
          // report the node's resolved value most likely intended for this token:
          resolved: pickResolvedForReport(resolved),
        });
      }
    }
  }
  return out;
}

// Case-insensitive, trimmed comparison so "#0a2540" == "#0A2540" and "16dp"=="16dp".
function normalize(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

// Best-effort single value to show in the report. If exactly one resolved value,
// use it; otherwise join them so the reader sees what the node actually resolved.
function pickResolvedForReport(resolved) {
  const vals = Object.values(resolved);
  if (vals.length === 1) return String(vals[0]);
  return vals.map(String).join(", ");
}
