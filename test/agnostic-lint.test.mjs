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
 * Core modules that still name a stack, and why. Each entry is a debt with a
 * named exit, not a permanent exemption.
 */
const STACK_COUPLED = new Map([
  // The four `cmp` profile TOOLS. `harness init` already knows these are not
  // portable — PROFILE_TOOLS in src/commands/harness-init.mjs deliberately
  // omits all four when seeding a foreign repo, so no adopter runs them. They
  // are the cmp profile's tools living at the wrong path. Exit: they move into
  // lib/profiles/cmp/ and these entries are deleted.
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

/** Stack facts in a module's CODE, comments stripped. */
function stackFactsIn(abs) {
  const code = fs.readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  return STACK_FACTS.filter((f) => code.includes(f));
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
  assert.match(entry, /export \{ layout, tiers \} from "\.\/declarations\.mjs"/);
  for (const abs of mjsUnder(CORE)) {
    if (abs.startsWith(PROFILES + path.sep)) continue;
    if (NOT_YET_MOVED.includes(path.relative(CORE, abs).split(path.sep).join("/"))) continue;
    const bad = importsOf(fs.readFileSync(abs, "utf8")).filter((s) => /profiles\/cmp\//.test(s));
    assert.deepEqual(bad, [], `${path.relative(REPO_ROOT, abs)} imports the cmp profile directly: ${bad.join(", ")}`);
  }
});
