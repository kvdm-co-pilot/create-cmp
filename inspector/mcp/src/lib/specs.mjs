// specs.mjs — Specs section data (STUDIO-REDESIGN.md §3.5, the QA lead's
// traceability matrix): per spec file, the clause list (id + prose,
// struck-through when withdrawn), each live clause's citing tests
// (file:line), and the orphan defects in BOTH directions — a live clause no
// test cites, and a `SPEC:` tag citing a withdrawn or nonexistent clause.
//
// The clause-line grammar mirrors qa/verify.mjs's stepSpecCoverage CLAUSE_LINE_RE
// (template/qa/verify.mjs:108, `- **ID** ...` / withdrawn `- ~~**ID**...~~`) and the
// citation-tag grammar mirrors its TAG_LINE_RE/TAG_IDS_RE (:119-120, `// SPEC: ID` /
// `# SPEC: ID`) — same grammar, so a clause or a tag reads identically here and in
// the verify-lane gate. This is still the console's own advisory scan, not the
// gate: stepSpecCoverage's FAIL construction stays in template/qa/verify.mjs
// (file ownership: inspector/mcp/**, never template/qa/**); the RTM renders
// the same facts read-only, and the lane remains the law.

import fs from "node:fs";
import path from "node:path";

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
  const dirs = [path.join(root, "composeApp", "src"), path.join(root, "qa", "e2e")];
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
  const specsDir = path.join(root, "specs");
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
  const lines = fs.readFileSync(path.join(root, "specs", file), "utf8").split("\n");
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
  const files = listSpecFiles(root);
  if (files.length === 0) return { available: false };
  const citations = citationIndex(root);
  const parsed = files.map((file) => ({ file, clauses: parseSpecClauses(root, file) }));
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
    files: parsed.map(({ file, clauses }) => ({
      file,
      clauses: clauses.map((c) => ({
        ...c,
        cited: c.withdrawn ? null : citations.has(c.id),
        citedBy: c.withdrawn ? [] : citations.get(c.id) || [],
      })),
    })),
    orphanCitations,
  };
}
