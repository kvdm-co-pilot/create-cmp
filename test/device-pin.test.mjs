// The shared device pin (docs/features/shared-device-pin.md): opt-in, detected
// from what is installed, refused when gone, never a download. No SDK, no Xcode:
// every subprocess and file read is a fake.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  pinPath, readPin, readPinFile, writePinFile, pinFileProblem, projectKey, proposePin, reclaimable, discoverAndroid, discoverIos,
  systemImageFromSysdir, compareVersions, PIN_SCHEMA,
} from "../packages/harness/src/lib/profiles/cmp/device-pin.mjs";
import { resolveSimulator } from "../packages/harness/src/lib/profiles/cmp/ios-sim.mjs";
import { chooseAvd, ensureDevice, HEADLESS_ARGS, SHARED_BOOT_ARGS } from "../packages/harness/src/lib/profiles/cmp/device-provider.mjs";
import { runDevicePin, renderOffer } from "../src/lib/device-pin-doctor.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cmp-pin-"));
const SHARED = {
  decidedAt: "2026-10-31T00:00:00.000Z",
  android: { avd: "Shared_35", systemImage: "system-images;android-35;google_apis;arm64-v8a" },
  ios: { runtime: "com.apple.CoreSimulator.SimRuntime.iOS-26-5", version: "26.5", build: "23F77", simulator: { name: "iPhone 17 Pro", udid: "U-265" } },
};
const sharedRead = { state: "shared", path: "/p", project: "/apps/a", pin: SHARED };

test("the pin's location comes only from the env it is handed — a synthetic env never reads the real one", () => {
  assert.equal(pinPath({ env: {} }), null);
  assert.equal(readPin({ env: {} }).state, "none");
  assert.equal(pinPath({ env: { HOME: "/h" } }), "/h/.config/create-cmp/devices.json");
  assert.equal(pinPath({ env: { HOME: "/h", XDG_CONFIG_HOME: "/x" } }), "/x/create-cmp/devices.json");
  assert.equal(pinPath({ env: { HOME: "/h", CMP_DEVICE_PIN: "/o/p.json" } }), "/o/p.json");
});

test("the answer is per PROJECT: a project never asked is none, shared reads the machine's set, per-app is per-app", () => {
  const dir = tmp();
  const env = { CMP_DEVICE_PIN: path.join(dir, "devices.json") };
  assert.equal(readPin({ env, key: "/apps/a" }).state, "none");
  fs.writeFileSync(env.CMP_DEVICE_PIN, "{nope");
  assert.deepEqual([readPin({ env, key: "/apps/a" }).state, readPin({ env, key: "/apps/a" }).reason], ["invalid", "not valid JSON"]);
  writePinFile({ schema: PIN_SCHEMA, devices: SHARED, projects: { "/apps/a": { mode: "shared", decidedAt: "x", path: "/apps/a" }, "/apps/b": { mode: "per-app", decidedAt: "x", path: "/apps/b" } } }, { env });
  assert.deepEqual(readPin({ env, key: "/apps/a" }).pin, SHARED);
  assert.equal(readPin({ env, key: "/apps/b" }).state, "per-app");
  assert.equal(readPin({ env, key: "/apps/new" }).state, "none", "a new project is asked again, not swept into the share");
  writePinFile({ schema: PIN_SCHEMA, devices: null, projects: { "/apps/a": { mode: "shared", decidedAt: "x", path: "/apps/a" } } }, { env });
  assert.match(readPin({ env, key: "/apps/a" }).reason, /no device set is pinned/);
  assert.throws(() => writePinFile({ schema: PIN_SCHEMA, devices: null, projects: { a: { mode: "sometimes" } } }, { env }), /mode is "sometimes"/);
  assert.equal(pinFileProblem({ schema: PIN_SCHEMA, devices: { android: null, ios: null }, projects: {} }), "the device set pins neither an Android nor an iOS device");
  assert.equal(readPinFile({ env: {} }).path, null);
});

test("every worktree of one repo is one project; a directory outside git is its own", () => {
  const sh = (cmd) => (cmd.includes("/repo/wt") || cmd.includes("/repo/main") ? { ok: true, out: "/repo/main/.git\n" } : { ok: false, out: "" });
  assert.equal(projectKey("/repo/wt", { sh }), "/repo/main");
  assert.equal(projectKey("/repo/main", { sh }), "/repo/main");
  assert.equal(projectKey("/scratch/app", { sh }), "/scratch/app");
});

