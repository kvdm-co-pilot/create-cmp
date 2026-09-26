// `create-cmp add firebase` — the deterministic half: plan every edit Firebase needs in a stamped
// app, in memory, then write all of them or none.
//
// WHY AN ADD STEP AND NOT A STAMP OPTION (docs/proposals/LIBRARIES-IN-SERVICES-OUT.md, Decision
// 2): the default stamp must build green and reach first frame with no account, no credential
// file and no service to configure. Firebase is a service, so it is added to an app that already
// builds, by a program — the agent authors, a program refuses. A skill that hand-edits Gradle is
// the opposite, and `cmp-firebase-connect` now wraps this step instead.
//
// WHAT IT EDITS. The overlay under `overlays/firebase/` carries the bytes; this module decides
// where they go and refuses when it cannot tell:
//
//   files/    whole new files (FirebaseConfig.kt with the region and the emulator ports declared
//             ONCE for both platforms, KD-47; FirebaseEmulators.kt per platform)
//   append/   one marked block appended to the end of a file (composeApp/build.gradle.kts,
//             settings.gradle.kts, proguard-rules.pro) — never an edit inside the adopter's own
//             blocks, so their buildTypes are untouched
//   mock/     the config files written when no real one is given — values that SAY mock, never a
//             placeholder that reads as a real project
//   edits.json  the catalog entries and the single-line insertions, each at an anchor line
//
// EVERY EDIT IS IDEMPOTENT: each one first asks whether it is already made (the `present` text, the
// block marker, identical bytes), so a second run plans nothing and writes nothing. EVERY
// UNRECOGNISED SHAPE IS REFUSED BY NAME rather than guessed at: an anchor missing or matching more
// than once, a file that exists with other bytes, a catalog key that says something else, an app
// that already wires Firebase some other way. Nothing is written until the whole plan exists, so a
// refusal leaves the tree exactly as it was.
//
// THE iOS HALF is applied when `iosApp/` exists and is UNPROVEN: no gate in this repository builds
// it (KD-45's iOS half). The output says so every time it is applied.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadRegistry } from "./registry.mjs";
import { replaceTokens } from "./tokens.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The overlay this engine ships. An older engine's overlay sits beside its template the same way. */
export const OVERLAY_DIR = path.join(REPO_ROOT, "overlays", "firebase");

/** Where an engine's overlay lives, given the template directory it ships beside. */
export function overlayBesideTemplate(templateDir) {
  return path.join(templateDir, "..", "overlays", "firebase");
}

/** The two lines that bracket every block this step appends. */
export const BLOCK_OPEN = ">>> create-cmp add firebase";
export const BLOCK_CLOSE = "<<< create-cmp add firebase";

/** The mock config's tell — how a later run knows the file is its own mock and not the adopter's config. */
export const MOCK_TELL = "MOCK-written-by-create-cmp-add-firebase";

export const DEFAULT_REGION = "us-central1";
export const AUTH_CHOICES = ["email", "phone", "both", "none"];
/** The same shape options.schema.json held for `region` while it was a stamp option. */
const REGION_RE = /^[a-z]+(-[a-z]+[0-9]+)?$|^[a-z-]+[0-9]+$/;

const LITERAL_PACKAGE_SEGMENT = "com/example/app";
const GOOGLE_SERVICES_REL = "composeApp/google-services.json";
const GOOGLE_SERVICE_INFO_REL = "iosApp/iosApp/GoogleService-Info.plist";
const APP_BUILD_REL = "composeApp/build.gradle.kts";
const CATALOG_REL = "gradle/libs.versions.toml";
const SPEC_REL = "create-cmp.json";

/** Why a Firebase region cannot move once the step ran — the owner's decision, 2026-09-25. */
const REGION_IS_FIXED = "The region is set when Firebase is added; changing it is not supported by this step.";

/** A refusal: the message names what was found and what to do. Nothing has been written. */
export class AddFirebaseRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = "AddFirebaseRefusal";
  }
}

const refuse = (message) => {
  throw new AddFirebaseRefusal(message);
};

/** Does this overlay path belong to the iOS half? */
export function isIosPath(rel) {
  return rel.startsWith("iosApp/") || rel.includes("/iosMain/");
}

/** The overlay's literal `com/example/app` segment, mapped to the app's package directory. */
function toAppPath(rel, packagePath) {
  return rel.split(`/${LITERAL_PACKAGE_SEGMENT}/`).join(`/${packagePath}/`);
}

