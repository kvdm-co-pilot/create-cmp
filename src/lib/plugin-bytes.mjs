// THE PLUGIN'S BYTES AGAINST ITS MARKETPLACE CLONE — one answer, two readers.
//
// scripts/plugin-refresh.mjs (create-cmp's own refresh) and `doctor --adherence`'s "plugin
// bytes current" row both ask whether an installed plugin holds the clone's bytes. Two
// comparisons drifted: doctor walked one direction and read PASS over an install missing a
// file the clone had (batch 2 review round 1). So the comparison lives here, under src/,
// which the npm package ships — doctor can answer it for an adopter, not only in a checkout.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Paths that exist in a working tree but are not part of the plugin: git's own
 * directory, installed modules, the runtime's marker, and anything the repo
 * gitignores (local ledgers, build output, scratch apps). The content proof
 * compares everything else. `.orphaned_at` is Claude Code's marker on a version
 * directory it will clean up in 14 days — the runtime's, not the plugin's.
 */
const NOT_PLUGIN_CONTENT = Object.freeze([".git", "node_modules", ".in_use", ".orphaned_at", ".DS_Store"]);

/**
 * Every path the clone's git ignores, relative and slash-joined — matched as a
 * whole path, never collapsed to its top-level directory (an ignored
 * `inspector/mcp/node_modules/` must not take all of `inspector/` out of the proof).
 */
export function ignoredPaths(dir) {
  try {
    return new Set(
      execFileSync("git", ["-C", dir, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory"], { encoding: "utf8" })
        .split("\n").filter(Boolean).map((p) => p.replace(/\/$/, "")),
    );
  } catch {
    return new Set();
  }
}

/** Recursive content comparison, ignoring what is not plugin content. */
export function compareTrees(a, b, ignore = new Set()) {
  const differing = [];
  const missing = [];
  const walk = (rel) => {
    const pa = path.join(a, rel);
    const pb = path.join(b, rel);
    for (const e of fs.readdirSync(pa, { withFileTypes: true })) {
      if (NOT_PLUGIN_CONTENT.includes(e.name)) continue;
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (ignore.has(childRel.split(path.sep).join("/"))) continue;
      const childB = path.join(pb, e.name);
      if (e.isDirectory()) {
        if (!fs.existsSync(childB)) { missing.push(childRel); continue; }
        walk(childRel);
      } else if (e.isFile()) {
        if (!fs.existsSync(childB)) { missing.push(childRel); continue; }
        if (!fs.readFileSync(path.join(pa, e.name)).equals(fs.readFileSync(childB))) differing.push(childRel);
      }
    }
  };
  walk("");
  return { differing, missing, identical: differing.length === 0 && missing.length === 0 };
}

/**
 * Are the installed bytes the clone's bytes? BOTH directions: a file the clone
 * gained (a new skill) is missing from the install, and a file the clone lost is
 * extra in it. An absent installPath is not current, whatever its number says.
 */
export function sameBytes(installPath, source, ignore = new Set()) {
  if (!installPath || !fs.existsSync(installPath)) {
    return { identical: false, absent: true, differing: [], missing: [], extra: [] };
  }
  const fromSource = compareTrees(source, installPath, ignore);
  const fromInstall = compareTrees(installPath, source, ignore);
  return {
    identical: fromSource.identical && fromInstall.identical,
    absent: false,
    differing: fromSource.differing,
    missing: fromSource.missing,
    extra: fromInstall.missing,
  };
}
