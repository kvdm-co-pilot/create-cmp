// A DELIBERATELY ALIEN PROFILE — the second half of "two profiles or it isn't
// parameterised".
//
// `test/fixtures/profiles/ktor-backend/` is a real profile, preserved as a real
// adopter authored it. This one is not real: it is built to disagree with `cmp`
// on EVERY axis a core function might quietly assume, so that a differential
// test has something to differ against.
//
// The defect class it exists to catch names no stack, which is why the agnostic
// lint cannot see it and why reading the code did not find it either. Five such
// rules shipped and passed 1,458 tests:
//
//   a citation binder that spoke Kotlin and JavaScript
//   a JUnit reader that returned the classname as the name
//   a report parser keyed to one build tool's filename prefix
//   a doneness deriver that ignored the declared spec directory
//   a journey requirement that never asked whether a journey tier existed
//
// Every one produced a WRONG VERDICT rather than a refusal. The only reliable
// detector is running the same logical input through both profiles and
// comparing the answers, because a convention-shaped assumption always makes
// the second profile disagree with the first.
//
// Where cmp says          this says
//   specs/                  contracts/          the spec directory is declared, not conventional
//   composeApp/src, qa/e2e  app/, t/            short, unconventional citation roots
//   .kt, .kts               .py                 a language with no braces and no @annotations
//   // comments             # comments          a marker the C-family skip rule does not know
//   /* */ blocks           """ blocks           a block comment whose open and close are identical
//   @Test, backtick fun     def test_           a test declaration with no keyword in common
//   4 tiers, e2e journey    2 tiers, NO journey  the nullable case the contract permits
//   qa/e2e/*.yaml flows     no flows at all      the null-flows case
//   camelCase step names    snake_case          because a step name is the pack's to spell
//   composeApp/build        target/             build output somewhere else entirely
//
// It ships no `artifacts`, no `governable` and no `plants`, because a profile
// that declares nothing optional is also a shape the core must handle.

export const id = "py-alien";
export const protocol = 1;

export const layout = {
  // NOT "specs". Every core reader that hardcoded the conventional name is
  // wrong here and says so loudly the moment it is asked.
  specs: "contracts",
  citationRoots: ["app", "t"],
  citationExts: [".py"],
  sourceRoots: ["app"],
  buildDir: "target",
  // No journey scripts. cmp always has qa/e2e/*.yaml, so every core path asking
  // "where are the flows" had only ever been answered yes.
  flows: null,
};

/**
 * The rules that decide whether a citation counts, in a language whose syntax
 * shares nothing with the core's fallback. `blockComment` opens and closes with
 * the same token, which is the case a matched-pair scanner cannot read.
 */
export const reports = { format: "junit-xml", dir: "reports" };

export const grammar = {
  citationMarker: /^(?:\/\/|#)\s*SPEC:/,
  lineComment: /^#/,
  blockComment: { open: '"""', close: '"""' },
  testDeclaration: /^\s*(?:async\s+)?def\s+test\w*\s*\(|^\s*class\s+Test\w*\s*[(:]/,
  typeDeclaration: /^\s*class\s+\w+/,
  bindingWindow: 5,
};

/**
 * Two tiers, overlapping, and NO journey tier — the nullable case the contract
 * documents and cmp can never exercise, because cmp always has one.
 */
export const tiers = {
  names: ["fast", "slow"],
  hostOnly: ["fast"],
  satisfying: {
    // `fast` is satisfied by EITHER: a slow test also proves a fast promise.
    fast: ["fast", "slow"],
    slow: ["slow"],
  },
  journey: null,
  forFile: (rel) => {
    if (rel.includes("/slow/")) return "slow";
    if (rel.startsWith("t/")) return "fast";
    return "other";
  },
};

/**
 * Step names in snake_case, because how a pack spells its steps is the pack's
 * business. Anything in the core keyed to a literal name — a short-circuit on
 * `build`, a receipt validator requiring `harnessIntegrity` — is wrong here.
 */
export function steps() {
  const row = (name, layer, verdict = "PASS") => {
    const fn = () => ({ name, verdict, durationMs: 1, layer });
    return fn;
  };
  const STEP_FN_BY_NAME = {
    harness_integrity: row("harness_integrity", "spine"),
    spec_coverage: row("spec_coverage", "spine"),
    py_build: row("py_build", "app"),
    py_tests_fast: row("py_tests_fast", "app"),
    py_tests_slow: row("py_tests_slow", "app"),
  };
  const host = [STEP_FN_BY_NAME.harness_integrity, STEP_FN_BY_NAME.spec_coverage];
  const all = [...host, STEP_FN_BY_NAME.py_build, STEP_FN_BY_NAME.py_tests_fast, STEP_FN_BY_NAME.py_tests_slow];
  return {
    id,
    stepsForProfile: { smoke: host, scaffold: host, local: all, ci: all, nightly: all, release: all },
    DEVICE_STEPS: ["py_tests_slow"],
    FAST_EXCLUDED_NAMES: ["py_tests_slow"],
    STEP_FN_BY_NAME,
    stepDeterminism: () => null,
    releaseLease: () => {},
    // The step whose failure makes everything after it meaningless. cmp calls
    // this one `build`; the core must not.
    compileStepName: "py_build",
    evidenceLadder: {
      names: { L0: "L0 — it imports", L1: "L1 — fast tests", L2: "L2 — slow tests", L3: "L3 — released" },
      l0Required: ["harness_integrity"],
      l1Required: ["harness_integrity", "spec_coverage", "py_tests_fast"],
      l2Execution: ["py_tests_slow"],
      // This stack declares no release step at all. `[]` used to say that and
      // now reads as the wrong shape — `null` says it in the one way the grader
      // and the resolver both understand.
      l3Execution: null,
    },
  };
}
