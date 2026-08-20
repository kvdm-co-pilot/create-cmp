// Tests for `create-cmp upgrade --harness` (src/lib/harness-upgrade.mjs):
// the three-way engine-file refresh. Every row of the decision table is
// exercised with in-memory buffers or synthetic temp trees — no npm, no
// network, no real `npm pack` — and the merge itself uses the real
// `git merge-file` (git is a hard requirement of this repo, offline).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  EXCLUDED_PATTERNS,
  SIDECAR_SUFFIX,
  applyHarnessPlan,
  configFromSpecRecord,
  decideFile,
  decideRegionFile,
  isExcludedPath,
  matchesPattern,
  mergeThreeWay,
  planHarnessUpgrade,
} from "../src/lib/harness-upgrade.mjs";
import { BACKUP_SUFFIX } from "../src/lib/upgrade.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, "..", "bin", "create-cmp.mjs");

const B = (s) => Buffer.from(s);

// --- exclusion list ------------------------------------------------------------

test("isExcludedPath: every exclusion pattern matches its real-world path", () => {
  const shouldExclude = [
    "create-cmp.json",
    "qa/evidence/receipt-123.json",
    "qa/evidence/nested/deeper.png",
    "qa/approvals.json",
    "qa/comments.json",
    "qa/golden/home.json",
    ".git/config",
    ".git/objects/ab/cdef",
    "build/outputs/apk/app.apk",
    "composeApp/build/generated/Foo.kt", // **/build/**
    ".gradle/caches/thing.bin",
    "local.properties",
    "keystore.properties",
    "composeApp/keystore.properties", // secrets excluded at ANY depth
    "google-services.json",
    "composeApp/google-services.json", // the real stamped location
    "iosApp/GoogleService-Info.plist",
    "GoogleService-Info.plist",
  ];
  for (const p of shouldExclude) {
    assert.equal(isExcludedPath(p), true, `expected excluded: ${p}`);
  }
});

test("isExcludedPath: near-misses are NOT excluded", () => {
  const shouldSweep = [
    ".gitignore", // not under .git/
    "qa/verify.mjs",
    "qa/golden-tools.mjs", // not under qa/golden/
    "rebuild/notes.md", // segment != "build"
    "buildSrc/build.gradle.kts", // "buildSrc" segment != "build"
    "docs/local.properties.md", // basename != local.properties
    "composeApp/build.gradle.kts", // a FILE named build.gradle.kts, not a build/ dir
  ];
  for (const p of shouldSweep) {
    assert.equal(isExcludedPath(p), false, `expected swept: ${p}`);
  }
});

test("matchesPattern grammar: root-anchored dir globs do not match elsewhere", () => {
  assert.equal(matchesPattern("app/qa/evidence/x.json", "qa/evidence/**"), false);
  assert.equal(matchesPattern("qa/evidence/x.json", "qa/evidence/**"), true);
  assert.equal(matchesPattern("deep/build/x", "**/build/**"), true);
  assert.equal(matchesPattern("build/x", "build/**"), true);
});

// --- git three-way merge --------------------------------------------------------

test("mergeThreeWay: disjoint edits merge cleanly, both edits survive", () => {
  const base = B("line1\nline2\nline3\nline4\nline5\n");
  const theirs = B("line1 APP-EDIT\nline2\nline3\nline4\nline5\n");
  const next = B("line1\nline2\nline3\nline4\nline5 ENGINE-EDIT\n");
  const r = mergeThreeWay(theirs, base, next);
  assert.equal(r.clean, true);
  const merged = r.content.toString();
  assert.match(merged, /line1 APP-EDIT/);
  assert.match(merged, /line5 ENGINE-EDIT/);
});

test("mergeThreeWay: same-region edits conflict", () => {
  const base = B("alpha\nbeta\ngamma\n");
  const theirs = B("alpha\nbeta APP\ngamma\n");
  const next = B("alpha\nbeta ENGINE\ngamma\n");
  const r = mergeThreeWay(theirs, base, next);
  assert.equal(r.clean, false);
  assert.equal(r.content, null);
});

// --- decision table (decideFile) ------------------------------------------------

const neverMerge = () => {
  throw new Error("merge must not be invoked for this row");
};

