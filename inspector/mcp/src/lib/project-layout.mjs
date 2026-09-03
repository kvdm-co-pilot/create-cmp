// project-layout.mjs — WHERE a project keeps the things the console reads.
//
// The console used to know one layout: qa/evidence/latest.json, docs/
// ARCHITECTURE.md, specs/, citations under composeApp/src and qa/e2e. Those
// are the paths of a Compose Multiplatform app stamped by create-cmp, and
// they were constants — so the first adopter with its own layout (payment-
// blueprint: receipt at qa/evidence/receipt.json, ARCHITECTURE.md at the
// repo root, Kotlin under services/) got an Evidence pane, a verdict history
// and an audit trail that were blind, each saying "not found" about a file
// that existed ten characters away. Same bug class as the verified surface
// (packages/receipts/src/inputs-hash.mjs, evidence-economics S8): spine code
// hardcoding one project's layout and degrading quietly.
//
// This module resolves the layout per project, exactly as resolveVerifiedSurface
// does for the hash: a DEFAULT (the Compose layout, unchanged for every app
// that has no manifest) overridden by an optional qa/harness-manifest.json.
// A manifest that is present but malformed is REFUSED, not defaulted — the
// readers that consume the layout then say "the manifest is malformed: <why>"
// instead of looking in the wrong place and reporting an honest-looking
// absence. Silently falling back would recreate the very failure this closes.
//
// Every field is a path relative to the project root, posix-separated, and
// may not escape the root. `packs` is informational: which step packs the
// lane composes (the console shows it; nothing gates on it).

import fs from "node:fs";
import path from "node:path";

/** Where a project may declare its layout. Optional; absent means the default. */
export const MANIFEST_REL_PATH = "qa/harness-manifest.json";

/** The Compose Multiplatform layout create-cmp stamps — the default when no manifest exists. */
export const DEFAULT_LAYOUT = Object.freeze({
  receipt: "qa/evidence/latest.json",
  architectureDoc: "docs/ARCHITECTURE.md",
  specs: "specs",
  citationRoots: Object.freeze(["composeApp/src", "qa/e2e"]),
  approvals: "qa/approvals.json",
  packs: Object.freeze(["cmp"]),
});

const PATH_FIELDS = ["receipt", "architectureDoc", "specs", "approvals"];
const LIST_FIELDS = ["citationRoots", "packs"];
const KNOWN_FIELDS = new Set([...PATH_FIELDS, ...LIST_FIELDS]);

function pathProblem(field, value) {
  if (typeof value !== "string" || value.trim() === "") return `${field} must be a non-empty string`;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return `${field} must be relative to the project root (got "${value}")`;
  if (value.includes("\\")) return `${field} must use "/" separators (got "${value}")`;
  if (value.split("/").some((seg) => seg === "..")) return `${field} may not escape the project root (got "${value}")`;
  return null;
}

/**
 * Validate a parsed manifest object against the field contract. Returns the
 * problems found (empty when valid) — never throws, so a caller can print
 * every defect at once rather than the first.
 * @param {unknown} parsed
 * @returns {string[]}
 */
export function manifestProblems(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return ["the manifest must be a JSON object"];
  const problems = [];
  for (const key of Object.keys(parsed)) {
    if (!KNOWN_FIELDS.has(key)) problems.push(`unknown field "${key}" (known: ${[...KNOWN_FIELDS].join(", ")})`);
  }
  for (const field of PATH_FIELDS) {
    if (!(field in parsed)) continue;
    const p = pathProblem(field, parsed[field]);
    if (p) problems.push(p);
  }
  for (const field of LIST_FIELDS) {
    if (!(field in parsed)) continue;
    const list = parsed[field];
    if (!Array.isArray(list) || list.length === 0) {
      problems.push(`${field} must be a non-empty array of strings`);
      continue;
    }
    list.forEach((entry, i) => {
      const p = field === "citationRoots" ? pathProblem(`${field}[${i}]`, entry) : typeof entry === "string" && entry.trim() ? null : `${field}[${i}] must be a non-empty string`;
      if (p) problems.push(p);
    });
  }
  return problems;
}

/**
 * The project's layout: the default, or the default overridden field by field
 * by qa/harness-manifest.json when that file exists and is well-formed.
 *
 * `ok:false` ONLY when a manifest is present and unusable (unreadable JSON or
 * a contract violation) — `reason` names the file and every problem. A missing
 * manifest is not a problem; it is the common case (every Compose app).
 * @param {string} root project root
 * @returns {{ok: true, layout: typeof DEFAULT_LAYOUT, source: "default"|"manifest", relPath: string}
 *         | {ok: false, reason: string, relPath: string, source: "manifest"}}
 */
export function resolveProjectLayout(root) {
  const file = path.join(root, ...MANIFEST_REL_PATH.split("/"));
  if (!fs.existsSync(file)) {
    return { ok: true, layout: DEFAULT_LAYOUT, source: "default", relPath: MANIFEST_REL_PATH };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return {
      ok: false,
      source: "manifest",
      relPath: MANIFEST_REL_PATH,
      reason: `${MANIFEST_REL_PATH} is not valid JSON (${err && err.message ? err.message : String(err)}) — fix it; the default layout is NOT assumed while a manifest is present`,
    };
  }
  const problems = manifestProblems(parsed);
  if (problems.length) {
    return {
      ok: false,
      source: "manifest",
      relPath: MANIFEST_REL_PATH,
      reason: `${MANIFEST_REL_PATH} is malformed: ${problems.join("; ")} — fix it; the default layout is NOT assumed while a manifest is present`,
    };
  }
  const layout = { ...DEFAULT_LAYOUT };
  for (const field of PATH_FIELDS) if (field in parsed) layout[field] = parsed[field];
  for (const field of LIST_FIELDS) if (field in parsed) layout[field] = Object.freeze([...parsed[field]]);
  return { ok: true, layout: Object.freeze(layout), source: "manifest", relPath: MANIFEST_REL_PATH };
}

/**
 * Convenience for readers that only need one path and want the manifest's
 * refusal surfaced as a reason: `{ok:true, rel}` or `{ok:false, reason}`.
 * @param {string} root
 * @param {"receipt"|"architectureDoc"|"specs"|"approvals"} field
 */
export function layoutPath(root, field) {
  const resolved = resolveProjectLayout(root);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  return { ok: true, rel: resolved.layout[field], source: resolved.source };
}
