// DOCTOR'S DIAGNOSIS SURVIVES ANY `.claude/settings.json` THAT PARSES (review of KD-214 / KD-197).
//
// KD-214 made an unwritable heal stop taking the project diagnosis down with a raw stack.
// One reader earlier, `gatherWalkInputs` still does exactly that for an app's settings
// file that is valid JSON of a shape it did not expect: `UserPromptSubmit` an object or a
// string, a group whose `hooks` is not an array, or a `null` root → `Fatal: TypeError`,
// no diagnosis, no verdict. KD-197's heal added guards for these very shapes (`settings
// === null … continue`, a non-array `UserPromptSubmit` → `continue`), and they cannot be
// reached through `doctor`, because the diagnosis reader throws first — two readers of
// one file normalising it differently.
//
// THE CLASS: every JSON value `.claude/settings.json` can hold leaves `doctor` printing
// its project verdict, with no stack.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

const SHAPES = [
  "null",
  "[]",
  '"x"',
  "5",
  '{"hooks":[]}',
  '{"hooks":"x"}',
  '{"hooks":null}',
  '{"hooks":{"UserPromptSubmit":"x"}}',
  '{"hooks":{"UserPromptSubmit":{}}}',
  '{"hooks":{"UserPromptSubmit":[{"hooks":"x"}]}}',
  '{"hooks":{"UserPromptSubmit":[null,5,"x"]}}',
  '{"hooks":{"Stop":"x"}}',
  '{"hooks":{"Stop":[{"hooks":{}}]}}',
  '{"statusLine":5}',
  '{"statusLine":{"command":5}}',
];

for (const settings of SHAPES) {
  for (const fix of [false, true]) {
    test(`doctor${fix ? " --fix" : ""} with settings.json ${settings} prints its verdict, not a stack`, () => {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-odd-settings-")));
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-odd-settings-home-"));
      try {
        fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "");
        fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
        fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the walk\n");
        fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
        fs.writeFileSync(path.join(dir, ".claude", "settings.json"), settings);
        const args = [BIN, "doctor", ...(fix ? ["--fix", "--yes"] : []), "--no-install", "--no-ios", "--target-dir", dir];
        const r = spawnSync(process.execPath, args, {
          env: { HOME: home, PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter), NO_COLOR: "1" },
          input: "",
          encoding: "utf8",
          timeout: 60_000,
        });
        const all = `${r.stdout}\n${r.stderr}`;
        assert.doesNotMatch(all, /Fatal:|^\s+at /m, `doctor crashed on a settings.json that parses:\n${all}`);
        assert.match(all, /Project diagnosis: /, `doctor printed no project verdict:\n${all}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      }
    });
  }
}
