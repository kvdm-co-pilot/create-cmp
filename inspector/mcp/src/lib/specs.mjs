// specs.mjs — Specs section data (STUDIO-REDESIGN.md §3.5, the QA lead's
// traceability matrix): per spec file, the clause list (id + prose,
// struck-through when withdrawn), each live clause's citing tests
// (file:line), and the orphan defects in BOTH directions — a live clause no
// test cites, and a `SPEC:` tag citing a withdrawn or nonexistent clause.
//
// The clause-line grammar mirrors qa/verify.mjs's stepSpecCoverage CLAUSE_LINE_RE
// (`- **ID** ...` / withdrawn `- ~~**ID**...~~`) and the citation-tag grammar
// mirrors its TAG_LINE_RE/TAG_IDS_RE (`// SPEC: ID` / `# SPEC: ID`) — keep the
// two in sync BY HAND: stepSpecCoverage's regexes are function-local in a
// script that runs on import, so no cross-package parity test can pin them. This is still the console's own advisory scan, not the
// gate: stepSpecCoverage's FAIL construction stays in template/qa/verify.mjs
// (file ownership: inspector/mcp/**, never template/qa/**); the RTM renders
// the same facts read-only, and the lane remains the law.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveProjectLayout, DEFAULT_LAYOUT } from "./project-layout.mjs";

// The project's spec directory and citation roots (qa/harness-manifest.json,
// or the Compose default). A malformed manifest resolves to the default HERE
// only for the synchronous helpers below, which older callers and tests use
// directly; getProjectSpecsData — the console's entry point — refuses it.
function layoutOf(root) {
  const resolved = resolveProjectLayout(root);
  return resolved.ok ? resolved.layout : DEFAULT_LAYOUT;
}
const specsDirOf = (root) => path.join(root, ...layoutOf(root).specs.split("/"));

const CLAUSE_LINE_RE = /^-\s+(~~)?\*\*([A-Z][A-Z0-9]*-\d{2,})\*\*(.*)$/;
const TAG_LINE_RE = /^(?:\/\/|#)\s*SPEC:/;
const TAG_IDS_RE = /SPEC:\s*([A-Z0-9,\s-]+)/;
const CODE_EXTS = [".kt", ".kts", ".yaml", ".yml"];

function stripProse(s) {
  return String(s)
    .replace(/^\s*[—-]\s*/, "")
    .replace(/~~\s*$/, "")
    .trim();
}

function walkCodeFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkCodeFiles(p));
    else if (CODE_EXTS.some((ext) => e.name.endsWith(ext))) out.push(p);
  }
  return out;
}

/**
 * Every `// SPEC:`/`# SPEC:` citation anywhere under composeApp/src or qa/e2e,
 * indexed by clause id — the id plus WHERE it was cited (file relative to the
 * project root, 1-based line), so the RTM can name the citing tests rather
 * than only claim "covered". One scan serves both the per-clause `citedBy`
 * lists and the orphan-citation check.
 * @returns {Map<string, Array<{file: string, line: number}>>}
 */
function citationIndex(root) {
  const dirs = layoutOf(root).citationRoots.map((rel) => path.join(root, ...rel.split("/")));
  const index = new Map();
  for (const dir of dirs) {
    for (const file of walkCodeFiles(dir)) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      fs.readFileSync(file, "utf8").split("\n").forEach((line, idx) => {
        const trimmed = line.trim();
        if (!TAG_LINE_RE.test(trimmed)) return;
        const m = trimmed.match(TAG_IDS_RE);
        if (!m) return;
        for (const id of m[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)) {
          if (!index.has(id)) index.set(id, []);
          index.get(id).push({ file: rel, line: idx + 1 });
        }
      });
    }
  }
  return index;
}

/** @returns {string[]} `*.spec.md` file names under specs/, sorted; [] if no specs/ dir. */
export function listSpecFiles(root) {
  const specsDir = specsDirOf(root);
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir)
    .filter((f) => f.endsWith(".spec.md"))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Parse one spec file's clauses. A clause's prose accumulates continuation
 * lines (indented text under the `- **ID** ...` line) until the next clause,
 * a blank line, or another list/quote marker.
 * @returns {Array<{id: string, withdrawn: boolean, prose: string}>}
 */
export function parseSpecClauses(root, file) {
  return parseClauseLines(fs.readFileSync(path.join(specsDirOf(root), file), "utf8"));
}

/** parseSpecClauses over raw text — the grammar, separated from the file lookup. */
export function parseClauseLines(text) {
  const lines = String(text).split("\n");
  const clauses = [];
  let current = null;
  const flush = () => {
    if (current) {
      current.prose = current.prose.trim();
      clauses.push(current);
      current = null;
    }
  };
  for (const raw of lines) {
    const m = raw.match(CLAUSE_LINE_RE);
    if (m) {
      flush();
      current = { id: m[2], withdrawn: Boolean(m[1]), prose: stripProse(m[3]) };
      continue;
    }
    const trimmed = raw.trim();
    if (current && trimmed && !trimmed.startsWith("-") && !trimmed.startsWith(">") && !trimmed.startsWith("#")) {
      current.prose += ` ${stripProse(trimmed)}`;
    } else {
      flush();
    }
  }
  flush();
  return clauses;
}

