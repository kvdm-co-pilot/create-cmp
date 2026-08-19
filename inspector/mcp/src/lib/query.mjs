// query.mjs — pure node-level queries and geometry math over the tree contract.
// No MCP imports; unit-testable.

import { findByTestTag } from "./tree.mjs";

/**
 * Return the first node matching testTag, or null.
 * @param {object} tree
 * @param {string} testTag
 * @returns {object|null} the node (not the {node,path} wrapper)
 */
export function getNode(tree, testTag) {
  const hit = findByTestTag(tree, testTag);
  return hit ? hit.node : null;
}

/**
 * Compute the layout relationship between two nodes' bounding boxes.
 *
 *  - gapX: horizontal empty space between the boxes (0 if they overlap on X).
 *  - gapY: vertical empty space between the boxes (0 if they overlap on Y).
 *  - dxLeft: b.x - a.x  (how far b's left edge is from a's left edge).
 *  - dyTop:  b.y - a.y  (how far b's top edge is from a's top edge).
 *
 * @param {object} a  node with .bounds
 * @param {object} b  node with .bounds
 * @returns {{ gapX:number, gapY:number, dxLeft:number, dyTop:number }}
 */
export function layoutGaps(a, b) {
  const ba = requireBounds(a, "a");
  const bb = requireBounds(b, "b");

  const aRight = ba.x + ba.width;
  const aBottom = ba.y + ba.height;
  const bRight = bb.x + bb.width;
  const bBottom = bb.y + bb.height;

  // Horizontal gap: positive space between the two boxes, else 0 (touching/overlapping).
  let gapX;
  if (bb.x >= aRight) gapX = bb.x - aRight; // b is to the right of a
  else if (ba.x >= bRight) gapX = ba.x - bRight; // a is to the right of b
  else gapX = 0;

  // Vertical gap.
  let gapY;
  if (bb.y >= aBottom) gapY = bb.y - aBottom; // b is below a
  else if (ba.y >= bBottom) gapY = ba.y - bBottom; // a is below b
  else gapY = 0;

  return {
    gapX,
    gapY,
    dxLeft: bb.x - ba.x,
    dyTop: bb.y - ba.y,
  };
}

/**
 * The tree-wide spacing report backing inspect_tree's `includeLayoutGaps`
 * option (the old two-tag `layout_gaps` tool, generalized): for every parent,
 * compute the gap between each pair of CONSECUTIVE tagged children (document
 * order). Untagged siblings are skipped — a gap between two anonymous boxes
 * names nothing anyone can act on.
 *
 * @param {object} tree
 * @returns {Array<{ parentPath:string, a:string, b:string,
 *                    gaps:{gapX:number,gapY:number,dxLeft:number,dyTop:number} }>}
 */
export function siblingLayoutGaps(tree) {
  const out = [];
  const visit = (node, path) => {
    const children = Array.isArray(node.children) ? node.children : [];
    const tagged = children.filter((c) => c && c.testTag != null && c.bounds);
    for (let i = 0; i + 1 < tagged.length; i++) {
      out.push({
        parentPath: path,
        a: tagged[i].testTag,
        b: tagged[i + 1].testTag,
        gaps: layoutGaps(tagged[i], tagged[i + 1]),
      });
    }
    children.forEach((c, i) => c && visit(c, `${path}.children[${i}]`));
  };
  if (tree && tree.root) visit(tree.root, "root");
  return out;
}

function requireBounds(node, label) {
  if (!node || typeof node !== "object" || !node.bounds) {
    throw new Error(`layoutGaps: node '${label}' has no bounds.`);
  }
  const { x, y, width, height } = node.bounds;
  for (const [k, v] of Object.entries({ x, y, width, height })) {
    if (typeof v !== "number" || Number.isNaN(v)) {
      throw new Error(`layoutGaps: node '${label}' bounds.${k} is not a number.`);
    }
  }
  return node.bounds;
}
