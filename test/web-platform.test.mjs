// `--web` — A BROWSER APP FROM THE SAME SCAFFOLD (docs/features/web-platform.md).
//
// Each decision in the brief that a later edit could quietly break is held here by the
// bytes a stamp writes and the exit codes a front door returns:
//
//   W1  web is opt-in: a default stamp carries no web byte at all (no webMain, no wasmJs
//       target, no Ktor JS engine, no docs/web.md, no webMain column in the architecture doc).
//   W2  a web stamp carries the target, the webMain entry point and index.html, and every
//       expect in commonMain has a webMain actual.
//   W3  web and Room are exclusive: `--web --room` is refused before anything is written,
//       `--web` alone stamps Room off and says so, and the engine refuses the config.
//   W4  the three seams ship in every stamp, on every platform source set.
//   W5  the lane's webBuild step SKIPs structurally without webMain; the verify gate runs
//       the browser build only for an app that has it.
//
// Files and exit codes, never Gradle: whether the web app COMPILES is CI's stamp-web job,
// which stamps it and builds the browser and Android apps on every PR.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateConfig } from "../src/scaffold.mjs";
import { disabledFeaturesFromConfig } from "../src/lib/toggle.mjs";
import { createCmpSteps } from "../packages/harness/src/lib/profiles/cmp/steps-cmp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const APP = ["--name", "Shop Till", "--package", "com.shop.till", "--no-ios", "--no-verify", "--yes"];
const PKG_DIR = "com/shop/till";

const cli = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", timeout: 120_000 });

const box = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-web-"));
test.after(() => fs.rmSync(box, { recursive: true, force: true }));

function stamp(name, ...flags) {
  const dir = path.join(box, name);
  const r = cli(box, dir, ...APP, ...flags);
  assert.equal(r.status, 0, `stamp ${flags.join(" ")} exited ${r.status}:\n${r.stdout}${r.stderr}`);
  return { dir, out: r.stdout + r.stderr };
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));

/** The expect/actual table's rows, as { name, cells: { "<sourceSet>": cell } }. */
function expectActualTable(dir) {
  const doc = read(dir, "docs/ARCHITECTURE.md");
  const start = doc.indexOf("<!-- cmp:generated expect-actual-table -->");
  const end = doc.indexOf("<!-- /cmp:generated -->", start);
  const lines = doc.slice(start, end).split("\n").filter((l) => l.startsWith("|"));
  const header = lines[0].split("|").slice(1, -1).map((c) => c.trim());
  return {
    header,
    rows: lines.slice(2).map((l) => {
      const cells = l.split("|").slice(1, -1).map((c) => c.trim());
      return { name: cells[0], cells: Object.fromEntries(header.map((h, i) => [h, cells[i]])) };
    }),
  };
}

const SEAMS = ["KeyValueStore", "DocumentPrinter", "PhotoPicker"];

let web;
let plain;
test.before(() => {
  web = stamp("web", "--web");
  plain = stamp("plain");
});

test("W3: --web --room is refused by name before anything is written", () => {
  const dir = path.join(box, "refused");
  const r = cli(box, dir, ...APP, "--web", "--room");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--web and --room cannot be stamped together/);
  assert.match(r.stderr, /Room 2\.8\.4 has no wasmJs/);
  assert.match(r.stderr, /Nothing was written/);
  assert.ok(!fs.existsSync(dir), "the target directory was not created");
});

test("W3: --web alone stamps without Room, says so, and records the choice", () => {
  assert.match(web.out, /--web stamps without Room/);
  const record = JSON.parse(read(web.dir, "create-cmp.json"));
  assert.deepEqual(record.platforms, { android: true, ios: false, web: true });
  assert.equal(record.room, false);
  assert.ok(!exists(web.dir, `composeApp/src/commonMain/kotlin/${PKG_DIR}/data/local`), "no Room sources");
});

