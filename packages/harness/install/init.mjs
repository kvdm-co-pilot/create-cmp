// `prooflane init` (and `create-cmp harness init`, which delegates here) — the
// entrance for a repo of ANY stack.
//
// WHY THIS EXISTS. Until now the only documented way for a non-Compose repo to
// declare its stack was a closed loop, and it was measured: the absent-manifest
// refusal named `create-cmp attach`, which refuses any repo without a Compose
// or KMP plugin signal (attach.mjs COMPOSE_SIGNALS) and — by its own header —
// does not write a lane even for the repos it accepts. A Ktor backend adopting
// the harness on 2026-09-04 hit that wall and could only get past it by reading
// the engine's source. Everything else in that adoption report was a paper cut
// next to it. This command is the exit.
//
// WHAT IT WRITES, and why all of it in one command. The report's assumption log
// is the specification: eleven guesses, six of them answerable ONLY from core
// source. A command that wrote just the manifest would leave every one of them
// standing. So init writes the whole entrance:
//
//   the spine        vendored from the harness package — the adopter should not
//                    have to work out WHICH of 28 files to copy (their
//                    assumptions 8 and 9 were exactly that question)
//   the manifest     qa/harness-manifest.json — what the lane refuses without
//   the profile      a skeleton with all five required exports REAL, not stubbed,
//                    and the optional four present and commented with their true
//                    field names
//   the surface      qa/verified-surface.json seeded from the tree's own top
//                    level, so the receipt attests this repo and not a Compose
//                    app's directory names
//   the lock         qa/harness.lock.json, without which harnessIntegrity can
//                    only ever SKIP
//
// then runs qa/framework-check.mjs and prints the verdict — because a lane you
// have not seen refuse is a lane you have not seen (GATE-RULES Rule 0).
//
// THE SKELETON IS THE SPEC (PACKAGE-SPLIT D2). Prose drifts
// from the loader silently; a generated skeleton is checked by the code that
// generates it and by the test that runs its lane. That is why the profile this
// writes is a WORKING one — two real steps that prove something on any stack —
// rather than a set of `throw new Error("TODO")` stubs. An adopter's first lane
// run is green, and every later step is an addition rather than a repair.
//
// NEVER CLOBBERS. An existing file keeps its bytes and is reported as kept. The
// command is safe to re-run; that is how an adopter recovers from a half-done
// attempt without reading this file.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LINGUIST = JSON.parse(fs.readFileSync(new URL("./linguist-languages.json", import.meta.url), "utf8"));
/** Extension → Linguist language name; the first language claiming an extension keeps it. */
const EXT_TO_LANGUAGE = new Map();
for (const [name, exts] of Object.entries(LINGUIST.languages)) for (const e of exts) if (!EXT_TO_LANGUAGE.has(e)) EXT_TO_LANGUAGE.set(e, name);

import { colors, ok, warn, fail } from "./log.mjs";
import { contractAt } from "../src/lib/profile-contract.mjs";
import { askLadderMenu } from "./interview.mjs";
import { loadShippedDeclarations, notPortable } from "./portability.mjs";
import {
  MANIFEST_REL_PATH,
  MANIFEST_SCHEMA,
  PROFILE_ID_RE,
} from "../src/lib/harness-manifest.mjs";
import { PROFILE_PROTOCOL, profileEntryRel } from "../src/lib/profile-loader.mjs";
import { LOCK_PATH } from "../src/lib/harness-lock.mjs";
import { SURFACE_CONFIG_REL } from "../src/lib/inputs-hash.mjs";
import { SOURCE_PATH, resolvedSourceKind } from "../src/lib/harness-source.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The harness package source — the single source of truth for the vendored bytes. */
export const HARNESS_SRC = path.resolve(HERE, "..", "src");

/**
 * Which lane files a foreign repo must NOT be given — DERIVED, never listed
 * here (install/portability.mjs carries the argument). Two signals: a file
 * whose imports reach a profile cannot load without it, and a file the profile
 * itself declares as its own tool would lie to a stack it is not.
 *
 * Until 2026-09-08 this was two frozen arrays, and their twin lived in
 * test/agnostic-lint.test.mjs naming this file in a comment — one fact written
 * down twice, by hand, in two packages.
 *
 * Awaited once at module scope: the answer depends only on what the package
 * ships, so it is the same for every init in the process.
 */
const PORTABILITY = notPortable(HARNESS_SRC, await loadShippedDeclarations(HARNESS_SRC));

/** `qa/*.mjs` tools that belong to a profile, not the spine. */
export const PROFILE_TOOLS = Object.freeze(PORTABILITY.tools);

/** `qa/lib/*.mjs` modules that cannot load without their profile. */
export const PROFILE_LIB = Object.freeze(PORTABILITY.lib);

/** Why each is withheld — for the refusal that has to explain itself. */
export const PORTABILITY_REASONS = PORTABILITY.why;

/**
 * HOW THE USER GOT HERE, so the commands printed back are ones they can run.
 *
 * The same implementation now has two front doors — `prooflane init` (the
 * harness's own bin, which is the whole point of Stage 1) and `create-cmp
 * harness init` (the scaffolder, which delegates here so there is one
 * behaviour rather than two). Printing "create-cmp harness relock" to someone
 * who installed only the harness would send them back to the very package
 * Stage 1 says they must not need; printing "prooflane relock" to a create-cmp
 * user names a binary they may not have. So the caller says which it is, and
 * the default is the harness's own — a library used without being told assumes
 * the adopter, not the scaffolder.
 */
const FRONT_DOORS = Object.freeze({
  prooflane: Object.freeze({
    init: "prooflane init",
    relock: "prooflane relock",
    // `prooflane upgrade` SHIPS (bin dispatches it; install/upgrade.mjs runs
    // it). The comment that used to sit here said it did not exist yet, and
    // both halves of that were costly: `upgrade.mjs` prints `cmd.upgrade` in
    // its own header, so with no key here the command announced itself as
    // "undefined — re-vendor this project's lane"; and `restore` sent an
    // adopter to `git restore qa/` under the words "not shipped yet", which
    // is the wrong operation AND untrue. Naming a command an adopter cannot
    // run is the lie this vocabulary exists to prevent — withholding one they
    // CAN run is the same lie wearing the other face. Found 2026-09-09 by two
    // independent adoptions (fuelled-api, pantry-api), both of which hit this
    // as the first thing the product said to them.
    upgrade: "prooflane upgrade",
    restore: "prooflane upgrade    re-vendors the spine from the installed harness",
  }),
  "create-cmp": Object.freeze({
    init: "create-cmp harness init",
    relock: "create-cmp harness relock",
    // Same hole as the prooflane entry above, same consequence: the JSDoc
    // below promises `upgrade` and `upgrade.mjs` prints it.
    upgrade: "create-cmp upgrade --harness",
    restore: "create-cmp upgrade --harness  (merges rather than overwrites)",
  }),
});

