// A COMMAND POSITION IS A SEPARATOR PLUS THE WRAPPERS NOBODY REMEMBERS.
//
// `commandCwd` reads which tree a gated command will act on, and `COMPOUND` is
// the half that REFUSES rather than read: `if`, `for`, `while`, `case`, a brace
// group, a sourced script — forms whose control flow decides whether a `cd` ran
// at all, which no regex over text can answer. What counts as one of those is
// decided by where the keyword STANDS, and that boundary was wrong twice in two
// commits, once in each direction:
//
//   "preceded by whitespace"   matched `done`, `for` and `.` as ARGUMENTS —
//                              `git add .`, `echo done` — and turned an everyday
//                              command in front of a merge into a refusal naming
//                              constructs that were not in it.
//   "preceded by a separator"  missed `time . ./s.sh`, `! source ./s.sh`,
//                              `FOO=bar . ./s.sh`, `2>/dev/null . ./s.sh` — six
//                              shapes where a sourced script MOVES the shell and
//                              the gate answered for the session's tree instead.
//                              That is KD-79's own failure, re-opened by its fix.
//
// The second is the worse direction and the harder one to notice, because it is
// silent: nothing is refused, a directory is simply wrong. `invocation()` in the
// same file has always spelled a command position as a separator plus an optional
// run of wrappers (`nohup|time|env|…`) and `VAR=value` assignments; this is the
// test that the file's two readers agree about where a command begins.
//
// THE ORACLE IS `/bin/sh`. Every shape below is run by a real shell with the
// gated command replaced by `pwd -P`, so "this construct moves the directory" is
// measured rather than asserted — and a shape the shell REFUSES is dropped rather
// than scored, because a syntax error is not ground truth about anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { commandCwd } from "../scripts/hooks/proof-gate.mjs";

const GATED = "gh pr merge 1 --rebase";
const PROBE = "pwd -P";

/** Forms whose control flow decides whether the `cd` runs — the class COMPOUND exists to refuse. */
const CONSTRUCTS = (x) => [
  ["if-branch taken", `if true; then cd ${x}; fi`],
  ["if-branch not taken", `if false; then cd ${x}; fi`],
  ["if/else", `if false; then true; else cd ${x}; fi`],
  ["if/elif", `if false; then true; elif true; then cd ${x}; fi`],
  ["brace group", `{ cd ${x}; }`],
  ["for loop", `for d in a; do cd ${x}; done`],
  ["while loop", `while false; do cd ${x}; done`],
  ["until loop", `until true; do cd ${x}; done`],
  ["case", `case a in a) cd ${x};; esac`],
  ["dot-sourced script", `. ${x}/s.sh`],
  ["source-sourced script", `source ${x}/s.sh`],
  ["eval", `eval cd ${x}`],
];

/** Every place a construct may legally stand as a command position — separators, and the wrappers in front of them. */
const CONTEXTS = (here) => [
  ["at the start", (c) => `${c}; ${GATED}`],
  ["after ;", (c) => `true; ${c}; ${GATED}`],
  ["after &&", (c) => `true && ${c}; ${GATED}`],
  ["after ||", (c) => `false || ${c}; ${GATED}`],
  ["after a newline", (c) => `true\n${c}\n${GATED}`],
  ["inside a brace group", (c) => `{ ${c}; }; ${GATED}`],
  ["after `time`", (c) => `time ${c}; ${GATED}`],
  ["after `!`", (c) => `! ${c}; ${GATED}`],
  ["after an assignment", (c) => `FOO=bar ${c}; ${GATED}`],
  ["after a redirection", (c) => `2>/dev/null ${c}; ${GATED}`],
  ["after a leading tab", (c) => `true;\t${c}; ${GATED}`],
  ["after a prior cd", (c) => `cd ${here} && ${c}; ${GATED}`],
];

test("a construct this reader cannot follow is refused wherever it legally stands", { skip: process.platform === "win32" ? "POSIX shell" : false }, () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "compound-sweep-")));
  const here = path.join(tmp, "here");
  const x = path.join(tmp, "x");
  try {
    for (const d of [here, x]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(x, "s.sh"), `cd ${x}\n`);

    /** Where a real shell ends up — or null when it refused the shape, which is not ground truth. */
    const shellCwd = (command) => {
      const r = spawnSync("/bin/sh", ["-c", command.replace(GATED, PROBE)], { cwd: here, encoding: "utf8", timeout: 10000 });
      if (r.status !== 0) return null;
      const last = r.stdout.split("\n").map((s) => s.trim()).filter(Boolean).at(-1);
      return last && path.isAbsolute(last) ? last : null;
    };

    let ran = 0;
    const read = [];
    for (const [cname, construct] of CONSTRUCTS(x)) {
      for (const [ctx, build] of CONTEXTS(here)) {
        const command = build(construct);
        const truth = shellCwd(command);
        if (truth === null) continue;
        ran += 1;
        const got = commandCwd("merge", command, here);
        // REFUSING IS THE ONLY RIGHT ANSWER HERE, including when the construct
        // happens not to move the directory: `if false; then cd X; fi` leaves the
        // shell where it was, and a reader that "got it right" did so by not
        // following the branch it also would not have followed the other way.
        if (!got.unknown) {
          read.push(
            `${cname} / ${ctx}\n    ${JSON.stringify(command)}\n` +
              `    the shell ends in: ${truth === here ? "the payload's cwd" : truth}\n` +
              `    the gate resolved: ${got.dir === here ? "the payload's cwd" : got.dir}${got.dir === truth ? "" : "   <- and it is WRONG"}`,
          );
        }
      }
    }

    assert.ok(ran >= 100, `the sweep proves nothing if the shell refused most of it: only ${ran} shapes ran`);
    assert.deepEqual(
      read,
      [],
      `${read.length} of ${ran} shapes were READ instead of refused. A command position is a separator PLUS an optional run of wrappers and assignments — the spelling invocation() already uses in this file. Where the two readers disagree about where a command begins, the gate answers for a tree the command will not act on, which is KD-79 itself:\n\n${read.join("\n\n")}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("the sweep is pointed at the reader that is actually shipped", () => {
  // The import above could drift to a copy; this pins that the function under
  // test is the one the hook file exports and the wiring runs.
  const hook = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/hooks/proof-gate.mjs");
  assert.match(fs.readFileSync(hook, "utf8"), /export function commandCwd\(/, "commandCwd must be exported from the hook the settings file names");
  assert.equal(typeof commandCwd, "function");
});
