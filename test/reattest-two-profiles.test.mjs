// The approvals-only re-attest (qa/lib/reattest.mjs) and the Stop rule
// (qa/lib/stop-rule.mjs) are the CORE's, so it must
// read each pack's own names and assume none — proved here against the cmp pack
// (packages/harness/src/lib/profiles/cmp) and the alien one
// (test/fixtures/profiles/py-alien), which spells its self-check
// `harness_integrity` and declares no ledger readers at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as alien from "./fixtures/profiles/py-alien/index.mjs";
import { createCmpSteps } from "../packages/harness/src/lib/profiles/cmp/steps-cmp.mjs";
import { stepDisplayName } from "../packages/harness/src/lib/lane-runner.mjs";
import { planReattest, vouchingRow } from "../packages/harness/src/lib/reattest.mjs";
import { manifestFor, writeHarnessManifest } from "../packages/harness/src/lib/harness-manifest.mjs";
import { featuresOwingFullLane, quickCheckStanding } from "../packages/harness/src/lib/stop-rule.mjs";

function cmpPack() {
  const trap = (what) => () => {
    throw new Error(`${what} must not run while the pack is only being constructed`);
  };
  return createCmpSteps({
    ROOT: os.tmpdir(), HERE: os.tmpdir(), GRADLEW: "./gradlew", RERUN: " --rerun", fast: false, determinism: false,
    profile: "local", mode: "full", sh: trap("sh"), shGradle: trap("shGradle"), tryGit: trap("tryGit"), tryGitLines: trap("tryGitLines"),
    DEGRADED_PATHS: [],
  });
}

const H = (c) => c.repeat(64);
function receiptOver(names, vouchName) {
  return {
    profile: "local", mode: "full", verdict: "PASS", generatedAt: "2026-11-14T10:00:00.000Z", commit: { sha: "abc" },
    inputs: { hash: H("a"), hashWithoutApprovals: H("b") },
    harness: { sha256: H("c") },
    steps: names.map((name) => ({ name, verdict: "PASS", durationMs: 5, ...(name === vouchName ? { harness: { status: "intact" } } : {}) })),
  };
}
const current = { hash: H("d"), hashWithoutApprovals: H("b") };

test("cmp: the pack's declared reader and its own self-check are what re-run", () => {
  const pack = cmpPack();
  assert.deepEqual(pack.approvalsLedgerReaders, ["approvals"]);
  const names = pack.stepsForProfile.local.map((fn) => stepDisplayName(fn));
  const previous = receiptOver(names, "harnessIntegrity");
  assert.equal(vouchingRow(previous.steps).name, "harnessIntegrity");
  const plan = planReattest({ previous, current, harnessSha: H("c"), ledgerReaders: pack.approvalsLedgerReaders });
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.rerun, ["harnessIntegrity", "approvals"]);
  assert.equal(plan.carried.length, names.length - 2);
});

test("py-alien: declares no ledger readers → refused by the declaration's name, never a guessed `approvals`", () => {
  const pack = alien.steps();
  const names = pack.stepsForProfile.local.map((fn) => stepDisplayName(fn) ?? fn().name);
  const previous = receiptOver(pack.stepsForProfile.local.map((fn) => fn().name), "harness_integrity");
  assert.equal(vouchingRow(previous.steps).name, "harness_integrity", "the vouching row is the one carrying `harness`, whatever it is called");
  const refused = planReattest({ previous, current, harnessSha: H("c"), ledgerReaders: pack.approvalsLedgerReaders });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /does not declare `approvalsLedgerReaders`/);
  assert.ok(names.length > 0);
});

test("py-alien with a reader of its own spelling: the core re-runs exactly what it is told", () => {
  const pack = alien.steps();
  const previous = receiptOver(pack.stepsForProfile.local.map((fn) => fn().name), "harness_integrity");
  const plan = planReattest({ previous, current, harnessSha: H("c"), ledgerReaders: ["spec_coverage"] });
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.rerun, ["harness_integrity", "spec_coverage"]);
  assert.deepEqual(plan.carried, ["py_build", "py_tests_fast", "py_tests_slow"]);
});

// ── The Stop rule (qa/lib/stop-rule.mjs) under both packs ───────────────────

function alienProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stop-alien-"));
  fs.mkdirSync(path.join(root, "qa/lib/profiles/py-alien"), { recursive: true });
  fs.copyFileSync(new URL("./fixtures/profiles/py-alien/index.mjs", import.meta.url), path.join(root, "qa/lib/profiles/py-alien/index.mjs"));
  assert.equal(writeHarnessManifest(root, manifestFor("py-alien")).ok, true);
  return root;
}

test("quickCheckStanding reads the receipt's own rows under either pack — the vouching row is found by its `harness` object", () => {
  const shapes = [
    { pack: "cmp", rows: [{ name: "harnessIntegrity", verdict: "PASS", durationMs: 9, harness: { status: "intact" } }, { name: "build", verdict: "PASS", durationMs: 9000 }] },
    { pack: "py-alien", rows: [{ name: "harness_integrity", verdict: "PASS", durationMs: 4, harness: { status: "intact" } }, { name: "py_build", verdict: "PASS", durationMs: 140 }] },
  ];
  for (const s of shapes) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stop-quick-"));
    try {
      fs.mkdirSync(path.join(root, "qa/evidence"), { recursive: true });
      const receipt = { schema: "prooflane-evidence/1", profile: "local", mode: "fast", verdict: "PASS", pack: { id: s.pack, version: null }, inputs: { hash: H("a"), fileCount: 2 }, steps: s.rows, generatedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(root, "qa/evidence/latest-fast.json"), JSON.stringify(receipt));
      assert.equal(quickCheckStanding(root, () => ({ hash: H("a") })).ok, true, `${s.pack}: a PASS quick receipt for this tree`);
      const stale = quickCheckStanding(root, () => ({ hash: H("b") }));
      assert.equal(stale.ok, false, `${s.pack}: another tree is refused`);
      assert.match(stale.detail, /source changed/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("featuresOwingFullLane: derived under the py-alien pack too — nothing open is in progress, and a closed plan tightens it the same way", () => {
  const root = alienProject();
  try {
    assert.deepEqual(featuresOwingFullLane(root), { ok: true, names: [], why: [] });
    fs.writeFileSync(
      path.join(root, "qa/.plan.json"),
      JSON.stringify({ title: "t", feature: "ingest", steps: [{ n: 1, label: "a", done: true }], current: 2 }),
    );
    const owing = featuresOwingFullLane(root);
    assert.deepEqual(owing.names, ["ingest"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