/** @param {string|undefined} name @returns {{init: string, relock: string, upgrade: string}} */
export function frontDoor(name) {
  return FRONT_DOORS[name ?? "prooflane"] ?? FRONT_DOORS.prooflane;
}

/** Directories that are never a project's source root. */
const NOT_SOURCE = new Set([
  "qa", "docs", "specs", "node_modules", "build", "dist", "out", "target",
  "gradle", ".git", ".github", ".idea", ".vscode", ".gradle", "qa-artifacts",
]);


/**
 * What a test declaration looks like, per language — seeded into the generated
 * profile so a citation BINDS on the first run.
 *
 * This is the fix for the worst defect the first cold adoption found. A `SPEC:`
 * citation counts only when a test declaration follows it within a few lines,
 * and that pattern lived in the spine matching Kotlin and JavaScript alone. A
 * Python project therefore found every marker, bound none, and read "declared
 * but never cited" — a message about the spec file, which was not the problem.
 * Seeding the pattern here makes it one visible, editable line in the adopter's
 * own profile, which is the same principle `citationRoots` already follows: a
 * wrong guess should be one line you can see, never a default you must
 * reverse-engineer.
 *
 * Keys are file extensions found in the tree. `marker` is the comment form the
 * language uses, so the printed next-steps do not tell a Python project to
 * write `//`.
 */
/**
 * DETECTION IS DERIVED; ONLY THE GRAMMAR SEEDS ARE OURS. PATTERN: GitHub
 * Linguist's languages.yml (install/linguist-languages.json, with provenance)
 * maps an extension to a language for every tree GitHub classifies; the seed
 * grammars below are keyed by Linguist's language NAME, so an extension nobody
 * here typed cannot be wrong here. Before a profile exists this is the only
 * language knowledge the CLI holds; once one exists, its `detect(root)` claims
 * the tree (buildpack-style) and this table is never consulted.
 * WHY IT WORKS: a maintained table, not a hand-picked ten. HOW IT FAILS: a
 * mixed tree's dominant extension is the wrong language (generated JS in a
 * Python service), or the snapshot ages. WHAT WE DO: count only under the
 * detected source roots, skip what .gitignore skips, PRINT what was counted so
 * the guess is arguable, and carry the snapshot's fetch time and sha256.
 */
export const LANGUAGE_GRAMMARS = Object.freeze({
  "Python": { marker: "#", test: String.raw`^\s*(?:async\s+)?def\s+test\w*\s*\(|^\s*class\s+Test\w*\s*[(:]`, type: String.raw`^\s*class\s+\w+` , testFile: String.raw`(^|/)test_[^/]*\.py$|_test\.py$`},
  "Go": { marker: "//", test: String.raw`^\s*func\s+(?:Test|Benchmark|Example)\w*\s*\(`, type: String.raw`^\s*type\s+\w+\s+(?:struct|interface)\b` , testFile: String.raw`_test\.go$`},
  "Rust": { marker: "//", test: String.raw`^\s*#\[(?:test|tokio::test|rstest)\]|^\s*fn\s+test\w*\s*\(`, type: String.raw`^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\b` , testFile: String.raw`_test\.rs$`},
  "Ruby": { marker: "#", test: String.raw`^\s*(?:def\s+test_\w+|it\s+["']|describe\s+["'])`, type: String.raw`^\s*(?:class|module)\s+\w+` , testFile: String.raw`_(?:spec|test)\.rb$`},
  "TypeScript": { marker: "//", test: String.raw`\b(?:test|it)\s*\(|^\s*@Test\b`, type: String.raw`^\s*(?:export\s+)?(?:abstract\s+)?(?:class|interface)\b` , testFile: String.raw`\.(?:test|spec)\.tsx?$`},
  "JavaScript": { marker: "//", test: String.raw`\b(?:test|it)\s*\(`, type: String.raw`^\s*(?:export\s+)?class\b` , testFile: String.raw`\.(?:test|spec)\.jsx?$`},
  "Kotlin": { marker: "//", test: String.raw`@Test\b|\bfun\s+\x60[^\x60]+\x60\s*\(`, type: String.raw`^(?:@\w+\s+)*(?:public\s+|internal\s+|private\s+|abstract\s+|open\s+|sealed\s+|data\s+|enum\s+)*(?:class|object|interface)\b` , testFile: String.raw`Tests?\.kt$`},
  "Java": { marker: "//", test: String.raw`@Test\b`, type: String.raw`^(?:@\w+\s+)*(?:public\s+|abstract\s+)*(?:class|interface|enum)\b` , testFile: String.raw`Tests?\.java$`},
  "C#": { marker: "//", test: String.raw`\[(?:Test|Fact|Theory)\]`, type: String.raw`^\s*(?:public\s+|internal\s+)?(?:sealed\s+|abstract\s+)?class\b` , testFile: String.raw`Tests?\.cs$`},
  "PHP": { marker: "//", test: String.raw`function\s+test\w*\s*\(|@test\b`, type: String.raw`^\s*(?:abstract\s+|final\s+)?class\b` , testFile: String.raw`Test\.php$`},
});

/**
 * The dominant source language under the given roots, by file count. Returns
 * the extension key, or null when nothing recognisable is there — in which case
 * the profile ships the core's fallback and SAYS it is doing so.
 * @param {string} root
 * @param {string[]} roots
 * @returns {string|null}
 */
export function detectLanguage(root, roots) {
  const counts = new Map();
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else {
        const lang = EXT_TO_LANGUAGE.get(path.extname(e.name));
        if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }
  };
  for (const rel of roots) walk(path.join(root, ...rel.split("/")));
  let best = null;
  for (const [lang, n] of counts) if (!best || n > counts.get(best)) best = lang;
  return best;
}

/** What detectLanguage counted, for the line that makes the guess arguable. */
export function languageCounts(root, roots) {
  const counts = new Map();
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else { const l = EXT_TO_LANGUAGE.get(path.extname(e.name)); if (l) counts.set(l, (counts.get(l) ?? 0) + 1); }
    }
  };
  for (const rel of roots) walk(path.join(root, ...rel.split("/")));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Ask every profile the harness SHIPS whether the tree is ITS — buildpack-style
 * `detect`. The set is derived from the profiles directory, never a list here:
 * an installer that named `cmp` would be the coupling Stage 0 removed, one
 * layer up, and it would be wrong the day a second profile ships. A registry of
 * profiles beyond the package is Stage 2's.
 *
 * Evidence is returned, never a bare boolean, so the claim can be argued with
 * and two claims can be refused rather than resolved by list order.
 * @param {string} root
 * @returns {Promise<{id: string, evidence: string[], reason: string}[]>}
 */
