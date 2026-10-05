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
//     real Gradle module outputs) plus the root `.gradle/` dir — EXCEPT a
//     `build/create-cmp-upgrade/` that holds a `*.cmp-new` (an unresolved
//     upgrade conflict, KD-286): that directory stays, the rest of its
//     `build/` goes.
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

/** Where an upgrade run writes its backups and build-read sidecars (src/lib/upgrade.mjs UPGRADE_RUNS_DIR, under a build/). */
export const UPGRADE_RUNS_CHILD = "create-cmp-upgrade";

/**
 * Keep every unresolved upgrade conflict out of a clean (KD-286). A build dir
 * whose `create-cmp-upgrade/` holds any `*.cmp-new` is not deleted whole: its
 * other children are, and `<dir>/create-cmp-upgrade` is kept and named.
 * @param {string[]} cleanDirs  from selectProjectCleanDirs (relative, "/" separators)
 * @param {object} probe
 * @param {(dir: string) => string[]} probe.conflictsUnder  `*.cmp-new` paths under `<dir>/create-cmp-upgrade/` (relative)
 * @param {(dir: string) => string[]} probe.childrenOf      entry names directly inside `<dir>`
 * @returns {{remove: string[], kept: Array<{path: string, conflicts: string[]}>}}
 */
export function keepUnresolvedUpgradeConflicts(cleanDirs, { conflictsUnder, childrenOf }) {
  const remove = [];
  const kept = [];
  for (const dir of cleanDirs) {
    const conflicts = dir === ".gradle" ? [] : conflictsUnder(dir);
    if (conflicts.length === 0) {
      remove.push(dir);
      continue;
    }
    for (const name of childrenOf(dir)) if (name !== UPGRADE_RUNS_CHILD) remove.push(`${dir}/${name}`);
    kept.push({ path: `${dir}/${UPGRADE_RUNS_CHILD}`, conflicts });
  }
  return { remove, kept };
}
