// A SECOND STACK, authored by someone who was not the maintainer.
//
// This is the `fuelled-api` profile — a Kotlin/Ktor/Postgres service — written
// on 2026-09-04 by an agent working only from the harness contract, forbidden
// from reading `profiles/cmp/`, and forbidden from editing this repository. It
// adopted the harness with ZERO core edits. It is preserved here, essentially
// as authored, because until it arrived exactly one stack had ever loaded
// through the seam, and a protocol with one implementer is a protocol that has
// only ever agreed with itself.
//
// What it holds the protocol to, that `cmp` cannot:
//
//   flows: null            a stack with no flow-shaped journey files at all.
//                          cmp always has qa/e2e/*.yaml, so every code path
//                          that asks "where are the flows" had only ever been
//                          answered yes.
//   OVERLAPPING tiers      `satisfying.unit` accepts EITHER tier: an
//                          integration test may also prove a unit clause. cmp's
//                          satisfying map has no overlap, so the one-to-many
//                          case was untested.
//   a journey on a         `journey: "integration"` — the user-visible surface
//   non-flow tier          is an HTTP API over a real database, not a script.
//                          cmp's journey is always its flow tier.
//   DEVICE_STEPS with      "the step needing a machine resource the host may
//   no device              not have" is a container here, not a phone. The
//                          noun is mobile; the concept is not.
//   a different language   its plants write JUnit 5 Kotlin at a Gradle path.
//
// It is a FIXTURE, deliberately: it does not belong in `template/` (a Compose
// app does not carry a Ktor profile) and it does not belong in
// `packages/harness/src/lib/profiles/` (which ships what an adopter receives).
// Its job is to be loaded by the real loader in the real test suite and to fail
// loudly the day the protocol drifts toward the shape of its first implementer.
//
// The step BODIES are reduced to their contract — the originals shell out to
// Gradle and Testcontainers, which a unit test has neither of. Every
// declaration (`layout`, `tiers`, `plants`, the ladder, the pack's shape) is
// the author's own, unedited.

export const id = "ktor-backend";
export const protocol = 1;

export const layout = {
  specs: "specs",
  citationRoots: ["services"],
  citationExts: [".kt"],
  sourceRoots: ["services"],
  buildDir: "build",
  // No flow-shaped test files: this service has no user-driven journey scripts.
  flows: null,
};

/**
 * The two tiers, and which one can observe what.
 *
 * `unit` is host-only: a plain JVM, no container, no network. It can observe
 * arithmetic and validation and nothing else.
 *
 * `integration` runs against a real Postgres. A clause that declares
 * `[tier: integration]` is a promise about what the DATABASE does — a unique
 * index, a rollback, idempotent DDL — so only an integration citation counts.
 * The reverse is not true: an integration test may also prove a plain unit
 * clause, so `unit` is satisfied by either tier.
 */
export const tiers = {
  names: ["unit", "integration"],
  hostOnly: ["unit"],
  satisfying: {
    unit: ["unit", "integration"],
    integration: ["integration"],
  },
  journey: "integration",
  forFile: (rel) => {
    if (rel.includes("/src/integrationTest/")) return "integration";
    if (rel.includes("/src/test/")) return "unit";
    return "other";
  },
};

/**
 * The source this stack's Rule 0 instrument plants. Two plants have to WRITE a
 * test in this stack's language, at a path this stack compiles — so the
 * language is the profile's to supply.
 *
 * `unmeetableTier` is the tier a host-only citation can never satisfy here: a
 * plain JVM test cannot observe what Postgres does.
 */
export const plants = {
  testFileBasename: "PlantedCitationTest.kt",
  unmeetableTier: "integration",
  unboundCitationSource: (clause) => `package co.fuelled.api

import org.junit.jupiter.api.Test

// SPEC: ${clause}
class PlantedCitationTest {

    @Test
    fun \`the citation above is bound to this class, not to this test\`() = Unit
}
`,
  tierUnmetCitationSource: (clause) => `package co.fuelled.api

import org.junit.jupiter.api.Test

class PlantedCitationTest {

    // SPEC: ${clause}
    @Test
    fun \`a JVM test claiming a promise only Postgres can keep\`() = Unit
}
`,
};

export function steps() {
  const row = (name, layer) => () => ({ name, verdict: "PASS", durationMs: 0, layer });
  const STEP_FN_BY_NAME = {
    harnessIntegrity: row("harnessIntegrity", "spine"),
    specCoverage: row("specCoverage", "spine"),
    unitTests: row("unitTests", "backend"),
    integrationTests: row("integrationTests", "backend"),
    distribution: row("distribution", "backend"),
  };
  const host = [STEP_FN_BY_NAME.harnessIntegrity, STEP_FN_BY_NAME.specCoverage];
  const all = [...host, STEP_FN_BY_NAME.unitTests, STEP_FN_BY_NAME.integrationTests];

  return {
    id,
    stepsForProfile: {
      smoke: host,
      scaffold: host,
      local: all,
      ci: all,
      nightly: [...all, STEP_FN_BY_NAME.distribution],
      release: [...all, STEP_FN_BY_NAME.distribution],
    },
    // The externally-provisioned tier. Nothing here drives a phone; this is the
    // core's name for "the step that needs a machine resource the host may not
    // have", and for this stack that resource is a container runtime.
    DEVICE_STEPS: ["integrationTests"],
    FAST_EXCLUDED_NAMES: ["integrationTests", "distribution"],
    STEP_FN_BY_NAME,
    stepDeterminism: () => null,
    evidenceLadder: {
      names: { L0: "L0 — it compiles", L1: "L1 — proven on the host", L2: "L2 — proven against a real database", L3: "L3 — release" },
      l0Required: ["harnessIntegrity"],
      l1Required: ["harnessIntegrity", "specCoverage", "unitTests"],
      deviceExecution: ["integrationTests"],
      release: ["distribution"],
    },
    // Nothing to lease: no device, and the container is owned by Testcontainers
    // for the life of the Gradle JVM.
    releaseLease: () => {},
  };
}
