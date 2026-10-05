// AN UPGRADE NEVER WRITES INTO AN ANDROID RESOURCE DIRECTORY (KD-284).
//
// Every file `create-cmp upgrade` overwrote got a `<file>.bak-upgrade` sibling, and every
// conflict a `<file>.cmp-new` one. Under `composeApp/src/**/res/` Android's resource merger
// rejects both — `debug_network_security_config.xml.bak-upgrade: Error: The file name must
// end with .xml` — so the upgrade whose own advice is "Prove the build" broke the build
// (create-cmp-showcase, 2026-10-05, after the 0.28.9 harness upgrade; 57 legacy files).
//
// Now every backup goes to ONE directory per run, `build/create-cmp-upgrade/<timestamp>/`,
// under Gradle's own ignored output root; a conflict sidecar stays beside its file (the
// human resolves it there) unless that file is inside a `res/` directory, where it joins
// the run directory too. Legacy `*.bak-upgrade` files are removed before the run writes, and
// a legacy `*.cmp-new` under `res/` is MOVED (it may hold an unresolved conflict).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { copyDir, listFiles } from "../src/lib/fsutil.mjs";
import * as upgradeLib from "../src/lib/upgrade.mjs";
import { applyHarnessPlan, planHarnessUpgrade } from "../src/lib/harness-upgrade.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const RES_XML = "composeApp/src/androidDebug/res/xml/debug_network_security_config.xml";
const RUNS = "build/create-cmp-upgrade";

const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 180000 });
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });

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

/** The one directory this run wrote under build/create-cmp-upgrade/, or null. */
function runDirOf(app) {
  const root = path.join(app, RUNS);
  if (!fs.existsSync(root)) return null;
  const runs = fs.readdirSync(root);
  assert.equal(runs.length, 1, `one run directory per upgrade run, found: ${runs.join(", ")}`);
  return `${RUNS}/${runs[0]}`;
}

// --- the placement rule, pure --------------------------------------------------

test("upgradeArtifactPath: backups always go to the run directory; a sidecar goes there only from a res/ directory", () => {
  const place = upgradeLib.upgradeArtifactPath;
  assert.equal(typeof place, "function", "src/lib/upgrade.mjs exports no upgradeArtifactPath");
  const run = `${RUNS}/2026-10-05T10-00-00-000Z`;
  assert.equal(place(RES_XML, "backup", run), `${run}/${RES_XML}`);
  assert.equal(place("gradle/libs.versions.toml", "backup", run), `${run}/gradle/libs.versions.toml`);
  assert.equal(place("AGENTS.md", "sidecar", run), "AGENTS.md.cmp-new", "a non-res sidecar stays beside its file");
  assert.equal(place("composeApp/build.gradle.kts", "sidecar", run), "composeApp/build.gradle.kts.cmp-new");
  assert.equal(place(RES_XML, "sidecar", run), `${run}/${RES_XML}.cmp-new`, "a res/ sidecar joins the run directory");
  assert.equal(place("composeApp/src/main/res/values/strings.xml", "sidecar", run), `${run}/composeApp/src/main/res/values/strings.xml.cmp-new`);
  // `res` only counts as a segment under `src/` — a `res` elsewhere is not Android's.
  assert.equal(place("docs/res/notes.md", "sidecar", run), "docs/res/notes.md.cmp-new");
  assert.equal(place("composeApp/src/commonMain/kotlin/resolve/Res.kt", "sidecar", run), "composeApp/src/commonMain/kotlin/resolve/Res.kt.cmp-new");
  assert.throws(() => place(RES_XML, "other", run), /kind/);
});

// --- applyHarnessPlan: where a conflict's sidecar lands ---------------------------

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

function conflictOn(rel) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-kd284-conflict-"));
  const [base, next, app] = ["base", "next", "app"].map((d) => path.join(scratch, d));
  writeTree(base, { [rel]: "x\ny\nz\n" });
  writeTree(next, { [rel]: "x\ny ENGINE\nz\n" });
  writeTree(app, { [rel]: "x\ny APP\nz\n" });
  const plan = planHarnessUpgrade({ baseDir: base, newDir: next, projectDir: app });
  const runDir = `${RUNS}/2026-10-05T10-00-00-000Z`;
  const result = applyHarnessPlan(
    app,
    plan.entries.filter((e) => e.write !== null || e.sidecar !== null || e.remove),
    { runDir },
  );
  return { scratch, app, runDir, result };
}

