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
 * The paths a device run can observe, for THIS repo. create-cmp is the engine,
 * not a stamped app, so what feeds `fleet-check` is the template plus the
 * package sources the template is built from. A stamped project passes its own
 * (`layout.sourceRoots` plus the flows dir) to the same functions.
 */
export const DEVICE_TIER_TRIGGERS = Object.freeze(["template/", "packages/harness/src/", "packages/receipts/src/"]);

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
