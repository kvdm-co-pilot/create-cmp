// profile-contract.mjs — what a profile must declare, what each declaration
// MEANS, and the question that elicits it. One object, three consumers.
//
//   the loader     validates a declaration and refuses by name      (`refusal`)
//   the interview  renders the menu at init/upgrade  (`question`/`options`/`default`)
//   the author     reads WHY, at the moment it is declaring          (`meaning`)
//
// PATTERN: prose inside the schema, never beside it. It is the shape every
// function-calling tool description already has, and the shape `kubectl explain`
// serves from the same bytes the API server validates with — help text and
// validator as one artifact, so neither can drift from the other.
//
// WHY THIS EXISTS. AGNOSTIC-HARNESS-ARCHITECTURE.md §4.2 carried this content as
// a table in a proposal. The first external profile drifted from it inside a
// week — declaring a rung earned by a directory naming convention rather than by
// anything running. Prose is not what failed there; prose that nothing reads at
// the moment of authoring is. §12 keeps the table as the architecture's record;
// this file is what an author and a program both read.
//
// WHY NOT JSON SCHEMA. §6 pins a profile as in-process ESM with no network on
// the receipt path, and a validator dependency is the one thing a receipt may
// not need. The VOCABULARY is borrowed — `required`, `options`, `default` — so
// it reads familiarly; the mechanism is a frozen object, the same idiom as
// REQUIRED_EXPORTS in profile-loader.mjs and GRADED_FIELDS in evidence-ladder.mjs.
//
// HOW IT FAILS: a `meaning` grows into an essay nobody reads, or is simply wrong
// and no test can tell. WHAT WE DO: MEANING_BUDGET below, enforced by the suite;
// and Rule 0, which proves a declared tier can actually fail. The contract says
// what to declare; the badge floor refuses a declaration that cannot fail.
//
// NO WORKED EXAMPLES LIVE HERE, and that is not an omission. The first draft
// carried one naming a profile's real steps, and test/agnostic-lint.test.mjs
// refused the file — a core module may not spell a profile's runtime vocabulary.
// The refusal was right and improved the design: `explain()` shows the CURRENT
// profile's own declaration, which is real rather than a copy that can go stale.
//
// SINGLE SOURCE OF TRUTH: packages/harness/src/lib/profile-contract.mjs in the
// create-cmp repo. Vendored byte-identical into qa/lib/ — edit the package
// source, then run `node scripts/sync-harness.mjs`.

/**
 * The most a `meaning` may be. Long enough for the L2 distinction, which is the
 * one an author gets wrong; short enough that it is read rather than skimmed.
 * A budget nobody enforces is a budget that grows, so the suite enforces it.
 */
export const MEANING_BUDGET = 900;

/**
 * THE LADDER IS LOCAL AND PRE-RELEASE, ALL FOUR RUNGS. Nothing here describes a
 * deployment. A receipt is bound to a tree; what a running environment is doing
 * at a moment cannot be re-derived from its bytes, so it could never be hash-
 * bound the way a rung must be. Deployment confidence, when it exists, is a
 * second kind of evidence — not a fifth rung, and not a redefinition of these.
 */
