// THE REFUSAL NAMED `--no-<value flag>` AS A FLAG THAT TAKES `true` OR `false` (KD-218).
//
//   $ create-cmp harness init --no-target-dir=x
//     create-cmp: --no-target-dir=x — that flag takes `true` or `false`, or no value at all.
//   $ prooflane init --no-profile=svc
//     ✗ prooflane: --no-profile=svc — that flag takes `true` or `false`, or no value at all
//
// There is no `--no-target-dir` and no `--no-profile`. `no-` reads as boolean by
// construction, so both doors accept the name and then describe it as a boolean
// that exists — KD-184's shape, a sentence naming something the CLI does not have.
//
// WORDS ONLY. What either parser accepts is KD-7's territory and is not moved here:
// the `=` form is still refused, exit 2, nothing written. What changes is that the
// refusal says the flag does not exist and what the real one takes. The control is
// that a declared boolean's refusal keeps its words, byte for byte.

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
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "no-value-flag-")));
  try {
    const r = spawnSync(process.execPath, [BINS[bin], ...argv], { cwd, encoding: "utf8" });
    return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, ""), wrote: fs.readdirSync(cwd) };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

const TRUE_OR_FALSE = /takes? `true` or `false`, or no value at all/;

for (const [bin, argv, flag, base] of [
  ["create-cmp", ["harness", "init", "--no-target-dir=x"], "no-target-dir", "target-dir"],
  ["create-cmp", ["harness", "init", "--no-profile=svc"], "no-profile", "profile"],
  ["prooflane", ["init", "--no-profile=svc"], "no-profile", "profile"],
  ["prooflane", ["init", "--no-target-dir=x"], "no-target-dir", "target-dir"],
]) {
  test(`${bin} ${argv.join(" ")} is refused as a flag that does not exist, not as a boolean`, () => {
    const r = run(bin, argv);
    assert.equal(r.code, 2, `not refused:\n${r.out}`);
    assert.deepEqual(r.wrote, [], `something was written:\n${r.out}`);
    assert.doesNotMatch(r.out, TRUE_OR_FALSE, `the refusal still describes --${flag} as a flag that takes true or false:\n${r.out}`);
    assert.ok(
      r.out.includes(`there is no \`--${flag}\`: \`--${base}\` takes a value`),
      `the refusal does not say --${flag} does not exist and what --${base} takes:\n${r.out}`
    );
    assert.match(r.out, /Nothing was written/);
  });
}

test("a declared boolean's refusal keeps its words, and a mixed line gets both sentences", () => {
  const boolean = run("create-cmp", ["harness", "init", "--dry-run=maybe"]);
  assert.equal(boolean.code, 2);
  assert.ok(boolean.out.includes("create-cmp: --dry-run=maybe — that flag takes `true` or `false`, or no value at all.\n"), boolean.out);

  const mixed = run("prooflane", ["init", "--dry-run=maybe", "--no-profile=svc"]);
  assert.equal(mixed.code, 2);
  assert.match(mixed.out, /--dry-run=maybe — that flag takes `true` or `false`/, mixed.out);
  assert.ok(mixed.out.includes("--no-profile=svc — there is no `--no-profile`"), mixed.out);
  assert.doesNotMatch(mixed.out, /--no-profile=svc[^\n]*true` or `false/, mixed.out);
});
