#!/usr/bin/env node
// Refresh an installed Claude Code marketplace plugin, and PROVE it by content.
//
//   node scripts/plugin-refresh.mjs --check     # what is stale, changing nothing
//   node scripts/plugin-refresh.mjs             # do it
//   node scripts/plugin-refresh.mjs --dry-run   # print the plan, write nothing
//
// WHY THIS IS A PROGRAM. Refreshing a plugin looks like four commands and is
// actually four traps, every one of which reports success while serving stale
// bytes. Measured on this machine, 2026-09-08 and 2026-09-09:
//
//   1. `/reload-plugins` re-reads DISK. It never refetches from GitHub, and it
//      will happily rebuild a cache directory out of a clone 56 commits stale.
//   2. The cache is keyed by VERSION. If the stale snapshot already declared the
//      new number, the reinstall records `<new sha>` and REUSES the directory
//      holding the old bytes. Manifest and content disagree; only a diff shows it.
//   3. `installed_plugins.json` holds one entry PER SCOPE. Updating the one you
//      thought about leaves the other pointing at an older cache — and the one
//      that serves is not necessarily the one you expected. A local entry was
//      found pinned to a version whose sha no longer existed at all, because
//      rebase-merge had rewritten it.
//   4. Every success signal — the version number, the plugin count, the reload's
//      own "N skills" line — is blind to all three.
//
// So this does not print instructions. It performs the refresh and then refuses
// to call it done unless the installed tree is byte-identical to the source it
// claims to come from. `--check` answers "is it stale?" without touching
// anything, which is the question a session actually starts with.
//
// WHAT A RUNNING SESSION HAS LOADED is decided at load time and does not change
// until it reloads — but it IS observable. `<cache>/<version>/.in_use/` is a
// DIRECTORY of leases: one entry per Claude process pid holding that generation,
// and `~/.claude/sessions/<pid>.json` names the session (cwd, name). So this can
// say, per generation, which sessions hold it — and whether the session working
// in this repo has picked up the new one yet. It was misread twice as a marker
// FILE (`[ -f ]` says a directory is absent), which produced two confident wrong
// conclusions in one day. Hence a program.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const PLUGIN_ROOT = path.join(HOME, ".claude", "plugins");
const INSTALLED = path.join(PLUGIN_ROOT, "installed_plugins.json");
const KNOWN = path.join(PLUGIN_ROOT, "known_marketplaces.json");

const json = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

/**
 * A fetch that may not hang a session. SessionStart calls this, and a laptop on
 * a hotel network must not pay for it: on timeout the comparison silently falls
 * back to what is already on disk, which is still worth reporting.
 */
