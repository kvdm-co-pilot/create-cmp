import { test } from "node:test";
import assert from "node:assert/strict";
import { reservedSegments, validatePackageName, JAVA_KEYWORDS } from "../src/lib/package-name.mjs";
import { validateConfig } from "../src/scaffold.mjs";

// The real-world case: `--package com.final.proof` used to stamp a complete
// project that could not even configure ("'final' is a Java keyword").
test("a Java keyword segment is rejected, and named", () => {
  const { valid, errors } = validatePackageName("com.final.proof");
  assert.equal(valid, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /'final'/);
  assert.match(errors[0].message, /Java keyword/);
});

test("every reserved segment is named, once", () => {
  const { errors } = validatePackageName("com.int.new.int.app");
  assert.match(errors[0].message, /'int', 'new'/);
  assert.doesNotMatch(errors[0].message, /'int'.*'int'/);
});

test("ordinary package ids pass", () => {
  for (const pkg of ["com.acme.app", "io.karel.fuelled", "com.example.app", "dev.a.b.c"]) {
    assert.equal(validatePackageName(pkg).valid, true, pkg);
  }
});

test("contextual keywords are legal package segments", () => {
  // var/record/sealed/yield are contextual in Java, not reserved — refusing
  // them would reject valid ids.
  for (const seg of ["var", "record", "sealed", "yield", "permits"]) {
    assert.equal(reservedSegments(`com.${seg}.app`).length, 0, seg);
    assert.equal(JAVA_KEYWORDS.has(seg), false, seg);
  }
});

test("reserved literals and the lone underscore are refused", () => {
  for (const seg of ["true", "false", "null", "_"]) {
    assert.equal(reservedSegments(`com.${seg}.app`)[0], seg);
  }
});

test("validateConfig refuses the keyword package before anything is stamped", () => {
  const config = {
    appName: "Final Proof",
    package: "com.final.proof",
    iosBundleId: "com.final.proof",
    region: "us-central1",
    themePrefix: "FinalProof",
    platforms: { android: true, ios: true },
    firebase: { enabled: false, auth: "none", firestore: false, storage: false, functions: false, fcm: false },
    room: true, e2e: true, inspector: true, devClient: true,
    tabs: [{ label: "Home", icon: "home" }],
    targetDir: "./final-proof",
  };
  assert.throws(() => validateConfig(config), /is a Java keyword/);
  config.package = "com.finalproof.app";
  config.iosBundleId = "com.finalproof.app";
  assert.equal(validateConfig(config), true);
});
