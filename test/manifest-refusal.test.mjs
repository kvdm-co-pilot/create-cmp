// End to end, on a real stamped app: the lane runs because the stamper shipped
// a manifest and a profile; take either away and the lane REFUSES by name.
//
// Stage 0 PR 2. This is the test that proves decision 3 holds in the tree an
// adopter actually gets, not just in the reader's unit tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function stampedApp() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-refusal-"));
  const dir = path.join(base, "RefuseApp");
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "bin", "create-cmp.mjs"), dir, "--yes", "--name", "RefuseApp", "--package", "com.example.refuseapp", "--no-ios", "--no-firebase", "--no-verify"],
    { cwd: REPO_ROOT, encoding: "utf8", timeout: 60_000 },
  );
  if (r.status !== 0) throw new Error(`stamp failed: ${r.stdout}${r.stderr}`);
  return dir;
}

const lane = (dir) =>
  spawnSync(process.execPath, [path.join(dir, "qa", "verify.mjs"), "--profile", "smoke", "--json", "--no-journal"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });

test("a stamped app ships its manifest and its profile, both inside the lock, and the lane runs", () => {
  const dir = stampedApp();
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "qa", "harness-manifest.json"), "utf8"));
  assert.equal(manifest.profile.id, "cmp");
  assert.ok(fs.existsSync(path.join(dir, "qa", "lib", "profiles", "cmp", "index.mjs")));

  const lock = JSON.parse(fs.readFileSync(path.join(dir, "qa", "harness.lock.json"), "utf8"));
  assert.ok("qa/harness-manifest.json" in lock.files, "the manifest is locked with the lane");
  assert.ok("qa/lib/profiles/cmp/index.mjs" in lock.files, "the profile is locked with the lane");

  const r = lane(dir);
  assert.equal(r.status, 0, r.stderr);
  const receipt = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
  assert.equal(receipt.verdict, "PASS");
  assert.equal(receipt.pack.id, "cmp");
});

test("remove the manifest and the lane refuses, exit 2, naming upgrade --harness for a stamped app", () => {
  const dir = stampedApp();
  fs.rmSync(path.join(dir, "qa", "harness-manifest.json"));
  const r = lane(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /qa\/harness-manifest\.json is missing/);
  assert.match(r.stderr, /there is no default/);
  assert.match(r.stderr, /upgrade --harness/);
  assert.equal(r.stdout.trim(), "", "no receipt is written on a refusal");
});

test("name a profile that is not installed and the lane refuses, listing what is", () => {
  const dir = stampedApp();
  const file = path.join(dir, "qa", "harness-manifest.json");
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  m.profile = { id: "ktor-backend" };
  fs.writeFileSync(file, JSON.stringify(m));
  const r = lane(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /names profile "ktor-backend"/);
  assert.match(r.stderr, /profiles present: cmp/);
});

test("a malformed manifest is refused with every problem — never defaulted to cmp", () => {
  const dir = stampedApp();
  fs.writeFileSync(path.join(dir, "qa", "harness-manifest.json"), JSON.stringify({ schema: 1, profile: { id: "Cmp" } }));
  const r = lane(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /schema must be/);
  assert.match(r.stderr, /profile\.id must match/);
  assert.match(r.stderr, /no layout is assumed/);
});

test("--help still works with no manifest — a refusal must not hide the usage", () => {
  const dir = stampedApp();
  fs.rmSync(path.join(dir, "qa", "harness-manifest.json"));
  const r = spawnSync(process.execPath, [path.join(dir, "qa", "verify.mjs"), "--help"], { cwd: dir, encoding: "utf8", timeout: 10_000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--profile/);
});
