import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseTomlSection,
  parseVersions,
  updateTomlValues,
  parseProperties,
  upsertProperty,
} from "../src/lib/toml.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures", "libs.versions.toml"), "utf8");

// --- parseTomlSection / parseVersions ---------------------------------------

test("parseVersions reads keys, values, and skips comments/blank lines", () => {
  const v = parseVersions(FIXTURE);
  assert.equal(v.get("kotlin").value, "2.1.0");
  assert.equal(v.get("agp").value, "8.5.2"); // odd spacing around =
  assert.equal(v.get("koin").value, "4.0.0"); // single quotes
  assert.equal(v.get("ksp").value, "2.1.0-1.0.29");
  assert.equal(v.get("moko-resources").value, "0.24.4");
  assert.ok(!v.has("kotlin-test"), "must not leak [libraries] entries into [versions]");
  assert.ok(!v.has("some-lib"));
});

test("parseVersions keeps trailing-comment lines parseable", () => {
  const v = parseVersions(FIXTURE);
  assert.equal(v.get("compose-multiplatform").value, "1.8.0");
});

test("parseTomlSection scopes to the requested section only", () => {
  const libs = parseTomlSection(FIXTURE, "libraries");
  assert.ok(!libs.has("kotlin"), "versions keys must not appear in [libraries]");
});

test("parseVersions on a doc without the section returns empty map", () => {
  const v = parseVersions("[libraries]\nfoo = { module = \"a:b\" }\n");
  assert.equal(v.size, 0);
});

test("parseVersions preserves entry order", () => {
  const keys = [...parseVersions(FIXTURE).keys()];
  assert.equal(keys[0], "kotlin");
  assert.ok(keys.indexOf("ksp") > keys.indexOf("sqlite"));
});

// --- updateTomlValues (surgical writes) --------------------------------------

test("updateTomlValues rewrites only the requested values", () => {
  const { content, applied, missing } = updateTomlValues(FIXTURE, "versions", {
    kotlin: "2.2.20",
    ksp: "2.2.20-2.0.4",
  });
  assert.deepEqual(applied.sort(), ["ksp", "kotlin"].sort());
  assert.deepEqual(missing, []);
  const v = parseVersions(content);
  assert.equal(v.get("kotlin").value, "2.2.20");
  assert.equal(v.get("ksp").value, "2.2.20-2.0.4");
  // untouched neighbours
  assert.equal(v.get("agp").value, "8.5.2");
});

test("updateTomlValues preserves every byte outside the changed lines", () => {
  const { content } = updateTomlValues(FIXTURE, "versions", { kotlin: "2.2.20" });
  const before = FIXTURE.split("\n");
  const after = content.split("\n");
  assert.equal(before.length, after.length);
  let changed = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changed++;
      assert.match(before[i], /^kotlin = /);
      assert.equal(after[i], 'kotlin = "2.2.20"');
    }
  }
  assert.equal(changed, 1, "exactly one line may differ");
});

test("updateTomlValues keeps trailing comments and odd spacing on edited lines", () => {
  const { content } = updateTomlValues(FIXTURE, "versions", {
    "compose-multiplatform": "1.10.3",
    agp: "8.7.3",
  });
  assert.ok(
    content.includes('compose-multiplatform = "1.10.3"   # trailing comment must survive a rewrite'),
    "trailing comment must survive"
  );
  assert.ok(content.includes('agp    =   "8.7.3"'), "original spacing around = must survive");
});

test("updateTomlValues preserves the quote style of the original line", () => {
  const { content } = updateTomlValues(FIXTURE, "versions", { koin: "4.1.1" });
  assert.ok(content.includes("koin = '4.1.1'"), "single-quoted entry stays single-quoted");
});

test("updateTomlValues does NOT touch identical values in other sections", () => {
  // kotlin is 2.1.0; a library pins version = "2.1.0" too — must survive.
  const { content } = updateTomlValues(FIXTURE, "versions", { kotlin: "2.2.20" });
  assert.ok(content.includes('some-lib = { module = "com.example:some-lib", version = "2.1.0" }'));
});

test("updateTomlValues reports keys it could not find", () => {
  const { content, missing } = updateTomlValues(FIXTURE, "versions", { nonexistent: "1.0.0" });
  assert.deepEqual(missing, ["nonexistent"]);
  assert.equal(content, FIXTURE);
});

test("updateTomlValues round-trips CRLF content without eating \\r", () => {
  const crlf = '[versions]\r\nkotlin = "2.1.0"\r\nagp = "8.5.2"\r\n';
  const { content } = updateTomlValues(crlf, "versions", { kotlin: "2.2.20" });
  assert.equal(content, '[versions]\r\nkotlin = "2.2.20"\r\nagp = "8.5.2"\r\n');
});

// --- properties helpers -------------------------------------------------------

test("parseProperties reads gradle.properties style files", () => {
  const p = parseProperties("a=1\n# comment\nksp.useKSP2=true\nempty.line.above=x\n");
  assert.equal(p.get("a").value, "1");
  assert.equal(p.get("ksp.useKSP2").value, "true");
  assert.ok(!p.has("# comment"));
});

test("upsertProperty replaces an existing key in place", () => {
  const src = "a=1\nksp.useKSP2=false\nb=2\n";
  const { content, changed, previous } = upsertProperty(src, "ksp.useKSP2", "true");
  assert.equal(changed, true);
  assert.equal(previous, "false");
  assert.equal(content, "a=1\nksp.useKSP2=true\nb=2\n");
});

test("upsertProperty appends a missing key with a clean trailing newline", () => {
  const { content, changed, previous } = upsertProperty("a=1", "ksp.useKSP2", "true");
  assert.equal(changed, true);
  assert.equal(previous, null);
  assert.equal(content, "a=1\nksp.useKSP2=true\n");
});

test("upsertProperty is a no-op when the value already matches", () => {
  const src = "ksp.useKSP2=true\n";
  const { content, changed } = upsertProperty(src, "ksp.useKSP2", "true");
  assert.equal(changed, false);
  assert.equal(content, src);
});
