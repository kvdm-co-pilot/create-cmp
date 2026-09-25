// AN APP THAT HAS FIREBASE KEEPS IT THROUGH `upgrade --harness`.
//
// Until 2026-09-25 the default stamp carried Firebase. When it left stamp-time for `create-cmp
// add firebase`, `upgrade --harness` on an app stamped with the old default broke three ways,
// found by reading, before any adopter ran it:
//
//   1. configFromSpecRecord passed the record's `firebase` into a schema that now refuses it;
//   2. NEW was the default stamp, so every Firebase line the adopter never touched read as a
//      change the engine made, and was applied — stripped;
//   3. FirebaseConfig.kt read as "engine deleted, app never touched" and was deleted, from under
//      the code that imports it. The app would not compile.
//
// The fix: whenever the record says Firebase, NEW is the default stamp PLUS the add step's edits;
// BASE is the old template stamped with Firebase as recorded while that template had the option.
//
// THE OLD TEMPLATE IS SYNTHESISED, not fetched: CI checks out one commit, and a test must not
// need the network or history. It is this engine's template with the 0.27 Firebase pieces put
// back where they were — the manifest feature, the __REGION__ token, FirebaseConfig.kt and the
// marked blocks in the three files the add step now edits. That reproduces all three harms on
// the files they lived in; it is not byte-for-byte 0.27.2, and does not claim to be.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";
import { copyDir } from "../src/lib/fsutil.mjs";
import { BLOCK_OPEN } from "../src/lib/add-firebase.mjs";
import { offTheRunnerChannel } from "./helpers/runner-channel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "create-cmp.mjs");
const PKG = "composeApp/src/{set}/kotlin/com/acme/demo";
const at = (set, rel) => `${PKG.replace("{set}", set)}/${rel}`;

const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", timeout: 120000 });
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const count = (text, needle) => text.split(needle).length - 1;

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

function edit(dir, rel, fn) {
  const p = path.join(dir, rel);
  const next = fn(fs.readFileSync(p, "utf8"));
  fs.writeFileSync(p, next);
}

/** This engine's template with the stamp-time Firebase of create-cmp 0.27 put back. */
function legacyTemplate(dir) {
  copyDir(path.join(ROOT, "template"), dir);
  edit(dir, "manifest.json", (t) => {
    const m = JSON.parse(t);
    m.placeholders.push("__REGION__");
    m.features.firebase = { enabledByDefault: true, paths: ["composeApp/google-services.json"] };
    return JSON.stringify(m, null, 2);
  });
  fs.writeFileSync(
    path.join(dir, "composeApp/src/commonMain/kotlin/com/example/app/data/remote/FirebaseConfig.kt"),
    "package __PACKAGE__.data.remote\n\n" +
      "// Region for Cloud Functions / callables. Keep schedulers, callables, Firestore in the\n" +
      "// SAME region — cross-region 2nd-gen wiring fails.\n" +
      'const val FIREBASE_FUNCTIONS_REGION = "__REGION__"\n',
  );
  fs.writeFileSync(
    path.join(dir, "composeApp/google-services.json"),
    '{"project_info":{"project_id":"REPLACE_ME_PROJECT_ID"},"client":[{"client_info":{"android_client_info":{"package_name":"__PACKAGE__"}}}]}\n',
  );
  edit(dir, "build.gradle.kts", (t) =>
    t.replace(
      /^(\s*alias\(libs\.plugins\.android\.application\) apply false\n)/m,
      "$1    // >>> cmp:feature firebase\n    alias(libs.plugins.google.services) apply false\n    // <<< cmp:feature firebase\n",
    ),
  );
  edit(dir, "composeApp/build.gradle.kts", (t) =>
    t
      .replace(
        /^(\s*alias\(libs\.plugins\.android\.application\)\n)/m,
        "$1    // >>> cmp:feature firebase\n    alias(libs.plugins.google.services)\n    // <<< cmp:feature firebase\n",
      )
      .replace(
        /^(\s*implementation\(libs\.ktor\.serialization\.kotlinx\.json\)\n)/m,
        "$1\n            // >>> cmp:feature firebase\n            implementation(libs.firebase.auth)\n            // <<< cmp:feature firebase\n",
      ),
  );
  edit(dir, "gradle/libs.versions.toml", (t) =>
    t
      .replace(/^(kotlin = .*\n)/m, '$1google-services = "4.4.2"\nfirebase-gitlive = "2.1.0"\n')
      .replace(/^(\[libraries\]\n)/m, '$1firebase-auth = { module = "dev.gitlive:firebase-auth", version.ref = "firebase-gitlive" }\n')
      .replace(/^(\[plugins\]\n)/m, '$1google-services = { id = "com.google.gms.google-services", version.ref = "google-services" }\n'),
  );
  edit(dir, "composeApp/src/androidMain/kotlin/com/example/app/AppApplication.kt", (t) =>
    t
      .replace(
        /^(import android\.app\.Application\n)/m,
        "$1// >>> cmp:feature firebase\nimport __PACKAGE__.data.remote.FIREBASE_FUNCTIONS_REGION\nimport dev.gitlive.firebase.Firebase\nimport dev.gitlive.firebase.functions.functions\n// <<< cmp:feature firebase\n",
      )
      .replace(/^(\s*)startKoin \{/m, "$1// >>> cmp:feature firebase\n$1configureFirebaseEmulators()\n$1// <<< cmp:feature firebase\n$1startKoin {")
      .replace(
        /\n\}\n?$/,
        "\n    // >>> cmp:feature firebase\n    private fun configureFirebaseEmulators() {\n" +
          "        if (!BuildConfig.USE_FIREBASE_EMULATORS) return\n" +
          "        Firebase.functions(FIREBASE_FUNCTIONS_REGION).useEmulator(\"10.0.2.2\", 5001)\n" +
          "    }\n    // <<< cmp:feature firebase\n}\n",
      ),
  );
  return dir;
}

