// THE SCANNER BLAMES A CALL FOR THE OPTIONS OF THE CALLS INSIDE ITS ARGUMENTS.
//
// `ignoredOptionKeys` (test/helpers/js-source-scan.mjs) answers one question —
// which keys did THIS call site hand to THIS function — and everything built on
// it reads the answer as a defect report naming a file and a line.
// test/option-keys-the-callee-never-reads.test.mjs turns that answer straight
// into a failing assertion against this repo's real modules.
//
// `optionLiterals` decides which `{` in an argument expression is an options
// object, and it accepts any `{` that follows an opening parenthesis:
//
//     const before = arg.slice(0, i).trimEnd();
//     if (before !== "" && !/[(?:|&,]$/.test(before)) continue;
//
// `(` is in that set so that `f(({ a: 1 }))` — a parenthesised literal — is
// judged. But the `(` that opens a NESTED CALL matches the same character, so
// every object literal inside an inner call's argument list is read as a key the
// OUTER call was handed. MEASURED, on this tree, 2026-09-11, against
// `function f({ real })`:
//
//     f(g({ ghost: 1 }));               → reported: f({ ghost })
//     f(held ? g({ ghost: 1 }) : {});   → reported: f({ ghost })
//     f(held || g({ ghost: 1 }));       → reported: f({ ghost })
//     f(() => ({ ghost: 1 }));          → reported: f({ ghost })
//
// In every one of those, `ghost` is handed to `g`, or is an arrow's return
// value. `f` never sees it. The lint names `f`, at `f`'s line, and tells the
// reader `f` "drops it on the floor".
//
// WHY THIS IS A DEFECT AND NOT A LIMITATION. The other direction — a call the
// scanner cannot read — is stated honestly and loudly in the helper's own header
// ("IT JUDGES LESS THAN IT SEES, DELIBERATELY … Anything ambiguous is skipped
// rather than guessed") and a silence there costs nothing but coverage. This is
// the opposite: an answer the scanner does not have, given confidently, about a
// call site that is correct. The helper's header names the price itself: "a
// scanner that judges wrong is deleted the first time it is wrong." The suite is
// green today only because no module happens to write the shape yet — which
// makes the first person to write it the one who pays, holding a red suite and a
// report pointing at the wrong function.
//
// THE CLASS, NOT THE INSTANCE, and the instance is not `(`. The invariant is
// that an argument expression's keys belong to the call that RECEIVES them: a
// literal enclosed by a bracket opened INSIDE the argument is some inner
// construct's, never this call's. That covers the nested call, the arrow's
// returned object, and whatever syntax is written next — and it is the same
// judgement `objectKeys` already makes when it refuses to read a key it cannot
// attribute.
//
// SCOPE: this asserts nothing about which shapes the scanner should reach INTO.
// Judging the branches of a conditional is settled and correct
// (test/an-options-object-behind-a-conditional-is-never-judged.test.mjs measured
// why), and the one control below exists so that answering this file by
// narrowing the scanner back down turns that file red rather than this one green
// in silence.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ignoredOptionKeys, maskSource } from "./helpers/js-source-scan.mjs";

/**
 * One synthetic module with two functions: `f` takes an options object and reads
 * exactly one key; `g` takes a positional and is where an inner call's keys
 * really go. The same shape test/an-options-object-behind-a-conditional-is-never
 * -judged.test.mjs builds, so the two files are asking about one scanner.
 */
function sources(body) {
  const raw = `function f({ real }) { return real; }\nfunction g(x) { return x; }\nconst held = 1;\n${body}\n`;
  return new Map([["/synthetic/module.mjs", { rel: "synthetic/module.mjs", raw, masked: maskSource(raw) }]]);
}

/** What the lint would report for one line of code: `[callee, keys]` pairs. */
function reported(body) {
  return ignoredOptionKeys(sources(body)).map((f) => [f.callee, f.ignored]);
}

test("the scanner blames a call for keys that were handed to a call inside its arguments", () => {
  // THE CONTROL. A scanner that had stopped working would report nothing at all
  // and satisfy every expectation below, so the one call that really does drop a
  // key has to still be found — and finding it is also what keeps this file from
  // being answerable by narrowing the scanner back to bare literals, which is
  // the shape a sibling test measured and refused.
  assert.deepEqual(reported("f({ ghost: 1 });"), [["f", ["ghost"]]], "the bare-literal case is the lint's whole subject — if this is empty the scanner is broken, not merely wrong");
  assert.deepEqual(reported("f(held ? { ghost: 1 } : {});"), [["f", ["ghost"]]], "a literal in a conditional branch IS handed to f when that branch is taken — settled elsewhere, and not what this file questions");

  const elsewhere = [
    ["a nested call's own argument", "f(g({ ghost: 1 }));", "g"],
    ["a nested call inside a conditional branch", "f(held ? g({ ghost: 1 }) : {});", "g"],
    ["a nested call after a logical or", "f(held || g({ ghost: 1 }));", "g"],
    ["an object an arrow RETURNS", "f(() => ({ ghost: 1 }));", "the arrow's caller"],
  ];

  const misattributed = elsewhere.filter(([, body]) => reported(body).some(([callee, keys]) => callee === "f" && keys.includes("ghost")));

  assert.deepEqual(
    misattributed.map(([what]) => what),
    [],
    "each line below hands `ghost` to something that is NOT `f`, and the lint reports `f` dropping it:\n" +
      misattributed
        .map(([what, body, owner]) => `    ${body}\n      (${what}) → reported ${JSON.stringify(reported(body))}, and \`ghost\` belongs to ${owner}`)
        .join("\n") +
      "\n\n  `optionLiterals` accepts any `{` whose preceding character is `(`, which is true of a parenthesised " +
      "literal and equally true of the parenthesis that opens a nested call — so an inner call's argument list is " +
      "read as the outer call's options. test/option-keys-the-callee-never-reads.test.mjs turns this answer straight " +
      "into a failure naming a file, a line and a function, so the report an author gets names the wrong function at " +
      "a line where nothing is wrong.\n" +
      "  A key belongs to the call that RECEIVES it: a literal enclosed by a bracket opened inside the argument is " +
      "some inner construct's, not this call's. `objectKeys` already refuses to read a key it cannot attribute; this " +
      "is the same judgement one level up.",
  );
});
