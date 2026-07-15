// Loader + helpers for the proven-green version-set registry
// (src/versions/registry.json). Pure logic (nearest-set matching, validation)
// is exported for unit testing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, "..", "versions", "registry.json");

/**
 * Load the registry JSON (or a custom one for tests).
 * @param {string} [registryPath]
 */
export function loadRegistry(registryPath = REGISTRY_PATH) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const errors = validateRegistry(registry);
  if (errors.length) {
    throw new Error(`Invalid version-set registry ${registryPath}:\n  - ${errors.join("\n  - ")}`);
  }
  return registry;
}

/**
 * Structural validation of a registry object. Returns a list of problems
 * (empty = valid). Also enforces the kotlin↔ksp lockstep INSIDE each set —
 * a registry must never ship a broken pairing.
 * @param {object} registry
 * @returns {string[]}
 */
export function validateRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object") return ["registry is not an object"];
  if (!Array.isArray(registry.sets) || registry.sets.length === 0) {
    return ["registry.sets must be a non-empty array"];
  }
  const seen = new Set();
  registry.sets.forEach((set, i) => {
    const where = `sets[${i}]${set && set.id ? ` (${set.id})` : ""}`;
    if (!set || typeof set !== "object") {
      errors.push(`${where}: not an object`);
      return;
    }
    if (typeof set.id !== "string" || !set.id) errors.push(`${where}: missing string id`);
    if (set.id && seen.has(set.id)) errors.push(`${where}: duplicate id`);
    seen.add(set.id);
    if (!set.versions || typeof set.versions !== "object" || Array.isArray(set.versions)) {
      errors.push(`${where}: missing versions object`);
      return;
    }
    for (const [k, v] of Object.entries(set.versions)) {
      if (typeof v !== "string" || !v) errors.push(`${where}: versions.${k} must be a non-empty string`);
    }
    const { kotlin, ksp } = set.versions;
    // Accept both the KSP1 form "<kotlin>-<kspVersion>" and the KSP2 aligned form
    // where ksp === kotlin (KSP dropped the -<ksp> suffix in the 2.3.x line).
    if (kotlin && ksp && ksp !== kotlin && !ksp.startsWith(`${kotlin}-`)) {
      errors.push(`${where}: ksp "${ksp}" is not in lockstep with kotlin "${kotlin}" (must be "${kotlin}" for KSP2, or "${kotlin}-<kspVersion>")`);
    }
    if (set.gradleProperties && typeof set.gradleProperties !== "object") {
      errors.push(`${where}: gradleProperties must be an object`);
    }
    if (set.gradleWrapper && typeof set.gradleWrapper.distributionUrl !== "string") {
      errors.push(`${where}: gradleWrapper.distributionUrl must be a string`);
    }
    if (set.androidSdk !== undefined) {
      if (typeof set.androidSdk !== "object" || Array.isArray(set.androidSdk) || set.androidSdk === null) {
        errors.push(`${where}: androidSdk must be an object`);
      } else {
        for (const k of ["compileSdk", "targetSdk"]) {
          if (set.androidSdk[k] !== undefined && !Number.isInteger(set.androidSdk[k])) {
            errors.push(`${where}: androidSdk.${k} must be an integer`);
          }
        }
      }
    }
    if (set.notes && !Array.isArray(set.notes)) errors.push(`${where}: notes must be an array`);
  });
  return errors;
}

/** The default upgrade target: the newest (last) set. */
export function latestSet(registry) {
  return registry.sets[registry.sets.length - 1];
}

/** Look a set up by id; returns null when absent. */
export function getSet(registry, id) {
  return registry.sets.find((s) => s.id === id) || null;
}

/**
 * The registry set that best matches a project's current [versions] values
 * (most exact key+value matches; ties go to the NEWER set). Used by doctor to
 * report drift against the closest known-green baseline.
 * @param {object} registry
 * @param {Map<string,{value:string}>|Record<string,string>} projectVersions
 * @returns {{set:object, matches:number}|null}
 */
export function nearestSet(registry, projectVersions) {
  const values =
    projectVersions instanceof Map
      ? Object.fromEntries([...projectVersions].map(([k, v]) => [k, v.value]))
      : projectVersions;
  let best = null;
  for (const set of registry.sets) {
    let matches = 0;
    for (const [k, v] of Object.entries(set.versions)) {
      if (values[k] === v) matches++;
    }
    if (!best || matches >= best.matches) best = { set, matches };
  }
  return best;
}
