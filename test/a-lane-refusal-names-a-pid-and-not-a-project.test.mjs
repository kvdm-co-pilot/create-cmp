// KD-27 — THE LANE-ALREADY-RUNNING REFUSAL NAMED A PID AND NOT A PROJECT.
//
// "a verify lane is already running (7360 node qa/verify.mjs)". The refusal was
// right: two lanes share one adb and one emulator. What it did not say is whose
// lane it was. On 2026-09-14 that lane belonged to /Users/test/dev/payment-blueprint,
// an unrelated project, and finding out took four commands. This repository's own
// fleet run is yours to wait for or stop; another project's is neither. Nine of
// these refusals landed in ten days (docs/research/g2-measure/).
//
// The invariant: the refusal names the project and the lane's own account of how
// long it has left, or says plainly which of the two it could not find. The last
// test points the discovery at a REAL process, because a `lsof` or `/proc` read
// that only ever ran against fixtures is the unread instrument PRINCIPLES.md §2
// forbids.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { decide, describeLane, laneAt, laneRemainingMs } from "../scripts/hooks/proof-gate.mjs";
import { TIERS } from "../scripts/proof-plan.mjs";

const REPO = "/Users/someone/dev/create-cmp";
const NOW = Date.parse("2026-09-17T12:00:00.000Z");
const marker = (over = {}) => ({ pid: 7360, at: "2026-09-17T11:58:00.000Z", step: "e2eSmoke", index: 14, total: 17, expectedLaneMs: 4 * 60000, ...over });
const owed = { state: "owed", plan: { slice: "s", branch: "b" }, need: { reason: "r" }, branch: "b", review: { state: "none" } };

test("another project's lane is NAMED as another project's, with the time its own last run says it has left", () => {
  const { ours, text } = describeLane({ pid: 7360, project: "/Users/someone/dev/payment-blueprint", marker: marker() }, { nowMs: NOW, repoRoot: REPO });
  assert.equal(ours, false);
  assert.match(text, /\/Users\/someone\/dev\/payment-blueprint/);
  assert.match(text, /ANOTHER project/);
  assert.match(text, /e2eSmoke \(step 14 of 17\)/);
  assert.match(text, /~2m00s left by its last full run/);
});

test("this repository's own run — its tree, or a fleet-check scratch app — is said to be ours", () => {
  assert.equal(describeLane({ pid: 1, project: `${REPO}/myapp`, marker: null }, { repoRoot: REPO }).ours, true);
  assert.equal(describeLane({ pid: 1, project: "/private/var/folders/x/T/cmp-fleet-check-Ab12/SmokeCheck", marker: null }, { repoRoot: REPO }).ours, true);
  assert.equal(describeLane({ pid: 1, project: `${REPO}-other`, marker: null }, { repoRoot: REPO }).ours, false, "a sibling whose name merely starts the same is not inside the repo");
});

test("what the lane did not say is said to be unknown, never guessed", () => {
  assert.match(describeLane({ pid: 1, project: "/p", marker: null }).text, /wrote no progress marker/);
  assert.match(describeLane({ pid: 1, project: "/p", marker: marker({ expectedLaneMs: null }) }).text, /no measured full run/);
  assert.match(describeLane({ pid: 1, project: null, marker: null }).text, /could not locate/);
  assert.equal(laneRemainingMs(marker({ at: "2026-09-17T11:00:00.000Z" }), NOW), 0, "past its usual length is 0 left, not a negative");
  assert.match(describeLane({ pid: 1, project: "/p", marker: marker({ at: "2026-09-17T11:00:00.000Z" }) }, { nowMs: NOW }).text, /past its last full run/);
});

test("the refusal itself carries the project and the time left, and tells you not to kill someone else's lane", () => {
  const d = decide("device", owed, TIERS, { runningLane: { pid: 7360, project: "/Users/someone/dev/payment-blueprint", marker: marker({ at: new Date(Date.now() - 60000).toISOString() }) }, repoRoot: REPO });
  assert.equal(d.action, "deny");
  assert.match(d.reason, /payment-blueprint/);
  assert.match(d.reason, /left by its last full run/);
  assert.match(d.reason, /Do not kill it/);
  const mine = decide("device", owed, TIERS, { runningLane: { pid: 1, project: `${REPO}/x`, marker: null }, repoRoot: REPO });
  assert.doesNotMatch(mine.reason, /Do not kill/, "your own lane is yours to manage");
});

test("a REAL lane process: its project is found from its cwd, and its progress from its marker", async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "lane-under-test-"));
  fs.mkdirSync(path.join(project, "qa"), { recursive: true });
  fs.writeFileSync(path.join(project, "qa", "verify.mjs"), "setTimeout(() => {}, 30000);\n");
  fs.writeFileSync(path.join(project, "qa", ".lane-in-progress"), JSON.stringify(marker()));
  const child = spawn(process.execPath, ["qa/verify.mjs"], { cwd: project, stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 300));
    const lane = laneAt(child.pid, `${process.execPath} qa/verify.mjs`);
    assert.equal(fs.realpathSync(lane.project ?? "/nonexistent-lane-project"), fs.realpathSync(project), "a relative lane path must resolve against the lane's own cwd");
    assert.equal(lane.marker?.step, "e2eSmoke");
    const abs = laneAt(child.pid, `${process.execPath} ${path.join(project, "qa", "verify.mjs")}`);
    assert.equal(abs.project, project, "an absolute lane path names its project outright");
  } finally {
    child.kill("SIGKILL");
    fs.rmSync(project, { recursive: true, force: true });
  }
});
