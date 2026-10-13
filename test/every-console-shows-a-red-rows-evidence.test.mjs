// INVARIANT: every console that prints a lane step's row shows a RED row's
// evidence — FAIL and ERROR alike — and never just the reason's first line.
//
// KD-285 was this defect on ONE printer: the lane console printed the first
// line of a step's reason, so "fix the error below:" had nothing below it. The
// fix (consoleRow, 285901d) closed that printer. But the harness ships more
// than one printer of the same row, each reading the same step result:
//
//   consoleRow      packages/harness/src/lib/lane-runner.mjs  — `node qa/verify.mjs`
//   formatRunBlock  template/qa/watch.mjs                     — `node qa/watch.mjs`, the
//                   resident inner loop the template's CLAUDE.md tells the agent to keep running
//   snapshotHtml    packages/harness/src/lib/evidence-html.mjs — `--html`
//
// The class is "a second printer of the same row drifts from the first", so
// this test walks the TABLE of printers, not one: a printer added later joins
// the table and inherits the rule. Red is laneVerdict's word (FAIL or ERROR),
// not a list this file keeps.
//
// The property is deliberately the weak half of the KD-285 design — every
// evidence line of a SHORT reason appears — because the bound (12 lines, then
// a pointer) is the terminal console's choice and the HTML has no such limit.
import { test } from "node:test";
import assert from "node:assert/strict";

import { consoleRow, laneVerdict } from "../packages/harness/src/lib/lane-runner.mjs";
import { snapshotHtml } from "../packages/harness/src/lib/evidence-html.mjs";
import { formatRunBlock } from "../template/qa/watch.mjs";

const EVIDENCE = ["e: Foo.kt:3 unresolved reference: Bar", "e: Foo.kt:9 type mismatch: Int vs String"];
const REASON = ["the build failed — fix the error below, then re-run:", ...EVIDENCE].join("\n");

const PRINTERS = {
  "lane console (consoleRow)": (step) => consoleRow(step, "qa/evidence/latest.json"),
  "watch run block (formatRunBlock)": (step) =>
    formatRunBlock({
      n: 1,
      startedAtIso: "2026-10-13T00:00:00.000Z",
      trigger: ["composeApp/src/commonMain/kotlin/Foo.kt"],
      receipt: { verdict: laneVerdict([step]), steps: [step] },
      exitCode: 1,
      durationMs: 1000,
    }),
  "evidence snapshot (snapshotHtml)": (step) =>
    snapshotHtml({ receipt: { verdict: laneVerdict([step]), steps: [step], generatedAt: "2026-10-13T00:00:00.000Z" } }),
};

// Every verdict a step can return that turns the lane red, derived from the
// lane's own verdict function rather than listed here.
const RED = ["PASS", "SKIP", "CACHED", "FAIL", "ERROR"].filter((v) => laneVerdict([{ verdict: v }]) === "FAIL");

test("the red verdicts are derived, and there are two of them", () => {
  assert.deepEqual(RED, ["FAIL", "ERROR"]);
});

for (const [printer, print] of Object.entries(PRINTERS)) {
  for (const verdict of RED) {
    test(`${printer}: a ${verdict} row shows every evidence line of its reason, not only the first`, () => {
      const out = print({ name: "unitTests", verdict, durationMs: 1200, reason: REASON });
      for (const line of EVIDENCE) {
        assert.ok(
          out.includes(line),
          `${printer} printed a ${verdict} row without its evidence line "${line}" — the KD-285 defect on a second printer.\n--- printed ---\n${out}`,
        );
      }
    });
  }
}
