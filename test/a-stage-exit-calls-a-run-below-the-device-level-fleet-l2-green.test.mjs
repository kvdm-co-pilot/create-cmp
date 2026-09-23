// A STAGE EXIT READS "fleet L2 green" OFF A RUN THAT NEVER REACHED A DEVICE.
//
// Round 1 found that the device tier was discharged by a `--min-level L1` fleet
// run — PASS without an emulator ever attached — because its readers asked the
// record for a digest and a verdict and never for a rung. The fix put ONE
// function in front of the question, `recordMeetsTier` (scripts/proof-plan.mjs),
// and routed the schedule, `--discharge`, the publish gate and the fit test
// through it.
//
// `scripts/stage-gate.mjs` is the fifth reader, and it goes through the function
// and then discards its answer. Its fleet criterion is
// `{ what: "fleet L2 green for the current lane code", fleet: true }`, and
// `checkFleet()` passes on `rec.current && rec.record.verdict === "PASS"` —
// where `fit-test.mjs`'s `readFleetRecord` now defines `current` as
// `meets.ok || meets.about === true`, i.e. "this record is about the app this
// tree stamps", deliberately INCLUDING the right app at the wrong level. So an
// L1 record over these bytes is `current`, its verdict is PASS, and the stage
// exit prints the criterion green. Measured on 814dbc7.
//
// THE INVARIANT, not the instance: whatever a reader reports about a fleet
// record, it may call the device criterion satisfied only when
// `recordMeetsTier(record, TIERS.device, now).ok` does. Asserted over every rung
// the ladder has, so it holds in both directions — below the level is not green,
// at or above it is — and against the function rather than a copy of its rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { stampedOutput } from "../scripts/stamped-output.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** What `stage-gate.mjs`, `fit-test.mjs` and `proof-plan.mjs` read, so the copy's modules resolve the copy's record. */
const COPIED = ["bin", "src", "template", "packages", "scripts", "options.schema.json", "package.json"];

test("a stage exit calls the fleet criterion green exactly when the record carries the device tier's level", async () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stage-exit-rung-")));
  try {
    for (const entry of COPIED) fs.cpSync(path.join(ROOT, entry), path.join(tmp, entry), { recursive: true });
    fs.mkdirSync(path.join(tmp, "qa-artifacts"), { recursive: true });
    const recordFile = path.join(tmp, "qa-artifacts", "fleet-latest.json");

    // The COPY's own modules: their REPO_ROOT is the copy, so they read the
    // record written below and stamp the copy — never this laptop's real run.
    const load = (rel) => import(pathToFileURL(path.join(tmp, rel)).href);
    const { evaluate, STAGES } = await load("scripts/stage-gate.mjs");
    const { recordMeetsTier, TIERS } = await load("scripts/proof-plan.mjs");
    const { LEVELS } = await load("scripts/evidence-rung.mjs");

    const criterion = STAGES.flatMap((s) => s.criteria ?? []).find((c) => c.fleet);
    assert.ok(criterion, "no stage carries a fleet criterion, so this file is aimed at nothing");

    const stamped = stampedOutput(tmp);
    for (const rung of [...LEVELS, null]) {
      const record = {
        schema: "cmp-fleet-check/1",
        ranAt: "2026-09-23T09:00:00.000Z",
        verdict: "PASS", // PASS relative to --min-level: `--min-level L1` attaches no device and is still PASS
        rung,
        pack: "cmp",
        requiredLevel: rung ?? "L1",
        failures: [],
        stampedOutputHash: stamped.hash,
        stampedOutputFiles: stamped.files,
      };
      fs.writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);

      const meets = recordMeetsTier(record, TIERS.device, stamped.hash);
      const exit = evaluate({ criteria: [criterion] });
      assert.equal(
        exit.state === "pass",
        meets.ok,
        `stage gate reads "${criterion.what}" as ${exit.state.toUpperCase()} for a PASS fleet record at rung ${rung ?? "none"} over these exact stamped bytes, ` +
          `and recordMeetsTier says ${meets.ok ? "it carries" : `it does not carry`} the ${TIERS.device.requires} this tier requires${meets.ok ? "" : ` (${meets.reason})`}. ` +
          `One function answers whether a record proves the device tier; a reader that calls its answer and then decides on \`current && verdict === "PASS"\` has a second spelling of the rule — the one round 1 found, one reader over: ${JSON.stringify(exit.results)}`,
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
