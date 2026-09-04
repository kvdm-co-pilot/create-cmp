// Unit tests for the prooflane-receipts predicate + service-grade checks.
// Discovered by the repo root's `node --test` and runnable standalone via
// `npm test` inside packages/receipts/.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SURFACE_CONFIG_REL, defaultSurface, computeInputsHash, resolveVerifiedSurface } from "../src/inputs-hash.mjs";
import {
  evaluateReceipt,
  readReceipt,
  checkFreshness,
  checkExecutionPlausibility,
  listSkippedSteps,
  validateReceiptForTree,
  RECEIPT_REL_PATH,
} from "../src/receipt-validate.mjs";

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** Minimal harness-shaped tree whose inputs hash we can really compute. */
function makeTree(root) {
  write(root, "composeApp/src/commonMain/kotlin/Main.kt", "fun main() {}\n");
  write(root, "specs/app-base.spec.md", "## [BASE-01] Given/When/Then\n");
  write(root, "qa/verify.mjs", "// lane stub\n");
  write(root, "gradle/libs.versions.toml", '[versions]\nkotlin = "2.2.20"\n');
  write(root, "build.gradle.kts", "// root\n");
  write(root, "settings.gradle.kts", 'rootProject.name = "fake"\n');
  write(root, "gradle.properties", "org.gradle.jvmargs=-Xmx2g\n");
}

