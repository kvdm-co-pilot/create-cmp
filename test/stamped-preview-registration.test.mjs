// Parity gate: the in-project feature stamper must AUTO-REGISTER a stamped
// pushed-destination screen in inspector/PreviewRegistry.kt, so `renderScreens`,
// the preview gallery, and golden baselines pick it up with zero hand edits.
// Before this, `qa/scaffold-feature.mjs Favorites` wired nav + DI but left the
// screen invisible to the preview loop until you hand-added a ScreenPreview entry
// — the exact drift this test now forbids. Covers both screen-stamping presets
// (`feature` + `screen`) and the inspector-disabled path (must not crash).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

const REGISTRY_REL = "composeApp/src/desktopMain/kotlin/com/acme/demo/inspector/PreviewRegistry.kt";

function runStamper(root, args) {
  execFileSync(process.execPath, [path.join(root, "qa/scaffold-feature.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assertRegistered(root, { screen, slug, label }) {
  const registry = fs.readFileSync(path.join(root, REGISTRY_REL), "utf8");
  assert.match(
    registry,
    new RegExp(`import com\\.acme\\.demo\\.presentation\\.${slug}\\.${screen}\\b`),
    `${label}: PreviewRegistry imports ${screen}`,
  );
  // Single-line entry: `ScreenPreview("<slug>", "...") { <Screen>(...) },`. Match on one
  // line (`.` excludes newline) so a parenthesised title can't confuse the assertion.
  assert.match(
    registry,
    new RegExp(`ScreenPreview\\("${slug}",.*\\b${screen}\\(`),
    `${label}: PreviewRegistry has a ScreenPreview entry hosting ${screen}`,
  );
  // The entry sits before the anchor MARKER LINE (so the anchor stays available for the
  // next stamp). The KDoc also mentions the marker string in prose, so target the last
  // occurrence — the real marker line at the bottom of listOf(...).
  const entryIdx = registry.indexOf(`${screen}(`);
  const anchorIdx = registry.lastIndexOf("// cmp:anchor preview-registry");
  assert.ok(entryIdx !== -1 && anchorIdx !== -1 && entryIdx < anchorIdx, `${label}: entry precedes the anchor`);
}

test("stamper `feature` preset auto-registers the screen in PreviewRegistry", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-prev-reg-feat-"));
  try {
    await scaffold(baseConfig(out), { verify: false });
    runStamper(out, ["Favorites"]);
    assertRegistered(out, { screen: "FavoritesScreen", slug: "favorites", label: "feature preset" });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("stamper `screen` preset auto-registers the screen in PreviewRegistry", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-prev-reg-screen-"));
  try {
    await scaffold(baseConfig(out), { verify: false });
    runStamper(out, ["Bookmarks", "--entity", "Item", "--preset", "screen"]);
    assertRegistered(out, { screen: "BookmarksScreen", slug: "bookmarks", label: "screen preset" });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("PreviewRegistry registration is single (one entry + one import per stamp, no duplication)", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-prev-reg-single-"));
  try {
    await scaffold(baseConfig(out), { verify: false });
    runStamper(out, ["Favorites"]);
    // Re-stamping the same feature is refused by the stamper's existing-files guard
    // (that guard is the duplicate protection); the injection itself must add exactly
    // one entry + one import in a single run — the `feature` preset chains two screen
    // steps into this file, and neither may double up.
    const registry = fs.readFileSync(path.join(out, REGISTRY_REL), "utf8");
    const entries = (registry.match(/ScreenPreview\("favorites",/g) || []).length;
    const imports = (registry.match(/import com\.acme\.demo\.presentation\.favorites\.FavoritesScreen\b/g) || []).length;
    assert.equal(entries, 1, "exactly one favorites ScreenPreview entry");
    assert.equal(imports, 1, "exactly one FavoritesScreen import");
    // And the anchor MARKER LINE survives for the next stamp (line-anchored, not the KDoc mention).
    assert.match(registry, /^\s*\/\/ cmp:anchor preview-registry\s*$/m, "anchor marker line remains after injection");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("stamper does not crash when the inspector (PreviewRegistry) is disabled", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-prev-reg-noinspect-"));
  try {
    await scaffold(baseConfig(out, { inspector: false }), { verify: false });
    assert.ok(!fs.existsSync(path.join(out, REGISTRY_REL)), "no PreviewRegistry when inspector is off");
    // Must stamp nav + DI without dying on the absent optional file.
    runStamper(out, ["Favorites"]);
    const nav = fs.readFileSync(
      path.join(out, "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/navigation/AppNavHost.kt"),
      "utf8",
    );
    assert.match(nav, /composable\(Screen\.Favorites\.route\)/, "nav still wired with inspector off");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
