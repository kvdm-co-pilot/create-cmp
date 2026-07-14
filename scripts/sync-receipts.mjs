#!/usr/bin/env node
// Vendor the cmp-receipts package source into the template's qa/lib/.
//
//   node scripts/sync-receipts.mjs           # copy package src → template/qa/lib
//   node scripts/sync-receipts.mjs --check   # exit 1 if any vendored copy drifted
//
// packages/receipts/src/ is the SINGLE SOURCE OF TRUTH for the inputs-hash
// algorithm and the receipt predicate; generated projects must stay
// dependency-free, so the engine ships byte-identical copies inside the
// template instead of an npm dependency. test/receipts-parity.test.mjs pins
// the byte-equality this script maintains.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Files vendored from the package into the template (single flat list). */
export const SYNCED_FILES = [
  { from: "packages/receipts/src/inputs-hash.mjs", to: "template/qa/lib/inputs-hash.mjs" },
  { from: "packages/receipts/src/receipt-validate.mjs", to: "template/qa/lib/receipt-validate.mjs" },
];

const checkOnly = process.argv.includes("--check");
let drifted = 0;

for (const { from, to } of SYNCED_FILES) {
  const src = path.join(REPO_ROOT, from);
  const dest = path.join(REPO_ROOT, to);
  const srcBytes = fs.readFileSync(src);
  const destBytes = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
  const inSync = destBytes !== null && srcBytes.equals(destBytes);

  if (inSync) {
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

if (checkOnly && drifted > 0) {
  console.error(`\n${drifted} vendored file(s) drifted — run: node scripts/sync-receipts.mjs`);
  process.exit(1);
}
