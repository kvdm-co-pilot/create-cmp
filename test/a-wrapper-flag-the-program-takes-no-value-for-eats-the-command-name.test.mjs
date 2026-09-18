// A FLAG THE PROGRAM TAKES NO VALUE FOR MAKES THE READER EAT THE COMMAND NAME.
//
// test/a-wrapper-turns-the-words-behind-it-into-a-command-they-are-not.test.mjs
// closed the first spelling of this: a wrapper carrying BARE OPERANDS puts a
// command position where the shell has none, so `time echo gh pr merge` was read
// as a merge by a command that prints three words. The fix replaced the operand
// run with a per-wrapper table of the options that wrapper "takes a separate
// value for" — and the table is a CLAIM ABOUT THIRTEEN REAL PROGRAMS that
// nothing asks the programs about. Where the claim is wrong the operand run is
// back, one letter wide: the reader swallows the word after the flag, and the
// word after THAT is put in a command position the shell does not put one in.
//
// That sweep spells one row per wrapper and no row with a flag, so every letter
// in the table is invisible to it. Measured on this tree, 2026-09-18, against
// the real programs on this machine:
//
//   caffeinate -u echo gh pr merge 1 --rebase    the shell PRINTED "gh pr merge 1 --rebase"
//                                                and invoked nothing; the gate: MERGE
//   env -S echo gh pr merge 1 --rebase           the shell PRINTED the same words
//                                                and invoked nothing; the gate: MERGE
//
// `caffeinate -u` declares the user active and takes no value (`-t` carries its
// timeout); `env -S`'s value IS the command line it splits, so the word after it
// is never a command. The consequence is the one the hook made on its first live
// run — an act that is only MENTIONED is refused — and it is not only the
// classifier: `caffeinate -u echo . && cd X && gh pr merge` is refused with
// "contains a compound command or a sourced script (if/for/while/case/{ }/source)"
// while `caffeinate -u echo word && cd X && gh pr merge` reads X, and the shell
// runs the two identically. The `.` is an argument of `echo`; only the eaten
// word puts it in a command position.
//
// THE INVARIANT, AND WHY IT IS NOT A LIST: every letter this reader treats as
// value-taking must be one the program really takes a value for. The letters are
// discovered from the READER — no second copy of the table lives here — and the
// answer comes from `/bin/sh` running the command, so a letter added to
// WRAPPER_ARITY tomorrow arrives here with a row of its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { classify, COMMAND_WRAPPERS } from "../scripts/hooks/proof-gate.mjs";

const GATED = "gh pr merge 1 --rebase";
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** `xargs` reads its list from stdin or it hangs; everything else runs as written. */
const spell = (wrapper, letter) => `${wrapper === "xargs" ? "printf 'x\\n' | " : ""}${wrapper} -${letter} echo ${GATED}`;

/**
 * The letters the READER believes carry a separate value, read off the reader
 * itself rather than copied from its table: with `-L` swallowing `echo`, the
 * gated words behind it land in a command position and the gate answers `merge`.
 * A letter the reader does not know ends the run at `echo`, which is the command,
 * and the gate answers null.
 */
const VALUE_TAKING = COMMAND_WRAPPERS.flatMap((w) => [...LETTERS].filter((L) => classify(spell(w, L)) !== null).map((L) => [w, L]));

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wrapper-flag-")));
const BIN = path.join(tmp, "bin");
const MARK = path.join(tmp, "invoked");
fs.mkdirSync(BIN, { recursive: true });
fs.writeFileSync(path.join(BIN, "gh"), `#!/bin/sh\nprintf '%s\\n' "gh $*" >> ${JSON.stringify(MARK)}\n`, { mode: 0o755 });

/** Whether a real shell invoked the gated program, and what it printed. The marker file, and nothing else, answers the first. */
function run(command) {
  fs.writeFileSync(MARK, "");
  const r = spawnSync("/bin/sh", ["-c", command], {
    cwd: tmp,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` },
  });
  return { invoked: fs.readFileSync(MARK, "utf8").trim(), out: r.stdout ?? "" };
}

test("a wrapper flag the reader takes a value for is one the program takes a value for", { skip: process.platform === "win32" ? "POSIX shell" : false }, () => {
  assert.ok(VALUE_TAKING.length > 0, "the reader accepts no flag values at all — this sweep is measuring nothing");

  let ran = 0;
  const claimed = [];
  for (const [wrapper, letter] of VALUE_TAKING) {
    const command = spell(wrapper, letter);
    const { invoked, out } = run(command);
    // THE SHELL ANSWERS THIS IN ONE OF TWO WAYS, AND BOTH ARE EVIDENCE — which
    // is the difference between a sweep that measures the table and one that can
    // only run while the table is wrong. Either the program CONSUMED `echo` as
    // the flag's value, in which case the gated words became the command and the
    // stand-in `gh` recorded itself (the letter is right, and this row confirms
    // it); or the program did not, in which case `echo` was the command and it
    // PRINTED them (the letter is wrong, and the reader has put a command
    // position where the shell has none). A row where neither happened — an
    // unsupported flag, a program this platform does not have, a `sudo` with no
    // tty — is not evidence about anything and is dropped rather than scored.
    const consumed = invoked !== "";
    const printed = out.includes("gh pr merge");
    if (!consumed && !printed) continue;
    ran += 1;
    if (consumed) continue;
    const got = classify(command);
    if (got === null) continue;
    claimed.push(`${wrapper} -${letter}\n    ${JSON.stringify(command)}\n    the shell invoked nothing and printed: ${JSON.stringify(out.trim())}\n    the gate classified it as: ${got}`);
  }

  assert.ok(ran >= 1, `the sweep proves nothing if the shell refused every row: 0 of ${VALUE_TAKING.length} letters ran on this platform`);
  assert.deepEqual(
    claimed,
    [],
    `${claimed.length} of ${ran} measurable flag letters are declared value-taking by the reader and are not value-taking on the program.\n\n${claimed.join("\n\n")}\n\n` +
      "Each one swallows the command name and puts the word behind it in a command position the shell does not put one in — " +
      "the bare-operand defect the per-wrapper table replaced, one letter wide. The gate refuses an act that is only printed, " +
      "and `<wrapper> -<letter> echo . && cd X && gh pr merge` is refused for a sourced script that is an argument of `echo`. " +
      "A letter belongs in WRAPPER_ARITY only if the program consumes the next word for it; the shell above is the source of truth for that, not the man page a reader remembers.",
  );
});

process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
