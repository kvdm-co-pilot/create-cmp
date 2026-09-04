// profiles/cmp/plants.mjs — the SOURCE this profile's Rule 0 instrument plants
// when it proves specCoverage can still read a citation. Mobile's, by
// definition (docs/NORTH-STAR.md §6; GATE-RULES.md Rule 0/Rule 1).
//
// Stage 0 PR 7. Most of qa/framework-check.mjs is already stack-free: which
// plants a tree can support is derived from the tree through the spec model
// (PR 4), the clause grammar and the citation marker are the core scanner's,
// and stripping a flow's citations uses the core's own tag regex. What is NOT
// stack-free is the file a planted citation has to live in: a citation must sit
// on a test, so the instrument has to write a test — in this stack's language,
// with this stack's test-declaration syntax, at a path this stack compiles.
//
// Two plants need it, and they are the two that matter most, because each
// closes an escape that turns a red gate green with no assertions:
//
//   unbound   a `// SPEC:` tag on a CLASS with no test inside the binding
//             window. This is payment-blueprint's real drift: the tag sat on
//             `class PaymentWorkerTest`, three properties above a genuine
//             @Test, and vouched for the whole file. The class body here is
//             deliberately longer than BINDING_WINDOW so a real test cannot
//             wander into range and launder it.
//   tierUnmet a clause only the device tier can observe, cited from a
//             host-tier test that compiles and runs and can never see it.
//
// A profile that declares no plants ships without those two, and the
// instrument says so per plant rather than reporting a quieter green — the
// §5.2 rule: no plants, no badge.

/** The file a planted citation lives in, relative to the test directory the instrument found. */
export const testFileBasename = "CmpFrameworkCheckPlanted.kt";

/**
 * A citation on a type declaration with no test under it. The body must be
 * longer than the core's BINDING_WINDOW so proximity alone cannot bind it.
 * @param {string} clause the planted clause id
 * @returns {string}
 */
export function unboundCitationSource(clause) {
  return `// Planted by qa/framework-check.mjs — reverted automatically.\n\n// SPEC: ${clause}\nclass CmpFrameworkCheckPlanted {\n  val a = 1\n  val b = 2\n  val c = 3\n  val d = 4\n  val e = 5\n  val f = 6\n  fun helper() {}\n}\n`;
}

/**
 * A real, compiling, running host-tier test that cites a clause only the
 * device tier could observe.
 * @param {string} clause the planted clause id
 * @returns {string}
 */
export function tierUnmetCitationSource(clause) {
  return `// Planted by qa/framework-check.mjs — reverted automatically.\n\nimport kotlin.test.Test\n\nclass CmpFrameworkCheckPlanted {\n  // SPEC: ${clause}\n  @Test\n  fun planted() {}\n}\n`;
}

/**
 * The tier requirement the tierUnmet plant declares on its clause. It must be
 * one this profile's `tiers.satisfying` defines and that a host-tier test
 * cannot satisfy — otherwise the plant would not plant anything.
 */
export const unmeetableTier = "e2e";

/** What the instrument reads off the profile. */
export const plants = Object.freeze({
  testFileBasename,
  unboundCitationSource,
  tierUnmetCitationSource,
  unmeetableTier,
});
