// device-pin.mjs — ONE emulator, ONE simulator and ONE iOS runtime per machine,
// which each create-cmp project opts into on its own (docs/features/shared-device-pin.md).
//
// The device set is detected from what is already installed (K1). Each project is
// asked whether it uses it (K3) — a project that was never asked behaves as it did
// before the pin existed. The lane (device-provider.mjs, ios-sim.mjs), the doctor
// and the inspector all read this module, so the path and the shape are stated once.
//
// ── ON-DISK CONTRACT ────────────────────────────────────────────────────────
//   Location  $CMP_DEVICE_PIN, else $XDG_CONFIG_HOME/create-cmp/devices.json,
//             else $HOME/.config/create-cmp/devices.json — per MACHINE (K4): an
//             app repo never carries one developer's devices.
//   Shape     { "schema": "cmp-devices/1",
//               "devices": { "decidedAt": ISO-8601,
//                            "android": { "avd": string, "systemImage": string|null } | null,
//                            "ios": { "runtime": string, "version": string, "build": string,
//                                     "simulator": { "name": string, "udid": string } } | null } | null,
//               "projects": { "<project key>": { "mode": "shared" | "per-app",
//                                                "decidedAt": ISO-8601, "path": string } } }
//   Key       the directory holding the repo's COMMON git dir, so every worktree of
//             one repo shares one answer; a directory outside git is its own key.
// ────────────────────────────────────────────────────────────────────────────
//
// Dependency-free Node. Every subprocess goes through an injected `sh`
// (cmd → {ok, out}) and every file read through injected fs, so discovery and
// the proposal are unit-tested without an SDK, Xcode or git.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PIN_SCHEMA = "cmp-devices/1";
export const PROJECT_MODES = Object.freeze(["shared", "per-app"]);
export const REPIN_HINT = "run cmp-doctor (`create-cmp doctor --device-pin repin`)";
const ASSETS_DIR = "/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime";

/**
 * Where this machine's pin file lives — derived ONLY from the environment passed
 * in, so a caller that hands in a synthetic env (every unit test) never reads the
 * developer's real file. Null when the env names no location at all.
 */
export function pinPath({ env = process.env } = {}) {
  if (env.CMP_DEVICE_PIN) return path.resolve(env.CMP_DEVICE_PIN);
  const base = env.XDG_CONFIG_HOME || (env.HOME ? path.join(env.HOME, ".config") : null);
  return base ? path.join(base, "create-cmp", "devices.json") : null;
}

/** Why `devices` is not a valid device set, or null when it is. */
export function devicesProblem(devices) {
  if (!devices || typeof devices !== "object") return "not an object";
  if (!devices.android && !devices.ios) return "the device set pins neither an Android nor an iOS device";
  if (devices.android && (typeof devices.android.avd !== "string" || !devices.android.avd)) return "devices.android.avd is missing";
  if (devices.ios) {
    const s = devices.ios.simulator;
    if (typeof devices.ios.runtime !== "string" || !s || typeof s.udid !== "string" || !s.udid) return "devices.ios.runtime or devices.ios.simulator.udid is missing";
  }
  return null;
}

/** Why `file` is not a valid pin file, or null when it is. */
export function pinFileProblem(file) {
  if (!file || typeof file !== "object" || Array.isArray(file)) return "not a JSON object";
  if (file.schema !== PIN_SCHEMA) return `schema is ${JSON.stringify(file.schema)}, expected "${PIN_SCHEMA}"`;
  if (file.devices !== null && file.devices !== undefined) {
    const p = devicesProblem(file.devices);
    if (p) return p;
  }
  if (!file.projects || typeof file.projects !== "object" || Array.isArray(file.projects)) return "projects is not an object";
  for (const [key, v] of Object.entries(file.projects)) {
    if (!v || !PROJECT_MODES.includes(v.mode)) return `project ${key}: mode is ${JSON.stringify(v && v.mode)}, expected one of ${PROJECT_MODES.join(", ")}`;
  }
  return null;
}

export const emptyPinFile = () => ({ schema: PIN_SCHEMA, devices: null, projects: {} });

