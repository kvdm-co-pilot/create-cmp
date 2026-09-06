// `build` IS ONE STACK'S WORD — two core rules that spelled it as if it were
// everyone's, run against a second ecosystem.
//
// Companion to test/core-ecosystem-assumptions.test.mjs and
// test/differential-conformance.test.mjs: same shape, same reason. Both defects
// below produce a WRONG VERDICT rather than a refusal, which is why reading did
// not find them and why the agnostic lint could not either — its STACK_FACTS
// list (test/agnostic-lint.test.mjs) bans `composeApp`, `gradlew`,
// `commonTest`, `androidInstrumentedTest`, `qa/e2e`, `steps-cmp`, `kspCaches`.
// The word `build` is not on it and never could be: it is an ordinary English
// noun that happens to be Gradle's output directory and Gradle's step name.
//
//   A. qa/watch.mjs's ignore predicate identified build output by the single
//      literal directory name `build`, while the profile declares
//      `layout.buildDir`. Rust's output is `target/`, .NET's is `bin/` and
//      `obj/`, Python's is `__pycache__`, Xcode's is `DerivedData`. Two
//      failures in opposite directions: on those stacks the watcher watches its
//      own build output and re-triggers the lane on the lane's own writes (a
//      feedback loop), and on EVERY stack a real source directory named
//      `build/` is silently never watched — a watcher that looks idle and is.
//
//   B. qa/lib/lane-runner.mjs's short-circuit fired on a step literally named
//      `build`. The intent is right — once compilation fails every later
//      verdict is meaningless — but the step's NAME is the pack's to choose.
//      A pack that calls it `py_build` ran its whole slow tier against a tree
//      that does not compile (minutes of nonsense rows), and a pack that has
//      some OTHER step named `build` had its lane truncated there, losing real
//      verdicts that had nothing to do with compiling.
//
// The rule both share: the core may read a declaration, never a convention.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as alien from "./fixtures/profiles/py-alien/index.mjs";
import * as cmp from "../packages/harness/src/lib/profiles/cmp/index.mjs";
import { createCmpSteps } from "../packages/harness/src/lib/profiles/cmp/steps-cmp.mjs";
import { runLane } from "../packages/harness/src/lib/lane-runner.mjs";
import { shouldIgnorePath } from "../packages/harness/src/watch.mjs";
import { specModelFrom } from "../packages/harness/src/lib/spec-model.mjs";

function markerIn() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "build-word-")), ".lane-in-progress");
}

/** A step function whose RESULT carries `name` — which is what the spine judges. */
const row = (name, verdict) => () => ({ name, verdict, durationMs: 1 });

/** The cmp pack, constructed without executing anything (see steps-cmp.test.mjs). */
function cmpPack() {
  const trap = (what) => () => {
    throw new Error(`${what} must not run while the pack is only being constructed`);
  };
  return createCmpSteps({
    ROOT: os.tmpdir(),
    HERE: os.tmpdir(),
    GRADLEW: "./gradlew",
    RERUN: " --rerun",
    fast: false,
    determinism: false,
    profile: "local",
    mode: "full",
    sh: trap("sh"),
    shGradle: trap("shGradle"),
    tryGit: trap("tryGit"),
    tryGitLines: trap("tryGitLines"),
    DEGRADED_PATHS: [],
  });
}

// ── B. the compile short-circuit ────────────────────────────────────────────

test("each pack declares the step whose failure ends the lane — the spine reads it, never guesses it", () => {
  // The declaration has to EXIST on both sides or the differential test below
  // is only asserting against a literal typed twice.
  assert.equal(cmpPack().compileStepName, "build", "the cmp pack must name its own compile step");
  assert.equal(alien.steps().compileStepName, "py_build", "and so must the alien pack (test/fixtures/profiles/py-alien/index.mjs)");
});

test("a failed compile ends the lane — whatever the pack calls that step, in both ecosystems", () => {
  // The same logical input: the step that compiles the app FAILS, and one more
  // step is queued behind it. Nothing after a failed compile is meaningful, so
  // the lane must stop in BOTH — the cmp pack spells it `build`, the alien pack
  // spells it `py_build`, and the spine may not prefer one spelling.
  const cases = [
    { name: "cmp (Gradle)", compileStepName: "build", later: "unitTests" },
    { name: "py-alien (Python)", compileStepName: "py_build", later: "py_tests_fast" },
  ];
  for (const c of cases) {
    const lane = runLane({
      steps: [row(c.compileStepName, "FAIL"), row(c.later, "PASS")],
      markerPath: markerIn(),
      compileStepName: c.compileStepName,
    });
    assert.deepEqual(
      lane.steps.map((s) => s.name),
      [c.compileStepName],
      `${c.name}: the lane must stop at the failed compile and run nothing behind it`,
    );
    assert.equal(lane.verdict, "FAIL", `${c.name}: and the verdict is FAIL`);
  }
});

test("a step that merely SHARES another stack's compile-step name never truncates the lane", () => {
  // The opposite direction, and the more expensive one: the alien pack compiles
  // in `py_build` and happens to have a later step named `build` (a packaging
  // step, a container image, a docs build — the word is not reserved). Keyed to
  // the literal, the spine dropped `py_tests_slow` on the floor: a real verdict
  // never taken, on a lane that reported itself complete.
  const lane = runLane({
    steps: [row("py_build", "PASS"), row("build", "FAIL"), row("py_tests_slow", "PASS")],
    markerPath: markerIn(),
    compileStepName: "py_build",
  });
  assert.deepEqual(
    lane.steps.map((s) => s.name),
    ["py_build", "build", "py_tests_slow"],
    "only the DECLARED compile step short-circuits; a failure in any other step is one red row and the lane goes on",
  );
  assert.equal(lane.verdict, "FAIL");
});

