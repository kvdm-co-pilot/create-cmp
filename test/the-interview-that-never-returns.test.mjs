// THE INTERVIEW HAS TO RETURN. FOR EVERY INPUT.
//
// `askLadderMenu` is awaited by `runHarnessInit` before a single byte is
// written, so an interview that does not settle is not a hung prompt — it is
// `prooflane init` exiting having installed nothing, at the one moment an
// adopter is standing in front of it.
//
// install/interview.mjs names two ways that happens, in its own header, under
// "HOW IT FAILS, and what is done about it". Both mitigations are real and
// neither had a test, which is the only reason this file exists: a mitigation
// nothing watches is a mitigation the next refactor deletes without noticing.
//
//  (1) AN INPUT THAT NEVER GIVES A USABLE ANSWER. `MAX_READS_PER_FIELD` bounds
//      the re-ask. Take the bound away and a stream that answers the same
//      unusable thing forever loops forever.
//
//  (2) AN INPUT THAT ENDS WITH A QUESTION OUTSTANDING. readline closes itself
//      when its input ends, and the `rl.question` promise pending at that
//      moment never settles. Every read therefore carries an AbortController
//      that fires on `close`.
//
// MEASURED, NOT REASONED. On 2026-09-11, `{ signal }` was removed from the
// `rl.question` call and `prooflane init` driven at a terminal with one answer
// for two questions. The whole suite stayed green and the command printed:
//
//     Warning: Detected unsettled top-level await at .../init
//
// then exited without writing a profile, a manifest or an error. Removing the
// read bound is equally invisible to the suite.
//
// THE CLASS, NOT THE INSTANCE. The invariant is not "pass a signal" or "keep
// the constant" — either could be implemented another way tomorrow. It is that
// the function RETURNS, with a `why` its caller can print, for every input: one
// that stops early at any field, and one that never stops at all. The field
// positions come from the contract's menu, so a third question next week is
// covered the day it is added.
//
// EVERY TEST HERE CARRIES A TIMEOUT, because the failure under test is a
// promise that never settles, and a test that merely awaits one hangs the suite
// instead of failing it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";

import { askLadderMenu } from "../packages/harness/install/interview.mjs";
import { MENU_FIELDS } from "../packages/harness/src/lib/profile-contract.mjs";

const MENU = MENU_FIELDS.filter((p) => p.startsWith("ladder."));

/**
 * A session driven prompt by prompt, exactly as test/ladder-interview.test.mjs
 * drives one — a prompt is the one thing written without a trailing newline.
 *
 * `answer` is asked for the next line each time a prompt appears and may return
 * `null` to END the input instead, which is what a session cut short looks
 * like: a pipe closing, a terminal going away, a `^D`.
 *
 * THE DRIVER CUTS THE INPUT OFF AT `CAP`, and that is not a convenience: the
 * failure under test is an interview that asks forever, and a driver that
 * answered forever would hang the suite instead of failing it. Being cut off is
 * recorded, because "the interview stopped on its own" and "the driver stopped
 * it" are the two answers this file is here to tell apart.
 */
const CAP = 50;

function session(answer) {
  const input = new PassThrough();
  let prompts = 0;
  let cutOff = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!String(chunk).endsWith("\n")) {
        prompts += 1;
        const line = prompts > CAP ? ((cutOff = true), null) : answer(prompts);
        setImmediate(() => (line === null ? input.end() : input.write(`${line}\n`)));
      }
      cb();
    },
  });
  return { input, output, prompts: () => prompts, cutOff: () => cutOff };
}

test("an input that ends with a question outstanding returns, at every field, and says so", { timeout: 10000 }, async () => {
  assert.ok(MENU.length >= 1, "the contract offers no menu — this test has nothing to drive");

  // Every place the input can die: before the first prompt, and after each
  // answered question. The last case is the one that hangs, because the
  // question after it is already pending when the stream ends.
  for (let answered = 0; answered <= MENU.length; answered += 1) {
    const s = session((n) => (n > answered ? null : "1"));
    const result = await askLadderMenu({ input: s.input, output: s.output, interactive: true });

    assert.equal(result.asked, true, `the input ended after ${answered} answer(s) and the result denies a human was asked`);
    assert.ok(
      typeof result.why === "string" && result.why.length > 0,
      `the input ended after ${answered} answer(s) and nothing came back the command could print — ` +
        "the summary line has no sentence to show the person who was standing there",
    );
    assert.ok(
      Object.keys(result.answers).length <= answered,
      `the input ended after ${answered} answer(s) and ${JSON.stringify(result.answers)} came back — ` +
        "an answer was recorded for a question that was never answered",
    );
  }
});

test("an input that never gives a usable answer returns rather than re-asking forever", { timeout: 10000 }, async () => {
  // A stream, not a human: it answers the same unusable thing every time it is
  // asked, which is the shape `MAX_READS_PER_FIELD` exists for.
  const s = session(() => "nope");
  const result = await askLadderMenu({ input: s.input, output: s.output, interactive: true });

  assert.equal(result.asked, true);
  assert.deepEqual(result.answers, {}, "nothing usable was ever typed, so nothing may be recorded");
  assert.equal(
    s.cutOff(),
    false,
    `the interview was still asking after ${CAP} prompts and only stopped because this test closed the input on it. ` +
      "A real stream does not close: it goes on answering the same unusable thing, the loop never ends, and " +
      "`prooflane init` never reaches the line that writes a file. The re-ask has to be bounded and the bound " +
      "reported — a stream that answered five unusable things is not a human who chose the default.",
  );
});
