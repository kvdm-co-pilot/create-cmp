// AN OPTION KEY THE CALLEE NEVER READS IS A SILENT NO-OP, AND JAVASCRIPT WILL
// NOT TELL YOU.
//
// `explain(path, { intended: held })` against `function explain(path, {
// declared } = {})` throws nothing, warns nothing, and returns a perfectly
// well-formed answer — one that simply does not contain what the caller meant to
// put in it. The caller's comment goes on describing the behaviour it intended,
// the callee stays correct in isolation, and no test of either side can see the
// gap, because the gap is the PAIR.
//
// The same shape is worse in a test, where it does not merely lose a value: it
// removes the assertion. A test that drives a function with an option the
// function does not accept is comparing the function against itself. It passes.
// It goes on passing after the behaviour it was written to pin is deleted, and
// the suite's count of green tests says nothing changed.
//
// THE CLASS, NOT THE INSTANCE. The instances that provoked this file are named
// in the failure message, but the invariant is the point: every key handed to a
// function in an options object is one that function destructures. Rename a
// parameter and every stale call site goes red in the same run — which is the
// only moment anybody is in a position to fix them.
//
// WHAT IT DOES NOT JUDGE is in test/helpers/js-source-scan.mjs: only
// `function name(...)` declarations, only calls whose callee resolves to a
// signature the calling file can actually see, and nothing at all about an
// object literal carrying a spread or a computed key. Silence from this lint is
// not proof of correctness over the unjudged part — which is why the first test
// here pins that the judged part is not empty.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ignoredOptionKeys, maskSource, objectKeys, signaturesIn, trackedSources } from "./helpers/js-source-scan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The generated MCP bundle is excluded because it is not a source file: it is a
 * concatenation of files already scanned here, and a finding in it is the same
 * finding counted twice, reported at a line number nobody can edit.
 */
const sources = trackedSources(REPO_ROOT, (rel) => rel.startsWith("inspector/mcp/dist/"));

test("the scanner reads code, not prose — a comment, a string and a regex full of braces are not call sites", () => {
  const masked = maskSource(
    [
      "// call it like this: f({ ghost: 1 })",
      "const s = 'f({ ghost: 1 })';",
      "const t = `text ${f({ real: 1 })} more f({ ghost: 1 })`;",
      "const r = /^\\/\\/ f\\({ ghost/;",
      "function f({ real }) { return real; }",
    ].join("\n"),
  );

  assert.equal(masked.split("\n").length, 5, "offsets must survive masking, or every reported line number is wrong");
  assert.equal((masked.match(/ghost/g) ?? []).length, 0, "a key that only ever appears in prose was read as code");
  assert.equal((masked.match(/real/g) ?? []).length, 3, "the live half of a template literal, and the signature, are code");

  const sigs = signaturesIn(masked);
  assert.deepEqual([...(sigs.get("f")?.keys ?? [])], ["real"], "the signature's accepted keys come from the parameter pattern");
  assert.deepEqual(objectKeys("a, b: 1, c = 2").keys, ["a", "b", "c"]);
  assert.equal(objectKeys("...rest").unknown, true, "a spread means the keys cannot be enumerated, so nothing may be judged");
});

test("the lint is not inert: it reads this repo's real modules and their real call sites", () => {
  assert.ok(sources.size > 300, `scanned ${sources.size} tracked .mjs files — this lint cannot see the repo it is lint for`);

  const init = [...sources.values()].find((s) => s.rel === "packages/harness/install/init.mjs");
  assert.ok(init, "packages/harness/install/init.mjs is the module this class was found in and it must be in scope");
  const accepted = signaturesIn(init.masked).get("profileSkeleton")?.keys;
  assert.ok(
    accepted?.has("sourceRoots"),
    "the scanner derived no signature for profileSkeleton, so every call to it is unjudged and this lint's silence means nothing",
  );
});

test("no call site hands a function an options key that function does not read", () => {
  const findings = ignoredOptionKeys(sources);

  assert.deepEqual(
    findings.map((f) => `${f.rel}:${f.line} ${f.callee}({ ${f.ignored.join(", ")} })`),
    [],
    "each line below passes a key the function drops on the floor — nothing throws, nothing warns, the value is " +
      "simply gone:\n" +
      findings
        .map(
          (f) =>
            `  ${f.rel}:${f.line}\n` +
            `      ${f.callee}({ ${f.ignored.join(", ")} , … })  →  ${f.definedIn} destructures { ${f.accepted.join(", ")} }\n` +
            `      so ${f.ignored.map((k) => `\`${k}\``).join(" and ")} ${f.ignored.length === 1 ? "is" : "are"} read by nobody.`,
        )
        .join("\n") +
      "\n\n  Rename the key to one the callee accepts, or make the callee accept it. If the call is in a TEST, the " +
      "test is not merely losing a value — it is asserting nothing, because the behaviour it varies never reached " +
      "the function under test.",
  );
});
