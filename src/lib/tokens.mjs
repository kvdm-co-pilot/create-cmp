// Token derivation + replacement for file CONTENTS and PATHS.
//
// Per CONTRACT.md, the engine replaces these placeholder tokens:
//   __APP_NAME__ · __PACKAGE__ · __PACKAGE_PATH__ · __IOS_BUNDLE_ID__ · __REGION__ · __THEME_PREFIX__
//
// The replacement is applied to both the bytes of every text file and to path
// segments. Path replacement deliberately handles __PACKAGE_PATH__ even though
// the actual package-source directory rename (com/example/app → com/acme/app) is
// done separately by lib/rename.mjs against manifest.packageSourceRoots — see
// CONTRACT note that source dirs use the literal `com/example/app` segment.

/**
 * Build the ordered token map from an engine config object.
 * @param {object} config
 * @returns {Array<[string,string]>} ordered [token, value] pairs
 */
export function buildTokenMap(config) {
  const packagePath = config.package.replace(/\./g, "/");
  return [
    ["__APP_NAME__", config.appName],
    ["__PACKAGE_PATH__", packagePath],
    ["__PACKAGE__", config.package],
    ["__IOS_BUNDLE_ID__", config.iosBundleId],
    ["__REGION__", config.region],
    ["__THEME_PREFIX__", config.themePrefix],
  ];
}

/**
 * Slugify an app display name into a Gradle/npm-safe identifier.
 * Gradle's `rootProject.name` must match [a-zA-Z]([A-Za-z0-9\-_])* (no spaces);
 * npm package names must be lowercase with no spaces. We collapse runs of
 * non-[A-Za-z0-9] to a single dash, trim leading/trailing dashes, and guarantee
 * a leading letter. e.g. "Demo App" -> "Demo-App", "42 Things!" -> "x42-Things".
 * @param {string} name
 * @returns {string}
 */
export function slugifyAppName(name) {
  let slug = String(name)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") slug = "app";
  if (!/^[A-Za-z]/.test(slug)) slug = `x${slug}`;
  return slug;
}

/**
 * Replace every token occurrence in a string.
 * Tokens are literal (`__FOO__`) so a global string split/join is safe and
 * avoids regex-escaping pitfalls. Order matters only when one token is a
 * substring of another; our tokens are disjoint, but we still apply in the
 * given order for determinism.
 * @param {string} input
 * @param {Array<[string,string]>} tokenMap
 * @returns {string}
 */
export function replaceTokens(input, tokenMap) {
  let out = input;
  for (const [token, value] of tokenMap) {
    if (out.includes(token)) {
      out = out.split(token).join(value);
    }
  }
  return out;
}

/**
 * Replace tokens within a single path string. Identical to replaceTokens but
 * named for intent + future divergence (e.g. OS path separators).
 * @param {string} p
 * @param {Array<[string,string]>} tokenMap
 * @returns {string}
 */
export function replacePathTokens(p, tokenMap) {
  return replaceTokens(p, tokenMap);
}

// Heuristic: skip binary files when doing content replacement.
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".icns",
  ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ".jar", ".keystore", ".jks", ".so", ".dylib", ".a", ".zip",
  ".class", ".bin", ".pdf", ".aar",
]);

/**
 * @param {string} filename
 * @returns {boolean} true if the file should be treated as binary (skip content replace)
 */
export function isBinaryPath(filename) {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return false;
  return BINARY_EXTENSIONS.has(lower.slice(dot));
}
