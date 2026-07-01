// Package-source directory rename: com/example/app → com/<org>/<app>.
//
// This is the classic scaffolder bug: a naive `mv com/example/app com/acme/app`
// fails or corrupts when the new package SHARES a prefix with the old one
// (e.g. com.example.app → com.example.demo keeps `com/example`), when the new
// package is DEEPER or SHALLOWER, or when an intermediate dir already holds
// other content. We handle it by:
//   1. moving the leaf source tree to a unique temp location (atomic rename),
//   2. removing now-empty old intermediate dirs,
//   3. creating the new intermediate dirs,
//   4. moving the temp tree into the final location.
// Step (1)+(4) decouples source and destination so overlapping prefixes,
// nesting changes, and re-runs (idempotency) all behave.

import fs from "node:fs";
import path from "node:path";

const OLD_PACKAGE_PATH = "com/example/app";

/**
 * Rename the package source dir under each root.
 * @param {string} projectDir absolute path to the stamped project
 * @param {string[]} packageSourceRoots e.g. ["composeApp/src/commonMain/kotlin", ...]
 * @param {string} newPackagePath slash form, e.g. "com/acme/app"
 * @param {object} [opts]
 * @param {(msg:string)=>void} [opts.log]
 * @returns {{moved: string[], skipped: string[]}}
 */
export function renamePackageDirs(projectDir, packageSourceRoots, newPackagePath, opts = {}) {
  const log = opts.log || (() => {});
  const moved = [];
  const skipped = [];

  const oldRel = OLD_PACKAGE_PATH;
  const newRel = newPackagePath.split("/").filter(Boolean).join("/");

  for (const root of packageSourceRoots) {
    const rootAbs = path.join(projectDir, root);
    const oldAbs = path.join(rootAbs, oldRel);
    const newAbs = path.join(rootAbs, newRel);

    if (!fs.existsSync(oldAbs) || !fs.statSync(oldAbs).isDirectory()) {
      // Idempotent: if already renamed (or root absent) there's nothing to do.
      skipped.push(root);
      continue;
    }

    if (path.resolve(oldAbs) === path.resolve(newAbs)) {
      // Same package — no rename needed.
      skipped.push(root);
      continue;
    }

    // 1. Move the leaf to a unique temp dir under the root.
    const tmpAbs = path.join(rootAbs, `.__cmp_pkg_tmp_${process.pid}_${moved.length}`);
    if (fs.existsSync(tmpAbs)) fs.rmSync(tmpAbs, { recursive: true, force: true });
    fs.renameSync(oldAbs, tmpAbs);

    // 2. Prune now-empty old intermediate dirs (com/example, com) up to root.
    pruneEmptyDirsUp(rootAbs, path.dirname(oldAbs));

    // 3. Ensure new parent exists.
    fs.mkdirSync(path.dirname(newAbs), { recursive: true });

    // 4. Move temp into place. If destination already exists (overlap edge),
    //    merge contents rather than clobber.
    if (fs.existsSync(newAbs)) {
      mergeMove(tmpAbs, newAbs);
      fs.rmSync(tmpAbs, { recursive: true, force: true });
    } else {
      fs.renameSync(tmpAbs, newAbs);
    }

    moved.push(root);
    log(`  renamed ${root}/${oldRel} → ${root}/${newRel}`);
  }

  return { moved, skipped };
}

/**
 * Remove empty directories walking up from `startDir` until `stopAtDir`
 * (exclusive). Stops at the first non-empty directory.
 */
function pruneEmptyDirsUp(stopAtDir, startDir) {
  let dir = startDir;
  const stop = path.resolve(stopAtDir);
  while (path.resolve(dir) !== stop && path.resolve(dir).startsWith(stop)) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      break;
    }
    if (entries.length > 0) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

/**
 * Recursively move src tree contents into an existing dest dir, merging.
 */
function mergeMove(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      mergeMove(s, d);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.renameSync(s, d);
    }
  }
}
