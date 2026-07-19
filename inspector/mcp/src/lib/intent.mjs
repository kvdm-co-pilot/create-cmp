// intent.mjs — Intent section data (STUDIO-REDESIGN.md §3.0, the product
// strategist's brief): a structural read of the project's own specs/intent.md
// — the root artifact of the genesis walk (conversation 0; see
// GENESIS-FLOW-DESIGN.md §0 and template/specs/intent.md's own preamble).
//
// This is a PROSE document, not a clause spec: no `// SPEC:` grammar applies,
// so this reader parses markdown sections, not clauses. It reports the file's
// sections in the file's OWN order, and per section whether the interview has
// filled it yet — the seed template marks every unfilled section with a
// literal "_not yet captured …_" lead-in, which is the file's own honest
// statement, not this scanner's inference. Nothing is fabricated: a missing
// file is `available:false` with the reason, an empty section is reported
// empty, and the placeholder guidance text is carried verbatim for the
// console to render as the document's own words.

import fs from "node:fs";
import path from "node:path";

export const INTENT_REL_PATH = "specs/intent.md";

// The seed template's own unfilled marker (template/specs/intent.md): every
// placeholder section body starts with an italic "_not yet captured — …_".
const PLACEHOLDER_LEAD_RE = /^_not yet captured[^_]*_\s*/i;

/**
 * Parse an intent.md document into its section structure. Exported for the
 * reader below and for tests that want to exercise the grammar without a
 * filesystem.
 * @param {string} md the file's raw markdown
 * @returns {{title: string|null, preamble: string, sections: Array<{heading: string, body: string, filled: boolean, guidance: string|null}>}}
 *   - `title`: the first `# ` heading, or null.
 *   - `preamble`: raw markdown between the title and the first `## ` section
 *     (the seed's blockquote explaining the file's role) — data, not rendered
 *     as part of the brief.
 *   - per section: `heading` and raw `body` in file order; `filled` is false
 *     when the body is empty or still carries the seed's "_not yet captured_"
 *     lead-in; `guidance` is the placeholder body with that lead-in stripped
 *     (the seed's own prompt for what belongs here), null for filled sections.
 */
export function parseIntentMarkdown(md) {
  const lines = String(md).split("\n");
  let title = null;
  const preambleLines = [];
  const sections = [];
  let current = null; // {heading, bodyLines}
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      if (current) sections.push(current);
      current = { heading: h2[1], bodyLines: [] };
      continue;
    }
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1 && !current && title === null) {
      title = h1[1];
      continue;
    }
    if (current) current.bodyLines.push(line);
    else preambleLines.push(line);
  }
  if (current) sections.push(current);
  return {
    title,
    preamble: preambleLines.join("\n").trim(),
    sections: sections.map(({ heading, bodyLines }) => {
      const body = bodyLines.join("\n").trim();
      const placeholder = PLACEHOLDER_LEAD_RE.test(body);
      const filled = body !== "" && !placeholder;
      return {
        heading,
        body,
        filled,
        guidance: placeholder ? body.replace(PLACEHOLDER_LEAD_RE, "").trim() || null : null,
      };
    }),
  };
}

/**
 * The Intent section's data: specs/intent.md parsed into ordered sections.
 * `available:false` (with the reason) when the file does not exist or cannot
 * be read — the console renders the §3.0 "conversation 0 pending" placeholder
 * from that, never an error box and never invented brief content.
 * @param {string} root project root
 * @returns {{available: boolean, reason?: string, title?: string|null, preamble?: string, sections?: Array<{heading: string, body: string, filled: boolean, guidance: string|null}>}}
 */
export function getIntentData(root) {
  const file = path.join(root, "specs", "intent.md");
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { available: false, reason: `${INTENT_REL_PATH} not found` };
  }
  return { available: true, ...parseIntentMarkdown(raw) };
}
