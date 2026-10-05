// AFTER `create-cmp upgrade --harness --yes`, EVERY FILE UNDER `src/**/res/` IS ONE ANDROID'S
// RESOURCE MERGER ACCEPTS — WHATEVER GIT SAYS ABOUT THE LEFTOVERS (KD-284 review, round 1).
//
// KD-284's repair heals what earlier engines left inside `res/` before the run writes:
// `*.bak-upgrade` backups (removed) and `*.cmp-new` sidecars (moved into the run directory).
// Both heals ask git which files to touch, and they ask DIFFERENT questions:
//
//   staleBackupPaths      `git ls-files --others --ignored --exclude-standard`  — ignored only
//   staleResSidecarPaths  `git ls-files --others`                               — every untracked
//
// and with no git repository at all, both answer [] and nothing is healed. So a leftover the
// app's `.gitignore` does not ignore — every app stamped before v0.14.0 (ea6ade8, 2026-08-20,
// the commit that first ignored `*.bak-upgrade`), or one whose owner trimmed the file — and
// every leftover in a tree that is not a git repository, stays inside `res/`, where the
// resource merger rejects it and `assembleDebug` fails: the very failure KD-284 closes.
//
// The invariant is the build's, not the heal's: whatever the tree's git state, after the run
// nothing under `src/**/res/` lacks a resource extension. How a fix gets there — move instead
// of delete, ask git a different question, or not ask git at all — is the fixer's choice.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { copyDir, listFiles } from "../src/lib/fsutil.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const RES_XML = "composeApp/src/androidDebug/res/xml/debug_network_security_config.xml";
const RES_DIR = /(^|\/)src\/(?:[^/]+\/)*res\//;
const VALID_RES = /\.(xml|png|webp|jpg|jpeg|gif|ttf|otf)$/;

// What an earlier engine left inside res/: a backup beside the file it overwrote, and an
// unresolved conflict sidecar.
const LEFTOVERS = {
  [`${RES_XML}.bak-upgrade`]: "an earlier upgrade's backup\n",
  "composeApp/src/androidMain/res/drawable/ic_launcher_background.xml.cmp-new": "<!-- an unresolved conflict -->\n",
};

const CONFIG = {
  appName: "Acme",
  package: "com.acme.demo",
  iosBundleId: "com.acme.demo",
  themePrefix: "Acme",
  platforms: { android: true, ios: false },
  room: true,
  e2e: true,
  inspector: true,
  devClient: true,
  tabs: [{ label: "Home", icon: "home" }],
};

const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 180000 });
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });

let scratch;
let legacy;

before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-kd284-review-"));
  // The template the app was stamped from: this engine's, with the res/ file as it was before,
  // so the upgrade has a res/ change to make (the KD-284 trigger).
  legacy = path.join(scratch, "legacy-template");
  copyDir(path.join(ROOT, "template"), legacy);
  const xml = path.join(legacy, RES_XML);
  fs.writeFileSync(xml, fs.readFileSync(xml, "utf8").replace(/\s*<domain includeSubdomains="true">localhost<\/domain>/, ""));
});

after(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

/** Stamp, shape the tree's git state, plant the leftovers, upgrade; return the stray res/ files. */
async function upgradeWith(name, shapeGit) {
  const app = path.join(scratch, name);
  await offTheRunnerChannel(() => scaffold({ ...CONFIG, targetDir: app }, { templateDir: legacy, verify: false }));
  shapeGit(app);
  for (const [rel, body] of Object.entries(LEFTOVERS)) fs.writeFileSync(path.join(app, rel), body);
  const run = cli("upgrade", "--harness", "--target-dir", app, "--base-dir", legacy, "--yes");
  assert.equal(run.status, 0, `upgrade --harness failed:\n${run.stdout}\n${run.stderr}`);
  const stray = listFiles(path.join(app, "composeApp", "src"))
    .map((abs) => path.relative(app, abs).split(path.sep).join("/"))
    .filter((rel) => RES_DIR.test(rel) && !VALID_RES.test(rel));
  return { stray };
}

function commitAll(app) {
  for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "stamp"]]) {
    assert.equal(git(app, ...args).status, 0, `git ${args.join(" ")}`);
  }
}

test("an app whose .gitignore does not ignore *.bak-upgrade / *.cmp-new (stamped before v0.14.0) ends the upgrade with nothing in res/ the merger rejects", async () => {
  const { stray } = await upgradeWith("unignored", (app) => {
    const gi = path.join(app, ".gitignore");
    const lines = fs.readFileSync(gi, "utf8").split("\n").filter((l) => l !== "*.bak-upgrade" && l !== "*.cmp-new");
    fs.writeFileSync(gi, lines.join("\n"));
    commitAll(app);
    assert.notEqual(git(app, "check-ignore", "-q", `${RES_XML}.bak-upgrade`).status, 0, "fixture: the backup must not be ignored");
  });
  assert.deepEqual(stray, [], `left under res/, where Android's resource merger rejects it: ${stray.join(", ")}`);
});

test("an app that is not a git repository ends the upgrade with nothing in res/ the merger rejects", async () => {
  const { stray } = await upgradeWith("no-git", (app) => {
    assert.equal(fs.existsSync(path.join(app, ".git")), false, "fixture: the stamp must not be a git repository");
  });
  assert.deepEqual(stray, [], `left under res/, where Android's resource merger rejects it: ${stray.join(", ")}`);
});
