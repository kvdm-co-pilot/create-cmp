// console-shell.mjs — the shared receipt glyph (§3.6: the Evidence rail item
// and the rail foot derive from ONE derivation) and the rail-foot line's
// honesty rules: a stale green is never presented as a live PASS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptGlyph, railReceiptHtml, rendererDownBannerHtml, renderShellPage } from "../src/lib/console-shell.mjs";

test("receiptGlyph: ✓ fresh PASS · ✗ FAIL · ⚠ stale · ○ none — one derivation for rail item and rail foot", () => {
  assert.deepEqual(receiptGlyph(null), { ch: "○", cls: "glyph-unsigned", label: "no verify receipt yet" });
  assert.deepEqual(receiptGlyph({ available: false }), { ch: "○", cls: "glyph-unsigned", label: "no verify receipt yet" });

  const pass = receiptGlyph({ available: true, verdict: "PASS", stale: false });
  assert.equal(pass.ch, "✓");
  assert.equal(pass.cls, "glyph-signed");

  const fail = receiptGlyph({ available: true, verdict: "FAIL", stale: false });
  assert.equal(fail.ch, "✗");
  assert.equal(fail.cls, "glyph-drift");

  const stale = receiptGlyph({ available: true, verdict: "PASS", stale: true });
  assert.equal(stale.ch, "⚠", "a stale PASS is demoted to the drift glyph, never shown as a live green check");
  assert.equal(stale.cls, "glyph-drift");
  assert.match(stale.label, /stale/);

  // Freshness-unknown (stale: null) is NOT stale — the verdict glyph stands,
  // and railReceiptHtml adds the "freshness unverified" words.
  const unknown = receiptGlyph({ available: true, verdict: "PASS", stale: null });
  assert.equal(unknown.ch, "✓");
});

test("railReceiptHtml: verdict + age; stale and freshness-unknown stated in words, absence honest", () => {
  assert.match(railReceiptHtml(null), /no verify receipt yet/);
  const fresh = railReceiptHtml({ available: true, verdict: "PASS", ageMs: 2 * 60 * 60 * 1000, stale: false });
  assert.match(fresh, /verify PASS 2h ago/);
  assert.doesNotMatch(fresh, /freshness unverified/);
  const stale = railReceiptHtml({ available: true, verdict: "PASS", ageMs: 60_000, stale: true });
  assert.match(stale, /stale \(tree changed since\)/);
  assert.match(stale, /glyph-drift/);
  const unknown = railReceiptHtml({ available: true, verdict: "PASS", ageMs: 60_000, stale: null });
  assert.match(unknown, /freshness unverified/);
});

// FI-9 Change B: the renderer-down banner — "the eyes are stale", distinct from
// the generic .banner a compile/reload failure already shows.
test("rendererDownBannerHtml: silent unless renderer.lastOutcome is 'failed'", () => {
  assert.equal(rendererDownBannerHtml(null), "");
  assert.equal(rendererDownBannerHtml({ lastOutcome: "never" }), "");
  assert.equal(rendererDownBannerHtml({ lastOutcome: "ok" }), "");
});

test("rendererDownBannerHtml: states since-when (from lastSuccessAt), the failure streak, and the last error — amber, not red", () => {
  const html = rendererDownBannerHtml({
    lastOutcome: "failed",
    lastSuccessAt: "2026-07-25T14:32:00.000Z",
    lastAttemptAt: "2026-07-25T14:41:00.000Z",
    consecutiveFailures: 5,
    lastError: "Command failed: ./gradlew :composeApp:renderScreens",
  });
  assert.match(html, /class="banner banner-renderer"/);
  assert.match(html, /Renderer down since \d{2}:\d{2}/);
  assert.match(html, /screens below are stale/);
  assert.match(html, /5 renders in a row have failed/);
  assert.match(html, /Command failed: \.\/gradlew :composeApp:renderScreens/);
});

test("rendererDownBannerHtml: never having completed a render (lastSuccessAt null) says so instead of a bogus time", () => {
  const html = rendererDownBannerHtml({
    lastOutcome: "failed",
    lastSuccessAt: null,
    lastAttemptAt: "2026-07-25T14:41:00.000Z",
    consecutiveFailures: 1,
    lastError: "ENOENT: no gradlew",
  });
  assert.match(html, /no render has completed yet/);
  assert.doesNotMatch(html, /Renderer down since \d{2}:\d{2}/);
  assert.doesNotMatch(html, /renders in a row have failed/, "streak note only appears above 1");
});

test("rendererDownBannerHtml: escapes the error text (no raw HTML injection)", () => {
  const html = rendererDownBannerHtml({
    lastOutcome: "failed",
    lastSuccessAt: "2026-07-25T14:32:00.000Z",
    consecutiveFailures: 1,
    lastError: "<script>alert(1)</script>",
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderShellPage: p.rendererDown renders the amber banner alongside (not instead of) p.error", () => {
  const page = renderShellPage({
    appName: "Acme",
    railItems: [],
    railFootHtml: "",
    sections: [],
    error: "Command failed: ./gradlew :composeApp:renderScreens",
    rendererDown: { lastOutcome: "failed", lastSuccessAt: "2026-07-25T14:32:00.000Z", consecutiveFailures: 3 },
    bodyScript: "",
  });
  assert.match(page, /<div class="banner banner-renderer">/);
  assert.match(page, /last render FAILED/);
});

test("renderShellPage: no rendererDown banner DIV when the renderer is healthy (the CSS rule itself is always shipped)", () => {
  const page = renderShellPage({
    appName: "Acme",
    railItems: [],
    railFootHtml: "",
    sections: [],
    error: null,
    rendererDown: null,
    bodyScript: "",
  });
  assert.doesNotMatch(page, /<div class="banner banner-renderer">/);
});
