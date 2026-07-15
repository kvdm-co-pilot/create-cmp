import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadRegistry,
  validateRegistry,
  latestSet,
  getSet,
  nearestSet,
} from "../src/lib/registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, "..", "src", "versions", "registry.json");

// --- the shipped registry itself ------------------------------------------------

test("shipped registry loads and validates", () => {
  const reg = loadRegistry();
  assert.ok(Array.isArray(reg.sets) && reg.sets.length >= 1);
  assert.deepEqual(validateRegistry(reg), []);
});

test("shipped registry seeds the frozen 2026.06 set matching the golden template", () => {
  const reg = loadRegistry();
  const set = getSet(reg, "2026.06");
  assert.ok(set, "2026.06 set must exist");
  assert.equal(set.versions.kotlin, "2.2.20");
  assert.equal(set.versions.ksp, "2.2.20-2.0.4");
  assert.equal(set.versions["compose-multiplatform"], "1.10.3");
  assert.equal(set.versions.room, "2.8.4");
  assert.equal(set.versions.agp, "8.7.3");
  assert.equal(set.gradleProperties["ksp.useKSP2"], "true");
  assert.ok(set.gradleWrapper.distributionUrl.includes("gradle-8.11.1-bin.zip"));
  assert.ok(Array.isArray(set.notes) && set.notes.length > 0, "per-set notes required");
});

test("shipped registry's 2026.06 set mirrors the template's [versions] table exactly", () => {
  const tomlPath = path.join(__dirname, "..", "template", "gradle", "libs.versions.toml");
  const toml = fs.readFileSync(tomlPath, "utf8");
  const set = getSet(loadRegistry(), "2026.06");
  for (const [key, value] of Object.entries(set.versions)) {
    assert.ok(
      toml.includes(`${key} = "${value}"`),
      `template libs.versions.toml must pin ${key} = "${value}"`
    );
  }
});

test("registry carries the canary-promoted 2026.07c set (conservative delta vs 2026.06)", () => {
  const reg = loadRegistry();
  const base = getSet(reg, "2026.06");
  const next = getSet(reg, "2026.07c");
  assert.ok(next, "2026.07c must exist (promoted by scripts/promote-set.mjs on a green build)");
  assert.equal(next.status, "proven-green");
  // Exactly the conservative delta — the whole Kotlin/KSP/Compose/Room/AGP lockstep held.
  const diff = Object.keys(next.versions).filter((k) => next.versions[k] !== base.versions[k]).sort();
  assert.deepEqual(diff, ["coil", "kotlinx-serialization"], "only the conservative bumps differ");
  assert.equal(next.versions.coil, "3.2.0");
  assert.equal(next.versions["kotlinx-serialization"], "1.9.0");
  assert.equal(next.versions.kotlin, base.versions.kotlin, "Kotlin lockstep held");
  assert.equal(next.versions.ksp, base.versions.ksp, "KSP lockstep held");
  assert.equal(latestSet(reg).status, "proven-green", "newest set is a proven-green upgrade target");
});

test("candidates.json is valid and every candidate is well-formed", () => {
  const candPath = path.join(__dirname, "..", "src", "versions", "candidates.json");
  const doc = JSON.parse(fs.readFileSync(candPath, "utf8"));
  assert.ok(Array.isArray(doc.candidates), "candidates must be an array");
  for (const c of doc.candidates) {
    assert.ok(c.id && c.versions && c.baseline, "each candidate needs id + versions + baseline");
    // A candidate must itself be lockstep-valid — validated as a one-set registry.
    assert.deepEqual(validateRegistry({ sets: [{ id: c.id, versions: c.versions }] }), []);
  }
});

test("shipped registry file has no trailing surprises (valid strict JSON)", () => {
  const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
  assert.doesNotThrow(() => JSON.parse(raw));
});

// --- schema validation ------------------------------------------------------------

