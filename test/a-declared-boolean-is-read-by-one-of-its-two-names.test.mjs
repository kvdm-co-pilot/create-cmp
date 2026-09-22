// A DECLARED BOOLEAN IS READ BY ONE OF ITS TWO NAMES.
//
// `flagBool` is the contract for every boolean either door takes, and it reads
// BOTH names — that is the half of KD-16 that lived outside the parser:
//
//     --x        --x true    --no-x false   → true
//     --no-x     --x false   --no-x true    → false
//
// A read spelled `flags["dry-run"] === true` answers the first row and the
// fourth and gets the last two wrong, because `no-dry-run` is a different KEY.
// Measured on `e21fc3d`, the integrated wave, from a project whose catalog the
// proven set would move:
//
//   $ create-cmp upgrade --no-dry-run false --yes
//     → "✓ wrote gradle/libs.versions.toml", "Applied."
//   $ create-cmp harness init --no-dry-run false --no-interview
//     → previewed, nothing written
//
// One CLI, one flag, one line, two answers — because the installer had been
// moved onto `flagBool` and `src/commands/` had not.
// `a-dry-run-asked-for-by-the-other-name-writes-the-catalog.test.mjs` pins that
// pair of commands by running them. THIS file pins the CLASS by reading the
// source: no command may ask a declared boolean's truth by one of its names, so
// the split cannot return through `clean`, `harden` or a command written next
// year.
//
// WHAT IT PERMITS, and why each is not the defect:
//
//   `"version" in flags`     a PRESENCE question. `--version false` still
//                            answers, deliberately, because a question is not
//                            un-asked by being answered `false` (KD-152), and
//                            `flagBool` cannot express it.
//   `flags[name] !== undefined`  the same question, asked of a name held in a
//                            variable — `flagBoolWithAlias` needs it to decide
//                            WHICH of two names the user stated before asking
//                            what either means.
//   `flagBool(flags, "x", d)`  the contract itself.
//
// WHAT IT CANNOT SEE, said plainly rather than implied: a read through a
// destructured binding (`const { yes } = flags`) or a computed key
// (`flags[someVar]`). Neither exists in the scanned directories today — grepped
// on this tree — and a scanner that tried to follow either would be guessing.
// The runtime pin beside this one is what catches a read this one cannot name.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BOOLEAN_FLAGS as CLI_BOOLEANS } from "../src/lib/args.mjs";
import { BOOLEAN_FLAGS as HARNESS_BOOLEANS } from "../packages/harness/install/args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Where a `flags` object is read, and whose boolean list applies there. The two
 * parsers are excluded by name: `args.mjs` is where the values are MADE, and
 * `emptyValues`' own `flags[k] === true` is the one read that is about the
 * shape of a value rather than about what a flag means.
 */
const SCOPE = [
  { dir: path.join("src", "commands"), booleans: CLI_BOOLEANS, door: "create-cmp" },
  { dir: "bin", booleans: CLI_BOOLEANS, door: "create-cmp" },
  { dir: path.join("src", "lib"), booleans: CLI_BOOLEANS, door: "create-cmp" },
  { dir: path.join("packages", "harness", "install"), booleans: HARNESS_BOOLEANS, door: "prooflane" },
  { dir: path.join("packages", "harness", "bin"), booleans: HARNESS_BOOLEANS, door: "prooflane" },
];

const PARSERS = new Set(["args.mjs"]);

/** Comments removed — a docblock quoting the defect is not the defect. */
const withoutComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, "");

/** `--no-x` is boolean by construction wherever `x` is. */
const isDeclaredBoolean = (booleans, name) =>
  booleans.has(name) || (name.startsWith("no-") && booleans.has(name.slice(3)));

/** Every literal read of a `flags` property, with the text that follows it. */
function reads(text) {
  const out = [];
  const re = /flags(?:\.([A-Za-z][\w$]*)|\[\s*"([a-z][\w-]*)"\s*\])/g;
  let m;
  while ((m = re.exec(text))) {
    out.push({ name: m[1] ?? m[2], index: m.index, after: text.slice(m.index + m[0].length, m.index + m[0].length + 20) });
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

test("no command asks a declared boolean's truth by one of its two names", () => {
  const offences = [];
  let scanned = 0;
  let viaContract = 0;

  for (const scope of SCOPE) {
    const dir = path.join(ROOT, scope.dir);
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".mjs") && !PARSERS.has(f))) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const text = withoutComments(raw);
      scanned += 1;
      viaContract += (text.match(/flagBool\s*\(/g) ?? []).length;

      for (const r of reads(text)) {
        if (!isDeclaredBoolean(scope.booleans, r.name)) continue;
        // A PRESENCE question is not a truth question, and `flagBool` has no way
        // to answer it: `--version false` must still print the version.
        if (/^\s*(===|!==)\s*undefined/.test(r.after)) continue;
        const compared = /^\s*(===|!==)\s*(true|false)/.exec(r.after);
        const how = compared ? `${compared[1]} ${compared[2]}` : "read as a value";
        offences.push(
          `${scope.dir}/${file}:${lineOf(text, r.index)} — ${r.name} ${how}. ` +
            `Write flagBool(flags, "${r.name.startsWith("no-") ? r.name.slice(3) : r.name}", <default>).`
        );
      }
    }
  }

  assert.ok(scanned >= 15, `only ${scanned} files were scanned — this pin is looking at the wrong tree`);
  assert.ok(viaContract > 0, "no flagBool call was found in any scanned file — the scan is broken, not the tree");
  assert.deepEqual(
    offences,
    [],
    "each line reads a declared boolean by ONE of its two names, where `flagBool` reads both. " +
      "`--no-dry-run false` means a dry run and a command that asks `flags[\"dry-run\"] === true` " +
      "writes the adopter's tree instead:\n  " + offences.join("\n  ")
  );
});
