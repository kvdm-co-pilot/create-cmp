// The evidence ladder, resolved — ONE answer, for every reader.
//
// WHY THIS FILE EXISTS. Until 2026-09-08 the ladder had two spellings and each
// had a different reader, and neither reader knew the other existed:
//
//   `export const ladder`         the top-level declaration. `harness init`
//                                 seeds it as THE way to declare rungs
//                                 (install/init.mjs), and
//                                 qa/receipt-check.mjs read it.
//   `evidenceLadder` on the pack  a key on the object `steps(ctx)` returns.
//                                 The lane runner read only this one
//                                 (qa/verify.mjs).
//
// The one real profile exports BOTH, out of the same frozen constant, so
// whichever reader ran got the same object and the split was invisible from
// inside it. A foreign author who did exactly what the seeded skeleton says
// declared `ladder`; the lane looked for `evidenceLadder`, found none, and
// graded the run at NO RUNG with no message — because "no ladder, no rung" is
// the honest answer to a profile that declared nothing and a silently wrong one
// to a profile that declared it in the other place. Found on 2026-09-08 by
// scripts/stage2-gate.mjs running in an ecosystem this code had never met,
// which is how all eight wrong verdicts in NORTH-STAR.md §9.1 were found.
//
// BOTH SPELLINGS STAY, because they answer different questions. The pack's is
// the only one a pack can COMPUTE — it is built inside `steps(ctx)`, where the
// run's own context is in hand. The top-level one is the only one a reader that
// must not START A LANE can ask: the Stop hook deciding whether a tier that
// could have run did holds a project root and nothing else, and calling
// `steps(ctx)` to find out would be a done-gate that runs a lane
// (lib/profiles/cmp/index.mjs states this reason where it re-exports the
// constant).
//
// THE PRECEDENCE, AND WHY IT IS DELIBERATELY UNOBSERVABLE. The top-level
// declaration wins. The argument is not that it is better data; it is that it
// is the data the WEAKEST reader can see, and the weakest reader and the lane
// must grade from the same bytes or the product's own comparability rule
// (NORTH-STAR.md §8.9 — one pack's L2 and another's are different claims)
// becomes a question of which reader ran. Preferring the pack's would mean the
// lane grades from something the Stop hook can never see.
//
// And because the two must be the SAME ladder, the precedence can never change
// a rung: where both are present they must agree, and where they disagree this
// refuses instead of choosing. Deriving a grade from a contradiction would mint
// a claim nobody made, in the vocabulary evidence is actually sold in. That
// refusal is the one gate this module adds, and it is calibrated by a kept
// plant that watches the real lane refuse by name (test/evidence-ladder.test.mjs).
//
// WHAT COUNTS AS DISAGREEMENT is exactly the fields the grader reads
// (evidence-level.mjs), and nothing else. A difference the grader cannot see
// cannot change a rung, so refusing over one would be a gate with no wrong
// verdict behind it — mechanism for its own sake, which NORTH-STAR.md §8.8
// presumes against. The pairing is pinned by a test that derives the read
// fields from evidence-level.mjs's own source, so the two cannot drift apart.
//
// SINGLE SOURCE OF TRUTH: packages/harness/src/lib/evidence-ladder.mjs in the
// create-cmp repo. Vendored byte-identical into qa/lib/ — edit the package
// source, then run `node scripts/sync-harness.mjs`.

/**
 * The ladder fields `evidenceLevel` actually reads (evidence-level.mjs). Two
 * declarations differing anywhere else are not in disagreement about any grade,
 * so they are not refused.
 */
export const GRADED_FIELDS = Object.freeze(["scaffoldCore", "l0Required", "l1Required", "l2Execution", "l3Execution", "names"]);

/** The two spellings, named the way an author wrote them, for every message below. */
const DECLARED_SPELLING = "`export const ladder` (the profile's top-level declaration)";
const PACK_SPELLING = "`evidenceLadder` (a key on the object `steps(ctx)` returns)";

