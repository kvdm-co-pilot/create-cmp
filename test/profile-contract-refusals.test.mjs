// profile-contract.mjs publishes a `refusal` per field and states, in its own
// header, what reads it: "the loader validates a declaration and refuses by name
// (`refusal`)". ADR-0016 §3 says the same — "one frozen object read by the
// loader (which refuses), the interview (which asks), and the author (who
// declares)".
//
// Nothing reads it, and the states it calls refused are graded in silence.
// `explain()` renders "REFUSED WHEN IT declares l3Execution without l2Execution"
// to an author; the lane accepts that ladder, grades it, and never draws the L3
// the author declared — which is the silently-unreachable-rung failure this
// whole slice is about, published as already-closed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONTRACT } from "../packages/harness/src/lib/profile-contract.mjs";
import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";
import { evidenceLevel } from "../packages/harness/src/lib/evidence-level.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOME_PLANTS = {
  testFileBasename: "PlantedCitation.txt",
  unboundCitationSource: (clause) => `// SPEC: ${clause}\ntype Planted = {}\n`,
  tierUnmetCitationSource: (clause) => `// SPEC: ${clause}\ntest("planted", () => {})\n`,
  unmeetableTier: "integration",
};
const ROWS = ["assemble", "static", "ship"].map((name) => ({ name, verdict: "PASS", durationMs: 1 }));
const rungOf = (ladder) => evidenceLevel(ROWS, "local", { mode: "full", ladder, plants: SOME_PLANTS })?.rung ?? "none";

/** Every non-test module in the shipped tree that imports the contract. */
function contractReaders() {
  const roots = ["packages/harness/src", "packages/harness/install", "packages/harness/bin", "template/qa", "scripts", "inspector/mcp/src"];
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name.endsWith(".mjs") && !e.name.startsWith("profile-contract") && /from\s+["'][^"']*profile-contract\.mjs["']/.test(fs.readFileSync(abs, "utf8"))) {
        found.push(path.relative(REPO_ROOT, abs));
      }
    }
  };
  for (const r of roots) {
    const abs = path.join(REPO_ROOT, r);
    if (fs.existsSync(abs)) walk(abs);
  }
  return found;
}

test("the contract publishes refusals no loader implements — the states it calls refused are graded in silence", () => {
  const readers = contractReaders();

  // The state the contract names, built exactly as written.
  const l3WithoutL2 = { names: {}, l0Required: ["assemble"], l1Required: ["assemble", "static"], l3Execution: ["ship"] };
  const resolved = evidenceLadderFor({ id: "p", ladder: l3WithoutL2 }, null);
  assert.equal(
    resolved.ok,
    false,
    `explain("ladder.l3Execution") tells an author: "REFUSED WHEN IT ${CONTRACT.ladder.fields.l3Execution.refusal}". ` +
      `This ladder does exactly that, resolves clean, and grades ${rungOf(l3WithoutL2)} — the L3 the author declared can ` +
      `never be earned and nothing says so, which is the defect evidence-ladder.mjs's own header says it exists to close. ` +
      `Modules reading the contract today: ${readers.length ? readers.join(", ") : "none — only its own test imports it, " +
        "while the file header and ADR-0016 §3 say the loader reads it and refuses by name"}.`,
  );

  // THE SECOND HALF, AS ORIGINALLY WRITTEN, asserted that `l0Required` — then
  // `required: true` in the contract — was refused when absent. It was not: a
  // ladder without it resolved clean and was handed L1, because `[].every()` is
  // vacuously true and the floor rung was skipped over with nothing proving the
  // artifact assembles.
  //
  // The fix went the other way, and the finding is why. Refusing a partial
  // ladder turned three legitimate ones into refused profiles, and it is the
  // wrong shape for this harness: "declares no ladder, earns no rung, which is
  // honest" is the oldest idiom here, and a rung with no steps named for it is
  // the same statement one level down. So `l0Required` is `required: false` now
  // and publishes no refusal, and the DEFECT this half found is closed in the
  // grader instead — which is asserted here, because that is what actually
  // protects an adopter.
  const noFloor = { names: {}, l1Required: ["assemble", "static"] };
  assert.equal(
    rungOf(noFloor),
    "none",
    "a ladder naming no l0Required earns NO rung — not L1 by vacuous truth over an empty list",
  );
  assert.equal(
    rungOf({ names: {}, l0Required: [], l1Required: ["assemble", "static"] }),
    "none",
    "and declaring it empty is the same statement as not declaring it",
  );

  // The general property, which is what the first half was really testing and
  // what survives any future change to which fields are required: a refusal the
  // contract PUBLISHES is a refusal the loader PERFORMS. A field that publishes
  // none makes no promise to break.
  const published = Object.entries(CONTRACT.ladder.fields).filter(([, f]) => f.refusal);
  assert.ok(published.length > 0, "the contract publishes at least one refusal, or this assertion is vacuous");
  for (const [field, spec] of published) {
    assert.ok(
      typeof spec.refusal === "string" && spec.refusal.trim(),
      `${field} publishes a refusal that says nothing: ${JSON.stringify(spec.refusal)}`,
    );
  }
});
