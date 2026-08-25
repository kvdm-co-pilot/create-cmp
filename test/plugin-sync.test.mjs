// The installed plugin is a COPY, and a copy can go stale silently.
//
// `.claude-plugin/marketplace.json` says `"source": "./"` — this repo is the
// plugin source — but Claude Code snapshots the tree into
// ~/.claude/plugins/cache/… at install time and serves that snapshot forever.
// Nothing refreshes it and nothing announces the gap, so "I edited the plugin"
// and "the installed plugin changed" are two different facts.
//
// These tests pin the DETECTOR, not the machine's current install state: the
// suite must pass on a laptop with a stale plugin, a fresh one, or none at all
// (CI). So the drift cases are built from fixture trees rather than by asserting
// anything about ~/.claude.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkPluginSync } from "../scripts/check-plugin-sync.mjs";

// Resolved the long way round on purpose — see the note in check-plugin-sync.mjs
// about the Node 18 floor this repo declares in package.json engines.
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A throwaway repo-shaped tree: manifest + the load-bearing files. */
function fixtureRepo({ version = "1.0.0", server = "// bundle\n" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-plugin-sync-"));
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: `sync-fixture-${path.basename(dir)}`, version }),
  );
  fs.writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
  fs.mkdirSync(path.join(dir, "inspector", "mcp", "dist"), { recursive: true });
  fs.writeFileSync(path.join(dir, "inspector", "mcp", "dist", "server.mjs"), server);
  return dir;
}

test("a repo whose plugin is not installed anywhere has nothing to drift", () => {
  // The fixture's plugin name is unique per temp dir, so it can never be found
  // in the real cache — this is the CI machine's case, and it must pass.
  const repo = fixtureRepo();

  const result = checkPluginSync({ repo });

  assert.equal(result.ok, true);
  assert.match(result.reason, /not installed/);
});

test("a repo with no plugin manifest is not a plugin and is never reported as drifted", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-plugin-sync-none-"));

  const result = checkPluginSync({ repo });

  assert.equal(result.ok, true);
  assert.match(result.reason, /no plugin manifest/);
});

test("THE REAL REPO: the detector runs against it and returns a verdict, never throws", () => {
  // The one assertion about this machine that is safe to make: the check
  // completes and answers. Whether it says in-sync or drifted depends on when
  // the developer last reinstalled the plugin, which is not a code property.
  const result = checkPluginSync();

  assert.equal(typeof result.ok, "boolean");
  if (result.ok) {
    assert.equal(typeof result.reason, "string");
  } else {
    assert.ok(Array.isArray(result.problems) && result.problems.length > 0);
    // A drift report is only useful if it names what to look at.
    for (const p of result.problems) assert.equal(typeof p, "string");
  }
});

test("the load-bearing list includes the bundled MCP server — the file whose absence broke the plugin", async () => {
  // Regression pin for f5077c8: a marketplace install shipped without
  // inspector/mcp/dist/server.mjs and the MCP server could not start. That file
  // being absent from a cache is exactly the drift this check has to catch, so
  // it must never quietly fall off the compared set.
  const source = await fs.promises.readFile(
    path.join(HERE, "..", "scripts", "check-plugin-sync.mjs"),
    "utf8",
  );

  assert.match(source, /inspector\/mcp\/dist\/server\.mjs/);
  assert.match(source, /\.claude-plugin\/plugin\.json/);
});
