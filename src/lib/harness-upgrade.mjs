// Core logic for `create-cmp upgrade --harness`: refresh the ENGINE-OWNED
// files of a stamped app after the engine improved.
//
// WHY: `create-cmp` stamps an app from template/ and walks away. When the
// engine later fixes a stamped file (a verify-lane bug, a Gradle wiring fix,
// a new hook), apps stamped from the OLD engine never receive it — the dead
// androidDebug/AndroidManifest.xml fixed at engine commit b972c19 was carried
// by every app this template ever stamped. This module closes that gap with a
// three-way merge, exactly like dpkg conffile handling or a Yeoman
// regeneration:
//
//   base   = what the engine WOULD have stamped at the version this app was
//            stamped from (old template + CURRENT stamp pipeline — see below)
//   new    = what the CURRENT engine stamps
//   theirs = the app's working tree today
//
// Both base and new are produced by stamping with the app's OWN recorded
// config (create-cmp.json), so tokens (package, app name, theme prefix)
// resolve identically and every base→new diff is pure engine change.
//
// NOTE on the base approximation: base is "old template + current pipeline".
// When the stamp PIPELINE itself changed between versions (tokenization,
// marker stripping), base can differ from what the old engine literally
// produced. This is deliberate — running old engine code against a current
// config is strictly worse — and only affects files whose tokenization
// changed; those surface as conflicts rather than silent clobbers.
//
// App-authored files (the app's own feature screens) appear in neither base
// nor new, so they are INVISIBLE to this sweep — by design. The sweep only
// ever considers paths the engine stamped at one version or the other.
//
// Pure decision logic lives here so tests can drive it with in-memory/temp
// fixtures and zero npm network access; CLI + npm-pack orchestration lives in
// src/commands/upgrade.mjs. No dependencies beyond the Node stdlib (git is
// already a hard requirement of this repo).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { listFiles } from "./fsutil.mjs";
import { isBinaryPath, replaceTokens } from "./tokens.mjs";
import { BACKUP_SUFFIX } from "./upgrade.mjs";
import { isHarnessFile } from "../../packages/harness/src/lib/harness-region.mjs";

/** Sidecar suffix for the new engine content beside a conflicted file. */
export const SIDECAR_SUFFIX = ".cmp-new";

/**
 * Hard exclusion list — the app's own state, or its secrets, that the engine
 * also seeds. A diff here is noise or danger, never an upgrade. Matched
 * against the project-relative path (posix separators):
 *   - a bare name (no `/`) matches that basename at ANY depth — this is what
 *     keeps `keystore.properties` and `google-services.json` excluded wherever
 *     they live (e.g. composeApp/google-services.json), because those files
 *     must never be read, written, or printed by this code;
 *   - `dir/**` matches everything under `dir` (root-anchored);
 *   - `**` + `/dir/` + `**` matches everything under a `dir` segment at any depth;
 *   - `**` + `/name` matches that basename at any depth.
 */
export const EXCLUDED_PATTERNS = [
  "create-cmp.json",
  "qa/evidence/**",
  "qa/approvals.json",
  // Derived state, rewritten explicitly once the region has landed. Sweeping
  // it would copy a stale manifest in, back up a value that was about to be
  // replaced anyway, and count a guaranteed no-op as actionable work.
  "qa/harness.lock.json",
  "qa/comments.json",
  "qa/golden/**",
  ".git/**",
  "build/**",
  "**/build/**",
  ".gradle/**",
  "local.properties",
  "keystore.properties",
  "google-services.json",
  "**/GoogleService-Info.plist",
];

/**
 * Does one exclusion pattern match a project-relative posix path?
 * @param {string} relPath project-relative path, "/"-separated
 * @param {string} pattern one of EXCLUDED_PATTERNS (see grammar above)
 * @returns {boolean}
 */
export function matchesPattern(relPath, pattern) {
  if (pattern.endsWith("/**")) {
    const dir = pattern.slice(0, -3);
    if (dir.startsWith("**/")) {
      // "**/build/**": any DIRECTORY segment equal to the name.
      const seg = dir.slice(3);
      return relPath.split("/").slice(0, -1).includes(seg);
    }
    return relPath === dir || relPath.startsWith(dir + "/");
  }
  if (pattern.startsWith("**/")) {
    const name = pattern.slice(3);
    return relPath === name || relPath.endsWith("/" + name);
  }
  if (!pattern.includes("/")) {
    // Bare name: basename match at any depth (never risk touching a nested
    // secret because it wasn't at the root).
    return relPath === pattern || relPath.endsWith("/" + pattern);
  }
  return relPath === pattern;
}

