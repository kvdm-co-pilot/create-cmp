// design-language.mjs — the derivations behind the Design language section
// (docs/STUDIO-REDESIGN.md §3.1: the designer's handoff spec). Three concerns,
// each evidence-or-silence:
//
// - getTokenUsage: per-token usage counts from a REAL scan of
//   composeApp/src/commonMain/kotlin. The token object names (`MyAppColors`,
//   `AcmeTokens`, …) vary per project — they are DERIVED by finding the Kotlin
//   `object` whose `val` declarations match the catalog's token names, never
//   hardcoded. No matching object -> that token group's counts are absent
//   (with the reason), never zero-filled.
// - deriveContrastPairs: the WCAG 2.2 contrast matrix's pairs, derived from
//   the catalog by the On-convention (OnX is the text color used on surface X)
//   plus the two body-text conventions the template's theme actually maps
//   (OnSurfaceVariant on Surface, OnSurface on Background). A pair whose base
//   token is missing, or whose hex doesn't parse, is absent — not guessed.
//   Ratio math is contrast.mjs (VL-1), not reimplemented.
// - classifyDimens: the dimens catalog split by the template's own naming
//   convention — Padding*/Gap*/Spacing* are the spacing scale (drawn to
//   scale by the renderer, so they must carry a parsed dp), Radius* radii,
//   Elevation* elevations, anything else (or anything whose value isn't
//   `<n>dp`) a plain "other" table — classified honestly, never forced.

import fs from "node:fs";
import path from "node:path";
import { contrastRatio } from "./contrast.mjs";
import { walkKtFiles } from "./components.mjs";

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

// --- per-token usage counts ---------------------------------------------------

/**
 * Find the Kotlin `object` whose body declares `val <name>` for the most of
 * `tokenNames` — the project's token object for that group. Brace-matched,
 * same pragmatic-scan stance as components.mjs. Returns null when no object
 * declares ANY of the names (the honest "can't derive" answer).
 * @param {Map<string, string>} fileTexts absolute path -> file text
 * @param {string[]} tokenNames
 * @returns {{name: string, file: string}|null}
 */
function findDeclaringObject(fileTexts, tokenNames) {
  if (tokenNames.length === 0) return null;
  let best = null;
  for (const [file, text] of fileTexts) {
    const objRe = /\bobject\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g;
    let m;
    while ((m = objRe.exec(text))) {
      let depth = 0;
      let end = -1;
      for (let i = m.index + m[0].length - 1; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) continue; // unbalanced — not a scannable object body
      const body = text.slice(m.index, end + 1);
      const declared = tokenNames.filter((n) => new RegExp(`\\bval\\s+${n}\\b`).test(body)).length;
      if (declared > 0 && (!best || declared > best.declared)) {
        best = { name: m[1], file, declared };
      }
    }
  }
  return best ? { name: best.name, file: best.file } : null;
}

/** Count `\b<objectName>.<tokenName>\b` references per token across all files. */
function countReferences(fileTexts, objectName, tokenNames) {
  const counts = {};
  for (const name of tokenNames) counts[name] = 0;
  for (const text of fileTexts.values()) {
    for (const name of tokenNames) {
      const re = new RegExp(`\\b${objectName}\\.${name}\\b`, "g");
      const matches = text.match(re);
      if (matches) counts[name] += matches.length;
    }
  }
  return counts;
}

/**
 * Per-token usage counts for the catalog's colors and dimens, from a real
 * scan of composeApp/src/commonMain/kotlin. Each group resolves (or fails)
 * independently: `colors`/`dimens` is `{object, file, counts}` when a
 * declaring object was found, else `null` — the renderer states the absence,
 * never fabricates a zero table. Counts include every `<Object>.<Token>`
 * reference in commonMain (the declaration itself is `val Token = …` and
 * doesn't match), so 0 genuinely means "declared but never referenced".
 * @param {string} root project root
 * @param {{colors?: Record<string,string>, dimens?: Record<string,string>}} catalog
 * @returns {{available: false, reason: string} |
 *           {available: true, scanRoot: string,
 *            colors: ({object: string, file: string, counts: Record<string, number>}|null),
 *            dimens: ({object: string, file: string, counts: Record<string, number>}|null)}}
 */
export function getTokenUsage(root, catalog = {}) {
  const kotlinRoot = path.join(root, "composeApp", "src", "commonMain", "kotlin");
  const files = walkKtFiles(kotlinRoot);
  if (files.length === 0) {
    return { available: false, reason: "no .kt files found under composeApp/src/commonMain/kotlin" };
  }
  const fileTexts = new Map();
  for (const f of files) {
    try {
      fileTexts.set(f, fs.readFileSync(f, "utf8"));
    } catch {
      // a file that vanished mid-scan contributes nothing — never a guess
    }
  }
  const rel = (abs) => path.relative(root, abs).split(path.sep).join("/");
  const group = (tokens) => {
    const names = Object.keys(tokens || {});
    const decl = findDeclaringObject(fileTexts, names);
    if (!decl) return null;
    return { object: decl.name, file: rel(decl.file), counts: countReferences(fileTexts, decl.name, names) };
  };
  return {
    available: true,
    scanRoot: "composeApp/src/commonMain/kotlin",
    colors: group(catalog.colors),
    dimens: group(catalog.dimens),
  };
}
