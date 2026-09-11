// A DECISION NUMBER CITED IN SOURCE MUST NAME A DECISION THAT EXISTS.
//
// "that placement is the decision (ADR-XXXX)" is not a comment. It is a
// promise that somewhere in docs/adr there is a signed record holding the
// argument, the alternatives and the consequences, so that the next person to
// touch the code can find out WHY before they change it. A citation to a number
// nobody ever wrote is worse than no citation: it reads as settled, it survives
// review because reviewers do not open every reference, and by the time someone
// looks the reasoning is gone. Worse still when the citation carries a section —
// "§4" of a document that does not exist is a detail that makes the whole thing
// sound checked.
//
// SOURCE, NOT PROSE, is what this checks. A planning document may legitimately
// discuss another project's decision record; a comment in a module cannot — it
// is pointing a maintainer of THIS tree at a file in THIS tree.
//
// THE CLASS, NOT THE INSTANCE. A repo whose decisions are numbered will cite a
// number that does not exist again: a renumbered draft, an ADR that was planned
// and then folded into another, a number typed from memory. Each time, the cost
// lands on whoever believes it. This refuses all of them in one line, in the run
// the citation is written.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { trackedSources } from "./helpers/js-source-scan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADR_DIR = path.join(REPO_ROOT, "docs", "adr");

/** The decision numbers that actually exist, read from the directory itself. */
function existingDecisions() {
  const out = new Set();
  for (const name of fs.readdirSync(ADR_DIR)) {
    const m = /^(\d{4})-.+\.md$/.exec(name);
    if (m) out.add(m[1]);
  }
  return out;
}

test("every decision number cited in source names a decision record that exists", () => {
  const existing = existingDecisions();
  assert.ok(existing.size >= 10, `read ${existing.size} decision records from docs/adr — this test cannot tell a real citation from a dangling one`);

  // The generated MCP bundle is a copy of modules already scanned here; a
  // finding in it is the same finding again, at a line nobody edits by hand.
  const sources = trackedSources(REPO_ROOT, (rel) => rel.startsWith("inspector/mcp/dist/"));
  const dangling = [];
  let cited = 0;
  for (const [, { rel, raw }] of sources) {
    const seen = new Set();
    for (const m of raw.matchAll(/\bADR-(\d{4})\b/g)) {
      cited += 1;
      if (existing.has(m[1]) || seen.has(m[1])) continue;
      seen.add(m[1]);
      const line = raw.slice(0, m.index).split("\n").length;
      dangling.push({ rel, line, number: m[1] });
    }
  }
  assert.ok(cited > 20, `found ${cited} decision citations in source — either they have all been removed or this test stopped reading files`);

  assert.deepEqual(
    dangling.map((d) => `${d.rel}:${d.line} ADR-${d.number}`),
    [],
    dangling
      .map((d) => `  ${d.rel}:${d.line} cites ADR-${d.number}, and docs/adr holds no ${d.number}-*.md.`)
      .join("\n") +
      `\n\n  docs/adr currently holds: ${[...existing].sort().join(", ")}.\n` +
      "  Write the record, or cite the one that carries the decision. A comment that points at a decision nobody " +
      "wrote is a claim the reader cannot check and will not doubt — which is exactly the shape of claim this " +
      "repository refuses everywhere else.",
  );
});
