// evidence-ladder.mjs now reads the contract, and says why in its own words:
//
//   "A contract that describes refusals nobody performs is worse than no
//    contract — it tells an author they are protected."
//
// One published refusal is still nobody's. The block that enforces them runs
// `for (const field of requiredFields("ladder"))` — and after l0Required and
// l1Required were made optional that list is EMPTY, so the loop performs
// nothing at all. The only refusal actually performed is the one hard-coded on
// the line below it (l3Execution without l2Execution). l2Execution's own
// published refusal — "declares an l2Execution tier but names no step, a rung
// nothing can earn" — is printed to authors by `node qa/profile.mjs explain
// ladder.l2Execution` and fires nowhere.
//
// It is not a hypothetical state either: `harness init` seeds `l2Execution: []`
// into every adopter's profile, so the skeleton this harness writes declares
// exactly what the contract it ships tells that adopter is refused.
import { test } from "node:test";
import assert from "node:assert/strict";

import { CONTRACT, explain, requiredFields } from "../packages/harness/src/lib/profile-contract.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";
import { profileSkeleton } from "../packages/harness/install/init.mjs";

const SKELETON = profileSkeleton("demo", { sourceRoots: ["src"], tiers: ["host"], lang: null });
const LADDER_BLOCK = SKELETON.slice(SKELETON.indexOf("export const ladder"), SKELETON.indexOf("export const plants"));
/** The commented block as an author reads it, with the `//` scaffolding taken off. */
const LEGEND = LADDER_BLOCK.split("\n")
  .map((l) => l.replace(/^\/\/\s?/, "").replace(/^\s*\/\/\s?/, ""))
  .join(" ");

test("the contract publishes an l2Execution refusal nothing performs, and `harness init` seeds the state it names", () => {
  const published = CONTRACT.ladder.fields.l2Execution.refusal;

  // THE STATE THE REFUSAL NAMES — read from the refusal, not frozen into the
  // fixture. When this test was written, `l2Execution` published "declares an
  // l2Execution tier but names no step", and the state below was `l2Execution:
  // []`. That refusal was withdrawn precisely because of this test: naming no
  // step is declaring no L2, which `harness init` seeds and which must stay
  // silent. The field publishes a DIFFERENT refusal now — steps named over an
  // undeclared L1 — so the fixture follows the text rather than outliving it.
  //
  // The property is untouched: whatever `l2Execution` publishes, the loader
  // performs. A fixture pinned to withdrawn wording would have asserted that a
  // legitimate ladder is refused, which is the opposite of what this file is for.
  const namesStepsOverAnUndeclaredRung = { l0Required: ["assemble"], l2Execution: ["run"] };
  const resolved = evidenceLadderFor({ id: "p", ladder: namesStepsOverAnUndeclaredRung }, null);

  const seedsIt = /l2Execution:\s*\[\s*\]/.test(LADDER_BLOCK);
  assert.ok(
    published === null || resolved.ok === false,
    `explain("ladder.l2Execution") tells an author "REFUSED WHEN IT ${published}". That ladder resolves clean ` +
      `(source: ${resolved.source}) and nothing anywhere says otherwise, because the only loop that reads the ` +
      `contract's refusals iterates requiredFields("ladder") — which is now ${JSON.stringify(requiredFields("ladder"))}, ` +
      `so it performs nothing.\n` +
      `${seedsIt ? "And `harness init` seeds `l2Execution: []` into the skeleton it writes: the state the harness's own contract calls refused is the state the harness's own scaffold declares." : ""}\n` +
      `Either the refusal is performed or it is not published — a published refusal that never fires tells an author ` +
      `they are protected, which is this file's own stated reason for reading the contract at all.`,
  );
});

test("the seeded ladder legend tells an adopter l0Required and l1Required are required; the contract tells the same adopter they are optional", () => {
  // The legend is the artifact ADR-0016 blames for the original defect — "the
  // declaration an external author writes first and unaided" — and this commit
  // rewrote it. The rewrite carries the rule from the version of the fix that
  // was abandoned in the same commit.
  const claims = [...LEGEND.matchAll(/([A-Za-z][A-Za-z0-9]*)(?:\s+and\s+([A-Za-z][A-Za-z0-9]*))?\s+are required/g)]
    .flatMap((m) => [m[1], m[2]])
    .filter((f) => f && Object.prototype.hasOwnProperty.call(CONTRACT.ladder.fields, f));

  for (const field of claims) {
    assert.equal(
      CONTRACT.ladder.fields[field].required,
      true,
      `the skeleton every adopter is seeded with says "${field} ... are required", and the contract shipped beside it ` +
        `marks ${field} \`required: false\` — \`node qa/profile.mjs explain ladder.${field}\` prints ` +
        `"${explain(`ladder.${field}`).split("\n").filter(Boolean).pop()}" to the same author. ` +
        `The loader refuses no such thing either (requiredFields("ladder") is ${JSON.stringify(requiredFields("ladder"))}). ` +
        `One fact, two spellings, and the one in the adopter's own tree is the wrong one.`,
    );
  }
});
