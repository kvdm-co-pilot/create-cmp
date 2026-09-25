// A HEAL `doctor --fix` DECLINES IS NAMED, NEVER SILENT (review of KD-197).
//
// KD-197 made the walk-wiring heal edit `.claude/settings.json` in place, and refuse —
// write nothing — whenever `editJsonInPlace` cannot account for the edit or the file's
// shape is not one it will touch. Refusing is right. Refusing SILENTLY is not: the heal
// just `continue`s, so `doctor --fix --yes` prints "--fix: nothing auto-fixable found."
// and then, lines later, the same walk-wiring finding still offering "fix (--fix): Add
// the statusLine …". doctor.mjs's own comment says a heal offered and not applied "is not
// 'nothing auto-fixable' — saying so would contradict the lines just printed".
//
// Before KD-197 several of these shapes (valid JSON the in-place editor declines, a
// duplicate key) were healed by the rewrite; now they are declined with no word said.
//
// THE CLASS: after a real `doctor --fix --yes`, a finding that still offers `fix (--fix)`
// and whose file --fix left byte-unchanged is accompanied by a `--fix:` line naming that
// file, and the run never also claims there was nothing auto-fixable.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

// Settings shapes the walk-wiring heal writes nothing for, on this tree.
const DECLINED = {
  "valid JSON whose first member sits on the bracket's line": '{ "model": "opus",\n  "env": {}\n}\n',
  "a duplicate key": '{\n  "model": "opus",\n  "model": "sonnet"\n}\n',
  "hooks that is an array": '{\n  "hooks": []\n}\n',
  "a file JSON.parse refuses": '{\n  "model": "opus",\n}\n',
};

function project(settings) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-declined-")));
  fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "");
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the walk\n");
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), settings);
  return dir;
}

for (const [shape, settings] of Object.entries(DECLINED)) {
  test(`doctor --fix on ${shape}: a declined walk-wiring heal is named, and "nothing auto-fixable" is not claimed`, () => {
    const dir = project(settings);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-heal-declined-home-"));
    try {
      const r = spawnSync(process.execPath, [BIN, "doctor", "--fix", "--yes", "--no-install", "--no-ios", "--target-dir", dir], {
        env: { HOME: home, PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter), NO_COLOR: "1" },
        input: "",
        encoding: "utf8",
        timeout: 60_000,
      });
      const out = String(r.stdout ?? "").replace(/\x1b\[[0-9;]*m/g, "");
      const after = fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8");
      const stillOffered = /fix \(--fix\): Add the statusLine and UserPromptSubmit entries/.test(out);
      if (after !== settings || !stillOffered) return; // healed, or never offered: not this class
      assert.doesNotMatch(
        out,
        /--fix: nothing auto-fixable found/,
        `doctor --fix said nothing was auto-fixable, then printed a finding still offering --fix:\n${out}`
      );
      const named = out.split("\n").filter((l) => /--fix/.test(l) && !/fix \(--fix\):/.test(l) && /settings\.json/.test(l));
      assert.ok(named.length > 0, `--fix wrote nothing to .claude/settings.json and said nothing about why:\n${out}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}
