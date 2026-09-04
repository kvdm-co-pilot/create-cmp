// spec-model.mjs — the scanner's view of a stack: what a profile's `layout`
// and `tiers` declarations become once the core has checked them.
//
// qa/lib/spec-coverage.mjs owns the MECHANIC — the clause grammar, the
// citation binding window, coverage in both directions, tier-must-observe.
// The profile owns the MODEL — where specs and sources live, what a citation
// file looks like, which tiers exist and which can observe which promise
// (docs/NORTH-STAR.md §6; AGNOSTIC-HARNESS-ARCHITECTURE.md §4.2 #1 and #4).
// This module joins them: it builds one validated `model` object from a
// profile, and it resolves that model from a project root for the callers
// that only have a root — the console's Specs bridge, feature-brief's derived
// doneness, the framework-check runner.
//
// Resolution is SYNCHRONOUS on purpose. Every root-only caller is a sync
// function deep in a sync chain (approvals → feature-brief → scanCitations),
// and the profile is plain ESM with no top-level await, so it is loaded with
// `require()` — supported for ESM since Node 20.19 / 22.12 and sharing the
// module cache with `import()`, so the lane and a sync reader see the same
// instance. Node 18 and 20.18 are end-of-life; the engines floor says so.
//
// Two override rules, both deliberate:
//   - the manifest's layout fields (`specs`, `citationRoots`) override the
//     profile's, field by field — the same semantics the console applies, so
//     an attached foreign repo that told `attach` where its tests are gets the
//     same scan from both readers. A stamped app's manifest carries the
//     profile's own values, so the override is the identity there.
//   - there is NO fallback model. A profile that declares no `layout` or no
//     `tiers` is refused by name at load; a root with no manifest is refused
//     with the command that writes one. A scanner that guessed a layout would
//     report honest-looking absences about files ten characters away.
//
// SINGLE SOURCE OF TRUTH: packages/harness/src/lib/spec-model.mjs in the
// create-cmp repo. Vendored byte-identical into qa/lib/ — edit the package
// source, then run `node scripts/sync-harness.mjs`.

import { resolveHarnessManifest } from "./harness-manifest.mjs";
import { loadProfileSync } from "./profile-loader.mjs";

/** A clause's declared requirement name: `[tier: device]` → "device". One path segment of letters/digits/dashes. */
export const TIER_NAME_RE = /^[a-z][a-z0-9-]*$/i;

function isStringList(v) {
  return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string" && s.trim() !== "");
}

function relPathProblem(field, value) {
  if (typeof value !== "string" || value.trim() === "") return `${field} must be a non-empty string`;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return `${field} must be relative to the project root (got "${value}")`;
  if (value.includes("\\")) return `${field} must use "/" separators (got "${value}")`;
  if (value.split("/").some((seg) => seg === "..")) return `${field} may not escape the project root (got "${value}")`;
  return null;
}

/**
 * Every contract violation in a profile's `layout` and `tiers`, or [] when
 * they are usable. Never throws; a caller prints all defects at once.
 * @param {{layout?: unknown, tiers?: unknown}} profile
 * @returns {string[]}
 */
export function specDeclarationProblems(profile) {
  const out = [];
  const layout = profile?.layout;
  const tiers = profile?.tiers;
  if (!layout || typeof layout !== "object") out.push("layout must be an object");
  else {
    const p = relPathProblem("layout.specs", layout.specs);
    if (p) out.push(p);
    if (!isStringList(layout.citationRoots)) out.push("layout.citationRoots must be a non-empty list of project-relative paths");
    else for (const r of layout.citationRoots) { const q = relPathProblem("layout.citationRoots[]", r); if (q) out.push(q); }
    if (!isStringList(layout.citationExts) || !layout.citationExts.every((e) => e.startsWith("."))) out.push('layout.citationExts must be a non-empty list of file extensions, each starting with "."');
    if (layout.buildDir != null) {
      const q = relPathProblem("layout.buildDir", layout.buildDir);
      if (q) out.push(q);
    }
    if (layout.flows != null) {
      if (typeof layout.flows !== "object") out.push("layout.flows must be null or {dir, exts}");
      else {
        const q = relPathProblem("layout.flows.dir", layout.flows.dir);
        if (q) out.push(q);
        if (!isStringList(layout.flows.exts) || !layout.flows.exts.every((e) => e.startsWith("."))) out.push('layout.flows.exts must be a non-empty list of file extensions, each starting with "."');
      }
    }
  }
  if (!tiers || typeof tiers !== "object") out.push("tiers must be an object");
  else {
    if (!isStringList(tiers.names)) out.push("tiers.names must be a non-empty list of tier names");
    const names = new Set(isStringList(tiers.names) ? tiers.names : []);
    if (!Array.isArray(tiers.hostOnly) || !tiers.hostOnly.every((t) => names.has(t))) out.push("tiers.hostOnly must list tiers from tiers.names");
    if (!tiers.satisfying || typeof tiers.satisfying !== "object") out.push("tiers.satisfying must map a requirement name to the tiers that satisfy it");
    else {
      for (const [req, list] of Object.entries(tiers.satisfying)) {
        if (!TIER_NAME_RE.test(req)) out.push(`tiers.satisfying has an invalid requirement name "${req}"`);
        if (!isStringList(list) || !list.every((t) => names.has(t))) out.push(`tiers.satisfying.${req} must list tiers from tiers.names`);
      }
    }
    if (tiers.journey != null && !names.has(tiers.journey)) out.push("tiers.journey must be one of tiers.names (or null when this stack has no journey tier)");
    if (typeof tiers.forFile !== "function") out.push("tiers.forFile(rel) must be a function returning the citing file's tier");
  }
  return out;
}

