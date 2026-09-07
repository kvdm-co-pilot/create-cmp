// console-data.mjs — the pure derivations the console's own section renderers
// need, and nothing else.
//
// MOVED HERE from inspector/mcp/src/lib/ (design-language.mjs and
// components.mjs) when the console moved into this package — NORTH-STAR §9,
// stage 0.5, "the console into the harness". A reader coming from either of
// those files should know why these four functions left them.
//
// The reason is the package boundary, not tidiness. `packages/harness` is
// `prooflane-harness`, whose `files` list ships `src/` and whose whole claim
// (PACKAGE-SPLIT.md §3) is "the console ... Knows no stack. THIS IS THE
// PRODUCT." A console module that imported back into inspector/mcp would ship
// with a dangling relative path — the sibling package is not in the tarball —
// so the console cannot have a single edge pointing that way, and these were
// the only three it had.
//
// What stayed behind is exactly the stack-coupled half. `getTokenUsage` scans
// Kotlin source for a declaring `object`; `walkKtFiles`/`getComponentsData`
// parse `.kt` signatures. Those are the eyes (PACKAGE-SPLIT.md §3,
// `prooflane-studio-cmp`) and they stay in inspector/mcp. What moved is what a
// console for ANY stack could use: bucket a dimens catalog by name, compute a
// WCAG pair table from a colour catalog, and spell a component's story id.
// None of them reads a file or names a path.
//
// The originals are re-exports now, so every existing import site and both
// unit tests still resolve — one definition, two doors.

import { contrastRatio } from "./contrast.mjs";

// --- component story ids (was components.mjs) ---------------------------------

/**
 * PascalCase/camelCase → kebab-case: AppHeader → app-header, ListItemCard →
 * list-item-card. Mirrors the template's qa/lib/component-stories.mjs (the
 * lane-side parity gate) — keep the two in sync, same contract as navSlug.
 */
export function kebabCase(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** The preview-registry story id a component of this name registers (§3.3): `component.<kebab>`. */
export function componentStoryId(name) {
  return `component.${kebabCase(name)}`;
}

// --- dimens classification ----------------------------------------------------

const DP_RE = /^(\d+(?:\.\d+)?)\s*dp$/;

/**
 * @param {Record<string, string>} dimens catalog dimens (name -> "16dp"-style value)
 * @returns {{spacing: Array<{name:string,value:string,dp:number}>,
 *            radius: Array<{name:string,value:string,dp:(number|null)}>,
 *            elevation: Array<{name:string,value:string,dp:(number|null)}>,
 *            other: Array<{name:string,value:string,dp:(number|null)}>}}
 *   spacing sorted ascending by dp (it is rendered as a scale); the rest in
 *   catalog order. A `Padding`/`Gap` token whose value doesn't parse as dp
 *   cannot be drawn to scale — it goes to `other` (stated, not stretched).
 */
export function classifyDimens(dimens = {}) {
  const spacing = [];
  const radius = [];
  const elevation = [];
  const other = [];
  for (const [name, value] of Object.entries(dimens)) {
    const m = DP_RE.exec(String(value).trim());
    const dp = m ? Number(m[1]) : null;
    if (/^(Padding|Gap|Spacing)/.test(name) && dp !== null) spacing.push({ name, value, dp });
    else if (/^Radius/.test(name)) radius.push({ name, value, dp });
    else if (/^Elevation/.test(name)) elevation.push({ name, value, dp });
    else other.push({ name, value, dp });
  }
  spacing.sort((a, b) => a.dp - b.dp || a.name.localeCompare(b.name));
  return { spacing, radius, elevation, other };
}

// --- WCAG contrast pairs ------------------------------------------------------

// Normal-text thresholds, WCAG 2.2 SC 1.4.3 (AA) / SC 1.4.6 (AAA).
export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AAA_NORMAL = 7;

/**
 * @param {Record<string, string>} colors catalog colors (name -> hex)
 * @returns {Array<{fg:string,bg:string,fgHex:string,bgHex:string,ratio:number,aa:boolean,aaa:boolean,role:string}>}
 */
export function deriveContrastPairs(colors = {}) {
  const pairs = [];
  const seen = new Set();
  const add = (fg, bg, role) => {
    if (!(fg in colors) || !(bg in colors)) return;
    const key = `${fg}/${bg}`;
    if (seen.has(key)) return;
    const ratio = contrastRatio(colors[fg], colors[bg]);
    if (ratio === null) return; // unparseable hex -> the pair is absent, not guessed
    seen.add(key);
    pairs.push({
      fg,
      bg,
      fgHex: colors[fg],
      bgHex: colors[bg],
      ratio,
      aa: ratio >= WCAG_AA_NORMAL,
      aaa: ratio >= WCAG_AAA_NORMAL,
      role,
    });
  };
  for (const name of Object.keys(colors)) {
    if (/^On.+/.test(name)) add(name, name.slice(2), "text on its own surface");
  }
  add("OnSurfaceVariant", "Surface", "secondary text on Surface");
  add("OnSurface", "Background", "body text on Background");
  return pairs;
}
