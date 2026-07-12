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
      packageSourceRoots: [
        "composeApp/src/commonMain/kotlin",
        "composeApp/src/commonTest/kotlin",
        "composeApp/src/iosMain/kotlin",
      ],
      features: {
        ios: { enabledByDefault: true, paths: ["iosApp", "composeApp/src/iosMain"] },
        firebase: { enabledByDefault: true, paths: [] },
        room: { enabledByDefault: true, paths: [] },
        e2e: { enabledByDefault: true, paths: ["qa"] },
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
  // commonTest source — the harness's exemplar tests are stamped like any other package root
  w(
    "composeApp/src/commonTest/kotlin/com/example/app/home/HomeViewModelTest.kt",
    "package __PACKAGE__.home\nimport __PACKAGE__.home.HomeViewModel\nclass HomeViewModelTest\n"
  );
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
  w("qa/e2e/smoke.py", "# smoke\n");
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
    e2e: true,
    inspector: true,
    devClient: true,
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

  // commonTest root stamped: dir renamed + package token replaced in the test source
  const testKt = path.join(out, "composeApp/src/commonTest/kotlin/com/acme/demo/home/HomeViewModelTest.kt");
  assert.ok(fs.existsSync(testKt), "commonTest package dir renamed");
  assert.match(fs.readFileSync(testKt, "utf8"), /package com\.acme\.demo\.home/);

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

test("scaffold with iOS + e2e disabled removes their files and bodies", async () => {
  const tpl = makeTemplate();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"));
  const config = baseConfig(out, {
    platforms: { android: true, ios: false },
    e2e: false,
  });

  await scaffold(config, { templateDir: tpl, verify: true });

  // ios feature paths removed
  assert.ok(!fs.existsSync(path.join(out, "iosApp")), "iosApp removed");
  assert.ok(!fs.existsSync(path.join(out, "composeApp/src/iosMain")), "iosMain removed");
  // e2e feature path removed
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

test("non-empty check: harmless entries (.claude, .DS_Store, .git) never force --force", async () => {
  const tpl = makeTemplate();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"));
  // The documented doctor→create flow drops .claude/ into the target; OS and
  // VCS noise is equally inevitable. None of it is user content.
  fs.mkdirSync(path.join(out, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(out, ".claude", "settings.local.json"), "{}");
  fs.writeFileSync(path.join(out, ".DS_Store"), "");
  fs.mkdirSync(path.join(out, ".git"), { recursive: true });

  // must scaffold WITHOUT force
  await scaffold(baseConfig(out), { templateDir: tpl, verify: false });
  assert.ok(
    fs.existsSync(path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/Main.kt")),
    "scaffolded despite harmless entries"
  );

  fs.rmSync(tpl, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

test("non-empty check: real content still refuses and NAMES the blocking entries", async () => {
  const tpl = makeTemplate();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"));
  fs.mkdirSync(path.join(out, ".claude"), { recursive: true }); // harmless
  fs.writeFileSync(path.join(out, "my-notes.txt"), "precious"); // real content

  await assert.rejects(
    () => scaffold(baseConfig(out), { templateDir: tpl, verify: false }),
    (err) => {
      assert.match(err.message, /not empty/);
      assert.match(err.message, /my-notes\.txt/, "blocking entry is named");
      assert.match(err.message, /harmless: \.claude/, "harmless entry listed as ignored");
      return true;
    }
  );

  fs.rmSync(tpl, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

test("spec-of-record: create-cmp.json is persisted with the resolved config", async () => {
  const tpl = makeTemplate();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-"));
  const config = baseConfig(out, {
    tabs: [
      { label: "Today", icon: "today" },
      { label: "Train", icon: "fitness_center" },
    ],
  });

  await scaffold(config, { templateDir: tpl, verify: false });

  const recordPath = path.join(out, "create-cmp.json");
  assert.ok(fs.existsSync(recordPath), "create-cmp.json written to project root");
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.name, "Acme");
  assert.equal(record.package, "com.acme.demo");
  assert.deepEqual(
    record.tabs.map((t) => t.label),
    ["Today", "Train"],
    "tabs manifest matches config — the spec-of-record for consistency checks"
  );
  assert.equal(typeof record.engineVersion, "string");
  assert.ok(record.stampedAt.includes("T"), "ISO stampedAt");
  fs.rmSync(tpl, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});
