import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseVersions } from "../src/lib/toml.mjs";
import {
  diffAgainstSet,
  resultingVersions,
  lockstepViolation,
  planUpgrade,
  looksLikeOurTemplate,
  applyAndroidSdk,
} from "../src/lib/upgrade.mjs";
import { loadRegistry, getSet } from "../src/lib/registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures", "libs.versions.toml"), "utf8");

const SET = getSet(loadRegistry(), "2026.06"); // pin to the frozen baseline for stable value assertions

// --- differ -------------------------------------------------------------------

test("diffAgainstSet finds changed, same, unmanaged, and not-in-project keys", () => {
  const diff = diffAgainstSet(parseVersions(FIXTURE), SET);

  const changedKeys = diff.changes.map((c) => c.key);
  assert.ok(changedKeys.includes("kotlin"));
  assert.ok(changedKeys.includes("ksp"));
  assert.ok(changedKeys.includes("room"));

  const kotlin = diff.changes.find((c) => c.key === "kotlin");
  assert.deepEqual(kotlin, { key: "kotlin", from: "2.1.0", to: "2.2.20" });

  // already at the set's value
  assert.ok(diff.same.includes("google-services"));
  assert.ok(diff.same.includes("firebase-gitlive"));

  // in the project, unknown to the set → warned, left untouched
  assert.deepEqual(diff.unmanaged, [{ key: "moko-resources", value: "0.24.4" }]);

  // the fixture declares every set key, so nothing is missing
  assert.deepEqual(diff.notInProject, []);
});

test("diffAgainstSet reports set keys the project does not declare", () => {
  const tiny = '[versions]\nkotlin = "2.1.0"\nksp = "2.1.0-1.0.29"\n';
  const diff = diffAgainstSet(parseVersions(tiny), SET);
  assert.ok(diff.notInProject.includes("room"));
  assert.ok(diff.notInProject.includes("agp"));
});

test("resultingVersions overlays changes onto current values", () => {
  const versions = parseVersions(FIXTURE);
  const out = resultingVersions(versions, [{ key: "kotlin", to: "2.2.20" }]);
  assert.equal(out.kotlin, "2.2.20");
  assert.equal(out.agp, "8.5.2"); // untouched
});

// --- lockstep guardrail ---------------------------------------------------------

test("lockstepViolation: consistent pairing passes", () => {
  assert.equal(lockstepViolation({ kotlin: "2.2.20", ksp: "2.2.20-2.0.4" }), null);
});

test("lockstepViolation: KSP2 aligned scheme (ksp === kotlin) passes", () => {
  assert.equal(lockstepViolation({ kotlin: "2.3.10", ksp: "2.3.10" }), null);
});

test("applyAndroidSdk rewrites compileSdk/targetSdk surgically and reports only real changes", () => {
  const src = "android {\n    compileSdk = 35\n    defaultConfig {\n        minSdk = 24\n        targetSdk = 35\n    }\n}\n";
  const r = applyAndroidSdk(src, { compileSdk: 36, targetSdk: 35 });
  assert.match(r.content, /compileSdk = 36/);
  assert.match(r.content, /targetSdk = 35/);
  assert.match(r.content, /minSdk = 24/, "unrelated lines preserved");
  assert.deepEqual(r.changes, [{ key: "compileSdk", from: "35", to: "36" }]);
});

test("applyAndroidSdk is a no-op when levels already match or androidSdk is absent", () => {
  const src = "compileSdk = 36\ntargetSdk = 35\n";
  assert.deepEqual(applyAndroidSdk(src, { compileSdk: 36, targetSdk: 35 }).changes, []);
  assert.equal(applyAndroidSdk(src, { compileSdk: 36, targetSdk: 35 }).content, src);
  assert.deepEqual(applyAndroidSdk(src, undefined).changes, []);
});

test("planUpgrade surfaces build.gradle.kts compileSdk changes from a set's androidSdk", () => {
  const plan = planUpgrade({
    tomlContent: '[versions]\nkotlin = "2.2.20"\n',
    gradlePropertiesContent: null,
    wrapperPropertiesContent: null,
    buildGradleContent: "android {\n    compileSdk = 35\n    targetSdk = 35\n}\n",
    set: { versions: { kotlin: "2.2.20" }, androidSdk: { compileSdk: 36 } },
  });
  assert.deepEqual(plan.sdkChanges, [{ key: "compileSdk", from: "35", to: "36" }]);
  assert.match(plan.newBuildGradleContent, /compileSdk = 36/);
});

