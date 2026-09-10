// THE THIRD READER OF THE SAME FACT, AND IT STILL SAYS THE OPPOSITE.
//
// 329d66c taught the loader to refuse a ladder that names steps for a rung
// while the rung beneath it is undeclared. add849e answered the review of that
// commit by making `l1Required` and `l2Execution` PUBLISH the refusal, so
// `explain` prints it, and by rewriting `l0Required`'s meaning to say a ladder
// in that shape "is refused rather than graded". Both are in
// profile-contract.mjs — the file an adopter reads by TYPING a command.
//
// The file an adopter reads WITHOUT typing anything is the profile `harness
// init` writes into their tree, and its ladder legend still carries the promise
// 337e06e put there, three lines above the very declaration it describes:
//
//   "…so an empty l0Required grades nothing rather than granting L0 for free.
//    Nothing here is REQUIRED — declaring less earns less, which is honest and
//    is never refused."
//
// The seeded block declares `l1Required: ["harnessIntegrity", "specCoverage"]`.
// An adopter who follows that promise — empties or deletes `l0Required` because
// their project has no separate assemble step — does not "earn less". The lane
// prints a refusal and `verify.mjs` exits 2 before a step runs. That is the
// exact defect add849e's own commit message describes ("the author read one and
// hit the other"), left standing in the one surface ADR-0016 blames for the
// original ladder defect: "the declaration an external author writes first and
// unaided".
//
// EITHER ANSWER CLOSES THIS: correct the legend the skeleton seeds, or stop
// refusing the state it promises is safe. What is not an answer is a contract
// that now says "refused rather than graded" while the scaffold shipped beside
// it says "never refused" about the same edit to the same ladder.
//
// This test asserts the legend's own promise, over the legend's own declaration
// — both parsed from the skeleton, so it cannot pin wording that has moved on.
// If the promise is rewritten it stops applying, which is the correct behaviour
// for a test of a claim: fixing the claim is one of the two fixes.
import { test } from "node:test";
import assert from "node:assert/strict";

import { profileSkeleton } from "../packages/harness/install/init.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";

const SKELETON = profileSkeleton("demo", { sourceRoots: ["src"], tiers: ["host"], lang: null });
const LADDER_BLOCK = SKELETON.slice(SKELETON.indexOf("export const ladder"), SKELETON.indexOf("export const plants"));
/** The commented block as an author reads it, with the `//` scaffolding taken off. */
const LEGEND = LADDER_BLOCK.split("\n")
  .map((l) => l.replace(/^\/\/\s?/, "").replace(/^\s*\/\/\s?/, ""))
  .join(" ");

const FIELDS = ["l0Required", "l1Required", "l2Execution", "l3Execution"];

/** The ladder the skeleton SEEDS, read out of the skeleton rather than copied. */
function seededLadder() {
  const ladder = {};
  for (const field of FIELDS) {
    const m = LEGEND.match(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`));
    if (!m) continue;
    ladder[field] = [...m[1].matchAll(/"([^"]+)"/g)].map((s) => s[1]);
  }
  return ladder;
}

test("the seeded ladder legend promises an adopter that declaring less is never refused; the loader refuses it", () => {
  const seeded = seededLadder();

  // Not a claim about the legend — a guard against this file quietly asserting
  // nothing if the skeleton's spelling moves.
  assert.ok(
    seeded.l0Required?.length && seeded.l1Required?.length,
    `the seeded ladder no longer parses as one — this file is asserting nothing until it is respelled (got ${JSON.stringify(seeded)})`,
  );

  const promise = LEGEND.match(/[^.]*declaring less[^.]*never refused\./);
  if (!promise) return; // the promise was withdrawn — one of the two valid fixes

  // "Declaring less", spelled every way the legend's own sentences spell it:
  // an EMPTY list (the case the sentence before it works through by name), and
  // the field left out altogether.
  const refused = [];
  for (const field of FIELDS) {
    if (!seeded[field]?.length) continue;
    for (const [how, ladder] of [
      [`${field}: []`, { ...seeded, [field]: [] }],
      [`no ${field} at all`, Object.fromEntries(Object.entries(seeded).filter(([f]) => f !== field))],
    ]) {
      const resolved = evidenceLadderFor({ id: "adopter", ladder }, null);
      if (!resolved.ok) refused.push(`${how} — ${resolved.reason}`);
    }
  }

  assert.deepEqual(
    refused,
    [],
    `the profile \`harness init\` writes into every adopter's tree tells them, three lines above the ladder it ` +
      `seeds: "${promise[0].trim()}" — and the loader refuses these edits to that same seeded ladder ` +
      `(${JSON.stringify(seeded)}), before a step runs:\n  ${refused.join("\n  ")}\n` +
      `profile-contract.mjs was corrected in the same commit as this refusal's review — l0Required's meaning now ` +
      `says such a ladder "is refused rather than graded" — but the scaffold shipped beside it still promises the ` +
      `opposite, and the scaffold is the one an external author reads first and unaided.`,
  );
});
