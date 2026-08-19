#!/usr/bin/env node
// scripts/fleet-check.mjs — the engine's pre-release gate: stamp a real app, run its lane.
//
// 0.11.0's headline bug was "the release build had never once been run" — the
// engine shipped a lane it had never executed against its own output. This
// script is the anti-overclaim gate for the harness itself: it stamps a scratch
// app from the CURRENT tree into a temp dir, runs the app's own verify lane
// (qa/verify.mjs) inside it, and asserts the evidence receipt — verdict PASS
// and an evidence rung at or above --min-level. A notary caught overclaiming
// is dead; the notary therefore notarizes itself before it ships.
//
// Usage:
//   node scripts/fleet-check.mjs [--profile <scaffold|local|ci|release>]
//                                [--min-level <L1|L2|L3>] [--keep]
//
//   --profile <p>     lane profile passed through to the scratch app's
//                     qa/verify.mjs (default: local; release is the ship-time
//                     profile and is allowed here — expect minutes of Gradle).
//   --min-level <L>   minimum evidence rung the receipt must reach: L1 (desktop
//                     lane green) | L2 (on-device steps ran) | L3 (release
//                     profile proven on-device). Default: L1 — EXCEPT when
//                     `adb devices` shows an attached device/emulator, in which
//                     case the default rises to L2 automatically: if a device is
//                     there, desktop-only green is under-claiming, and a lane
//                     that silently skipped its device tier must not pass the
//                     fleet check. Pass --min-level L1 explicitly to override.
//   --keep            retain the scratch app dir even on success.
//
// On FAILURE the scratch dir is always kept and its path printed (it is the
// crime scene). On success it is deleted unless --keep.
//
// The rung is read from the receipt's `evidenceLevel` field when present;
// older receipts without it fall back to parsing the strength surface
// ("desktop-only" / "on-device: e2eSmoke+..."). No dependencies beyond the
// Node 18+ stdlib.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const PROFILES = new Set(["scaffold", "local", "ci", "release"]);
const APP_NAME = "FleetCheck";
const APP_PACKAGE = "com.fleet.check";

// ── Evidence rungs (§10 item 2's ladder: L0 scaffold / L1 desktop / L2 device / L3 release)
export const LEVELS = ["L0", "L1", "L2", "L3"];

/** Numeric ordering for rungs: negative when a < b, 0 when equal, positive when a > b. */
export function compareLevels(a, b) {
  const ia = LEVELS.indexOf(normalizeLevel(a));
  const ib = LEVELS.indexOf(normalizeLevel(b));
  if (ia === -1 || ib === -1) throw new Error(`unknown evidence level: ${ia === -1 ? a : b}`);
  return ia - ib;
}

/** "l2", "L2 (device)" → "L2"; unknown → null. */
export function normalizeLevel(v) {
  const m = String(v ?? "").match(/L[0-3]/i);
  return m ? m[0].toUpperCase() : null;
}

/**
 * Fallback rung derivation for receipts predating the `evidenceLevel` field.
 * Accepts either the receipt's strength object ({ onDeviceSteps: [...] }) or
 * the printed strength string ("desktop-only" / "on-device: e2eSmoke+...").
 * A lane that RAN and passed is at least L1 (desktop); on-device steps lift it
 * to L2; a proven releaseSmoke is the L3 claim.
 */
export function levelFromStrength(strength) {
  let onDeviceSteps = [];
  if (strength && typeof strength === "object" && Array.isArray(strength.onDeviceSteps)) {
    onDeviceSteps = strength.onDeviceSteps;
  } else if (typeof strength === "string") {
    const m = strength.match(/on-device:\s*(.+)/);
    if (m) onDeviceSteps = m[1].split("+").map((s) => s.trim()).filter(Boolean);
  }
  if (onDeviceSteps.includes("releaseSmoke")) return "L3";
  if (onDeviceSteps.length > 0) return "L2";
  return "L1";
}

/** The receipt's own rung when it names one; the strength fallback otherwise. */
export function levelFromReceipt(receipt) {
  const named = normalizeLevel(receipt.evidenceLevel);
  if (named) return named;
  return levelFromStrength(receipt.strength ?? receipt.strengthLabel ?? null);
}

// ── Environment probes ──────────────────────────────────────────────────────

function javaAvailable() {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const bin = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
    if (fs.existsSync(bin)) return true;
  }
  const probe = spawnSync("java", ["-version"], { stdio: "ignore" });
  return probe.status === 0;
}

