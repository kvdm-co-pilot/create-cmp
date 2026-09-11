// A tiny, dependency-free reader of this repo's own .mjs source — enough of a
// scanner to ask structural questions about code, and no more.
//
// WHY IT EXISTS. Some defects are invisible to every test the code can carry,
// because JavaScript does not report them: pass `{ intended: x }` to a function
// that destructures `{ declared }` and nothing throws, nothing warns, the value
// is dropped, and the call site reads exactly like a working one. A test of the
// CALLEE cannot see it — the callee is correct. A test of the CALLER usually
// cannot see it either, because the caller's observable behaviour is "the
// option had no effect", which is also what "the option was not needed" looks
// like. The only place the defect is visible is the pair, and the only cheap way
// to see every pair is to read the source.
//
// This repo has no parser dependency and should not grow one for a lint, so
// this is a masker plus a bracket matcher: comments, strings, template text and
// regex literals are replaced by spaces (offsets preserved, so line numbers
// stay true), and what remains is structural enough to find a call's arguments.
//
// IT JUDGES LESS THAN IT SEES, DELIBERATELY. Only `function name(...)`
// declarations are read as signatures — not arrow consts, not methods, not
// re-exported barrels — and a call is judged only when the name resolves to a
// signature the calling file can actually see (defined in the same file, or
// imported from the file that defines it). Anything ambiguous is skipped
// rather than guessed. A scanner that judges less is a scanner people keep; a
// scanner that judges wrong is deleted the first time it is wrong.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Comments, string bodies, template text and regex literals replaced by spaces.
 * Offsets and newlines are preserved, so an index into the result indexes the
 * original. Template EXPRESSIONS (`${...}`) stay live: they are code.
 *
 * @param {string} src
 * @returns {string}
 */
export function maskSource(src) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k += 1) if (out[k] !== "\n") out[k] = " ";
  };
  /** @type {Array<{kind: "template"|"expr", depth: number}>} */
  const stack = [];
  let i = 0;
  let prev = "";
  while (i < n) {
    const top = stack[stack.length - 1];
    const c = src[i];
    if (top && top.kind === "template") {
      if (c === "\\") {
        blank(i, i + 2);
        i += 2;
        continue;
      }
      if (c === "$" && src[i + 1] === "{") {
        stack.push({ kind: "expr", depth: 1 });
        i += 2;
        prev = "{";
        continue;
      }
      if (c === "`") {
        stack.pop();
        i += 1;
        prev = "`";
        continue;
      }
      blank(i, i + 1);
      i += 1;
      continue;
    }
    // code (top-level, or inside a template expression)
    if (c === "/" && src[i + 1] === "/") {
      let j = src.indexOf("\n", i);
      if (j === -1) j = n;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") j += 1;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
      prev = c;
      continue;
    }
    if (c === "`") {
      stack.push({ kind: "template", depth: 0 });
      i += 1;
      continue;
    }
    if (c === "/" && /[(,=:[!&|?{};+\n]/.test(prev)) {
      // A regex literal: `/^\/\/ /` is real code in this tree, and its slashes
      // would otherwise read as a comment.
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const e = src[j];
        if (e === "\\") {
          j += 2;
          continue;
        }
        if (e === "[") inClass = true;
        else if (e === "]") inClass = false;
        else if (e === "\n") break;
        else if (e === "/" && !inClass) break;
        j += 1;
      }
      blank(i, Math.min(j + 1, n));
      i = j + 1;
      prev = "/";
      continue;
    }
    if (top && top.kind === "expr") {
      if (c === "{") top.depth += 1;
      else if (c === "}") {
        top.depth -= 1;
        if (top.depth === 0) {
          stack.pop();
          i += 1;
          prev = "}";
          continue;
        }
      }
    }
    if (!/\s/.test(c)) prev = c;
    i += 1;
  }
  return out.join("");
}

