// AD-1 Wave B regression guard: docs/ARCHITECTURE.md's `cmp:generated`
// sections must be FRESH (node qa/arch-doc.mjs --check green) on a fresh,
// untouched scaffold of EVERY configuration — not just the raw template's
// all-features-on shape.
//
// The hole this pins: the template ships the doc true for the raw template's
// tree, but the scaffold pipeline CHANGES the tree — --no-ios deletes
// composeApp/src/iosMain (and every iOS actual with it), --no-room deletes
// data/local across all source sets, devClient off deletes DesktopModule.kt,
// and the package rename moves every kotlin file. Without the stamp-time
// regeneration step (src/scaffold.mjs regenerateArchDoc), a fresh --no-ios
// app failed its own verify lane's archDoc gate before the user touched a
// single file. The doc must also stay PACKAGE-INVARIANT: generated content
// never embeds the package dir (com/example/app vs com/acme/demo), so the
// rename alone can never stale it.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
    tabs: [
      { label: "Home", icon: "home" },
      { label: "Profile", icon: "person" },
    ],
    targetDir,
    ...overrides,
  };
}

async function stamp(overrides = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-archdoc-"));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

// Import the STAMPED project's own vendored walker — the same code path
// `node qa/arch-doc.mjs --check` and the verify lane's archDoc step run.
// Every temp project lives at a different path, so no cache-busting needed.
async function importWalker(projectRoot) {
  return import(pathToFileURL(path.join(projectRoot, "qa/lib/arch-doc.mjs")).href);
}

const CONFIG_CASES = [
  { name: "default (all features, renamed package)", overrides: {} },
  { name: "--no-ios (iosMain deleted)", overrides: { platforms: { android: true, ios: false } } },
  { name: "--no-room (data/local deleted in every source set)", overrides: { room: false } },
  { name: "devClient off (DesktopModule.kt deleted)", overrides: { devClient: false } },
];

for (const { name, overrides } of CONFIG_CASES) {
  test(`arch-doc: fresh scaffold is --check green — ${name}`, async () => {
    const out = await stamp(overrides);
    try {
      const { regenerateArchDoc } = await importWalker(out);
      const result = regenerateArchDoc(out);
      assert.equal(result.ok, true, "doc + walker present in the stamped app");
      assert.deepEqual(result.changedSections, [], "no generated section is stale on a fresh app");
      assert.deepEqual(result.missingSections, [], "every registered section has its marker");
      assert.equal(result.changed, false, "regenerating the fresh app's doc is a byte-level no-op");
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
}

test("arch-doc: generated content never embeds the package dir (rename-invariant)", async () => {
  const out = await stamp();
  try {
    const doc = fs.readFileSync(path.join(out, "docs/ARCHITECTURE.md"), "utf8");
    assert.ok(!doc.includes("com/acme/demo"), "no stamped-package path in the doc");
    assert.ok(!doc.includes("com/example/app"), "no template-package path in the doc");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("arch-doc: staleness is still detected after stamping (deleting an ADR fails --check)", async () => {
  const out = await stamp();
  try {
    fs.rmSync(path.join(out, "docs/adr/0002-maestro-over-appium-for-e2e.md"));
    const { regenerateArchDoc } = await importWalker(out);
    const result = regenerateArchDoc(out);
    assert.equal(result.ok, true);
    assert.deepEqual(result.changedSections, ["adr-index"], "the stale section is named");
    assert.equal(result.changed, true);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── glossary (Wave D — lift verbatim from specs/intent.md's `## Glossary`) ──

test("glossary: fresh scaffold's unfilled `## Glossary` placeholder reports honestly, --check stays green", async () => {
  const out = await stamp();
  try {
    const intent = fs.readFileSync(path.join(out, "specs/intent.md"), "utf8");
    assert.match(intent, /^## Glossary$/m, "the seeded intent brief carries a Glossary section");

    const { generateGlossary, regenerateArchDoc } = await importWalker(out);
    const glossary = generateGlossary(out);
    assert.match(glossary, /once the genesis intent interview fills it in; empty on a fresh scaffold/);

    const result = regenerateArchDoc(out);
    assert.equal(result.changed, false, "the shipped doc's glossary marker already matches the seeded state");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("glossary: a filled `## Glossary` section is lifted VERBATIM into the generated block, not re-authored", async () => {
  const out = await stamp();
  try {
    const intentPath = path.join(out, "specs/intent.md");
    const intent = fs.readFileSync(intentPath, "utf8");
    const filled = intent.replace(
      /## Glossary\n\n_not yet captured[\s\S]*?(?=\n## |$)/,
      "## Glossary\n\n- **Trip** — a single planned outing with an itinerary and companions.\n- **Companion** — a person invited on a Trip.\n"
    );
    assert.notEqual(filled, intent, "the replace actually matched the seeded placeholder");
    fs.writeFileSync(intentPath, filled);

    const { generateGlossary, regenerateArchDoc, writeArchDoc } = await importWalker(out);
    const glossary = generateGlossary(out);
    assert.match(glossary, /Lifted verbatim from the `## Glossary` section/);
    assert.match(glossary, /\*\*Trip\*\* — a single planned outing with an itinerary and companions\./);
    assert.match(glossary, /\*\*Companion\*\* — a person invited on a Trip\./);

    // regenerating updates ONLY the glossary marker — every other generated
    // section (still derived from the unchanged tree) stays byte-identical.
    const before = regenerateArchDoc(out);
    assert.deepEqual(before.changedSections, ["glossary"]);
    const written = writeArchDoc(out);
    assert.equal(written.wrote, true);
    const after = regenerateArchDoc(out);
    assert.equal(after.changed, false, "re-running regeneration after the write is a no-op");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("glossary: an intent.md with NO `## Glossary` section (legacy shape) is reported honestly, never fabricated", async () => {
  const out = await stamp();
  try {
    const intentPath = path.join(out, "specs/intent.md");
    const withoutGlossary = fs.readFileSync(intentPath, "utf8").replace(/\n## Glossary\n[\s\S]*$/, "\n");
    fs.writeFileSync(intentPath, withoutGlossary);

    const { generateGlossary } = await importWalker(out);
    assert.match(generateGlossary(out), /has no `## Glossary` section to lift from yet — nothing derived/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
