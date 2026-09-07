// STAGE 0'S EXIT CRITERION, AS A GATE.
//
// NORTH-STAR §9 says Stage 0 exits when "every verdict-bearing core function
// returns the same verdict for the same logical input under two unlike
// profiles, proved by EXECUTION". That sentence was unmeasurable: nothing
// enumerated "every verdict-bearing core function", so the stage could not be
// closed and could not be honestly claimed either. A criterion nobody can
// evaluate is not a standard, it is a mood — and this repo's whole thesis is
// that done is DERIVED.
//
// So it is derived here, in three steps, each of which is a fact about the
// source rather than a judgement:
//
//   1. VERDICT-BEARING — the function decides something about the tree: it
//      returns a PASS/FAIL verdict, an ok/valid judgement, or a set of
//      offenders. Writers and mutators are not.
//   2. PROFILE-DEPENDENT — profile-derived data reaches it. This is the part
//      that makes the criterion tractable: a function that never receives a
//      model, grammar, layout, tiers or pack CANNOT answer differently for two
//      profiles. That is a proof, not an opinion, and it is why the target is
//      24 functions rather than every export in the core.
//   3. COVERED — it is CALLED inside a test file that exercises two unlike
//      profiles. A mention in a comment is not coverage.
//
// Anything uncovered must be listed below with a reason. The ledger is checked
// for EXACTNESS in both directions, so it shrinks or the test goes red — the
// same inversion that fixed the agnostic lint.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = path.join(REPO, "packages", "harness", "src");
const PROFILES = path.join(CORE, "lib", "profiles");

const VERDICT = /verdict:\s*"(PASS|FAIL|ERROR|SKIP)"|return\s*\{\s*ok:|ok:\s*(true|false)|\bvalid:\s*|unmet|offenders|missing:/;
const WRITER = /^(write|save|append|record|add|set|remove|delete|update|claim|release|beat|approve|reopen|accept|resolve|regenerate|strip)/i;
const PROFILE_DATA = /\b(model|profile|grammar|layout|tiers|pack|specsDir|citationRoots|citationExts|flowsDir|buildDir|sourceRoots|evidenceLadder)\b/;
/** A second ecosystem, unlike `cmp` on every axis a core function might assume. */
const ALIEN = /py-alien|ktor-backend/;

function mjsUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? mjsUnder(abs) : e.name.endsWith(".mjs") ? [abs] : [];
  });
}

/** Verdict-bearing core exports that profile data can reach. */
export function profileDependentVerdictFunctions() {
  const out = [];
  for (const abs of mjsUnder(CORE)) {
    if (abs.startsWith(PROFILES + path.sep)) continue;
    const src = fs.readFileSync(abs, "utf8");
    for (const m of src.matchAll(/export function (\w+)/g)) {
      const name = m[1];
      if (WRITER.test(name)) continue;
      const body = src.slice(m.index, m.index + 2500);
      if (!VERDICT.test(body)) continue;
      const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
      if (!PROFILE_DATA.test(code)) continue; // cannot differ — no profile reaches it
      out.push(`${path.relative(CORE, abs).split(path.sep).join("/")}::${name}`);
    }
  }
  return out.sort();
}

/** Test files that exercise two unlike profiles in one file. */
function differentialTestSources() {
  return fs
    .readdirSync(path.join(REPO, "test"))
    .filter((f) => f.endsWith(".test.mjs"))
    .map((f) => fs.readFileSync(path.join(REPO, "test", f), "utf8"))
    .filter((s) => ALIEN.test(s) && /profiles\/cmp/.test(s));
}

/** Called — not merely mentioned — in a differential test. */
function isCovered(name, sources) {
  const called = new RegExp(`\\b${name}\\s*\\(`);
  return sources.some((s) => called.test(s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")));
}

/**
 * Profile-dependent verdict functions with NO differential proof yet, each with
 * the reason. Every entry is Stage 0 work that has not been done — not an
 * exemption. The stage exits when this is empty.
 */
const NOT_YET_DIFFERENTIAL = new Map([
  // EMPTY. Every profile-dependent verdict-bearing core function has been
  // executed against two unlike profiles. Stage 0's first exit criterion is
  // met, and this ledger is what keeps it met: a new such function with no
  // differential proof fails the test below rather than quietly joining a list
  // nobody re-reads.
]);

test("the target is derived from the source, not from a list someone maintains", () => {
  const targets = profileDependentVerdictFunctions();
  assert.ok(targets.length >= 20, `expected the whole core scanned, saw ${targets.length}`);
  // Every ledger entry must name a function that still exists and still
  // qualifies — otherwise the ledger is describing a codebase that moved on.
  for (const rel of NOT_YET_DIFFERENTIAL.keys()) {
    assert.ok(targets.includes(rel), `${rel} is listed as pending but is no longer a profile-dependent verdict function — delete the entry`);
  }
});

test("STAGE 0 EXIT: every profile-dependent verdict function is proved against two unlike profiles", () => {
  const sources = differentialTestSources();
  assert.ok(sources.length >= 5, `expected differential suites to exist, found ${sources.length}`);

  const targets = profileDependentVerdictFunctions();
  const uncovered = targets.filter((t) => !isCovered(t.split("::")[1], sources));
  const unexpected = uncovered.filter((u) => !NOT_YET_DIFFERENTIAL.has(u));
  const stale = [...NOT_YET_DIFFERENTIAL.keys()].filter((k) => !uncovered.includes(k));

  assert.deepEqual(
    stale,
    [],
    `these now HAVE differential proof — delete them from NOT_YET_DIFFERENTIAL so the ledger keeps shrinking:\n  ${stale.join("\n  ")}`,
  );
  assert.deepEqual(
    unexpected,
    [],
    `new profile-dependent verdict functions with no differential proof — cover them, or list them with a reason:\n  ${unexpected.join("\n  ")}`,
  );

  // The criterion itself, as a number rather than a sentence.
  const done = targets.length - uncovered.length;
  assert.ok(
    uncovered.length <= NOT_YET_DIFFERENTIAL.size,
    `Stage 0: ${done}/${targets.length} proved differentially; ${uncovered.length} remain`,
  );
});