test("lockstepViolation: mismatch is reported", () => {
  const v = lockstepViolation({ kotlin: "2.2.20", ksp: "2.1.0-1.0.29" });
  assert.ok(v && v.includes("OUT OF LOCKSTEP"));
});

test("lockstepViolation: absent kotlin or ksp → nothing to check", () => {
  assert.equal(lockstepViolation({ kotlin: "2.2.20" }), null);
  assert.equal(lockstepViolation({ ksp: "2.2.20-2.0.4" }), null);
  assert.equal(lockstepViolation({}), null);
});

test("planUpgrade REFUSES to produce content when the result would break lockstep", () => {
  // A malicious/broken set that bumps kotlin but not ksp.
  const badSet = { id: "bad", versions: { kotlin: "2.2.20" } };
  const plan = planUpgrade({
    tomlContent: FIXTURE,
    gradlePropertiesContent: null,
    wrapperPropertiesContent: null,
    set: badSet,
  });
  assert.ok(plan.lockstepError, "must flag the violation");
  assert.equal(plan.newTomlContent, null, "must not offer content to write");
});

// --- full plan -------------------------------------------------------------------

test("planUpgrade with the real registry set produces a lockstep-clean surgical rewrite", () => {
  const plan = planUpgrade({
    tomlContent: FIXTURE,
    gradlePropertiesContent: "kotlin.code.style=official\n",
    wrapperPropertiesContent:
      "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.9-bin.zip\n",
    set: SET,
  });

  assert.equal(plan.lockstepError, null);
  assert.ok(plan.newTomlContent);

  const v = parseVersions(plan.newTomlContent);
  assert.equal(v.get("kotlin").value, "2.2.20");
  assert.equal(v.get("ksp").value, "2.2.20-2.0.4");
  assert.equal(v.get("moko-resources").value, "0.24.4"); // unmanaged untouched

  // gradle.properties: the set requires ksp.useKSP2=true
  assert.deepEqual(plan.propertyChanges, [{ key: "ksp.useKSP2", from: null, to: "true" }]);
  assert.ok(plan.newGradlePropertiesContent.includes("ksp.useKSP2=true"));
  assert.ok(plan.newGradlePropertiesContent.startsWith("kotlin.code.style=official"));

  // wrapper: 8.9 → the set's pinned version, escaped for properties format
  assert.ok(plan.wrapperChange);
  assert.equal(plan.wrapperChange.to, SET.gradleWrapper.distributionUrl);
  assert.ok(
    plan.newWrapperPropertiesContent.includes(
      `distributionUrl=${SET.gradleWrapper.distributionUrl.replace(/:/g, "\\:")}`
    )
  );
});

test("planUpgrade is a no-op when everything already matches", () => {
  const aligned = [
    "[versions]",
    ...Object.entries(SET.versions).map(([k, v]) => `${k} = "${v}"`),
    "",
  ].join("\n");
  const plan = planUpgrade({
    tomlContent: aligned,
    gradlePropertiesContent: "ksp.useKSP2=true\n",
    wrapperPropertiesContent: `distributionUrl=${SET.gradleWrapper.distributionUrl.replace(/:/g, "\\:")}\n`,
    set: SET,
  });
  assert.equal(plan.diff.changes.length, 0);
  assert.equal(plan.newTomlContent, null);
  assert.equal(plan.newGradlePropertiesContent, null);
  assert.equal(plan.newWrapperPropertiesContent, null);
});

test("planUpgrade tolerates absent gradle.properties / wrapper files (null in → null out)", () => {
  const plan = planUpgrade({
    tomlContent: FIXTURE,
    gradlePropertiesContent: null,
    wrapperPropertiesContent: null,
    set: SET,
  });
  assert.equal(plan.newGradlePropertiesContent, null);
  assert.equal(plan.newWrapperPropertiesContent, null);
  assert.ok(plan.newTomlContent, "toml rewrite still happens");
});

test("template-marker detection softens messaging only (never refuses)", () => {
  assert.equal(looksLikeOurTemplate(FIXTURE), false);
  assert.equal(
    looksLikeOurTemplate("# ── Frozen, CI-verified version set (the reproducibility moat).\n"),
    true
  );
  // a non-template catalog still gets a full plan:
  const plan = planUpgrade({
    tomlContent: FIXTURE,
    gradlePropertiesContent: null,
    wrapperPropertiesContent: null,
    set: SET,
  });
  assert.equal(plan.fromOurTemplate, false);
  assert.ok(plan.diff.changes.length > 0);
});
