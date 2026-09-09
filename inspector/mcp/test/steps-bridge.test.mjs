// steps-bridge.mjs — the console's link to the lane's LIVE step stream
// (docs/proposals/LIVE-CONSOLE.md Phase B).
//
// The decision this file gates is "artifact-and-tail, not a push endpoint":
// the lane writes qa/.lane-steps.ndjson and the console READS it. Three
// consequences follow, and each is a test here:
//
//   1. a run that happened while the console was DOWN still renders, because
//      the read is just a read of a file that outlived the process;
//   2. absence is absence — a tree that never ran the lane says so, and never
//      says "nothing is running";
//   3. the tail survives a truncation, because verify truncates at the start
//      of every run and a shrinking file is that signal rather than an error.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { LANE_MARKER_STALE_MS, readStepStream, resolveStepsPath, watchStepStream } from "../src/lib/steps-bridge.mjs";
import { STALE_RUN_MS } from "prooflane-harness/console/console-now.mjs";
import { LANE_MARKER_REL, LANE_STEPS_REL, laneStepsPath } from "prooflane-harness/lib/lane-markers.mjs";

const T0 = Date.parse("2026-09-09T12:00:00.000Z");
const iso = (ms) => new Date(T0 + ms).toISOString();

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "steps-bridge-"));
  fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
  return root;
}

const START = JSON.stringify({
  event: "run", phase: "start", runId: "r1", startedAt: iso(0), profile: "local", mode: "full",
  total: 3, steps: ["harnessIntegrity", "unitTests", "build"],
});
const step = (index, verdict, extra = {}) =>
  JSON.stringify({ event: "step", runId: "r1", at: iso(1000 * (index + 1)), index, total: 3, name: ["harnessIntegrity", "unitTests", "build"][index], verdict, durationMs: 5, ...extra });

test("the console looks where the LANE writes — one spelling of the path, taken from the harness", () => {
  const root = tmpProject();
  try {
    const resolved = resolveStepsPath(root);
    assert.equal(resolved.rel, LANE_STEPS_REL, "the console does not compose a path of its own");
    assert.equal(resolved.abs, laneStepsPath(root));
    // The stream is transient LANE state, beside the in-flight marker — not
    // evidence beside the receipt. A console that computed the path a second
    // way could look in the wrong place and then report an honest-looking
    // absence, which is the failure project-layout.mjs was carved out to end.
    assert.equal(path.dirname(LANE_STEPS_REL), path.dirname(LANE_MARKER_REL));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a tree that never ran the lane says so — it does not say 'nothing is running'", () => {
  const root = tmpProject();
  try {
    const s = readStepStream(root);
    assert.equal(s.available, false);
    assert.match(s.reason, /qa\/\.lane-steps\.ndjson/, "the absence names the file it looked for");
    assert.match(s.reason, /--events/, "and the flag that would produce it");
    assert.ok(!/idle/i.test(s.reason));
    assert.equal(s.relPath, LANE_STEPS_REL, "and the page can name that file without keeping a path of its own");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a run that happened while the console was DOWN renders on the next read", () => {
  const root = tmpProject();
  try {
    // Nothing is watching. The lane writes the whole run and exits.
    fs.writeFileSync(
      path.join(root, "qa", ".lane-steps.ndjson"),
      [START, step(0, "PASS"), step(1, "SKIP"), step(2, "FAIL"),
        JSON.stringify({ event: "run", phase: "end", runId: "r1", endedAt: iso(4000), verdict: "FAIL", durationMs: 4000, completed: 3, total: 3 })].join("\n") + "\n",
    );
    // The console starts afterwards and simply reads the file.
    const s = readStepStream(root, { now: T0 + 60_000 });
    assert.equal(s.available, true);
    assert.equal(s.phase, "done");
    assert.equal(s.completed, 3);
    assert.deepEqual(s.rows.map((r) => r.verdict), ["PASS", "SKIP", "FAIL"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the bridge hands the console the HARNESS's own staleness bound, not the console's copy", () => {
  assert.equal(LANE_MARKER_STALE_MS, STALE_RUN_MS, "if these ever differ, the console's copy is the one that is wrong");
  const root = tmpProject();
  try {
    fs.writeFileSync(path.join(root, "qa", ".lane-steps.ndjson"), [START, step(0, "PASS")].join("\n") + "\n");
    assert.equal(readStepStream(root, { now: T0 + 60_000 }).phase, "running");
    assert.equal(readStepStream(root, { now: T0 + LANE_MARKER_STALE_MS + 5000 }).phase, "stopped");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the tail reports each appended line, and starts from the END of what the page already rendered", async () => {
  const root = tmpProject();
  const file = path.join(root, "qa", ".lane-steps.ndjson");
  fs.writeFileSync(file, `${START}\n${step(0, "PASS")}\n`);
  const seen = [];
  const tail = watchStepStream(root, (e) => seen.push(e));
  try {
    // The page was server-rendered from those two lines a moment ago; replaying
    // them would append a second copy of every row already on screen.
    await settle();
    assert.deepEqual(seen, []);

    fs.appendFileSync(file, `${step(1, "PASS")}\n`);
    await waitFor(() => seen.length === 1);
    assert.equal(seen[0].event, "step");
    assert.equal(seen[0].index, 1);

    fs.appendFileSync(file, `${step(2, "FAIL")}\n`);
    await waitFor(() => seen.length === 2);
    assert.equal(seen[1].index, 2);
  } finally {
    tail.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the tail treats a SHRINKING file as a new run, not as an error", async () => {
  const root = tmpProject();
  const file = path.join(root, "qa", ".lane-steps.ndjson");
  fs.writeFileSync(file, `${START}\n${step(0, "PASS")}\n${step(1, "PASS")}\n${step(2, "PASS")}\n`);
  const seen = [];
  const tail = watchStepStream(root, (e) => seen.push(e));
  try {
    await settle();
    // verify truncates at the start of every run. The tail must read the new
    // run from the top rather than waiting for the file to grow past a byte
    // count that no longer means anything.
    fs.writeFileSync(file, `${START}\n`);
    await waitFor(() => seen.length >= 1);
    assert.equal(seen[0].event, "run");
    assert.equal(seen[0].phase, "start");
  } finally {
    tail.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a reporter that throws may not break the tail — the next line still arrives", async () => {
  const root = tmpProject();
  const file = path.join(root, "qa", ".lane-steps.ndjson");
  fs.writeFileSync(file, `${START}\n`);
  let calls = 0;
  const tail = watchStepStream(root, () => {
    calls += 1;
    throw new Error("the page went away mid-run");
  });
  try {
    await settle();
    fs.appendFileSync(file, `${step(0, "PASS")}\n`);
    await waitFor(() => calls === 1);
    fs.appendFileSync(file, `${step(1, "PASS")}\n`);
    await waitFor(() => calls === 2);
    assert.equal(calls, 2);
  } finally {
    tail.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(150);
async function waitFor(pred, ms = 4000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await sleep(25);
  }
  assert.fail("the tail never reported the appended line");
}
