import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  LEVELS,
  compareLevels,
  normalizeLevel,
  levelFromStrength,
  levelFromReceipt,
} from "../scripts/fleet-check.mjs";

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
  assert.match(res.stdout, /adb\s+devices/, "help must explain the auto L2 default on an attached device");
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

test("levelFromReceipt prefers the named evidenceLevel, falls back to strength", () => {
  // A receipt that names its rung wins outright.
  assert.equal(levelFromReceipt({ evidenceLevel: "L3", strength: { onDeviceSteps: [] } }), "L3");
  // A receipt without the field (older lane) derives from strength.
  assert.equal(levelFromReceipt({ strength: { onDeviceSteps: ["e2eSmoke"] } }), "L2");
  assert.equal(levelFromReceipt({ strength: { onDeviceSteps: [] } }), "L1");
});
