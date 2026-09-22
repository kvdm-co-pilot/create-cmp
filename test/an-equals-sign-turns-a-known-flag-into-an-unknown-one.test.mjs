// AN EQUALS SIGN TURNS A KNOWN FLAG INTO AN UNKNOWN ONE, AT ONE DOOR OF TWO.
//
// `prooflane`'s parser splits `--name=value`; `create-cmp`'s never did (KD-14).
// So at create-cmp's door `--dry-run=true` arrived as a flag literally named
// `dry-run=true` and `--profile=svc` as one named `profile=svc`, and both were
// refused as arguments the command does not know — the flag the user meant,
// spelled the way most CLIs accept it, answered with "not an argument". The
// same line typed at `prooflane` did what it said. Measured on `4b81ee1`:
//
//   $ create-cmp upgrade --dry-run=true
//     create-cmp: --dry-run=true is not an argument this command knows.  exit 2
//
// It also made half of KD-16's guard dead code here (KD-153): a declared
// boolean can only still hold a string when its value was ATTACHED with `=`,
// and this door never produced that shape, so `--dry-run=maybe` was refused for
// the wrong reason — as an unknown name, not as a value the flag cannot mean.
//
// WHY THE BIN AND NOT THE PARSER: the promise is about the adopter's tree, and
// `upgrade` is the command that broke it. Measured against the published 0.26.5
// on 2026-09-21, `create-cmp upgrade --dry-run true --yes` in a project whose
// catalog the proven set would move REWROTE the catalog, kotlin 2.0.0 → 2.3.10.
// The parser half of that is fixed and pinned; what is pinned HERE is the whole
// matrix, through the real `bin/create-cmp.mjs`, with argv as separate tokens
// (one shell string `"--dry-run true"` is one token, not two, and would test a
// different line), in a project outside this repository.
//
// WHICH SPELLINGS, EXACTLY: the three affirmative ones — `--dry-run`,
// `--dry-run true`, `--dry-run=true` — with and without `--yes`, each leaving
// the catalog byte-identical, and `--dry-run false` / `--dry-run=false` with
// `--yes` applying, so the flag is READ rather than ignored into safety. That is
// five of the ten spellings `flagBool` resolves, and this header used to call it
// "every spelling", which was false: the `--no-dry-run` pair it omitted is
// exactly where `src/commands/` and the installer had split, and
// `a-dry-run-asked-for-by-the-other-name-writes-the-catalog.test.mjs` covers all
// ten by deriving them from the contract instead of listing them here.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseArgs as parseCliArgs } from "../src/lib/args.mjs";
import { parseArgs as parseHarnessArgs } from "../packages/harness/install/args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATE_CMP = path.join(ROOT, "bin", "create-cmp.mjs");

// picocolors styles output when CI is set and not at a developer's pipe, and
// `Dry run` is yellow — the reset lands inside the sentence being matched.
const PLAIN = /\u001B\[[0-9;]*m/g;

const CATALOG = '[versions]\nkotlin = "2.0.0"\n';

/** A project outside this repository whose catalog the proven set would move. */
function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "equals-form-")));
  const rel = path.relative(ROOT, dir);
  assert.ok(rel.startsWith("..") || path.isAbsolute(rel), `the fixture ${dir} is inside the repository ${ROOT}`);
  fs.mkdirSync(path.join(dir, "gradle"), { recursive: true });
  fs.writeFileSync(path.join(dir, "gradle", "libs.versions.toml"), CATALOG);
  return dir;
}

/** Every file under a tree, with its bytes — the only honest "nothing changed". */
function snapshot(root, rel = "", into = new Map()) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) snapshot(root, r, into);
    else into.set(r, fs.readFileSync(path.join(root, r)).toString("base64"));
  }
  return into;
}

function unchanged(dir, before, line) {
  const after = snapshot(dir);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `\`${line}\` created or removed a file — a \`.bak-upgrade\` means it wrote`);
  for (const [rel, bytes] of before) assert.equal(after.get(rel), bytes, `\`${line}\` rewrote ${rel}`);
}