test("discovery reads AVDs by their .ini name and the image each is built on", () => {
  const files = {
    "/h/.android/avd/Medium_Phone_API_35.ini": "path=/h/.android/avd/Medium_Phone.avd\ntarget=android-35\n",
    "/h/.android/avd/Medium_Phone.avd/config.ini": "image.sysdir.1=system-images/android-35/google_apis_playstore/arm64-v8a/\n",
    "/h/.android/avd/Old.ini": "path=/h/.android/avd/Old.avd\n",
    "/h/.android/avd/Old.avd/config.ini": "image.sysdir.1=system-images/android-33/google_apis/arm64-v8a/\n",
  };
  const dirs = {
    "/h/.android/avd": ["Medium_Phone.avd", "Medium_Phone_API_35.ini", "Old.avd", "Old.ini"],
    "/sdk/system-images": ["android-33", "android-35"],
    "/sdk/system-images/android-33": ["google_apis"], "/sdk/system-images/android-33/google_apis": ["arm64-v8a"],
    "/sdk/system-images/android-35": ["google_apis_playstore"], "/sdk/system-images/android-35/google_apis_playstore": ["arm64-v8a"],
  };
  const fsImpl = {
    readdirSync: (d) => { if (!dirs[d]) throw Object.assign(new Error("x"), { code: "ENOENT" }); return dirs[d]; },
    readFileSync: (f) => { if (!(f in files)) throw Object.assign(new Error("x"), { code: "ENOENT" }); return files[f]; },
  };
  const a = discoverAndroid({ env: { ANDROID_HOME: "/sdk" }, home: "/h", fsImpl });
  assert.deepEqual(a.avds.map((x) => [x.name, x.apiLevel]), [["Medium_Phone_API_35", 35], ["Old", 33]]);
  assert.deepEqual(a.images.map((i) => i.id), ["system-images;android-33;google_apis;arm64-v8a", "system-images;android-35;google_apis_playstore;arm64-v8a"]);
  const p = proposePin({ android: a, ios: null });
  assert.equal(p.android.avd, "Medium_Phone_API_35", "the newest image wins, never a hard-coded API level");
  const r = reclaimable({ android: a, ios: null }, p);
  assert.deepEqual(r.map((x) => x.command), ["avdmanager delete avd -n Old", 'sdkmanager --uninstall "system-images;android-33;google_apis;arm64-v8a"']);
  assert.equal(systemImageFromSysdir("nonsense"), null);
  assert.ok(compareVersions("26.5", "18.5") > 0 && compareVersions("9", "35") < 0);
});

