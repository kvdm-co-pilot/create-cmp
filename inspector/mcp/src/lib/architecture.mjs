// architecture.mjs — Architecture tab data (VERIFICATION-LAYER-DESIGN.md §7.1,
// rebuilt to the AD-1 three-in-one standard — the same bar console-tabs.mjs's
// componentsSectionHtml set): authored form (the tab mirrors
// template/docs/ARCHITECTURE.md's own section shape), derived truth (every
// fact from a REAL walk of the project on disk — never fabricated), and drift
// surface (the governed artifact's hash-bound approval status, plus a live
// import-vs-governed-clause violation scan). Six sections:
//   1. layerMap          — presentation/domain/data/di package+file lists, from
//                          a real walk of composeApp/src/commonMain/kotlin/**.
//   2. governedContract  — specs/app-base.spec.md clauses, via specs.mjs's
//                          parseSpecClauses (REUSE, not forked — same grammar
//                          the verify-lane and the Specs tab already use).
//   3. featureShape      — the exemplar `home` feature's real files on disk,
//                          labeled as the shape qa/scaffold-feature.mjs stamps.
//   4. dependencyGraph   — cross-layer import edges observed in the real
//                          source, with violations of the governed contract's
//                          own layer clauses (derived from the CLAUSE PROSE
//                          itself — see deriveLayerRules — never a hand-rolled
//                          rule table that could drift from the spec).
//   5. doc               — docs/ARCHITECTURE.md's own quality-attribute table,
//                          system-context table, platform/source-set table,
//                          runtime-view + crosscutting-policy prose, and ADR
//                          index — parsed structurally so the console section
//                          mirrors the document's own shape, never a
//                          paraphrase of it.
// Every section degrades to { available: false, reason } when its source is
// missing — this tab never invents a package, a clause, a file, an edge, or
// a doc section.

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

// --- Dependency graph + drift surface ---------------------------------------
//
// "An import that violates a governed clause draws as a violation arrow/chip
// ON the layer map with file:line, in red" — the forbidden edges themselves
// are NOT a hand-maintained rule table (that would be a second copy of the
// spec, free to drift from it): they're parsed straight out of the governed
// contract's own clause prose. ARCH-01/02/09/10 all share one shape —
// "Given any file in `X` ... Then none resolve into `Y`[, `Z`, or `W`]..." —
// deriveLayerRules extracts {from, to, clauseId} from any clause matching
// that shape; clauses with a different shape (ARCH-03..08, ARCH-11 — a test
// pairing, a try/catch ban, etc.) simply don't match and contribute nothing.
// A future ARCH clause written in the same shape is picked up with no code
// change here.

