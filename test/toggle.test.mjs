import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  stripFeatureBlocks,
  disabledFeaturesFromConfig,
  deleteDisabledFeaturePaths,
} from "../src/lib/toggle.mjs";

test("strips a disabled feature block (kotlin // markers)", () => {
  const input = [
    "androidTarget()",
    "// >>> cmp:feature ios",
    "iosX64()",
    "iosArm64()",
    "// <<< cmp:feature ios",
    "dependencies {}",
  ].join("\n");
  const { content, changed } = stripFeatureBlocks(input, new Set(["ios"]));
  assert.equal(changed, true);
  assert.equal(content, "androidTarget()\ndependencies {}");
});

test("keeps an enabled feature's body but removes its marker lines", () => {
  const input = [
    "before",
    "// >>> cmp:feature firebase",
    "implementation(libs.gitlive)",
    "// <<< cmp:feature firebase",
    "after",
  ].join("\n");
  const { content } = stripFeatureBlocks(input, new Set(["ios"])); // firebase enabled
  assert.equal(content, "before\nimplementation(libs.gitlive)\nafter");
  assert.ok(!content.includes("cmp:feature"), "no marker noise left");
});

test("handles non-// comment leaders (# and <!-- -->)", () => {
  const input = [
    "keep1",
    "# >>> cmp:feature appium",
    "appium: true",
    "# <<< cmp:feature appium",
    "keep2",
  ].join("\n");
  const { content } = stripFeatureBlocks(input, new Set(["appium"]));
  assert.equal(content, "keep1\nkeep2");
});

test("handles nested blocks — outer disabled drops inner regardless", () => {
  const input = [
    "a",
    "// >>> cmp:feature firebase",
    "fb",
    "// >>> cmp:feature fcm",
    "fcm-line",
    "// <<< cmp:feature fcm",
    "fb2",
    "// <<< cmp:feature firebase",
    "b",
  ].join("\n");
  const { content } = stripFeatureBlocks(input, new Set(["firebase"]));
  assert.equal(content, "a\nb");
});

test("nested blocks — only inner disabled keeps outer body", () => {
  const input = [
    "a",
    "// >>> cmp:feature firebase",
    "fb",
    "// >>> cmp:feature fcm",
    "fcm-line",
    "// <<< cmp:feature fcm",
    "fb2",
    "// <<< cmp:feature firebase",
    "b",
  ].join("\n");
  const { content } = stripFeatureBlocks(input, new Set(["fcm"]));
  assert.equal(content, "a\nfb\nfb2\nb");
});

test("no markers → unchanged", () => {
  const input = "line1\nline2\n";
  const { content, changed } = stripFeatureBlocks(input, new Set(["ios"]));
  assert.equal(changed, false);
  assert.equal(content, input);
});

test("negated !firebase block: REMOVED when firebase is enabled", () => {
  const input = [
    "keep",
    "// >>> cmp:feature !firebase",
    "no-firebase-buildtype",
    "// <<< cmp:feature !firebase",
    "tail",
  ].join("\n");
  // firebase ENABLED -> not in the disabled set -> negated block dropped.
  const { content } = stripFeatureBlocks(input, new Set([]));
  assert.equal(content, "keep\ntail");
});

test("negated !firebase block: KEPT (markers stripped) when firebase is disabled", () => {
  const input = [
    "keep",
    "// >>> cmp:feature !firebase",
    "no-firebase-buildtype",
    "// <<< cmp:feature !firebase",
    "tail",
  ].join("\n");
  // firebase DISABLED -> negated block body kept, markers removed.
  const { content } = stripFeatureBlocks(input, new Set(["firebase"]));
  assert.equal(content, "keep\nno-firebase-buildtype\ntail");
});

test("plain firebase block and !firebase block are inverses (firebase off)", () => {
  const input = [
    "// >>> cmp:feature firebase",
    "with-firebase",
    "// <<< cmp:feature firebase",
    "// >>> cmp:feature !firebase",
    "without-firebase",
    "// <<< cmp:feature !firebase",
  ].join("\n");
  const off = stripFeatureBlocks(input, new Set(["firebase"])).content;
  const on = stripFeatureBlocks(input, new Set([])).content;
  assert.equal(off, "without-firebase");
  assert.equal(on, "with-firebase");
});

test("disabledFeaturesFromConfig maps config to feature names", () => {
  const cfg = {
    platforms: { android: true, ios: false },
    firebase: { enabled: true },
    room: false,
    appium: true,
  };
  const d = disabledFeaturesFromConfig(cfg);
  assert.deepEqual([...d].sort(), ["ios", "room"]);
});

test("deleteDisabledFeaturePaths removes manifest paths for disabled features", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-toggle-"));
  fs.mkdirSync(path.join(dir, "iosApp"), { recursive: true });
  fs.writeFileSync(path.join(dir, "iosApp", "project.yml"), "x");
  fs.mkdirSync(path.join(dir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(dir, "qa", "smoke.py"), "x");

  const manifest = {
    features: {
      ios: { paths: ["iosApp"] },
      appium: { paths: ["qa", "tests/appium"] },
      firebase: { paths: ["..."] }, // contract placeholder — must be ignored
    },
  };
  const deleted = deleteDisabledFeaturePaths(
    dir,
    manifest,
    new Set(["ios", "appium", "firebase"])
  );
  assert.ok(deleted.includes("iosApp"));
  assert.ok(deleted.includes("qa"));
  assert.ok(!fs.existsSync(path.join(dir, "iosApp")));
  assert.ok(!fs.existsSync(path.join(dir, "qa")));
  // "..." placeholder and missing tests/appium are silently skipped.
  assert.ok(!deleted.includes("..."));
  fs.rmSync(dir, { recursive: true, force: true });
});
