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
//
// TWO FALSE GREENS THIS USED TO GIVE (FIX-PLAN slice 13, C-3, C-9):
//
//   - "current" was decided by version number and sha existence alone, so the
//     documented update refusing an unchanged version left older bytes under the
//     right number — and SessionStart said "current". Now `--check` and the
//     SessionStart line read each scope's `installPath` and call it current ONLY
//     when those bytes match the marketplace clone at HEAD, both directions.
//   - the rebuild removed `cache/<version>/` even when running sessions held it,
//     taking their `.in_use` leases with it — after which the lease table was
//     empty and the closing line said every session had loaded the new bytes. A
//     directory with a live lease is now never removed: the refresh refuses and
//     names the holders.
//
// The documented path runs first — `claude plugin marketplace update`, then
// `claude plugin update` per scope — and the result is read back from
// `installed_plugins.json` (`version`, `installPath`) and the bytes. The manual
// rebuild is the fallback for the one case the documented path refuses: a
// version number that did not move. `/reload-plugins` is typed by a human in
// each session; this program says which sessions still need it. The last line
// prints what was observed on disk, nothing it was merely told.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { compareTrees, ignoredPaths, sameBytes } from "../src/lib/plugin-bytes.mjs";

// The byte comparison is shared with doctor --adherence; re-exported so this module's callers keep one import.
export { compareTrees, ignoredPaths, sameBytes };

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
const SESSIONS = path.join(HOME, ".claude", "sessions");

/** The holders named in one version directory's `.in_use/` lease directory. */
function holdersOf(versionDir, sessionsDir) {
  const lease = path.join(versionDir, ".in_use");
  if (!fs.existsSync(lease) || !fs.statSync(lease).isDirectory()) return [];
  return fs.readdirSync(lease).filter((n) => /^\d+$/.test(n)).map((pid) => {
    try {
      const s = json(path.join(sessionsDir, `${pid}.json`));
      return { pid: Number(pid), name: s.name ?? null, cwd: s.cwd ?? null };
    } catch {
      return { pid: Number(pid), name: null, cwd: null };
    }
  });
}

export function leases(cacheRoot, sessionsDir = SESSIONS) {
  if (!fs.existsSync(cacheRoot)) return [];
  return fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ version: e.name, holders: holdersOf(path.join(cacheRoot, e.name), sessionsDir) }))
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
}

/** A lease is live while its pid is. EPERM means the process exists under another user. */
export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/** The running processes that hold `versionDir` — a dead pid's leftover lease holds nothing. */
export function liveLeaseHolders(versionDir, { sessionsDir = SESSIONS, isAlive = pidAlive } = {}) {
  return holdersOf(versionDir, sessionsDir).filter((h) => isAlive(h.pid));
}

/**
 * The ONLY place this program removes a directory. A version directory a running
 * session holds is never removed: its hooks and MCP server run from those bytes,
 * and removing it also removes the leases, which then read as "nobody is on the
 * old version". Refuse, and return who holds it. `fill` writes the new contents.
 */
export function replaceVersionDir(dest, fill, opts = {}) {
  const holders = liveLeaseHolders(dest, opts);
  if (holders.length) return { replaced: false, holders };
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fill(dest);
  return { replaced: true, holders: [] };
}

/** The sessions working in THIS repo that have not yet loaded `version`. */
export function sessionsNeedingReload(leaseTable, repoRoot, version) {
  const holdersOf = (v) => (leaseTable.find((l) => l.version === v)?.holders ?? []);
  const current = new Set(holdersOf(version).map((h) => h.pid));
  const inRepo = new Map();
  for (const l of leaseTable) for (const h of l.holders) if (h.cwd === repoRoot) inRepo.set(h.pid, h);
  return [...inRepo.values()].filter((h) => !current.has(h.pid));
}

