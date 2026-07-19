// comments-bridge.mjs — the console's ONLY link to a generated project's OWN
// qa/lib/comments.mjs (VERIFICATION-LAYER-DESIGN.md §7.3).
//
// Same shape as approvals-bridge.mjs (see that file's header for the full
// rationale). File ownership: this package owns inspector/mcp/**, not
// template/qa/**, so the comments data model (ledger schema, id assignment,
// refusal wording) lives entirely in the project's own qa/lib/comments.mjs —
// the SAME file qa/comment.mjs (the CLI) calls, built against the §7.3
// library contract (binding for both the console and the template side).
// This bridge never re-implements any of that: it dynamically imports the
// library from the project root at RUNTIME, because this MCP package cannot
// statically depend on a template file that only exists inside a generated
// project.
//
// Absence is NOT an error — every export degrades to { available: false } /
// { ok: false, reason } rather than throwing, so the console keeps working
// for projects with no qa/lib/comments.mjs (older, pre-comments-wave
// scaffolds).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// One resolved-module lookup per project root (mirrors approvals-bridge.mjs's
// libCache — see that file for why this exists alongside Node's own module
// cache). Only SUCCESSFUL loads are cached: a "no library here" answer must
// never be remembered, because a project can GAIN qa/lib/comments.mjs
// mid-session (cmp-upgrade, a drift PR, an agent stamping the file) while the
// console keeps running — a cached null would hide the new library until a
// restart, degrading every comment surface to {available:false} forever. The
// re-probe on each miss is one fs.existsSync — cheap enough to pay per call.
const libCache = new Map(); // root -> module (successful loads ONLY)

async function loadLib(root) {
  if (libCache.has(root)) return libCache.get(root);
  const libPath = path.join(root, "qa", "lib", "comments.mjs");
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
 * omitted) — mirrors resetApprovalsBridgeCache. Gaining a library mid-session
 * needs NO reset (misses are never cached — see loadLib); this covers a root
 * whose already-loaded library was removed or replaced.
 */
export function resetCommentsBridgeCache(root) {
  if (root) libCache.delete(root);
  else libCache.clear();
}

/**
 * The full comment ledger, via the project's own library.
 * @param {string} root
 * @param {{status?: "open"|"resolved"}} [opts]
 * @returns {Promise<{available: true, schema: string, comments: object[]} | {available: false, error?: string}>}
 */
export async function getCommentsData(root, opts = {}) {
  const lib = await loadLib(root);
  if (!lib) return { available: false };
  try {
    const data = lib.listComments(root, opts);
    return { available: true, schema: data.schema, comments: data.comments };
  } catch (err) {
    return { available: false, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Add a comment via the project's own library. Refusals ({ok:false, reason})
 * are the LIBRARY's decision verbatim (empty/whitespace text, unknown target
 * type — this bridge adds nothing).
 * @param {string} root
 * @param {{target: object, text: string, author: string}} input
 */
export async function addComment(root, input) {
  const lib = await loadLib(root);
  if (!lib) {
    return {
      ok: false,
      reason:
        "the comments library (qa/lib/comments.mjs) is not present in this project — " +
        "this looks like an older scaffold that predates the comments wave.",
    };
  }
  try {
    return lib.addComment(root, input);
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
}

/**
 * Resolve a comment via the project's own library. Refusals ({ok:false,
 * reason}) are the LIBRARY's decision verbatim (unknown id, double-resolve).
 * @param {string} root
 * @param {string} id
 * @param {{note: string, author: string}} input
 */
export async function resolveComment(root, id, input) {
  const lib = await loadLib(root);
  if (!lib) {
    return {
      ok: false,
      reason:
        "the comments library (qa/lib/comments.mjs) is not present in this project — " +
        "this looks like an older scaffold that predates the comments wave.",
    };
  }
  try {
    return lib.resolveComment(root, id, input);
  } catch (err) {
    return { ok: false, reason: err && err.message ? err.message : String(err) };
  }
}
