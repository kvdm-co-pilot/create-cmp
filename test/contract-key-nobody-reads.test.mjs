// A KEY THE CONTRACT PUBLISHES THAT NOTHING READS IS A SECOND SPELLING OF A
// FACT, AND THE SECOND SPELLING IS THE ONE THAT DRIFTS.
//
// profile-contract.mjs states its own reason for existing: help text and
// validator are ONE artifact, so neither can drift from the other. That
// guarantee holds only for keys something actually reads. A key nobody reads is
// not a contract term — it is a note, and it is the worst kind, because it looks
// exactly like a term. It is edited when the object is edited, cited in comments
// as though it were load-bearing, and believed by the next reader.
//
// The instance that provoked this file declared, in the contract's own header,
// that a new per-field `rung` key is "where the grader's rung order now comes
// from". The grader is packages/harness/src/lib/evidence-level.mjs. It does not
// import this module — not directly, not transitively — and it spells its rung
// ids itself, in two places. So the fact "which field earns which rung" now
// exists twice, and the copy that no code consults is free to disagree with the
// copy that grades. Nothing would notice. That is the defect; `rung` happens to
// be where it landed.
//
// THE INVARIANT: every key published on a contract entry has a reader in code.
// Not in a comment — a comment saying a key is read is the claim under test, not
// evidence for it — and not in a test, because a key read only by the test that
// asserts it exists is a fact this repo maintains for nobody.
//
// The honest fixes are both cheap and either one is fine: delete the key, or
// make the reader that is supposed to own it read it.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONTRACT } from "../packages/harness/src/lib/profile-contract.mjs";
import { matchBracket, trackedSources } from "./helpers/js-source-scan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_FILE = /profile-contract\.mjs$/;

/**
 * Sources that can read the contract: the modules that import it, plus
 * profile-contract.mjs's own functions — `explain` is a reader like any other.
 * The CONTRACT literal itself is cut out first: the declaration of a key is not
 * a use of it, and leaving it in would make every key its own reader, which is
 * the one result this test must never be able to produce.
 *
 * Tests are out of scope deliberately (see the header).
 */
function readerSources() {
  const all = trackedSources(REPO_ROOT, (rel) => rel.startsWith("inspector/mcp/dist/") || rel.startsWith("test/"));
  const out = [];
  for (const [, { rel, raw, masked }] of all) {
    if (CONTRACT_FILE.test(rel)) {
      const at = masked.indexOf("export const CONTRACT ");
      const open = masked.indexOf("{", at);
      const close = matchBracket(masked, open);
      out.push({ rel, code: masked.slice(0, open) + masked.slice(close + 1) });
      continue;
    }
    if (/from\s+["'][^"']*profile-contract\.mjs["']/.test(raw)) out.push({ rel, code: masked });
  }
  return out;
}

/** Every key name the contract publishes, and where. */
function publishedKeys() {
  const out = new Map();
  const note = (key, where) => out.set(key, [...(out.get(key) ?? []), where]);
  for (const [decl, spec] of Object.entries(CONTRACT)) {
    for (const key of Object.keys(spec)) if (key !== "fields") note(key, decl);
    for (const [field, entry] of Object.entries(spec.fields ?? {})) for (const key of Object.keys(entry)) note(key, `${decl}.${field}`);
  }
  return out;
}

test("every key the profile contract publishes is read by code, not only declared in it", () => {
  const readers = readerSources();
  assert.ok(
    readers.some(({ rel }) => CONTRACT_FILE.test(rel)) && readers.length >= 4,
    `found ${readers.length} modules that read the contract — this lint has lost sight of its own subject and would pass over anything`,
  );

  const orphans = [];
  for (const [key, where] of publishedKeys()) {
    const seen = readers.filter(({ code }) => new RegExp(`\\.${key}\\b|\\[["']${key}["']\\]`).test(code));
    if (!seen.length) orphans.push({ key, where });
  }

  assert.deepEqual(
    orphans.map((o) => o.key),
    [],
    orphans
      .map(
        (o) =>
          `\`${o.key}\` is declared on ${o.where.join(", ")} and read by no module that imports the contract ` +
          `(searched ${readers.length} of them, with comments and string bodies masked out — a key mentioned only in ` +
          `prose is not read).`,
      )
      .join("\n") +
      "\n\n  The contract exists so that one fact has one spelling. A published key with no reader is a second " +
      "spelling of whatever it describes: it will be edited, cited, and believed, and nothing will ever compare it " +
      "against the code that decides the same thing. Delete it, or make its reader read it.",
  );
});
