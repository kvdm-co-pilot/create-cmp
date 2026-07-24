// approvals-bridge.mjs — the console's ONLY link to a generated project's OWN
// qa/lib/approvals.mjs (VERIFICATION-LAYER-DESIGN.md §4).
//
// File ownership: this package owns inspector/mcp/**, not template/qa/**. The
// approvals data model (registry, hashing, state, transitions, refusal wording)
// lives entirely in the project's own qa/lib/approvals.mjs — the SAME file
// qa/approve.mjs (the CLI) and qa/verify.mjs (the gate) call. This bridge never
// re-implements any of that: it dynamically imports the library from the
// project root the preview service already knows (`projectDir`) at RUNTIME,
// because this MCP package cannot statically depend on a template file that
// only exists inside a generated project (and varies by scaffold version).
//
// Absence is NOT an error — every export degrades to { available: false }
// rather than throwing, so the gallery keeps working for projects with no
// qa/lib/approvals.mjs (older, pre-approvals-wave scaffolds).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// One resolved-module lookup per project root. Dynamic `import()` is already
// idempotent per resolved URL (Node's module cache), so this cache mainly
// short-circuits the fs probe for known-good roots. Only SUCCESSFUL loads are
// cached: a "no library here" answer must never be remembered, because a
// project can GAIN qa/lib/approvals.mjs mid-session (cmp-upgrade, a drift PR,
// an agent stamping the file) while the console keeps running — a cached null
// would hide the new library until a restart, degrading the Approvals tab and
// approval_status to {available:false} forever. The re-probe on each miss is
// one fs.existsSync — cheap enough to pay per call.
const libCache = new Map(); // root -> module (successful loads ONLY)

async function loadLib(root) {
  if (libCache.has(root)) return libCache.get(root);
  const libPath = path.join(root, "qa", "lib", "approvals.mjs");
  if (!fs.existsSync(libPath)) return null;
  let mod;
  try {
    mod = await import(pathToFileURL(libPath).href);
  } catch {
    return null; // import failed — not cached either; a fixed file is picked up next call
  }
  libCache.set(root, mod);
  return mod;
}

/**
 * Test/ops seam: drop the cached module for `root` (or everything when
 * omitted). Gaining a library mid-session needs NO reset (misses are never
 * cached — see loadLib); this seam covers the remaining case: a root whose
 * already-loaded library was removed or replaced, which the success cache
 * would otherwise keep serving.
 */
export function resetApprovalsBridgeCache(root) {
  if (root) libCache.delete(root);
  else libCache.clear();
}

/**
 * Every governed artifact's live status, via the project's own library.
 * @param {string} root
 * @returns {Promise<{available: true, statuses: object[]} | {available: false, error?: string}>}
 */
export async function getApprovalsData(root) {
  const lib = await loadLib(root);
  if (!lib) return { available: false };
  try {
    return { available: true, statuses: lib.getApprovalStatuses(root) };
  } catch (err) {
    return { available: false, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Approve one artifact via the project's own library. Refusals ({ok:false,
 * reason}) are the LIBRARY's decision verbatim — this bridge adds nothing
 * (vacuous-approval protection, unresolvable-artifact refusal, unknown ids —
 * all inherited automatically).
 * @param {string} root
 * @param {string} artifactId
 */
export async function approveArtifact(root, artifactId) {
  const lib = await loadLib(root);
  if (!lib) {
    return {
      ok: false,
      reason:
        "the approvals library (qa/lib/approvals.mjs) is not present in this project — " +
        "this looks like an older scaffold that predates the approvals wave.",
    };
  }
  try {
    // `via` is an audit field on the ledger row ("which surface did this
    // signature come through") — older project libs simply ignore unknown
    // options, so this stays compatible with pre-feature-intent scaffolds.
    return lib.approveArtifact(root, artifactId, { via: "console" });
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
}

/**
 * Reopen an approved artifact for redesign (GENESIS-FLOW-DESIGN.md §2/§3),
 * via the project's own library. Refusals ({ok:false, reason}) are the
 * LIBRARY's decision verbatim (unknown id, non-approved state — reopening
 * the unreviewed is meaningless) — same "never re-implement the model"
 * stance as approveArtifact.
 *
 * Honest degrade (§3 "the console never crashes on an older lib"): a project
 * whose qa/lib/approvals.mjs predates the reopen wave has no `reopenArtifact`
 * export at all — that's checked explicitly here (not left to throw
 * "lib.reopenArtifact is not a function" up through the generic catch) so
 * the refusal reason names the real cause instead of a stack-trace-shaped one.
 * @param {string} root
 * @param {string} artifactId
 */
export async function reopenArtifact(root, artifactId) {
  const lib = await loadLib(root);
  if (!lib) {
    return {
      ok: false,
      reason:
        "the approvals library (qa/lib/approvals.mjs) is not present in this project — " +
        "this looks like an older scaffold that predates the approvals wave.",
    };
  }
  if (typeof lib.reopenArtifact !== "function") {
    return {
      ok: false,
      reason:
        "this project's qa/lib/approvals.mjs predates the reopen wave (no reopenArtifact export) — " +
        "upgrade the scaffold (the cmp-upgrade skill, or re-stamp) to unlock Reopen.",
    };
  }
  try {
    return lib.reopenArtifact(root, artifactId);
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
}

/**
 * The Features board (feature briefs + lifecycle + declared-vs-actual blast
 * radius), via the project's own library. Degrades to { available: false } for
 * projects whose approvals lib predates the feature-intent wave (no
 * getFeatureBoard export) — the section renders its empty-state explanation,
 * never a crash.
 * @param {string} root
 * @returns {Promise<{available: true, board: object} | {available: false, error?: string}>}
 */
export async function getFeatureBoard(root) {
  const lib = await loadLib(root);
  if (!lib || typeof lib.getFeatureBoard !== "function") return { available: false };
  try {
    return { available: true, board: lib.getFeatureBoard(root) };
  } catch (err) {
    return { available: false, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * The human's acceptance of a delivered feature brief, via the project's own
 * library — which refuses while any armed check fails (accepting a red
 * delivery is refused there, not here; this bridge adds nothing).
 * @param {string} root
 * @param {string} name the brief's name (docs/proposals/<name>.md)
 */
export async function acceptFeature(root, name) {
  const lib = await loadLib(root);
  if (!lib) {
    return {
      ok: false,
      reason:
        "the approvals library (qa/lib/approvals.mjs) is not present in this project — " +
        "this looks like an older scaffold that predates the approvals wave.",
    };
  }
  if (typeof lib.acceptFeature !== "function") {
    return {
      ok: false,
      reason:
        "this project's qa/lib/approvals.mjs predates the feature-intent wave (no acceptFeature export) — " +
        "upgrade the scaffold (the cmp-upgrade skill, or re-stamp) to unlock feature acceptance.",
    };
  }
  try {
    return lib.acceptFeature(root, name);
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
}
