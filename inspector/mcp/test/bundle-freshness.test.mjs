// dist/server.mjs is a COMMITTED build artifact — the Claude Code plugin is
// distributed as a git clone, so whatever is in git is what users run. That makes
// staleness the obvious failure mode: edit src/, forget to rebuild, and every
// plugin user runs yesterday's server while the repo's tests pass against today's
// source. Nothing would say so.
//
// Two independent guards, because they fail differently:
//   1. the bundle attests its inputs (a hash of every source + the declared deps),
//      so a source edit without a rebuild is a hard failure with the fix printed;
//   2. the bundle is genuinely self-contained — it boots and serves its whole tool
//      registry from a directory with no node_modules anywhere above it, which is
//      the actual condition in ~/.claude/plugins/cache.
//
// Guard 2 is the one that matters: the bug this bundle exists to fix was a server
// that could not start at all from a fresh plugin install, and no test noticed
// because every test ran from a checkout where node_modules happened to exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inputsHash, recordedHash } from "../scripts/build-bundle.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = path.join(HERE, "..");
const BUNDLE = path.join(MCP_ROOT, "dist", "server.mjs");

test("dist/server.mjs is committed and built from the CURRENT sources", () => {
  assert.ok(
    fs.existsSync(BUNDLE),
    "inspector/mcp/dist/server.mjs is missing — run: npm run build:bundle (in inspector/mcp) and commit it",
  );
  const want = inputsHash();
  const got = recordedHash(BUNDLE);
  assert.ok(got, `the bundle carries no cmp:bundle-inputs marker — rebuild it`);
  assert.equal(
    got,
    want,
    `dist/server.mjs is STALE (built from ${String(got).slice(0, 12)}, sources hash ${want.slice(0, 12)}).\n` +
      `      The plugin runs the committed bundle, so this drift ships.\n` +
      `      Fix: cd inspector/mcp && npm run build:bundle, then commit dist/server.mjs`,
  );
});

test("dist/server.mjs boots and serves every tool with NO node_modules in scope", async () => {
  // Node resolves bare imports by walking UP the tree, so the bundle has to be
  // somewhere with no node_modules above it — os.tmpdir() qualifies, and a check
  // below proves it rather than assuming.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-bundle-"));
  try {
    for (let d = dir; d !== path.dirname(d); d = path.dirname(d)) {
      assert.ok(!fs.existsSync(path.join(d, "node_modules")), `node_modules found at ${d} — isolation is not real`);
    }
    const copy = path.join(dir, "server.mjs");
    fs.copyFileSync(BUNDLE, copy);

    const proc = spawn(process.execPath, [copy], { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    const send = (msg) => proc.stdin.write(`${JSON.stringify(msg)}\n`);
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "freshness", version: "0" } },
    });
    await new Promise((r) => setTimeout(r, 700));
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    await new Promise((r) => setTimeout(r, 1800));

    const messages = stdout
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const init = messages.find((m) => m.id === 1);
    assert.ok(init && init.result, `the bundle never completed initialize. stderr: ${stderr.slice(0, 400)}`);
    assert.equal(init.result.serverInfo.name, "cmp-inspector");
    assert.ok(init.result.serverInfo.version, "the bundle reports a version without reading a sibling manifest");

    const list = messages.find((m) => m.id === 2);
    assert.ok(list && list.result, `tools/list produced no result. stderr: ${stderr.slice(0, 400)}`);
    const names = list.result.tools.map((t) => t.name);
    assert.equal(names.length, 28, `the bundled registry is complete (got ${names.length})`);
    for (const required of ["preview", "capture_screen", "relaunch_app", "approval_status", "review_comments"]) {
      assert.ok(names.includes(required), `${required} is in the bundled registry`);
    }

    proc.kill();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the plugin's .mcp.json points at the bundle, not the unbundled entry", () => {
  // The cache has no node_modules; bin/server.mjs there dies on ERR_MODULE_NOT_FOUND.
  const mcp = JSON.parse(fs.readFileSync(path.join(MCP_ROOT, "..", "..", ".mcp.json"), "utf8"));
  const args = mcp.mcpServers["cmp-inspector"].args;
  assert.deepEqual(args, ["inspector/mcp/dist/server.mjs"], "the plugin must launch the self-contained bundle");
});
