// GATE-RULES Rule 0 as a command (scripts/framework-check.mjs): the lane
// returns a deterministic PASS and a deterministic FAIL, fast, through the
// real machinery, before any work is pointed at it. Tested by RUNNING it —
// there is no other honest way to test a script whose whole claim is "it
// returns".
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "framework-check.mjs");

test("the framework returns both ways inside the bound — PASS on a fresh scaffold, FAIL BY NAME on one planted spec edit, hook refuses, revert passes", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /PASS direction\s+\d+ms\s+✓ \d+ steps, verdict PASS, stage smoke/);
  // Every skipped-test guard, planted on the REAL scaffold and failing by name.
  assert.match(r.stdout, /FAIL: orphaned citation\s+\d+ms\s+✓ specCoverage FAIL naming HOME-\d+/);
  assert.match(r.stdout, /FAIL: unbound citation\s+\d+ms\s+✓ specCoverage FAIL naming HOME-99/);
  assert.match(r.stdout, /FAIL: tier unmet\s+\d+ms\s+✓ specCoverage FAIL naming HOME-98/);
  assert.match(r.stdout, /FAIL: feature without a flow\s+\d+ms\s+✓ e2eCoverage FAIL naming \[home\]/);
  assert.match(r.stdout, /FAIL: flow the lane never runs\s+\d+ms\s+✓ e2eCoverage FAIL naming \[home\]/);
  assert.match(r.stdout, /FAIL: narrowed surface declaration\s+\d+ms\s+✓ harnessIntegrity FAIL naming unrecorded/);
  assert.match(r.stdout, /FAIL: edited lane cannot vouch\s+\d+ms\s+✓ harnessIntegrity FAIL naming modified/);
  assert.match(r.stdout, /Stop hook\s+refuses a FAIL receipt ✓/);
  assert.match(r.stdout, /Stop hook\s+refuses a skipped tier ✓/);
  assert.match(r.stdout, /revert → PASS/);
  assert.match(r.stdout, /framework check: PASS/);
});

test("PLANTED: an absurd bound makes a healthy lane read as a hang — the bound is an assertion, not decoration", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--bound-ms", "1"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 1, "must not pass");
  assert.match(r.stderr, /framework check: FAIL/);
  assert.match(r.stderr, /did not (return inside 1ms|produce a runnable app)/, "and it says the framework did not return, never that the change is wrong");
});
