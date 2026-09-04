// Copy a REAL template qa/lib module into a fixture project — WITH everything
// it needs to run: its static relative dependencies, transitively, AND the
// stack profile the manifest names.
//
// Why this exists: the console's bridges load a generated project's own
// qa/lib/*.mjs by dynamic import, so fixtures that want the real behavior copy
// the real file. But those modules import each other (approvals.mjs →
// arch-doc.mjs → …), and a missing sibling fails the whole dynamic import at
// LOAD time — the bridge degrades to {available:false} and every
// approvals-through-the-console test fails at once, far from the actual cause.
//
// That rule used to live in a comment ("any fixture that copies the REAL
// approvals.mjs must ship arch-doc.mjs alongside it") enforced by whoever
// remembered it, across six copy sites in three files. Adding one import to
// approvals.mjs broke fourteen tests. So the dependency set is DERIVED here
// instead: read the module, find its relative imports, copy those too, repeat.
// A new sibling import now ships itself.
//
// Since Stage 0 PR 5 the registry is the PROFILE's (qa/lib/profiles/<id>/,
// named by qa/harness-manifest.json) and the profile's own import graph
// reaches most of qa/lib. So a fixture that copies approvals.mjs also gets the
// manifest and the whole vendored lib tree — exactly what a stamped app has.
// A fixture with no manifest is refused by name, which is the behaviour the
// bridge tests exercise deliberately (see the "older scaffold" cases).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_QA_LIB = path.join(HERE, "..", "..", "..", "..", "template", "qa", "lib");
export const TEMPLATE_MANIFEST = path.join(HERE, "..", "..", "..", "..", "template", "qa", "harness-manifest.json");

/** Relative-specifier imports/exports in an ESM source — `from "./x.mjs"`. */
const RELATIVE_IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["'](\.\/[^"']+)["']/g;

/** Modules whose behaviour is the profile's: copying one copies the profile tree and the manifest. */
const PROFILE_BACKED = new Set(["approvals.mjs", "spec-coverage.mjs", "feature-brief.mjs", "walk.mjs", "plan.mjs"]);

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copyTree(src, dst);
    else if (e.isFile()) fs.copyFileSync(src, dst);
  }
}

/**
 * Install the vendored profile tree and the manifest beside `libDir` — what a
 * stamped app carries. Idempotent.
 * @param {string} libDir the fixture's qa/lib
 */
export function installProfile(libDir) {
  copyTree(TEMPLATE_QA_LIB, libDir);
  const manifest = path.join(libDir, "..", "harness-manifest.json");
  if (!fs.existsSync(manifest)) fs.copyFileSync(TEMPLATE_MANIFEST, manifest);
}

/**
 * Copy `name` (e.g. "approvals.mjs") from the real template qa/lib into
 * `libDir`, following its relative imports transitively; a profile-backed
 * module also brings the profile tree and the manifest.
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
  if (PROFILE_BACKED.has(name) && srcDir === TEMPLATE_QA_LIB) installProfile(libDir);
  return [...seen].sort();
}
