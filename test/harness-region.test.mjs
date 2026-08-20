// The machine-owned region is the line between "the app" and "the lane".
// Every downstream behaviour — never stamped, verifiable offline, replaced
// wholesale on upgrade — rests on this boundary being exact, so it is pinned
// against the REAL template rather than a fixture.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HARNESS_DIRS,
  isHarnessFile,
  listHarnessFiles,
  hashHarnessRegion,
  compareHarnessRegion,
} from "../packages/harness/src/lib/harness-region.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tmpTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-region-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return root;
}

test("the region is the .mjs files directly under qa/ and qa/lib/", () => {
  assert.deepEqual(HARNESS_DIRS, ["qa", "qa/lib"]);
  assert.ok(isHarnessFile("qa/verify.mjs"));
  assert.ok(isHarnessFile("qa/lib/render.mjs"));
});

test("app state, app content and app source are NOT machine-owned", () => {
  // The four that cost real money if they are ever overwritten by an upgrade.
  assert.ok(!isHarnessFile("qa/approvals.json"), "the approvals ledger is app state");
  assert.ok(!isHarnessFile("qa/golden/home.json"), "goldens are app state");
  assert.ok(!isHarnessFile("qa/evidence/latest.json"), "evidence is a lane OUTPUT");
  assert.ok(!isHarnessFile("qa/e2e/smoke.yaml"), "e2e flows are seeded once, then app-owned");
  assert.ok(!isHarnessFile("specs/app-base.spec.md"));
  assert.ok(!isHarnessFile("composeApp/src/commonMain/kotlin/Foo.kt"));
});

test("nesting is not swept in silently — only DIRECT children count", () => {
  // A future qa/lib/vendor/thing.mjs must not become machine-owned without
  // someone deliberately widening HARNESS_DIRS.
  assert.ok(!isHarnessFile("qa/lib/vendor/thing.mjs"));
  assert.ok(!isHarnessFile("qa/e2e/helpers/thing.mjs"));
});

test("the real template's region is exactly its qa .mjs files", () => {
  const rels = listHarnessFiles(path.join(REPO_ROOT, "template"));
  const onDisk = [
    ...fs.readdirSync(path.join(REPO_ROOT, "template/qa")).map((n) => `qa/${n}`),
    ...fs.readdirSync(path.join(REPO_ROOT, "template/qa/lib")).map((n) => `qa/lib/${n}`),
  ]
    .filter((r) => r.endsWith(".mjs"))
    .sort();
  assert.deepEqual(rels, onDisk);
  assert.ok(rels.length >= 30, `expected the full lane, got ${rels.length}`);
});

test("the region hash covers content AND path, and is order-independent", () => {
  const a = tmpTree({ "qa/verify.mjs": "A", "qa/lib/x.mjs": "B" });
  const b = tmpTree({ "qa/lib/x.mjs": "B", "qa/verify.mjs": "A" });
  assert.equal(hashHarnessRegion(a).sha256, hashHarnessRegion(b).sha256);

  // Same bytes, different path => different digest.
  const c = tmpTree({ "qa/verify.mjs": "A", "qa/lib/y.mjs": "B" });
  assert.notEqual(hashHarnessRegion(a).sha256, hashHarnessRegion(c).sha256);
});

test("a one-byte edit to lane code is detected, and NAMED", () => {
  const root = tmpTree({ "qa/verify.mjs": "green()", "qa/lib/x.mjs": "B" });
  const recorded = hashHarnessRegion(root);
  assert.ok(compareHarnessRegion(root, recorded).intact);

  // The tamper this whole mechanism exists to catch.
  fs.writeFileSync(path.join(root, "qa/verify.mjs"), "green() // always pass");
  const after = compareHarnessRegion(root, recorded);
  assert.equal(after.intact, false);
  assert.deepEqual(after.modified, ["qa/verify.mjs"]);
  assert.deepEqual(after.missing, []);
  assert.deepEqual(after.extra, []);
});

test("deleting a lane file and adding an unrecorded one are both reported", () => {
  const root = tmpTree({ "qa/verify.mjs": "A", "qa/lib/x.mjs": "B" });
  const recorded = hashHarnessRegion(root);
  fs.rmSync(path.join(root, "qa/lib/x.mjs"));
  fs.writeFileSync(path.join(root, "qa/sneaky.mjs"), "C");
  const after = compareHarnessRegion(root, recorded);
  assert.equal(after.intact, false);
  assert.deepEqual(after.missing, ["qa/lib/x.mjs"]);
  assert.deepEqual(after.extra, ["qa/sneaky.mjs"]);
});

test("comparing against a missing/garbage manifest reports NOT intact, never throws", () => {
  const root = tmpTree({ "qa/verify.mjs": "A" });
  for (const bad of [undefined, null, {}, { files: null }, { files: "nope" }]) {
    const r = compareHarnessRegion(root, bad);
    assert.equal(r.intact, false, `${JSON.stringify(bad)} must not read as intact`);
    assert.deepEqual(r.extra, ["qa/verify.mjs"]);
  }
});

test("the app contract DECLARES the boundary — this is what prevents recurrence", () => {
  // The 0.13.0 pilots drifted because nothing ever told anyone those files
  // were machine-owned. The mechanism (lock + integrity step) catches drift
  // after the fact; saying so in the contract is what stops it happening.
  const claude = fs.readFileSync(path.join(REPO_ROOT, "template/CLAUDE.md"), "utf8");
  assert.match(claude, /machine-owned/i, "CLAUDE.md names the ownership boundary");
  assert.match(claude, /qa\/harness\.lock\.json/, "CLAUDE.md points at the lock");
  assert.match(claude, /do not edit `qa\/\*\.mjs`/i, "CLAUDE.md states the rule outright");
  assert.match(claude, /upgrade --harness/, "CLAUDE.md gives the way out for a genuine fork");

  // AGENTS.md is a pointer file, but this rule has to survive an agent that
  // only skims it before editing.
  const agents = fs.readFileSync(path.join(REPO_ROOT, "template/AGENTS.md"), "utf8");
  assert.match(agents, /machine-owned/i, "AGENTS.md carries the rule too");
});

test("app-owned surfaces are named as app-owned, not left ambiguous", () => {
  const claude = fs.readFileSync(path.join(REPO_ROOT, "template/CLAUDE.md"), "utf8");
  for (const owned of ["approvals.json", "golden/", "evidence/", "e2e/*.yaml", "specs/"]) {
    assert.ok(claude.includes(owned), `CLAUDE.md says ${owned} is the app's`);
  }
});
