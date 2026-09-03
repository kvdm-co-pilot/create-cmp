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
import { execFileSync } from "node:child_process";
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

// --- listReceiptHistory (§3.6: the committed receipt audit trail, from git) ---

/** Commit qa/evidence/latest.json with a given receipt at a given author date. */
function commitReceipt(root, receipt, { message, authorDate }) {
  writeReceipt(root, receipt);
  execFileSync("git", ["add", "qa/evidence/latest.json"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", message], {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, GIT_AUTHOR_DATE: authorDate, GIT_COMMITTER_DATE: authorDate },
  });
}

/** A git repo fixture with a fixed identity so author attribution is deterministic. */
function makeGitProject() {
  const root = makeFixtureProject({ withInputsHashLib: false });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "auditor@example.com"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Ada Auditor"], { cwd: root, stdio: "ignore" });
  return root;
}

test("listReceiptHistory: not a git repo (or receipt never committed) -> the standardized absence, never a fabricated trail", async () => {
  const { listReceiptHistory } = await import("../src/lib/receipt-bridge.mjs");
  const root = makeFixtureProject({ withInputsHashLib: false });
  try {
    writeReceipt(root, makeReceipt()); // on disk but no git history
    const history = listReceiptHistory(root);
    assert.equal(history.available, false);
    assert.match(history.reason, /no committed history|has no commits/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listReceiptHistory: reconstructs the committed audit trail from git — newest-first, each entry attributed (sha + author + date) with the verdict as attested at that commit", async () => {
  const { listReceiptHistory } = await import("../src/lib/receipt-bridge.mjs");
  const root = makeGitProject();
  try {
    commitReceipt(root, makeReceipt({ generatedAt: "2026-07-19T20:00:00.000Z" }), {
      message: "verify: pass",
      authorDate: "2026-07-19T20:00:00",
    });
    const failing = makeReceipt({ generatedAt: "2026-07-20T06:00:00.000Z" });
    failing.verdict = "FAIL";
    commitReceipt(root, failing, { message: "verify: fail", authorDate: "2026-07-20T06:00:00" });

    const history = listReceiptHistory(root);
    assert.equal(history.available, true);
    assert.equal(history.receipts.length, 2, "one entry per commit of latest.json");
    // Newest first: the FAIL commit leads.
    assert.equal(history.receipts[0].verdict, "FAIL", "verdict is what was attested AT that commit");
    assert.equal(history.receipts[1].verdict, "PASS");
    assert.equal(history.receipts[0].author, "Ada Auditor", "git author attribution carried through");
    assert.match(history.receipts[0].commitSha, /^[0-9a-f]{40}$/, "full commit sha");
    assert.match(history.receipts[0].file, /qa\/evidence\/latest\.json@[0-9a-f]{7}$/, "file cites the receipt at its commit");
    assert.equal(typeof history.receipts[0].ageMs, "number", "age from the commit date");
    assert.match(history.receipts[0].committedAt, /^2026-07-20T06:00:00/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listReceiptHistory: a commit whose latest.json is malformed is skipped, never fabricated into a verdict", async () => {
  const { listReceiptHistory } = await import("../src/lib/receipt-bridge.mjs");
  const root = makeGitProject();
  try {
    // First commit: a non-receipt blob at the path.
    fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa", "evidence", "latest.json"), "{ not json");
    execFileSync("git", ["add", "qa/evidence/latest.json"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "junk"], {
      cwd: root, stdio: "ignore",
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-07-18T00:00:00", GIT_COMMITTER_DATE: "2026-07-18T00:00:00" },
    });
    // Second commit: a real receipt.
    commitReceipt(root, makeReceipt({ generatedAt: "2026-07-19T00:00:00.000Z" }), {
      message: "verify: pass", authorDate: "2026-07-19T00:00:00",
    });
    const history = listReceiptHistory(root);
    assert.equal(history.available, true);
    assert.equal(history.receipts.length, 1, "the malformed commit is skipped, the real one kept");
    assert.equal(history.receipts[0].verdict, "PASS");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- evidenceLevel (the evidence ladder) — read verbatim, never re-derived ---

test("getLastReceipt: the receipt's evidenceLevel rung is exposed verbatim; absent/null/malformed all degrade to null (never fabricated)", async () => {
  const root = makeFixtureProject({ withInputsHashLib: false });
  try {
    // A rung as the lane wrote it — passed through untouched.
    const withRung = makeReceipt();
    withRung.evidenceLevel = { rung: "L2", name: "device", satisfiedBy: ["build", "unitTests", "e2eSmoke"] };
    writeReceipt(root, withRung);
    let result = await getLastReceipt(root);
    assert.deepEqual(result.evidenceLevel, { rung: "L2", name: "device", satisfiedBy: ["build", "unitTests", "e2eSmoke"] });

    // A FAILed lane records evidenceLevel null — the bridge reports null, no rung invented.
    const failed = makeReceipt();
    failed.verdict = "FAIL";
    failed.evidenceLevel = null;
    writeReceipt(root, failed);
    result = await getLastReceipt(root);
    assert.equal(result.evidenceLevel, null);

    // A pre-ladder receipt has no field at all — same honest null.
    writeReceipt(root, makeReceipt());
    result = await getLastReceipt(root);
    assert.equal(result.evidenceLevel, null);

    // A malformed field (not the lane's shape) is never rendered as a rung.
    const malformed = makeReceipt();
    malformed.evidenceLevel = { rung: 2 };
    writeReceipt(root, malformed);
    result = await getLastReceipt(root);
    assert.equal(result.evidenceLevel, null);
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listReceiptHistory: each committed entry carries the rung as attested AT that commit (null where the receipt had none)", async () => {
  const { listReceiptHistory } = await import("../src/lib/receipt-bridge.mjs");
  const root = makeGitProject();
  try {
    commitReceipt(root, makeReceipt({ generatedAt: "2026-08-01T10:00:00.000Z" }), {
      message: "verify: pre-ladder pass", authorDate: "2026-08-01T10:00:00",
    });
    const graded = makeReceipt({ generatedAt: "2026-08-02T10:00:00.000Z" });
    graded.evidenceLevel = { rung: "L1", name: "desktop", satisfiedBy: ["build", "unitTests"] };
    commitReceipt(root, graded, { message: "verify: graded pass", authorDate: "2026-08-02T10:00:00" });

    const history = listReceiptHistory(root);
    assert.equal(history.available, true);
    assert.equal(history.receipts[0].evidenceLevel.rung, "L1", "newest entry shows the rung it attested");
    assert.equal(history.receipts[0].evidenceLevel.name, "desktop");
    assert.equal(history.receipts[1].evidenceLevel, null, "a pre-ladder receipt stays rung-less, never upgraded");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── The receipt lives where the PROJECT says (qa/harness-manifest.json) ──────
// payment-blueprint writes qa/evidence/receipt.json in its own pb-evidence/1
// shape (inputsHash / gitSha / timestamp, flat) and the console said "no
// receipt at qa/evidence/latest.json" — Evidence pane, verdict history and
// audit trail all blind to a file ten characters away.
import { listReceiptHistory } from "../src/lib/receipt-bridge.mjs";

function pbReceipt({ hash = "cafe0001", steps } = {}) {
  return {
    schema: "pb-evidence/1",
    profile: "local",
    mode: "full",
    verdict: "PASS",
    gitSha: "0123456789abcdef0123456789abcdef01234567",
    inputsHash: hash,
    inputsFileCount: 487,
    steps: steps ?? [
      { name: "harnessIntegrity", verdict: "PASS", durationMs: 12, layer: "spine" },
      { name: "compositeBuild", verdict: "PASS", durationMs: 30000, layer: "backend" },
      { name: "gitleaks", verdict: "PASS", durationMs: 900, layer: "security" },
    ],
    toolVersions: { node: process.version },
    timestamp: new Date().toISOString(),
  };
}

test("manifest: the receipt is read from the declared path, and the flat pb-evidence/1 fields are read as the nested cmp-evidence/1 ones", async () => {
  const root = makeFixtureProject();
  try {
    fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), JSON.stringify({ receipt: "qa/evidence/receipt.json", packs: ["blueprint"] }));
    fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa", "evidence", "receipt.json"), JSON.stringify(pbReceipt()));
    const result = await getLastReceipt(root);
    assert.equal(result.available, true, result.reason);
    assert.equal(result.relPath, "qa/evidence/receipt.json");
    assert.equal(result.verdict, "PASS");
    assert.equal(result.commitSha, "0123456789abcdef0123456789abcdef01234567", "gitSha read as the commit");
    assert.equal(result.inputsHash, "cafe0001", "flat inputsHash read as inputs.hash");
    assert.equal(result.inputsFileCount, 487);
    assert.ok(typeof result.generatedAt === "string", "timestamp read as generatedAt");
    assert.ok(result.ageMs !== null && result.ageMs < 60_000);
    assert.equal(result.stale, true, "the fixture's hash is not the tree's — recomputed against the real algorithm, so STALE, never fresh by default");
    assert.deepEqual(
      result.steps.map((s) => s.layer),
      ["spine", "backend", "security"],
      "layer tags ride along verbatim",
    );
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("manifest: a missing receipt names the DECLARED path, and a malformed manifest is refused rather than defaulted", async () => {
  const root = makeFixtureProject();
  try {
    fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), JSON.stringify({ receipt: "qa/evidence/receipt.json" }));
    const missing = await getLastReceipt(root);
    assert.equal(missing.available, false);
    assert.equal(missing.relPath, "qa/evidence/receipt.json");
    assert.match(missing.reason, /no receipt at qa\/evidence\/receipt\.json/);

    // Now the default file exists but the manifest points elsewhere: the
    // console must NOT read latest.json — the project said where its receipt is.
    writeReceipt(root, makeReceipt());
    const stillMissing = await getLastReceipt(root);
    assert.equal(stillMissing.available, false, "latest.json is not this project's receipt");

    fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), JSON.stringify({ receipt: "../escape.json" }));
    const refused = await getLastReceipt(root);
    assert.equal(refused.available, false);
    assert.match(refused.reason, /qa\/harness-manifest\.json is malformed/);
    assert.match(refused.reason, /may not escape/);
    const history = listReceiptHistory(root);
    assert.equal(history.available, false);
    assert.match(history.reason, /malformed/);
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("manifest: the committed audit trail follows the declared path through git", () => {
  const root = makeFixtureProject();
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    fs.writeFileSync(path.join(root, "qa", "harness-manifest.json"), JSON.stringify({ receipt: "qa/evidence/receipt.json" }));
    fs.mkdirSync(path.join(root, "qa", "evidence"), { recursive: true });
    fs.writeFileSync(path.join(root, "qa", "evidence", "receipt.json"), JSON.stringify(pbReceipt({ hash: "a1" })));
    git("add", "-A");
    git("commit", "-q", "-m", "receipt 1");
    fs.writeFileSync(path.join(root, "qa", "evidence", "receipt.json"), JSON.stringify({ ...pbReceipt({ hash: "a2" }), verdict: "FAIL" }));
    git("add", "-A");
    git("commit", "-q", "-m", "receipt 2");
    const history = listReceiptHistory(root);
    assert.equal(history.available, true, history.reason);
    assert.equal(history.receipts.length, 2);
    assert.deepEqual(history.receipts.map((r) => r.verdict), ["FAIL", "PASS"], "newest first, verdict as attested at that commit");
    assert.match(history.receipts[0].file, /^qa\/evidence\/receipt\.json@[0-9a-f]{7}$/);
    assert.ok(typeof history.receipts[0].generatedAt === "string", "pb timestamp read as generatedAt");
  } finally {
    resetReceiptBridgeCache(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
