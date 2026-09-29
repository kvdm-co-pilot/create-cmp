// EVERY GATE SAYS WHAT IT ASSUMES, AND EVERY PLANT IT NAMES IS REAL (FIX-PLAN slice 18).
//
// A gate encodes an assumption about what the model cannot yet be trusted to
// do. Stated beside the code, the assumption can be re-tested when a model is
// released (canary.yml `ablate-gates`); unstated, it is kept forever by
// default. And a plant path that no longer exists is a calibration nobody can
// run — the rot F3 names as this mechanism's risk.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TIERS } from "../scripts/proof-plan.mjs";
import { WATCHED, WATCHED_GATES } from "../scripts/hooks/proof-gate.mjs";
import { gates, problems } from "../scripts/gate-assumptions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every TIERS entry and every WATCHED kind states a non-empty `assumes`", () => {
  for (const [k, t] of Object.entries(TIERS)) {
    assert.equal(typeof t.assumes, "string", `TIERS.${k} has no assumes`);
    assert.ok(t.assumes.trim().length > 0, `TIERS.${k}.assumes is empty`);
    assert.ok("plant" in t, `TIERS.${k} does not say whether it has a plant — null is a named gap, absence is silence`);
  }
  assert.deepEqual(Object.keys(WATCHED_GATES).sort(), Object.keys(WATCHED).sort(), "WATCHED_GATES is keyed exactly as WATCHED — a watched act with no stated assumption is the gap this closes");
  for (const [k, g] of Object.entries(WATCHED_GATES)) {
    assert.equal(typeof g.assumes, "string", `WATCHED_GATES.${k} has no assumes`);
    assert.ok(g.assumes.trim().length > 0, `WATCHED_GATES.${k}.assumes is empty`);
    assert.ok("plant" in g, `WATCHED_GATES.${k} does not say whether it has a plant`);
  }
});

test("every non-null `plant` path exists in the tree", () => {
  for (const [table, entries] of [["TIERS", TIERS], ["WATCHED_GATES", WATCHED_GATES]]) {
    for (const [k, g] of Object.entries(entries)) {
      if (g.plant === null) continue;
      assert.equal(typeof g.plant, "string", `${table}.${k}.plant is neither a path nor null`);
      assert.ok(!path.isAbsolute(g.plant), `${table}.${k}.plant must be repo-relative: ${g.plant}`);
      assert.ok(fs.existsSync(path.join(ROOT, g.plant)), `${table}.${k}.plant ${g.plant} is not in the tree`);
    }
  }
});

test("the lister reads the tables it is given and refuses a missing assumption or a rotted plant by name", () => {
  const rows = gates({
    root: ROOT,
    tiers: { ok: { assumes: "x", plant: "scripts/gate-assumptions.mjs" }, bare: { plant: null } },
    watched: { gone: { assumes: "y", plant: "test/no-such-plant.test.mjs" } },
  });
  assert.deepEqual(rows.map((r) => [r.gate, r.plantStatus]), [["ok", "present"], ["bare", "null"], ["gone", "absent"]]);
  const bad = problems(rows);
  assert.equal(bad.length, 2, bad.join("\n"));
  assert.match(bad[0], /bare: states no `assumes`/);
  assert.match(bad[1], /gone: plant test\/no-such-plant\.test\.mjs is not in the tree/);
  assert.deepEqual(problems(gates({ root: ROOT })), [], "this tree passes --check");
});