export async function profileClaims(root) {
  const claims = [];
  for (const [id, mod] of await loadShippedDeclarations(HARNESS_SRC)) {
    if (typeof mod.detect !== "function") continue;
    try {
      const r = mod.detect(root, fs);
      if (r && r.claims) claims.push({ id, evidence: r.evidence ?? [], reason: r.reason ?? "" });
    } catch {
      /* a detector that throws claims nothing */
    }
  }
  return claims;
}

/**
 * A profile id from a directory name: lowercase, dashes, must start with a
 * letter. The id becomes a directory name and is validated by the manifest
 * reader, so an unusable one is caught here rather than at first lane run.
 * @param {string} name
 * @returns {string|null} a valid id, or null when nothing usable can be derived
 */
export function slugProfileId(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "");
  return slug && PROFILE_ID_RE.test(slug) ? slug : null;
}

/**
 * The project's likely source roots — top-level directories that are not build
 * output, tooling, or the harness itself. Reported and written into the
 * manifest's citationRoots, where the adopter can correct them; a wrong guess
 * is visible in one file rather than buried in a scanner.
 * @param {string} root
 * @returns {string[]}
 */
export function detectSourceRoots(root) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !NOT_SOURCE.has(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Top-level entries this repo would commit — the seed for the verified surface.
 * Seeded from the TREE, never from a stack's directory names: the Compose
 * default in inputs-hash.mjs matching a foreign repo's `qa/` and `specs/` and
 * nothing else is precisely how a receipt comes to attest a fraction of a
 * project while looking complete.
 * @param {string} root
 * @returns {string[]}
 */
export function seedSurface(root) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const skip = new Set(["node_modules", "build", "dist", "out", "target", ".gradle", "qa-artifacts"]);
  const names = entries
    .filter((e) => !e.name.startsWith(".") && !skip.has(e.name))
    .map((e) => e.name);
  // `qa` ALWAYS, even though init is reading the tree before it writes it:
  // the harness declarations (the manifest and this very file) live under qa/,
  // and a surface that does not cover them lets an edit to what the lane
  // attests go unattested — the exact hole harness-region.mjs exists to close.
  if (!names.includes("qa")) names.push("qa");
  return names.sort();
}

/**
 * The files init vendors, as project-relative paths paired with their source in
 * the harness package. Pure, so the vendor set is assertable without writing a
 * tree — the test pins that no profile tool and no profile-coupled lib is in it.
 * @returns {{rel: string, src: string}[]}
 */
export function vendorPlan(srcRoot = HARNESS_SRC) {
  const out = [];
  for (const f of fs.readdirSync(srcRoot).filter((f) => f.endsWith(".mjs")).sort()) {
    if (PROFILE_TOOLS.includes(f)) continue;
    out.push({ rel: `qa/${f}`, src: path.join(srcRoot, f) });
  }
  const libDir = path.join(srcRoot, "lib");
  for (const f of fs.readdirSync(libDir).filter((f) => f.endsWith(".mjs")).sort()) {
    if (PROFILE_LIB.includes(f)) continue;
    out.push({ rel: `qa/lib/${f}`, src: path.join(libDir, f) });
  }
  // The receipt contract ships IN the package (packages/harness/evidence/), not
  // in the repo's template: a registry install has no template to read, and an
  // adopter whose qa/evidence/ has no schema beside its receipts got a quieter
  // lane than every stamped app for exactly that reason until 2026-09-08.
  const schema = path.join(srcRoot, "..", "evidence", "schema.json");
  if (fs.existsSync(schema)) out.push({ rel: "qa/evidence/schema.json", src: schema });
  return out;
}

/**
 * The manifest this project starts from. Flat by contract — the console's
 * reader and the lane's reader must both accept one file.
 * @param {string} id
 * @param {string[]} sourceRoots
 * @returns {object}
 */
export function manifestFor(id, sourceRoots) {
  return {
    schema: MANIFEST_SCHEMA,
    profile: { id },
    receipt: "qa/evidence/latest.json",
    architectureDoc: "docs/ARCHITECTURE.md",
    specs: "specs",
    citationRoots: sourceRoots.length ? sourceRoots : ["src"],
    approvals: "qa/approvals.json",
    packs: [id],
  };
}

/**
 * THE LADDER LEGEND — ONE SET OF WORDS, TWO RENDERINGS.
 *
 * The skeleton writes this declaration COMMENTED OUT when nobody was
 * interviewed and LIVE when somebody was, and the two have to say the same
 * thing about the same fields. So the prose is stored once, in its commented
 * form, and the live form is DERIVED by taking the `// ` off. The alternative
 * is a second copy of fifty lines of prose, which drifts in one of them — and
 * which one a given adopter reads would depend on whether there happened to be
 * a human in front of their install.
 */
const LADDER_LEGEND = `// export const ladder = {
//   // The evidence rungs THIS pack means, and which of ITS steps earn them. A
//   // profile with no ladder earns no rung, which is the honest grade for a
//   // ladder nobody has calibrated — but a rung is also the vocabulary your
//   // evidence gets quoted in, so an uncalibrated ladder is worth ten minutes.
//   //
//   // A rung is DERIVED from steps that actually PASSed. A SKIP never earns
//   // one, a FAILed lane earns none, and \`verify --fast\` earns none either.
//   //
//   //   names            rung id → the word YOUR stack means by it. The letters
//   //                    are the core's shape; the words are yours, and nobody
//   //                    else's stack is graded by them.
//   //   l0Required       step names that must all PASS for the floor rung
//   //   l1Required       and for L1, on top of L0
//   //   l2Execution      step names that prove the artifact ran AS THE PROGRAM
//   //                    — assembled, started the way it really starts, driven
//   //                    through its real entry surface, on this machine. NOT
//   //                    imported. ANY one of them PASSing lifts L1 to L2; a
//   //                    SKIP never does
//   //   l3Execution      the same, for the SHIPPABLE variant rather than the
//   //                    development one. EVERY one must PASS — proven by some
//   //                    and skipped by the rest is not proven. Declare none
//   //                    and this profile tops out at L2, which is honest
//   //
//   // WHERE TO DECLARE IT — there are two places and this is the one to use.
//   // A pack may also return \`evidenceLadder\` from steps() above, and the lane
//   // reads either; but the object steps() returns exists only once a lane has
//   // started, and a reader that must NOT start one — the Stop hook asking
//   // whether a tier that could have run did — can only see this top-level
//   // export. Declare it here and every reader agrees. Declare it in BOTH and
//   // they must be the same ladder: the lane refuses to grade from two
//   // declarations that disagree rather than pick whichever one it can see
//   // (qa/lib/evidence-ladder.mjs carries the argument).`;

/**
 * The rung-label placeholder, which stays a COMMENT in BOTH renderings. Not an
 * oversight: its values are ellipses, so uncommenting it would declare every
 * rung's display name as "…" — a live wrong label, where a commented
 * placeholder is an invitation.
 */
const LADDER_NAMES_HINT = `//   names: { L0: "…", L1: "…", L2: "…", L3: "…" },`;

