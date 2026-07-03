#!/usr/bin/env node
// cmp-inspector — stdio MCP server.
//
// Thin transport/wiring only: every tool delegates to the pure functions in
// ../src/lib/*.mjs so the logic stays unit-testable without an MCP runtime.
//
// The tools operate on the fixed JSON tree contract (schemaVersion 1) from any
// of three interchangeable sources:
//   tier 0 — a tree JSON file produced by the headless harness ({kind:"file"} / treePath)
//   tier 1 — the running app's debug-only inspector server over adb forward ({kind:"live"})
//   tier 2 — Appium/uiautomator page-source XML, converted ({kind:"uiautomator"})
// See README.md.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { walk, loadTree } from "../src/lib/tree.mjs";
import { getNode, assertToken, layoutGaps } from "../src/lib/query.mjs";
import { findDrift, diffAgainstDesignSystem } from "../src/lib/drift.mjs";
import { normalizeTree, diffTrees } from "../src/lib/snapshot.mjs";
import { auditA11y } from "../src/lib/a11y.mjs";
import {
  resolveTree as resolveTreeFromSource,
  resolveCatalog,
  requireInstrumentedTree,
} from "../src/lib/source.mjs";
import { fetchHealth, validatePort, validateSerial } from "../src/lib/live.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Session default source, set by connect_live so subsequent tool calls can
// omit `source` entirely. Explicit `source`/`treePath` always wins over it.
let sessionDefaultSource = null;

// Resolve which tree a tool call operates on. Pull-on-demand: a live source
// re-fetches /inspect/tree on EVERY call, so each call sees the current screen.
function resolveTree({ source, treePath } = {}) {
  return resolveTreeFromSource({ source, treePath, sessionDefault: sessionDefaultSource });
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

// ---------------------------------------------------------------------------
// server + tools
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "cmp-inspector",
  version: "0.2.0",
});

const treePathArg = z
  .string()
  .optional()
  .describe(
    "LEGACY (kept for compatibility): path to a tree JSON produced by the inspector harness. " +
      "Prefer `source`. Defaults to $CMP_INSPECTOR_TREE."
  );

const sourceArg = z
  .union([
    z
      .object({ kind: z.literal("file"), path: z.string().describe("Path to a tree JSON file (tier 0 headless harness output).") })
      .describe("Tier 0: a tree JSON file on disk."),
    z
      .object({
        kind: z.literal("live"),
        host: z.string().optional().describe("Inspector host (default 127.0.0.1)."),
        port: z.number().int().optional().describe("Inspector port (default 9500)."),
      })
      .describe(
        "Tier 1: the RUNNING app's debug-only inspector server (real data + real nav state). " +
          "Re-fetched on every call — each call sees the current screen. Run connect_live first."
      ),
    z
      .object({
        kind: z.literal("uiautomator"),
        xml: z.string().optional().describe("Raw Appium/uiautomator getPageSource XML."),
        xmlPath: z.string().optional().describe("Path to a file holding that XML."),
      })
      .describe(
        "Tier 2 fallback: convert Appium/uiautomator page-source XML (geometry + text only, " +
          "NO design tokens — any app, zero instrumentation)."
      ),
  ])
  .optional()
  .describe(
    "Where the tree comes from. Omit to use (in order): legacy treePath, the connect_live session " +
      "default, $CMP_INSPECTOR_LIVE (host:port), $CMP_INSPECTOR_TREE (file)."
  );

