#!/usr/bin/env node
// cmp-inspector — stdio MCP server.
//
// Thin transport/wiring only: every tool delegates to the pure functions in
// ../src/lib/*.mjs so the logic stays unit-testable without an MCP runtime.
//
// The tools operate on the fixed JSON tree contract (schemaVersion 1) produced
// by the create-cmp inspector harness (headless JVM today; live emulator over an
// adb-forwarded endpoint later). See README.md.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadTree, walk } from "../src/lib/tree.mjs";
import { getNode, assertToken, layoutGaps } from "../src/lib/query.mjs";
import { findDrift, diffAgainstDesignSystem } from "../src/lib/drift.mjs";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Resolve which tree to load: explicit treePath wins, else CMP_INSPECTOR_TREE
// env var, else a clear instruction to render first.
function resolveTree(treePath) {
  const path = treePath || process.env.CMP_INSPECTOR_TREE;
  if (!path) {
    throw new Error(
      "No tree available. Pass `treePath` (a tree JSON produced by the inspector harness), " +
        "or set the CMP_INSPECTOR_TREE environment variable. Render a screen with the harness first."
    );
  }
  return loadTree(path);
}

function summarize(tree) {
  let nodeCount = 0;
  let taggedCount = 0;
  let tokenizedCount = 0;
  for (const { node } of walk(tree)) {
    nodeCount++;
    if (node.testTag != null) taggedCount++;
    if (node.designToken != null) tokenizedCount++;
  }
  return { nodeCount, taggedCount, tokenizedCount };
}

// Every tool returns a single JSON text-content block. On any handled error we
// return a structured { error } payload (isError:true) rather than throwing an
// uncaught exception / stack dump at the transport.
function ok(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}
function fail(message) {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
  };
}

// Wrap a handler so any thrown Error becomes a clean { error } result.
function guarded(fn) {
  return async (args) => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err && err.message ? err.message : String(err));
    }
  };
}

function loadCatalog(catalogPath) {
  if (!catalogPath) {
    throw new Error("diff_against_design_system: `catalogPath` is required (the declared design-system JSON).");
  }
  let raw;
  try {
    raw = readFileSync(catalogPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`catalog file not found: ${catalogPath}`);
    throw new Error(`could not read catalog file '${catalogPath}': ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`catalog file '${catalogPath}' is not valid JSON: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// server + tools
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "cmp-inspector",
  version: "0.1.0",
});

const treePathArg = z
  .string()
  .optional()
  .describe("Path to a tree JSON produced by the inspector harness. Defaults to $CMP_INSPECTOR_TREE.");

server.registerTool(
  "inspect_tree",
  {
    title: "Inspect Compose tree",
    description:
      "Load the full enriched Compose semantics tree (hierarchy + geometry + resolved design tokens) as JSON, " +
      "plus a compact summary { nodeCount, taggedCount, tokenizedCount }. If treePath is omitted, uses $CMP_INSPECTOR_TREE.",
    inputSchema: { treePath: treePathArg },
  },
  guarded(async ({ treePath }) => {
    const tree = resolveTree(treePath);
    return ok({ summary: summarize(tree), tree });
  })
);

server.registerTool(
  "get_node",
  {
    title: "Get node by testTag",
    description:
      "Return a single node (geometry + resolved design tokens) matched by its testTag, or a clear not-found.",
    inputSchema: {
      treePath: treePathArg,
      testTag: z.string().describe("The testTag of the node to fetch."),
    },
  },
  guarded(async ({ treePath, testTag }) => {
    const tree = resolveTree(treePath);
    const node = getNode(tree, testTag);
    if (!node) return fail(`No node found with testTag '${testTag}'.`);
    return ok({ node });
  })
);

server.registerTool(
  "assert_token",
  {
    title: "Assert a resolved design token",
    description:
      "Assert that a node's resolved design-token value for `key` equals `expected`. Returns { pass, key, actual, expected }.",
    inputSchema: {
      treePath: treePathArg,
      testTag: z.string().describe("The testTag of the node to assert on."),
      key: z.string().describe("A key inside designToken.resolved (e.g. 'padding', 'radius', 'color')."),
      expected: z.string().describe("The expected resolved value (e.g. '16dp')."),
    },
  },
  guarded(async ({ treePath, testTag, key, expected }) => {
    const tree = resolveTree(treePath);
    const node = getNode(tree, testTag);
    if (!node) return fail(`No node found with testTag '${testTag}'.`);
    return ok(assertToken(node, key, expected));
  })
);

server.registerTool(
  "layout_gaps",
  {
    title: "Compute spacing between two nodes",
    description:
      "Compute the spacing/padding between two nodes from their bounds: { gapX, gapY, dxLeft, dyTop }.",
    inputSchema: {
      treePath: treePathArg,
      testTagA: z.string().describe("testTag of the first node."),
      testTagB: z.string().describe("testTag of the second node."),
    },
  },
  guarded(async ({ treePath, testTagA, testTagB }) => {
    const tree = resolveTree(treePath);
    const a = getNode(tree, testTagA);
    if (!a) return fail(`No node found with testTag '${testTagA}'.`);
    const b = getNode(tree, testTagB);
    if (!b) return fail(`No node found with testTag '${testTagB}'.`);
    return ok({ testTagA, testTagB, gaps: layoutGaps(a, b) });
  })
);

server.registerTool(
  "diff_against_design_system",
  {
    title: "Diff resolved tokens against the declared catalog",
    description:
      "For every tokenized node, compare its resolved values against the declared design-system catalog; " +
      "report drift entries { path, token, declared, resolved }. Empty list = clean.",
    inputSchema: {
      treePath: treePathArg,
      catalogPath: z.string().describe("Path to the declared design-system catalog JSON ({ colors, dimens })."),
    },
  },
  guarded(async ({ treePath, catalogPath }) => {
    const tree = resolveTree(treePath);
    const catalog = loadCatalog(catalogPath);
    const drift = diffAgainstDesignSystem(tree, catalog);
    return ok({ clean: drift.length === 0, driftCount: drift.length, drift });
  })
);

server.registerTool(
  "find_drift",
  {
    title: "Find un-tokenized nodes",
    description:
      "Sweep the tree for nodes with a visual footprint but no design token (possible raw value / un-tokenized). " +
      "Returns the list; empty = clean.",
    inputSchema: { treePath: treePathArg },
  },
  guarded(async ({ treePath }) => {
    const tree = resolveTree(treePath);
    const drift = findDrift(tree);
    return ok({ clean: drift.length === 0, driftCount: drift.length, drift });
  })
);

// ---------------------------------------------------------------------------
// wire up stdio transport
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is the JSON-RPC channel.
  process.stderr.write("cmp-inspector MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`cmp-inspector fatal: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
