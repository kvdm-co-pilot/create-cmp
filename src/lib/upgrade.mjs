// Core logic for `create-cmp upgrade`: diff a project's [versions] table
// against a proven-green registry set, guard the kotlin↔ksp lockstep, and
// apply the changes SURGICALLY (line edits via lib/toml.mjs — formatting,
// comments, and unrelated lines are preserved byte-for-byte). Pure functions
// here; filesystem orchestration lives in src/commands/upgrade.mjs.

import { parseVersions, updateTomlValues, upsertProperty, parseProperties } from "./toml.mjs";

import { execFileSync } from "node:child_process";

/**
 * Suffix of the LEGACY backups engines before 0.28.10 wrote beside each file.
 * No backup is written with it any more (KD-284) — it names what healing removes.
 */
export const BACKUP_SUFFIX = ".bak-upgrade";

/** Suffix of the new engine content written for a conflicted file. */
export const SIDECAR_SUFFIX = ".cmp-new";

/**
 * Where every upgrade run's backups go: one directory per run under the
 * project's root `build/` — Gradle's output root, ignored by every stamp's
 * `.gitignore`, and never a source set. A backup beside its file put a
 * `<file>.bak-upgrade` inside Android `res/` directories, which the resource
 * merger rejects (KD-284).
 */
export const UPGRADE_RUNS_DIR = "build/create-cmp-upgrade";

/**
 * This run's directory: `build/create-cmp-upgrade/<ISO timestamp>` with `:`
 * and `.` made path-safe (`2026-10-05T10-00-00-000Z`). Project-root-relative.
 * @param {Date} [now]
 * @returns {string}
 */
export function upgradeRunDir(now = new Date()) {
  return `${UPGRADE_RUNS_DIR}/${now.toISOString().replace(/[:.]/g, "-")}`;
}

/**
 * Is this project-relative path inside an Android resource directory — a
 * `res/` segment somewhere under a `src/` segment (`composeApp/src/main/res/…`)?
 * Every file there must carry a resource extension, so nothing of ours may land
 * there.
 * @param {string} rel
 * @returns {boolean}
 */
export function isAndroidResPath(rel) {
  return /(^|\/)src\/(?:[^/]+\/)*res\//.test(rel.split("\\").join("/"));
}

/**
 * The ONE placement rule for what an upgrade writes besides the app's files.
 * Pure: project-root-relative in, project-root-relative out (POSIX separators).
 *
 *   backup   → `<runDir>/<rel>` always — never beside the file.
 *   sidecar  → `<rel>.cmp-new` beside the file (the human resolves it there),
 *              EXCEPT inside an Android `res/` directory, where it is
 *              `<runDir>/<rel>.cmp-new`.
 *
 * @param {string} rel     the app file's path, relative to the project root
 * @param {"backup"|"sidecar"} kind
 * @param {string} runDir  this run's directory, from upgradeRunDir()
 * @returns {string}
 */
export function upgradeArtifactPath(rel, kind, runDir) {
  const r = rel.split("\\").join("/");
  if (kind === "backup") return `${runDir}/${r}`;
  if (kind === "sidecar") return isAndroidResPath(r) ? `${runDir}/${r}${SIDECAR_SUFFIX}` : `${r}${SIDECAR_SUFFIX}`;
  throw new Error(`upgradeArtifactPath: unknown kind ${JSON.stringify(kind)} (backup | sidecar)`);
}

/** Marker comment the golden template ships in libs.versions.toml. */
const TEMPLATE_MARKER = "Frozen, CI-verified version set";

/** Was this catalog stamped by create-cmp? (Messaging only — never a refusal.) */
export function looksLikeOurTemplate(tomlContent) {
  return tomlContent.includes(TEMPLATE_MARKER);
}

/**
 * Diff a parsed [versions] table against a registry set.
 * @param {Map<string,{value:string}>} projectVersions from parseVersions()
 * @param {object} set registry set ({versions: {...}})
 * @returns {{changes:Array<{key,from,to}>, same:string[],
 *            unmanaged:Array<{key,value}>, notInProject:string[]}}
 *  - changes: keys the set pins to a different value (would be rewritten)
 *  - same: keys already at the set's value
 *  - unmanaged: keys in the project the set doesn't know — LEFT UNTOUCHED, warned
 *  - notInProject: set keys the project doesn't declare — nothing is added
 */
export function diffAgainstSet(projectVersions, set) {
  const changes = [];
  const same = [];
  const unmanaged = [];
  const notInProject = [];
  for (const [key, entry] of projectVersions) {
    if (Object.prototype.hasOwnProperty.call(set.versions, key)) {
      if (set.versions[key] !== entry.value) {
        changes.push({ key, from: entry.value, to: set.versions[key] });
      } else {
        same.push(key);
      }
    } else {
      unmanaged.push({ key, value: entry.value });
    }
  }
  for (const key of Object.keys(set.versions)) {
    if (!projectVersions.has(key)) notInProject.push(key);
  }
  return { changes, same, unmanaged, notInProject };
}

