// WHICH FLAGS TAKE NO VALUE IS ONE FACT, AND THREE PLACES SPELL IT.
//
// `parseArgs` decides it from `BOOLEAN_FLAGS`; `flagBool` decides it again by
// being called on a name; and the two front doors into the SAME installer
// (`prooflane init` and `create-cmp harness init`) each bring their own list.
// Wherever two of those three disagree, the token after the flag is swallowed
// and the command runs against a directory nobody named — KD-7, which is what
// declaring the booleans was for.
//
// This file asserts the AGREEMENT, not the two spellings that were measured, so
// it covers a flag added tomorrow to either CLI. Each case below was executed on
// this tree on 2026-09-13.
//
//   1. A name `flagBool` reads but `BOOLEAN_FLAGS` does not hold.
//      $ create-cmp --inspector ./my-app
//        → flags = { inspector: "./my-app" }, positionals = []
//      `flagBool` sees a string that is neither "true" nor "false", so it falls
//      back to the DEFAULT and the flag the user typed does nothing; ./my-app is
//      gone, and the scaffold lands in ./myapp instead. Eleven of the thirteen
//      names `flagBool` reads are in this state, including every `--x/--no-x`
//      pair the help text advertises.
//
//   2. The two parsers classifying a shared installer's flag differently.
//      $ cd cwdtest && create-cmp harness init --new-profile ../pFlag
//        project: …/cwdtest        ← not ../pFlag; 50 files, exit 0
//      $ cd cwdtest && prooflane   init --new-profile ../pFlag
//        project: …/pFlag          ← correct
//      One `init`, one set of flags, two front doors that must not answer
//      differently — the dispatcher's own header calls a fork here "a lane that
//      installs differently depending on which package the adopter found".
//
//   3. A declared boolean eating its own documented value.
//      $ create-cmp --verify false ./my-app --yes
//        › Copying template → …/false        ← a directory named `false`
//      `flagBool`'s contract is tri-state: `--x`/`--x true` → true,
//      `--no-x`/`--x false` → false. Declaring `x` boolean makes `parseArgs`
//      refuse the value form, so `--verify false` now reads as verify ON and
//      `false` becomes the target directory. Before this declaration existed the
//      same argv gave verify OFF and ./my-app — so the flag means its opposite,
//      and the wrong-directory bug this was written to remove is re-created by
//      the removal.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs as parseCliArgs, flagBool, BOOLEAN_FLAGS as CLI_BOOLEANS } from "../src/lib/args.mjs";
import { BOOLEAN_FLAGS as HARNESS_BOOLEANS } from "../packages/harness/install/args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function mjsUnder(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) mjsUnder(p, out);
    else if (p.endsWith(".mjs")) out.push(p);
  }
  return out;
}

/**
 * The flags the CODE reads as booleans: every literal name handed to `flagBool`
 * (or to the deprecated-alias wrapper, where BOTH names are boolean). Read from
 * the source rather than listed here, so a new `flagBool(flags, "x")` is covered
 * the day it is written.
 */
function flagBoolNames() {
  const found = new Map(); // name → files
  for (const file of [...mjsUnder(path.join(ROOT, "src")), ...mjsUnder(path.join(ROOT, "bin"))]) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/flagBool(?:WithAlias)?\(\s*flags\s*,\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?/g)) {
      for (const name of [m[1], m[2]]) {
        if (!name) continue;
        if (!found.has(name)) found.set(name, []);
        found.get(name).push(path.relative(ROOT, file));
      }
    }
  }
  return found;
}

/** Every flag name the shared installer modules read, whichever front door ran. */
function sharedInstallerFlags() {
  const names = new Set();
  for (const file of mjsUnder(path.join(ROOT, "packages", "harness", "install"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/flags\[\s*"([^"]+)"\s*\]|flags\.([A-Za-z_$][\w$]*)/g)) {
      names.add(m[1] ?? m[2]);
    }
  }
  return [...names];
}

/** A `--no-x` name is boolean by construction in both parsers, list or no list. */
const isBoolean = (set, name) => set.has(name) || name.startsWith("no-");

test("every flag the code reads with flagBool is one the parser knows takes no value", () => {
  const names = flagBoolNames();
  assert.ok(names.size > 0, "found no flagBool call sites — the scan is broken, not the tree");

  const undeclared = [];
  for (const [name, files] of names) {
    if (!isBoolean(CLI_BOOLEANS, name)) {
      undeclared.push(`--${name} (read as a boolean in ${files.join(", ")})`);
    }
  }

  assert.deepEqual(
    undeclared,
    [],
    "each line is a flag the code reads as a boolean while the parser still hands it the next " +
      "token as a value. The user's argument is swallowed, the flag silently falls back to its " +
      "default, and the directory they named is not the one written to:\n  " + undeclared.join("\n  ")
  );
});

test("both front doors into the same installer classify its flags identically", () => {
  const shared = sharedInstallerFlags();
  assert.ok(shared.length > 0, "found no flag reads in install/ — the scan is broken, not the tree");

  const split = [];
  for (const name of shared) {
    const viaProoflane = isBoolean(HARNESS_BOOLEANS, name);
    const viaCreateCmp = isBoolean(CLI_BOOLEANS, name);
    if (viaProoflane !== viaCreateCmp) {
      split.push(
        `--${name}: prooflane says it takes ${viaProoflane ? "no value" : "a value"}, ` +
          `create-cmp says it takes ${viaCreateCmp ? "no value" : "a value"} — so ` +
          `\`${viaProoflane ? "create-cmp harness" : "prooflane"} init --${name} ../dir\` ` +
          "installs somewhere other than ../dir while the other front door gets it right"
      );
    }
  }

  assert.deepEqual(
    split,
    [],
    "one installer, two front doors, and they disagree about the shape of the same flag:\n  " +
      split.join("\n  ")
  );
});

test("declaring a flag boolean does not make its documented value form mean the opposite", () => {
  // Only the flags that are BOTH declared boolean and read through flagBool —
  // flagBool is what promises `--x true` / `--x false`, so it is the promise
  // this checks. The set grows as the previous test is satisfied.
  const readByFlagBool = [...flagBoolNames().keys()].filter((n) => CLI_BOOLEANS.has(n));
  assert.ok(readByFlagBool.length > 0, "no declared boolean is read through flagBool — the scan is broken");

  const inverted = [];
  for (const name of readByFlagBool) {
    for (const [literal, means] of [["false", false], ["true", true]]) {
      const { _: positionals, flags } = parseCliArgs([`--${name}`, literal, "./my-app"]);
      const resolved = flagBool(flags, name, !means);
      if (resolved !== means || positionals[0] !== "./my-app") {
        inverted.push(
          `--${name} ${literal} ./my-app → ${name}=${resolved} (the user wrote ${means}) ` +
            `and the target directory is ${JSON.stringify(positionals[0])}`
        );
      }
    }
  }

  assert.deepEqual(
    inverted,
    [],
    "each line is a flag whose documented value form (`--x true` / `--x false`, flagBool's own " +
      "contract) now reads as its opposite, with the literal it swallowed left standing where the " +
      "target directory goes:\n  " + inverted.join("\n  ")
  );
});
