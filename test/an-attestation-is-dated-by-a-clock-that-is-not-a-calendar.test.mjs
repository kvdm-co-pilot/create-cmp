// `date` ON THE STAGE 2 ATTESTATION IS VALIDATED BY A REGEX AND COMPARED AS AN
// INSTANT, AND NEITHER OF THOSE IS A CALENDAR.
//
// scripts/stage2-gate.mjs:580-581 is the whole of it:
//
//   need(/^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? "")), "date must be YYYY-MM-DD");
//   if (/^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? "")) && Date.parse(a.date) > Date.now())
//     problems.push(`date ${a.date} is in the future`);
//
// The shape check accepts anything four-two-two, so `2026-13-45` and `0000-00-00`
// are dates to this gate. The freshness check parses a date-ONLY string, which
// ECMAScript fixes at midnight UTC, and compares it to a wall-clock instant —
// so for a signer anywhere east of UTC, the day they read off their own calendar
// begins in this gate's future, by exactly their offset, for exactly that many
// hours every day.
//
// WHY THIS IS A GATE DEFECT AND NOT A NIT. `date` is one of only four fields
// criterion A leaves to a human (docs/attestations/README.md lists them verbatim
// and calls that list "the whole of what is left"), and the attestation is the
// one file in this repository an agent may not write. So the first act of the
// only person who can close criterion A is to type a date — and on this machine
// (GMT+0200) typing today's date makes the gate answer `date … is in the future`,
// naming the signer's own calendar as the fault. A refusal path that refuses the
// correct input is the uncalibrated instrument PRINCIPLES.md §2 forbids there.
//
// THE INVARIANT, NOT THE INSTANCE. The instance is "2026-09-18 is rejected on
// 2026-09-17T23:00Z"; patching that one comparison by a fixed offset moves the
// bug to the next zone. The class is: `date` must be accepted exactly when it
// names a real calendar day that has already begun where the signer is. So this
// drives the predicate over a span of real zones, over strings that name no day
// at all, and over a day that genuinely has not started anywhere — with `now`
// pinned, so the answer does not depend on the host's clock or its TZ.
//
// NOTHING HERE READS WHETHER A HUMAN-OWNED FIELD IS EMPTY. Every case fills all
// four of them, so this asserts the same thing before and after Karel signs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attestationProblems, ATTESTATION_REL } from "../scripts/stage2-gate.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The recorded attestation if there is one; otherwise the shape the gate documents (:57-69). */
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

/**
 * The recorded attestation, signed. Every human-owned field is OVERWRITTEN —
 * this never observes whether it was empty, so it reads the same after signing.
 */
function signedWith(date) {
  const a = structuredClone(recordedAttestation());
  a.date = date;
  a.attestedBy = { name: "A Signer", role: "the person standing behind it" };
  a.authoredBy = { ...(a.authoredBy ?? {}), organisation: "An Organisation", contact: "someone@example.test" };
  return a;
}

/** `attestationProblems` reads the clock directly, so the clock is pinned around the call. */
function problemsAt(date, nowMs) {
  const realNow = Date.now;
  Date.now = () => nowMs;
  try {
    return attestationProblems(signedWith(date));
  } finally {
    Date.now = realNow;
  }
}

const futureComplaints = (problems) => problems.filter((p) => /in the future/.test(p));
const shapeComplaints = (problems) => problems.filter((p) => /^date /.test(p) || /YYYY-MM-DD/.test(p));

/** The calendar day it is in `timeZone` at `instant` — what a signer there would type. */
function calendarDayIn(timeZone, instant) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}

// The pinned instant: late enough in the UTC day that every zone east of UTC has
// already turned over. Fixed, so this test's answer never depends on when it runs.
const NOW = Date.parse("2026-09-17T23:00:00.000Z");

test("the day a signer reads off their own calendar is not in the gate's future", () => {
  // Every zone at or east of UTC, including the one this project is signed from.
  for (const timeZone of ["UTC", "Europe/London", "Europe/Berlin", "Africa/Johannesburg", "Asia/Kolkata", "Asia/Tokyo", "Pacific/Auckland", "Pacific/Kiritimati"]) {
    const today = calendarDayIn(timeZone, NOW);
    assert.deepEqual(
      futureComplaints(problemsAt(today, NOW)),
      [],
      `a signer in ${timeZone} dates the attestation ${today} — the day it is where they are — and the gate calls it future-dated`,
    );
  }
});

test("a string that names no calendar day is not a date", () => {
  // Each is four-two-two, so the shape check waves it through; Date.parse then
  // returns NaN, NaN > now is false, and the gate reports no problem at all.
  for (const notADay of ["2026-13-45", "2026-02-30", "0000-00-00", "2026-00-10", "2026-09-00"]) {
    assert.notDeepEqual(
      shapeComplaints(problemsAt(notADay, NOW)),
      [],
      `the gate accepted "${notADay}" as the date an attestation was signed`,
    );
  }
});

test("a day that has not begun anywhere is still refused", () => {
  // The control. Without it, the two assertions above are satisfiable by deleting
  // the freshness check, which is the cheapest false green available here.
  for (const notYet of ["2026-09-19", "2099-01-01"]) {
    assert.notDeepEqual(futureComplaints(problemsAt(notYet, NOW)), [], `the gate accepted ${notYet}, which had begun in no timezone at the pinned instant`);
  }
});