/**
 * Is this project-relative path on the hard exclusion list?
 * Checked BEFORE any file content is read — excluded files (state, secrets)
 * are never opened by this module.
 * @param {string} relPath project-relative path, "/"-separated
 * @returns {boolean}
 */
export function isExcludedPath(relPath) {
  return EXCLUDED_PATTERNS.some((p) => matchesPattern(relPath, p));
}

/**
 * Three-way merge via `git merge-file -p --diff3 <theirs> <base> <new>`.
 * The three sides are written to temp files; git's exit code is 0 for a clean
 * merge, >0 for the number of conflicts, <0 / spawn error for trouble — both
 * of the latter are treated as a conflict (the caller then writes a sidecar
 * instead of touching the app's file, so "treat as conflict" is always safe).
 * @param {Buffer} theirs the app's current content
 * @param {Buffer} base the old engine's stamped content
 * @param {Buffer} next the current engine's stamped content
 * @returns {{clean: boolean, content: Buffer|null}} merged content when clean
 */
export function mergeThreeWay(theirs, base, next) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harness-merge-"));
  try {
    const t = path.join(dir, "theirs");
    const b = path.join(dir, "base");
    const n = path.join(dir, "new");
    fs.writeFileSync(t, theirs);
    fs.writeFileSync(b, base);
    fs.writeFileSync(n, next);
    const r = spawnSync("git", ["merge-file", "-p", "--diff3", t, b, n], {
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.error || r.status === null || r.status !== 0) {
      return { clean: false, content: null };
    }
    return { clean: true, content: r.stdout };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The decision table — one file, three sides, one verdict. Buckets:
 *   unchanged   engine never changed it (base == new)         → silent
 *   current     app already matches the new engine            → silent
 *   applied     app never touched it, engine changed it       → write new
 *   merged      both changed, three-way merge is clean        → write merged
 *   conflicted  both changed the same region (or binary, or the app deleted
 *               a file the engine changed) → NEVER clobber: leave the app's
 *               file byte-for-byte alone, emit a `.cmp-new` sidecar with the
 *               new engine's content
 *   added       new engine file absent from the app           → write new
 *   removed     engine deleted it and the app never touched it → delete
 *   orphaned    engine deleted it but the app modified it     → keep, report
 *
 * Binary files (isBinaryPath) never three-way merge: replace when the app
 * never touched them, otherwise conflicted.
 *
 * @param {object} params
 * @param {string} params.relPath project-relative path (for binary sniffing)
 * @param {Buffer|null} params.base old engine's content (null = not stamped then)
 * @param {Buffer|null} params.next current engine's content (null = engine deleted it)
 * @param {Buffer|null} params.theirs the app's content (null = absent in the app)
 * @param {(theirs:Buffer, base:Buffer, next:Buffer)=>{clean:boolean,content:Buffer|null}} [params.merge]
 *        three-way merge fn, injectable for tests (default: git merge-file)
 * @returns {{bucket:string, write:Buffer|null, sidecar:Buffer|null, remove:boolean}|null}
 *        null when the path is in neither base nor new (app-authored — invisible)
 */


/**
 * A `stampBase` function for an app's recorded config — reproduces what a
 * pre-0.14.0 engine would have written into that app's lane, so a file the
 * stamper touched is not mistaken for a local edit. Binary-safe: content that
 * does not round-trip through UTF-8 is returned unchanged.
 * @param {Array<[string,string]>} tokenMap from buildTokenMap(config)
 * @returns {(base: Buffer) => Buffer}
 */
export function stampBaseWith(tokenMap) {
  return (base) => {
    const text = base.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(base)) return base;
    return Buffer.from(replaceTokens(text, tokenMap), "utf8");
  };
}

/** Where a preserved local patch to machine-owned lane code is written. */
export const LOCAL_PATCH_PATH = "qa/harness-local.patch";

/**
 * Unified diff from `base` to `theirs`, rewritten so it applies against the
 * project tree (`git apply qa/harness-local.patch`). git diff --no-index exits
 * 1 when there ARE differences, which is the only case we call it in.
 * @param {Buffer} base
 * @param {Buffer} theirs
 * @param {string} relPath project-relative path the patch should name
 * @returns {string} patch text, or "" if git could not produce one
 */
export function diffPatch(base, theirs, relPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harness-diff-"));
  try {
    const b = path.join(dir, "base");
    const t = path.join(dir, "theirs");
    fs.writeFileSync(b, base);
    fs.writeFileSync(t, theirs);
    const r = spawnSync("git", ["diff", "--no-index", "--no-color", "--", b, t], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    // 0 = identical (we never call it then), 1 = differences, >1 = trouble.
    if (r.error || (r.status !== 0 && r.status !== 1) || !r.stdout) return "";
    return r.stdout
      .split("\n")
      .map((line) => {
        if (line.startsWith("diff --git ")) return `diff --git a/${relPath} b/${relPath}`;
        if (line.startsWith("--- ")) return `--- a/${relPath}`;
        if (line.startsWith("+++ ")) return `+++ b/${relPath}`;
        return line;
      })
      .join("\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The decision table for MACHINE-OWNED lane files — a different question from
 * the one decideFile asks about app-shaped files.
 *
 * Lane code is byte-identical in every create-cmp app and carries no app
 * content, so it is a derived artifact, and the right operation on a derived
 * artifact is REPLACE, not merge. Three-way merging it is what made upgrades
 * expensive: the 0.13.0 pilots produced ~1,000 conflicted lines per app whose
 * diffs contained zero app-specific tokens.
 *
 * The region is therefore always taken to the new engine's content. What
 * varies is how honestly we account for what the app had:
 *
 *   region-current    already the new content                    → silent
 *   region-clean      untouched since stamp                      → replace
 *   region-absorbed   locally edited, but the edit is ALREADY in the new
 *                     content (the app hand-mirrored engine work — the
 *                     pilots' overwhelmingly common case) → replace, silent
 *   region-patched    a genuine local fork of lane code → replace, AND
 *                     preserve base→theirs as a patch so nothing is lost
 *   added / removed   as for any other file
 *
 * "region-patched" deliberately does NOT block or merge. A local edit to lane
 * code is a fork the app is maintaining; making it explicit (a reviewable
 * patch file plus a loud report) is better than the status quo, where the
 * divergence was invisible until it cost a thousand hand-resolved lines at
 * the next upgrade.
 *
 * @param {object} params
 * @param {string} params.relPath
 * @param {Buffer|null} params.base
 * @param {Buffer|null} params.next
 * @param {Buffer|null} params.theirs
 * @param {Function} [params.merge] injectable three-way merge (classifier only)
 * @returns {{bucket:string, write:Buffer|null, sidecar:null, remove:boolean, patch?:string}|null}
 */
export function decideRegionFile({ relPath, base, next, theirs, merge = mergeThreeWay, stampBase = null }) {
  const eq = (a, b) => a !== null && b !== null && a.equals(b);
  const replace = (bucket, extra = {}) => ({
    bucket,
    write: next,
    sidecar: null,
    remove: false,
    ...extra,
  });

  if (next === null) {
    // The engine dropped this lane file. Nothing app-owned can live here, so
    // there is no "orphaned" case to protect — remove it.
    if (theirs === null) return { bucket: "current", write: null, sidecar: null, remove: false };
    return { bucket: "region-removed", write: null, sidecar: null, remove: true };
  }
  if (theirs === null) return replace(base === null ? "added" : "region-restored");
  if (eq(theirs, next)) return { bucket: "current", write: null, sidecar: null, remove: false };
  if (base === null) return replace("region-patched", { patch: "" }); // no base to diff against
  if (eq(theirs, base)) return replace("region-clean");

  // The app's copy may be what its OWN engine produced rather than what the
  // base tree holds, because engines before 0.14.0 ran lane code through the
  // token stamper. Such an app carries `Fuelled` where the base template says
  // `__APP_NAME__` — a difference the engine created, not the app. Asking
  // "does this match the base as THIS app would have had it stamped?" is the
  // accurate form of "did the app never touch it", and it needs no version
  // comparison: for a 0.14.0+ base there is nothing left to stamp, so the
  // check simply never fires.
  if (stampBase !== null) {
    const asStamped = stampBase(base);
    if (eq(theirs, asStamped)) return replace("region-clean");
  }

  // The app edited lane code. Is that edit already carried by the new engine?
  // A clean three-way merge landing exactly on `next` means the local change
  // contributed nothing beyond it — the hand-mirror case.
  const m = merge(theirs, base, next);
  if (m.clean && m.content !== null && m.content.equals(next)) return replace("region-absorbed");

  return replace("region-patched", { patch: diffPatch(base, theirs, relPath) });
}

export function decideFile({ relPath, base, next, theirs, merge = mergeThreeWay, stampBase = null }) {
  // Machine-owned lane files answer a different question — see decideRegionFile.
  if (isHarnessFile(relPath) && !(base === null && next === null)) {
    return decideRegionFile({ relPath, base, next, theirs, merge, stampBase });
  }
  const none = (bucket) => ({ bucket, write: null, sidecar: null, remove: false });
  const write = (bucket, content) => ({ bucket, write: content, sidecar: null, remove: false });
  const conflict = () => ({ bucket: "conflicted", write: null, sidecar: next, remove: false });
  const eq = (a, b) => a !== null && b !== null && a.equals(b);

  if (base !== null && next !== null) {
    if (eq(base, next)) return none("unchanged"); // engine never changed it
    // Engine changed it:
    if (theirs === null) return conflict(); // app deleted it — never resurrect silently
    if (eq(theirs, next)) return none("current"); // already up to date
    if (eq(theirs, base)) return write("applied", next); // app never touched it
    // All three differ:
    if (isBinaryPath(relPath)) return conflict(); // binaries never merge
    const m = merge(theirs, base, next);
    if (m.clean && m.content !== null) {
      // A merge that reproduces the app's file byte-for-byte means the app
      // already carries the engine change (e.g. a previous --harness run) —
      // report current, keep re-runs idempotent and quiet.
      if (m.content.equals(theirs)) return none("current");
      return write("merged", m.content);
    }
    return conflict();
  }

  if (base === null && next !== null) {
    // New engine file.
    if (theirs === null) return write("added", next);
    if (eq(theirs, next)) return none("current");
    return conflict(); // the app already has something different there
  }

  if (base !== null && next === null) {
    // Engine deleted it.
    if (theirs === null) return none("current"); // already gone
    if (eq(theirs, base)) return { bucket: "removed", write: null, sidecar: null, remove: true };
    return none("orphaned"); // app modified it — keep it, report it
  }

  return null; // in neither base nor new: app-authored, invisible to the sweep
}

function readIfPresent(dir, relPath) {
  try {
    return fs.readFileSync(path.join(dir, relPath));
  } catch {
    return null;
  }
}

function toRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join("/");
}

/**
 * Walk base ∪ new, classify every path through the decision table, and return
 * the full plan. Excluded paths are counted WITHOUT ever reading their
 * content (state files and secrets stay unopened). Reads the three trees but
 * never writes anything — applying is applyHarnessPlan's job.
 * @param {object} params
 * @param {string} params.baseDir stamped tree of the old engine
 * @param {string} params.newDir stamped tree of the current engine
 * @param {string} params.projectDir the app's working tree
 * @param {Function} [params.merge] three-way merge fn, injectable for tests
 * @returns {{entries: Array<{relPath:string, bucket:string, write?:Buffer|null,
 *            sidecar?:Buffer|null, remove?:boolean}>,
 *            counts: Record<string, number>}}
 */
export function planHarnessUpgrade({ baseDir, newDir, projectDir, merge = mergeThreeWay, stampBase = null }) {
  const rels = new Set();
  for (const f of listFiles(baseDir)) rels.add(toRel(baseDir, f));
  for (const f of listFiles(newDir)) rels.add(toRel(newDir, f));

  const counts = {
    excluded: 0,
    unchanged: 0,
    current: 0,
    applied: 0,
    merged: 0,
    conflicted: 0,
    added: 0,
    removed: 0,
    orphaned: 0,
    // Machine-owned lane buckets (decideRegionFile).
    "region-clean": 0,
    "region-absorbed": 0,
    "region-patched": 0,
    "region-restored": 0,
    "region-removed": 0,
  };
  const entries = [];
  for (const relPath of [...rels].sort()) {
    if (isExcludedPath(relPath)) {
      counts.excluded += 1;
      entries.push({ relPath, bucket: "excluded", write: null, sidecar: null, remove: false });
      continue;
    }
    const decision = decideFile({
      relPath,
      base: readIfPresent(baseDir, relPath),
      next: readIfPresent(newDir, relPath),
      theirs: readIfPresent(projectDir, relPath),
      merge,
      stampBase,
    });
    if (decision === null) continue;
    counts[decision.bucket] = (counts[decision.bucket] ?? 0) + 1;
    entries.push({ relPath, ...decision });
  }
  return { entries, counts };
}

/**
 * Apply a plan to the app's working tree. Every file that gets written over
 * or deleted is backed up first as `<file>${BACKUP_SUFFIX}` (same suffix as
 * the version-catalog upgrade path, so one revert story covers both modes).
 * Conflicted entries never touch the app's file — only the `.cmp-new` sidecar
 * is written. Returns what happened so the CLI can print revert commands.
 * @param {string} projectDir
 * @param {Array<{relPath:string, bucket:string, write:Buffer|null, sidecar:Buffer|null, remove:boolean}>} entries
 * @returns {{written:string[], created:string[], deleted:string[],
 *            sidecars:string[], backups:string[]}}
 *   written  rel paths overwritten (backup exists)
 *   created  rel paths newly created (no previous content, no backup)
 *   deleted  rel paths removed (backup exists)
 *   sidecars rel paths of `.cmp-new` files written beside conflicts
 *   backups  rel paths that have a `${BACKUP_SUFFIX}` copy
 */
export function applyHarnessPlan(projectDir, entries) {
  const written = [];
  const created = [];
  const deleted = [];
  const sidecars = [];
  const backups = [];
  const patched = [];
  const patchChunks = [];
  for (const e of entries) {
    if (e.bucket === "region-patched" && e.patch) {
      patched.push(e.relPath);
      patchChunks.push(e.patch.endsWith("\n") ? e.patch : `${e.patch}\n`);
    }
    const abs = path.join(projectDir, e.relPath);
    if (e.sidecar !== null && e.sidecar !== undefined) {
      const sidecarPath = abs + SIDECAR_SUFFIX;
      fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
      fs.writeFileSync(sidecarPath, e.sidecar);
      sidecars.push(e.relPath + SIDECAR_SUFFIX);
      continue;
    }
    if (e.remove) {
      fs.copyFileSync(abs, abs + BACKUP_SUFFIX);
      backups.push(e.relPath);
      fs.rmSync(abs);
      deleted.push(e.relPath);
      continue;
    }
    if (e.write !== null && e.write !== undefined) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (fs.existsSync(abs)) {
        fs.copyFileSync(abs, abs + BACKUP_SUFFIX);
        backups.push(e.relPath);
        fs.writeFileSync(abs, e.write);
        written.push(e.relPath);
      } else {
        fs.writeFileSync(abs, e.write);
        created.push(e.relPath);
      }
    }
  }
  // One patch file for the whole run — the app's genuine divergence from the
  // lane, preserved rather than discarded. Written only when there is
  // something to preserve, and only after the writes above succeeded.
  let patchPath = null;
  if (patchChunks.length > 0) {
    const abs = path.join(projectDir, LOCAL_PATCH_PATH);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(
      abs,
      `# Local changes to machine-owned lane code, preserved by \`create-cmp upgrade --harness\`.\n` +
        `#\n` +
        `# The lane was replaced with the new engine's version. These edits were NOT\n` +
        `# re-applied — a local change to lane code is a fork this app is maintaining,\n` +
        `# and re-applying it silently would hide that.\n` +
        `#\n` +
        `# This diff is against the lane you WERE on, so it may not apply cleanly to\n` +
        `# the new one. That is not a defect in the patch: it is the merge this tool\n` +
        `# deliberately declined to do behind your back. To attempt it:\n` +
        `#\n` +
        `#     git apply --reject ${LOCAL_PATCH_PATH}\n` +
        `#\n` +
        `# What applies, applies; the rest lands in *.rej for you to judge. If it does\n` +
        `# conflict, that IS the finding — the engine has moved under this fork.\n` +
        `#\n` +
        `# Better still: upstream the change so the next upgrade carries it for you.\n` +
        `# Delete this file once you have decided.\n\n` +
        patchChunks.join("\n"),
    );
    patchPath = LOCAL_PATCH_PATH;
  }
  return { written, created, deleted, sidecars, backups, patched, patchPath };
}

/**
 * Reconstruct the engine config from a parsed create-cmp.json record.
 * Key names differ slightly (record: name/bundleId ↔ config:
 * appName/iosBundleId). Fields the record predates default to
 * "feature absent" — a record written before a toggle existed describes an
 * app whose tree does NOT carry that feature, so stamping without it mirrors
 * the app best.
 * @param {object} record parsed create-cmp.json
 * @param {string} targetDir where the reconstructed stamp should land
 * @returns {object} engine config (options.schema.json shape)
 */
export function configFromSpecRecord(record, targetDir) {
  return {
    appName: record.name,
    package: record.package,
    iosBundleId: record.bundleId,
    region: record.region ?? "us-central1",
    themePrefix: record.themePrefix,
    platforms: record.platforms ?? { android: true, ios: true },
    firebase: record.firebase ?? { enabled: false },
    room: record.room ?? false,
    e2e: record.e2e ?? false,
    inspector: record.inspector ?? false,
    devClient: record.devClient ?? false,
    tabs: record.tabs ?? [
      { label: "Home", icon: "home" },
      { label: "Profile", icon: "person" },
    ],
    targetDir,
  };
}