function tryFetch(dir, timeoutMs) {
  try {
    execFileSync("git", ["-C", dir, "fetch", "origin", "--quiet"], { timeout: timeoutMs, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Paths that exist in a working tree but are not part of the plugin: git's own
 * directory, installed modules, the runtime's marker, and anything the repo
 * gitignores (local ledgers, build output, scratch apps). The content proof
 * compares everything else.
 */
const NOT_PLUGIN_CONTENT = Object.freeze([".git", "node_modules", ".in_use", ".DS_Store"]);

/** The plugin id this repo publishes, derived — never spelled out here. */
export function selfPluginId(repoRoot) {
  const mp = json(path.join(repoRoot, ".claude-plugin", "marketplace.json"));
  const plugin = json(path.join(repoRoot, ".claude-plugin", "plugin.json"));
  return { plugin: plugin.name, marketplace: mp.name ?? plugin.name, declaredVersion: plugin.version };
}

/** Every install entry for this plugin, across every scope. */
export function installEntries(installed, pluginId) {
  const key = Object.keys(installed.plugins ?? {}).find((k) => k.startsWith(`${pluginId.plugin}@`));
  return { key, entries: key ? installed.plugins[key] : [] };
}

/**
 * Who holds each cached generation. `.in_use/` is a directory of leases — one
 * entry per Claude process pid — and the sessions dir names each pid. This is
 * the one signal that still discriminates when two generations ship identical
 * content: it does not care what the bytes are, only who has loaded them.
 *
 * A session appearing under BOTH an old and a new generation has reloaded (the
 * old lease is simply not released until exit). A session appearing ONLY under
 * an old generation has not reloaded yet.
 */
export function leases(cacheRoot, sessionsDir = path.join(HOME, ".claude", "sessions")) {
  if (!fs.existsSync(cacheRoot)) return [];
  const session = (pid) => {
    try {
      const s = json(path.join(sessionsDir, `${pid}.json`));
      return { pid: Number(pid), name: s.name ?? null, cwd: s.cwd ?? null };
    } catch {
      return { pid: Number(pid), name: null, cwd: null };
    }
  };
  return fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const lease = path.join(cacheRoot, e.name, ".in_use");
      const holders = fs.existsSync(lease) && fs.statSync(lease).isDirectory()
        ? fs.readdirSync(lease).filter((n) => /^\d+$/.test(n)).map(session)
        : [];
      return { version: e.name, holders };
    })
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
}

/** The sessions working in THIS repo that have not yet loaded `version`. */
export function sessionsNeedingReload(leaseTable, repoRoot, version) {
  const holdersOf = (v) => (leaseTable.find((l) => l.version === v)?.holders ?? []);
  const current = new Set(holdersOf(version).map((h) => h.pid));
  const inRepo = new Map();
  for (const l of leaseTable) for (const h of l.holders) if (h.cwd === repoRoot) inRepo.set(h.pid, h);
  return [...inRepo.values()].filter((h) => !current.has(h.pid));
}

/** Recursive content comparison, ignoring what is not plugin content. */
export function compareTrees(a, b, ignore = new Set()) {
  const differing = [];
  const missing = [];
  const walk = (rel) => {
    const pa = path.join(a, rel);
    const pb = path.join(b, rel);
    for (const e of fs.readdirSync(pa, { withFileTypes: true })) {
      if (NOT_PLUGIN_CONTENT.includes(e.name)) continue;
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (ignore.has(childRel.split(path.sep)[0])) continue;
      const childB = path.join(pb, e.name);
      if (e.isDirectory()) {
        if (!fs.existsSync(childB)) { missing.push(childRel); continue; }
        walk(childRel);
      } else if (e.isFile()) {
        if (!fs.existsSync(childB)) { missing.push(childRel); continue; }
        if (!fs.readFileSync(path.join(pa, e.name)).equals(fs.readFileSync(childB))) differing.push(childRel);
      }
    }
  };
  walk("");
  return { differing, missing, identical: differing.length === 0 && missing.length === 0 };
}

/** What `--check` answers, and what the refresh re-answers when it is done. */
export function inspect({ repoRoot, marketplaceDir, cacheRoot, installed, pluginId }) {
  const { entries } = installEntries(installed, pluginId);
  const clone = fs.existsSync(marketplaceDir)
    ? { head: git(marketplaceDir, "rev-parse", "HEAD"), declares: json(path.join(marketplaceDir, ".claude-plugin", "plugin.json")).version }
    : null;
  // `behind` is only meaningful against a remote ref that was just fetched; an
  // unfetched origin/main is as stale as the clone and would report a confident 0.
  let behind = null;
  if (clone) {
    try { behind = Number(git(marketplaceDir, "rev-list", "--count", "HEAD..origin/main") || 0); } catch { behind = null; }
  }
  const leaseTable = leases(cacheRoot);
  return {
    clone,
    behind,
    leases: leaseTable,
    needReload: sessionsNeedingReload(leaseTable, repoRoot, pluginId.declaredVersion),
    repoHead: git(repoRoot, "rev-parse", "HEAD"),
    repoDeclares: pluginId.declaredVersion,
    scopes: entries.map((e) => ({
      scope: e.scope,
      projectPath: e.projectPath ?? null,
      version: e.version,
      sha: e.gitCommitSha,
      installPath: e.installPath,
      // A sha that no longer exists is the loudest staleness signal there is.
      shaExists: (() => {
        try { git(marketplaceDir, "cat-file", "-e", `${e.gitCommitSha}^{commit}`); return true; } catch { return false; }
      })(),
    })),
  };
}

/**
 * One line for SessionStart — the whole point being that two days of stale-plugin
 * confusion were invisible until someone thought to look. Never refreshes, never
 * throws: a plugin that is not installed, or a machine with no network, produces
 * silence or a partial answer, not a failed session start.
 */
export function summary({ repoRoot, doFetch = true, timeoutMs = 3000 } = {}) {
  try {
    if (!fs.existsSync(INSTALLED)) return null;
    const pluginId = selfPluginId(repoRoot);
    const installed = json(INSTALLED);
    const marketplaceDir = path.join(PLUGIN_ROOT, "marketplaces", pluginId.marketplace);
    const cacheRoot = path.join(PLUGIN_ROOT, "cache", pluginId.marketplace, pluginId.plugin);
    const { key, entries } = installEntries(installed, pluginId);
    if (!key || entries.length === 0) return null;

    const fetched = doFetch && fs.existsSync(marketplaceDir) ? tryFetch(marketplaceDir, timeoutMs) : false;
    const s = inspect({ repoRoot, marketplaceDir, cacheRoot, installed, pluginId, fetched });
    const behind = fetched ? s.behind : null;
    const wrongVersion = s.scopes.filter((x) => x.version !== s.repoDeclares);
    const goneSha = s.scopes.filter((x) => !x.shaExists);

    if (behind > 0 || wrongVersion.length || goneSha.length) {
      const why = [
        behind > 0 ? `the marketplace clone is ${behind} commit(s) behind` : null,
        wrongVersion.length ? `${wrongVersion.map((x) => x.scope).join("/")} scope on ${wrongVersion[0].version}, repo declares ${s.repoDeclares}` : null,
        goneSha.length ? `${goneSha.map((x) => x.scope).join("/")} pinned to a sha that no longer exists` : null,
      ].filter(Boolean);
      return `installed plugin is STALE — ${why.join("; ")}. Refresh: node scripts/plugin-refresh.mjs`;
    }
    if (s.needReload.length) {
      return `installed plugin is current (${s.repoDeclares}), but this session has not loaded it — /reload-plugins`;
    }
    return `installed plugin current — ${s.repoDeclares}${fetched ? "" : " (offline: compared disk only)"}`;
  } catch {
    return null;
  }
}

function log(...a) { console.log(...a); }

export async function refresh({ repoRoot, argv = [] }) {
  const check = argv.includes("--check");
  const dryRun = argv.includes("--dry-run");

  if (!fs.existsSync(INSTALLED)) {
    log("plugin refresh: no installed_plugins.json — this plugin is not installed on this machine.");
    return 0;
  }
  const pluginId = selfPluginId(repoRoot);
  const installed = json(INSTALLED);
  const marketplaceDir = path.join(PLUGIN_ROOT, "marketplaces", pluginId.marketplace);
  const cacheRoot = path.join(PLUGIN_ROOT, "cache", pluginId.marketplace, pluginId.plugin);
  const { key, entries } = installEntries(installed, pluginId);

  if (!key || entries.length === 0) {
    log(`plugin refresh: ${pluginId.plugin} is not installed from marketplace ${pluginId.marketplace} — nothing to refresh.`);
    return 0;
  }

  // The CLI is interactive: fetch first so "behind" means something, but never
  // let a dead network turn a status query into a failure.
  const fetched = fs.existsSync(marketplaceDir) ? tryFetch(marketplaceDir, 15000) : false;
  const before = inspect({ repoRoot, marketplaceDir, cacheRoot, installed, pluginId });
  if (!fetched) log("  (could not reach the remote — comparing what is on disk only)");

  log(`\nplugin refresh — ${pluginId.plugin}@${pluginId.marketplace}\n`);
  log(`  repo declares      ${before.repoDeclares}  (HEAD ${before.repoHead.slice(0, 7)})`);
  if (before.clone) log(`  marketplace clone  ${before.clone.declares}  (HEAD ${before.clone.head.slice(0, 7)}${before.behind ? `, ${before.behind} behind origin/main` : ""})`);
  for (const s of before.scopes) {
    const where = s.projectPath ? ` ${s.projectPath}` : "";
    log(`  scope ${s.scope.padEnd(6)}     ${s.version} @ ${s.sha.slice(0, 7)}${s.shaExists ? "" : "  ⚠ that sha no longer exists (rebased away)"}${where}`);
  }
  log(`\n  loaded by running sessions (.in_use leases — the bytes a session HAS, not what disk says):`);
  const describe = (h) => `${h.name ?? `pid ${h.pid}`}${h.cwd === repoRoot ? " (this repo)" : ""}`;
  for (const l of before.leases) {
    log(`    ${l.version.padEnd(8)} ${l.holders.length ? l.holders.map(describe).join(", ") : "— no session"}`);
  }

  const stale =
    (before.behind ?? 0) > 0 ||
    before.scopes.some((s) => s.version !== before.repoDeclares || !s.shaExists);

  if (check) {
    if (stale) log("\n  STALE — run without --check to refresh.\n");
    else if (before.needReload.length) log(`\n  disk is current, but ${before.needReload.map(describe).join(", ")} has not reloaded — /reload-plugins there.\n`);
    else log("\n  current — every scope matches what the repo declares, and every session in this repo has loaded it.\n");
    return stale ? 1 : 0;
  }

  const targetVersion = before.repoDeclares;
  const dest = path.join(cacheRoot, targetVersion);
  const plan = [
    `pull ${path.relative(HOME, marketplaceDir)} (the only step that reaches GitHub)`,
    `rebuild ${path.relative(HOME, dest)} from the clone, version-keyed dir removed first`,
    `npm ci --omit=dev in the rebuilt directory`,
    `repoint ${entries.length} scope(s) in installed_plugins.json`,
    `prove the result byte-identical to the clone, or fail`,
  ];
  log(`\n  plan:\n${plan.map((p, i) => `    ${i + 1}. ${p}`).join("\n")}\n`);
  if (dryRun) { log("  --dry-run: nothing written.\n"); return 0; }

  // 1. The only step that reaches GitHub.
  git(marketplaceDir, "fetch", "origin");
  git(marketplaceDir, "pull", "--ff-only", "origin", "main");
  const head = git(marketplaceDir, "rev-parse", "HEAD");
  const declares = json(path.join(marketplaceDir, ".claude-plugin", "plugin.json")).version;
  log(`  ✓ clone at ${head.slice(0, 7)}, declares ${declares}`);

  // 2. Version-keyed directory removed FIRST, so nothing can reuse old bytes.
  const finalDest = path.join(cacheRoot, declares);
  fs.rmSync(finalDest, { recursive: true, force: true });
  fs.mkdirSync(finalDest, { recursive: true });
  execFileSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", `${marketplaceDir}/`, `${finalDest}/`]);
  log(`  ✓ rebuilt ${path.relative(HOME, finalDest)}`);

  // 3. The cache carries production node_modules; a fresh clone installs this way.
  execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: finalDest, stdio: "pipe" });
  log(`  ✓ npm ci --omit=dev`);

  // 4. EVERY scope, together — a half-updated manifest is the trap this exists for.
  const now = new Date().toISOString();
  for (const e of installed.plugins[key]) {
    e.installPath = finalDest;
    e.version = declares;
    e.gitCommitSha = head;
    e.lastUpdated = now;
  }
  writeJson(INSTALLED, installed);
  if (fs.existsSync(KNOWN)) {
    const known = json(KNOWN);
    if (known[pluginId.marketplace]) { known[pluginId.marketplace].lastUpdated = now; writeJson(KNOWN, known); }
  }
  log(`  ✓ ${installed.plugins[key].length} scope(s) repointed at ${declares} @ ${head.slice(0, 7)}`);

  // 5. The proof. Anything the repo ignores is not plugin content.
  const ignore = new Set(
    execFileSync("git", ["-C", marketplaceDir, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory"], { encoding: "utf8" })
      .split("\n").filter(Boolean).map((p) => p.replace(/\/$/, "").split("/")[0]),
  );
  const cmp = compareTrees(finalDest, marketplaceDir, ignore);
  if (!cmp.identical) {
    log(`\n  ✗ FAILED the content proof — ${cmp.differing.length} differing, ${cmp.missing.length} missing`);
    for (const f of [...cmp.differing, ...cmp.missing].slice(0, 10)) log(`      ${f}`);
    return 1;
  }
  log(`  ✓ byte-identical to the clone — 0 differing, 0 missing\n`);

  // What is on disk is settled. What each session HAS is not, and it is knowable.
  const after = leases(cacheRoot);
  const pending = sessionsNeedingReload(after, repoRoot, declares);
  if (pending.length) {
    log(`  Installed. ${pending.map(describe).join(", ")} is still on an older generation — run there:\n    /reload-plugins\n`);
    log(`  Then re-run with --check: the session should appear under ${declares}.\n`);
  } else {
    log(`  Installed, and every session in this repo has loaded ${declares}.\n`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  refresh({ repoRoot, argv: process.argv.slice(2) })
    .then((code) => process.exit(code))
    .catch((err) => { console.error(`plugin refresh: ${err.message}`); process.exit(1); });
}
