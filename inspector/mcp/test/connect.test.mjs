// connect.mjs — the self-healing tier-1 handshake (agent-flow-retrospective §5)
// and the verified relaunch (C10) it absorbed.
//
// Contracts under test: each of the four real-world failure conditions heals
// in order (missing forward, dead app, stale adb transport, replaced process);
// every failure path names its stage and the one next command — never a bare
// timeout; relaunch is proven by processStartedAtMs moving forward, not assumed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { connectLive, relaunchApp, resolveAppId, ConnectError, isOfflineClass } from "../src/lib/connect.mjs";

const HEALTH = { schemaVersion: 1, appId: "com.example.app", processStartedAtMs: 1_000 };

// A scriptable exec: `script` maps a matcher over the joined command to a
// behavior ({ stdout } or a thrown Error). Records every call.
function makeExec(script) {
  const calls = [];
  const exec = async (cmd, args) => {
    const line = [cmd, ...args].join(" ");
    calls.push(line);
    for (const [pattern, behave] of script) {
      if (line.includes(pattern)) return behave(line);
    }
    return { stdout: "" };
  };
  return { exec, calls };
}

const oneDevice = ["adb devices", () => ({ stdout: "List of devices attached\nemulator-5554\tdevice\n" })];

test("happy path: device attached, forward created, health answers — nothing to heal", async () => {
  const { exec, calls } = makeExec([oneDevice]);
  const r = await connectLive({
    port: 9500,
    exec,
    fetchHealthImpl: async () => HEALTH,
  });
  assert.deepEqual(r.healed, []);
  assert.equal(r.appId, "com.example.app");
  assert.ok(calls.some((c) => c === "adb forward tcp:9500 tcp:9500"), "the forward is ensured (created)");
});

test("no device attached: stage 'device' error naming the next command, no bare timeout", async () => {
  const { exec } = makeExec([["adb devices", () => ({ stdout: "List of devices attached\n" })]]);
  await assert.rejects(
    connectLive({ port: 9500, exec, fetchHealthImpl: async () => HEALTH }),
    (err) => {
      assert.ok(err instanceof ConnectError);
      assert.equal(err.stage, "device");
      assert.match(err.fix, /adb devices/);
      return true;
    }
  );
});

test("adb missing from PATH: stage 'adb' with an install fix", async () => {
  const exec = async () => {
    const e = new Error("spawn adb ENOENT");
    e.code = "ENOENT";
    throw e;
  };
  await assert.rejects(connectLive({ port: 9500, exec, fetchHealthImpl: async () => HEALTH }), (err) => {
    assert.equal(err.stage, "adb");
    assert.match(err.fix, /platform-tools/);
    return true;
  });
});

test("multiple devices, no serial: stage 'device' error listing the candidates", async () => {
  const { exec } = makeExec([
    ["adb devices", () => ({ stdout: "List of devices attached\nemulator-5554\tdevice\nemulator-5556\tdevice\n" })],
  ]);
  await assert.rejects(connectLive({ port: 9500, exec, fetchHealthImpl: async () => HEALTH }), (err) => {
    assert.equal(err.stage, "device");
    assert.match(err.fix, /emulator-5554, emulator-5556/);
    return true;
  });
});

test("dead health: launches the app (resolved applicationId, never hardcoded) and re-polls to green", async () => {
  const dir = mkdtempSync(join(tmpdir(), "connect-test-"));
  mkdirSync(join(dir, "composeApp"), { recursive: true });
  writeFileSync(join(dir, "composeApp", "build.gradle.kts"), 'android {\n  defaultConfig {\n    applicationId = "com.stamped.realapp"\n  }\n}\n');
  let launched = false;
  const { exec, calls } = makeExec([
    oneDevice,
    ["monkey", () => { launched = true; return { stdout: "Events injected: 1" }; }],
  ]);
  const r = await connectLive({
    port: 9500,
    projectDir: dir,
    exec,
    sleep: async () => {},
    fetchHealthImpl: async () => {
      if (!launched) throw new Error("could not reach the live inspector");
      return { ...HEALTH, appId: "com.stamped.realapp" };
    },
  });
  assert.deepEqual(r.healed, ["app-launched"]);
  assert.equal(r.appId, "com.stamped.realapp");
  assert.ok(calls.some((c) => c.includes("monkey -p com.stamped.realapp")), "launch used the PARSED applicationId");
});

test("launched app that never answers health: stage 'health' error naming logcat/installDebug, not a bare timeout", async () => {
  const { exec } = makeExec([oneDevice, ["monkey", () => ({ stdout: "" })]]);
  await assert.rejects(
    connectLive({
      port: 9500,
      appId: "com.example.app",
      exec,
      sleep: async () => {},
      launchWaitMs: 1, // exhaust the backoff budget immediately
      fetchHealthImpl: async () => {
        throw new Error("could not reach the live inspector");
      },
    }),
    (err) => {
      assert.equal(err.stage, "health");
      assert.match(err.message, /DEBUG build|crashing/);
      assert.match(err.fix, /logcat|installDebug/);
      return true;
    }
  );
});