/** What `--check` answers, and what the refresh re-answers when it is done. */
export function inspect({ repoRoot, marketplaceDir, cacheRoot, installed, pluginId, sessionsDir = SESSIONS }) {
  const { entries } = installEntries(installed, pluginId);
  const clone = fs.existsSync(marketplaceDir)
    ? { head: git(marketplaceDir, "rev-parse", "HEAD"), declares: json(path.join(marketplaceDir, ".claude-plugin", "plugin.json")).version }
    : null;
  // One comparison per distinct installPath — three scopes usually share one.
  const ignore = clone ? ignoredPaths(marketplaceDir) : new Set();
  const compared = new Map();
  const bytesOf = (p) => {
    if (!clone) return null;
    if (!compared.has(p)) compared.set(p, sameBytes(p, marketplaceDir, ignore));
    return compared.get(p);
  };
  // `behind` is only meaningful against a remote ref that was just fetched; an
  // unfetched origin/main is as stale as the clone and would report a confident 0.
  let behind = null;
  if (clone) {
    try { behind = Number(git(marketplaceDir, "rev-list", "--count", "HEAD..origin/main") || 0); } catch { behind = null; }
  }
  const leaseTable = leases(cacheRoot, sessionsDir);
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
      // The recorded commit against the clone's HEAD — reported, but the bytes decide.
      atHead: clone ? e.gitCommitSha === clone.head : null,
      bytes: bytesOf(e.installPath),
    })),
  };
}

/**
 * Every reason the install is NOT current. Empty means current, and only then:
 * the bytes at every scope's installPath match the clone at HEAD. A version
 * number, a sha that exists, a plugin count — none of them can make this empty.
 */
