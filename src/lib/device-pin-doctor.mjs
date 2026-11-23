// `create-cmp doctor --device-pin <status|shared|per-app|repin> [--target-dir <app>]`
// — each create-cmp project chooses whether it uses the machine's ONE shared
// emulator, simulator and iOS runtime (docs/features/shared-device-pin.md).
//
// The choice is shown with its pros, its cons and a disk check (K3), and asked per
// PROJECT: plain `doctor` inside a project that was never asked asks at a terminal;
// an agent session has no terminal, so `status` prints the same offer for the agent
// to put to the human, and `shared` / `per-app` records the answer. `--yes` never
// answers it. Nothing here deletes or downloads anything: what the shared set would
// let you reclaim is listed with the exact command, for the human to run.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  readPin,
  readPinFile,
  writePinFile,
  emptyPinFile,
  projectKey,
  proposePin,
  reclaimable,
  discoverAndroid,
  discoverIos,
  duBytes,
  defaultSh,
} from "../../packages/harness/src/lib/profiles/cmp/device-pin.mjs";
import { colors } from "./log.mjs";

export const DEVICE_PIN_MODES = Object.freeze(["status", "shared", "per-app", "repin"]);
/** Below this, the offer leads with the disk warning. */
export const DISK_LOW_BYTES = 10 * 1024 ** 3;

