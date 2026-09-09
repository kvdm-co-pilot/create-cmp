// THE COUNT THE GATE READS OUT OF THE ROAD MUST EXIST IN THE ROAD.
//
// scripts/stage3-gate.mjs reads §9's Stage 3 count from docs/NORTH-STAR.md by
// regex rather than keeping a constant — so the road, not the gate, owns the
// number. The 2026-09-08 audit found the sentence the regex parses had been
// rewritten out of §9: the derivation returned null, the gate failed closed,
// and criterion A refused first, so nothing said so. A derivation that reads
// nothing is a constant that nobody wrote.
import { test } from "node:test";
import assert from "node:assert/strict";

import { requiredFleetSize } from "../scripts/stage3-gate.mjs";

test("§9's Stage 3 row still contains the sentence stage3-gate parses, and it says 2", () => {
  const r = requiredFleetSize();
  assert.equal(r.n, 2, r.reason ?? "the derivation returned no count");
});
