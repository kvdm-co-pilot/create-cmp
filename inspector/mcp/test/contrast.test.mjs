import { test } from "node:test";
import assert from "node:assert/strict";

import { parseColor, relativeLuminance, contrastRatio } from "../src/lib/contrast.mjs";

test("parseColor: 6-digit hex is opaque RGB", () => {
  assert.deepEqual(parseColor("#FFFFFF"), { r: 255, g: 255, b: 255, a: 255 });
  assert.deepEqual(parseColor("#000000"), { r: 0, g: 0, b: 0, a: 255 });
});

test("parseColor: 8-digit hex is alpha-first AARRGGBB", () => {
  assert.deepEqual(parseColor("#80112233"), { a: 128, r: 17, g: 34, b: 51 });
});

test("parseColor: lowercase and mixed case both parse", () => {
  assert.deepEqual(parseColor("#ffffff"), { r: 255, g: 255, b: 255, a: 255 });
  assert.deepEqual(parseColor("#FfFfFf"), { r: 255, g: 255, b: 255, a: 255 });
});

test("parseColor: malformed / non-hex / dimension values are null, never thrown", () => {
  assert.equal(parseColor("16dp"), null);
  assert.equal(parseColor("#FFF"), null); // 3-digit shorthand unsupported — not the catalog convention
  assert.equal(parseColor("#GGGGGG"), null);
  assert.equal(parseColor(""), null);
  assert.equal(parseColor(null), null);
  assert.equal(parseColor(undefined), null);
  assert.equal(parseColor(42), null);
});

test("relativeLuminance: white is 1, black is 0", () => {
  assert.ok(Math.abs(relativeLuminance({ r: 255, g: 255, b: 255 }) - 1) < 1e-9);
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
});

test("contrastRatio: black on white is the maximum, 21:1", () => {
  const ratio = contrastRatio("#000000", "#FFFFFF");
  assert.ok(Math.abs(ratio - 21) < 1e-6);
});

test("contrastRatio: white on white is the minimum, 1:1", () => {
  assert.equal(contrastRatio("#FFFFFF", "#FFFFFF"), 1);
});

test("contrastRatio: order of the two colors does not matter", () => {
  const a = contrastRatio("#000000", "#FFFFFF");
  const b = contrastRatio("#FFFFFF", "#000000");
  assert.equal(a, b);
});

test("contrastRatio: null when either color fails to parse — never a guess", () => {
  assert.equal(contrastRatio("16dp", "#FFFFFF"), null);
  assert.equal(contrastRatio("#FFFFFF", "not-a-color"), null);
  assert.equal(contrastRatio(null, "#FFFFFF"), null);
});

test("contrastRatio: a known WCAG-borderline pair (#767676 on white ~ 4.54:1, AA pass)", () => {
  const ratio = contrastRatio("#767676", "#FFFFFF");
  assert.ok(ratio >= 4.5, `expected >= 4.5, got ${ratio}`);
  assert.ok(ratio < 4.6, `expected < 4.6, got ${ratio}`);
});
