// "A lone string is a list of one EVERYWHERE, not just where ADR-0016 argued
// it" — readLadder's own docblock, and the commit that added it says the same
// thing about the crash it closed:
//
//   "`l0Required: "assemble"` resolved clean ... and then threw
//    `TypeError: L0_REQUIRED.every is not a function` in the grader — at
//    verify.mjs:641, after every step had already run. A lone string is a list
//    of one everywhere now."
//
// It is a list of one inside `rungFor`. It is still a raw string TWO STATEMENTS
// LATER, in the same function `verify.mjs:641` calls:
//
//   const floor = (ladder.l0Required ?? []).filter((name) => …);   // gradeEvidence
//
// That line runs on exactly the path `rungFor` returning null hands to it — a
// lane where nothing FAILed and the floor rung was not earned, which is the
// "a SKIP never earns a rung" sentence the grader exists to be able to say. So
// the declaration the loader blesses still kills the lane at the same call
// site, after every step has run and before the receipt is written; the fix
// moved the throw from the branch a fully green lane takes to the branch a lane
// with one SKIP takes, and the test committed with it only ever ran the first.
//
// The same string reaches the Rule 0 instrument by a second route:
// `assessBadgeFloor` spreads `ladder.l0Required` into its synthetic rows, gets
// eight one-character step names out of "assemble", earns no rung, and falls
// into that same `.filter` — so `node qa/framework-check.mjs` dies with an
// unhandled TypeError instead of reporting the badge floor at all.
import { test } from "node:test";
import assert from "node:assert/strict";

import { gradeEvidence } from "../packages/harness/src/lib/evidence-level.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";
import { assessBadgeFloor } from "../packages/harness/src/lib/framework-check.mjs";

/** The smallest declaration the Rule 0 instrument could plant from — so a null rung can only mean the ladder. */
const SOME_PLANTS = {
  testFileBasename: "PlantedCitation.txt",
  unboundCitationSource: (clause) => `// SPEC: ${clause}\ntype Planted = {}\n`,
  tierUnmetCitationSource: (clause) => `// SPEC: ${clause}\ntest("planted", () => {})\n`,
  unmeetableTier: "integration",
};

/** The shape ADR-0016 blesses and the loader accepts: one name, not a list. */
const LONE = { l0Required: "assemble", l1Required: ["static"] };

const threw = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return `${e.constructor.name}: ${e.message}`;
  }
};

test("the loader still blesses a lone-string l0Required — the premise both cases below rest on", () => {
  const resolved = evidenceLadderFor({ id: "p", ladder: LONE }, null);
  assert.equal(
    resolved.ok,
    true,
    "precondition: the malformed-entry check wraps a non-array as [raw] before judging it, so a lone step name is a " +
      "well-formed declaration to the loader. If that has changed, these two cases are unreachable and this file is stale.",
  );
});

test("a lane whose floor step SKIPped loses its receipt to a TypeError — the lone-string crash the fix says it closed", () => {
  // Nothing FAILed. One step SKIPped, which is the honest, everyday shape the
  // grader has a whole sentence prepared for ("a SKIP never earns a rung").
  const rows = [
    { name: "assemble", verdict: "SKIP", durationMs: 1 },
    { name: "static", verdict: "PASS", durationMs: 1 },
  ];
  const boom = threw(() => gradeEvidence(rows, "local", { mode: "full", ladder: LONE, plants: SOME_PLANTS }));
  assert.equal(
    boom,
    null,
    `${boom} — thrown by gradeEvidence's own no-rung explanation, which reads \`ladder.l0Required\` RAW two ` +
      `statements after rungFor read it through readLadder. verify.mjs:641 calls this function after every step has ` +
      `run and before the receipt is written, so the lane pays for a full run and records nothing. The declaration ` +
      `is the one the loader blesses and the one the fix names; only the branch changed.`,
  );
});

test("Rule 0's badge-floor plant dies on the same declaration instead of reporting a floor", () => {
  // assessBadgeFloor synthesises its rows by spreading the ladder's own fields:
  //   [...new Set([...(ladder.l0Required ?? []), ...(ladder.l1Required ?? [])])]
  // A string spreads to its characters, so "assemble" becomes eight one-letter
  // steps, the real step never PASSes, no rung is earned — and the fall-through
  // is gradeEvidence's raw `.filter` again.
  const boom = threw(() => assessBadgeFloor({ ladder: LONE, plants: SOME_PLANTS }));
  assert.equal(
    boom,
    null,
    `${boom} — framework-check.mjs runs assessBadgeFloor at top level with no try/catch, so \`node ` +
      `qa/framework-check.mjs\` (Rule 0's instrument, and the only thing that watches the badge floor still bite) ` +
      `exits on an unhandled TypeError for a ladder the loader graded clean. A floor nobody can run is a floor that ` +
      `quietly stopped being there.`,
  );
});