/** A declaration is PRESENT when it is neither absent nor an explicit "none". */
function present(v) {
  return v !== undefined && v !== null;
}

/**
 * Deep equality with functions compared by IDENTITY — a ladder is data, and two
 * distinct functions in the same slot are a difference this cannot see through
 * and must not pretend to.
 */
function same(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => same(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => same(a[k], b[k]));
  }
  return false;
}

/** How a value reads in a refusal — short, and never a whole ladder dumped inline. */
function brief(v) {
  if (v === undefined) return "absent";
  if (Array.isArray(v)) return JSON.stringify(v);
  if (v && typeof v === "object") return `{${Object.keys(v).sort().join(", ")}}`;
  return JSON.stringify(v) ?? String(v);
}

/**
 * The evidence ladder this profile declares, however it declared it.
 *
 * @param {object|null|undefined} profile the loaded profile module namespace
 * @param {object|null|undefined} [pack] the object `steps(ctx)` returned, when
 *   the caller has one. A reader that must not start a lane passes nothing and
 *   gets what the profile DECLARES — which is the whole reason the top-level
 *   spelling takes precedence.
 * @returns {{ok: true, ladder: object|null, source: "profile"|"pack"|"both"|"none"}
 *   |{ok: false, reason: string, source: "both"|"profile"|"pack"}}
 *   `ladder: null` with `source: "none"` is the honest grade for a profile that
 *   declared no rungs — it is not a failure, and the caller derives no rung.
 */
