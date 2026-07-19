// architecture.mjs — Architecture tab data (VERIFICATION-LAYER-DESIGN.md §7.1):
// "see what you sign" before approving governed artifacts. Three sections, ALL
// derived from a REAL walk of the project on disk — never fabricated:
//   1. layerMap         — presentation/domain/data/di package+file lists, from
//                          a real walk of composeApp/src/commonMain/kotlin/**.
//   2. governedContract  — specs/app-base.spec.md clauses, via specs.mjs's
//                          parseSpecClauses (REUSE, not forked — same grammar
//                          the verify-lane and the Specs tab already use).
//   3. featureShape      — the exemplar `home` feature's real files on disk,
//                          labeled as the shape qa/scaffold-feature.mjs stamps.
// Every section degrades to { available: false, reason } when its source is
// missing — this tab never invents a package, a clause, or a file.

import fs from "node:fs";
import path from "node:path";
import { parseSpecClauses } from "./specs.mjs";

const KNOWN_LAYERS = [
  { id: "presentation", label: "presentation (screens, navigation, theme — the human-facing layer)" },
  { id: "domain", label: "domain (models, repository interfaces, use cases — no platform/UI deps)" },
  { id: "data", label: "data (repository implementations, local/remote sources)" },
  { id: "di", label: "di (dependency wiring — composes the above)" },
];

/**
 * Find the app's kotlin package directory under commonMain: a real fs walk
 * for the first directory that itself contains a `presentation` subdirectory
 * (every create-cmp scaffold has `presentation` as a DIRECT child of the
 * package dir). Deliberately NOT a build.gradle.kts namespace parse (unlike
 * approvals.mjs's resolvePackageDir) — this file's job is to describe the
 * tree AS FOUND on disk, and a walk finds a renamed/moved package dir just as
 * reliably.
 * @returns {string|null} absolute path to the package dir, or null if no
 *   `presentation` directory exists anywhere under commonMain/kotlin.
 */
function findPackageDir(kotlinRoot) {
  if (!fs.existsSync(kotlinRoot)) return null;
  let found = null;
  (function walk(dir) {
    if (found) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isDirectory() && e.name === "presentation")) {
      found = dir;
      return;
    }
    for (const e of entries) {
      if (found) return;
      if (e.isDirectory()) walk(path.join(dir, e.name));
    }
  })(kotlinRoot);
  return found;
}

/** Every `.kt`/`.kts` file under `dir` (recursive), as POSIX-style paths relative to `dir`, sorted. */
function walkKotlinFiles(dir, relPrefix = "") {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkKotlinFiles(abs, rel));
    else if (e.name.endsWith(".kt") || e.name.endsWith(".kts")) out.push(rel);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

/**
 * The layer map (§7.1): presentation/domain/data/di, each with the real files
 * found under it (relative to the layer dir; empty when the dir is absent —
 * "an honest empty state" per the design doc), plus any OTHER top-level
 * packages present (e.g. a `core` package) so nothing on disk is silently
 * dropped. `navigation` is not broken out separately — it's a real
 * subdirectory of `presentation` and appears in that layer's file list, which
 * is the "navigation shown as part of presentation" the design doc asks for.
 * @param {string} root project root
 */
export function getLayerMap(root) {
  const kotlinRoot = path.join(root, "composeApp", "src", "commonMain", "kotlin");
  const packageDir = findPackageDir(kotlinRoot);
  if (!packageDir) {
    return { available: false, reason: `no 'presentation' directory found under ${toPosix(path.relative(root, kotlinRoot))}` };
  }
  const appPackage = toPosix(path.relative(kotlinRoot, packageDir)).split("/").join(".");
  let topLevel;
  try {
    topLevel = fs
      .readdirSync(packageDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    topLevel = [];
  }
  const knownIds = new Set(KNOWN_LAYERS.map((l) => l.id));
  const layers = KNOWN_LAYERS.map(({ id, label }) => {
    const dir = path.join(packageDir, id);
    const present = fs.existsSync(dir);
    return { id, label, present, files: present ? walkKotlinFiles(dir) : [] };
  });
  const otherPackages = topLevel
    .filter((name) => !knownIds.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, files: walkKotlinFiles(path.join(packageDir, name)) }));
  return { available: true, appPackage, kotlinRoot: toPosix(path.relative(root, kotlinRoot)), layers, otherPackages };
}

/**
 * The governed contract (§7.1): specs/app-base.spec.md's clauses, via
 * specs.mjs's parseSpecClauses — the SAME grammar the Specs tab and the
 * verify-lane's stepSpecCoverage already use (never forked here).
 * @param {string} root
 */