function deviceAttached() {
  const probe = spawnSync("adb", ["devices"], { encoding: "utf8" });
  if (probe.status !== 0 || !probe.stdout) return false;
  return probe.stdout
    .split("\n")
    .slice(1) // drop the "List of devices attached" header
    .some((line) => /^\S+\tdevice$/.test(line.trim().replace(/\s+/, "\t")));
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const USAGE = `node scripts/fleet-check.mjs [--profile <p>] [--min-level <L>] [--keep]

Stamps a scratch app (${APP_NAME}, ${APP_PACKAGE}, --no-ios --no-firebase) from
the CURRENT tree into a temp dir, runs the app's own verify lane inside it, and
asserts the evidence receipt: verdict PASS at rung >= --min-level. This is the
engine's pre-release proof that its output actually runs — see the release
skill (.claude/skills/npm-publish/SKILL.md).

  --profile <scaffold|local|ci|release>   lane profile for the scratch app's
                                          qa/verify.mjs (default: local)
  --min-level <L1|L2|L3>   minimum evidence rung: L1 desktop / L2 on-device /
                           L3 release-proven. Default L1 — but when \`adb
                           devices\` shows an attached device the default rises
                           to L2 automatically (a lane that silently skipped
                           its device tier must not pass while a device sits
                           there). Pass --min-level L1 to override.
  --keep                   retain the scratch app dir even on success (on
                           failure it is always kept and its path printed)
  --help                   this text

Exit 0 = fleet check PASS; exit 1 = FAIL; exit 2 = usage error.
`;

function parseArgs(argv) {
  const args = { profile: "local", minLevel: null, keep: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--keep") args.keep = true;
    else if (a === "--profile") args.profile = argv[++i];
    else if (a === "--min-level") args.minLevel = argv[++i];
    else throw new Error(`unknown flag: ${a}`);
  }
  return args;
}

function fmtDuration(ms) {
  if (typeof ms !== "number") return "-";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function run(cmd, argv, opts) {
  const res = spawnSync(cmd, argv, { stdio: "inherit", ...opts });
  if (res.error) throw new Error(`${cmd} failed to start: ${res.error.message}`);
  return res.status ?? 1;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (!PROFILES.has(args.profile)) {
    process.stderr.write(`Unknown profile "${args.profile}" — use scaffold | local | ci | release.\n`);
    process.exit(2);
  }
  let minLevel = normalizeLevel(args.minLevel);
  if (args.minLevel && !minLevel) {
    process.stderr.write(`Unknown --min-level "${args.minLevel}" — use L1 | L2 | L3.\n`);
    process.exit(2);
  }

  // Preflights — fail loud and early, before minutes of Gradle.
  if (!javaAvailable()) {
    process.stderr.write(
      "fleet check: no Java found — the scratch app's verify lane runs Gradle.\n" +
      "Set JAVA_HOME (inherited from your shell; never hardcoded here) or put java on PATH.\n"
    );
    process.exit(1);
  }

  const attached = deviceAttached();
  if (!minLevel) minLevel = attached ? "L2" : "L1";

  process.stdout.write(
    `fleet check: profile=${args.profile} min-level=${minLevel}` +
    `${args.minLevel ? "" : attached ? " (auto: device attached)" : " (default)"}\n`
  );

  // 1. Stamp the scratch app from the CURRENT tree (no --verify: the lane run
  //    below is the proof, under our own control and assertions).
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-fleet-check-"));
  const appDir = path.join(scratchRoot, APP_NAME);
  process.stdout.write(`\n── stamping scratch app → ${appDir}\n`);
  const stampStatus = run(
    process.execPath,
    [
      path.join(REPO_ROOT, "bin", "create-cmp.mjs"),
      appDir,
      "--yes",
      "--name", APP_NAME,
      "--package", APP_PACKAGE,
      "--no-ios",
      "--no-firebase",
      "--no-verify",
    ],
    { cwd: REPO_ROOT }
  );
  if (stampStatus !== 0 || !fs.existsSync(path.join(appDir, "qa", "verify.mjs"))) {
    process.stderr.write(
      `\nfleet check: FAIL — the stamp itself did not produce a runnable app.\n` +
      `Scratch dir kept for inspection: ${scratchRoot}\n`
    );
    process.exit(1);
  }

  // 2. Run the app's OWN lane inside the scratch app. Env is inherited whole —
  //    JAVA_HOME/ANDROID_HOME come from the caller, never from this script.
  process.stdout.write(`\n── running verify lane (--profile ${args.profile}) in the scratch app\n`);
  run(process.execPath, [path.join(appDir, "qa", "verify.mjs"), "--profile", args.profile], {
    cwd: appDir,
    env: { ...process.env },
  });
  // Lane exit status is advisory here — the receipt is the artifact we assert.

  // 3. Assert the receipt.
  const receiptPath = path.join(appDir, "qa", "evidence", "latest.json");
  if (!fs.existsSync(receiptPath)) {
    process.stderr.write(
      `\nfleet check: FAIL — the lane left no receipt at qa/evidence/latest.json.\n` +
      `Scratch dir kept for inspection: ${scratchRoot}\n`
    );
    process.exit(1);
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const rung = levelFromReceipt(receipt);
  const failures = [];
  if (receipt.verdict !== "PASS") failures.push(`lane verdict is ${receipt.verdict}, not PASS`);
  if (compareLevels(rung, minLevel) < 0) {
    failures.push(`evidence rung ${rung} is below the required minimum ${minLevel}`);
  }

  // 4. Report: compact step table + rung + summary.
  process.stdout.write("\n  step                       verdict  duration\n");
  for (const s of receipt.steps ?? []) {
    const reason = s.verdict !== "PASS" && s.reason ? `  (${String(s.reason).split("\n")[0]})` : "";
    process.stdout.write(`  ${s.name.padEnd(26)} ${String(s.verdict).padEnd(8)} ${fmtDuration(s.durationMs)}${reason}\n`);
  }
  const named = normalizeLevel(receipt.evidenceLevel);
  process.stdout.write(
    `\n  rung: ${rung}${named ? "" : " (derived from strength — receipt names no evidenceLevel)"}` +
    ` | required: >=${minLevel} | verdict: ${receipt.verdict}\n`
  );

  if (failures.length) {
    process.stderr.write(`\nfleet check: FAIL\n`);
    for (const f of failures) process.stderr.write(`  - ${f}\n`);
    process.stderr.write(`Scratch dir kept for inspection: ${scratchRoot}\n`);
    process.exit(1);
  }

  if (args.keep) {
    process.stdout.write(`\nfleet check: PASS — scratch dir kept (--keep): ${scratchRoot}\n`);
  } else {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
    process.stdout.write(`\nfleet check: PASS — scratch app verified and deleted.\n`);
  }
  process.exit(0);
}

// Main guard: the module is import-safe for tests (comparator exports above).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`fleet check failed: ${err.stack || err}\n`);
    process.exit(1);
  });
}
