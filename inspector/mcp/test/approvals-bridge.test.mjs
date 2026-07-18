// approvals-bridge: the console's dynamic link to a generated project's OWN
// qa/lib/approvals.mjs. Tests run against the REAL library (copied from
// template/qa/lib/approvals.mjs into a temp fixture project) rather than a
// mock — the point of this bridge is "call the library, never fork it", so
// the test should prove it actually calls the real thing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getApprovalsData,
  approveArtifact,
  resetApprovalsBridgeCache,
} from "../src/lib/approvals-bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_APPROVALS_LIB = path.join(HERE, "..", "..", "..", "template", "qa", "lib", "approvals.mjs");

/**
 * A minimal generated-project fixture: a resolvable package (namespace in
 * build.gradle.kts) plus Theme.kt/Tokens.kt (so the `design-system` artifact
 * resolves), and — deliberately — NO specs/app-base.spec.md, so `architecture`
 * stays unresolvable (0 files). Two artifact states in one small fixture.
 */
function makeFixtureProject({ withApprovalsLib = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-approvals-bridge-"));
  fs.mkdirSync(path.join(root, "composeApp"), { recursive: true });
  fs.writeFileSync(path.join(root, "composeApp", "build.gradle.kts"), 'android {\n  namespace = "com.acme.demo"\n}\n');
  const themeDir = path.join(
    root,
    "composeApp",
    "src",
    "commonMain",
    "kotlin",
    "com",
    "acme",
    "demo",
    "presentation",
    "theme",
  );
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, "Theme.kt"), "object AcmeColors\n");
  fs.writeFileSync(path.join(themeDir, "Tokens.kt"), "object AcmeTokens\n");
  if (withApprovalsLib) {
    const libDir = path.join(root, "qa", "lib");
    fs.mkdirSync(libDir, { recursive: true });
    fs.copyFileSync(REAL_APPROVALS_LIB, path.join(libDir, "approvals.mjs"));
  }
  return root;
}

function cleanup(root) {
  resetApprovalsBridgeCache(root);
  fs.rmSync(root, { recursive: true, force: true });
}

test("getApprovalsData: {available:false} in a project with no qa/lib/approvals.mjs (older scaffold)", async () => {
  const root = makeFixtureProject({ withApprovalsLib: false });
  try {
    assert.deepEqual(await getApprovalsData(root), { available: false });
  } finally {
    cleanup(root);
  }
});

test("getApprovalsData: available + statuses, calling the REAL library — resolvable and unresolvable artifacts both surface", async () => {
  const root = makeFixtureProject();
  try {
    const data = await getApprovalsData(root);
    assert.equal(data.available, true);
    const byId = new Map(data.statuses.map((s) => [s.id, s]));
    assert.equal(byId.get("design-system").status, "unreviewed");
    assert.equal(byId.get("design-system").resolvable, true);
    assert.equal(byId.get("design-system").fileCount, 2);
    assert.equal(byId.get("architecture").resolvable, false, "specs/app-base.spec.md is absent from the fixture");
    assert.equal(byId.get("architecture").fileCount, 0);
  } finally {
    cleanup(root);
  }
});

test("approveArtifact: approves a resolvable artifact and writes qa/approvals.json (the same file the CLI writes)", async () => {
  const root = makeFixtureProject();
  try {
    const result = await approveArtifact(root, "design-system");
    assert.equal(result.ok, true);
    assert.match(result.hash, /^[0-9a-f]{64}$/);
    assert.ok(result.approvedAt);

    const written = JSON.parse(fs.readFileSync(path.join(root, "qa", "approvals.json"), "utf8"));
    const rec = written.artifacts.find((a) => a.artifact === "design-system");
    assert.equal(rec.status, "approved");
    assert.equal(rec.hash, result.hash);

    // A second read reflects the write — the bridge never caches DATA, only the module lookup.
    const data = await getApprovalsData(root);
    assert.equal(data.statuses.find((s) => s.id === "design-system").status, "approved");
  } finally {
    cleanup(root);
  }
});

test("approveArtifact: refuses a vacuous (0-file) approval and an unknown id, verbatim from the library", async () => {
  const root = makeFixtureProject();
  try {
    const vacuous = await approveArtifact(root, "architecture");
    assert.equal(vacuous.ok, false);
    assert.match(vacuous.reason, /0 files|missing on disk/);

    const unknown = await approveArtifact(root, "not-a-real-artifact");
    assert.equal(unknown.ok, false);
    assert.match(unknown.reason, /unknown artifact/);
  } finally {
    cleanup(root);
  }
});

test("approveArtifact: honest refusal (not a throw) when the project has no approvals library", async () => {
  const root = makeFixtureProject({ withApprovalsLib: false });
  try {
    const result = await approveArtifact(root, "design-system");
    assert.equal(result.ok, false);
    assert.match(result.reason, /not present in this project/);
  } finally {
    cleanup(root);
  }
});

test("resetApprovalsBridgeCache: a library added AFTER the first (miss) lookup is picked up once the cache is cleared", async () => {
  const root = makeFixtureProject({ withApprovalsLib: false });
  try {
    assert.deepEqual(await getApprovalsData(root), { available: false });
    // Library appears later (e.g. the project was re-stamped mid-session).
    const libDir = path.join(root, "qa", "lib");
    fs.mkdirSync(libDir, { recursive: true });
    fs.copyFileSync(REAL_APPROVALS_LIB, path.join(libDir, "approvals.mjs"));
    // Without a reset the cached "no library here" lookup would still say so.
    resetApprovalsBridgeCache(root);
    const data = await getApprovalsData(root);
    assert.equal(data.available, true);
  } finally {
    cleanup(root);
  }
});