/** Declare from the bottom up — the rule, and it holds in both renderings. */
const LADDER_DECLARE_RULE = `//   // NAMED, not empty. A rung whose steps you do not name is a rung you have
//   // not claimed, so an empty l0Required grades nothing rather than granting
//   // L0 for free. The two steps below are the two this command actually writes
//   // into your pack, so this block works as it stands and every later step is
//   // an addition.
//   //
//   // DECLARE FROM THE BOTTOM UP. No field here is required and declaring
//   // fewer rungs earns fewer rungs, which is honest — but the rungs are
//   // climbed in order, so naming steps for one while leaving the rung BENEATH
//   // it empty is refused rather than graded: those steps could never lift
//   // anything, and a lane that quietly ignored them would be the one thing
//   // this ladder exists to prevent. Emptying l0Required below while l1Required
//   // still names steps is exactly that, and the lane will say so by name.
//   // Run: node qa/profile.mjs explain ladder.l1Required — it prints the same
//   // sentence the refusal does.`;

/** The two steps this command actually writes into the pack it is seeding. */
const LADDER_SEEDED_STEPS = `//   l0Required: ["harnessIntegrity"],
//   l1Required: ["harnessIntegrity", "specCoverage"],`;

/** The execution rungs, seeded empty: nothing has been written that earns them. */
const LADDER_SEEDED_EXECUTION = `//   l2Execution: [], l3Execution: [],`;

/** A commented block, as it reads inside a live object literal. */
function uncomment(block) {
  return block
    .split("\n")
    .map((l) => l.replace(/^\/\/ /, ""))
    .join("\n");
}

/**
 * The `ladder` declaration this skeleton writes.
 *
 * WITH NO INTENT IT IS BYTE-IDENTICAL to what this command has always written —
 * a fully commented block. That is the honest tree for an install nobody
 * answered: `answers: {}` would carry nothing a reader could act on, and an
 * empty map beside a comment saying a human answered would be worse than
 * nothing. The COMMAND still says it asked and got no answers; the FILE only
 * records what was decided.
 *
 * WITH AN INTENT IT IS LIVE, and the two step fields it names are not a guess:
 * they are the two steps this command has just written into that same pack, and
 * the legend above them already tells the author to name exactly those. No rung
 * can be minted from them in any case until the author declares `plants` —
 * qa/lib/plant-calibration.mjs refuses to grade a profile whose plants cannot be
 * planted, and this skeleton seeds `plants` commented out — so an interviewed
 * install and an uninterviewed one grade identically: at nothing.
 *
 * @param {Record<string,string>|null|undefined} answers bare field name → the
 *   option string that field offers, verbatim. install/interview.mjs is the only
 *   thing that produces one, and it produces only the contract's own strings.
 * @returns {string}
 */
function ladderBlock(answers) {
  const picked = Object.entries(answers ?? {});
  if (!picked.length) {
    return [LADDER_LEGEND, LADDER_NAMES_HINT, LADDER_DECLARE_RULE, LADDER_SEEDED_STEPS, LADDER_SEEDED_EXECUTION, "// };"].join("\n");
  }
  // ANSWERED, SO THE BLOCK GOES LIVE. Nothing records WHAT was answered — that
  // would be a second claim beside the steps, verified by nothing. The answer is
  // spent here instead: a human confirmed this project has rungs worth naming,
  // so the two steps this command really wrote are declared rather than left
  // commented for someone to find.
  return [
    uncomment(LADDER_LEGEND),
    `  // ${uncomment(LADDER_NAMES_HINT).trim()}`,
    uncomment(LADDER_DECLARE_RULE),
    "  // THIS BLOCK IS LIVE because you answered the questions this command asked.",
    "  // The two fields below are not a guess about your project: they are the two",
    "  // steps it just wrote into this pack, which is what the legend above tells",
    "  // you to name. They still earn nothing until you declare plants at the",
    "  // bottom of this file — no plants, no rung, however green the lane — so",
    "  // this pack grades exactly as an uninterviewed one does. Nothing was",
    "  // decided on your behalf.",
    uncomment(LADDER_SEEDED_STEPS),
    "",
    ...executionHint(picked),
    "};",
  ].join("\n");
}

/**
 * The reminder left where the execution rungs would be declared, phrased from
 * what the author just said — and omitted entirely for a rung they said this
 * project does not have, because a TODO for a rung nobody wants is noise.
 */
function executionHint(picked) {
  const wanted = picked.filter(([field, answer]) => answer !== contractAt(`ladder.${field}`)?.declinesRung);
  if (!wanted.length) {
    return [
      "  // You answered that this project has no rung above L1 — nothing starts it",
      "  // as a program that a lane could drive. No execution field is seeded, and",
      "  // that is the honest ladder for it. Change your mind by naming steps here.",
    ];
  }
  return [
    "  // The execution rungs stay unnamed until the steps exist. You said this",
    "  // project has them, so name them here when you write them:",
    `  // ${wanted.map(([f]) => `${f}: []`).join(", ")},`,
  ];
}

/**
 * The generated profile — a WORKING one, not stubs.
 *
 * Two steps, chosen because they are the only two that prove something on a
 * stack nobody has seen: `harnessIntegrity` (this lane is the one that was
 * locked) and `specCoverage` (every promise is cited from a test that can
 * observe it). Both are the core's mechanics; the SENTENCES are here, because
 * the core hands over data and not language — the adoption report's own finding
 * about `clauseTierCoverage`.
 *
 * The four optional exports are present as commented blocks carrying their real
 * field names, since every one of them was an undocumented guess in that report.
 *
 * @param {string} id
 * @param {{sourceRoots: string[], tiers: string[], answers?: Record<string,string>}} opts
 * @returns {string}
 */