test("row: new == base → unchanged (silent), regardless of the app's edits", () => {
  const d = decideFile({
    relPath: "a.txt",
    base: B("same"),
    next: B("same"),
    theirs: B("app rewrote this entirely"),
    merge: neverMerge,
  });
  assert.equal(d.bucket, "unchanged");
  assert.equal(d.write, null);
  assert.equal(d.sidecar, null);
  assert.equal(d.remove, false);
});

test("row: theirs == base, new != base → applied (take the new content)", () => {
  const d = decideFile({
    relPath: "a.txt",
    base: B("v1"),
    next: B("v2"),
    theirs: B("v1"),
    merge: neverMerge,
  });
  assert.equal(d.bucket, "applied");
  assert.equal(d.write.toString(), "v2");
});

test("row: theirs == new → current (silent)", () => {
  const d = decideFile({
    relPath: "a.txt",
    base: B("v1"),
    next: B("v2"),
    theirs: B("v2"),
    merge: neverMerge,
  });
  assert.equal(d.bucket, "current");
  assert.equal(d.write, null);
});

test("row: all three differ, clean three-way → merged (both edits survive)", () => {
  const base = B("one\ntwo\nthree\nfour\nfive\n");
  const theirs = B("one APP\ntwo\nthree\nfour\nfive\n");
  const next = B("one\ntwo\nthree\nfour\nfive ENGINE\n");
  const d = decideFile({ relPath: "a.txt", base, next, theirs }); // real git merge
  assert.equal(d.bucket, "merged");
  assert.match(d.write.toString(), /one APP/);
  assert.match(d.write.toString(), /five ENGINE/);
});

test("row: merge that reproduces the app's file exactly → current (idempotent re-run)", () => {
  // The app already carries the engine's change (e.g. a previous --harness
  // apply) PLUS its own addition — the three sides differ pairwise, but the
  // clean merge equals theirs, so a re-run must go quiet, not re-report merged.
  const base = B("one\ntwo\nthree\nfour\nfive\n");
  const next = B("one ENGINE\ntwo\nthree\nfour\nfive\n");
  const theirs = B("one ENGINE\ntwo\nthree\nfour\nfive\nAPP APPENDIX\n");
  const d = decideFile({ relPath: "a.txt", base, next, theirs });
  assert.equal(d.bucket, "current");
  assert.equal(d.write, null);
});

test("row: all three differ, same region → conflicted with the NEW content as sidecar", () => {
  const base = B("x\ny\nz\n");
  const theirs = B("x\ny APP\nz\n");
  const next = B("x\ny ENGINE\nz\n");
  const d = decideFile({ relPath: "a.txt", base, next, theirs });
  assert.equal(d.bucket, "conflicted");
  assert.equal(d.write, null, "the app's file must never be written");
  assert.equal(d.sidecar.toString(), next.toString());
});

test("row: app deleted a file the engine changed → conflicted (never resurrect silently)", () => {
  const d = decideFile({
    relPath: "a.txt",
    base: B("v1"),
    next: B("v2"),
    theirs: null,
    merge: neverMerge,
  });
  assert.equal(d.bucket, "conflicted");
  assert.equal(d.sidecar.toString(), "v2");
});

test("row: in new only, absent in app → added (apply)", () => {
  const d = decideFile({ relPath: "a.txt", base: null, next: B("fresh"), theirs: null, merge: neverMerge });
  assert.equal(d.bucket, "added");
  assert.equal(d.write.toString(), "fresh");
});

test("row: in new only, app already has identical content → current", () => {
  const d = decideFile({ relPath: "a.txt", base: null, next: B("fresh"), theirs: B("fresh"), merge: neverMerge });
  assert.equal(d.bucket, "current");
});

test("row: in new only, app has something DIFFERENT there → conflicted", () => {
  const d = decideFile({ relPath: "a.txt", base: null, next: B("fresh"), theirs: B("the app's own"), merge: neverMerge });
  assert.equal(d.bucket, "conflicted");
  assert.equal(d.sidecar.toString(), "fresh");
});

test("row: in base only, app never touched it → removed (delete)", () => {
  const d = decideFile({ relPath: "a.txt", base: B("old"), next: null, theirs: B("old"), merge: neverMerge });
  assert.equal(d.bucket, "removed");
  assert.equal(d.remove, true);
});

