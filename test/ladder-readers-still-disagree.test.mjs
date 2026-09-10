// The reshape fix normalised the two fields the last review NAMED — l2Execution
// and l3Execution — and left the other three step-name fields exactly as they
// were. `rungFor` still reads them raw:
//
//   const SCAFFOLD_CORE = L.scaffoldCore ?? [];
//   const L0_REQUIRED   = L.l0Required   ?? [];
//   const L1_REQUIRED   = L.l1Required   ?? [];
//
// while `evidenceLadderFor` accepts a lone string in ANY of them (its new
// malformed-entry check wraps a non-array as `[raw]` before judging it, which
// is the same "one name is a list of one" rule asList documents). So the shape
// the loader blesses is the shape the grader dies on — one field over from the
// one that was fixed.
//
// And the second half of the fix — "an empty required list earns nothing" —
// changed what `rungFor` can award without changing what `ladderStanding`
// draws. The console's own rule, pinned since 2026-09-09 in
// test/console-ladder.test.mjs ("no rung is drawn that this profile could never
// mint"), now fails for L1 on every ladder that takes the contract at its word:
// `l1Required` says "Declare none and this profile tops out at L0".
import { test } from "node:test";
import assert from "node:assert/strict";

import { evidenceLevel, ladderStanding } from "../packages/harness/src/lib/evidence-level.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";
import { ladderRowHtml } from "../packages/harness/src/console/console-ladder.mjs";

/** The smallest declaration the Rule 0 instrument could plant from — so a null rung can only mean the ladder. */
const SOME_PLANTS = {
  testFileBasename: "PlantedCitation.txt",
  unboundCitationSource: (clause) => `// SPEC: ${clause}\ntype Planted = {}\n`,
  tierUnmetCitationSource: (clause) => `// SPEC: ${clause}\ntest("planted", () => {})\n`,
  unmeetableTier: "integration",
};

const PASSED = ["assemble", "static", "run", "ship"];
const ROWS = PASSED.map((name) => ({ name, verdict: "PASS", durationMs: 1 }));
const ORDER = ["L0", "L1", "L2", "L3"];

/** The rung a fully green lane earns, or the throw that stopped it being graded at all. */
function graded(ladder) {
  try {
    return evidenceLevel(ROWS, "p", { mode: "full", ladder, plants: SOME_PLANTS });
  } catch (e) {
    return { threw: `${e.constructor.name}: ${e.message}` };
  }
}

test("the grader reads scaffoldCore, l0Required and l1Required RAW — the lone-string shape the loader accepts crashes it", () => {
  const broken = [];
  for (const [field, name] of [
    ["l0Required", "assemble"],
    ["l1Required", "static"],
  ]) {
    const ladder = { l0Required: ["assemble"], l1Required: ["static"], [field]: name };
    const resolved = evidenceLadderFor({ id: "p", ladder }, null);
    assert.equal(
      resolved.ok,
      true,
      `precondition: the loader accepts \`${field}: "${name}"\` — it wraps a non-array as [raw] before judging its ` +
        `entries, so a lone step name is a well-formed declaration to it. If that has changed, this test's premise has.`,
    );
    const rung = graded(ladder);
    if (rung.threw) {
      broken.push(
        `${field}: "${name}" resolves clean and then ${rung.threw} inside rungFor — and it throws where nothing catches ` +
          `it: verify.mjs grades AFTER every step has run, so the lane loses the receipt for a run it already paid for, ` +
          `and assessBadgeFloor (Rule 0) spreads the same field and dies the same way.`,
      );
    }
  }

  // No throw on this one, which is worse: `new Set("assemble")` is a set of
  // eight CHARACTERS, so the step the ladder named is not counted as the
  // evidence it was declared to be, and the receipt's `satisfiedBy` says so.
  const lone = { scaffoldCore: "assemble", l0Required: ["assemble"], l1Required: ["static"] };
  const asWritten = graded(lone);
  const asL1st = graded({ ...lone, scaffoldCore: ["assemble"] });
  if (JSON.stringify(asWritten.satisfiedBy) !== JSON.stringify(asL1st.satisfiedBy)) {
    broken.push(
      `scaffoldCore: "assemble" grades satisfiedBy ${JSON.stringify(asWritten.satisfiedBy)} where ` +
        `scaffoldCore: ["assemble"] grades ${JSON.stringify(asL1st.satisfiedBy)} — the same declaration under the rule ` +
        `asList states ("one name is a list of one") and the rule the loader enforces, spread into a Set of its own ` +
        `characters by the grader, so a PASSed step the ladder names is dropped from the receipt's evidence list.`,
    );
  }

  assert.deepEqual(
    broken,
    [],
    `asList was put on l2Execution and l3Execution because "a lone string made the grader throw outright". The other ` +
      `three step-name fields were left raw:\n  ${broken.join("\n  ")}`,
  );
});

