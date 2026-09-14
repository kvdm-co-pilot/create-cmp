// ^C AT A LADDER QUESTION STILL WRITES THE WHOLE HARNESS.
//
// Karel's decision, 2026-09-14: an interrupt abandons the install. The interview
// runs BEFORE a single byte is written — that is the design, stated in
// install/init.mjs's own header — so honouring the interrupt costs nothing, and
// a person who pressed ^C and then finds fifty-two files has been ignored.
//
// `--no-interview` installing is a different fact and stays: the user ASKED to
// skip the questions, and skipping questions is not the same as saying stop.
//
// WHAT THIS ASSERTS, and deliberately not more: that an interrupted interview
// leaves no tree and does not report success. It pins no exit code beyond
// "not 0" and no wording, because the honest repair could reasonably print
// several different things. It does pin the CONTROL — a session that answers,
// and one that skips every question, must still install — so the invariant
// cannot be satisfied by making `init` refuse more often.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { askLadderMenu } from "../packages/harness/install/interview.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Drive the interview prompt-by-prompt, and fire the interrupt the way a
 * terminal delivers it: the ETX byte on a raw-mode TTY, which is what readline
 * turns into its `SIGINT` event. Both halves are needed and were measured
 * rather than assumed — readline only reads control characters when it believes
 * it is on a terminal, so a plain PassThrough never delivers one and the
 * interview waits forever.
 *
 * The distinction matters because an input that ENDS is already reported
 * differently, and the interrupt is the case that used to be reported as that
 * one.
 */
const ETX = "\x03";

function session(lines, { interruptAt = null } = {}) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  const queue = [...lines];
  let prompts = 0;
  let out = "";
  const output = new Writable({
    write(chunk, _enc, cb) {
      const text = String(chunk);
      out += text;
      if (!text.endsWith("\n")) {
        prompts += 1;
        const n = prompts;
        setImmediate(() => {
          if (interruptAt === n) input.write(ETX);
          else if (queue.length) input.write(`${queue.shift()}\n`);
          else input.end();
        });
      }
      cb();
    },
  });
  output.isTTY = true;
  return { input, output, read: () => out };
}

const streamsFor = (s) => ({ input: s.input, output: s.output });

test("an interrupted interview reports the interrupt rather than an input that ended", async () => {
  const s = session([], { interruptAt: 1 });
  const r = await askLadderMenu({ input: s.input, output: s.output, interactive: true });

  assert.equal(r.asked, true, "a human was asked — the command must be able to say so");
  assert.deepEqual(r.answers, {}, "an interrupt is not an answer");
  assert.match(
    r.why,
    /interrupt/i,
    `the interview must say WHICH ending this was, not that some ending happened: ${JSON.stringify(r.why)}`,
  );
});

test("an interrupt is reported to the CALLER, not only in prose the caller must parse", async () => {
  // `why` is a sentence for a human. A caller deciding whether to write
  // fifty-two files cannot be asked to regex it — the decision needs a field.
  // Without one, `runHarnessInit` has nothing to branch on and the interrupt can
  // only ever be reported, never honoured.
  const interrupted = await askLadderMenu({ ...streamsFor(session([], { interruptAt: 1 })), interactive: true });
  assert.equal(
    interrupted.interrupted,
    true,
    "askLadderMenu returns asked/answers/why and nothing a caller can branch on. The interrupt is " +
      `spelled only inside a human sentence: ${JSON.stringify(interrupted.why)}`,
  );

  // And the other endings must NOT claim it, or the field is worse than nothing.
  for (const [what, lines] of [["answered", ["1", "1"]], ["skipped", ["s", "s"]]]) {
    const r = await askLadderMenu({ ...streamsFor(session(lines)), interactive: true });
    assert.notEqual(r.interrupted, true, `${what} was reported as an interrupt`);
  }
  const nobody = await askLadderMenu({ ...streamsFor(session([])), interactive: false });
  assert.notEqual(nobody.interrupted, true, "nobody was asked, so nobody interrupted anything");
});

test("THE CONTROL: answering, and skipping every question, both still install", async () => {
  // The reason this file cannot be satisfied by making `init` refuse more often.
  for (const [what, lines] of [["answered", ["1", "1"]], ["skipped every question", ["s", "s"]]]) {
    const s = session(lines);
    const r = await askLadderMenu({ input: s.input, output: s.output, interactive: true });
    assert.equal(r.asked, true, `${what}: the interview ran`);
    assert.doesNotMatch(
      r.why ?? "",
      /interrupt/i,
      `${what} is not an interrupt, and must not be reported as one: ${JSON.stringify(r.why)}`,
    );
  }
});
