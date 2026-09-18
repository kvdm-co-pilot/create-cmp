// NO TOKEN THE COMMAND-POSITION PREFIX ACCEPTS IS READABLE TWO WAYS — GENERATED, NOT LISTED.
//
// test/the-command-position-reader-can-spend-the-whole-gate-budget-on-one-command.test.mjs
// states the consequence and why it is a fail-open: `COMMAND_PREFIX` is a
// quantified alternation, a token two of its alternatives can both consume
// doubles the parses the engine walks per occurrence, and past the hook's 10s
// PreToolUse budget a verdict is never delivered — which is an allow. It carries
// a TABLE, one row per overlapping token shape, and that table has twice been
// one row short of the truth: `env NODE_ENV=x` was found by review, and
// `sudo -u A=1` — an assignment-shaped FLAG VALUE — was found by a mutation run
// afterwards, in a declaration that had just been declared disjoint.
//
// Two named rows cannot answer "is the disjointness COMPLETE?", and the next
// overlap will arrive the way both of these did: as a letter added to
// WRAPPER_ARITY whose value slot a second alternative can also read. So this
// file GENERATES the token shapes from the wrapper list itself — every wrapper,
// every letter the reader treats as value-taking, each value slot filled with a
// bare word, with an assignment, with an assignment joined to the flag, and with
// a token that is assignment-SHAPED but not a legal name — then walks every
// ordered pair of them: 20736 shapes on this tree, both readers, in about a
// second. A wrapper or a letter added tomorrow is swept without anyone writing
// a row.
//
// WHY AN ABSOLUTE CAP AND NOT A RATIO. The named-row file asserts that doubling
// a command does not square the work, which is the right shape for two rows read
// by a human. Generated, it is the wrong instrument: a linear reader answers all
// 20736 of these in microseconds, where the clock's own resolution makes ratios
// of 100x out of nothing — measured here, 19 shapes "grew" 12x to 300x and every
// one of them was noise at 0.0ms. So each shape is read ONCE at twenty-six
// repetitions, which is the length the named-row file measured a real overlap
// at (11.6s, past the budget), and the cap is 200ms against a worst observed
// 4.6ms on this tree. The margin is three orders of magnitude, so no machine's
// slowness reds this and no exponential survives it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { classify, commandCwd, COMMAND_WRAPPERS } from "../scripts/hooks/proof-gate.mjs";

const MERGE = "gh pr merge 1 --rebase --delete-branch";
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The length a real overlap was measured to cost 11.6s at, and the cap, in ms. */
const REPEATS = 26;
const CAP_MS = 200;

/** Both readers embed the shared declaration, and both are on the PreToolUse path, so both spend the same budget. */
const READERS = [
  ["classify", (s) => classify(s)],
  ["commandCwd", (s) => commandCwd("merge", s, "/here")],
];

/**
 * The letters the reader treats as carrying a SEPARATE value — read off the
 * reader, so no copy of its table lives here. With `-L` swallowing `echo`, the
 * words behind it land in a command position and the reader answers `merge`;
 * a letter it does not know ends the run at `echo` and it answers null.
 */
const valueTaking = (w) => [...LETTERS].filter((L) => classify(`${w} -${L} echo ${MERGE}`) !== null);

/** One repeatable token shape per accepted spelling, plus the two alternatives that stand beside the wrapper run. */
const UNITS = [
  ...COMMAND_WRAPPERS.flatMap((w) => [
    `${w} `,
    `${w} -q `,
    ...valueTaking(w).flatMap((L) => [`${w} -${L} v `, `${w} -${L} A=1 `, `${w} -${L}A=1 `, `${w} -${L} 1=2 `]),
  ]),
  "A=1 ",
  "A= ",
  "1=2 ",
  "2>x ",
  ">x ",
  "timeout 300 ",
];

const costMs = (read, s) => {
  const t0 = process.hrtime.bigint();
  read(s);
  return Number(process.hrtime.bigint() - t0) / 1e6;
};

test("no prefix shape the declaration accepts costs a measurable fraction of the gate's budget — on either reader", () => {
  assert.ok(UNITS.length > 20, `the sweep proves nothing if the reader accepts almost nothing: ${UNITS.length} shapes generated`);

  const shapes = [];
  for (const a of UNITS) {
    shapes.push(a);
    for (const b of UNITS) if (a !== b) shapes.push(a + b);
  }

  const slow = [];
  let read = 0;
  outer: for (const shape of shapes) {
    for (const [name, reader] of READERS) {
      const command = shape.repeat(REPEATS) + MERGE;
      read += 1;
      const first = costMs(reader, command);
      if (first <= CAP_MS) continue;
      // A borderline reading is confirmed once, so a scheduler hiccup does not
      // decide a review; a reading many times over the cap is not borderline and
      // is not paid for twice. Then STOP — on a tree where this fails, each
      // further shape costs tens of seconds to measure and the first one already
      // names the overlap.
      const again = first > CAP_MS * 5 ? first : costMs(reader, command);
      if (again <= CAP_MS) continue;
      slow.push(`${name}: ${JSON.stringify(shape)} x${REPEATS} (${command.length} characters) took ${again.toFixed(0)}ms`);
      break outer;
    }
  }

  assert.deepEqual(
    slow,
    [],
    `${slow.length} of ${read} generated prefix shapes cost more than ${CAP_MS}ms to read, where every other shape on this tree costs under 5ms.\n\n${slow.join("\n\n")}\n\n` +
      "Some token in the shape is readable by two of COMMAND_PREFIX's alternatives, so every occurrence doubles the parses the engine walks before it can fail. " +
      "The gate spends that on EVERY Bash call, inside a 10s PreToolUse budget it does not get to overrun — a verdict delivered late is never delivered, and that is an allow. " +
      "Make the alternatives disjoint at the root (a flag's value is not an assignment, and not a wrapper) rather than bounding the run: " +
      "the shared declaration is the right place, and there is only one of it.",
  );
});
