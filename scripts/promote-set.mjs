#!/usr/bin/env node
// scripts/promote-set.mjs — the PROMOTION half of the canary loop (IMP-2).
//
// scripts/canary.mjs is the detection half: it probes Maven for current-vs-latest
// and can rewrite a catalog to the latest stable pins (generating a candidate).
// This script is the certification half: it takes a CANDIDATE version set from
// src/versions/candidates.json, scaffolds a full-featured app pinned to it, builds
// it FOR REAL — Android `assembleDebug`, the device-free lane gates (`desktopTest`:
// unit + conformance + golden trees + a11y), and the iOS framework link
// (`linkDebugFrameworkIosSimulatorArm64`, the Kotlin/Native + Room-on-iOS path) —
// and ONLY on all-green appends the candidate into src/versions/registry.json as a
// new proven-green set (the new default `create-cmp upgrade` target). A red build
// leaves registry.json untouched and names the failing task + log path. Same
// discipline as the harness itself: a set is "green" only when a build proves it.
//
// Usage:
//   node scripts/promote-set.mjs <candidateId> [--android-only] [--keep] [--out <dir>]
//     --android-only  skip the iOS framework link gate (faster; NOT a full proof)
//     --keep          keep the scaffold dir after a green run (default: removed)
//     --out <dir>     scaffold into <dir> instead of a temp dir

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { scaffold } from "../src/scaffold.mjs";
import { planUpgrade } from "../src/lib/upgrade.mjs";
import { loadRegistry, getSet } from "../src/lib/registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CANDIDATES_PATH = path.join(ROOT, "src", "versions", "candidates.json");
const REGISTRY_PATH = path.join(ROOT, "src", "versions", "registry.json");

const argv = process.argv.slice(2);
const candidateId = argv.find((a) => !a.startsWith("--"));
const androidOnly = argv.includes("--android-only");
const keep = argv.includes("--keep");
const outFlagIdx = argv.indexOf("--out");
const outDirArg = outFlagIdx !== -1 ? argv[outFlagIdx + 1] : null;

const die = (m) => { process.stderr.write(`promote-set: ${m}\n`); process.exit(1); };
const log = (m) => process.stdout.write(`${m}\n`);

if (!candidateId) die("usage: node scripts/promote-set.mjs <candidateId> [--android-only] [--keep] [--out <dir>]");

