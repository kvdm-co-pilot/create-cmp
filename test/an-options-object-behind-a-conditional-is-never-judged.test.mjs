// AN UNREAD OPTION KEY IS INVISIBLE TO THE LINT THE MOMENT THE OBJECT IS NOT
// THE WHOLE ARGUMENT.
//
// test/option-keys-the-callee-never-reads.test.mjs refuses a real class — a key
// handed to a function that does not destructure it, which JavaScript drops in
// silence — and it states what it is for in one sentence: "Rename a parameter
// and every stale call site goes red in the same run, which is the only moment
// anybody is in a position to fix them."
//
// MEASURED, NOT REASONED. On 2026-09-11, `explain`'s option key was renamed
// (`{ declared }` → `{ declaredValue: declared }`) in
// packages/harness/src/lib/profile-contract.mjs and the suite re-run. The lint
// went red and named two stale call sites — `packages/harness/src/profile.mjs:93`
// and `test/profile-contract.test.mjs:127`. It did not name the third:
//
//     packages/harness/install/interview.mjs:238
//     write(`\n${indent(explain(path, held ? { declared: held } : {}))}\n\n`);
//
// which is equally stale and, after such a rename, silently stops printing the
// "THIS PROJECT DECLARES:" line the surrounding comment says it is there to
// print. `ignoredOptionKeys` requires the argument to BE an object literal
// (`arg.startsWith("{")`), so an object reached through `?:`, `||` or `??` is
// skipped whole — not judged and not reported as unjudged.
//
// THE CLASS, NOT THE INSTANCE. This is not about `explain`, and not about
// ternaries in particular: it is the scanner's rule that an options object only
// counts when it is the entire argument. The repo carries four production call
// sites of this shape today (`explain`, `pidAlive`, `beatHold` in both the
// harness and the vendored template), each correct at the moment of writing and
// each outside the gate that is supposed to keep it correct.
//
// AND IT IS SOUND TO JUDGE THEM, by the file's own argument. js-source-scan.mjs
// already refuses to look away from `f({ ...opts, intent })`, because a key
// written out at the call site is handed to the callee whatever else the object
// carries. A branch of a conditional is the same fact: when that branch is
// taken, those keys are handed over and dropped. An unknown branch
// (`cond ? opts : { ghost }`) does not make the WRITTEN branch unreadable — it
// only means the other one cannot be enumerated, which is already how the
// scanner treats a spread.
//
// WHY A TEST AND NOT A NOTE IN THE HEADER. Adding "…and anything not written as
// a bare object literal" to that file's "WHAT IT DOES NOT JUDGE" paragraph would
// make the lint honest and leave the class unrefused at the one call site the
// helper's own header uses as its worked example. This asserts the coverage
// instead, over the exported entry point, so a fix is checked rather than
// described.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ignoredOptionKeys, maskSource } from "./helpers/js-source-scan.mjs";

/** One synthetic module, in the shape `trackedSources` returns. */
function sources(body) {
  const raw = `function f({ real }) { return real; }\nconst held = 1;\n${body}\n`;
  return new Map([["/synthetic/module.mjs", { rel: "synthetic/module.mjs", raw, masked: maskSource(raw) }]]);
}

/** The keys the lint reports as dropped on the floor, for one call. */
function ignored(body) {
  return ignoredOptionKeys(sources(body)).flatMap((f) => f.ignored);
}

test("the scanner sees an unread key only when the options object is the entire argument", () => {
  // THE CONTROL, and it is load-bearing: without it a scanner that had stopped
  // working entirely would satisfy every expectation below by reporting nothing,
  // and this file would be measuring its own silence.
  assert.deepEqual(ignored("f({ ghost: 1 });"), ["ghost"], "the bare-literal shape is the one the lint already judges — if this is empty the scanner is broken, not narrow");

  const shapes = [
    ["a conditional, key in the consequent", "f(held ? { ghost: 1 } : {});"],
    ["a conditional, key in the alternate", "f(held ? {} : { ghost: 1 });"],
    ["a conditional whose other branch is opaque", "f(held ? someOptions : { ghost: 1 });"],
    ["a logical default", "f(held || { ghost: 1 });"],
    ["a nullish default", "f(held ?? { ghost: 1 });"],
    ["a parenthesised literal", "f(({ ghost: 1 }));"],
  ];

  const missed = shapes.filter(([, body]) => !ignored(body).includes("ghost"));

  assert.deepEqual(
    missed.map(([what]) => what),
    [],
    "each line below hands `f` a key it does not destructure, and the lint reports nothing:\n" +
      missed.map(([what, body]) => `    ${body}\n      (${what}) → reported ${JSON.stringify(ignored(body))}`).join("\n") +
      "\n\n  `function f({ real })` never reads `ghost` in any of them: the value is dropped, nothing throws, and the " +
      "call site reads like a working one. test/option-keys-the-callee-never-reads.test.mjs exists so that renaming a " +
      "parameter turns EVERY stale call site red in the same run; a call whose options object sits inside a " +
      "conditional stays green, and packages/harness/install/interview.mjs:238 is one — measured by renaming " +
      "`explain`'s key on 2026-09-11 and watching the lint name two of the three stale sites.\n" +
      "  Judging the written branches is sound for the reason the scanner already gives about a spread: a key spelled " +
      "at the call site is handed to the callee when that branch is taken, whatever the other branch holds.",
  );
});
