// THE REVIEW RULE IS STATED IN ONE PLACE, AND THE READERS POINT AT IT.
//
// KD-12 was "the gate printed a rule that contradicted the rule it pointed at",
// and the fix for it says so in its own printed text: "It is the only statement
// of that rule and this line deliberately does not paraphrase it." That is a
// claim about the whole tree, made in prose, in exactly the place prose has
// already failed once — so it is asserted here instead, against the bytes.
//
// WHY AN INVARIANT AND NOT AN INSTANCE. The instance was "the `how` text says
// 'a round ends when it produces no new defect' and the rule says two rounds".
// Patching that sentence goes green and the next second statement of the rule
// drifts somewhere else — which is what happened: the rule of record grew a
// re-record paragraph and a pre-existing paragraph on 2026-09-14, and two other
// texts that state the same rule were not moved with it. The class is "a rule
// stated twice drifts in one" (this repo's CLAUDE.md), and a class needs the
// two ways a second statement actually appears:
//
//   1. VERBATIM — a pointer that quotes what it points at. Caught by shared
//      word runs with the rule of record.
//   2. PARAPHRASED — a reader that routes findings by its own words, which can
//      contradict the rule of record without sharing a phrase with it. Caught
//      by the one routing criterion the rule ABOLISHED: age.
//
// WHAT COUNTS AS A SECOND STATEMENT: text a reader ACTS ON at the moment of
// decision — what the gate PRINTS, and the agent definitions that instruct the
// reviewer. A comment explaining why a rule changed may quote the dead rule as
// history; that is not a second statement of the live one, and `TIERS.review`'s
// comment block is deliberately outside this scan for exactly that reason.
//
// THIS FILE IS NOT AN ACTING TEXT EITHER — nobody routes a finding by reading a
// test — but it is held to the same standard the only way a test can be: the one
// sentence of the rule it depends on is READ from the rule of record below and
// asserted, so it cannot quietly outlive it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { TIERS } from "../scripts/proof-plan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULE_OF_RECORD = "docs/KNOWN-DEFECTS.md";

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

/** The rule itself: the header, which is everything above the log of entries. */
function ruleOfRecord() {
  const text = read(RULE_OF_RECORD);
  const from = text.indexOf("## The rule this file exists");
  const to = text.indexOf("## The open list, in one screen");
  assert.ok(from !== -1 && to > from, `${RULE_OF_RECORD} no longer has a header to be the rule of record`);
  return text.slice(from, to);
}

/**
 * Every git-tracked text a reviewer or the gate ACTS ON that names the rule of
 * record — derived, never listed, so a new reader that points at the rule is
 * scanned the day it is added rather than the day someone remembers this file.
 */
function actingTexts() {
  const tracked = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const out = tracked
    .filter((f) => f.startsWith(".claude/agents/") || f.startsWith("skills/") || f.startsWith("agents/"))
    .filter((f) => read(f).includes("KNOWN-DEFECTS"))
    .map((f) => ({ where: f, text: read(f) }));
  // What the gate PRINTS about the review tier — taken from the program, not
  // from a copy of its source, so a reworded `how` is still scanned.
  out.push({ where: "scripts/proof-plan.mjs TIERS.review.how (printed)", text: TIERS.review.how });
  assert.ok(out.length >= 2, "nothing acts on the review rule — the scan has lost its subject");
  return out;
}

const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const runsOf = (s, n) => {
  const w = words(s);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
};

// SIX, and the number is measured rather than chosen. On 2026-09-14 the printed
// `how` shared a NINE-word run with the rule of record ("…a cold one.
// Re-recording is not another round…"), while the longest incidental overlap in
// any other acting text was five words ("a finding on that line" — a pointer
// naming what it points at, which is the shape this test must not punish).
const COPY = 6;

test("A POINTER AT THE REVIEW RULE QUOTES IT — the second statement that drifts is the one nobody updates", () => {
  const rule = runsOf(ruleOfRecord(), COPY);
  const offenders = [];
  for (const { where, text } of actingTexts()) {
    const shared = [...runsOf(text, COPY)].filter((r) => rule.has(r));
    if (shared.length) offenders.push(`${where}\n      shares: "${shared[0]}…"`);
  }
  assert.deepEqual(
    offenders,
    [],
    `these texts restate ${RULE_OF_RECORD}'s header instead of pointing at it, so the rule now has ` +
      `more than one statement and the copy is the one that will go stale:\n    ${offenders.join("\n    ")}\n  ` +
      `A pointer names the rule and stops. Nothing here checks whether the copy is CURRENTLY accurate — ` +
      `KD-12 was accurate for one day.`,
  );
});

