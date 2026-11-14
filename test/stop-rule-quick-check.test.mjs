// The Stop rule (qa/lib/stop-rule.mjs): during a feature a PASS quick check
// lets a session stop and says it is not done-evidence; a feature at Prove —
// derived by the walk, never claimed — owes the full lane; a push to the
// default branch and a bare `receipt-check` stay strict. Both ways (GATE-RULES
// Rule 0): each allowance is shown, and each planted way around it is refused.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { featuresOwingFullLane } from "../packages/harness/src/lib/stop-rule.mjs";

const SIGNER = "Test Signer <test@example.com>";

async function stamp(prefix) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await scaffold(
    {
      appName: "Acme", package: "com.acme.demo", iosBundleId: "com.acme.demo", themePrefix: "Acme",
      platforms: { android: true, ios: true }, room: true, e2e: true, inspector: true, devClient: true,
      tabs: [{ label: "Home", icon: "home" }], targetDir: out,
    },
    { verify: false },
  );
  return out;
}

/** A PASS quick receipt (`verify --fast`) for the tree as it stands. */
async function writeQuickReceipt(dir, { profile = "local", rel = "qa/evidence/latest-fast.json" } = {}) {
  const { computeInputsHash } = await import(pathToFileURL(path.join(dir, "qa/lib/inputs-hash.mjs")));
  const { checkHarnessIntegrity } = await import(pathToFileURL(path.join(dir, "qa/lib/harness-lock.mjs")));
  const inputs = computeInputsHash(dir);
  const h = checkHarnessIntegrity(dir);
  const receipt = {
    schema: "prooflane-evidence/1", profile, stage: profile === "smoke" ? "smoke" : "change", mode: "fast", verdict: "PASS",
    commit: { sha: null, dirty: [] },
    inputs: { hash: inputs.hash, fileCount: inputs.fileCount, hashWithoutApprovals: inputs.hashWithoutApprovals },
    steps: [
      { name: "harnessIntegrity", verdict: "PASS", durationMs: 10, harness: h },
      { name: "build", verdict: "PASS", durationMs: 9000 },
      { name: "unitTests", verdict: "PASS", durationMs: 4000, note: "affected tests only" },
    ],
    harness: { name: h.name, version: h.version, sha256: h.sha256, status: h.status, intact: true },
    pack: { id: "cmp", version: null }, strength: { onDeviceSteps: [] }, evidenceLevel: null, artifacts: [],
    toolVersions: { node: process.version, platform: process.platform }, generatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(dir, "qa/evidence"), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), JSON.stringify(receipt, null, 2));
}