const LAYER_NAMES = new Set(["presentation", "domain", "data", "di", "core"]);
const CLAUSE_FROM_RE = /Given any file in `([A-Za-z]+)`/;
const CLAUSE_INTO_RE = /Then none resolve into ([^.(]+)/;

/**
 * @param {Array<{id: string, withdrawn: boolean, prose: string}>} clauses
 * @returns {Array<{clauseId: string, from: string, to: string}>}
 */
export function deriveLayerRules(clauses) {
  const rules = [];
  for (const c of clauses || []) {
    if (c.withdrawn) continue;
    const fromMatch = c.prose.match(CLAUSE_FROM_RE);
    const intoMatch = c.prose.match(CLAUSE_INTO_RE);
    if (!fromMatch || !intoMatch) continue;
    const from = fromMatch[1];
    if (!LAYER_NAMES.has(from)) continue;
    const toNames = [...intoMatch[1].matchAll(/`([A-Za-z]+)`/g)]
      .map((m) => m[1])
      .filter((n) => LAYER_NAMES.has(n) && n !== from);
    for (const to of toNames) rules.push({ clauseId: c.id, from, to });
  }
  return rules;
}

const IMPORT_RE = /^\s*import\s+([\w.]+)/;

/** Every top-level directory name directly under `packageDir` (one bucket per top-level package). */
function collectPackageBuckets(packageDir) {
  let entries;
  try {
    entries = fs.readdirSync(packageDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * The dependency graph (drift surface): every cross-layer import edge
 * actually observed in the source (`presentation -> domain`, `data ->
 * domain`, etc.), each with an occurrence count and file:line evidence, and
 * — where the governed contract resolves rules via deriveLayerRules — a
 * `violation`/`clauseId` flag on any edge the contract forbids. Import-based
 * ONLY (like handrolled-state.mjs's ARCH-11 mirror, this is a lightweight,
 * honestly-labeled PREVIEW, not the Kotlin-source-scanning gate itself — the
 * real ARCH-01/02/09/10 gates also catch fully-qualified INLINE references,
 * which this scan does not attempt). `rulesApplied: false` means no forbidden
 * edges could be derived at all (e.g. specs/app-base.spec.md missing) — an
 * empty `violations` list in that case means "unchecked", never "clean".
 * @param {string} root
 * @param {Array<{id: string, withdrawn: boolean, prose: string}>} [clauses] the governed contract's clauses (getGovernedContract().clauses)
 */
export function getDependencyGraph(root, clauses) {
  const kotlinRoot = path.join(root, "composeApp", "src", "commonMain", "kotlin");
  const packageDir = findPackageDir(kotlinRoot);
  if (!packageDir) {
    return { available: false, reason: `no 'presentation' directory found under ${toPosix(path.relative(root, kotlinRoot))}` };
  }
  const appPackage = toPosix(path.relative(kotlinRoot, packageDir)).split("/").join(".");
  const buckets = collectPackageBuckets(packageDir);
  const bucketSet = new Set(buckets);
  const rules = deriveLayerRules(clauses);
  const forbidden = new Map(rules.map((r) => [`${r.from}->${r.to}`, r.clauseId]));

  const edgeMap = new Map(); // "from->to" -> edge
  for (const bucket of buckets) {
    const dir = path.join(packageDir, bucket);
    for (const relFile of walkKotlinFiles(dir)) {
      const absFile = path.join(dir, relFile);
      const relFromRoot = toPosix(path.relative(root, absFile));
      let text;
      try {
        text = fs.readFileSync(absFile, "utf8");
      } catch {
        continue;
      }
      text.split("\n").forEach((line, idx) => {
        const m = line.match(IMPORT_RE);
        if (!m) return;
        const imported = m[1];
        if (!imported.startsWith(`${appPackage}.`)) return; // only app-internal imports are layer edges
        const targetBucket = imported.slice(appPackage.length + 1).split(".")[0];
        if (!bucketSet.has(targetBucket) || targetBucket === bucket) return;
        const key = `${bucket}->${targetBucket}`;
        if (!edgeMap.has(key)) {
          const clauseId = forbidden.get(key) || null;
          edgeMap.set(key, { from: bucket, to: targetBucket, count: 0, violation: Boolean(clauseId), clauseId, occurrences: [] });
        }
        const edge = edgeMap.get(key);
        edge.count++;
        edge.occurrences.push({ file: relFromRoot, line: idx + 1, imported });
      });
    }
  }
  const edges = [...edgeMap.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const violations = edges
    .filter((e) => e.violation)
    .flatMap((e) => e.occurrences.map((o) => ({ from: e.from, to: e.to, clauseId: e.clauseId, file: o.file, line: o.line, imported: o.imported })))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { available: true, appPackage, buckets: [...buckets].sort((a, b) => a.localeCompare(b)), edges, violations, rulesApplied: rules.length > 0 };
}

// --- docs/ARCHITECTURE.md structural mirror ---------------------------------
//
// "The console section mirrors that document's structure" — parsed
// structurally (headings + GFM tables), never paraphrased. Prose-only
// sections (system-context intro, runtime view, crosscutting policies) are
// handed to the caller as raw markdown; console-tabs.mjs's small prose
// renderer turns that into HTML (a rendering concern, kept out of this data
// module, same split as every other *Html function in this package).

/** Top-level ("## ") doc sections, in order; "### " subheadings stay inside a section's body. */
function extractDocSections(text) {
  const lines = text.split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(?!#)(.+?)\s*$/);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[1], body: "" };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) sections.push(current);
  return sections;
}

/** Every GFM table in `text`, as `{headers, rows}`, in document order. */
function parseMarkdownTables(text) {
  const lines = text.split("\n");
  const tables = [];
  let i = 0;
  const splitRow = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i].trim();
    const next = lines[i + 1] ? lines[i + 1].trim() : "";
    if (line.startsWith("|") && line.endsWith("|") && /^\|?\s*:?-{2,}/.test(next)) {
      const headers = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      tables.push({ headers, rows });
      continue;
    }
    i++;
  }
  return tables;
}

/** Markdown lines before the first table or fenced code block in `body` — the section's own intro prose. */
function proseBeforeFirstBlock(body) {
  const lines = body.split("\n");
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") || t.startsWith("```")) break;
    out.push(line);
  }
  const joined = out.join("\n").trim();
  return joined || null;
}

const DOC_REL = "docs/ARCHITECTURE.md";

/**
 * docs/ARCHITECTURE.md's own structure, parsed section by section — the
 * "authored form" the Architecture tab mirrors:
 *   - qualityAttributes: §1's Quality/Scenario/Backing table.
 *   - systemContext: §3's intro prose + its Integration table.
 *   - platformView: §4's source-set table (+ the expect/actual table, if a
 *     second table is present in that section).
 *   - runtimeView / crosscuttingPolicies: raw section markdown (rendered by
 *     console-tabs.mjs's prose renderer — this module hands back TEXT, never HTML).
 *   - decisions: §8's ADR index table.
 * `available: false` only when the doc file itself is missing/unreadable;
 * each sub-section independently reports its OWN availability when the doc
 * exists but a particular table/section can't be found in it (an older or
 * hand-edited doc never crashes this, and never fabricates a row).
 * @param {string} root
 */
export function getArchitectureDoc(root) {
  const docPath = path.join(root, ...DOC_REL.split("/"));
  if (!fs.existsSync(docPath)) return { available: false, reason: `${DOC_REL} not found` };
  let text;
  try {
    text = fs.readFileSync(docPath, "utf8");
  } catch (err) {
    return { available: false, reason: err && err.message ? err.message : String(err) };
  }
  const sections = extractDocSections(text);
  const byNumber = (n) => sections.find((s) => new RegExp(`^${n}\\.`).test(s.heading));

  const purpose = byNumber(1);
  const context = byNumber(3);
  const platform = byNumber(4);
  const runtime = byNumber(6);
  const crosscutting = byNumber(7);
  const decisions = byNumber(8);

  const purposeTables = purpose ? parseMarkdownTables(purpose.body) : [];
  const contextTables = context ? parseMarkdownTables(context.body) : [];
  const platformTables = platform ? parseMarkdownTables(platform.body) : [];
  const decisionsTables = decisions ? parseMarkdownTables(decisions.body) : [];

  return {
    available: true,
    file: DOC_REL,
    qualityAttributes: purposeTables[0]
      ? { available: true, headers: purposeTables[0].headers, rows: purposeTables[0].rows }
      : { available: false, reason: `no table found under "${purpose ? purpose.heading : "1. Purpose & quality goals"}"` },
    systemContext: context
      ? {
          available: true,
          heading: context.heading,
          intro: proseBeforeFirstBlock(context.body),
          table: contextTables[0] ? { headers: contextTables[0].headers, rows: contextTables[0].rows } : null,
        }
      : { available: false, reason: `no "3. System context" section found` },
    platformView: platformTables[0]
      ? {
          available: true,
          headers: platformTables[0].headers,
          rows: platformTables[0].rows,
          expectActual: platformTables[1] ? { headers: platformTables[1].headers, rows: platformTables[1].rows } : null,
        }
      : { available: false, reason: `no table found under "${platform ? platform.heading : "4. Platform & deployment view"}"` },
    runtimeView: runtime
      ? { available: true, heading: runtime.heading, body: runtime.body.trim() }
      : { available: false, reason: `no "6. Runtime view" section found` },
    crosscuttingPolicies: crosscutting
      ? { available: true, heading: crosscutting.heading, body: crosscutting.body.trim() }
      : { available: false, reason: `no "7. Crosscutting policies" section found` },
    decisions: decisionsTables[0]
      ? { available: true, headers: decisionsTables[0].headers, rows: decisionsTables[0].rows }
      : { available: false, reason: `no ADR table found under "${decisions ? decisions.heading : "8. Decisions & glossary"}"` },
  };
}

/** All Architecture tab sections in one call (what the console route handler needs). */
export function getArchitectureData(root) {
  const governedContract = getGovernedContract(root);
  return {
    layerMap: getLayerMap(root),
    governedContract,
    featureShape: getFeatureShape(root),
    dependencyGraph: getDependencyGraph(root, governedContract.available ? governedContract.clauses : []),
    doc: getArchitectureDoc(root),
  };
}
