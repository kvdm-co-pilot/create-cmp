// The evidence-binding predicate and its service-grade extensions, as pure
// dependency-free functions. `evaluateReceipt` is the exact predicate the
// generated project's qa/receipt-check.mjs (and its Stop hook + CI) runs;
// the additional checks (freshness, execution plausibility, SKIP listing) are
// consumed by hosted validators that judge a receipt fetched from a repo
// tarball rather than the working tree.
//
// SINGLE SOURCE OF TRUTH: packages/receipts/src/receipt-validate.mjs in the
// create-cmp repo (the `prooflane-receipts` package). The copy in a generated
// project's qa/lib/ is vendored byte-identical at scaffold time and pinned by
// test/receipts-parity.test.mjs — edit the package source, then run
// `node scripts/sync-harness.mjs`.
//
// See docs/adr/0005-evidence-binding-by-inputs-hash.md for the why.

import fs from "node:fs";
import path from "node:path";

import { computeInputsHash } from "./inputs-hash.mjs";

/** Where a generated project keeps its committed receipt, relative to root. */
export const RECEIPT_REL_PATH = "qa/evidence/latest.json";

/**
 * Read and parse the committed receipt for the project rooted at `root`.
 * @param {string} root absolute path to the project root
 * @returns {object|null} the parsed receipt, or null when absent/unparsable
 */
export function readReceipt(root, relPath = RECEIPT_REL_PATH) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
  } catch {
    return null;
  }
}

/**
 * The core predicate: does this receipt validly attest the tree whose inputs
 * hash `recompute()` returns? Reasons are the exact refusal strings the
 * generated project's receipt-check CLI (and Stop hook) prints.
 *
 * @param {object} receipt parsed receipt JSON
 * @param {() => {hash: string, fileCount: number}} recompute lazily invoked —
 *   never called when the receipt fails structurally first (missing binding,
 *   FAIL verdict), so callers don't pay for a hash they don't need.
 * @returns {{valid: boolean, reason: string, profile: (string|undefined), recomputed?: {hash: string, fileCount: number}}}
 */
/**
 * Does this receipt's own row-level evidence support its PASS?
 *
 * The receipt is necessarily excluded from the inputs hash it carries — a file
 * cannot hash itself — so steps[] is the only thing between this gate and a text
 * editor, and the top-level verdict is the most editable field on it.
 *
 * Two failures this catches, both observed downstream (payment-blueprint F2/F3):
 * a receipt whose verdict was hand-edited from FAIL to PASS while its rows still
 * said otherwise, and a lane made green by DELETING harness.lock.json, which
 * downgraded harnessIntegrity from FAIL to SKIP and took the lane's verdict with
 * it — a lane vouching for a tree with nothing vouching for the lane.
 *
 * @param {{verdict?: string, steps?: Array<{name?: string, verdict?: string}>}} receipt
 * @returns {{ok: boolean, detail: string}}
 */
export function checkLaneVouching(receipt) {
  const steps = Array.isArray(receipt?.steps) ? receipt.steps : null;
  if (!steps || steps.length === 0) {
    return { ok: false, detail: "receipt lists no verify-lane steps — a PASS over nothing attests nothing" };
  }
  const failed = steps.filter((s) => s && (s.verdict === "FAIL" || s.verdict === "ERROR"));
  if (failed.length > 0) {
    const names = failed.map((s) => `${s.name ?? "?"} (${s.verdict})`).join(", ");
    return {
      ok: false,
      detail: `the receipt's verdict is PASS but ${failed.length} step(s) did not pass: ${names} — the row is the more specific truth`,
    };
  }
  // THE ROW THAT VOUCHES IS THE ROW CARRYING THE VOUCHING DATA, not the row with
  // a particular name. This found a step named exactly `harnessIntegrity` — a
  // name the cmp pack chose, that `REQUIRED_EXPORTS` never mentions, and that a
  // profile author has no way to discover. A green lane whose self-vouching step
  // was spelled `harness_integrity` minted receipts that were invalid FOREVER,
  // in every reader, and the refusal accused the lane of not vouching for
  // itself. The `harness` object on a step row is what the schema already
  // documents as the integrity check's own findings, so it is the honest key.
  // The name is kept as a fallback for receipts written before rows carried it.
  const integrity = steps.find((s) => s && s.harness && typeof s.harness === "object") ?? steps.find((s) => s && s.name === "harnessIntegrity");
  if (!integrity) {
    return {
      ok: false,
      detail:
        "no step on this receipt vouches for the lane — no row carries a `harness` object and none is named harnessIntegrity, " +
        "so nothing attests that the lane's own code is the code that ran",
    };
  }
  if (integrity.verdict !== "PASS") {
    return {
      ok: false,
      detail: `${integrity.name ?? "the integrity step"} is ${integrity.verdict}, not PASS — the lane did not vouch for itself, so its PASS over the tree cannot be trusted`,
    };
  }
  return { ok: true, detail: `lane vouched for itself (${integrity.name ?? "integrity step"} PASS, no failing rows)` };
}

