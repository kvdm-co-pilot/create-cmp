// device-provider.mjs — the lane provisions its own device. Every branch of
// the decision tree, with no SDK: `sh` and `spawnImpl` are fakes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureDevice, releaseDevice, chooseAvd, parseAdbDevices, emulatorBinary, HEADLESS_ARGS, PREFERRED_AVD } from "../packages/harness/src/lib/device-provider.mjs";

const ADB_NONE = "List of devices attached\n\n";
const ADB_ONE = "List of devices attached\nemulator-5554\tdevice\n\n";

function fakes({ devicesSeq = [ADB_NONE], avds = "cmp_pixel\n", bootSeq = ["", "1"] } = {}) {
  const calls = [];
  let d = 0;
  let b = 0;
  const sh = (cmd) => {
    calls.push(cmd);
    if (cmd === "adb devices") return { ok: true, out: devicesSeq[Math.min(d++, devicesSeq.length - 1)] };
    if (cmd.includes("-list-avds")) return { ok: true, out: avds };
    if (cmd.includes("getprop sys.boot_completed")) return { ok: true, out: `${bootSeq[Math.min(b++, bootSeq.length - 1)]}\n` };
    return { ok: true, out: "" };
  };
  const spawned = [];
  const spawnImpl = (bin, args, opts) => {
    spawned.push({ bin, args, opts });
    return { pid: 4242, unref() {} };
  };
  let t = 0;
  const now = () => (t += 1000);
  const sleep = () => {};
  const killed = [];
  return { calls, sh, spawnImpl, spawned, now, sleep, kill: (pid) => killed.push(pid), killed };
}

test("parseAdbDevices / chooseAvd / emulatorBinary: the small pure parts", () => {
  assert.deepEqual(parseAdbDevices("List of devices attached\nemulator-5554\tdevice\nR58M\toffline\n"), ["emulator-5554"]);
  assert.deepEqual(chooseAvd(["cmp_pixel", "Other"], {}), { ok: true, avd: PREFERRED_AVD });
  assert.deepEqual(chooseAvd(["Only_One"], {}), { ok: true, avd: "Only_One" });
  assert.deepEqual(chooseAvd(["A", "B"], { CMP_AVD: "B" }), { ok: true, avd: "B" });
  assert.match(chooseAvd(["A", "B"], {}).reason, /2 AVDs and no cmp_pixel \(A, B\) — set CMP_AVD/);
  assert.match(chooseAvd([], {}).reason, /no AVD on this machine — run the cmp-doctor/);
  assert.match(chooseAvd(["A"], { CMP_AVD: "Z" }).reason, /CMP_AVD=Z is not an AVD/);
  assert.equal(emulatorBinary({ env: { ANDROID_HOME: "/sdk" }, exists: (p) => p === "/sdk/emulator/emulator" }), "/sdk/emulator/emulator");
  assert.equal(emulatorBinary({ env: {}, exists: () => false, home: "/nowhere" }), "emulator");
});

test("an attached device is used as-is — nothing is booted, nothing is shut down", () => {
  const f = fakes({ devicesSeq: [ADB_ONE] });
  const d = ensureDevice({ sh: f.sh, env: {}, spawnImpl: f.spawnImpl, now: f.now, sleep: f.sleep });
  assert.deepEqual(d, { ok: true, serial: "emulator-5554", booted: false });
  assert.equal(f.spawned.length, 0);
  assert.deepEqual(releaseDevice(d, { sh: f.sh, env: {} }), { shutdown: false });
  assert.ok(!f.calls.some((c) => c.includes("emu kill")), "an attached device is never killed");
});

test("CMP_DEVICE=none is the one explicit opt-out: no adb call, no boot, optOut flagged", () => {
  const f = fakes();
  const d = ensureDevice({ sh: f.sh, env: { CMP_DEVICE: "none" }, spawnImpl: f.spawnImpl, now: f.now, sleep: f.sleep });
  assert.equal(d.ok, false);
  assert.equal(d.optOut, true);
  assert.match(d.reason, /CMP_DEVICE=none/);
  assert.equal(f.calls.length, 0);
});

test("nothing attached → boots the preferred AVD headless, waits for boot_completed, reports serial + bootMs; released → emu kill", () => {
  const f = fakes({ devicesSeq: [ADB_NONE, ADB_NONE, ADB_ONE, ADB_ONE], bootSeq: ["", "1"] });
  const logs = [];
  const d = ensureDevice({ sh: f.sh, env: {}, spawnImpl: f.spawnImpl, now: f.now, sleep: f.sleep, log: (l) => logs.push(l), exists: () => false });
  assert.equal(d.ok, true, d.reason);
  assert.equal(d.booted, true);
  assert.equal(d.serial, "emulator-5554");
  assert.equal(d.avd, "cmp_pixel");
  assert.equal(d.pid, 4242);
  assert.ok(d.bootMs > 0);
  assert.equal(f.spawned.length, 1);
  assert.deepEqual(f.spawned[0].args, ["-avd", "cmp_pixel", ...HEADLESS_ARGS]);
  assert.equal(f.spawned[0].opts.detached, true);
  assert.match(logs[0], /booting cmp_pixel headless/);
  const down = releaseDevice(d, { sh: f.sh, env: {} });
  assert.deepEqual(down, { shutdown: true });
  assert.ok(f.calls.includes("adb -s emulator-5554 emu kill"));
  assert.deepEqual(releaseDevice(d, { sh: f.sh, env: { CMP_KEEP_DEVICE: "1" } }), { shutdown: false, kept: true });
});

test("PLANTED: a boot that never completes is killed at the bound and reported — not a SKIP, not a hang", () => {
  const f = fakes({ devicesSeq: [ADB_NONE, ADB_ONE], bootSeq: ["0"] });
  const d = ensureDevice({ sh: f.sh, env: {}, spawnImpl: f.spawnImpl, now: f.now, sleep: f.sleep, kill: f.kill, bootBoundMs: 10_000, exists: () => false });
  assert.equal(d.ok, false);
  assert.equal(d.optOut, undefined);
  assert.match(d.reason, /did not reach boot_completed within 10 s \(killed\)/);
  assert.ok(f.calls.includes("adb -s emulator-5554 emu kill"), "the half-booted emulator is killed");
  assert.deepEqual(f.killed, [4242]);
});

test("no AVD, or several with no way to choose → a refusal naming the fix, never a guess", () => {
  const none = fakes({ avds: "" });
  assert.match(ensureDevice({ sh: none.sh, env: {}, spawnImpl: none.spawnImpl, now: none.now, sleep: none.sleep, exists: () => false }).reason, /no device attached and no AVD on this machine/);
  const many = fakes({ avds: "Fuelled_API_35\nBrat_Princess\n" });
  const d = ensureDevice({ sh: many.sh, env: {}, spawnImpl: many.spawnImpl, now: many.now, sleep: many.sleep, exists: () => false });
  assert.match(d.reason, /2 AVDs and no cmp_pixel \(Fuelled_API_35, Brat_Princess\)/);
  assert.equal(many.spawned.length, 0, "never boots another app's emulator on a guess");
});
