// Feature-toggle strip regression tests against the REAL template.
//
// Root cause these guard (found by the Phase 2 inspector spike): manifest
// feature paths are declared with the literal `com/example/app` segment, but
// path deletion used to run AFTER the package-dir rename — so with any
// non-default package the deletion silently missed every package-rooted path.
// `--no-room` then stripped the Room deps/plugin but LEFT the Room sources →
// unresolved `androidx.room` at build time. The scaffold now deletes disabled
// feature paths BEFORE the rename; each test here stamps the real template
// with a NON-default package and greps for leftover references to the
// stripped feature's symbols (grep-level: no Gradle in unit tests).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../src/scaffold.mjs";
import { listFiles } from "../src/lib/fsutil.mjs";

function baseConfig(targetDir, overrides = {}) {
  return {
    appName: "Acme",
    // Deliberately NOT com.example.app — exercises the delete-before-rename fix.
    package: "com.acme.demo",
    iosBundleId: "com.acme.demo",
    region: "us-central1",
    themePrefix: "Acme",
    platforms: { android: true, ios: true },
    firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
    room: true,
    appium: true,
    inspector: true,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir,
    ...overrides,
  };
}

async function stamp(overrides) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-strip-"));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

/** Every text (kt/kts/xml/swift/rb/json/yml) file whose content matches `re`. */
function grepSources(dir, re) {
  const hits = [];
  for (const file of listFiles(dir)) {
    if (!/\.(kt|kts|xml|swift|rb|json|yml|yaml|properties|toml)$/.test(file)) continue;
    // The version catalog keeps declared-but-unused coordinates by design;
    // feature toggles strip usages, not catalog declarations.
    if (file.endsWith(path.join("gradle", "libs.versions.toml"))) continue;
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (re.test(content)) hits.push(path.relative(dir, file));
  }
  return hits;
}

function findDirs(dir, name) {
  return listFiles(dir)
    .filter((f) => f.split(path.sep).includes(name))
    .map((f) => path.relative(dir, f));
}

test("--no-room: Room sources deleted and zero androidx.room/AppDatabase references remain", async () => {
  const out = await stamp({ room: false });

  assert.deepEqual(findDirs(path.join(out, "composeApp"), "local"), [], "data/local dirs must be gone");
  assert.ok(!fs.existsSync(path.join(out, "composeApp", "schemas")), "schemas dir must be gone");

  for (const re of [/androidx\.room/, /\bAppDatabase\b/, /\bbuildDatabase\b/, /room\.compiler/]) {
    assert.deepEqual(grepSources(out, re), [], `no reference may survive: ${re}`);
  }
  // room plugin/deps stripped from gradle files
  const build = fs.readFileSync(path.join(out, "composeApp", "build.gradle.kts"), "utf8");
  assert.ok(!build.includes("libs.room"), "room deps stripped");
  assert.ok(!build.includes("room {"), "room schema block stripped");

  fs.rmSync(out, { recursive: true, force: true });
});

test("--no-firebase: config files deleted and zero dev.gitlive references remain", async () => {
  const out = await stamp({ firebase: { enabled: false } });

  assert.ok(!fs.existsSync(path.join(out, "composeApp", "google-services.json")));
  assert.ok(!fs.existsSync(path.join(out, "iosApp", "iosApp", "GoogleService-Info.plist")));
  assert.deepEqual(grepSources(out, /dev\.gitlive/), [], "no GitLive reference may survive");
  assert.deepEqual(grepSources(out, /USE_FIREBASE_EMULATORS/), [], "no emulator BuildConfig wiring may survive");

  fs.rmSync(out, { recursive: true, force: true });
});

test("--no-appium: harness dirs deleted", async () => {
  const out = await stamp({ appium: false });
  assert.ok(!fs.existsSync(path.join(out, "qa", "appium")));
  assert.ok(!fs.existsSync(path.join(out, "tests", "appium")));
  fs.rmSync(out, { recursive: true, force: true });
});

test("--no-inspector: inspector sources deleted and zero startInspector//inspect/ references remain", async () => {
  const out = await stamp({ inspector: false });

  assert.deepEqual(findDirs(path.join(out, "composeApp"), "inspector"), [], "inspector dirs must be gone");
  for (const re of [/startInspector/, /\/inspect\//, /ViewRootForTest/, /InspectorHttpServer/]) {
    assert.deepEqual(grepSources(out, re), [], `no reference may survive: ${re}`);
  }

  fs.rmSync(out, { recursive: true, force: true });
});

test("default (inspector ON): debug module + release no-op twin stamped under the renamed package", async () => {
  const out = await stamp({});

  const debugDir = path.join(out, "composeApp/src/androidDebug/kotlin/com/acme/demo/inspector");
  const releaseDir = path.join(out, "composeApp/src/androidRelease/kotlin/com/acme/demo/inspector");
  for (const f of [
    "InspectorInit.kt",
    "ComposeRootRegistry.kt",
    "InspectorHttpServer.kt",
    "LiveSemanticsJson.kt",
    "InspectorCatalog.kt",
  ]) {
    assert.ok(fs.existsSync(path.join(debugDir, f)), `androidDebug must ship ${f}`);
  }
  assert.ok(fs.existsSync(path.join(releaseDir, "InspectorInit.kt")), "androidRelease no-op twin must exist");

  const init = fs.readFileSync(path.join(debugDir, "InspectorInit.kt"), "utf8");
  assert.match(init, /package com\.acme\.demo\.inspector/);
  const releaseInit = fs.readFileSync(path.join(releaseDir, "InspectorInit.kt"), "utf8");
  assert.ok(!releaseInit.includes("/inspect/"), "release twin must carry no endpoint strings");

  const app = fs.readFileSync(
    path.join(out, "composeApp/src/androidMain/kotlin/com/acme/demo/AppApplication.kt"),
    "utf8"
  );
  assert.match(app, /startInspector\(\)/);
  assert.ok(!app.includes("cmp:feature"), "no marker noise");

  // Catalog reads from the REAL theme objects (theme prefix applied).
  const catalog = fs.readFileSync(path.join(debugDir, "InspectorCatalog.kt"), "utf8");
  assert.match(catalog, /AcmeColors\.Primary/);
  assert.match(catalog, /AcmeTokens\.PaddingPage/);

  fs.rmSync(out, { recursive: true, force: true });
});
