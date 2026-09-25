// EVERY COMMAND THE STOP HOOK'S REFUSAL NAMES MUST RESOLVE FROM WHERE IT RAN (review of KD-215).
//
// KD-215 fixed ONE instruction in the refusal — the trailing "Run `…` (it checks every
// promise …)" — to spell `cd "<root>" && node qa/verify.mjs` away from the root. The
// same stderr line leads with `result.reason`, and every reason receipt-check can give
// carries its own `node qa/verify.mjs` in backticks, still relative. So a session opened
// outside the project is told, in one sentence, to run a command that fails from where it
// stands and then one that works. The instance was fixed; the class is: every backticked
// command in the refusal is runnable from the directory the hook ran in.
//
// THE ORACLE IS THE SHELL, as in the KD-215 test: each command, run by `sh -c` from the
// foreign cwd, must reach this project's stand-in lane. Both shipped copies are checked.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "THE-LANE-WAS-REACHED";
const COPIES = ["template/qa/receipt-check.mjs", "packages/harness/src/receipt-check.mjs"];

// Every receipt state the hook refuses with a reason of its own (null = no receipt).
const RECEIPTS = {
  "no receipt": null,
  "a --fast receipt": { mode: "fast" },
  "a nightly receipt": { stage: "nightly" },
  "a smoke receipt": { profile: "smoke" },
};

function project(copy, receipt) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stop-every-cmd-")));
  fs.mkdirSync(path.join(dir, "qa", "evidence"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, copy), path.join(dir, "qa", "receipt-check.mjs"));
  fs.cpSync(path.join(REPO_ROOT, "template", "qa", "lib"), path.join(dir, "qa", "lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "verify.mjs"), `process.stdout.write(${JSON.stringify(MARKER)});\n`);
  if (receipt) fs.writeFileSync(path.join(dir, "qa", "evidence", "latest.json"), JSON.stringify(receipt));
  return dir;
}

const reaches = (command, cwd) =>
  String(spawnSync("/bin/sh", ["-c", command], { cwd, encoding: "utf8" }).stdout ?? "").includes(MARKER);

for (const copy of COPIES) {
  for (const [state, receipt] of Object.entries(RECEIPTS)) {
    test(`${copy}, ${state}: every command the refusal names reaches the lane from a foreign cwd`, () => {
      const root = project(copy, receipt);
      const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-foreign-cwd-")));
      try {
        const r = spawnSync(process.execPath, [path.join(root, "qa", "receipt-check.mjs"), "--hook"], {
          cwd: elsewhere,
          input: "{}",
          encoding: "utf8",
          env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        });
        const err = String(r.stderr ?? "");
        assert.equal(r.status, 2, `the Stop hook did not refuse:\n${err}`);
        const commands = [...err.matchAll(/`([^`]*\bnode qa\/[^`]*)`/g)].map((m) => m[1]);
        assert.ok(commands.length > 0, `no command in the refusal:\n${err}`);
        const broken = commands.filter((c) => !reaches(c, elsewhere));
        assert.deepEqual(broken, [], `the refusal names commands that do not resolve from ${elsewhere}:\n${err}`);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(elsewhere, { recursive: true, force: true });
      }
    });
  }
}
