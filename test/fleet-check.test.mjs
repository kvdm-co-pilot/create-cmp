import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  LEVELS,
  compareLevels,
  normalizeLevel,
  levelFromStrength,
  levelFromReceipt,
  writeFleetRecord,
} from "../scripts/fleet-check.mjs";
import { FIREBASE_FLEET_RECORD, STAMPED_OUTPUT_RULE } from "../scripts/stamped-output.mjs";
import { coverageFor, defaultCoverage } from "../scripts/lib/fleet-firebase.mjs";
import { firebaseRecordMeets } from "../scripts/proof-plan.mjs";
import { readHistory, historyPath } from "../scripts/lib/proof-history.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "fleet-check.mjs");

// Cheap pins ONLY — the real stamp+lane run is the orchestrator's/release
// manager's gate (minutes of Gradle), never the test tier's.

test("fleet-check.mjs parses (node --check)", () => {
  const res = spawnSync(process.execPath, ["--check", SCRIPT], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
});

test("--help exits 0 and documents --min-level (incl. the attached-device default)", () => {
  const res = spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /--min-level/);
  assert.match(res.stdout, /L1\s*\|\s*L2\s*\|\s*L3/);
  assert.match(res.stdout, /Default L2/, "help states the L2 default");
  assert.match(res.stdout, /boots a\s+headless emulator itself/, "and explains that the lane provisions the device");
  assert.match(res.stdout, /CMP_DEVICE=none/, "and names the one opt-out, which fails this check");
});

test("unknown flag / bad min-level are usage errors (exit 2)", () => {
  const bad = spawnSync(process.execPath, [SCRIPT, "--bogus"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  const badLevel = spawnSync(process.execPath, [SCRIPT, "--min-level", "L9"], { encoding: "utf8" });
  assert.equal(badLevel.status, 2);
});

// --- rung comparator ---------------------------------------------------------

test("comparator orders L1 < L2 < L3 (and L0 below all)", () => {
  assert.deepEqual(LEVELS, ["L0", "L1", "L2", "L3"]);
  assert.ok(compareLevels("L1", "L2") < 0);
  assert.ok(compareLevels("L2", "L3") < 0);
  assert.ok(compareLevels("L1", "L3") < 0);
  assert.ok(compareLevels("L0", "L1") < 0);
  assert.equal(compareLevels("L2", "L2"), 0);
  assert.ok(compareLevels("L3", "L1") > 0);
  // case-insensitive input
  assert.equal(compareLevels("l2", "L2"), 0);
  assert.throws(() => compareLevels("L4", "L1"), /unknown evidence level/);
});

test("normalizeLevel extracts a rung or returns null", () => {
  assert.equal(normalizeLevel("L2"), "L2");
  assert.equal(normalizeLevel("l3"), "L3");
  assert.equal(normalizeLevel("L2 (on-device)"), "L2");
  assert.equal(normalizeLevel(undefined), null);
  assert.equal(normalizeLevel("desktop"), null);
});

// --- strength fallback (receipts predating the evidenceLevel field) ---------

test("fallback parses a strength STRING like the lane's verdict line", () => {
  assert.equal(levelFromStrength("on-device: e2eSmoke"), "L2");
  assert.equal(levelFromStrength("on-device: e2eSmoke+tokenDrift+androidChecks"), "L2");
  assert.equal(levelFromStrength("on-device: e2eSmoke+releaseSmoke"), "L3");
  assert.equal(levelFromStrength("desktop-only"), "L1");
});

test("fallback also accepts the receipt's strength OBJECT ({ onDeviceSteps })", () => {
  assert.equal(levelFromStrength({ onDeviceSteps: [] }), "L1");
  assert.equal(levelFromStrength({ onDeviceSteps: ["e2eSmoke"] }), "L2");
  assert.equal(levelFromStrength({ onDeviceSteps: ["e2eSmoke", "releaseSmoke"] }), "L3");
});

// The receipt shape verify.mjs ACTUALLY writes: evidenceLevel is the object
// qa/lib/evidence-level.mjs returns, never a bare string. The original test
// asserted only the string form, so the reader could be wrong about every real
// receipt and stay green — which it was, until the 0.12.0 fleet check printed
// "receipt names no evidenceLevel" against a receipt that named one.
test("normalizeLevel reads the receipt's real object form", () => {
  assert.equal(normalizeLevel({ rung: "L2", name: "device", satisfiedBy: ["e2eSmoke"] }), "L2");
  assert.equal(normalizeLevel({ rung: "L1", name: "desktop", satisfiedBy: [] }), "L1");
  assert.equal(normalizeLevel({ rung: 2 }), null, "a malformed rung is not a rung");
  assert.equal(normalizeLevel({}), null);
  assert.equal(normalizeLevel(null), null);
});

test("a receipt that asserts no rung is not silently promoted by the strength fallback", () => {
  // A --fast run: evidenceLevel null, and an empty onDeviceSteps list that is
  // indistinguishable from a clean desktop lane. Trusting strength here would
  // hand the inner loop L1.
  assert.equal(levelFromReceipt({ mode: "fast", evidenceLevel: null, strength: { onDeviceSteps: [] } }), null);
  // A FAILed lane records the same null.
  assert.equal(levelFromReceipt({ verdict: "FAIL", evidenceLevel: null, strength: { onDeviceSteps: ["e2eSmoke"] } }), null);
  // Only a receipt with NO such key is legacy, and only it falls back.
  assert.equal(levelFromReceipt({ strength: { onDeviceSteps: ["e2eSmoke"] } }), "L2");
});

test("levelFromReceipt prefers the named evidenceLevel, falls back to strength", () => {
  // A receipt that names its rung wins outright.
  assert.equal(levelFromReceipt({ evidenceLevel: "L3", strength: { onDeviceSteps: [] } }), "L3");
  // A receipt without the field (older lane) derives from strength.
  assert.equal(levelFromReceipt({ strength: { onDeviceSteps: ["e2eSmoke"] } }), "L2");
  assert.equal(levelFromReceipt({ strength: { onDeviceSteps: [] } }), "L1");
});

// ── --with-firebase: the Firebase L2 run (KD-45) ────────────────────────────

test("--help documents --with-firebase: the add, the Emulator Suite, and that CMP_AVD is required", () => {
  const res = spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /--with-firebase/);
  assert.match(res.stdout, /add firebase/, "help names the add the run makes on the scratch app");
  assert.match(res.stdout, /Emulator Suite/);
  assert.match(res.stdout, /CMP_AVD/);
  assert.match(res.stdout, /fleet-firebase-latest\.json/, "help names the record this run writes, which is not fleet-latest.json");
});

test("--with-firebase on a host with no Firebase CLI and no CMP_AVD exits 1 BEFORE the stamp, names both, and writes no record", () => {
  // PATH is an empty directory, so `firebase` (and a PATH `java`) cannot be
  // found whatever this host has installed, and CMP_AVD is absent. The refusal
  // must come before anything is stamped: nothing here may start a lane.
  const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-no-firebase-"));
  const recordFile = path.join(REPO_ROOT, FIREBASE_FLEET_RECORD);
  const read = () => (fs.existsSync(recordFile) ? fs.readFileSync(recordFile, "utf8") : null);
  const before = read();
  try {
    const env = { PATH: emptyBin, HOME: process.env.HOME ?? emptyBin };
    const res = spawnSync(process.execPath, [SCRIPT, "--with-firebase"], { encoding: "utf8", env, timeout: 60_000 });
    assert.equal(res.status, 1, `expected a loud refusal (exit 1), got ${res.status}\n${res.stderr}`);
    assert.match(res.stderr, /`firebase` did not run/, "the refusal names the missing Firebase CLI");
    assert.match(res.stderr, /CMP_AVD is not set/, "the refusal names the unset CMP_AVD (D4)");
    assert.match(res.stderr, /Refused/);
    assert.doesNotMatch(res.stdout, /stamping scratch app/, "the stamp ran before the refusal — a refused run must stamp nothing");
    assert.equal(read(), before, `a refused run wrote ${FIREBASE_FLEET_RECORD}`);
  } finally {
    fs.rmSync(emptyBin, { recursive: true, force: true });
  }
});

const PLAN = {
  project: "demo-cmp-fleet",
  host: "127.0.0.1",
  appHost: "10.0.2.2",
  declaredIn: "composeApp/build.gradle.kts (debug)",
  served: [{ service: "auth", port: 9099 }, { service: "firestore", port: 8080 }, { service: "storage", port: 9199 }],
  unserved: [{ service: "functions", port: 5001, reason: "no codebase" }],
};
const STAMPED = { hash: "a".repeat(64), files: { "composeApp/build.gradle.kts": "b".repeat(64) } };
const PASS_RUN = { rung: "L2", pack: "cmp", minLevel: "L2", failures: [], avd: "Medium_Phone_API_35", receipt: { verdict: "PASS", steps: [{ name: "e2eSmoke", verdict: "PASS", durationMs: 1 }] }, stamped: STAMPED };
const listDir = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);

