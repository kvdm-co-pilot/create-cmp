// The rename is only as good as the two things an external author actually
// reads: the skeleton `harness init` seeds into their tree, and the refusal that
// fires when they get it wrong. ADR-0016 blames a proposal's table for the
// original defect — "sitting in the declaration an external author writes first
// and unaided" — and that declaration is the skeleton below.
//
// Both are still on the far side of the rename.
import { test } from "node:test";
import assert from "node:assert/strict";

import { profileSkeleton, vendorPlan } from "../packages/harness/install/init.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";

const SKELETON = profileSkeleton("demo", { sourceRoots: ["src"], tiers: ["host"], lang: null });
const LADDER_BLOCK = SKELETON.slice(SKELETON.indexOf("export const ladder"), SKELETON.indexOf("export const plants"));

test("the seeded skeleton's ladder legend documents `release`, the field the loader now refuses by name", () => {
  // The legend is the field-by-field key an adopter reads while writing the
  // declaration: `//   //   <field>   <what it means>`.
  const legend = [...LADDER_BLOCK.matchAll(/^\/\/\s+\/\/\s+([A-Za-z][A-Za-z0-9]*)\s{2,}\S/gm)].map((m) => m[1]);
  assert.ok(
    legend.includes("l0Required") && legend.includes("l1Required"),
    `the legend could not be read out of the skeleton — saw ${JSON.stringify(legend)}; this test is asserting nothing until that is fixed`,
  );

  // A VALID value for the field under test, not an empty one. This loop used to
  // declare every field as `[]`, which is now refused for the two REQUIRED
  // fields — an empty l0Required earns its rung vacuously, because `[].every()`
  // is true of nothing, and the contract's refusal for that is enforced since
  // 2026-09-10. The property under test is unchanged and is the point: every
  // field the legend names must be declarable without being refused for
  // declaring it. Testing that with a value the legend itself does not show
  // would be testing the fixture.
  // A COHERENT ladder, with every step-name field named. Since 2026-09-10 a rung
  // whose steps are declared while the rung beneath it is not is refused — L2
  // with no L1 can never be earned however green the lane, and silently dropping
  // it is the unreachable-rung defect this slice exists to close. So a fixture
  // that leaves a lower field empty is testing that rule, not the property here.
  const valueFor = (field) => (field === "names" ? { L0: "x" } : ["a"]);
  for (const field of legend) {
    const declared = { ...{ l0Required: ["a"], l1Required: ["a"], l2Execution: ["a"], l3Execution: ["a"] }, [field]: valueFor(field) };
    const resolved = evidenceLadderFor({ id: "seeded", ladder: declared }, null);
    assert.equal(
      resolved.ok,
      true,
      `the skeleton every adopter is seeded with documents \`${field}\` as a ladder field, and the lane refuses a ladder ` +
        `that declares it:\n  ${resolved.reason}\nAn author who follows the seeded legend is refused at runtime for doing so.`,
    );
  }

  // The same legend still teaches the semantics ADR-0016 reversed. `l3Execution`
  // is a list now, with a lone string read as a list of one; the skeleton says a
  // list is the shape that silently matches nothing.
  assert.doesNotMatch(
    LADDER_BLOCK,
    /a string, not a list|A list here silently never matches/,
    "the seeded legend still states the pre-ADR-0016 rule — the shape that is now THE shape is described as the one that fails silently",
  );
});

test("the not-a-ladder refusal still lists `release` as one of a ladder's fields", () => {
  // The other refusal in the same function, read by an author who declared a
  // ladder of the wrong type. It enumerates the fields — and one of the two it
  // names as valid is the spelling the next check refuses by name, so following
  // this message lands the author on that one.
  const refused = evidenceLadderFor({ id: "p", ladder: "not an object" }, null);
  assert.equal(refused.ok, false, "a non-object ladder is refused");
  const enumerated = (refused.reason.match(/\{([^}]*)\}/) || [, ""])[1].split(",").map((s) => s.trim()).filter(Boolean);
  assert.ok(enumerated.includes("l0Required"), `the field list could not be read out of the refusal: ${refused.reason}`);
  // Both required fields in the base, and a valid value for the one under test
  // — same reason as the loop above: since 2026-09-10 an empty required field
  // is refused, so a fixture that declares one would be testing the fixture.
  for (const field of enumerated) {
    const base = { l0Required: ["a"], l1Required: ["a"], l2Execution: ["a"], l3Execution: ["a"] };
    const value = field === "names" ? { L0: "x" } : ["a"];
    const check = evidenceLadderFor({ id: "p", ladder: { ...base, [field]: value } }, null);
    assert.equal(
      check.ok,
      true,
      `the refusal offers \`${field}\` as one of a ladder's fields, and declaring it is itself refused:\n  ${check.reason}`,
    );
  }
});

test("the rename refusal sends the author to `qa/profile.mjs`, which no install writes", () => {
  const refused = evidenceLadderFor({ id: "old", ladder: { l0Required: ["a"], deviceExecution: ["b"] } }, null);
  assert.equal(refused.ok, false, "the old spelling is refused");

  // The refusal is the whole of the migration for a hand-written profile — it
  // says so — so every command it names has to be one the adopter can run.
  const named = [...refused.reason.matchAll(/node (qa\/[A-Za-z0-9_./-]+\.mjs)/g)].map((m) => m[1]);
  assert.ok(named.length > 0, `the refusal names no command to run: ${refused.reason}`);
  const installed = new Set(vendorPlan().map((v) => v.rel));
  for (const rel of named) {
    assert.ok(
      installed.has(rel),
      `the refusal tells the author to run \`node ${rel}\`, and no init or upgrade ever writes that file ` +
        `(vendorPlan() writes ${[...installed].filter((r) => /^qa\/[^/]+\.mjs$/.test(r)).join(", ")}). ` +
        `The other half of the same sentence is \`prooflane upgrade\`, which install/upgrade.mjs documents as leaving ` +
        `qa/lib/profiles/<id>/** UNTOUCHED — so neither route named in the refusal renames the field.`,
    );
  }
});