export function profileSkeleton(id, { sourceRoots, tiers, lang = null, invocation = undefined, answers = undefined }) {
  const roots = JSON.stringify(sourceRoots.length ? sourceRoots : ["src"]);
  const g = lang ? LANGUAGE_GRAMMARS[lang] ?? null : null;
  const exts = lang && LINGUIST.languages[lang] ? JSON.stringify(LINGUIST.languages[lang]) : '[".<your source extension>"]';
  const grammarBlock = g
    ? `\n/**\n * THE GRAMMAR — what a citation and a test declaration look like HERE.\n *\n * A \`SPEC:\` citation counts only when a test declaration follows it within\n * \`bindingWindow\` non-blank lines. That rule decides whether ANY promise is\n * proved, and the pattern is language-specific, so it is yours rather than the\n * harness's. Seeded from the ${lang} sources found in this tree — correct it if\n * your tests look different, and the lane will say so if nothing binds.\n */\nexport const grammar = {\n  citationMarker: /^${g.marker === "#" ? "#" : "\\/\\/"}\\s*SPEC:/,   // this language's comment, before SPEC:\n  lineComment: /^${g.marker === "#" ? "#" : "(?:\\/\\/|\\*)"}/,\n  blockComment: ${g.marker === "#" ? "null" : '{ open: "/*", close: "*/" }'},\n  testDeclaration: /${g.test}/,\n  typeDeclaration: /${g.type}/,\n  bindingWindow: 5,\n};\n`
    : `\n// No recognised source language was found. \`grammar\` is REQUIRED — the core has no\n// fallback since 2026-09-08 — so the lane will refuse until you fill this in. What a\n// citation and a test declaration look like in THIS language:\nexport const grammar = {\n  citationMarker: /^\\/\\/\\s*SPEC:/,   // the comment syntax your language uses before SPEC:\n  lineComment: /^\\/\\//,\n  blockComment: null,\n  testDeclaration: null,   // REQUIRED — what a test declaration looks like; the lane refuses until this is a pattern\n  bindingWindow: 5,\n};\n`;
  const tierNames = JSON.stringify(tiers);
  const hostTier = tiers[0];
  // The extension a planted test file needs, in the language THIS tree is
  // written in. It read `${hostTier === "unit" ? "kt" : "kt"}` — a ternary whose
  // two branches are the same JVM extension — so the commented `plants` block
  // told a Python or Go adopter to name their planted test file `.kt`, in the
  // one declaration whose whole job is to supply what the core cannot know. It
  // never bit while `plants` was optional decoration; it decides a RUNG now
  // (qa/lib/plant-calibration.mjs), so a wrong seed here is a wrong grade later.
  // With no recognised language there is no honest guess, and a placeholder that
  // is visibly a placeholder is better than a confident one that is wrong.
  const plantFileSuffix = lang && LINGUIST.languages[lang] ? LINGUIST.languages[lang][0] : ".<your test file extension>";
  // WHERE this language keeps its tests. Distinct from `g.test`, which is what a
  // test DECLARATION looks like inside a file: Go writes `foo_test.go` beside
  // the source and never uses a test directory, so a directory-only rule put
  // every Go citation on a null tier. With no recognised language the pattern
  // matches nothing and the directory rule below carries it alone.
  // A `/` inside the pattern would terminate the regex literal it is embedded
  // in — `(^|/)test_` from the Python convention did exactly that. Escaped here
  // rather than in the table, so the table stays readable as plain patterns.
  const testFilePattern = g && g.testFile ? `/${g.testFile.replace(/\//g, "\\/")}/` : "/(?!)/";
  return `// The "${id}" stack profile — what a stack IS, to this harness.
//
// Written by \`${frontDoor(invocation).init}\`. This file is YOURS: the harness never
// rewrites it. Everything under qa/lib/ except this directory is machine-owned
// and must not be edited — if you find yourself needing to, that is a defect in
// the harness and worth reporting rather than patching locally.
//
// The five exports below are REQUIRED (qa/lib/profile-loader.mjs refuses without
// them, by name). The commented blocks at the bottom are optional; each is
// inert until you uncomment it, and each carries its real field names.

import fs from "node:fs";
import path from "node:path";

import { checkHarnessIntegrity, describeIntegrity } from "../../harness-lock.mjs";
import { requireSpecModel } from "../../spec-model.mjs";
import { scanSpecClauses, scanCitations, clauseTierCoverage, citationScanDiagnostic } from "../../spec-coverage.mjs";

/** Must equal qa/harness-manifest.json's profile.id, or the lane refuses. */
export const id = "${id}";

/** The profile protocol this file implements. The core speaks ${PROFILE_PROTOCOL}. */
export const protocol = ${PROFILE_PROTOCOL};

/**
 * WHERE things live. The spec scanner's model — qa/lib/spec-model.mjs validates
 * this shape and names every problem at once.
 *
 *   specs          directory of *.spec.md, relative to the root
 *   citationRoots  where a \`// SPEC: ID\` citation may be found
 *   citationExts   file extensions the citation scanner reads
 *   flows          journey files ({dir, exts}) — null when this stack has none
 *   sourceRoots    what the watcher watches (defaults to citationRoots)
 *   buildDir       build output, so the lane can ignore it (optional)
 *   ignore         directories skipped when no git/.gitignore can say (optional)
 */
${grammarBlock}
export const layout = {
  specs: "specs",
  citationRoots: ${roots},
  citationExts: ${exts},
  flows: null,
  // Directories the inputs hash and the activity scan skip when there is no git and no
  // .gitignore to ask — build output, caches. The repo's .gitignore is the truth; this is the floor.
  ignore: [],
  sourceRoots: ${roots},
};

/**
 * THE REPORT FORMAT your test runner emits — the core parses what is declared and
 * refuses what is not. JUnit XML is what pytest --junitxml, go-junit-report,
 * cargo2junit, jest-junit and swift test --xunit-output all produce.
 */
export const reports = { format: "junit-xml", dir: "<where your runner writes its XML>" };

/**
 * Does a tree belong to THIS profile? Buildpack-style: name the marker files that
 * identify your stack (a build file AND the module you scaffold, not either).
 * \`harness init\` asks every known profile before seeding a generic one.
 */
export function detect(root, fs) {
  const evidence = [];
  // if (fs.existsSync(\`\${root}/pyproject.toml\`)) evidence.push("pyproject.toml");
  return { claims: false, evidence, reason: "declare the marker files that identify this stack" };
}

/**
 * WHICH TEST TIERS exist, and which can observe which promise. This is what
 * lets the lane refuse a clause proved at a tier that cannot see it.
 *
 *   names       every tier, cheapest first
 *   hostOnly    tiers needing nothing but this machine
 *   satisfying  a clause's declared [tier: X] → the tiers that can observe it
 *   journey     the tier proving a user-visible surface, or null
 *   forFile     a citing file's path → the tier it belongs to
 */
export const tiers = {
  names: ${tierNames},
  hostOnly: ${tierNames},
  satisfying: { ${tiers.map((t) => `${t}: ["${t}"]`).join(", ")} },
  journey: null,
  forFile: (rel) => {
    // A test lives WHERE THIS LANGUAGE PUTS IT. Directory-only was one
    // ecosystem's convention: Go writes foo_test.go beside the source, Rust
    // _test.rs, Ruby _spec.rb, JS foo.test.ts. A cold Go adoption (2026-09-07)
    // put every citation on a null tier, so the first clause declaring
    // [tier: unit] FAILED while a real unit test sat right there citing it.
    if (${testFilePattern}.test(rel)) return "${hostTier}";
    if (/(^|\\/)(test|tests|__tests__)(\\/|$)/.test(rel)) return "${hostTier}";
    return null;
  },
};

/** Is this lane the one that was locked? Pure Node, runs anywhere, seconds. */
function stepHarnessIntegrity(ROOT) {
  const started = Date.now();
  const r = checkHarnessIntegrity(ROOT);
  // Three states, three verdicts. "unlocked" is NOT a failure: nothing is known
  // to be wrong and nothing is proven either, which is a SKIP, not an accusation.
  const verdict = r.status === "intact" ? "PASS" : r.status === "unlocked" ? "SKIP" : "FAIL";
  return {
    name: "harnessIntegrity",
    verdict,
    skipKind: verdict === "SKIP" ? "structure" : undefined,
    reason: verdict === "PASS" ? undefined : describeIntegrity(r),
    durationMs: Date.now() - started,
    layer: "spine",
    harness: r,
  };
}

/**
 * Is every promise cited from a test that can actually observe it?
 *
 * The mechanics are the core's; the sentences are this profile's, because the
 * core hands over data and not language. A clause that declares [tier: X] and
 * is cited only from a tier that cannot see X is the gate that matters most.
 */
function stepSpecCoverage(ROOT) {
  const started = Date.now();
  const model = requireSpecModel(ROOT);
  const specsDir = path.join(ROOT, ...model.specsDir.split("/"));
  if (!fs.existsSync(specsDir)) {
    return {
      name: "specCoverage",
      verdict: "SKIP",
      skipKind: "structure",
      reason: \`no \${model.specsDir}/ directory — this project declares no behaviour yet\`,
      durationMs: Date.now() - started,
      layer: "spine",
    };
  }

  const clauses = scanSpecClauses(ROOT, model);
  const tags = scanCitations(ROOT, model);
  const cited = new Set(tags.map((t) => t.id));
  const orphanClauses = [...clauses.entries()].filter(([, c]) => !c.withdrawn).filter(([cid]) => !cited.has(cid));
  const orphanTags = tags.filter((t) => !clauses.has(t.id) || clauses.get(t.id).withdrawn);
  const { unmetTier } = clauseTierCoverage(clauses, tags, model);

  const problems = [
    ...orphanClauses.map(([cid, c]) => \`\${cid} is declared but never cited from a test (\${c.file})\`),
    ...orphanTags.map((t) => \`\${t.file}:\${t.line} cites \${t.id}, which no spec declares\`),
    ...unmetTier.map((u) => \`\${u.id} declares [tier: \${u.requiredTier}] but is cited only from \${u.tiers.length ? u.tiers.join(", ") : "nowhere"} — only \${(model.tiers.satisfying[u.requiredTier] ?? []).join(" or ")} can observe it (\${u.file})\`),
  ];

  // A scan that saw markers and bound none is NOT "you wrote no citations" —
  // it means this profile's grammar does not match the language. Without this
  // sentence the failure points at the spec file, which is the one place that
  // is not the problem. It cost a real adopter six minutes and a debugger.
  const scanNote = citationScanDiagnostic(tags, model);
  if (scanNote) problems.unshift(scanNote);

  return {
    name: "specCoverage",
    verdict: problems.length ? "FAIL" : "PASS",
    reason: problems.length ? problems.join("\\n  ") : undefined,
    durationMs: Date.now() - started,
    layer: "spine",
    details: { clauses: [...clauses.values()].filter((c) => !c.withdrawn).length, citations: tags.length },
  };
}

/**
 * THE PACK. Called once per lane run with everything the runner can give you.
 *
 * ctx = { ROOT, HERE, fast, determinism, profile, mode, sh, tryGit,
 *         tryGitLines, DEGRADED_PATHS }
 *
 * There is no build-tool helper — wrap \`sh\` yourself when you add a step that
 * compiles or tests, and give it \`fn.layer\` and \`fn.timeoutHint\` so the runner
 * can group it and say where to look when it times out.
 */
export function steps({ ROOT }) {
  // The runner calls these with no arguments, so bind ROOT here. Each returns
  // ONE step row: { name, verdict, durationMs, reason?, skipKind?, layer? }.
  const harnessIntegrity = () => stepHarnessIntegrity(ROOT);
  const specCoverage = () => stepSpecCoverage(ROOT);

  // stepsForProfile holds FUNCTION REFERENCES, not names — the runner calls
  // them directly. STEP_FN_BY_NAME is the name→function lookup that --fast
  // uses to exclude a step by name.
  const all = [harnessIntegrity, specCoverage];
  const STEP_FN_BY_NAME = { harnessIntegrity, specCoverage };

  return {
    id,
    // Which steps run at each entry point. Add your build and test steps to
    // local/ci/nightly/release as you write them; keep smoke pure-Node so
    // Rule 0's instrument stays fast.
    stepsForProfile: { smoke: all, scaffold: all, local: all, ci: all, nightly: all, release: all },
    // Steps needing a resource the host may not have (a device, a container, a
    // network). Their absence is what stops a green lane claiming too much.
    DEVICE_STEPS: [],
    // What \`verify --fast\` leaves out. The inner loop, never the done-gate.
    FAST_EXCLUDED_NAMES: [],
    STEP_FN_BY_NAME,
    // Two runs that must agree. Return null until you have a step whose output
    // could legitimately differ between runs.
    stepDeterminism: () => null,
    // Released when the lane finishes, however it finishes.
    releaseLease: () => {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL exports. Absent is allowed and honest; present-but-wrong is refused.
// ─────────────────────────────────────────────────────────────────────────────
//
// export function artifacts(root) {
//   // What a human signs, in order. Compose it from the core's helpers:
//   // featureBriefArtifacts / featureSpecArtifacts / architectureArtifact.
//   return [];
// }
//
// export function governable(root) {
//   // Refuse to record signatures in a tree that is not a real project.
//   return { ok: true };
// }
//
${ladderBlock(answers)}
//
// export const plants = {
//   // The source Rule 0's instrument plants to prove the gates still bite.
//   // WITHOUT THIS, qa/framework-check.mjs cannot plant the unbound-citation
//   // and tier-unmet cases and says so per plant. No plants, no badge —
//   // literally: the grader asks for these three fields before it will hand
//   // this profile ANY rung, however green the lane (qa/lib/plant-calibration
//   // .mjs; NORTH-STAR §8.9). A ladder without them is a vocabulary for a
//   // claim nobody calibrated, so declare both or expect neither.
//   testFileBasename: "FrameworkCheckPlanted${plantFileSuffix}",
//   unboundCitationSource: (clause) => "…a citation on a type with no test under it…",
//   tierUnmetCitationSource: (clause) => "…a host-tier test citing a clause it cannot observe…",
//   unmeetableTier: "…a tier in \`tiers.satisfying\` a host test cannot satisfy…",
// };
`;
}

