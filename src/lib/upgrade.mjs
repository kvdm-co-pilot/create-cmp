// Core logic for `create-cmp upgrade`: diff a project's [versions] table
// against a proven-green registry set, guard the kotlin↔ksp lockstep, and
// apply the changes SURGICALLY (line edits via lib/toml.mjs — formatting,
// comments, and unrelated lines are preserved byte-for-byte). Pure functions
// here; filesystem orchestration lives in src/commands/upgrade.mjs.

import { parseVersions, updateTomlValues, upsertProperty, parseProperties } from "./toml.mjs";

export const BACKUP_SUFFIX = ".bak-upgrade";

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
 * Compute the full upgrade plan for one catalog + optional gradle.properties +
 * optional wrapper properties. Pure — no filesystem.
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
export function planUpgrade({ tomlContent, gradlePropertiesContent, wrapperPropertiesContent, set }) {
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

  return {
    diff,
    lockstepError,
    newTomlContent,
    propertyChanges,
    newGradlePropertiesContent,
    wrapperChange,
    newWrapperPropertiesContent,
    fromOurTemplate: looksLikeOurTemplate(tomlContent),
  };
}
