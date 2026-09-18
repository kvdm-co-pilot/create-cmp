// THE `spent` BLOCK PRINTS COUNTS THE RECORDS DO NOT SUPPORT.
//
// `scripts/change-price.mjs` is advisory, and its own header states the standard
// it is held to: "AN ADVISORY THAT BLUFFS IS WORSE THAN NONE. Where it does not
// know, it says so and names what would settle it." The lane half keeps that
// promise — an undecidable clause is handed back by name. The `spent` half does
// not: it prints "N record(s) / M owed" and a verdict, as a complete account of
// what was spent, in two situations where the number it printed is not the
// number of runs.
//
// Both are the SAME CLASS, which is why they are one file: a count is asserted
// as a fact when the read behind it was partial or was counting a different
// unit. The instances are one field apart; the class is what these assertions
// refuse.
//
//   1. ROWS THE READ COULD NOT USE ARE DROPPED SILENTLY. `readHistory()` in
//      scripts/lib/proof-history.mjs returns `{rows, malformed}` and says why:
//      a line that does not parse is "skipped and COUNTED, so a torn write shows
//      up in the report instead of silently shrinking it". `change-price.mjs`
//      reads `rows` and never reads `malformed`, so a torn write silently
//      shrinks it. The sibling reader of the SAME files does not — proof-plan's
//      `--history` prints "N history line(s) did not parse and are not counted"
//      (scripts/lib/proof-history.mjs, renderHistory). Two readers, one fact,
//      and the new one drops it. `attribute()` drops a second population with no
//      counter at all: a row whose `ranAt` will not parse fails
//      `(stamp(r.ranAt) ?? -Infinity) >= from` and disappears, indistinguishable
//      from a run that belongs to another slice.
//
//   2. RECORDS ARE COUNTED AS ROUNDS. The review row turns the number of rows in
//      `review-history.jsonl` into a verdict about docs/KNOWN-DEFECTS.md's
//      two-round cap. They are not the same unit. `proof-plan.mjs` REOPENS the
//      review obligation whenever a review trigger path moves after a record —
//      "Either revert what moved, or have the new bytes read: … after a fresh
//      record" — and `recordReview()` appends a history row every time it is
//      called. So a slice that took exactly two rounds, with one post-review fix
//      in between, holds three records, and this tells its operator "OVER by 1 —
//      docs/KNOWN-DEFECTS.md caps a slice at two rounds and admits no third."
//      That is a false accusation of the exact defect this program exists to
//      detect. The device row already handles its own reopen out loud; the
//      review row, in the same state, says nothing.
//
// Neither assertion prescribes wording or a fix shape. Both ask only that the
// row DISCLOSE what it could not read, or what makes its unit differ from the
// rule it is citing — the same thing the lane half already does.
import { test } from "node:test";
import assert from "node:assert/strict";

import { spendOf } from "../scripts/change-price.mjs";

const BRANCH = "a-slice-under-test";
const PLAN = { slice: "a slice under test", branch: BRANCH, openedAt: "2026-09-18T10:00:00.000Z" };
const ran = (at) => ({ branch: BRANCH, ranAt: at });

/** A history file that exists, as `observe()` hands it over — `malformed` included, as `readHistory` returns it. */
const kept = (rows, malformed = 0) => ({ file: "qa-artifacts/x-history.jsonl", exists: true, rows, malformed });

const spend = ({ device = "none", review = "none", commits = 1, dirty = false, suite = kept([]), fleet = kept([]), reviews = kept([]) }) =>
  spendOf({ branch: BRANCH, plan: PLAN, device, review, commits, dirty, histories: { suite, fleet, reviews } });

const rowFor = (what, opts) => spend(opts).find((r) => r.what === what);

/**
 * Did the row say anything at all about `n` rows it could not use? The wording
 * is the author's; the disclosure is not optional, because the alternative is a
 * number presented as an account of the whole file.
 */
const discloses = (row, n) => {
  const s = JSON.stringify(row);
  return s.includes(String(n)) && /malformed|did not parse|not counted|unread|could not read|torn|undated|no readable|without a date/i.test(s);
};

test("a partial read is not a count: torn lines and undated rows leave `spent` without a trace", () => {
  // One usable run, five lines that did not parse. The file holds up to six
  // runs; the row says "1 record(s) / 1 owed  within" and stops.
  const torn = rowFor("suite", { suite: kept([ran("2026-09-18T11:00:00.000Z")], 5) });
  assert.ok(
    discloses(torn, 5),
    `five history lines did not parse and the suite row does not mention them: ${JSON.stringify(torn)} — readHistory counts malformed lines so that "a torn write shows up in the report instead of silently shrinking it", and proof-plan's own --history prints that count`,
  );

  // The other population, which has no counter anywhere: rows on this branch
  // that the attribution rule could not stamp. They are dropped by the same
  // expression that drops another slice's runs, and the two are not the same
  // thing — one is "not mine", the other is "I could not tell".
  const undated = rowFor("suite", {
    suite: kept([ran("2026-09-18T11:00:00.000Z"), { branch: BRANCH }, { branch: BRANCH, ranAt: "not-a-date" }]),
  });
  assert.ok(
    discloses(undated, 2),
    `two rows on this branch carry no readable ranAt and the suite row counts them as absent: ${JSON.stringify(undated)}`,
  );

  // And the boundary the file's own design cares about, one step over from
  // absent-vs-zero: a file whose every line is torn must not read identically to
  // a file that exists and records nothing.
  const allTorn = rowFor("suite", { suite: kept([], 6) });
  const empty = rowFor("suite", { suite: kept([]) });
  assert.notDeepEqual(allTorn, empty, "six unparseable lines and an empty file are reported as the same thing");
});

test("review RECORDS are not review ROUNDS: a reopened obligation's fresh record reads as a further round", () => {
  // The invariant, over every tier whose obligation proof-plan can REOPEN: when
  // it is reopened, a fresh record is owed for the SAME ceremony, so the record
  // count exceeds the ceremony count and the row must say so. `device` keeps
  // this today; `review` is in the identical state and does not.
  const reopened = {
    device: () => rowFor("device", { device: "reopened", fleet: kept([ran("2026-09-18T11:00:00.000Z"), ran("2026-09-18T12:00:00.000Z")]) }),
    review: (n) => rowFor("review", { review: "reopened", reviews: kept(Array.from({ length: n }, (_, i) => ran(`2026-09-18T1${i + 1}:00:00.000Z`))) }),
  };

  assert.match(JSON.stringify(reopened.device()), /reopen/i, "the device row already names its reopen — this is the calibration, not the defect");

  // Two genuine rounds plus one re-record after a trigger path moved.
  const three = reopened.review(3);
  assert.match(
    JSON.stringify(three),
    /reopen/i,
    `the review obligation is REOPENED, so one of these three records is a re-read of the same round, and the row accuses the operator of a third round anyway: ${JSON.stringify(three)}`,
  );

  // And one round, re-recorded once, which this describes as a second round
  // against a rule about rounds.
  const two = reopened.review(2);
  assert.match(JSON.stringify(two), /reopen/i, `one round re-recorded after a reopen is described as a second round: ${JSON.stringify(two)}`);
});
