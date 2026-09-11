// THE SEEDED PROFILE MAY NOT REPORT AN ANSWER TO A QUESTION THE AUTHOR NEVER
// ANSWERED.
//
// `harness init` asks a short menu and then writes the answer into the profile
// as PROSE addressed to the person who gave it — "You answered that this
// project has no rung above L1", "You said this project has them", "You answered
// about a higher rung but not the one beneath it". Those are not decoration.
// They are the only record of the interview that survives the session: the
// answer map is spent and never stored (install/interview.mjs), so what the file
// says the author said is what the author will believe they said, six months
// later, reading the file.
//
// THE DISTINCTION IT MUST NOT COLLAPSE is the one install/interview.mjs's own
// header states in capitals, and which test/ladder-interview.test.mjs already
// pins for the value the interview RETURNS: an absent key means NOBODY WAS
// ASKED; a value equal to `declinesRung` means ASKED, AND THERE IS NO SUCH RUNG
// HERE. "Those are opposite claims about the same project." The interview keeps
// them apart. The file the interview causes to be written does not.
//
// THE INVARIANT, and it is deliberately not about any field: an author who
// answers question A and an author who answers question B answered different
// questions about different rungs, so the profile written for them cannot be the
// same bytes. Not "should differ somewhere" — the file speaks a sentence back at
// each of them, and one sentence cannot be true of both. Two menu fields today,
// five tomorrow; the pairs come from `MENU_FIELDS` and the options from the
// contract, so a field that grows a menu next week is covered the day it does.
//
// MEASURED, NOT REASONED. On 2026-09-11, driving install/interview.mjs with real
// streams: typing `s` (skip) at the L2 question and then ENTER at the L3 one —
// enter being the keystroke the menu marks as recommended — returns
// `{l3Execution: "no — one variant only"}`, and `profileSkeleton` renders for it
// a file byte-for-byte identical to the one it renders for
// `{l2Execution: "nothing — the tests import the code and call it"}`. The words
// in both are the L2 answer's words: "You answered that this project has no rung
// above L1 — nothing starts it as a program that a lane could drive." The second
// author did answer that. The first was never asked it, and skipped the only
// question that could have raised it.
//
// THE DOMAIN IS profileSkeleton's OWN, for the reason
// test/skeleton-invites-a-declaration-the-loader-refuses.test.mjs gives: its
// `answers` parameter is documented as "bare field name → the option string that
// field offers, verbatim", so every map over the contract's menu is in scope
// whether or not today's interview happens to reach it. The pair above is
// reachable; the invariant does not depend on that.
import { test } from "node:test";
import assert from "node:assert/strict";

import { profileSkeleton } from "../packages/harness/install/init.mjs";
import { CONTRACT, MENU_FIELDS } from "../packages/harness/src/lib/profile-contract.mjs";

/** The menu fields, by the bare name `answers` is keyed with — the interview's own filter. */
const MENU = MENU_FIELDS.filter((p) => p.startsWith("ladder.")).map((p) => p.slice("ladder.".length));

const SKELETON_OPTS = { sourceRoots: ["src"], tiers: ["unit"], lang: "Python" };

/** Every "the author answered exactly one question, and this is what they said" map. */
function oneAnswerEach() {
  const out = [];
  for (const field of MENU) for (const option of CONTRACT.ladder.fields[field].options) out.push({ field, option, answers: { [field]: option } });
  return out;
}

/** The part of the seeded file the interview decides, so a collision is reported readably. */
function ladderProse(skeleton) {
  const at = skeleton.indexOf('l1Required: ["harnessIntegrity", "specCoverage"],');
  if (at === -1) return "(the ladder block was seeded commented — nothing was recorded)";
  return skeleton
    .slice(at, skeleton.indexOf("\n};", at))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("//"))
    .join("\n");
}

test("two authors who answered different questions do not get the same profile", () => {
  const cases = oneAnswerEach();

  // Either half going empty makes every comparison below vacuous.
  assert.ok(MENU.length >= 2, `the contract offers a menu for ${MENU.length} ladder field(s) — this test needs two questions to tell apart`);
  assert.ok(cases.length >= 4, `built ${cases.length} single-answer maps — this test is inert`);
  assert.equal(
    new Set(cases.map((c) => profileSkeleton("probe", { ...SKELETON_OPTS, answers: c.answers }))).size > 1,
    true,
    "every answer produced the same profile, so this test would pass on a skeleton that ignores the interview entirely",
  );

  const collisions = [];
  for (let i = 0; i < cases.length; i += 1) {
    for (let j = i + 1; j < cases.length; j += 1) {
      const a = cases[i];
      const b = cases[j];
      if (a.field === b.field) continue; // two answers to the SAME question may honestly seed the same thing
      const one = profileSkeleton("probe", { ...SKELETON_OPTS, answers: a.answers });
      const two = profileSkeleton("probe", { ...SKELETON_OPTS, answers: b.answers });
      if (one === two) collisions.push({ a, b, prose: ladderProse(one) });
    }
  }

  assert.deepEqual(
    collisions.map((c) => `${c.a.field}=${JSON.stringify(c.a.option)} ≡ ${c.b.field}=${JSON.stringify(c.b.option)}`),
    [],
    collisions
      .map(
        (c) =>
          `\n  One author answered ONLY ${c.a.field}: ${JSON.stringify(c.a.option)}.\n` +
          `  Another answered ONLY ${c.b.field}: ${JSON.stringify(c.b.option)}.\n` +
          `  They were asked different questions about different rungs, and \`harness init\` wrote them the same\n` +
          `  file, byte for byte. It says this to both of them:\n\n` +
          c.prose
            .split("\n")
            .map((l) => `      ${l}`)
            .join("\n"),
      )
      .join("\n") +
      "\n\n  One of those two was told what they answered, and the other was told what somebody else answered — " +
      "there is no third reading, because the sentence is in the second person and there is only one of it. The " +
      "answer map is never stored, so this file is the only record either author will ever have of the interview.\n" +
      "  install/interview.mjs states the distinction being collapsed here in its own header: an ABSENT key means " +
      "nobody was asked, an answer equal to `declinesRung` means asked and there is no such rung here, and those are " +
      "opposite claims about the same project. Say which field the sentence is about, and say nothing about a field " +
      "whose question was skipped.",
  );
});
