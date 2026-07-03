import { test } from "node:test";
import assert from "node:assert/strict";

import { selectStaleKonan, selectProjectCleanDirs } from "../src/lib/clean.mjs";

// --- stale ~/.konan selector -----------------------------------------------------

const KONAN_LISTING = [
  "cache",
  "dependencies",
  "kotlin-native-prebuilt-macos-aarch64-2.1.20",
  "kotlin-native-prebuilt-macos-aarch64-2.2.20",
  "kotlin-native-prebuilt-linux-x86_64-2.0.0",
  "kotlin-native-macos-aarch64-1.9.24",
];

test("selectStaleKonan removes only non-matching versioned toolchains", () => {
  const { stale, kept } = selectStaleKonan(KONAN_LISTING, "2.2.20");
  assert.deepEqual(stale.sort(), [
    "kotlin-native-macos-aarch64-1.9.24",
    "kotlin-native-prebuilt-linux-x86_64-2.0.0",
    "kotlin-native-prebuilt-macos-aarch64-2.1.20",
  ]);
  const keptNames = kept.map((k) => k.name);
  assert.ok(keptNames.includes("kotlin-native-prebuilt-macos-aarch64-2.2.20"), "current version kept");
  assert.ok(keptNames.includes("cache"), "shared cache dir never touched");
  assert.ok(keptNames.includes("dependencies"), "shared dependencies dir never touched");
});

test("selectStaleKonan with unknown project kotlin version deletes NOTHING", () => {
  for (const v of [null, undefined, ""]) {
    const { stale, kept } = selectStaleKonan(KONAN_LISTING, v);
    assert.deepEqual(stale, []);
    assert.equal(kept.length, KONAN_LISTING.length);
  }
});

test("selectStaleKonan keeps every current-version toolchain regardless of platform", () => {
  const { stale } = selectStaleKonan(
    ["kotlin-native-prebuilt-macos-aarch64-2.2.20", "kotlin-native-prebuilt-linux-x86_64-2.2.20"],
    "2.2.20"
  );
  assert.deepEqual(stale, []);
});

test("selectStaleKonan never selects unversioned or unrecognized names", () => {
  const { stale, kept } = selectStaleKonan(["random-dir", "kotlin-native-prebuilt", ".DS_Store-ish"], "2.2.20");
  assert.deepEqual(stale, []);
  assert.equal(kept.length, 3);
});

// --- project build-dir selector -----------------------------------------------------

test("selectProjectCleanDirs picks module build dirs (with sibling gradle file) and root .gradle", () => {
  const dirs = [
    ".gradle",
    "build",
    "composeApp",
    "composeApp/build",
    "composeApp/src",
    "docs/build", // no sibling build.gradle → NOT selected
    "node_modules/foo/build", // vendored → never
  ];
  const files = [
    "settings.gradle.kts",
    "build.gradle.kts",
    "composeApp/build.gradle.kts",
    "docs/notes.md",
    "node_modules/foo/build.gradle", // still excluded (vendored)
  ];
  const out = selectProjectCleanDirs({ dirs, files });
  assert.deepEqual(out.sort(), [".gradle", "build", "composeApp/build"].sort());
});

test("selectProjectCleanDirs never selects dirs nested inside another build dir or hidden dirs", () => {
  const out = selectProjectCleanDirs({
    dirs: ["composeApp/build", "composeApp/build/generated/build", ".idea/build"],
    files: ["composeApp/build.gradle.kts", "composeApp/build/generated/build.gradle.kts", ".idea/build.gradle"],
  });
  assert.deepEqual(out, ["composeApp/build"]);
});

test("selectProjectCleanDirs on a non-Gradle tree selects nothing", () => {
  const out = selectProjectCleanDirs({
    dirs: ["src", "build"],
    files: ["package.json", "src/index.js"],
  });
  assert.deepEqual(out, []);
});
