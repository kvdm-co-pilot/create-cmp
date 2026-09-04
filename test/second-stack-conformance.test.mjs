// THE SECOND STACK holds the protocol open.
//
// Until 2026-09-04 exactly one profile had ever loaded through the seam, and a
// protocol with one implementer is a protocol that has only ever agreed with
// itself. Every place the core still assumed Compose was undiscovered, and the
// ones that were found were found by a Ktor backend adopting the harness in a
// separate repository — a measurement nobody in this repo could have taken.
//
// `test/fixtures/profiles/ktor-backend/` is that profile, preserved as authored.
// This file runs the CORE's own machinery against it — the same loader, spec
// model, tier arithmetic and plant selection the lane uses — so the seam is
// checked against two unlike shapes on every commit rather than one.
//
// What it catches that `cmp` cannot, by construction:
//
//   flows: null           cmp always has qa/e2e/*.yaml, so "where are the
//                         flows" had only ever been answered yes.
//   overlapping tiers     `satisfying.unit` accepts EITHER tier. cmp's map has
//                         no overlap, so the one-to-many case was untested.
//   journey off the       cmp's journey is always its flow tier; here it is an
//   flow tier             HTTP API over a real database.
//   a device that is      DEVICE_STEPS is "needs a resource the host may not
//   not a device          have" — a container, not a phone.
//
// If a change to the core makes this file fail, the change assumed a stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as ktor from "./fixtures/profiles/ktor-backend/index.mjs";
import * as cmp from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import { validateProfileModule, REQUIRED_EXPORTS } from "../packages/harness/src/lib/profile-loader.mjs";
import { specModelFrom, specDeclarationProblems } from "../packages/harness/src/lib/spec-model.mjs";
import { scanSpecClauses, scanCitations, clauseTierCoverage } from "../packages/harness/src/lib/spec-coverage.mjs";
import { selectPlants } from "../packages/harness/src/lib/framework-check.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("a profile authored by someone else, for a stack this repo does not contain, satisfies the protocol", () => {
  assert.deepEqual(validateProfileModule(ktor, "ktor-backend"), { ok: true });
  for (const name of REQUIRED_EXPORTS) assert.ok(name in ktor, `a profile must export ${name}`);
  // Its layout and tiers must survive the same validator the lane runs.
  assert.deepEqual(specDeclarationProblems(ktor), []);
});

test("a stack with NO flow files is a first-class shape, not a degraded one", () => {
  // cmp always has qa/e2e/*.yaml. Every core path that asks "where are the
  // flows" had therefore only ever been answered yes, and `null` was a
  // possibility the code allowed and nothing exercised.
  assert.equal(ktor.layout.flows, null);
  const model = specModelFrom(ktor, {});
  assert.equal(model.ok, true, model.ok ? "" : model.reason);
  assert.equal(model.model.flows, null);
  assert.ok(cmp.layout.flows, "cmp still has flows — the two shapes differ, which is the point");
});

