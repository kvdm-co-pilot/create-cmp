// components.mjs — Design System tab's Components section (VERIFICATION-LAYER-
// DESIGN.md §7.2, rebuilt to the CV-1 three-in-one standard: authored form +
// derived truth + drift surface): a static Node-side scan of
// presentation/components/*.kt for `@Composable fun` signatures — "structural
// truth, not screenshots" (isolated component preview rendering is explicitly
// deferred). For each component: name, file, parameter list (raw AND
// name/type/default-parsed), its own KDoc (quoted verbatim, never
// paraphrased), a used-in list (call sites `Name(` found anywhere else under
// presentation/**, split into screens vs other components), and a derived
// "facts" set — which testTags it owns via `screenTag`, which ContentUiState
// arms it renders, whether it enforces the 48dp a11y floor, which insets APIs
// it owns, which theme tokens it references, and whether it self-reports to
// the inspector via `designToken(...)`. Every fact is evidence-or-silence: a
// fact this scan can't positively find in the component's own source is never
// shown as a claim (no "does NOT do X" negatives) — see deriveFacts below.
//
// Parsing is a pragmatic scan, not a Kotlin compiler front-end: multiline
// parameter lists and default values (which may themselves contain parens,
// e.g. `= Modifier.padding(8.dp)`) are handled by paren-depth tracking. A
// signature this can't cleanly bound (unbalanced parens before EOF) is
// reported HONESTLY — name + file, parseError:true — rather than guessed at.

import fs from "node:fs";
import path from "node:path";

/** Every `.kt` file under `dir` (recursive), as absolute paths. Exported for handrolled-state.mjs's ARCH-11 mirror. */
export function walkKtFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkKtFiles(p));
    else if (e.name.endsWith(".kt")) out.push(p);
  }
  return out;
}

/** Every directory named exactly `presentation` under `kotlinRoot` (normally exactly one). Exported for handrolled-state.mjs. */
export function findPresentationDirs(kotlinRoot) {
  const out = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (e.name === "presentation") out.push(p);
      else walk(p);
    }
  })(kotlinRoot);
  return out;
}

/**
 * Split a raw parameter-list string (the exact text between a signature's
 * outer parens) into individual parameter substrings, on TOP-LEVEL commas
 * only — commas nested inside (), [], {} (default-value calls, lambda
 * bodies/types) don't split. Deliberately does NOT track `<`/`>`: Kotlin's
 * lambda arrow `->` collides with a generic close bracket (an untracked `<`
 * would send depth negative on the very first `() -> Unit` — ubiquitous in
 * Composable params), and that false split is far more damaging than the
 * rarer case this leaves unhandled (a literal multi-arg generic type used
 * directly as a param type, e.g. `data: Map<String, Int>`).
 */
function splitTopLevel(paramsText) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of paramsText) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Parse one raw parameter string into {raw, name, type, default} — the
 * "signature reference" a staff-level API doc shows. Same depth-tracking
 * stance as splitTopLevel (parens/brackets/braces only, never `<>`): finds
 * the first TOP-LEVEL `:` for the name/type boundary, then the first
 * top-level `=` in what follows for the type/default boundary. A param with
 * no top-level `:` (shouldn't happen in valid Kotlin, but scanned text is
 * never assumed valid) degrades to {name: raw, type: null, default: null}
 * rather than guessing.
 * @param {string} raw
 * @returns {{raw: string, name: string, type: string|null, default: string|null}}
 */
function parseParam(raw) {
  let depth = 0;
  let colonIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === ":" && depth === 0 && colonIdx === -1) colonIdx = i;
  }
  if (colonIdx === -1) return { raw, name: raw.trim(), type: null, default: null };
  const name = raw.slice(0, colonIdx).trim();
  const rest = raw.slice(colonIdx + 1);
  depth = 0;
  let eqIdx = -1;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "=" && depth === 0 && eqIdx === -1) eqIdx = i;
  }
  if (eqIdx === -1) return { raw, name, type: rest.trim(), default: null };
  return { raw, name, type: rest.slice(0, eqIdx).trim(), default: rest.slice(eqIdx + 1).trim() };
}

/**
 * The KDoc block comment immediately preceding `idx` in `text` (allowing only
 * whitespace between the comment's close and `idx` — the convention every
 * component in the template follows: doc comment directly above `@Composable`).
 * Leading `*`/indentation is stripped per line; blank lines at either end are
 * trimmed. Quoted VERBATIM elsewhere (never paraphrased) — this is the
 * component's own words, not a generated summary. Returns null (never a
 * guess) when there's no comment directly above, or it's empty after
 * stripping.
 * @param {string} text
 * @param {number} idx
 * @returns {string|null}
 */
function extractKdocBefore(text, idx) {
  const before = text.slice(0, idx).replace(/\s+$/, "");
  if (!before.endsWith("*/")) return null;
  const start = before.lastIndexOf("/**");
  if (start === -1) return null;
  const raw = before.slice(start);
  const body = raw.replace(/^\/\*\*/, "").replace(/\*\/$/, "");
  const lines = body.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trimEnd());
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const joined = lines.join("\n").trim();
  return joined || null;
}

