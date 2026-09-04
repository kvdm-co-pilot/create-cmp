// device-provider.mjs — the lane provisions its own device.
//
// Until 2026-09-03 every device-tier step (tokenDrift, e2eSmoke, androidChecks,
// releaseSmoke) SKIPped with "no Android device/emulator attached" and the
// receipt earned L1 with three visible gaps. Visible, and universally ignored:
// the showcase's latest receipt had e2eSmoke SKIP, four hand-written flows had
// never been executed by any gate, and 0.21.0 was published on a fleet check
// with the whole tier SKIPped. Karel: "they can be run headlessly and should
// not take too long." Measured: emulator boot 36 s, e2eSmoke 109 s,
// androidChecks 64 s. So the full lane boots a headless emulator itself when
// nothing is attached, drives it, and shuts it down when the lane exits.
//
// Rules, each bounded (PRINCIPLES #5 — never wait on nothing):
//   - an attached device (adb `device` state) is used as-is, never rebooted;
//   - CMP_DEVICE=none is the ONE explicit opt-out (CI runners without KVM);
//     the step rows say so, and qa/receipt-check.mjs refuses such a receipt
//     as done-evidence at the change stage — an opt-out is visible, never done;
//   - the AVD is CMP_AVD, else the doctor's `cmp_pixel`, else the only AVD;
//     several AVDs and no way to choose is a refusal naming them (per-app AVD
//     isolation: a lane must never guess another app's emulator);
//   - boot is bounded (BOOT_BOUND_MS); past it the emulator is killed and the
//     step rows read ERROR "could not provision a device", which FAILs the
//     lane — a device that never comes up is a failure to test, not a SKIP.
//
// Pure where it can be: every subprocess goes through the injected `sh`
// (the lane's own, so step deadlines apply) and the emulator spawn through
// `spawnImpl`, so the whole decision tree is unit-tested without an SDK.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** How long a headless boot may take before it is killed and reported. */
export const BOOT_BOUND_MS = 240_000;
/** The AVD cmp-doctor creates (src/bootstrap/checks.mjs); preferred when present. */
export const PREFERRED_AVD = "cmp_pixel";
/** Headless, deterministic, no snapshot: every lane boots the same cold device. */
export const HEADLESS_ARGS = Object.freeze(["-no-window", "-no-audio", "-no-boot-anim", "-no-snapshot", "-gpu", "swiftshader_indirect"]);
const POLL_MS = 3000;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Serials in `device` state from `adb devices` output. */
export function parseAdbDevices(out) {
  return String(out ?? "")
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
    .filter(([, state]) => state === "device")
    .map(([serial]) => serial);
}

/** The emulator binary: SDK roots first, then PATH. */
export function emulatorBinary({ env = process.env, exists = fs.existsSync, home = os.homedir() } = {}) {
  const roots = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, path.join(home, "Library", "Android", "sdk"), path.join(home, "Android", "Sdk")].filter(Boolean);
  for (const root of roots) {
    const bin = path.join(root, "emulator", "emulator");
    if (exists(bin)) return bin;
  }
  return "emulator";
}

/**
 * Which AVD to boot. Never a guess between several: another app's emulator
 * carries another app's state, and a lane driving it crosses sessions.
 * @param {string[]} listed `emulator -list-avds` lines
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ok: true, avd: string} | {ok: false, reason: string}}
 */
export function chooseAvd(listed, env = process.env) {
  const avds = listed.map((l) => l.trim()).filter((l) => l && !l.startsWith("INFO") && !l.startsWith("WARNING"));
  if (env.CMP_AVD) {
    if (avds.includes(env.CMP_AVD)) return { ok: true, avd: env.CMP_AVD };
    return { ok: false, reason: `CMP_AVD=${env.CMP_AVD} is not an AVD on this machine (have: ${avds.join(", ") || "none"})` };
  }
  if (avds.includes(PREFERRED_AVD)) return { ok: true, avd: PREFERRED_AVD };
  if (avds.length === 1) return { ok: true, avd: avds[0] };
  if (avds.length === 0) return { ok: false, reason: `no AVD on this machine — run the cmp-doctor skill (it creates ${PREFERRED_AVD}) or set CMP_AVD` };
  return { ok: false, reason: `${avds.length} AVDs and no ${PREFERRED_AVD} (${avds.join(", ")}) — set CMP_AVD to the one this app owns; the lane will not guess between apps' emulators` };
}

