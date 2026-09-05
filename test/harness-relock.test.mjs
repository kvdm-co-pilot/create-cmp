// `create-cmp harness relock` — and the refusal that is the whole point of it.
//
// The defect it closes, measured on 2026-09-05 against a fixture this file
// builds the same way: the harness locks a region and then tells the adopter to
// edit part of it (`harness init` writes qa/lib/profiles/<id>/index.mjs with a
// header saying "This file is YOURS"; the README says to correct the manifest
// and the seeded surface). The first such edit produced
// `harnessIntegrity: FAIL — 1 modified` with no way out: `harness init` refuses
// to re-run, `upgrade --harness` refuses without a create-cmp.json init never
// writes.
//
// So both directions are pinned here, because a command that only ever succeeds
// is not a gate — it is a button that makes an error message go away:
//
//   1. an owned edit  → relock succeeds  → harnessIntegrity is PASS again
//   2. a SPINE edit   → relock REFUSES, non-zero, naming the file
//   3. a SHIPPED PROFILE edit → refused too, one directory from where the name
//      rule alone would have allowed it
//
// Direction 2 is the one that matters. A relock that re-baselines whatever it
// finds would let anyone edit qa/lib/spec-coverage.mjs, relock, and have every
// later receipt vouch for a forked core — the attack harness-region.mjs exists
// to prevent, handed over as a one-line convenience.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { planRelock, profileIdOf, shippedProfileIds } from "../src/commands/harness-relock.mjs";
import { isAdopterOwned } from "../packages/harness/src/lib/harness-region.mjs";
import { describeIntegrity } from "../packages/harness/src/lib/harness-lock.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO_ROOT, "bin", "create-cmp.mjs");
const PROFILE_ID = "svc";
const PROFILE_ENTRY = `qa/lib/profiles/${PROFILE_ID}/index.mjs`;

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "harness-relock-"));
after(() => fs.rmSync(BASE, { recursive: true, force: true }));

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}
function node(cwd, args) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    // Assertions read the printed sentences; a machine with FORCE_COLOR set
    // must not turn a correct refusal into a failing test.
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
}

/**
 * A non-Compose repo with a real lane, built ONCE and copied per test — the
 * same shape test/harness-init.test.mjs uses, since relock's whole subject is
 * what an init'd repo does next.
 */
let golden = null;
function initRepo() {
  if (golden === null) {
    const dir = path.join(BASE, "golden", PROFILE_ID);
    fs.mkdirSync(path.join(dir, "services", "core"), { recursive: true });
    fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
    fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    fs.writeFileSync(path.join(dir, "specs", "core.spec.md"), "# Core\n\n- **SVC-01** the service adds two numbers\n");
    fs.writeFileSync(path.join(dir, "services", "core", "add.js"), "export const add = (a, b) => a + b;\n");
    fs.writeFileSync(
      path.join(dir, "test", "add.test.js"),
      'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../services/core/add.js";\n\n// SPEC: SVC-01\ntest("adds two numbers", () => {\n  assert.equal(add(1, 2), 3);\n});\n',
    );
    git(dir, ["init", "-q", "."]);
    git(dir, ["add", "-A"]);
    git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"]);
    const init = node(dir, [CLI, "harness", "init", "--target-dir", dir]);
    assert.equal(init.status, 0, `fixture init failed:\n${init.stdout}${init.stderr}`);
    git(dir, ["add", "-A"]);
    git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "install the verify lane"]);
    golden = dir;
  }
  const copy = fs.mkdtempSync(path.join(BASE, "case-"));
  fs.cpSync(golden, copy, { recursive: true });
  return copy;
}

const lockBytes = (dir) => fs.readFileSync(path.join(dir, "qa", "harness.lock.json"), "utf8");
const relock = (dir, ...args) => node(dir, [CLI, "harness", "relock", "--target-dir", dir, ...args]);
const laneIntegrity = (dir) => {
  const lane = node(dir, [path.join(dir, "qa", "verify.mjs"), "--profile", "smoke"]);
  const row = lane.stdout.split("\n").find((l) => l.includes("harnessIntegrity"));
  return row ?? `no harnessIntegrity row:\n${lane.stdout}${lane.stderr}`;
};

