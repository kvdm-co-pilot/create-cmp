// Runtime-eyes regression tests against the REAL template (VERIFICATION-LAYER-DESIGN.md
// §3.1/§3.2/§3.3 — nav state, crash capture, DB inspection). Companion to
// feature-strip.test.mjs's inspector/room pinning: this file focuses on the TWO structural
// guarantees the design doc calls out explicitly —
//   1. release builds stay structurally clean (no debug-only symbol ever appears in
//      androidRelease, and commonMain's nav hook never references a debug-only class), and
//   2. the `room`-off body of DbInspector degrades gracefully (never crashes, never leaves an
//      AppDatabase reference — that half is also covered by feature-strip's `--no-room` grep).
//
// Grep-level (no Gradle) — same posture as feature-strip.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../src/scaffold.mjs";
import { listFiles } from "../src/lib/fsutil.mjs";

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

async function stamp(overrides) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-runtime-eyes-"));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

function readAllSources(dir, exts = [".kt"]) {
  return listFiles(dir)
    .filter((f) => exts.some((ext) => f.endsWith(ext)))
    .map((f) => ({ path: f, content: fs.readFileSync(f, "utf8") }));
}

test("androidRelease carries ZERO references to any debug-only runtime-eyes symbol", async () => {
  const out = await stamp({});
  const releaseDir = path.join(out, "composeApp/src/androidRelease");
  const sources = readAllSources(releaseDir);
  assert.ok(sources.length > 0, "androidRelease must ship at least the InspectorInit twin");

  const bannedSymbols = [
    "ComposeRootRegistry",
    "InspectorHttpServer",
    "NavInspector",
    "CrashRecorder",
    "DbInspector",
    "LiveSemanticsJson",
    "InspectorCatalog",
    "/inspect/",
    "filesDir/inspector/crashes",
  ];
  for (const { path: p, content } of sources) {
    for (const banned of bannedSymbols) {
      assert.ok(!content.includes(banned), `androidRelease/${path.relative(releaseDir, p)} must not reference '${banned}'`);
    }
  }

  fs.rmSync(out, { recursive: true, force: true });
});

test("commonMain's NavInspectionHook seam never references a debug-only inspector class", async () => {
  const out = await stamp({});
  const hookPath = path.join(
    out,
    "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/navigation/NavInspectionHook.kt"
  );
  assert.ok(fs.existsSync(hookPath), "NavInspectionHook.kt must ship in commonMain");
  const content = fs.readFileSync(hookPath, "utf8");
  assert.ok(!content.includes("import __PACKAGE__"), "no unreplaced token — scaffold ran token replacement");
  assert.ok(!/import\s+com\.acme\.demo\.inspector/.test(content), "must not import the debug-only inspector package");
  assert.ok(!content.includes("android."), "must not import Android platform APIs directly");

  const navHostPath = path.join(
    out,
    "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/navigation/AppNavHost.kt"
  );
  const navHost = fs.readFileSync(navHostPath, "utf8");
  assert.match(navHost, /NavInspectionHook\.listener\?\.invoke/, "AppNavHost must report through the common hook");
  assert.ok(!/import\s+com\.acme\.demo\.inspector/.test(navHost), "AppNavHost must not import the debug-only inspector package");

  fs.rmSync(out, { recursive: true, force: true });
});

test("--no-inspector: the commonMain nav hook survives (it is not inspector-owned) and stays a clean no-op", async () => {
  const out = await stamp({ inspector: false });
  const hookPath = path.join(
    out,
    "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/navigation/NavInspectionHook.kt"
  );
  assert.ok(fs.existsSync(hookPath), "NavInspectionHook.kt is a commonMain seam, not part of the inspector feature's paths");
  const navHostPath = path.join(
    out,
    "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/navigation/AppNavHost.kt"
  );
  const navHost = fs.readFileSync(navHostPath, "utf8");
  assert.match(navHost, /NavInspectionHook\.listener\?\.invoke/, "the report call stays — it is a harmless no-op without a registered listener");

  fs.rmSync(out, { recursive: true, force: true });
});

test("--no-room: DbInspector.kt survives (inspector feature owns the file) in its feature-off body, zero AppDatabase references", async () => {
  const out = await stamp({ room: false });
  const dbInspectorPath = path.join(
    out,
    "composeApp/src/androidDebug/kotlin/com/acme/demo/inspector/DbInspector.kt"
  );
  assert.ok(fs.existsSync(dbInspectorPath), "DbInspector.kt belongs to the inspector feature, not room — it survives room-off");
  const content = fs.readFileSync(dbInspectorPath, "utf8");
  assert.ok(!content.includes("AppDatabase"), "zero AppDatabase reference in the room-off body");
  assert.ok(!content.includes("cmp:feature"), "marker comments themselves are stripped after processing");
  assert.match(content, /disabled in this project/, "the room-off body returns a clear, feature-off error");

  fs.rmSync(out, { recursive: true, force: true });
});

test("GET /inspect/db route dispatch is present regardless of the room feature (InspectorHttpServer.kt)", async () => {
  const withRoom = await stamp({ room: true });
  const withoutRoom = await stamp({ room: false });
  try {
    for (const out of [withRoom, withoutRoom]) {
      const serverPath = path.join(
        out,
        "composeApp/src/androidDebug/kotlin/com/acme/demo/inspector/InspectorHttpServer.kt"
      );
      const content = fs.readFileSync(serverPath, "utf8");
      assert.match(content, /"\/inspect\/db"/, `route dispatch must be unconditional: ${out}`);
      assert.match(content, /"\/inspect\/nav"/);
      assert.match(content, /"\/inspect\/crashes"/);
    }
  } finally {
    fs.rmSync(withRoom, { recursive: true, force: true });
    fs.rmSync(withoutRoom, { recursive: true, force: true });
  }
});
