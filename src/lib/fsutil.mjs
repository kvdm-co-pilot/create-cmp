// Filesystem helpers: recursive copy and a text-file walker.

import fs from "node:fs";
import path from "node:path";

/**
 * Recursively copy srcDir → destDir, creating dest dirs as needed.
 * Symlinks are copied as symlinks. Existing dest files are overwritten.
 * @param {string} srcDir
 * @param {string} destDir
 */
export function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(s);
      try { fs.unlinkSync(d); } catch {}
      fs.symlinkSync(link, d);
    } else if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * Yield absolute paths of every regular file under dir (recursive).
 * @param {string} dir
 * @returns {string[]}
 */
export function listFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

/**
 * Yield absolute paths of every directory under dir (recursive), DEEPEST FIRST
 * (so path-token renames of nested dirs are safe to apply bottom-up).
 * @param {string} dir
 * @returns {string[]}
 */
export function listDirsDeepestFirst(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        const full = path.join(cur, e.name);
        out.push(full);
        stack.push(full);
      }
    }
  }
  // Deepest first = longest path first.
  out.sort((a, b) => b.length - a.length);
  return out;
}

export function isMacOS() {
  return process.platform === "darwin";
}

export function isLinux() {
  return process.platform === "linux";
}
