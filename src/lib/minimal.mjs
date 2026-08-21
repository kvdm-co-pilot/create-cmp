// minimal.mjs — the `--minimal` mode subtraction (LADDER §R3): stamp the app
// without its verification harness, keeping the eyes.
//
// The mode is a FILTER over the one template, never a fork (design invariant:
// no second artifact to keep green). Three mechanisms, each already owned by
// the engine, do the whole job:
//
//   1. content variance   — `cmp:feature harness` / `!harness` marker blocks
//                           (CLAUDE.md, AGENTS.md, README, CI workflow, docs),
//                           stripped by the standard toggle machinery;
//   2. path subtraction   — manifest `features.harness.paths` for the
//                           app-owned governance surfaces (specs/, approvals,
//                           skills, evidence, hooks);
//   3. lane subtraction   — THIS module, for the machine-owned region: delete
//                           every machine-owned .mjs EXCEPT the preview
//                           entry points and their transitive imports.
//
// The keep-set is DERIVED by walking import statements from the entry points,
// never transcribed as a list — a hand-maintained enumeration of qa/lib files
// is exactly the kind of claim that rots (design invariant 5). What survives
// in a minimal scaffold is precisely what its own kept scripts can reach.
//
// `create-cmp harden` is the inverse: a three-way stamp-merge (base = the
// minimal stamp, new = the full stamp) that installs the subtraction back —
// additive, idempotent, never clobbering. See src/commands/harden.mjs.

import fs from "node:fs";
import path from "node:path";

import { listHarnessFiles } from "../../packages/harness/src/lib/harness-region.mjs";
import { minimalHookSettings } from "./hooks.mjs";

/**
 * Machine-owned entry points a minimal scaffold keeps: the preview gallery is
 * the eyes' no-plugin surface (LADDER §R3 keeps previews; the manifest's own
 * inspector notes already treat it as inspector-owned, not lane-owned).
 * Entries missing from the tree (e.g. --no-inspector) are skipped.
 */
export const MINIMAL_LANE_ENTRY_POINTS = ["qa/preview-gallery.mjs"];

/**
 * SessionStart context for a minimal scaffold — what is true HERE, and the
 * one command that adds the rest. No apostrophes: the hook command is
 * single-quoted for the shell (hooks.mjs enforces this).
 */
export const MINIMAL_SESSION_CONTEXT =
  "This is a create-cmp MINIMAL scaffold: full app architecture with tests, " +
  "no verification harness. AGENTS.md maps symptoms to commands. Fast signal: " +
  "./gradlew :composeApp:desktopTest. Headless screen previews: ./gradlew " +
  ":composeApp:renderScreens then node qa/preview-gallery.mjs. One idempotent " +
  "command installs the full harness (verify lane, evidence receipts, " +
  "machine-checked done): npx create-cmp-cli harden.";

// Matches the project's two import forms in lane code: static
// `from "./lib/x.mjs"` and dynamic `import(new URL("./lib/x.mjs", ...))`.
// Only ./-relative .mjs specifiers matter — node: and package imports are not
// files we ship.
const IMPORT_SPECIFIER_RE = /(?:from\s+|new URL\(\s*)["'](\.\.?\/[^"']+\.mjs)["']/g;

/**
 * The machine-owned files a minimal scaffold keeps: the entry points plus
 * their transitive ./-relative imports, resolved against the tree as stamped.
 * @param {string} projectDir
 * @returns {Set<string>} project-relative posix paths
 */
export function laneKeepSet(projectDir) {
  const keep = new Set();
  const queue = MINIMAL_LANE_ENTRY_POINTS.filter((rel) =>
    fs.existsSync(path.join(projectDir, rel))
  );
  while (queue.length > 0) {
    const rel = queue.pop();
    if (keep.has(rel)) continue;
    keep.add(rel);
    let source;
    try {
      source = fs.readFileSync(path.join(projectDir, rel), "utf8");
    } catch {
      continue;
    }
    for (const m of source.matchAll(IMPORT_SPECIFIER_RE)) {
      const resolved = path.posix.join(path.posix.dirname(rel), m[1]);
      if (!keep.has(resolved) && fs.existsSync(path.join(projectDir, resolved))) {
        queue.push(resolved);
      }
    }
  }
  return keep;
}

/**
 * Delete every machine-owned lane file outside the keep-set.
 * @param {string} projectDir
 * @param {(msg:string)=>void} [log]
 * @returns {string[]} deleted relative paths
 */
export function subtractLane(projectDir, log = () => {}) {
  const keep = laneKeepSet(projectDir);
  const deleted = [];
  for (const rel of listHarnessFiles(projectDir)) {
    if (keep.has(rel)) continue;
    fs.rmSync(path.join(projectDir, rel));
    deleted.push(rel);
  }
  if (deleted.length > 0) {
    log(`  removed ${deleted.length} lane file(s) (minimal mode keeps ${[...keep].sort().join(", ") || "none"})`);
  }
  return deleted;
}

/**
 * Apply minimal mode to a stamped tree: subtract the lane, then rewrite
 * .claude/settings.json to the derived minimal hook set (enforcement and
 * lane-advisory hooks gone, SessionStart telling the truth about this
 * scaffold). Marker stripping and manifest path deletion have already
 * happened via the standard feature machinery by the time this runs.
 * @param {string} projectDir
 * @param {(msg:string)=>void} [log]
 */
export function applyMinimalMode(projectDir, log = () => {}) {
  subtractLane(projectDir, log);

  const settingsPath = path.join(projectDir, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const minimal = minimalHookSettings(settings, { sessionContext: MINIMAL_SESSION_CONTEXT });
    fs.writeFileSync(settingsPath, JSON.stringify(minimal, null, 2) + "\n");
    log("  rewrote .claude/settings.json to the advisory-only hook set");
  }
}
