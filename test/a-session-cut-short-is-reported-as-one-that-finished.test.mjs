// A SESSION THAT WAS CUT SHORT IS REPORTED TO THE HUMAN AS ONE THAT FINISHED.
//
// install/interview.mjs exists to keep apart facts about who was there. It
// returns three endings and says so in its own header — "'no answer' and 'no
// more input' are different facts about who was there" — and the newest commit
// on this branch added a fourth-of-three: an interrupt, because "^C IS A THIRD
// FACT, not a fourth spelling of the second." Each ending carries its own `why`,
// and `askLadderMenu` is now correct about all of them:
//
//   typed `s`   asked — 1 answer recorded
//   pressed ^C  asked — interrupted at ladder.l3Execution, so nothing further was recorded
//   input died  asked — the input ended before ladder.l3Execution was answered, …
//
// THE DISTINCTION IS SPENT IN EXACTLY ONE PLACE, and that place drops it. The
// only consumer is `ladderSummary` in install/init.mjs, whose own docstring
// gives the reason it prints the interview's sentence rather than one of its
// own: "'you skipped every question' and 'the input ended before the first one'
// are different things that both arrive as an empty map — and only the interview
// knows which happened." It prints `interview.why` in the branch where the
// answer map IS empty, and in no other. The moment ONE answer has been recorded
// the function takes an earlier branch, lists the answers, and appends a fixed
// sentence — so `why` is never read, and every ending prints the same bytes.
//
// MEASURED, NOT REASONED — by running the real command, 2026-09-12. Three
// `prooflane init` runs into three empty directories, each answering the first
// question with `1` and then ending the session a different way. Byte-identical
// reports:
//
//     ladder   l2Execution = "a local runtime instance the lane starts and tears down"
//              the ladder is seeded live because you answered. The steps you name are what earns a rung.
//
// The person who pressed ^C is told what they answered and nothing about having
// stopped; the pipe that died is told the same; the author who deliberately
// skipped the rest is told the same. Whether an interrupted install should still
// write is a separate, open question (docs/KNOWN-DEFECTS.md KD-9) and this test
// takes no position on it — writing the tree is one act, telling the person what
// happened is another, and only the second is under test here.
//
// THE CLASS, NOT THE INSTANCE. The invariant is not "print the ^C sentence" and
// not "read `why` in that branch" — either could be implemented another way.
// It is that an ending the interview TELLS APART stays told apart in what the
// command prints at the person standing there. That property is what makes
// every `why` in interview.mjs worth computing; without it they are three
// strings nothing reads. The positions come from the contract's menu, so a third
// question next week is covered the day it is added, and the endings are
// compared only where the interview itself distinguishes them — so an author who
// later decides two of these ARE one fact fixes this test by fixing the
// interview, not by editing an expectation here.
//
// WHY IT DRIVES THE WHOLE COMMAND rather than the summary function:
// `ladderSummary` is not exported, and more to the point the defect is in what
// an adopter READS. test/an-interrupt-is-reported-as-the-input-ending.test.mjs
// pins the interview's RETURN value and says in its own header that "nothing
// refuses it where the report is MADE". This is that.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";

import { runHarnessInit } from "../packages/harness/install/init.mjs";
import { askLadderMenu } from "../packages/harness/install/interview.mjs";
import { MENU_FIELDS, contractAt } from "../packages/harness/src/lib/profile-contract.mjs";
import { profileEntryRel } from "../packages/harness/src/lib/profile-loader.mjs";

const MENU = MENU_FIELDS.filter((p) => p.startsWith("ladder."));

/** Fixed, so two runs differ only in how their session ended. */
const PROFILE = "probe";

/** What a terminal sends for ctrl-C. By code point: the byte itself is invisible in a diff. */
const INTERRUPT = String.fromCharCode(3);

/**
 * The three ways a session at the prompt stops, as the thing the HUMAN did.
 * Each returns the bytes to put on the input for a prompt that is not being
 * answered, or `null` to end the input under it.
 */
const ENDINGS = Object.freeze({
  "typed `s` at every remaining question": () => "s\n",
  "pressed ctrl-C": () => INTERRUPT,
  "had the input die under them": () => null,
});

/**
 * The keystroke that answers a field WITHOUT declining its rung, so the field
 * above it is actually reached. Read off the contract, never typed here.
 */
function answerKey(dottedPath) {
  const spec = contractAt(dottedPath);
  const i = spec.options.findIndex((o) => o !== spec.declinesRung);
  assert.notEqual(i, -1, `${dottedPath} offers no option that keeps the interview going`);
  return `${i + 1}\n`;
}

/**
 * Streams shaped like a terminal, answering `answered` questions normally and
 * meeting the next prompt with `ending`.
 *
 * `isTTY` on both ends is what puts readline in terminal mode, which is the mode
 * in which ^C stops being a signal the kernel delivers and becomes a byte
 * readline interprets — the same setup
 * test/an-interrupt-is-reported-as-the-input-ending.test.mjs uses, and the only
 * one under which this question can be asked at all.
 */
