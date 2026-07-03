// Tolerant, line-based reader/writer for TOML *sections* as used by Gradle
// version catalogs (gradle/libs.versions.toml).
//
// This is deliberately NOT a general TOML parser — the dependency ethos of this
// CLI is "prompts + picocolors, nothing else". It handles exactly what a
// version catalog's `[versions]` table contains: `key = "value"` string entries
// with comments and blank lines, and it can rewrite values SURGICALLY (only the
// quoted value on the matched line changes; every other byte of the file —
// comments, spacing, ordering, line endings — is preserved).

/** Matches `key = "value"` (or 'value') with optional whitespace. */
const ENTRY_RE = /^(\s*)([A-Za-z0-9_][A-Za-z0-9_.-]*)(\s*=\s*)(["'])([^"']*)\4/;

/**
 * Split content on "\n" ONLY, so any "\r" stays attached to its line and a
 * join("\n") reproduces the input byte-for-byte.
 */
function splitLines(content) {
  return content.split("\n");
}

/**
 * Parse one `[section]` table out of a TOML document.
 * @param {string} content
 * @param {string} section e.g. "versions"
 * @returns {Map<string, {value:string, line:number, quote:string}>}
 *   Ordered map of key → { value, line index (0-based), quote char }.
 */
export function parseTomlSection(content, section) {
  const lines = splitLines(content);
  const entries = new Map();
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("[")) {
      inSection = trimmed.replace(/\r$/, "") === `[${section}]`;
      continue;
    }
    if (!inSection || !trimmed || trimmed.startsWith("#")) continue;
    const m = lines[i].match(ENTRY_RE);
    if (!m) continue; // tolerate inline tables / anything exotic: skip, don't throw
    entries.set(m[2], { value: m[5], line: i, quote: m[4] });
  }
  return entries;
}

/**
 * Parse the `[versions]` table of a libs.versions.toml.
 * @param {string} content
 * @returns {Map<string, {value:string, line:number, quote:string}>}
 */
export function parseVersions(content) {
  return parseTomlSection(content, "versions");
}

/**
 * Surgically rewrite values in one section. Only the quoted value on each
 * matched line is replaced; all other bytes (including trailing comments on
 * the same line) are untouched.
 * @param {string} content
 * @param {string} section
 * @param {Record<string,string>} changes key → new value
 * @returns {{content:string, applied:string[], missing:string[]}}
 */
export function updateTomlValues(content, section, changes) {
  const entries = parseTomlSection(content, section);
  const lines = splitLines(content);
  const applied = [];
  const missing = [];
  for (const [key, newValue] of Object.entries(changes)) {
    const e = entries.get(key);
    if (!e) {
      missing.push(key);
      continue;
    }
    const line = lines[e.line];
    const m = line.match(ENTRY_RE);
    if (!m) {
      missing.push(key);
      continue;
    }
    const before = m[1] + m[2] + m[3] + m[4];
    const rest = line.slice(m[0].length); // closing-quote onward is inside m[0]; rest = after value's closing quote
    lines[e.line] = `${before}${newValue}${m[4]}${rest}`;
    applied.push(key);
  }
  return { content: lines.join("\n"), applied, missing };
}

/**
 * Read a `key=value` java-properties-style file into an ordered map (used for
 * gradle.properties / gradle-wrapper.properties / local.properties).
 * Escaped chars in values are left as-is (raw text).
 * @param {string} content
 * @returns {Map<string, {value:string, line:number}>}
 */
export function parseProperties(content) {
  const lines = splitLines(content);
  const entries = new Map();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/\r$/, "");
    entries.set(key, { value, line: i });
  }
  return entries;
}

/**
 * Set (replace or append) one key in a properties file, preserving every other
 * line byte-for-byte.
 * @param {string} content
 * @param {string} key
 * @param {string} value raw value text (caller escapes if needed)
 * @returns {{content:string, changed:boolean, previous:string|null}}
 */
export function upsertProperty(content, key, value) {
  const entries = parseProperties(content);
  const lines = splitLines(content);
  const existing = entries.get(key);
  if (existing) {
    if (existing.value === value) {
      return { content, changed: false, previous: existing.value };
    }
    const hadCr = lines[existing.line].endsWith("\r");
    lines[existing.line] = `${key}=${value}${hadCr ? "\r" : ""}`;
    return { content: lines.join("\n"), changed: true, previous: existing.value };
  }
  // Append, keeping a single trailing newline.
  let out = content;
  if (out.length > 0 && !out.endsWith("\n")) out += "\n";
  out += `${key}=${value}\n`;
  return { content: out, changed: true, previous: null };
}
