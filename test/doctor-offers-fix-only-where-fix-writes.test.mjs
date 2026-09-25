// DOCTOR OFFERS `--fix` ONLY WHERE `--fix` WRITES (KD-237).
//
// The walk-wiring finding "installed but not wired up" always carried `fix: { auto: true }`,
// so doctor printed `fix (--fix):` under it — and when .claude/settings.json was not JSON
// doctor can read, or parsed into a shape it does not read, `--fix` then declined to write
// it, naming why. A promise one line above the refusal that names itself.
//
// THE CLASS: for a settings file `--fix` declines on readability, the finding's fix line is
// a plain `fix:` saying what to do by hand; for a file `--fix` can read, it still offers
// `fix (--fix):`. The judgement is the one the decline makes (`readWalkSettings`).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

function doctorOn(settings) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fix-offer-")));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fix-offer-home-"));
  try {
    fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "");
    fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
    fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the walk\n");
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), settings);
    const r = spawnSync(process.execPath, [BIN, "doctor", "--no-install", "--no-ios", "--target-dir", dir], {
      env: { HOME: home, PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter), NO_COLOR: "1" },
      input: "",
      encoding: "utf8",
      timeout: 60_000,
    });
    const out = String(r.stdout ?? "").replace(/\x1b\[[0-9;]*m/g, "");
    // The finding's own block: its title line, then its indented lines.
    const lines = out.split("\n");
    const at = lines.findIndex((l) => /The walk is installed but not wired up/.test(l));
    assert.ok(at >= 0, `doctor did not report the walk as unwired:\n${out}`);
    const block = [];
    for (let i = at + 1; i < lines.length && /^\s/.test(lines[i]); i++) block.push(lines[i]);
    const fixLine = block.find((l) => /^\s+fix( \(--fix\))?:/.test(l));
    assert.ok(fixLine, `the unwired-walk finding printed no fix line:\n${block.join("\n")}`);
    return fixLine;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// KD-237
const DECLINED_ON_READ = {
  "a file JSON.parse refuses": '{\n  "model": "opus",\n}\n',
  "hooks that is an array": '{\n  "hooks": []\n}\n',
  "a top level that is an array": "[]\n",
};

for (const [shape, settings] of Object.entries(DECLINED_ON_READ)) {
  test(`doctor on ${shape}: the unwired-walk finding does not offer --fix, and says what to do by hand`, () => {
    const fixLine = doctorOn(settings);
    assert.doesNotMatch(fixLine, /fix \(--fix\):/, `offered --fix over a file --fix declines:\n${fixLine}`);
    assert.match(fixLine, /by hand/i, `the fix line does not say what the adopter must do:\n${fixLine}`);
  });
}

test("doctor on a settings file it can read: the unwired-walk finding still offers --fix", () => {
  const fixLine = doctorOn('{\n  "model": "opus"\n}\n');
  assert.match(fixLine, /fix \(--fix\): Add the statusLine and UserPromptSubmit entries/);
});
