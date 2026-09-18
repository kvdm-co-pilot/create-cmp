// CRITERION A REFUSES A VALUE AND NAMES, AS THE REASON, A REQUIREMENT THAT VALUE
// ALREADY MEETS.
//
// Two live instances in `attestationProblems` (scripts/stage2-gate.mjs:615-637),
// both measured against the recorded attestation:
//
//   date: "2026-09-31"            → ["date must be YYYY-MM-DD"]
//   attestedBy.name: ["K","vdM"]  → ["attestedBy.name is missing — …"]
//
// `2026-09-31` IS YYYY-MM-DD; it is September the thirty-first that does not
// exist. A two-element array is not missing; it is the wrong type. In both cases
// the signer is told to do the thing they did, reads their own file, sees the
// stated requirement satisfied, and has nowhere to go.
//
// THE FIRST OF THE TWO WAS INTRODUCED BY THIS SLICE'S OWN FIX, and is in scope
// for exactly that reason (docs/KNOWN-DEFECTS.md: "A FIX'S OWN NEW BEHAVIOUR IS
// IN SCOPE FOR THE ROUND THAT REVIEWS IT"). Before `isCalendarDay` landed,
// `2026-09-31` produced no complaint at all — wrong, and the reason the fix is
// right — so no shape-conforming string ever reached that message. The fix
// routed a second, different failure into a message written for the first.
//
// WHY THIS IS THE SAME CLASS OF DEFECT THE FIX ANSWERED, NOT A NIT. `date` is
// one of only four fields criterion A leaves to a human, the attestation is the
// one file in this repository an agent may not write, and
// `docs/attestations/README.md` hands the signer these exact strings as "the
// whole of what is left". A signer who mistypes a month length — the single most
// common date typo there is — is refused by the one gate they cannot route
// around, and told the format is wrong when the format is right. That is
// docs/KNOWN-DEFECTS.md row 1 word for word: sent into a refusal, told something
// false. It is the defect `an-attestation-is-dated-by-a-clock-that-is-not-a-
// calendar.test.mjs` fixed, one message over.
//
// THE INVARIANT, NOT THE INSTANCE. Not "reword the date message" — that goes
// green on one string, and the field beside it is still wrong today. The class
// is: NO PROBLEM CRITERION A REPORTS MAY STATE, AS THE WHOLE OF ITS REASON, A
// PROPERTY THE DOCUMENT ALREADY HAS. Both the paths and the requirements are
// read back out of the gate's own output, so this covers every message
// `attestationProblems` emits now and every one it grows later, in whatever
// wording. Two readers are enough to mechanise it:
//
//   "<path> must be <MASK>"  is false when the value at <path> matches <MASK>
//   "<path> is missing"      is false when the value at <path> is there
//
// Both leave every honest repair available. Adding any further clause ("… and
// name a real calendar day", "… or is not a string") takes the message out of
// the first reader entirely, because it only fires on a complaint that is
// NOTHING BUT the format requirement.
//
// IT READS NOTHING ABOUT EMPTINESS. Every case starts from a fully signed
// in-memory copy — all four human-owned fields overwritten with valid content —
// and then breaks exactly one field. A value that trims to empty is treated as
// absent, so `""` in the recorded file is never the subject of an assertion.
// This asserts the same thing before and after Karel signs, and nothing here
// writes to the attestation.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attestationProblems, ATTESTATION_REL } from "../scripts/stage2-gate.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The recorded attestation if it parses; otherwise the shape the gate documents. */
function recordedAttestation() {
  const abs = path.join(REPO_ROOT, ...ATTESTATION_REL.split("/"));
  if (fs.existsSync(abs)) {
    try {
      return JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch {
      /* a parse failure is criterion A's own report, not this test's subject */
    }
  }
  return {
    schema: "prooflane-attestation/1",
    claim: "stage2-external-profile",
    profile: { id: "some-external-profile" },
    artifact: { kind: "path", location: "/somewhere" },
    receipt: "docs/attestations/some-external-profile-receipt.json",
  };
}

/** A copy with every human-owned field OVERWRITTEN — never observed, only set. */
function signed() {
  const a = structuredClone(recordedAttestation());
  a.date = "2020-01-01";
  a.attestedBy = { ...(a.attestedBy ?? {}), name: "A Signer" };
  a.authoredBy = { ...(a.authoredBy ?? {}), organisation: "An Organisation", contact: "someone@example.test" };
  return a;
}

function setPath(doc, dotted, value) {
  const parts = dotted.split(".");
  let node = doc;
  for (const key of parts.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  node[parts.at(-1)] = value;
  return doc;
}

function getPath(doc, dotted) {
  return dotted.split(".").reduce((node, key) => (node && typeof node === "object" ? node[key] : undefined), doc);
}

/** Present in the document in a way a reader would see — `""` and absent are both "missing". */
function isThere(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/**
 * The reasons the gate gives, read back off its own output. A problem is a claim
 * about the document, and these two shapes are claims this test can check.
 * @param {string} problem
 */
function claimIn(problem) {
  // In both readers the requirement must be the WHOLE of the reason, bar a
  // trailing em-dash rationale. Any further clause — "or is not a string", "and
  // names a real day" — may well be true of the value, and is not this test's
  // business: that is the escape hatch every honest repair takes.
  const missing = /^([A-Za-z]\w*(?:\.\w+)*) is missing(?:\s*—[^—]*)?$/.exec(problem);
  if (missing) return { kind: "missing", path: missing[1] };

  const format = /^([A-Za-z]\w*(?:\.\w+)*) must be ([YMD]+(?:-[YMD]+)+)\.?(?:\s*—[^—]*)?$/.exec(problem);
  if (format) return { kind: "format", path: format[1], mask: format[2] };

  return null;
}

/** The field a problem is about, however the problem is worded. */
function subjectOf(problem) {
  return /^([A-Za-z]\w*(?:\.\w+)*)\b/.exec(problem)?.[1] ?? null;
}

/** `YYYY-MM-DD` → /^\d{4}-\d{2}-\d{2}$/ — the requirement as the message states it. */
function maskRegExp(mask) {
  return new RegExp(`^${mask.split("-").map((run) => `\\d{${run.length}}`).join("-")}$`);
}

/** Every dotted path criterion A reports on, derived from the gate itself. */
const CLAIMED_PATHS = [...new Set(attestationProblems({}).map(subjectOf).filter(Boolean))];

/** Assert that nothing the gate said about `doc` is falsified by `doc`. */
function assertNoSelfFalsifyingProblem(doc, how) {
  for (const problem of attestationProblems(doc)) {
    const claim = claimIn(problem);
    if (!claim) continue;
    const value = getPath(doc, claim.path);

    if (claim.kind === "missing") {
      assert.ok(
        !isThere(value),
        `${how}: the gate refused the attestation with ${JSON.stringify(problem)}, and ${claim.path} holds ` +
          `${JSON.stringify(value)} — it is not missing. The signer is told to supply a field they supplied, ` +
          `and the real fault (its type) is never named`,
      );
    } else {
      assert.ok(
        !(typeof value === "string" && maskRegExp(claim.mask).test(value)),
        `${how}: the gate refused the attestation with ${JSON.stringify(problem)}, and ${claim.path} holds ` +
          `${JSON.stringify(value)}, which IS ${claim.mask}. The stated requirement is met, so the message names ` +
          `no fault the signer can act on`,
      );
    }
  }
}

test("a field the gate calls missing is not one the document supplies", () => {
  assert.ok(CLAIMED_PATHS.length > 0, "criterion A reports no field-level problem at all — nothing to hold to account");

  // Unambiguously present, unambiguously not a non-empty string: the two causes
  // "absent" and "wrong type" are distinct, and one message cannot be true of both.
  for (const present of [42, true, ["A", "Signer"], { name: "A Signer" }]) {
    for (const p of CLAIMED_PATHS) {
      assertNoSelfFalsifyingProblem(setPath(signed(), p, present), `${p} = ${JSON.stringify(present)}`);
    }
  }
});

test("a value the gate says must have a shape is not one that already has it", (t) => {
  const formats = attestationProblems({})
    .map(claimIn)
    .filter((c) => c?.kind === "format");
  // Stating no bare format requirement at all is one of the honest repairs, and
  // a shape-conforming non-day is still refused — that control lives in
  // an-attestation-is-dated-by-a-clock-that-is-not-a-calendar.test.mjs.
  if (!formats.length) return t.skip("criterion A states no requirement whose whole reason is a format");

  // Strings that satisfy every format the gate states and are still refused: a
  // month with thirty-one days it does not have, a non-leap February, a
  // thirteenth month. Each is a typo a signer makes, not an exotic input.
  for (const { path: p, mask } of formats) {
    const shaped = ["2026-09-31", "2026-02-29", "2026-13-45", "2026-00-10"].filter((s) => maskRegExp(mask).test(s));
    assert.ok(shaped.length > 0, `no case in this test matches the ${mask} the gate requires of ${p}`);
    for (const value of shaped) {
      assertNoSelfFalsifyingProblem(setPath(signed(), p, value), `${p} = ${JSON.stringify(value)}`);
    }
  }
});