function terminal(answered, ending) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  let prompts = 0;
  let printed = "";
  const output = new Writable({
    write(chunk, _enc, cb) {
      const text = String(chunk);
      printed += text;
      // A prompt is the one thing written without a trailing newline — the
      // cursor has to stay on the line to be typed at.
      if (!text.endsWith("\n")) {
        prompts += 1;
        const n = prompts;
        setImmediate(() => {
          const bytes = n <= answered ? answerKey(MENU[n - 1]) : ENDINGS[ending]();
          if (bytes === null) input.end();
          else input.write(bytes);
        });
      }
      cb();
    },
  });
  output.isTTY = true;
  output.columns = 80;
  return { input, output, printed: () => printed };
}

/** What the interview itself says happened. */
async function interviewWhy(answered, ending) {
  const t = terminal(answered, ending);
  const r = await askLadderMenu({ input: t.input, output: t.output, interactive: true });
  assert.equal(r.asked, true, `the interview was never entered (${ending}, ${answered} answered) — this test is inert`);
  return r.why;
}

/**
 * What `prooflane init` PRINTS BACK — the block of the summary that names the
 * profile it wrote. Found by the blank lines around it rather than by any label,
 * so renaming a row does not silently empty this out.
 */
async function initReport(answered, ending) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cut-short-"));
  const t = terminal(answered, ending);
  const stdin = Object.getOwnPropertyDescriptor(process, "stdin");
  const stdout = Object.getOwnPropertyDescriptor(process, "stdout");
  try {
    Object.defineProperty(process, "stdin", { value: t.input, configurable: true });
    Object.defineProperty(process, "stdout", { value: t.output, configurable: true });
    const code = await runHarnessInit({ profile: PROFILE }, dir, { invocation: "prooflane" });
    Object.defineProperty(process, "stdout", stdout);
    Object.defineProperty(process, "stdin", stdin);
    assert.equal(code, 0, `prooflane init exited ${code} (${ending}, ${answered} answered)`);
  } finally {
    Object.defineProperty(process, "stdin", stdin);
    Object.defineProperty(process, "stdout", stdout);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const entry = profileEntryRel(PROFILE);
  const block = t
    .printed()
    .split("\n\n")
    .find((b) => b.includes(entry) && b.includes("\n"));
  assert.ok(
    block,
    `the command printed no summary naming ${entry} (${ending}, ${answered} answered) — this test has lost the text it reads`,
  );
  return block;
}

test("every ending the interview tells apart is told apart in what the command prints", { timeout: 120000 }, async () => {
  assert.ok(MENU.length >= 1, "the contract offers no menu — this test has nothing to drive");

  const names = Object.keys(ENDINGS);
  const collapsed = [];
  let comparedPairs = 0;

  // Every position where a question is still OUTSTANDING when the session
  // stops. With all of them answered the interview has already returned and
  // none of these events reaches it, which is not this test's subject.
  for (let answered = 0; answered < MENU.length; answered += 1) {
    const whys = new Map();
    const reports = new Map();
    for (const ending of names) {
      whys.set(ending, await interviewWhy(answered, ending));
      reports.set(ending, await initReport(answered, ending));
    }

    assert.ok(
      new Set(whys.values()).size >= 2,
      `with ${answered} question(s) answered the interview returned one reason for all ` +
        `${names.length} endings — it no longer tells them apart, so this test compares nothing:\n  ` +
        [...whys].map(([k, v]) => `${k}: ${v}`).join("\n  "),
    );

    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const a = names[i];
        const b = names[j];
        // Only where the interview ITSELF distinguishes them. If a future author
        // decides two of these are one fact, they say so in interview.mjs and
        // this pair simply stops being compared — no expectation to edit here.
        if (whys.get(a) === whys.get(b)) continue;
        comparedPairs += 1;
        if (reports.get(a) === reports.get(b)) {
          collapsed.push({ answered, a, b, why: [whys.get(a), whys.get(b)], report: reports.get(a) });
        }
      }
    }
  }

  assert.ok(comparedPairs > 0, "no pair of endings was distinguished by the interview at any position — this test is inert");

  assert.deepEqual(
    collapsed.map((c) => `${c.answered} answered: “${c.a}” ≡ “${c.b}”`),
    [],
    collapsed
      .map(
        (c) =>
          `\n  With ${c.answered} question(s) already answered, a human who ${c.a} and one who ${c.b}\n` +
          `  are told the same thing by \`prooflane init\`, byte for byte. The interview knew:\n` +
          `      ${c.why[0]}\n` +
          `      ${c.why[1]}\n` +
          `  and the command printed, to both:\n` +
          c.report
            .split("\n")
            .map((l) => `      ${l}`)
            .join("\n"),
      )
      .join("\n") +
      "\n\n  install/interview.mjs computes a separate `why` for each of these because — its own header — they are " +
      "different facts about who was there, and its newest commit added the interrupt precisely so that a person " +
      "standing at the terminal is not told a sentence about a pipe. `ladderSummary` reads that sentence only when " +
      "the answer map is EMPTY; one recorded answer sends it down an earlier branch that lists the answers and " +
      "appends a fixed clause, and the ending is gone. A distinction that is computed and never printed is not a " +
      "distinction the product makes.\n" +
      "  What an interrupted install should DO — write anyway, or stop — is a separate open decision " +
      "(docs/KNOWN-DEFECTS.md KD-9) and this test does not touch it. It asks only that the report say which of the " +
      "three happened.",
  );
});
