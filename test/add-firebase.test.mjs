// `create-cmp add firebase` — Firebase, added to an app that already builds.
//
// Firebase left stamp-time (docs/proposals/LIBRARIES-IN-SERVICES-OUT.md, Decision 2): the default
// stamp carries no service, and this step adds the one the template used to carry, to the tree the
// adopter already has. What these tests hold is the step's contract, read off the files it leaves:
//
//   - every edit it makes, at the place it makes it, with a mock config that SAYS it is one;
//   - a second run writes nothing (each edit asks first whether it is made);
//   - an unrecognised shape is refused BY NAME, and a refusal leaves every byte where it was;
//   - an app stamped by create-cmp 0.27 or earlier with --no-firebase — which kept the catalog
//     entries, the R8 rules, jitpack and FirebaseConfig.kt, all unmarked — is not refused for
//     them and does not get them twice;
//   - the stamp refuses a flag that asks for Firebase, by name, and notes one that declines it.
//
// Files and exit codes, never Gradle: whether the result COMPILES is CI's stamp + add +
// assembleDebug job, on every PR. No test here can say that, and none pretends to.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { listFiles } from "../src/lib/fsutil.mjs";
import { loadRegistry } from "../src/lib/registry.mjs";
import { registryVersionsFor, BLOCK_OPEN, MOCK_TELL } from "../src/lib/add-firebase.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const PKG_DIR = "com/acme/demo";

async function stampApp({ ios = true } = {}) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cmp-add-firebase-")), "app");
  await offTheRunnerChannel(() =>
    scaffold(
      {
        appName: "Acme",
        package: "com.acme.demo",
        iosBundleId: "com.acme.demo.ios",
        themePrefix: "Acme",
        platforms: { android: true, ios },
        room: true,
        e2e: true,
        inspector: true,
        devClient: true,
        tabs: [{ label: "Home", icon: "home" }],
        targetDir: dir,
      },
      { verify: false },
    ),
  );
  return dir;
}

const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 60000 });
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const cleanup = (dir) => fs.rmSync(path.dirname(dir), { recursive: true, force: true });

/** Every file's bytes, keyed by path — what "nothing was written" is checked against. */
function snapshot(dir) {
  return new Map(listFiles(dir).map((abs) => [path.relative(dir, abs), fs.readFileSync(abs).toString("base64")]));
}

const count = (text, needle) => text.split(needle).length - 1;

