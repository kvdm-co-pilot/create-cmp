// RUNNING EVERY LINE UNDER "To revert" RETURNS EVERY FILE THE RUN CHANGED TO ITS PRE-RUN BYTES
// (KD-284 review, round 2).
//
// `upgrade --harness` and — since KD-286's fix (7c0d0bc) — `harden` end with a "To revert"
// block: one `mv "<backup>" "<file>"` per file they backed up and one `rm "<file>"` per file
// they created. A heading that says "To revert" is a claim that those lines ARE the revert.
// Both commands also write files OUTSIDE that story, with no backup and no line:
//
//   harden   create-cmp.json (harness: true, engineVersion), qa/harness.lock.json, and every
//            app-state seed it copies (qa/approvals.json, qa/comments.json, qa/evidence/…)
//   upgrade  create-cmp.json (engineVersion → the new engine), the harness lock and source
//
// So an adopter who runs the printed lines does not get the tree they had. After `harden`,
// create-cmp.json still says `harness: true` over a tree whose harness was just `rm`'d. After
// `upgrade --harness`, engineVersion names the new engine over the old engine's files — the
// next upgrade takes the wrong merge base, reads the reverted files as the app's own edits,
// and never re-applies the change: the compounding defect writeBackEngineVersion exists to stop.
//
// The invariant is the revert's, not any one file's: snapshot the tree (outside build/, where
// the backups live), run the command, run every printed revert line, snapshot again — the two
// are equal. How a fix gets there (back the record and lock up into the run directory, print
// an `rm` per seed, or stop calling it "To revert") is the fixer's choice.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { copyDir } from "../src/lib/fsutil.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const RES_XML = "composeApp/src/androidDebug/res/xml/debug_network_security_config.xml";

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

let scratch;
before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-kd284-r2-revert-"));
});
after(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

/** path → sha1 of every file outside the root build/ (where the backups themselves live). */
function snapshot(app) {
  const out = new Map();
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (r === "build") continue;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else out.set(r, crypto.createHash("sha1").update(fs.readFileSync(path.join(abs, e.name))).digest("hex"));
    }
  };
  walk(app, "");
  return out;
}

/** Execute every printed revert line (`mv "a" "b"` / `rm "a"`), exactly as printed. */
function runRevertLines(stdout) {
  const block = stdout.split(/\n.*To revert.*\n/)[1] ?? "";
  const lines = block.split("\n").filter((l) => /^ {2}(mv|rm) "/.test(l));
  for (const l of lines) {
    const r = spawnSync("/bin/sh", ["-c", l.trim()], { encoding: "utf8" });
    assert.equal(r.status, 0, `a printed revert line fails when run: ${l.trim()}\n${r.stderr}`);
  }
  return lines.length;
}

function drift(before, afterRevert) {
  const d = [];
  for (const [k, v] of before) if (afterRevert.get(k) !== v) d.push(`${afterRevert.has(k) ? "changed" : "missing"} ${k}`);
  for (const k of afterRevert.keys()) if (!before.has(k)) d.push(`left behind ${k}`);
  return d;
}

test("running every line harden prints under 'To revert' returns every file it changed to its pre-harden bytes", async () => {
  const app = path.join(scratch, "harden");
  await offTheRunnerChannel(() => scaffold({ ...CONFIG, harness: false, targetDir: app }, { verify: false }));
  const pre = snapshot(app);
  const run = cli("harden", "--target-dir", app, "--yes");
  assert.equal(run.status, 0, `harden failed:\n${run.stdout}\n${run.stderr}`);
  assert.ok(runRevertLines(run.stdout) > 0, `harden printed no revert lines:\n${run.stdout}`);
  const left = drift(pre, snapshot(app));
  assert.deepEqual(left, [], `after every printed revert line ran, the tree is not the one harden started from:\n  ${left.join("\n  ")}`);
});

test("running every line upgrade --harness prints under 'To revert' returns every file it changed to its pre-upgrade bytes", async () => {
  // An app stamped from an earlier engine: its template lacks one res/ line this engine has,
  // and its record names an earlier engine version — the shape of every real upgrade.
  const earlier = path.join(scratch, "earlier-template");
  copyDir(path.join(ROOT, "template"), earlier);
  const xml = path.join(earlier, RES_XML);
  fs.writeFileSync(xml, fs.readFileSync(xml, "utf8").replace(/\s*<domain includeSubdomains="true">localhost<\/domain>/, ""));
  const app = path.join(scratch, "upgrade");
  await offTheRunnerChannel(() => scaffold({ ...CONFIG, targetDir: app }, { templateDir: earlier, verify: false }));
  const spec = path.join(app, "create-cmp.json");
  const record = JSON.parse(fs.readFileSync(spec, "utf8"));
  fs.writeFileSync(spec, JSON.stringify({ ...record, engineVersion: "0.28.9" }, null, 2) + "\n");

  const pre = snapshot(app);
  const run = cli("upgrade", "--harness", "--target-dir", app, "--base-dir", earlier, "--yes");
  assert.equal(run.status, 0, `upgrade --harness failed:\n${run.stdout}\n${run.stderr}`);
  assert.ok(runRevertLines(run.stdout) > 0, `upgrade --harness printed no revert lines:\n${run.stdout}`);
  const left = drift(pre, snapshot(app));
  assert.deepEqual(left, [], `after every printed revert line ran, the tree is not the one upgrade started from:\n  ${left.join("\n  ")}`);
});
