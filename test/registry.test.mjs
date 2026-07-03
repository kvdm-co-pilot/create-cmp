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
