// The plugin refresh, gated on the four ways it silently lies.
//
// This program exists because a refresh has no honest success signal: the
// version number, the plugin count and the reload's own "N skills" line all
// report fine while the session serves stale bytes. Two days went that way. So
// the tests here are not "does it copy files" — they are the four failures,
// each one pinned:
//
//   1. the version-keyed cache directory gets REUSED, so old bytes survive a
//      reinstall that recorded a new sha;
//   2. only one scope is updated, leaving the other pointing at an older cache;
//   3. `.in_use` is read as a marker FILE when it is a directory of per-pid
//      leases — `[ -f ]` says absent, and two wrong conclusions followed;
//   4. the content proof is skipped, so "installed" means "copied", not "same".
//
// Everything runs against fixtures in a temp dir. Nothing here touches the real
// ~/.claude, and nothing reaches the network: a test that needs GitHub up fails
// for reasons that are not defects.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compareTrees, installEntries, leases, selfPluginId, sessionsNeedingReload, summary } from "../scripts/plugin-refresh.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-refresh-"));
  test.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

test("the plugin id is derived from this repo's own manifests, never spelled out", () => {
  const id = selfPluginId(ROOT);
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(id.plugin, plugin.name);
  assert.equal(id.declaredVersion, plugin.version);

  const src = fs.readFileSync(path.join(ROOT, "scripts/plugin-refresh.mjs"), "utf8");
  assert.ok(
    !src.includes(`"${plugin.name}"`),
    "the plugin name is written literally into the program — derive it from the manifest, or it rots the day the name changes",
  );
});

test("compareTrees catches a reused cache directory — the failure a version number cannot see", () => {
  const d = tmp();
  const a = path.join(d, "cache");
  const b = path.join(d, "clone");
  for (const r of [a, b]) fs.mkdirSync(path.join(r, "skills", "demo"), { recursive: true });

  // The trap: same declared version, different bytes.
  fs.writeFileSync(path.join(a, "skills/demo/SKILL.md"), "the OLD sentence\n");
  fs.writeFileSync(path.join(b, "skills/demo/SKILL.md"), "the NEW sentence\n");
  fs.writeFileSync(path.join(a, "version"), "0.25.0\n");
  fs.writeFileSync(path.join(b, "version"), "0.25.0\n");

  const cmp = compareTrees(a, b);
  assert.equal(cmp.identical, false, "identical versions with different bytes must NOT compare equal");
  assert.deepEqual(cmp.differing, [path.join("skills", "demo", "SKILL.md")]);

  fs.writeFileSync(path.join(a, "skills/demo/SKILL.md"), "the NEW sentence\n");
  assert.equal(compareTrees(a, b).identical, true, "matching bytes must compare equal");
});