export function evidenceLadderFor(profile, pack) {
  const id = profile && typeof profile.id === "string" ? profile.id : "(unnamed)";
  const declared = profile && typeof profile === "object" ? profile.ladder : undefined;
  const packed = pack && typeof pack === "object" ? pack.evidenceLadder : undefined;

  // Present-but-wrong is refused, never ignored — the same rule the profile
  // loader applies to `artifacts` and `governable`. A ladder that is not an
  // object silently grades as no ladder at all, which is the defect this
  // module exists to close wearing a different hat.
  for (const [value, spelling, source] of [
    [declared, DECLARED_SPELLING, "profile"],
    [packed, PACK_SPELLING, "pack"],
  ]) {
    if (present(value) && (typeof value !== "object" || Array.isArray(value))) {
      return {
        ok: false,
        source,
        reason:
          `profile "${id}" declares ${spelling} as ${brief(value)}, which is not an evidence ladder — ` +
          `a ladder is an object of step names ({ names, l0Required, l1Required, l2Execution, release }). ` +
          `Fix it or remove it; a profile that declares no ladder earns no rung, which is honest, and this is not that.`,
      };
    }
  }

  // `l3Execution` is the ONE graded field the grader reads as a single step name
  // rather than as a list, and that asymmetry produces a silently wrong verdict.
  // evidence-level.mjs does `passed.has(L.l3Execution)` against a Set of step-name
  // STRINGS, so an `l3Execution: ["distribution"]` never matches anything and L3
  // becomes unreachable without one word being said about it. Every sibling
  // field — scaffoldCore, l0Required, l1Required, l2Execution — IS a list,
  // and the seeded skeleton showed an empty list, so the shape an author is
  // most likely to reach for is exactly the one that fails silently. A real
  // one did: the second-stack author who wrote the ktor-backend profile from
  // the contract alone declared it as a list, and their L3 was unreachable.
  // Executed rather than read — the same ladder grades L2 as a list and L3 as
  // a string.
  //
  // This REFUSES rather than reinterpreting. Accepting the list would be the
  // semantically obvious repair, and it is not taken here, because it would
  // move an existing pack's rung from L2 to L3 — changing what a receipt
  // claims, which fit-test question 5 (NORTH-STAR.md §10) sends to an ADR
  // first. A refusal changes no grade anywhere: a string means exactly what it
  // meant, an absent one earns no L3 exactly as before, and the only tree
  // whose behaviour moves is one that was already being graded wrongly and
  // silently.
  //
  // THE RENAME DID NOT SETTLE THIS. `release` → `l3Execution` (2026-09-10) made
  // the name uniform and deliberately left the SHAPE alone, for the reason
  // above: a rename changes no grade, a reshape changes several. The open
  // question is now ADR-0016, and this block is what it proposes to delete.
  // THE PRE-RENAME SPELLINGS, REFUSED BY NAME. `deviceExecution` and `release`
  // became `l2Execution` and `l3Execution` on 2026-09-10, because the core had
  // no business calling a rung after one stack's runtime — a Python profile
  // declaring `deviceExecution` was naming hardware it does not have, and the
  // receipt field beside it could only ever be empty.
  //
  // Silently reading the old key would be the friendly thing and it is refused,
  // for the reason every fallback in this loader is refused: a profile that
  // still spells it the old way was written against a different meaning of the
  // rung, and grading it anyway would put a rung on a tree whose author never
  // answered the question the new name asks. The refusal names both the field
  // and the command, which is the whole of the migration for a hand-written
  // profile.
  for (const [value, spelling, source] of [
    [declared, DECLARED_SPELLING, "profile"],
    [packed, PACK_SPELLING, "pack"],
  ]) {
    if (!present(value)) continue;
    for (const [was, now] of [
      ["deviceExecution", "l2Execution"],
      ["release", "l3Execution"],
    ]) {
      if (!(was in value)) continue;
      return {
        ok: false,
        source,
        reason:
          `profile "${id}" declares ${spelling} with \`${was}\`, which this lane no longer reads — it is \`${now}\` now. ` +
          `The rungs are local and pre-release for every stack, so they are named by position rather than by one stack's runtime: ` +
          `L2 is the rung where the artifact runs AS THE PROGRAM, L3 the same for the shippable variant. ` +
          `Rename the field (\`node qa/profile.mjs explain ladder.${now}\` says what it means), or run \`prooflane upgrade\`.`,
      };
    }
  }

  for (const [value, spelling, source] of [
    [declared, DECLARED_SPELLING, "profile"],
    [packed, PACK_SPELLING, "pack"],
  ]) {
    const l3 = present(value) ? value.l3Execution : undefined;
    if (present(l3) && typeof l3 !== "string") {
      return {
        ok: false,
        source,
        reason:
          `profile "${id}" declares ${spelling} with l3Execution = ${brief(l3)}, which names no step. ` +
          `\`l3Execution\` takes ONE step name as a string — it is the only ladder field that is not a list, ` +
          `and a list here matches nothing, so L3 is unreachable and nothing says so. ` +
          `Write \`l3Execution: "${Array.isArray(l3) && typeof l3[0] === "string" ? l3[0] : "yourReleaseStep"}"\`, ` +
          `or remove the field: a profile that declares no release step earns no L3, which is honest.`,
      };
    }
  }

  if (present(declared) && present(packed)) {
    const differing = GRADED_FIELDS.filter((f) => !same(declared[f], packed[f]));
    if (differing.length) {
      return {
        ok: false,
        source: "both",
        reason:
          `profile "${id}" declares its evidence ladder TWICE and the two disagree, at ` +
          `${differing.map((f) => `${f} (${brief(declared[f])} vs ${brief(packed[f])})`).join("; ")}. ` +
          `${DECLARED_SPELLING} and ${PACK_SPELLING} must be the same ladder — the top-level one is what a reader ` +
          `that cannot start a lane asks, and a rung graded from whichever declaration a given reader happened to ` +
          `see would be a claim nobody made. Delete one, or export the same object from both.`,
      };
    }
    return { ok: true, ladder: declared, source: "both" };
  }

  if (present(declared)) return { ok: true, ladder: declared, source: "profile" };
  if (present(packed)) return { ok: true, ladder: packed, source: "pack" };
  return { ok: true, ladder: null, source: "none" };
}
