// THE ATTESTATION RECORD REPORTS A GATE OUTCOME THE INPUTS IT SAYS PRODUCED IT
// CANNOT PRODUCE.
//
// `docs/attestations/README.md` is written to inform a signature, and its single
// strongest sentence is that the payoff was MEASURED rather than predicted:
//
//   They were read once by filling the four fields with the literal string
//   `PROBE — NOT AN ATTESTATION`, running the gate, and restoring the file: the
//   gate printed criterion B green (…) and `stage 2: EXITED`.
//   … So a signature here does take Stage 2 from 8/10 to 10/10, and that is a
//   thing that was watched happening rather than predicted.
//
// One of those four fields is `date` — the record's own numbered list, item 2,
// is `date must be YYYY-MM-DD`. Criterion A refuses any `date` that is not
// four-two-two (scripts/stage2-gate.mjs:580), so with that literal in `date`,
// criterion A still FAILS. Criterion B is sequenced behind A and prints "not
// reached", and the stage prints `NOT EXITED — 2/10` — the same two lines it
// prints today, with nothing read. Replayed here:
//
//   attestationProblems({…, date: "PROBE — NOT AN ATTESTATION", …})
//     → ["date must be YYYY-MM-DD"]
//
// So either the probe did not fill the four fields the way the record says it
// did, or it did not see what the record says it saw. Both readings make the
// record's own distinction — measured, not predicted — false about itself, in
// the one document whose entire job is to be exactly as strong as its evidence.
//
// WHY THIS IS NOT THE `date` DEFECT AGAIN. That one
// (test/an-attestation-is-dated-by-a-clock-that-is-not-a-calendar.test.mjs) is
// about the gate's validator being uncalibrated. This one is about the RECORD,
// and the two move independently: no repair to the date validator would ever
// accept this literal as a day, and correcting the record leaves the validator
// exactly as wrong as it is.
//
// THE INVARIANT, NOT THE INSTANCE. Not "this paragraph overstates the probe" —
// that goes green on one edit, and the next candidate profile gets its own
// probe paragraph. The class is: where the record reports what a gate said under
// stated inputs, those inputs must actually produce the criterion the report
// depends on. Both halves are read out of the record — the placeholder it says
// it typed, and the field names from its own verbatim list of criterion A's
// problems — so the assertion follows the record instead of pinning its wording,
// and it can be satisfied three honest ways: describe inputs criterion A really
// accepts, drop the claim that B and the stage total were read, or stop claiming
// the reading was watched.
//
// IT READS NOTHING ABOUT EMPTINESS. Every field the record names is OVERWRITTEN
// with the record's own placeholder before the gate sees it, so this asserts the
// same thing before and after Karel signs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attestationProblems, ATTESTATION_REL } from "../scripts/stage2-gate.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_REL = "docs/attestations/README.md";

function readText(rel) {
  const abs = path.join(REPO_ROOT, ...rel.split("/"));
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function readJson(rel) {
  const text = readText(rel);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A parse failure is criterion A's own report, not this test's subject.
    return null;
  }
}

/**
 * The probe the record describes, read out of the record: the literal it says it
 * typed, the fields it says it typed it into, and whether it reports an outcome
 * that is sequenced behind criterion A. Null when there is no such report to
 * hold to account.
 */
function reportedProbe(record) {
  const literal = /with the literal string\s+`([^`]+)`/.exec(record);
  if (!literal) return null;

  // The record quotes criterion A's problems verbatim as a numbered list; the
  // leading dotted token of each is the field that problem is about.
  const fields = [...record.matchAll(/^\s*\d+\.\s+`([A-Za-z][\w]*(?:\.[\w]+)*)\b[^`]*`/gm)].map((m) => m[1]);
  if (!fields.length) return null;

  // Only an outcome that REQUIRES criterion A to have passed is a claim this
  // can falsify: criterion B and the stage total are both behind A.
  const claims = ["criterion B", "stage 2: EXITED", "10/10"].filter((c) => record.includes(c));
  if (!claims.length) return null;

  return { literal: literal[1], fields, claims };
}

/** Set a dotted path on a clone, creating the intermediate object if the shape lacks it. */
function withField(doc, dotted, value) {
  const parts = dotted.split(".");
  let node = doc;
  for (const key of parts.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  node[parts.at(-1)] = value;
  return doc;
}

test("the inputs the attestation record says it probed with produce the criterion its report depends on", (t) => {
  const record = readText(RECORD_REL);
  if (record === null) return t.skip(`${RECORD_REL} does not exist`);

  const probe = reportedProbe(record);
  if (!probe) return t.skip(`${RECORD_REL} reports no probe whose stated inputs and stated outcome can be compared`);

  const attestation = readJson(ATTESTATION_REL);
  assert.ok(attestation, `${ATTESTATION_REL} must exist and parse for the record's probe to be replayable`);

  // Exactly the fields the record names, overwritten with exactly the literal it
  // names. Nothing here observes what was there before.
  const probed = probe.fields.reduce((doc, f) => withField(doc, f, probe.literal), structuredClone(attestation));
  const problems = attestationProblems(probed);

  assert.deepEqual(
    problems,
    [],
    `${RECORD_REL} reports reading ${probe.claims.join(" / ")} from a run in which ${probe.fields.join(", ")} held ` +
      `${JSON.stringify(probe.literal)} — but criterion A refuses that input (${problems.join("; ")}), so B printed ` +
      `"not reached" and the stage printed NOT EXITED. The outcome in the record was not the outcome of the run it describes`,
  );
});
