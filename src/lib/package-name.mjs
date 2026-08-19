// Semantic validation for the `package` option, beyond what the JSON-schema
// pattern in options.schema.json can express.
//
// The pattern already enforces the SHAPE of a reverse-DNS id (lowercase start,
// at least two segments, no digit-leading segments). What it cannot encode is
// that every segment also has to be a legal *Java identifier*: the value
// becomes the Android namespace and the Kotlin package, and AGP rejects a
// reserved word outright —
//
//   Namespace 'com.final.proof' is not a valid Java package name as 'final'
//   is a Java keyword
//
// Observed for real: `--package com.final.proof` was accepted, stamped a full
// project, and only failed at the first Gradle configure — late, and as a raw
// Gradle stack rather than an input error. Refuse it at the door instead, and
// name the offending segment.

// Java SE reserved words (JLS §3.9), plus the three reserved literals and the
// lone underscore (reserved since Java 9). `var`/`yield`/`record`/`sealed` and
// friends are contextual, not reserved — they are legal package segments, so
// they are deliberately absent.
export const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while",
  // reserved literals
  "true", "false", "null",
  // reserved identifier (Java 9+)
  "_",
]);

/**
 * Segments of `pkg` that cannot be Java identifiers.
 * @param {string} pkg
 * @returns {string[]} offending segments, in source order (may repeat)
 */
export function reservedSegments(pkg) {
  if (typeof pkg !== "string" || pkg.length === 0) return [];
  return pkg.split(".").filter((seg) => JAVA_KEYWORDS.has(seg));
}

/**
 * Validate the package id's segments. Same error shape as schema.mjs's
 * validate(), so callers can merge the two lists and format them together.
 * @param {string} pkg
 * @param {string} [path] error path label
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
export function validatePackageName(pkg, path = "package") {
  const bad = reservedSegments(pkg);
  if (bad.length === 0) return { valid: true, errors: [] };
  const uniq = [...new Set(bad)];
  const which = uniq.map((s) => `'${s}'`).join(", ");
  const lead = uniq.length > 1
    ? `segments ${which} are Java keywords and cannot be package segments`
    : `segment ${which} is a Java keyword and cannot be a package segment`;
  return {
    valid: false,
    errors: [
      {
        path,
        message:
          `${lead} — Gradle will refuse the namespace. Rename it ` +
          `(e.g. com.final.proof \u2192 com.finalproof).`,
      },
    ],
  };
}