test("a conflict on a res/ file puts its sidecar in the run directory, never beside the file", () => {
  const rel = "composeApp/src/androidMain/res/values/strings.xml";
  const { scratch, app, runDir, result } = conflictOn(rel);
  try {
    assert.equal(fs.readFileSync(path.join(app, rel), "utf8"), "x\ny APP\nz\n", "the app's file is untouched");
    assert.equal(fs.existsSync(path.join(app, rel + ".cmp-new")), false, "a .cmp-new was written inside res/ — Android's resource merger rejects it");
    const sidecar = `${runDir}/${rel}.cmp-new`;
    assert.equal(fs.readFileSync(path.join(app, sidecar), "utf8"), "x\ny ENGINE\nz\n", "the sidecar carries the new engine content");
    assert.deepEqual(result.sidecars, [sidecar], "the result names where the sidecar actually is");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("a conflict on a non-res file still puts its .cmp-new beside it", () => {
  const rel = "composeApp/build.gradle.kts";
  const { scratch, app, runDir, result } = conflictOn(rel);
  try {
    assert.equal(fs.readFileSync(path.join(app, rel + ".cmp-new"), "utf8"), "x\ny ENGINE\nz\n");
    assert.equal(fs.existsSync(path.join(app, runDir)), false, "nothing went to the run directory");
    assert.deepEqual(result.sidecars, [rel + ".cmp-new"]);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// --- the CLI, on a real stamp whose res/ file the engine changed -------------------

const VALID_RES = /\.(xml|png|webp|jpg|jpeg|gif|ttf|otf)$/;
let scratch;
let app;
let run;
const LEGACY_SIDECAR = "composeApp/src/androidMain/res/drawable/ic_launcher_background.xml.cmp-new";
const LEGACY_BACKUPS = [`${RES_XML}.bak-upgrade`, "AGENTS.md.bak-upgrade"];

before(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-kd284-"));
  // The template this app was stamped from: this engine's, with the res/ file as it was before.
  const legacy = path.join(scratch, "legacy-template");
  copyDir(path.join(ROOT, "template"), legacy);
  const xml = path.join(legacy, RES_XML);
  fs.writeFileSync(xml, fs.readFileSync(xml, "utf8").replace(/\s*<domain includeSubdomains="true">localhost<\/domain>/, ""));
  app = path.join(scratch, "app");
  await offTheRunnerChannel(() => scaffold({ ...CONFIG, targetDir: app }, { templateDir: legacy, verify: false }));
  for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "stamp"]]) {
    assert.equal(git(app, ...args).status, 0, `git ${args.join(" ")}`);
  }
  // What an earlier engine left: backups beside files (one inside res/), and an unresolved
  // conflict sidecar inside res/ — both gitignored by the stamp, both rejected by the merger.
  for (const rel of LEGACY_BACKUPS) fs.writeFileSync(path.join(app, rel), "an earlier upgrade's backup\n");
  fs.writeFileSync(path.join(app, LEGACY_SIDECAR), "<!-- an unresolved conflict -->\n");
  run = cli("upgrade", "--harness", "--target-dir", app, "--base-dir", legacy, "--yes");
});

after(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

test("root build/ — where the run directory lives — is ignored by the stamp", () => {
  assert.match(fs.readFileSync(path.join(app, ".gitignore"), "utf8"), /^build\/$/m, "the stamp's .gitignore does not ignore build/");
  assert.equal(git(app, "check-ignore", "-q", `${RUNS}/x/AGENTS.md`).status, 0, "git does not ignore a path under build/create-cmp-upgrade/");
});

test("upgrade --harness --yes on a stamp whose res/ file changed leaves res/ clean and the backup under build/create-cmp-upgrade/", () => {
  assert.equal(run.status, 0, `upgrade --harness failed:\n${run.stdout}\n${run.stderr}`);
  const stray = listFiles(path.join(app, "composeApp", "src"))
    .map((abs) => path.relative(app, abs).split(path.sep).join("/"))
    .filter((rel) => /(^|\/)src\/(?:[^/]+\/)*res\//.test(rel) && !VALID_RES.test(rel));
  assert.deepEqual(stray, [], "a file Android's resource merger rejects was left under res/");
  assert.match(fs.readFileSync(path.join(app, RES_XML), "utf8"), /localhost/, "the engine's res/ change landed");
  const dir = runDirOf(app);
  assert.ok(dir, `no ${RUNS}/<run>/ directory was written`);
  assert.match(dir, /^build\/create-cmp-upgrade\/\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/, "the run directory is a path-safe ISO timestamp");
  const backup = path.join(app, dir, RES_XML);
  assert.doesNotMatch(fs.readFileSync(backup, "utf8"), /localhost/, "the backup holds the file as it was before the upgrade");
  assert.ok(run.stdout.includes(`mv "${backup}" "${path.join(app, RES_XML)}"`), `the revert line does not name the backup's path:\n${run.stdout}`);
  assert.ok(run.stdout.includes(dir), "the consent text / report never names the run directory");
});

test("legacy *.bak-upgrade files are removed everywhere (res/ included) and a legacy *.cmp-new under res/ is moved, not deleted", () => {
  for (const rel of LEGACY_BACKUPS) assert.equal(fs.existsSync(path.join(app, rel)), false, `legacy ${rel} survived the upgrade`);
  assert.equal(fs.existsSync(path.join(app, LEGACY_SIDECAR)), false, "a legacy .cmp-new was left inside res/");
  const dir = runDirOf(app);
  assert.ok(dir, `no ${RUNS}/<run>/ directory was written`);
  const moved = path.join(app, dir, LEGACY_SIDECAR);
  assert.equal(fs.readFileSync(moved, "utf8"), "<!-- an unresolved conflict -->\n", "the legacy sidecar's content was lost — it may hold an unresolved conflict");
  assert.ok(run.stdout.includes(`${dir}/${LEGACY_SIDECAR}`), `the move is not reported:\n${run.stdout}`);
});
