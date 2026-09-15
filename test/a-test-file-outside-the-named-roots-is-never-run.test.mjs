// WHAT A GREEN SUITE MEANS, and the two ways naming roots can quietly change it.
//
// `npm test` used to be bare `node --test`, which walks the whole working tree.
// Any directory holding test files becomes part of this repo's suite: a git
// worktree checked out inside the repo, a scratch clone, a vendored copy.
// Measured — a stray `wt-probe/test/planted.test.mjs` with one failing
// assertion took the suite to `tests 1926, fail 1`, and it is not this repo's
// test. The reverse is worse and silent: a worktree whose tests all pass adds
// green rows to a number nobody audits.
//
// So the script names its roots. That trade has its own failure mode, and it is
// the dangerous direction: a root that is misspelled, or a test file written
// somewhere no root covers, is not an error — it is a smaller suite that still
// says PASS. This file is what makes that loud.
//
// BOTH DIRECTIONS, because each is a different lie:
//
//   a file no root covers     the suite silently shrinks; a test that was
//                             written, reviewed and committed never runs, and
//                             nothing says so
//   a root covering nothing   a typo'd path contributes zero files and looks
//                             exactly like a path whose tests all pass
//
// The roots are read from `package.json` rather than repeated here. A constant
// in this file would be a second declaration of the same fact, and the two
// would drift — which is the defect class, not a guard against it.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The glob patterns `npm test` hands to the runner, in the order it hands them. */
function declaredPatterns() {
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts.test;
  assert.match(script, /^node --test /, `the test script is no longer \`node --test <patterns>\`: ${script}`);
  // Quoted arguments only. An unquoted `**` would be expanded by the shell
  // before Node sees it, which makes what runs depend on the operator's shell.
  return [...script.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Every test file git is tracking — the set that SHOULD run. */
function trackedTestFiles() {
  return execFileSync("git", ["ls-files", "*.test.mjs"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/** `test/**\/*.test.mjs` → `test/` — the directory a pattern draws from. */
const rootOf = (pattern) => pattern.slice(0, pattern.indexOf("*"));

test("every test file this repo tracks is under a root `npm test` names", () => {
  const roots = declaredPatterns().map(rootOf);
  assert.ok(roots.length, "the test script names no patterns — it is globbing the whole tree again");

  const orphans = trackedTestFiles().filter((rel) => !roots.some((r) => rel.startsWith(r)));
  assert.deepEqual(
    orphans,
    [],
    `${orphans.length} committed test file(s) are not under any root \`npm test\` names, so they NEVER RUN ` +
      `and the suite is green without them:\n    ${orphans.join("\n    ")}\n` +
      `  roots: ${roots.join(", ")}\n` +
      `  Either move the file under a named root, or add its root to the \`test\` script in package.json.`,
  );
});

test("every root `npm test` names actually holds test files", () => {
  // A misspelled root contributes nothing and is indistinguishable from a root
  // whose tests all passed. The suite shrinks by however many files lived there.
  const empty = declaredPatterns()
    .map(rootOf)
    .filter((r) => {
      const abs = path.join(ROOT, r);
      if (!fs.existsSync(abs)) return true;
      return !trackedTestFiles().some((rel) => rel.startsWith(r));
    });
  assert.deepEqual(
    empty,
    [],
    `${empty.length} root(s) in the \`test\` script match no tracked test file: ${empty.join(", ")}. ` +
      `A root that contributes nothing looks exactly like a root whose tests all pass.`,
  );
});

test("a stray tree inside this repo cannot add tests to this repo's suite", () => {
  // The defect itself, asserted as a property of the patterns rather than by
  // planting a directory and running the suite twice — that costs two full
  // runs to prove something about a string. Every pattern must be anchored at a
  // named directory, so nothing outside one can ever match.
  for (const pattern of declaredPatterns()) {
    assert.ok(
      !pattern.startsWith("*") && !pattern.startsWith("/") && !pattern.includes("../"),
      `the pattern ${JSON.stringify(pattern)} is not anchored at a directory in this repo — ` +
        `an unanchored pattern matches inside any worktree, clone or vendored copy that happens to sit here`,
    );
  }
});
