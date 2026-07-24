// live-session.mjs (A1) — the console's "Start live session" chain, which had no
// test coverage at all until a real run reported `forward` with the detail
// "[object Object]".
//
// What matters here is HONESTY of the reported state, not orchestration cleverness:
// every step's outcome is a line a human reads while waiting. A step that says
// nothing useful, or a chain that keeps running past a failure, is the bug.
//
// The whole chain is driven through injected `exec`/`fetchImpl`, so nothing here
// touches adb, Gradle, or a device.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLiveSession, getLiveDeviceStatus } from "../src/lib/live-session.mjs";

/** A project dir just real enough for resolveAppId(). */
function fakeProject(appId = "com.acme.app") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-live-"));
  fs.mkdirSync(path.join(dir, "composeApp"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "composeApp", "build.gradle.kts"),
    `android {\n  defaultConfig {\n    applicationId = "${appId}"\n  }\n}\n`,
  );
  return dir;
}

/** Records every spawn; answers `adb devices` with one attached emulator. */
function recordingExec(overrides = {}) {
  const calls = [];
  const exec = async (cmd, args = []) => {
    calls.push(`${cmd} ${args.join(" ")}`.trim());
    const key = `${cmd} ${args[0] ?? ""}`.trim();
    if (overrides[key]) return overrides[key]();
    if (cmd === "adb" && args[0] === "devices") {
      return { stdout: "List of devices attached\nemulator-5554\tdevice\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
  return { exec, calls };
}

async function settle(session) {
  // start() is fire-and-forget by design (the page polls /live/status).
  for (let i = 0; i < 200 && session.status().running; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  return session.status();
}

test("live-session: a healthy chain reports every step with a detail a human can read", async () => {
  const projectDir = fakeProject("com.acme.app");
  try {
    const { exec, calls } = recordingExec();
    const session = createLiveSession({
      projectDir,
      port: 9500,
      exec,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ appId: "com.acme.app", buildType: "debug" }),
      }),
    });

    assert.deepEqual(session.start(), { started: true });
    const state = await settle(session);

    assert.equal(state.ok, true, "the chain succeeded");
    assert.deepEqual(
      state.steps.map((s) => s.name),
      ["device", "installDebug", "launch", "forward", "health"],
      "steps run in the documented order",
    );
    for (const s of state.steps) assert.equal(s.status, "ok", `${s.name} ok`);

    // The regression this file was written for: `forward` returned its exec result
    // straight through, and String({stdout,stderr}) is "[object Object]" — a line
    // that tells the waiting human exactly nothing.
    const byName = Object.fromEntries(state.steps.map((s) => [s.name, s]));
    for (const s of state.steps) {
      assert.notEqual(s.detail, "[object Object]", `${s.name} detail is not a stringified object`);
    }
    assert.match(byName.device.detail, /emulator-5554/, "device names the device it found");
    assert.match(byName.launch.detail, /com\.acme\.app/, "launch names the app it launched");
    assert.match(byName.forward.detail, /9500/, "forward names the port pair it bound");
    assert.match(byName.health.detail, /com\.acme\.app \(debug\)/, "health names what answered");

    assert.ok(
      calls.some((c) => c.startsWith("adb forward tcp:9500 tcp:9500")),
      "the forward really was issued",
    );
    assert.ok(
      calls.some((c) => c.includes(":composeApp:installDebug")),
      "the debug build really was installed — the inspector only exists in debug",
    );
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("live-session: a failing step stops the chain and keeps the REAL error, never a spinner", async () => {
  const projectDir = fakeProject();
  try {
    const { exec } = recordingExec({
      "./gradlew :composeApp:installDebug": () => {
        throw new Error("INSTALL_FAILED_INSUFFICIENT_STORAGE");
      },
    });
    const session = createLiveSession({ projectDir, port: 9500, exec });

    session.start();
    const state = await settle(session);

    assert.equal(state.ok, false, "the chain reports failure, not an endless running state");
    assert.deepEqual(
      state.steps.map((s) => s.name),
      ["device", "installDebug"],
      "the chain stops at the failure — launch/forward/health never pretend to have run",
    );
    const failed = state.steps[1];
    assert.equal(failed.status, "fail");
    assert.match(failed.detail, /INSTALL_FAILED_INSUFFICIENT_STORAGE/, "the device's own error survives");
    assert.ok(state.finishedAt, "the run is closed out");
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("live-session: a second start while a chain runs reports the running chain instead of racing it", async () => {
  const projectDir = fakeProject();
  try {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const { exec } = recordingExec({ "./gradlew :composeApp:installDebug": () => gate });
    const session = createLiveSession({ projectDir, port: 9500, exec });

    assert.deepEqual(session.start(), { started: true });
    await new Promise((r) => setTimeout(r, 20));
    const second = session.start();
    assert.equal(second.started, false);
    assert.match(second.reason, /already running/i);

    release({ stdout: "", stderr: "" });
    await settle(session);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("getLiveDeviceStatus: unreachable is a normal reported state, and one transient failure does not flicker it", async () => {
  const down = await getLiveDeviceStatus({
    port: 9500,
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(down.reachable, false);
  assert.match(down.reason, /not reachable/i, "the reason is stated, not swallowed");

  // The debug inspector's minimal server closes sockets per request, so a pooled
  // connection can die on exactly one fetch. That must not read as "disconnected".
  let attempts = 0;
  const flaky = await getLiveDeviceStatus({
    port: 9500,
    fetchImpl: async () => {
      attempts++;
      if (attempts === 1) throw new Error("socket hang up");
      return { ok: true, json: async () => ({ appId: "com.acme.app", buildType: "debug" }) };
    },
  });
  assert.equal(flaky.reachable, true, "the silent retry rescues a single transient failure");
  assert.equal(attempts, 2);

  const http500 = await getLiveDeviceStatus({
    port: 9500,
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });
  assert.equal(http500.reachable, false);
  assert.match(http500.reason, /HTTP 500/, "a bad response reports its status, never a guess");
});