server.registerTool(
  "inspect_tree",
  {
    title: "Inspect Compose tree",
    description:
      "Load the full enriched Compose semantics tree (hierarchy + geometry + resolved design tokens) as JSON, " +
      "plus a compact summary { nodeCount, taggedCount, tokenizedCount }. With source {kind:'live'} this reads " +
      "the RUNNING app's current screen (real data + nav state) on every call.",
    inputSchema: { source: sourceArg, treePath: treePathArg },
  },
  guarded(async ({ source, treePath }) => {
    const tree = await resolveTree({ source, treePath });
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
      source: sourceArg,
      treePath: treePathArg,
      testTag: z.string().describe("The testTag of the node to fetch."),
    },
  },
  guarded(async ({ source, treePath, testTag }) => {
    const tree = await resolveTree({ source, treePath });
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
      source: sourceArg,
      treePath: treePathArg,
      testTag: z.string().describe("The testTag of the node to assert on."),
      key: z.string().describe("A key inside designToken.resolved (e.g. 'padding', 'radius', 'color')."),
      expected: z.string().describe("The expected resolved value (e.g. '16dp')."),
    },
  },
  guarded(async ({ source, treePath, testTag, key, expected }) => {
    const tree = requireInstrumentedTree(await resolveTree({ source, treePath }), "assert_token");
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
      source: sourceArg,
      treePath: treePathArg,
      testTagA: z.string().describe("testTag of the first node."),
      testTagB: z.string().describe("testTag of the second node."),
    },
  },
  guarded(async ({ source, treePath, testTagA, testTagB }) => {
    const tree = await resolveTree({ source, treePath });
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
      "report drift entries { path, token, declared, resolved }. Empty list = clean. With a live source and " +
      "no catalogPath, the catalog is fetched from the app's /inspect/design-system endpoint.",
    inputSchema: {
      source: sourceArg,
      treePath: treePathArg,
      catalogPath: z
        .string()
        .optional()
        .describe(
          "Path to the declared design-system catalog JSON ({ colors, dimens }). Optional for live sources " +
            "(fetched from /inspect/design-system)."
        ),
    },
  },
  guarded(async ({ source, treePath, catalogPath }) => {
    const tree = requireInstrumentedTree(
      await resolveTree({ source, treePath }),
      "diff_against_design_system"
    );
    const catalog = await resolveCatalog({
      source,
      treePath,
      catalogPath,
      sessionDefault: sessionDefaultSource,
    });
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
    inputSchema: { source: sourceArg, treePath: treePathArg },
  },
  guarded(async ({ source, treePath }) => {
    const tree = requireInstrumentedTree(await resolveTree({ source, treePath }), "find_drift");
    const drift = findDrift(tree);
    return ok({ clean: drift.length === 0, driftCount: drift.length, drift });
  })
);

server.registerTool(
  "snapshot_save",
  {
    title: "Save a golden-tree snapshot",
    description:
      "Normalize the current tree (round bounds to integers, drop `source`, sort designToken.resolved keys) " +
      "and write it to `snapshotPath` as the golden regression file. Commit the golden: diffs against it are " +
      "human-readable JSON, not pixels.",
    inputSchema: {
      source: sourceArg,
      treePath: treePathArg,
      snapshotPath: z.string().describe("Where to write the normalized golden snapshot JSON."),
    },
  },
  guarded(async ({ source, treePath, snapshotPath }) => {
    const tree = await resolveTree({ source, treePath });
    const normalized = normalizeTree(tree);
    const dir = dirname(snapshotPath);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(snapshotPath, JSON.stringify(normalized, null, 2) + "\n");
    return ok({ saved: true, snapshotPath, summary: summarize(normalized) });
  })
);

server.registerTool(
  "snapshot_diff",
  {
    title: "Diff the current tree against a golden snapshot",
    description:
      "Structurally compare the current tree with a saved golden: node added/removed (by path), text/testTag/" +
      "contentDescription changed, designToken changed, role/clickable/disabled changed, bounds moved beyond " +
      "`tolerancePx` (default 1). Returns { pass, diffCount, diffs:[{path, kind, before, after}] }; empty diffs = pass. " +
      "This is the CI regression primitive — JSON diffs instead of pixel flakiness.",
    inputSchema: {
      source: sourceArg,
      treePath: treePathArg,
      snapshotPath: z.string().describe("Path to the golden snapshot written by snapshot_save."),
      tolerancePx: z
        .number()
        .min(0)
        .optional()
        .describe("Max allowed bounds movement per axis in px before a 'bounds-moved' diff (default 1)."),
    },
  },
  guarded(async ({ source, treePath, snapshotPath, tolerancePx }) => {
    const tree = await resolveTree({ source, treePath });
    const golden = loadTree(snapshotPath);
    const diffs = diffTrees(tree, golden, tolerancePx ?? 1);
    return ok({ pass: diffs.length === 0, diffCount: diffs.length, diffs });
  })
);

server.registerTool(
  "audit_a11y",
  {
    title: "Audit the tree for accessibility faults",
    description:
      "Check every node: clickable nodes smaller than `minTouchTargetPx` (default 48) in width or height, " +
      "clickable nodes with no text/contentDescription/descendant text (missing label), and empty-string " +
      "contentDescription (warning). Returns { violations:[{path,testTag,rule,detail,bounds}], warnings, " +
      "warningCount, passCount }. Note: the headless harness dumps at density 1, so px == dp there; pass a " +
      "device-density-scaled minTouchTargetPx for on-device trees. Old trees without the optional " +
      "clickable/role fields are skipped gracefully.",
    inputSchema: {
      source: sourceArg,
      treePath: treePathArg,
      minTouchTargetPx: z
        .number()
        .positive()
        .optional()
        .describe("Minimum touch-target size in px (default 48; px == dp on density-1 harness output)."),
    },
  },
  guarded(async ({ source, treePath, minTouchTargetPx }) => {
    const tree = await resolveTree({ source, treePath });
    const result = auditA11y(tree, { minTouchTargetPx });
    return ok({ pass: result.violations.length === 0, violationCount: result.violations.length, ...result });
  })
);

server.registerTool(
  "connect_live",
  {
    title: "Connect to a running app's live inspector",
    description:
      "Tier 1 handshake: run ONE bounded `adb forward tcp:<port> tcp:<port>` (the debug-only inspector " +
      "server binds loopback on the device), then GET /inspect/health. On success, sets the session " +
      "default source to {kind:'live', port} so subsequent tool calls can omit `source`. Requires a " +
      "create-cmp DEBUG build running on the device/emulator (the inspector is structurally absent from " +
      "release builds). This tool never launches apps or emulators.",
    inputSchema: {
      port: z.number().int().optional().describe("Inspector port (default 9500)."),
      serial: z.string().optional().describe("adb device serial (when several devices are attached)."),
    },
  },
  guarded(async ({ port, serial }) => {
    const p = validatePort(port);
    const s = validateSerial(serial);
    const args = [...(s ? ["-s", s] : []), "forward", `tcp:${p}`, `tcp:${p}`];
    try {
      await execFileAsync("adb", args, { timeout: 5000 });
    } catch (err) {
      return fail(
        `adb forward failed (adb ${args.join(" ")}): ${err && err.message ? err.message : err}. ` +
          "Is adb on PATH and a device/emulator attached (`adb devices`)?"
      );
    }
    const health = await fetchHealth({ port: p }); // throws an actionable error if unreachable
    sessionDefaultSource = { kind: "live", host: "127.0.0.1", port: p };
    return ok({
      status: "connected",
      forwarded: `tcp:${p} -> tcp:${p}`,
      sessionDefaultSource,
      health,
    });
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