function iosSh({ runtimes, devices, images = {}, assets = {} }) {
  return (cmd) => {
    if (cmd === "xcrun simctl list runtimes -j") return { ok: true, out: JSON.stringify({ runtimes }) };
    if (cmd === "xcrun simctl runtime list -j") return { ok: true, out: JSON.stringify(images) };
    if (cmd === "xcrun simctl list devices available -j") return { ok: true, out: JSON.stringify({ devices }) };
    if (cmd === "xcode-select -p") return { ok: true, out: "/Applications/Xcode.app/Contents/Developer\n" };
    const m = cmd.match(/MobileAssetProperties\.(Build|SimulatorVersion) raw "(.*)\/Info\.plist"/);
    if (m) return { ok: true, out: `${assets[path.basename(m[2])][m[1] === "Build" ? 0 : 1]}\n` };
    return { ok: false, out: "" };
  };
}
const RT = (v, b) => ({ identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${v.replace(".", "-")}`, version: v, buildversion: b, platform: "iOS", isAvailable: true });
const IOS = {
  runtimes: [RT("18.5", "22F77"), RT("26.5", "23F77")],
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-18-5": [{ udid: "U-185", name: "iPhone 16 Pro" }],
    "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [{ udid: "U-IPAD", name: "iPad Air 11-inch (M4)" }, { udid: "U-265", name: "iPhone 17 Pro" }],
  },
  images: { a: { identifier: "IMG-185", build: "22F77", sizeBytes: 19e9 }, b: { identifier: "IMG-265", build: "23F77", sizeBytes: 8e9 } },
  assets: { "old.asset": ["21A1", "17.0"], "keep.asset": ["23F77", "26.5"] },
};

test("iOS: the newest runtime and an iPhone on it are proposed; the older runtime and an orphaned download are reclaimable", () => {
  const fsImpl = { readdirSync: () => ["keep.asset", "old.asset"] };
  const ios = discoverIos({ sh: iosSh(IOS), fsImpl, assetsDir: "/A", platform: "darwin" });
  const p = proposePin({ android: null, ios });
  assert.deepEqual(p.ios.simulator, { name: "iPhone 17 Pro", udid: "U-265" });
  const r = reclaimable({ android: null, ios }, p);
  assert.deepEqual(r.map((x) => x.kind), ["ios-runtime", "ios-download"]);
  assert.equal(r[0].command, "xcrun simctl runtime delete IMG-185");
  assert.match(r[1].label, /its runtime is already gone; this is what re-installs it/);
  assert.equal(r[1].manual, true);
  assert.match(r[1].command, /Xcode → Settings → Components/);
  assert.doesNotMatch(r[1].command, /sudo rm/, "SIP refuses rm in AssetsV2, even as root");
  assert.equal(discoverIos({ platform: "linux" }).available, false);
});

test("ios-sim: CMP_IOS_SIM wins, then the pin (refused when gone), else the newest runtime's first iPhone — never list order", () => {
  const sh = iosSh(IOS);
  assert.equal(resolveSimulator({ sh, env: {}, pin: { state: "none" } }).udid, "U-265");
  assert.equal(resolveSimulator({ sh, env: { CMP_IOS_SIM: "iPhone 16 Pro" }, pin: sharedRead }).udid, "U-185");
  assert.equal(resolveSimulator({ sh, env: {}, pin: sharedRead }).source, "pin");
  const gone = { state: "shared", path: "/p", pin: { ...SHARED, ios: { ...SHARED.ios, simulator: { name: "iPhone 17 Pro", udid: "GONE" } } } };
  assert.match(resolveSimulator({ sh, env: {}, pin: gone }).reason, /not available on this machine .* nothing is downloaded or substituted/);
  assert.match(resolveSimulator({ sh, env: {}, pin: { state: "invalid", path: "/p", reason: "not valid JSON" } }).reason, /invalid/);
  assert.match(resolveSimulator({ sh, env: { CMP_IOS_SIM: "iPhone 99" }, pin: sharedRead }).reason, /nothing is downloaded/);
});

test("chooseAvd: a shared pin replaces the per-app rule; CMP_AVD still wins; a missing pinned AVD is refused", () => {
  assert.deepEqual(chooseAvd(["cmp_pixel", "Shared_35"], {}, sharedRead), { ok: true, avd: "Shared_35", shared: true });
  assert.deepEqual(chooseAvd(["cmp_pixel", "Shared_35"], { CMP_AVD: "cmp_pixel" }, sharedRead), { ok: true, avd: "cmp_pixel" });
  assert.match(chooseAvd(["cmp_pixel"], {}, sharedRead).reason, /pinned shared AVD Shared_35 is not on this machine/);
  assert.deepEqual(chooseAvd(["A", "cmp_pixel"], {}, { state: "per-app" }), { ok: true, avd: "cmp_pixel" }, "per-app is the old behaviour");
  assert.match(chooseAvd(["A"], {}, { state: "invalid", path: "/p", reason: "x" }).reason, /invalid/);
});

test("ensureDevice boots the shared emulator wiped, and a per-app one exactly as before", () => {
  for (const [pin, avds, wiped] of [[sharedRead, "Shared_35\n", true], [{ state: "none" }, "cmp_pixel\n", false]]) {
    const spawned = [];
    let n = 0;
    const sh = (cmd) => {
      if (cmd === "adb devices") return { ok: true, out: n++ === 0 ? "List of devices attached\n\n" : "List of devices attached\nemulator-5554\tdevice\n" };
      if (cmd.includes("-list-avds")) return { ok: true, out: avds };
      if (cmd.includes("boot_completed")) return { ok: true, out: "1\n" };
      return { ok: true, out: "" };
    };
    let t = 0;
    const d = ensureDevice({ sh, env: {}, pin, spawnImpl: (bin, args) => (spawned.push(args), { pid: 1, unref() {} }), now: () => (t += 1000), sleep: () => {}, exists: () => false });
    assert.equal(d.ok, true);
    assert.deepEqual(spawned[0].slice(2), wiped ? [...HEADLESS_ARGS, ...SHARED_BOOT_ARGS] : [...HEADLESS_ARGS]);
  }
});

test("doctor --device-pin acts on ONE project: status writes nothing, shared/per-app record it, repin re-detects the machine set, only plain doctor asks", async () => {
  const dir = tmp();
  const env = { CMP_DEVICE_PIN: path.join(dir, "devices.json") };
  const android = { avds: [{ name: "Shared_35", systemImage: "img35", apiLevel: 35, bytes: 10e9 }, { name: "Old", systemImage: "img33", apiLevel: 33, bytes: 3e9 }], images: [] };
  const ios = { available: false, runtimes: [], devices: [], cachedDownloads: [] };
  const inputs = (key) => {
    const f = readPinFile({ env });
    return { android, ios, key, project: readPin({ env, key }), devices: f.file.devices, projects: f.file.projects, proposal: proposePin({ android, ios }), freeBytes: 2e9 };
  };
  let printed = "";
  const write = (s) => (printed += s);

  assert.equal(await runDevicePin("status", { env, inputs: inputs("/apps/a"), write, projectDir: "/apps/a" }), 0);
  for (const want of ["project: /apps/a", "not asked yet", "Disk check", "low;", "Pros", "Cons", "-wipe-data", "Shared_35", "avdmanager delete avd -n Old", "--device-pin shared"]) assert.ok(printed.includes(want), want);
  assert.equal(readPin({ env, key: "/apps/a" }).state, "none", "status writes nothing");

  printed = "";
  assert.equal(await runDevicePin("ask", { env, inputs: inputs("/apps/a"), write, isTTY: false, projectDir: "/apps/a" }), 0);
  assert.match(printed, /No terminal to ask in/);
  assert.equal(readPin({ env, key: "/apps/a" }).state, "none");

  assert.equal(await runDevicePin("ask", { env, inputs: inputs("/apps/a"), write, isTTY: true, prompt: async () => true, projectDir: "/apps/a" }), 0);
  assert.equal(readPin({ env, key: "/apps/a" }).pin.android.avd, "Shared_35");
  assert.equal(readPin({ env, key: "/apps/b" }).state, "none", "the next project is asked on its own");
  assert.equal(await runDevicePin("ask", { env, inputs: inputs("/apps/b"), write, isTTY: true, prompt: async () => false, projectDir: "/apps/b" }), 0);
  assert.equal(readPin({ env, key: "/apps/b" }).state, "per-app");
  assert.equal(readPin({ env, key: "/apps/a" }).state, "shared", "one project's answer never changes another's");

  printed = "";
  const later = { ...inputs("/apps/b"), proposal: { decidedAt: "x", android: { avd: "Newer_36", systemImage: "img36" }, ios: null } };
  assert.equal(await runDevicePin("repin", { env, inputs: later, write, projectDir: "/apps/b" }), 0);
  assert.equal(readPin({ env, key: "/apps/a" }).pin.android.avd, "Newer_36");
  assert.match(printed, /used by 1 shared project/);
  assert.equal(await runDevicePin("shared", { env, inputs: inputs("/apps/b"), write, projectDir: "/apps/b" }), 0);
  assert.equal(readPin({ env, key: "/apps/b" }).pin.android.avd, "Newer_36", "a project joining reuses the machine's set");
  assert.equal(await runDevicePin("bogus", { env, inputs: inputs("/apps/b"), write }), 2);

  const nothing = { android: { avds: [], images: [] }, ios, key: "/apps/c", project: { state: "none", path: null }, devices: null, projects: {}, proposal: proposePin({ android: { avds: [] }, ios }), freeBytes: null };
  assert.equal(await runDevicePin("shared", { env: { CMP_DEVICE_PIN: path.join(dir, "x.json") }, inputs: nothing, write, projectDir: "/apps/c" }), 1, "nothing installed is nothing to share — never a download");
  assert.ok(renderOffer(nothing).some((l) => l.includes("nothing installed to share")));
});
