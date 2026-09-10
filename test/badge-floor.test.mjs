// THE BADGE FLOOR: a profile with no calibrated plants earns no rung.
//
// The defect this file exists to keep closed (NORTH-STAR.md §9.2, found
// 2026-09-08 by scripts/stage2-gate.mjs, criterion G):
//
//   Two scratch adopters were built differing in EXACTLY one export — one
//   shipping `plants`, one shipping none. Both reached a green lane and both
//   earned `L1 · every promise bound`. `evidenceLevel` derived the rung from
//   the ladder alone and never asked whether the profile had plants, so a
//   profile that could calibrate nothing was graded identically to one that
//   could.
//
// It is a violation of a guarantee that was already binding, not a missing
// feature: §8.9 "A profile with no calibrated plants earns no rung"; §3's third
// *never* for a Stack Profile — "Earns a rung without plants"; §6.7 "A profile
// ships with plants … or it ships without a badge."
//
// WHAT IS PINNED HERE, in the order it is argued:
//   1. DIFFERENTIAL (Stage 0's rule): the floor answers for two unlike profiles
//      — `cmp`, which ships plants, and the py-alien fixture, which ships none
//      by design — and the answers differ for that reason and no other.
//   2. THE REGRESSION: the stage-2 twins, at unit level. The plantless twin
//      earns nothing where the twin with plants earns L1, from the SAME ladder
//      and the SAME rows. This is the assertion that is red on the pre-fix
//      grader.
//   3. THE CONTROL, on real recorded rows: `cmp`'s rung does not move. The
//      rows are a real L2 fleet run's, not a synthetic list.
//   4. WHAT THE FLOOR RESISTS, and what it does not — stated as executable
//      cases, including the empty-object false green.
//   5. THE SENTENCE: a green lane that earns no rung SAYS why, in words a
//      profile author can act on. "No rung and no explanation" is the shape of
//      the defect §9.2 records one file over.
//   6. THE PATH: the receipt path grades through the floored entry point, so
//      the floor cannot be walked around by a caller who forgets it exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evidenceLevel, gradeEvidence } from "../packages/harness/src/lib/evidence-level.mjs";
import { plantCalibration, PLANT_MATERIAL } from "../packages/harness/src/lib/plant-calibration.mjs";
import { assessBadgeFloor } from "../packages/harness/src/lib/framework-check.mjs";
import { CMP_LADDER } from "../packages/harness/src/lib/profiles/cmp/ladder.mjs";
import * as cmpProfile from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import * as alienProfile from "./fixtures/profiles/py-alien/index.mjs";
import * as ktorProfile from "./fixtures/profiles/ktor-backend/index.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The stage-2 twins' ladder, verbatim from `alienProfileSource` in
 * scripts/stage2-gate.mjs. Both twins declare it; only one of them declares
 * plants, which is the whole design of that pair — anything else that differed
 * would make the rung difference unattributable.
 */
const TWIN_LADDER = {
  names: { L0: "L0 — the lane is the locked one", L1: "L1 — every promise bound", L2: "L2 — unreachable here", L3: "L3 — unreachable here" },
  l0Required: ["harnessIntegrity"],
  l1Required: ["harnessIntegrity", "specCoverage"],
  l2Execution: [],
  l3Execution: null,
};

/** The twins' green lane: both rows PASS, in both trees. */
const TWIN_GREEN = [
  { name: "harnessIntegrity", verdict: "PASS" },
  { name: "specCoverage", verdict: "PASS" },
];

/** The plants the twin WITH plants ships (stage2-gate.mjs, `withPlants: true`). */
const TWIN_PLANTS = {
  testFileBasename: "test_framework_check_planted.py",
  unboundCitationSource: (clause) => `# SPEC: ${clause}\nclass PlantedType:\n    pass\n`,
  tierUnmetCitationSource: (clause) => `# SPEC: ${clause}\ndef test_planted():\n    assert True\n`,
  unmeetableTier: "slow",
};

