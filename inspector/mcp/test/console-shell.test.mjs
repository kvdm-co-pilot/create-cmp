// console-shell.mjs — the shared receipt glyph (§3.6: the Evidence rail item
// and the rail foot derive from ONE derivation) and the rail-foot line's
// honesty rules: a stale green is never presented as a live PASS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { receiptGlyph, railReceiptHtml } from "../src/lib/console-shell.mjs";

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
