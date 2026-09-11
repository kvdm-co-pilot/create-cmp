// The ladder interview — the questions a HUMAN can answer, asked at the one
// moment a human is standing there.
//
// WHY THIS EXISTS. Every field of an evidence ladder holds STEP NAMES, and at
// `prooflane init` the steps do not exist yet — the agent is about to write
// them. But one part of a ladder is not a step name and a human IS qualified to
// decide it: whether there is anything here that starts this project as a
// program, or there is not. Until now nobody asked, and it was settled by
// whoever wrote the first step. A real Python adopter earned L2 with an
// integration suite that imported the app and called it: named, running, green,
// and never once a program. Nothing lied. Nobody had ever been asked.
//
// WHAT THE ANSWER DOES, and deliberately no more: it shapes what `init` seeds
// into the skeleton. Say this project starts as a program and the ladder is
// seeded with the field waiting for the step you are about to write; say it does
// not and the field is not seeded at all. The answer is used, not stored — there
// is no record anywhere of what was picked, because a recorded answer nothing
// verifies is a second claim beside the first, and the thing that would actually
// catch a wrong one is a plant that breaks startup and watches which check goes
// red. That plant is the real feature and it is not written yet.
//
// NON-INTERACTIVE ASKS NOTHING. With no human present this returns no answers —
// never the contract's recommended `default`. It reads like a missing
// else-branch and a future reader will be tempted to "fix" it: writing the
// recommendation when nobody was asked is an agent's guess wearing a human's
// answer, in every CI install, which is the shape of the defect that made this
// worth building.
//
// IT HOLDS NO COPY OF THE MENU. Every string an author sees about a field — the
// question, the options, which is recommended, what the field means, why the
// rung above it cannot be asked — is read from `CONTRACT` or rendered by
// `explain` at the moment of asking. Not one of them is spelled here, and
// test/ladder-interview.test.mjs reads this file's own source to prove it. The
// reason is profile-contract.mjs's own: help text and validator are one artifact
// so neither can drift, and a menu copied into the asker is a menu that offers
// an option the validator refuses.
//
// PATTERN: `kubectl explain` is the contract's; the interview is `npm init`'s —
// a numbered menu with a recommended default, Enter to take it. The TTY check
// and the deferred `node:readline/promises` import are lifted from
// packages/aliases/create-mobile/bin/create-mobile.mjs, which had already
// settled that a flags-driven or piped invocation is a caller who has chosen by
// how they invoked it.
//
// HOW IT FAILS, and what is done about it. (1) A piped or scripted stream that
// never gives a usable answer could spin forever: every field is bounded at
// MAX_READS_PER_FIELD reads, then treated as skipped. (2) readline CLOSES ITSELF
// when its input ends, and a question outstanding at that moment never settles
// — measured, not assumed, on node v24.18.0: the process exits 13 with
// "Detected unsettled top-level await". So every read carries an AbortController
// that fires on `close`, and an interview cut short says so rather than
// reporting an answer nobody gave. (3) The interview cannot tell whether the
// answer is TRUE — nothing here proves a project really starts a program. It
// records a claim, and everything downstream treats it as one.

import { MENU_FIELDS, contractAt, explain } from "../src/lib/profile-contract.mjs";
import { colors } from "./log.mjs";

/**
 * The declaration whose menu this asks. Answers come back keyed by BARE field
 * names, so the interview asks exactly the ladder's menu fields — the same
 * name, matching the filter `evidenceLadderFor` applies to a ladder. Asking
 * a menu field of some future second declaration would record a key that
 * validator refuses, which is a worse failure than not asking it.
 */
const LADDER = "ladder.";

/**
 * How many lines one field may consume before the interview gives up on it and
 * moves on. Counts EVERY read, including `?`, because the input may not be a
 * human: an unbounded re-ask is an infinite loop the moment a stream answers
 * the same unusable thing forever.
 */
const MAX_READS_PER_FIELD = 5;

/** What is typed to decline a question without answering it. */
const SKIP_WORDS = Object.freeze(["s", "skip"]);

/** What is typed to see the contract's own explanation of the field. */
const EXPLAIN_WORD = "?";