test("THE GATE, direction 1: the edit the harness told them to make stops failing the lane", () => {
  const dir = initRepo();

  // Exactly what init's own generated header invites: "This file is YOURS".
  fs.appendFileSync(path.join(dir, PROFILE_ENTRY), "\n// my project's own step lives here\n");
  assert.match(laneIntegrity(dir), /harnessIntegrity: FAIL/, "the defect: an invited edit fails the lane");

  const res = relock(dir);
  assert.equal(res.status, 0, `relock failed:\n${res.stdout}${res.stderr}`);
  // Print what changed and what was re-locked — a lock rewritten in silence is
  // the hand-rolled writeHarnessLock script this command replaces.
  assert.match(res.stdout, new RegExp(`yours\\s+modified\\s+${PROFILE_ENTRY.replace(/[/.]/g, "\\$&")}`));
  assert.match(res.stdout, /re-locked \d+ files at prooflane-harness/);

  assert.match(laneIntegrity(dir), /harnessIntegrity: PASS/, "the lane must vouch for the tree again");
});

test("THE GATE, direction 2: a spine edit is a fork, and relock refuses it BY NAME", () => {
  const dir = initRepo();
  const before = lockBytes(dir);

  // The attack in one line: teach the coverage gate to stop seeing something,
  // then ask the lock to bless it. spec-coverage.mjs is the gate that refuses a
  // clause proved at a tier that cannot observe it.
  fs.appendFileSync(path.join(dir, "qa", "lib", "spec-coverage.mjs"), "\n// a fork of the core\n");

  const res = relock(dir);
  assert.notEqual(res.status, 0, "a relock over machine-owned code must not exit 0");
  assert.match(res.stdout, /refusing to re-lock/);
  assert.match(res.stdout, /qa\/lib\/spec-coverage\.mjs/, "a gate that refuses names what it refused over");
  assert.match(res.stdout, /fork/, "the refusal must say what kind of act this is");
  assert.match(res.stdout, /create-cmp upgrade --harness/, "and name the command that restores them");
  assert.equal(lockBytes(dir), before, "a refused relock writes nothing");
});

test("an owned edit alongside a spine edit does not buy the spine edit a pass", () => {
  // The partial-apply hole: relock the profile, skip the core file, exit 0 —
  // and the operator reads a green command over a tree the lane still fails.
  const dir = initRepo();
  const before = lockBytes(dir);
  fs.appendFileSync(path.join(dir, PROFILE_ENTRY), "\n// mine\n");
  fs.appendFileSync(path.join(dir, "qa", "lib", "spec-coverage.mjs"), "\n// theirs\n");

  const res = relock(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /1 of 2 differing file\(s\) is machine-owned/);
  assert.equal(lockBytes(dir), before, "all or nothing — a refused relock writes nothing");
});

test("--dry-run prints the plan and writes nothing", () => {
  const dir = initRepo();
  fs.appendFileSync(path.join(dir, PROFILE_ENTRY), "\n// my project's own step\n");
  const before = lockBytes(dir);

  const res = relock(dir, "--dry-run");
  assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
  assert.match(res.stdout, /nothing was written/);
  assert.match(res.stdout, new RegExp(PROFILE_ENTRY.replace(/[/.]/g, "\\$&")), "the plan still names the files");
  assert.equal(lockBytes(dir), before, "--dry-run must not touch the lock");
  assert.match(laneIntegrity(dir), /harnessIntegrity: FAIL/, "and must not have changed the verdict");
});

test("a shipped profile is NOT the adopter's — the hole one directory from the spine", async () => {
  // qa/lib/profiles/cmp/ is the Compose gate pack: vendored byte-identical into
  // every stamped app, restored by `upgrade --harness`, and 1,000+ lines of
  // build/test/e2e gates. It passes the core's name rule for "a profile", so
  // the name rule alone would have relocked a fork of it — the same act as
  // relocking a forked spine, with a different path.
  const dir = initRepo();
  fs.cpSync(path.join(REPO_ROOT, "packages/harness/src/lib/profiles/cmp"), path.join(dir, "qa/lib/profiles/cmp"), {
    recursive: true,
  });
  // Lock it in through the project's OWN copy — the state a stamped app is in.
  const { writeHarnessLock } = await import(pathToFileURL(path.join(dir, "qa/lib/harness-lock.mjs")).href);
  writeHarnessLock(dir, { version: "0.19.0" });

  fs.appendFileSync(path.join(dir, "qa/lib/profiles/cmp/steps-cmp.mjs"), "\n// forced green\n");
  const res = relock(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /qa\/lib\/profiles\/cmp\/steps-cmp\.mjs/);
  assert.match(res.stdout, /the "cmp" profile ships with the harness/);
});

