// The spec scanner's MODEL comes from the profile; the MECHANIC stays in the core.
//
// Stage 0 PR 4 (docs/NORTH-STAR.md §6; AGNOSTIC-HARNESS-ARCHITECTURE.md §11.3
// step 4). Before this, qa/lib/spec-coverage.mjs hardcoded `composeApp/src`,
// `qa/e2e`, `.kt`, four tier names and which tier satisfies `[tier: device]`.
// Now a profile declares `layout` and `tiers`; qa/lib/spec-model.mjs validates
// them into one model; every scanner takes the model, and a caller with only a
// project root gets it resolved from the manifest — synchronously, because the
// callers that have only a root sit in sync chains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { specDeclarationProblems, specModelFrom, resolveSpecModel, requireSpecModel } from "../packages/harness/src/lib/spec-model.mjs";
import { loadProfile, loadProfileSync } from "../packages/harness/src/lib/profile-loader.mjs";
import { clauseTierCoverage, listFlowFiles, scanCitations, scanSpecClauses } from "../packages/harness/src/lib/spec-coverage.mjs";
import * as cmp from "../packages/harness/src/lib/profiles/cmp/index.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A backend-shaped profile: no flows, two tiers, Kotlin + node tests under services/ and qa/test. */
const BACKEND = {
  id: "ktor-backend",
  layout: { specs: "docs/specs", citationRoots: ["services", "qa/test"], citationExts: [".kt", ".mjs"], flows: null },
  tiers: {
    names: ["unit", "integration"],
    hostOnly: ["unit"],
    satisfying: { integration: ["integration"] },
    journey: null,
    forFile: (rel) => (/\/integrationTest\//.test(rel) ? "integration" : "unit"),
  },
};

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function write(root, rel, text) {
  const abs = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

test("the cmp profile's declarations build a model that is exactly what the scanner used to hardcode", () => {
  const r = specModelFrom(cmp);
  assert.equal(r.ok, true, r.reason);
  const m = r.model;
  assert.equal(m.profileId, "cmp");
  assert.equal(m.specsDir, "specs");
  assert.deepEqual([...m.citationRoots], ["composeApp/src", "qa/e2e"]);
  assert.deepEqual([...m.citationExts], [".kt", ".kts"]);
  assert.deepEqual({ dir: m.flows.dir, exts: [...m.flows.exts] }, { dir: "qa/e2e", exts: [".yaml", ".yml"] });
  assert.deepEqual([...m.tiers.hostOnly], ["commonTest", "desktopTest"]);
  assert.deepEqual(m.tiers.satisfying, { device: ["androidInstrumentedTest", "e2e"], e2e: ["e2e"] });
  assert.equal(m.tiers.journey, "e2e");
  assert.equal(m.tiers.forFile("composeApp/src/androidInstrumentedTest/kotlin/T.kt"), "androidInstrumentedTest");
  assert.equal(m.tiers.forFile("composeApp/src/commonTest/kotlin/T.kt"), "commonTest");
  assert.equal(m.tiers.forFile("composeApp/src/desktopTest/kotlin/T.kt"), "desktopTest");
  assert.equal(m.tiers.forFile("qa/e2e/smoke.yaml"), "e2e");
  assert.equal(m.tiers.forFile("composeApp/src/commonMain/kotlin/App.kt"), "other");
  assert.equal(m.tiers.forFile("composeApp\\src\\desktopTest\\T.kt"), "desktopTest", "either separator");
});

test("the core never names a stack: spec-coverage.mjs and spec-model.mjs carry no Compose path, tier or extension", () => {
  const core = ["spec-coverage.mjs", "spec-model.mjs"].map((f) => fs.readFileSync(path.join(REPO_ROOT, "packages/harness/src/lib", f), "utf8"));
  for (const src of core) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    for (const fact of ["composeApp", "androidInstrumentedTest", "desktopTest", "commonTest", "qa/e2e", '".kt"', '".yaml"', '"device"']) {
      assert.ok(!code.includes(fact), `core scanner code names a stack fact: ${fact}`);
    }
  }
});

test("a profile without usable declarations is refused with every problem named — there is no fallback model", () => {
  const problems = specDeclarationProblems({ id: "x", layout: { specs: "", citationRoots: [], citationExts: ["kt"] }, tiers: { names: ["a"], hostOnly: ["b"], satisfying: { "Bad Name": ["zz"] }, journey: "q" } });
  assert.ok(problems.some((p) => /layout\.specs/.test(p)));
  assert.ok(problems.some((p) => /citationRoots/.test(p)));
  assert.ok(problems.some((p) => /citationExts/.test(p)));
  assert.ok(problems.some((p) => /hostOnly/.test(p)));
  assert.ok(problems.some((p) => /invalid requirement name/.test(p)));
  assert.ok(problems.some((p) => /journey/.test(p)));
  assert.ok(problems.some((p) => /forFile/.test(p)));
  const r = specModelFrom({ id: "x" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /profile "x" declares an unusable layout\/tiers: layout must be an object; tiers must be an object/);
  assert.deepEqual(specDeclarationProblems(BACKEND), []);
});

test("a backend-shaped profile scans its own layout: no flows, its own tiers, its own extensions", () => {
  const root = tmp("spec-model-backend-");
  try {
    const model = specModelFrom(BACKEND).model;
    write(root, "docs/specs/money.spec.md", "- **MN-01** [tier: integration] — Given a row lock, Then it holds.\n- **MN-02** — Given a currency, Then it rounds.\n");
    write(root, "services/core/src/test/kotlin/MoneyTest.kt", "class MoneyTest {\n  // SPEC: MN-01, MN-02\n  @Test fun t() {}\n}\n");
    write(root, "services/core/src/integrationTest/kotlin/LockIT.kt", "class LockIT {\n  // SPEC: MN-01\n  @Test fun t() {}\n}\n");
    write(root, "qa/test/money.test.mjs", "// SPEC: MN-02\ntest('rounds', () => {});\n");
    write(root, "qa/e2e/smoke.yaml", "# SPEC: MN-02\n- launchApp\n"); // not a citation root here — must NOT count
    const clauses = scanSpecClauses(root, model);
    assert.deepEqual([...clauses.keys()], ["MN-01", "MN-02"]);
    assert.equal(clauses.get("MN-01").requiredTier, "integration");
    const tags = scanCitations(root, model).map((t) => `${t.id}@${t.tier}:${t.file.split(path.sep).join("/")}`).sort();
    assert.deepEqual(tags, [
      "MN-01@integration:services/core/src/integrationTest/kotlin/LockIT.kt",
      "MN-01@unit:services/core/src/test/kotlin/MoneyTest.kt",
      "MN-02@unit:qa/test/money.test.mjs",
      "MN-02@unit:services/core/src/test/kotlin/MoneyTest.kt",
    ]);
    assert.deepEqual(listFlowFiles(root, model), [], "a profile with no flows has no flow files, whatever is on disk");
    const cov = clauseTierCoverage(clauses, tags.length ? scanCitations(root, model) : [], model);
    assert.deepEqual(cov.unmetTier, [], "MN-01 is cited from an integration test — its declared tier is met");
    assert.deepEqual(cov.hostOnly, ["MN-02"]);
    assert.match(cov.summaryLine, /1 clause cited only from host-only tiers \(MN-02\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PLANTED FAILURE: a clause that names a requirement the profile does not declare is UNMET by name, not silently satisfied", () => {
  const root = tmp("spec-model-unknown-");
  try {
    const model = specModelFrom(BACKEND).model;
    write(root, "docs/specs/a.spec.md", "- **AA-01** [tier: device] — Given a phone, Then it rings.\n");
    write(root, "services/x/src/integrationTest/kotlin/T.kt", "class T {\n  // SPEC: AA-01\n  @Test fun t() {}\n}\n");
    const cov = clauseTierCoverage(scanSpecClauses(root, model), scanCitations(root, model), model);
    assert.equal(cov.unmetTier.length, 1);
    assert.equal(cov.unmetTier[0].id, "AA-01");
    assert.equal(cov.unmetTier[0].unknown, true, "\"device\" is mobile's requirement; this profile declares only \"integration\"");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the manifest's layout fields override the profile's, field by field — the same rule the console applies", () => {
  const r = specModelFrom(BACKEND, { specs: "spec", citationRoots: ["src"] });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.model.specsDir, "spec");
  assert.deepEqual([...r.model.citationRoots], ["src"]);
  const none = specModelFrom(BACKEND, { specs: "", citationRoots: [] });
  assert.equal(none.model.specsDir, "docs/specs", "an empty override is no override");
  assert.deepEqual([...none.model.citationRoots], ["services", "qa/test"]);
});

// ── Resolution from a root: manifest → profile → model, synchronously ────────

function stampedApp() {
  const base = tmp("spec-model-app-");
  const dir = path.join(base, "ModelApp");
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), dir, "--yes", "--name", "ModelApp", "--package", "com.example.modelapp", "--no-ios", "--no-firebase", "--no-verify"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 },
  );
  if (r.status !== 0) throw new Error(`stamp failed: ${r.stdout}${r.stderr}`);
  return dir;
}

test("a stamped app resolves its model from its manifest and vendored profile, synchronously, and the scanner works with a root alone", async () => {
  const dir = stampedApp();
  try {
    const r = resolveSpecModel(dir);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.model.profileId, "cmp");
    assert.deepEqual([...r.model.citationRoots], ["composeApp/src", "qa/e2e"]);
    // The vendored scanner, called the way the console's Specs bridge calls it: root only.
    const { pathToFileURL } = await import("node:url");
    const vendored = await import(pathToFileURL(path.join(dir, "qa/lib/spec-coverage.mjs")).href);
    const clauses = vendored.scanSpecClauses(dir);
    assert.ok(clauses.size > 0, "the stamped app's specs are read through the resolved model");
    const tags = vendored.scanCitations(dir);
    assert.ok(tags.length > 0);
    assert.ok(tags.every((t) => ["commonTest", "desktopTest", "androidInstrumentedTest", "e2e", "other"].includes(t.tier)));
    assert.deepEqual(vendored.listFlowFiles(dir), ["qa/e2e/smoke.yaml"]);
    // Both loaders hand back the same module instance — one profile, two doors.
    const sync = loadProfileSync(dir, { id: "cmp" });
    const asyncLoad = await loadProfile(dir, { id: "cmp" });
    assert.equal(sync.ok, true, sync.reason);
    assert.equal(asyncLoad.ok, true, asyncLoad.reason);
    assert.equal(sync.profile, asyncLoad.profile);
  } finally {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test("a root without a manifest is refused with the command that writes one — the scanner does not guess a layout", () => {
  const root = tmp("spec-model-absent-");
  try {
    const r = resolveSpecModel(root);
    assert.equal(r.ok, false);
    assert.match(r.reason, /harness-manifest\.json is missing/);
    assert.match(r.reason, /create-cmp harness init/, "the remedy must be a command that works on a repo of any stack");
    assert.throws(() => requireSpecModel(root), /harness-manifest\.json is missing/);
    assert.throws(() => scanCitations(root), /harness-manifest\.json is missing/, "root-only scanning refuses rather than scanning nothing");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a profile that loads but declares no tiers is refused at load, by name", () => {
  const root = tmp("spec-model-notiers-");
  try {
    write(root, "qa/harness-manifest.json", JSON.stringify({ schema: "harness-manifest/2", profile: { id: "bare" } }));
    write(root, "qa/lib/profiles/bare/index.mjs", 'export const id = "bare";\nexport const protocol = 1;\nexport const layout = { specs: "specs", citationRoots: ["src"], citationExts: [".kt"], flows: null };\nexport function steps() { return {}; }\n');
    const r = resolveSpecModel(root);
    assert.equal(r.ok, false);
    assert.match(r.reason, /missing required export\(s\): tiers/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