test("OVERLAPPING tiers: a clause satisfied by either tier, which cmp's map never exercises", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "second-stack-"));
  try {
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.mkdirSync(path.join(root, "services", "api", "src", "test"), { recursive: true });
    fs.mkdirSync(path.join(root, "services", "api", "src", "integrationTest"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "specs", "log.spec.md"),
      "# Log\n\n- **LOG-01** [tier: unit] servings multiply cleanly\n- **LOG-10** [tier: integration] a duplicate entry is rejected by the database\n",
    );
    // LOG-01 declares `unit` but is cited ONLY from the integration tier. Under
    // this profile that is legal — satisfying.unit accepts either — and a core
    // that assumed one-tier-satisfies-itself would wrongly fail it.
    fs.writeFileSync(
      path.join(root, "services", "api", "src", "integrationTest", "LogIT.kt"),
      "import org.junit.jupiter.api.Test\n\n// SPEC: LOG-01\n@Test\nfun `servings multiply`() = Unit\n\n// SPEC: LOG-10\n@Test\nfun `duplicates rejected`() = Unit\n",
    );
    const model = specModelFrom(ktor, {});
    assert.equal(model.ok, true);
    const clauses = scanSpecClauses(root, model.model);
    const tags = scanCitations(root, model.model);
    const { unmetTier } = clauseTierCoverage(clauses, tags, model.model);
    assert.deepEqual(unmetTier, [], "an integration citation satisfies a unit clause under this profile's map");

    // And the asymmetry holds the other way: integration is NOT satisfied by unit.
    fs.rmSync(path.join(root, "services", "api", "src", "integrationTest", "LogIT.kt"));
    fs.writeFileSync(
      path.join(root, "services", "api", "src", "test", "LogTest.kt"),
      "import org.junit.jupiter.api.Test\n\n// SPEC: LOG-01\n@Test\nfun `servings multiply`() = Unit\n\n// SPEC: LOG-10\n@Test\nfun `duplicates rejected`() = Unit\n",
    );
    const unmet = clauseTierCoverage(scanSpecClauses(root, model.model), scanCitations(root, model.model), model.model).unmetTier;
    assert.equal(unmet.length, 1, "a promise only the database can keep is not proved by a JVM test");
    assert.equal(unmet[0].id, "LOG-10");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the journey tier need not be a flow tier — the core must not assume a script", () => {
  // cmp's journey is `e2e`, which is its flow directory. Here the user-visible
  // surface is an HTTP API over a real database: a tier with no flow files at
  // all. A core that derived the journey from `layout.flows` would break here.
  assert.equal(ktor.tiers.journey, "integration");
  assert.equal(ktor.layout.flows, null);
  assert.ok(ktor.tiers.names.includes(ktor.tiers.journey));
});

test("DEVICE_STEPS is 'needs a resource the host may not have' — a container here, a phone there", () => {
  const pack = ktor.steps({});
  assert.deepEqual(pack.DEVICE_STEPS, ["integrationTests"]);
  // The label the verdict line prints is the PACK's. This profile supplies
  // none, so the core must print nothing rather than reaching for a word.
  assert.equal(pack.strengthLabel, undefined);
  // Its ladder is its own: L2 means a real database, not a device.
  assert.match(pack.evidenceLadder.names.L2, /database/);
  assert.deepEqual(pack.evidenceLadder.deviceExecution, ["integrationTests"]);
});

test("its plants are accepted by the core's plant selection, in its own language", () => {
  const tree = {
    specs: [{ rel: "specs/log.spec.md", text: "# Log\n\n- **LOG-01** servings multiply cleanly\n" }],
    flows: [],
    harnessLib: ["qa/lib/spec-coverage.mjs"],
    testDir: "services/api/src/test/kotlin/co/fuelled/api",
    plantsDeclared: true,
    unmeetableTier: ktor.plants.unmeetableTier,
  };
  const { plants, unavailable } = selectPlants(tree);
  const kinds = plants.map((p) => p.kind);
  assert.ok(kinds.includes("unbound-citation"));
  assert.ok(kinds.includes("tier-unmet"), "the plant that calibrates the tier gate must be available");
  // The tier it plants is THIS profile's, never a fallback.
  assert.equal(plants.find((p) => p.kind === "tier-unmet").target.unmeetableTier, "integration");
  // No flows, so the two flow plants are honestly unavailable rather than absent.
  assert.ok(unavailable.some((u) => u.kind === "feature-without-flow"));
  assert.ok(ktor.plants.unboundCitationSource("LOG-01").includes("@Test"));
});

test("the fixture is not a copy of cmp — it was authored from the contract", () => {
  // Constraint 2 of the adoption brief: the author never read profiles/cmp/.
  // If this fixture ever starts resembling cmp, it has stopped being evidence.
  const src = fs.readFileSync(path.join(REPO_ROOT, "test/fixtures/profiles/ktor-backend/index.mjs"), "utf8");
  for (const cmpFact of ["composeApp", "commonTest", "desktopTest", "androidInstrumentedTest", "gradlew", "Maestro", "e2eSmoke"]) {
    assert.ok(!src.includes(cmpFact), `the second stack must not carry the first stack's fact: ${cmpFact}`);
  }
  assert.notDeepEqual(ktor.tiers.names, cmp.tiers.names);
  assert.notDeepEqual(ktor.layout.citationRoots, cmp.layout.citationRoots);
});
