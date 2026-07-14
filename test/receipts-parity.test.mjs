// G0 item 1 — the shared receipts lib has ONE source of truth.
// packages/receipts/src/ is canonical; the template ships byte-identical
// vendored copies in qa/lib/ (generated projects stay dependency-free), and
// the engine's verbatim template copy carries them into every scaffold.
// This test pins all three layers: package ↔ template ↔ fresh scaffold.
// Drift fix: node scripts/sync-receipts.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold } from "../src/scaffold.mjs";
import { SYNCED_FILES } from "../scripts/sync-receipts.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("receipts lib: template qa/lib copies are byte-identical to the package source", () => {
  assert.ok(SYNCED_FILES.length >= 2, "sync manifest lists the shared files");
  for (const { from, to } of SYNCED_FILES) {
    const src = fs.readFileSync(path.join(REPO_ROOT, from));
    const dest = fs.readFileSync(path.join(REPO_ROOT, to));
    assert.ok(
      src.equals(dest),
      `${to} drifted from ${from} — run: node scripts/sync-receipts.mjs`,
    );
  }
});

test("receipts lib: a fresh scaffold lands byte-identical copies of the package source", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-receipts-parity-"));
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

    for (const { from, to } of SYNCED_FILES) {
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

test("receipts lib: package predicate and template predicate agree on a real receipt", async () => {
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
