// A RUNG IS COMPARABLE ONLY WITHIN ITS PACK — NORTH-STAR §8.9, as a test.
//
// The rule was already true on every evidence SURFACE by 2026-09-08. Two places
// still broke it, and both ran on every device check: `lib/flight-recorder.mjs`
// stored and printed a rung with no pack, and `scripts/fleet-check.mjs`
// compared one to `--min-level` without asking which pack graded it.
//
// The recorder's was the sharper of the two, because it was not a missing label
// but a WRONG ANSWER: `highestRung` took the maximum over every journal entry,
// so a journal holding a `cmp` L2 beside a backend pack's L1 reported "L2" as
// though one number described both. The fix is not a smarter sort — it is
// refusing to put two incomparable claims in one ordering.
import assert from "node:assert/strict";
import test from "node:test";

import { buildFlightEntry, describeHighestRung, summarizeFlightJournal } from "../packages/harness/src/lib/flight-recorder.mjs";

const entry = (pack, rung, extra = {}) =>
  buildFlightEntry({
    profile: "ci",
    mode: "full",
    verdict: "PASS",
    evidenceLevel: rung ? { rung } : null,
    pack: pack ? { id: pack } : null,
    steps: [{ name: "build", verdict: "PASS", durationMs: 10 }],
    sha: "a".repeat(40),
    durationMs: 100,
    onDeviceSteps: ["e2eSmoke"],
    degraded: [],
    ...extra,
  });

test("a journal entry records the grader beside the grade", () => {
  assert.equal(entry("cmp", "L2").pack, "cmp");
  assert.equal(entry(null, "L2").pack, null, "absent is honest; invented is not");
});

test("the highest rung is per pack — two packs have no single highest", () => {
  const one = summarizeFlightJournal([entry("cmp", "L1"), entry("cmp", "L2")]);
  assert.equal(one.device.highestRung, "L2", "within one pack, the maximum is a real answer");
  assert.deepEqual(one.device.highestRungByPack, { cmp: "L2" });

  const two = summarizeFlightJournal([entry("cmp", "L2"), entry("ktor-backend", "L1")]);
  assert.equal(
    two.device.highestRung,
    null,
    "the max over two packs was the defect: it reported L2 as though one number described both",
  );
  assert.deepEqual(two.device.highestRungByPack, { cmp: "L2", "ktor-backend": "L1" });
});

test("a rung with no pack is unattributed, never credited to whichever pack is present", () => {
  const mixed = summarizeFlightJournal([entry("cmp", "L2"), entry(null, "L3")]);
  assert.deepEqual(mixed.device.highestRungByPack, { cmp: "L2", unattributed: "L3" });
  assert.equal(mixed.device.highestRung, null, "an unattributed rung cannot be folded into a pack's");
});

test("every printed rung carries its pack, and two packs are never merged into one number", () => {
  assert.match(describeHighestRung({ highestRungByPack: { cmp: "L2" } }), /L2, pack cmp/);

  const both = describeHighestRung({ highestRungByPack: { cmp: "L2", "ktor-backend": "L1" } });
  assert.match(both, /not comparable across them/, "the reader is told WHY there is no single number");
  assert.match(both, /L2 \(cmp\)/);
  assert.match(both, /L1 \(ktor-backend\)/);

  assert.equal(describeHighestRung({ highestRungByPack: {} }), "", "nothing recorded says nothing");
});
