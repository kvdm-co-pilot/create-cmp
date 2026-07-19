// bin/server.mjs — an integration test that spawns the REAL stdio MCP server
// (the same way an editor/agent would) and lists its registered tools. Every
// other test file in this package imports pure functions from src/lib/*.mjs
// directly; this is the one seam that pins bin/server.mjs's tool REGISTRY
// itself — specifically that review_comments and resolve_comment (VL-7,
// §7.3) are wired up with valid schemas, taking the count from 23 to 25
// (VERIFICATION-LAYER-DESIGN.md §7.3's "server.mjs, 23 → 25 tools"), and that
// snapshot_variant (GENESIS-FLOW-DESIGN.md §2/§3) takes it from 25 to 26.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(HERE, "..", "bin", "server.mjs");

async function withClient(fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY] });
  const client = new Client({ name: "vl7-test-client", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test("bin/server.mjs registers 26 tools, including review_comments, resolve_comment, and snapshot_variant with valid schemas", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 26, "23 pre-VL-7 tools + review_comments + resolve_comment + snapshot_variant");

    const byName = new Map(tools.map((t) => [t.name, t]));

    const review = byName.get("review_comments");
    assert.ok(review, "review_comments is registered");
    assert.match(review.description, /comment/i);
    assert.equal(review.inputSchema.type, "object");
    assert.ok(review.inputSchema.properties.status, "status filter is in the schema");
    assert.ok(review.inputSchema.properties.waitForComment, "waitForComment is in the schema");
    assert.ok(review.inputSchema.properties.timeoutMs, "timeoutMs is in the schema");

    const resolve = byName.get("resolve_comment");
    assert.ok(resolve, "resolve_comment is registered");
    assert.match(resolve.description, /resolve/i);
    assert.equal(resolve.inputSchema.type, "object");
    assert.deepEqual(resolve.inputSchema.required?.sort(), ["id", "note"]);
    assert.ok(resolve.inputSchema.properties.id);
    assert.ok(resolve.inputSchema.properties.note);

    const snapshotVariant = byName.get("snapshot_variant");
    assert.ok(snapshotVariant, "snapshot_variant is registered");
    assert.match(snapshotVariant.description, /variant/i);
    assert.equal(snapshotVariant.inputSchema.type, "object");
    assert.deepEqual(snapshotVariant.inputSchema.required, ["name"]);
    assert.ok(snapshotVariant.inputSchema.properties.name, "name is in the schema");
  });
});

test("bin/server.mjs: snapshot_variant refuses cleanly with no preview service running", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "snapshot_variant", arguments: { name: "warmer" } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No preview service is running/);
  });
});

test("bin/server.mjs: review_comments/resolve_comment refuse cleanly with no preview service running", async () => {
  await withClient(async (client) => {
    const review = await client.callTool({ name: "review_comments", arguments: {} });
    assert.equal(review.isError, true);
    assert.match(review.content[0].text, /No preview service is running/);

    const resolve = await client.callTool({ name: "resolve_comment", arguments: { id: "c1", note: "n/a" } });
    assert.equal(resolve.isError, true);
    assert.match(resolve.content[0].text, /No preview service is running/);
  });
});