test("compareTrees ignores what is not plugin content, and reports a missing file as missing", () => {
  const d = tmp();
  const a = path.join(d, "a");
  const b = path.join(d, "b");
  fs.mkdirSync(path.join(a, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(a, ".in_use"), { recursive: true });
  fs.mkdirSync(path.join(a, "docs"), { recursive: true });
  fs.mkdirSync(path.join(b, "docs"), { recursive: true });
  fs.writeFileSync(path.join(a, "node_modules/x.js"), "irrelevant");
  fs.writeFileSync(path.join(a, ".in_use/1234"), "");
  fs.writeFileSync(path.join(a, "docs/kept.md"), "same");
  fs.writeFileSync(path.join(b, "docs/kept.md"), "same");
  assert.equal(compareTrees(a, b).identical, true, "node_modules and .in_use are not plugin content");

  fs.writeFileSync(path.join(a, "docs/extra.md"), "only in a");
  const cmp = compareTrees(a, b);
  assert.deepEqual(cmp.missing, [path.join("docs", "extra.md")]);
  assert.equal(cmp.identical, false);

  fs.mkdirSync(path.join(a, "scratch"), { recursive: true });
  fs.writeFileSync(path.join(a, "scratch/local.txt"), "gitignored");
  const ignored = compareTrees(a, b, new Set(["scratch"]));
  assert.ok(!ignored.missing.includes(path.join("scratch", "local.txt")), "an ignored top-level dir is not plugin content");
});

test(".in_use is a DIRECTORY of per-pid leases — reading it as a file is the bug that misled twice", () => {
  const d = tmp();
  const cache = path.join(d, "cache");
  const sessions = path.join(d, "sessions");
  fs.mkdirSync(sessions, { recursive: true });
  for (const v of ["0.24.0", "0.25.0"]) fs.mkdirSync(path.join(cache, v), { recursive: true });

  fs.mkdirSync(path.join(cache, "0.24.0", ".in_use"), { recursive: true });
  fs.writeFileSync(path.join(cache, "0.24.0/.in_use/100"), "");
  fs.writeFileSync(path.join(cache, "0.24.0/.in_use/200"), "");
  fs.mkdirSync(path.join(cache, "0.25.0", ".in_use"), { recursive: true });
  fs.writeFileSync(path.join(cache, "0.25.0/.in_use/200"), "");

  fs.writeFileSync(path.join(sessions, "100.json"), JSON.stringify({ pid: 100, name: "stale-one", cwd: "/repo" }));
  fs.writeFileSync(path.join(sessions, "200.json"), JSON.stringify({ pid: 200, name: "reloaded-one", cwd: "/repo" }));

  const table = leases(cache, sessions);
  const by = (v) => table.find((t) => t.version === v);
  assert.deepEqual(by("0.24.0").holders.map((h) => h.pid).sort(), [100, 200]);
  assert.deepEqual(by("0.25.0").holders.map((h) => h.pid), [200], "a lease directory names each holding pid");
  assert.equal(by("0.25.0").holders[0].name, "reloaded-one", "the session file names the holder");
});

test("a session holding only an older generation is named as needing a reload; one holding both is not", () => {
  const d = tmp();
  const cache = path.join(d, "cache");
  const sessions = path.join(d, "sessions");
  fs.mkdirSync(sessions, { recursive: true });
  for (const v of ["0.24.0", "0.25.0"]) fs.mkdirSync(path.join(cache, v, ".in_use"), { recursive: true });

  // 100 has not reloaded. 200 has (it holds both — the old lease lives until exit).
  fs.writeFileSync(path.join(cache, "0.24.0/.in_use/100"), "");
  fs.writeFileSync(path.join(cache, "0.24.0/.in_use/200"), "");
  fs.writeFileSync(path.join(cache, "0.25.0/.in_use/200"), "");
  // 300 is another project's session and must never be reported here.
  fs.writeFileSync(path.join(cache, "0.24.0/.in_use/300"), "");
  fs.writeFileSync(path.join(sessions, "100.json"), JSON.stringify({ pid: 100, name: "not-reloaded", cwd: "/repo" }));
  fs.writeFileSync(path.join(sessions, "200.json"), JSON.stringify({ pid: 200, name: "reloaded", cwd: "/repo" }));
  fs.writeFileSync(path.join(sessions, "300.json"), JSON.stringify({ pid: 300, name: "elsewhere", cwd: "/other" }));

  const pending = sessionsNeedingReload(leases(cache, sessions), "/repo", "0.25.0");
  assert.deepEqual(pending.map((h) => h.name), ["not-reloaded"], "only this repo's un-reloaded sessions are named");
});

test("installEntries returns EVERY scope — a half-updated manifest is the trap", () => {
  const installed = {
    version: 2,
    plugins: {
      "demo@mp": [
        { scope: "user", version: "0.24.0", installPath: "/c/0.24.0", gitCommitSha: "a" },
        { scope: "local", projectPath: "/repo", version: "0.23.0", installPath: "/c/0.23.0", gitCommitSha: "b" },
      ],
      "other@mp": [{ scope: "user", version: "9.9.9", installPath: "/x", gitCommitSha: "z" }],
    },
  };
  const { key, entries } = installEntries(installed, { plugin: "demo", marketplace: "mp" });
  assert.equal(key, "demo@mp");
  assert.equal(entries.length, 2, "both scopes must come back — updating one and not the other is the defect");
  assert.deepEqual(entries.map((e) => e.version), ["0.24.0", "0.23.0"]);
});

test("summary never throws and never refreshes — SessionStart depends on both", () => {
  // A repo that is not an installed plugin must yield silence, not an error.
  assert.doesNotThrow(() => summary({ repoRoot: os.tmpdir(), doFetch: false }));

  const line = summary({ repoRoot: ROOT, doFetch: false });
  if (line !== null) {
    assert.match(line, /plugin/i);
    assert.ok(!/refreshed|installed the/i.test(line), "the SessionStart line must report, never act");
  }
});
