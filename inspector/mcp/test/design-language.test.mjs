// design-language.mjs — the §3.1 derivations behind the Design language
// section: dimens classification (spacing scale vs radii vs elevation vs
// plain), WCAG contrast pairs by the On-convention, and per-token usage
// counts from a real commonMain scan (token object names DERIVED from
// source, never hardcoded). Every derivation has an honest-absence branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyDimens, deriveContrastPairs, getTokenUsage } from "../src/lib/design-language.mjs";

// --- classifyDimens ---------------------------------------------------------

test("classifyDimens: Padding*/Gap*/Spacing* -> spacing (sorted ascending by dp), Radius* -> radii, Elevation* -> elevation, rest -> other", () => {
  const { spacing, radius, elevation, other } = classifyDimens({
    PaddingPage: "16dp",
    GapCard: "12dp",
    SpacingTight: "4dp",
    RadiusCard: "16dp",
    RadiusPill: "999dp",
    ElevationCard: "2dp",
    BottomNavHeight: "72dp",
  });
  assert.deepEqual(
    spacing.map((d) => d.name),
    ["SpacingTight", "GapCard", "PaddingPage"],
    "spacing is sorted ascending — it renders as a scale",
  );
  assert.deepEqual(spacing.map((d) => d.dp), [4, 12, 16]);
  assert.deepEqual(radius.map((d) => d.name), ["RadiusCard", "RadiusPill"]);
  assert.deepEqual(elevation.map((d) => d.name), ["ElevationCard"]);
  assert.deepEqual(other.map((d) => d.name), ["BottomNavHeight"]);
});

test("classifyDimens: a spacing-named token whose value isn't parseable dp cannot be drawn to scale -> lands in other, never stretched", () => {
  const { spacing, other } = classifyDimens({ PaddingWeird: "12%", GapCard: "12dp" });
  assert.deepEqual(spacing.map((d) => d.name), ["GapCard"]);
  assert.deepEqual(other.map((d) => d.name), ["PaddingWeird"]);
  assert.equal(other[0].dp, null, "no fabricated dp for an unparseable value");
});

test("classifyDimens: empty/absent catalog -> four empty groups, no invention", () => {
  assert.deepEqual(classifyDimens({}), { spacing: [], radius: [], elevation: [], other: [] });
  assert.deepEqual(classifyDimens(), { spacing: [], radius: [], elevation: [], other: [] });
});

// --- deriveContrastPairs ----------------------------------------------------

test("deriveContrastPairs: On-convention pairs derived from the catalog, ratios computed via contrast.mjs, AA/AAA thresholds applied", () => {
  const pairs = deriveContrastPairs({
    Primary: "#0A2540",
    OnPrimary: "#FFFFFF",
    Surface: "#FFFFFF",
    OnSurface: "#1A1A1A",
    OnSurfaceVariant: "#6B7280",
    Background: "#F7F9FC",
  });
  const key = (p) => `${p.fg}/${p.bg}`;
  const keys = pairs.map(key);
  assert.ok(keys.includes("OnPrimary/Primary"));
  assert.ok(keys.includes("OnSurface/Surface"));
  assert.ok(keys.includes("OnSurfaceVariant/Surface"), "the secondary-text-on-Surface convention pair");
  assert.ok(keys.includes("OnSurface/Background"), "the body-text-on-Background convention pair");

  const onPrimary = pairs.find((p) => key(p) === "OnPrimary/Primary");
  assert.ok(onPrimary.ratio > 10, `white on near-navy is high contrast (got ${onPrimary.ratio})`);
  assert.equal(onPrimary.aa, true);
  assert.equal(onPrimary.aaa, true);

  const secondary = pairs.find((p) => key(p) === "OnSurfaceVariant/Surface");
  assert.equal(secondary.aa, true, "#6B7280 on white clears 4.5:1");
  assert.equal(secondary.aaa, false, "…but not 7:1 — both verdicts must be real");
});

