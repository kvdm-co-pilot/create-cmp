// THE CONTRACT'S PROSE MAY NOT NAME A KEY THE CONTRACT DOES NOT HAVE.
//
// profile-contract.mjs states its own reason for existing in its own header:
// "prose inside the schema, never beside it ... help text and validator as one
// artifact, so neither can drift from the other." That guarantee is about
// PLACEMENT, and placement alone does not deliver it. Prose sitting inside the
// file still drifts from the object one screen below it — it is edited by a
// different keystroke, and nothing compares the two. A header paragraph that
// describes a key, names it in backticks, and says which consumer reads it is
// indistinguishable from a key that exists, and it is believed exactly because
// of where it sits.
//
// THE MIRROR OF A LINT THIS REPO ALREADY HAS.
// test/contract-key-nobody-reads.test.mjs refuses a key that is PUBLISHED and
// read by nobody. This refuses the other direction: a key that is DESCRIBED and
// published by nobody. They are one class — a fact with two spellings, where
// only one of them is executable — and the two directions arrive by the same
// route, which is a key being added or removed while the paragraph about it is
// not.
//
// THE INSTANCE, and it is residue of a cut rather than a mistake anyone made
// while writing: `rung` was added to the four ladder fields, described in the
// header as "where the grader's rung order now comes from", then deleted again
// (correctly — the grader does not import this module). The paragraph stayed.
// It still counts "THREE KEYS", still names `rung`, and still ends on a clause
// about "the field that records what a human ANSWERED" — a field that was cut in
// the same week. Every one of those is a claim a reader can check only by
// reading the object, which is precisely the work the file promises to have
// done for them.
//
// WHAT COUNTS AS NAMING A KEY: a bare lowerCamel identifier in backticks, in a
// comment, in this module. That is the file's own convention for citing one and
// nothing else in it is spelled that way — dotted paths, command lines and
// prose all fall outside the pattern. A term is allowed when the contract
// publishes it as a key, declares it, offers it as a field, or when the module's
// own code spells the identifier anywhere (so `declared`, a parameter of
// `explain`, is a term this module has).
//
// BOTH COPIES ARE SCANNED. The template's vendored copy is the one an adopter
// actually reads, and a header that is right in the source and stale in the
// vendored copy is the same defect delivered to the only person it can mislead.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONTRACT } from "../packages/harness/src/lib/profile-contract.mjs";
import { trackedSources } from "./helpers/js-source-scan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_FILE = /(?:^|\/)profile-contract\.mjs$/;

/** Every term the contract itself has: a key it publishes, a declaration, or a field. */
function contractVocabulary() {
  const out = new Set();
  for (const [decl, spec] of Object.entries(CONTRACT)) {
    out.add(decl);
    for (const key of Object.keys(spec)) out.add(key);
    for (const [field, entry] of Object.entries(spec.fields ?? {})) {
      out.add(field);
      for (const key of Object.keys(entry)) out.add(key);
    }
  }
  return out;
}

/**
 * The prose half of a source: everything the masker blanked (comments, string
 * bodies, regex literals), with offsets preserved so a line number stays true.
 * Derived by subtraction rather than by a comment regex of its own — the masker
 * is the module that already knows where code ends.
 */
function proseOf(raw, masked) {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) out += raw[i] === "\n" ? "\n" : masked[i] === " " && raw[i] !== " " ? raw[i] : " ";
  return out;
}

test("every contract key the contract's own prose names in backticks is a key the contract publishes", () => {
  const files = [...trackedSources(REPO_ROOT, (rel) => rel.startsWith("inspector/mcp/dist/") || !CONTRACT_FILE.test(rel)).values()];

  // The shipped copy and the vendored copy. Finding fewer means this lint has
  // lost a file it is supposed to be reading, and its silence would mean
  // nothing.
  assert.ok(files.length >= 2, `scanned ${files.length} copies of profile-contract.mjs (${files.map((f) => f.rel).join(", ")}) — expected the source and the vendored template`);

  const vocabulary = contractVocabulary();
  const orphans = [];
  let cited = 0;

  for (const { rel, raw, masked } of files) {
    // Every identifier the module's own CODE spells — a term this module has,
    // whether or not the contract object publishes it.
    const inCode = new Set((masked.match(/[A-Za-z_$][\w$]*/g) ?? []));
    const prose = proseOf(raw, masked);
    for (const m of prose.matchAll(/`([^`\n]+)`/g)) {
      const term = m[1];
      if (!/^[a-z][A-Za-z0-9]*$/.test(term)) continue;
      cited += 1;
      if (vocabulary.has(term) || inCode.has(term)) continue;
      orphans.push({ rel, line: raw.slice(0, m.index).split("\n").length, term });
    }
  }

  assert.ok(cited > 10, `found ${cited} backticked terms in the contract's prose — this lint has stopped reading it`);

  assert.deepEqual(
    orphans.map((o) => `${o.rel}:${o.line} \`${o.term}\``),
    [],
    orphans.map((o) => `  ${o.rel}:${o.line} describes \`${o.term}\`, and the contract has no such key, declaration or field.`).join("\n") +
      "\n\n  This file's argument for carrying its own documentation is that a schema and its help text cannot drift " +
      "when they are one artifact. A paragraph describing a key that is not there is that drift, arriving in the one " +
      "place a reader has been told not to double-check. Delete the sentence, or add the key it describes.",
  );
});
