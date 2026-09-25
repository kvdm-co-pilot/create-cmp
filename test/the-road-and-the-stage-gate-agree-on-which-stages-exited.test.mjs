// THE ROAD AND THE STAGE GATE AGREE ON WHICH STAGES EXITED, AND WHEN.
//
// A stage's exit is written down twice: in docs/NORTH-STAR.md §9's road table (a row's
// last cell opens `**EXITED <date>**`), and in scripts/stage-gate.mjs's STAGES (the
// `exited` field, which the program prints as "(exited <date>)"). 0.28.0 renamed the
// column "Exit and why (today's state: `node scripts/stage-gate.mjs`)" and appended
// "Today's rows: `node scripts/stage-gate.mjs <n>`" to each row. That sends the reader
// to the program for the state, so the program must not contradict the row it is cited from.
//
// Held both ways: every road row that says EXITED names the same date the program
// carries, and every date the program carries appears on the road.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STAGES } from "../scripts/stage-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every stage §9's road calls EXITED carries the same exit date in stage-gate, and the reverse", () => {
  const road = fs.readFileSync(path.join(ROOT, "docs", "NORTH-STAR.md"), "utf8");
  const rows = road.split("\n").filter((l) => /^\| \*\*[\d.]+ — /.test(l));
  assert.ok(rows.length >= STAGES.length, `found ${rows.length} road rows for ${STAGES.length} stages`);

  const onRoad = {};
  for (const row of rows) {
    const id = row.match(/^\| \*\*([\d.]+) — /)[1];
    const last = row.split(" | ").at(-1);
    const m = last.match(/^\*\*(?:[^*]*?\. )?EXITED (\d{4}-\d{2}-\d{2})/);
    onRoad[id] = m ? m[1] : null;
  }
  const inGate = Object.fromEntries(STAGES.map((s) => [s.id, s.exited ?? null]));

  const disagreements = Object.keys({ ...onRoad, ...inGate })
    .filter((id) => onRoad[id] !== inGate[id])
    .map((id) => `stage ${id}: the road says ${onRoad[id] ? `EXITED ${onRoad[id]}` : "not exited"}, stage-gate says ${inGate[id] ? `exited ${inGate[id]}` : "not exited"}`);
  assert.deepEqual(disagreements, [], `two spellings of one fact disagree:\n  ${disagreements.join("\n  ")}`);
});
