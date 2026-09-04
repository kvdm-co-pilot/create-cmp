// The receipt names the STEP PACK that produced its rows.
//
// Stage 0 PR 1 of docs/proposals/AGNOSTIC-HARNESS-ARCHITECTURE.md (§8.1). The
// receipt already names its harness — version, region digest, intact. It did not
// say which step pack the lane loaded, so once a second pack exists a cmp L2
// (device e2e) and a backend L2 (integration tests) are the same bytes on the
// wire. `pack: { id, version }` is the additive fix: the pack declares its id, the
// spine writes what it is told, and the version is the lock's until profiles are
// versioned on their own.
//
// Additive means two things must both hold: a fresh receipt carries it, and a
// receipt that predates it still validates exactly as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeInputsHash } from "../packages/harness/src/lib/inputs-hash.mjs";
import { evaluateReceipt } from "../packages/harness/src/lib/receipt-validate.mjs";
import { createCmpSteps } from "../packages/harness/src/lib/profiles/cmp/steps-cmp.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function stampedApp() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-pack-"));
  const dir = path.join(base, "PackApp");
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), dir, "--yes", "--name", "PackApp", "--package", "com.example.packapp", "--no-ios", "--no-firebase", "--no-verify"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 },
  );
  if (r.status !== 0) throw new Error(`stamp failed: ${r.stdout}${r.stderr}`);
  return dir;
}

function smokeReceipt(dir) {
  const r = spawnSync(process.execPath, [path.join(dir, "qa", "verify.mjs"), "--profile", "smoke", "--json", "--no-journal"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const text = r.stdout ?? "";
  return JSON.parse(text.slice(text.indexOf("{")));
}

test("the pack declares its own id — the spine never assumes a name", () => {
  // The only thing the spine may write into receipt.pack.id is what the pack
  // returned. A spine that hardcoded "cmp" would be the coupling this removes.
  const pack = createCmpSteps({
    ROOT: REPO_ROOT, HERE: REPO_ROOT, GRADLEW: "./gradlew", RERUN: "", fast: true, determinism: false,
    profile: "smoke", mode: "full", sh: () => ({ ok: true, out: "" }), shGradle: () => ({ ok: true, out: "" }),
    tryGit: () => "", tryGitLines: () => [], DEGRADED_PATHS: [],
  });
  assert.equal(pack.id, "cmp");
  assert.equal(pack.version, undefined, "no version until the profile loader — the spine pairs id with the lock's version");
});

test("a fresh receipt carries pack {id, version}, and version is the harness lock's", () => {
  const dir = stampedApp();
  const receipt = smokeReceipt(dir);
  const lock = JSON.parse(fs.readFileSync(path.join(dir, "qa", "harness.lock.json"), "utf8"));

  assert.deepEqual(receipt.pack, { id: "cmp", version: lock.version });
  // Both producer halves agree until profiles are versioned on their own.
  assert.equal(receipt.pack.version, receipt.harness.version);
  assert.match(String(lock.version), /^\d+\.\d+\.\d+$/);
});

test("the shipped schema declares pack, optional, with id and version", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "template", "qa", "evidence", "schema.json"), "utf8"));
  assert.ok(schema.properties.pack, "schema.json must declare pack");
  assert.deepEqual(schema.properties.pack.required, ["id", "version"]);
  assert.ok(!(schema.required ?? []).includes("pack"), "pack is optional until schema/2 — old receipts must still conform");
});

test("a receipt that predates pack validates exactly as before — additive means additive", () => {
  const dir = stampedApp();
  const fresh = smokeReceipt(dir);
  const recompute = () => computeInputsHash(dir);

  const withPack = evaluateReceipt(fresh, recompute);
  const { pack: _dropped, ...legacy } = fresh;
  const withoutPack = evaluateReceipt(legacy, recompute);

  assert.equal(withoutPack.valid, withPack.valid, "presence of pack must not change the verdict");
  assert.equal(withoutPack.reason, withPack.reason, "nor the reason");
  assert.doesNotMatch(String(withoutPack.reason), /pack/i, "the validator does not know pack exists yet — by design");
});