/** The whole pin file. Never throws. */
export function readPinFile({ env = process.env, readFile = fs.readFileSync } = {}) {
  const file = pinPath({ env });
  if (!file) return { state: "none", path: null, file: emptyPinFile() };
  let raw;
  try {
    raw = readFile(file, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return { state: "none", path: file, file: emptyPinFile() };
    return { state: "invalid", path: file, reason: `unreadable (${err && err.code ? err.code : String(err)})` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: "invalid", path: file, reason: "not valid JSON" };
  }
  const problem = pinFileProblem(parsed);
  if (problem) return { state: "invalid", path: file, reason: problem };
  return { state: "ok", path: file, file: parsed };
}

/** Write the pin file atomically (temp + rename). Returns the path written. */
export function writePinFile(file, { env = process.env, fsImpl = fs } = {}) {
  const problem = pinFileProblem(file);
  if (problem) throw new Error(`refusing to write an invalid device pin: ${problem}`);
  const target = pinPath({ env });
  if (!target) throw new Error("no location for the device pin: set HOME, XDG_CONFIG_HOME or CMP_DEVICE_PIN");
  fsImpl.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fsImpl.writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n");
  fsImpl.renameSync(tmp, target);
  return target;
}

/**
 * The key a project's answer is stored under: the directory holding the repo's
 * common git dir (every worktree of one repo → one key), else the directory.
 */
export function projectKey(dir, { sh = defaultSh } = {}) {
  const abs = path.resolve(dir);
  const r = sh(`git -C ${JSON.stringify(abs)} rev-parse --path-format=absolute --git-common-dir`, { timeout: 10_000 });
  const common = r.ok ? String(r.out).trim() : "";
  if (!common) return abs;
  return path.basename(common) === ".git" ? path.dirname(common) : common;
}

/**
 * What THIS project uses. Never throws.
 * @returns {{state: "none"|"invalid"|"shared"|"per-app", path: string|null, project?: string,
 *            pin?: object, reason?: string}}  `pin` is the machine's device set when shared.
 */
export function readPin({ env = process.env, readFile = fs.readFileSync, cwd = process.cwd(), sh = defaultSh, key } = {}) {
  const f = readPinFile({ env, readFile });
  if (f.state === "invalid") return { state: "invalid", path: f.path, reason: f.reason };
  if (!f.path) return { state: "none", path: null };
  const project = key || projectKey(cwd, { sh });
  const entry = f.file.projects[project];
  if (!entry) return { state: "none", path: f.path, project };
  if (entry.mode === "per-app") return { state: "per-app", path: f.path, project };
  if (!f.file.devices) return { state: "invalid", path: f.path, project, reason: "this project chose shared devices, but no device set is pinned" };
  return { state: "shared", path: f.path, project, pin: f.file.devices };
}

/** Numeric-aware version order: "26.5" > "18.5", "35" > "9". */
export function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function defaultSh(cmd, { timeout = 120_000 } = {}) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }) };
  } catch (err) {
    return { ok: false, out: String((err && err.stdout) || "") };
  }
}

/** Bytes on disk under `p` (du -sk), or null when unknown. */
export function duBytes(p, { sh = defaultSh } = {}) {
  const r = sh(`du -sk ${JSON.stringify(p)}`, { timeout: 300_000 });
  const kb = parseInt(String(r.out).trim().split(/\s+/)[0], 10);
  return Number.isFinite(kb) ? kb * 1024 : null;
}

export function androidHome({ env = process.env, home = os.homedir() } = {}) {
  return env.ANDROID_HOME || env.ANDROID_SDK_ROOT || path.join(home, "Library", "Android", "sdk");
}

