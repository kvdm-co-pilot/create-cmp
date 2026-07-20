// receipt-bridge.mjs — reads a generated project's own qa/evidence/latest.json
// (written by qa/verify.mjs) and answers, per Wave C item 1 (architecture-
// document-standard.md §6): does a receipt exist, what did the "conformance"
// step (the *ArchitectureConformanceTest gate enforcing the ARCH-* clauses)
// verdict, how old is it, and is it still bound to the CURRENT tree (recomputed
// via the project's own qa/lib/inputs-hash.mjs, the exact algorithm the lane
// itself used)? Every case degrades honestly — no receipt, a malformed one, a
// hash mismatch — instead of fabricating a status.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getLastReceipt, resetReceiptBridgeCache, RECEIPT_REL_PATH } from "../src/lib/receipt-bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_INPUTS_HASH_LIB = path.join(HERE, "..", "..", "..", "template", "qa", "lib", "inputs-hash.mjs");

/** A minimal generated-project fixture: a real qa/lib/inputs-hash.mjs (copied verbatim from the template, so the SAME algorithm the lane runs is what staleness is checked against) plus a couple of files under the verified surface. */
function makeFixtureProject({ withInputsHashLib = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-receipt-bridge-"));
  fs.mkdirSync(path.join(root, "composeApp", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "composeApp", "src", "Marker.kt"), "object Marker\n");
  fs.mkdirSync(path.join(root, "specs"), { recursive: true });
  fs.writeFileSync(path.join(root, "specs", "app-base.spec.md"), "# Spec: app-base\n\n- **ARCH-01** — Given X, Then Y.\n");
  const libDir = path.join(root, "qa", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  if (withInputsHashLib) fs.copyFileSync(REAL_INPUTS_HASH_LIB, path.join(libDir, "inputs-hash.mjs"));
  return root;
}

function writeReceipt(root, receipt) {
  const evidenceDir = path.join(root, "qa", "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "latest.json"), JSON.stringify(receipt, null, 2));
}

/** A structurally valid receipt (cmp-evidence/1 shape) with a given inputs.hash and steps[]. */
function makeReceipt({ hash = "deadbeef", steps = [{ name: "conformance", verdict: "PASS", durationMs: 4210 }], generatedAt = new Date().toISOString() } = {}) {
  return {
    schema: "cmp-evidence/1",
    profile: "local",
    verdict: "PASS",
    commit: { sha: "abc123", dirty: [] },
    inputs: { hash, fileCount: 3 },
    steps,
    artifacts: [],
    toolVersions: { node: process.version, platform: "darwin-arm64" },
    generatedAt,
  };
}

test("getLastReceipt: no receipt on disk -> honest 'run node qa/verify.mjs', never fabricated", async () => {
  const root = makeFixtureProject();
  try {
    const result = await getLastReceipt(root);
    assert.equal(result.available, false);
    assert.match(result.reason, new RegExp(RECEIPT_REL_PATH.replace(/\//g, "\\/")));
    assert.match(result.reason, /run node qa\/verify\.mjs/);
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLastReceipt: malformed JSON -> honest parse failure, never a fabricated verdict", async () => {
  const root = makeFixtureProject();
  try {
    fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa", "evidence", "latest.json"), "{ not valid json ");
    const result = await getLastReceipt(root);
    assert.equal(result.available, false);
    assert.match(result.reason, /could not be parsed/);
    assert.match(result.reason, /run node qa\/verify\.mjs/);
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLastReceipt: valid JSON but not a recognizable receipt (no steps[]) -> honest reason, not a crash", async () => {
  const root = makeFixtureProject();
  try {
    writeReceipt(root, { schema: "cmp-evidence/1" }); // no steps array
    const result = await getLastReceipt(root);
    assert.equal(result.available, false);
    assert.match(result.reason, /not a recognizable evidence receipt/);
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLastReceipt: fresh receipt — inputsHash matches the current tree -> stale:false, real conformance verdict, computed age", async () => {
  const root = makeFixtureProject();
  try {
    const { computeInputsHash } = await import(pathToFileURL(path.join(root, "qa", "lib", "inputs-hash.mjs")).href);
    const { hash } = computeInputsHash(root);
    const generatedAt = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // 90 minutes ago
    writeReceipt(root, makeReceipt({ hash, generatedAt }));

    const result = await getLastReceipt(root);
    assert.equal(result.available, true);
    assert.equal(result.stale, false);
    assert.equal(result.conformance.verdict, "PASS");
    assert.equal(result.inputsHash, hash);
    assert.equal(result.currentInputsHash, hash);
    assert.ok(result.ageMs >= 89 * 60 * 1000, "age reflects the real elapsed time since generatedAt");
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLastReceipt: stale receipt — inputsHash no longer matches the current tree after a source edit -> stale:true, old PASS never presented as current", async () => {
  const root = makeFixtureProject();
  try {
    const { computeInputsHash } = await import(pathToFileURL(path.join(root, "qa", "lib", "inputs-hash.mjs")).href);
    const { hash: hashAtReceiptTime } = computeInputsHash(root);
    writeReceipt(root, makeReceipt({ hash: hashAtReceiptTime }));

    // Source changes AFTER the receipt was written — the committed receipt now
    // attests a tree state that no longer exists.
    fs.appendFileSync(path.join(root, "specs", "app-base.spec.md"), "\n- **ARCH-02** — Given Z, Then W.\n");

    const result = await getLastReceipt(root);
    assert.equal(result.available, true);
    assert.equal(result.stale, true);
    assert.notEqual(result.currentInputsHash, result.inputsHash);
    // The conformance verdict is still reported (callers decide how to label a
    // stale PASS), but stale:true is the signal a renderer must key off of.
    assert.equal(result.conformance.verdict, "PASS");
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLastReceipt: receipt predates evidence binding (no inputs.hash) -> stale:null (unknown), not fabricated fresh or stale", async () => {
  const root = makeFixtureProject();
  try {
    const receipt = makeReceipt();
    delete receipt.inputs;
    writeReceipt(root, receipt);
    const result = await getLastReceipt(root);
    assert.equal(result.available, true);
    assert.equal(result.stale, null);
    assert.match(result.staleReason, /predates evidence binding/);
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLastReceipt: no qa/lib/inputs-hash.mjs in the project (older scaffold) -> stale:null (unknown), never defaults to fresh", async () => {
  const root = makeFixtureProject({ withInputsHashLib: false });
  try {
    writeReceipt(root, makeReceipt({ hash: "whatever" }));
    const result = await getLastReceipt(root);
    assert.equal(result.available, true);
    assert.equal(result.stale, null);
    assert.match(result.staleReason, /not found or failed to load/);
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLastReceipt: receipt has no 'conformance' step (e.g. a scaffold-profile run) -> conformance:null, not fabricated", async () => {
  const root = makeFixtureProject();
  try {
    const { computeInputsHash } = await import(pathToFileURL(path.join(root, "qa", "lib", "inputs-hash.mjs")).href);
    const { hash } = computeInputsHash(root);
    writeReceipt(root, makeReceipt({ hash, steps: [{ name: "specCoverage", verdict: "PASS", durationMs: 12 }] }));
    const result = await getLastReceipt(root);
    assert.equal(result.available, true);
    assert.equal(result.conformance, null);
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getLastReceipt: reads fresh off disk every call — a re-run's new receipt is picked up without any cache reset", async () => {
  const root = makeFixtureProject();
  try {
    const { computeInputsHash } = await import(pathToFileURL(path.join(root, "qa", "lib", "inputs-hash.mjs")).href);
    const { hash } = computeInputsHash(root);
    writeReceipt(root, makeReceipt({ hash, steps: [{ name: "conformance", verdict: "FAIL", durationMs: 999, reason: "ARCH-01 violated" }] }));
    const first = await getLastReceipt(root);
    assert.equal(first.conformance.verdict, "FAIL");

    writeReceipt(root, makeReceipt({ hash, steps: [{ name: "conformance", verdict: "PASS", durationMs: 500 }] }));
    const second = await getLastReceipt(root);
    assert.equal(second.conformance.verdict, "PASS");
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- §3.6 Evidence exposure: the full step list + receipt facts --------------

test("getLastReceipt: exposes the receipt's own steps[], profile, commit, and inputs fileCount verbatim — the Evidence page's whole source", async () => {
  const root = makeFixtureProject({ withInputsHashLib: false });
  try {
    writeReceipt(
      root,
      makeReceipt({
        steps: [
          { name: "specCoverage", verdict: "PASS", durationMs: 40 },
          { name: "e2eSmoke", verdict: "SKIP", reason: "no Android device/emulator attached (adb)", durationMs: 0 },
          "not-an-object-entry",
        ],
      }),
    );
    const result = await getLastReceipt(root);
    assert.equal(result.available, true);
    assert.equal(result.profile, "local");
    assert.equal(result.commitSha, "abc123");
    assert.deepEqual(result.commitDirty, []);
    assert.equal(result.inputsFileCount, 3);
    assert.equal(result.steps.length, 2, "non-object steps[] entries are dropped, not guessed at");
    assert.deepEqual(result.steps[0], { name: "specCoverage", verdict: "PASS", reason: undefined, durationMs: 40 });
    assert.equal(result.steps[1].reason, "no Android device/emulator attached (adb)", "SKIP reasons survive the bridge");
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- listReceiptHistory (§3.6 timeline source) -------------------------------

test("listReceiptHistory: only latest.json (+schema.json) on disk -> the standardized 'no receipt history' absence, never a fabricated timeline", async () => {
  const { listReceiptHistory } = await import("../src/lib/receipt-bridge.mjs");
  const root = makeFixtureProject({ withInputsHashLib: false });
  try {
    writeReceipt(root, makeReceipt());
    fs.writeFileSync(path.join(root, "qa", "evidence", "schema.json"), "{}");
    const history = listReceiptHistory(root);
    assert.equal(history.available, false);
    assert.match(history.reason, /no receipt history yet/);
    assert.equal(listReceiptHistory(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-no-evidence-"))).available, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listReceiptHistory: reads the lane's qa/evidence/history/ archive newest-first, carrying each receipt's commit sha", async () => {
  const { listReceiptHistory } = await import("../src/lib/receipt-bridge.mjs");
  const root = makeFixtureProject({ withInputsHashLib: false });
  try {
    const historyDir = path.join(root, "qa", "evidence", "history");
    fs.mkdirSync(historyDir, { recursive: true });
    // The lane writes sanitized-timestamp filenames; content carries generatedAt + commit.sha.
    const a = makeReceipt({ generatedAt: "2026-07-19T20:00:00.000Z" });
    a.commit = { sha: "aaaaaaa1111", dirty: [] };
    const b = makeReceipt({ generatedAt: "2026-07-20T06:00:00.000Z" });
    b.verdict = "FAIL";
    b.commit = { sha: "bbbbbbb2222", dirty: [] };
    fs.writeFileSync(path.join(historyDir, "2026-07-19T20-00-00-000Z-PASS-aaaaaaa.json"), JSON.stringify(a));
    fs.writeFileSync(path.join(historyDir, "2026-07-20T06-00-00-000Z-FAIL-bbbbbbb.json"), JSON.stringify(b));
    fs.writeFileSync(path.join(historyDir, "broken.json"), "{ nope");
    const history = listReceiptHistory(root);
    assert.equal(history.available, true);
    assert.deepEqual(
      history.receipts.map((r) => r.file),
      ["qa/evidence/history/2026-07-20T06-00-00-000Z-FAIL-bbbbbbb.json", "qa/evidence/history/2026-07-19T20-00-00-000Z-PASS-aaaaaaa.json"],
      "newest first, from the history subdir",
    );
    assert.equal(history.receipts[0].verdict, "FAIL");
    assert.equal(history.receipts[0].commitSha, "bbbbbbb2222", "commit sha carried through for the timeline");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listReceiptHistory: extra receipt files list newest-first with their own facts; non-receipt json is skipped, not guessed at", async () => {
  const { listReceiptHistory } = await import("../src/lib/receipt-bridge.mjs");
  const root = makeFixtureProject({ withInputsHashLib: false });
  try {
    const evidenceDir = path.join(root, "qa", "evidence");
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "older.json"), JSON.stringify(makeReceipt({ generatedAt: "2026-07-18T20:00:00.000Z" })));
    const newer = makeReceipt({ generatedAt: "2026-07-19T05:00:00.000Z" });
    newer.verdict = "FAIL";
    fs.writeFileSync(path.join(evidenceDir, "newer.json"), JSON.stringify(newer));
    fs.writeFileSync(path.join(evidenceDir, "notes.json"), JSON.stringify({ hello: "not a receipt" }));
    fs.writeFileSync(path.join(evidenceDir, "broken.json"), "{ nope");
    const history = listReceiptHistory(root);
    assert.equal(history.available, true);
    assert.deepEqual(
      history.receipts.map((r) => r.file),
      ["qa/evidence/newer.json", "qa/evidence/older.json"],
      "newest first",
    );
    assert.equal(history.receipts[0].verdict, "FAIL");
    assert.equal(history.receipts[0].profile, "local");
    assert.equal(typeof history.receipts[0].ageMs, "number");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