test("an app stamped WITH Firebase by the old default keeps every Firebase line and file through upgrade --harness", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-upgrade-firebase-"));
  try {
    const legacy = legacyTemplate(path.join(scratch, "legacy-template"));
    const app = path.join(scratch, "app");
    // The adopter's app, untouched since the old stamp: the old template, Firebase on.
    await offTheRunnerChannel(() =>
      scaffold(
        { ...CONFIG, targetDir: app, firebase: { enabled: true }, region: "europe-west2" },
        { templateDir: legacy, verify: false, legacyFirebase: true },
      ),
    );
    // …and the record it would carry, in the shape 0.27 wrote it.
    edit(app, "create-cmp.json", (t) =>
      JSON.stringify(
        {
          ...JSON.parse(t),
          region: "europe-west2",
          firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
          engineVersion: "0.27.2",
        },
        null,
        2,
      ),
    );
    const planted = read(app, at("androidMain", "AppApplication.kt"));
    assert.match(planted, /private fun configureFirebaseEmulators/, "the old shape was stamped — or this proves nothing");
    const config = at("commonMain", "data/remote/FirebaseConfig.kt");
    assert.ok(fs.existsSync(path.join(app, config)));
    const googleServices = read(app, "composeApp/google-services.json");

    const r = cli("upgrade", "--harness", "--target-dir", app, "--base-dir", legacy, "--yes");
    assert.equal(r.status, 0, `upgrade --harness failed on an app with Firebase:\n${r.stdout}\n${r.stderr}`);

    // Harm 3: FirebaseConfig.kt is still there — carried to the add step's version, region kept.
    assert.ok(fs.existsSync(path.join(app, config)), "FirebaseConfig.kt was deleted from under the code that imports it");
    const cfg = read(app, config);
    assert.match(cfg, /FIREBASE_FUNCTIONS_REGION = "europe-west2"/, "the recorded region survives");
    assert.match(cfg, /FIREBASE_AUTH_EMULATOR_PORT/, "and the file is the add step's");
    assert.ok(fs.existsSync(path.join(app, at("androidMain", "FirebaseEmulators.kt"))), "the redirect moved to its own file");

    // Harm 2: no Firebase line the adopter never touched was stripped — each is where the add step puts it.
    const application = read(app, at("androidMain", "AppApplication.kt"));
    assert.equal(count(application, "configureFirebaseEmulators()"), 1, "the redirect is still called, once");
    assert.doesNotMatch(application, /private fun configureFirebaseEmulators/, "and no longer declared twice");
    const build = read(app, "composeApp/build.gradle.kts");
    assert.match(build, /alias\(libs\.plugins\.google\.services\)/, "the google-services plugin survives");
    assert.equal(count(build, BLOCK_OPEN), 1);
    assert.equal(count(build, "implementation(libs.firebase.auth)"), 1, "the GitLive dependency survives, once");
    assert.match(read(app, "build.gradle.kts"), /alias\(libs\.plugins\.google\.services\) apply false/);
    assert.equal(count(read(app, "gradle/libs.versions.toml"), "dev.gitlive:firebase-auth"), 1);

    // The adopter's config is never compared, read or replaced.
    assert.equal(read(app, "composeApp/google-services.json"), googleServices);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("an app that ran add firebase has nothing to upgrade at the same engine version", async () => {
  // NEW is the default stamp plus the add step, which is exactly this app — so the sweep is
  // silent. The pre-fix NEW (the default stamp alone) would have been silent here too, because
  // base and new agreed; this row pins the add-step app's steady state, the row above the harm.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-upgrade-added-"));
  try {
    const app = path.join(scratch, "app");
    await offTheRunnerChannel(() => scaffold({ ...CONFIG, targetDir: app }, { verify: false }));
    const added = cli("add", "firebase", app, "--no-verify");
    assert.equal(added.status, 0, added.stderr + added.stdout);
    const r = cli("upgrade", "--harness", "--target-dir", app, "--dry-run");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /nothing to apply/);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