/**
 * Ensure a device is attached, booting a headless emulator when none is.
 * @param {{
 *   sh: (cmd: string, opts?: object) => {ok: boolean, out: string},
 *   env?: NodeJS.ProcessEnv, spawnImpl?: typeof spawn, sleep?: (ms: number) => void,
 *   now?: () => number, log?: (line: string) => void, bootBoundMs?: number,
 *   exists?: (p: string) => boolean, kill?: (pid: number) => void,
 * }} deps
 * @returns {{ok: true, serial: string, booted: boolean, avd?: string, pid?: number, bootMs?: number}
 *         | {ok: false, optOut?: boolean, reason: string}}
 */
export function ensureDevice({ sh, env = process.env, spawnImpl = spawn, sleep = sleepSync, now = Date.now, log = () => {}, bootBoundMs = BOOT_BOUND_MS, exists = fs.existsSync, kill = (pid) => process.kill(pid) } = {}) {
  if (env.CMP_DEVICE === "none") {
    return { ok: false, optOut: true, reason: "device tier disabled by CMP_DEVICE=none (the one explicit opt-out; a receipt carrying it is never done-evidence)" };
  }
  const attached = parseAdbDevices(sh("adb devices", { timeout: 10_000 }).out);
  if (attached.length > 0) return { ok: true, serial: attached[0], booted: false };

  const bin = emulatorBinary({ env, exists });
  const listing = sh(`"${bin}" -list-avds`, { timeout: 30_000 });
  if (!listing.ok) {
    return { ok: false, reason: `no device attached and the emulator binary could not list AVDs (${bin}) — install the Android emulator (cmp-doctor) or attach a device` };
  }
  const choice = chooseAvd(listing.out.split("\n"), env);
  if (!choice.ok) return { ok: false, reason: `no device attached and ${choice.reason}` };

  log(`no device attached — booting ${choice.avd} headless (bound ${Math.round(bootBoundMs / 1000)} s)`);
  const started = now();
  let child;
  try {
    child = spawnImpl(bin, ["-avd", choice.avd, ...HEADLESS_ARGS], { detached: true, stdio: "ignore" });
    if (typeof child.unref === "function") child.unref();
  } catch (err) {
    return { ok: false, reason: `could not start the emulator (${err && err.message ? err.message : String(err)})` };
  }
  let serial = null;
  while (now() - started < bootBoundMs) {
    sleep(POLL_MS);
    const serials = parseAdbDevices(sh("adb devices", { timeout: 10_000 }).out);
    if (serials.length === 0) continue;
    serial = serials[0];
    const booted = sh(`adb -s ${serial} shell getprop sys.boot_completed`, { timeout: 10_000 });
    if (booted.ok && booted.out.trim() === "1") {
      return { ok: true, serial, booted: true, avd: choice.avd, pid: child.pid, bootMs: now() - started };
    }
  }
  // Past the bound: kill what we started, and say so. A device that never
  // comes up is a failure to test — the step rows read ERROR, the lane FAILs.
  if (serial) sh(`adb -s ${serial} emu kill`, { timeout: 15_000 });
  try {
    if (child.pid) kill(child.pid);
  } catch {
    /* already gone */
  }
  return { ok: false, reason: `emulator ${choice.avd} did not reach boot_completed within ${Math.round(bootBoundMs / 1000)} s (killed) — boot it by hand once to see why, or set CMP_AVD to a lighter AVD` };
}

/**
 * Shut down the emulator THIS lane booted; an attached device is left alone.
 * CMP_KEEP_DEVICE=1 keeps a booted one up for the next run (saves the boot).
 */
export function releaseDevice(handle, { sh, env = process.env } = {}) {
  if (!handle || !handle.ok || !handle.booted) return { shutdown: false };
  if (env.CMP_KEEP_DEVICE === "1") return { shutdown: false, kept: true };
  sh(`adb -s ${handle.serial} emu kill`, { timeout: 15_000 });
  return { shutdown: true };
}
