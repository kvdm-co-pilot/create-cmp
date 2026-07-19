// ADR auto-seeding from configuration decisions (Wave D,
// docs/proposals/architecture-document-standard.md §5 step 6). Two things
// under test:
//   1. A config that matches every interview default seeds NOTHING beyond
//      the shipped four ADRs.
//   2. A config that deviates (--no-room, --no-ios, a non-"both" auth
//      choice) seeds one real, numbered ADR per deviation — numbered AFTER
//      the shipped four, containing the actual decision (not boilerplate),
//      and picked up by the stamped project's own adr-index walker so
//      `node qa/arch-doc.mjs --check` stays green on the fresh app.
//
// Mirrors tab-surfaces.test.mjs's stamp() pattern: real template,
// verify:false (files only, no Gradle), mkdtemp + rm in finally.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scaffold } from "../src/scaffold.mjs";
import { seedConfigAdrs } from "../src/lib/adr-seed.mjs";

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
    tabs: [
      { label: "Home", icon: "home" },
      { label: "Profile", icon: "person" },
    ],
    targetDir,
    ...overrides,
  };
}

async function stamp(overrides = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-adrseed-"));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

function adrFiles(projectRoot) {
  return fs.readdirSync(path.join(projectRoot, "docs/adr")).filter((f) => f !== "template.md").sort();
}

test("adr-seed: all-defaults config seeds nothing beyond the shipped four", async () => {
  const out = await stamp();
  try {
    assert.deepEqual(adrFiles(out), [
      "0001-adopt-the-create-cmp-harness-conventions.md",
      "0002-maestro-over-appium-for-e2e.md",
      "0003-jvm-desktop-target-is-harness-infrastructure.md",
      "0004-fakes-not-mocks-for-unit-tests.md",
    ]);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("adr-seed: --no-room seeds a numbered persistence ADR with real decision text", async () => {
  const out = await stamp({ room: false });
  try {
    const files = adrFiles(out);
    assert.deepEqual(files.slice(0, 4), [
      "0001-adopt-the-create-cmp-harness-conventions.md",
      "0002-maestro-over-appium-for-e2e.md",
      "0003-jvm-desktop-target-is-harness-infrastructure.md",
      "0004-fakes-not-mocks-for-unit-tests.md",
    ]);
    const seeded = files.filter((f) => f.startsWith("0005"));
    assert.equal(seeded.length, 1, "exactly one ADR seeded after the shipped four");
    const content = fs.readFileSync(path.join(out, "docs/adr", seeded[0]), "utf8");
    assert.match(content, /^# ADR-0005: .+Room persistence/m);
    assert.match(content, /- \*\*Status:\*\* accepted/);
    assert.match(content, /room: false/, "the actual config value is quoted, not boilerplate");
    assert.match(content, /## Context/);
    assert.match(content, /## Decision/);
    assert.match(content, /## Consequences/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("adr-seed: --no-ios + non-default auth seed two ADRs in the documented order (persistence, platform, auth)", async () => {
  const out = await stamp({ platforms: { android: true, ios: false }, firebase: { enabled: true, auth: "email" } });
  try {
    const files = adrFiles(out);
    const seeded = files.filter((f) => /^000[5-9]/.test(f));
    assert.deepEqual(seeded, ["0005-android-only-launch-scope-ios-deferred.md", "0006-auth-scope-email.md"]);
    const authAdr = fs.readFileSync(path.join(out, "docs/adr", "0006-auth-scope-email.md"), "utf8");
    assert.match(authAdr, /email/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("adr-seed: seeded ADRs are picked up by the stamped project's own adr-index walker — archDoc stays fresh", async () => {
  const out = await stamp({ room: false, platforms: { android: true, ios: false } });
  try {
    const { regenerateArchDoc } = await import(pathToFileURL(path.join(out, "qa/lib/arch-doc.mjs")).href);
    const result = regenerateArchDoc(out);
    assert.equal(result.ok, true);
    assert.deepEqual(result.changedSections, [], "adr-index (and every other section) already reflects the seeded ADRs");
    const doc = fs.readFileSync(path.join(out, "docs/ARCHITECTURE.md"), "utf8");
    assert.match(doc, /0005-no-local-room-persistence\.md/);
    assert.match(doc, /0006-android-only-launch-scope-ios-deferred\.md/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("adr-seed: library function is idempotent per call and numbers from the real directory contents", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-adrseed-lib-"));
  try {
    fs.mkdirSync(path.join(out, "docs/adr"), { recursive: true });
    fs.writeFileSync(path.join(out, "docs/adr", "0001-x.md"), "# ADR-0001: x\n\n- **Status:** accepted\n");
    fs.writeFileSync(path.join(out, "docs/adr", "0002-y.md"), "# ADR-0002: y\n\n- **Status:** accepted\n");
    const { seeded } = seedConfigAdrs(out, baseConfig(out, { room: false }));
    assert.equal(seeded.length, 1);
    assert.equal(seeded[0].file, "0003-no-local-room-persistence.md");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("adr-seed: no docs/adr/ directory in the template is a graceful no-op", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-adrseed-noadr-"));
  try {
    const { seeded } = seedConfigAdrs(out, baseConfig(out, { room: false }));
    assert.deepEqual(seeded, []);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
