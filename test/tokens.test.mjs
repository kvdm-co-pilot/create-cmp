import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTokenMap,
  replaceTokens,
  replacePathTokens,
  isBinaryPath,
} from "../src/lib/tokens.mjs";

const config = {
  appName: "Acme",
  package: "com.acme.app",
  iosBundleId: "com.acme.app",
  region: "us-central1",
  themePrefix: "Acme",
};

test("buildTokenMap derives __PACKAGE_PATH__ from package", () => {
  const map = Object.fromEntries(buildTokenMap(config));
  assert.equal(map.__PACKAGE__, "com.acme.app");
  assert.equal(map.__PACKAGE_PATH__, "com/acme/app");
  assert.equal(map.__APP_NAME__, "Acme");
  assert.equal(map.__REGION__, "us-central1");
  assert.equal(map.__THEME_PREFIX__, "Acme");
});

test("__PACKAGE_PATH__ is applied before __PACKAGE__ (ordering)", () => {
  const map = buildTokenMap(config);
  const idxPath = map.findIndex(([t]) => t === "__PACKAGE_PATH__");
  const idxPkg = map.findIndex(([t]) => t === "__PACKAGE__");
  assert.ok(idxPath < idxPkg, "__PACKAGE_PATH__ must precede __PACKAGE__");
});

test("replaceTokens replaces all placeholder occurrences in content", () => {
  const map = buildTokenMap(config);
  const input = `package __PACKAGE__\nclass __THEME_PREFIX__Theme\n// region __REGION__\nname=__APP_NAME__`;
  const out = replaceTokens(input, map);
  assert.equal(
    out,
    `package com.acme.app\nclass AcmeTheme\n// region us-central1\nname=Acme`
  );
  assert.ok(!out.includes("__"), "no leftover placeholder markers");
});

test("replaceTokens does not corrupt when package shares prefix-like tokens", () => {
  const map = buildTokenMap(config);
  const input = `dir=__PACKAGE_PATH__ id=__PACKAGE__`;
  const out = replaceTokens(input, map);
  assert.equal(out, `dir=com/acme/app id=com.acme.app`);
});

test("replacePathTokens handles a path with __PACKAGE_PATH__", () => {
  const map = buildTokenMap(config);
  const out = replacePathTokens(
    "composeApp/src/commonMain/kotlin/__PACKAGE_PATH__/Main.kt",
    map
  );
  assert.equal(out, "composeApp/src/commonMain/kotlin/com/acme/app/Main.kt");
});

test("isBinaryPath flags binary extensions, not source", () => {
  assert.equal(isBinaryPath("icon.png"), true);
  assert.equal(isBinaryPath("DM-Sans.ttf"), true);
  assert.equal(isBinaryPath("Main.kt"), false);
  assert.equal(isBinaryPath("build.gradle.kts"), false);
  assert.equal(isBinaryPath("Dockerfile"), false);
});
