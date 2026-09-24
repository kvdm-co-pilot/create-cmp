// A DRY RUN ASKED FOR BY THE FLAG'S OTHER NAME WRITES THE TREE, AT ONE COMMAND
// OF THE SAME CLI.
//
// `flagBool` is the declared contract for every boolean this CLI takes, and the
// slice that landed `coerceDeclaredBoolean` rewrote it to state the whole truth
// table — both names, all three value forms — in the docblock of both copies:
//
//     --x        --x true    --no-x false   → true
//     --no-x     --x false   --no-x true    → false
//
// The installer was moved onto that helper in the same change (`Boolean(flags
// ["dry-run"])` → `flagBool(flags, "dry-run", false)` in init, relock, upgrade
// and fleet). `src/commands/` was not: `upgrade`, `clean`, `verify`, `harden`
// and `attach` still read `flags["dry-run"] === true`, which consults ONE of the
// flag's two names. So the last two rows of the table above split, and the split
// is new — measured on `e21fc3d` against `origin/main`, from an empty project
// whose catalog the proven set would move:
//
//   create-cmp upgrade --no-dry-run false --yes
//     main   → wrote gradle/libs.versions.toml      (agreed with init: also wrote)
//     e21fc3d→ wrote gradle/libs.versions.toml      (init now writes NOTHING)
//
// One CLI, one flag, one line, two answers: `create-cmp harness init
// --no-dry-run false` previews and writes nothing, `create-cmp upgrade
// --no-dry-run false --yes` rewrites the version catalog and prints "Applied.".
// The direction is the one that costs the adopter — the contract says preview,
// the command writes, and `--yes` means the consent prompt that would have
// caught it is auto-answered.
//
// WHAT THIS PINS IS THE CLASS, NOT THE TWO ROWS. The expectation is not a list
// written here; it is computed by calling the tree's OWN `parseArgs` + `flagBool`
// on the same argv, so a command is compared against the contract this
// repository declares rather than against a reviewer's reading of it. Change
// `flagBool` and the expectation changes with it. Add a form and it is covered
// the day it parses. The two commands are compared to each other as well,
// because "one CLI answers one flag two ways" is the defect an adopter meets
// even when neither answer is the documented one.
//
// The sibling test `an-equals-sign-turns-a-known-flag-into-an-unknown-one.test.mjs`
// says in its header that "every spelling of 'dry run' leaves the catalog
// byte-identical", and CHANGELOG 0.27.0 repeats it; both enumerate three of the
// ten spellings `flagBool` resolves, and the two they omit are the two that
// split. That is why this is derived and not listed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseArgs, flagBool, BOOLEAN_FLAGS } from "../src/lib/args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATE_CMP = path.join(ROOT, "bin", "create-cmp.mjs");
const CATALOG = '[versions]\nkotlin = "2.0.0"\n';

/** Every way the tri-state contract lets one declared boolean be stated. */
function spellings(name) {
  return [
    [`--${name}`],
    [`--${name}`, "true"],
    [`--${name}=true`],
    [`--${name}`, "false"],
    [`--${name}=false`],
    [`--no-${name}`],
    [`--no-${name}`, "true"],
    [`--no-${name}=true`],
    [`--no-${name}`, "false"],
    [`--no-${name}=false`],
  ];
}

/** What THIS TREE says the flag means, asked of the tree and not of the test. */
function contract(argv, name) {
  return flagBool(parseArgs(argv).flags, name, false);
}

/** A fixture outside this repository — a bin run in the repo judges the repo. */
function outside(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const rel = path.relative(ROOT, dir);
  assert.ok(rel.startsWith("..") || path.isAbsolute(rel), `the fixture ${dir} is inside the repository ${ROOT}`);
  return dir;
}

function run(argv, cwd) {
  const r = spawnSync(process.execPath, [CREATE_CMP, ...argv], {
    cwd,
    encoding: "utf8",
    // No TTY: `upgrade` without `--yes` declines rather than waits, and
    // `harness init` records no answers rather than asking.
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * Did `create-cmp upgrade <spelling> --yes` treat the line as a dry run?
 * Answered by the adopter's bytes, never by the sentence printed over them.
 */
function upgradePreviewed(spelling) {
  const dir = outside("other-name-upgrade-");
  try {
    fs.mkdirSync(path.join(dir, "gradle"), { recursive: true });
    const toml = path.join(dir, "gradle", "libs.versions.toml");
    fs.writeFileSync(toml, CATALOG);
    const r = run(["upgrade", ...spelling, "--yes"], dir);
    assert.equal(r.code, 0, `create-cmp upgrade ${spelling.join(" ")} --yes failed:\n${r.out}`);
    return fs.readFileSync(toml, "utf8") === CATALOG && !fs.existsSync(`${toml}.bak-upgrade`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The same question of the other reader: the installer, which calls `flagBool`. */
function initPreviewed(spelling) {
  const dir = outside("other-name-init-");
  try {
    const r = run(["harness", "init", ...spelling, "--no-interview"], dir);
    assert.equal(r.code, 0, `create-cmp harness init ${spelling.join(" ")} failed:\n${r.out}`);
    return !fs.existsSync(path.join(dir, "qa"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("`--dry-run` is a declared boolean of this door, so the contract below is about a real flag", () => {
  assert.ok(BOOLEAN_FLAGS.has("dry-run"), "`dry-run` left BOOLEAN_FLAGS — this test is asking about nothing");
  const resolved = spellings("dry-run").map((s) => `${s.join(" ")} → ${contract(s, "dry-run")}`);
  assert.equal(
    resolved.filter((r) => r.endsWith("true")).length,
    5,
    `the contract no longer calls five of the ten spellings a dry run, so the table this test derives from has moved:\n  ${resolved.join("\n  ")}`
  );
});

test("every spelling the contract calls a dry run is a dry run at `create-cmp upgrade`", () => {
  const wrong = [];
  for (const spelling of spellings("dry-run")) {
    const expected = contract(spelling, "dry-run");
    const actual = upgradePreviewed(spelling);
    if (actual !== expected) {
      wrong.push(
        `create-cmp upgrade ${spelling.join(" ")} --yes → flagBool says dry-run=${expected}, ` +
          `the command ${actual ? "wrote nothing" : "rewrote gradle/libs.versions.toml"}`
      );
    }
  }
  assert.deepEqual(
    wrong,
    [],
    "a command reads one of the flag's two names where `flagBool` reads both, so a line that asks\n" +
      "for a preview is applied to the adopter's tree with the consent prompt auto-answered:\n  " +
      wrong.join("\n  ")
  );
});

test("one flag, one line, one CLI — `upgrade` and `harness init` do not answer it differently", () => {
  const split = [];
  for (const spelling of spellings("dry-run")) {
    const u = upgradePreviewed(spelling);
    const i = initPreviewed(spelling);
    if (u !== i) {
      split.push(
        `${spelling.join(" ")} → create-cmp upgrade ${u ? "previewed" : "WROTE"}, ` +
          `create-cmp harness init ${i ? "previewed" : "WROTE"}`
      );
    }
  }
  assert.deepEqual(
    split,
    [],
    "the same flag on the same CLI means a preview at one command and a write at another:\n  " + split.join("\n  ")
  );
});
