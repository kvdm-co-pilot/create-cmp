// profiles/cmp/affected.mjs — which changes fan out too widely to subset the
// test suite, and how a changed Compose source maps to a Gradle test filter.
// Mobile's, by definition (docs/NORTH-STAR.md §6).
//
// Stage 0 PR 6d. qa/lib/affected-tests.mjs held both halves: the HONESTY
// CONTRACT (fail open, never fail silent; lane outputs are not changes; an
// unmapped change runs everything) and the STACK RULES (`.gradle.kts` rewires
// compilation, `di/` rewires the object graph, `theme/` and
// `presentation/components/` render into every screen, anything outside
// composeApp/src is not a scoped source edit, and a `.kt` file's parent
// directory is a package segment a Gradle `--tests "*seg*"` pattern matches).
//
// The first half is the core's and is what makes the subsetting safe at all.
// The second half is a description of one build tool and one source layout,
// and vendored into a repo with neither it did something worse than nothing:
// EVERY path failed the `composeApp/src` test, so every fast run fell open to
// the full suite — the optimisation silently off, visible only in one
// parenthetical nobody reads.
//
// The pack passes this module to deriveAffectedFilter. Nothing resolves a
// manifest: the pack already IS the profile, and it can hand the core its own
// rules directly.

import path from "node:path";
import { layout } from "./declarations.mjs";

/**
 * Paths whose change fans out too widely to subset the suite safely. Returns
 * the human-readable category when `p` is broad-impact, else null. Checked in
 * order; the first match names the reason. The core adds its own neutral rule
 * (qa/ is the harness judging itself) before consulting this.
 * @param {string} p POSIX relpath from the project root
 * @returns {string|null}
 */
export function broadImpact(p) {
  if (p.endsWith(".gradle.kts") || p === "gradle.properties" || p === "gradle/libs.versions.toml") {
    return "build files rewire compilation";
  }
  if (/(^|\/)di\//.test(p)) return "DI rewires the object graph";
  if (/(^|\/)theme\//.test(p)) return "theme/tokens render into every screen";
  if (p.includes("presentation/components/")) return "shared components render into every screen";
  if (!p.startsWith("composeApp/src/")) return "outside composeApp/src";
  return null;
}

/**
 * The Gradle `--tests` patterns for a set of changed paths, or [] when nothing
 * maps (the core then runs everything and says so).
 *
 * Deliberately simple and defensible: each changed `.kt` file under
 * composeApp/src contributes its package's last segment — the parent directory
 * name (`…/presentation/home/HomeViewModel.kt` → `home`, which the template's
 * package-mirrors-path conformance makes a package segment) — and the union
 * becomes patterns matched against test class FQNs. Coarse on purpose:
 * `*home*` runs every test whose FQN mentions the feature, which over-selects
 * a little and under-maintains nothing.
 * @param {string[]} paths POSIX relpaths, already known not to be broad-impact
 * @returns {{patterns: string[], sourcePaths: string[]}}
 */
export function patternsFor(paths) {
  const ktPaths = paths.filter((p) => p.endsWith(".kt"));
  const segments = new Set();
  for (const p of ktPaths) {
    const seg = path.posix.basename(path.posix.dirname(p));
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(seg)) segments.add(seg);
  }
  return { patterns: [...segments].sort().map((s) => `*${s}*`), sourcePaths: ktPaths };
}

// ── The feature scope (qa/lib/affected-tests.mjs deriveFeatureScope) ────────
// What the pre-merge check (`verify --profile feature`) needs beyond the fast
// filter: which paths no test can see, which feature a path belongs to, and
// which files are per-feature by NAME. All of it is this layout's — where
// docs, ledgers, flows and goldens live — never the core's.

/** Where the flows live — declarations.mjs's `layout.flows`, read rather than restated. */
const FLOW_DIR = layout.flows.dir;
const FLOW_EXTS = layout.flows.exts;
const GOLDEN_RE = /^qa\/golden\/([^/]+)\.json$/;
/** presentation/<dir>/ that are shared by every screen, never one feature. */
const SHARED_PRESENTATION = new Set(["brand", "components", "navigation", "theme"]);
/** specs/<name>.spec.md that describe the whole app, never one feature. */
const APP_WIDE_SPECS = new Set(["app-base", "intent"]);
const FEATURE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Can this path change a test outcome? False = declared irrelevant: prose
 * (docs/, any Markdown outside the app's sources — specs included, whose
 * clauses the full lane's specCoverage reads nightly), the approvals and
 * comments ledgers, and agent/hook configuration. A path nobody classified
 * stays relevant — the declaration is of irrelevance, never of relevance
 * (deriveTierNeed's rule, for the same reason).
 * @param {string} p POSIX relpath
 * @returns {boolean}
 */
export function testIrrelevant(p) {
  if (p.startsWith("docs/") || p.startsWith(".claude/") || p.startsWith(".githooks/")) return true;
  if (p.endsWith(".md") && !p.startsWith("composeApp/")) return true;
  return p === "qa/approvals.json" || p === "qa/comments.json" || p === "LICENSE";
}

/** Is this path an e2e flow the lane drives (a top-level YAML under qa/e2e)? */
export function isFlow(p) {
  return path.posix.dirname(p) === FLOW_DIR && FLOW_EXTS.some((ext) => p.endsWith(ext));
}

/** A file named after its feature — a flow, a golden baseline: it scopes to that feature, never broad. */
export function perFeature(p) {
  return isFlow(p) || GOLDEN_RE.test(p);
}

/**
 * The features a set of paths touches, by this layout's naming: the package
 * directory under `presentation/`, a flow's or golden's basename, a spec's or
 * a feature brief's name. Shared presentation directories and app-wide specs
 * name no feature; a name that is not an identifier (`app-base`) is dropped,
 * since it becomes a Gradle `--tests` pattern.
 * @param {string[]} paths POSIX relpaths
 * @returns {string[]}
 */
export function featureNames(paths) {
  const names = new Set();
  for (const p of paths) {
    let name = null;
    const pres = p.startsWith("composeApp/src/") ? p.match(/\/presentation\/([^/]+)\//) : null;
    if (pres && !SHARED_PRESENTATION.has(pres[1])) name = pres[1];
    else if (isFlow(p)) name = path.posix.basename(p).replace(/\.[^.]+$/, "");
    else if (GOLDEN_RE.test(p)) name = p.match(GOLDEN_RE)[1];
    else if (/^specs\/[^/]+\.spec\.md$/.test(p)) name = path.posix.basename(p, ".spec.md");
    else if (/^docs\/features\/[^/]+\.(md|json)$/.test(p)) name = path.posix.basename(p).replace(/\.(md|json)$/, "");
    if (name && FEATURE_NAME_RE.test(name) && !APP_WIDE_SPECS.has(name)) names.add(name);
  }
  return [...names].sort();
}

/** The mapping the pack hands to qa/lib/affected-tests.mjs. */
export const affected = Object.freeze({ broadImpact, patternsFor, testIrrelevant, isFlow, perFeature, featureNames, flowDir: FLOW_DIR });
