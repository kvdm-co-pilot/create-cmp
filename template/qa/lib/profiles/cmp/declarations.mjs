// profiles/cmp/declarations.mjs — what a Compose Multiplatform app IS, to the
// harness: where its specs, sources, tests and flows live, and which test
// tiers can observe which kind of promise. Mobile's facts, by definition.
//
// Stage 0 PR 4 (docs/proposals/AGNOSTIC-HARNESS-ARCHITECTURE.md §11.3 step 4;
// docs/NORTH-STAR.md §6). Until this file, qa/lib/spec-coverage.mjs carried
// these as constants — `composeApp/src`, `qa/e2e`, `.kt`, the four tier names,
// which tier satisfies `[tier: device]` — so a Kotlin backend that adopted the
// spine had to fork the scanner to change a path. The scanner is the core's
// (the clause grammar, the citation binding window, both-direction coverage,
// tier-must-observe); THESE are the profile's. The core reads them through
// qa/lib/spec-model.mjs and never names any of them.
//
// Two declarations of the nine (§4.2): #1 layout and #4 tiers. The rest move
// here in the PRs that follow, one at a time.

/**
 * Layout — where the things the scanner reads live, relative to the project
 * root, posix-separated.
 *
 *   specs          the directory of `*.spec.md` files
 *   citationRoots  the trees walked for `// SPEC:` citations
 *   citationExts   the source files a citation may sit in
 *   buildDir       the stack's build output directory, when it has one — the
 *                  provider's render marker lives there (optional)
 *   flows          flow-shaped citation files: the file IS the test, so a tag
 *                  in one binds to the flow rather than to a declaration
 *                  inside it. Only TOP-LEVEL files in `dir` count — the lane
 *                  runs that directory, and a citation may only come from a
 *                  flow that executes (2026-09-03: four nested hand-written
 *                  flows on the showcase satisfied clauses without running).
 */
export const layout = Object.freeze({
  specs: "specs",
  citationRoots: Object.freeze(["composeApp/src", "qa/e2e"]),
  citationExts: Object.freeze([".kt", ".kts"]),
  flows: Object.freeze({ dir: "qa/e2e", exts: Object.freeze([".yaml", ".yml"]) }),
  // Gradle's output directory for the app module — where the eyes stamp their
  // render marker (qa/lib/lane-markers.mjs) and where KSP's single-owner
  // incremental storage lives (steps-cmp.mjs's coexistence self-heal).
  buildDir: "composeApp/build",
});

/**
 * Evidence tiers — the source-set / harness boundaries that decide what a
 * citing test can actually SEE. commonTest and desktopTest run on the host
 * JVM, blind to androidMain and to every OS fact (lifecycle, alarms,
 * notifications, permissions); androidInstrumentedTest runs in the app's
 * process on a device; e2e flows drive the installed app.
 *
 *   names       every tier this profile knows, in ascending observability
 *   hostOnly    tiers that run on the host and cannot observe the target
 *               platform — a clause cited only from these is REPORTED
 *   satisfying  a clause tagged `[tier: X]` must be cited from one of
 *               satisfying[X], or specCoverage FAILS by name (MOTION-13: an
 *               animation "plays once per process start", cited only from a
 *               desktop test with no process lifecycle at all)
 *   journey     the tier whose citation proves a device journey — what a UI
 *               feature needs at least one of to be done (feature-brief)
 *   forFile     the tier a citing file belongs to, from its path
 */
export const tiers = Object.freeze({
  names: Object.freeze(["commonTest", "desktopTest", "androidInstrumentedTest", "e2e"]),
  hostOnly: Object.freeze(["commonTest", "desktopTest"]),
  satisfying: Object.freeze({
    device: Object.freeze(["androidInstrumentedTest", "e2e"]),
    e2e: Object.freeze(["e2e"]),
  }),
  journey: "e2e",
  /**
   * @param {string} rel path relative to the project root (either separator)
   * @returns {"commonTest"|"desktopTest"|"androidInstrumentedTest"|"e2e"|"other"}
   */
  forFile(rel) {
    const p = String(rel).split("\\").join("/");
    if (p.includes("/androidInstrumentedTest/")) return "androidInstrumentedTest";
    if (p.includes("/commonTest/")) return "commonTest";
    if (p.includes("/desktopTest/")) return "desktopTest";
    if (p.startsWith("qa/e2e/")) return "e2e";
    return "other";
  },
});