// Validate a registry object through the real loader's rules (structure + lockstep).
function assertValidRegistry(doc) {
  const tmp = path.join(os.tmpdir(), `cmp-registry-check-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(doc));
  try { loadRegistry(tmp); } finally { fs.rmSync(tmp, { force: true }); }
}

// ── Load candidate + guard against a duplicate id in the registry ────────────
const candidatesDoc = JSON.parse(fs.readFileSync(CANDIDATES_PATH, "utf8"));
const candidate = (candidatesDoc.candidates || []).find((c) => c.id === candidateId);
if (!candidate) {
  die(`unknown candidate "${candidateId}". Available: ${(candidatesDoc.candidates || []).map((c) => c.id).join(", ") || "(none)"}`);
}
const registry = loadRegistry(REGISTRY_PATH);
if (getSet(registry, candidateId)) die(`"${candidateId}" is already a proven-green set in registry.json.`);

// ── Scaffold a full-featured app on the current default set ──────────────────
const outDir = outDirArg ? path.resolve(outDirArg) : fs.mkdtempSync(path.join(os.tmpdir(), `cmp-promote-${candidateId}-`));
log(`\n▶ promote ${candidateId} — "${candidate.label}"`);
log(`  scaffold → ${outDir}`);

await scaffold({
  appName: "Canary",
  package: "com.canary.app",
  iosBundleId: "com.canary.app",
  region: "us-central1",
  themePrefix: "Canary",
  platforms: { android: true, ios: !androidOnly },
  firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
  room: true,
  e2e: true,
  inspector: true,
  devClient: true,
  tabs: [{ label: "Home", icon: "home" }, { label: "Profile", icon: "person" }],
  targetDir: outDir,
}, { verify: false });

// ── Apply the candidate set (reuses the real `upgrade` rewrite engine) ───────
const tomlPath = path.join(outDir, "gradle", "libs.versions.toml");
const gpPath = path.join(outDir, "gradle.properties");
const wrapPath = path.join(outDir, "gradle", "wrapper", "gradle-wrapper.properties");
const readOrNull = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

const plan = planUpgrade({
  tomlContent: fs.readFileSync(tomlPath, "utf8"),
  gradlePropertiesContent: readOrNull(gpPath),
  wrapperPropertiesContent: readOrNull(wrapPath),
  set: candidate,
});
if (plan.lockstepError) die(`candidate breaks the kotlin↔ksp lockstep: ${plan.lockstepError}`);
if (!plan.diff.changes.length) die("candidate is identical to the scaffolded set — nothing to certify.");
if (plan.newTomlContent) fs.writeFileSync(tomlPath, plan.newTomlContent);
if (plan.newGradlePropertiesContent) fs.writeFileSync(gpPath, plan.newGradlePropertiesContent);
if (plan.newWrapperPropertiesContent) fs.writeFileSync(wrapPath, plan.newWrapperPropertiesContent);
log(`  applied ${plan.diff.changes.length} version change(s):`);
for (const c of plan.diff.changes) log(`    ${c.key}: ${c.from} → ${c.to}`);

// local.properties so Gradle finds the Android SDK.
const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), "Library/Android/sdk");
fs.writeFileSync(path.join(outDir, "local.properties"), `sdk.dir=${sdkDir}\n`);

// ── Build gates (fail-fast, one Gradle invocation) ───────────────────────────
const tasks = [":composeApp:assembleDebug", ":composeApp:desktopTest"];
if (!androidOnly) tasks.push(":composeApp:linkDebugFrameworkIosSimulatorArm64");
const logPath = path.join(outDir, "promote-build.log");
const logFd = fs.openSync(logPath, "w");
log(`\n▶ building (the certification — real Android${androidOnly ? "" : " + iOS"} build):`);
log(`  ./gradlew ${tasks.join(" ")}`);
log(`  log → ${logPath}`);

const started = Date.now();
const res = spawnSync(path.join(outDir, "gradlew"), [...tasks, "--stacktrace", "--no-daemon"], {
  cwd: outDir,
  stdio: ["ignore", logFd, logFd],
  env: { ...process.env, ANDROID_HOME: sdkDir },
});
fs.closeSync(logFd);
const durationSec = Math.round((Date.now() - started) / 1000);
const buildLog = fs.readFileSync(logPath, "utf8");
const green = res.status === 0 && /BUILD SUCCESSFUL/.test(buildLog);
const failedTask = (buildLog.match(/> Task (\S+) FAILED/) || [])[1] || null;

// Evidence record (auditable, whatever the outcome).
const evidenceDir = path.join(ROOT, "qa-artifacts", "canary");
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, `${candidateId}.json`), JSON.stringify({
  candidateId, baseline: candidate.baseline, changes: plan.diff.changes, tasks,
  result: green ? "green" : "red", failedTask, durationSec, logPath, scaffoldDir: outDir,
}, null, 2) + "\n");

if (!green) {
  log(`\n✖ RED — build failed after ${durationSec}s${failedTask ? ` at ${failedTask}` : ""}.`);
  log("  last 25 log lines:");
  log(buildLog.trimEnd().split("\n").slice(-25).map((l) => `    ${l}`).join("\n"));
  log(`\n  registry.json untouched. Full log: ${logPath}`);
  process.exit(1);
}

// ── Promote: append the full candidate set into the registry ─────────────────
log(`\n✔ GREEN — built in ${durationSec}s. Promoting ${candidateId} to proven-green.`);
const registryDoc = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
registryDoc.sets.push({
  id: candidate.id,
  label: candidate.label,
  status: "proven-green",
  versions: candidate.versions,
  ...(candidate.gradleProperties ? { gradleProperties: candidate.gradleProperties } : {}),
  ...(candidate.gradleWrapper ? { gradleWrapper: candidate.gradleWrapper } : {}),
  notes: [
    ...(candidate.notes || []),
    `Promoted by promote-set.mjs ${new Date().toISOString().slice(0, 10)}: green on ${tasks.join(", ")} (${durationSec}s). Evidence: qa-artifacts/canary/${candidateId}.json`,
  ],
});
assertValidRegistry(registryDoc); // fail loudly before writing a broken registry
fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registryDoc, null, 2) + "\n");

candidatesDoc.candidates = (candidatesDoc.candidates || []).filter((c) => c.id !== candidateId);
fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(candidatesDoc, null, 2) + "\n");

if (!keep) { fs.rmSync(outDir, { recursive: true, force: true }); log(`  cleaned scaffold (${outDir})`); }
log(`\n✔ ${candidateId} is now the newest proven-green set — the default \`create-cmp upgrade\` target.`);
log(`  next: create-cmp upgrade --set ${candidateId} --target-dir <a project> --verify`);