test("row: in base only, app MODIFIED it → orphaned (keep, report)", () => {
  const d = decideFile({ relPath: "a.txt", base: B("old"), next: null, theirs: B("old + app work"), merge: neverMerge });
  assert.equal(d.bucket, "orphaned");
  assert.equal(d.remove, false);
  assert.equal(d.write, null);
});

test("row: in base only, already gone from the app → current (silent)", () => {
  const d = decideFile({ relPath: "a.txt", base: B("old"), next: null, theirs: null, merge: neverMerge });
  assert.equal(d.bucket, "current");
});

test("row: app-authored file (in neither base nor new) is invisible → null", () => {
  const d = decideFile({ relPath: "a.txt", base: null, next: null, theirs: B("app's own"), merge: neverMerge });
  assert.equal(d, null);
});

test("binary rows: replace when untouched, conflict when touched — merge NEVER invoked", () => {
  const applied = decideFile({
    relPath: "composeApp/src/res/icon.png",
    base: B("PNG-v1"),
    next: B("PNG-v2"),
    theirs: B("PNG-v1"),
    merge: neverMerge,
  });
  assert.equal(applied.bucket, "applied");
  assert.equal(applied.write.toString(), "PNG-v2");

  const conflicted = decideFile({
    relPath: "composeApp/src/res/icon.png",
    base: B("PNG-v1"),
    next: B("PNG-v2"),
    theirs: B("PNG-app-edit"),
    merge: neverMerge, // would throw if a binary were three-way merged
  });
  assert.equal(conflicted.bucket, "conflicted");
  assert.equal(conflicted.sidecar.toString(), "PNG-v2");
});

// --- planHarnessUpgrade over synthetic trees ------------------------------------

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

