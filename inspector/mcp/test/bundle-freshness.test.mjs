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
    const parsed = () =>
      stdout
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
    // Wait for the RESPONSE, bounded — never a fixed sleep. This test used to
    // sleep 700 ms then 1800 ms and read whatever had arrived; under a loaded
    // machine (the whole root suite in parallel inside `npm publish`, three
    // Gradle daemons, two consoles) the bundle answered late and the test
    // failed the release gate on timing, not on the bundle. The bound is the
    // assertion: a bundle that has not answered in 20 s is broken, and a
    // healthy one is not made to wait.
    const waitFor = async (id, what) => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const hit = parsed().find((m) => m.id === id);
        if (hit) return hit;
        if (proc.exitCode !== null) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      return parsed().find((m) => m.id === id) ?? null;
    };
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "freshness", version: "0" } },
    });
    await waitFor(1, "initialize");
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    await waitFor(2, "tools/list");

    const messages = parsed();

    const init = messages.find((m) => m.id === 1);
    assert.ok(init && init.result, `the bundle never completed initialize. stderr: ${stderr.slice(0, 400)}`);
    assert.equal(init.result.serverInfo.name, "cmp-inspector");
    assert.ok(init.result.serverInfo.version, "the bundle reports a version without reading a sibling manifest");

    const list = messages.find((m) => m.id === 2);
    assert.ok(list && list.result, `tools/list produced no result. stderr: ${stderr.slice(0, 400)}`);
    const names = list.result.tools.map((t) => t.name);
    assert.equal(names.length, 15, `the bundled registry is complete (got ${names.length})`);
    for (const required of ["preview", "connect_live", "inspect_tree", "approval_status", "review_comments"]) {
      assert.ok(names.includes(required), `${required} is in the bundled registry`);
    }

    proc.kill();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the plugin's .mcp.json names the bundle, and anchors it to the plugin root", () => {
  // TWO independent ways this line can be wrong, and for a year it gated one.
  //
  //   WHICH FILE — the cache has no node_modules, so bin/server.mjs there dies
  //                on ERR_MODULE_NOT_FOUND. f5077c8 fixed that, measured against
  //                the real cached install, and this test was written for it.
  //   FROM WHERE — a relative path resolves against the client's cwd, and a
  //                plugin-loaded server is not launched from the plugin root.
  //                So the right file, named the wrong way, still does not start.
  //
  // ONE FILE, TWO ROLES, and this is the trap for whoever reads it next. This
  // repo IS the plugin, so `.mcp.json` is the PLUGIN's config when loaded from
  // the marketplace cache and a PROJECT config when you work in this checkout.
  // ${CLAUDE_PLUGIN_ROOT} is substituted in the first and not the second — it is
  // not an environment variable, `printenv` finds nothing — so the anchored
  // spelling that makes the plugin work from any repo leaves the project-scoped
  // copy dying with CONNECTION_CLOSED right here. Measured 2026-09-15: the
  // plugin-scoped server answers, the project-scoped one does not.
  //
  // That is the correct trade and not a defect. The plugin server serves the
  // same tools from anywhere, which is the whole point; the project-scoped one
  // was a duplicate that only ever worked in this one directory. DO NOT "fix"
  // the CONNECTION_CLOSED by making this path relative again — that is the bug,
  // and this test is what stops the round trip.
  //
  // The second was not gated, because the test pinned the literal string the
  // first fix happened to leave behind. Pinning a spelling looks stricter than
  // asserting a property and is weaker: it cannot tell a correction from a
  // regression, so it refuses both. This asserts the two properties its own
  // comment always claimed to be about, plus a third the old form could not
  // reach at all — that the file is actually THERE.
  const root = path.join(MCP_ROOT, "..", "..");
  const mcp = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));
  const args = mcp.mcpServers["cmp-inspector"].args;

  assert.equal(args.length, 1, `the server is launched with exactly one argument, got ${JSON.stringify(args)}`);
  const arg = args[0];

  const PLUGIN_ROOT = "${CLAUDE_PLUGIN_ROOT}";
  assert.ok(
    arg.startsWith(`${PLUGIN_ROOT}/`),
    `the path must be anchored to ${PLUGIN_ROOT}, got ${JSON.stringify(arg)}. A relative path resolves ` +
      "against whatever cwd the MCP client happens to have, which for a plugin-loaded server is not the " +
      "plugin root — so the bundle is not found and no tool is ever served.",
  );

  const rel = arg.slice(PLUGIN_ROOT.length + 1);
  assert.equal(
    rel,
    path.relative(root, BUNDLE),
    "the plugin must launch the self-contained bundle, never bin/server.mjs — that is the file with no " +
      "node_modules to resolve",
  );
  assert.ok(
    fs.existsSync(path.join(root, rel)),
    `.mcp.json names ${rel}, and there is no such file in this repo — the plugin would launch nothing`,
  );
});
