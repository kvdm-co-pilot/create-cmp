// bin/server.mjs — an integration test that spawns the REAL stdio MCP server
// (the same way an editor/agent would) and lists its registered tools. Every
// other test file in this package imports pure functions from src/lib/*.mjs
// directly; this is the one seam that pins bin/server.mjs's tool REGISTRY
// itself — since the agent-flow-retrospective consolidation (§5: 28 → 15
// public tools, every removed verb's job owned by a lane step or a surviving
// tool), it pins the surviving set EXACTLY: a tool leaking back in fails this
// test just as loudly as one going missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(HERE, "..", "bin", "server.mjs");

// The consolidated public surface (agent-flow-retrospective §5, decisions §8.4).
export const EXPECTED_TOOLS = [
  "approval_status",
  "connect_live",
  "db_query",
  "inspect_tree",
  "navigate_and_inspect",
  "preview",
  "preview_diff",
  "preview_status",
  "preview_stop",
  "render_screen",
  "resolve_comment",
  "review_comments",
  "runtime_crashes",
  "runtime_logs",
  "snapshot_variant",
];

async function withClient(fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY] });
  const client = new Client({ name: "registry-test-client", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test("bin/server.mjs registers EXACTLY the consolidated 15-tool surface", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      EXPECTED_TOOLS,
      "the public surface is exactly the post-consolidation set — nothing missing, nothing leaked back"
    );
  });
});

test("bin/server.mjs: the enriched inspect_tree carries the folded-in options", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));

    const inspect = byName.get("inspect_tree");
    assert.ok(inspect, "inspect_tree is registered");
    assert.ok(inspect.inputSchema.properties.testTag, "testTag (get_node's job) is in the schema");
    assert.ok(inspect.inputSchema.properties.format, "format (render_tree's wireframe job) is in the schema");
    assert.ok(inspect.inputSchema.properties.includeLayoutGaps, "includeLayoutGaps (layout_gaps' job) is in the schema");
    assert.match(inspect.description, /wireframe/i);
  });
});

test("bin/server.mjs: self-healing connect_live exposes launch/relaunch inputs and names its healing moves", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const connect = tools.find((t) => t.name === "connect_live");
    assert.ok(connect, "connect_live is registered");
    for (const prop of ["port", "serial", "projectDir", "appId", "relaunch", "clearState"]) {
      assert.ok(connect.inputSchema.properties[prop], `${prop} is in the schema`);
    }
    assert.match(connect.description, /SELF-HEALING/i);
    assert.match(connect.description, /kill-server/);
    assert.match(connect.description, /never a bare timeout/i);
  });
});

test("bin/server.mjs: console-backed tools refuse cleanly with no preview service running", async () => {
  await withClient(async (client) => {
    const variant = await client.callTool({ name: "snapshot_variant", arguments: { name: "warmer" } });
    assert.equal(variant.isError, true);
    assert.match(variant.content[0].text, /No preview service is running/);

    const review = await client.callTool({ name: "review_comments", arguments: {} });
    assert.equal(review.isError, true);
    assert.match(review.content[0].text, /No preview service is running/);

    const resolve = await client.callTool({ name: "resolve_comment", arguments: { id: "c1", note: "n/a" } });
    assert.equal(resolve.isError, true);
    assert.match(resolve.content[0].text, /No preview service is running/);
  });
});