export function formatBytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "size unknown";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function freeDiskBytes(dir = os.homedir()) {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** Everything the offer needs for one project, measured. Injectable for tests. */
export function gatherDevicePinInputs({ projectDir = process.cwd(), env = process.env, sh = defaultSh, sizes = true, free = freeDiskBytes } = {}) {
  const sizeOf = sizes ? (p) => duBytes(p, { sh }) : null;
  const android = discoverAndroid({ env, sizeOf });
  const ios = discoverIos({ sh, sizeOf });
  const key = projectKey(projectDir, { sh });
  const project = readPin({ env, key });
  const pinFile = readPinFile({ env });
  const devices = pinFile.state === "ok" ? pinFile.file.devices : null;
  const projects = pinFile.state === "ok" ? pinFile.file.projects : {};
  return { android, ios, key, project, devices, projects, proposal: proposePin({ android, ios }), freeBytes: free() };
}

/** The pros, the cons and the disk check, as lines. Pure. */
export function renderOffer({ android, ios, key, project, devices, projects = {}, proposal, freeBytes }) {
  const L = [];
  const target = devices || proposal;
  const reclaim = reclaimable({ android, ios }, target);
  const known = reclaim.reduce((sum, r) => sum + (typeof r.bytes === "number" ? r.bytes : 0), 0);
  const decided = project.state === "none" ? "not asked yet" : project.state === "invalid" ? `${colors.red("invalid pin")} — ${project.reason}` : project.state;

  L.push(colors.bold("Shared test devices — does this project use the machine's one emulator, simulator and iOS runtime?"));
  L.push(`  project: ${key}`);
  L.push(`  decided: ${decided}${project.path ? colors.dim(`  (${project.path})`) : ""}`);
  const others = Object.entries(projects).filter(([k]) => k !== key);
  if (others.length) {
    const shared = others.filter(([, v]) => v.mode === "shared").length;
    L.push(colors.dim(`  other projects on this machine: ${shared} shared, ${others.length - shared} per-app`));
  }
  L.push("");
  L.push(colors.bold("Disk check"));
  const low = typeof freeBytes === "number" && freeBytes < DISK_LOW_BYTES;
  L.push(`  free: ${low ? colors.red(formatBytes(freeBytes)) : formatBytes(freeBytes)}${low ? colors.red("  — low; device tests and Xcode builds need room") : ""}`);
  const rows = [];
  for (const a of android.avds) rows.push(["Android emulator", a.name, a.bytes, a.systemImage || "image unknown"]);
  for (const i of android.images) rows.push(["Android image", i.id, i.bytes, ""]);
  if (ios.available) {
    for (const r of ios.runtimes) rows.push(["iOS runtime", `iOS ${r.version} (${r.build})`, r.bytes, ""]);
    const registered = new Set(ios.runtimes.map((r) => r.build));
    for (const c of ios.cachedDownloads) {
      if (!registered.has(c.build)) rows.push(["cached download", `iOS ${c.version || "?"} (${c.build || "?"})`, c.bytes, colors.yellow("its runtime is gone — this copy re-installs it")]);
    }
  }
  const w = Math.max(0, ...rows.map((r) => r[1].length));
  for (const [kind, name, bytes, note] of rows) L.push(`  ${kind.padEnd(17)} ${name.padEnd(w)}  ${formatBytes(bytes).padStart(10)}  ${note ? colors.dim(note) : ""}`.trimEnd());
  if (!ios.available) {
    L.push(colors.dim("  iOS: no Xcode simulator tools on this machine — the iOS half of the shared set is skipped"));
  }
  L.push("");

  L.push(colors.bold(devices ? "The machine's shared set" : "The shared set would be (detected from what is installed — nothing is downloaded)"));
  L.push(`  Android: ${target.android ? `${target.android.avd}${target.android.systemImage ? colors.dim(`  (${target.android.systemImage})`) : ""}` : colors.dim("nothing installed to share")}`);
  L.push(`  iOS:     ${target.ios ? `${target.ios.simulator.name} on iOS ${target.ios.version} (${target.ios.build})` : colors.dim("nothing installed to share")}`);
  L.push("");

  if (project.state !== "shared") {
    L.push(colors.bold("Pros"));
    L.push(`  + This project uses the one emulator and iOS runtime already on disk, instead of its own${known ? ` — ${formatBytes(known)} reclaimable now (listed below)` : ""}.`);
    L.push("  + Its verify lane, its agent sessions and the inspector use that device: nothing picks one by list");
    L.push("    order or by name, and nothing installs another runtime to satisfy one.");
    L.push("  + A shared device that disappears is reported with the fix — never replaced by a download.");
    L.push(colors.bold("Cons"));
    L.push("  - The shared emulator boots wiped (-wipe-data) on every lane run: apps, logins and test data on it");
    L.push("    do not survive between runs, and a cold boot costs roughly 30–60 s more.");
    L.push("  - This project cannot run device tests while another sharing project does — the device lease makes it wait.");
    L.push("  - Sharing one emulator across apps has crossed state before (stale adb, false \"app crash\");");
    L.push("    the wipe and the lease are the mitigation. CMP_AVD still picks another emulator for one run.");
    L.push("  - After an Xcode or Android SDK update, re-detect the set on purpose: create-cmp doctor --device-pin repin.");
    L.push("");
  }

  if (reclaim.length) {
    L.push(colors.bold(`Reclaimable once every project shares${known ? ` — ${formatBytes(known)} known` : ""}`) + colors.dim("  (doctor deletes nothing; run what you want)"));
    for (const r of reclaim) {
      L.push(`  ${r.label}  ${colors.dim(formatBytes(r.bytes))}`);
      L.push(`    ${r.manual ? colors.yellow(r.command) : colors.cyan(r.command)}`);
    }
    if (reclaim.some((r) => r.kind === "ios-runtime")) L.push(`    ${colors.cyan("xcrun simctl delete unavailable")}${colors.dim("   (after removing a runtime: its simulators)")}`);
  } else if (target.android || target.ios) {
    L.push(colors.dim("Nothing to reclaim: no second emulator, image or runtime is installed."));
  }
  return L;
}

/**
 * Run one `--device-pin` mode for one project. Returns the exit code.
 * Only `ask` (plain doctor at a terminal) prompts; every flag acts without asking.
 */
export async function runDevicePin(mode, { projectDir = process.cwd(), prompt, isTTY = !!process.stdin.isTTY, env = process.env, inputs, write = (s) => process.stdout.write(s), now = () => new Date() } = {}) {
  const out = (lines) => write((Array.isArray(lines) ? lines.join("\n") : lines) + "\n");
  if (mode !== "ask" && !DEVICE_PIN_MODES.includes(mode)) {
    out(colors.red(`--device-pin takes one of ${DEVICE_PIN_MODES.join(", ")}; got ${JSON.stringify(mode)}`));
    return 2;
  }
  const inp = inputs || gatherDevicePinInputs({ projectDir, env });
  const canShare = !!(inp.devices || inp.proposal.android || inp.proposal.ios);

  const load = () => {
    const f = readPinFile({ env });
    if (f.state === "invalid") {
      out(colors.red(`The device pin at ${f.path} is invalid (${f.reason}) — fix or remove it, then re-run.`));
      return null;
    }
    return f.file || emptyPinFile();
  };
  const record = (projectMode, { redetect = false } = {}) => {
    const file = load();
    if (!file) return 1;
    if (projectMode === "shared" || redetect) {
      if (!file.devices || redetect) {
        if (!(inp.proposal.android || inp.proposal.ios)) {
          out(colors.red("Nothing is installed to share — install an Android system image + AVD (doctor) or an iOS runtime (Xcode → Settings → Components) first. Nothing is downloaded on your behalf."));
          return 1;
        }
        file.devices = { ...inp.proposal, decidedAt: now().toISOString() };
      }
    }
    if (projectMode) file.projects[inp.key] = { mode: projectMode, decidedAt: now().toISOString(), path: path.resolve(projectDir) };
    const written = writePinFile(file, { env });
    const d = file.devices;
    const set = d ? [d.android && `Android ${d.android.avd}`, d.ios && `iOS ${d.ios.simulator.name} (iOS ${d.ios.version})`].filter(Boolean).join(", ") : "none";
    if (projectMode === "shared") out(`${colors.green("✓ shared")} — ${inp.key} uses the machine's devices: ${set}`);
    else if (projectMode === "per-app") out(`${colors.green("✓ per-app")} — ${inp.key} keeps its own devices, as before. Change it with --device-pin shared.`);
    if (redetect) {
      const n = Object.values(file.projects).filter((p) => p.mode === "shared").length;
      out(`${colors.green("✓ re-detected")} the machine's shared set: ${set} — used by ${n} shared project${n === 1 ? "" : "s"}`);
    }
    out(`  ${colors.dim(written)}`);
    return 0;
  };

  if (mode === "shared") return record("shared");
  if (mode === "per-app") return record("per-app");
  if (mode === "repin") return record(null, { redetect: true });

  out(renderOffer(inp));
  if (mode === "status") {
    if (inp.project.state !== "shared" && inp.project.state !== "per-app") {
      out(`\n${colors.dim("Decide for this project with")} ${colors.bold("create-cmp doctor --device-pin shared")} ${colors.dim("or")} ${colors.bold("--device-pin per-app")}`);
    }
    return inp.project.state === "invalid" ? 1 : 0;
  }

  // ask — plain doctor, inside a project never asked.
  if (!canShare) {
    out(colors.dim("\nNothing is installed to share yet, so nothing is asked."));
    return 0;
  }
  if (!isTTY || !prompt) {
    out(`\n${colors.yellow("No terminal to ask in")} — decide with ${colors.bold("--device-pin shared")} or ${colors.bold("--device-pin per-app")}. Nothing was written.`);
    return 0;
  }
  const yes = await prompt("\nShould this project use the machine's shared devices?");
  return record(yes ? "shared" : "per-app");
}
