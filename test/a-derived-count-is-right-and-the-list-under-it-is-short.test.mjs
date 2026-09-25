// A COUNT CAN BE DERIVED AND CORRECT WHILE THE LIST IT COUNTS IS SHORT.
//
// `test/doc-counts.test.mjs` refuses a public surface whose NUMBER contradicts
// `scripts/ground-truth.mjs`. It reads numbers, so it cannot see the other half
// of the same claim: the enumeration the number summarises. Both halves are
// wrong in docs/USAGE.md today, and in both places the number is the correct,
// derived one — which is exactly why nothing caught it:
//
//   §4 "The 12 skills"  — heading states 12 (right), table lists 10. The rows
//                         for `grill-me` and `plugin-refresh` are ORPHANED at
//                         lines 1-2 of the file, above the document's own
//                         title, where GitHub renders them as a stray
//                         two-row table before the H1.
//   §3 profile table    — `scaffold` states 10 (right, and corrected to 10 in
//                         this very slice) and then enumerates the nine steps
//                         it proves. `e2eCoverage` — a step in EVERY profile,
//                         including `smoke`, and one that can FAIL an
//                         adopter's lane — is named nowhere in the deep
//                         reference. It is the step whose arrival pushed all
//                         six of §3's numbers up by one.
//
// So this is the invariant the number gate cannot state: THE REFERENCE THAT
// COUNTS A THING NAMES EVERY ONE OF IT. Written against the derived lists
// rather than against the two names missing today, so the next skill and the
// next lane step cannot ship documented only by an incremented digit.
//
// Scope: docs/USAGE.md only, and deliberately. It is the surface
// docs/DOCUMENTATION.md calls "**the deep reference** — ... the 11 skills, the
// profile-tiered verify lane", so it is the one document that promises the
// enumeration. README.md and llms.txt state the same counts as summaries and
// promise no list; requiring the enumeration of them would be a false positive
// by design.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { groundTruth } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const USAGE = fs.readFileSync(path.join(ROOT, "docs/USAGE.md"), "utf8");
const GT = groundTruth();

/** Prose spells a step `release-build` and the lane spells it `releaseBuild`. */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The section a heading opens, up to the next heading at the same or a higher
 * level — "what is under this title", the way a reader sees it.
 */
function sectionUnder(text, headingMatcher) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^#{1,6} /.test(l) && headingMatcher.test(l));
  assert.notEqual(start, -1, `docs/USAGE.md has no heading matching ${headingMatcher}`);
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6}) /);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

test("the section that counts the skills does not name every skill the plugin declares", () => {
  const heading = new RegExp(`\\b${GT.skills.count} skills\\b`, "i");
  const section = norm(sectionUnder(USAGE, heading));
  const missing = GT.skills.declared.filter((s) => !section.includes(norm(s)));
  assert.deepEqual(
    missing,
    [],
    `docs/USAGE.md's "${GT.skills.count} skills" section documents ${GT.skills.count - missing.length} of ` +
      `${GT.skills.count}. Undocumented there: ${missing.join(", ")}. The count gate reads the heading's ` +
      `number and passes; a reader counts the rows. Run \`node scripts/ground-truth.mjs\` for the list.`,
  );
});

test("the profile table that counts the lane's steps does not name every step the lane runs", () => {
  // The table rows are the enumeration: each one says what its profile proves
  // or what it adds. Read all of them together, so a step named in any row
  // counts as documented and only a step named in NO row is a miss.
  const rows = USAGE.split("\n").filter((l) => /^\|\s*`(smoke|scaffold|local|ci|nightly|release)`\s*\|/.test(l));
  assert.ok(rows.length >= Object.keys(GT.verifyProfiles).length, "the profile table moved — this test is reading nothing");

  const table = norm(rows.join("\n"));
  const everyStep = [...new Set(Object.values(GT.verifyProfiles).flatMap((p) => p.steps))];
  const missing = everyStep.filter((s) => !table.includes(norm(s)));
  assert.deepEqual(
    missing,
    [],
    `docs/USAGE.md §3's profile table states each profile's derived size and then names ` +
      `${everyStep.length - missing.length} of ${everyStep.length} steps. Never named: ${missing.join(", ")} — ` +
      `a step that runs in ${Object.entries(GT.verifyProfiles)
        .filter(([, p]) => missing.some((m) => p.steps.includes(m)))
        .map(([n]) => n)
        .join("/")} and can FAIL an adopter's lane under a name no document explains.`,
  );
});