/**
 * The [versions] values the file WOULD contain after applying `changes`.
 * @param {Map<string,{value:string}>} projectVersions
 * @param {Array<{key,to}>} changes
 * @returns {Record<string,string>}
 */
export function resultingVersions(projectVersions, changes) {
  const out = {};
  for (const [key, entry] of projectVersions) out[key] = entry.value;
  for (const c of changes) out[c.key] = c.to;
  return out;
}

/**
 * Lockstep guardrail: ksp must be `<kotlin>-<kspVersion>`. Returns a
 * human-readable violation string, or null when consistent (or when either
 * key is absent — nothing to check).
 * @param {Record<string,string>} versions
 * @returns {string|null}
 */
export function lockstepViolation(versions) {
  const kotlin = versions.kotlin;
  const ksp = versions.ksp;
  if (!kotlin || !ksp) return null;
  // Two valid schemes: the classic KSP1 form "<kotlin>-<kspVersion>" (e.g.
  // 2.2.20-2.0.4), and the KSP2 aligned form where the KSP version EQUALS the
  // Kotlin version (e.g. kotlin 2.3.10 ↔ ksp 2.3.10 — KSP dropped the -<ksp> suffix).
  if (ksp !== kotlin && !ksp.startsWith(`${kotlin}-`)) {
    return (
      `kotlin ${kotlin} and ksp ${ksp} are OUT OF LOCKSTEP — ksp must be either ` +
      `"${kotlin}" (KSP2 aligned) or "${kotlin}-<kspVersion>" (e.g. "${kotlin}-2.0.4"). ` +
      `Refusing to write a broken pairing.`
    );
  }
  return null;
}

/**
 * Apply a set's `androidSdk` levels (compileSdk / targetSdk) to the text of
 * composeApp/build.gradle.kts. These live in build.gradle.kts, NOT the version
 * catalog — but they are coupled to the set (a dependency built against a newer
 * Android API forces a higher compileSdk, which in turn needs a newer AGP), so
 * the version set manages them too. Surgical, line-preserving replacement of the
 * `compileSdk = N` / `targetSdk = N` assignments.
 * @param {string} content build.gradle.kts text
 * @param {{compileSdk?:number,targetSdk?:number}} androidSdk
 * @returns {{content:string, changes:Array<{key,from,to}>}}
 */
export function applyAndroidSdk(content, androidSdk) {
  if (!androidSdk || content == null) return { content, changes: [] };
  const changes = [];
  let out = content;
  for (const key of ["compileSdk", "targetSdk"]) {
    if (androidSdk[key] == null) continue;
    const re = new RegExp(`(\\b${key}\\s*=\\s*)(\\d+)`);
    const m = out.match(re);
    if (m && Number(m[2]) !== Number(androidSdk[key])) {
      changes.push({ key, from: m[2], to: String(androidSdk[key]) });
      out = out.replace(re, `$1${androidSdk[key]}`);
    }
  }
  return { content: changes.length ? out : content, changes };
}

/**
 * Compute the full upgrade plan for one catalog + optional gradle.properties +
 * optional wrapper properties + optional composeApp/build.gradle.kts. Pure — no filesystem.
 * @param {object} params
 * @param {string} params.tomlContent gradle/libs.versions.toml text
 * @param {string|null} params.gradlePropertiesContent gradle.properties text (null = absent)
 * @param {string|null} params.wrapperPropertiesContent gradle-wrapper.properties text (null = absent)
 * @param {object} params.set registry set
 * @returns {{
 *   diff: ReturnType<typeof diffAgainstSet>,
 *   lockstepError: string|null,
 *   newTomlContent: string|null,
 *   propertyChanges: Array<{key,from,to}>,
 *   newGradlePropertiesContent: string|null,
 *   wrapperChange: {from:string,to:string}|null,
 *   newWrapperPropertiesContent: string|null,
 *   fromOurTemplate: boolean
 * }}
 */