export const CONTRACT = Object.freeze({
  ladder: Object.freeze({
    required: false,
    meaning:
      "Which of this profile's steps earn which rung, and what the rungs are called. " +
      "Declaring no ladder is honest and earns no rung — the correct grade for a project " +
      "that proves nothing by execution.",
    fields: Object.freeze({
      // NOT `required`, and the reasoning is this harness's oldest idiom rather
      // than leniency: declaring nothing earns nothing. A ladder that omits
      // l0Required does not get refused — it gets no L0, which is the honest
      // grade and the same answer a profile with no ladder at all receives.
      //
      // What IS refused is the vacuous version: an EMPTY list cannot lift its
      // rung, because `[].every()` is true of nothing and would otherwise hand
      // out the rung free. That check lives in the grader (evidence-level.mjs),
      // not here — an unearnable rung is a grading fact, not a malformed
      // declaration. Both halves were briefly implemented as a refusal on
      // 2026-09-10 and it was the wrong shape: it turned three legitimate
      // partial ladders into refused profiles.
      l0Required: Object.freeze({
        required: false,
        mode: "all",
        meaning:
          "The steps that must PASS for the artifact to count as assembled at all. They run in " +
          "every run profile and never SKIP. Declare none and this profile earns no L0 — and " +
          "therefore no rung above it, since the rungs are climbed in order.",
        question: "Which steps prove the code assembles and its own tests run?",
        refusal: null,
      }),
      l1Required: Object.freeze({
        required: false,
        mode: "all",
        meaning:
          "The steps that judge the code WITHOUT running it as the program: compilation, tests " +
          "against fakes and in-process calls, static analysis, and the shippable artifact " +
          "BUILDING — building, not running. None of these may SKIP; they PASS or FAIL, so " +
          "'PASSed' is exactly 'ran green'. Declare none and this profile tops out at L0.",
        question: "Which steps judge the code without ever starting it as a program?",
        refusal: null,
      }),
      l2Execution: Object.freeze({
        required: false,
        mode: "any",
        meaning:
          "The steps whose PASS proves the artifact ran AS THE PROGRAM — assembled into its " +
          "deployable form, started the way it really starts, and driven through its real entry " +
          "surface. On this machine. " +
          "NOT imported, NOT called in-process. A test that imports your app and calls its " +
          "functions is L1 evidence however slow it is, whichever directory it lives in, and " +
          "however real the data store behind it. " +
          "What earns this rung is a local, disposable stand-in for the real runtime that the " +
          "lane starts and tears down. Every stack has one. Declare none and this profile tops " +
          "out at L1 — the honest grade for a project whose program is never started.",
        question: "What starts your app as the real program, and what drives it?",
        options: Object.freeze([
          "a local runtime instance the lane starts and tears down",
          "a local process the lane starts, driven over a socket",
          "nothing — the tests import the code and call it",
        ]),
        default: "a local runtime instance the lane starts and tears down",
        // NO REFUSAL, for the same reason l0Required and l1Required publish
        // none: naming no step is not malformed, it is declaring no L2 — the
        // meaning above says so, and `harness init` seeds exactly that state.
        // This field published "declares an l2Execution tier but names no step"
        // until a review pointed out that nothing performed it and nothing
        // could, since the state it named is the seeded default. A refusal
        // nobody performs tells an author they are protected when they are not.
        refusal: null,
      }),
      l3Execution: Object.freeze({
        required: false,
        mode: "all",
        meaning:
          "The same proof as l2Execution against the SHIPPABLE variant rather than the " +
          "development one, still on this machine. It exists because the shippable build runs " +
          "machinery the development build does not — optimisation, shrinking, release-only " +
          "checks, a production entry point — so a green development run says nothing about it. " +
          "Requires l2Execution: the shippable program cannot be proven to run where no program runs.",
        question: "Is there a shippable variant, built differently from the development one?",
        options: Object.freeze([
          "yes — the shippable artifact, started the same way, on this machine",
          "no — one variant only",
        ]),
        default: "no — one variant only",
        refusal: "declares l3Execution without l2Execution — the shippable program cannot run where no program runs",
      }),
      names: Object.freeze({
        required: false,
        meaning:
          "What THIS stack calls each rung, for display only. The rung ids (L0..L3) are the " +
          "core's and stay comparable across every profile; the words are yours. Two profiles " +
          "may call L2 different things and still mean the same rung.",
        question: "What do you call each rung?",
        refusal: null,
      }),
      scaffoldCore: Object.freeze({
        required: false,
        mode: "all",
        meaning:
          "The subset of l0Required a freshly stamped tree can satisfy before any feature exists, " +
          "so a scaffold can be graded without pretending it is a finished project.",
        question: "Which steps does an empty, freshly stamped tree already pass?",
        refusal: null,
      }),
    }),
  }),
});

/** Every field the contract describes, as `<declaration>.<field>`. */
export const CONTRACT_PATHS = Object.freeze(
  Object.entries(CONTRACT).flatMap(([decl, spec]) => Object.keys(spec.fields ?? {}).map((f) => `${decl}.${f}`)),
);

/** The fields of one declaration that an author MUST provide. */
export function requiredFields(declaration) {
  const spec = CONTRACT[declaration];
  if (!spec || !spec.fields) return [];
  return Object.entries(spec.fields)
    .filter(([, f]) => f.required)
    .map(([name]) => name);
}

/**
 * The contract entry at `ladder` or `ladder.l2Execution`, or null.
 * @param {string} path
 */
export function contractAt(path) {
  const [decl, field] = String(path).split(".");
  const spec = CONTRACT[decl];
  if (!spec) return null;
  if (!field) return spec;
  return spec.fields?.[field] ?? null;
}

/**
 * What an author needs, at the moment they are declaring it — `kubectl explain`
 * for a profile. Reads the SAME bytes the loader validates against, so the help
 * and the enforcement cannot disagree.
 *
 * `declared` is this project's own value for the field, when there is one. It is
 * printed instead of a worked example precisely because it is real: an example
 * in this file would be a copy of some profile's declaration, and a copy drifts.
 *
 * @param {string} path e.g. "ladder" or "ladder.l2Execution"
 * @param {{declared?: unknown}} [ctx]
 * @returns {string|null} null when the path names nothing
 */
export function explain(path, { declared } = {}) {
  const entry = contractAt(path);
  if (!entry) return null;
  const lines = [path, "", entry.meaning];
  if (entry.question) lines.push("", `ASKED AS: ${entry.question}`);
  if (entry.options) {
    lines.push("", "OPTIONS:");
    for (const o of entry.options) lines.push(`  ${o === entry.default ? "*" : " "} ${o}`);
    lines.push("", "  (* recommended)");
  }
  if (entry.mode) lines.push("", `EARNED BY: ${entry.mode === "any" ? "any one" : "every one"} of the named steps passing`);
  lines.push("", entry.required ? "REQUIRED." : "OPTIONAL — declaring nothing is a valid, honest answer.");
  // The refusal is printed as written, never upper-cased: it carries field names
  // (`l2Execution`) whose capitalisation is the thing an author has to type.
  if (entry.refusal) lines.push(`REFUSED WHEN IT ${entry.refusal}`);
  if (declared !== undefined) lines.push("", `THIS PROJECT DECLARES: ${JSON.stringify(declared)}`);
  return lines.join("\n");
}
