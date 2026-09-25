// A RUN'S RECORD MUST BE WRITTEN AFTER EVERY CHECK THAT CAN STILL FAIL IT.
//
// `scripts/fleet-check.mjs` computes the record's verdict from `failures` at the
// moment it calls `writeFleetRecord`, and `JSON.stringify` runs there and then.
// Any check that runs LATER and pushes onto `failures` changes what the process
// prints and what it exits with, and cannot change the file. The two disagree,
// and the file is the half that outlives the terminal.
//
// The `--ladder-plant` check was the first one this repo ever placed after the
// write — at `283294e` every other `failures.push(` sat above it. So a run where
// the plant proved the `l2Execution` steps never start the program —
// `fleet check: FAIL`, exit 1, the scratch dir kept as a crime scene — left
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
// ONE TEST, AND WHY NOT TWO. Ordering is a fact about the SOURCE. The defect was
// never in the writer — `writeFleetRecord` was always correct — it was in
// calling it too early, and nothing you can do with the writer in isolation can
// see that. This file shipped with a second test that built `failures` by hand,
// called the writer once, and asserted the record said FAIL and the gate refused
// it. Round 2 of `startup-plant` ran it in a worktree at `283294e`, the tree
// that HAD the defect, and it passed: its first half restates
// `verdict: failures.length ? "FAIL" : "PASS"` one line from itself, and its
// second is asserted by `test/proof-gate-hook.test.mjs:93` and predates this
// branch. A test that cannot refuse the defect in its own name is worse than no
// test, because the file's name says it is covered. Cut, KD-34.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

test("under --with-firebase, the emulator suite's failures and the e2eSmoke-by-name check are pushed before the record is written", () => {
  // The general test above passes when a check is simply ABSENT. These two are
  // the Firebase run's whole claim: a suite that never served, or an e2eSmoke
  // that never ran the DEBUG build (where the redirect is), is a run that proved
  // no Firebase startup — so each must exist, and must be able to turn the
  // record FAIL.
  const src = fs.readFileSync(SOURCE, "utf8");
  const writes = offsets(src, /(?<!function\s)\bwriteFleetRecord\(\{/g);
  assert.ok(writes.length, "fleet-check.mjs no longer calls writeFleetRecord — this test is aimed at nothing");
  const lastWrite = writes[writes.length - 1];
  const lineOf = (at) => src.slice(0, at).split("\n").length;

  const suite = offsets(src, /\bfailures\.push\(\.\.\.\w+\.failures\)/g);
  assert.ok(suite.length, "the failures runLaneUnderEmulators returns are never pushed into `failures` — a suite that never started could record PASS");
  assert.ok(offsets(src, /\bawait runLaneUnderEmulators\(/g).length, "fleet-check.mjs does not run the lane under the suite");
  const smoke = offsets(src, /\.name === "e2eSmoke"/g);
  assert.ok(smoke.length, "no check requires e2eSmoke PASS by name — a run whose DEBUG build never started could record PASS");
  for (const at of [...suite, ...smoke]) {
    assert.ok(at < lastWrite, `line ${lineOf(at)} can fail the Firebase run AFTER the record is written (line ${lineOf(lastWrite)})`);
  }
});
