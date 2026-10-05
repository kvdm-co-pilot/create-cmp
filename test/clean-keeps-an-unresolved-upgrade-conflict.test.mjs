// `create-cmp clean` NEVER DELETES AN UNRESOLVED UPGRADE CONFLICT (KD-286).
//
// Since KD-284 an upgrade writes its backups — and, for a file a build tool reads whole, its
// `.cmp-new` conflict sidecar — under the root `build/create-cmp-upgrade/<run>/`. `clean` deletes
// `build/` directories. A run directory that holds a `.cmp-new` is a conflict the owner has not
// resolved yet: the engine's new content exists nowhere else. So `clean` keeps
// `build/create-cmp-upgrade/` when any `*.cmp-new` is under it, deletes the rest of that `build/`,
// and names the path it kept. With no sidecar there, the whole `build/` goes as before.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const RUN = "build/create-cmp-upgrade/2026-10-05T10-00-00-000Z";

function project(files) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-clean-conflict-"));
  const home = path.join(scratch, "home"); // an empty HOME: no ~/.konan, no ~/.gradle to touch
  const app = path.join(scratch, "app");
  fs.mkdirSync(home, { recursive: true });
  for (const [rel, body] of Object.entries({
    "settings.gradle.kts": "",
    "build.gradle.kts": "",
    "composeApp/build.gradle.kts": "",
    "composeApp/build/out.txt": "x\n",
    "build/reports/problems.html": "x\n",
    [`${RUN}/AGENTS.md`]: "a backup\n",
    ...files,
  })) {
    fs.mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
    fs.writeFileSync(path.join(app, rel), body);
  }
  const run = spawnSync(process.execPath, [BIN, "clean", "--target-dir", app, "--yes"], {
    encoding: "utf8",
    env: { ...process.env, HOME: home },
    timeout: 60000,
  });
  return { scratch, app, run };
}

test("clean keeps build/create-cmp-upgrade/ while it holds a *.cmp-new, deletes the rest of build/, and names what it kept", () => {
  const sidecar = `${RUN}/composeApp/src/commonMain/composeResources/font/Inter.ttf.cmp-new`;
  const { scratch, app, run } = project({ [sidecar]: "the engine's font\n" });
  try {
    assert.equal(run.status, 0, `clean failed:\n${run.stdout}\n${run.stderr}`);
    assert.ok(fs.existsSync(path.join(app, sidecar)), `clean deleted an unresolved upgrade conflict, ${sidecar}`);
    assert.equal(fs.readFileSync(path.join(app, sidecar), "utf8"), "the engine's font\n");
    assert.ok(fs.existsSync(path.join(app, RUN, "AGENTS.md")), "the run's backups went with the rest of build/");
    assert.equal(fs.existsSync(path.join(app, "build/reports")), false, "the rest of the root build/ was not cleaned");
    assert.equal(fs.existsSync(path.join(app, "composeApp/build")), false, "a module build/ was not cleaned");
    assert.match(run.stdout, /build\/create-cmp-upgrade/, `clean never named the directory it kept:\n${run.stdout}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("clean deletes the whole root build/ — backups included — when no upgrade conflict is under it", () => {
  const { scratch, app, run } = project({});
  try {
    assert.equal(run.status, 0, `clean failed:\n${run.stdout}\n${run.stderr}`);
    assert.equal(fs.existsSync(path.join(app, "build")), false, "the root build/ survived a clean with nothing to keep");
    assert.equal(fs.existsSync(path.join(app, "composeApp/build")), false);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
