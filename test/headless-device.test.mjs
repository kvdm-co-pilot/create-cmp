// Device runs are headless — and the lane says so when they are not.
//
// Karel, 2026-09-09: "always run device tests in headless mode". The lane
// already did: with nothing attached, ensureDevice boots the AVD with
// HEADLESS_ARGS. The gap was the other branch — attach a windowed emulator
// FIRST and the lane uses it as-is, silently, and that windowed device becomes
// the thing the proof ran on. It happened three times in one session, by an
// agent hand-booting a window in front of a lane that would have booted its
// own, and nothing said a word.
//
// So this pins two things: the boot flags stay headless, and an attached
// windowed emulator is REPORTED. Not refused — a human debugging a flow wants
// the window, and a gate that blocks that gets worked around rather than
// obeyed. What it may never do is let the difference go unrecorded.

import assert from "node:assert/strict";
import test from "node:test";

import {
  HEADLESS_ARGS,
  attachedEmulatorHeadless,
  ensureDevice,
} from "../packages/harness/src/lib/profiles/cmp/device-provider.mjs";

test("the boot flags are headless, cold, and deterministic", () => {
  assert.ok(HEADLESS_ARGS.includes("-no-window"), "a lane-booted device must have no window");
  assert.ok(HEADLESS_ARGS.includes("-no-snapshot"), "every lane boots the same cold device, not yesterday's state");
  assert.ok(HEADLESS_ARGS.includes("-no-audio"));
  assert.ok(Object.isFrozen(HEADLESS_ARGS), "the flags are a declaration, not a mutable default");
});

test("an attached emulator is judged by the flags it was actually started with", () => {
  const psOut = (line) => () => line;

  const windowed = attachedEmulatorHeadless("emulator-5554", {
    sh: psOut("  4242 /Users/x/Android/sdk/emulator/emulator -avd Medium_Phone_API_35 -port 5554 -no-boot-anim"),
  });
  assert.deepEqual(windowed, { headless: false, pid: 4242 }, "no -no-window means it has a window");

  const headless = attachedEmulatorHeadless("emulator-5554", {
    sh: psOut("  4242 /Users/x/Android/sdk/emulator/emulator -avd cmp_pixel -port 5554 -no-window -no-audio"),
  });
  assert.equal(headless.headless, true);
});

test("the port in the serial picks the right emulator when several are running", () => {
  const two = [
    "  100 /sdk/emulator/emulator -avd A -port 5554 -no-window",
    "  200 /sdk/emulator/emulator -avd B -port 5556",
  ].join("\n");
  assert.deepEqual(attachedEmulatorHeadless("emulator-5554", { sh: () => two }), { headless: true, pid: 100 });
  assert.deepEqual(attachedEmulatorHeadless("emulator-5556", { sh: () => two }), { headless: false, pid: 200 });
});

test("an unanswerable question is null — never a guess in either direction", () => {
  assert.equal(attachedEmulatorHeadless("emulator-5554", { sh: () => "" }), null, "no emulator process: unknown");
  assert.equal(attachedEmulatorHeadless("R5CT12345XY", { sh: () => "irrelevant" }), null, "a real phone is not an emulator");
  assert.equal(attachedEmulatorHeadless("emulator-5554", {}), null, "no shell: unknown, not false");
  assert.equal(
    attachedEmulatorHeadless("emulator-9999", {
      sh: () => ["  1 /sdk/emulator/emulator -avd A", "  2 /sdk/emulator/emulator -avd B"].join("\n"),
    }),
    null,
    "two emulators and no port match: give up rather than blame an arbitrary one",
  );
  assert.equal(
    attachedEmulatorHeadless("emulator-5554", {
      sh: () => { throw new Error("ps unavailable"); },
    }),
    null,
    "an unreadable process table is unknown",
  );
});

test("ensureDevice REPORTS a windowed attached emulator, and still uses it", () => {
  const said = [];
  const sh = (cmd) => {
    if (cmd.startsWith("adb devices")) return { ok: true, out: "List of devices attached\nemulator-5554\tdevice\n" };
    if (cmd.startsWith("ps ")) return { ok: true, out: "  4242 /sdk/emulator/emulator -avd A -port 5554 -no-boot-anim" };
    return { ok: true, out: "" };
  };
  const res = ensureDevice({ sh, env: {}, log: (l) => said.push(l) });

  assert.equal(res.ok, true, "it must not refuse — the window is a warning, not a gate");
  assert.equal(res.serial, "emulator-5554");
  assert.equal(res.headless, false, "the run records HOW the device it used was started");
  assert.equal(said.length, 1, "and says so exactly once");
  assert.match(said[0], /WITH A WINDOW/);
  assert.match(said[0], /-no-window/, "the message names the flags that would have been right");
});

test("a headless attached emulator is used in silence", () => {
  const said = [];
  const sh = (cmd) => {
    if (cmd.startsWith("adb devices")) return { ok: true, out: "List of devices attached\nemulator-5554\tdevice\n" };
    if (cmd.startsWith("ps ")) return { ok: true, out: "  4242 /sdk/emulator/emulator -avd A -port 5554 -no-window" };
    return { ok: true, out: "" };
  };
  const res = ensureDevice({ sh, env: {}, log: (l) => said.push(l) });
  assert.equal(res.headless, true);
  assert.deepEqual(said, [], "nothing to say when the rule is already kept");
});

test("CMP_DEVICE=none still opts out before any of this", () => {
  const res = ensureDevice({ sh: () => ({ ok: true, out: "" }), env: { CMP_DEVICE: "none" }, log: () => {} });
  assert.equal(res.ok, false);
  assert.equal(res.optOut, true);
});
