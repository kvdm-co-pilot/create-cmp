#!/usr/bin/env node
// Is the INSTALLED plugin the repo you are editing?
//
// The marketplace entry says `"source": "./"` — this repo IS the plugin source.
// But Claude Code does not read it live: it COPIES the tree into
// ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/ at install time and
// serves that copy forever. Nothing refreshes it, and nothing announces the gap.
//
// The failure this exists to catch, observed on 2026-07-27: the repo was three
// days and seventeen commits ahead of the installed plugin, the cache predated
// `fix(plugin): bundle the MCP server — it never started from a marketplace
// install`, and so the installed plugin's MCP server could not start at all.
// Everything looked fine from inside the repo, because the showcase's .mcp.json
// points at an absolute repo path — the one consumer that could not see the
// staleness was the one being used to check for it.
//
// Exit 0 = in sync (or no install found — nothing to be wrong about).
// Exit 1 = drift. The fix is never to edit the cache; it is to reinstall the
// plugin so the snapshot is retaken.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

/** The plugin's declared identity — name and version — from its own manifest. */
function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, ".claude-plugin", "plugin.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Every installed copy of this plugin, newest version dir last. Absent cache =
 * empty list: a machine that never installed the plugin has nothing to drift.
 */
function installedCopies(name) {
  const root = path.join(os.homedir(), ".claude", "plugins", "cache");
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const marketplace of fs.readdirSync(root)) {
    const pluginDir = path.join(root, marketplace, name);
    if (!fs.existsSync(pluginDir)) continue;
    for (const version of fs.readdirSync(pluginDir)) {
      const dir = path.join(pluginDir, version);
      if (fs.statSync(dir).isDirectory()) out.push({ version, dir });
    }
  }
  return out.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
}

/**
 * The files that MUST be byte-identical for the installed plugin to behave like
 * the repo. Deliberately the load-bearing surface rather than a full tree diff:
 * a whole-tree comparison is noisy (docs, .DS_Store, build output) and noise is
 * what gets ignored. These are the files whose staleness actually breaks things.
 */
const LOAD_BEARING = [
  ".claude-plugin/plugin.json",
  ".mcp.json",
  "inspector/mcp/dist/server.mjs",
];

function sha(file) {
  if (!fs.existsSync(file)) return null;
  return execFileSync("shasum", ["-a", "256", file], { encoding: "utf8" }).split(" ")[0];
}

export function checkPluginSync({ repo = repoRoot } = {}) {
  const manifest = readManifest(repo);
  if (!manifest) return { ok: true, reason: "no plugin manifest in this repo — nothing to sync" };

  const copies = installedCopies(manifest.name);
  if (copies.length === 0) {
    return { ok: true, reason: `plugin '${manifest.name}' is not installed on this machine — nothing to drift` };
  }

  const problems = [];
  for (const copy of copies) {
    const installed = readManifest(copy.dir);
    if (installed && installed.version !== manifest.version) {
      problems.push(
        `installed ${manifest.name}@${installed.version} but the repo declares ${manifest.version} — ` +
          `the installed plugin is a snapshot of an older tree (${copy.dir})`,
      );
    }
    for (const rel of LOAD_BEARING) {
      const repoFile = path.join(repo, rel);
      const copyFile = path.join(copy.dir, rel);
      if (!fs.existsSync(repoFile)) continue;
      const a = sha(repoFile);
      const b = sha(copyFile);
      if (b === null) {
        problems.push(`${rel} is MISSING from the installed plugin (${copy.version}) — it ships in the repo`);
      } else if (a !== b) {
        problems.push(`${rel} differs between the repo and the installed plugin (${copy.version})`);
      }
    }
  }

  return problems.length === 0
    ? { ok: true, reason: `installed plugin matches this repo (${manifest.name}@${manifest.version})` }
    : { ok: false, problems };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const result = checkPluginSync();
  if (result.ok) {
    console.log(`✓ plugin sync: ${result.reason}`);
    process.exit(0);
  }
  console.error("✗ plugin sync: the INSTALLED plugin is not this repo.\n");
  for (const p of result.problems) console.error(`  • ${p}`);
  console.error(
    "\nYour edits are in the right place — this repo IS the plugin source. What is stale is the\n" +
      "COPY Claude Code made at install time. Do NOT edit the cache; reinstall the plugin so the\n" +
      "snapshot is retaken (in an interactive terminal: /plugin → the create-cmp marketplace →\n" +
      "reinstall/update). Bumping .claude-plugin/plugin.json's version first makes the change visible.",
  );
  process.exit(1);
}
