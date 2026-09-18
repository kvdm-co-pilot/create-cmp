// THE DIRECTORY THE GATE RESOLVES IS THE ONE A SHELL WOULD RUN THE COMMAND IN — OR IT IS UNKNOWN.
//
// `commandCwd` infers a directory from a command STRING, and every verdict the
// proof gate reaches is about the tree that directory sits in. So there is
// exactly one property worth holding it to, and it is not "parse the shell":
//
//   for every command, the gate resolves the directory /bin/sh would run the
//   gated command in, or it resolves NOTHING at all.
//
// Both halves are load-bearing and the second is the settled fail-safe direction
// (docs/GATE-RULES.md, Rule 4: "Everything outside that set REFUSES and says
// why"). A directory the gate resolves WRONGLY is the worst outcome available
// here: if it lands on a worktree that owes nothing the command is allowed
// unproven, and if it lands outside this repository the gate goes SILENT, which
// is the same allow with no message at all. A directory the gate FAILS to read
// falls back on the payload's cwd — which is KD-79 itself, the session's tree
// judged in place of the command's.
//
// THE ORACLE IS A REAL SHELL, not a second opinion about shells. Each shape
// below is run twice: once by `/bin/sh` with the gated command replaced by
// `pwd -P`, which is ground truth by construction, and once by the reader. A
// disagreement is a defect in the reader, never in the oracle. Every construct
// used is POSIX, every command in every shape is `true`, `echo`, `cat` or `cd`
// inside a temp directory, and the gated command is never run.
//
// This is written as ONE assertion over a TABLE because the defect is a class,
// not a shape: each row that fails prints what the shell did and what the gate
// said, so the whole class is visible in one failure rather than one row per
// round of review.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { commandCwd } from "../scripts/hooks/proof-gate.mjs";

/** The gated command, and the probe that stands in its place for the oracle — both plain simple commands, so the shape around them parses identically. */
const GATED = "gh pr merge 1 --rebase";
const PROBE = "pwd -P";

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gate-cwd-oracle-")));
const HERE = path.join(tmp, "here");
const X = path.join(tmp, "x");
const Y = path.join(tmp, "y");
for (const d of [HERE, X, Y, path.join(HERE, "sub")]) fs.mkdirSync(d, { recursive: true });

/**
 * Every shape is one of two things, and the table does not say which — that is
 * the point. Either the shell ends up somewhere the gate must name exactly, or
 * the gate must decline to name it. Nothing here is a shell construct invented
 * to trap a parser: a `cd` inside `if`/`for`/`{ }`, a `cd` quoted inside a
 * commit message or a heredoc, and a `cd` inside a nested `sh -c` are all
 * things written in this repository's own session logs.
 */
const SHAPES = [
  ["a plain cd", `cd ${X} && ${GATED}`],
  ["a cd joined with ;", `cd ${X}; ${GATED}`],
  ["two cds compose", `cd ${X} && cd ${Y} && ${GATED}`],
  ["a relative cd", `cd sub && ${GATED}`],
  ["a cd on its own line", `cd ${X}\n${GATED}`],
  ["a subshell's cd, already closed", `(cd ${X} && true) && ${GATED}`],
  ["a command substitution's cd", `REF=$(cd ${X} && true) && ${GATED}`],
  ["a subshell the command is inside", `(cd ${X} && ${GATED})`],
  ["a cd whose failure is tolerated", `cd ${X} || true; ${GATED}`],
  ["a cd after a pipeline", `true | cat; cd ${X} && ${GATED}`],
  ["a backgrounded subshell's cd", `(cd ${X} && true) & wait; ${GATED}`],
  ["a backgrounded cd, which is a subshell with no parens to count", `cd ${X} & wait; ${GATED}`],
  // ── a cd the shell never performs ────────────────────────────────────────
  ["a cd quoted inside an echo", `echo "a; cd ${X}" && ${GATED}`],
  ["a cd quoted inside a commit message", `echo "wip; cd ${Y}" > /dev/null; ${GATED}`],
  ["a cd inside a heredoc body", `cat <<'EOF' > /dev/null\n; cd ${Y}\nEOF\n${GATED}`],
  ["a cd inside a nested sh -c, which is another process", `sh -c 'cd ${Y} && true' && ${GATED}`],
  ["the same, after a cd of the outer shell", `cd ${X} && sh -c 'cd ${Y} && true' && ${GATED}`],
  // ── a cd the shell DOES perform ──────────────────────────────────────────
  ["a cd inside an if-branch that runs", `if true; then cd ${X}; fi; ${GATED}`],
  ["a cd inside an if-branch that does not run", `if false; then cd ${X}; fi; ${GATED}`],
  ["a cd inside a loop body", `for d in a; do cd ${X}; done; ${GATED}`],
  ["a cd inside a brace group, which is not a subshell", `{ cd ${X}; }; ${GATED}`],
  // THE PAREN COUNT IS NOT A PARSER, AND ITS ERROR FALLS BOTH WAYS. An
  // unbalanced `)` in a quoted word drops a `cd` the shell DID perform, back
  // onto the payload's cwd; an unbalanced `(` keeps a `cd` whose subshell had
  // already closed. The first is KD-79's own mistake; the second resolves a
  // directory the command never visits. One shape of each, so a fix that only
  // catches the fallback direction is not mistaken for a fix of the class.
  ["a cd followed by an unbalanced ) in a quoted word", `cd ${X} && echo "done)" && ${GATED}`],
  ["a cd followed by an unbalanced ( in a quoted word", `cd ${X} && echo "done(" && ${GATED}`],
  ["a closed subshell's cd, kept alive by an unbalanced ( in a quoted word", `(cd ${X} && true) && echo "(" && ${GATED}`],
];