/**
 * Split a KDoc body (extractKdocBefore's output) into its free-text
 * description and its `@param` tag map — the two places the Components
 * section renders KDoc: the description verbatim as the component's usage
 * notes, each `@param`'s text in the params table's notes column. Only
 * `@param` is mapped; other block tags (`@sample`, `@see`, …) are neither
 * mapped nor folded into the description — they are simply not rendered,
 * never paraphrased into something else. A continuation line (any line that
 * doesn't start a new block tag) folds into the current tag's text,
 * KDoc-style. No `@param` for a parameter -> that parameter simply has no
 * entry (renderers show an empty notes cell, never invented prose).
 * @param {string|null} kdoc
 * @returns {{description: string|null, paramDocs: Record<string, string>}}
 */
export function parseKdocSections(kdoc) {
  if (!kdoc) return { description: null, paramDocs: {} };
  const descLines = [];
  const paramDocs = {};
  let currentParam = null; // @param currently accepting continuation lines
  let pastFirstTag = false;
  for (const line of kdoc.split("\n")) {
    const tag = line.match(/^@(\w+)(?:\s+(.*))?$/);
    if (tag) {
      pastFirstTag = true;
      currentParam = null;
      if (tag[1] === "param") {
        const m = (tag[2] || "").match(/^\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s*(.*)$/);
        if (m) {
          currentParam = m[1];
          paramDocs[currentParam] = m[2] || "";
        }
      }
      continue;
    }
    if (currentParam !== null) {
      paramDocs[currentParam] = `${paramDocs[currentParam]} ${line.trim()}`.trim();
    } else if (!pastFirstTag) {
      descLines.push(line);
    }
    // A plain line after a non-param tag is that tag's continuation — it
    // belongs to a tag this scan doesn't render, so it is dropped with it.
  }
  const description = descLines.join("\n").trim() || null;
  return { description, paramDocs };
}

// How far past an `@Composable` occurrence to look for the `fun Name(` that
// annotation governs — other annotations (@Preview, etc.) may sit between,
// but this bounds the search so an @Composable near the end of a file
// doesn't accidentally match a `fun` belonging to an unrelated later
// declaration.
const FUN_SEARCH_WINDOW = 500;

// How far past a signature's closing paren to look for the function body's
// opening brace (skipping a return-type annotation, if any). A composable
// this far past its params with no `{` is treated as having no resolvable
// body (e.g. an expression body, or scan text that doesn't actually compile)
// — facts are then reported as empty rather than scanned from the wrong span.
const BODY_SEARCH_WINDOW = 300;

/**
 * The function body text `{ ... }` starting after a signature's closing
 * paren at `afterIdx`, via brace-depth matching. Returns null (never a
 * guess) when no `{` is found within BODY_SEARCH_WINDOW, or the braces never
 * balance before EOF.
 */