/**
 * Specs section data (the RTM's facts): every spec file's clauses, each with
 * - `cited`: `true`/`false` for live clauses, `null` — coverage N/A — for
 *   withdrawn ones, mirroring stepSpecCoverage's exemption;
 * - `citedBy`: the citing tests as `{file, line}` (empty for an uncited or
 *   withdrawn clause — a withdrawn clause CAN still carry stale citations,
 *   which surface as orphanCitations, not as coverage);
 * plus `orphanCitations` — every `SPEC:` tag whose id resolves to a withdrawn
 * clause or to no clause in any spec file, each with its file:line and the
 * derived reason. `available:false` when the project has no specs/ directory
 * at all; values are never fabricated.
 * @param {string} root
 * @returns {{available: boolean, files?: Array<{file: string, clauses: Array<{id: string, withdrawn: boolean, prose: string, cited: boolean|null, citedBy: Array<{file: string, line: number}>}>}>, orphanCitations?: Array<{id: string, file: string, line: number, reason: string}>}}
 */
export function getSpecsData(root) {
  const specsRel = layoutOf(root).specs;
  const files = listSpecFiles(root);
  if (files.length === 0) return { available: false, specsDir: `${specsRel}/` };
  const citations = citationIndex(root);
  const parsed = files.map((file) => ({ file, relPath: `${specsRel}/${file}`, clauses: parseSpecClauses(root, file) }));
  const liveIds = new Set();
  const withdrawnIds = new Set();
  for (const f of parsed) {
    for (const c of f.clauses) (c.withdrawn ? withdrawnIds : liveIds).add(c.id);
  }
  const orphanCitations = [];
  for (const [id, sites] of citations) {
    if (liveIds.has(id)) continue;
    const reason = withdrawnIds.has(id) ? "cites a withdrawn clause" : "cites no clause in any spec file";
    for (const site of sites) orphanCitations.push({ id, file: site.file, line: site.line, reason });
  }
  orphanCitations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return {
    available: true,
    source: "console-scan",
    specsDir: `${specsRel}/`,
    files: parsed.map(({ file, relPath, clauses }) => ({
      file,
      relPath,
      clauses: clauses.map((c) => ({
        ...c,
        cited: c.withdrawn ? null : citations.has(c.id),
        citedBy: c.withdrawn ? [] : citations.get(c.id) || [],
      })),
    })),
    orphanCitations,
  };
}

// ── Bridge: the project's OWN spec-coverage scanner ─────────────────────────
// The grammar above is the Compose template's. An adopter may govern a
// different one — payment-blueprint's clauses are `### ID — title` headings
// with a `status:` line, and its citations are bound to the test under them
// — and its lane's specCoverage step reads them fine while this console said
// "no clauses parsed" about the same thirteen files. Forking that grammar in
// here would be the "keep in sync BY HAND" mistake a second time. So, the
// same stance approvals-bridge.mjs takes for qa/lib/approvals.mjs: when the
// project ships qa/lib/spec-coverage.mjs with scanSpecClauses/scanCitations,
// THOSE are the law and the console renders what they return; the scan above
// is the fallback for a project without them.
//
// Two return shapes are known and both are read, never re-derived:
//   create-cmp's:  scanSpecClauses → Map<id, {file, withdrawn, requiredTier}>
//                  scanCitations   → Array<{id, file, line, tier}>
//   an adopter's:  scanSpecClauses → {clauses: Map<id, {id, title, status, file, line}>, …}
//                  scanCitations   → {citations: Array<{id, file, line}>, …}
// Anything else degrades to the console's own scan with the reason recorded.

const SPEC_COVERAGE_REL_PATH = "qa/lib/spec-coverage.mjs";
const specLibCache = new Map(); // root -> module (successful loads only; a miss is re-probed)

async function loadSpecCoverageLib(root) {
  if (specLibCache.has(root)) return specLibCache.get(root);
  const libPath = path.join(root, ...SPEC_COVERAGE_REL_PATH.split("/"));
  if (!fs.existsSync(libPath)) return null;
  let mod;
  try {
    mod = await import(pathToFileURL(libPath).href);
  } catch {
    return null;
  }
  specLibCache.set(root, mod);
  return mod;
}

/** Test/ops seam, mirroring resetApprovalsBridgeCache. */
export function resetSpecsBridgeCache(root) {
  if (root) specLibCache.delete(root);
  else specLibCache.clear();
}