/**
 * The full file plan for an init — pure, so every decision is assertable
 * without touching a filesystem.
 *
 * `answers` is what a HUMAN answered at the interview, and it is optional in the
 * strong sense: passing none is not a lesser call, it is the honest plan for an
 * install nobody was present for. What it must never become is a default filled
 * in here (install/interview.mjs's header).
 *
 * @param {string} root
 * @param {{id: string, invocation?: string, answers?: Record<string,string>}} opts
 * @returns {{vendor: {rel: string, src: string}[], write: {rel: string, content: string}[], id: string, sourceRoots: string[]}}
 */
export async function planInit(root, { id, invocation = undefined, answers = undefined }) {
  const sourceRoots = detectSourceRoots(root);
  const tiers = ["unit"];
  const lang = detectLanguage(root, sourceRoots);
  const claimedBy = await profileClaims(root);
  return {
    id,
    sourceRoots,
    lang,
    languageCounts: languageCounts(root, sourceRoots),
    claimedBy,
    vendor: vendorPlan(),
    write: [
      { rel: MANIFEST_REL_PATH, content: JSON.stringify(manifestFor(id, sourceRoots), null, 2) + "\n" },
      { rel: profileEntryRel(id), content: profileSkeleton(id, { sourceRoots, tiers, lang, invocation, answers }) },
      { rel: SURFACE_CONFIG_REL, content: JSON.stringify({ surface: seedSurface(root), ignore: [] }, null, 2) + "\n" },
    ],
  };
}

