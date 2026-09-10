// THE BUNDLE'S FRESHNESS HASH DOES NOT COVER EVERYTHING THE BUNDLE CONTAINS.
//
// inspector/mcp/dist/server.mjs is a COMMITTED artifact — the plugin is
// distributed as a git clone, so whatever is in git is what users run. Its one
// staleness guard is `cmp:bundle-inputs <hash>`, recomputed by
// inspector/mcp/test/bundle-freshness.test.mjs and by
// `node scripts/build-bundle.mjs --check`. src/lib/build-id.mjs states the rule
// that hash exists to hold, in its own words:
//
//   "A hash that covers less than the bundle attests less than it appears to."
//
// It covers less than the bundle. `sourceFiles()` walks inspector/mcp/src,
// packages/harness/src/console and bin/server.mjs. esbuild runs with
// `packages: "bundle"`, so it also FOLLOWS the `prooflane-harness/lib/*.mjs`
// imports and inlines packages/harness/src/lib modules into the artifact —
// seven of them today, none of them hashed. Edit one, do not rebuild, and both
// guards report the bundle is current while every plugin user runs the old code.
//
// THIS IS NOT THEORETICAL AND IT IS NOT OLD NEWS. d6461f1 — the commit that
// added this file's subject — changed the behaviour of exactly such a module
// (`legacySkipReasons` into INHERITABLE in packages/harness/src/lib/profile-
// loader.mjs, which the bundle inlines) and ADDED a second one to the blind set
// (packages/harness/src/lib/harness-manifest.mjs, the new import in
// applyConsoleCopy). It happens to have been rebuilt. The next such edit is
// under no obligation to be, and nothing would say so. Planted and observed:
// insert a token into profile-loader.mjs's INHERITABLE list and
// `build-bundle.mjs --check` still prints "✓ dist/server.mjs is current".
//
// THE PROPERTY, DERIVED FROM THE ARTIFACT ITSELF — no bundler is run here and
// no list is typed. esbuild writes the module path above each inlined module,
// so the committed bundle declares which first-party sources it carries; every
// one of them must be inside the set the attesting hash reads.
//
// The fix is in build-id.mjs's `sourceFiles()` — the bundle's own module graph
// is the hash's input set, not three hand-chosen directories.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sourceFiles } from "../inspector/mcp/src/lib/build-id.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MCP_ROOT = path.join(REPO_ROOT, "inspector", "mcp");
const BUNDLE = path.join(MCP_ROOT, "dist", "server.mjs");

/**
 * The first-party modules the COMMITTED bundle says it inlined. esbuild emits
 * `// <path>` on its own line ahead of each module, relative to the directory
 * the build ran from (inspector/mcp). A comment is only believed when it
 * resolves to a real repo file outside node_modules, so prose cannot fake one.
 */
function modulesInsideTheBundle() {
  const text = fs.readFileSync(BUNDLE, "utf8");
  const found = new Set();
  for (const m of text.matchAll(/^\/\/ ([A-Za-z0-9_@./-]+\.mjs)$/gm)) {
    const abs = path.resolve(MCP_ROOT, m[1]);
    if (abs.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (!abs.startsWith(REPO_ROOT + path.sep)) continue;
    if (!fs.existsSync(abs)) continue;
    found.add(abs);
  }
  return [...found].sort();
}

test("every source inlined into the committed bundle is inside the hash that gates its freshness", () => {
  assert.ok(fs.existsSync(BUNDLE), "inspector/mcp/dist/server.mjs is missing — this test reads the committed artifact");

  const inlined = modulesInsideTheBundle();
  // INERTNESS GUARD. If esbuild ever stops emitting per-module path comments,
  // this derivation would silently find nothing and pass forever — a lint that
  // quietly stops checking is worse than one that never checked.
  assert.ok(
    inlined.length >= 20,
    `derived only ${inlined.length} inlined modules from the committed bundle — the derivation is inert, ` +
      `not the codebase clean. dist/server.mjs no longer carries esbuild's per-module path comments; ` +
      "re-derive the module graph from the metafile instead.",
  );

  const hashed = new Set(sourceFiles().map((p) => path.resolve(p)));
  const unattested = inlined.filter((abs) => !hashed.has(abs)).map((abs) => path.relative(REPO_ROOT, abs));

  assert.deepEqual(
    unattested,
    [],
    "these files are INSIDE the committed dist/server.mjs but outside sourceFiles(), so cmp:bundle-inputs " +
      "does not move when they change and both freshness guards call a stale bundle current:\n  " +
      `${unattested.join("\n  ")}\n` +
      "  Fix: derive sourceFiles() from the bundle's real module graph in inspector/mcp/src/lib/build-id.mjs.",
  );
});