export function staleReasons(s) {
  const reasons = [];
  if ((s.behind ?? 0) > 0) reasons.push(`the marketplace clone is ${s.behind} commit(s) behind origin/main`);
  if (!s.clone) reasons.push("no marketplace clone on disk, so the installed bytes cannot be compared to anything");
  for (const x of s.scopes) {
    if (x.version !== s.repoDeclares) reasons.push(`${x.scope} scope on ${x.version}, repo declares ${s.repoDeclares}`);
    if (!x.shaExists) reasons.push(`${x.scope} scope pinned to a sha that no longer exists`);
    if (!x.bytes) continue;
    if (x.bytes.absent) reasons.push(`${x.scope} scope's installPath does not exist (${x.installPath})`);
    else if (!x.bytes.identical) {
      reasons.push(
        `${x.scope} scope's installed bytes differ from the clone at ${s.clone.head.slice(0, 7)} ` +
          `(${x.bytes.differing.length} differing, ${x.bytes.missing.length} missing, ${x.bytes.extra.length} extra` +
          `${x.atHead ? "" : `; recorded sha ${String(x.sha).slice(0, 7)}`})`,
      );
    }
  }
  return reasons;
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
    const s = inspect({ repoRoot, marketplaceDir, cacheRoot, installed, pluginId });
    // An unfetched origin/main is as stale as the clone: its "0 behind" says nothing.
    const why = staleReasons({ ...s, behind: fetched ? s.behind : null });
    if (why.length) return `installed plugin is STALE — ${why.join("; ")}. Refresh: node scripts/plugin-refresh.mjs`;

    const at = `${s.repoDeclares}, bytes identical to the marketplace clone at ${s.clone.head.slice(0, 7)}`;
    if (s.needReload.length) return `installed plugin current (${at}), but this session has not loaded it — /reload-plugins`;
    return `installed plugin current — ${at}${fetched ? "" : " (offline: compared disk only)"}`;
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
  printScopes(before);
  log(`\n  loaded by running sessions (.in_use leases — the bytes a session HAS, not what disk says):`);
  for (const l of before.leases) {
    log(`    ${l.version.padEnd(8)} ${l.holders.length ? l.holders.map((h) => describe(h, repoRoot)).join(", ") : "— no session"}`);
  }

  const beforeStale = staleReasons(before);

  if (check) {
    if (beforeStale.length) log(`\n  STALE — ${beforeStale.join("; ")}.\n  Run without --check to refresh.\n`);
    else if (before.needReload.length) log(`\n  disk is current (bytes match the clone), but ${before.needReload.map((h) => describe(h, repoRoot)).join(", ")} has not reloaded — /reload-plugins there.\n`);
    else log(`\n  current — every scope's installPath holds the clone's bytes at ${before.clone.head.slice(0, 7)}, and no session in this repo holds only an older generation.\n`);
    return beforeStale.length ? 1 : 0;
  }

  const cli = claudeVersion();
  const scopeArgs = uniqueScopes(entries);
  const plan = [
    cli
      ? `claude plugin marketplace update ${pluginId.marketplace}, then claude plugin update ${key} for ${scopeArgs.map((s) => s.scope).join(", ")} (the documented path; claude ${cli})`
      : `no claude CLI on PATH — the documented path is skipped`,
    `read installed_plugins.json back (version, installPath) and compare each installPath's bytes to the clone`,
    `only if still stale: pull the clone and rebuild cache/<version>/ — REFUSED if a running session holds that directory`,
    `print what was observed on disk; /reload-plugins is yours to type in each session named`,
  ];
  log(`\n  plan:\n${plan.map((p, i) => `    ${i + 1}. ${p}`).join("\n")}\n`);
  if (dryRun) { log("  --dry-run: nothing written.\n"); return 0; }

  // 1. The documented path. Its own output is logged, never trusted: the refusal
  //    "already at the latest version" exits 0 over older bytes.
  if (cli) {
    const steps = [
      { args: ["plugin", "marketplace", "update", pluginId.marketplace], cwd: repoRoot },
      ...scopeArgs.map((s) => ({ args: ["plugin", "update", key, "--scope", s.scope], cwd: s.projectPath ?? repoRoot })),
    ];
    for (const step of steps) {
      const out = runClaude(step.args, step.cwd);
      log(`  ${out.ok ? "·" : "✗"} claude ${step.args.join(" ")} — ${out.lastLine || `exit ${out.status}`}`);
    }
    const afterCli = reinspect({ repoRoot, marketplaceDir, cacheRoot, pluginId });
    const still = staleReasons(afterCli);
    if (still.length === 0) return report(afterCli, repoRoot);
    log(`\n  the documented path left it stale — ${still.join("; ")}.\n  Falling back to the rebuild.\n`);
  }

  // 2. The fallback reaches GitHub through the clone.
  git(marketplaceDir, "fetch", "origin");
  git(marketplaceDir, "pull", "--ff-only", "origin", "main");
  const head = git(marketplaceDir, "rev-parse", "HEAD");
  const declares = json(path.join(marketplaceDir, ".claude-plugin", "plugin.json")).version;
  log(`  · clone at ${head.slice(0, 7)}, declares ${declares}`);

  // 3. Rebuild the version-keyed directory from scratch, so nothing reuses old
  //    bytes — unless a running session holds it. Then nothing is removed.
  const finalDest = path.join(cacheRoot, declares);
  const rebuilt = replaceVersionDir(finalDest, (dir) => {
    execFileSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", `${marketplaceDir}/`, `${dir}/`]);
    // The cache carries production node_modules; a fresh clone installs this way.
    execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: dir, stdio: "pipe" });
  });
  if (!rebuilt.replaced) {
    log(`\n  ✗ REFUSED — ${path.relative(HOME, finalDest)} is held by ${rebuilt.holders.length} running session(s):`);
    for (const h of rebuilt.holders) log(`      pid ${h.pid}  ${h.name ?? "(unnamed)"}  ${h.cwd ?? ""}`);
    log(
      `\n  Their hooks and MCP servers run from those bytes, and removing the directory removes their leases too.\n` +
        `  Bump .claude-plugin/plugin.json's version so the update lands in a new directory, or end those\n` +
        `  sessions and re-run. Nothing was removed and installed_plugins.json was not touched.\n`,
    );
    return 1;
  }
  log(`  · rebuilt ${path.relative(HOME, finalDest)} (rsync + npm ci --omit=dev)`);

  // 4. EVERY scope, together — a half-updated manifest is the trap this exists for.
  //    Re-read first: the documented path may have rewritten the file.
  const now = new Date().toISOString();
  const current = json(INSTALLED);
  for (const e of current.plugins[key] ?? []) {
    e.installPath = finalDest;
    e.version = declares;
    e.gitCommitSha = head;
    e.lastUpdated = now;
  }
  writeJson(INSTALLED, current);
  if (fs.existsSync(KNOWN)) {
    const known = json(KNOWN);
    if (known[pluginId.marketplace]) { known[pluginId.marketplace].lastUpdated = now; writeJson(KNOWN, known); }
  }
  log(`  · ${(current.plugins[key] ?? []).length} scope(s) written to installed_plugins.json`);

  // 5. The proof is the same question --check asks, re-asked from disk.
  return report(reinspect({ repoRoot, marketplaceDir, cacheRoot, pluginId }), repoRoot);
}