test("add firebase on a default stamp: every edit where it belongs, a mock that says so, and iOS called unproven", async () => {
  const app = await stampApp();
  try {
    const r = cli("add", "firebase", app, "--no-verify");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const out = r.stdout + r.stderr;
    assert.match(out, /MOCK/, "the output says the config is a mock");
    assert.match(out, /iOS UNPROVEN/, "the iOS half is applied, and said to be unproven");

    // New files, tokens resolved, ports declared ONCE (KD-47).
    const config = read(app, `composeApp/src/commonMain/kotlin/${PKG_DIR}/data/remote/FirebaseConfig.kt`);
    assert.match(config, /^package com\.acme\.demo\.data\.remote$/m);
    assert.match(config, /FIREBASE_FUNCTIONS_REGION = "us-central1"/);
    for (const port of ["9099", "8080", "5001", "9199"]) {
      assert.equal(count(config, port), 1, `port ${port} is declared once, in commonMain`);
    }
    for (const platform of ["androidMain", "iosMain"]) {
      const emu = read(app, `composeApp/src/${platform}/kotlin/${PKG_DIR}/FirebaseEmulators.kt`);
      assert.match(emu, /^package com\.acme\.demo$/m);
      assert.match(emu, /internal fun configureFirebaseEmulators\(\)/);
      assert.doesNotMatch(emu, /useEmulator\(host, \d+\)/, `${platform} spells no port of its own — it reads FirebaseConfig.kt's`);
      assert.doesNotMatch(emu, /__[A-Z_]+__/, "no unresolved token");
    }

    // The mock configs: parseable, matched to the app, and saying what they are.
    const gs = JSON.parse(read(app, "composeApp/google-services.json"));
    assert.equal(gs.client[0].client_info.android_client_info.package_name, "com.acme.demo");
    assert.match(gs.project_info.project_id, /^demo-mock/);
    assert.ok(gs.client[0].api_key[0].current_key.includes(MOCK_TELL));
    const plist = read(app, "iosApp/iosApp/GoogleService-Info.plist");
    assert.match(plist, /MOCK/);
    assert.match(plist, /<string>com\.acme\.demo\.ios<\/string>/, "the plist carries the app's iOS bundle id");
    assert.doesNotMatch(plist, /REPLACE_ME/, "a mock, never a placeholder that reads as a real config");

    // One-line insertions, each at its anchor.
    const root = read(app, "build.gradle.kts");
    assert.match(root, /alias\(libs\.plugins\.android\.application\) apply false\n\s+alias\(libs\.plugins\.google\.services\) apply false/);
    const build = read(app, "composeApp/build.gradle.kts");
    assert.match(build, /alias\(libs\.plugins\.android\.application\)\n\s+alias\(libs\.plugins\.google\.services\)\n/);
    assert.equal(count(build, BLOCK_OPEN), 1, "one appended block");
    assert.ok(build.trimEnd().endsWith("<<< create-cmp add firebase"), "the block is appended at the END, outside the adopter's own blocks");
    assert.match(build, /buildConfigField\("boolean", "USE_FIREBASE_EMULATORS", "true"\)/);
    assert.match(build, /buildConfigField\("boolean", "USE_FIREBASE_EMULATORS", "false"\)/, "release declares every field debug does");
    const application = read(app, `composeApp/src/androidMain/kotlin/${PKG_DIR}/AppApplication.kt`);
    assert.match(application, /configureFirebaseEmulators\(\)\n\s+startKoin \{/, "called right before startKoin");
    const koin = read(app, `composeApp/src/iosMain/kotlin/${PKG_DIR}/KoinHelper.kt`);
    assert.match(koin, /configureFirebaseEmulators\(\)\n\s+startKoin \{/);
    const swift = read(app, "iosApp/iosApp/iOSApp.swift");
    assert.match(swift, /import ComposeApp\nimport FirebaseCore\n/);
    assert.ok(swift.indexOf("FirebaseApp.configure()") < swift.indexOf("KoinHelperKt.doInitKoin()"), "configure runs before Koin wires the emulators");
    assert.match(read(app, "iosApp/Podfile"), /target 'iosApp' do\n[\s\S]*pod 'FirebaseCore'/);
    assert.match(read(app, "settings.gradle.kts"), /maven\("https:\/\/jitpack\.io"\)/);
    assert.match(read(app, "composeApp/proguard-rules.pro"), /-keep class dev\.gitlive\.firebase\.\*\* \{ \*; \}/);

    // The catalog, versions from the registry set matching the app's Kotlin.
    const catalog = read(app, "gradle/libs.versions.toml");
    const kotlin = /^kotlin = "([^"]+)"/m.exec(catalog)[1];
    const { versions } = registryVersionsFor(kotlin, ["google-services", "firebase-gitlive"], loadRegistry());
    assert.match(catalog, new RegExp(`^firebase-gitlive = "${versions["firebase-gitlive"].replace(/\./g, "\\.")}"$`, "m"));
    assert.match(catalog, new RegExp(`^google-services = "${versions["google-services"].replace(/\./g, "\\.")}"$`, "m"));
    for (const lib of ["auth", "firestore", "functions", "storage", "messaging", "config"]) {
      assert.equal(count(catalog, `dev.gitlive:firebase-${lib}"`), 1, `firebase-${lib} declared once`);
    }
    assert.match(catalog, /^google-services = \{ id = "com\.google\.gms\.google-services"/m);

    // The spec-of-record says what the app now carries.
    const record = JSON.parse(read(app, "create-cmp.json"));
    assert.deepEqual(record.firebase, {
      enabled: true, region: "us-central1", auth: "both", firestore: true, storage: true, functions: true, fcm: true, config: "mock",
    });

    // docs/ARCHITECTURE.md was regenerated, so the lane's currency check reads the new file.
    assert.match(read(app, "docs/ARCHITECTURE.md"), /remote\/FirebaseConfig\.kt/);
  } finally {
    cleanup(app);
  }
});

test("a second run writes nothing, and says so", async () => {
  const app = await stampApp();
  try {
    assert.equal(cli("add", "firebase", app, "--no-verify").status, 0);
    const before = snapshot(app);
    const r = cli("add", "firebase", app, "--no-verify");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /already added — nothing to write/);
    assert.deepEqual(snapshot(app), before, "a second run changed a byte");
  } finally {
    cleanup(app);
  }
});

