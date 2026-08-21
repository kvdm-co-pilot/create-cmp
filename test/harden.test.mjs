// `create-cmp harden` (LADDER §R3) is the Act 2 → Act 3 climb: install the
// full verification harness into a minimal scaffold, in place, additively.
// It is the SAME three-way walk as `upgrade --harness` with a new pair of
// trees (base = minimal stamp, new = full stamp), so what these tests pin is
// the pairing, the app-state seeding the walk excludes by design, and the two
// promises that make the command safe to run twice or on an edited tree:
// idempotence and never-clobber.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { hardenProject } from "../src/commands/harden.mjs";
import { listHarnessFiles } from "../packages/harness/src/lib/harness-region.mjs";
import { checkHarnessIntegrity } from "../packages/harness/src/lib/harness-lock.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function config(targetDir, overrides = {}) {
  return {
    appName: "Climb App",
    package: "com.climb.app",
    iosBundleId: "com.climb.app",
    region: "us-central1",
    themePrefix: "Climb",
    harness: false,
    platforms: { android: true, ios: false },
    firebase: { enabled: false },
    room: true,
    e2e: true,
    inspector: true,
    devClient: true,
    tabs: [
      { label: "Home", icon: "home" },
      { label: "Profile", icon: "person" },
    ],
    targetDir,
    ...overrides,
  };
}

let tmpRoot;
let app;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harden-"));
  app = path.join(tmpRoot, "app");
  await scaffold(config(app), { verify: false });
  // A user edit made BEFORE hardening, in a mode-variant file: harden must
  // never clobber it (the walk conflicts → sidecar).
  fs.appendFileSync(path.join(app, "CLAUDE.md"), "\n## House rules\n\nAlways run ktlint before pushing.\n");
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const exists = (rel) => fs.existsSync(path.join(app, rel));
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("harden installs the full harness onto a minimal scaffold", async () => {
  const outcome = await hardenProject({ projectDir: app, apply: true });
  assert.equal(outcome.alreadyFull, false);

  // The lane region now matches a fresh FULL stamp of the same config, and
  // the rewritten lock attests it.
  const fullRef = path.join(tmpRoot, "full-ref");
  await scaffold(config(fullRef, { harness: true }), { verify: false });
  assert.deepEqual(listHarnessFiles(app), listHarnessFiles(fullRef));
  assert.equal(checkHarnessIntegrity(app).status, "intact");

  // Governance surfaces are back.
  for (const rel of [
    "specs/app-base.spec.md",
    ".claude/skills/add-feature/SKILL.md",
    ".githooks/pre-push",
    "qa/approvals.json",
    "qa/comments.json",
    "qa/evidence/schema.json",
  ]) {
    assert.ok(exists(rel), `harden did not restore ${rel}`);
  }

  // The hook set is the full one again.
  const settings = JSON.parse(read(".claude/settings.json"));
  assert.ok(settings.hooks.Stop, "harden did not restore the Stop hook");

  // The spec-of-record records the climb.
  const record = JSON.parse(read("create-cmp.json"));
  assert.equal(record.harness, true);
});

test("an edited mode-variant file is never clobbered — sidecar instead", () => {
  const claude = read("CLAUDE.md");
  assert.match(claude, /Always run ktlint/, "harden clobbered the user's CLAUDE.md edit");
  assert.ok(exists("CLAUDE.md.cmp-new"), "no sidecar with the full-mode content was written");
  assert.match(read("CLAUDE.md.cmp-new"), /AI delivery contract/);
});

test("harden is idempotent — a second run finds nothing to do", async () => {
  const again = await hardenProject({ projectDir: app, apply: false });
  assert.equal(again.alreadyFull, true, "second harden did not short-circuit as already-full");
});

test("harden refuses a directory that was never stamped", async () => {
  const stranger = path.join(tmpRoot, "stranger");
  fs.mkdirSync(stranger, { recursive: true });
  await assert.rejects(() => hardenProject({ projectDir: stranger }), /create-cmp\.json/);
});
