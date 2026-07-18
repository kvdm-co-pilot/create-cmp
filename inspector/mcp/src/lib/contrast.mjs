// contrast.mjs — WCAG 2.x relative luminance + contrast ratio over resolved design-token
// colors. Pure math, no MCP imports — unit-testable in isolation, like every other lib.
//
// Color format (the InspectorCatalog convention — see androidDebug/inspector/InspectorCatalog.kt):
//   "#RRGGBB"   opaque, no alpha
//   "#AARRGGBB" alpha-first (Android's convention), 8 hex digits
// Anything else (missing, malformed, a dimension like "16dp") parses to null — callers must
// treat that as "not genuinely known" and skip the check, never guess.

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * @param {string} hex  "#RRGGBB" or "#AARRGGBB"
 * @returns {{r:number, g:number, b:number, a:number}|null}
 */
export function parseColor(hex) {
  if (typeof hex !== "string") return null;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const digits = m[1];
  if (digits.length === 6) {
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 255,
    };
  }
  return {
    a: parseInt(digits.slice(0, 2), 16),
    r: parseInt(digits.slice(2, 4), 16),
    g: parseInt(digits.slice(4, 6), 16),
    b: parseInt(digits.slice(6, 8), 16),
  };
}

function srgbChannelToLinear(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0..1) of an {r,g,b} color (alpha ignored — see [contrastRatio]). */
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

/**
 * WCAG contrast ratio (1..21) between two hex colors, or null if either fails to parse.
 * Alpha is ignored — a translucent foreground's EFFECTIVE color depends on what's under it,
 * which the tree contract does not carry; treating the token's own RGB as opaque is the
 * documented, conservative approximation (never silently wrong-by-omission: the caller decides
 * whether a null result should suppress the check, which is exactly what [contrastRatio] gives it).
 */
export function contrastRatio(hexA, hexB) {
  const a = parseColor(hexA);
  const b = parseColor(hexB);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
