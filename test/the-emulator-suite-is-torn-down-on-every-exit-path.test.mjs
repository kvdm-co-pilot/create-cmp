// AN EMULATOR SUITE THE FLEET CHECK STARTED IS AN EMULATOR SUITE IT STOPS — ON EVERY PATH.
//
// A `--with-firebase` fleet run wraps the lane in `firebase emulators:exec`. The CLI
// starts the Firestore emulator as a JVM it spawns DETACHED (firebase-tools
// lib/emulator/downloadableEmulators.js, `_runBinary`: `detached: true`), so a
// Ctrl-C to the terminal never reaches it: only the CLI's own clean shutdown
// stops it. If the CLI is killed rather than asked, the JVM lives on holding the
// port, and the NEXT Firebase run fails to start — or, worse, a debug build
// talks to an emulator nobody is watching.
//
// This repo has met the shape before: 2026-09-08, a parent killed with its lane
// still running left an orphan that the proof gate then read as "a lane already
// running" (scripts/fleet-check.mjs, runCommand). So teardown is asserted, not
// assumed, on each way a run ends:
//
//   the lane fails            the CLI tears down; the ports are checked free after
//   the suite never starts    the lane never ran, and the run says so by name
//   a port is busy before     refused before anything is spawned — the app would
//                             talk to whoever holds it, and the "held after" check
//                             would blame us for a process that is not ours
//   a port is held after      a FAILURE naming the port, never a silent PASS
//   SIGINT / SIGTERM          forwarded ONCE to the CLI's whole process group (a
//                             second SIGINT makes the CLI skip its clean shutdown),
//                             awaited, and escalated to SIGKILL only past a budget
//   the parent just exits     the group is asked to shut down on the way out
//
// The spawner, the port probe and the group signal are injected: nothing here
// starts an emulator, a JVM or a device.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runLaneUnderEmulators, firebaseJsonFor, LANE_STARTED_MARKER } from "../scripts/lib/fleet-firebase.mjs";

const PLAN = {
  project: "demo-fleetcheck",
  host: "127.0.0.1",
  declaredIn: "composeApp/build.gradle.kts (debug)",
  appHost: "10.0.2.2",
  served: [{ service: "auth", port: 19099 }, { service: "firestore", port: 18080 }, { service: "storage", port: 19199 }],
  unserved: [{ service: "functions", port: 15001, reason: "no codebase" }],
};

/** A fake `firebase emulators:exec` the test drives by hand. */
function harness({ busyBefore = [], busyAfter = [], laneStarts = true, exitCode = 0, exitsOnSignal = true } = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-emu-"));
  const calls = { spawn: [], signals: [] };
  let spawned = false;
  let child = null;
  const exit = (code, signal = null) => {
    if (child.exited) return;
    child.exited = true;
    child.emit("exit", code, signal);
  };
  const spawnImpl = (cmd, argv, opts) => {
    calls.spawn.push({ cmd, argv, opts });
    spawned = true;
    child = new EventEmitter();
    child.pid = 4242;
    child.exited = false;
    // What the real CLI does: start the suite, run the script (which touches the
    // marker first), then tear down and exit with the script's status.
    setImmediate(() => {
      if (laneStarts) fs.writeFileSync(path.join(workDir, LANE_STARTED_MARKER), "");
      if (exitCode !== null) setImmediate(() => exit(exitCode));
    });
    return child;
  };
  const probePort = async (host, port) => (spawned ? busyAfter : busyBefore).includes(port);
  const killGroup = (pid, sig) => {
    calls.signals.push([pid, sig]);
    if (sig === "SIGKILL" || exitsOnSignal) setImmediate(() => exit(null, sig));
  };
  const registry = new Set();
  const logged = [];
  const opts = {
    plan: PLAN,
    workDir,
    appDir: path.join(workDir, "..", "It's App"),
    laneArgv: ["/usr/bin/node", "/tmp/App/qa/verify.mjs", "--profile", "local"],
    spawnImpl,
    probePort,
    killGroup,
    sleep: async () => {},
    registry,
    graceMs: 50,
    budgetMs: 50,
    log: (line) => logged.push(line),
  };
  return { opts, calls, registry, logged, workDir, child: () => child, cleanup: () => fs.rmSync(workDir, { recursive: true, force: true }) };
}

