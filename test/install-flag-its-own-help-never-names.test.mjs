// A FLAG THE COMMAND BRANCHES ON THAT ITS OWN HELP NEVER NAMES.
//
// This repo already refuses this class for the lane: test/verify-flags.test.mjs,
// "every recognized flag is documented in --help", reads verify.mjs's
// RECOGNIZED_FLAGS against its USAGE block. The reason given there is the one
// that matters — a flag surface is only real if the two halves are read against
// each other, and nothing reads them unless a test does.
//
// The harness's OWN front door had no such gate, and it is the front door an
// external adopter meets first. `prooflane --help` prints a Flags block that
// reads as complete: four flags, one line each, under the word "Flags". An
// adopter takes it as the list. Anything the install commands branch on and that
// block does not name is a control surface that exists and cannot be found —
// and, worse, one whose behaviour nobody has had to write down, so it is
// whatever the branch happens to do.
//
// THE INVARIANT is over the pair, not over any flag: every flag
// packages/harness/install/* reads out of `flags` is named in the usage the
// command that dispatches to it prints. A single letter is allowed when a named
// long flag begins with it, because `--v` and `--h` are aliases of `--version`
// and `--help`, which the block does name.
//
// WHY prooflane's usage IS THE REFERENCE and not create-cmp's: `prooflane` is
// the harness's own binary and the only surface that prints a complete flag list
// for these three commands. (create-cmp's help carries a one-line summary of
// `harness init flags` that is already shorter than prooflane's — a separate
// question, and not one this test decides.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { matchBracket, trackedSources } from "./helpers/js-source-scan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONT_DOOR = path.join(REPO_ROOT, "packages", "harness", "bin", "prooflane.mjs");

/**
 * A source with its COMMENTS removed and its strings left intact — the opposite
 * of what the masker gives, and the form this question needs: `flags["dry-run"]`
 * hides its flag name inside a string, while a flag named only in a comment is
 * not a branch.
 */
function codeOf(raw) {
  return raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** The flags named in the text `prooflane --help` prints. */
function documentedFlags() {
  const raw = fs.readFileSync(FRONT_DOOR, "utf8");
  const at = raw.indexOf("function usage()");
  assert.notEqual(at, -1, "prooflane.mjs no longer has a usage() — this test cannot find the help it is reading against");
  const open = raw.indexOf("{", at);
  const body = raw.slice(open, matchBracket(raw, open) + 1);
  return new Set([...body.matchAll(/--([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
}

/** Every flag the install commands branch on, and where. */
function branchedFlags() {
  const sources = trackedSources(REPO_ROOT, (rel) => !rel.startsWith("packages/harness/install/"));
  assert.ok(sources.size >= 3, `scanned ${sources.size} install modules — this test has lost sight of the commands it is for`);
  const out = new Map();
  for (const [, { rel, raw }] of sources) {
    for (const m of codeOf(raw).matchAll(/\bflags\s*(?:\[\s*"([^"]+)"\s*\]|\.([A-Za-z_$][\w$]*))/g)) {
      const flag = m[1] ?? m[2];
      out.set(flag, new Set([...(out.get(flag) ?? []), rel]));
    }
  }
  return out;
}

test("every flag the install commands branch on is named in the help its front door prints", () => {
  const documented = documentedFlags();
  const branched = branchedFlags();

  // Either half going empty would make this pass in silence.
  assert.ok(documented.size >= 4, `prooflane's usage names ${documented.size} flags — this test is reading the wrong text`);
  assert.ok(branched.size >= 4, `found ${branched.size} flags branched on in packages/harness/install — this test is inert`);

  const undocumented = [];
  for (const [flag, where] of [...branched].sort()) {
    if (documented.has(flag)) continue;
    // `--v` for `--version`: a one-letter alias of a flag the block names.
    if (flag.length === 1 && [...documented].some((d) => d.startsWith(flag))) continue;
    undocumented.push({ flag, where: [...where] });
  }

  assert.deepEqual(
    undocumented.map((u) => `--${u.flag}`),
    [],
    undocumented.map((u) => `  \`--${u.flag}\` changes what ${u.where.join(", ")} does, and \`prooflane --help\` does not name it.`).join("\n") +
      `\n\n  prooflane --help currently names: ${[...documented].sort().map((f) => `--${f}`).join(", ")}.\n` +
      "  Add the flag to the Flags block, or stop branching on it. A flag an adopter cannot discover is one whose " +
      "meaning was never written down — and this product tells a user about at least one of these by name in its own " +
      "output, which is documentation delivered to the only person who already knew.",
  );
});
