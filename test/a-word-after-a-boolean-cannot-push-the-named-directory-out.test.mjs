// A WORD AFTER A BOOLEAN PUSHED THE NAMED DIRECTORY OUT OF THE COMMAND (KD-150).
//
//   $ prooflane init --dry-run maybe ../app     project: …/maybe   (not ../app)
//   $ create-cmp --no-firebase no my-app        scaffolds into ./no
//
// A declared boolean takes only `true`/`false` from the space form, so any other
// word after it stays a positional — deliberately: refusing it makes
// `create-cmp --minimal my-app` an error, which is KD-7. But each command reads
// a FIXED number of positionals and silently dropped the rest, so the directory
// the user named last was the one thrown away. A surplus positional is refused,
// exit 2, nothing written; the one-directory form keeps working.

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
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "surplus-positional-")));
  try {
    const r = spawnSync(process.execPath, [BINS[bin], ...argv], { cwd, encoding: "utf8", timeout: 60_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, ""), wrote: fs.readdirSync(cwd) };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

const CASES = [
  ["prooflane", ["init", "--dry-run", "maybe", "app", "--no-interview"], "maybe, app"],
  ["prooflane", ["relock", "--dry-run", "maybe", "app"], "maybe, app"],
  ["prooflane", ["upgrade", "--dry-run", "maybe", "app"], "maybe, app"],
  ["create-cmp", ["--no-firebase", "no", "my-app", "--yes"], "no, my-app"],
  ["create-cmp", ["harness", "init", "--dry-run", "maybe", "app", "--no-interview"], "maybe, app"],
  ["create-cmp", ["doctor", "--fix", "maybe", "app"], "maybe, app"],
  ["create-cmp", ["add", "firebase", "--no-verify", "maybe", "app"], "maybe, app"],
];

for (const [bin, argv, named] of CASES) {
  test(`${bin} ${argv.join(" ")} — two directories named, refused, nothing written`, () => {
    const r = run(bin, argv);
    assert.equal(r.code, 2, r.out);
    assert.deepEqual(r.wrote, [], `wrote ${r.wrote.join(", ")}`);
    assert.match(r.out, new RegExp(`${named.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), r.out);
    assert.match(r.out, /one directory/, r.out);
    assert.match(r.out, /Nothing was written/, r.out);
  });
}

test("the one-directory form after a boolean still reaches the command (no KD-7 regression)", () => {
  // `--dry-run maybe` alone: `maybe` IS the directory; a dry run writes nothing either way.
  const r = run("prooflane", ["init", "--dry-run", "maybe", "--no-interview"]);
  assert.doesNotMatch(r.out, /one directory/, r.out);
});