// ── 1. Differential: two unlike profiles, one question ──────────────────────

test("DIFFERENTIAL: the floor answers for cmp (ships plants) and for py-alien (ships none), and names what is missing", () => {
  // cmp's declaration is real and complete; so is the ktor-backend fixture's,
  // written by a second-stack author from the contract alone. Two stacks that
  // share no language both clear the floor, which is what makes it a floor
  // rather than a cmp-shaped door.
  assert.equal(plantCalibration(cmpProfile.plants).ok, true);
  assert.equal(plantCalibration(ktorProfile.plants).ok, true);

  // py-alien ships no `plants` at all — deliberately, and its own header says
  // so: "a profile that declares nothing optional is also a shape the core must
  // handle". The floor's answer must be no, and must say what would fix it.
  const alien = plantCalibration(alienProfile.plants);
  assert.equal(alien.ok, false);
  assert.match(alien.reason, /declares no `plants`/);
  assert.deepEqual(alien.missing, PLANT_MATERIAL.map(([field]) => field), "a refusal an author cannot act on is an oracle");

  // And the consequence, through the grader, for each of them in turn: the same
  // rows and the same ladder, graded by whether the PROFILE could be calibrated.
  const rows = [{ name: "build", verdict: "PASS" }, { name: "unitTests", verdict: "PASS" }];
  assert.equal(evidenceLevel(rows, "local", { ladder: CMP_LADDER, plants: cmpProfile.plants })?.rung, "L0");
  assert.equal(evidenceLevel(rows, "local", { ladder: CMP_LADDER, plants: alienProfile.plants }), null);
});

// ── 2. The regression: the stage-2 twins, at unit level ─────────────────────

test("THE REGRESSION: the plantless twin earns NO rung where its plant-shipping twin earns L1", () => {
  // The pair scripts/stage2-gate.mjs builds, minus the two scratch adopters and
  // the two lane runs. One export differs. Before 2026-09-08 both of these were
  // L1 — that measurement is what this assertion holds closed, and it is the
  // one that goes red on the pre-fix grader.
  const withPlants = evidenceLevel(TWIN_GREEN, "local", { mode: "full", ladder: TWIN_LADDER, plants: TWIN_PLANTS });
  assert.deepEqual(
    { rung: withPlants?.rung, name: withPlants?.name },
    { rung: "L1", name: "L1 — every promise bound" },
    "THE CONTROL: a profile WITH plants must still earn the rung its ladder declares — a floor that refused everyone would be no better",
  );

  const plantless = evidenceLevel(TWIN_GREEN, "local", { mode: "full", ladder: TWIN_LADDER, plants: undefined });
  assert.equal(
    plantless,
    null,
    "the twin ships NO plants and must earn NO rung — NORTH-STAR §8.9, and §3's third `never` for a Stack Profile",
  );

  // The instrument's own kept plant makes the same pair, and must agree: it is
  // what runs in every adopter's tree forever, where this test does not.
  const floor = assessBadgeFloor({ ladder: TWIN_LADDER, plants: TWIN_PLANTS });
  assert.deepEqual({ ok: floor.ok, rung: floor.rung }, { ok: true, rung: "L1" });
});

// ── 3. The control, on rows a real device lane actually produced ────────────

