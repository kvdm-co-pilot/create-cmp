// THE END-OF-OPTIONS SEPARATOR IS REPORTED AS AN ARGUMENT THE COMMAND DOES NOT KNOW.
//
// `--` is not a flag name. It is the POSIX end-of-options marker, and npx
// FORWARDS IT VERBATIM to the package's bin. Measured 2026-09-14, npm 11.16.0,
// against a locally packed stub that prints its own argv:
//
//   $ npx create-echo myapp -- --yes
//     ["myapp","--","--yes"]          ← the separator arrives as a token
//   $ npm exec create-echo -- myapp --yes
//     ["myapp","--yes"]               ← npm exec consumes it; npx does not
//
// Both of this repo's front doors advertise themselves in exactly that form —
// `npx create-cmp [target-dir] [flags]` (bin/create-cmp.mjs's own header and
// `--help`), `npx prooflane init [--profile <id>]` (packages/harness/README.md)
// — and `npm create <pkg> my-app -- --flag` is the shape every create-* CLI
// teaches, so the separator is not exotic: it is what a user types the moment
// they are unsure whether a flag belongs to npx or to the package.
//
// Until 5c2cea6 it was inert. Measured at the merge-base b60b9fa:
//
//   $ prooflane init --dry-run -- --no-interview <dir>
//     project: …/<dir>   ✓ 50 files written   ! --dry-run: nothing was written.
//
// On this tree, both doors:
//
//   create-cmp: -- is not an argument this command knows.
//     run `create-cmp --help` for the ones it does. Nothing was written.
//
// — and `--help` names no `--`, so the advice cannot resolve the refusal. That
// is a working invocation turned into an exit 2, which is the failure mode a
// refusal-that-is-too-broad has: it rejects what used to work.
//
// THE INVARIANT IS OVER THE CLASS, not over this one token: a key the PARSER
// manufactures is not a flag name the USER typed, and only the second kind may
// be reported back as unrecognised. `--` parses to the empty key (`flags[""]`),
// which no human can have meant and no help text can explain. The assertion is
// therefore differential — the same invocation with and without the separator
// must reach the same outcome — rather than a string match on today's wording,
// so it holds however the separator is made inert again.
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
    // exactly what `npx prooflane init <dir> -- --dry-run --no-interview`
    // delivers, and the same line with the separator the user did not need.
    argv: (dir, sep) => ["init", dir, ...sep, "--dry-run", "--no-interview"],
  },
  {
    name: "create-cmp harness",
    bin: path.join(ROOT, "bin", "create-cmp.mjs"),
    argv: (dir, sep) => ["harness", "init", dir, ...sep, "--dry-run", "--no-interview"],
  },
];

function sandbox() {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), "npx-separator-"));
  const cwd = path.join(box, "cwd");
  const target = path.join(box, "named-by-the-user");
  fs.mkdirSync(cwd);
  fs.mkdirSync(target);
  return { box, cwd, target };
}

function run(door, sep, box) {
  const r = spawnSync(process.execPath, [door.bin, ...door.argv(box.target, sep)], {
    cwd: box.cwd,
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    status: r.status,
    out: `${r.stdout ?? ""}${r.stderr ?? ""}`,
    wroteTarget: fs.readdirSync(box.target),
    wroteCwd: fs.readdirSync(box.cwd),
  };
}

test("the `--` npx forwards is not reported back as an argument the command does not know", () => {
  const refused = [];
  for (const door of DOORS) {
    const box = sandbox();
    try {
      const withSep = run(door, ["--"], box);
      // The token is not named back as a flag, and the command does not exit
      // on account of it. Both halves matter: naming it is the message defect,
      // exiting is the behaviour defect.
      if (withSep.status !== 0 || /(^|\s)--\s+(is not|are not)/.test(withSep.out)) {
        refused.push(
          `${door.name}: \`npx … ${door.argv("<dir>", ["--"]).join(" ")}\` → exit ${withSep.status}\n` +
            `      ${withSep.out.trim().split("\n").slice(0, 2).join("\n      ")}`,
        );
      }
    } finally {
      fs.rmSync(box.box, { recursive: true, force: true });
    }
  }
  assert.deepEqual(
    refused,
    [],
    "`--` is the end-of-options separator npx forwards verbatim, not a flag name a user typed:\n  " +
      refused.join("\n  "),
  );
});

test("inserting the separator does not change what the invocation does", () => {
  // The half a message-only fix would miss. If `--` merely stopped being NAMED
  // but still terminated the line, or still swallowed the flags behind it, the
  // adopter's `--dry-run` would be gone and 50 files would land in a directory
  // they asked to be left alone.
  const drifted = [];
  for (const door of DOORS) {
    const plainBox = sandbox();
    const sepBox = sandbox();
    try {
      const plain = run(door, [], plainBox);
      const withSep = run(door, ["--"], sepBox);
      assert.equal(plain.status, 0, `${door.name}: the control invocation must work\n${plain.out}`);
      assert.deepEqual(plain.wroteTarget, [], `${door.name}: --dry-run must write nothing (control)\n${plain.out}`);

      if (withSep.status !== plain.status) {
        drifted.push(`${door.name}: exit ${withSep.status} with the separator, ${plain.status} without`);
      }
      if (withSep.wroteTarget.length !== plain.wroteTarget.length) {
        drifted.push(
          `${door.name}: --dry-run stopped being read behind the separator — ` +
            `${withSep.wroteTarget.length} entries written into the directory the user named, ${plain.wroteTarget.length} without it`,
        );
      }
      if (withSep.wroteCwd.length !== plain.wroteCwd.length) {
        drifted.push(
          `${door.name}: the separator moved the install — ${withSep.wroteCwd.length} entries in the CWD, ${plain.wroteCwd.length} without it`,
        );
      }
    } finally {
      fs.rmSync(plainBox.box, { recursive: true, force: true });
      fs.rmSync(sepBox.box, { recursive: true, force: true });
    }
  }
  assert.deepEqual(
    drifted,
    [],
    "the separator is meant to be inert — it was, until 5c2cea6:\n  " + drifted.join("\n  "),
  );
});
