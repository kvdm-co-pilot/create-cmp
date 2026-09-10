// A DECLARATION THE CORE READS BY NAME, THAT AN HEIR CANNOT INHERIT.
//
// e4c60d7 moved the pre-`skipKind` reason texts out of receipt-check.mjs — a
// literal regex in the core — into a new profile export, `legacySkipReasons`.
// The Stop hook now reads them off the loaded profile by name:
//
//   const declared = profile?.legacySkipReasons;   // receipt-check.mjs:162
//   ... legacyNames && legacyPatterns && ...        // receipt-check.mjs:173
//
// `legacyNames` is the ladder's `deviceExecution`, and `ladder` IS in
// profile-loader.mjs's INHERITABLE list. `legacySkipReasons` is not. So an heir
// of cmp — `export const extendsProfile = "cmp"`, the shape differential-
// conformance.test.mjs already exercises — inherits the step NAMES that gate
// the legacy fallback and loses the reason texts the same fallback needs, and
// the two halves of one decision come apart silently: `legacyPatterns` stays
// null, `envSkipped` comes back empty, and the one gate that refuses "done"
// over a tier that never ran stops refusing for that profile's older receipts.
//
// Before the move the patterns were the core's, so an heir got them for free.
// This is the narrow, real cost of the move, and it is one word in INHERITABLE.
//
// Deliberately NOT asserting inheritance in general — that is tested. This
// asserts only that the two halves of ONE decision inherit together.
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveInheritance, EXTENDS_PROTOCOL } from "../packages/harness/src/lib/profile-loader.mjs";
import { CMP_LADDER, legacySkipReasons } from "../packages/harness/src/lib/profiles/cmp/ladder.mjs";

test("an heir inherits the ladder that gates the legacy skip fallback but not the reason texts it reads, so the fallback dies silently", () => {
  const base = {
    id: "cmp",
    protocol: EXTENDS_PROTOCOL,
    layout: { specs: "specs" },
    tiers: { names: ["instrumented"] },
    steps: () => ({ id: "cmp" }),
    ladder: CMP_LADDER,
    legacySkipReasons,
  };
  const heir = { id: "heir", protocol: EXTENDS_PROTOCOL, extendsProfile: "cmp" };

  const r = resolveInheritance(heir, "heir", () => ({ ok: true, profile: base }));
  assert.equal(r.ok, true, r.reason ?? "");

  // The half that IS inherited — receipt-check's `legacyNames`.
  assert.deepEqual(
    r.profile.ladder?.deviceExecution,
    CMP_LADDER.deviceExecution,
    "the ladder is inheritable, so the heir's Stop hook knows which steps the legacy fallback covers",
  );

  // The half that is not — receipt-check's `legacyPatterns`. Without it the
  // fallback above is unreachable for every receipt this heir inherited the
  // ladder to grade.
  assert.deepEqual(
    r.profile.legacySkipReasons,
    legacySkipReasons,
    "an heir that inherits the ladder must inherit the reason texts read against it — " +
      "add `legacySkipReasons` to INHERITABLE in lib/profile-loader.mjs, or the halves drift",
  );
});