/**
 * `prooflane init` (and `create-cmp harness init`, which delegates here) —
 * writes the entrance, then proves it.
 * @param {Record<string, string|boolean>} flags
 * @param {string|undefined} positional
 * @param {{invocation?: string}} [opts] which front door the user came through
 * @returns {Promise<number>} exit code
 */
export async function runHarnessInit(flags, positional, opts = {}) {
  const cmd = frontDoor(opts.invocation);
  const targetDir = (typeof flags["target-dir"] === "string" && flags["target-dir"]) || positional || ".";
  const root = path.resolve(targetDir);
  const dryRun = Boolean(flags["dry-run"]);

  process.stdout.write(
    `\n${colors.bold(cmd.init)} — the verify lane, for any stack\n` +
      `  project: ${colors.cyan(root)}\n\n`
  );

  if (!fs.existsSync(root)) {
    fail(`${root} does not exist.`);
    return 2;
  }

  const id = typeof flags.profile === "string" ? flags.profile : slugProfileId(path.basename(root));
  if (!id || !PROFILE_ID_RE.test(id)) {
    fail(
      `could not derive a profile id from "${path.basename(root)}".\n` +
        `  A profile id is lowercase, dash-separated, and starts with a letter.\n` +
        `  Pass one: ${cmd.init} --profile <id>`
    );
    return 2;
  }

  const manifestAbs = path.join(root, MANIFEST_REL_PATH);
  if (fs.existsSync(manifestAbs)) {
    warn(`${MANIFEST_REL_PATH} already exists — this project has already declared its stack.`);
    // NAME THE OTHER COMMAND. This branch used to offer `upgrade --harness`
    // alone, and that was the second wall of a closed loop: an adopter whose
    // lane FAILs harnessIntegrity after editing the profile init told them was
    // theirs re-runs init, is sent to `upgrade --harness`, and that refuses too
    // (it needs the create-cmp.json only a stamp writes). The profile-edit case
    // is the common one and gets named first.
    process.stdout.write(
      `  Nothing was changed.\n\n` +
        `  Edited your profile or a declaration, and the lane now FAILs harnessIntegrity?\n` +
        `    ${colors.cyan(cmd.relock)}     re-takes the lock over the files you own\n` +
        `  Re-vendoring the spine after a harness upgrade?\n` +
        `    ${colors.cyan(cmd.restore)}\n\n`
    );
    return 0;
  }

  // EVERY REFUSAL BEFORE THE FIRST QUESTION. This block used to read
  // `plan.claimedBy` and sit after `planInit`; it runs here now because the
  // interview is between the two, and asking a human two questions and THEN
  // telling them the command was never going to run is the rudest possible
  // ordering. `detect` is a handful of existsSync calls, so asking twice —
  // here, and again inside the pure plan — costs nothing worth a shared
  // variable threaded through a signature other callers depend on.
  const claimedBy = await profileClaims(root);
  if (claimedBy.length > 0 && !flags["new-profile"]) {
    const c = claimedBy;
    fail(
      c.length === 1
        ? `this tree is claimed by the \`${c[0].id}\` profile — ${c[0].reason} (evidence: ${c[0].evidence.join(", ")}).\n` +
            `  It already has a profile; \`harness init\` would seed a second, generic one over it.\n` +
            `  To do that anyway: ${cmd.init} --new-profile`
        : `${c.length} profiles claim this tree (${c.map((x) => x.id).join(", ")}) — refusing to pick one by list order. Pass --profile <id> and --new-profile.`
    );
    return 2;
  }

  // THE LADDER INTERVIEW — asked before a byte is written, because what it
  // records goes INTO the file this command is about to write, and never asked
  // when there is nobody there to answer. The three ways that happens are kept
  // apart rather than collapsed into one boolean: the summary has to say which,
  // and "no terminal" and "you said --no-interview" are different facts about
  // the same empty result.
  const noInterviewReason = flags["no-interview"]
    ? "--no-interview"
    : flags.yes || flags.y
      ? "--yes"
      : dryRun
        ? "--dry-run"
        : !process.stdin.isTTY || !process.stdout.isTTY
          ? "not a terminal"
          : null;
  const interview = await askLadderMenu({
    input: process.stdin,
    output: process.stdout,
    interactive: noInterviewReason === null,
  });

  const plan = await planInit(root, { id, invocation: opts.invocation, answers: interview.answers });
  const written = [];
  const kept = [];

  for (const { rel, src } of plan.vendor) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      kept.push(rel);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.copyFileSync(src, abs);
    }
    written.push(rel);
  }
  for (const { rel, content } of plan.write) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      kept.push(rel);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    written.push(rel);
  }

  // The lock LAST — it hashes the region, so every vendored byte must be in
  // place before it is taken. Written through the vendored copy so the lock
  // records what this project actually has, not what this repo has.
  if (!dryRun && !fs.existsSync(path.join(root, LOCK_PATH))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(HARNESS_SRC, "..", "package.json"), "utf8"));
    // PROVENANCE BEFORE THE LOCK. The record is inside the region, so it has to
    // exist before the region is hashed — otherwise the first `upgrade` reports
    // it as a new file rather than a changed one, and the lock this install
    // takes describes a tree the project does not have (ADR-0008).
    const { writeHarnessSource } = await import(path.join(root, "qa", "lib", "harness-source.mjs"));
    writeHarnessSource(root, { name: pkg.name, version: pkg.version, source: resolvedSourceKind(root, pkg.name) ?? "local" });
    written.push(SOURCE_PATH);

    const { writeHarnessLock } = await import(path.join(root, "qa", "lib", "harness-lock.mjs"));
    writeHarnessLock(root, { version: pkg.version });
    written.push(LOCK_PATH);
  }

  ok(`${written.length} files written${kept.length ? `, ${kept.length} kept (already present)` : ""}`);
  process.stdout.write(
    `\n  ${colors.bold("profile")}  ${id}  →  ${profileEntryRel(id)}\n` +
      `  ${colors.bold("sources")}  ${plan.sourceRoots.length ? plan.sourceRoots.join(", ") : colors.yellow("none detected — edit citationRoots in the manifest")}\n` +
      `  ${colors.bold("language")} ${plan.lang ? `${plan.lang} — grammar seeded so citations bind on the first run` : colors.yellow("not detected — the profile uses the Kotlin/JS fallback grammar; declare your own if citations do not bind")}\n` +
      ladderSummary(interview, noInterviewReason, kept.includes(profileEntryRel(id)) ? profileEntryRel(id) : null) +
      `  ${colors.bold("skipped")}  ${PROFILE_TOOLS.length + PROFILE_LIB.length} Compose-profile tools (not the spine)\n\n`
  );

  if (dryRun) {
    warn("--dry-run: nothing was written.");
    return 0;
  }

  // Rule 0 before anything else: a lane you have not seen refuse is a lane you
  // have not seen. But the instrument PLANTS into the working tree and refuses
  // to do so when there are uncommitted changes — "a plant that dies mid-run
  // must not be able to lose your work" — and init has just written 44 files.
  // Running it here would hand every single adopter a FAIL on their first
  // contact with the product, for a reason that is not their fault and not a
  // defect. So when the tree is dirty we say what to do instead of staging a
  // guaranteed failure.
  const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  const treeIsDirty = dirty.status !== 0 || (dirty.stdout ?? "").trim() !== "";
  if (treeIsDirty) {
    process.stdout.write(
      `${colors.bold("Rule 0")} — prove the lane returns before you trust it.\n\n` +
        `  The instrument plants failures into your tree and reverts them, so it\n` +
        `  refuses to run with uncommitted changes present. Commit what init just\n` +
        `  wrote, then run it:\n\n` +
        `    ${colors.cyan('git add -A && git commit -m "install the verify lane"')}\n` +
        `    ${colors.cyan("node qa/framework-check.mjs")}\n\n` +
        `  It should print PASS in a few seconds, having proved the lane fails by\n` +
        `  name and then recovers. ${colors.bold("Do not skip it")} — an unproven lane is a\n` +
        `  lane whose green means nothing.\n\n`
    );
    printNextSteps(id, plan.lang);
    return 0;
  }

  process.stdout.write(`${colors.bold("Rule 0")} — proving the lane returns, both ways:\n\n`);
  const check = spawnSync(process.execPath, [path.join(root, "qa", "framework-check.mjs")], {
    cwd: root,
    stdio: "inherit",
    timeout: 120_000,
  });

  if (check.status !== 0) {
    process.stdout.write(
      `\n${colors.yellow("The lane is installed but its framework check did not pass.")}\n` +
        `  That is information, not a failure of this command: it names which guard\n` +
        `  could not be planted and why. Read it, then run it again.\n\n`
    );
    return check.status ?? 1;
  }

  printNextSteps(id, plan.lang);
  return 0;
}

