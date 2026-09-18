// THE npm DESCRIPTION IS PRE-INSTALL PROSE, AND IT STILL SAYS "8 gates".
//
// `test/doc-counts.test.mjs` reads `.claude-plugin/*.json` on the stated ground
// that a manifest's PROSE "is what an agent or a human reads BEFORE the
// install, before this repo is ever fetched". A `package.json` `description` is
// the same category one file over: npmjs.com renders it under the package
// title, `npm view` and `npm search` print it, and it reaches a stranger who
// has fetched nothing. The gate reads `packages/**/README.md` and not the
// manifest beside it, and two published manifests still carry the exact string
// this repo's own count gate was built to kill:
//
//     create-kmp / create-compose-multiplatform:
//     "...hold AI-driven changes to a machine-enforced verify lane
//      (8 gates, evidence receipts)..."
//
// docs/USAGE.md §3 is normative about why that sentence cannot be true: *"how
// many steps run depends on `--profile`, so 'N gates' is never a fixed
// number."* The lane that holds an AI-driven change is `local` (17) or `ci`
// (18); the only profile that runs 8 is `smoke`, whose receipt `receipt-check`
// REFUSES as done-evidence. The number is a survivor of the tree where the lane
// had eight gates — the same survivor `doc-counts.test.mjs`'s own header names
// in its first sentence.
//
// ADDING THESE FILES TO `PUBLIC_SURFACES` WOULD NOT CATCH IT, which is why this
// test asserts a different thing than that gate does. Its `gates` noun allows
// any value in the set of derived profile sizes, and `smoke` is 8 — so the
// stale number is laundered by coincidence and comes back a pass. What is
// checkable is the rule §3 already states: a lane size is only a fact once it
// names the profile it belongs to.
//
// Scope: published `package.json` descriptions, derived from
// `scripts/ground-truth.mjs`'s npm list, and nothing else. A description is a
// one-sentence claim about THIS product, so "<n> gates" in one is always a lane
// size. Narrative prose is not in scope and must not be — KD-67 measured a bare
// "<n> steps" scanner at 50% false positives on README bodies.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { groundTruth } from "../scripts/ground-truth.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const GT = groundTruth();

const WORDS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
const LANE_SIZE = new RegExp(`\\b(?:\\d+|${WORDS})[ -](?:gates?|steps?)\\b`, "gi");

/** Every package this repo publishes, and the manifest npm renders for it. */
const PUBLISHED = [GT.npm.primary, ...GT.npm.aliases, ...GT.npm.independent].map((p) => ({
  name: p.name,
  rel: path.join(p.dir, "package.json"),
}));

test("every published npm description states a lane size without naming a profile", () => {
  assert.ok(PUBLISHED.length > 0, "the npm list derived nothing — this test is reading no manifests");

  const profiles = Object.keys(GT.verifyProfiles);
  const offenders = [];
  for (const pkg of PUBLISHED) {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, pkg.rel), "utf8"));
    const description = manifest.description ?? "";
    for (const m of description.matchAll(LANE_SIZE)) {
      // A size bound to a profile is a fact and is gated elsewhere
      // (`laneSizeClaims` in test/doc-counts.test.mjs). A bare one is not.
      if (profiles.some((p) => description.includes(`\`${p}\``))) continue;
      offenders.push(`${pkg.rel} (${pkg.name}) says "${m[0]}"`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a published npm description states a verify-lane size that names no profile, and docs/USAGE.md §3 ` +
      `says such a number does not exist: the lane runs ${Object.entries(GT.verifyProfiles)
        .map(([n, p]) => `${n}=${p.count}`)
        .join(", ")}. ${offenders.join("; ")}. This text is what npmjs.com shows a stranger who has ` +
      `installed nothing — the same ground on which .claude-plugin/*.json was gated.`,
  );
});
