// THE GATE'S READING OF A COMMAND IS BOUNDED BY THE COMMAND'S LENGTH, NOT BY ITS SHAPE.
//
// `.claude/settings.json` gives this hook 10 seconds on EVERY Bash call, and
// test/the-proof-gate-can-outlive-the-timeout-its-own-wiring-declares.test.mjs
// already states what the number means: "a PreToolUse decision that is never
// delivered is not a refusal, it is a permitted command". That test bounds the
// SUBPROCESSES the gate spawns. Nothing bounds the gate's own reading of the
// command string — and the command string is the one input an agent controls
// completely.
//
// `COMMAND_PREFIX` is a regex with nested quantifiers, and two of its
// alternatives overlap: a `VAR=value` token can be consumed either as a bare
// operand of the wrapper in front of it or as an assignment iteration of its
// own. Both paths consume the same characters, so every `<wrapper> <assignment>`
// pair doubles the number of ways the prefix can be parsed, and the engine walks
// all of them before it can fail. Measured on this tree, 2026-09-18, with
// `classify()` on a REAL `gh pr merge` behind that prefix:
//
//     26 pairs   256 chars   11.6 s      <- past the 10 s budget
//     24 pairs   238 chars    2.9 s
//     22 pairs   220 chars    0.73 s
//     20 pairs   181 chars    0.075 s
//
// The same string against the reader this slice replaced (origin/main's
// `invocation()`, which had no bare-operand run and so no overlap) is 0.15 ms at
// any of those lengths, and flat at 120 pairs. So this is not "a regex is slow":
// it is a reading whose cost is exponential in the length of a command an agent
// may type, in the one process whose lateness is an allow.
//
// The invariant is the growth, not the millisecond: a reader of a command
// position costs what the command's LENGTH costs. Both halves below are written
// so that a linear reader passes them on any machine, however slow.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { classify } from "../scripts/hooks/proof-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = path.join(ROOT, "scripts", "hooks", "proof-gate.mjs");

/**
 * The pair that overlaps: a wrapper word the list accepts, then an assignment
 * the same list accepts twice over — once as that wrapper's operand, once as an
 * iteration of its own. Nothing here is exotic; `env NODE_ENV=x` is the shape
 * the declaration exists to read.
 */
const pairs = (n) => "env NODE_ENV=x ".repeat(n);
const MERGE = "gh pr merge 1 --rebase --delete-branch";

/** The budget this hook's own wiring gives it, in ms — read from the wiring, never spelled here. */
function declaredBudgetMs() {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8"));
  const entry = (settings.hooks?.PreToolUse ?? []).flatMap((e) => e.hooks ?? []).find((h) => String(h.command ?? "").includes("scripts/hooks/proof-gate.mjs"));
  assert.ok(entry, "the PreToolUse wiring must name this hook");
  return (typeof entry.timeout === "number" ? entry.timeout : 60) * 1000;
}

/** The best of three, so one GC pause does not decide a review. */
function costMs(command) {
  let best = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const t0 = process.hrtime.bigint();
    classify(command);
    best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return best;
}

test("classifying a command costs what its LENGTH costs — doubling the prefix does not square the work", () => {
  // Scale-invariant on purpose: a slow machine makes both numbers bigger and
  // leaves the ratio alone, so this asserts the SHAPE of the growth and never a
  // millisecond. A reader that is linear in the command's length answers with a
  // ratio near 2 for twice the length; 10 is a ceiling nothing linear approaches.
  const short = `${pairs(10)}${MERGE}`;
  const long = `${pairs(20)}${MERGE}`;
  const tShort = costMs(short);
  const tLong = costMs(long);
  const ratio = tLong / Math.max(tShort, 0.01);
  assert.ok(
    ratio < 10,
    `doubling a ${short.length}-character command to ${long.length} multiplied the classifier's work by ${ratio.toFixed(0)}x (${tShort.toFixed(2)}ms -> ${tLong.toFixed(2)}ms).\n\n` +
      "That is exponential, not linear, and the cost is paid on EVERY Bash call this hook sees. " +
      "The overlap is in COMMAND_PREFIX: a `VAR=value` token matches both the wrapper's bare-operand run and the assignment alternative, " +
      "so each `<wrapper> <assignment>` pair doubles the parses the engine must walk before it can fail. " +
      "Make the alternatives disjoint (an operand is not an assignment) or bound the run — the shared declaration is the right place, and there is only one of it.",
  );
});

test("the hook answers inside its declared budget whatever the command string says", { skip: process.platform === "win32" ? "POSIX shell" : false }, () => {
  // The consequence, end to end and through the real wiring: a command that
  // WILL merge, behind a prefix of the words the declaration accepts. Past the
  // budget the hook is killed, its verdict is never delivered, and an unproven
  // merge runs with no gate in the path — the same fail-open KD-107 was, reached
  // through the reader that replaced it rather than around it.
  const budgetMs = declaredBudgetMs();
  const command = `${pairs(26)}${MERGE}`;
  assert.ok(command.length < 600, "the string an agent would have to type is short enough to be typed");

  const started = Date.now();
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
    timeout: budgetMs,
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
  });
  const elapsed = Date.now() - started;

  assert.equal(
    r.signal,
    null,
    `the hook had to be killed after ${elapsed}ms on a ${command.length}-character command. ` +
      `Past its ${budgetMs}ms budget the decision it was holding is never delivered, and the merge it was reading runs unproven — ` +
      "a fail-open at the door, reached by the length of the command rather than by its wrapper word.",
  );
  assert.ok(
    elapsed < budgetMs,
    `the hook answered in ${elapsed}ms, past the ${budgetMs}ms its own .claude/settings.json allows it, on a ${command.length}-character command.`,
  );
});