test("ladderStanding draws an L1 that `rungFor` can never award, now that an empty required list earns nothing", () => {
  // The property is the console's, already pinned for L2/L3 in
  // test/console-ladder.test.mjs: "no rung is drawn that this profile could
  // never mint". Before this fix an empty l1Required WAS awarded (vacuously),
  // so drawing the rung was consistent — wrong at the grader, consistent. The
  // fix corrected the grader and left the other reader where it was.
  const shapes = [
    ["only l0Required — the contract's own “Declare none and this profile tops out at L0”", { l0Required: ["assemble"] }],
    ["l1Required declared empty", { l0Required: ["assemble"], l1Required: [] }],
    ["l0Required declared empty", { l0Required: [], l1Required: ["static"] }],
    ["both rungs named — the control", { l0Required: ["assemble"], l1Required: ["static"] }],
    ["every rung named — the control", { l0Required: ["assemble"], l1Required: ["static"], l2Execution: ["run"], l3Execution: ["ship"] }],
  ];

  const broken = [];
  for (const [label, ladder] of shapes) {
    const best = graded(ladder);
    const bestIdx = best && best.rung ? ORDER.indexOf(best.rung) : -1;
    const stand = ladderStanding(ladder, { earned: best && best.rung ? best.rung : null, passed: PASSED });
    const unearnable = stand.rungs.filter((r) => ORDER.indexOf(r.id) > bestIdx).map((r) => r.id);
    if (unearnable.length) {
      broken.push(
        `${label}: a lane in which every declared step PASSed grades ${best && best.rung ? best.rung : "no rung at all"}, ` +
          `and the console draws ${stand.rungs.map((r) => r.id).join(", ")} — ${unearnable.join(", ")} can never be minted. ` +
          `next = ${JSON.stringify(stand.next && { id: stand.next.id, requires: stand.next.requires, unmet: stand.next.unmet })}`,
      );
    }
  }
  assert.deepEqual(broken, [], `rungs drawn that this profile could never mint:\n  ${broken.join("\n  ")}`);
});

test("the console tells an adopter the next rung's steps all PASSed when that rung requires nothing and can never be earned", () => {
  // The rendered consequence of the same disagreement, in the words a reader
  // actually sees. `unmet` is empty because `requires` is empty, so the row
  // takes the branch written for the badge-floor case — "every step the next
  // rung names PASSed and the receipt still records no such rung" — and prints
  // it with no step names in it at all.
  const ladder = { l0Required: ["assemble"], names: { L0: "green" } };
  const rung = graded(ladder);
  const stand = ladderStanding(ladder, { earned: rung.rung, passed: ["assemble"] });
  const row = ladderRowHtml(stand, { pack: "svc" });
  assert.equal(
    /records (it|them) PASSed and the receipt still names no L1/.test(row),
    false,
    `this ladder declares no l1Required, the grader tops out at ${rung.rung} by construction, and the console says:\n` +
      `  ${(row.match(/<span class="ladder-needs">(.*?)<\/span>/) || [, "?"])[1].replace(/<[^>]+>/g, "")}\n` +
      `An adopter is told their L1 is already proven and the receipt is merely behind. Nothing will ever mint it.`,
  );
});
