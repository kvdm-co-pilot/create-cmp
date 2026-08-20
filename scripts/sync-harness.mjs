#!/usr/bin/env node
// Vendor the canonical package sources into the template's qa/.
//
//   node scripts/sync-harness.mjs           # copy package src → template/qa
//   node scripts/sync-harness.mjs --check   # exit 1 if any vendored copy drifted
//
// Two ordered stages, because two packages own parts of the lane:
//
//   1. packages/receipts/src → packages/harness/src/lib
//      `cmp-receipts` is the single source of truth for the inputs-hash
//      algorithm and the receipt predicate. It is published standalone (the
//      hosted receipt check consumes it), so the harness carries a COPY rather
//      than a dependency — the vendored lane must stay dependency-free.
//
//   2. packages/harness/src → template/qa
//      `create-cmp-harness` is the single source of truth for the whole lane.
//      The template ships byte-identical copies so a generated project runs
//      `node qa/verify.mjs` with no install step: offline, in CI, air-gapped.
//
// Stage 2's file list is DERIVED from what the package contains, never hand-
// maintained — adding a lane file needs no edit here. A file in the template's
// region with no package source is an ORPHAN: reported by --check, deleted on
// a real run, because the region is the package's image exactly.
//
// test/harness-parity.test.mjs pins the byte-equality this script maintains.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Stage 1 — receipts package → its home inside the harness package. */
const RECEIPTS_FILES = [
  { from: "packages/receipts/src/inputs-hash.mjs", to: "packages/harness/src/lib/inputs-hash.mjs" },
  {
    from: "packages/receipts/src/receipt-validate.mjs",
    to: "packages/harness/src/lib/receipt-validate.mjs",
  },
];

/** The harness package's src/ mirrors an app's qa/ one level deep. */
const REGION_DIRS = [
  { pkg: "src", tpl: "qa" },
  { pkg: "src/lib", tpl: "qa/lib" },
];

function mjsIn(absDir) {
  let names;
  try {
    names = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return names
    .filter((e) => e.isFile() && e.name.endsWith(".mjs"))
    .map((e) => e.name)
    .sort();
}

/** Stage 2 — every .mjs in the harness package, mapped to its template home. */
export function harnessFiles() {
  const pairs = [];
  for (const { pkg, tpl } of REGION_DIRS) {
    for (const name of mjsIn(path.join(REPO_ROOT, "packages/harness", pkg))) {
      pairs.push({ from: `packages/harness/${pkg}/${name}`, to: `template/${tpl}/${name}` });
    }
  }
  return pairs;
}

/** Template-region files with no source in the package. */
export function orphanFiles() {
  const expected = new Set(harnessFiles().map((p) => p.to));
  const found = [];
  for (const { tpl } of REGION_DIRS) {
    for (const name of mjsIn(path.join(REPO_ROOT, "template", tpl))) {
      const rel = `template/${tpl}/${name}`;
      if (!expected.has(rel)) found.push(rel);
    }
  }
  return found;
}

/** Every pair this script maintains, in application order. */
export const SYNCED_FILES = [...RECEIPTS_FILES, ...harnessFiles()];

function syncPairs(pairs, checkOnly) {
  let drifted = 0;
  for (const { from, to } of pairs) {
    const src = path.join(REPO_ROOT, from);
    const dest = path.join(REPO_ROOT, to);
    const srcBytes = fs.readFileSync(src);
    const destBytes = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
    if (destBytes !== null && srcBytes.equals(destBytes)) {
      console.log(`  ok      ${to}`);
    } else if (checkOnly) {
      console.error(`  DRIFT   ${to} != ${from}`);
      drifted += 1;
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, srcBytes);
      console.log(`  synced  ${from} → ${to}`);
    }
  }
  return drifted;
}

// --- main --------------------------------------------------------------------
// Guarded so the exports above can be imported by tests without running a sync.
if (import.meta.url === `file://${process.argv[1]}`) {
  const checkOnly = process.argv.includes("--check");
  let problems = 0;

  console.log("stage 1  cmp-receipts → create-cmp-harness");
  problems += syncPairs(RECEIPTS_FILES, checkOnly);

  // Re-derive AFTER stage 1, so a file stage 1 just created is carried down.
  console.log("stage 2  create-cmp-harness → template/qa");
  problems += syncPairs(harnessFiles(), checkOnly);

  for (const orphan of orphanFiles()) {
    if (checkOnly) {
      console.error(`  ORPHAN  ${orphan} has no source in packages/harness/src`);
      problems += 1;
    } else {
      fs.rmSync(path.join(REPO_ROOT, orphan));
      console.log(`  removed ${orphan} (no package source)`);
    }
  }

  if (checkOnly && problems > 0) {
    console.error(`\n${problems} problem(s) — run: node scripts/sync-harness.mjs`);
    process.exit(1);
  }
}
