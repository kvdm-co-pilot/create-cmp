// navigate.mjs — the agent-side navigation primitive (Live View Track B).
//
// navigate_and_inspect: resolve tap coordinates FROM THE LIVE TREE (center of a
// testTag's bounds, or explicit x/y), deliver the tap via POST /inspect/tap
// (HTTP through the adb forward — no adb shell dependency), wait for the UI to
// settle, re-fetch the tree, and report what changed — all structure, no pixels.
//
// Pure logic + injectable transports (fetchImpl/sleep) so everything unit-tests
// against a stub HTTP server, like live.mjs does.

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { walk, findByTestTag } from "./tree.mjs";
import { normalizeTree } from "./snapshot.mjs";
import { fetchLiveTree, fetchLiveScreenshot, postTap } from "./live.mjs";
import { readPngMeta } from "./png.mjs";

export const DEFAULT_SETTLE_MS = 1500;

// How many text values the before/after summaries sample (enough to recognise a
// screen, small enough to stay cheap in model context).
const TEXT_SAMPLE_LIMIT = 12;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve WHERE to tap: the center of `testTag`'s bounds (read from the tree the
 * caller just fetched), or explicit x/y. Root-relative px — the exact space
 * POST /inspect/tap consumes. Throws listing the available tags on a miss.
 *
 * @returns {{x:number, y:number, testTag?:string}}
 */
export function resolveTapTarget(tree, { testTag, x, y } = {}) {
  if (testTag != null) {
    const hit = findByTestTag(tree, testTag);
    if (!hit) {
      const available = [...walk(tree)]
        .map(({ node }) => node.testTag)
        .filter((t) => t != null);
      throw new Error(
        `No node found with testTag '${testTag}' in the live tree. Available tags: ` +
          (available.length ? available.join(", ") : "(none — tap by explicit x/y from the tree's bounds instead)") +
          "."
      );
    }
    const b = hit.node.bounds || {};
    return {
      x: Math.round((b.x || 0) + (b.width || 0) / 2),
      y: Math.round((b.y || 0) + (b.height || 0) / 2),
      testTag,
    };
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(
      "navigate_and_inspect needs either `testTag` (coords resolved from the live tree) " +
        "or explicit numeric `x` and `y` (root-relative px, e.g. a node's bounds center)."
    );
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Compact structural summary of one tree state — what the agent compares across
 * a navigation: { tags, textSample, nodeCount }.
 */
export function navSummary(tree) {
  const tags = [];
  const textSample = [];
  let nodeCount = 0;
  for (const { node } of walk(tree)) {
    nodeCount++;
    if (node.testTag != null) tags.push(node.testTag);
    if (node.text != null && textSample.length < TEXT_SAMPLE_LIMIT) textSample.push(node.text);
  }
  return { tags, textSample, nodeCount };
}

/**
 * The navigation primitive: fetch the live tree, resolve the tap target, tap via
 * POST /inspect/tap, wait `settleMs`, re-fetch, and report before/after + changed.
 *
 * `changed` compares NORMALIZED trees (integer bounds, no `source`, sorted resolved
 * keys) — the same normalization the snapshot tools use — so sub-pixel jitter never
 * reads as a navigation.
 */
export async function navigateAndInspect({
  testTag,
  x,
  y,
  host,
  port,
  settleMs = DEFAULT_SETTLE_MS,
  fetchImpl,
  sleep = defaultSleep,
} = {}) {
  const opts = { host, port, fetchImpl };
  const beforeTree = await fetchLiveTree(opts);
  const target = resolveTapTarget(beforeTree, { testTag, x, y });
  await postTap({ ...opts, x: target.x, y: target.y });
  await sleep(settleMs);
  const afterTree = await fetchLiveTree(opts);

  const changed =
    JSON.stringify(normalizeTree(beforeTree)) !== JSON.stringify(normalizeTree(afterTree));

  return {
    tapped: target,
    before: navSummary(beforeTree),
    after: navSummary(afterTree),
    changed,
  };
}

/**
 * render_screen's live path: GET /inspect/screenshot, write the PNG bytes to a
 * file, and return the SAME path-only metadata shape as every other render_screen
 * call — { path, width, height, sizeBytes } from the PNG header, NEVER the bytes.
 */
export async function writeLiveScreenshot({ host, port, out, fetchImpl, timeoutMs } = {}) {
  const bytes = await fetchLiveScreenshot({ host, port, fetchImpl, timeoutMs });
  const target = resolve(
    out || join(tmpdir(), "cmp-inspector", `live-screen-${Date.now()}.png`)
  );
  const dir = dirname(target);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
  writeFileSync(target, bytes);
  return readPngMeta(target);
}
