// A WORD THE SHELL PASSES AS AN ARGUMENT IS NOT A COMMAND, AND A WRAPPER IN FRONT DOES NOT MAKE IT ONE.
//
// This is the property test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs
// already states ("a word the shell passes as an ARGUMENT does not change the
// directory the gate resolves") in the one place it does not reach: BEHIND a
// wrapper. That sweep spells its rows `echo <word> && cd X && gh pr merge`, and
// `echo` is not a word the command-position declaration accepts — so every row
// of it leaves the wrapper run untouched, and the widening of that run is
// invisible to it.
//
// The widening is a BARE-OPERAND run: an accepted wrapper may now carry up to
// two operands, and the reader has no way to know what those operands mean. It
// reads `time git add .` as `time` plus two operands plus a command position,
// and the word standing in that position is `.` — the sourced-script spelling.
// Measured on this tree, 2026-09-18:
//
//   git add . && cd X && gh pr merge          the gate reads X
//   time git add . && cd X && gh pr merge     REFUSED: "what runs in front of it
//                                             contains a compound command or a
//                                             sourced script (if/for/while/case/
//                                             { }/source)"
//   sudo npm install . && gh pr merge         the same refusal
//   time echo done && gh pr merge             the same refusal
//   time echo gh pr merge                     classified as a MERGE, by a
//                                             command that echoes three words
//
// The shell runs no `if`, no `for`, no `source` and no merge in any of them.
// That is the first of the two errors this file's own comment says COMPOUND has
// already made and been fixed for — "it turned an everyday command in front of a
// merge into a refusal whose sentence named if/for/while/case/{ }/source, none
// of which was in the command, so there was nothing in it for the reader to
// change" — reintroduced one wrapper word to the left of where it was fixed.
//
// THE ORACLE IS `/bin/sh`, in the shape this area is settled on. Nothing here
// asserts a directory or a verdict of its own: the shell is asked whether the
// word is an argument, and then the gate must read the two spellings the same.
// A stand-in `gh`, `npm` and `node` on PATH mean a gated act can be measured and
// can never be run.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { classify, commandCwd, COMMAND_WRAPPERS } from "../scripts/hooks/proof-gate.mjs";

const GATED = "gh pr merge 1 --rebase";
const PROBE = "pwd -P";

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wrapper-argument-")));
const BIN = path.join(tmp, "bin");
const HERE = path.join(tmp, "here");
const X = path.join(tmp, "x");
const MARK = path.join(tmp, "invoked");
for (const d of [BIN, HERE, X]) fs.mkdirSync(d, { recursive: true });
for (const name of ["gh", "npm", "node"]) {
  fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> ${JSON.stringify(MARK)}\n`, { mode: 0o755 });
}
// `sudo` prompts and `timeout` is not on macOS, so the two shapes that matter
// most would otherwise be the two that can never be measured. Each skips its own
// options exactly as the real program documents, so what is measured is still
// the SHELL's answer to which word is the command name.
fs.writeFileSync(path.join(BIN, "sudo"), '#!/bin/sh\nwhile [ $# -gt 0 ]; do case "$1" in -u|-g|-p|-U) shift 2 ;; -*) shift ;; *) break ;; esac; done\nexec "$@"\n', { mode: 0o755 });
fs.writeFileSync(path.join(BIN, "timeout"), '#!/bin/sh\nwhile [ $# -gt 0 ]; do case "$1" in -s|-k) shift 2 ;; -*) shift ;; *) break ;; esac; done\nshift\nexec "$@"\n', { mode: 0o755 });

const sh = (command) =>
  spawnSync("/bin/sh", ["-c", command], {
    cwd: HERE,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` },
  });

/** Whether a real shell invoked any gated program, and what it printed. The marker file, and nothing else, answers the first. */
function run(command) {
  fs.writeFileSync(MARK, "");
  const r = sh(command);
  return { invoked: fs.readFileSync(MARK, "utf8").trim(), out: r.stdout, err: r.stderr };
}

// ─── the classifier ──────────────────────────────────────────────────────────

/**
 * One row per accepted wrapper, each one the same ordinary command: `echo`, with
 * the words of a gated act as its arguments. The wrapper list is read from the
 * hook, so a word added to it arrives here with a row of its own rather than a
 * gap — which is the whole reason the list is exported.
 */
const spellings = {
  "!": (c) => `! ${c}`,
  timeout: (c) => `timeout 5 ${c}`,
  xargs: (c) => `printf 'x\\n' | xargs ${c}`,
};
const ECHOED = COMMAND_WRAPPERS.map((w) => [w, (spellings[w] ?? ((c) => `${w} ${c}`))(`echo ${GATED}`)]);

