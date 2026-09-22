// AN EMPTY DIRECTORY FLAG INSTALLS INTO THE WORKING DIRECTORY.
//
// Every command that takes `--target-dir` reads it as
// `(typeof v === "string" && v) || positional || "."`, and `""` is falsy — so a
// value flag given an EMPTY value is the same as the flag not being there, and
// the command runs against the cwd. Measured on `4be6b36`, from an empty cwd:
//
//   $ create-cmp harness init --target-dir= --dry-run --no-interview
//     project: <the cwd>   ✓ 51 files written   ! --dry-run: nothing was written.
//   $ prooflane  init --target-dir= --dry-run --no-interview        (identical)
//   $ create-cmp upgrade --target-dir '' --dry-run                  project: <the cwd>
//
// The line that produces it is a script's: `--target-dir=$DIR` or
// `--target-dir "$DIR"` with `DIR` unset. The user named a directory, by
// variable; the variable was empty; and without `--dry-run` the lane's ~51 files
// land in whatever directory the script happened to run from, exit 0. That is
// KD-7's outcome — files in a tree nobody named — reached by an empty value
// instead of a swallowed one, and the `=` split that closed KD-14 made one more
// spelling of it reachable at create-cmp's door (it had been refused there as an
// unknown flag named `target-dir=`).
//
// THE REFUSAL IS FOR THE CLASS, not the flag: every declared VALUE-taking flag
// given an empty value, at both doors, in both spellings, is refused by name
// before any command runs — the precedent is `--fleet`'s own refusal of an empty
// manifest (packages/harness/install/fleet.mjs:172). Driven through the real
// bins, argv as separate tokens, from temp directories outside this repository,
// and the harm case is run WITHOUT `--dry-run`, because a dry run is exactly
// what the adopter in this story did not type.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAIN = /\u001B\[[0-9;]*m/g;

const DOORS = [
  { name: "create-cmp", bin: path.join(ROOT, "bin", "create-cmp.mjs"), init: ["harness", "init"], upgrade: ["harness", "upgrade"] },
  { name: "prooflane", bin: path.join(ROOT, "packages", "harness", "bin", "prooflane.mjs"), init: ["init"], upgrade: ["upgrade"] },
];

/** A command line as a shell would need it typed — an empty token shown as `""`. */
const show = (name, argv) => [name, ...argv.map((a) => (a === "" ? '""' : a))].join(" ");

/** A temp directory outside the repository — asserted, not assumed. */
function tempDir(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const rel = path.relative(ROOT, dir);
  assert.ok(rel.startsWith("..") || path.isAbsolute(rel), `the fixture ${dir} is inside the repository ${ROOT}`);
  return dir;
}

function run(bin, argv, cwd) {
  const r = spawnSync(process.execPath, [bin, ...argv], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(PLAIN, "") };
}

/** Every file under a tree, with its bytes. */
function snapshot(root, rel = "", into = new Map()) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) snapshot(root, r, into);
    else into.set(r, fs.readFileSync(path.join(root, r)).toString("base64"));
  }
  return into;
}

function refusedByName(r, flag, line) {
  assert.equal(r.code, 2, `\`${line}\` was not refused:\n${r.out}`);
  assert.match(r.out, new RegExp(`${flag} needs a value`), `\`${line}\` did not say ${flag} needs a value:\n${r.out}`);
  assert.match(r.out, /Nothing was written/, `\`${line}\` did not say nothing was written:\n${r.out}`);
}

test("`init --target-dir=` with no dry run writes nothing into the working directory, at either door", () => {
  // The harm case, as the adopter's script would produce it.
  for (const door of DOORS) {
    for (const spelling of [["--target-dir="], ["--target-dir", ""]]) {
      const cwd = tempDir("empty-target-cwd-");
      const argv = [...door.init, ...spelling, "--no-interview"];
      const line = show(door.name, argv);
      try {
        const r = run(door.bin, argv, cwd);
        assert.deepEqual(fs.readdirSync(cwd), [], `\`${line}\` wrote into the working directory, which nobody named:\n${r.out}`);
        refusedByName(r, "--target-dir", line);
      } finally {
        fs.rmSync(cwd, { recursive: true, force: true });
      }
    }
  }
});

test("`create-cmp upgrade --target-dir= --yes` does not rewrite the catalog in the working directory", () => {
  // The same class at the Compose door's own command: the cwd here holds a
  // catalog the proven set would move, and `--yes` removes the only question.
  for (const spelling of [["--target-dir="], ["--target-dir", ""]]) {
    const cwd = tempDir("empty-target-upgrade-");
    const line = show("create-cmp", ["upgrade", ...spelling, "--yes"]);
    try {
      fs.mkdirSync(path.join(cwd, "gradle"));
      fs.writeFileSync(path.join(cwd, "gradle", "libs.versions.toml"), '[versions]\nkotlin = "2.0.0"\n');
      const before = snapshot(cwd);
      const r = run(path.join(ROOT, "bin", "create-cmp.mjs"), ["upgrade", ...spelling, "--yes"], cwd);
      const after = snapshot(cwd);
      assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `\`${line}\` created or removed a file in the cwd:\n${r.out}`);
      for (const [rel, bytes] of before) assert.equal(after.get(rel), bytes, `\`${line}\` rewrote ${rel} in the cwd:\n${r.out}`);
      refusedByName(r, "--target-dir", line);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test("every value flag the installer takes refuses an empty value by name — `--profile=`, `--fleet=`", () => {
  for (const door of DOORS) {
    const cwd = tempDir("empty-value-cwd-");
    const target = tempDir("empty-value-target-");
    try {
      for (const [argv, flag] of [
        [[...door.init, "--profile=", target, "--no-interview"], "--profile"],
        [[...door.init, "--profile", "", target, "--no-interview"], "--profile"],
        [[...door.upgrade, "--fleet="], "--fleet"],
        [[...door.upgrade, "--fleet", ""], "--fleet"],
      ]) {
        const line = show(door.name, argv);
        const r = run(door.bin, argv, cwd);
        refusedByName(r, flag, line);
        assert.deepEqual(fs.readdirSync(cwd), [], `\`${line}\` wrote into the working directory`);
        assert.deepEqual(fs.readdirSync(target), [], `\`${line}\` wrote into the directory it was refused for`);
      }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});

test("a value flag WITH a value is untouched — the refusal is for the empty one only", () => {
  // The control. A refusal that fired on any `--target-dir` would pass every
  // test above and break every adopter who names a directory.
  for (const door of DOORS) {
    const cwd = tempDir("valued-cwd-");
    const target = tempDir("valued-target-");
    try {
      const r = run(door.bin, [...door.init, `--target-dir=${target}`, "--dry-run", "--no-interview"], cwd);
      assert.doesNotMatch(r.out, /needs a value/, `${door.name}: a named directory was refused:\n${r.out}`);
      assert.ok(r.out.includes(`project: ${target}`), `${door.name}: the project is not the directory named:\n${r.out}`);
      assert.deepEqual(fs.readdirSync(cwd), [], `${door.name}: a dry run wrote into the working directory`);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});