test("deriveContrastPairs: a pair whose base token is missing, or whose hex doesn't parse, is absent — not guessed", () => {
  const pairs = deriveContrastPairs({
    OnAccent: "#0A2540", // Accent itself missing -> pair absent
    OnPrimary: "not-a-color", // unparseable -> pair absent
    Primary: "#0A2540",
  });
  assert.deepEqual(pairs, []);
});

test("deriveContrastPairs: empty catalog -> no pairs", () => {
  assert.deepEqual(deriveContrastPairs({}), []);
  assert.deepEqual(deriveContrastPairs(), []);
});

// --- getTokenUsage ----------------------------------------------------------

function makeUsageFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-token-usage-"));
  const pkg = path.join(root, "composeApp", "src", "commonMain", "kotlin", "com", "acme", "demo");
  const themeDir = path.join(pkg, "presentation", "theme");
  fs.mkdirSync(themeDir, { recursive: true });
  // The token object names deliberately do NOT follow one fixed prefix —
  // the scan must derive them, never assume "MyApp".
  fs.writeFileSync(
    path.join(themeDir, "Theme.kt"),
    [
      "package com.acme.demo.presentation.theme",
      "",
      "object AcmeColors {",
      "    val Primary = Color(0xFF0A2540)",
      "    val Divider = Color(0xFFE5E7EB)",
      "}",
      "",
      "fun scheme() = lightColorScheme(primary = AcmeColors.Primary)",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(themeDir, "Tokens.kt"),
    ["package com.acme.demo.presentation.theme", "", "object AcmeTokens {", "    val PaddingPage = 16.dp", "}"].join("\n"),
  );
  const homeDir = path.join(pkg, "presentation", "home");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, "HomeScreen.kt"),
    [
      "package com.acme.demo.presentation.home",
      "",
      "fun HomeScreen() {",
      "  Box(Modifier.background(AcmeColors.Primary).padding(AcmeTokens.PaddingPage))",
      "  Text(color = AcmeColors.Primary)",
      "}",
    ].join("\n"),
  );
  return root;
}

test("getTokenUsage: derives the token object names from source and counts real references — 0 for a declared-but-unreferenced token", () => {
  const root = makeUsageFixture();
  try {
    const usage = getTokenUsage(root, {
      colors: { Primary: "#0A2540", Divider: "#E5E7EB" },
      dimens: { PaddingPage: "16dp" },
    });
    assert.equal(usage.available, true);
    assert.equal(usage.colors.object, "AcmeColors", "derived from the declaring object, not hardcoded");
    assert.match(usage.colors.file, /presentation\/theme\/Theme\.kt$/);
    // 3 = the theme-scheme mapping + two HomeScreen references.
    assert.equal(usage.colors.counts.Primary, 3);
    assert.equal(usage.colors.counts.Divider, 0, "declared but never referenced -> a real 0, not hidden");
    assert.equal(usage.dimens.object, "AcmeTokens");
    assert.equal(usage.dimens.counts.PaddingPage, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getTokenUsage: catalog tokens with no declaring object in source -> that group is null (absence), the other still resolves", () => {
  const root = makeUsageFixture();
  try {
    const usage = getTokenUsage(root, {
      colors: { Iridescent: "#123456" }, // nothing in the tree declares `val Iridescent`
      dimens: { PaddingPage: "16dp" },
    });
    assert.equal(usage.available, true);
    assert.equal(usage.colors, null, "no declaring object -> absent, never a zero-filled fabrication");
    assert.equal(usage.dimens.object, "AcmeTokens");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getTokenUsage: no commonMain kotlin tree -> {available:false} with the reason", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-token-usage-empty-"));
  try {
    const usage = getTokenUsage(root, { colors: { Primary: "#0A2540" } });
    assert.equal(usage.available, false);
    assert.match(usage.reason, /commonMain/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("getTokenUsage: an empty catalog group yields null for that group (nothing to count), not an empty-counts claim", () => {
  const root = makeUsageFixture();
  try {
    const usage = getTokenUsage(root, { colors: {}, dimens: { PaddingPage: "16dp" } });
    assert.equal(usage.colors, null);
    assert.equal(usage.dimens.counts.PaddingPage, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