test("stale transport (`device offline` while adb devices says device): ONE adb server reset, then the whole sequence retried", async () => {
  let forwardAttempts = 0;
  const { exec, calls } = makeExec([
    oneDevice,
    [
      "forward",
      () => {
        forwardAttempts++;
        if (forwardAttempts === 1) throw new Error("adb: error: device offline");
        return { stdout: "" };
      },
    ],
  ]);
  const r = await connectLive({ port: 9500, exec, sleep: async () => {}, fetchHealthImpl: async () => HEALTH });
  assert.deepEqual(r.healed, ["adb-transport-reset"]);
  const idx = (p) => calls.findIndex((c) => c.includes(p));
  assert.ok(idx("kill-server") >= 0 && idx("start-server") > idx("kill-server") && idx("wait-for-device") > idx("start-server"),
    "kill-server → start-server → wait-for-device, in order");
  assert.equal(forwardAttempts, 2, "the whole sequence ran exactly twice");
});

test("offline persisting after the reset: the error says the reset already happened (no second retry)", async () => {
  const { exec } = makeExec([
    oneDevice,
    ["forward", () => { throw new Error("adb: error: device offline"); }],
  ]);
  await assert.rejects(
    connectLive({ port: 9500, exec, sleep: async () => {}, fetchHealthImpl: async () => HEALTH }),
    (err) => {
      assert.equal(err.stage, "forward");
      assert.match(err.message, /already reset once/);
      return true;
    }
  );
});

test("relaunch: true — absorbed relaunch_app: force-stop → launch, proven by processStartedAtMs advancing", async () => {
  let started = 1_000;
  const { exec, calls } = makeExec([
    oneDevice,
    ["monkey", () => { started = 2_000; return { stdout: "" }; }],
  ]);
  const r = await connectLive({
    port: 9500,
    relaunch: true,
    exec,
    sleep: async () => {},
    fetchHealthImpl: async () => ({ ...HEALTH, processStartedAtMs: started }),
  });
  assert.deepEqual(r.healed, ["relaunched"]);
  assert.equal(r.relaunch.beforeStartedAtMs, 1_000);
  assert.equal(r.relaunch.afterStartedAtMs, 2_000);
  assert.ok(calls.some((c) => c.includes("force-stop com.example.app")));
});

test("resolveAppId precedence: applicationId > create-cmp.json package > namespace; nothing = stage 'app-id'", () => {
  const dir = mkdtempSync(join(tmpdir(), "appid-test-"));
  mkdirSync(join(dir, "composeApp"), { recursive: true });
  writeFileSync(join(dir, "create-cmp.json"), JSON.stringify({ package: "com.spec.pkg" }));
  writeFileSync(
    join(dir, "composeApp", "build.gradle.kts"),
    'namespace = "com.ns.pkg"\napplicationId = "com.app.id"\n'
  );
  assert.equal(resolveAppId(dir), "com.app.id");
  writeFileSync(join(dir, "composeApp", "build.gradle.kts"), 'namespace = "com.ns.pkg"\n');
  assert.equal(resolveAppId(dir), "com.ns.pkg");
  const bare = mkdtempSync(join(tmpdir(), "appid-bare-"));
  assert.throws(() => resolveAppId(bare), (err) => err instanceof ConnectError && err.stage === "app-id");
});

test("isOfflineClass matches the transport family, not ordinary failures", () => {
  assert.ok(isOfflineClass(new Error("adb: error: device offline")));
  assert.ok(isOfflineClass(new Error("error: device 'emulator-5554' not found")));
  assert.ok(isOfflineClass(new Error("error: protocol fault (couldn't read status): Connection reset by peer")));
  assert.ok(!isOfflineClass(new Error("no devices/emulators found")));
  assert.ok(!isOfflineClass(new Error("INSTALL_FAILED_UPDATE_INCOMPATIBLE")));
});

// ── relaunchApp (moved here from capture.mjs with its tool absorbed) ────────────

test("relaunchApp: proven by processStartedAtMs advancing; adb sequence recorded", async () => {
  const calls = [];
  let started = 1_000;
  const r = await relaunchApp({
    appId: "com.example.app",
    clearState: true,
    exec: async (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      if (args.includes("monkey")) started = 2_000; // launch -> new process start
    },
    fetchHealthImpl: async () => ({ processStartedAtMs: started }),
    sleep: async () => {},
  });
  assert.equal(r.beforeStartedAtMs, 1_000);
  assert.equal(r.afterStartedAtMs, 2_000);
  assert.equal(r.clearedState, true);
  assert.ok(calls.some((c) => c.includes("force-stop")), "force-stop issued");
  assert.ok(calls.some((c) => c.includes("pm clear")), "pm clear issued when clearState");
  const order = [calls.findIndex((c) => c.includes("force-stop")), calls.findIndex((c) => c.includes("pm clear")), calls.findIndex((c) => c.includes("monkey"))];
  assert.deepEqual([...order].sort((a, b) => a - b), order, "force-stop -> pm clear -> launch, in that order");
});

test("relaunchApp: a process that never restarts is an error, not a success", async () => {
  await assert.rejects(
    relaunchApp({
      appId: "com.example.app",
      exec: async () => {},
      fetchHealthImpl: async () => ({ processStartedAtMs: 1_000 }), // never advances
      sleep: async () => {},
      waitTimeoutMs: 30, // a few poll iterations, then give up
    }),
    /no fresh process within/
  );
});
