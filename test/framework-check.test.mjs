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
  assert.match(r.stdout, /FAIL direction\s+\d+ms\s+✓ verdict FAIL, specCoverage FAIL naming HOME-\d+/);
  assert.match(r.stdout, /Stop hook\s+refuses ✓/);
  assert.match(r.stdout, /revert → PASS/);
  assert.match(r.stdout, /framework check: PASS/);
});

test("PLANTED: an absurd bound makes a healthy lane read as a hang — the bound is an assertion, not decoration", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--bound-ms", "1"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 1, "must not pass");
  assert.match(r.stderr, /framework check: FAIL/);
  assert.match(r.stderr, /did not (return inside 1ms|produce a runnable app)/, "and it says the framework did not return, never that the change is wrong");
});