function listOverlayFiles(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) listOverlayFiles(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out.sort();
}

function readText(projectDir, rel) {
  const abs = path.join(projectDir, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

/**
 * The region an app's record holds: under `firebase` where this step wrote it, at the top level
 * where create-cmp 0.27 and earlier did, and the stamp-time default where it holds neither.
 * @param {object} record parsed create-cmp.json
 */
export function recordedFirebaseRegion(record) {
  return record?.firebase?.region ?? record?.region ?? DEFAULT_REGION;
}

/**
 * The `create-cmp add firebase` choices an app's record holds, or `null` when it says the app has
 * no Firebase. THE one reader of them: this step re-reads its own record through it, and `upgrade
 * --harness` reproduces an app's Firebase through it (harness-upgrade.mjs re-exports it), so the
 * two cannot read one record two ways.
 *
 * Both kinds of app answer here: one stamped with Firebase by create-cmp 0.27 or earlier (its
 * record keeps `region` at the top level) and one that ran this step (which records it under
 * `firebase`). Either way the CURRENT engine gives that app its Firebase through this step, so that
 * is what an upgrade must compare the app against — the default stamp alone would read every
 * Firebase line the adopter never touched as something the engine deleted.
 * @param {object} record parsed create-cmp.json
 * @returns {object|null}
 */
export function firebaseFromSpecRecord(record) {
  const fb = record?.firebase;
  if (!fb || fb.enabled !== true) return null;
  const out = { region: recordedFirebaseRegion(record) };
  for (const k of ["auth", "firestore", "storage", "functions", "fcm"]) {
    if (fb[k] !== undefined) out[k] = fb[k];
  }
  return out;
}

/**
 * The Firebase choices, validated. Absent values take the app's recorded choice (a re-run) and
 * then the defaults the stamp-time option had.
 * @param {object} input {region, auth, firestore, storage, functions, fcm}
 * @param {object|null} recorded what firebaseFromSpecRecord reads from create-cmp.json, when the
 *   step already ran
 */
export function firebaseOptions(input = {}, recorded = null) {
  const pick = (key, dflt) => (input[key] !== undefined ? input[key] : recorded?.[key] !== undefined ? recorded[key] : dflt);
  const region = pick("region", DEFAULT_REGION);
  if (typeof region !== "string" || !REGION_RE.test(region)) {
    refuse(`--region ${JSON.stringify(region)} is not a Firebase region (e.g. us-central1, europe-west1).`);
  }
  const auth = pick("auth", "both");
  if (!AUTH_CHOICES.includes(auth)) {
    refuse(`--auth ${JSON.stringify(auth)} is not one of ${AUTH_CHOICES.join(", ")}.`);
  }
  return {
    region,
    auth,
    firestore: pick("firestore", true) === true,
    storage: pick("storage", true) === true,
    functions: pick("functions", true) === true,
    fcm: pick("fcm", true) === true,
  };
}

/**
 * The version-set values the catalog needs, taken from the registry set whose `kotlin` is the
 * app's. Several sets can share a Kotlin version; the NEWEST of them answers, as `upgrade` does.
 */
export function registryVersionsFor(kotlin, keys, registry) {
  const matching = registry.sets.filter((s) => s.versions?.kotlin === kotlin);
  if (!matching.length) {
    refuse(
      `this app's catalog pins kotlin = "${kotlin}", and no proven version set in create-cmp's registry ` +
        `has that Kotlin version, so the GitLive Firebase version that matches it is unknown.\n` +
        `  Move the app onto a proven set first (\`create-cmp upgrade\`), then run this again.`,
    );
  }
  const set = matching[matching.length - 1];
  const out = {};
  for (const key of keys) {
    if (typeof set.versions[key] !== "string") {
      refuse(`version set ${set.id} (kotlin ${kotlin}) names no "${key}" version, so it cannot say which one to add.`);
    }
    out[key] = set.versions[key];
  }
  return { setId: set.id, versions: out, set };
}

/**
 * The Firebase iOS pods the Podfile asks for (KD-243): the Firebase iOS SDK the set's GitLive
 * release is built against, recorded next to it in the registry (`firebaseIos`) with GitLive's own
 * version catalog at that tag as the source. The constraint floors at that version and stays in its
 * major. A set with no pairing, or one recorded for a different GitLive version, is refused — a
 * guessed pod pin fails at pod resolution or link time, far from here.
 * @returns {{gitlive:string, version:string, constraint:string}}
 */
export function firebaseIosPodFor(set) {
  const gitlive = set.versions?.["firebase-gitlive"];
  const pair = set.firebaseIos;
  const m = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(pair?.version ?? "");
  if (!pair || pair.gitlive !== gitlive || !m) {
    refuse(
      `version set ${set.id} adds GitLive firebase ${gitlive}, and create-cmp's registry pairs ` +
        (pair ? `GitLive ${pair.gitlive} with Firebase iOS "${pair.version}"` : "it with no Firebase iOS version") +
        `, so the Podfile's Firebase pod version is unknown and this step will not guess it.\n` +
        `  Record \`firebaseIos\` for set ${set.id} in src/versions/registry.json from \`firebase-cocoapods\` in ` +
        `https://github.com/GitLiveApp/firebase-kotlin-sdk/blob/v${gitlive}/gradle/libs.versions.toml, ` +
        `or run this on an app with no iosApp/.`,
    );
  }
  return { gitlive, version: pair.version, constraint: `~> ${m[1]}.${m[2]}` };
}

// ── catalog ─────────────────────────────────────────────────────────────────

const KEY_RE = /^\s*([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$/;
const squash = (s) => s.replace(/\s+/g, "");

/** `[section]` → {start, end, entries: Map<key, {value, line}>} over the catalog's lines. */
function catalogSection(lines, section) {
  const start = lines.findIndex((l) => l.trim() === `[${section}]`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith("[")) {
      end = i;
      break;
    }
  }
  const entries = new Map();
  for (let i = start + 1; i < end; i += 1) {
    const t = lines[i].trim();
    if (!t || t.startsWith("#")) continue;
    const m = KEY_RE.exec(lines[i]);
    if (m) entries.set(m[1], { value: m[2], line: i });
  }
  return { start, end, entries };
}

/**
 * The catalog with the missing Firebase keys added, or `null` when every key is already there.
 * A key that is there with a different value is refused — it is somebody else's decision.
 */
export function planCatalog(text, wanted, comment) {
  let lines = text.split("\n");
  let changed = false;
  for (const [section, entries] of Object.entries(wanted)) {
    const found = catalogSection(lines, section);
    if (!found) refuse(`${CATALOG_REL} has no [${section}] table to add the Firebase entries to.`);
    const missing = [];
    for (const [key, value] of Object.entries(entries)) {
      const have = found.entries.get(key);
      if (!have) {
        missing.push(`${key} = ${value}`);
        continue;
      }
      if (squash(have.value) !== squash(value)) {
        refuse(
          `${CATALOG_REL} [${section}] already declares ${key} = ${have.value}, and Firebase needs ${key} = ${value}.\n` +
            `  That entry is this app's own decision, so it is not overwritten. Reconcile it by hand, then run this again.`,
        );
      }
    }
    if (!missing.length) continue;
    // After the section's last non-blank line, so the table's own trailing blank line stays last.
    let at = found.end - 1;
    while (at > found.start && !lines[at].trim()) at -= 1;
    lines = [...lines.slice(0, at + 1), comment, ...missing, ...lines.slice(at + 1)];
    changed = true;
  }
  return changed ? lines.join("\n") : null;
}

// ── line insertions and appended blocks ─────────────────────────────────────

/**
 * One insertion into `text`: `null` when already present, the new text otherwise. The anchor is a
 * whole line compared trimmed, and must occur exactly once — a second match is a shape this step
 * does not recognise, so it refuses rather than pick one.
 */
export function planInsert(text, rel, insert) {
  if (text.includes(insert.present)) return null;
  const anchor = insert.after ?? insert.before;
  const lines = text.split("\n");
  const hits = [];
  lines.forEach((l, i) => {
    if (l.trim() === anchor) hits.push(i);
  });
  if (hits.length !== 1) {
    refuse(
      `${rel}: the line \`${anchor}\` ${hits.length === 0 ? "is not there" : `is there ${hits.length} times`}, ` +
        `and it is where \`${insert.lines[insert.lines.length - 1].trim()}\` goes.\n` +
        `  This app's ${rel} is not a shape this step recognises, so it writes nothing rather than guess. ` +
        `Add the line by hand ${insert.after ? "after" : "before"} the one that plays that part, then run this again.`,
    );
  }
  const at = hits[0];
  const indent = /^[ \t]*/.exec(lines[at])[0];
  const added = insert.lines.map((l) => indent + l);
  const pos = insert.after ? at + 1 : at;
  return [...lines.slice(0, pos), ...added, ...lines.slice(pos)].join("\n");
}

/**
 * `text` with `block` appended, or `null` when it is already there — this step's block, or the
 * `probe` line an older stamp carried unmarked (create-cmp 0.27 and earlier shipped the Firebase R8
 * rules and the jitpack repository in every stamp, so appending them again would duplicate them).
 *
 * `earlier` is this step's own earlier block for the file, when it has one: found in `text` byte for
 * byte, it is rewritten to `block`. Before KD-260's fix the Gradle block carried no Firebase BoM, and a
 * re-run answered "already there" over an app whose instrumented tests do not compile (KD-262). A block
 * that matches neither is the adopter's, edited, and is left alone.
 */
export function planAppend(text, block, probe, earlier = null) {
  if (earlier && text.includes(BLOCK_OPEN)) {
    const was = earlier.replace(/\n$/, "");
    const now = block.replace(/\n$/, "");
    if (was !== now && text.includes(was)) return text.replace(was, now);
  }
  if (text.includes(BLOCK_OPEN) || (probe && text.includes(probe))) return null;
  const sep = text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${sep}${block.endsWith("\n") ? block : `${block}\n`}`;
}

/**
 * The FirebaseConfig.kt create-cmp 0.27 and earlier stamped into EVERY app, --no-firebase included
 * (its manifest called the one-constant file "harmless to leave"). It is replaced, not refused: an
 * app that never had Firebase would otherwise be turned away by the file its own stamp left behind.
 * Matched on its exact stamped bytes, any region — anything else is the adopter's and is refused.
 */
export function isLegacyFirebaseConfig(text) {
  return /^package [A-Za-z0-9_.]+\.data\.remote\n\n\/\/ Region for Cloud Functions \/ callables\. Keep schedulers, callables, Firestore in the\n\/\/ SAME region — cross-region 2nd-gen wiring fails\.\nconst val FIREBASE_FUNCTIONS_REGION = "[^"\n]*"\n?$/.test(text);
}

/**
 * The region `have` was written for, when it is this step's own file — the overlay's `raw` bytes
 * with every token but the region filled in — rendered for some region; `null` when it is not.
 */
function ownFileRegion(raw, tokens, have) {
  if (!raw.includes("__REGION__")) return null;
  const HOLE = "\u0000";
  const shape = replaceTokens(raw, tokens.map(([token, value]) => [token, token === "__REGION__" ? HOLE : value]));
  const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^${shape.split(HOLE).map(esc).join("([a-z0-9-]+)")}$`).exec(have);
  return m && new Set(m.slice(1)).size === 1 ? m[1] : null;
}

// ── config files ────────────────────────────────────────────────────────────

function googleServicesPackages(text, where) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    refuse(`${where} is not valid JSON (${e.message}).`);
  }
  const names = (json?.client ?? []).map((c) => c?.client_info?.android_client_info?.package_name).filter(Boolean);
  if (!names.length) refuse(`${where} names no Android client (client[].client_info.android_client_info.package_name).`);
  return names;
}