/** Where /bin/sh actually runs the gated command: the last line the probe printed, from a shell started in HERE. */
function whereTheShellRuns(command) {
  const r = spawnSync("/bin/sh", ["-c", command.replace(GATED, PROBE)], { cwd: HERE, encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, `the oracle shape did not run cleanly, so it cannot be ground truth: ${command}\n${r.stderr}`);
  const lines = r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  assert.ok(path.isAbsolute(lines.at(-1) ?? ""), `the oracle printed no directory for: ${command}`);
  return lines.at(-1);
}

test("the directory the gate resolves is the one a shell would run the command in, or it is unknown", () => {
  const wrong = [];
  for (const [how, command] of SHAPES) {
    const truth = whereTheShellRuns(command);
    const got = commandCwd("merge", command, HERE);
    // Declining is always allowed: an unreadable tree is refused, never guessed
    // at, and that is the direction this gate is settled on.
    if (got.unknown || got.dir === truth) continue;
    wrong.push(
      `${how}\n    command: ${JSON.stringify(command)}\n    the shell runs it in: ${got.dir === HERE ? "the payload's cwd" : truth}\n    the gate resolved:    ${got.dir}${got.dir === HERE ? " (the payload's cwd — KD-79's own mistake, unfixed for this shape)" : ""}`,
    );
  }
  assert.deepEqual(
    wrong,
    [],
    `${wrong.length} of ${SHAPES.length} shapes resolve a directory the command will not run in.\n\n${wrong.join("\n\n")}\n\n` +
      "Each one is a verdict about the wrong tree. Resolving a tree that owes nothing ALLOWS the command; " +
      "resolving one outside this repository makes the gate SILENT, which is the same allow without a message. " +
      "The honoured set is small on purpose (docs/GATE-RULES.md, Rule 4) — a shape outside it must reach `{ unknown }`, " +
      "not the payload's cwd and not a directory read out of a quoted word.",
  );
});

test("the oracle is an oracle: a shape whose cd the shell performs is not scored as one it does not", () => {
  // The table above is only worth anything if the two answers are independent.
  // These two shapes differ by ONE character, they are on opposite sides of the
  // property, and the shell — not this file — is what says which is which.
  assert.equal(whereTheShellRuns(`if true; then cd ${X}; fi; ${GATED}`), X);
  assert.equal(whereTheShellRuns(`if false; then cd ${X}; fi; ${GATED}`), HERE);
  assert.equal(whereTheShellRuns(`sh -c 'cd ${Y} && true' && ${GATED}`), HERE, "a nested shell's cd dies with that process");
  assert.equal(whereTheShellRuns(`{ cd ${X}; }; ${GATED}`), X, "a brace group is not a subshell");
});

// A SHELL KEYWORD IS ONLY A KEYWORD AT A COMMAND POSITION. `done` after `echo`
// is a word; `.` after `git add` is a directory; `case` in `ls case` is a file.
// A reader that refuses on the SPELLING refuses `git add . && gh pr merge` and
// `echo done && gh pr merge` — everyday commands, with a sentence naming
// if/for/while/case/{ }/source, none of which are there. That is the other
// half of the table above and it needs its own property, because the one above
// is satisfied by refusing: a refusal is always allowed to be right about the
// directory, and never about the command it was reading.
//
// THE INVARIANT IS DIFFERENTIAL, so nothing here asserts a directory of its
// own: changing a word the SHELL passes as an argument must not change what the
// gate resolves. The shell is asked first, on both spellings, so the claim that
// the word is an argument is measured and not assumed.
const ARGUMENT_WORDS = ["if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done", "case", "esac", "select", "function", "source", "eval", "exec", ".", "{", "}"];

test("a word the shell passes as an ARGUMENT does not change the directory the gate resolves", () => {
  const moved = [];
  for (const word of ARGUMENT_WORDS) {
    // Two spellings of one command, differing only in an operand of `echo`.
    const spelled = `echo ${word} && cd ${X} && ${GATED}`;
    const neutral = `echo word && cd ${X} && ${GATED}`;
    assert.equal(
      whereTheShellRuns(spelled),
      whereTheShellRuns(neutral),
      `the shell must run both spellings in the same directory, or this row is not about an argument: ${spelled}`,
    );
    const a = commandCwd("merge", spelled, HERE);
    const b = commandCwd("merge", neutral, HERE);
    if (a.unknown === b.unknown && a.dir === b.dir) continue;
    moved.push(`echo ${word}\n    ${JSON.stringify(spelled)}\n    resolved: ${a.unknown ? `UNREADABLE — ${a.unknown}` : a.dir}\n    but \`echo word\` in the same place resolved: ${b.unknown ? `UNREADABLE — ${b.unknown}` : b.dir}`);
  }
  assert.deepEqual(
    moved,
    [],
    `${moved.length} of ${ARGUMENT_WORDS.length} everyday words change the gate's reading of a command the shell reads identically.\n\n${moved.join("\n\n")}\n\n` +
      "Each one is a command refused for a construct it does not contain — `git add . && gh pr merge`, `echo done && gh pr merge` — " +
      "and the sentence the agent is given names if/for/while/case/{ }/source, so there is nothing in it to act on. " +
      "A shell keyword is a keyword at a COMMAND POSITION and an argument anywhere else; the reader must ask which of the two it found.",
  );
});

process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