function tmpTrees() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harness-upg-"));
  return {
    root,
    base: path.join(root, "base"),
    next: path.join(root, "new"),
    app: path.join(root, "app"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test("planHarnessUpgrade: one synthetic tree hits every bucket, sorted and counted", () => {
  const t = tmpTrees();
  try {
    writeTree(t.base, {
      "unchanged.txt": "same\n",
      "applied.txt": "v1\n",
      "current.txt": "v1\n",
      "merged.txt": "one\ntwo\nthree\nfour\nfive\n",
      "conflicted.txt": "x\ny\nz\n",
      "removed.txt": "old\n",
      "orphaned.txt": "old\n",
    });
    writeTree(t.next, {
      "unchanged.txt": "same\n",
      "applied.txt": "v2\n",
      "current.txt": "v2\n",
      "merged.txt": "one\ntwo\nthree\nfour\nfive ENGINE\n",
      "conflicted.txt": "x\ny ENGINE\nz\n",
      "added.txt": "fresh\n",
    });
    writeTree(t.app, {
      "unchanged.txt": "app rewrote this\n", // engine never changed → silent
      "applied.txt": "v1\n",
      "current.txt": "v2\n",
      "merged.txt": "one APP\ntwo\nthree\nfour\nfive\n",
      "conflicted.txt": "x\ny APP\nz\n",
      "removed.txt": "old\n",
      "orphaned.txt": "old + app work\n",
      "app-authored.kt": "the app's own feature\n", // in neither stamp → invisible
    });

    const plan = planHarnessUpgrade({ baseDir: t.base, newDir: t.next, projectDir: t.app });
    const byBucket = {};
    for (const e of plan.entries) byBucket[e.relPath] = e.bucket;

    assert.equal(byBucket["unchanged.txt"], "unchanged");
    assert.equal(byBucket["applied.txt"], "applied");
    assert.equal(byBucket["current.txt"], "current");
    assert.equal(byBucket["merged.txt"], "merged");
    assert.equal(byBucket["conflicted.txt"], "conflicted");
    assert.equal(byBucket["added.txt"], "added");
    assert.equal(byBucket["removed.txt"], "removed");
    assert.equal(byBucket["orphaned.txt"], "orphaned");
    assert.equal(byBucket["app-authored.kt"], undefined, "app-authored files are invisible");

    assert.deepEqual(plan.counts, {
      excluded: 0,
      "region-clean": 0,
      "region-absorbed": 0,
      "region-patched": 0,
      "region-restored": 0,
      "region-removed": 0,
      unchanged: 1,
      current: 1,
      applied: 1,
      merged: 1,
      conflicted: 1,
      added: 1,
      removed: 1,
      orphaned: 1,
    });
  } finally {
    t.cleanup();
  }
});

test("planHarnessUpgrade: every exclusion-list path is excluded and lands in NO other bucket", () => {
  const t = tmpTrees();
  try {
    // Each excluded path with DIFFERENT base/new/app content — outside the
    // exclusion list these would all land in loud buckets.
    const excluded = {
      "create-cmp.json": true,
      "qa/evidence/run-1.json": true,
      "qa/approvals.json": true,
      "qa/comments.json": true,
      "qa/golden/home.json": true,
      ".git/config": true,
      "build/out.apk": true,
      "composeApp/build/gen.kt": true,
      ".gradle/cache.bin": true,
      "local.properties": true,
      "keystore.properties": true,
      "composeApp/google-services.json": true,
      "iosApp/GoogleService-Info.plist": true,
    };
    const mk = (suffix) =>
      Object.fromEntries(Object.keys(excluded).map((p) => [p, `${p} ${suffix}\n`]));
    writeTree(t.base, { ...mk("base"), "swept.txt": "v1\n" });
    writeTree(t.next, { ...mk("new"), "swept.txt": "v2\n" });
    writeTree(t.app, { ...mk("app"), "swept.txt": "v1\n" });

    const plan = planHarnessUpgrade({ baseDir: t.base, newDir: t.next, projectDir: t.app });
    for (const p of Object.keys(excluded)) {
      const entry = plan.entries.find((e) => e.relPath === p);
      assert.ok(entry, `excluded path swept from the walk entirely: ${p}`);
      assert.equal(entry.bucket, "excluded", `wrong bucket for ${p}: ${entry.bucket}`);
    }
    assert.equal(plan.counts.excluded, Object.keys(excluded).length);
    assert.equal(plan.counts.applied, 1, "the one non-excluded file still flows");
    // And no excluded path carries any action.
    for (const e of plan.entries.filter((x) => x.bucket === "excluded")) {
      assert.equal(e.write, null);
      assert.equal(e.sidecar, null);
      assert.equal(e.remove, false);
    }
  } finally {
    t.cleanup();
  }
});

// --- applyHarnessPlan ------------------------------------------------------------

test("apply: conflict leaves the app's file byte-for-byte and writes a .cmp-new sidecar", () => {
  // An APP-SHAPED file: both sides edited the same region, so the app's work
  // is never clobbered. (Lane files answer a different question — they are
  // machine-owned and replaced wholesale; see the region tests below.)
  const t = tmpTrees();
  try {
    writeTree(t.base, { "composeApp/build.gradle.kts": "x\ny\nz\n" });
    writeTree(t.next, { "composeApp/build.gradle.kts": "x\ny ENGINE\nz\n" });
    const appContent = "x\ny APP\nz\n";
    writeTree(t.app, { "composeApp/build.gradle.kts": appContent });

    const plan = planHarnessUpgrade({ baseDir: t.base, newDir: t.next, projectDir: t.app });
    const result = applyHarnessPlan(
      t.app,
      plan.entries.filter((e) => e.write !== null || e.sidecar !== null || e.remove)
    );

    const appFile = path.join(t.app, "composeApp", "build.gradle.kts");
    assert.equal(fs.readFileSync(appFile, "utf8"), appContent, "app file must be untouched");
    assert.equal(fs.existsSync(appFile + BACKUP_SUFFIX), false, "no backup — nothing was changed");
    const sidecar = appFile + SIDECAR_SUFFIX;
    assert.ok(fs.existsSync(sidecar), "sidecar must exist");
    assert.equal(fs.readFileSync(sidecar, "utf8"), "x\ny ENGINE\nz\n", "sidecar carries the NEW engine content");
    assert.deepEqual(result.sidecars, ["composeApp/build.gradle.kts" + SIDECAR_SUFFIX]);
  } finally {
    t.cleanup();
  }
});

test("apply: applied/merged/added/removed all land with backups where a file changed", () => {
  const t = tmpTrees();
  try {
    writeTree(t.base, {
      "applied.txt": "v1\n",
      "merged.txt": "one\ntwo\nthree\nfour\nfive\n",
      "removed.txt": "old\n",
    });
    writeTree(t.next, {
      "applied.txt": "v2\n",
      "merged.txt": "one\ntwo\nthree\nfour\nfive ENGINE\n",
      "sub/added.txt": "fresh\n",
    });
    writeTree(t.app, {
      "applied.txt": "v1\n",
      "merged.txt": "one APP\ntwo\nthree\nfour\nfive\n",
      "removed.txt": "old\n",
    });

    const plan = planHarnessUpgrade({ baseDir: t.base, newDir: t.next, projectDir: t.app });
    const result = applyHarnessPlan(
      t.app,
      plan.entries.filter((e) => e.write !== null || e.sidecar !== null || e.remove)
    );

    // applied: new content, backup of the old
    assert.equal(fs.readFileSync(path.join(t.app, "applied.txt"), "utf8"), "v2\n");
    assert.equal(fs.readFileSync(path.join(t.app, "applied.txt" + BACKUP_SUFFIX), "utf8"), "v1\n");
    // merged: both edits, backup of the pre-merge file
    const merged = fs.readFileSync(path.join(t.app, "merged.txt"), "utf8");
    assert.match(merged, /one APP/);
    assert.match(merged, /five ENGINE/);
    assert.ok(fs.existsSync(path.join(t.app, "merged.txt" + BACKUP_SUFFIX)));
    // added: created (into a new dir), no backup
    assert.equal(fs.readFileSync(path.join(t.app, "sub", "added.txt"), "utf8"), "fresh\n");
    assert.equal(fs.existsSync(path.join(t.app, "sub", "added.txt" + BACKUP_SUFFIX)), false);
    assert.deepEqual(result.created, ["sub/added.txt"]);
    // removed: gone, backup remains
    assert.equal(fs.existsSync(path.join(t.app, "removed.txt")), false);
    assert.equal(fs.readFileSync(path.join(t.app, "removed.txt" + BACKUP_SUFFIX), "utf8"), "old\n");
    assert.deepEqual(result.deleted, ["removed.txt"]);
    assert.equal(result.sidecars.length, 0);
  } finally {
    t.cleanup();
  }
});

// --- config reconstruction -------------------------------------------------------

test("configFromSpecRecord: record keys map to config keys (name→appName, bundleId→iosBundleId)", () => {
  const cfg = configFromSpecRecord(
    {
      schemaVersion: 1,
      name: "Demo App",
      package: "com.demo.app",
      bundleId: "com.demo.ios",
      themePrefix: "Demo",
      region: "europe-west2",
      platforms: { android: true, ios: true },
      firebase: { enabled: true, auth: "both", firestore: true, storage: true, functions: true, fcm: true },
      room: true,
      e2e: true,
      inspector: true,
      devClient: true,
      tabs: [{ label: "Home", icon: "home" }],
      engineVersion: "0.10.0",
    },
    "/tmp/somewhere"
  );
  assert.equal(cfg.appName, "Demo App");
  assert.equal(cfg.iosBundleId, "com.demo.ios");
  assert.equal(cfg.package, "com.demo.app");
  assert.equal(cfg.targetDir, "/tmp/somewhere");
  assert.equal(cfg.devClient, true);
});

test("configFromSpecRecord: fields the record predates default to feature-absent", () => {
  const cfg = configFromSpecRecord(
    { name: "Old", package: "com.old.app", bundleId: "com.old.app", themePrefix: "Old", region: "us-central1" },
    "/tmp/x"
  );
  assert.equal(cfg.devClient, false, "a record without the toggle describes an app without the feature");
  assert.equal(cfg.room, false);
  assert.equal(cfg.e2e, false);
  assert.equal(cfg.inspector, false);
  assert.equal(cfg.firebase.enabled, false);
  assert.ok(Array.isArray(cfg.tabs) && cfg.tabs.length > 0);
});

// --- CLI refusal (no create-cmp.json) --------------------------------------------

test("CLI: --harness on a project without create-cmp.json refuses clearly, no crash", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-harness-nospec-"));
  try {
    const r = spawnSync(
      process.execPath,
      [BIN, "upgrade", "--harness", "--target-dir", dir],
      { encoding: "utf8", timeout: 30000 }
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /create-cmp\.json/);
    assert.match(r.stderr, /create-cmp-stamped/);
    assert.doesNotMatch(r.stderr, /Fatal:/, "a refusal, not a crash");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── The machine-owned region ────────────────────────────────────────────────
// Lane files carry no app content and are byte-identical in every create-cmp
// app, so they are a derived artifact: replaced wholesale, never merged.
// Three-way merging them is what produced ~1,000 conflicted lines per app in
// the 0.13.0 pilots, on diffs with zero app-specific tokens.

test("region: an untouched lane file is replaced, not merged", () => {
  const d = decideRegionFile({
    relPath: "qa/verify.mjs",
    base: Buffer.from("v1\n"),
    next: Buffer.from("v2\n"),
    theirs: Buffer.from("v1\n"),
  });
  assert.equal(d.bucket, "region-clean");
  assert.equal(d.write.toString(), "v2\n");
  assert.equal(d.sidecar, null);
});

test("region: a hand-mirrored engine change is ABSORBED, silently", () => {
  // The pilots' overwhelmingly common case: the app had already applied by
  // hand the change the engine now ships. Nothing to preserve, nothing to say.
  const base = Buffer.from("one\ntwo\nthree\n");
  const next = Buffer.from("one\ntwo ENGINE\nthree\n");
  const d = decideRegionFile({ relPath: "qa/verify.mjs", base, next, theirs: next });
  assert.equal(d.bucket, "current", "byte-identical to the new engine — nothing to do");

  // And the same when the app reached that content by its own edit path.
  const d2 = decideRegionFile({
    relPath: "qa/lib/render.mjs",
    base,
    next,
    theirs: Buffer.from("one\ntwo ENGINE\nthree\n"),
  });
  assert.equal(d2.bucket, "current");
});

test("region: a GENUINE local fork is replaced, but preserved as a patch", () => {
  const d = decideRegionFile({
    relPath: "qa/lib/render.mjs",
    base: Buffer.from("one\ntwo\nthree\nfour\nfive\n"),
    next: Buffer.from("one\ntwo\nthree\nfour\nfive ENGINE\n"),
    theirs: Buffer.from("one APP\ntwo\nthree\nfour\nfive\n"),
  });
  assert.equal(d.bucket, "region-patched");
  assert.equal(d.write.toString(), "one\ntwo\nthree\nfour\nfive ENGINE\n", "the region always lands on the new engine");
  // Nothing is lost: the app's divergence survives as a reviewable patch that
  // names the real project-relative path, so `git apply` can re-apply it.
  assert.match(d.patch, /^diff --git a\/qa\/lib\/render\.mjs b\/qa\/lib\/render\.mjs$/m);
  assert.match(d.patch, /^\+one APP$/m);
  assert.match(d.patch, /^-one$/m);
});

test("region: a lane file the app deleted is restored", () => {
  const d = decideRegionFile({
    relPath: "qa/lib/a11y.mjs",
    base: Buffer.from("v1\n"),
    next: Buffer.from("v2\n"),
    theirs: null,
  });
  assert.equal(d.bucket, "region-restored");
  assert.equal(d.write.toString(), "v2\n");
});

test("region: a lane file the engine dropped is removed, with no orphan case", () => {
  // Nothing app-owned can live in the region, so there is no app work to
  // protect here — unlike an app-shaped file, which becomes `orphaned`.
  const d = decideRegionFile({
    relPath: "qa/lib/gone.mjs",
    base: Buffer.from("v1\n"),
    next: null,
    theirs: Buffer.from("v1 + app edit\n"),
  });
  assert.equal(d.bucket, "region-removed");
  assert.equal(d.remove, true);
});

test("region: decideFile routes lane files to the region table, app files to merge", () => {
  const three = { base: Buffer.from("x\ny\nz\n"), next: Buffer.from("x\ny E\nz\n"), theirs: Buffer.from("x\ny A\nz\n") };
  assert.equal(decideFile({ relPath: "qa/verify.mjs", ...three }).bucket, "region-patched");
  assert.equal(decideFile({ relPath: "qa/lib/tree.mjs", ...three }).bucket, "region-patched");
  // Not the region: app state, app flows, app source.
  assert.equal(decideFile({ relPath: "qa/approvals.json", ...three }).bucket, "conflicted");
  assert.equal(decideFile({ relPath: "qa/e2e/smoke.yaml", ...three }).bucket, "conflicted");
  assert.equal(decideFile({ relPath: "composeApp/build.gradle.kts", ...three }).bucket, "conflicted");
});