test("re-locking a DECLARATION says what it just blessed", () => {
  // The declarations are the adopter's to correct and are also the definition
  // of what the lane attests: drop one surface entry and a whole subtree stops
  // being covered, with a valid smaller hash (payment-blueprint, 2026-09-03).
  // The lock cannot tell a correction from a narrowing, so the command must not
  // let a coverage change pass as bookkeeping.
  const dir = initRepo();
  const surfacePath = path.join(dir, "qa", "verified-surface.json");
  const surface = JSON.parse(fs.readFileSync(surfacePath, "utf8"));
  surface.surface = surface.surface.filter((s) => s !== "services");
  fs.writeFileSync(surfacePath, `${JSON.stringify(surface, null, 2)}\n`);

  const res = relock(dir);
  assert.equal(res.status, 0, "a declaration is the adopter's — this must not refuse");
  assert.match(res.stdout, /qa\/verified-surface\.json is a DECLARATION/);
  assert.match(res.stdout, /cannot tell a correction from a narrowing/);

  // And the note is not boilerplate: a profile-only relock does not print it.
  const other = initRepo();
  fs.appendFileSync(path.join(other, PROFILE_ENTRY), "\n// mine\n");
  assert.ok(!/DECLARATION/.test(relock(other).stdout));
});

test("relock preserves the lane identity it found — it is not a stealth upgrade", () => {
  const dir = initRepo();
  const lockPath = path.join(dir, "qa", "harness.lock.json");
  const pinned = { ...JSON.parse(lockBytes(dir)), name: "prooflane-harness", version: "0.0.1-pinned" };
  fs.writeFileSync(lockPath, `${JSON.stringify(pinned, null, 2)}\n`);
  fs.appendFileSync(path.join(dir, PROFILE_ENTRY), "\n// mine\n");

  assert.equal(relock(dir).status, 0);
  const after = JSON.parse(lockBytes(dir));
  assert.equal(after.version, "0.0.1-pinned", "the tree still carries the lane it carried — the version must not move");
  assert.equal(after.name, "prooflane-harness");
});

test("an unlocked tree is refused: with no baseline, `yours` has no answer", () => {
  const dir = initRepo();
  fs.rmSync(path.join(dir, "qa", "harness.lock.json"));
  const res = relock(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /nothing to re-lock against/);
  assert.match(res.stdout, /create-cmp harness init/);
  assert.ok(!fs.existsSync(path.join(dir, "qa", "harness.lock.json")), "a refusal must not mint a lock");
});

test("an intact tree is a no-op, not an error", () => {
  const dir = initRepo();
  const before = lockBytes(dir);
  const res = relock(dir);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /nothing to re-lock/);
  assert.equal(lockBytes(dir), before);
});

test("the unknown-subcommand usage names relock, or nobody finds it", () => {
  const res = node(REPO_ROOT, [CLI, "harness", "wat"]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /harness relock/);
  const help = node(REPO_ROOT, [CLI, "--help"]);
  assert.match(help.stdout, /harness relock/);
});

test("init's already-exists branch names relock — it was the second wall of the closed loop", () => {
  const dir = initRepo();
  const again = node(dir, [CLI, "harness", "init", "--target-dir", dir]);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /already exists/);
  assert.match(again.stdout, /create-cmp harness relock/);
});

// ── The classification rule, pure ────────────────────────────────────────────
// planRelock IS the gate, so it is asserted directly rather than only through
// the trees above: every path shape, in one place, with no filesystem.