export function planUpgrade({ tomlContent, gradlePropertiesContent, wrapperPropertiesContent, buildGradleContent = null, set }) {
  const projectVersions = parseVersions(tomlContent);
  const diff = diffAgainstSet(projectVersions, set);
  const resulting = resultingVersions(projectVersions, diff.changes);
  const lockstepError = lockstepViolation(resulting);

  let newTomlContent = null;
  if (!lockstepError && diff.changes.length > 0) {
    const changeMap = Object.fromEntries(diff.changes.map((c) => [c.key, c.to]));
    newTomlContent = updateTomlValues(tomlContent, "versions", changeMap).content;
  }

  // gradle.properties flags the set requires (e.g. ksp.useKSP2=true).
  const propertyChanges = [];
  let newGradlePropertiesContent = null;
  if (!lockstepError && set.gradleProperties && gradlePropertiesContent !== null) {
    let content = gradlePropertiesContent;
    const existing = parseProperties(gradlePropertiesContent);
    for (const [key, value] of Object.entries(set.gradleProperties)) {
      const cur = existing.get(key);
      if (!cur || cur.value !== value) {
        const r = upsertProperty(content, key, value);
        content = r.content;
        propertyChanges.push({ key, from: cur ? cur.value : null, to: value });
      }
    }
    if (propertyChanges.length > 0) newGradlePropertiesContent = content;
  }

  // Gradle wrapper distributionUrl, when the set pins one.
  let wrapperChange = null;
  let newWrapperPropertiesContent = null;
  if (!lockstepError && set.gradleWrapper?.distributionUrl && wrapperPropertiesContent !== null) {
    const props = parseProperties(wrapperPropertiesContent);
    const cur = props.get("distributionUrl");
    const targetRaw = set.gradleWrapper.distributionUrl;
    const targetEscaped = targetRaw.replace(/:/g, "\\:");
    const curUnescaped = cur ? cur.value.replace(/\\:/g, ":") : null;
    if (cur && curUnescaped !== targetRaw) {
      const r = upsertProperty(wrapperPropertiesContent, "distributionUrl", targetEscaped);
      newWrapperPropertiesContent = r.content;
      wrapperChange = { from: curUnescaped, to: targetRaw };
    }
  }

  // Android compileSdk / targetSdk (composeApp/build.gradle.kts), when the set pins them.
  let sdkChanges = [];
  let newBuildGradleContent = null;
  if (!lockstepError && set.androidSdk && buildGradleContent !== null) {
    const r = applyAndroidSdk(buildGradleContent, set.androidSdk);
    if (r.changes.length > 0) {
      sdkChanges = r.changes;
      newBuildGradleContent = r.content;
    }
  }

  return {
    diff,
    lockstepError,
    newTomlContent,
    propertyChanges,
    newGradlePropertiesContent,
    wrapperChange,
    newWrapperPropertiesContent,
    sdkChanges,
    newBuildGradleContent,
    fromOurTemplate: looksLikeOurTemplate(tomlContent),
  };
}

// ── Two upgrade courtesies the showcase asked for (2026-09-03) ──────────────
/**
 * Lines of YOUR file a conflict sidecar does not carry — what "take the
 * sidecar" would silently drop. Third consecutive upgrade on the showcase:
 * the .gitignore sidecar lacked the four signing-key ignores, and an agent
 * resolving by taking the sidecar would leave the keystore one `git add -A`
 * from a public repo. Blank and comment lines are not content.
 * @param {string} yours
 * @param {string} sidecar
 * @returns {string[]}
 */
export function sidecarDroppedLines(yours, sidecar) {
  const content = (text) =>
    String(text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  const have = new Set(content(sidecar));
  return [...new Set(content(yours).filter((l) => !have.has(l)))];
}

/** Untracked files git lists for `projectDir` (ignored ones only, or all); null without git. */
function untrackedPaths(projectDir, runGit, { ignoredOnly }) {
  const git =
    runGit ??
    ((args, cwd) => {
      try {
        return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
      } catch {
        return null;
      }
    });
  const args = ignoredOnly
    ? ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"]
    : ["ls-files", "-z", "--others"];
  const out = git(args, projectDir);
  if (out === null) return null;
  return out.split("\0").filter(Boolean);
}

/**
 * Backups (*BACKUP_SUFFIX) left by EARLIER upgrades beside their files,
 * anywhere in the tree — `res/` included — gitignored, so git sees them as
 * ignored-untracked. One set per upgrade accumulated and nothing cleaned them
 * (the showcase carried 0.19.0's and 0.20.0's). Returns root-relative paths;
 * [] when git is unavailable (then nothing is touched).
 * @param {string} projectDir
 * @param {{runGit?: (args: string[], cwd: string) => string|null}} [deps]
 * @returns {string[]}
 */
export function staleBackupPaths(projectDir, { runGit } = {}) {
  const all = untrackedPaths(projectDir, runGit, { ignoredOnly: true });
  if (all === null) return [];
  return all.filter((p) => p.endsWith(BACKUP_SUFFIX) && !p.startsWith(`${UPGRADE_RUNS_DIR}/`)).sort();
}

/**
 * Conflict sidecars (*SIDECAR_SUFFIX) an EARLIER engine left inside an Android
 * `res/` directory, where they break the build (KD-284). Untracked, ignored or
 * not. They may hold an unresolved conflict, so the caller MOVES them into the
 * run directory — never deletes them. Root-relative; [] without git.
 * @param {string} projectDir
 * @param {{runGit?: (args: string[], cwd: string) => string|null}} [deps]
 * @returns {string[]}
 */
export function staleResSidecarPaths(projectDir, { runGit } = {}) {
  const all = untrackedPaths(projectDir, runGit, { ignoredOnly: false });
  if (all === null) return [];
  return all
    .filter((p) => p.endsWith(SIDECAR_SUFFIX) && isAndroidResPath(p) && !p.startsWith(`${UPGRADE_RUNS_DIR}/`))
    .sort();
}