test("under the flag the record goes to the Firebase file and history kind ONLY, says no traffic crossed, and meets the Firebase tier", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-firebase-record-"));
  try {
    const coverage = coverageFor({ plan: PLAN, e2eSmoke: { name: "e2eSmoke", verdict: "PASS" } });
    writeFleetRecord({ ...PASS_RUN, root, file: FIREBASE_FLEET_RECORD, coverage });
    assert.deepEqual(
      listDir(path.join(root, "qa-artifacts")),
      ["fleet-firebase-history.jsonl", "fleet-firebase-latest.json"],
      "a Firebase run must not overwrite fleet-latest.json (the publish gate's record) nor land in the default run's history",
    );
    const record = JSON.parse(fs.readFileSync(path.join(root, FIREBASE_FLEET_RECORD), "utf8"));
    assert.equal(record.coverage.firebase, true);
    assert.equal(record.coverage.trafficThroughRedirect, false, "a PASS must not be readable as traffic through the redirect (KD-210)");
    assert.equal(record.stampedOutputHash, STAMPED.hash);
    assert.equal(record.stampedOutputRule, STAMPED_OUTPUT_RULE);
    const met = firebaseRecordMeets(record, STAMPED.hash);
    assert.equal(met.ok, true, `the record this run writes must meet the tier it exists for: ${met.reason}`);
    const kept = readHistory(historyPath(root, "fleet-firebase")).rows;
    assert.equal(kept.length, 1);
    assert.equal(kept[0].coverage.firebase, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("without the flag the record says it never executed Firebase, and could not discharge the Firebase tier", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-default-record-"));
  try {
    writeFleetRecord({ ...PASS_RUN, root });
    assert.deepEqual(listDir(path.join(root, "qa-artifacts")), ["fleet-history.jsonl", "fleet-latest.json"]);
    const record = JSON.parse(fs.readFileSync(path.join(root, "qa-artifacts", "fleet-latest.json"), "utf8"));
    assert.deepEqual(record.coverage, defaultCoverage());
    assert.equal(firebaseRecordMeets(record, STAMPED.hash).code, "no-coverage", "a default run is never read as a Firebase proof");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
