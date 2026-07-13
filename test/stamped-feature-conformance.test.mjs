// Regression: the in-project feature stamper must stamp a SHELL-05-conforming
// slice OUT OF THE BOX. It clones the `home` exemplar — a TAB screen whose
// BaseScreen comes from AppShell — but registers the clone as a PUSHED NavHost
// destination, which must wrap its own content in BaseScreen (see DetailScreen).
// Before the fix, `node qa/scaffold-feature.mjs Favorites` produced a screen
// that failed the very next verify with SHELL-05 (reproduced 2026-07-13 against
// released 0.6.1). Covers both presets that stamp a screen: `feature` + `screen`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../src/scaffold.mjs";

function baseConfig(targetDir) {
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
  };
}

const SRC = "composeApp/src/commonMain/kotlin/com/acme/demo";

function runStamper(root, args) {
  execFileSync(process.execPath, [path.join(root, "qa/scaffold-feature.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assertWrapped(root, screenRel, label) {
  const screen = fs.readFileSync(path.join(root, screenRel), "utf8");
  assert.match(
    screen,
    /import com\.acme\.demo\.presentation\.components\.BaseScreen/,
    `${label}: stamped screen imports BaseScreen`,
  );
  assert.match(screen, /BaseScreen \{/, `${label}: stamped screen wraps its content in BaseScreen { }`);
  // The wrap must enclose the real content, not sit empty: the root container
  // and the screen's own testTag title must still be present inside the file.
  assert.match(screen, /Column\(/, `${label}: root container survives the wrap`);
  // Balanced braces — the wrap added exactly one opener and one closer.
  const opens = (screen.match(/\{/g) || []).length;
  const closes = (screen.match(/\}/g) || []).length;
  assert.equal(opens, closes, `${label}: braces stay balanced after the wrap`);
}

test("stamper: `feature` preset stamps a BaseScreen-wrapped (SHELL-05-conforming) screen", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stamp-shell05-"));
  try {
    await scaffold(baseConfig(out), { verify: false });
    runStamper(out, ["Favorites"]);
    assertWrapped(out, `${SRC}/presentation/favorites/FavoritesScreen.kt`, "feature preset");
    // The tab exemplar itself must remain UNwrapped — AppShell provides its BaseScreen.
    const home = fs.readFileSync(path.join(out, `${SRC}/presentation/home/HomeScreen.kt`), "utf8");
    assert.doesNotMatch(home, /BaseScreen/, "HomeScreen (tab) stays unwrapped — AppShell wraps tabs");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("stamper: `screen` preset stamps a BaseScreen-wrapped screen too", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stamp-shell05-screen-"));
  try {
    await scaffold(baseConfig(out), { verify: false });
    // `screen` composes on an existing entity's data layer — reuse the exemplar's Item.
    runStamper(out, ["Bookmarks", "--entity", "Item", "--preset", "screen"]);
    assertWrapped(out, `${SRC}/presentation/bookmarks/BookmarksScreen.kt`, "screen preset");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("stamper: wrap is idempotent (re-running on an already-wrapped clone is a no-op shape)", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-stamp-shell05-idem-"));
  try {
    await scaffold(baseConfig(out), { verify: false });
    runStamper(out, ["Favorites"]);
    const rel = `${SRC}/presentation/favorites/FavoritesScreen.kt`;
    const first = fs.readFileSync(path.join(out, rel), "utf8");
    // Exactly one BaseScreen call site (plus the import) — no double-wrapping.
    const wrapCount = (first.match(/BaseScreen \{/g) || []).length;
    assert.equal(wrapCount, 1, "exactly one BaseScreen wrap");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
