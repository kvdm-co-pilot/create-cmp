// The build handshake — a process that knows whether it is running the code on
// disk (docs/proposals/console-build-handshake.md).
//
// The failure being pinned: twice in two days a long-lived console served a page
// built from an older module graph while the rebuilt code sat on disk, and the
// only way to detect it was grepping the fetched HTML for a marker string.
//
// These tests pin the DERIVATION and its refusals, not this machine's current
// state: they must pass on a fresh checkout, a stale one, bundled or not.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BUNDLE_MARKER,
  buildStatus,
  diskBuildId,
  loadedBuildId,
  recordedHash,
  runningFrom,
  sourceFiles,
  sourcesHash,
} from "../src/lib/build-id.mjs";
import { staleConsoleBannerHtml, provenanceHtml } from "../src/lib/console-shell.mjs";

test("sourcesHash: deterministic over the same tree, and moves when any source byte moves", () => {
  const a = sourcesHash();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, sourcesHash(), "same tree, same hash — the comparison is worthless otherwise");

  // A fixture tree, so the assertion is about the ALGORITHM, not this checkout.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-build-id-"));
  fs.mkdirSync(path.join(root, "src", "lib"), { recursive: true });
  fs.mkdirSync(path.join(root, "bin"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "lib", "a.mjs"), "export const a = 1;\n");
  fs.writeFileSync(path.join(root, "bin", "server.mjs"), "// entry\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.0", dependencies: { x: "^1" } }));

  const before = sourcesHash(root);
  fs.writeFileSync(path.join(root, "src", "lib", "a.mjs"), "export const a = 2;\n");
  assert.notEqual(sourcesHash(root), before, "a changed source byte must change the build id");

  // Dependency versions and the package version are inputs too: both end up in
  // the built artifact, so a hash that ignored them would attest less than it appears to.
  fs.writeFileSync(path.join(root, "src", "lib", "a.mjs"), "export const a = 2;\n");
  const withDeps = sourcesHash(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.0", dependencies: { x: "^2" } }));
  assert.notEqual(sourcesHash(root), withDeps, "a dependency bump is a different artifact");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.1", dependencies: { x: "^2" } }));
  const v101 = sourcesHash(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.0.2", dependencies: { x: "^2" } }));
  assert.notEqual(sourcesHash(root), v101, "the version is inlined into the bundle, so it is an input");

  fs.rmSync(root, { recursive: true, force: true });
});

test("sourceFiles: every first-party .mjs plus the entry, sorted — order is part of the hash", () => {
  const files = sourceFiles();
  assert.ok(files.length > 10, `expected the real src tree, got ${files.length} files`);
  assert.ok(files.every((f) => f.endsWith(".mjs")));
  assert.ok(files.some((f) => f.endsWith("bin/server.mjs")), "the entry point is an input");
  assert.deepEqual(files, [...files].sort(), "unsorted input order would make the hash machine-dependent");
});

test("runningFrom: import.meta.url is the witness — dist/ means bundle, anything else means source", () => {
  assert.equal(runningFrom(pathToFileURL("/x/inspector/mcp/dist/server.mjs").href).mode, "bundle");
  assert.equal(runningFrom(pathToFileURL("/x/inspector/mcp/src/lib/build-id.mjs").href).mode, "source");
  // This test file runs from src, so the default must agree.
  assert.equal(runningFrom().mode, "source");
});

test("recordedHash: reads the bundle marker; absent or unreadable is null, never a guess", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-marker-"));
  const good = path.join(dir, "server.mjs");
  fs.writeFileSync(good, `// GENERATED\n// ${BUNDLE_MARKER} ${"a".repeat(64)}\nexport const x = 1;\n`);
  assert.equal(recordedHash(good), "a".repeat(64));

  const bare = path.join(dir, "bare.mjs");
  fs.writeFileSync(bare, "export const x = 1;\n");
  assert.equal(recordedHash(bare), null, "a hand-edited bundle with no marker is UNKNOWN, not fresh");
  assert.equal(recordedHash(path.join(dir, "nope.mjs")), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("buildStatus: stale is TRI-STATE — unknown never renders as a clean bill of health", () => {
  const fresh = buildStatus(sourcesHash());
  assert.equal(fresh.stale, false, "a just-computed id matches disk");
  assert.equal(fresh.mode, "source");
  assert.match(fresh.id, /^[0-9a-f]{64}$/);

  const stale = buildStatus("f".repeat(64));
  assert.equal(stale.stale, true, "a loaded id that differs from disk is stale");
  assert.equal(stale.id, "f".repeat(64));
  assert.notEqual(stale.diskId, stale.id);

  // The null case is the one that matters: an unknown loaded build must be
  // `null`, NOT `false` — refusal over fabrication.
  const unknown = buildStatus(null);
  assert.equal(unknown.stale, null, "unknown freshness must not read as fresh");
});

test("loadedBuildId: reports the id AND the mode it came from", () => {
  const loaded = loadedBuildId();
  assert.equal(loaded.mode, "source");
  assert.equal(loaded.id, sourcesHash(), "in source mode the loaded id IS the sources hash");
  assert.equal(loaded.id, diskBuildId(), "nothing changed between the two calls, so they agree");
});

test("the stale banner: silent when fresh, silent when UNKNOWN, loud when stale", () => {
  assert.equal(staleConsoleBannerHtml(null), "");
  assert.equal(staleConsoleBannerHtml({ id: "a".repeat(64), mode: "source", stale: false, diskId: "a".repeat(64) }), "");
  assert.equal(
    staleConsoleBannerHtml({ id: null, mode: "source", stale: null, diskId: null }),
    "",
    "unknown freshness renders no banner — it is not evidence of a problem, and not evidence of health",
  );

  const html = staleConsoleBannerHtml({ id: "a".repeat(64), mode: "bundle", stale: true, diskId: "b".repeat(64) });
  assert.match(html, /banner-stale-build/);
  assert.match(html, /aaaaaaaa/);
  assert.match(html, /bbbbbbbb/);
  assert.match(html, /rebuilt after this console started/, "bundle mode names the bundle as the cause");
  assert.match(html, /bin\/console\.mjs/, "the banner carries the command that fixes it");

  const src = staleConsoleBannerHtml({ id: "a".repeat(64), mode: "source", stale: true, diskId: "b".repeat(64) });
  assert.match(src, /sources changed after it started/, "source mode names the sources");
});

test("provenance: the page states which console build drew it; absent stays silent", () => {
  assert.match(provenanceHtml({ build: { id: "abcdef1234567890" } }), /console <code>abcdef12<\/code>/);
  assert.doesNotMatch(provenanceHtml({}), /console <code>/);
  assert.doesNotMatch(provenanceHtml({ build: { id: null } }), /console <code>/);
});