/** `claude --version`, or null when there is no CLI on PATH. */
function claudeVersion() {
  try {
    return execFileSync("claude", ["--version"], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\s/)[0];
  } catch {
    return null;
  }
}

function runClaude(args, cwd) {
  try {
    const out = execFileSync("claude", args, { cwd, encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, status: 0, lastLine: out.trim().split("\n").pop() ?? "" };
  } catch (err) {
    const text = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    return { ok: false, status: err.status ?? null, lastLine: text.split("\n").pop() ?? "" };
  }
}

/** One `claude plugin update --scope` per distinct scope + project. */
function uniqueScopes(entries) {
  const seen = new Map();
  for (const e of entries) seen.set(`${e.scope}|${e.projectPath ?? ""}`, { scope: e.scope, projectPath: e.projectPath ?? null });
  return [...seen.values()];
}

function reinspect({ repoRoot, marketplaceDir, cacheRoot, pluginId }) {
  return inspect({ repoRoot, marketplaceDir, cacheRoot, installed: json(INSTALLED), pluginId });
}

const describe = (h, repoRoot) => `${h.name ?? `pid ${h.pid}`}${h.cwd === repoRoot ? " (this repo)" : ""}`;

function printScopes(s) {
  for (const x of s.scopes) {
    const where = x.projectPath ? ` ${x.projectPath}` : "";
    const bytes = !x.bytes ? "" : x.bytes.absent ? "  ✗ installPath missing" : x.bytes.identical ? "  bytes = clone" : "  ✗ bytes ≠ clone";
    log(`  scope ${x.scope.padEnd(6)}     ${x.version} @ ${String(x.sha).slice(0, 7)}${x.shaExists ? "" : "  ⚠ that sha no longer exists (rebased away)"}${bytes}${where}`);
    log(`    installPath       ${x.installPath}`);
  }
}

/**
 * The closing lines — only what was read back from disk: each scope's recorded
 * version and installPath, whether those bytes match the clone, and which
 * sessions the leases say have not reloaded. Exit 1 unless every scope is current.
 */
function report(after, repoRoot) {
  log("\n  observed after the refresh:");
  printScopes(after);
  const still = staleReasons(after);
  if (still.length) {
    log(`\n  ✗ NOT current — ${still.join("; ")}.\n`);
    return 1;
  }
  const paths = [...new Set(after.scopes.map((x) => x.installPath))];
  log(`\n  ✓ ${after.scopes.length} scope(s) record ${[...new Set(after.scopes.map((x) => x.version))].join(", ")} at ${paths.join(", ")}; bytes identical to the clone at ${after.clone.head.slice(0, 7)}.`);
  if (after.needReload.length) {
    log(`  ${after.needReload.map((h) => describe(h, repoRoot)).join(", ")} hold(s) only an older generation — type /reload-plugins there, then re-run --check.\n`);
  } else {
    log(`  No session in this repo holds only an older generation (per .in_use leases).\n`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  refresh({ repoRoot, argv: process.argv.slice(2) })
    .then((code) => process.exit(code))
    .catch((err) => { console.error(`plugin refresh: ${err.message}`); process.exit(1); });
}
