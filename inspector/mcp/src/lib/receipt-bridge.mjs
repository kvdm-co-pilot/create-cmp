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
import { execFileSync } from "node:child_process";
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
 * `steps` is the receipt's own steps[] verbatim (name/verdict/reason/
 * durationMs per entry, entries that aren't objects dropped) — the Evidence
 * section renders the whole lane run, not just the conformance step.
 * `profile`, `commitSha`, `commitDirty`, and `inputsFileCount` are likewise
 * the receipt's own fields, `null` when a field is absent — never inferred.
 *
 * @param {string} root project root
 * @returns {Promise<{
 *   available: boolean,
 *   reason?: string,
 *   relPath?: string,
 *   verdict?: string|null,
 *   profile?: string|null,
 *   commitSha?: string|null,
 *   commitDirty?: string[]|null,
 *   generatedAt?: string|null,
 *   ageMs?: number|null,
 *   steps?: Array<{name: string, verdict: string, reason?: string, durationMs?: number}>,
 *   conformance?: {verdict: string, reason?: string, durationMs?: number}|null,
 *   inputsHash?: string|null,
 *   inputsFileCount?: number|null,
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

  const steps = receipt.steps
    .filter((s) => s && typeof s === "object" && typeof s.name === "string")
    .map((s) => ({ name: s.name, verdict: s.verdict, reason: s.reason, durationMs: s.durationMs }));
  const conformanceStep = steps.find((s) => s.name === "conformance") || null;
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
    profile: typeof receipt.profile === "string" ? receipt.profile : null,
    commitSha: receipt.commit && typeof receipt.commit.sha === "string" ? receipt.commit.sha : null,
    commitDirty: receipt.commit && Array.isArray(receipt.commit.dirty) ? receipt.commit.dirty : null,
    generatedAt: receipt.generatedAt ?? null,
    ageMs,
    steps,
    conformance,
    inputsHash: receipt.inputs && typeof receipt.inputs.hash === "string" ? receipt.inputs.hash : null,
    inputsFileCount: receipt.inputs && typeof receipt.inputs.fileCount === "number" ? receipt.inputs.fileCount : null,
    currentInputsHash,
    stale,
    staleReason,
  };
}

/** How far back the committed-receipt audit trail is walked (git log --max-count). */
const HISTORY_MAX_COMMITS = 50;
// A field separator that cannot occur in a sha, author name, or ISO date.
const GIT_FIELD_SEP = "\x1f";

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"], // swallow stderr; errors surface as throws
    maxBuffer: 8 * 1024 * 1024,
  });
}

/**
 * The committed receipt audit trail, newest first — the Evidence timeline's
 * source. This reconstructs history from GIT, not a folder of files: every
 * commit that changed qa/evidence/latest.json is one verified state of record,
 * and git's own log gives it a permanent, attributed, tamper-evident chain
 * (author + date + sha). Each entry pairs that commit metadata with the receipt
 * as it was AT that commit (git show <sha>:qa/evidence/latest.json), so the
 * verdict/profile shown are exactly what was attested then — never re-derived.
 *
 * This is the compliance record; the Evidence headline card, separately, shows
 * the CURRENT working-tree receipt (committed or not). A project that is not a
 * git repo, or whose receipt has no commits yet, degrades to
 * `available: false` with the reason stated — the console renders the
 * standardized absence line, never a fabricated trail.
 * @param {string} root project root
 * @returns {{available: boolean, reason?: string, receipts?: Array<{file: string, commitSha: string, author: string|null, committedAt: string|null, ageMs: number|null, verdict: string|null, profile: string|null, generatedAt: string|null}>}}
 */
export function listReceiptHistory(root) {
  let logOut;
  try {
    logOut = git(root, [
      "log",
      `--max-count=${HISTORY_MAX_COMMITS}`,
      `--format=%H${GIT_FIELD_SEP}%an${GIT_FIELD_SEP}%aI`,
      "--",
      RECEIPT_REL_PATH,
    ]);
  } catch {
    // Not a git repo, git unavailable, or the command failed.
    return { available: false, reason: `no committed history for ${RECEIPT_REL_PATH} — commit a verify receipt to build the audit trail` };
  }
  const lines = logOut.split("\n").filter(Boolean);
  if (lines.length === 0) {
    return { available: false, reason: `${RECEIPT_REL_PATH} has no commits yet — commit a verify receipt to build the audit trail` };
  }

  const receipts = [];
  for (const line of lines) {
    const [sha, author, committedAt] = line.split(GIT_FIELD_SEP);
    if (!sha) continue;
    let content;
    try {
      content = git(root, ["show", `${sha}:${RECEIPT_REL_PATH}`]);
    } catch {
      continue; // receipt absent at that commit (e.g. the commit that removed it) — skipped, not guessed
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue; // a malformed committed receipt is skipped, never fabricated
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.steps)) continue;
    const at = Date.parse(committedAt ?? "");
    receipts.push({
      file: `${RECEIPT_REL_PATH}@${sha.slice(0, 7)}`,
      commitSha: sha,
      author: author || null,
      committedAt: committedAt || null,
      ageMs: Number.isNaN(at) ? null : Date.now() - at,
      verdict: parsed.verdict ?? null,
      profile: typeof parsed.profile === "string" ? parsed.profile : null,
      generatedAt: parsed.generatedAt ?? null,
    });
  }
  if (receipts.length === 0) {
    return { available: false, reason: `no parseable committed receipts in the history of ${RECEIPT_REL_PATH}` };
  }
  // git log already returns newest-first; the receipts array preserves that.
  return { available: true, receipts };
}
