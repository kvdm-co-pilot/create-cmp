// Drift guard: qa/lib/approvals.mjs's EXEMPLAR_FEATURE_KOTLIN_FILES must mirror
// qa/scaffold-feature.mjs's ALL_FILES `from:` entries (:209-221) EXACTLY — that
// is literally the file set the exemplar-feature governed artifact hashes, and
// it must be the same set the stamper clones FROM. scaffold-feature.mjs is a
// script with top-level side effects (argument parsing, `die()`/`process.exit`)
// and is not safely importable, so this test regex-extracts its ALL_FILES
// entries from source (same technique the stamper's own doc comments point at)
// and compares them against the real, importable qa/lib/approvals.mjs module.
// Divergence between the two lists must fail this test loudly.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAMPER_PATH = path.join(ROOT, "template/qa/scaffold-feature.mjs");
const APPROVALS_LIB_PATH = path.join(ROOT, "template/qa/lib/approvals.mjs");

function extractStamperFileSet() {
  const text = fs.readFileSync(STAMPER_PATH, "utf8");

  const srcEntries = [];
  const srcRe = /from:\s*path\.join\(SRC\("(\w+)"\),\s*"([^"]+)"\)/g;
  let m;
  while ((m = srcRe.exec(text))) srcEntries.push({ sourceSet: m[1], rel: m[2] });

  const specMatch = text.match(/from:\s*path\.join\(ROOT,\s*"([^"]+)"\)/);
  assert.ok(specMatch, "stamper: expected a ROOT-relative `from:` entry (the spec file) in ALL_FILES");

  return { kotlinFiles: srcEntries, specRel: specMatch[1] };
}

test("exemplar-feature governed artifact list matches the stamper's ALL_FILES exactly", async () => {
  const stamper = extractStamperFileSet();
  const { EXEMPLAR_FEATURE_KOTLIN_FILES, EXEMPLAR_SPEC_REL } = await import(pathToFileURL(APPROVALS_LIB_PATH));

  assert.equal(stamper.kotlinFiles.length, 10, "sanity: stamper declares 10 SRC-based ALL_FILES entries");
  assert.equal(EXEMPLAR_FEATURE_KOTLIN_FILES.length, 10, "sanity: approvals.mjs declares 10 kotlin exemplar files");

  const normalize = (list) => [...list].map((e) => `${e.sourceSet}:${e.rel}`).sort();
  assert.deepEqual(
    normalize(EXEMPLAR_FEATURE_KOTLIN_FILES),
    normalize(stamper.kotlinFiles),
    "qa/lib/approvals.mjs EXEMPLAR_FEATURE_KOTLIN_FILES has drifted from qa/scaffold-feature.mjs ALL_FILES — edit both together",
  );

  assert.equal(
    EXEMPLAR_SPEC_REL,
    stamper.specRel,
    "qa/lib/approvals.mjs EXEMPLAR_SPEC_REL has drifted from qa/scaffold-feature.mjs ALL_FILES's spec entry",
  );
  assert.equal(EXEMPLAR_SPEC_REL, "specs/home.spec.md");
});