export function getGovernedContract(root) {
  const file = "app-base.spec.md";
  const specPath = path.join(root, "specs", file);
  if (!fs.existsSync(specPath)) {
    return { available: false, reason: `specs/${file} not found` };
  }
  try {
    return { available: true, file, clauses: parseSpecClauses(root, file) };
  } catch (err) {
    return { available: false, reason: err && err.message ? err.message : String(err) };
  }
}

// The exemplar `home` feature's own domain/data/test files — mirroring
// template/qa/lib/approvals.mjs's EXEMPLAR_FEATURE_KOTLIN_FILES (the exact
// `from:` side of qa/scaffold-feature.mjs's ALL_FILES). NOT imported: this
// package owns inspector/mcp/**, not template/qa/** (see approvals-bridge.mjs
// for why a static cross-package import isn't possible), so the filenames
// are kept here as a small constant — safe because the exemplar is always
// named `home`/`Item` in every create-cmp scaffold (fixed by the stamper's
// own `from:` list, not a guess) — and every entry is checked for REAL
// existence on disk below; a file only appears in the tree if it's actually
// there.
const EXEMPLAR_FEATURE_FILES = [
  { sourceSet: "commonMain", rel: "domain/model/Item.kt" },
  { sourceSet: "commonMain", rel: "domain/repository/ItemRepository.kt" },
  { sourceSet: "commonMain", rel: "domain/usecase/GetItemsUseCase.kt" },
  { sourceSet: "commonMain", rel: "data/remote/ItemRepositoryImpl.kt" },
  { sourceSet: "commonTest", rel: "testing/fakes/FakeItemRepository.kt" },
  { sourceSet: "commonMain", rel: "presentation/home/HomeScreen.kt" },
  { sourceSet: "commonMain", rel: "presentation/home/HomeViewModel.kt" },
  { sourceSet: "commonTest", rel: "presentation/home/HomeViewModelTest.kt" },
  { sourceSet: "desktopTest", rel: "presentation/home/HomeScreenTest.kt" },
  { sourceSet: "desktopTest", rel: "presentation/home/HomeGoldenTreeTest.kt" },
];
const SOURCE_SETS = {
  commonMain: "composeApp/src/commonMain/kotlin",
  commonTest: "composeApp/src/commonTest/kotlin",
  desktopTest: "composeApp/src/desktopTest/kotlin",
};
const EXEMPLAR_SPEC_REL = "specs/home.spec.md";

/**
 * The feature shape (§7.1): the exemplar `home` feature's REAL files on disk
 * right now — a real walk of presentation/home (picks up ANY file actually
 * there, including ones the exemplar list above doesn't name, e.g. an added
 * DetailScreen.kt) plus the known domain/data/test/spec files, each checked
 * for existence before being listed. Never fabricates a file that isn't on
 * disk; `available:false` only when NOTHING of the shape resolves.
 * @param {string} root
 */
export function getFeatureShape(root) {
  const kotlinRoot = path.join(root, "composeApp", "src", "commonMain", "kotlin");
  const packageDir = findPackageDir(kotlinRoot);
  if (!packageDir) {
    return { available: false, reason: `no 'presentation' directory found under ${toPosix(path.relative(root, kotlinRoot))}` };
  }
  const packageRel = toPosix(path.relative(kotlinRoot, packageDir));
  const homeDir = path.join(packageDir, "presentation", "home");
  const presentationBase = `composeApp/src/commonMain/kotlin/${packageRel}/presentation/home`;
  const presentationFiles = fs.existsSync(homeDir)
    ? walkKotlinFiles(homeDir).map((f) => `${presentationBase}/${f}`)
    : [];
  const knownFiles = EXEMPLAR_FEATURE_FILES.map(
    ({ sourceSet, rel }) => `${SOURCE_SETS[sourceSet]}/${packageRel}/${rel}`,
  ).filter((relPath) => fs.existsSync(path.join(root, ...relPath.split("/"))));
  if (fs.existsSync(path.join(root, ...EXEMPLAR_SPEC_REL.split("/")))) knownFiles.push(EXEMPLAR_SPEC_REL);
  const files = [...new Set([...presentationFiles, ...knownFiles])].sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    return {
      available: false,
      reason:
        "no home-feature files found on disk (presentation/home is empty/missing and none of the " +
        "exemplar domain/data/spec files resolved)",
    };
  }
  return { available: true, files };
}

/** All three Architecture tab sections in one call (what the console route handler needs). */
export function getArchitectureData(root) {
  return {
    layerMap: getLayerMap(root),
    governedContract: getGovernedContract(root),
    featureShape: getFeatureShape(root),
  };
}
