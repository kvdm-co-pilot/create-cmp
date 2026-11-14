// --reattest-approvals (qa/lib/reattest.mjs) and the approvals step's PASS
// over verified signatures — both ways, GATE-RULES Rule 0: the clean path
// re-attests and the receipt-check accepts it; every planted violation is
// refused BY NAME, and a refusal leaves the receipt it found untouched.
//
// The fixture is a REAL stamped project (verify: false — no Gradle) carrying a
// hand-built full-run receipt. That receipt stands in for the expensive tier:
// what is under test is the carry-forward, which re-runs only pure-Node steps,
// so the build/device rows it carries never need to have executed here. The
// end-to-end proof over a real lane run lives in the PR description.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { capLevel, mergeRows, onlyApprovalsChanged, planReattest } from "../packages/harness/src/lib/reattest.mjs";
import { checkDoneEvidence, checkFreshness, checkReattest } from "../packages/receipts/src/receipt-validate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIGNER = "Test Signer <test@example.com>";

// The local profile's rows, in lane order. Device rows PASS so the carried
// receipt is done-evidence (no environment SKIP) and grades to L2.
const LOCAL_ROWS = [
  "harnessIntegrity", "specCoverage", "approvals", "componentStories", "reachability", "e2eCoverage", "archDoc",
  "schemaHistory", "build", "unitTests", "conformance", "goldenTrees", "tokenDrift", "a11y", "releaseBuild",
  "webBuild", "e2eSmoke", "androidChecks",
];

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

/** A full-run PASS receipt for the tree as it stands — what a real lane run would have written. */
async function writeFullReceipt(dir, { level = { rung: "L2", name: "device", satisfiedBy: [] }, withoutDigest = false } = {}) {
  const { computeInputsHash } = await import(pathToFileURL(path.join(dir, "qa/lib/inputs-hash.mjs")));
  const { checkHarnessIntegrity } = await import(pathToFileURL(path.join(dir, "qa/lib/harness-lock.mjs")));
  const inputs = computeInputsHash(dir);
  const h = checkHarnessIntegrity(dir);
  const receipt = {
    schema: "prooflane-evidence/1",
    profile: "local",
    stage: "change",
    mode: "full",
    verdict: "PASS",
    commit: { sha: "abc1234def", dirty: [] },
    inputs: { hash: inputs.hash, fileCount: inputs.fileCount, ...(withoutDigest ? {} : { hashWithoutApprovals: inputs.hashWithoutApprovals }) },
    steps: LOCAL_ROWS.map((name) =>
      name === "harnessIntegrity"
        ? { name, verdict: "PASS", durationMs: 12, harness: h }
        : name === "approvals"
          ? { name, verdict: "SKIP", reason: "Governed artifacts awaiting human approval", durationMs: 3 }
          : { name, verdict: "PASS", durationMs: 1000 },
    ),
    harness: { name: h.name, version: h.version, sha256: h.sha256, status: h.status, intact: h.status === "intact" },
    pack: { id: "cmp", version: null },
    strength: { onDeviceSteps: ["tokenDrift", "e2eSmoke", "androidChecks"] },
    evidenceLevel: level,
    artifacts: [{ path: "qa-artifacts/app-release.apk", sha256: "0".repeat(64) }],
    toolVersions: { node: process.version, platform: `${process.platform}-${process.arch}` },
    generatedAt: new Date(Date.now() - 60_000).toISOString(),
  };
  fs.mkdirSync(path.join(dir, "qa/evidence"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa/evidence/latest.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

const node = (dir, args, env = {}) =>
  spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8", env: { ...process.env, CI: "", ...env } });
const readReceipt = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "qa/evidence/latest.json"), "utf8"));
const approve = (dir, id) => execFileSync(process.execPath, ["qa/approve.mjs", id, "--as", SIGNER], { cwd: dir, encoding: "utf8" });

// ── The clean path ──────────────────────────────────────────────────────────

