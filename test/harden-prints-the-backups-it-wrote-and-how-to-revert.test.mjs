// `create-cmp harden` NAMES THE BACKUPS IT WROTE AND PRINTS HOW TO REVERT (KD-286).
//
// harden runs the same three-way walk as `upgrade --harness` and backs up every file it
// refreshes or deletes into `build/create-cmp-upgrade/<run>/`. It used to say only
// "backed up to build/create-cmp-upgrade/<run>/" — never which run — and print no backup path and
// no revert line, so an adopter could not find what it backed up. Now it prints the run directory
// and the same `mv "<backup>" "<file>"` lines `upgrade` prints, and every path it prints exists.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");

let scratch;
let app;
let run;

before(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harden-revert-"));
  app = path.join(scratch, "app");
  await offTheRunnerChannel(() =>
    scaffold(
      {
        appName: "Acme",
        package: "com.acme.demo",
        iosBundleId: "com.acme.demo",
        themePrefix: "Acme",
        harness: false,
        platforms: { android: true, ios: false },
        room: true,
        e2e: true,
        inspector: true,
        devClient: true,
        tabs: [{ label: "Home", icon: "home" }],
        targetDir: app,
      },
      { verify: false },
    ),
  );
  run = spawnSync(process.execPath, [BIN, "harden", "--target-dir", app, "--yes"], { encoding: "utf8", timeout: 180000 });
});

after(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

test("harden prints its backup directory and an mv revert line per backup, and every printed path exists", () => {
  assert.equal(run.status, 0, `harden failed:\n${run.stdout}\n${run.stderr}`);
  const out = run.stdout;
  const dir = out.match(/backups? (?:written )?(?:to|in) (build\/create-cmp-upgrade\/[^/\s]+)\//);
  assert.ok(dir, `harden never names its backup directory:\n${out}`);
  assert.ok(fs.statSync(path.join(app, dir[1])).isDirectory(), `the named backup directory ${dir[1]} does not exist`);
  const reverts = [...out.matchAll(/^ {2}mv "([^"]+)" "([^"]+)"$/gm)];
  assert.ok(reverts.length > 0, `harden refreshed files but printed no mv revert line:\n${out}`);
  for (const [, backup, file] of reverts) {
    assert.ok(backup.startsWith(path.join(app, dir[1]) + path.sep), `revert source ${backup} is not in ${dir[1]}`);
    assert.ok(fs.existsSync(backup), `the revert line names a backup that does not exist: ${backup}`);
    assert.ok(file.startsWith(app + path.sep), `revert destination ${file} is outside the app`);
  }
});