export function evaluateReceipt(receipt, recompute) {
  const profile = receipt.profile;

  if (!receipt.inputs || typeof receipt.inputs.hash !== "string") {
    return {
      valid: false,
      reason: `receipt predates evidence binding — re-run the lane (attesting profile: ${profile ?? "unknown"})`,
      profile,
    };
  }

  if (receipt.verdict === "FAIL") {
    return {
      valid: false,
      reason: `the committed receipt is a FAIL (attesting profile: ${profile ?? "unknown"})`,
      profile,
    };
  }

  const recomputed = recompute();

  if (receipt.inputs.hash !== recomputed.hash) {
    return {
      valid: false,
      reason: `source changed since the receipt — re-run the lane (attesting profile: ${profile ?? "unknown"})`,
      profile,
      recomputed,
    };
  }

  if (receipt.verdict !== "PASS") {
    return {
      valid: false,
      reason: `receipt verdict is "${receipt.verdict}", not PASS (attesting profile: ${profile ?? "unknown"})`,
      profile,
    };
  }

  // Did the lane vouch for ITSELF? See checkLaneVouching — the top-level verdict
  // is the most editable field on a file the hash cannot cover.
  const vouching = checkLaneVouching(receipt);
  if (!vouching.ok) {
    return { valid: false, reason: `${vouching.detail} (attesting profile: ${profile ?? "unknown"})`, profile, recomputed };
  }

  return { valid: true, reason: `receipt is valid — PASS, attesting profile: ${profile ?? "unknown"}`, profile, recomputed };
}

// ── Service-grade checks (hosted validators; the local predicate above does
//    not enforce these — the tree it checks is by definition "now") ─────────

/** Default policy for hosted validation. Every knob is overridable. */
export const DEFAULT_POLICY = {
  /** A receipt older than this no longer counts as fresh (hosted check only). */
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  /**
   * An absolute wall-time floor for executed (non-SKIP) gates. `null` — OFF by
   * default, and that is a decision rather than an omission.
   *
   * This was 5000, with the reasoning that a PASS receipt summing to less
   * cannot attest a real lane run: the tell for a replayed/cached green or a
   * hand-written verdict. That reasoning holds for a Gradle lane and is FALSE
   * for a Go service, a Rust crate, a Python package or a TypeScript library,
   * whose lanes honestly finish in hundreds of milliseconds. Those adopters
   * were told their evidence was fabricated — the one accusation this product
   * cannot afford to make wrongly.
   *
   * The number was not the defect. ONE receipt carries nothing that could
   * justify any number: no start time, no top-level duration, no baseline —
   * `generatedAt` is a timestamp, not an interval — so nothing on it can be
   * cross-checked against anything else on it. A floor is therefore a fact
   * about the STACK, and this module does not know the stack. It is the
   * notary's to set, from data the notary has and the receipt does not: a
   * lane that has taken thirty seconds every day for a month and today claims
   * forty-two milliseconds is a real finding, and it is a finding about a
   * HISTORY, not about a receipt.
   *
   * What is lost, said plainly: a hand-written receipt claiming small
   * durations is no longer refused here. It was never much of a defence — a
   * forger types a larger number — and every stack-independent check that
   * does catch fabrication is untouched below.
   */
  minExecutedMs: null,
};

/**
 * Freshness: is the receipt's generatedAt within maxAgeMs of `now`?
 * @returns {{ok: boolean, detail: string, ageMs?: number}}
 */
export function checkFreshness(receipt, { now = Date.now(), maxAgeMs = DEFAULT_POLICY.maxAgeMs } = {}) {
  const generatedAt = Date.parse(receipt?.generatedAt ?? "");
  if (Number.isNaN(generatedAt)) {
    return { ok: false, detail: "receipt has no parsable generatedAt timestamp" };
  }
  const ageMs = now - generatedAt;
  if (ageMs < -60_000) {
    // A receipt from the future is a clock lie, not a rounding artifact.
    return { ok: false, detail: `receipt claims a future generatedAt (${receipt.generatedAt})`, ageMs };
  }
  if (ageMs > maxAgeMs) {
    const days = Math.floor(ageMs / 86_400_000);
    return { ok: false, detail: `receipt is stale — generated ${days} day(s) ago, older than the ${Math.floor(maxAgeMs / 86_400_000)}-day freshness window`, ageMs };
  }
  return { ok: true, detail: `receipt generated ${receipt.generatedAt}`, ageMs };
}

/**
 * Execution plausibility: did this lane execute anything, and are its numbers
 * real numbers?
 *
 * Three refusals, all stack-independent and all about the SHAPE of the
 * evidence rather than its size: a receipt with no steps, a receipt whose every
 * step is a SKIP or an ERROR (neither measured anything), and a step whose
 * duration is not a finite non-negative number. An absolute wall-time floor is
 * a fourth check and is OFF unless a caller sets `minExecutedMs` — see
 * DEFAULT_POLICY for why a default one is a claim about the stack.
 * @returns {{ok: boolean, detail: string, executedMs?: number, executedSteps?: number}}
 */