test("a wrapper in front of an `echo` does not make the echoed words a gated act", { skip: process.platform === "win32" ? "POSIX shell" : false }, () => {
  let ran = 0;
  const claimed = [];
  for (const [wrapper, command] of ECHOED) {
    const { invoked, out } = run(command);
    // Ground truth, both halves: the shell printed the words (so they really were
    // arguments) and invoked nothing gated. A row the platform refuses is not
    // evidence about anything and is dropped rather than scored.
    if (invoked !== "" || !out.includes("gh pr merge")) continue;
    ran += 1;
    const got = classify(command);
    if (got === null) continue;
    claimed.push(`${wrapper}\n    ${JSON.stringify(command)}\n    the shell invoked nothing and printed: ${JSON.stringify(out.trim())}\n    the gate classified it as: ${got}`);
  }
  assert.ok(ran >= 8, `the sweep proves nothing if the shell refused most of it: only ${ran} of ${ECHOED.length} rows ran`);
  assert.deepEqual(
    claimed,
    [],
    `${claimed.length} of ${ran} commands are refused for an act they only print.\n\n${claimed.join("\n\n")}\n\n` +
      "The first live run of this hook refused an `echo` of a JSON payload and then refused the edit that would have fixed it, " +
      "which is why a match is an INVOCATION and not a mention. A wrapper's bare-operand run reinstates the mistake: " +
      "the reader cannot know what a wrapper's operands mean, so it treats the word after them as a command position it does not occupy.",
  );
});

// ─── the directory reader ────────────────────────────────────────────────────

/** Words that are shell keywords at a command position and ordinary arguments anywhere else — the alternation COMPOUND refuses on. */
const ARGUMENT_WORDS = ["if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done", "case", "esac", "select", "function", "source", "eval", "exec", ".", "{", "}"];

/** Wrappers that run a command in this shell and leave it running — no `exec` (it replaces the shell) and no `nohup` (it writes a file). */
const RUNNERS = ["time", "env", "command", "nice", "eval"];

test("a word the shell passes as an ARGUMENT does not change what the gate reads — behind a wrapper as well as in front of one", { skip: process.platform === "win32" ? "POSIX shell" : false }, () => {
  let ran = 0;
  const moved = [];
  for (const wrapper of RUNNERS) {
    for (const word of ARGUMENT_WORDS) {
      // Two spellings of one command, differing only in an operand of `echo`.
      const spelled = `${wrapper} echo ${word} && cd ${X} && ${GATED}`;
      const neutral = `${wrapper} echo word && cd ${X} && ${GATED}`;
      const where = (c) => {
        const r = sh(c.replace(GATED, PROBE));
        const last = r.stdout.split("\n").map((s) => s.trim()).filter(Boolean).at(-1);
        return r.status === 0 && last && path.isAbsolute(last) ? last : null;
      };
      const a = where(spelled);
      const b = where(neutral);
      // If the shell does not run both in the same directory, this row is not
      // about an argument and says nothing about the reader.
      if (a === null || a !== b) continue;
      ran += 1;
      const got = commandCwd("merge", spelled, HERE);
      const same = commandCwd("merge", neutral, HERE);
      if (got.unknown === same.unknown && got.dir === same.dir) continue;
      moved.push(
        `${wrapper} echo ${word}\n    ${JSON.stringify(spelled)}\n` +
          `    the shell runs the merge in: ${a === X ? "X" : a}\n` +
          `    the gate resolved: ${got.unknown ? `UNREADABLE — ${got.unknown}` : got.dir}\n` +
          `    but \`${wrapper} echo word\` in the same place resolved: ${same.unknown ? `UNREADABLE — ${same.unknown}` : same.dir}`,
      );
    }
  }
  assert.ok(ran >= 80, `the sweep proves nothing if the shell refused most of it: only ${ran} rows ran`);
  assert.deepEqual(
    moved,
    [],
    `${moved.length} of ${ran} everyday words change the gate's reading of a command the shell reads identically.\n\n${moved.join("\n\n")}\n\n` +
      "`time git add . && gh pr merge` and `sudo npm install . && gh pr merge` are the shapes this costs, and the sentence the agent is handed " +
      "names if/for/while/case/{ }/source — none of which is in the command, so there is nothing in it to act on. " +
      "A wrapper's bare operands are NOT a command position: the reader cannot tell an operand from the command it precedes, " +
      "and the operand bound picks a word out of the middle of an ordinary command and reads it as one.",
  );
});

process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