test("--dry-run prints the plan and writes nothing", async () => {
  const app = await stampApp();
  try {
    const before = snapshot(app);
    const r = cli("add", "firebase", app, "--dry-run");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /create\s+composeApp\/google-services\.json/);
    assert.match(r.stdout, /Dry run/);
    assert.deepEqual(snapshot(app), before);
  } finally {
    cleanup(app);
  }
});

test("an Android-only app gets the Android half only, and no iOS claim", async () => {
  const app = await stampApp({ ios: false });
  try {
    const r = cli("add", "firebase", app, "--no-verify");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.doesNotMatch(r.stdout + r.stderr, /iOS UNPROVEN/);
    assert.ok(!fs.existsSync(path.join(app, "iosApp")), "no iosApp/ was created");
    assert.ok(!fs.existsSync(path.join(app, `composeApp/src/iosMain/kotlin/${PKG_DIR}/FirebaseEmulators.kt`)));
    assert.ok(fs.existsSync(path.join(app, `composeApp/src/androidMain/kotlin/${PKG_DIR}/FirebaseEmulators.kt`)));
  } finally {
    cleanup(app);
  }
});

test("--google-services: the adopter's real config is used as given, and one for another package is refused", async () => {
  const app = await stampApp({ ios: false });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-gs-"));
  try {
    const real = (pkg) =>
      JSON.stringify({
        project_info: { project_number: "123", project_id: "acme-prod" },
        client: [{ client_info: { mobilesdk_app_id: "1:123:android:abc", android_client_info: { package_name: pkg } } }],
        configuration_version: "1",
      });
    fs.writeFileSync(path.join(scratch, "wrong.json"), real("com.other.app"));
    fs.writeFileSync(path.join(scratch, "right.json"), real("com.acme.demo"));

    const before = snapshot(app);
    const refused = cli("add", "firebase", app, "--no-verify", "--google-services", path.join(scratch, "wrong.json"));
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /com\.other\.app/);
    assert.match(refused.stderr, /com\.acme\.demo/);
    assert.match(refused.stderr, /Nothing was written/);
    assert.deepEqual(snapshot(app), before);

    const used = cli("add", "firebase", app, "--no-verify", "--google-services", path.join(scratch, "right.json"));
    assert.equal(used.status, 0, used.stderr + used.stdout);
    assert.equal(read(app, "composeApp/google-services.json"), real("com.acme.demo"), "copied byte for byte");
    assert.doesNotMatch(used.stdout + used.stderr, /MOCK/);
    assert.equal(JSON.parse(read(app, "create-cmp.json")).firebase.config, "provided");
  } finally {
    cleanup(app);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("--google-services replaces the config an earlier run was given, for the same app — and no other real config", async () => {
  // The owner's decision (2026-09-25): cmp-firebase-connect re-downloads google-services.json after
  // adding a SHA and hands it to this step again. The record says the step was given the one in
  // place, so the new one for the same app replaces it. A config the step found already there is
  // the adopter's, and is still refused.
  const provided = await stampApp({ ios: false });
  const existing = await stampApp({ ios: false });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-gs-again-"));
  const real = (pkg, version) =>
    JSON.stringify({
      project_info: { project_number: "123", project_id: "acme-prod" },
      client: [{ client_info: { mobilesdk_app_id: "1:123:android:abc", android_client_info: { package_name: pkg } } }],
      configuration_version: version,
    });
  const GS = "composeApp/google-services.json";
  try {
    fs.writeFileSync(path.join(scratch, "v1.json"), real("com.acme.demo", "1"));
    fs.writeFileSync(path.join(scratch, "v2.json"), real("com.acme.demo", "2"));
    fs.writeFileSync(path.join(scratch, "other.json"), real("com.other.app", "2"));

    const first = cli("add", "firebase", provided, "--no-verify", "--google-services", path.join(scratch, "v1.json"));
    assert.equal(first.status, 0, first.stderr + first.stdout);
    const before = snapshot(provided);
    const again = cli("add", "firebase", provided, "--no-verify", "--google-services", path.join(scratch, "v2.json"));
    assert.equal(again.status, 0, again.stderr + again.stdout);
    assert.equal(read(provided, GS), real("com.acme.demo", "2"), "the re-downloaded config, byte for byte");
    assert.equal(JSON.parse(read(provided, "create-cmp.json")).firebase.config, "provided");
    const after = snapshot(provided);
    assert.deepEqual([...after.keys()].filter((rel) => after.get(rel) !== before.get(rel)), [GS], "only the config moved");

    const wrongApp = cli("add", "firebase", provided, "--no-verify", "--google-services", path.join(scratch, "other.json"));
    assert.equal(wrongApp.status, 1, "a config for another app still does not replace it");
    assert.match(wrongApp.stderr, /com\.other\.app/);
    assert.deepEqual(snapshot(provided), after);

    fs.writeFileSync(path.join(existing, GS), real("com.acme.demo", "1"));
    const found = cli("add", "firebase", existing, "--no-verify");
    assert.equal(found.status, 0, found.stderr + found.stdout);
    assert.equal(JSON.parse(read(existing, "create-cmp.json")).firebase.config, "existing");
    const held = snapshot(existing);
    const refused = cli("add", "firebase", existing, "--no-verify", "--google-services", path.join(scratch, "v2.json"));
    assert.equal(refused.status, 1, "a config this step was never given is not replaced");
    assert.match(refused.stderr, /already exists and is not the mock this step writes/);
    assert.match(refused.stderr, /Nothing was written/);
    assert.deepEqual(snapshot(existing), held);
  } finally {
    cleanup(provided);
    cleanup(existing);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

/**
 * Each unrecognised shape the step must refuse rather than guess at. `plant` makes the shape in a
 * fresh stamp; the refusal must name `says`, exit 1, and leave every byte where the plant left it.
 */
const REFUSALS = [
  {
    what: "an anchor that is not there",
    plant: (app) => {
      const rel = `composeApp/src/androidMain/kotlin/${PKG_DIR}/AppApplication.kt`;
      fs.writeFileSync(path.join(app, rel), read(app, rel).replace("startKoin {", "org.koin.core.context.startKoin {"));
    },
    says: /AppApplication\.kt: the line `startKoin \{` is not there/,
  },
  {
    what: "an anchor that is there twice",
    plant: (app) => {
      const text = read(app, "build.gradle.kts");
      fs.writeFileSync(
        path.join(app, "build.gradle.kts"),
        text.replace(/^(\s*alias\(libs\.plugins\.android\.application\) apply false\n)/m, "$1$1"),
      );
    },
    says: /build\.gradle\.kts: the line `alias\(libs\.plugins\.android\.application\) apply false` is there 2 times/,
  },
  {
    what: "a file the step writes, already there with other bytes",
    plant: (app) => {
      const rel = `composeApp/src/androidMain/kotlin/${PKG_DIR}/FirebaseEmulators.kt`;
      fs.writeFileSync(path.join(app, rel), "package com.acme.demo\n// mine\n");
    },
    says: /FirebaseEmulators\.kt already exists, and its bytes are not the ones this step writes/,
  },
  {
    what: "Firebase wired some other way (an app stamped with it by 0.27 or earlier)",
    plant: (app) => {
      const record = JSON.parse(read(app, "create-cmp.json"));
      fs.writeFileSync(path.join(app, "create-cmp.json"), JSON.stringify({ ...record, region: "us-central1", firebase: { enabled: true, auth: "both" } }, null, 2));
    },
    says: /already has Firebase/,
  },
  {
    what: "a catalog key that says something else",
    plant: (app) => {
      const text = read(app, "gradle/libs.versions.toml");
      fs.writeFileSync(path.join(app, "gradle/libs.versions.toml"), text.replace(/^(kotlin = .*\n)/m, '$1firebase-gitlive = "1.0.0"\n'));
    },
    says: /already declares firebase-gitlive = "1\.0\.0"/,
  },
  {
    what: "a Kotlin version no proven set carries",
    plant: (app) => {
      const text = read(app, "gradle/libs.versions.toml");
      fs.writeFileSync(path.join(app, "gradle/libs.versions.toml"), text.replace(/^kotlin = ".*"$/m, 'kotlin = "9.9.9"'));
    },
    says: /kotlin = "9\.9\.9", and no proven version set/,
  },
  {
    what: "no create-cmp.json",
    plant: (app) => fs.rmSync(path.join(app, "create-cmp.json")),
    says: /no create-cmp\.json/,
  },
];

for (const r of REFUSALS) {
  test(`refused by name, nothing written: ${r.what}`, async () => {
    const app = await stampApp({ ios: false });
    try {
      r.plant(app);
      const before = snapshot(app);
      const run = cli("add", "firebase", app, "--no-verify");
      assert.equal(run.status, 1, `expected a refusal:\n${run.stdout}${run.stderr}`);
      assert.match(run.stderr, r.says);
      assert.match(run.stderr, /Nothing was written/);
      assert.doesNotMatch(run.stderr, /Fatal:/, "a refusal, not a crash");
      assert.deepEqual(snapshot(app), before, "a refusal changed a byte");
    } finally {
      cleanup(app);
    }
  });
}

test("an app stamped --no-firebase by 0.27 or earlier is neither refused for its leftovers nor given them twice", async () => {
  // Those stamps carried, UNMARKED: the GitLive catalog entries, the Firebase R8 rules, jitpack,
  // and a one-constant FirebaseConfig.kt. Planted here as they shipped.
  const app = await stampApp({ ios: false });
  try {
    const legacyConfig =
      "package com.acme.demo.data.remote\n\n" +
      "// Region for Cloud Functions / callables. Keep schedulers, callables, Firestore in the\n" +
      "// SAME region — cross-region 2nd-gen wiring fails.\n" +
      'const val FIREBASE_FUNCTIONS_REGION = "us-central1"\n';
    const configRel = `composeApp/src/commonMain/kotlin/${PKG_DIR}/data/remote/FirebaseConfig.kt`;
    fs.writeFileSync(path.join(app, configRel), legacyConfig);
    const catalogRel = "gradle/libs.versions.toml";
    let catalog = read(app, catalogRel);
    catalog = catalog.replace(/^(kotlin = .*\n)/m, '$1google-services = "4.4.2"\nfirebase-gitlive = "2.1.0"\n');
    catalog = catalog.replace(
      /^(\[libraries\]\n)/m,
      "$1" +
        ["auth", "firestore", "functions", "storage", "messaging", "config"]
          .map((l) => `firebase-${l} = { module = "dev.gitlive:firebase-${l}", version.ref = "firebase-gitlive" }\n`)
          .join(""),
    );
    catalog = catalog.replace(/^(\[plugins\]\n)/m, '$1google-services = { id = "com.google.gms.google-services", version.ref = "google-services" }\n');
    fs.writeFileSync(path.join(app, catalogRel), catalog);
    fs.appendFileSync(path.join(app, "composeApp/proguard-rules.pro"), "\n# Firebase\n-keep class com.google.firebase.** { *; }\n-keep class dev.gitlive.firebase.** { *; }\n");
    fs.writeFileSync(
      path.join(app, "settings.gradle.kts"),
      read(app, "settings.gradle.kts").replace(/^(\s*)mavenCentral\(\)\n(\s*\}\n\}\n\ninclude)/m, '$1mavenCentral()\n$1// GitLive Firebase KMP\n$1maven("https://jitpack.io")\n$2'),
    );
    assert.match(read(app, "settings.gradle.kts"), /jitpack/, "the plant took");

    const r = cli("add", "firebase", app, "--no-verify");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(read(app, configRel), /FIREBASE_AUTH_EMULATOR_PORT/, "the leftover FirebaseConfig.kt was replaced with the step's");
    const after = read(app, catalogRel);
    assert.equal(count(after, "firebase-gitlive = "), 1, "no catalog key twice");
    assert.equal(count(after, "dev.gitlive:firebase-auth"), 1);
    assert.equal(count(read(app, "settings.gradle.kts"), "jitpack.io"), 1, "no second jitpack");
    assert.equal(count(read(app, "composeApp/proguard-rules.pro"), "-keep class dev.gitlive.firebase.**"), 1, "no second copy of the R8 rules");
  } finally {
    cleanup(app);
  }
});

test("`add` names what it adds, and anything else is refused", () => {
  for (const args of [["add"], ["add", "supabase"]]) {
    const r = cli(...args);
    assert.equal(r.status, 2, args.join(" "));
    assert.match(r.stderr, /the one service it adds is `firebase`/);
  }
});

test("the stamp refuses every flag that asks for Firebase, by name, before writing anything", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stamp-firebase-"));
  try {
    for (const flag of [["--firebase"], ["--region", "europe-west1"], ["--auth", "email"], ["--firestore"], ["--storage"], ["--functions"], ["--fcm"]]) {
      const dir = path.join(scratch, flag[0].slice(2));
      // The flag BEFORE the directory, too: a declared boolean must not eat it.
      const r = cli(...flag, dir, "--yes", "--no-verify");
      assert.equal(r.status, 2, `${flag.join(" ")}:\n${r.stdout}${r.stderr}`);
      assert.match(r.stderr, new RegExp(`${flag[0]}\\b`), `the refusal names ${flag[0]}`);
      assert.match(r.stderr, /create-cmp add firebase/, "and the door Firebase moved to");
      assert.match(r.stderr, /Nothing was written/);
      assert.ok(!fs.existsSync(dir), `${flag.join(" ")} wrote ${dir}`);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("a flag that declines Firebase asks for what the stamp already is: it stamps, with a one-line note", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stamp-nofirebase-"));
  try {
    for (const flag of [["--no-firebase"], ["--auth", "none"]]) {
      const dir = path.join(scratch, flag.join("").replace(/\W/g, ""));
      const r = cli(dir, ...flag, "--yes", "--no-verify", "--name", "Acme", "--package", "com.acme.demo");
      assert.equal(r.status, 0, `${flag.join(" ")}:\n${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /no longer needed/);
      assert.ok(fs.existsSync(path.join(dir, "create-cmp.json")));
      assert.ok(!fs.existsSync(path.join(dir, "composeApp", "google-services.json")));
      assert.ok(!("firebase" in JSON.parse(read(dir, "create-cmp.json"))), "the record carries no firebase key");
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