test("THE CONTROL: cmp's rung does not move — real recorded L2 rows grade L2 before and after", () => {
  // Not synthesised. These are the rows of the fleet run recorded in
  // qa-artifacts/fleet-latest.json at commit 250acd81 (verdict PASS, rung L2,
  // AVD Medium_Phone_API_35) — a real Compose app on a real emulator. Copied
  // here rather than read from qa-artifacts/, which is gitignored and per-run:
  // a test that reads it would pass or vanish depending on whose machine ran.
  const recorded = [
    ["harnessIntegrity", "PASS"], ["specCoverage", "PASS"], ["approvals", "SKIP"], ["componentStories", "PASS"],
    ["reachability", "PASS"], ["e2eCoverage", "PASS"], ["archDoc", "PASS"], ["schemaHistory", "SKIP"],
    ["build", "PASS"], ["unitTests", "PASS"], ["conformance", "PASS"], ["goldenTrees", "PASS"],
    ["tokenDrift", "SKIP"], ["a11y", "PASS"], ["releaseBuild", "PASS"], ["e2eSmoke", "PASS"], ["androidChecks", "PASS"],
  ].map(([name, verdict]) => ({ name, verdict }));

  const level = evidenceLevel(recorded, "local", { mode: "full", ladder: CMP_LADDER, plants: cmpProfile.plants });
  assert.equal(level.rung, "L2", "the rung the recorded run was actually given — the badge floor must not move it");
  assert.ok(level.satisfiedBy.includes("e2eSmoke"));
  assert.equal(gradeEvidence(recorded, "local", { mode: "full", ladder: CMP_LADDER, plants: cmpProfile.plants }).why, null);
});

// ── 4. What the floor resists, and what it does not ─────────────────────────

test("the cheapest false greens are closed: an empty declaration, and a partial one", () => {
  // The weakest reading of "calibrated" is "the profile exports `plants`", and
  // `export const plants = {}` satisfies it in one line. It must not satisfy
  // this one.
  assert.equal(plantCalibration({}).ok, false);
  assert.equal(evidenceLevel(TWIN_GREEN, "local", { ladder: TWIN_LADDER, plants: {} }), null, "an empty declaration declares nothing and plants nothing");

  // Nor may three-fields-minus-one, and the refusal must name the one.
  for (const [field] of PLANT_MATERIAL) {
    const partial = { ...TWIN_PLANTS };
    delete partial[field];
    const judged = plantCalibration(partial);
    assert.equal(judged.ok, false, `missing ${field} was accepted`);
    assert.deepEqual(judged.missing, [field]);
    assert.match(judged.reason, new RegExp(field));
    assert.equal(evidenceLevel(TWIN_GREEN, "local", { ladder: TWIN_LADDER, plants: partial }), null);
  }

  // A source that is not a function cannot be called, so a string in its place
  // is the same absence wearing a value.
  assert.equal(plantCalibration({ ...TWIN_PLANTS, unboundCitationSource: "a citation, honest" }).ok, false);

  // WHAT IT DOES NOT RESIST, stated rather than implied: sources that are
  // plausible and inert. This declaration is structurally complete and plants
  // nothing that violates anything, and the floor accepts it — because "these
  // plants actually bite" is not derivable from a lane run at all. It is the
  // INSTRUMENT that catches this, by running the lane and refusing a plant that
  // left it green (lib/framework-check.mjs `assessPlantRun`). The division is
  // deliberate and is written down in qa/lib/plant-calibration.mjs.
  const inert = { testFileBasename: "nothing.txt", unboundCitationSource: () => "", tierUnmetCitationSource: () => "", unmeetableTier: "x" };
  assert.equal(plantCalibration(inert).ok, true, "the grader cannot know whether a plant bites — only the instrument can");
});

test("`unmeetableTier` is NOT required for a rung, and that is a judgement, not an oversight", () => {
  // A single-tier stack — the shape `harness init` itself seeds — has no tier a
  // host test cannot satisfy, so it can never make the tier-unmet plant.
  // Requiring the field would make the badge unreachable by construction for a
  // correct profile, which is a wrong verdict in the other direction. The
  // instrument still reports that plant's absence by name, per plant.
  const { unmeetableTier: _dropped, ...noTier } = TWIN_PLANTS;
  assert.equal(plantCalibration(noTier).ok, true);
  assert.equal(evidenceLevel(TWIN_GREEN, "local", { ladder: TWIN_LADDER, plants: noTier })?.rung, "L1");
});