/** The index of the bracket closing the one at `start`, or -1. */
export function matchBracket(text, start) {
  const open = text[start];
  const close = { "(": ")", "[": "]", "{": "}" }[open];
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split a masked bracket body on its top-level commas. */
export function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(body.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(body.slice(last));
  return parts;
}

/**
 * The top-level keys of an object literal or destructuring pattern body.
 * `unknown` is true when something in it cannot be read as a plain key — a
 * spread, a computed key, a string key the masker blanked — which is the signal
 * to judge nothing about that object at all.
 */
export function objectKeys(body) {
  const keys = [];
  let unknown = false;
  for (const raw of splitTopLevel(body)) {
    const part = raw.trim();
    if (!part) continue;
    if (part.startsWith("...")) {
      unknown = true;
      continue;
    }
    const m = /^([A-Za-z_$][\w$]*)\s*(:|=|$)/.exec(part);
    if (m) keys.push(m[1]);
    else unknown = true;
  }
  return { keys, unknown };
}

/** Every `function name(...)` in a masked source, with its object-parameter shape. */
export function signaturesIn(masked) {
  /** @type {Map<string, {index: number, keys: Set<string>, unknown: boolean}|null>} */
  const found = new Map();
  // Lookbehind, not a consumed character: `indent(explain(` has to yield BOTH
  // calls, and a leading group swallows the `(` the second one needs.
  const re = /(?<![\w$.])(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let hit;
  while ((hit = re.exec(masked))) {
    const name = hit[1];
    const open = masked.indexOf("(", hit.index + hit[0].length - 1);
    const close = matchBracket(masked, open);
    if (close === -1) continue;
    const params = splitTopLevel(masked.slice(open + 1, close));
    let sig = null;
    params.forEach((p, index) => {
      const t = p.trim();
      if (!t.startsWith("{")) return;
      const end = matchBracket(t, 0);
      if (end === -1) return;
      const { keys, unknown } = objectKeys(t.slice(1, end));
      sig = { index, keys: new Set(keys), unknown };
    });
    // Two definitions of one name in one file: judge neither.
    found.set(name, found.has(name) ? null : sig);
  }
  return found;
}

/**
 * name → absolute path of the module it was imported from (relative specifiers
 * only). Reads the RAW source with comments removed, not the masked one: masking
 * blanks string bodies, and a module specifier IS a string body — scanning the
 * masked copy finds every import statement and learns the path of none of them.
 */
export function namedImports(raw, fileAbs) {
  const out = new Map();
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const re = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let hit;
  while ((hit = re.exec(noComments))) {
    const spec = hit[2];
    if (!spec.startsWith(".")) continue;
    const abs = path.resolve(path.dirname(fileAbs), spec);
    for (const raw of hit[1].split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(part);
      if (!m) continue;
      out.set(m[2] ?? m[1], { exported: m[1], from: abs });
    }
  }
  return out;
}

/**
 * Every tracked `.mjs` file keyed by absolute path, as `{rel, raw, masked}` —
 * both forms, because the two questions need different ones: structure is read
 * off the masked copy, and a module specifier is a string body the masking
 * blanks, so imports are read off the raw one.
 * Tracked, not walked: an orphaned worktree or an untracked scratch copy under
 * the tree is not this repo's source and must not be able to fail its lints.
 *
 * @param {string} root repo root
 * @param {(rel: string) => boolean} [skip]
 */
export function trackedSources(root, skip = () => false) {
  const rels = execFileSync("git", ["ls-files", "*.mjs"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const out = new Map();
  for (const rel of rels) {
    if (skip(rel)) continue;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const raw = fs.readFileSync(abs, "utf8");
    out.set(abs, { rel, raw, masked: maskSource(raw) });
  }
  return out;
}

/** The 1-based line of an offset in a source. */
export function lineOf(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

/**
 * Every call site that hands a function an options key that function does not
 * destructure — the whole point of the file.
 *
 * @param {Map<string, {rel: string, raw: string, masked: string}>} sources
 *   as returned by `trackedSources`
 * @returns {{rel: string, line: number, callee: string, ignored: string[], accepted: string[], definedIn: string}[]}
 */
export function ignoredOptionKeys(sources) {
  const sigsByFile = new Map();
  for (const [abs, { masked }] of sources) sigsByFile.set(abs, signaturesIn(masked));

  const resolve = (abs, name, imports) => {
    const own = sigsByFile.get(abs);
    if (own?.has(name)) return own.get(name) ? { sig: own.get(name), definedIn: sources.get(abs).rel } : null;
    const imported = imports.get(name);
    if (!imported) return null;
    const target = sigsByFile.get(imported.from);
    const sig = target?.get(imported.exported);
    return sig ? { sig, definedIn: sources.get(imported.from).rel } : null;
  };

/**
 * The object literals an argument expression can actually HAND OVER.
 *
 * `f({ a: 1 })` is one of them. `f(cond ? { a: 1 } : {})` is two, and whichever
 * branch is taken hands its keys to `f`, so both are judged.
 *
 * Requiring the whole argument to BE an object literal missed every conditional
 * form — and missed them SILENTLY, which is the worse half: a call the scanner
 * cannot see is a call it reports as clean. Measured 2026-09-11: renaming
 * `explain`'s option key turned two stale call sites red and left a third green,
 * and the third was `explain(path, held ? { declared: held } : {})` — the call
 * this helper's own header uses as its worked example.
 */
function optionLiterals(arg) {
  const out = [];
  // A stack of the groups we are inside, each marked OPAQUE or not. Opaque means
  // "whatever is in here is being handed to something that is not our callee":
  // the parentheses of a nested call, an arrow's body, an array literal. The
  // distinction is decidable from the character before the `(` — a CALL's paren
  // follows an identifier or a `)`, a GROUPING paren follows nothing or an
  // operator, and `=>` follows neither rule and is opaque by its own right.
  //
  // Both directions are gated by a test and they pull opposite ways:
  // `f(({ k }))` must be judged, `f(g({ k }))` must not. Counting bracket depth
  // alone cannot tell them apart, and getting it wrong in THIS direction is the
  // fatal one — this file's header says a scanner that judges wrong is deleted
  // the first time it is wrong, and a false positive reddens the suite while
  // pointing at correct code.
  const groups = [];
  const inOpaque = () => groups.some(Boolean);
  const OPERATOR = /[?:|&,]$/;
  for (let i = 0; i < arg.length; i += 1) {
    const c = arg[i];
    if (c === "(") {
      const before = arg.slice(0, i).trimEnd();
      groups.push(!(before === "" || OPERATOR.test(before)));
      continue;
    }
    if (c === "[") { groups.push(true); continue; }
    if (c === ")" || c === "]") { groups.pop(); continue; }
    if (c !== "{") continue;
    const close = matchBracket(arg, i);
    if (close === -1) continue;
    const before = arg.slice(0, i).trimEnd();
    // Expression position, and not inside anything opaque. A `{` after anything
    // else is an arrow body or a property value, not a thing handed over.
    if (!inOpaque() && (before === "" || before.endsWith("(") || OPERATOR.test(before))) {
      out.push(arg.slice(i, close + 1));
    }
    i = close;
  }
  return out;
}


  const findings = [];
  for (const [abs, { rel, raw, masked }] of sources) {
    const imports = namedImports(raw, abs);
    const re = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
    let hit;
    while ((hit = re.exec(masked))) {
      const name = hit[1];
      const before = masked.slice(Math.max(0, hit.index - 24), hit.index);
      if (/\b(function|class|catch|if|for|while|switch|new)\s+$/.test(before)) continue;
      const resolved = resolve(abs, name, imports);
      if (!resolved || resolved.sig.unknown) continue;
      const open = hit.index + hit[0].length - 1;
      const close = matchBracket(masked, open);
      if (close === -1) continue;
      const args = splitTopLevel(masked.slice(open + 1, close));
      const arg = (args[resolved.sig.index] ?? "").trim();
      // A spread in the ARGUMENT is not a reason to look away. `f({ ...opts,
      // intent })` can only ever ADD keys to what `opts` carries, so a key
      // written out here that the signature does not name is dropped whatever
      // the spread holds — and this is the exact shape the defect took in a test
      // that believed it was varying the thing it varied.
      const written = optionLiterals(arg).flatMap((lit) => objectKeys(lit.slice(1, -1)).keys);
      const ignored = [...new Set(written)].filter((k) => !resolved.sig.keys.has(k));
      if (ignored.length) {
        findings.push({
          rel,
          line: lineOf(masked, hit.index),
          callee: name,
          ignored,
          accepted: [...resolved.sig.keys],
          definedIn: resolved.definedIn,
        });
      }
    }
  }
  return findings;
}
