// Feature toggling: strip `cmp:feature <name>` marker blocks for DISABLED
// features from file contents, and delete the feature's manifest `paths`.
//
// Marker syntax (CONTRACT.md):
//   // >>> cmp:feature ios
//   ...lines to remove when `ios` is disabled...
//   // <<< cmp:feature ios
//
// The comment leader is language-agnostic — we match the `>>> cmp:feature` /
// `<<< cmp:feature` tokens anywhere on the line, so `//`, `#`, `<!--`, `;` etc.
// all work. Blocks may nest for different features; we strip per-feature.

import fs from "node:fs";
import path from "node:path";

// The captured name may carry a leading `!` (negation): a `!foo` block is kept
// ONLY when feature `foo` is DISABLED (and removed when enabled) — the inverse
// of a plain `foo` block. The `!` is part of the capture so both open and close
// markers agree on the same token.
const OPEN_RE = />>>\s*cmp:feature\s+(!?[A-Za-z0-9_-]+)/;
const CLOSE_RE = /<<<\s*cmp:feature\s+(!?[A-Za-z0-9_-]+)/;

/**
 * Strip marker blocks for the given disabled feature names from a single
 * text body. Lines containing the open/close markers for those features are
 * removed along with their enclosed content. Markers for STILL-ENABLED
 * features are left untouched (their marker comment lines are also removed,
 * so the shipped output has no leftover marker noise).
 *
 * @param {string} content
 * @param {Set<string>|string[]} disabledFeatures features to strip
 * @returns {{content: string, changed: boolean}}
 */
export function stripFeatureBlocks(content, disabledFeatures) {
  const disabled = disabledFeatures instanceof Set
    ? disabledFeatures
    : new Set(disabledFeatures);

  const lines = content.split("\n");
  const out = [];
  // Stack of {feature, dropping} for currently-open blocks.
  const stack = [];
  let changed = false;

  for (const line of lines) {
    const open = line.match(OPEN_RE);
    const close = line.match(CLOSE_RE);

    if (open) {
      const token = open[1];
      const negated = token.startsWith("!");
      const feature = negated ? token.slice(1) : token;
      const parentDropping = stack.some((f) => f.dropping);
      // Plain block: drop when the feature is disabled.
      // Negated (!feature) block: drop when the feature is ENABLED.
      const selfDropping = negated ? !disabled.has(feature) : disabled.has(feature);
      const dropping = parentDropping || selfDropping;
      stack.push({ token, dropping });
      changed = true; // marker comment line itself is always removed
      continue; // never emit the marker line
    }

    if (close) {
      const token = close[1];
      // Pop the matching frame (search from top for safety).
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].token === token) {
          stack.splice(i, 1);
          break;
        }
      }
      changed = true; // marker comment line removed
      continue;
    }

    const dropping = stack.some((f) => f.dropping);
    if (dropping) {
      changed = true;
      continue; // drop enclosed line
    }
    out.push(line);
  }

  return { content: out.join("\n"), changed };
}

/**
 * Map an engine config object to the set of DISABLED feature names that the
 * manifest understands: ios, firebase, room, appium.
 * @param {object} config
 * @returns {Set<string>}
 */
export function disabledFeaturesFromConfig(config) {
  const disabled = new Set();
  if (!config.platforms?.ios) disabled.add("ios");
  if (!config.firebase?.enabled) disabled.add("firebase");
  if (!config.room) disabled.add("room");
  if (!config.appium) disabled.add("appium");
  return disabled;
}

/**
 * Delete the filesystem paths declared for each disabled feature in the
 * manifest. Paths are relative to projectDir; missing paths are ignored.
 * @param {string} projectDir
 * @param {object} manifest
 * @param {Set<string>} disabledFeatures
 * @param {(msg:string)=>void} [log]
 * @returns {string[]} deleted relative paths
 */
export function deleteDisabledFeaturePaths(projectDir, manifest, disabledFeatures, log = () => {}) {
  const deleted = [];
  const features = manifest.features || {};
  for (const name of disabledFeatures) {
    const feature = features[name];
    if (!feature || !Array.isArray(feature.paths)) continue;
    for (const rel of feature.paths) {
      if (rel === "..." || !rel) continue; // contract placeholder, skip
      const abs = path.join(projectDir, rel);
      if (fs.existsSync(abs)) {
        fs.rmSync(abs, { recursive: true, force: true });
        deleted.push(rel);
        log(`  removed ${rel} (feature '${name}' disabled)`);
      }
    }
  }
  return deleted;
}