test("the instrument's kept plant reports UNAVAILABLE rather than passing when it cannot be made", () => {
  // Neither of these is a pass and neither is a failure — the same distinction
  // every unavailable plant in the instrument already makes, with its cause.
  const noPlants = assessBadgeFloor({ ladder: TWIN_LADDER, plants: undefined });
  assert.equal(noPlants.available, false);
  assert.equal(noPlants.ok, undefined, "a plant that cannot be made must never report ok");
  assert.match(noPlants.reason, /no declaration to strip/);

  const noLadder = assessBadgeFloor({ ladder: null, plants: TWIN_PLANTS });
  assert.equal(noLadder.available, false);
  assert.match(noLadder.reason, /no `ladder`/);
});

// ── 5. The sentence a green lane with no rung prints ────────────────────────

test("a rung that is absent SAYS WHY, and names the declaration and the command that fix it", () => {
  const { level, why } = gradeEvidence(TWIN_GREEN, "local", { mode: "full", ladder: TWIN_LADDER, plants: undefined });
  assert.equal(level, null);
  assert.match(why, /plants/, "it names the declaration");
  assert.match(why, /qa\/framework-check\.mjs/, "and the command that proves them");
  assert.match(why, /§8\.9|§6\.7/, "and where the rule is written down");
  // The run profile is a RUN name (local | ci | release), not a pack name.
  // Quoting it here would send a reader to the wrong file entirely.
  assert.doesNotMatch(why, /"local"/);

  // Every other absent rung is explained too, in its own words — a `why` that
  // only ever discussed plants would misdirect every other reader.
  const causes = [
    [{ mode: "fast", ladder: TWIN_LADDER, plants: TWIN_PLANTS }, /--fast|inner loop/],
    [{ mode: "full", ladder: null, plants: TWIN_PLANTS }, /no `ladder`/],
  ];
  for (const [opts, pattern] of causes) {
    const graded = gradeEvidence(TWIN_GREEN, "local", opts);
    assert.equal(graded.level, null);
    assert.match(graded.why, pattern);
  }
  const failed = gradeEvidence([{ name: "harnessIntegrity", verdict: "FAIL" }], "local", { mode: "full", ladder: TWIN_LADDER, plants: TWIN_PLANTS });
  assert.match(failed.why, /harnessIntegrity FAIL/);

  // Both absences at once are reported at once — an author who fixes one and
  // comes back for the other has been charged two lane runs by a message that
  // already knew both answers.
  const bothMissing = gradeEvidence(TWIN_GREEN, "local", { mode: "full", ladder: null, plants: null });
  assert.match(bothMissing.why, /plants/);
  assert.match(bothMissing.why, /no `ladder` either/);
});

// ── 6. The path: the floor cannot be walked around ──────────────────────────

test("THE RECEIPT PATH grades through the floored entry point, and the runner plants the floor it depends on", () => {
  const verify = fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", "src", "verify.mjs"), "utf8");
  assert.match(verify, /plants: loaded\.profile\.plants/, "the lane hands the grader the profile's own declaration");
  assert.match(verify, /grade\.why/, "and prints the sentence when the rung it got back is absent");

  // The shipped Rule 0 instrument runs the kept plant, so the floor is watched
  // failing in every adopter's tree rather than only in this suite (GATE-RULES
  // Rule 1: "Add the plant to qa/framework-check.mjs and run that").
  const runner = fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", "src", "framework-check.mjs"), "utf8");
  assert.match(runner, /assessBadgeFloor\(\{ ladder: resolved\.ladder, plants: PLANT_DECL \}\)/);
  assert.match(runner, /if \(badgeFloor\.ok === false\) die\(badgeFloor\.reason\)/, "and a failed plant stops the check rather than printing beside it");

  // The vendored copy an adopter actually runs is the same bytes — a floor that
  // shipped only in the package would protect nobody (test/harness-parity.test.mjs
  // pins this for every lane file; named here because this one is load-bearing).
  assert.equal(
    fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", "src", "lib", "plant-calibration.mjs"), "utf8"),
    fs.readFileSync(path.join(REPO_ROOT, "template", "qa", "lib", "plant-calibration.mjs"), "utf8"),
  );
});
