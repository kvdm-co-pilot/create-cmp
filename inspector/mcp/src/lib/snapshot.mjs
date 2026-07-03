// snapshot.mjs — golden-tree snapshot normalization + structural diffing.
// The CI regression primitive: commit the normalized semantics JSON (not pixels)
// as a golden file; diffs are compact, human-readable {path, kind, before, after}
// entries instead of pixel flakiness.
//
// Pure logic only — no fs, no MCP imports; the server wires file I/O around it.

/**
 * Normalize a tree for snapshotting:
 *  - drop the top-level `source` (the same UI dumped from a different tier must
 *    still match its golden),
 *  - round every bounds value to an integer,
 *  - sort designToken.resolved keys so serialization is stable,
 *  - emit node fields in a fixed order (stable, reviewable JSON).
 * Optional contract fields (role/clickable/disabled) are kept when present and
 * omitted when absent — old trees stay valid goldens.
 *
 * @param {object} tree  a full tree ({schemaVersion, source?, root}) or a bare node.
 * @returns {object} normalized { schemaVersion, root }
 */
export function normalizeTree(tree) {
  if (!tree || typeof tree !== "object") {
    throw new Error("normalizeTree: tree is not an object.");
  }
  const root = tree.root && typeof tree.root === "object" ? tree.root : tree;
  return {
    schemaVersion: tree.schemaVersion ?? 1,
    root: normalizeNode(root),
  };
}

function normalizeNode(node) {
  const out = {
    testTag: node.testTag ?? null,
    text: node.text ?? null,
    contentDescription: node.contentDescription ?? null,
  };
  // Optional contract fields: keep only when present (additive schemaVersion-1 extension).
  if (node.role !== undefined) out.role = node.role;
  if (node.clickable !== undefined) out.clickable = node.clickable;
  if (node.disabled !== undefined) out.disabled = node.disabled;
  out.bounds = roundBounds(node.bounds);
  out.designToken = normalizeToken(node.designToken);
  out.children = (Array.isArray(node.children) ? node.children : []).map(normalizeNode);
  return out;
}

function roundBounds(b) {
  if (!b || typeof b !== "object") return null;
  const r = {};
  for (const k of ["x", "y", "width", "height"]) {
    r[k] = typeof b[k] === "number" ? Math.round(b[k]) : b[k] ?? null;
  }
  return r;
}

function normalizeToken(dt) {
  if (dt == null) return null;
  const resolved = {};
  if (dt.resolved && typeof dt.resolved === "object") {
    for (const k of Object.keys(dt.resolved).sort()) resolved[k] = dt.resolved[k];
  }
  return {
    tokens: Array.isArray(dt.tokens) ? [...dt.tokens] : [],
    resolved,
  };
}

/**
 * Structurally diff a current tree against a golden snapshot. Both inputs are
 * normalized first, so callers can pass a raw harness dump against a saved golden.
 *
 * Reported kinds:
 *  - "node-added" / "node-removed"      — a child exists at a path in only one tree
 *                                          (paired positionally, by path)
 *  - "text-changed" / "testTag-changed" / "contentDescription-changed"
 *  - "designToken-changed"              — tokens or resolved values differ
 *  - "bounds-moved"                     — any of x/y/width/height differs by MORE
 *                                          than tolerancePx (default 1)
 *  - "role-changed" / "clickable-changed" / "disabled-changed"
 *    (absent optional fields are treated as their neutral value — null / false —
 *     so a golden saved before the contract extension does not spray diffs)
 *
 * @param {object} currentTree
 * @param {object} goldenTree
 * @param {number} [tolerancePx=1]
 * @returns {Array<{path:string, kind:string, before:any, after:any}>} empty = pass
 */
export function diffTrees(currentTree, goldenTree, tolerancePx = 1) {
  const tol = typeof tolerancePx === "number" && tolerancePx >= 0 ? tolerancePx : 1;
  const cur = normalizeTree(currentTree).root;
  const gold = normalizeTree(goldenTree).root;
  const diffs = [];
  diffNode(cur, gold, "root", tol, diffs);
  return diffs;
}

function diffNode(cur, gold, path, tol, out) {
  if (cur.testTag !== gold.testTag) {
    out.push({ path, kind: "testTag-changed", before: gold.testTag, after: cur.testTag });
  }
  if (cur.text !== gold.text) {
    out.push({ path, kind: "text-changed", before: gold.text, after: cur.text });
  }
  if (cur.contentDescription !== gold.contentDescription) {
    out.push({
      path,
      kind: "contentDescription-changed",
      before: gold.contentDescription,
      after: cur.contentDescription,
    });
  }

  // Optional fields: neutral-default so old goldens (fields absent) don't diff
  // against new dumps that carry the explicit neutral value.
  const roleB = gold.role ?? null;
  const roleA = cur.role ?? null;
  if (roleA !== roleB) out.push({ path, kind: "role-changed", before: roleB, after: roleA });
  const clickB = gold.clickable ?? false;
  const clickA = cur.clickable ?? false;
  if (clickA !== clickB) out.push({ path, kind: "clickable-changed", before: clickB, after: clickA });
  const disB = gold.disabled ?? false;
  const disA = cur.disabled ?? false;
  if (disA !== disB) out.push({ path, kind: "disabled-changed", before: disB, after: disA });

  if (JSON.stringify(cur.designToken) !== JSON.stringify(gold.designToken)) {
    out.push({ path, kind: "designToken-changed", before: gold.designToken, after: cur.designToken });
  }

  const moved = boundsMovedBeyond(cur.bounds, gold.bounds, tol);
  if (moved) {
    out.push({ path, kind: "bounds-moved", before: gold.bounds, after: cur.bounds });
  }

  const curKids = cur.children || [];
  const goldKids = gold.children || [];
  const shared = Math.min(curKids.length, goldKids.length);
  for (let i = 0; i < shared; i++) {
    diffNode(curKids[i], goldKids[i], `${path}.children[${i}]`, tol, out);
  }
  for (let i = shared; i < curKids.length; i++) {
    out.push({
      path: `${path}.children[${i}]`,
      kind: "node-added",
      before: null,
      after: summarize(curKids[i]),
    });
  }
  for (let i = shared; i < goldKids.length; i++) {
    out.push({
      path: `${path}.children[${i}]`,
      kind: "node-removed",
      before: summarize(goldKids[i]),
      after: null,
    });
  }
}

function boundsMovedBeyond(a, b, tol) {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  for (const k of ["x", "y", "width", "height"]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va !== "number" || typeof vb !== "number") {
      if (va !== vb) return true;
      continue;
    }
    if (Math.abs(va - vb) > tol) return true;
  }
  return false;
}

// Compact one-line identity for added/removed nodes — not the whole subtree.
function summarize(node) {
  return {
    testTag: node.testTag ?? null,
    text: node.text ?? null,
    bounds: node.bounds ?? null,
    childCount: (node.children || []).length,
  };
}