/**
 * Ask the author which rungs this project HAS — the menu the contract already
 * carries, rendered rather than copied.
 *
 * @param {object} [opts]
 * @param {NodeJS.ReadableStream} [opts.input] where answers are read from
 * @param {NodeJS.WritableStream} [opts.output] where the menu is written
 * @param {boolean} [opts.interactive] whether a human is there to answer. The
 *   caller decides this — it owns the flags and the TTY check, and the streams
 *   here are injected precisely so a test can drive a real interview.
 * @param {Record<string,string>} [opts.current] answers already on record,
 *   keyed by bare field name. Offered back, and kept by Enter.
 * @returns {Promise<{asked: boolean, answers: Record<string,string>, why: string}>}
 *   `answers` is keyed by BARE field name.
 */
export async function askLadderMenu({ input, output, interactive, current = {} } = {}) {
  const paths = MENU_FIELDS.filter((p) => p.startsWith(LADDER));

  if (!interactive) {
    return {
      asked: false,
      answers: {},
      why:
        "nobody was asked, so nothing was recorded — a recommended answer written with no human present " +
        "is a guess, and it would be indistinguishable from one",
    };
  }

  const write = (s) => output.write(s);
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input, output });
  // The input ending closes the interface, and a pending question at that
  // moment never settles. This is what turns that into an answerable state.
  const ended = new AbortController();
  rl.once("close", () => ended.abort());

  const answers = {};
  let why = "";

  try {
    write(
      `\n${colors.bold(`${paths.length} question${paths.length === 1 ? "" : "s"} about your evidence ladder`)} — ` +
        `what this project IS, in its own words.\n` +
        `  Nothing here earns a rung: the steps do that, and you have not written them yet. It records\n` +
        `  what you INTEND, so a rung you mean to have and have not built stays visible.\n`,
    );

    for (let i = 0; i < paths.length; i += 1) {
      const path = paths[i];
      const field = path.slice(LADDER.length);
      const spec = contractAt(path);
      // An answer already on record is only offered back when the contract
      // still offers it. A stale one kept by Enter would be recorded verbatim
      // and refused by the loader — the caller's data, our refusal.
      const held = spec.options.includes(current[field]) ? current[field] : null;
      const fallback = held ?? spec.default;

      write(renderField(path, spec, held));
      const outcome = await askOne({ rl, signal: ended.signal, write, path, spec, fallback, held });

      if (outcome.kind === "ended") {
        why = `asked — the input ended before ${path} was answered, so nothing further was recorded`;
        break;
      }
      if (outcome.kind === "skip") {
        write(`  ${colors.dim("skipped — nothing recorded for this field")}\n`);
        continue;
      }

      answers[field] = outcome.value;
      write(`  ${colors.green("recorded")} ${field}: ${JSON.stringify(outcome.value)}\n`);

      // THE ANSWER THAT ENDS THE INTERVIEW. `declinesRung` is the contract's own
      // name for the option meaning "this rung does not exist here", and the
      // rungs are climbed in order — so every field AFTER this one in
      // MENU_FIELDS is a question that cannot arise. Which ones those are comes
      // from position in that list, never from a list written here: give a third
      // field a menu tomorrow and it is declined the same day.
      if (outcome.value === spec.declinesRung) {
        const remaining = paths.slice(i + 1);
        if (remaining.length) write(declined(path, remaining));
        why =
          `asked — ${path} declares no such rung here, so the ${remaining.length} question` +
          `${remaining.length === 1 ? "" : "s"} above it ${remaining.length === 1 ? "was" : "were"} not put`;
        break;
      }
    }
  } finally {
    rl.close();
  }

  if (!why) {
    const n = Object.keys(answers).length;
    why = n
      ? `asked — ${n} answer${n === 1 ? "" : "s"} recorded`
      : "asked — every question was skipped, so nothing was recorded";
  }
  return { asked: true, answers, why };
}

/**
 * One field's menu, exactly as the contract states it. The `*` marks the
 * recommended option because that is what `explain` already does with the same
 * two keys, and an author who runs `node qa/profile.mjs explain` should not meet
 * a second convention for the same fact.
 */