test("AGE STILL ROUTES A FINDING TO THE LOG — the exemption the rule of record abolished, alive in a reader", () => {
  // THE PREMISE IS READ, NOT QUOTED. A test that bans restating the rule and
  // then carries its own copy of it is the next thing to go stale — so the one
  // sentence this lint enforces is taken from the rule of record at run time.
  // If it goes, this stops enforcing it and says so, rather than policing an
  // abolished criterion out of a comment nobody re-read.
  const PREMISE = "Age decides who paid for it, never whether it blocks";
  assert.ok(
    ruleOfRecord().includes(PREMISE),
    `${RULE_OF_RECORD}'s header no longer says "${PREMISE}" — this lint was derived from that sentence and ` +
      `must be re-derived from whatever replaced it, not left running on a criterion the rule dropped.`,
  );

  const AGE = /pre-existing|predate[sd]?|not about the change|already existed/i;
  const ROUTES_TO_THE_LOG = /KNOWN-DEFECTS|logged here|comes here|goes (in|to|here|there)|logged, not|are NOT defects/i;
  const sentences = (t) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);

  const subjects = [...actingTexts(), { where: `${RULE_OF_RECORD} (the rule of record's own header)`, text: ruleOfRecord() }];
  // The Scope blockquote sits above the header proper and is the first thing a
  // reviewer reads about what belongs in the log, so it is a routing text too.
  const whole = read(RULE_OF_RECORD);
  subjects.push({ where: `${RULE_OF_RECORD} (Scope)`, text: whole.slice(0, whole.indexOf("## The rule this file exists")) });

  const offenders = [];
  for (const { where, text } of subjects) {
    for (const s of sentences(text)) {
      if (AGE.test(s) && ROUTES_TO_THE_LOG.test(s)) offenders.push(`${where}\n      "${s.trim().slice(0, 160)}…"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these sentences route a finding to the log by AGE, which ${RULE_OF_RECORD} does not: "${PREMISE}".\n    ` +
      `${offenders.join("\n    ")}`,
  );
});

test("THE SCOPE BLOCKQUOTE ENUMERATES THE RULE'S ROW — a second list of the same categories, and lists disagree", () => {
  // The one reader that still CARRIES the rule rather than naming it. Measured
  // 2026-09-14: the printed `how` shares a 3-word run with the rule of record
  // and names no category; the reviewer definition shares 5 and names none; the
  // Scope blockquote names ALL FOUR. That is not wrong — a scope has to say what
  // the file holds — but it is a copy, and the previous copy is what drifted:
  // Scope opened with "pre-existing conditions" for a day after the row below
  // had abolished exactly that category. A copy that is CHECKED cannot do that,
  // so the two lists are compared here instead of trusted to stay equal.
  const header = ruleOfRecord();
  const whole = read(RULE_OF_RECORD);
  const scope = whole.slice(0, whole.indexOf("## The rule this file exists"));

  const CATEGORIES = {
    "pre-existing": /pre-existing|predate/i,
    "product decision": /product decisions?|decisions? waiting/i,
    "taste call": /taste/i,
    "hazard that cannot fire yet": /hazard/i,
    "a real defect nobody is wrongly served by": /nobody is wrongly served|not be wrongly served/i,
  };

  const rowLine = header.split("\n").find((l) => l.startsWith("| **Anything else**"));
  assert.ok(rowLine, `${RULE_OF_RECORD}'s header has no "Anything else" row — the non-blocking half of the line is the rule this compares against`);
  const rowCell = rowLine.split("|")[1].split("—").slice(1).join("—");

  // THE LEXICON IS CHECKED TOO. A category added to the row that this test
  // cannot name would silently stop being compared, which is the same hole one
  // level down — so every item in the row must match something here.
  const items = rowCell.split(/,|\bor\b/).map((s) => s.replace(/[*_`]/g, "").trim()).filter((s) => s.length > 3);
  const unknown = items.filter((i) => !Object.values(CATEGORIES).some((re) => re.test(i)));
  assert.deepEqual(unknown, [], `the rule of record names categories this test cannot: ${unknown.join(" / ")} — teach it, or the new category is never compared against the Scope`);

  const named = (t) => Object.entries(CATEGORIES).filter(([, re]) => re.test(t)).map(([k]) => k);
  // "pre-existing" survives in Scope as HISTORY ("this line used to open with…"),
  // which the age lint above already distinguishes from routing by it; what is
  // compared here is the list of categories the two texts route INTO the log.
  const inRow = named(rowCell);
  const inScope = named(scope).filter((c) => c !== "pre-existing" || /pre-existing conditions(?!")/.test(scope));
  assert.deepEqual(
    inScope.sort(),
    inRow.sort(),
    `${RULE_OF_RECORD}'s Scope and its own placement row list different categories — the Scope is a copy of the row, ` +
      `and the copy has drifted:\n    Scope: ${inScope.join(", ")}\n    row:   ${inRow.join(", ")}`,
  );
});
