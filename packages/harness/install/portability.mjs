// WHICH LANE FILES A FOREIGN REPO MUST NOT BE GIVEN — derived, not listed.
//
// THE DEFECT THIS CLOSES. The set of "cmp profile tools living at the spine's
// path" was written down twice, by hand, in two packages: `PROFILE_TOOLS` in
// the installer decided what a foreign adopter is vendored, and `STACK_COUPLED`
// in test/agnostic-lint.test.mjs excused the same four files from the lint —
// each list naming the other in a comment. Two hand-maintained mirrors of one
// fact is the drift shape this repo hunts everywhere else: add a fifth tool and
// exactly one of them is updated, and the failure is silent in the direction
// that matters (an adopter is handed a module that cannot load).
//
// SO THE SET IS DERIVED, from two signals that already exist and are already
// maintained for their own reasons:
//
//   1. THE IMPORT CLOSURE. A spine file whose static imports reach
//      lib/profiles/ cannot load in a repo that has no such profile — the
//      failure is mechanical, so the detection is too. Both import forms count:
//      `from "./lib/a11y.mjs"` and the deferred `await import(new URL(…))` that
//      preview-gallery.mjs uses, because a module that only fails when you run
//      it is worse than one that fails when you import it, not better.
//
//   2. THE PROFILE'S OWN DECLARATION. Closure cannot see a tool that names a
//      stack without importing one — refusal-demo.mjs drives a Compose tree
//      through strings alone and would import cleanly into a Go repo, then lie
//      to it. That file is the cmp profile's, and the profile is the only thing
//      that can say so: `tools` in its declarations, the contribution point
//      pattern from the language-gaps work (NORTH-STAR §6).
//
// WHY BOTH, RATHER THAN THE DECLARATION ALONE. A declaration is a claim and
// claims rot. The closure is the check: `assertToolsAreDeclared` refuses a
// profile whose declared tools miss something its own imports require, so a
// profile that grows a fifth tool and forgets to declare it is caught by the
// tool's own imports rather than by an adopter.
//
// THE ASYMMETRY BETWEEN A TOOL AND A LIBRARY IS DELIBERATE. A top-level
// `qa/*.mjs` is something the adopter RUNS: one that names another stack lies to
// them, so a declared tool is withheld whether or not it imports anything. A
// `qa/lib/*.mjs` is something the lane IMPORTS: withholding one that merely
// degrades would break the lane's own imports, so a library is withheld only
// when its closure proves it cannot load. Modules that degrade honestly on a
// foreign stack (arch-doc, audit-cadence) ship, and their debt is the lint's.
//
// This module is INSTALLER code, not lane code: it lives outside src/, is never
// vendored into a project, and is never inside the lock. install-boundary.test.mjs
// pins that.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Relative-specifier import forms this scanner understands. */
const STATIC_IMPORT = /(?:^|[\n;])\s*(?:import|export)[\s\S]*?from\s*["'](\.[^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*(?:new\s+URL\(\s*)?["'](\.[^"']+)["']/g;

/** Comments stripped: a path named in prose is not an edge. */
function code(abs) {
  try {
    return fs.readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  } catch {
    return "";
  }
}

/** Absolute paths this module imports with a relative specifier. */
function edges(abs) {
  const src = code(abs);
  const out = [];
  for (const re of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) out.push(path.resolve(path.dirname(abs), m[1]));
  }
  return out;
}

/**
 * The first path from `abs` into `profilesDir`, as a human-readable chain, or
 * null. Reported rather than a bare boolean so a refusal can say WHY a file is
 * not portable — "walkthrough.mjs → lib/a11y.mjs → lib/profiles/cmp/tree.mjs"
 * is actionable; "not portable" is not.
 * @param {string} abs
 * @param {string} profilesDir
 * @param {string} srcRoot for relative naming
 * @returns {string|null}
 */
