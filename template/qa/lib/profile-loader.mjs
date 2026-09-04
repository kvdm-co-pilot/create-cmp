// profile-loader.mjs — load the stack profile the manifest names. NEVER by name.
//
// The one rule of the agnostic harness (docs/proposals/AGNOSTIC-HARNESS-
// ARCHITECTURE.md §3.2): nothing in the core imports a profile by name. Until
// this file, qa/verify.mjs imported the Compose step pack by name — which is
// why a Kotlin backend that wrote its own step pack correctly still had to
// fork eleven spine files to use it (§1.3). The runner could not start without
// Compose's pack.
//
// Now the runner asks the manifest which profile, and this loader imports
// qa/lib/profiles/<id>/index.mjs. The loader knows the SHAPE of a profile
// (§5.1) and nothing about any particular one. Terraform's core/provider rule;
// LSP's client/server rule.
//
// Every failure is a refusal by name: a missing directory, an id that does not
// match the manifest, a protocol the core does not speak, a module without the
// exports the runner needs. None of them fall back to anything.
//
// SINGLE SOURCE OF TRUTH: packages/harness/src/lib/profile-loader.mjs in the
// create-cmp repo. Vendored byte-identical into qa/lib/ — edit the package
// source, then run `node scripts/sync-harness.mjs`.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PROFILE_ID_RE } from "./harness-manifest.mjs";

/**
 * The profile protocol this core speaks. A profile declares the protocol it
 * implements; mismatch is a refusal naming both, with the upgrade command.
 * One integer — the Terraform handshake.
 */
export const PROFILE_PROTOCOL = 1;

/** Where profiles live, relative to the project root. Inside the lock region. */
export const PROFILES_DIR_REL = "qa/lib/profiles";

/** The exports a profile MUST provide for the runner to start. Grows with the protocol. */
export const REQUIRED_EXPORTS = Object.freeze(["id", "protocol", "steps"]);

/**
 * The project-relative path of a profile's entry module.
 * @param {string} id
 * @returns {string}
 */
export function profileEntryRel(id) {
  return `${PROFILES_DIR_REL}/${id}/index.mjs`;
}

/**
 * Judge a loaded module against the protocol — pure, so the refusals are
 * unit-testable without a filesystem.
 * @param {object} mod the imported module namespace
 * @param {string} id the id the manifest named
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateProfileModule(mod, id) {
  if (!mod || typeof mod !== "object") return { ok: false, reason: `profile "${id}" did not load as a module` };
  const missing = REQUIRED_EXPORTS.filter((name) => !(name in mod));
  if (missing.length) {
    return { ok: false, reason: `profile "${id}" is missing required export(s): ${missing.join(", ")} (a profile must export ${REQUIRED_EXPORTS.join(", ")})` };
  }
  if (mod.id !== id) {
    return { ok: false, reason: `profile "${id}" exports id ${JSON.stringify(mod.id)} — the manifest and the profile disagree about what this project is; fix one of them` };
  }
  if (mod.protocol !== PROFILE_PROTOCOL) {
    return {
      ok: false,
      reason: `profile "${id}" implements profile protocol ${JSON.stringify(mod.protocol)}; this lane speaks ${PROFILE_PROTOCOL} — upgrade the harness or the profile so they match (\`create-cmp upgrade --harness\`)`,
    };
  }
  if (typeof mod.steps !== "function") return { ok: false, reason: `profile "${id}" must export steps(ctx) as a function` };
  return { ok: true };
}

/**
 * Load and validate the profile the manifest names.
 * @param {string} root project root
 * @param {{id: string}} named the manifest's `profile`
 * @returns {Promise<{ok: true, profile: object, entryRel: string} | {ok: false, reason: string}>}
 */
export async function loadProfile(root, { id } = {}) {
  if (typeof id !== "string" || !PROFILE_ID_RE.test(id)) {
    return { ok: false, reason: `profile id ${JSON.stringify(id)} is not a valid profile name (${PROFILE_ID_RE}) — it names a directory under ${PROFILES_DIR_REL}/` };
  }
  const entryRel = profileEntryRel(id);
  const entryAbs = path.join(root, ...entryRel.split("/"));
  if (!fs.existsSync(entryAbs)) {
    let present = [];
    try {
      present = fs
        .readdirSync(path.join(root, ...PROFILES_DIR_REL.split("/")), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      /* no profiles dir at all */
    }
    const have = present.length ? `profiles present: ${present.join(", ")}` : `no profiles are installed under ${PROFILES_DIR_REL}/`;
    return { ok: false, reason: `the manifest names profile "${id}" but ${entryRel} does not exist (${have}) — install the profile or fix ${"qa/harness-manifest.json"}` };
  }
  let mod;
  try {
    mod = await import(pathToFileURL(entryAbs).href);
  } catch (err) {
    return { ok: false, reason: `profile "${id}" failed to load from ${entryRel}: ${err && err.message ? err.message : String(err)}` };
  }
  const verdict = validateProfileModule(mod, id);
  if (!verdict.ok) return verdict;
  return { ok: true, profile: mod, entryRel };
}
