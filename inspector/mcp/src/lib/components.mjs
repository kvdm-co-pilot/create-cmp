// components.mjs — Design System tab's Components section (VERIFICATION-LAYER-
// DESIGN.md §7.2): a static Node-side scan of presentation/components/*.kt for
// `@Composable fun` signatures — "structural truth, not screenshots" (isolated
// component preview rendering is explicitly deferred). For each component:
// name, file, parameter list, and a used-in list (call sites `Name(` found
// anywhere else under presentation/**).
//
// Parsing is a pragmatic scan, not a Kotlin compiler front-end: multiline
// parameter lists and default values (which may themselves contain parens,
// e.g. `= Modifier.padding(8.dp)`) are handled by paren-depth tracking. A
// signature this can't cleanly bound (unbalanced parens before EOF) is
// reported HONESTLY — name + file, parseError:true — rather than guessed at.

import fs from "node:fs";
import path from "node:path";

/** Every `.kt` file under `dir` (recursive), as absolute paths. */
function walkKtFiles(dir) {
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

/** Every directory named exactly `presentation` under `kotlinRoot` (normally exactly one). */
function findPresentationDirs(kotlinRoot) {
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

// How far past an `@Composable` occurrence to look for the `fun Name(` that
// annotation governs — other annotations (@Preview, etc.) may sit between,
// but this bounds the search so an @Composable near the end of a file
// doesn't accidentally match a `fun` belonging to an unrelated later
// declaration.
const FUN_SEARCH_WINDOW = 500;

/**
 * Scan one file's text for `@Composable fun Name(...)` signatures.
 * @returns {Array<{name: string, params: string[], parseError?: boolean}>}
 */
function scanComposables(text) {
  const out = [];
  const composableRe = /@Composable\b/g;
  let m;
  while ((m = composableRe.exec(text))) {
    const window = text.slice(m.index, m.index + FUN_SEARCH_WINDOW);
    const funMatch = window.match(/fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/);
    if (!funMatch) continue; // no `fun Name(` within the window — not a composable function decl
    const name = funMatch[1];
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
    if (closeIdx === -1) {
      out.push({ name, params: [], parseError: true });
      continue;
    }
    out.push({ name, params: splitTopLevel(text.slice(openIdx + 1, closeIdx)) });
  }
  return out;
}

/**
 * Scan `presentation/components/*.kt` (direct children only, not recursive —
 * that's the registry surface per §7.2) for @Composable signatures, then find
 * each one's call sites (`Name(`) anywhere else under presentation/**.
 * @param {string} root project root
 * @returns {{available: false, reason: string} | {available: true, components: Array<{name: string, file: string, params: string[], parseError: boolean, usedIn: string[]}>}}
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
      components.push({
        name: sig.name,
        file: relFile,
        params: sig.params,
        parseError: sig.parseError === true,
        usedIn: usedIn.sort((a, b) => a.localeCompare(b)),
      });
    }
  }
  components.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
  return { available: true, components };
}
