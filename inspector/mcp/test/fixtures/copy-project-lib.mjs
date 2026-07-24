// Copy a REAL template qa/lib module into a fixture project — WITH its static
// relative dependencies, transitively.
//
// Why this exists: the console's bridges load a generated project's own
// qa/lib/*.mjs by dynamic import, so fixtures that want the real behavior copy
// the real file. But those modules import each other (approvals.mjs →
// arch-doc.mjs → …, and now → intent-checks.mjs), and a missing sibling fails
// the whole dynamic import at LOAD time — the bridge degrades to
// {available:false} and every approvals-through-the-console test fails at once,
// far from the actual cause.
//
// That rule used to live in a comment ("any fixture that copies the REAL
// approvals.mjs must ship arch-doc.mjs alongside it") enforced by whoever
// remembered it, across six copy sites in three files. Adding one import to
// approvals.mjs broke fourteen tests. So the dependency set is DERIVED here
// instead: read the module, find its relative imports, copy those too, repeat.
// A new sibling import now ships itself.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_QA_LIB = path.join(HERE, "..", "..", "..", "..", "template", "qa", "lib");

/** Relative-specifier imports/exports in an ESM source — `from "./x.mjs"`. */
const RELATIVE_IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["'](\.\/[^"']+)["']/g;

/**
 * Copy `name` (e.g. "approvals.mjs") from the real template qa/lib into
 * `libDir`, following its relative imports transitively.
 * @param {string} libDir destination directory (the fixture's qa/lib)
 * @param {string} name module filename in template/qa/lib
 * @param {{srcDir?: string, seen?: Set<string>}} [opts]
 * @returns {string[]} every filename copied, sorted — the fixture's real dependency set
 */
export function copyProjectLib(libDir, name, opts = {}) {
  const srcDir = opts.srcDir ?? TEMPLATE_QA_LIB;
  const seen = opts.seen ?? new Set();
  if (seen.has(name)) return [];
  seen.add(name);

  const src = path.join(srcDir, name);
  const source = fs.readFileSync(src, "utf8");
  fs.mkdirSync(libDir, { recursive: true });
  fs.copyFileSync(src, path.join(libDir, name));

  for (const m of source.matchAll(RELATIVE_IMPORT_RE)) {
    const dep = m[1].replace(/^\.\//, "");
    // Only siblings within qa/lib are followed — a fixture that needs
    // something from outside that directory is doing something else, and
    // silently reaching further would hide that.
    if (dep.includes("/")) continue;
    if (!fs.existsSync(path.join(srcDir, dep))) continue;
    copyProjectLib(libDir, dep, { srcDir, seen });
  }
  return [...seen].sort();
}
