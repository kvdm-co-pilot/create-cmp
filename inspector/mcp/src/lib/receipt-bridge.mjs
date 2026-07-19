// receipt-bridge.mjs — the console's link to a generated project's OWN verify
// lane evidence (docs/proposals/architecture-document-standard.md §6, Wave C
// row, item 1: "per-clause gate status from the last receipt").
//
// File ownership: this package owns inspector/mcp/**, not template/qa/**. The
// receipt itself (qa/evidence/latest.json) is written by the project's own
// qa/verify.mjs — see that file's `receipt` object (schema "cmp-evidence/1"):
// { schema, profile, verdict, commit, inputs: {hash, fileCount}, steps: [{name,
// verdict, reason?, durationMs, details?}], artifacts, toolVersions, generatedAt }.
// This bridge reads that JSON directly (never re-derives its shape) and, to
// answer "is it still bound to the CURRENT tree", dynamically imports the
// project's OWN qa/lib/inputs-hash.mjs and calls its computeInputsHash — the
// EXACT algorithm the lane itself used to produce inputs.hash — at RUNTIME,
// the same "bridge, never fork" stance approvals-bridge.mjs takes for
// qa/lib/approvals.mjs (this MCP package cannot statically depend on a
// template file that only exists inside a generated project and varies by
// scaffold version).
//
// Absence is NOT an error — every export degrades to { available: false,
// reason } rather than throwing or fabricating a status. A receipt whose
// inputsHash no longer matches the current tree is reported STALE, never
// presented as a live PASS (the console must never let an old green attest a
// tree that has since changed).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Where a generated project writes its evidence receipt (qa/verify.mjs). */
export const RECEIPT_REL_PATH = "qa/evidence/latest.json";
const INPUTS_HASH_REL_PATH = "qa/lib/inputs-hash.mjs";

// One resolved-module lookup per project root, success-only (see
// approvals-bridge.mjs's libCache for why misses are never cached: a project
// can gain qa/lib/inputs-hash.mjs mid-session and the console must notice
// without a restart).
const inputsHashLibCache = new Map(); // root -> module

async function loadInputsHashLib(root) {
  if (inputsHashLibCache.has(root)) return inputsHashLibCache.get(root);
  const libPath = path.join(root, INPUTS_HASH_REL_PATH);
  if (!fs.existsSync(libPath)) return null;
  let mod;
  try {
    mod = await import(pathToFileURL(libPath).href);
  } catch {
    return null; // import failed — not cached either; a fixed file is picked up next call
  }
  inputsHashLibCache.set(root, mod);
  return mod;
}

/** Test/ops seam, mirroring resetApprovalsBridgeCache. */
export function resetReceiptBridgeCache(root) {
  if (root) inputsHashLibCache.delete(root);
  else inputsHashLibCache.clear();
}

/**
 * Recompute the CURRENT tree's inputs hash via the project's own algorithm,
 * and compare it to the receipt's `inputs.hash`. `stale: null` means
 * "unknown" (no inputs.hash to compare, or the algorithm couldn't be
 * loaded/run) — that is NEVER the same as `stale: false` (confirmed fresh);
 * callers must render both honestly rather than defaulting unknown to fresh.
 * @returns {Promise<{stale: boolean|null, currentInputsHash: string|null, staleReason?: string}>}
 */
async function recomputeStaleness(root, receipt) {
  const receiptHash = receipt.inputs && typeof receipt.inputs.hash === "string" ? receipt.inputs.hash : null;
  if (!receiptHash) {
    return { stale: null, currentInputsHash: null, staleReason: "receipt predates evidence binding (no inputs.hash) — freshness unknown" };
  }
  const lib = await loadInputsHashLib(root);
  if (!lib) {
    return { stale: null, currentInputsHash: null, staleReason: `${INPUTS_HASH_REL_PATH} not found or failed to load — cannot recompute the current tree's hash` };
  }
  if (typeof lib.computeInputsHash !== "function") {
    return { stale: null, currentInputsHash: null, staleReason: `${INPUTS_HASH_REL_PATH} does not export computeInputsHash — freshness unknown` };
  }
  let recomputed;
  try {
    recomputed = lib.computeInputsHash(root);
  } catch (err) {
    return { stale: null, currentInputsHash: null, staleReason: `computeInputsHash threw (${err && err.message ? err.message : String(err)}) — freshness unknown` };
  }
  const currentInputsHash = recomputed && typeof recomputed.hash === "string" ? recomputed.hash : null;
  if (!currentInputsHash) {
    return { stale: null, currentInputsHash: null, staleReason: "computeInputsHash returned no hash — freshness unknown" };
  }
  return { stale: currentInputsHash !== receiptHash, currentInputsHash };
}

/**
 * The last verify-lane receipt, read fresh off disk every call (never
 * cached — the console must reflect the newest `node qa/verify.mjs` run
 * immediately). Never fabricates: a missing or malformed receipt degrades to
 * `{available: false, reason}` naming the exact fix (`run node qa/verify.mjs`).
 *
 * `conformance` is the receipt's own `steps[]` entry named "conformance" —
 * the *ArchitectureConformanceTest gate that enforces the ARCH-* clauses (see
 * template/qa/verify.mjs's stepConformance). It is `null` when the receipt
 * carries no such step (e.g. a `scaffold`-profile run, which never executes
 * it) — callers must not invent a verdict in that case either.
 *
 * @param {string} root project root
 * @returns {Promise<{
 *   available: boolean,
 *   reason?: string,
 *   relPath?: string,
 *   verdict?: string|null,
 *   generatedAt?: string|null,
 *   ageMs?: number|null,
 *   conformance?: {verdict: string, reason?: string, durationMs?: number}|null,
 *   inputsHash?: string|null,
 *   currentInputsHash?: string|null,
 *   stale?: boolean|null,
 *   staleReason?: string,
 * }>}
 */
export async function getLastReceipt(root) {
  const receiptPath = path.join(root, RECEIPT_REL_PATH);
  if (!fs.existsSync(receiptPath)) {
    return { available: false, reason: `no receipt at ${RECEIPT_REL_PATH} — run node qa/verify.mjs` };
  }

  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  } catch (err) {
    return {
      available: false,
      reason: `${RECEIPT_REL_PATH} could not be parsed (${err && err.message ? err.message : String(err)}) — run node qa/verify.mjs to regenerate it`,
    };
  }
  if (!receipt || typeof receipt !== "object" || !Array.isArray(receipt.steps)) {
    return { available: false, reason: `${RECEIPT_REL_PATH} is not a recognizable evidence receipt (no steps[]) — run node qa/verify.mjs to regenerate it` };
  }

  const conformanceStep = receipt.steps.find((s) => s && s.name === "conformance") || null;
  const conformance = conformanceStep
    ? { verdict: conformanceStep.verdict, reason: conformanceStep.reason, durationMs: conformanceStep.durationMs }
    : null;

  const parsedAt = Date.parse(receipt.generatedAt ?? "");
  const ageMs = Number.isNaN(parsedAt) ? null : Date.now() - parsedAt;

  const { stale, currentInputsHash, staleReason } = await recomputeStaleness(root, receipt);

  return {
    available: true,
    relPath: RECEIPT_REL_PATH,
    verdict: receipt.verdict ?? null,
    generatedAt: receipt.generatedAt ?? null,
    ageMs,
    conformance,
    inputsHash: receipt.inputs && typeof receipt.inputs.hash === "string" ? receipt.inputs.hash : null,
    currentInputsHash,
    stale,
    staleReason,
  };
}
