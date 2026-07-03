// Pure selection logic for `create-cmp clean`. The command layer does the
// listing/sizing/deleting; this module decides WHAT is safe to remove, so the
// policy is unit-testable against fake directory listings.
//
// Policy (deliberately conservative):
//   - ~/.konan: only "clearly stale" entries — kotlin-native toolchain dirs
//     whose trailing version does NOT match the project's kotlin version.
//     Shared dirs (dependencies/, cache/, kotlin-native-prebuilt-<current>)
//     are never selected. No known project kotlin version → nothing is stale.
//   - project: only `build/` dirs that sit next to a build.gradle(.kts) (i.e.
//     real Gradle module outputs) plus the root `.gradle/` dir.
//   - ~/.gradle/caches: REPORT ONLY, never auto-deleted.

/** kotlin-native toolchain dir with a trailing version, e.g.
 *  kotlin-native-prebuilt-macos-aarch64-2.1.20 */
const KONAN_TOOLCHAIN_RE = /^kotlin-native(?:-prebuilt)?(?:-[a-z0-9_]+)*?-(\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.]+)?)$/;

/**
 * Which ~/.konan entries are clearly stale?
 * @param {string[]} entries directory names inside ~/.konan
 * @param {string|null|undefined} projectKotlinVersion the project's kotlin version
 * @returns {{stale:string[], kept:Array<{name:string, reason:string}>}}
 */
export function selectStaleKonan(entries, projectKotlinVersion) {
  const stale = [];
  const kept = [];
  for (const name of entries) {
    const m = name.match(KONAN_TOOLCHAIN_RE);
    if (!m) {
      kept.push({ name, reason: "not a versioned kotlin-native toolchain dir (shared cache — never touched)" });
      continue;
    }
    if (!projectKotlinVersion) {
      kept.push({ name, reason: "project kotlin version unknown — cannot prove staleness" });
      continue;
    }
    if (m[1] === projectKotlinVersion) {
      kept.push({ name, reason: `matches the project's kotlin ${projectKotlinVersion}` });
    } else {
      stale.push(name);
    }
  }
  return { stale, kept };
}

/**
 * Which project-relative paths are safe Gradle outputs to delete?
 * @param {object} input
 * @param {string[]} input.dirs   ALL directory paths in the project, RELATIVE with "/" separators
 * @param {string[]} input.files  ALL file paths in the project, RELATIVE with "/" separators
 * @returns {string[]} relative dir paths safe to delete (root `.gradle` + module `build` dirs)
 */
export function selectProjectCleanDirs({ dirs, files }) {
  const fileSet = new Set(files);
  const out = [];
  for (const dir of dirs) {
    if (dir === ".gradle") {
      out.push(dir);
      continue;
    }
    const segments = dir.split("/");
    if (segments[segments.length - 1] !== "build") continue;
    // Never reach inside another build dir or hidden/vendored trees.
    if (segments.slice(0, -1).some((s) => s === "build" || s === "node_modules" || s.startsWith("."))) continue;
    const parent = segments.slice(0, -1).join("/");
    const sibling = (name) => (parent ? `${parent}/${name}` : name);
    if (fileSet.has(sibling("build.gradle.kts")) || fileSet.has(sibling("build.gradle")) || fileSet.has(sibling("settings.gradle.kts")) || fileSet.has(sibling("settings.gradle"))) {
      out.push(dir);
    }
  }
  return out;
}
