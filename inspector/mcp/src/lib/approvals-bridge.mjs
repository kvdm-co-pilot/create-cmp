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
    return lib.approveArtifact(root, artifactId);
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
}
