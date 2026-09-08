// What the device run could have been affected by, as a content digest.
//
// The fleet record first keyed its validity to `git rev-parse HEAD`, and that
// can never work: the run happens BEFORE the commit that carries it, so the
// recorded commit is always the parent and every record reads STALE the moment
// it lands. A warning that is always on is a warning nobody reads — worse than
// none, because it looks like coverage.
//
// A commit is a LABEL. What actually decides whether yesterday's device run
// still speaks for today's code is the CONTENT of the paths that feed it, which
// is the same reasoning inputs-hash.mjs applies to a receipt: bind to the bytes,
// not to a name for them. Committing does not change bytes, so a record stays
// valid across the commit it is quoted in — and editing one byte under a
// trigger root invalidates it immediately, committed or not.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * The content a device run's validity depends on, for THIS repo — the template
 * plus the package sources it is built from. create-cmp is the engine, not a
 * stamped app, so this is what `fleet-check` actually exercises.
 */
export const DEVICE_TIER_TRIGGERS = Object.freeze(["template/", "packages/harness/src/", "packages/receipts/src/"]);

/**
 * What CANNOT affect a device run here. Declared as irrelevance rather than
 * relevance on purpose (see deriveTierNeed): anything unclassified obliges the
 * tier, so forgetting to list a new directory costs a device run, never a
 * missed regression. Markdown cannot change what executes on a phone; this
 * repo's own tests, scripts and CI config do not ship into the stamped app.
 */
export const DEVICE_TIER_IRRELEVANT = Object.freeze([
  "docs/",
  "test/",
  "scripts/",
  ".github/",
  "*.md",
  // The inspector SHIPS (the tokenDrift step talks to it), so `inspector/` as a
  // whole is not irrelevant — but its own test suite never reaches a device.
  // Named specifically rather than widening to `inspector/`, because the cost of
  // a too-narrow entry is one device run and the cost of a too-wide one is a
  // missed regression.
  "inspector/mcp/test/",
  // This repo's own Claude Code hooks and agent definitions. What SHIPS is
  // `template/.claude/`, which is under a trigger; this one configures the
  // agent that develops the harness and never reaches a stamped app.
  ".claude/",
]);

const SKIP_DIRS = new Set(["node_modules", ".git", "build", "dist", "out"]);

function filesUnder(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) filesUnder(abs, out);
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

/**
 * sha256 over every file under `roots`, by relative path and content.
 *
 * Deterministic, git-independent, and unchanged by committing. Missing roots
 * contribute nothing rather than throwing — a project that declares a root it
 * does not have gets a smaller digest, not a crash.
 *
 * @param {string} root repo root
 * @param {string[]} roots relative directories whose content feeds the tier
 * @returns {string} hex digest
 */
export function observedTreeHash(root, roots) {
  const rows = [];
  for (const rel of roots) {
    for (const abs of filesUnder(path.join(root, rel))) {
      const relPath = path.relative(root, abs).split(path.sep).join("/");
      rows.push(`${relPath}\n${createHash("sha256").update(fs.readFileSync(abs)).digest("hex")}`);
    }
  }
  rows.sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}
