// A BARE `--no-<value flag>` WAS ACCEPTED, AND THE NEXT WORD BECAME THE PROJECT (KD-218).
//
//   $ prooflane init --no-profile svc      stored `no-profile: true`, installed into ./svc
//
// `no-` reads as boolean by construction, and `unknownFlags` knows `no-x` whenever it
// knows `x`, so a `--no-` form nobody declared was accepted and read by nothing, and
// `svc` — meant for `--profile` — was the directory. The `=` form was already refused
// with "there is no `--no-profile`" (KD-218's first half); the bare form now is too,
// with the same words, exit 2, nothing written. The control: a declared boolean's own
// `--no-` form (`--no-interview`, `--no-ios`) is untouched, and so are the declines
// `create` honours for `add firebase`'s value flags (`--no-region`, firebaseStampFlags).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BINS = {
  prooflane: path.join(ROOT, "packages", "harness", "bin", "prooflane.mjs"),
  "create-cmp": path.join(ROOT, "bin", "create-cmp.mjs"),
};

function run(bin, argv) {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bare-no-value-flag-")));
  try {
    const r = spawnSync(process.execPath, [BINS[bin], ...argv], { cwd, encoding: "utf8", timeout: 60_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, ""), wrote: fs.readdirSync(cwd) };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

for (const [bin, argv, flag, base] of [
  ["prooflane", ["init", "--no-profile", "svc", "--no-interview"], "no-profile", "profile"],
  ["prooflane", ["init", "--no-target-dir", "app", "--no-interview"], "no-target-dir", "target-dir"],
  ["prooflane", ["upgrade", "--no-fleet", "app"], "no-fleet", "fleet"],
  ["create-cmp", ["harness", "init", "--no-profile", "svc", "--no-interview"], "no-profile", "profile"],
  ["create-cmp", ["--no-name", "my-app", "--yes"], "no-name", "name"],
]) {
  test(`${bin} ${argv.join(" ")} is refused as a flag that does not exist, and nothing is written`, () => {
    const r = run(bin, argv);
    assert.equal(r.code, 2, `not refused:\n${r.out}`);
    assert.deepEqual(r.wrote, [], `something was written:\n${r.out}`);
    assert.ok(
      r.out.includes(`--${flag} — there is no \`--${flag}\`: \`--${base}\` takes a value`),
      `the refusal does not say --${flag} does not exist and what --${base} takes:\n${r.out}`
    );
    assert.match(r.out, /Nothing was written/);
  });
}

test("a declared boolean's --no- form is not refused as a missing flag", () => {
  const r = run("prooflane", ["init", "--no-interview", "--dry-run", "app"]);
  assert.doesNotMatch(r.out, /there is no `--no-interview`/, r.out);
});

test("create keeps honouring --no-region as a decline, not a missing flag", async () => {
  const { negatedValueFlags } = await import("../src/lib/args.mjs");
  const { FIREBASE_VALUE_FLAGS } = await import("../src/commands/add.mjs");
  const flags = { "no-region": true, "no-auth": true, "no-google-services": true, "no-profile": true, "no-ios": true };
  assert.deepEqual(negatedValueFlags(flags, { honoured: FIREBASE_VALUE_FLAGS }), ["no-profile"]);
});