/** The real bin, argv as separate tokens, run IN the project. */
function upgrade(argv, cwd) {
  const r = spawnSync(process.execPath, [CREATE_CMP, "upgrade", ...argv], {
    cwd,
    encoding: "utf8",
    // No TTY: without `--yes` the consent prompt declines rather than waits.
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(PLAIN, "") };
}

const DRY = [["--dry-run"], ["--dry-run", "true"], ["--dry-run=true"]];

test("every spelling of `--dry-run`, with and without `--yes`, leaves the catalog byte-identical and says so", () => {
  for (const dry of DRY) {
    for (const yes of [[], ["--yes"]]) {
      const argv = [...dry, ...yes];
      const line = `create-cmp upgrade ${argv.join(" ")}`;
      const dir = project();
      try {
        const before = snapshot(dir);
        const r = upgrade(argv, dir);
        assert.equal(r.code, 0, `\`${line}\` did not dry-run:\n${r.out}`);
        assert.match(r.out, /Dry run — nothing written/, `\`${line}\` did not say it was a dry run:\n${r.out}`);
        assert.doesNotMatch(r.out, /auto-yes/, `\`${line}\` reached the consent prompt a dry run must never reach:\n${r.out}`);
        assert.doesNotMatch(r.out, /Applied\./, `\`${line}\` reported applying changes:\n${r.out}`);
        unchanged(dir, before, line);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
});

test("`--dry-run false --yes` and `--dry-run=false --yes` apply — the flag is read, not ignored into safety", () => {
  for (const dry of [["--dry-run", "false"], ["--dry-run=false"]]) {
    const argv = [...dry, "--yes"];
    const line = `create-cmp upgrade ${argv.join(" ")}`;
    const dir = project();
    try {
      const r = upgrade(argv, dir);
      assert.equal(r.code, 0, `\`${line}\` failed:\n${r.out}`);
      assert.doesNotMatch(r.out, /Dry run/, `\`${line}\` was read as a dry run:\n${r.out}`);
      assert.match(r.out, /Applied\./, `\`${line}\` did not apply:\n${r.out}`);
      const toml = path.join(dir, "gradle", "libs.versions.toml");
      assert.notEqual(fs.readFileSync(toml, "utf8"), CATALOG, `\`${line}\` said it applied and left the catalog as it was`);
      assert.equal(fs.readFileSync(`${toml}.bak-upgrade`, "utf8"), CATALOG, `\`${line}\` wrote without the backup it promises`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("a declared boolean carrying a value it cannot mean is refused by what was typed, and writes nothing (KD-153)", () => {
  for (const token of ["--dry-run=maybe", "--dry-run="]) {
    for (const yes of [[], ["--yes"]]) {
      const argv = [token, ...yes];
      const line = `create-cmp upgrade ${argv.join(" ")}`;
      const dir = project();
      try {
        const before = snapshot(dir);
        const r = upgrade(argv, dir);
        assert.equal(r.code, 2, `\`${line}\` was not refused:\n${r.out}`);
        // The refusal for a value the flag cannot mean — not the one for a
        // name the door does not know, which is what this door used to give.
        assert.match(r.out, /that flag takes `true` or `false`, or no value at all/, `\`${line}\` was refused for the wrong reason:\n${r.out}`);
        assert.ok(r.out.includes(`create-cmp: ${token} —`), `\`${line}\` did not name what was typed:\n${r.out}`);
        assert.doesNotMatch(r.out, /not an argument this command knows/, `\`${line}\` was refused as an unknown name:\n${r.out}`);
        assert.match(r.out, /Nothing was written/);
        unchanged(dir, before, line);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
});

test("an unknown name in the `=` form is refused by its NAME, and writes nothing", () => {
  const dir = project();
  try {
    const before = snapshot(dir);
    const r = upgrade(["--verfiy=1", "--yes"], dir);
    assert.equal(r.code, 2, `\`--verfiy=1\` was not refused:\n${r.out}`);
    assert.match(r.out, /create-cmp: --verfiy is not an argument this command knows/, `the refusal did not name the flag:\n${r.out}`);
    unchanged(dir, before, "create-cmp upgrade --verfiy=1 --yes");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a value flag works in the `=` form: `--target-dir=<dir>` is the project, not the cwd", () => {
  const dir = project();
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "equals-cwd-")));
  try {
    const before = snapshot(dir);
    const r = upgrade([`--target-dir=${dir}`, "--dry-run=true"], cwd);
    assert.equal(r.code, 0, `the \`=\` form of a value flag was not read:\n${r.out}`);
    assert.match(r.out, new RegExp(`project: ${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`), `the project is not the directory named:\n${r.out}`);
    assert.match(r.out, /Dry run — nothing written/);
    assert.deepEqual(fs.readdirSync(cwd), [], "the command wrote into the working directory instead of the one named");
    unchanged(dir, before, `create-cmp upgrade --target-dir=${dir} --dry-run=true`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("the two doors split `=` the same way, edge cases included", () => {
  // Both parsers, the same argv, the same answer. `create-cmp harness init`
  // and `prooflane init` reach one installer, so a line that parses one way at
  // one door and another way at the other is the fork KD-14 was.
  const LINES = [
    ["--profile=svc", "../dir"],
    ["--target-dir=./app"],
    ["--fleet=./fleet.json"],
    ["--dry-run=true", "./app"],
    ["--dry-run=false", "./app"],
    ["--no-firebase=false"],
    ["--dry-run=maybe", "./app"],
    // An empty value is a value: the string "", not the boolean, not absent.
    ["--dry-run="],
    ["--profile="],
    // A value that itself contains `=` splits at the FIRST one only.
    ["--set=a=b"],
    // No name at all: the key is empty, and the door refuses it as unknown.
    ["--=x"],
    // An attached value never consumes the next token.
    ["--profile=svc", "--dry-run", "false"],
    ["--verfiy=1", "../dir"],
  ];
  const disagreed = [];
  for (const argv of LINES) {
    const a = parseCliArgs(argv);
    const b = parseHarnessArgs(argv);
    const cli = JSON.stringify({ flags: a.flags, positionals: a._ });
    const harness = JSON.stringify({ flags: b.flags, positionals: b.positionals });
    if (cli !== harness) disagreed.push(`${argv.join(" ")}\n      create-cmp ${cli}\n      prooflane  ${harness}`);
  }
  assert.deepEqual(disagreed, [], "one line, two doors, two parses:\n  " + disagreed.join("\n  "));
});