function normalizeClauses(scanned) {
  const map = scanned instanceof Map ? scanned : scanned && scanned.clauses instanceof Map ? scanned.clauses : null;
  if (!map) return null;
  const out = [];
  for (const [id, entry] of map) {
    if (!entry || typeof entry !== "object") continue;
    const file = typeof entry.file === "string" ? entry.file.split(path.sep).join("/") : null;
    if (!file) continue;
    // Withdrawn: create-cmp's flag, or an adopter status that is not active
    // and not draft (a draft clause is live-but-uncounted, never struck).
    const withdrawn = entry.withdrawn === true || (typeof entry.status === "string" && !["active", "draft"].includes(entry.status));
    out.push({
      id,
      file,
      withdrawn,
      status: typeof entry.status === "string" ? entry.status : null,
      title: typeof entry.title === "string" ? entry.title : null,
      line: typeof entry.line === "number" ? entry.line : null,
    });
  }
  return out;
}

function normalizeCitations(scanned) {
  const list = Array.isArray(scanned) ? scanned : scanned && Array.isArray(scanned.citations) ? scanned.citations : null;
  if (!list) return null;
  const index = new Map();
  for (const c of list) {
    if (!c || typeof c.id !== "string" || typeof c.file !== "string") continue;
    if (!index.has(c.id)) index.set(c.id, []);
    index.get(c.id).push({ file: c.file.split(path.sep).join("/"), line: typeof c.line === "number" ? c.line : 0 });
  }
  return index;
}

/**
 * Specs section data via the project's own scanner when it has one, else the
 * console's scan (getSpecsData). Same shape as getSpecsData plus `source`
 * ("project-lib" | "console-scan") so the page can say whose reading it is.
 * A malformed qa/harness-manifest.json is refused here with its reason.
 * @param {string} root
 */
export async function getProjectSpecsData(root) {
  const resolved = resolveProjectLayout(root);
  if (!resolved.ok) return { available: false, reason: resolved.reason };
  const specsRel = resolved.layout.specs;
  const lib = await loadSpecCoverageLib(root);
  if (!lib || typeof lib.scanSpecClauses !== "function" || typeof lib.scanCitations !== "function") {
    return getSpecsData(root);
  }
  let clauseRows;
  let citations;
  try {
    clauseRows = normalizeClauses(lib.scanSpecClauses(root));
    citations = normalizeCitations(lib.scanCitations(root));
  } catch (err) {
    const fallback = getSpecsData(root);
    return { ...fallback, bridgeError: `${SPEC_COVERAGE_REL_PATH} threw (${err && err.message ? err.message : String(err)}) — showing the console's own scan` };
  }
  if (!clauseRows || !citations) {
    const fallback = getSpecsData(root);
    return { ...fallback, bridgeError: `${SPEC_COVERAGE_REL_PATH} returned a shape this console does not read — showing the console's own scan` };
  }

  // Group by spec file, in the project's own file order (its specFiles() when
  // exported, else the directory listing), so a file with zero clauses still
  // gets its heading and an honest "no clauses parsed".
  let fileOrder;
  if (typeof lib.specFiles === "function") {
    try {
      fileOrder = lib.specFiles(root).map((f) => String(f).split(path.sep).join("/"));
    } catch {
      fileOrder = null;
    }
  }
  if (!fileOrder) fileOrder = listSpecFiles(root).map((f) => `${specsRel}/${f}`);
  for (const c of clauseRows) if (!fileOrder.includes(c.file)) fileOrder.push(c.file);
  if (fileOrder.length === 0) return { available: false, source: "project-lib", specsDir: `${specsRel}/` };

  // Prose: the console's own grammar can still read a `- **ID** —` line for
  // the requirement text; where it cannot (another grammar), the project
  // scanner's title stands in. Never invented.
  const proseByFile = new Map();
  const proseFor = (relFile, id, title) => {
    if (!proseByFile.has(relFile)) {
      let parsed = [];
      try {
        parsed = parseClauseLines(fs.readFileSync(path.join(root, ...relFile.split("/")), "utf8"));
      } catch {
        parsed = [];
      }
      proseByFile.set(relFile, new Map(parsed.map((c) => [c.id, c.prose])));
    }
    return proseByFile.get(relFile).get(id) ?? title ?? "";
  };

  const liveIds = new Set();
  const withdrawnIds = new Set();
  for (const c of clauseRows) (c.withdrawn ? withdrawnIds : liveIds).add(c.id);
  const files = fileOrder.map((relFile) => ({
    file: relFile.split("/").pop(),
    relPath: relFile,
    clauses: clauseRows
      .filter((c) => c.file === relFile)
      .map((c) => ({
        id: c.id,
        withdrawn: c.withdrawn,
        status: c.status,
        prose: proseFor(relFile, c.id, c.title),
        cited: c.withdrawn ? null : citations.has(c.id),
        citedBy: c.withdrawn ? [] : citations.get(c.id) || [],
      })),
  }));
  const orphanCitations = [];
  for (const [id, sites] of citations) {
    if (liveIds.has(id)) continue;
    const reason = withdrawnIds.has(id) ? "cites a withdrawn clause" : "cites no clause in any spec file";
    for (const site of sites) orphanCitations.push({ id, file: site.file, line: site.line, reason });
  }
  orphanCitations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { available: true, source: "project-lib", specsDir: `${specsRel}/`, files, orphanCitations };
}
