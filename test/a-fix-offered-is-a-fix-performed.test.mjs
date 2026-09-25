// A FIX OFFERED IS A FIX PERFORMED — for every finding, not the one KD-237 named.
//
// KD-237 made the walk-wiring finding stop printing `fix (--fix):` over a settings file `--fix`
// declines. That fixed one finding; the CLASS is any finding whose offer is judged by one reader
// and whose heal by another. The shipped-hooks finding is the next one over: it judges
// "healable" from JSON.parse's view of .claude/settings.json (`healableCommands`), while the heal
// (`planShippedHookHeal`) skips any command whose key is duplicated in the text. On such a file
// doctor prints `fix (--fix):` and `--fix --yes` exits having silently written nothing.
//
// THE INVARIANT, read from doctor's own output and nothing else: run `doctor --fix --yes`, then
// `doctor` again. Whatever the second run still offers as `fix (--fix):` is a fix the first run
// promised and did not perform. A second run with no `fix (--fix):` line is the only honest
// fixed point. The corpus is settings files an adopter can plausibly have; add to it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

function doctor(dir, home, extra) {
  const r = spawnSync(process.execPath, [BIN, "doctor", "--no-install", "--no-ios", ...extra, "--target-dir", dir], {
    env: { HOME: home, PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter), NO_COLOR: "1" },
    input: "",
    encoding: "utf8",
    timeout: 60_000,
  });
  return String(r.stdout ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

const RETIRED_STOP = '{"Stop": [{"hooks": [{"type": "command", "command": "node qa/receipt-check.mjs --hook"}]}]}';

const WIRED_PROMPT =
  '"UserPromptSubmit": [{"matcher": "", "hooks": [{"type": "command", "command": "test -f \\"${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs\\" && node \\"${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs\\" --inject || true"}]}]';
const STATUS = '"statusLine": {"type": "command", "command": "test -f qa/walk-status.mjs && node qa/walk-status.mjs --statusline || true"}';
const WIRED_WITH_RETIRED_STOP = `{"Stop": [{"hooks": [{"type": "command", "command": "node qa/receipt-check.mjs --hook"}]}], ${WIRED_PROMPT}}`;

const CORPUS = {
  "a retired shipped Stop hook": `{\n  "hooks": ${RETIRED_STOP}\n}\n`,
  "a retired shipped Stop hook under a duplicated hooks key": `{\n  "hooks": ${RETIRED_STOP},\n  "hooks": ${RETIRED_STOP}\n}\n`,
  "a wired walk and a retired shipped Stop hook under a duplicated hooks key":
    `{\n  ${STATUS},\n  "hooks": ${WIRED_WITH_RETIRED_STOP},\n  "hooks": ${WIRED_WITH_RETIRED_STOP}\n}\n`,
  "a settings file with no walk wiring": '{\n  "model": "opus"\n}\n',
};

for (const [shape, settings] of Object.entries(CORPUS)) {
  test(`doctor --fix --yes on ${shape}: a second doctor offers no --fix the first one did not perform`, () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fix-performed-")));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fix-performed-home-"));
    try {
      fs.writeFileSync(path.join(dir, "settings.gradle.kts"), "");
      fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
      fs.writeFileSync(path.join(dir, "qa", "walk-status.mjs"), "// stand-in for the walk\n");
      fs.writeFileSync(path.join(dir, "qa", "receipt-check.mjs"), "// stand-in for the gate\n");
      fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".claude", "settings.json"), settings);

      const offered = doctor(dir, home, []);
      doctor(dir, home, ["--fix", "--yes"]);
      const after = doctor(dir, home, []);
      const lines = after.split("\n");
      const unperformed = [];
      lines.forEach((l, i) => {
        if (/^\s+fix \(--fix\):/.test(l)) {
          let t = i - 1;
          while (t >= 0 && /^\s/.test(lines[t])) t -= 1;
          unperformed.push(`${lines[t] ?? "?"}\n${l}`);
        }
      });
      assert.deepEqual(
        unperformed,
        [],
        `doctor offered these --fix heals, --fix --yes ran, and they are still offered:\n` +
          `${unperformed.join("\n")}\n\n--- before --fix ---\n${offered}`
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}
