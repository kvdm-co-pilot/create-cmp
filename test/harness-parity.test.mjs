// The lane has ONE source of truth, and it survives the stamp pipeline intact.
//
// packages/harness/src/ is canonical for the whole verify lane (and
// packages/receipts/src/ for the two files it owns inside it); the template
// ships byte-identical vendored copies under qa/ so generated projects stay
// dependency-free, and the engine carries them into every scaffold.
//
// This pins all three layers — package ↔ template ↔ fresh scaffold — for
// every file in the machine-owned region, not just the two receipts files.
// The scaffold layer is the one that matters most: it proves the stamper
// never rewrites lane code, which is what makes the region content-hashable
// and therefore what makes a receipt able to name the lane that issued it.
//
// Drift fix: node scripts/sync-harness.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold } from "../src/scaffold.mjs";
import { SYNCED_FILES, harnessFiles, orphanFiles } from "../scripts/sync-harness.mjs";
import { listHarnessFiles, hashHarnessRegion } from "../packages/harness/src/lib/harness-region.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every vendored copy is byte-identical to its package source", () => {
  assert.ok(SYNCED_FILES.length >= 2, "sync manifest lists the shared files");
  for (const { from, to } of SYNCED_FILES) {
    const src = fs.readFileSync(path.join(REPO_ROOT, from));
    const dest = fs.readFileSync(path.join(REPO_ROOT, to));
    assert.ok(
      src.equals(dest),
      `${to} drifted from ${from} — run: node scripts/sync-harness.mjs`,
    );
  }
});

test("a fresh scaffold lands byte-identical copies of every lane file", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harness-parity-"));
  try {
    await scaffold(
      {
        appName: "Acme",
        package: "com.acme.demo",
        iosBundleId: "com.acme.demo",
        region: "us-central1",
        themePrefix: "Acme",
        platforms: { android: true, ios: true },
        firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
        room: true,
        e2e: true,
        inspector: true,
        devClient: true,
        tabs: [
          { label: "Home", icon: "home" },
          { label: "Profile", icon: "person" },
        ],
        targetDir: out,
      },
      { verify: false },
    );

    // Stage 2 only — stage 1's targets live inside packages/, not the template.
    for (const { from, to } of harnessFiles()) {
      const rel = to.replace(/^template\//, "");
      const packageBytes = fs.readFileSync(path.join(REPO_ROOT, from));
      const scaffoldPath = path.join(out, rel);
      assert.ok(fs.existsSync(scaffoldPath), `scaffold is missing ${rel}`);
      const scaffoldBytes = fs.readFileSync(scaffoldPath);
      assert.ok(
        packageBytes.equals(scaffoldBytes),
        `scaffolded ${rel} is not byte-identical to ${from} — the stamp pipeline must not rewrite shared lib files`,
      );
    }

    // The scaffolded receipt-check must consume the vendored predicate, not a fork.
    const receiptCheck = fs.readFileSync(path.join(out, "qa/receipt-check.mjs"), "utf8");
    assert.match(receiptCheck, /from "\.\/lib\/receipt-validate\.mjs"/, "qa/receipt-check.mjs imports the shared predicate");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("package predicate and template predicate agree on a real receipt", async () => {
  // Belt-and-braces beyond byte-equality: import BOTH copies and assert the
  // same verdict object for the same inputs.
  const pkg = await import(path.join(REPO_ROOT, "packages/receipts/src/receipt-validate.mjs"));
  const tpl = await import(path.join(REPO_ROOT, "template/qa/lib/receipt-validate.mjs"));

  const receipt = {
    schema: "cmp-evidence/1",
    profile: "local",
    verdict: "PASS",
    inputs: { hash: "a".repeat(64), fileCount: 3 },
    steps: [{ name: "build", verdict: "PASS", durationMs: 60000 }],
    generatedAt: new Date().toISOString(),
  };
  const recompute = () => ({ hash: "a".repeat(64), fileCount: 3 });
  assert.deepEqual(pkg.evaluateReceipt(receipt, recompute), tpl.evaluateReceipt(receipt, recompute));

  const tampered = { ...receipt, inputs: { hash: "b".repeat(64), fileCount: 3 } };
  assert.deepEqual(pkg.evaluateReceipt(tampered, recompute), tpl.evaluateReceipt(tampered, recompute));
});
