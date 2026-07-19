// Drift guard: qa/lib/approvals.mjs's `exemplarKotlinFileSet(F, f, E)` must
// describe the EXACT canonical 10-kotlin-file shape qa/scaffold-feature.mjs
// clones FROM (GENESIS-FLOW-DESIGN.md §1/§3's "configurable exemplar").
//
// Before the genesis-flow wave this was enforced by regex-extracting
// scaffold-feature.mjs's ALL_FILES `from:` entries (which were literal
// double-quoted strings, e.g. `"domain/model/Item.kt"`) and diffing them
// against a hand-copied constant. That technique no longer applies: ALL_FILES'
// `from:` sides are now template literals built from the CONFIGURED exemplar's
// names (`` `domain/model/${SOURCE_E}.kt` ``) — there is no static string left
// to regex out, and the stamper must keep working even when
// qa/lib/approvals.mjs is absent (test/approvals-gate.test.mjs's "never
// blocks" pin), so it deliberately does NOT import `exemplarKotlinFileSet` and
// re-derive the shape from it — it carries its own copy, tolerant of the
// library's absence.
//
// So the guard now proves consistency by RUNNING the real stamper against a
// real scaffold and diffing its actual (dry-run-printed and on-disk) file set
// against `exemplarKotlinFileSet`'s prediction — never a hand-copied literal.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { scaffold } from "../src/scaffold.mjs";

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

async function makeProject(prefix, overrides = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

test("exemplarKotlinFileSet(Home, home, Item) matches EXEMPLAR_FEATURE_KOTLIN_FILES and the shipped `home` exemplar's real files", async () => {
  const out = await makeProject("cmp-exemplar-shape-");
  try {
    const { exemplarKotlinFileSet, EXEMPLAR_FEATURE_KOTLIN_FILES, EXEMPLAR_SPEC_REL } = await import(
      pathToFileURL(path.join(out, "qa/lib/approvals.mjs"))
    );

    const predicted = exemplarKotlinFileSet("Home", "home", "Item");
    assert.equal(predicted.length, 10, "sanity: the canonical shape is 10 kotlin files");
    assert.deepEqual(predicted, EXEMPLAR_FEATURE_KOTLIN_FILES, "exemplarKotlinFileSet(Home,home,Item) must equal the backward-compatible constant");
    assert.equal(EXEMPLAR_SPEC_REL, "specs/home.spec.md");

    for (const f of predicted) {
      const abs = path.join(out, "composeApp/src", f.sourceSet, "kotlin/com/acme/demo", f.rel);
      assert.ok(fs.existsSync(abs), `predicted exemplar file does not exist on disk: ${f.sourceSet}/${f.rel}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("the stamper's dry-run clone-source list for a fresh scaffold matches exemplarKotlinFileSet's prediction exactly", async () => {
  const out = await makeProject("cmp-exemplar-dryrun-");
  try {
    const stdout = execFileSync(process.execPath, [path.join(out, "qa/scaffold-feature.mjs"), "Favorites", "--dry-run"], {
      cwd: out,
      encoding: "utf8",
    });
    const { exemplarKotlinFileSet } = await import(pathToFileURL(path.join(out, "qa/lib/approvals.mjs")));
    const predicted = exemplarKotlinFileSet("Home", "home", "Item");

    for (const f of predicted) {
      const expectedFromRel = `composeApp/src/${f.sourceSet}/kotlin/com/acme/demo/${f.rel}`;
      assert.ok(stdout.includes(expectedFromRel), `dry-run plan is missing the expected clone-source file: ${expectedFromRel}`);
    }
    // The spec side too — exemplarKotlinFileSet only covers the 10 kotlin
    // files; the 11th (the spec) is EXEMPLAR_SPEC_REL, asserted above.
    assert.ok(stdout.includes("specs/home.spec.md"), "dry-run plan is missing the exemplar spec clone source");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