test("sign → receipt-check names the re-attest → re-attest PASSes in seconds → receipt-check and the Stop hook accept it", async () => {
  const dir = await stamp("cmp-reattest-clean-");
  try {
    const full = await writeFullReceipt(dir);
    assert.equal(node(dir, ["qa/receipt-check.mjs"]).status, 0, "the hand-built full receipt binds the fresh tree");

    const signed = approve(dir, "design-system");
    assert.match(signed, /--reattest-approvals/, "a signature that only moved the ledger names the fast way back");

    const stale = node(dir, ["qa/receipt-check.mjs"]);
    assert.equal(stale.status, 1, "a signature still invalidates the receipt — the binding is not weakened");
    assert.match(stale.stderr, /only qa\/approvals\.json changed/);
    assert.match(stale.stderr, /--reattest-approvals/);
    const hookStale = spawnSync(process.execPath, ["qa/receipt-check.mjs", "--hook"], { cwd: dir, input: "{}", encoding: "utf8" });
    assert.equal(hookStale.status, 2);
    assert.match(hookStale.stderr, /--reattest-approvals/, "the Stop hook's instruction is the re-attest, not the whole lane");

    const started = Date.now();
    const run = node(dir, ["qa/verify.mjs", "--reattest-approvals"]);
    const tookMs = Date.now() - started;
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /RE-ATTESTED — approvals only/);
    assert.ok(tookMs < 30_000, `a re-attest is seconds, not a lane (${tookMs}ms)`);

    const r = readReceipt(dir);
    assert.equal(r.mode, "full");
    assert.equal(r.verdict, "PASS");
    assert.deepEqual(r.reattest.rerun, ["harnessIntegrity", "approvals"]);
    assert.equal(r.reattest.carriedForward.length, LOCAL_ROWS.length - 2);
    assert.equal(r.reattest.from.inputsHash, full.inputs.hash, "names the full run the rows came from");
    assert.equal(r.reattest.from.generatedAt, full.generatedAt);
    assert.equal(r.reattest.from.commit, "abc1234def");
    assert.deepEqual(r.steps.map((s) => s.name), LOCAL_ROWS, "same rows, same order");
    for (const s of r.steps) {
      if (r.reattest.rerun.includes(s.name)) assert.equal(s.carriedForward, undefined, `${s.name} ran now`);
      else assert.equal(s.carriedForward, true, `${s.name} is marked carried`);
    }
    const approvalsRow = r.steps.find((s) => s.name === "approvals");
    assert.equal(approvalsRow.verdict, "PASS", "the one signature is verified, the rest are a note");
    assert.deepEqual(approvalsRow.details.verified, ["design-system"]);
    assert.match(approvalsRow.note, /1 signature\(s\) verified; 5 artifact\(s\) awaiting approval/);
    assert.equal(r.evidenceLevel.rung, full.evidenceLevel.rung, "the rung is the carried run's");
    assert.deepEqual(r.artifacts, full.artifacts, "the artifacts are the ones the carried rows were proven with");
    assert.equal(r.inputs.hashWithoutApprovals, full.inputs.hashWithoutApprovals);
    assert.notEqual(r.inputs.hash, full.inputs.hash);

    const ok = node(dir, ["qa/receipt-check.mjs"]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /re-attested after a signature: re-ran harnessIntegrity, approvals; 16 step\(s\) carried/);
    const hook = spawnSync(process.execPath, ["qa/receipt-check.mjs", "--hook"], { cwd: dir, input: "{}", encoding: "utf8" });
    assert.equal(hook.status, 0, `the Stop hook accepts the re-attested receipt: ${hook.stderr}`);
    assert.equal(checkDoneEvidence(r).ok, true, "and so does the shared done-evidence library the notary calls");

    const journal = fs.readFileSync(path.join(dir, "qa/flight-recorder.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const last = journal.at(-1);
    assert.equal(last.mode, "reattest");
    assert.deepEqual(last.steps.map((s) => s.name), ["harnessIntegrity", "approvals"], "only the rows that ran are journalled");

    // A second signature carries from the ORIGINAL full run, not the re-attest.
    approve(dir, "architecture");
    assert.equal(node(dir, ["qa/verify.mjs", "--reattest-approvals"]).status, 0);
    const r2 = readReceipt(dir);
    assert.equal(r2.reattest.from.inputsHash, full.inputs.hash);
    assert.equal(r2.reattest.replaced.inputsHash, r.inputs.hash);
    assert.equal(node(dir, ["qa/receipt-check.mjs"]).status, 0);

    // Nothing changed since → nothing to do, nothing written.
    const before = fs.readFileSync(path.join(dir, "qa/evidence/latest.json"), "utf8");
    const noop = node(dir, ["qa/verify.mjs", "--reattest-approvals"]);
    assert.equal(noop.status, 0);
    assert.match(noop.stdout, /already attests this tree/);
    assert.equal(fs.readFileSync(path.join(dir, "qa/evidence/latest.json"), "utf8"), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Planted violations — each refused by name, receipt untouched ─────────────

async function refusedUntouched(t, { prefix, plant, env = {}, args = [], expect }) {
  const dir = await stamp(prefix);
  try {
    await writeFullReceipt(dir, plant.receiptOpts ?? {});
    plant.after?.(dir);
    const before = fs.readFileSync(path.join(dir, "qa/evidence/latest.json"), "utf8");
    const run = node(dir, ["qa/verify.mjs", "--reattest-approvals", ...args], env);
    assert.equal(run.status, 2, `refused, not run: ${run.stdout}${run.stderr}`);
    assert.match(run.stderr, expect);
    assert.equal(fs.readFileSync(path.join(dir, "qa/evidence/latest.json"), "utf8"), before, "a refusal writes nothing");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("PLANT: a source file changed besides the ledger → refused, full lane named", async (t) => {
  await refusedUntouched(t, {
    prefix: "cmp-reattest-src-",
    plant: {
      after: (dir) => {
        approve(dir, "design-system");
        fs.appendFileSync(path.join(dir, "specs/app-base.spec.md"), "\n<!-- a code change hiding behind a signature -->\n");
      },
    },
    expect: /files other than qa\/approvals\.json changed/,
  });
});

test("PLANT: the lane's own code changed → refused", async (t) => {
  await refusedUntouched(t, {
    prefix: "cmp-reattest-lane-",
    plant: {
      after: (dir) => {
        approve(dir, "design-system");
        // Rewrite the carried receipt's harness digest, as if a different lane issued it.
        const p = path.join(dir, "qa/evidence/latest.json");
        const r = JSON.parse(fs.readFileSync(p, "utf8"));
        r.harness.sha256 = "f".repeat(64);
        fs.writeFileSync(p, JSON.stringify(r));
      },
    },
    expect: /lane's own code differs/,
  });
});

test("PLANT: a receipt from before hashWithoutApprovals → refused (one full run first)", async (t) => {
  await refusedUntouched(t, {
    prefix: "cmp-reattest-old-",
    plant: { receiptOpts: { withoutDigest: true }, after: (dir) => approve(dir, "design-system") },
    expect: /predates `inputs\.hashWithoutApprovals`/,
  });
});

test("PLANT: CI → refused; CI re-runs the full lane", async (t) => {
  await refusedUntouched(t, {
    prefix: "cmp-reattest-ci-",
    plant: { after: (dir) => approve(dir, "design-system") },
    env: { CI: "true" },
    expect: /refused under CI/,
  });
});

test("PLANT: the carried receipt has an environment SKIP → refused (it would launder it)", async (t) => {
  await refusedUntouched(t, {
    prefix: "cmp-reattest-env-",
    plant: {
      after: (dir) => {
        const p = path.join(dir, "qa/evidence/latest.json");
        const r = JSON.parse(fs.readFileSync(p, "utf8"));
        const row = r.steps.find((s) => s.name === "androidChecks");
        Object.assign(row, { verdict: "SKIP", skipKind: "environment", reason: "CMP_DEVICE=none" });
        fs.writeFileSync(p, JSON.stringify(r));
        approve(dir, "design-system");
      },
    },
    expect: /not done-evidence itself/,
  });
});

test("PLANT: a different --profile than the receipt ran → refused", async (t) => {
  await refusedUntouched(t, {
    prefix: "cmp-reattest-prof-",
    plant: { after: (dir) => approve(dir, "design-system") },
    args: ["--profile", "release"],
    expect: /differs from the receipt's profile "local"/,
  });
});

test("PLANT: --reattest-approvals with --fast → refused before anything runs", async () => {
  const dir = await stamp("cmp-reattest-fast-");
  try {
    const run = node(dir, ["qa/verify.mjs", "--reattest-approvals", "--fast"]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /cannot be combined with --fast/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: a stale signature in the ledger → the re-attest runs, the approvals step FAILs it, and no rung survives", async () => {
  const dir = await stamp("cmp-reattest-stale-");
  try {
    approve(dir, "design-system");
    await writeFullReceipt(dir);
    // A ledger-only edit: the signed hash no longer matches the artifact.
    const p = path.join(dir, "qa/approvals.json");
    const ledger = JSON.parse(fs.readFileSync(p, "utf8"));
    ledger.artifacts.find((a) => a.artifact === "design-system").hash = "0".repeat(64);
    fs.writeFileSync(p, JSON.stringify(ledger, null, 2));
    const run = node(dir, ["qa/verify.mjs", "--reattest-approvals"]);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const r = readReceipt(dir);
    assert.equal(r.verdict, "FAIL");
    assert.equal(r.evidenceLevel, null, "a FAIL has no rung — a re-attest can lose one");
    assert.equal(r.steps.find((s) => s.name === "approvals").verdict, "FAIL");
    assert.match(r.steps.find((s) => s.name === "approvals").reason, /\[design-system\]/);
    assert.equal(node(dir, ["qa/receipt-check.mjs"]).status, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: a carried receipt at a LOWER rung than its rows would grade → the re-attest keeps the lower rung (never up)", async () => {
  const dir = await stamp("cmp-reattest-cap-");
  try {
    await writeFullReceipt(dir, { level: { rung: "L1", name: "desktop", satisfiedBy: [] } });
    approve(dir, "design-system");
    assert.equal(node(dir, ["qa/verify.mjs", "--reattest-approvals"]).status, 0);
    assert.equal(readReceipt(dir).evidenceLevel.rung, "L1", "the rows grade L2, the carried receipt held L1 — L1 it stays");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PLANT: a re-attested receipt edited to pass a carried row off as fresh → receipt-check refuses it by name", async () => {
  const dir = await stamp("cmp-reattest-forge-");
  try {
    await writeFullReceipt(dir);
    approve(dir, "design-system");
    assert.equal(node(dir, ["qa/verify.mjs", "--reattest-approvals"]).status, 0);
    const p = path.join(dir, "qa/evidence/latest.json");
    const r = JSON.parse(fs.readFileSync(p, "utf8"));
    delete r.steps.find((s) => s.name === "releaseBuild").carriedForward;
    fs.writeFileSync(p, JSON.stringify(r));
    const check = node(dir, ["qa/receipt-check.mjs"]);
    assert.equal(check.status, 1);
    assert.match(check.stderr, /re-attested receipt is malformed: releaseBuild is listed as carried forward but its row is not marked so/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── The approvals step on its own (item 2) ───────────────────────────────────

test("approvals gate: signed + pending → PASS naming the verified signatures; nothing signed → SKIP; one stale among pending → FAIL", async () => {
  const dir = await stamp("cmp-reattest-gate-");
  try {
    const { evaluateApprovalsGate } = await import(pathToFileURL(path.join(dir, "qa/lib/approvals.mjs")));
    assert.equal(evaluateApprovalsGate(dir).verdict, "SKIP", "nothing signed: nothing to verify");

    approve(dir, "design-system");
    approve(dir, "architecture");
    const g = evaluateApprovalsGate(dir);
    assert.equal(g.verdict, "PASS", "two signatures verified while four are pending — the row says what was checked");
    assert.match(g.note, /2 signature\(s\) verified; 4 artifact\(s\) awaiting approval/);
    assert.match(g.reason, /\[intent\] .* unreviewed/, "the pending ones are still named");

    fs.appendFileSync(path.join(dir, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/theme/Theme.kt"), "\n// drift after sign-off\n");
    const stale = evaluateApprovalsGate(dir);
    assert.equal(stale.verdict, "FAIL", "a stale signature FAILs even while other artifacts are still pending");
    assert.match(stale.reason, /\[design-system\]/);
    assert.doesNotMatch(stale.reason, /\[intent\]/, "the FAIL names the drifted signature, not the pending work");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── The pure decisions ───────────────────────────────────────────────────────

const HASH = (c) => c.repeat(64);
function prev(over = {}) {
  return {
    profile: "local", mode: "full", verdict: "PASS", generatedAt: "2026-11-14T10:00:00.000Z", commit: { sha: "abc" },
    inputs: { hash: HASH("a"), hashWithoutApprovals: HASH("b") },
    harness: { sha256: HASH("c") },
    steps: [{ name: "harnessIntegrity", verdict: "PASS", durationMs: 1, harness: {} }, { name: "approvals", verdict: "SKIP", durationMs: 1 }, { name: "build", verdict: "PASS", durationMs: 9 }],
    ...over,
  };
}
const plan = (over = {}) =>
  planReattest({ previous: prev(), current: { hash: HASH("d"), hashWithoutApprovals: HASH("b") }, harnessSha: HASH("c"), ledgerReaders: ["approvals"], ...over });

test("planReattest: the clean plan, and every refusal by name", () => {
  const ok = plan();
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.rerun, ["harnessIntegrity", "approvals"]);
  assert.deepEqual(ok.carried, ["build"]);
  assert.deepEqual(ok.from, { inputsHash: HASH("a"), hashWithoutApprovals: HASH("b"), generatedAt: "2026-11-14T10:00:00.000Z", commit: "abc" });

  const cases = [
    [{ ledgerReaders: undefined }, /does not declare `approvalsLedgerReaders`/],
    [{ ledgerReaders: [] }, /does not declare/],
    [{ previous: null }, /no receipt to carry forward/],
    [{ previous: prev({ verdict: "FAIL" }) }, /only a PASS can be carried/],
    [{ previous: prev({ mode: "fast" }) }, /only a full run can be carried/],
    [{ previous: prev({ profile: "smoke" }) }, /not done-evidence itself/],
    [{ previous: prev({ inputs: { hash: HASH("a") } }) }, /predates `inputs\.hashWithoutApprovals`/],
    [{ current: { hash: HASH("d"), hashWithoutApprovals: HASH("e") } }, /files other than qa\/approvals\.json changed/],
    [{ harnessSha: HASH("9") }, /lane's own code differs/],
    [{ requestedProfile: "ci" }, /differs from the receipt's profile/],
    [{ ci: true }, /refused under CI/],
    [{ ledgerReaders: ["ledgerAudit"] }, /no row for ledgerAudit/],
  ];
  for (const [over, re] of cases) {
    const r = plan(over);
    assert.equal(r.ok, false, `refused: ${re}`);
    assert.match(r.reason, re);
  }
  const noop = plan({ current: { hash: HASH("a"), hashWithoutApprovals: HASH("b") } });
  assert.equal(noop.noop, true);
});

test("capLevel never raises; mergeRows marks every carried row and replaces only the re-run ones", () => {
  const L = (rung) => ({ rung, name: rung });
  assert.equal(capLevel(L("L2"), L("L1")).rung, "L1");
  assert.equal(capLevel(L("L1"), L("L2")).rung, "L1");
  assert.equal(capLevel(null, L("L2")), null);
  assert.equal(capLevel(L("L2"), null), null);

  const merged = mergeRows(prev().steps, [{ name: "approvals", verdict: "PASS", durationMs: 2 }], ["harnessIntegrity", "approvals"]);
  assert.deepEqual(merged.map((s) => [s.name, s.verdict, s.carriedForward]), [
    ["harnessIntegrity", "ERROR", undefined],
    ["approvals", "PASS", undefined],
    ["build", "PASS", true],
  ], "a declared re-run step that produced no row is an ERROR, never a carried PASS");
});

test("checkReattest refuses every incoherent account; freshness is judged by the carried run", () => {
  const good = {
    inputs: { hash: HASH("d"), hashWithoutApprovals: HASH("b") },
    steps: [{ name: "approvals", verdict: "PASS" }, { name: "build", verdict: "PASS", carriedForward: true }],
    reattest: { kind: "approvals-only", rerun: ["approvals"], carriedForward: ["build"], from: { inputsHash: HASH("a"), hashWithoutApprovals: HASH("b"), generatedAt: "2026-10-01T00:00:00Z" } },
    generatedAt: "2026-11-14T00:00:00Z",
  };
  assert.equal(checkReattest(good).ok, true);
  assert.equal(checkReattest({ steps: [] }).ok, true, "a full-run receipt has nothing to check");
  const variants = [
    [(r) => (r.reattest.kind = "everything"), /unknown re-attest kind/],
    [(r) => (r.reattest.rerun = []), /names no step it re-ran/],
    [(r) => (r.reattest.carriedForward = ["build", "approvals"]), /both re-run and carried/],
    [(r) => (r.reattest.carriedForward = []), /neither re-run nor carried/],
    [(r) => (r.reattest.carriedForward = ["build", "ghost"]), /listed but have no row/],
    [(r) => delete r.steps[1].carriedForward, /not marked so/],
    [(r) => (r.steps[0].carriedForward = true), /marked carried forward but listed as re-run/],
    [(r) => (r.reattest.from = null), /does not name the run/],
    [(r) => (r.inputs.hashWithoutApprovals = HASH("e")), /differs from the run it carried from/],
  ];
  for (const [mutate, re] of variants) {
    const r = structuredClone(good);
    mutate(r);
    const res = checkReattest(r);
    assert.equal(res.ok, false, String(re));
    assert.match(res.detail, re);
    assert.equal(checkDoneEvidence(r).refusal, "reattest-malformed");
  }
  const fresh = checkFreshness(good, { now: Date.parse("2026-11-14T00:00:00Z"), maxAgeMs: 30 * 86_400_000 });
  assert.equal(fresh.ok, false, "44-day-old carried rows are stale whatever the re-attest's own timestamp says");
  assert.ok(fresh.ageMs > 40 * 86_400_000);
});

test("onlyApprovalsChanged: offered only when the ledger is the sole difference from a PASS", () => {
  const r = prev();
  assert.equal(onlyApprovalsChanged(r, { hash: HASH("d"), hashWithoutApprovals: HASH("b") }), true);
  assert.equal(onlyApprovalsChanged(r, { hash: HASH("a"), hashWithoutApprovals: HASH("b") }), false, "nothing changed");
  assert.equal(onlyApprovalsChanged(r, { hash: HASH("d"), hashWithoutApprovals: HASH("e") }), false, "code changed too");
  assert.equal(onlyApprovalsChanged(prev({ verdict: "FAIL" }), { hash: HASH("d"), hashWithoutApprovals: HASH("b") }), false);
  assert.equal(onlyApprovalsChanged(prev({ inputs: { hash: HASH("a") } }), { hash: HASH("d"), hashWithoutApprovals: HASH("b") }), false);
});

test("the cmp pack declares exactly the steps whose inputs include the ledger", async () => {
  const src = fs.readFileSync(path.join(ROOT, "packages/harness/src/lib/profiles/cmp/steps-cmp.mjs"), "utf8");
  assert.match(src, /approvalsLedgerReaders: Object\.entries\(MEMOIZED_STEP_INPUTS\)/, "derived from the read surface the step cache already declares");
});
