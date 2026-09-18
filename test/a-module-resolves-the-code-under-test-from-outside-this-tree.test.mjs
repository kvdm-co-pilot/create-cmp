// A MODULE IN THIS REPOSITORY RESOLVES CODE FROM AN ABSOLUTE PATH ON ONE
// MACHINE, SO IT DOES NOT READ THE TREE IT SHIPS IN.
//
// THE INSTANCE THAT PROVOKED THIS. `test/a-minimal-lock-names-a-lane-the-tree-does-not-carry.test.mjs`
// landed as a committed SCRATCH COPY: its own first line says so, and its three
// imports resolve through `const SRC = "<a path to one worktree on one laptop>"`
// rather than through `import.meta.url`. Measured by execution: the source was
// copied to another directory, `writeLaneLock` was moved AHEAD of the
// `config.harness === false` block — the exact regression that test is cited as
// pinning — and the test, run from inside the mutated copy, reported 3 pass / 0
// fail. It was reading the unmutated worktree next door. A pin that cannot see a
// change to the tree it lives in pins nothing, and the same absolute path is
// ERR_MODULE_NOT_FOUND on any other machine, in CI, and here the moment that
// worktree is removed.
//
// THE CLASS, WHICH IS WHAT THIS REFUSES. Not "that file's SRC constant" — the
// instance goes green the moment one const is rewritten, and the next one lands
// one file over. The invariant is that EVERY tracked JavaScript module in this
// repository resolves what it loads relative to itself: a specifier is a
// `node:` builtin, a bare package, or relative. Nothing here names a directory
// on the machine that wrote it. That covers the suite, `scripts/`, `src/`,
// `packages/` and the `template/` bytes an adopter receives, because the failure
// is identical in all of them — code that describes a tree other than the one it
// was loaded from.
//
// WHAT IT DOES NOT CATCH, stated so nobody reads more into a green than is here:
// a path assembled at run time from variables this cannot fold, and an absolute
// path outside both this checkout and any worktree of it (`/bin/sh`, and the
// `"/Users/k/dev/create-cmp"` FIXTURE STRINGS that lane-path tests feed to a
// parser as data and never touch the filesystem with, are deliberately allowed —
// both measured across 542 tracked modules, both legitimate).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every tracked JavaScript module, derived from git rather than listed. */
function trackedModules() {
  const out = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(mjs|cjs|js)$/.test(f));
  assert.ok(out.length > 100, `only ${out.length} tracked modules found — this scan has lost its subject`);
  return out;
}

/**
 * Comments are not code. A path in a comment is a citation (KD-70 owns those);
 * a path in an import is a resolution. Block comments go whole; line comments go
 * only when the `//` is not inside a quote or a URL scheme.
 */
function executableSource(rel) {
  return fs
    .readFileSync(path.join(REPO_ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

/** `const NAME = "literal";` in the same file, so `${NAME}/x` can be folded. */
function stringConsts(src) {
  const consts = new Map();
  for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])((?:[^\\`"']|\\.)*)\2\s*;/g)) {
    consts.set(m[1], m[3]);
  }
  return consts;
}

const fold = (spec, consts) =>
  spec.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (all, id) => (consts.has(id) ? consts.get(id) : all));

/** Every module specifier written as a literal — static `from "…"` and `import("…")`. */
function specifiers(src, consts) {
  const found = [];
  for (const m of src.matchAll(/\bfrom\s*(["'`])((?:[^\\`"']|\\.)*)\1/g)) found.push(m[2]);
  for (const m of src.matchAll(/\bimport\s*\(\s*(["'`])((?:[^\\`"']|\\.)*)\1\s*\)/g)) found.push(m[2]);
  return found.map((raw) => ({ raw, resolved: fold(raw, consts) }));
}

test("NO TRACKED MODULE IMPORTS THROUGH AN ABSOLUTE PATH — a specifier is a builtin, a package, or relative to the importer", () => {
  const offenders = [];
  for (const rel of trackedModules()) {
    const src = executableSource(rel);
    const consts = stringConsts(src);
    for (const { raw, resolved } of specifiers(src, consts)) {
      if (resolved.startsWith("/") || resolved.startsWith("file:///")) {
        offenders.push(`${rel}\n      imports ${JSON.stringify(raw)} → ${resolved}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these modules load code from an absolute path instead of from their own location, so they describe a tree " +
      `other than the one they were loaded from — and on any other machine the path does not exist:\n    ${offenders.join("\n    ")}\n  ` +
      "Resolve through a relative specifier (or `import.meta.url`), which is the only spelling that follows the file.",
  );
});

// ASSEMBLED, NOT SPELLED. Written as one literal, this needle matches the file
// it is written in, and this test could then never go green however clean the
// tree got — a gate whose only permanent offender is itself. Joining the
// segments keeps the scan whole and keeps this file out of its own catch.
const WORKTREE_SEGMENT = ["", ".claude", "worktrees", ""].join("/");

test("NO TRACKED MODULE NAMES THIS CHECKOUT, OR ANY WORKTREE, AS A PATH LITERAL — the same defect arriving through a read or a spawn", () => {
  const offenders = [];
  for (const rel of trackedModules()) {
    const src = executableSource(rel);
    for (const m of src.matchAll(/(["'`])((?:[^\\`"']|\\.)*)\1/g)) {
      const v = m[2];
      const namesThisCheckout = v === REPO_ROOT || v.startsWith(`${REPO_ROOT}/`);
      const namesAWorktree = v.includes(WORKTREE_SEGMENT);
      if (namesThisCheckout || namesAWorktree) offenders.push(`${rel}\n      holds ${JSON.stringify(v.slice(0, 100))}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "these modules spell a path to a checkout on one machine, so whatever they read, run or resolve through it is " +
      `that checkout and not the tree they are part of:\n    ${offenders.join("\n    ")}\n  ` +
      "A tree locates itself from `import.meta.url`; a worktree path in a tracked file is a scratchpad that got committed.",
  );
});
