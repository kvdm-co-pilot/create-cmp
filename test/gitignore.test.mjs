// npm pack ALWAYS strips files literally named `.gitignore` from published
// tarballs, so the template ships `gitignore` (no dot) and the scaffold
// restores the real name in the stamped output. These tests pin both halves.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const GITIGNORE_CONTENT = "*.iml\n.gradle\n/build\n";

function makeTemplate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-tpl-gi-"));
  const w = (rel, content) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  w(
    "manifest.json",
    JSON.stringify({
      placeholders: ["__APP_NAME__", "__PACKAGE__", "__PACKAGE_PATH__", "__IOS_BUNDLE_ID__", "__REGION__", "__THEME_PREFIX__"],
      packageSourceRoots: ["composeApp/src/commonMain/kotlin"],
      features: {
        ios: { enabledByDefault: true, paths: [] },
        firebase: { enabledByDefault: true, paths: [] },
        room: { enabledByDefault: true, paths: [] },
        appium: { enabledByDefault: true, paths: [] },
      },
      verify: { android: "true" },
    })
  );
  w("gitignore", GITIGNORE_CONTENT); // dot-less, as shipped in the npm tarball
  w("settings.gradle.kts", 'rootProject.name = "__APP_NAME__"\n');
  w("composeApp/src/commonMain/kotlin/com/example/app/Main.kt", "package __PACKAGE__\n");
  return dir;
}

function config(targetDir) {
  return {
    appName: "GiApp",
    package: "com.gi.app",
    iosBundleId: "com.gi.app",
    region: "us-central1",
    themePrefix: "GiApp",
    platforms: { android: true, ios: true },
    firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
    room: true,
    appium: true,
    inspector: true,
    devClient: true,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir,
  };
}

test("stamped output contains .gitignore (from template gitignore) and no bare gitignore", async () => {
  const templateDir = makeTemplate();
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-out-gi-"));
  await scaffold(config(targetDir), { templateDir, verify: false, force: true });

  const dotted = path.join(targetDir, ".gitignore");
  assert.ok(fs.existsSync(dotted), "stamped project must have .gitignore");
  assert.equal(fs.readFileSync(dotted, "utf8"), GITIGNORE_CONTENT, "content must equal template gitignore");
  assert.ok(!fs.existsSync(path.join(targetDir, "gitignore")), "no bare `gitignore` may remain");
});

test("the real golden template ships `gitignore` (dot-less) so npm pack includes it", () => {
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, "template", "gitignore")),
    "template/gitignore must exist (npm pack strips files named .gitignore)"
  );
  assert.ok(
    !fs.existsSync(path.join(REPO_ROOT, "template", ".gitignore")),
    "template/.gitignore must NOT exist — it would be silently dropped from the npm tarball"
  );
});