test("a pack that declares no compile step short-circuits on nothing — it never inherits someone else's", () => {
  // The sane behaviour for a pack with no compile phase at all (a lint-only
  // lane, an interpreted stack): every step runs, every verdict is taken, and
  // the lane neither crashes nor stops on a name it was never given.
  for (const declared of [null, undefined]) {
    const lane = runLane({
      steps: [row("harness_integrity", "PASS"), row("build", "FAIL"), row("checks", "PASS")],
      markerPath: markerIn(),
      compileStepName: declared,
    });
    assert.deepEqual(
      lane.steps.map((s) => s.name),
      ["harness_integrity", "build", "checks"],
      `compileStepName: ${String(declared)} — no declaration means no short-circuit`,
    );
    assert.equal(lane.verdict, "FAIL");
  }
});

test("a caller that never mentions a compile step keeps the historical short-circuit, and an explicit stopAfter still wins", () => {
  // COMPATIBILITY, deliberately narrow: a ctx with no `compileStepName` KEY at
  // all is a caller written before the declaration existed. It keeps the old
  // behaviour rather than silently losing the short-circuit — the distinction
  // is key PRESENCE (Object.hasOwn), not the value, so a pack that declares
  // nothing still gets "short-circuit on nothing" from the test above.
  const legacy = runLane({ steps: [row("build", "FAIL"), row("unitTests", "PASS")], markerPath: markerIn() });
  assert.deepEqual(legacy.steps.map((s) => s.name), ["build"], "an unaware caller keeps exactly today's lane");

  const explicit = runLane({
    steps: [row("build", "FAIL"), row("unitTests", "PASS")],
    markerPath: markerIn(),
    compileStepName: "build",
    stopAfter: () => false,
  });
  assert.deepEqual(explicit.steps.map((s) => s.name), ["build", "unitTests"], "an explicit stopAfter is the caller's word and outranks the declaration");
});

// ── A. the watcher's ignore set ─────────────────────────────────────────────

const MODELS = {
  cmp: specModelFrom(cmp, {}),
  alien: specModelFrom(alien, {}),
};

test("the watcher ignores the profile's DECLARED build output, and nothing else's — in both ecosystems", () => {
  assert.equal(MODELS.cmp.ok, true, MODELS.cmp.ok ? "" : MODELS.cmp.reason);
  assert.equal(MODELS.alien.ok, true, MODELS.alien.ok ? "" : MODELS.alien.reason);
  const cases = [
    // cmp declares composeApp/build. `target/` is not its output, so a source
    // tree named target/ is a tree a human edits and must re-trigger the loop.
    { name: "cmp (Gradle)", model: MODELS.cmp.model, output: "composeApp/build/classes/Main.class", source: "composeApp/src/target/Target.kt" },
    // The alien declares target/. Its build output was WATCHED — every lane
    // wrote into target/, which woke the watcher, which ran the lane again.
    // And app/build/ is ordinary Python source that was never watched at all.
    { name: "py-alien (Python)", model: MODELS.alien.model, output: "target/main.pyc", source: "app/build/renderer.py" },
  ];
  for (const c of cases) {
    assert.equal(shouldIgnorePath(c.output, c.model), true, `${c.name}: the declared build output must be ignored — watching it is a feedback loop`);
    assert.equal(shouldIgnorePath(c.source, c.model), false, `${c.name}: a source directory this profile never called build output must be watched`);
  }
});

test("the declared output directory's NAME is ignored at any depth — a multi-module tree has one per module", () => {
  // cmp declares `composeApp/build`, but Gradle writes a build/ into EVERY
  // module, and the harness's own qa/ subtrees get one too. Ignoring only the
  // one declared path would re-open the feedback loop one directory over, so
  // the declared directory's name is what matches — at any depth, and only
  // that name. This is today's cmp behaviour, held.
  assert.equal(shouldIgnorePath("qa/somewhere/build/out.json", MODELS.cmp.model), true);
  assert.equal(shouldIgnorePath("composeApp\\build\\x.txt", MODELS.cmp.model), true, "Windows separators normalize");
  assert.equal(shouldIgnorePath("app/nested/target/x.pyc", MODELS.alien.model), true, "and the same rule in the alien ecosystem");
});

test("with no resolvable profile the watcher keeps its fallback rather than watching its own output", () => {
  // No model = no manifest, or a profile that declares no buildDir. The core
  // does not know this stack, and the two failures are not symmetric: watching
  // your own output loops forever, while missing a source directory named
  // build/ costs one manual run. So the historical name stays as a FALLBACK —
  // announced in the startup banner, exactly as spec-model.mjs's
  // DEFAULT_GRAMMAR.isDefault announces the borrowed citation grammar.
  assert.equal(shouldIgnorePath("composeApp/build/anything.txt"), true);
  assert.equal(shouldIgnorePath("composeApp/build/anything.txt", null), true);
  assert.equal(shouldIgnorePath("app/main.py", null), false);
});
