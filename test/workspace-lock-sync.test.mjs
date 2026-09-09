// The gate on `npm ci` — the install path a fresh clone actually uses.
//
// 0.25.0 bumped prooflane-harness 0.20.0 -> 0.21.1 and the prooflane alias
// 0.0.1 -> 0.1.0. Two things did not move with them:
//
//   1. inspector/mcp declared `prooflane-harness: ^0.20.0`. On a 0.x version a
//      caret pins the MINOR — ^0.20.0 means >=0.20.0 <0.21.0 — so the workspace
//      at 0.21.1 no longer satisfied it. npm stopped linking the sibling and
//      went looking for 0.20.0 on the registry instead.
//   2. package-lock.json still recorded the pre-release versions.
//
// `npm ci` refuses an out-of-sync lock, so a fresh clone could not install.
// Nothing caught it because CI runs `npm install`, which is permissive: it
// quietly repairs what `npm ci` treats as fatal. The green build was real and
// the broken one was the one nobody ran.
//
// This test is the offline half of `npm ci`: it asserts the two invariants that
// desynced, without needing a registry or a clean node_modules.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

/** The workspace dirs, expanded from the root manifest's globs. */
function workspaceDirs() {
  const out = [];
  for (const glob of json("package.json").workspaces) {
    if (!glob.endsWith("/*")) {
      out.push(glob);
      continue;
    }
    const base = glob.slice(0, -2);
    for (const e of fs.readdirSync(path.join(ROOT, base), { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(ROOT, base, e.name, "package.json"))) out.push(`${base}/${e.name}`);
    }
  }
  return out;
}

/**
 * Does `version` satisfy `range`?
 *
 * Deliberately NARROW. This understands only the range forms this repo uses,
 * and REFUSES anything else by throwing rather than guessing — a hand-rolled
 * semver that silently mis-parses an unfamiliar range would be worse than no
 * check at all. If a new form appears, this throws and names it, and the fix is
 * to teach it that form on purpose.
 */
function satisfies(version, range) {
  const parse = (v) => v.split("-")[0].split(".").map(Number);
  const cmp = (a, b) => {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  };
  const v = parse(version);

  if (range === "*" || range === "") return true;
  if (/^>=\d+\.\d+\.\d+$/.test(range)) return cmp(v, parse(range.slice(2))) >= 0;
  if (/^\d+\.\d+\.\d+$/.test(range)) return cmp(v, parse(range)) === 0;
  if (/^\^\d+\.\d+\.\d+$/.test(range)) {
    const b = parse(range.slice(1));
    if (cmp(v, b) < 0) return false;
    // ^ on 0.x pins the minor; on >=1 it pins the major. This is the exact rule
    // the inspector's ^0.20.0 fell foul of.
    return b[0] === 0 ? v[0] === 0 && v[1] === b[1] : v[0] === b[0];
  }
  throw new Error(`workspace-lock-sync: unsupported range form ${JSON.stringify(range)} — teach satisfies() this form deliberately`);
}

test("satisfies() encodes the caret rule that actually bit us", () => {
  assert.equal(satisfies("0.21.1", "^0.20.0"), false, "^0.20.0 must NOT match 0.21.1 — a caret on 0.x pins the minor");
  assert.equal(satisfies("0.20.3", "^0.20.0"), true);
  assert.equal(satisfies("0.21.1", ">=0.21.0"), true);
  assert.equal(satisfies("0.20.0", ">=0.21.0"), false);
  assert.equal(satisfies("2.1.0", "^1.9.0"), false, "a caret on >=1 pins the major");
  assert.equal(satisfies("1.9.5", "^1.9.0"), true);
  assert.throws(() => satisfies("1.0.0", "~1.0.0"), /unsupported range form/, "an unknown form must fail closed, never be guessed");
});

test("a dependency on a sibling workspace is satisfied by that sibling, so npm links it instead of fetching", () => {
  const dirs = workspaceDirs();
  const siblings = new Map(dirs.map((d) => [json(`${d}/package.json`).name, json(`${d}/package.json`).version]));

  let checked = 0;
  for (const dir of dirs) {
    const pkg = json(`${dir}/package.json`);
    for (const [dep, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (!siblings.has(dep)) continue;
      checked++;
      assert.ok(
        satisfies(siblings.get(dep), range),
        `${pkg.name} requires ${dep}@${range}, but the workspace ${dep} is ${siblings.get(dep)} — npm cannot link the sibling and will go to the registry, which is what broke npm ci after 0.25.0`,
      );
    }
  }
  assert.ok(checked > 0, "the fixture is vacuous if no workspace depends on a sibling");
});

test("package-lock.json records every workspace at the version its manifest declares", () => {
  const lock = json("package-lock.json");
  for (const dir of workspaceDirs()) {
    const pkg = json(`${dir}/package.json`);
    const entry = lock.packages[dir];
    assert.ok(entry, `package-lock.json has no entry for the workspace ${dir} — run npm install`);
    assert.equal(
      entry.version,
      pkg.version,
      `the lock says ${dir} is ${entry.version} but its manifest says ${pkg.version} — npm ci refuses an out-of-sync lock; run npm install and commit the lock`,
    );
  }
});

test("the root manifest's own version is the one the lock records", () => {
  const lock = json("package-lock.json");
  const root = json("package.json");
  assert.equal(lock.version, root.version, "package-lock.json's top-level version trails package.json — run npm install");
  assert.equal(lock.packages[""].version, root.version, "the lock's root package entry trails package.json — run npm install");
});