export function checkExecutionPlausibility(receipt, { minExecutedMs = DEFAULT_POLICY.minExecutedMs } = {}) {
  const steps = Array.isArray(receipt?.steps) ? receipt.steps : null;
  if (!steps || steps.length === 0) {
    return { ok: false, detail: "receipt lists no verify-lane steps — nothing was executed" };
  }
  // Executed = produced a verdict about the tree. SKIP did not try; ERROR
  // tried and could not (a deadline, zero tests, a throw) — neither measured
  // anything, so neither counts toward "this lane verified something".
  const executed = steps.filter((s) => s && s.verdict !== "SKIP" && s.verdict !== "ERROR");
  if (executed.length === 0) {
    return { ok: false, detail: "every step in the receipt is a SKIP — the lane verified nothing" };
  }
  let total = 0;
  for (const step of executed) {
    if (typeof step.durationMs !== "number" || !Number.isFinite(step.durationMs) || step.durationMs < 0) {
      return { ok: false, detail: `step "${step.name ?? "?"}" reports an invalid duration (${step.durationMs}) — durations must be real, non-negative numbers` };
    }
    total += step.durationMs;
  }
  // Applied only when a caller supplies one. The message attributes the floor
  // to whoever set it and states the measurement, rather than asserting that a
  // fast receipt cannot be real — which this module has no way to know.
  if (typeof minExecutedMs === "number" && minExecutedMs > 0 && total < minExecutedMs) {
    return {
      ok: false,
      detail: `executed gates report ${total}ms total, below this validator's configured ${minExecutedMs}ms floor — for a fast stack that may be honest, so treat it as a finding to explain rather than proof of fabrication`,
      executedMs: total,
      executedSteps: executed.length,
    };
  }
  return { ok: true, detail: `${executed.length} executed gate(s), ${total}ms total`, executedMs: total, executedSteps: executed.length };
}

/**
 * List the SKIPped steps with their honest reasons. SKIPs are reported, not
 * failed — green-with-gaps must be visible, never silently equated with
 * fully-verified (or silently punished).
 * @returns {Array<{name: string, reason: string}>}
 */
export function listSkippedSteps(receipt) {
  const steps = Array.isArray(receipt?.steps) ? receipt.steps : [];
  return steps
    .filter((s) => s && s.verdict === "SKIP")
    .map((s) => ({ name: s.name ?? "?", reason: s.reason ?? "no reason recorded" }));
}

/**
 * The hosted composite: validate the receipt found in an extracted repo tree
 * (e.g. a tarball at a PR's head SHA) with the full service-grade policy.
 *
 * @param {object} args
 * @param {string} args.root absolute path to the extracted tree's project root
 * @param {number} [args.now] epoch ms, for freshness (defaults to Date.now())
 * @param {object} [args.policy] overrides for DEFAULT_POLICY
 * @returns {{
 *   status: "missing"|"valid"|"invalid",
 *   reason: string,
 *   profile?: string,
 *   checks: Array<{id: string, ok: boolean, detail: string}>,
 *   skips: Array<{name: string, reason: string}>,
 * }}
 */
export function validateReceiptForTree({ root, now = Date.now(), policy = {} } = {}) {
  const effective = { ...DEFAULT_POLICY, ...policy };
  const receipt = readReceipt(root);

  if (receipt === null) {
    return {
      status: "missing",
      reason: `no receipt at ${RECEIPT_REL_PATH} — this repo does not carry the prooflane evidence harness (that is not a failure)`,
      checks: [{ id: "receipt-present", ok: false, detail: `no parsable receipt at ${RECEIPT_REL_PATH}` }],
      skips: [],
    };
  }

  const checks = [{ id: "receipt-present", ok: true, detail: RECEIPT_REL_PATH }];
  const skips = listSkippedSteps(receipt);

  // The core predicate (binding + verdict + hash), verbatim local semantics.
  const core = evaluateReceipt(receipt, () => computeInputsHash(root));
  checks.push({ id: "binding-and-hash", ok: core.valid, detail: core.reason });

  // Service-grade extensions run regardless, so a failing receipt reports
  // every violated rule at once (refusals name what failed, all of it).
  const freshness = checkFreshness(receipt, { now, maxAgeMs: effective.maxAgeMs });
  checks.push({ id: "freshness", ok: freshness.ok, detail: freshness.detail });

  const plausibility = checkExecutionPlausibility(receipt, { minExecutedMs: effective.minExecutedMs });
  checks.push({ id: "execution-plausibility", ok: plausibility.ok, detail: plausibility.detail });

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    return {
      status: "invalid",
      reason: failed.map((c) => c.detail).join("; "),
      profile: core.profile,
      checks,
      skips,
    };
  }

  return {
    status: "valid",
    reason: core.reason,
    profile: core.profile,
    checks,
    skips,
  };
}
