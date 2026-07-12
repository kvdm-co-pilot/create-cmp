// Per-dependency detection + install-command definitions for the toolchain.
//
// Each check is: { id, label, platforms, detect() -> {present, detail},
//   installCommand(ctx) -> string|null, manual?: string }.
// Detection uses real probes (which/--version/xcode-select/sdkmanager/appium…).
// installCommand returns the EXACT command to run; if null, the dep can't be
// auto-installed (e.g. Xcode → App Store) and `manual` explains the step.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { probe, which } from "./exec.mjs";

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";

function brewPrefixCommand(pkg) {
  if (isMac) return `brew install ${pkg}`;
  if (isLinux) return null;
  return null;
}

function androidHome() {
  return (
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), "Library", "Android", "sdk")
  );
}

function sdkmanagerPath() {
  const home = androidHome();
  const candidates = [
    path.join(home, "cmdline-tools", "latest", "bin", "sdkmanager"),
    path.join(home, "cmdline-tools", "bin", "sdkmanager"),
    path.join(home, "tools", "bin", "sdkmanager"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return which("sdkmanager");
}

function avdmanagerPath() {
  const home = androidHome();
  const candidates = [
    path.join(home, "cmdline-tools", "latest", "bin", "avdmanager"),
    path.join(home, "cmdline-tools", "bin", "avdmanager"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return which("avdmanager");
}

function emulatorPath() {
  const home = androidHome();
  const c = path.join(home, "emulator", "emulator");
  if (fs.existsSync(c)) return c;
  return which("emulator");
}

export const checks = [
  {
    id: "node",
    label: "Node.js (≥18)",
    platforms: ["darwin", "linux", "win32"],
    detect() {
      const r = probe("node", ["--version"]);
      if (!r.ok) return { present: false, detail: "not found" };
      const major = parseInt(r.stdout.replace(/^v/, "").split(".")[0], 10);
      return { present: major >= 18, detail: r.stdout + (major >= 18 ? "" : " (need ≥18)") };
    },
    installCommand: () => (isMac ? "brew install node" : "see https://nodejs.org / use nvm"),
  },
  {
    id: "jdk",
    // Label states the actual requirement (17+), and detect() reports the
    // resolved major — previously the row read "JDK 17 (Temurin)" while
    // happily accepting JDK 21, a label/evidence contradiction that erodes
    // trust in every other row (field-report finding 2.6).
    label: "JDK (17+ required)",
    platforms: ["darwin", "linux"],
    detect() {
      const r = probe("javac", ["-version"]);
      const r2 = r.ok ? r : probe("java", ["-version"]);
      const out = (r2.stdout || r2.stderr || "").trim();
      const m = out.match(/(\d+)(\.\d+)?/);
      const major = m ? parseInt(m[1], 10) : 0;
      if (!out) return { present: false, detail: "not found" };
      return {
        present: major >= 17,
        detail: `resolved major ${major} — ${out.split("\n")[0]}`,
      };
    },
    installCommand: () =>
      isMac ? "brew install --cask temurin@17" : "sdk install java 17.0.13-tem  # (sdkman)",
  },
  {
    id: "android-cmdline-tools",
    label: "Android cmdline-tools (sdkmanager)",
    platforms: ["darwin", "linux"],
    detect() {
      const sm = sdkmanagerPath();
      return sm
        ? { present: true, detail: sm }
        : { present: false, detail: `not found under ${androidHome()}` };
    },
    installCommand: () =>
      isMac
        ? "brew install --cask android-commandlinetools"
        : "download cmdline-tools from developer.android.com and unzip into $ANDROID_HOME/cmdline-tools/latest",
  },
  {
    id: "android-platform",
    label: "Android SDK platform + build-tools + platform-tools",
    platforms: ["darwin", "linux"],
    detect() {
      const sm = sdkmanagerPath();
      if (!sm) return { present: false, detail: "sdkmanager missing" };
      const r = probe(sm, ["--list_installed"]);
      const listing = r.ok ? r.stdout : probe(sm, ["--list"]).stdout;
      const hasPlatform = /platforms;android-\d+/.test(listing);
      const hasBuildTools = /build-tools;/.test(listing);
      const hasPlatformTools = /platform-tools/.test(listing) || !!which("adb");
      const present = hasPlatform && hasBuildTools && hasPlatformTools;
      return {
        present,
        detail: present ? "platform+build-tools+platform-tools present" : "missing SDK components",
      };
    },
    installCommand: () => {
      const sm = sdkmanagerPath() || "sdkmanager";
      return `"${sm}" "platform-tools" "platforms;android-35" "build-tools;35.0.0"`;
    },
  },
  {
    id: "android-system-image",
    label: "Android system image",
    platforms: ["darwin", "linux"],
    detect() {
      const sm = sdkmanagerPath();
      if (!sm) return { present: false, detail: "sdkmanager missing" };
      const r = probe(sm, ["--list_installed"]);
      const listing = r.ok ? r.stdout : "";
      const present = /system-images;android-\d+;/.test(listing);
      return { present, detail: present ? "system image present" : "no system image installed" };
    },
    installCommand: () => {
      const sm = sdkmanagerPath() || "sdkmanager";
      const arch = process.arch === "arm64" ? "arm64-v8a" : "x86_64";
      return `"${sm}" "system-images;android-35;google_apis;${arch}"`;
    },
  },
  {
    id: "android-avd",
    label: "Bootable AVD",
    platforms: ["darwin", "linux"],
    detect() {
      const em = emulatorPath();
      if (em) {
        const r = probe(em, ["-list-avds"]);
        if (r.ok && r.stdout.trim().length > 0) {
          return { present: true, detail: r.stdout.split("\n").join(", ") };
        }
      }
      // Fallback: look for ~/.android/avd/*.avd
      const avdDir = path.join(os.homedir(), ".android", "avd");
      if (fs.existsSync(avdDir)) {
        const avds = fs.readdirSync(avdDir).filter((f) => f.endsWith(".avd"));
        if (avds.length) return { present: true, detail: avds.join(", ") };
      }
      return { present: false, detail: "no AVD found" };
    },
    installCommand: () => {
      const am = avdmanagerPath() || "avdmanager";
      const arch = process.arch === "arm64" ? "arm64-v8a" : "x86_64";
      return `echo no | "${am}" create avd -n cmp_pixel -k "system-images;android-35;google_apis;${arch}" --device pixel_6`;
    },
  },
  {
    id: "adb",
    label: "adb (platform-tools)",
    platforms: ["darwin", "linux", "win32"],
    detect() {
      const adb = which("adb") || (() => {
        const c = path.join(androidHome(), "platform-tools", "adb");
        return fs.existsSync(c) ? c : null;
      })();
      return adb ? { present: true, detail: adb } : { present: false, detail: "adb not on PATH" };
    },
    installCommand: () => {
      const sm = sdkmanagerPath() || "sdkmanager";
      return `"${sm}" "platform-tools"`;
    },
  },
  {
    id: "xcode",
    label: "Xcode + Command Line Tools",
    platforms: ["darwin"],
    detect() {
      const r = probe("xcode-select", ["-p"]);
      if (!r.ok || !r.stdout) return { present: false, detail: "xcode-select path not set" };
      const isFullXcode = /Xcode\.app/.test(r.stdout);
      return {
        present: isFullXcode,
        detail: r.stdout + (isFullXcode ? "" : " (only CLT — full Xcode needed for iOS build)"),
      };
    },
    // Xcode itself can't be CLI-installed.
    installCommand: () => null,
    manual:
      "Install Xcode from the App Store, then run `sudo xcode-select -s /Applications/Xcode.app` and `sudo xcodebuild -license accept`.",
  },
  {
    id: "cocoapods",
    label: "CocoaPods",
    platforms: ["darwin"],
    detect() {
      const r = probe("pod", ["--version"]);
      return r.ok
        ? { present: true, detail: `pod ${r.stdout}` }
        : { present: false, detail: "not found" };
    },
    installCommand: () => "brew install cocoapods",
  },
  {
    id: "xcodegen",
    label: "XcodeGen",
    platforms: ["darwin"],
    detect() {
      const r = probe("xcodegen", ["--version"]);
      return r.ok
        ? { present: true, detail: r.stdout.split("\n")[0] }
        : { present: false, detail: "not found" };
    },
    installCommand: () => "brew install xcodegen",
  },
  {
    id: "appium",
    label: "Appium 3.x",
    platforms: ["darwin", "linux"],
    detect() {
      const r = probe("appium", ["--version"]);
      if (!r.ok) return { present: false, detail: "not found" };
      const major = parseInt(r.stdout.split(".")[0], 10);
      return { present: major >= 3, detail: `appium ${r.stdout}${major >= 3 ? "" : " (need 3.x)"}` };
    },
    installCommand: () => "npm install -g appium@latest",
  },
  {
    id: "appium-uiautomator2",
    label: "Appium driver: uiautomator2 (Android)",
    platforms: ["darwin", "linux"],
    detect() {
      const r = probe("appium", ["driver", "list", "--installed"]);
      const out = (r.stdout || r.stderr || "").toLowerCase();
      const present = out.includes("uiautomator2");
      return { present, detail: present ? "installed" : "not installed" };
    },
    installCommand: () => "appium driver install uiautomator2",
  },
  {
    id: "appium-xcuitest",
    label: "Appium driver: xcuitest (iOS)",
    platforms: ["darwin"],
    detect() {
      const r = probe("appium", ["driver", "list", "--installed"]);
      const out = (r.stdout || r.stderr || "").toLowerCase();
      const present = out.includes("xcuitest");
      return { present, detail: present ? "installed" : "not installed" };
    },
    installCommand: () => "appium driver install xcuitest",
  },
];

/**
 * Filter checks to those relevant to the current OS, optionally Android-only.
 * @param {object} opts
 * @param {boolean} [opts.iosWanted] include iOS-only checks (macOS only)
 * @returns {Array}
 */
export function checksForHost({ iosWanted = true } = {}) {
  const plat = process.platform;
  return checks.filter((c) => {
    if (!c.platforms.includes(plat)) return false;
    // iOS-specific checks are skipped off macOS or when iOS not wanted.
    const iosOnly = c.platforms.length === 1 && c.platforms[0] === "darwin";
    if (iosOnly && (!isMac || !iosWanted)) return false;
    return true;
  });
}

export const hostInfo = { isMac, isLinux, androidHome };
