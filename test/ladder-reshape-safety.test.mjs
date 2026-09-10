// ADR-0016 landed two claims about the reshape. These hold them to the tree.
//
//   "evidence-level.mjs reads BOTH rungs through asList"  (ADR-0016 §4, Landed)
//   "Blank and non-string entries are dropped rather than carried — ... keeping
//    it inside an `all` list would make the rung permanently unreachable, which
//    is this defect re-entering by the back door."
//
// The first is true of `ladderStanding` and false of `rungFor`, which still
// reads `l2Execution` raw — so the console and the grader now disagree about
// what that field names, which they did not before the reshape.
//
// The second closes one door and opens another: dropping a member of an `all`
// list LOOSENS the rung, and dropping every member makes L3 unreachable in
// silence — with the shape-refusal deleted, nothing says either happened.
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

const NAMES = { L0: "L0", L1: "L1", L2: "L2", L3: "L3" };
const PASSED = ["assemble", "static", "run", "ship"];
const ROWS = PASSED.map((name) => ({ name, verdict: "PASS", durationMs: 1 }));

const ladder = (over) => ({
  names: NAMES,
  l0Required: ["assemble"],
  l1Required: ["assemble", "static"],
  l2Execution: ["run"],
  l3Execution: ["ship"],
  ...over,
});

/** The rung a green lane earns, or the throw that stopped it being graded at all. */
function graded(l) {
  try {
    return evidenceLevel(ROWS, "local", { mode: "full", ladder: l, plants: SOME_PLANTS })?.rung ?? "none";
  } catch (e) {
    return `THREW ${e.constructor.name}: ${e.message}`;
  }
}

test("rungFor reads l2Execution RAW while ladderStanding reads it through asList — the two readers disagree", () => {
  // `ladderStanding` lives in the grader's own file for a stated reason: "reading
  // the same fields off the same ladder", so a console can never derive a second
  // answer to the grader's question. After ADR-0016 it does not read the same
  // field the same way. `rungFor` is still `const L2_EXECUTION = L.l2Execution ?? []`;
  // `ladderStanding` is `asList(L.l2Execution)`.
  const padded = ladder({ l2Execution: ["  run  "] });
  const rung = graded(padded);
  const next = ladderStanding(padded, { earned: rung, passed: PASSED }).next;
  assert.ok(
    !(next && next.unmet.length === 0),
    `the console says the next rung (${next?.id}) has NOTHING outstanding — requires ${JSON.stringify(next?.requires)}, ` +
      `all of it PASSed — while the grader graded ${rung} and can never award it: ladderStanding trims the name and rungFor ` +
      `does not. That is a console promising an adopter a rung their profile cannot mint, which is the one thing ` +
      `ladderStanding's own docblock says it exists not to do.`,
  );

  // And the shape ADR-0016 blesses for the sibling field — "a lone string is
  // still read as a list of one" — is not survivable on this one: the grader
  // does `.some` on a string. The console, reading through asList, draws the
  // rung anyway.
  const lone = ladder({ l2Execution: "run" });
  const standing = ladderStanding(lone, { earned: null, passed: PASSED });
  assert.ok(
    !String(graded(lone)).startsWith("THREW"),
    `l2Execution as a lone string crashes the grader (${graded(lone)}) while ladderStanding declares ` +
      `${standing.rungs.map((r) => r.id).join(", ")} from the same bytes — one field, two readings, and the reading ` +
      `ADR-0016 made valid for l3Execution is the one that throws here.`,
  );
});

test("a dropped l3Execution entry grants L3 with a declared step unproven, and nothing refuses it", () => {
  // The deleted shape-refusal caught every one of these by name. Its replacement
  // is `asList`, which silently discards them — so an `all` rung is now awarded
  // on a strict subset of what its author declared. `["ship", undefined]` is one
  // typo'd constant away in any real profile.
  const holed = ladder({ l3Execution: ["ship", null] });
  const resolved = evidenceLadderFor({ id: "p", ladder: holed }, null);
  const rung = graded(holed);
  assert.ok(
    resolved.ok === false || rung !== "L3",
    `l3Execution declares 2 entries, the lane proved 1, and the rung is ${rung} with no refusal ` +
      `(loader: ${resolved.ok ? "ok" : resolved.reason}). L3 is mode:"all" precisely because "proven by some of its steps ` +
      `and skipped by the rest is not proven" — a silently dropped entry is skipped by any other name.`,
  );

  // And when every entry is dropped, the rung is unreachable in silence — the
  // exact state the refusal existed to catch, reached by a different route.
  const allDropped = ladder({ l3Execution: [123] });
  assert.equal(
    evidenceLadderFor({ id: "p", ladder: allDropped }, null).ok,
    false,
    `l3Execution: [123] names no step, resolves clean, and grades ${graded(allDropped)} — an author who declared an L3 ` +
      `is told nothing, which is "L3 was silently unreachable" verbatim, the defect ADR-0016 says dropping avoids.`,
  );
});