function renderField(path, spec, held) {
  const lines = [
    "",
    `  ${colors.bold(spec.question)}`,
    `  ${colors.dim(path)}`,
    "",
    ...spec.options.map((o, i) => `    ${o === spec.default ? "*" : " "} ${i + 1}  ${o}`),
    `      ${colors.dim("(* recommended)")}`,
  ];
  if (held) lines.push(`      ${colors.dim(`(currently: ${JSON.stringify(held)})`)}`);
  return lines.join("\n") + "\n";
}

/** The prompt line, which says every form this accepts. */
function promptFor(spec, fallback) {
  const n = spec.options.indexOf(fallback) + 1;
  return (
    `  [1-${spec.options.length}` +
    `${n > 0 ? ` · ${colors.cyan("enter")} takes ${n}` : ""}` +
    ` · ${colors.cyan(EXPLAIN_WORD)} explains · ${colors.cyan(SKIP_WORDS[0])} skips] `
  );
}

/**
 * Read one field's answer. Returns the option string, a skip, or `ended` when
 * the input closed underneath us — three outcomes, because "no answer" and "no
 * more input" are different facts about who was there.
 */
async function askOne({ rl, signal, write, path, spec, fallback, held }) {
  for (let read = 0; read < MAX_READS_PER_FIELD; read += 1) {
    let raw;
    try {
      raw = await rl.question(promptFor(spec, fallback), { signal });
    } catch {
      // The interface closed: the input ended, or the caller aborted. Either
      // way there is no answer and inventing one is the thing this file exists
      // not to do.
      return { kind: "ended" };
    }
    const typed = String(raw).trim();

    if (typed === "") return { kind: "answer", value: fallback };
    if (SKIP_WORDS.includes(typed.toLowerCase())) return { kind: "skip" };
    if (typed === EXPLAIN_WORD) {
      // The contract's own explanation, rendered by the same function `node
      // qa/profile.mjs explain` calls. `declared` is the key that function
      // reads, and it is handed over ONLY when something is on record: it
      // prints `THIS PROJECT DECLARES: <value>`, and passing null would print
      // that line reading "null" at a person who has simply never been asked.
      // No answer, no line.
      write(`\n${indent(explain(path, held ? { declared: held } : {}))}\n\n`);
      continue;
    }
    const n = Number(typed);
    if (Number.isInteger(n) && n >= 1 && n <= spec.options.length) {
      return { kind: "answer", value: spec.options[n - 1] };
    }
    write(
      `  ${colors.yellow("?")} ${JSON.stringify(typed)} is not one of the answers. ` +
        `Type a number from 1 to ${spec.options.length}, ${EXPLAIN_WORD} for what the field means, ` +
        `${SKIP_WORDS[0]} to skip it, or press enter to take the recommendation.\n`,
    );
  }
  // Bounded, and the bound is reported rather than silently applied: a stream
  // that answered five unusable things is not a human who chose the default.
  write(`  ${colors.dim(`no usable answer after ${MAX_READS_PER_FIELD} attempts — skipping this field`)}\n`);
  return { kind: "skip" };
}

/**
 * Why the questions after a declined rung are not asked — in the contract's own
 * words. Each skipped field publishes the refusal that describes exactly this
 * gap, and `explain` prints the same sentence to the same author, so quoting it
 * here is the one way to say it that cannot drift from what the loader does.
 */
function declined(path, remaining) {
  const lines = [
    `  ${colors.dim(`no rung there, so ${remaining.length === 1 ? "the question" : "the questions"} above it ${remaining.length === 1 ? "does" : "do"} not arise:`)}`,
  ];
  for (const p of remaining) {
    const spec = contractAt(p);
    lines.push(`    ${colors.dim(`${p} — refused when it ${spec.refusal}`)}`);
  }
  return lines.join("\n") + "\n";
}

/** `explain`'s output, set in from the prompt it interrupts. */
function indent(text) {
  return String(text)
    .split("\n")
    .map((l) => (l ? `    ${l}` : ""))
    .join("\n");
}
