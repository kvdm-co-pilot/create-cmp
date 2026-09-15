// THE RECORD IS WRITTEN BEFORE THE LAST CHECK THAT CAN FAIL THE RUN.
//
// `scripts/fleet-check.mjs` computes the record's verdict from `failures` at the
// moment it calls `writeFleetRecord`, and `JSON.stringify` runs there and then.
// Any check that runs LATER and pushes onto `failures` changes what the process
// prints and what it exits with, and cannot change the file. The two disagree,
// and the file is the half that outlives the terminal.
//
// The `--ladder-plant` check is the first one this repo has ever placed after
// the write: at the merge-base every `failures.push(` sat above it. So a run
// where the plant proved the `l2Execution` steps never start the program —
// `fleet check: FAIL`, exit 1, the scratch dir kept as a crime scene — leaves
// `qa-artifacts/fleet-latest.json` reading `"verdict": "PASS"`, `"rung": "L2"`,
// `"failures": []`.
//
// THAT FILE IS NOT BOOKKEEPING. It is the only thing two refusal paths read:
//
//   scripts/hooks/proof-gate.mjs   allows `npm publish` on `r.verdict === "PASS"`
//                                  at rung >= L2 for this tree
//   scripts/proof-plan.mjs         `--discharge` refuses on any verdict but PASS
//
// Both take the record precisely because a human's word is not evidence — "Read
// the run rather than take the caller's word for it: a discharge that trusts an
// argument is a claim, and this whole product exists to refuse exactly that
// shape." A record that is identical whether the last check passed or failed is
// that same claim wearing the file's clothes.
//
// THE CLASS, not the instance: a run's record must be written after every check
// that can still fail it. The first test refuses the ordering for any future
// check, not only the plant; the second executes the consequence through the
// real writer and the real gate, so neither can be argued about.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeFleetRecord } from "../scripts/fleet-check.mjs";
import { decide } from "../scripts/hooks/proof-gate.mjs";
import { TIERS } from "../scripts/proof-plan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(REPO_ROOT, "scripts", "fleet-check.mjs");

/** Every offset in `src` where `re` matches. */
function offsets(src, re) {
  const out = [];
  for (const m of src.matchAll(re)) out.push(m.index);
  return out;
}

test("every check that can fail the fleet run happens before its record is written", () => {
  const src = fs.readFileSync(SOURCE, "utf8");

  // The CALL, never the definition — `export function writeFleetRecord(` is the
  // one occurrence that is not an invocation.
  const writes = offsets(src, /(?<!function\s)\bwriteFleetRecord\(\{/g);
  assert.ok(writes.length, "fleet-check.mjs no longer calls writeFleetRecord — this test is aimed at nothing");
  const lastWrite = writes[writes.length - 1];

  // The record on disk when the process exits is the one the LAST write left.
  // A failure recorded after it is a failure the file cannot carry.
  const late = offsets(src, /\bfailures\.push\(/g).filter((at) => at > lastWrite);
  const lineOf = (at) => src.slice(0, at).split("\n").length;

  assert.deepEqual(
    late.map(lineOf),
    [],
    `${late.length} check(s) can add a failure AFTER the last writeFleetRecord() call ` +
      `(line ${lineOf(lastWrite)}): line(s) ${late.map(lineOf).join(", ")}.\n` +
      "The record's verdict is computed from `failures` at the call and serialised there — so those checks " +
      "change the exit status and cannot change the file. qa-artifacts/fleet-latest.json is what " +
      "scripts/hooks/proof-gate.mjs reads to allow `npm publish` and what proof-plan --discharge reads " +
      "to close a slice; a record that is the same whether the check passed or failed attests nothing.",
  );
});

test("a run that FAILED its last check leaves a record the publish gate refuses", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fleet-record-"));
  try {
    // The receipt of the FIRST (green, baseline) lane run — which is what
    // fleet-check hands the writer, and all it ever hands it.
    const receipt = {
      verdict: "PASS",
      steps: [
        { name: "releaseBuild", verdict: "PASS", durationMs: 261000 },
        { name: "e2eSmoke", verdict: "PASS", durationMs: 41000 },
      ],
    };

    // fleet-check's order, which the test above is what KEEPS correct: every
    // check that can fail the run happens first, and the record is written from
    // what they found. Written this way round the sequence is trivially right,
    // and that is the point — the defect was never in the writer, it was in
    // calling it too early, which is a fact about the source that only the test
    // above can see. This one asks the other half: given a record that says
    // FAIL, does the gate that reads it actually refuse?
    //
    // Edited 2026-09-14 by the author, and worth saying plainly: as landed, this
    // test replayed the OLD order by hand (write, then push) and asserted the
    // file said FAIL. No fix can satisfy that — `writeFleetRecord` stringifies
    // at call time, so a push afterwards can never reach the file. It described
    // the defect rather than a property the fixed code could hold.
    const failures = [
      "startup is broken and every l2Execution step still passes (e2eSmoke=PASS, androidChecks=PASS). " +
        "These steps do not start the program.",
    ];
    writeFleetRecord({ receipt, rung: "L2", pack: "cmp", minLevel: "L2", failures, avd: "Medium_Phone_API_35", root });

    const rec = JSON.parse(fs.readFileSync(path.join(root, "qa-artifacts", "fleet-latest.json"), "utf8"));

    assert.equal(
      rec.verdict,
      "FAIL",
      "the run printed `fleet check: FAIL` and exited 1 because its ladder plant proved the l2Execution steps " +
        `never start the program, and the record it left says ${JSON.stringify(rec.verdict)} with ` +
        `failures ${JSON.stringify(rec.failures)}. The record is the only account of the run that survives ` +
        "the scratch app's deletion.",
    );

    // And the consequence at the gate, executed rather than argued: this is the
    // record `npm publish` is refused or allowed on.
    const obligation = { state: "none", trunk: true, branch: "main", need: { reason: "" }, review: { state: "none" } };
    const d = decide("publish", obligation, TIERS, { record: rec, now: rec.observedHash });
    assert.equal(
      d.action,
      "deny",
      `the publish gate ALLOWS a release on the record of a fleet run that failed: ${d.reason}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