test("validateRegistry rejects structural problems", () => {
  assert.ok(validateRegistry(null).length > 0);
  assert.ok(validateRegistry({}).length > 0);
  assert.ok(validateRegistry({ sets: [] }).length > 0);
  assert.ok(validateRegistry({ sets: [{ versions: {} }] }).some((e) => e.includes("id")));
  assert.ok(
    validateRegistry({ sets: [{ id: "a" }] }).some((e) => e.includes("versions")),
    "missing versions object"
  );
  assert.ok(
    validateRegistry({ sets: [{ id: "a", versions: { kotlin: 1 } }] }).some((e) =>
      e.includes("non-empty string")
    )
  );
  assert.ok(
    validateRegistry({
      sets: [
        { id: "a", versions: { kotlin: "2.2.20" } },
        { id: "a", versions: { kotlin: "2.2.20" } },
      ],
    }).some((e) => e.includes("duplicate"))
  );
});

test("validateRegistry enforces kotlin↔ksp lockstep INSIDE every set", () => {
  const errors = validateRegistry({
    sets: [{ id: "broken", versions: { kotlin: "2.2.20", ksp: "2.1.0-1.0.29" } }],
  });
  assert.ok(errors.some((e) => e.includes("lockstep")));
  // Both valid schemes pass: KSP1 dash form, and the KSP2 aligned form (ksp === kotlin).
  assert.deepEqual(
    validateRegistry({ sets: [{ id: "ksp1", versions: { kotlin: "2.2.20", ksp: "2.2.20-2.0.4" } }] }),
    [],
  );
  assert.deepEqual(
    validateRegistry({ sets: [{ id: "ksp2", versions: { kotlin: "2.3.10", ksp: "2.3.10" } }] }),
    [],
  );
});

test("validateRegistry checks the optional androidSdk field, and 2026.06 mirrors the template", () => {
  // Valid: integer compileSdk/targetSdk.
  assert.deepEqual(
    validateRegistry({ sets: [{ id: "a", versions: { kotlin: "2.2.20" }, androidSdk: { compileSdk: 35, targetSdk: 35 } }] }),
    [],
  );
  // Invalid: non-integer level.
  assert.ok(
    validateRegistry({ sets: [{ id: "a", versions: { kotlin: "2.2.20" }, androidSdk: { compileSdk: "35" } }] })
      .some((e) => e.includes("androidSdk.compileSdk")),
  );
  // The shipped 2026.06 set's androidSdk mirrors the template's composeApp/build.gradle.kts.
  const set = getSet(loadRegistry(), "2026.06");
  assert.ok(set.androidSdk, "2026.06 must declare androidSdk");
  const bg = fs.readFileSync(
    path.join(__dirname, "..", "template", "composeApp", "build.gradle.kts"),
    "utf8",
  );
  assert.match(bg, new RegExp(`compileSdk = ${set.androidSdk.compileSdk}\\b`), "template compileSdk matches the set");
  assert.match(bg, new RegExp(`targetSdk = ${set.androidSdk.targetSdk}\\b`), "template targetSdk matches the set");
});

test("every shipped proven-green set declares androidSdk (compileSdk is managed, promoter propagates it)", () => {
  for (const set of loadRegistry().sets) {
    assert.ok(
      set.androidSdk && Number.isInteger(set.androidSdk.compileSdk),
      `${set.id} must declare androidSdk.compileSdk — otherwise upgrade leaves compileSdk stale`,
    );
  }
});

// --- helpers ------------------------------------------------------------------------

test("latestSet returns the last (newest) entry", () => {
  const reg = {
    sets: [
      { id: "old", versions: { kotlin: "2.1.0", ksp: "2.1.0-1.0.29" } },
      { id: "new", versions: { kotlin: "2.2.20", ksp: "2.2.20-2.0.4" } },
    ],
  };
  assert.equal(latestSet(reg).id, "new");
});

test("nearestSet picks the set with most matching values; ties go newer", () => {
  const reg = {
    sets: [
      { id: "old", versions: { kotlin: "2.1.0", agp: "8.5.2" } },
      { id: "new", versions: { kotlin: "2.2.20", agp: "8.7.3" } },
    ],
  };
  assert.equal(nearestSet(reg, { kotlin: "2.1.0", agp: "8.5.2" }).set.id, "old");
  assert.equal(nearestSet(reg, { kotlin: "2.2.20", agp: "8.5.2" }).set.id, "new", "tie → newer");
  // Also accepts a parseVersions()-style Map
  const asMap = new Map([["kotlin", { value: "2.1.0" }], ["agp", { value: "8.5.2" }]]);
  assert.equal(nearestSet(reg, asMap).set.id, "old");
});
