import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../src/scaffold.mjs";

// Build a tiny synthetic template (NOT the real one) exercising every pipeline
// stage: token content + path replace, package-dir rename, feature markers,
// and manifest feature paths.
function makeTemplate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-tpl-"));
  const w = (rel, content) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };

  w(
    "manifest.json",
    JSON.stringify({
      placeholders: ["__APP_NAME__", "__PACKAGE__", "__PACKAGE_PATH__", "__IOS_BUNDLE_ID__", "__REGION__", "__THEME_PREFIX__"],
      packageSourceRoots: ["composeApp/src/commonMain/kotlin", "composeApp/src/iosMain/kotlin"],
      features: {
        ios: { enabledByDefault: true, paths: ["iosApp", "composeApp/src/iosMain"] },
        firebase: { enabledByDefault: true, paths: [] },
        room: { enabledByDefault: true, paths: [] },
        appium: { enabledByDefault: true, paths: ["qa"] },
      },
      verify: { android: "true", ios: "true" },
    })
  );

  // common source with package + theme prefix tokens.
  // NB: file CONTENTS use the __PACKAGE__ token (the template agent replaces the
  // literal `com.example.app` text with the token); only DIRECTORY names keep the
  // literal `com/example/app` segment for the engine to rename. (CONTRACT §tokens)
  w(
    "composeApp/src/commonMain/kotlin/com/example/app/Main.kt",
    "package __PACKAGE__\nclass __THEME_PREFIX__Theme // region __REGION__\n"
  );
  // iosMain source (will be removed when ios disabled)
  w("composeApp/src/iosMain/kotlin/com/example/app/IosMain.kt", "package __PACKAGE__\n");
  // settings file with display name + bundle id
  w("settings.gradle.kts", 'rootProject.name = "__APP_NAME__"\n// bundle __IOS_BUNDLE_ID__\n');
  // build file with a feature-marked ios block
  w(
    "composeApp/build.gradle.kts",
    [
      "kotlin {",
      "  androidTarget()",
      "  // >>> cmp:feature ios",
      "  iosX64(); iosArm64(); iosSimulatorArm64()",
      "  // <<< cmp:feature ios",
      "}",
    ].join("\n")
  );
  // a path-token file + dir
  w("composeApp/src/commonMain/kotlin/com/example/app/theme/__THEME_PREFIX__Tokens.kt", "// tokens\n");
  // feature dirs
  w("iosApp/project.yml", "name: ios\n");
  w("qa/appium/smoke.py", "# smoke\n");
  // a fake binary that embeds the literal token __PACKAGE__ in its bytes; the
  // engine must NOT rewrite binary content, so the token must survive verbatim.
  fs.writeFileSync(
    path.join(dir, "icon.png"),
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from("__PACKAGE__")])
  );
  return dir;
}

function baseConfig(targetDir, overrides = {}) {
  return {
    appName: "Acme",
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

test("full scaffold (iOS on): tokens, package rename, markers stripped, verify GREEN", async () => {
  const tpl = makeTemplate();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"));
  const config = baseConfig(out);

  const { verdict } = await scaffold(config, { templateDir: tpl, verify: true });

  // package dir renamed
  const mainKt = path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/Main.kt");
  assert.ok(fs.existsSync(mainKt), "package dir renamed");
  const main = fs.readFileSync(mainKt, "utf8");
  assert.match(main, /package com\.acme\.demo/);
  assert.match(main, /class AcmeTheme/);
  assert.match(main, /region us-central1/);
  assert.ok(!main.includes("example"));

  // path-token file renamed
  assert.ok(
    fs.existsSync(path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/theme/AcmeTokens.kt")),
    "__THEME_PREFIX__ file path replaced"
  );

  // settings tokens
  const settings = fs.readFileSync(path.join(out, "settings.gradle.kts"), "utf8");
  assert.match(settings, /rootProject\.name = "Acme"/);
  assert.match(settings, /bundle com\.acme\.demo/);

  // ios markers stripped to leave the body (ios enabled → marker lines gone, body kept)
  const build = fs.readFileSync(path.join(out, "composeApp/build.gradle.kts"), "utf8");
  assert.match(build, /iosX64\(\); iosArm64\(\); iosSimulatorArm64\(\)/);
  assert.ok(!build.includes("cmp:feature"), "marker comments removed");

  // ios dirs retained
  assert.ok(fs.existsSync(path.join(out, "iosApp/project.yml")));
  assert.ok(fs.existsSync(path.join(out, "composeApp/src/iosMain/kotlin/com/acme/demo/IosMain.kt")));

  // manifest dropped from output
  assert.ok(!fs.existsSync(path.join(out, "manifest.json")), "manifest stripped from output");

  // binary untouched — token bytes survive verbatim (no content replacement)
  const png = fs.readFileSync(path.join(out, "icon.png"));
  assert.ok(png.includes(Buffer.from("__PACKAGE__")), "binary token bytes preserved");
  assert.equal(png.length, 4 + "__PACKAGE__".length, "binary bytes unchanged");

  // verify green (verify cmds are 'true')
  assert.equal(verdict.green, true);

  fs.rmSync(tpl, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

test("scaffold with iOS + appium disabled removes their files and bodies", async () => {
  const tpl = makeTemplate();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"));
  const config = baseConfig(out, {
    platforms: { android: true, ios: false },
    appium: false,
  });

  await scaffold(config, { templateDir: tpl, verify: true });

  // ios feature paths removed
  assert.ok(!fs.existsSync(path.join(out, "iosApp")), "iosApp removed");
  assert.ok(!fs.existsSync(path.join(out, "composeApp/src/iosMain")), "iosMain removed");
  // appium feature path removed
  assert.ok(!fs.existsSync(path.join(out, "qa")), "qa removed");

  // ios marker BODY stripped from build file
  const build = fs.readFileSync(path.join(out, "composeApp/build.gradle.kts"), "utf8");
  assert.ok(!build.includes("iosX64"), "ios target lines stripped");
  assert.ok(!build.includes("cmp:feature"));
  assert.match(build, /androidTarget\(\)/);

  fs.rmSync(tpl, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

test("scaffold refuses invalid config", async () => {
  const tpl = makeTemplate();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"));
  const bad = baseConfig(out, { package: "NotValid" });
  await assert.rejects(() => scaffold(bad, { templateDir: tpl, verify: false }), /Invalid config/);
  fs.rmSync(tpl, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

test("scaffold is idempotent on a fresh dir and refuses non-empty without force", async () => {
  const tpl = makeTemplate();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"));
  await scaffold(baseConfig(out), { templateDir: tpl, verify: false });
  // second run without force should reject (non-empty)
  await assert.rejects(
    () => scaffold(baseConfig(out), { templateDir: tpl, verify: false }),
    /not empty/
  );
  // with force it succeeds again
  await scaffold(baseConfig(out), { templateDir: tpl, verify: false, force: true });
  assert.ok(
    fs.existsSync(path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/Main.kt"))
  );
  fs.rmSync(tpl, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});
