// Tab-driven surface regeneration (src/lib/tabs.mjs, pipeline step b.3).
//
// Two properties under test:
//   1. GOLDEN DEFAULT — the default tabs config (Home:home, Profile:person)
//      reproduces the static template's AppTab.kt / AppNavHost.kt /
//      qa/e2e/smoke.yaml byte-for-byte (deterministic scaffolding).
//   2. CUSTOM TABS — a non-default config rewrites all three surfaces: one
//      AppTab entry per tab, nav_<slug> taps in smoke.yaml per AppShell's
//      navItemTag slug rule, PlaceholderScreen stubs for tabs without a
//      shipped feature screen, and no stale Home/Profile leftovers.
//
// Mirrors harness-surfaces.test.mjs's stamp() pattern: real template,
// verify:false (files only, no Gradle), mkdtemp + rm in finally.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold } from "../src/scaffold.mjs";
import { navSlug, tabInfos } from "../src/lib/tabs.mjs";
import { buildTokenMap, replaceTokens } from "../src/lib/tokens.mjs";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_TABS = [
  { label: "Home", icon: "home" },
  { label: "Profile", icon: "person" },
];

const CUSTOM_TABS = [
  { label: "Feed", icon: "home" },
  // Exercises the slug rule's non-alphanumeric collapsing: "My Stuff!" → my_stuff
  { label: "My Stuff!", icon: "person" },
  { label: "Settings", icon: "settings" },
];

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
    tabs: DEFAULT_TABS,
    targetDir,
    ...overrides,
  };
}

async function stamp(overrides = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-tabs-"));
  await scaffold(baseConfig(out, overrides), { verify: false });
  return out;
}

const NAV_DIR = "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/navigation";
const APPTAB_REL = `${NAV_DIR}/AppTab.kt`;
const NAVHOST_REL = `${NAV_DIR}/AppNavHost.kt`;
const PLACEHOLDER_REL =
  "composeApp/src/commonMain/kotlin/com/acme/demo/presentation/components/PlaceholderScreen.kt";
const SMOKE_REL = "qa/e2e/smoke.yaml";

function read(out, rel) {
  return fs.readFileSync(path.join(out, rel), "utf8");
}

// --- slug rule (must mirror AppShell.kt's navItemTag) ------------------------

test("navSlug mirrors AppShell.kt navItemTag: lowercase, collapse non-[a-z0-9] runs to _, trim", () => {
  assert.equal(navSlug("Home"), "home");
  assert.equal(navSlug("Profile"), "profile");
  assert.equal(navSlug("My Stuff!"), "my_stuff");
  assert.equal(navSlug("  A -- B  "), "a_b");
  assert.equal(navSlug("Q&A 2"), "q_a_2");
});

test("tabInfos rejects labels that slug empty or collide", () => {
  assert.throws(() => tabInfos([{ label: "!!!", icon: "home" }]), /empty nav slug/);
  assert.throws(
    () => tabInfos([{ label: "Home", icon: "home" }, { label: "home!", icon: "person" }]),
    /both slug to "home"/
  );
});

// --- golden default -----------------------------------------------------------

