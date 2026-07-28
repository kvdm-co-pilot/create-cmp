// Which code is this process actually running — and is it the code on disk?
//
// The failure this exists to kill (observed twice, 2026-07-27 and -28): a
// long-lived console served a page built from an older module graph while the
// rebuilt bundle sat on disk. Nothing in the system could say so; it was
// diagnosed by grepping the fetched HTML for a marker string. Making the
// console a detached process (bin/console.mjs) — which it needed to be, so it
// stops dying under the human's cursor — makes that worse, not better: a
// process that survives everything can serve stale code indefinitely.
//
// So a process reports the build it LOADED, recomputes what is on disk NOW, and
// the difference is staleness. Derived, never claimed — the same stance the
// verify lane takes toward doneness.
//
// SINGLE DEFINITION. scripts/build-bundle.mjs stamps a bundle with
// `cmp:bundle-inputs <hash>` and test/bundle-freshness.test.mjs gates that the
// committed bundle matches its sources. That hash is the build id; this module
// owns its computation and the bundler imports it. The bundler cannot own it —
// it depends on esbuild, and importing that from the service would drag a build
// tool into the shipped bundle.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `inspector/mcp` — this file is src/lib/build-id.mjs, so up two. */
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const BUNDLE_MARKER = "cmp:bundle-inputs";

/**
 * Every first-party source the bundle is built from, sorted — the hash inputs.
 * Deterministic order (sorted at every level) because the hash depends on it.
 */
export function sourceFiles(root = PKG_ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && p.endsWith(".mjs")) out.push(p);
    }
  };
  walk(path.join(root, "src"));
  out.push(path.join(root, "bin", "server.mjs"));
  return out.sort();
}

/**
 * Hash of the sources AND the declared dependency versions AND the package
 * version. Dependencies are in the hash on purpose: a bundle built against a
 * different SDK version is a different artifact even when not one first-party
 * byte changed. The version is inlined into the bundle by the bundler's
 * `define`, so leaving it out would let a version bump change the artifact while
 * the hash still claimed the artifact was current — the hash must cover
 * everything that ends up in the file, or it attests less than it appears to.
 */
export function sourcesHash(root = PKG_ROOT) {
  const h = createHash("sha256");
  for (const f of sourceFiles(root)) {
    h.update(path.relative(root, f).split(path.sep).join("/"));
    h.update("\0");
    h.update(fs.readFileSync(f));
    h.update("\0");
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  h.update(JSON.stringify(pkg.dependencies ?? {}));
  h.update(String(pkg.version ?? ""));
  return h.digest("hex");
}

/** The `cmp:bundle-inputs` hash recorded in a built bundle, or null when absent/unreadable. */
export function recordedHash(bundlePath = path.join(PKG_ROOT, "dist", "server.mjs")) {
  let text;
  try {
    text = fs.readFileSync(bundlePath, "utf8").slice(0, 4096);
  } catch {
    return null;
  }
  const m = text.match(new RegExp(`${BUNDLE_MARKER}\\s+([0-9a-f]{64})`));
  return m ? m[1] : null;
}

/**
 * Is this module running from the bundle, or from the `src` tree?
 *
 * `import.meta.url` is the honest witness: esbuild collapses every module into
 * dist/server.mjs, so inside a bundle this file's own URL IS the bundle's path.
 * From a source checkout it is src/lib/build-id.mjs. Nothing else — not argv,
 * not cwd, not an env var — reports what was actually loaded.
 * @returns {{mode: "bundle"|"source", file: string}}
 */
export function runningFrom(metaUrl = import.meta.url) {
  const file = fileURLToPath(metaUrl);
  return { mode: path.basename(path.dirname(file)) === "dist" ? "bundle" : "source", file };
}

/**
 * The build id of the code THIS PROCESS LOADED. Call once at startup and hold
 * the value: recomputing later would silently track the disk and defeat the
 * entire comparison.
 *
 * - bundle mode: the marker stamped into the bundle we are running from.
 * - source mode: the hash of the sources, as they are right now (which, at
 *   startup, is what we loaded).
 *
 * `null` when it cannot be determined (unreadable files, a hand-edited bundle
 * with no marker). Never a fabricated value — an unknown build must not read as
 * a known-good one.
 * @returns {{id: string|null, mode: "bundle"|"source", file: string}}
 */
export function loadedBuildId(metaUrl = import.meta.url) {
  const { mode, file } = runningFrom(metaUrl);
  try {
    return { id: mode === "bundle" ? recordedHash(file) : sourcesHash(), mode, file };
  } catch {
    return { id: null, mode, file };
  }
}

/**
 * The build id of the code on disk RIGHT NOW, in the same terms as
 * `loadedBuildId` — so the two are comparable.
 *
 * Both modes resolve to the same question ("what would a process started now be
 * running?"), which is why bundle mode re-reads the marker rather than hashing
 * sources: a bundle that lags its sources is a separate concern, already gated
 * by test/bundle-freshness.test.mjs, and folding it in here would make every
 * un-rebuilt source edit look like console staleness.
 * @returns {string|null}
 */
export function diskBuildId(metaUrl = import.meta.url) {
  const { mode, file } = runningFrom(metaUrl);
  try {
    return mode === "bundle" ? recordedHash(file) : sourcesHash();
  } catch {
    return null;
  }
}

/**
 * The whole handshake, as one value for `/status` and the page.
 *
 * `stale` is TRI-STATE and the null matters: unknown freshness must never
 * render as a clean bill of health (refusal over fabrication). Only two known,
 * differing hashes are `stale: true`.
 * @param {string|null} loadedId the id captured at startup — pass it in; never re-derive here
 * @returns {{id: string|null, mode: string, stale: boolean|null, diskId: string|null}}
 */
export function buildStatus(loadedId, metaUrl = import.meta.url) {
  const { mode } = runningFrom(metaUrl);
  const disk = diskBuildId(metaUrl);
  const stale = loadedId === null || disk === null ? null : loadedId !== disk;
  return { id: loadedId, mode, stale, diskId: disk };
}
