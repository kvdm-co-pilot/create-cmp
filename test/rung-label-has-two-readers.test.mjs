// "A sixth field cannot reintroduce the split, because there is nowhere else to
// add it" — readLadder's docblock, and the commit message's headline claim.
//
// There were six fields, not five. `names` is the sixth, it is IN readLadder's
// return, and it is the one field readLadder's own consumers do not both read
// through it:
//
//   rungFor        RUNG_NAMES = { L0:"L0", … , ...readLadder(ladder).names }
//   ladderStanding RUNG_NAMES = L.names ?? {}        ← the RAW ladder
//                  name = typeof RUNG_NAMES[r.id] === "string" ? … : r.id
//
// Two readers, one declaration, two different rules — the exact shape the five
// step-name fields were just consolidated to kill, left standing on the field
// that names the rung. Where the label is a string they agree, so the real
// ladders in this tree are unaffected; where it is anything else the grader
// writes the raw value onto the receipt (`evidenceLevel.name`) and the console
// substitutes the rung id, so the strip and the ladder row report two different
// labels for one rung of one ladder — and nothing refuses the declaration,
// because evidence-ladder.mjs validates STEP_NAME_FIELDS and `names` is not one.
//
// The property asserted is conditional on the LOADER ACCEPTING the ladder. A
// refusal in evidence-ladder.mjs is an equally good answer to this and leaves
// this test green; what is not an answer is two readers with two rules.
import { test } from "node:test";
import assert from "node:assert/strict";

import { evidenceLevel, ladderStanding } from "../packages/harness/src/lib/evidence-level.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";

/** The smallest declaration the Rule 0 instrument could plant from — so a null rung can only mean the ladder. */
const SOME_PLANTS = {
  testFileBasename: "PlantedCitation.txt",
  unboundCitationSource: (clause) => `// SPEC: ${clause}\ntype Planted = {}\n`,
  tierUnmetCitationSource: (clause) => `// SPEC: ${clause}\ntest("planted", () => {})\n`,
  unmeetableTier: "integration",
};

const PASSED = ["assemble", "static"];
const ROWS = PASSED.map((name) => ({ name, verdict: "PASS", durationMs: 1 }));

const withNames = (names) => ({ l0Required: ["assemble"], l1Required: ["static"], names });

test("the grader and the console put two different labels on one rung of one ladder", () => {
  const shapes = [
    ["every rung labelled — the control", { L0: "green", L1: "bound", L2: "device", L3: "release" }],
    ["labels for rungs this ladder does not declare — the control", { L2: "device" }],
    ["no labels at all — the control", {}],
    ["a label that is a number", { L1: 42 }],
    ["a label that is a list, the way every field beside it is", { L1: ["bound"] }],
    ["a label explicitly blanked", { L1: null }],
  ];

  const disagreed = [];
  for (const [label, names] of shapes) {
    const ladder = withNames(names);
    const resolved = evidenceLadderFor({ id: "p", ladder }, null);
    // Refusing the declaration is a legitimate answer; grading it two ways is not.
    if (!resolved.ok) continue;
    const graded = evidenceLevel(ROWS, "local", { mode: "full", ladder, plants: SOME_PLANTS });
    const stand = ladderStanding(ladder, { earned: graded && graded.rung, passed: PASSED });
    const drawn = stand.rungs.find((r) => r.id === (graded && graded.rung));
    if (!graded || !drawn) continue;
    if (graded.name !== drawn.name) {
      disagreed.push(
        `${label}: the receipt records ${graded.rung} · ${JSON.stringify(graded.name)} and the console draws the same ` +
          `rung as ${JSON.stringify(drawn.name)} — one declaration, two readers, and the loader accepted it`,
      );
    }
  }

  assert.deepEqual(
    disagreed,
    [],
    `readLadder normalises \`names\` and ladderStanding reads the raw ladder instead, so the sixth field kept the ` +
      `split the other five were just consolidated to end:\n  ${disagreed.join("\n  ")}`,
  );
});