/** The applicationId the google-services plugin will match, from the app's own build file. */
export function applicationIdOf(buildText, fallback) {
  const hits = [...buildText.matchAll(/^\s*applicationId\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
  return hits.length === 1 ? hits[0] : fallback;
}

// ── the plan ────────────────────────────────────────────────────────────────

/**
 * Plan `add firebase` for a stamped app. Pure with respect to the tree: reads, never writes.
 *
 * @param {string} projectDir the app root (holds create-cmp.json)
 * @param {object} input Firebase choices (see firebaseOptions) plus `googleServices`, a path to a
 *   real google-services.json, resolved against the cwd
 * @param {object} [opts]
 * @param {string} [opts.overlayDir] the overlay to apply (an older engine's, for an upgrade base)
 * @param {object} [opts.registry] the version registry (tests)
 * @returns {{writes: Array<{rel:string, content:string, created:boolean}>, present: string[],
 *   ios: boolean, config: "mock"|"provided"|"existing", options: object, record: object,
 *   applicationId: string, setId: string}}
 */
export function planAddFirebase(projectDir, input = {}, opts = {}) {
  const overlayDir = opts.overlayDir ?? OVERLAY_DIR;
  if (!fs.existsSync(path.join(overlayDir, "edits.json"))) {
    refuse(`no Firebase overlay at ${overlayDir} (edits.json is missing) — this create-cmp install is incomplete.`);
  }
  const edits = JSON.parse(fs.readFileSync(path.join(overlayDir, "edits.json"), "utf8"));

  const specText = readText(projectDir, SPEC_REL);
  if (specText === null) {
    refuse(
      `no ${SPEC_REL} in ${projectDir}. \`create-cmp add firebase\` edits an app create-cmp stamped, and reads ` +
        `its package and shape from that record. Run it from the app's root, or pass --target-dir.`,
    );
  }
  let record;
  try {
    record = JSON.parse(specText);
  } catch (e) {
    refuse(`${SPEC_REL} is not valid JSON (${e.message}).`);
  }
  if (typeof record?.package !== "string" || !record.package) refuse(`${SPEC_REL} records no package.`);

  const appBuild = readText(projectDir, APP_BUILD_REL);
  if (appBuild === null) refuse(`${APP_BUILD_REL} is not there — this is not the shape create-cmp stamps.`);
  const catalog = readText(projectDir, CATALOG_REL);
  if (catalog === null) refuse(`${CATALOG_REL} is not there — this is not the shape create-cmp stamps.`);

  // ── Firebase that this step did not add ───────────────────────────────────
  const ours = appBuild.includes(BLOCK_OPEN);
  if (!ours) {
    // NOT the catalog, the R8 rules or jitpack: create-cmp 0.27 and earlier shipped those UNMARKED
    // in every stamp, --no-firebase included, so an app that never had Firebase carries them.
    const evidence = [];
    if (record.firebase?.enabled === true) evidence.push(`${SPEC_REL} records firebase.enabled`);
    if (/libs\.plugins\.google\.services|com\.google\.gms\.google-services/.test(appBuild)) {
      evidence.push(`${APP_BUILD_REL} applies the google-services plugin`);
    }
    if (/libs\.firebase\.|dev\.gitlive:/.test(appBuild)) evidence.push(`${APP_BUILD_REL} depends on Firebase`);
    if (evidence.length) {
      refuse(
        `this app already has Firebase (${evidence.join("; ")}), wired some way other than this step — ` +
          `by the stamp of create-cmp 0.27 or earlier, or by hand. Adding it again would wire it twice.\n` +
          `  An app stamped with Firebase keeps it: \`create-cmp upgrade --harness\` carries it forward.`,
      );
    }
  }

  const recorded = ours ? firebaseFromSpecRecord(record) : null;
  const options = firebaseOptions(input, recorded);
  if (recorded && options.region !== recorded.region) {
    refuse(
      `--region ${options.region}, and this app's Firebase is in ${recorded.region}. ${REGION_IS_FIXED}\n` +
        `  Run it without --region to keep ${recorded.region}.`,
    );
  }
  const packagePath = record.package.replace(/\./g, "/");
  const applicationId = applicationIdOf(appBuild, record.package);
  const ios = fs.existsSync(path.join(projectDir, "iosApp"));

  const kotlin = [...catalog.matchAll(/^\s*kotlin\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
  if (kotlin.length !== 1) refuse(`${CATALOG_REL} does not pin exactly one kotlin version in [versions].`);
  const { setId, versions, set } = registryVersionsFor(kotlin[0], edits.catalog.versionsFromRegistry, opts.registry ?? loadRegistry());
  const pod = ios ? firebaseIosPodFor(set) : null;
  const podTokens = pod
    ? [
        ["__FIREBASE_IOS_POD__", pod.constraint],
        ["__FIREBASE_IOS__", pod.version],
        ["__FIREBASE_GITLIVE__", pod.gitlive],
      ]
    : [];

  /** rel → planned text; the original is read once, then every edit to it composes in memory. */
  const planned = new Map();
  const present = [];
  const textOf = (rel) => {
    if (planned.has(rel)) return planned.get(rel);
    const text = readText(projectDir, rel);
    if (text === null) refuse(`${rel} is not there, and Firebase needs an edit in it. This is not the shape create-cmp stamps.`);
    return text;
  };

  // Catalog.
  const q = (v) => `"${v}"`;
  const nextCatalog = planCatalog(
    textOf(CATALOG_REL),
    {
      versions: Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, q(v)])),
      libraries: edits.catalog.libraries,
      plugins: edits.catalog.plugins,
    },
    edits.catalog.comment,
  );
  if (nextCatalog === null) present.push(`${CATALOG_REL} (Firebase entries)`);
  else planned.set(CATALOG_REL, nextCatalog);

  // Single-line insertions.
  for (const insert of edits.inserts) {
    if (isIosPath(insert.file) && !ios) continue;
    const rel = toAppPath(insert.file, packagePath);
    const lines = insert.lines.map((l) => podTokens.reduce((acc, [t, v]) => acc.replaceAll(t, v), l));
    const next = planInsert(textOf(rel), rel, { ...insert, lines });
    if (next === null) present.push(`${rel} (${insert.present})`);
    else planned.set(rel, next);
  }

  // Appended blocks.
  const appendDir = path.join(overlayDir, "append");
  for (const rel of listOverlayFiles(appendDir)) {
    if (isIosPath(rel) && !ios) continue;
    const probe = edits.appends?.[rel]?.present;
    const earlierPath = path.join(overlayDir, "append-earlier", rel);
    const earlier = fs.existsSync(earlierPath) ? fs.readFileSync(earlierPath, "utf8") : null;
    const next = planAppend(textOf(rel), fs.readFileSync(path.join(appendDir, rel), "utf8"), probe, earlier);
    if (next === null) present.push(`${rel} (${probe ?? "the add-firebase block"})`);
    else planned.set(rel, next);
  }

  // Whole files.
  const tokens = [
    ["__PACKAGE_PATH__", packagePath],
    ["__PACKAGE__", record.package],
    ["__REGION__", options.region],
    ["__IOS_BUNDLE_ID__", record.bundleId ?? record.package],
    ["__APPLICATION_ID__", applicationId],
  ];
  const created = new Set();
  const filesDir = path.join(overlayDir, "files");
  for (const relOverlay of listOverlayFiles(filesDir)) {
    if (isIosPath(relOverlay) && !ios) continue;
    const rel = toAppPath(relOverlay, packagePath);
    const raw = fs.readFileSync(path.join(filesDir, relOverlay), "utf8");
    const content = replaceTokens(raw, tokens);
    const have = readText(projectDir, rel);
    if (have === content) {
      present.push(rel);
      continue;
    }
    if (have !== null && !isLegacyFirebaseConfig(have)) {
      const theirs = ownFileRegion(raw, tokens, have);
      if (theirs !== null) {
        refuse(
          `${rel} is the file this step wrote for region ${theirs}, and this run asks for ${options.region}` +
            `${recorded ? ` (what ${SPEC_REL} records)` : ""}. ${REGION_IS_FIXED}\n` +
            `  ${SPEC_REL} and ${rel} must name the same region for this step to run.`,
        );
      }
      refuse(
        `${rel} already exists, and its bytes are not the ones this step writes. It is not overwritten.\n` +
          `  Move it aside (or delete it if it is left over from an earlier attempt), then run this again.`,
      );
    }
    planned.set(rel, content);
    if (have === null) created.add(rel);
  }

  // google-services.json: the adopter's real file, or a mock that says so.
  let config;
  const recordedConfig = ours ? record.firebase?.config : undefined;
  const haveConfig = readText(projectDir, GOOGLE_SERVICES_REL);
  if (typeof input.googleServices === "string") {
    const src = path.resolve(input.googleServices);
    if (!fs.existsSync(src)) refuse(`--google-services ${input.googleServices}: no such file.`);
    const text = fs.readFileSync(src, "utf8");
    const names = googleServicesPackages(text, input.googleServices);
    if (!names.includes(applicationId)) {
      refuse(
        `${input.googleServices} is for ${names.join(", ")}, and this app's applicationId is ${applicationId}.\n` +
          `  The google-services plugin fails the build on that mismatch. Register ${applicationId} in the ` +
          `Firebase console and download its google-services.json.`,
      );
    }
    // Replaced when it is the mock, or when it is the config an earlier run was handed: a config
    // re-downloaded for the same app (after adding a SHA, say) is how cmp-firebase-connect updates
    // it. One this step never recorded being given is the adopter's, and is not replaced.
    if (haveConfig === text) present.push(GOOGLE_SERVICES_REL);
    else if (haveConfig !== null && !haveConfig.includes(MOCK_TELL) && recordedConfig !== "provided") {
      refuse(
        `${GOOGLE_SERVICES_REL} already exists and is not the mock this step writes, so it is not replaced by ` +
          `${input.googleServices}. Move one of them aside, then run this again.`,
      );
    } else {
      planned.set(GOOGLE_SERVICES_REL, text);
      if (haveConfig === null) created.add(GOOGLE_SERVICES_REL);
    }
    config = "provided";
  } else if (haveConfig !== null) {
    const names = googleServicesPackages(haveConfig, GOOGLE_SERVICES_REL);
    if (!names.includes(applicationId)) {
      refuse(
        `${GOOGLE_SERVICES_REL} is for ${names.join(", ")}, and this app's applicationId is ${applicationId} — ` +
          `the google-services plugin fails the build on that mismatch.`,
      );
    }
    present.push(GOOGLE_SERVICES_REL);
    // Not the mock: the adopter's. Whether the step was handed it (`provided`) or found it already
    // there (`existing`) is not in the tree, so a re-run keeps what the first run recorded.
    config = haveConfig.includes(MOCK_TELL) ? "mock" : recordedConfig === "provided" ? "provided" : "existing";
  } else {
    const mock = replaceTokens(fs.readFileSync(path.join(overlayDir, "mock", GOOGLE_SERVICES_REL), "utf8"), tokens);
    planned.set(GOOGLE_SERVICES_REL, mock);
    created.add(GOOGLE_SERVICES_REL);
    config = "mock";
  }
  if (ios) {
    if (readText(projectDir, GOOGLE_SERVICE_INFO_REL) !== null) present.push(GOOGLE_SERVICE_INFO_REL);
    else {
      const mock = replaceTokens(fs.readFileSync(path.join(overlayDir, "mock", GOOGLE_SERVICE_INFO_REL), "utf8"), tokens);
      planned.set(GOOGLE_SERVICE_INFO_REL, mock);
      created.add(GOOGLE_SERVICE_INFO_REL);
    }
  }

  // The spec-of-record says what the app now carries.
  const firebase = { enabled: true, ...options, config };
  if (JSON.stringify(record.firebase) === JSON.stringify(firebase)) present.push(`${SPEC_REL} (firebase)`);
  else planned.set(SPEC_REL, `${JSON.stringify({ ...record, firebase }, null, 2)}\n`);

  const writes = [...planned].map(([rel, content]) => ({ rel, content, created: created.has(rel) }));
  return { writes, present, ios, config, options, record, applicationId, setId };
}

/**
 * Write the plan — every file or none. Each file is written beside itself first; only when every
 * one of those writes succeeded are they renamed into place, so a full disk or a permission error
 * part-way leaves the app as it was.
 */
export function applyAddFirebasePlan(projectDir, plan) {
  const staged = [];
  try {
    for (const w of plan.writes) {
      const abs = path.join(projectDir, w.rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const tmp = `${abs}.cmp-add-firebase-tmp`;
      fs.writeFileSync(tmp, w.content);
      staged.push([tmp, abs]);
    }
  } catch (e) {
    for (const [tmp] of staged) fs.rmSync(tmp, { force: true });
    throw e;
  }
  for (const [tmp, abs] of staged) fs.renameSync(tmp, abs);
  return plan.writes.map((w) => w.rel);
}

/**
 * Regenerate docs/ARCHITECTURE.md's generated sections with the app's OWN walker, so the lane's
 * currency check reads the new files (data/remote/FirebaseConfig.kt) as described. A minimal app
 * carries no walker, and then there is nothing to regenerate.
 * @returns {Promise<{ok:boolean, wrote?:boolean, reason?:string}>}
 */
export async function regenerateArchDoc(projectDir) {
  const walker = path.join(projectDir, "qa", "lib", "arch-doc.mjs");
  if (!fs.existsSync(walker) || !fs.existsSync(path.join(projectDir, "docs", "ARCHITECTURE.md"))) {
    return { ok: true, wrote: false, reason: "no walker or no docs/ARCHITECTURE.md" };
  }
  const { writeArchDoc } = await import(pathToFileURL(walker).href);
  return writeArchDoc(projectDir);
}