test("W3: the engine refuses a config with web and Room, whichever door built it", () => {
  const base = {
    appName: "Shop", package: "com.shop.till", iosBundleId: "com.shop.till", themePrefix: "Shop",
    platforms: { android: true, ios: false, web: true }, room: true, e2e: true, inspector: true,
    devClient: true, tabs: [{ label: "Home", icon: "home" }], targetDir: "./x",
  };
  assert.throws(() => validateConfig(base), /room: must be false when platforms\.web is true/);
  assert.equal(validateConfig({ ...base, room: false }), true);
  // A config written before the key existed is still valid and means web off.
  assert.equal(validateConfig({ ...base, platforms: { android: true, ios: true }, room: true }), true);
  assert.ok(disabledFeaturesFromConfig({ ...base, platforms: { android: true, ios: true } }).has("web"));
});

test("W2: a web stamp carries the wasmJs target, the webMain entry point and index.html", () => {
  const gradle = read(web.dir, "composeApp/build.gradle.kts");
  assert.match(gradle, /wasmJs \{/);
  assert.match(gradle, /webMain\.dependencies \{\s*\n(\s*\/\/.*\n)*\s*implementation\(libs\.ktor\.client\.js\)/);
  assert.ok(!/cmp:feature/.test(gradle), "no marker survives the stamp");
  assert.match(read(web.dir, "gradle/libs.versions.toml"), /^ktor-client-js = /m);

  const main = read(web.dir, `composeApp/src/webMain/kotlin/${PKG_DIR}/main.kt`);
  assert.match(main, /^package com\.shop\.till$/m);
  assert.match(main, /ComposeViewport\(document\.body!!\)/);
  assert.match(read(web.dir, "composeApp/src/webMain/resources/index.html"), /<title>Shop Till<\/title>[\s\S]*composeApp\.js/);
  assert.ok(exists(web.dir, "docs/web.md"));
  assert.match(read(web.dir, "README.md"), /wasmJsBrowserDevelopmentRun/);
  assert.match(read(web.dir, "docs/ARCHITECTURE.md"), /\*\*Web's role:\*\*/);
});

test("W2: every expect in commonMain has a webMain actual, and the architecture doc says so", () => {
  const { header, rows } = expectActualTable(web.dir);
  assert.ok(header.includes("webMain (actual)"), `header: ${header.join(" | ")}`);
  for (const row of rows) {
    assert.doesNotMatch(row.cells["webMain (actual)"], /no actual found/, `${row.name} has no web actual`);
  }
  for (const seam of SEAMS) assert.ok(rows.some((r) => r.name.includes(seam)), `${seam} is in the table`);
});

test("W1: a default stamp carries no web byte", () => {
  assert.ok(!exists(plain.dir, "composeApp/src/webMain"));
  assert.ok(!exists(plain.dir, "docs/web.md"));
  assert.doesNotMatch(read(plain.dir, "composeApp/build.gradle.kts"), /wasmJs|webMain/);
  assert.doesNotMatch(read(plain.dir, "gradle/libs.versions.toml"), /ktor-client-js/);
  assert.doesNotMatch(read(plain.dir, "README.md"), /wasmJs/);
  assert.doesNotMatch(read(plain.dir, "docs/ARCHITECTURE.md"), /webMain|Web's role/);
  assert.doesNotMatch(read(plain.dir, ".github/workflows/verify.yml"), /wasmJs/);
  const record = JSON.parse(read(plain.dir, "create-cmp.json"));
  assert.equal(record.platforms.web, false);
  assert.equal(record.room, true, "a phone-only app keeps the default Room");
});

test("W4: the three seams ship in every stamp, with an actual on every platform source set", () => {
  const sets = { commonMain: "", androidMain: ".android", iosMain: ".ios", desktopMain: ".desktop" };
  for (const seam of SEAMS) {
    for (const [set, suffix] of Object.entries(sets)) {
      // --no-ios deletes iosMain; read the iOS actuals from the template instead.
      const dir = set === "iosMain" ? path.join(ROOT, "template") : plain.dir;
      const rel = set === "iosMain"
        ? `composeApp/src/iosMain/kotlin/com/example/app/core/platform/${seam}${suffix}.kt`
        : `composeApp/src/${set}/kotlin/${PKG_DIR}/core/platform/${seam}${suffix}.kt`;
      assert.ok(exists(dir, rel), `${rel} is missing`);
    }
    assert.ok(exists(web.dir, `composeApp/src/webMain/kotlin/${PKG_DIR}/core/platform/${seam}.web.kt`), `${seam} web actual`);
  }
  // The desktop printer is the one "not here" fake, and it says why in its result.
  assert.match(read(plain.dir, `composeApp/src/desktopMain/kotlin/${PKG_DIR}/core/platform/DocumentPrinter.desktop.kt`), /PrintOutcome\.Unsupported\("not on desktop/);
});

test("W5: the verify gate runs the browser build only for an app that has the target", () => {
  const webRun = cli(box, "verify", "--target-dir", web.dir, "--dry-run");
  assert.equal(webRun.status, 0, webRun.stdout + webRun.stderr);
  assert.match(webRun.stdout, /verify\.web: \.\/gradlew :composeApp:wasmJsBrowserDistribution/);
  const plainRun = cli(box, "verify", "--target-dir", plain.dir, "--dry-run");
  assert.equal(plainRun.status, 0, plainRun.stdout + plainRun.stderr);
  assert.doesNotMatch(plainRun.stdout, /verify\.web/);
});

test("W5: the lane's webBuild step SKIPs structurally in a tree without webMain, and runs no Gradle", () => {
  const empty = fs.mkdtempSync(path.join(box, "lane-"));
  const trap = (what) => () => {
    throw new Error(`${what} must not run for a structural SKIP`);
  };
  const pack = createCmpSteps({
    ROOT: empty, HERE: empty, fast: false, determinism: false, profile: "local", mode: "full",
    sh: trap("sh"), tryGit: trap("tryGit"), tryGitLines: trap("tryGitLines"), DEGRADED_PATHS: [],
  });
  const row = pack.STEP_FN_BY_NAME.webBuild();
  assert.equal(row.name, "webBuild");
  assert.equal(row.verdict, "SKIP");
  assert.equal(row.skipKind, "structure");
  assert.match(row.reason, /webMain absent/);
});

test("KD-298: a --web --minimal stamp names no lane step it does not have, and still says how the browser app is built", () => {
  const minimal = stamp("web-minimal", "--web", "--minimal");
  const doc = read(minimal.dir, "docs/web.md");
  assert.doesNotMatch(doc, /webBuild|verify lane/, "minimal has no lane");
  assert.match(doc, /wasmJsBrowserDistribution/);
  assert.match(read(minimal.dir, ".github/workflows/verify.yml"), /wasmJsBrowserDistribution/, "minimal's CI builds it, as the doc says");
  assert.match(read(web.dir, "docs/web.md"), /`webBuild` step/, "a full stamp keeps the lane sentence");
});

test("KD-296: the web KeyValueStore never lets a refused localStorage throw into the caller", () => {
  const src = read(web.dir, `composeApp/src/webMain/kotlin/${PKG_DIR}/core/platform/KeyValueStore.web.kt`);
  // Every touch of localStorage sits inside runCatching: reading the property itself throws
  // SecurityError where site data is blocked, and setItem throws QuotaExceededError.
  const touches = [...src.matchAll(/localStorage\.\w+\(/g)];
  assert.equal(touches.length, 3, "getItem, setItem, removeItem");
  for (const line of src.split("\n").filter((l) => /localStorage\.\w+\(/.test(l))) {
    assert.match(line, /runCatching \{ localStorage\./, `unguarded: ${line.trim()}`);
  }
  assert.match(src, /fallback\[key\] = value/, "a refused write is kept in memory, not dropped");
});