/**
 * Build the scanner's model from a profile's declarations, applying manifest
 * layout overrides field by field. Pure.
 * @param {{id?: string, layout: object, tiers: object}} profile
 * @param {{specs?: string, citationRoots?: string[]}} [overrides] manifest layout fields
 * @returns {{ok: true, model: SpecModel} | {ok: false, reason: string}}
 */
export function specModelFrom(profile, overrides = {}) {
  const problems = specDeclarationProblems(profile);
  if (problems.length) {
    return { ok: false, reason: `profile ${JSON.stringify(profile?.id ?? "?")} declares an unusable layout/tiers: ${problems.join("; ")}` };
  }
  const { layout, tiers } = profile;
  const specsDir = typeof overrides.specs === "string" && overrides.specs.trim() ? overrides.specs : layout.specs;
  const citationRoots = isStringList(overrides.citationRoots) ? [...overrides.citationRoots] : [...layout.citationRoots];
  const flows = layout.flows ? { dir: layout.flows.dir, exts: [...layout.flows.exts] } : null;
  return {
    ok: true,
    model: Object.freeze({
      profileId: typeof profile.id === "string" ? profile.id : null,
      specsDir,
      citationRoots: Object.freeze(citationRoots),
      citationExts: Object.freeze([...layout.citationExts]),
      flows: flows ? Object.freeze(flows) : null,
      buildDir: typeof layout.buildDir === "string" ? layout.buildDir : null,
      tiers: Object.freeze({
        names: Object.freeze([...tiers.names]),
        hostOnly: Object.freeze([...tiers.hostOnly]),
        satisfying: Object.freeze(Object.fromEntries(Object.entries(tiers.satisfying).map(([k, v]) => [k, Object.freeze([...v])]))),
        journey: tiers.journey ?? null,
        forFile: (rel) => {
          const t = tiers.forFile(rel);
          return typeof t === "string" && t ? t : "other";
        },
      }),
    }),
  };
}

/**
 * The model for a project root: manifest → profile (sync) → declarations,
 * with the manifest's layout fields overriding the profile's.
 * @param {string} root
 * @returns {{ok: true, model: SpecModel} | {ok: false, reason: string}}
 */
export function resolveSpecModel(root) {
  const manifest = resolveHarnessManifest(root);
  if (!manifest.ok) return { ok: false, reason: manifest.reason };
  const loaded = loadProfileSync(root, manifest.manifest.profile);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  return specModelFrom(loaded.profile, { specs: manifest.manifest.specs, citationRoots: manifest.manifest.citationRoots });
}

/**
 * resolveSpecModel for callers with no refusal channel: throws the reason.
 * @param {string} root
 * @returns {SpecModel}
 */
export function requireSpecModel(root) {
  const r = resolveSpecModel(root);
  if (!r.ok) throw new Error(r.reason);
  return r.model;
}

/**
 * @typedef {object} SpecModel
 * @property {string|null} profileId
 * @property {string} specsDir
 * @property {readonly string[]} citationRoots
 * @property {readonly string[]} citationExts
 * @property {{dir: string, exts: readonly string[]}|null} flows
 * @property {string|null} buildDir
 * @property {{names: readonly string[], hostOnly: readonly string[], satisfying: Record<string, readonly string[]>, journey: string|null, forFile: (rel: string) => string}} tiers
 */
