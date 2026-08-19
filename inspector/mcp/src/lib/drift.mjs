// drift.mjs — token-drift detection over the tree contract.
//   diffAgainstDesignSystem(tree, catalog) — nodes whose *resolved* token value
//                      contradicts the declared design-system catalog.
// (The un-tokenized-node sweep that used to live here as `findDrift` was the
// interactive twin of the verify lane's `tokenDrift` step; the lane owns that
// job — template/qa/lib/token-drift.mjs — and the twin was removed with its
// `find_drift` tool.)
// No MCP imports; unit-testable.

import { walk } from "./tree.mjs";

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