const hook = (dir) => spawnSync(process.execPath, ["qa/receipt-check.mjs", "--hook"], { cwd: dir, input: "{}", encoding: "utf8" });
const check = (dir, args = []) => spawnSync(process.execPath, ["qa/receipt-check.mjs", ...args], { cwd: dir, encoding: "utf8" });
const editSource = (dir) =>
  fs.appendFileSync(path.join(dir, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/theme/Theme.kt"), `\n// edit ${Math.random()}\n`);

/** A feature built end to end: signed brief, signed spec, every clause cited — the walk puts it at Prove. */
function featureAtProve(dir) {
  fs.mkdirSync(path.join(dir, "docs/features"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "docs/features/ledger.md"),
    "# Ledger\n\n```json cmp:feature\n{ \"touches\": [], \"screens\": false }\n```\n\n## Problem\n\nKeep a ledger.\n",
  );
  fs.writeFileSync(path.join(dir, "specs/ledger.spec.md"), "# Spec: ledger\n\n- **LEDGER-01** — Given an entry, When it is saved, Then it is listed.\n");
  fs.writeFileSync(
    path.join(dir, "composeApp/src/commonTest/kotlin/com/acme/demo/LedgerTest.kt"),
    "package com.acme.demo\n\nimport kotlin.test.Test\n\nclass LedgerTest {\n    // SPEC: LEDGER-01\n    @Test\n    fun saved() {}\n}\n",
  );
  execFileSync(process.execPath, ["qa/approve.mjs", "feature-brief:ledger", "feature-spec:ledger", "--as", SIGNER], { cwd: dir, encoding: "utf8" });
}

test("in progress: a PASS quick receipt lets the session stop, and the stop says it is NOT done-evidence", async () => {
  const dir = await stamp("cmp-stop-quick-");
  try {
    const refused = hook(dir);
    assert.equal(refused.status, 2, "nothing attests the tree yet");
    assert.match(refused.stderr, /Quick check missing/);
    assert.match(refused.stderr, /node qa\/verify\.mjs --fast/, "the ask is the quick check, seconds — not the lane");

    await writeQuickReceipt(dir);
    const ok = hook(dir);
    assert.equal(ok.status, 0, ok.stderr);
    const msg = JSON.parse(ok.stdout.trim()).systemMessage;
    assert.match(msg, /QUICK CHECK/);
    assert.match(msg, /NOT done-evidence/);
    assert.match(msg, /reaches Prove/);

    // --quick (pre-push to a branch) accepts it too; the bare check (CI, push to main) does NOT.
    assert.equal(check(dir, ["--quick"]).status, 0);
    assert.equal(check(dir).status, 1, "the strict done-gate is unchanged");

    // The feature-scoped check's receipt is a quick check too.
    fs.rmSync(path.join(dir, "qa/evidence/latest-fast.json"));
    await writeQuickReceipt(dir, { profile: "feature", rel: "qa/evidence/latest-feature.json" });
    assert.equal(hook(dir).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: a quick receipt for an OLDER tree → refused; the stop needs a check of this tree", async () => {
  const dir = await stamp("cmp-stop-stale-");
  try {
    await writeQuickReceipt(dir);
    editSource(dir);
    const r = hook(dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Quick check missing/);
    assert.match(r.stderr, /source changed since the receipt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: a smoke-profile receipt (no build, no tests) is not a quick check of the change", async () => {
  const dir = await stamp("cmp-stop-smoke-");
  try {
    await writeQuickReceipt(dir, { profile: "smoke" });
    const r = hook(dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /checks the harness, not this change/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: a feature at Prove (derived by the walk) owes the full lane — the quick receipt no longer lets it stop", async () => {
  const dir = await stamp("cmp-stop-prove-");
  try {
    featureAtProve(dir);
    const owing = featuresOwingFullLane(dir);
    assert.equal(owing.ok, true);
    assert.deepEqual(owing.names, ["ledger"], "signed brief + signed spec + every clause cited = Prove");

    await writeQuickReceipt(dir);
    const r = hook(dir);
    assert.equal(r.status, 2, "a quick check is not enough once a feature is complete end to end");
    assert.match(r.stderr, /full lane is owed now, once: ledger is at Prove/);
    assert.equal(check(dir, ["--quick"]).status, 1, "and pre-push to a branch refuses it too");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: a closed plan naming its feature TIGHTENS the rule — and an open one loosens nothing", async () => {
  const dir = await stamp("cmp-stop-plan-");
  try {
    await writeQuickReceipt(dir);
    const plan = (done) => ({ title: "t", feature: "checkout", steps: [{ n: 1, label: "a", done }, { n: 2, label: "b", done }], current: done ? 3 : 1 });
    fs.writeFileSync(path.join(dir, "qa/.plan.json"), JSON.stringify(plan(false)));
    assert.equal(hook(dir).status, 0, "an open chain: still in progress");
    fs.writeFileSync(path.join(dir, "qa/.plan.json"), JSON.stringify(plan(true)));
    const r = hook(dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /declared plan for checkout is closed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: when completeness cannot be derived, the rule fails closed", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stop-nowalk-"));
  try {
    const owing = featuresOwingFullLane(empty);
    assert.equal(owing.ok, false, "no project, no walk — never read as 'in progress'");
    assert.match(owing.reason, /could not be derived/);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test("pre-push: a feature branch needs only the quick check; the default branch needs the committed full receipt", async () => {
  const dir = await stamp("cmp-stop-prepush-");
  try {
    const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q", "-b", "main");
    git("-c", "user.email=t@e.st", "-c", "user.name=T", "add", "-A");
    git("-c", "user.email=t@e.st", "-c", "user.name=T", "commit", "-qm", "init");
    await writeQuickReceipt(dir);
    const push = (remoteRef) =>
      spawnSync("sh", [".githooks/pre-push", "origin", "url"], { cwd: dir, encoding: "utf8", input: `refs/heads/x abc ${remoteRef} def\n` });
    const feature = push("refs/heads/feat/ledger");
    assert.equal(feature.status, 0, feature.stdout + feature.stderr);
    assert.match(feature.stdout, /QUICK/);
    const main = push("refs/heads/main");
    assert.equal(main.status, 1, "a push to the default branch is the strict, full-lane check");
    assert.match(main.stdout, /qa\/evidence\/latest\.json is not committed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