test("it runs the lane inside `firebase emulators:exec` on a demo project, from a generated firebase.json", async () => {
  const h = harness();
  try {
    const result = await runLaneUnderEmulators(h.opts);
    assert.equal(h.calls.spawn.length, 1);
    const { cmd, argv, opts } = h.calls.spawn[0];
    assert.equal(cmd, "firebase");
    assert.deepEqual(argv.slice(0, 5), ["emulators:exec", "--project", "demo-fleetcheck", "--only", "auth,firestore,storage"]);
    const script = argv[5];
    assert.match(script, /cd '.*It'\\''s App'/, "the app dir is shell-quoted — the CLI runs the script through a shell");
    assert.match(script, /exec '\/usr\/bin\/node' '\/tmp\/App\/qa\/verify\.mjs' '--profile' 'local'/);
    assert.equal(opts.cwd, h.workDir, "the suite's config and logs live beside the app, never inside the tree the lane hashes");
    assert.equal(opts.detached, true, "its own process group, so one signal reaches the CLI and the lane together");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h.workDir, "firebase.json"), "utf8")), firebaseJsonFor(PLAN));
    assert.equal(result.status, 0);
    assert.equal(result.laneStarted, true);
    assert.deepEqual(result.failures, []);
    assert.equal(h.registry.size, 0, "a finished suite leaves nothing registered for the signal handler");
  } finally {
    h.cleanup();
  }
});

test("a failing lane: the suite is torn down by the CLI and the ports are checked free afterwards", async () => {
  const h = harness({ exitCode: 1 });
  try {
    const result = await runLaneUnderEmulators(h.opts);
    assert.equal(result.status, 1);
    assert.equal(result.laneStarted, true);
    assert.deepEqual(result.failures, [], "a red lane is judged by its receipt, not re-reported here");
    assert.deepEqual(h.calls.signals, [], "nothing had to be killed");
  } finally {
    h.cleanup();
  }
});

test("a suite that never started is named as such — not reported as a lane that left no receipt", async () => {
  const h = harness({ laneStarts: false, exitCode: 1 });
  try {
    const result = await runLaneUnderEmulators(h.opts);
    assert.equal(result.laneStarted, false);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /Firebase Emulator Suite did not start/);
    assert.match(result.failures[0], /lane never ran/);
  } finally {
    h.cleanup();
  }
});

test("a port held AFTER the suite exited is a failure naming the port", async () => {
  const h = harness({ busyAfter: [18080] });
  try {
    const result = await runLaneUnderEmulators(h.opts);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /18080/);
    assert.match(result.failures[0], /firestore/);
    assert.match(result.failures[0], /still/);
  } finally {
    h.cleanup();
  }
});

test("a port busy BEFORE the run is refused without spawning anything", async () => {
  const h = harness({ busyBefore: [19099] });
  try {
    const result = await runLaneUnderEmulators(h.opts);
    assert.equal(h.calls.spawn.length, 0, "the suite was never started over someone else's port");
    assert.equal(result.laneStarted, false);
    assert.match(result.failures[0], /19099/);
    assert.match(result.failures[0], /already in use/);
  } finally {
    h.cleanup();
  }
});

test("SIGINT is forwarded ONCE to the whole group, awaited, and the ports checked", async () => {
  const h = harness({ exitCode: null });
  try {
    const running = runLaneUnderEmulators(h.opts);
    await new Promise((r) => setImmediate(r));
    assert.equal(h.registry.size, 1, "while the suite runs, the signal handler can reach it");
    const [entry] = h.registry;
    const first = entry.interrupt("SIGINT");
    const second = entry.interrupt("SIGINT");
    await Promise.all([first, second]);
    assert.deepEqual(h.calls.signals, [[4242, "SIGINT"]], "a second SIGINT makes the CLI skip its clean shutdown — send one");
    const result = await running;
    assert.equal(h.registry.size, 0);
    assert.equal(result.laneStarted, true);
  } finally {
    h.cleanup();
  }
});

test("a group that ignores the signal past its budget is killed, and the held port reported", async () => {
  const h = harness({ exitCode: null, exitsOnSignal: false, busyAfter: [18080] });
  try {
    const running = runLaneUnderEmulators(h.opts);
    await new Promise((r) => setImmediate(r));
    const [entry] = h.registry;
    await entry.interrupt("SIGTERM");
    assert.deepEqual(h.calls.signals, [[4242, "SIGTERM"], [4242, "SIGKILL"]]);
    assert.ok(h.logged.some((l) => /18080/.test(l)), `the held port is said out loud:\n${h.logged.join("\n")}`);
    await running;
  } finally {
    h.cleanup();
  }
});

test("a parent that exits with the suite still up asks the group to shut down on the way out", async () => {
  const h = harness({ exitCode: null });
  try {
    const running = runLaneUnderEmulators(h.opts);
    await new Promise((r) => setImmediate(r));
    const [entry] = h.registry;
    entry.abandon();
    assert.deepEqual(h.calls.signals, [[4242, "SIGINT"]], "synchronous — an exit handler cannot await");
    await running;
  } finally {
    h.cleanup();
  }
});