test("default tabs reproduce the static template surfaces byte-for-byte", async () => {
  const out = await stamp();
  try {
    const tokenMap = buildTokenMap(baseConfig(out));
    const expectFromTemplate = (rel) =>
      replaceTokens(fs.readFileSync(path.join(REPO_ROOT, "template", rel), "utf8"), tokenMap);

    assert.equal(
      read(out, APPTAB_REL),
      expectFromTemplate("composeApp/src/commonMain/kotlin/com/example/app/presentation/navigation/AppTab.kt"),
      "AppTab.kt is byte-identical to the stamped static template file"
    );
    assert.equal(
      read(out, NAVHOST_REL),
      expectFromTemplate("composeApp/src/commonMain/kotlin/com/example/app/presentation/navigation/AppNavHost.kt"),
      "AppNavHost.kt is byte-identical to the stamped static template file"
    );
    assert.equal(
      read(out, SMOKE_REL),
      expectFromTemplate("qa/e2e/smoke.yaml"),
      "smoke.yaml is byte-identical to the stamped static template file"
    );
    assert.ok(
      !fs.existsSync(path.join(out, PLACEHOLDER_REL)),
      "no PlaceholderScreen is generated for the default tabs"
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// --- custom tabs ---------------------------------------------------------------

test("custom tabs rewrite AppTab.kt, AppNavHost, and smoke.yaml", async (t) => {
  const out = await stamp({ tabs: CUSTOM_TABS });

  try {
    await t.test("AppTab.kt has one entry per tab with label + icon, no stale defaults", () => {
      const appTab = read(out, APPTAB_REL);
      assert.match(appTab, /AppTab\("Feed", Icons\.Filled\.Home, feed\),/);
      assert.match(appTab, /AppTab\("My Stuff!", Icons\.Filled\.Person, myStuff\),/);
      assert.match(appTab, /AppTab\("Settings", Icons\.Filled\.Settings, settings\),/);
      assert.match(appTab, /import androidx\.compose\.material\.icons\.filled\.Settings/);
      assert.equal((appTab.match(/AppTab\("/g) || []).length, 3, "exactly one entry per configured tab");
      assert.ok(!appTab.includes('AppTab("Home"'), "no stale Home entry");
      assert.ok(!appTab.includes('AppTab("Profile"'), "no stale Profile entry");
    });

    await t.test("smoke.yaml taps/asserts nav_<slug> per tab, keeps SPEC + extendedWaitUntil shape", () => {
      const smoke = read(out, SMOKE_REL);
      assert.match(smoke, /SPEC:\s*SHELL-01/);
      assert.match(smoke, /extendedWaitUntil/);
      // First tab: waited on, then returned to.
      assert.match(smoke, /id: "feed_title"/);
      assert.match(smoke, /id: "nav_feed"/);
      // Subsequent tabs: tapped by nav_<slug>, content asserted.
      assert.match(smoke, /id: "nav_my_stuff"/);
      assert.match(smoke, /id: "my_stuff_title"/);
      assert.match(smoke, /id: "nav_settings"/);
      assert.match(smoke, /id: "settings_title"/);
      // No stale default-tab ids, no bare-text taps.
      assert.ok(!smoke.includes("nav_home"), "no stale nav_home");
      assert.ok(!smoke.includes("nav_profile"), "no stale nav_profile");
      assert.ok(!/tapOn:\s*"/.test(smoke), "no tapOn by bare display text");
    });

    await t.test("AppNavHost wires PlaceholderScreen stubs for tabs without a feature screen", () => {
      const navHost = read(out, NAVHOST_REL);
      assert.match(navHost, /import com\.acme\.demo\.presentation\.components\.PlaceholderScreen/);
      assert.match(navHost, /feed = \{ PlaceholderScreen\(title = "Feed", titleTag = "feed_title"\) \},/);
      assert.match(navHost, /myStuff = \{ PlaceholderScreen\(title = "My Stuff!", titleTag = "my_stuff_title"\) \},/);
      assert.match(navHost, /settings = \{ PlaceholderScreen\(title = "Settings", titleTag = "settings_title"\) \},/);
      assert.ok(!navHost.includes("HomeScreen("), "no stale HomeScreen wiring");
      assert.ok(!navHost.includes("ProfileScreen()"), "no stale ProfileScreen wiring");
    });

    await t.test("PlaceholderScreen stub is generated and stamped", () => {
      const placeholder = read(out, PLACEHOLDER_REL);
      assert.match(placeholder, /package com\.acme\.demo\.presentation\.components/);
      assert.match(placeholder, /fun PlaceholderScreen\(title: String, titleTag: String\)/);
      assert.match(placeholder, /AcmeTokens\.PaddingPage/, "theme prefix token stamped");
      assert.ok(!placeholder.includes("__PACKAGE__"), "no leftover tokens");
    });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("home/profile slugs in a custom config keep their real feature screens", async () => {
  // "Home" among custom tabs must wire HomeScreen (not a placeholder) — the
  // association is by nav slug, exactly like the default config.
  const out = await stamp({
    tabs: [
      { label: "Home", icon: "home" },
      { label: "Feed", icon: "star" },
    ],
  });
  try {
    const navHost = read(out, NAVHOST_REL);
    assert.match(navHost, /home = \{\n\s+HomeScreen\(/);
    assert.match(navHost, /feed = \{ PlaceholderScreen\(title = "Feed", titleTag = "feed_title"\) \},/);
    assert.ok(!navHost.includes("ProfileScreen"), "no Profile import/wiring without a profile tab");
    const smoke = read(out, SMOKE_REL);
    assert.match(smoke, /id: "home_title"/);
    assert.match(smoke, /id: "nav_feed"/);
    assert.ok(!smoke.includes("nav_profile"), "no stale nav_profile");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
