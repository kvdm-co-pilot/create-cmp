// AN INTERRUPT AT THE PROMPT IS REPORTED AS THE INPUT HAVING ENDED, AND THOSE
// ARE DIFFERENT FACTS ABOUT WHO WAS THERE.
//
// install/interview.mjs is built around one distinction, stated in its own
// header and again over `askOne`: "three outcomes, because 'no answer' and 'no
// more input' are different facts about who was there." The command downstream
// spends that distinction — `ladderSummary` prints the interview's OWN sentence
// rather than one of its own, for the reason it gives in place: "'you skipped
// every question' and 'the input ended before the first one' are different
// things that both arrive as an empty map — and only the interview knows which
// happened. Reporting the first when it was the second is a small lie in the one
// place this feature exists to stop telling them."
//
// There is a third fact, and it is the one a human actually produces: THEY
// PRESSED THE INTERRUPT KEY. It is not "the input ended" — nothing ended, the
// terminal is still there, the person is still standing in front of it — and it
// is the only one of the three that says *stop*.
//
// WHY IT IS NEW HERE, AND NOT SOMETHING THE TERMINAL ALWAYS DID. `prooflane
// init` never read a key before this slice, so ^C was delivered by the kernel as
// SIGINT and killed the process. An interview puts the TTY in raw mode, and from
// that moment readline owns ^C: with no `SIGINT` listener attached it simply
// closes the interface (node's `_ttyWrite`). The pending `rl.question` rejects
// through the AbortController this file installs for the END-OF-INPUT case,
// `askOne` returns `{ kind: "ended" }`, and the interrupt has become the other
// fact on the way out.
//
// MEASURED, NOT REASONED — twice, and they agree.
//
//   (1) Under a real pty on 2026-09-11, `prooflane init <dir>`, ^C at the first
//       question:
//
//         [1-3 · enter takes 1 · ? explains · s skips]
//         ✓ 52 files written
//           ladder   asked — the input ended before ladder.l2Execution was answered …
//
//       exit 0, a complete harness installed into the tree, and a sentence about
//       an input ending told to somebody whose input did not end.
//
//   (2) Over the TTY-shaped streams below — the form this test uses, because
//       `node --test` has no terminal — the two sessions come back byte-for-byte
//       identical at every field, with and without an answer already recorded.
//
// THE CLASS, NOT THE INSTANCE, and this slice has already paid for the class
// once: "a decline at L3 was reported to the author as a decline at L2" was the
// same shape one layer down, and test/the-profile-reports-an-answer-nobody-gave
// .test.mjs now refuses it where the profile is written. Nothing refuses it
// where the report is MADE. So this asserts the general property rather than any
// particular sentence: every way a session at the prompt can end produces a
// result its caller can tell apart. It takes no position on what the
// distinguished outcome should be called, or on whether an interrupted install
// should still write — those are the author's to decide, and a test that pinned
// either would be a reviewer deciding them.
//
// THE FIX IS AVAILABLE, which is why this is a defect and not a limitation:
// `rl.on("SIGINT", …)` fires over these same streams instead of the bare close,
// verified on node v24.18.0 before this test was written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";

import { askLadderMenu } from "../packages/harness/install/interview.mjs";
import { CONTRACT, MENU_FIELDS, contractAt } from "../packages/harness/src/lib/profile-contract.mjs";

/** What a terminal sends for ctrl-C. Spelled by code point: the byte itself is invisible in a diff. */
const INTERRUPT = String.fromCharCode(3);

/** The end of the input, with nobody having pressed anything. */
const ENDED = Symbol("ended");

const MENU = MENU_FIELDS.filter((p) => p.startsWith("ladder."));

/**
 * The keystroke that answers a field WITHOUT declining its rung, so the next
 * question is actually reached. Read off the contract, never typed here: a field
 * that grows a menu next week is driven the day it does.
 */
function answerKey(path) {
  const spec = contractAt(path);
  const i = spec.options.findIndex((o) => o !== spec.declinesRung);
  assert.notEqual(i, -1, `${path} offers no option that keeps the interview going — this test cannot reach the field above it`);
  return String(i + 1);
}

