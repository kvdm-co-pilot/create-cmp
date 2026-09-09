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
// ADDITIVE, AND THEN NOT — the history, kept because a deleted contract looks
// like a contract that never existed.
//
// When `pack` landed on 2026-09-04 it was additive, and this file said so in
// two assertions: a fresh receipt carries it, and a receipt predating it
// validates EXACTLY as before, with the reason not even mentioning pack —
// "the validator does not know pack exists yet — by design". That was the
// correct and careful way to introduce a field nothing depended on.
//
// ADR-0011 (2026-09-09) retired it, and the reason is that something came to
// depend on it: §8.9's comparability rule rests on `pack` entirely, and a field
// the whole rule rests on that no predicate reads is a field an editor deletes
// with no reader noticing. The predicate now refuses a receipt that names no
// pack, and the assertions below say the new thing while recording what they
// used to say.
//
// It is deliberately NOT the ADR-0007 case: there a label moved and no
// assertion changed, so invalidating old receipts would have been pure loss.
// Here an old receipt is genuinely missing the field that makes its rung mean
// something — asked for a claim it never made, not punished for a name.
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

test("a fresh receipt carries pack {id, version}, and version is the profile's own or null — never the harness lock's (ADR-0008)", () => {
  const dir = stampedApp();
  const receipt = smokeReceipt(dir);
  const lock = JSON.parse(fs.readFileSync(path.join(dir, "qa", "harness.lock.json"), "utf8"));

  // ADR-0008 (accepted 2026-09-08): the version is the PROFILE'S OWN or null —
  // never the harness lock's number. `cmp` declares none, so null; a profile
  // that exports `version` puts that on the wire (stage2-gate row I).
  assert.deepEqual(receipt.pack, { id: "cmp", version: null });
  assert.notEqual(receipt.pack.version, receipt.harness.version, "the borrowed number is gone");
  assert.match(String(lock.version), /^\d+\.\d+\.\d+$/);
});

test("the shipped schema declares pack REQUIRED, with id and version", () => {
  // Was: "pack is optional until schema/2 — old receipts must still conform".
  // ADR-0011 retired that. The schema, the predicate and stage2-gate's criterion
  // H had been holding three different views of one field; this is the one they
  // now share.
  const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "template", "qa", "evidence", "schema.json"), "utf8"));
  assert.ok(schema.properties.pack, "schema.json must declare pack");
  assert.deepEqual(schema.properties.pack.required, ["id", "version"]);
  assert.ok(
    (schema.required ?? []).includes("pack"),
    "pack is load-bearing (ADR-0011) — a schema that called it optional while the predicate refused it was the drift shape this repo hunts everywhere else",
  );
});

test("a receipt that names no pack is REFUSED, and the refusal names the remedy", () => {
  // The assertion this replaces read: "presence of pack must not change the
  // verdict", "nor the reason", and "the validator does not know pack exists
  // yet — by design". All three were true, and ADR-0011 ended them.
  //
  // The cost is understood and small: such a receipt was written before
  // 2026-09-04 AND must be over a tree that has not moved since, because a
  // receipt stops attesting the moment a verified byte changes. The remedy is
  // the one the binding check beside it already offers for the same class of
  // staleness, and costs the same.
  const dir = stampedApp();
  const fresh = smokeReceipt(dir);
  const recompute = () => computeInputsHash(dir);

  const withPack = evaluateReceipt(fresh, recompute);
  assert.equal(withPack.valid, true, withPack.reason);

  const { pack: _dropped, ...legacy } = fresh;
  const withoutPack = evaluateReceipt(legacy, recompute);
  assert.equal(withoutPack.valid, false, "the field the comparability rule rests on is no longer one an editor can delete");
  assert.match(withoutPack.reason, /names no step pack/);
  assert.match(withoutPack.reason, /re-run the lane/, "a refusal without a remedy is a dead end");

  // The threat model, stated: the predicate cannot tell "never had one" from
  // "had one, and it was removed", and of those two errors it refuses the one
  // that would let tampering through.
  const blanked = evaluateReceipt({ ...fresh, pack: { id: "", version: null } }, recompute);
  assert.equal(blanked.valid, false, "an empty pack id is malformed — the schema has said minLength 1 all along");
});