test("the ownership rule: what a relock may cover, and what it may never", () => {
  const shipped = ["cmp"];
  const cases = [
    // the adopter's, by contract — init writes these and the README says to fix them
    [`qa/lib/profiles/${PROFILE_ID}/index.mjs`, "yours"],
    [`qa/lib/profiles/${PROFILE_ID}/steps/build.mjs`, "yours"],
    ["qa/verified-surface.json", "yours"],
    ["qa/harness-manifest.json", "yours"],
    // the spine
    ["qa/verify.mjs", "engine"],
    ["qa/lib/spec-coverage.mjs", "engine"],
    ["qa/lib/harness-lock.mjs", "engine"],
    ["qa/receipt-check.mjs", "engine"],
    // the lane's own tests, when a project carries them
    ["qa/test/lane.test.mjs", "engine"],
    // a profile the ENGINE ships
    ["qa/lib/profiles/cmp/steps-cmp.mjs", "engine"],
    // loose under profiles/ — not inside any <id>, so not a profile
    ["qa/lib/profiles/registry.mjs", "engine"],
  ];
  for (const [rel, owner] of cases) {
    const { rows } = planRelock({ modified: [rel], missing: [], extra: [] }, { shippedProfiles: shipped });
    assert.equal(rows[0].owner, owner, `${rel} must be ${owner}`);
  }
  // Every kind of difference is classified, not just modification: a deleted
  // core file and an unrecorded one are forks by other means.
  const plan = planRelock(
    { modified: [`qa/lib/profiles/${PROFILE_ID}/index.mjs`], missing: ["qa/lib/plan.mjs"], extra: ["qa/lib/mine.mjs"] },
    { shippedProfiles: shipped },
  );
  assert.deepEqual(plan.refused.map((r) => `${r.kind} ${r.rel}`), ["missing qa/lib/plan.mjs", "unrecorded qa/lib/mine.mjs"]);
  assert.deepEqual(plan.yours.map((r) => r.rel), [`qa/lib/profiles/${PROFILE_ID}/index.mjs`]);
});

test("the shipped-profile list is DERIVED from the package, so a new profile needs no edit here", () => {
  const onDisk = fs
    .readdirSync(path.join(REPO_ROOT, "packages/harness/src/lib/profiles"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  assert.deepEqual(shippedProfileIds(), onDisk);
  assert.ok(onDisk.includes("cmp"), "the Compose pack is a shipped profile, not an adopter's");
  assert.equal(profileIdOf("qa/lib/profiles/cmp/steps-cmp.mjs"), "cmp");
  assert.equal(profileIdOf("qa/lib/profiles/loose.mjs"), null);
  assert.equal(profileIdOf("qa/verify.mjs"), null);
});

test("the core's name rule stays stack-free — it must not learn a profile id", () => {
  // isAdopterOwned ships inside every vendored lane. It answers "is this the
  // shape of a file an adopter authors", and nothing else: the id of the
  // profile the ENGINE vendors is the engine's knowledge, layered on in
  // src/commands/harness-relock.mjs. Stage 0's whole direction is that no core
  // module names a profile (test/agnostic-lint.test.mjs).
  assert.equal(isAdopterOwned("qa/lib/profiles/cmp/steps-cmp.mjs"), true, "the NAME rule alone cannot tell — which is why the command layers on the shipped list");
  assert.equal(isAdopterOwned("qa/lib/spec-coverage.mjs"), false);
  assert.equal(isAdopterOwned("qa/lib/profiles/registry.mjs"), false);
  assert.equal(isAdopterOwned("qa/approvals.json"), false, "app state was never in the region at all");
  const core = fs.readFileSync(path.join(REPO_ROOT, "packages/harness/src/lib/harness-region.mjs"), "utf8");
  const code = core.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/["']cmp["']/.test(code), "harness-region.mjs must carry no profile id literal");
});

test("the lane's own FAIL message routes by owner — the sentence that closes the loop", () => {
  const yours = { status: "modified", name: "prooflane-harness", version: "0.19.0", fileCount: 42,
    modified: [`qa/lib/profiles/${PROFILE_ID}/index.mjs`], missing: [], extra: [] };
  assert.match(describeIntegrity(yours), /create-cmp harness relock/);

  const theirs = { ...yours, modified: ["qa/lib/spec-coverage.mjs"] };
  assert.ok(!/harness relock/.test(describeIntegrity(theirs)), "a spine edit must never be advertised as relockable");

  // The README's own step 1 writes a file in HARNESS_DECLARATIONS. Unrecorded
  // and owned: the case the previous message sent to `upgrade --harness`,
  // which refuses a repo with no create-cmp.json.
  const unrecorded = { ...yours, modified: [], extra: ["qa/verified-surface.json"] };
  assert.match(describeIntegrity(unrecorded), /create-cmp harness relock/);
});