/**
 * One interview over streams shaped like a terminal.
 *
 * `isTTY` on both ends is what puts readline in terminal mode, and terminal mode
 * is the whole subject: it is the mode in which ^C stops being a signal the
 * kernel delivers and becomes a byte readline interprets. A PassThrough without
 * it reproduces a PIPE, which `init` refuses to interview over at all.
 *
 * `answered` questions are answered normally; the question after them is met
 * with `how` — the interrupt byte, or the input ending under it.
 */
async function sessionEndingWith(how, answered) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  let prompts = 0;
  let printed = "";
  const output = new Writable({
    write(chunk, _enc, cb) {
      const text = String(chunk);
      printed += text;
      // A prompt is the one thing written without a trailing newline — the same
      // rule test/ladder-interview.test.mjs's driver uses.
      if (!text.endsWith("\n")) {
        prompts += 1;
        const n = prompts;
        setImmediate(() => {
          if (n <= answered) input.write(`${answerKey(MENU[n - 1])}\n`);
          else if (how === ENDED) input.end();
          else input.write(how);
        });
      }
      cb();
    },
  });
  output.isTTY = true;
  output.columns = 80;

  const result = await askLadderMenu({ input, output, interactive: true });
  return { ...result, printed };
}

test("an interrupt at the prompt and an input that ended are the same result", { timeout: 20000 }, async () => {
  assert.ok(MENU.length >= 1, "the contract offers no menu — this test has nothing to drive");

  const collapsed = [];
  // Every position where a question is still OUTSTANDING when the session ends.
  // With all of them answered the interview has already returned and neither
  // event reaches it, which is not this test's subject.
  for (let answered = 0; answered < MENU.length; answered += 1) {
    const interrupted = await sessionEndingWith(INTERRUPT, answered);
    const ended = await sessionEndingWith(ENDED, answered);

    // The control, and it is load-bearing: if the driver stopped reaching the
    // interview at all, both sides would come back as the same empty nothing and
    // this test would be measuring its own silence.
    assert.equal(interrupted.asked, true, `the interview was never entered at ${answered} answer(s) — this test is inert`);
    assert.ok(interrupted.printed.length > 0, `nothing was printed at a human at ${answered} answer(s) — this test is inert`);

    const a = { answers: interrupted.answers, why: interrupted.why, asked: interrupted.asked };
    const b = { answers: ended.answers, why: ended.why, asked: ended.asked };
    if (JSON.stringify(a) === JSON.stringify(b)) collapsed.push({ answered, report: a });
  }

  assert.deepEqual(
    collapsed.map((c) => `after ${c.answered} answer(s): ${c.report.why}`),
    [],
    collapsed
      .map(
        (c) =>
          `\n  With ${c.answered} question(s) already answered, a human who pressed ctrl-C and a pipe that simply\n` +
          `  ran out come back as the same object:\n` +
          `      ${JSON.stringify(c.report)}`,
      )
      .join("\n") +
      "\n\n  install/interview.mjs returns three outcomes because — its own words — “no answer” and “no more input” " +
      "are different facts about who was there. An interrupt is a third, and it is the only one that means STOP: " +
      "nothing ended, the terminal is still there, and the person is still standing in front of it. It arrives at " +
      "the caller as the second one, so `ladderSummary` prints “the input ended before " +
      `${MENU[0]} was answered” at somebody whose input did not end — and \`prooflane init\` goes on to write ` +
      "a complete harness into their tree and exit 0 (measured under a real pty, 2026-09-11).\n" +
      "  Readline owns ctrl-C only because the interview put the terminal in raw mode; before this slice the kernel " +
      "delivered it as a signal and the command stopped. Attaching a `SIGINT` listener makes the interrupt visible " +
      "again — verified over these same streams — and what the interview then calls it, and whether an " +
      "interrupted install still writes, are the author's calls, not this test's.",
  );
});

test("the menu this test drives is the contract's, so a third question is covered the day it is added", () => {
  // Not decoration: the loop above walks MENU positions, and a MENU derived from
  // a list typed here would stop covering the interview the first time the
  // contract grew a field.
  assert.deepEqual(
    MENU,
    Object.entries(CONTRACT.ladder.fields)
      .filter(([, f]) => Array.isArray(f.options) && f.options.length)
      .map(([name]) => `ladder.${name}`),
    "the fields this test drives are no longer the fields the contract offers a menu for",
  );
});