function makeReceipt(root, overrides = {}) {
  const { hash, fileCount } = computeInputsHash(root);
  return {
    schema: "cmp-evidence/1",
    profile: "local",
    verdict: "PASS",
    commit: { sha: null, dirty: [] },
    inputs: { hash, fileCount },
    steps: [
      // A real lane's first row: the harness vouching for its own code. Fixtures
      // that omitted it were modelling a receipt no lane produces, and
      // checkLaneVouching now says so.
      { name: "harnessIntegrity", verdict: "PASS", durationMs: 12 },
      { name: "specCoverage", verdict: "PASS", durationMs: 40 },
      { name: "androidBuild", verdict: "PASS", durationMs: 21_800 },
      { name: "unitTests", verdict: "PASS", durationMs: 9_500 },
      { name: "e2eSmoke", verdict: "SKIP", reason: "no Android device/emulator attached (adb)", durationMs: 0 },
    ],
    artifacts: [],
    toolVersions: {},
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function withTree(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-receipts-"));
  try {
    makeTree(root);
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ── evaluateReceipt (the local predicate, verbatim semantics) ───────────────

test("evaluateReceipt: PASS receipt whose hash matches the tree is valid", () => {
  withTree((root) => {
    const receipt = makeReceipt(root);
    const res = evaluateReceipt(receipt, () => computeInputsHash(root));
    assert.equal(res.valid, true);
    assert.match(res.reason, /receipt is valid — PASS, attesting profile: local/);
  });
});

test("evaluateReceipt: source change since the receipt invalidates it", () => {
  withTree((root) => {
    const receipt = makeReceipt(root);
    fs.appendFileSync(path.join(root, "composeApp/src/commonMain/kotlin/Main.kt"), "// drift\n");
    const res = evaluateReceipt(receipt, () => computeInputsHash(root));
    assert.equal(res.valid, false);
    assert.match(res.reason, /source changed since the receipt — re-run the lane/);
  });
});

test("evaluateReceipt: hand-edited verdict fails on the hash, not the claim", () => {
  withTree((root) => {
    const receipt = makeReceipt(root, { verdict: "PASS", inputs: { hash: "f".repeat(64), fileCount: 7 } });
    const res = evaluateReceipt(receipt, () => computeInputsHash(root));
    assert.equal(res.valid, false);
    assert.match(res.reason, /source changed since the receipt/);
  });
});

test("evaluateReceipt: FAIL receipt refuses without recomputing the hash", () => {
  withTree((root) => {
    const receipt = makeReceipt(root, { verdict: "FAIL" });
    let recomputed = false;
    const res = evaluateReceipt(receipt, () => {
      recomputed = true;
      return computeInputsHash(root);
    });
    assert.equal(res.valid, false);
    assert.match(res.reason, /the committed receipt is a FAIL/);
    assert.equal(recomputed, false, "FAIL must short-circuit before hashing");
  });
});

test("evaluateReceipt: receipt without evidence binding is refused", () => {
  withTree((root) => {
    const receipt = makeReceipt(root);
    delete receipt.inputs;
    const res = evaluateReceipt(receipt, () => computeInputsHash(root));
    assert.equal(res.valid, false);
    assert.match(res.reason, /receipt predates evidence binding/);
  });
});

// ── readReceipt ─────────────────────────────────────────────────────────────

test("readReceipt: returns the parsed receipt, or null when absent/unparsable", () => {
  withTree((root) => {
    assert.equal(readReceipt(root), null);
    write(root, RECEIPT_REL_PATH, "{not json");
    assert.equal(readReceipt(root), null);
    write(root, RECEIPT_REL_PATH, JSON.stringify(makeReceipt(root)));
    assert.equal(readReceipt(root).schema, "cmp-evidence/1");
  });
});

// ── freshness ───────────────────────────────────────────────────────────────

test("checkFreshness: recent receipt is fresh; old receipt is stale; future is refused", () => {
  const now = Date.parse("2026-07-13T12:00:00Z");
  const fresh = { generatedAt: "2026-07-13T10:00:00Z" };
  const stale = { generatedAt: "2026-05-01T10:00:00Z" };
  const future = { generatedAt: "2026-07-14T12:00:00Z" };
  assert.equal(checkFreshness(fresh, { now }).ok, true);
  const staleRes = checkFreshness(stale, { now });
  assert.equal(staleRes.ok, false);
  assert.match(staleRes.detail, /stale/);
  const futureRes = checkFreshness(future, { now });
  assert.equal(futureRes.ok, false);
  assert.match(futureRes.detail, /future/);
  assert.equal(checkFreshness({}, { now }).ok, false, "missing generatedAt is not fresh");
});

// ── execution plausibility ──────────────────────────────────────────────────

test("checkExecutionPlausibility: real durations pass; impossibly-fast receipts are named", () => {
  const real = { steps: [{ name: "build", verdict: "PASS", durationMs: 21_800 }] };
  assert.equal(checkExecutionPlausibility(real).ok, true);

  const fast = { steps: [{ name: "build", verdict: "PASS", durationMs: 42 }] };
  const fastRes = checkExecutionPlausibility(fast);
  assert.equal(fastRes.ok, false);
  assert.match(fastRes.detail, /implausibly fast/);
  assert.match(fastRes.detail, /evidence must attest execution/);

  const negative = { steps: [{ name: "build", verdict: "PASS", durationMs: -5 }] };
  assert.equal(checkExecutionPlausibility(negative).ok, false);

  const allSkip = { steps: [{ name: "e2e", verdict: "SKIP", durationMs: 0 }] };
  const allSkipRes = checkExecutionPlausibility(allSkip);
  assert.equal(allSkipRes.ok, false);
  assert.match(allSkipRes.detail, /every step .* is a SKIP/);

  assert.equal(checkExecutionPlausibility({ steps: [] }).ok, false, "no steps = nothing executed");
});

test("listSkippedSteps: SKIPs surface with their honest reasons", () => {
  withTree((root) => {
    const skips = listSkippedSteps(makeReceipt(root));
    assert.equal(skips.length, 1);
    assert.equal(skips[0].name, "e2eSmoke");
    assert.match(skips[0].reason, /no Android device/);
  });
});

// ── validateReceiptForTree (the hosted composite) ───────────────────────────

test("validateReceiptForTree: valid receipt over a real tree → status valid, all checks ok", () => {
  withTree((root) => {
    write(root, RECEIPT_REL_PATH, JSON.stringify(makeReceipt(root)));
    const res = validateReceiptForTree({ root });
    assert.equal(res.status, "valid");
    assert.ok(res.checks.every((c) => c.ok));
    assert.equal(res.skips.length, 1, "SKIPs are reported even on valid receipts");
  });
});

test("validateReceiptForTree: no receipt → status missing (not invalid — non-harness repos are not punished)", () => {
  withTree((root) => {
    const res = validateReceiptForTree({ root });
    assert.equal(res.status, "missing");
    assert.match(res.reason, /does not carry the create-cmp evidence harness/);
    assert.match(res.reason, /not a failure/);
  });
});

test("validateReceiptForTree: hash mismatch → invalid, reason names the rule", () => {
  withTree((root) => {
    write(root, RECEIPT_REL_PATH, JSON.stringify(makeReceipt(root)));
    fs.appendFileSync(path.join(root, "composeApp/src/commonMain/kotlin/Main.kt"), "// drift\n");
    const res = validateReceiptForTree({ root });
    assert.equal(res.status, "invalid");
    assert.match(res.reason, /source changed since the receipt/);
    const failing = res.checks.filter((c) => !c.ok).map((c) => c.id);
    assert.deepEqual(failing, ["binding-and-hash"]);
  });
});

test("validateReceiptForTree: stale receipt → invalid on freshness even when the hash matches", () => {
  withTree((root) => {
    write(root, RECEIPT_REL_PATH, JSON.stringify(makeReceipt(root, { generatedAt: "2026-01-01T00:00:00Z" })));
    const res = validateReceiptForTree({ root, now: Date.parse("2026-07-13T00:00:00Z") });
    assert.equal(res.status, "invalid");
    assert.match(res.reason, /stale/);
  });
});

test("validateReceiptForTree: impossibly-fast receipt → invalid on plausibility", () => {
  withTree((root) => {
    const receipt = makeReceipt(root, {
      steps: [
        { name: "androidBuild", verdict: "PASS", durationMs: 30 },
        { name: "unitTests", verdict: "PASS", durationMs: 12 },
      ],
    });
    write(root, RECEIPT_REL_PATH, JSON.stringify(receipt));
    const res = validateReceiptForTree({ root });
    assert.equal(res.status, "invalid");
    assert.match(res.reason, /implausibly fast/);
  });
});

test("validateReceiptForTree: multiple violations are ALL named at once", () => {
  withTree((root) => {
    const receipt = makeReceipt(root, {
      generatedAt: "2026-01-01T00:00:00Z",
      steps: [{ name: "androidBuild", verdict: "PASS", durationMs: 5 }],
    });
    write(root, RECEIPT_REL_PATH, JSON.stringify(receipt));
    fs.appendFileSync(path.join(root, "qa/verify.mjs"), "// drift\n");
    const res = validateReceiptForTree({ root, now: Date.parse("2026-07-13T00:00:00Z") });
    assert.equal(res.status, "invalid");
    assert.match(res.reason, /source changed/);
    assert.match(res.reason, /stale/);
    assert.match(res.reason, /implausibly fast/);
  });
});

test("validateReceiptForTree: policy knobs override the defaults", () => {
  withTree((root) => {
    // harnessIntegrity is present because this test is about the plausibility
    // FLOOR, not about vouching — a fixture missing it would fail for the wrong
    // reason and stop testing the knob.
    const receipt = makeReceipt(root, {
      steps: [
        { name: "harnessIntegrity", verdict: "PASS", durationMs: 12 },
        { name: "androidBuild", verdict: "PASS", durationMs: 800 },
      ],
    });
    write(root, RECEIPT_REL_PATH, JSON.stringify(receipt));
    assert.equal(validateReceiptForTree({ root }).status, "invalid");
    assert.equal(validateReceiptForTree({ root, policy: { minExecutedMs: 500 } }).status, "valid");
  });
});

// S4 — an ERROR step tried and could not: it is not "executed" for the
// plausibility floor any more than a SKIP is. A receipt whose every gate is an
// ERROR verified nothing, and must say so rather than sum its wasted minutes.
test("plausibility: ERROR steps are not executed gates — a lane of errors verified nothing", () => {
  const allErrors = { steps: [{ name: "build", verdict: "ERROR", durationMs: 1_800_000 }, { name: "unitTests", verdict: "SKIP" }] };
  const r = checkExecutionPlausibility(allErrors);
  assert.equal(r.ok, false);
  assert.match(r.detail, /every step in the receipt is a SKIP|verified nothing/);
  const mixed = { steps: [{ name: "build", verdict: "PASS", durationMs: 60_000 }, { name: "releaseBuild", verdict: "ERROR", durationMs: 1_800_000 }] };
  const m = checkExecutionPlausibility(mixed);
  assert.equal(m.executedSteps, 1, "only the step that produced a verdict counts");
  assert.equal(m.executedMs, 60_000, "and thirty wasted minutes do not pad the floor");
});

// evidence-economics S8 follow-up (peer finding, 2026-09-03): VERIFIED_SURFACE
// was hardcoded in the SPINE. A repo whose code lives outside composeApp/ that
// vendored this module had its verified surface silently shrink — no error, no
// failed step, a receipt that still validated and still looked identical, and a
// hash that had quietly stopped covering the application.
test("the verified surface is per-project: absent config keeps the CMP default byte-for-byte", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-surface-"));
  assert.deepEqual(resolveVerifiedSurface(root), defaultSurface(root), "no declaration → the tree's own top level");
  // NOT a stack's directory names. The fallback used to be the constant
  // ["composeApp", "specs", "qa", …]: in a repo whose code lives under
  // services/ it matched qa/ and specs/ and nothing else, so the lane minted a
  // valid, confident, SMALLER hash — a receipt attesting a fraction of a project
  // while looking complete. Derived from the tree it errs WIDE, and only one of
  // those two directions is a lie.
  assert.ok(!resolveVerifiedSurface(root).includes("composeApp"), "the fallback names no stack's directories");
});

test("a backend repo declares its own surface and gets it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-surface-be-"));
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  fs.writeFileSync(path.join(root, SURFACE_CONFIG_REL), JSON.stringify({ surface: ["services", "docs", "build-logic", ".github", "qa"] }));
  assert.deepEqual(resolveVerifiedSurface(root), ["services", "docs", "build-logic", ".github", "qa"]);
});