export function profileReach(abs, profilesDir, srcRoot, seen = new Set()) {
  if (seen.has(abs)) return null;
  seen.add(abs);
  for (const dep of edges(abs)) {
    const rel = path.relative(srcRoot, dep).split(path.sep).join("/");
    if (dep === profilesDir || dep.startsWith(profilesDir + path.sep)) return rel;
    const deeper = profileReach(dep, profilesDir, srcRoot, seen);
    if (deeper) return `${rel} → ${deeper}`;
  }
  return null;
}

/** Every `.mjs` directly in a directory, sorted. Missing directory ⇒ none. */
function mjsIn(absDir) {
  try {
    return fs
      .readdirSync(absDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".mjs"))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** The profile ids the harness package ships — directory names, never a list. */
export function shippedProfiles(srcRoot) {
  const dir = path.join(srcRoot, "lib", "profiles");
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Load each shipped profile's declarations. A profile that fails to import
 * claims nothing rather than breaking the installer — an adopter installing a
 * lane should not be stopped by a profile they are not using.
 * @param {string} srcRoot the harness package's src/
 * @returns {Promise<Map<string, object>>} id → module namespace
 */
export async function loadShippedDeclarations(srcRoot) {
  const out = new Map();
  for (const id of shippedProfiles(srcRoot)) {
    const abs = path.join(srcRoot, "lib", "profiles", id, "declarations.mjs");
    if (!fs.existsSync(abs)) continue;
    try {
      out.set(id, await import(pathToFileURL(abs).href));
    } catch {
      /* a declaration that will not load declares nothing */
    }
  }
  return out;
}

/**
 * The files a foreign repo is NOT vendored, with the reason for each.
 * @param {string} srcRoot the harness package's src/
 * @param {Map<string, object>} declarations from loadShippedDeclarations
 * @returns {{tools: string[], lib: string[], why: Map<string, string>}}
 *   `tools` are `qa/*.mjs` names, `lib` are `qa/lib/*.mjs` names, `why` is keyed
 *   by the same names (lib entries prefixed `lib/`).
 */
export function notPortable(srcRoot, declarations) {
  const profilesDir = path.join(srcRoot, "lib", "profiles");
  const why = new Map();

  // Signal 2, first: what each profile claims as its own.
  for (const [id, mod] of declarations) {
    for (const name of Array.isArray(mod?.tools) ? mod.tools : []) {
      if (typeof name === "string" && name.endsWith(".mjs")) why.set(name, `declared by the \`${id}\` profile as its own tool`);
    }
  }

  // Signal 1: the closure, which also covers anything the declaration missed.
  for (const name of mjsIn(srcRoot)) {
    const via = profileReach(path.join(srcRoot, name), profilesDir, srcRoot);
    if (via && !why.has(name)) why.set(name, `imports a profile (${via})`);
  }
  for (const name of mjsIn(path.join(srcRoot, "lib"))) {
    const key = `lib/${name}`;
    const via = profileReach(path.join(srcRoot, "lib", name), profilesDir, srcRoot);
    if (via && !why.has(key)) why.set(key, `imports a profile (${via})`);
  }

  const keys = [...why.keys()].sort();
  return {
    tools: keys.filter((k) => !k.startsWith("lib/")),
    lib: keys.filter((k) => k.startsWith("lib/")).map((k) => k.slice("lib/".length)),
    why,
  };
}

/**
 * The check that keeps signal 2 honest: every tool a profile's closure requires
 * must be declared by that profile. Returns the undeclared ones, so the caller
 * decides whether that is a refusal or a warning.
 * @returns {Array<{id: string, name: string, via: string}>}
 */
export function undeclaredProfileTools(srcRoot, declarations) {
  const profilesDir = path.join(srcRoot, "lib", "profiles");
  const declared = new Set();
  for (const [, mod] of declarations) for (const n of Array.isArray(mod?.tools) ? mod.tools : []) declared.add(n);
  const gaps = [];
  for (const name of mjsIn(srcRoot)) {
    if (declared.has(name)) continue;
    const via = profileReach(path.join(srcRoot, name), profilesDir, srcRoot);
    if (!via) continue;
    const id = via.split("/")[2]; // lib/profiles/<id>/…
    gaps.push({ id, name, via });
  }
  return gaps;
}