function iniValue(text, key) {
  const m = String(text).match(new RegExp(`^${key.replace(/\./g, "\\.")}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

/** "system-images/android-35/google_apis/arm64-v8a/" → sdkmanager id + API level. */
export function systemImageFromSysdir(sysdir) {
  const parts = String(sysdir || "").replace(/\\/g, "/").split("/").filter(Boolean);
  const i = parts.indexOf("system-images");
  if (i < 0 || parts.length < i + 4) return null;
  const [platform, tag, abi] = parts.slice(i + 1, i + 4);
  return { id: `system-images;${platform};${tag};${abi}`, apiLevel: parseInt(platform.replace(/^android-/, ""), 10) || 0 };
}

/**
 * Installed AVDs (named by their .ini, as `emulator -list-avds` names them) and
 * system images.
 */
export function discoverAndroid({ env = process.env, home = os.homedir(), fsImpl = fs, sizeOf = null } = {}) {
  const avdHome = env.ANDROID_AVD_HOME || path.join(home, ".android", "avd");
  const avds = [];
  let inis = [];
  try {
    inis = fsImpl.readdirSync(avdHome).filter((f) => f.endsWith(".ini")).sort();
  } catch {
    /* no AVD home */
  }
  for (const ini of inis) {
    const name = ini.slice(0, -4);
    let dir = path.join(avdHome, `${name}.avd`);
    try {
      dir = iniValue(fsImpl.readFileSync(path.join(avdHome, ini), "utf8"), "path") || dir;
    } catch {
      /* keep the conventional dir */
    }
    let image = null;
    try {
      image = systemImageFromSysdir(iniValue(fsImpl.readFileSync(path.join(dir, "config.ini"), "utf8"), "image.sysdir.1"));
    } catch {
      /* image unknown */
    }
    avds.push({ name, path: dir, systemImage: image ? image.id : null, apiLevel: image ? image.apiLevel : 0, bytes: sizeOf ? sizeOf(dir) : null });
  }

  const images = [];
  const root = path.join(androidHome({ env, home }), "system-images");
  const ls = (d) => {
    try {
      return fsImpl.readdirSync(d).filter((n) => !n.startsWith(".")).sort();
    } catch {
      return [];
    }
  };
  for (const platform of ls(root)) {
    for (const tag of ls(path.join(root, platform))) {
      for (const abi of ls(path.join(root, platform, tag))) {
        const p = path.join(root, platform, tag, abi);
        const img = systemImageFromSysdir(`system-images/${platform}/${tag}/${abi}`);
        images.push({ id: img.id, apiLevel: img.apiLevel, path: p, bytes: sizeOf ? sizeOf(p) : null });
      }
    }
  }
  return { avds, images };
}

function json(sh, cmd) {
  const r = sh(cmd, { timeout: 120_000 });
  if (!r.ok) return null;
  try {
    return JSON.parse(r.out);
  } catch {
    return null;
  }
}

/**
 * Installed iOS simulator runtimes, available devices, and cached runtime
 * downloads (AssetsV2) — including downloads whose runtime is gone, which is how
 * a deleted runtime comes back.
 */
export function discoverIos({ sh = defaultSh, fsImpl = fs, assetsDir = ASSETS_DIR, platform = process.platform, sizeOf = null } = {}) {
  const empty = { available: false, runtimes: [], devices: [], cachedDownloads: [], xcode: null };
  if (platform !== "darwin") return empty;
  const listed = json(sh, "xcrun simctl list runtimes -j");
  if (!listed) return empty;
  const images = json(sh, "xcrun simctl runtime list -j") || {};
  const imageByBuild = new Map(Object.values(images).map((im) => [im.build, im]));

  const runtimes = (listed.runtimes || [])
    .filter((r) => r.isAvailable !== false && (r.platform === "iOS" || /SimRuntime\.iOS-/.test(r.identifier || "")))
    .map((r) => {
      const im = imageByBuild.get(r.buildversion);
      return { identifier: r.identifier, version: r.version, build: r.buildversion, imageId: im ? im.identifier : null, bytes: im && typeof im.sizeBytes === "number" ? im.sizeBytes : null };
    })
    .sort((a, b) => compareVersions(b.version, a.version));

  const devs = json(sh, "xcrun simctl list devices available -j") || { devices: {} };
  const devices = [];
  for (const [runtime, list] of Object.entries(devs.devices || {})) {
    for (const d of list) devices.push({ udid: d.udid, name: d.name, runtime, bytes: typeof d.dataPathSize === "number" ? d.dataPathSize : null });
  }

  const cachedDownloads = [];
  let assets = [];
  try {
    assets = fsImpl.readdirSync(assetsDir).filter((f) => f.endsWith(".asset")).sort();
  } catch {
    /* no cache */
  }
  for (const a of assets) {
    const p = path.join(assetsDir, a);
    const b = sh(`plutil -extract MobileAssetProperties.Build raw ${JSON.stringify(path.join(p, "Info.plist"))}`, { timeout: 10_000 });
    const v = sh(`plutil -extract MobileAssetProperties.SimulatorVersion raw ${JSON.stringify(path.join(p, "Info.plist"))}`, { timeout: 10_000 });
    cachedDownloads.push({ path: p, build: b.ok ? b.out.trim() : null, version: v.ok ? v.out.trim() : null, bytes: sizeOf ? sizeOf(p) : null });
  }

  const xs = sh("xcode-select -p", { timeout: 10_000 });
  return { available: true, runtimes, devices, cachedDownloads, xcode: xs.ok ? xs.out.trim() : null };
}

/**
 * What the machine's device set would be, from what is installed (K1): the newest iOS runtime and
 * the first available iPhone on it; the AVD on the newest system image
 * (cmp_pixel breaks a tie, then name). Null halves when nothing is installed.
 */
export function proposePin({ android, ios }, { now = () => new Date() } = {}) {
  let a = null;
  const avds = (android && android.avds) || [];
  if (avds.length) {
    const best = [...avds].sort((x, y) => y.apiLevel - x.apiLevel || (y.name === "cmp_pixel") - (x.name === "cmp_pixel") || x.name.localeCompare(y.name))[0];
    a = { avd: best.name, systemImage: best.systemImage };
  }
  let i = null;
  const runtime = ios && ios.runtimes && ios.runtimes[0];
  if (runtime) {
    const sim = ios.devices.find((d) => d.runtime === runtime.identifier && /^iPhone/.test(d.name)) || ios.devices.find((d) => d.runtime === runtime.identifier);
    if (sim) i = { runtime: runtime.identifier, version: runtime.version, build: runtime.build, simulator: { name: sim.name, udid: sim.udid } };
  }
  return { decidedAt: now().toISOString(), android: a, ios: i };
}

/**
 * Everything installed that the pin does not use, with its size and the exact
 * command that removes it. Doctor prints these; it never runs them.
 */
export function reclaimable({ android, ios }, pin) {
  const out = [];
  const keepAvd = pin && pin.android ? pin.android.avd : null;
  const keepImage = pin && pin.android ? pin.android.systemImage : null;
  for (const avd of (android && android.avds) || []) {
    if (keepAvd && avd.name !== keepAvd) out.push({ kind: "android-avd", label: `Android emulator ${avd.name}`, bytes: avd.bytes, command: `avdmanager delete avd -n ${avd.name}` });
  }
  for (const img of (android && android.images) || []) {
    if (keepImage && img.id !== keepImage) out.push({ kind: "android-image", label: `Android system image ${img.id}`, bytes: img.bytes, command: `sdkmanager --uninstall "${img.id}"` });
  }
  const keepBuild = pin && pin.ios ? pin.ios.build : null;
  if (keepBuild && ios) {
    const registered = new Set(ios.runtimes.map((r) => r.build));
    for (const r of ios.runtimes) {
      if (r.build !== keepBuild) out.push({ kind: "ios-runtime", label: `iOS ${r.version} simulator runtime (${r.build})`, bytes: r.bytes, command: `xcrun simctl runtime delete ${r.imageId || r.identifier}` });
    }
    for (const c of ios.cachedDownloads) {
      if (c.build && c.build !== keepBuild) {
        out.push({
          kind: "ios-download",
          label: `cached iOS ${c.version || "?"} runtime download (${c.build})${registered.has(c.build) ? "" : " — its runtime is already gone; this is what re-installs it"}`,
          bytes: registered.has(c.build) ? null : c.bytes ?? null,
          // System Integrity Protection guards AssetsV2: even `sudo rm` is "Operation not
          // permitted" (measured 2026-10-31). Xcode's Components pane is the supported removal.
          command: `Xcode → Settings → Components → iOS ${c.version || c.build} → delete (the files are SIP-protected; rm cannot remove them, not even with sudo)`,
          manual: true,
          path: c.path,
        });
      }
    }
  }
  return out;
}

/** The pinned AVD when the machine opted into sharing, else null. */
export function pinnedAvd(read) {
  return read && read.state === "shared" && read.pin.android ? read.pin.android.avd : null;
}

/** The pinned simulator when the machine opted into sharing, else null. */
export function pinnedSimulator(read) {
  return read && read.state === "shared" && read.pin.ios ? read.pin.ios.simulator : null;
}
