// The one rule of the agnostic harness, as a test:
//
//   Nothing in the core imports a profile by name.
//
// docs/proposals/AGNOSTIC-HARNESS-ARCHITECTURE.md §3.2. The core loads the
// profile the manifest declares, through qa/lib/profile-loader.mjs. An import
// of the Compose step pack from anywhere but inside a profile is the coupling
// Stage 0 removes, and it must not be able to come back by accident.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = path.join(REPO_ROOT, "packages", "harness", "src");
const PROFILES = path.join(CORE, "lib", "profiles");

function mjsUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? mjsUnder(abs) : e.name.endsWith(".mjs") ? [abs] : [];
  });
}

/**
 * Import specifiers in a module — static and dynamic — with comments stripped
 * first. This lint judges what a module DOES, not what its header says about
 * history: a comment that quotes the very import this rule bans is exactly the
 * kind of prose a module explaining its own reason for existing will carry.
 */
function importsOf(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const out = [];
  for (const m of code.matchAll(/\bfrom\s+["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

test("no core module imports the Compose step pack — only a profile may", () => {
  const offenders = [];
  for (const abs of mjsUnder(CORE)) {
    if (abs.startsWith(PROFILES + path.sep)) continue; // a profile owns its pack
    if (path.basename(abs) === "steps-cmp.mjs") continue; // the pack itself, until it moves (PR 3)
    const bad = importsOf(fs.readFileSync(abs, "utf8")).filter((s) => /steps-cmp\.mjs$/.test(s));
    if (bad.length) offenders.push(`${path.relative(REPO_ROOT, abs)} → ${bad.join(", ")}`);
  }
  assert.deepEqual(offenders, [], `core modules importing a profile by name:\n  ${offenders.join("\n  ")}`);
});

test("the runner resolves its profile through the manifest and the loader, not a literal", () => {
  const verify = fs.readFileSync(path.join(CORE, "verify.mjs"), "utf8");
  assert.doesNotMatch(verify, /createCmpSteps/, "verify.mjs must not name the Compose pack");
  assert.match(verify, /resolveHarnessManifest\(ROOT\)/);
  assert.match(verify, /loadProfile\(ROOT, manifest\.manifest\.profile\)/);
  assert.doesNotMatch(verify, /["']cmp["']/, "verify.mjs must not carry a profile id literal");
});

test("the cmp profile exists where the loader looks, and is the only place the pack is wired", () => {
  const entry = path.join(PROFILES, "cmp", "index.mjs");
  assert.ok(fs.existsSync(entry));
  const src = fs.readFileSync(entry, "utf8");
  assert.match(src, /export const id = "cmp"/);
  assert.match(src, /export const protocol = 1/);
  assert.match(src, /from "\.\/steps-cmp\.mjs"/);
});

// ── Every core module is stack-free unless explicitly excused ───────────────
//
// THIS LIST USED TO BE AN OPT-IN ALLOWLIST, and that is how five wrong verdicts
// shipped. A file was added the moment its last stack fact moved out, which
// means every file NOT yet added — and every file created after — could carry
// `composeApp` or `gradlew` freely and pass this test. The list's own comment
// admitted it: determinism.mjs "passed review for weeks because it was not in
// this list."
//
// So it is inverted. Every .mjs under packages/harness/src is now required to
// be stack-free, except the files named below, each with the reason it is not
// yet. A new core file is covered the day it is written, by default, with
// nobody remembering to add it — which is the only kind of rule that survives.
//
// The exception list is checked for EXACTNESS in both directions: a file that
// no longer carries a stack fact must be REMOVED from it, or this test fails.
// An allowlist rots silently; a denylist that cannot hold a stale entry
// shrinks or breaks. That difference is the whole point of the inversion.
const STACK_FACTS = ["composeApp", "androidInstrumentedTest", "desktopTest", "commonTest", "qa/e2e", "steps-cmp", "gradlew", "kspCaches"];

/**
 * THE GRAMMAR HALF. Eight literal words could not see `.kt`, `Kotlin`,
 * `@Composable`, `@Test`, `fun `, or `libs.versions.toml` — every core hit the
 * 2026-09-08 language audit found had walked past them (NORTH-STAR §10 Q4: "a
 * stack assumption that names no stack cannot be found by reading"). PATTERN:
 * the vocabulary is DERIVED — file extensions from GitHub Linguist's table
 * (packages/harness/install/linguist-languages.json, with provenance), the way ArchUnit and
 * dependency-cruiser enforce "this layer may not name that one" from a rule
 * rather than a list. WHY IT WORKS: an extension nobody here typed cannot be
 * forgotten here. HOW IT FAILS: false positives — `.go(` is a method call,
 * `.d` and `.m` are one letter, `Java` appears in "JavaScript" — and a lint
 * that cries wolf gets excused wholesale. WHAT WE DO: single-letter extensions
 * are dropped, the harness's own language (JavaScript/TypeScript family) is
 * excluded because the core IS JavaScript, an extension must be followed by
 * something that is not an identifier or a call paren, and names are matched
 * whole-word; a dot-directory like `.kotlin` must not follow an identifier, or
 * `inv.kotlin` — a property access — reads as a build directory. Every hit is
 * either fixed or excused with a named exit.
 */
const LINGUIST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "packages", "harness", "install", "linguist-languages.json"), "utf8"));
const OWN_LANGUAGES = new Set(["JavaScript", "TypeScript", "JSON", "JSON5", "Shell", "Dockerfile", "Makefile", "HTML", "CSS", "SVG"]);
const EXTENSIONS = [...new Set(Object.entries(LINGUIST.languages).filter(([name]) => !OWN_LANGUAGES.has(name)).flatMap(([, exts]) => exts))]
  .filter((e) => e.length > 2 && !/^\.(mjs|cjs|jsx?|tsx?|mts|cts|json|md|yml|yaml|xml|html|css|svg|sh|txt|toml)$/.test(e))
  .map((e) => e.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const AMBIGUOUS = new Set(["com", "net", "org", "io", "spec", "feature", "cmd", "ms", "ch", "cls", "trigger", "gov", "inc", "e", "t", "d", "m", "r", "s", "n", "b", "f", "p"]);
const STACK_SHAPES = [
  // FILENAME CONTEXT, not any dot: preceded by a word character or a glob star,
  // followed by a delimiter — never `-` (a CSS selector), `.` (a chained
  // extension like .spec.md), `(` (a method call) or a word. And a short list of
  // extensions that are also ordinary tokens, each with its reason: .com/.net/
  // .org are TLDs in URLs; .spec and .feature are this harness's own file
  // conventions (specs/*.spec.md, docs/features); .cmd/.ms/.cls/.trigger/.gov
  // are words the shell and console print. Named here, not silently dropped.
  [new RegExp(`(?<=[\\w*\\]])\\.(?:${EXTENSIONS.filter((e) => !AMBIGUOUS.has(e)).join("|")})(?=["'\\x60\\s/)\\]},;:]|$)`), "a source-file extension (Linguist-derived)"],
  [/\b(?:Kotlin|Swift|Java|Python|Golang|Rust|Ruby|Dart|Scala|Groovy|Compose|Gradle|Maven|Xcode|CocoaPods|Maestro|JUnit|pytest|Jest|KSP|Detekt|Konsist)\b/, "a language, framework or tool name"],
  [/@Test\b|@Composable\b|\bfun\s+[`\w]|\bdef\s+test|\bfunc\s+Test|#\[test\]|\bsuspend\s+fun\b/, "a syntax token of one language"],
  [/\b(?:build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|libs\.versions\.toml|gradlew|Cargo\.toml|go\.mod|pyproject\.toml|Package\.swift|Podfile|pom\.xml)\b|(?<![\w)\]])\.(?:gradle|kotlin)\b/, "a build-tool file or directory"],
];

/**
 * Core modules that still name a stack, and why. Each entry is a debt with a
 * named exit, not a permanent exemption.
 */
const STACK_COUPLED = new Map([
  // The four `cmp` profile TOOLS, which the installer already withholds from a
  // foreign repo. That used to be a second hand-written list in another
  // package; since 2026-09-08 both sides read ONE declaration — `tools` in
  // profiles/cmp/declarations.mjs — and the test below pins that these four
  // entries and the derived set stay the same four. They are the cmp profile's
  // tools living at the wrong path. Exit: they move into lib/profiles/cmp/,
  // and both the declaration and these entries are deleted together.
  ["preview-gallery.mjs", "a cmp profile tool (PROFILE_TOOLS); not vendored into a foreign repo"],
  ["refusal-demo.mjs", "a cmp profile tool (PROFILE_TOOLS); not vendored into a foreign repo"],
  ["scaffold-feature.mjs", "a cmp profile tool (PROFILE_TOOLS); the Kotlin stamper"],
  ["walkthrough.mjs", "a cmp profile tool (PROFILE_TOOLS); drives the Compose inspector"],

  // Three core library modules. Ranked honestly by what they actually cost,
  // which is less than it first appears — the first draft of this comment
  // claimed step-cache.mjs writes a spurious composeApp/ directory into any
  // foreign tree, and that is FALSE: `memoizeStep` has exactly one caller,
  // lib/profiles/cmp/steps-cmp.mjs, so off-cmp it never runs. It is a fifth
  // cmp-only module at the wrong path, not a live defect. Exit is the same as
  // the tools above: it moves, or its path becomes a parameter the profile
  // supplies from layout.buildDir.
  ["lib/step-cache.mjs", "cmp-only in practice (sole caller is the cmp pack); STEP_CACHE_REL_PATH hardcodes composeApp/build"],
  // These two DEGRADE rather than lie — arch-doc finds no Kotlin source sets
  // and says so; audit-cadence cannot read composeApp/build.gradle.kts and
  // returns {ok:false, reason}. A graceful refusal is not a wrong verdict, but
  // a step that can only ever refuse on a foreign stack is a vacuous gate, so
  // these stay listed until they read the profile's declared source roots.
  ["lib/arch-doc.mjs", "Kotlin source-set paths hardcoded — degrades to an empty doc off-cmp"],
  ["lib/audit-cadence.mjs", "derives the app package from composeApp/build.gradle.kts — refuses off-cmp"],
]);

/** Stack facts in a module's CODE, comments stripped — the literal words and the grammar-shaped ones. */
function stackFactsIn(abs) {
  const code = fs.readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const literal = STACK_FACTS.filter((f) => code.includes(f));
  const shaped = STACK_SHAPES.flatMap(([re, what]) => {
    const m = code.match(re);
    return m ? [`${JSON.stringify(m[0])} — ${what}`] : [];
  });
  return [...literal, ...shaped];
}

/** Every core module the rule applies to — a profile is exempt by definition. */
function coreModules() {
  return mjsUnder(CORE)
    .filter((abs) => !abs.startsWith(PROFILES + path.sep))
    .map((abs) => path.relative(CORE, abs).split(path.sep).join("/"));
}

test("no core module names a Compose path, tier or pack unless it is a listed exception", () => {
  const offenders = [];
  for (const rel of coreModules()) {
    if (STACK_COUPLED.has(rel)) continue;
    const hits = stackFactsIn(path.join(CORE, rel));
    if (hits.length) offenders.push(`${rel}: ${hits.join(", ")}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `stack facts in core code — move them into the profile, or add the file to STACK_COUPLED with the reason and its exit:\n  ${offenders.join("\n  ")}`,
  );
});

test("the exception list is EXACT — a file that is now clean must be removed from it", () => {
  // The property the old allowlist could not have. A stale exception is a lie
  // about the state of the codebase that costs nothing to keep, so it must
  // cost a red test instead.
  const stale = [];
  const missing = [];
  for (const [rel, why] of STACK_COUPLED) {
    const abs = path.join(CORE, rel);
    if (!fs.existsSync(abs)) {
      missing.push(`${rel} (listed, but no such file — ${why})`);
      continue;
    }
    if (stackFactsIn(abs).length === 0) stale.push(`${rel} — ${why}`);
  }
  assert.deepEqual(missing, [], `STACK_COUPLED names files that do not exist:\n  ${missing.join("\n  ")}`);
  assert.deepEqual(
    stale,
    [],
    `these are stack-free now — DELETE them from STACK_COUPLED so the list keeps shrinking:\n  ${stale.join("\n  ")}`,
  );
});

test("the excused TOOLS and the withheld ones are one fact, not two lists", async () => {
  // THE DRIFT THIS CLOSES. Two hand-maintained lists described the same four
  // files — this one, excusing them from the lint, and PROFILE_TOOLS in the
  // installer, withholding them from a foreign repo — each naming the other in
  // a comment. Add a fifth tool and exactly one gets updated; the silent half
  // is the installer, which hands an adopter a module that names a stack they
  // are not. Neither list is authoritative now: the profile declares `tools`
  // and install/portability.mjs derives the set, and this asserts the lint's
  // excuses have not drifted from what the installer actually withholds.
  const { loadShippedDeclarations, notPortable, undeclaredProfileTools } = await import(
    "../packages/harness/install/portability.mjs"
  );
  const declarations = await loadShippedDeclarations(CORE);
  const derived = notPortable(CORE, declarations);

  const excusedTools = [...STACK_COUPLED.keys()].filter((rel) => !rel.includes("/")).sort();
  assert.deepEqual(
    derived.tools,
    excusedTools,
    "every top-level tool excused from the lint must be one the installer withholds, and vice versa",
  );

  // The check that keeps the declaration honest: a tool whose own imports reach
  // a profile and that no profile declares would be vendored into a repo that
  // cannot load it.
  assert.deepEqual(
    await Promise.resolve(undeclaredProfileTools(CORE, declarations)),
    [],
    "a tool imports a profile but no profile declares it — add it to that profile's `tools`",
  );

  // And the library half, which is derived from imports alone: a11y.mjs cannot
  // load without profiles/cmp/tree.mjs, so a foreign repo is not given it.
  assert.deepEqual(derived.lib, ["a11y.mjs"]);
});

test("the rule covers every core module, so a NEW file is stack-free by default", () => {
  // The inversion, asserted directly: coverage is derived from the tree, not
  // from a list someone maintains. A file created tomorrow is subject to the
  // rule tomorrow.
  const all = coreModules();
  assert.ok(all.length >= 30, `expected the whole core to be scanned, saw ${all.length} modules`);
  const excused = [...STACK_COUPLED.keys()];
  assert.ok(
    excused.every((rel) => all.includes(rel)),
    "every excused file must be one the scan actually reaches, or the exception is meaningless",
  );
  assert.ok(excused.length <= 7, `the exception list must shrink, never grow — it holds ${excused.length}`);
});

// Three files under src/ still reach into the profile: a11y.mjs (through
// tree.mjs), component-stories.mjs, and scaffold-feature.mjs — the Kotlin
// stamper, which is the cmp profile's tool and imports its exemplar shape.
// They move into profiles/cmp/ in Stage 0 PR 6; this list is deleted in that
// PR, and the lint then holds for every core file.
const NOT_YET_MOVED = ["lib/a11y.mjs", "lib/component-stories.mjs", "scaffold-feature.mjs"];

test("the cmp profile declares layout and tiers, and the core reads them only through the loader", () => {
  const entry = fs.readFileSync(path.join(PROFILES, "cmp", "index.mjs"), "utf8");
  assert.match(entry, /export \{ layout, tiers, grammar, reports, detect, tools \} from "\.\/declarations\.mjs"/);
  for (const abs of mjsUnder(CORE)) {
    if (abs.startsWith(PROFILES + path.sep)) continue;
    if (NOT_YET_MOVED.includes(path.relative(CORE, abs).split(path.sep).join("/"))) continue;
    const bad = importsOf(fs.readFileSync(abs, "utf8")).filter((s) => /profiles\/cmp\//.test(s));
    assert.deepEqual(bad, [], `${path.relative(REPO_ROOT, abs)} imports the cmp profile directly: ${bad.join(", ")}`);
  }
});