test("PLANTED: a surface that matches nothing is REFUSED, not hashed into a confident-looking digest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-surface-empty-"));
  fs.mkdirSync(path.join(root, "services"), { recursive: true });
  fs.writeFileSync(path.join(root, "services", "Main.kt"), "fun main() {}\n");
  // A DECLARED surface that matches nothing. This plant used to come for free
  // from the undeclared case, because the fallback was a Compose app's
  // directory names and a backend has none of them — the whole reason that
  // fallback was a defect. Now an undeclared backend hashes its own tree
  // correctly (asserted below), so the plant has to name a surface that really
  // matches nothing to keep proving the guard bites.
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  fs.writeFileSync(path.join(root, SURFACE_CONFIG_REL), JSON.stringify({ surface: ["composeApp"] }));
  assert.throws(() => computeInputsHash(root), /matched no files|nothing would be attested/);
});

test("a backend that declares NO surface hashes its own tree, rather than a Compose app's", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-surface-none-"));
  fs.mkdirSync(path.join(root, "services"), { recursive: true });
  fs.writeFileSync(path.join(root, "services", "Main.kt"), "fun main() {}\n");
  // The failure this replaces was not a crash. In a repo that HAD qa/ and
  // specs/ but kept its code under services/, the Compose fallback matched
  // some of the tree and produced a valid, confident, SMALLER hash: a receipt
  // attesting a fraction of a project while looking complete. The header of
  // inputs-hash.mjs calls that the worst failure this harness can have.
  const r = computeInputsHash(root);
  assert.ok(r.fileCount >= 1, "the backend's own sources are attested");
  assert.ok(resolveVerifiedSurface(root).includes("services"));
});

test("a malformed or empty declaration is refused — never silently defaulted to a smaller surface", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-surface-bad-"));
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  fs.writeFileSync(path.join(root, SURFACE_CONFIG_REL), "{ not json");
  assert.throws(() => resolveVerifiedSurface(root), /not valid JSON/);
  fs.writeFileSync(path.join(root, SURFACE_CONFIG_REL), JSON.stringify({ surface: [] }));
  assert.throws(() => resolveVerifiedSurface(root), /declares no surface/);
});
