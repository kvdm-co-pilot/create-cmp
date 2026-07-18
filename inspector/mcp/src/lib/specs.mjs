// specs.mjs — Specs tab data (VERIFICATION-LAYER-DESIGN.md §4): per spec file,
// the clause list (id + prose, struck-through when withdrawn) plus a best-effort
// "is this clause cited by a durable test right now?" badge.
//
// The clause-line grammar mirrors qa/verify.mjs's stepSpecCoverage CLAUSE_LINE_RE
// (template/qa/verify.mjs:108, `- **ID** ...` / withdrawn `- ~~**ID**...~~`) and the
// citation-tag grammar mirrors its TAG_LINE_RE/TAG_IDS_RE (:119-120, `// SPEC: ID` /
// `# SPEC: ID`) — same grammar, so a clause or a tag reads identically here and in
// the verify-lane gate.
//
// What this file DELIBERATELY does NOT do: reproduce stepSpecCoverage's bidirectional
// orphan-clause / orphan-tag FAIL-message construction (which clause has no test,
// which tag cites a withdrawn/nonexistent clause, with file:line detail). That's
// meaningfully more logic than a "cited yes/no" badge needs, and duplicating it here
// would fork template/qa/verify.mjs's actual gate logic — out of scope for this
// package (file ownership: inspector/mcp/**, never template/qa/**). See VL-4's report
// for the extraction this would need if tighter parity is wanted later.

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

/** Every `// SPEC:`/`# SPEC:` id cited anywhere under composeApp/src or qa/e2e. */
function citedClauseIds(root) {
  const dirs = [path.join(root, "composeApp", "src"), path.join(root, "qa", "e2e")];
  const cited = new Set();
  for (const dir of dirs) {
    for (const file of walkCodeFiles(dir)) {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!TAG_LINE_RE.test(trimmed)) continue;
        const m = trimmed.match(TAG_IDS_RE);
        if (!m) continue;
        for (const id of m[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)) cited.add(id);
      }
    }
  }
  return cited;
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
 * Specs tab data: every spec file's clauses, each with a best-effort `cited`
 * flag (`true`/`false` for live clauses, `null` — coverage N/A — for withdrawn
 * ones, mirroring stepSpecCoverage's exemption). `available:false` when the
 * project has no specs/ directory at all; values are never fabricated.
 * @param {string} root
 */
export function getSpecsData(root) {
  const files = listSpecFiles(root);
  if (files.length === 0) return { available: false };
  const cited = citedClauseIds(root);
  return {
    available: true,
    files: files.map((file) => ({
      file,
      clauses: parseSpecClauses(root, file).map((c) => ({
        ...c,
        cited: c.withdrawn ? null : cited.has(c.id),
      })),
    })),
  };
}