function findFunctionBody(text, afterIdx) {
  const searchEnd = Math.min(text.length, afterIdx + BODY_SEARCH_WINDOW);
  let i = afterIdx;
  while (i < searchEnd && text[i] !== "{") i++;
  if (i >= searchEnd || text[i] !== "{") return null;
  let depth = 0;
  const start = i;
  for (; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const TOKEN_REF_RE = /\b(\w*(?:Tokens|Colors))\.(\w+)/g;

/**
 * Derive the component's "state contract" facts from ITS OWN body text —
 * never the whole file (a file can hold more than one @Composable, e.g.
 * `AppButtonDefaults`'s two buttons, or `ContentStateDefaults`'s
 * `ListSkeleton`/`Spinner` living beside the `ContentStateContainer` — facts
 * scoped per-body keep those from bleeding into each other). Every fact is
 * POSITIVE evidence only (a regex match found in the text) — this function
 * never asserts an absence; an empty array/false means "not found", not
 * "does not exist", and renderers must treat it as silence, not a claim.
 * @param {string} bodyText the composable's own `{ ... }` body, or "" when
 *   findFunctionBody couldn't resolve one (honest degrade — no facts, not a guess)
 * @returns {{derivedTags: string[], a11yFloorEvidence: string[], contentUiStateArms: string[], insetsApis: string[], tokensReferenced: string[], selfReportsDesignToken: boolean}}
 */
function deriveFacts(bodyText) {
  const derivedTags = [...new Set([...bodyText.matchAll(/\$\{screenTag\}_([A-Za-z0-9]+)/g)].map((m) => m[1]))].sort();
  const a11yFloorEvidence = [];
  if (/\b48\.dp\b/.test(bodyText)) a11yFloorEvidence.push("48.dp");
  if (/\bMinTouchTarget\b/.test(bodyText)) a11yFloorEvidence.push("MinTouchTarget");
  const contentUiStateArms = [...new Set([...bodyText.matchAll(/\bis ContentUiState\.(\w+)\b/g)].map((m) => m[1]))];
  const insetsApis = ["statusBarsPadding", "navigationBarsPadding", "consumeWindowInsets", "WindowInsets"].filter(
    (api) => new RegExp(`\\b${api}\\b`).test(bodyText),
  );
  const tokensReferenced = [...new Set([...bodyText.matchAll(TOKEN_REF_RE)].map((m) => `${m[1]}.${m[2]}`))].sort();
  const selfReportsDesignToken = /\.designToken\(/.test(bodyText);
  return { derivedTags, a11yFloorEvidence, contentUiStateArms, insetsApis, tokensReferenced, selfReportsDesignToken };
}

/**
 * Scan one file's text for `@Composable fun Name(...)` signatures, plus per-
 * signature KDoc, parsed params, and body-scoped facts (deriveFacts).
 * @returns {Array<{name: string, params: string[], paramsParsed: Array<{raw:string,name:string,type:string|null,default:string|null}>, parseError?: boolean, kdoc: string|null, facts: object}>}
 */
function scanComposables(text) {
  const out = [];
  const composableRe = /@Composable\b/g;
  let m;
  while ((m = composableRe.exec(text))) {
    const window = text.slice(m.index, m.index + FUN_SEARCH_WINDOW);
    // Kotlin allows the type-param list EITHER before the name (`fun <T> Foo(`
    // — how the real ContentStateContainer<T> is declared) OR after it
    // (`fun Foo<T>(`, rarer for composables but scanned too) — both are
    // matched so a generic component is never silently dropped from the
    // registry the console renders.
    const funMatch = window.match(/fun\s+(?:<[^>]*>\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/);
    if (!funMatch) continue; // no `fun Name(` within the window — not a composable function decl
    const name = funMatch[1];
    const kdoc = extractKdocBefore(text, m.index);
    const openIdx = m.index + funMatch.index + funMatch[0].length - 1; // index of the '('
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    const { description: kdocDescription, paramDocs } = parseKdocSections(kdoc);
    if (closeIdx === -1) {
      out.push({
        name,
        params: [],
        paramsParsed: [],
        parseError: true,
        kdoc,
        kdocDescription,
        paramDocs,
        facts: deriveFacts(""),
      });
      continue;
    }
    const rawParams = splitTopLevel(text.slice(openIdx + 1, closeIdx));
    const body = findFunctionBody(text, closeIdx + 1);
    out.push({
      name,
      params: rawParams,
      paramsParsed: rawParams.map(parseParam),
      kdoc,
      kdocDescription,
      paramDocs,
      facts: deriveFacts(body ?? ""),
    });
  }
  return out;
}

const SCREEN_FILE_RE = /Screen\.kt$/;

/**
 * Scan `presentation/components/*.kt` (direct children only, not recursive —
 * that's the registry surface per §7.2) for @Composable signatures, then find
 * each one's call sites (`Name(`) anywhere else under presentation/**.
 * @param {string} root project root
 * @returns {{available: false, reason: string} | {available: true, components: Array<{name: string, file: string, params: string[], paramsParsed: object[], parseError: boolean, kdoc: string|null, facts: object, usedIn: string[], usedInScreens: string[]}>}}
 */
export function getComponentsData(root) {
  const kotlinRoot = path.join(root, "composeApp", "src", "commonMain", "kotlin");
  const presentationDirs = findPresentationDirs(kotlinRoot);
  if (presentationDirs.length === 0) {
    return {
      available: false,
      reason: `no 'presentation' directory found under ${path.relative(root, kotlinRoot).split(path.sep).join("/")}`,
    };
  }
  const componentsDirs = presentationDirs.map((p) => path.join(p, "components")).filter((p) => fs.existsSync(p));
  if (componentsDirs.length === 0) {
    return { available: false, reason: "no presentation/components directory found" };
  }
  const componentFiles = componentsDirs.flatMap((dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".kt"))
      .map((e) => path.join(dir, e.name)),
  );
  if (componentFiles.length === 0) {
    return { available: true, components: [] };
  }

  // Call sites are searched across ALL presentation/** files (every dir found).
  const allPresentationFiles = presentationDirs.flatMap(walkKtFiles);
  const fileTexts = new Map(allPresentationFiles.map((f) => [f, fs.readFileSync(f, "utf8")]));

  const components = [];
  for (const file of componentFiles) {
    const text = fileTexts.get(file) ?? fs.readFileSync(file, "utf8");
    const relFile = path.relative(root, file).split(path.sep).join("/");
    for (const sig of scanComposables(text)) {
      const callRe = new RegExp(`\\b${sig.name}\\s*\\(`);
      const usedIn = [];
      for (const [otherFile, otherText] of fileTexts) {
        if (otherFile === file) continue;
        if (callRe.test(otherText)) usedIn.push(path.relative(root, otherFile).split(path.sep).join("/"));
      }
      usedIn.sort((a, b) => a.localeCompare(b));
      components.push({
        name: sig.name,
        file: relFile,
        params: sig.params,
        paramsParsed: sig.paramsParsed,
        parseError: sig.parseError === true,
        kdoc: sig.kdoc,
        kdocDescription: sig.kdocDescription,
        paramDocs: sig.paramDocs,
        facts: sig.facts,
        usedIn,
        usedInScreens: usedIn.filter((f) => SCREEN_FILE_RE.test(f)),
      });
    }
  }
  components.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
  return { available: true, components };
}
