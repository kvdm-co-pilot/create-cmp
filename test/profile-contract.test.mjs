// The contract is read by three consumers — the loader, the interview, and the
// author — and the whole reason it is one object is that they cannot then
// disagree. These tests hold the properties that make that true.
//
// The one that matters most is the budget. A `meaning` is prose, and prose that
// nobody enforces a limit on grows until it is skimmed rather than read — at
// which point the contract has the same failure mode as the proposal table it
// replaced, with more words.
import { test } from "node:test";
import assert from "node:assert/strict";

import { evidenceLadderFor } from "../packages/harness/src/lib/evidence-ladder.mjs";
import {
  CONTRACT,
  CONTRACT_PATHS,
  MEANING_BUDGET,
  contractAt,
  explain,
  requiredFields,
} from "../packages/harness/src/lib/profile-contract.mjs";

test("every field the contract describes carries a meaning, within a budget the suite enforces", () => {
  assert.ok(CONTRACT_PATHS.length >= 6, `the contract describes ${CONTRACT_PATHS.length} fields — too few to be the ladder`);
  const over = [];
  for (const path of CONTRACT_PATHS) {
    const entry = contractAt(path);
    assert.ok(entry, `${path} resolves`);
    assert.equal(typeof entry.meaning, "string", `${path} has a meaning`);
    assert.ok(entry.meaning.trim().length > 40, `${path}'s meaning says something`);
    if (entry.meaning.length > MEANING_BUDGET) over.push(`${path} (${entry.meaning.length})`);
  }
  assert.deepEqual(over, [], `a meaning over ${MEANING_BUDGET} chars stops being read — shorten it, or move the argument into an ADR:\n  ${over.join("\n  ")}`);
});

test("a field with options names a default, and the default is one of them", () => {
  for (const path of CONTRACT_PATHS) {
    const entry = contractAt(path);
    if (!entry.options) continue;
    assert.ok(entry.options.length >= 2, `${path} offers a choice`);
    assert.ok(entry.default, `${path} has options but recommends none — the interview would render a menu with no recommendation`);
    assert.ok(entry.options.includes(entry.default), `${path}'s default "${entry.default}" is not among its own options`);
  }
});

// The interview can only ask what the contract phrases. A field with options and
// no question is a menu the interview cannot title; the reverse is a question
// with no answers to pick from. Either way the interview silently skips it and
// the author is back to guessing — the failure this whole object exists to end.
test("every field the interview must ask is askable: a question, and options to pick from", () => {
  const asked = CONTRACT_PATHS.map((p) => [p, contractAt(p)]).filter(([, e]) => e.options || e.question);
  assert.ok(asked.length >= 3, "the interview has something to ask");
  for (const [path, entry] of asked) {
    assert.equal(typeof entry.question, "string", `${path} has options but no question`);
    assert.match(entry.question, /\?$/, `${path}'s question is phrased as one`);
  }
});

// A REFUSAL IS A PROMISE, so publishing one is the commitment — not marking a
// field required. The first draft required l0Required and l1Required and had
// the loader refuse a ladder without them; a review showed that turned three
// legitimate partial ladders into refused profiles. "Declares no ladder, earns
// no rung, which is honest" is this harness's oldest idiom, and a rung with no
// steps named for it is the same statement one level down. So what is pinned
// here is the invariant that outlives which fields happen to be required:
// anything that PUBLISHES a refusal must say something an author can act on,
// and anything marked required must publish one.
test("every published refusal says something actionable, and a required field publishes one", () => {
  const published = CONTRACT_PATHS.map((p) => [p, contractAt(p)]).filter(([, e]) => e.refusal !== null && e.refusal !== undefined);
  assert.ok(published.length > 0, "the contract publishes at least one refusal, or this test asserts nothing");
  for (const [path, entry] of published) {
    assert.equal(typeof entry.refusal, "string", `${path}'s refusal is not text`);
    assert.ok(entry.refusal.trim().length > 20, `${path}'s refusal says too little to act on: ${JSON.stringify(entry.refusal)}`);
  }
  for (const name of requiredFields("ladder")) {
    assert.ok(
      CONTRACT.ladder.fields[name].refusal,
      `${name} is marked required but publishes no refusal — the loader would have nothing to say when it is missing`,
    );
  }
});

// A ladder that DOES trigger each published refusal. Hand-written because a
// refusal is prose and cannot be mechanically turned into the declaration it
// describes — that was the open question a review handed up, and this is the
// answer: keep the set small enough to write out, and make it impossible to
// publish a refusal without demonstrating it.
//
// The alternative shape considered and rejected: assert only that refusal text
// exists. That is what the file said before, and it is how a refusal nobody
// performs survived two reviews — `l2Execution` published one describing the
// state `harness init` seeds by default, and nothing fired.
const TRIGGERS = new Map([
  ["l1Required", { l1Required: ["static"] }],
  ["l2Execution", { l0Required: ["a"], l2Execution: ["run"] }],
  ["l3Execution", { l0Required: ["a"], l1Required: ["a"], l3Execution: ["ship"] }],
]);

test("every refusal the contract publishes is one the loader actually performs", () => {
  const published = Object.entries(CONTRACT.ladder.fields)
    .filter(([, f]) => f.refusal !== null && f.refusal !== undefined)
    .map(([name]) => name);

  assert.deepEqual(
    published.slice().sort(),
    [...TRIGGERS.keys()].sort(),
    "every published refusal needs a ladder here that provokes it, and every trigger needs a refusal — " +
      "a refusal with no trigger is a promise nobody checked, which is exactly how `l2Execution` published " +
      "one describing the state `harness init` seeds",
  );

  for (const [field, ladder] of TRIGGERS) {
    const resolved = evidenceLadderFor({ id: "p", ladder }, null);
    assert.equal(
      resolved.ok,
      false,
      `explain("ladder.${field}") tells an author "REFUSED WHEN IT ${CONTRACT.ladder.fields[field].refusal}", ` +
        `and this ladder does exactly that — but the loader graded it.`,
    );
  }
});

// THE PROPERTY THE WHOLE DESIGN RESTS ON. `explain` must read the same object the
// loader validates against. If it ever grew its own copy of the words, the help
// and the enforcement could drift — which is precisely what a table in a proposal
// did, and what this file exists to prevent.
test("explain renders from the contract itself, and shows this project's real declaration", () => {
  const out = explain("ladder.l2Execution", { declared: ["someStep"] });
  const entry = contractAt("ladder.l2Execution");
  assert.ok(out.includes(entry.meaning), "the rendered meaning IS the contract's, not a paraphrase");
  assert.ok(out.includes(entry.question), "and so is the question");
  for (const o of entry.options) assert.ok(out.includes(o), `option "${o}" is offered`);
  assert.match(out, /THIS PROJECT DECLARES: \["someStep"\]/, "the worked example is the project's own value, never a copy in the core");
  assert.match(out, /l2Execution/, "field names survive rendering with their capitalisation intact");
  assert.equal(explain("ladder.nothingLikeThis"), null, "a path naming nothing returns null rather than inventing help");
});

test("the ladder is documented as local and pre-release, so no rung can be read as a deployment", () => {
  const l3 = contractAt("ladder.l3Execution");
  assert.match(l3.meaning, /shippable/i, "L3 is about the shippable VARIANT");
  assert.match(l3.meaning, /on this machine/i, "and it is still local");
  assert.match(l3.refusal, /l2Execution/, "L3 without L2 is refused by name");
  const l2 = contractAt("ladder.l2Execution");
  assert.match(l2.meaning, /NOT imported/, "the distinction an author gets wrong is stated, not implied");
});
