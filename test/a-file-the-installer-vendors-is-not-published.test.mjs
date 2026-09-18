// A FILE THE INSTALLER COPIES OUT OF THIS PACKAGE, THAT THE PACKAGE DOES NOT PUBLISH.
//
// The sibling check (`every-module-a-bin-imports-is-published`) holds one mechanism:
// what a bin IMPORTS. It is not the only way a published command needs a file out of
// its own package. `create-cmp harness init` and `create-cmp upgrade --harness` COPY
// files out of `packages/harness/` into the adopter's tree, and `vendorPlan()` in
// `packages/harness/install/init.mjs` is the single declaration of which ones. A source
// in that plan that `files` does not ship is the same defect wearing a different verb,
// and it fails more quietly than a missing import: no stack trace, no refusal, just a
// tree with one fewer file in it and a `✓ N files written` that says N-1.
//
// MEASURED, not inferred (2026-09-19, at `4720c70`):
//
//     npm pack  →  node package/bin/create-cmp.mjs harness init T1   → 52 files
//     repo      →  node bin/create-cmp.mjs           harness init T2 → 53 files
//     diff      →  only T2 has qa/evidence/schema.json
//
// `vendorPlan()` names `packages/harness/evidence/schema.json`, guarded by an
// `fs.existsSync` that is true in a checkout and false in an install, so the omission
// is silent in both directions: the file is skipped, and `qa/harness.lock.json` locks
// 51 files either way — the region never covers it, so `harness relock` and
// `framework-check` cannot see it missing either. The installer's own comment at that
// line says the schema was MOVED into the package precisely "because a registry install
// has no template to read"; the package's `files` array never carried the directory, so
// the move did not arrive for the install it was made for.
//
// THE ORACLE IS NPM, NOT A RE-SPELLING OF NPM'S RULES. `files` is an allow-list with
// globs, negations, always-included and never-included names, and `.npmignore`; any
// predicate written here would be a second spelling of that, and the direction it gets
// wrong is the direction that ships a broken command. `npm pack --dry-run --json` is
// npm answering for itself, measured at ~2s, and it writes no tarball.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { vendorPlan } from "../packages/harness/install/init.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every path the published root package would contain, as npm itself answers it. */
function publishedPaths() {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  const parsed = JSON.parse(out);
  const files = parsed?.[0]?.files;
  // A shape npm changed under us must fail loudly. A vacuous pass here is the whole defect.
  assert.ok(Array.isArray(files) && files.length > 0, "`npm pack --dry-run --json` did not answer with a file list");
  return new Set(files.map((f) => f.path));
}

test("every file the harness installer copies out of this package is in the published package", () => {
  const plan = vendorPlan();
  assert.ok(plan.length > 0, "vendorPlan() named nothing to copy — this check would pass vacuously");

  const published = publishedPaths();
  const absent = [];
  for (const { rel, src } of plan) {
    const from = path.relative(ROOT, src);
    // A source outside this package is another package's problem, not this array's.
    if (from.startsWith("..")) continue;
    if (!published.has(from)) absent.push(`${from} → ${rel}`);
  }

  assert.deepEqual(
    absent,
    [],
    `${absent.length} file(s) the installer vendors are absent from the published package:\n  ${absent.join("\n  ")}\n\n` +
      "Add the path to `files` in the root package.json. An adopter who ran `npx create-cmp harness init` " +
      "gets a tree missing these, with no error and a file count that simply reads lower — and the region " +
      "lock does not cover them, so relock and framework-check report the lane intact.",
  );
});
