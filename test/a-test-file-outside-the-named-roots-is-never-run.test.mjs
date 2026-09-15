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
// So the script names the patterns it runs. That trade has its own failure mode,
// and it is the dangerous direction: a pattern that matches nothing, or a test
// written where no pattern reaches, is not an error — it is a smaller suite that
// still says PASS. This file is what makes that loud.
//
// BOTH DIRECTIONS, because each is a different lie:
//
//   a file no pattern matches    the suite silently shrinks; a test that was
//                                written, reviewed and committed never runs,
//                                and nothing says so
//   a pattern matching nothing   contributes zero files and looks exactly like
//                                a pattern whose tests all pass
//
// IT ASKS THE GLOBBER, NOT THE PREFIX. The first version derived a root as the
// substring before the first `*` and compared with `startsWith`, which is
// containment, not matching — so every narrowing AFTER the root was invisible.
// Review measured it: declaring `test/**\/nope*` for all three patterns ran the
// suite to ZERO tests, exit 0, with all three assertions passing. `node --test`
// never complains about a pattern matching nothing.
//
// That is the shape a peer session named the same day, having paid for it in a
// Gradle task that existed, ran, compiled nothing and exited 0: **a guard
// written against ABSENCE does not catch VACUITY.** A missing pattern was always
// caught. Present-and-matching-nothing is the one that got through, and from
// outside it is identical to a property that holds.
//
// The patterns are read from `package.json` rather than repeated here. A
// constant in this file would be a second declaration of the same fact, and the
// two would drift — which is the defect class, not a guard against it.
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

/**
 * Does this glob match this path? Hand-rolled, and here is why.
 *
 * `fs.globSync` is the obvious answer and it is Node 22+; this repo's floor is
 * 20.19 and `test/node-floor.test.mjs` refuses a newer API by name — correctly,
 * and it caught this within a minute of being written. Raising the floor to
 * satisfy a test would be the gate-edited-into-agreement move.
 *
 * Matching the TRACKED set rather than the disk is the better answer anyway.
 * "Which files should run" is a question about what is committed; a disk walk
 * also sees scratch files, build output and anything a worktree left behind —
 * which is the class of problem this whole file exists for.
 *
 * Two constructs, and no more: `**\/` spans any number of segments, `*` spans
 * any characters within one. Everything else is literal. The translation is
 * asserted below rather than trusted, because it is the mechanism deciding
 * whether the suite is complete.
 */
function globMatches(pattern, rel) {
  const SPAN = "\u0000";
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, SPAN)
    .replace(/\*/g, "[^/]*")
    .replace(new RegExp(SPAN, "g"), "(?:.*/)?");
  return new RegExp(`^${source}$`).test(rel);
}

test("the glob translation this guard rests on is correct", () => {
  // The guard is only as good as this function, and it is the one piece here
  // nobody else owns. A translation that matched everything would make both
  // assertions below vacuous while they read as passing.
  const cases = [
    ["test/**/*.test.mjs", "test/a.test.mjs", true],
    ["test/**/*.test.mjs", "test/sub/a.test.mjs", true],
    ["test/**/*.test.mjs", "test/sub/deep/a.test.mjs", true],
    ["test/*.test.mjs", "test/a.test.mjs", true],
    ["test/*.test.mjs", "test/sub/a.test.mjs", false],
    ["test/**/*.test.mjs", "other/a.test.mjs", false],
    ["test/**/*.test.mjs", "test/a.mjs", false],
    ["test/**/nope*.mjs", "test/a.test.mjs", false],
    ["inspector/mcp/test/**/*.test.mjs", "inspector/mcp/test/x.test.mjs", true],
    ["inspector/mcp/test/**/*.test.mjs", "inspector/mcp/other/x.test.mjs", false],
    // `.` is a literal, not "any character" — or `test/x-test.mjs` would match
    // a pattern written for `test/x.test.mjs`.
    ["test/x.test.mjs", "test/xytest.mjs", false],
  ];
  for (const [pattern, rel, want] of cases) {
    assert.equal(globMatches(pattern, rel), want, `${pattern} vs ${rel} should be ${want}`);
  }
});

test("every test file this repo tracks is matched by a pattern `npm test` names", () => {
  const patterns = declaredPatterns();
  assert.ok(patterns.length, "the test script names no patterns — it is globbing the whole tree again");

  const orphans = trackedTestFiles().filter((rel) => !patterns.some((p) => globMatches(p, rel)));
  assert.deepEqual(
    orphans,
    [],
    `${orphans.length} committed test file(s) are matched by no pattern \`npm test\` names, so they NEVER RUN ` +
      `and the suite is green without them:\n    ${orphans.join("\n    ")}\n` +
      `  patterns: ${patterns.join(", ")}\n` +
      `  Either move the file under a named pattern, or add its pattern to the \`test\` script in package.json.`,
  );
});

test("every pattern `npm test` names actually matches test files", () => {
  // VACUITY, not absence — the distinction a peer session paid for today. A
  // pattern that matches nothing is not an error to `node --test`; it is a
  // smaller suite, or an empty one, reported as PASS. A missing root was always
  // caught; present-and-matching-nothing is the one that got through.
  const tracked = trackedTestFiles();
  const empty = declaredPatterns().filter((p) => !tracked.some((rel) => globMatches(p, rel)));
  assert.deepEqual(
    empty,
    [],
    `${empty.length} pattern(s) in the \`test\` script match no file: ${empty.join(", ")}. ` +
      `\`node --test\` does not complain about a pattern matching nothing — it just runs fewer tests, ` +
      `or none, and exits 0.`,
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