/**
 * WHAT THE INTERVIEW RECORDED, OR WHY IT RECORDED NOTHING — and which of the
 * three reasons it was, because they are three different states of the world.
 *
 * The FILE deliberately cannot tell "asked and skipped" from "never asked": an
 * an empty answer map carries nothing a reader could act on, so the skeleton writes
 * none at all. That is the right call for the file and the wrong
 * one for the person standing here, who did answer a prompt and is owed the
 * difference. So the honesty lives at the surface: this says "asked" when a
 * human was asked, and names the flag or the missing terminal when one was not.
 *
 * @param {{asked: boolean, answers: Record<string,string>, why: string}} interview
 * @param {string|null} reason why no interview ran, when none did
 * @param {string|null} keptProfile the profile path that was KEPT rather than
 *   written, when there is one. A tree that already has a profile but no
 *   manifest keeps its own bytes — this command never clobbers — so the answers
 *   have nowhere to go, and printing "recorded" over a file we did not touch
 *   would be the product claiming an act it did not perform.
 * @returns {string}
 */
function ladderSummary(interview, reason, keptProfile) {
  const label = `  ${colors.bold("ladder")}   `;
  const indent = " ".repeat(11);
  const answers = Object.entries(interview.answers ?? {});
  if (answers.length && keptProfile) {
    return (
      `${label}${colors.yellow("answered, but NOT recorded")} — ${keptProfile} already existed and is never overwritten\n` +
      answers.map(([field, answer]) => `${indent}${colors.dim(`${field} = ${JSON.stringify(answer)}`)}`).join("\n") +
      `\n${indent}${colors.dim("that file is never overwritten, so declare its ladder by hand if you want these.")}\n`
    );
  }
  if (answers.length) {
    return (
      answers.map(([field, answer]) => `${label}${field} = ${colors.cyan(JSON.stringify(answer))}`).join("\n") +
      `\n${indent}${colors.dim("the ladder is seeded live because you answered. The steps you name are what earns a rung.")}\n`
    );
  }
  if (interview.asked) {
    // THE INTERVIEW'S OWN SENTENCE, not one written here, because "you skipped
    // every question" and "the input ended before the first one" are different
    // things that both arrive as an empty map — and only the interview knows
    // which happened. Reporting the first when it was the second is a small lie
    // in the one place this feature exists to stop telling them.
    return (
      `${label}${colors.yellow(interview.why)}\n` +
      `${indent}${colors.dim("the seeded ladder stays commented — uncomment it, or re-run in a fresh tree to answer.")}\n`
    );
  }
  return (
    `${label}${colors.yellow(`not asked (${reason ?? "no interview"})`)} — the seeded ladder stays commented, which is the honest state\n` +
    `${indent}${colors.dim("nobody was asked, so nothing was declared on your behalf. Writing the recommended")}\n` +
    `${indent}${colors.dim("answer here would be a guess wearing your answer, so this command does not.")}\n`
  );
}

/**
 * The four things an adopter does next, in the order that works. Shared by both
 * exits so the advice does not depend on whether their tree happened to be clean.
 * @param {string} id
 */
function printNextSteps(id, lang = null) {
  const marker = (lang && LANGUAGE_GRAMMARS[lang]?.marker) || "//";
  process.stdout.write(
    `${colors.bold("Then:")}\n` +
      `  1. Write a promise in ${colors.cyan("specs/")} — a clause line like ${colors.cyan("- **APP-01** the app …")}\n` +
      `  2. Cite it from a test with ${colors.cyan(`${marker} SPEC: APP-01`)} ${colors.bold("directly above a test")}\n` +
      `     — a citation counts only when a test declaration follows within 5 lines\n` +
      `  3. ${colors.cyan("node qa/verify.mjs")} — the lane proves it, and writes a receipt\n` +
      `  4. Add your build and test steps to ${colors.cyan(profileEntryRel(id))}\n\n`
  );
}
