// AN ARGUMENT THE FRONT DOOR DOES NOT RECOGNISE IS ACTED ON ANYWAY.
//
// Both bins refuse an unknown COMMAND by name and exit 2. Neither refuses an
// unknown FLAG, so a typo, a short flag, or a word one CLI knows and the other
// does not is parsed as best it can be and the command proceeds — usually by
// eating the directory that followed it.
//
// That is the general case behind six log entries, and it is why the fix is not
// a longer list of names. Measured on this tree:
//
//   prooflane init --verfiy ../app     typo. ../app becomes the flag's value,
//                                      the project resolves to the cwd
//   prooflane init -y ../app           a single-dash token is not a flag to
//                                      either parser, so it is a POSITIONAL and
//                                      the project resolves to a directory
//                                      literally named `-y`
//   prooflane init --minimal ../app    a create-cmp word prooflane never reads
//                                      (KD-17); same swallow
//
// No list reaches the first two. What reaches all three is refusing what is not
// recognised — the same answer `unknown command` already gives one line down,
// applied to the flags it never looked at.
//
// THE INVARIANT IS OVER THE CLASS: an argument no front door documents is
// refused BY NAME, exits non-zero, and writes nothing. It is asserted by driving
// the real bins rather than the parsers, because the parser is not where the
// decision belongs and a test that asserted on `parseArgs` would go green while
// the command still ran.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DOORS = [
  {
    name: "prooflane",
    bin: path.join(ROOT, "packages", "harness", "bin", "prooflane.mjs"),
    argv: (extra, dir) => ["init", ...extra, dir, "--dry-run", "--no-interview"],
  },
  {
    name: "create-cmp harness",
    bin: path.join(ROOT, "bin", "create-cmp.mjs"),
    argv: (extra, dir) => ["harness", "init", ...extra, dir, "--dry-run", "--no-interview"],
  },
];

/**
 * Tokens a door does not document. PER DOOR, because the two doors document
 * different sets and the difference is the point: `--minimal` is a real
 * create-cmp scaffolding flag and must keep working there, while prooflane has
 * never read it and used to eat the directory after it (KD-17). A shared list
 * would demand that create-cmp refuse its own documented flag.
 */
const UNRECOGNISED = {
  prooflane: [
    { token: "--verfiy", why: "a typo of a real flag" },
    { token: "--not-a-flag-at-all", why: "a word neither CLI has ever parsed" },
    { token: "--minimal", why: "a create-cmp flag prooflane never reads (KD-17)" },
  ],
  "create-cmp harness": [
    { token: "--verfiy", why: "a typo of a real flag" },
    { token: "--not-a-flag-at-all", why: "a word neither CLI has ever parsed" },
  ],
};

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unknown-arg-"));
  const cwd = path.join(dir, "cwd");
  const target = path.join(dir, "named-by-the-user");
  fs.mkdirSync(cwd);
  fs.mkdirSync(target);
  return { dir, cwd, target };
}

function run(door, extra, cwd, target) {
  const r = spawnSync(process.execPath, [door.bin, ...door.argv(extra, target)], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

test("an argument no front door documents is refused by name, and nothing runs", () => {
  const obeyed = [];
  for (const door of DOORS) {
    for (const { token, why } of UNRECOGNISED[door.name]) {
      const box = sandbox();
      try {
        const { status, out } = run(door, [token], box.cwd, box.target);
        const refusedByName = status !== 0 && out.includes(token);
        if (!refusedByName) {
          const landed = /project:\s*(\S.*?)\s*$/m.exec(out);
          obeyed.push(
            `${door.name} ${token}  (${why}) → exit ${status}` +
              `${out.includes(token) ? "" : ", and the argument is never named back"}` +
              `${landed ? `, project resolved to ${landed[1]}` : ""}`,
          );
        }
      } finally {
        fs.rmSync(box.dir, { recursive: true, force: true });
      }
    }
  }
  assert.deepEqual(
    obeyed,
    [],
    "each line is an argument the command did not recognise and acted on anyway. `unknown command` " +
      "already refuses one line further down; these are the flags it never looked at:\n  " + obeyed.join("\n  "),
  );
});

test("a single-dash token is refused rather than taken for a directory", () => {
  // `-y` is not a flag to either parser, so it lands in the POSITIONALS and the
  // first positional after the command is the target directory. Executed:
  // `prooflane init -y ../app` resolves the project to a directory named `-y`.
  const wrong = [];
  for (const door of DOORS) {
    const box = sandbox();
    try {
      const { status, out } = run(door, ["-y"], box.cwd, box.target);
      if (status === 0 || !out.includes("-y")) {
        wrong.push(`${door.name} -y → exit ${status}${out.includes("-y") ? "" : ", and `-y` is never named back"}`);
      }
    } finally {
      fs.rmSync(box.dir, { recursive: true, force: true });
    }
  }
  assert.deepEqual(wrong, [], "a single-dash token is neither a flag nor a directory:\n  " + wrong.join("\n  "));
});

test("a flag that asks for information does not perform an action", () => {
  // KD-15. `--version` is a DOCUMENTED flag, so refusing the unrecognised does
  // not reach it: it passed the new check and then fell through the dispatcher
  // into `create`, which scaffolded a whole app into ./myapp. Executed on this
  // tree — "Copying template → …/myapp", exit 0. You asked what version this is
  // and got a directory tree.
  //
  // The class is every flag that answers rather than does. prooflane already
  // short-circuits both before dispatch; this is the same rule at the other door.
  for (const flag of ["--version", "--help"]) {
    const box = sandbox();
    try {
      const r = spawnSync(process.execPath, [path.join(ROOT, "bin", "create-cmp.mjs"), flag], {
        cwd: box.cwd,
        encoding: "utf8",
        timeout: 60_000,
      });
      assert.equal(r.status, 0, `create-cmp ${flag} → exit ${r.status}`);
      assert.deepEqual(
        fs.readdirSync(box.cwd),
        [],
        `create-cmp ${flag} wrote into the working directory instead of answering:\n` +
          `${fs.readdirSync(box.cwd).join(", ")}\n${r.stdout ?? ""}`,
      );
    } finally {
      fs.rmSync(box.dir, { recursive: true, force: true });
    }
  }
});

test("THE CONTROL: every documented argument still works, and --help/--version still short-circuit", () => {
  // The reason this file cannot be satisfied by refusing everything. Each of
  // these is named in a front door's own help, so each must survive.
  const broke = [];
  for (const door of DOORS) {
    const box = sandbox();
    try {
      const ok = run(door, ["--profile", "svc"], box.cwd, box.target);
      if (ok.status !== 0) broke.push(`${door.name} --profile svc → exit ${ok.status}\n${ok.out}`);
      const plain = run(door, [], box.cwd, box.target);
      if (plain.status !== 0) broke.push(`${door.name} (no extra flag) → exit ${plain.status}\n${plain.out}`);
    } finally {
      fs.rmSync(box.dir, { recursive: true, force: true });
    }
  }
  const help = spawnSync(process.execPath, [DOORS[0].bin, "--help"], { encoding: "utf8", timeout: 60_000 });
  if (help.status !== 0) broke.push(`prooflane --help → exit ${help.status}`);

  assert.deepEqual(broke, [], "a documented argument stopped working:\n  " + broke.join("\n  "));
});
