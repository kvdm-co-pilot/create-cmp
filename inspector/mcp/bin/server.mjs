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
  resolveSourceDescriptor,
  resolveCatalog,
  requireInstrumentedTree,
} from "../src/lib/source.mjs";
import {
  fetchHealth,
  fetchLiveCrashes,
  fetchLiveDbSchema,
  fetchLiveDbQuery,
  validatePort,
  validateSerial,
  DEFAULT_HOST,
} from "../src/lib/live.mjs";
import { navigateAndInspect, writeLiveScreenshot, DEFAULT_SETTLE_MS } from "../src/lib/navigate.mjs";
import { renderTreeSvg, countRenderable } from "../src/lib/render.mjs";
import { readPngMeta } from "../src/lib/png.mjs";
import { proveChange } from "../src/lib/prove.mjs";
import { attributeCrash } from "../src/lib/attribution.mjs";
import { parseLogcat } from "../src/lib/logcat.mjs";
import { createPreviewService } from "../src/lib/preview-service.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// The tier-0 harness lives alongside the MCP in the create-cmp checkout.
const DEFAULT_HARNESS_DIR = join(HERE, "..", "..", "harness");

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

// Recently-changed files for crash attribution: `git status --porcelain` (uncommitted work,
// the common case mid-session) + `git diff --name-only HEAD` (staged/committed-but-unpushed).
// Never throws — no repo / no git on PATH just means attribution degrades to "no evidence",
// which is a legitimate answer, not a tool failure.
async function gitChangedFiles(cwd) {
  try {
    const [status, diff] = await Promise.all([
      execFileAsync("git", ["status", "--porcelain"], { cwd, timeout: 5000 }),
      execFileAsync("git", ["diff", "--name-only", "HEAD"], { cwd, timeout: 5000 }).catch(() => ({ stdout: "" })),
    ]);
    const fromStatus = status.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      // porcelain lines are "XY path" (or "XY orig -> new" for renames) — strip the status code.
      .map((l) => l.replace(/^\S+\s+/, "").split(" -> ").pop());
    const fromDiff = diff.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    return [...new Set([...fromStatus, ...fromDiff])];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// server + tools
// ---------------------------------------------------------------------------

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const server = new McpServer({
  name: "cmp-inspector",
  version: pkg.version,
  // Injected into the connected agent's context — the discovery surface for the
  // default workflow. Front-loaded: the edit loop first, everything else after.
  instructions:
    "cmp-inspector: the AI-native window into a Compose Multiplatform app's UI — " +
    "structured JSON trees, never screenshots (pixels flow to the human, structure " +
    "flows to you).\n\n" +
    "DEFAULT UI LOOP — use while building or editing ANY screen of a create-cmp app; " +
    "no device, no emulator, no manual Gradle:\n" +
    "1. preview { projectDir }  → live self-updating gallery URL for the human; keep " +
    "it running for the whole session.\n" +
    "2. Edit code, then preview_status { waitForRender: true }  → blocks until the " +
    "outcome: changedLastRender names the screens your edit touched (empty = it " +
    "reached no screen); lastErrorSource \"compile\" = the edit didn't build (the " +
    "compiler's e: lines are in lastError).\n" +
    "3. preview_diff { screen }  → verdict: proven-clean | changed-with-regressions | " +
    "no-change. Zero snapshot bookkeeping.\n" +
    "4. preview_stop {} when the session ends.\n\n" +
    "One-off render: render_screen { projectDir, screen } (~1s warm via the resident " +
    "daemon). Inspect the RUNNING app (tier 1): connect_live, then get_node / " +
    "assert_token / audit_a11y / find_drift / navigate_and_inspect / prove_change. " +
    "Runtime eyes beyond the tree: runtime_crashes (persisted crashes + cause attribution), " +
    "runtime_logs (adb logcat, structured + bounded), db_schema / db_query (read-only SQLite " +
    "state). Human approval gates: the preview gallery's Approvals/Design System/Specs tabs " +
    "(same URL as `preview`) are where the human reviews and signs governed artifacts; " +
    "approval_status { waitForDecision: true } blocks on their decision the same way " +
    "preview_status blocks on a render. Always assert on tree JSON; never read PNG bytes into " +
    "context.",
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
      "clickable nodes with no text/contentDescription/descendant text (missing label), a node whose " +
      "designToken.resolved exposes BOTH a foreground and a background color with a WCAG contrast ratio " +
      "below `minContrastRatio` (default 4.5, AA for normal text — fires ONLY when both colors are " +
      "genuinely known/parseable, never a guess), and empty-string contentDescription (warning). Returns " +
      "{ violations:[{path,testTag,rule,detail,bounds}], warnings, warningCount, passCount }. Rules: " +
      "touch-target-too-small, missing-label, low-contrast, (warn) empty-content-description. Note: the " +
      "headless harness dumps at density 1, so px == dp there; pass a device-density-scaled " +
      "minTouchTargetPx for on-device trees. Old trees without the optional clickable/role fields are " +
      "skipped gracefully.",
    inputSchema: {
      source: sourceArg,
      treePath: treePathArg,
      minTouchTargetPx: z
        .number()
        .positive()
        .optional()
        .describe("Minimum touch-target size in px (default 48; px == dp on density-1 harness output)."),
      minContrastRatio: z
        .number()
        .positive()
        .optional()
        .describe("Minimum WCAG contrast ratio for fg/bg color pairs (default 4.5, WCAG AA normal text)."),
    },
  },
  guarded(async ({ source, treePath, minTouchTargetPx, minContrastRatio }) => {
    const tree = await resolveTree({ source, treePath });
    const result = auditA11y(tree, { minTouchTargetPx, minContrastRatio });
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
      remoteUrl: `http://127.0.0.1:${p}/inspect/remote`,
      remoteUrlHint:
        "Offer to open remoteUrl in the HUMAN's browser — it is the live device view: they " +
        "watch and click-to-drive the real app while you inspect the tree (navigate_and_inspect / " +
        "prove_change). Do not fetch it yourself.",
    });
  })
);

server.registerTool(
  "navigate_and_inspect",
  {
    title: "Tap the running app and re-inspect (the navigation primitive)",
    description:
      "Drive the LIVE app one tap at a time, no pixels needed: resolves the tap point from the live " +
      "tree (center of `testTag`'s bounds — or pass explicit root-relative `x`/`y` read from bounds), " +
      "delivers it via the inspector's POST /inspect/tap (HTTP, not adb), waits `settleMs` for the UI " +
      "to settle, then re-fetches the tree. Returns { tapped:{x,y,testTag?}, before:{tags,textSample," +
      "nodeCount}, after:{tags,textSample,nodeCount}, changed, route? } — assert the navigation " +
      "structurally (old screen's tags gone, new content present). `route:{before,after}` (each a " +
      "currentRoute string) is included ONLY when the running app exposes GET /inspect/nav — omitted " +
      "entirely for older apps that predate it, never reported as null/failed. Requires connect_live " +
      "(or a reachable forward).",
    inputSchema: {
      testTag: z
        .string()
        .optional()
        .describe("Tap the center of this node's bounds (resolved from the live tree)."),
      x: z.number().optional().describe("Explicit tap x in root-relative px (with `y`, instead of testTag)."),
      y: z.number().optional().describe("Explicit tap y in root-relative px (with `x`, instead of testTag)."),
      port: z.number().int().optional().describe("Inspector port (default: the connect_live session port, else 9500)."),
      settleMs: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(`How long to wait after the tap before re-fetching the tree (default ${DEFAULT_SETTLE_MS}ms).`),
    },
  },
  guarded(async ({ testTag, x, y, port, settleMs }) => {
    const live = sessionDefaultSource && sessionDefaultSource.kind === "live" ? sessionDefaultSource : {};
    return ok(
      await navigateAndInspect({
        testTag,
        x,
        y,
        host: live.host || DEFAULT_HOST,
        port: validatePort(port ?? live.port),
        settleMs,
      })
    );
  })
);

// ---------------------------------------------------------------------------
// runtime eyes — §3.2 crashes/logs, §3.3 DB state (VERIFICATION-LAYER-DESIGN.md)
// ---------------------------------------------------------------------------

const DEFAULT_LOG_LIMIT = 200;
const MAX_LOG_LIMIT = 2000;

server.registerTool(
  "runtime_crashes",
  {
    title: "Fetch persisted crashes from the running app, with cause attribution",
    description:
      "GET /inspect/crashes on the running app (current boot + previous ones; the on-device handler " +
      "chains to whatever handler was installed before it — it never swallows the crash). Each crash " +
      "is attributed: its stack frames are intersected with recently-edited files (git status + git " +
      "diff in `projectDir`, default cwd) to produce a verdict — " +
      "'likely-caused-by-recent-edit' (with the matching frame(s) as evidence) or " +
      "'no-recent-edit-implicated'. Returns { crashes:[{timestamp,exception,message,frames,attribution}], " +
      "changedFilesConsidered }. Requires connect_live.",
    inputSchema: {
      since: z.string().optional().describe("ISO timestamp — only crashes at/after this instant."),
      projectDir: z.string().optional().describe("App repo root for git-based attribution (default: cwd)."),
      port: z.number().int().optional().describe("Inspector port (default: the connect_live session port, else 9500)."),
    },
  },
  guarded(async ({ since, projectDir, port }) => {
    const live = sessionDefaultSource && sessionDefaultSource.kind === "live" ? sessionDefaultSource : {};
    const data = await fetchLiveCrashes({ host: live.host || DEFAULT_HOST, port: validatePort(port ?? live.port) });
    let crashes = data && Array.isArray(data.crashes) ? data.crashes : [];
    if (since) crashes = crashes.filter((c) => c && c.timestamp && c.timestamp >= since);
    const changedFiles = await gitChangedFiles(projectDir ? resolvePath(projectDir) : process.cwd());
    const attributed = crashes.map((c) => ({ ...c, attribution: attributeCrash(c, changedFiles) }));
    return ok({ crashes: attributed, changedFilesConsidered: changedFiles });
  })
);

server.registerTool(
  "runtime_logs",
  {
    title: "Fetch recent device logs for the running app (adb logcat)",
    description:
      "Shells `adb shell pidof <appId>` (appId resolved from the live inspector's GET /inspect/health) " +
      "then `adb logcat -v threadtime --pid=<pid> -d` and returns STRUCTURED, BOUNDED entries — never a " +
      "log firehose: default limit " +
      DEFAULT_LOG_LIMIT +
      ", max " +
      MAX_LOG_LIMIT +
      ", newest-first tail. Optional `level` keeps that severity and above (adb's own ordering); " +
      "`since` (ISO timestamp) keeps entries at/after it. No on-device log capture — v1 is adb-only, " +
      "so it needs a device/emulator attached and adb on PATH; errors are actionable (no device, no " +
      "process running, adb missing).",
    inputSchema: {
      since: z.string().optional().describe("ISO timestamp — only entries at/after this instant."),
      level: z.enum(["V", "D", "I", "W", "E", "F"]).optional().describe("Minimum severity (that level and above)."),
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_LOG_LIMIT)
        .optional()
        .describe(`Max entries returned, newest-first (default ${DEFAULT_LOG_LIMIT}, max ${MAX_LOG_LIMIT}).`),
      port: z.number().int().optional().describe("Inspector port (default: the connect_live session port, else 9500)."),
      serial: z.string().optional().describe("adb device serial (when several devices are attached)."),
    },
  },
  guarded(async ({ since, level, limit, port, serial }) => {
    const live = sessionDefaultSource && sessionDefaultSource.kind === "live" ? sessionDefaultSource : {};
    const health = await fetchHealth({ host: live.host || DEFAULT_HOST, port: validatePort(port ?? live.port) });
    const appId = health && health.appId;
    if (!appId) return fail("live inspector health payload has no appId — cannot resolve the device pid.");
    const s = validateSerial(serial);
    const withSerial = (extra) => (s ? ["-s", s, ...extra] : extra);

    let pid;
    try {
      const { stdout } = await execFileAsync("adb", withSerial(["shell", "pidof", appId]), { timeout: 5000 });
      pid = stdout.trim().split(/\s+/)[0];
    } catch (err) {
      return fail(
        `adb shell pidof ${appId} failed: ${err && err.message ? err.message : err}. ` +
          "Is adb on PATH and a device/emulator attached (`adb devices`)?"
      );
    }
    if (!pid) return fail(`no running process found for '${appId}' — is the app in the foreground?`);

    let stdout;
    try {
      ({ stdout } = await execFileAsync(
        "adb",
        withSerial(["logcat", "-v", "threadtime", `--pid=${pid}`, "-d"]),
        { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
      ));
    } catch (err) {
      return fail(`adb logcat failed: ${err && err.message ? err.message : err}`);
    }

    const entries = parseLogcat(stdout, { since, level });
    const cap = Math.min(limit || DEFAULT_LOG_LIMIT, MAX_LOG_LIMIT);
    const tail = entries.slice(Math.max(0, entries.length - cap));
    return ok({ pid: Number(pid), appId, count: tail.length, truncated: entries.length > tail.length, entries: tail });
  })
);

server.registerTool(
  "db_schema",
  {
    title: "List the running app's SQLite tables",
    description:
      "GET /inspect/db on the running app: tables via `sqlite_master` as { name, sql } (CREATE TABLE " +
      "text). Read-only, off the main thread. Returns { tables:[...] }. 404 when the app's `room` " +
      "feature is off. Requires connect_live.",
    inputSchema: {
      port: z.number().int().optional().describe("Inspector port (default: the connect_live session port, else 9500)."),
    },
  },
  guarded(async ({ port }) => {
    const live = sessionDefaultSource && sessionDefaultSource.kind === "live" ? sessionDefaultSource : {};
    return ok(await fetchLiveDbSchema({ host: live.host || DEFAULT_HOST, port: validatePort(port ?? live.port) }));
  })
);

server.registerTool(
  "db_query",
  {
    title: "Read rows from one SQLite table (read-only, bounded)",
    description:
      "GET /inspect/db?table=<name>&limit=<n> on the running app. `table` must be a real name from " +
      "db_schema — the device validates it strictly against `sqlite_master` before ever touching a " +
      "query, so an unknown name 404s rather than running arbitrary SQL. Rows are capped by `limit` " +
      "(device-side default/max apply regardless of what's requested). Returns { table, columns, rows, " +
      "rowCount }. Requires connect_live.",
    inputSchema: {
      table: z.string().describe("Exact table name (see db_schema)."),
      limit: z.number().int().positive().optional().describe("Row cap (device-side default/max still apply)."),
      port: z.number().int().optional().describe("Inspector port (default: the connect_live session port, else 9500)."),
    },
  },
  guarded(async ({ table, limit, port }) => {
    const live = sessionDefaultSource && sessionDefaultSource.kind === "live" ? sessionDefaultSource : {};
    return ok(
      await fetchLiveDbQuery({ table, limit, host: live.host || DEFAULT_HOST, port: validatePort(port ?? live.port) })
    );
  })
);

server.registerTool(
  "render_tree",
  {
    title: "Render the tree as an SVG wireframe",
    description:
      "Render the semantics tree (ANY source, including live) as a deterministic SVG wireframe: every " +
      "node with a footprint as a rect, token-annotated nodes highlighted with a resolved-values chip " +
      "('radius 16 · pad 16'), clickable nodes with a distinct outline, testTags as mono labels, text " +
      "shown, plus a legend and a footer (nodeCount · source · schemaVersion). Writes the SVG to `out` " +
      "and returns { svgPath, nodeCount, width, height } AND the SVG text — SVG is structured text, " +
      "not pixels, so it is safe for model context. Set a11y:true to overlay audit violations in a " +
      "danger style.",
    inputSchema: {
      source: sourceArg,
      treePath: treePathArg,
      out: z
        .string()
        .optional()
        .describe(
          "Where to write the SVG. Default: next to a file-source tree (tree.json -> tree.svg), " +
            "else ./render-tree.svg in the caller's cwd."
        ),
      a11y: z.boolean().optional().describe("Overlay audit_a11y violations in the danger style."),
      maxDepth: z.number().int().min(0).optional().describe("Only draw nodes up to this depth (root = 0)."),
      scale: z.number().positive().optional().describe("Explicit px scale (default fits width to ~740)."),
    },
  },
  guarded(async ({ source, treePath, out, a11y, maxDepth, scale }) => {
    const tree = await resolveTree({ source, treePath });
    const audit = a11y ? auditA11y(tree) : undefined;
    const svg = renderTreeSvg(tree, { a11y: audit, maxDepth, scale });

    let svgPath;
    if (out) {
      svgPath = resolvePath(out);
    } else {
      const desc = resolveSourceDescriptor({ source, treePath, sessionDefault: sessionDefaultSource });
      svgPath =
        desc.kind === "file" && desc.path
          ? resolvePath(desc.path.replace(/\.json$/i, "") + ".svg")
          : resolvePath(join(process.cwd(), "render-tree.svg"));
    }
    const dir = dirname(svgPath);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(svgPath, svg);

    const { total } = countRenderable(tree, { maxDepth });
    const [, w, h] = svg.match(/<svg[^>]* width="(\d+)" height="(\d+)"/) || [];
    return ok({
      svgPath,
      nodeCount: total,
      width: Number(w),
      height: Number(h),
      svg,
    });
  })
);

const RENDER_SCREEN_DISPLAY_HINT =
  "Pixels are for the HUMAN, structure is for the AI: do NOT read this PNG's bytes into model " +
  "context. To show it, write a small HTML file embedding <img src=\"file://<path>\"> and open it " +
  "(e.g. `open preview.html` on macOS), or attach the file through the host UI. For your own " +
  "reasoning, use render_tree / inspect_tree on the same screen instead.";

server.registerTool(
  "render_screen",
  {
    title: "Render the screen as pixels (path-only, for the human)",
    description:
      "Pixel preview with a PATH-ONLY contract: returns { path, width, height, sizeBytes, " +
      "displayHint } parsed from the PNG header — NEVER the image bytes/base64 (pixels flow to the " +
      "human, structure flows to the AI). Sources: `projectDir` (+ optional `screen` id, default " +
      "'shell') renders a REAL screen of a create-cmp app headlessly — through the resident " +
      "preview daemon when one is running (~1s warm) else via its generated " +
      "`:composeApp:renderScreens` task — no device/emulator — and also returns `treePath` (the " +
      "structural twin), `previewsDir`, and `via` ('daemon'|'gradle'); " +
      "`source:{kind:'live',port?}` fetches the RUNNING app's " +
      "current screen from GET /inspect/screenshot and writes it to `out` (or a temp file); " +
      "`pngPath` points at a PNG a harness already produced; `harness:true` runs the create-cmp " +
      "checkout's demo harness (bundled SampleScreen — use `projectDir` for real apps). Pair it " +
      "with render_tree for the structural twin.",
    inputSchema: {
      source: z
        .object({
          kind: z.literal("live"),
          host: z.string().optional().describe("Inspector host (default 127.0.0.1)."),
          port: z.number().int().optional().describe("Inspector port (default: the connect_live session port, else 9500)."),
        })
        .optional()
        .describe("Tier 1: capture the RUNNING app's screen via GET /inspect/screenshot."),
      out: z
        .string()
        .optional()
        .describe("Where to write a live capture (default: a temp file). Ignored for pngPath/harness."),
      pngPath: z.string().optional().describe("Path to an existing PNG (e.g. the harness's out/screen.png)."),
      projectDir: z
        .string()
        .optional()
        .describe(
          "Root of a create-cmp app: runs its generated `:composeApp:renderScreens` task (tier 0, " +
            "real screens from inspector/PreviewRegistry.kt) and reads the PNG + tree it wrote."
        ),
      screen: z
        .string()
        .optional()
        .describe("Registry id to render with projectDir (default 'shell'; e.g. 'home', a tab slug)."),
      harness: z
        .boolean()
        .optional()
        .describe("Run the create-cmp checkout's DEMO harness (bundled SampleScreen) to produce the PNG first."),
      harnessDir: z
        .string()
        .optional()
        .describe("Harness project directory (default: the create-cmp checkout's inspector/harness)."),
    },
  },
  guarded(async ({ source, out, pngPath, projectDir, screen, harness, harnessDir }) => {
    if (source && source.kind === "live") {
      const live = sessionDefaultSource && sessionDefaultSource.kind === "live" ? sessionDefaultSource : {};
      const meta = await writeLiveScreenshot({
        host: source.host || live.host || DEFAULT_HOST,
        port: validatePort(source.port ?? live.port),
        out,
      });
      return ok({ ...meta, displayHint: RENDER_SCREEN_DISPLAY_HINT });
    }
    let target = pngPath;
    if (!target && projectDir) {
      // Project mode: the generated per-project harness renders REAL screens.
      const dir = resolvePath(projectDir);
      const id = screen || "shell";
      // Warm path first: a resident preview daemon (phase 2) renders one screen in
      // ~1s vs a 25–40s task cycle. Use the running preview service's daemon if it's
      // this project's, else probe the default daemon port; fall back to Gradle.
      let via = "gradle";
      const daemonUrl =
        previewService && previewProjectDir === dir && previewService.status().daemon.active
          ? previewService.status().daemon.url
          : "http://127.0.0.1:9601";
      try {
        const health = await fetch(`${daemonUrl}/health`, { signal: AbortSignal.timeout(1500) });
        if (health.ok) {
          const r = await fetch(`${daemonUrl}/render?screen=${encodeURIComponent(id)}`, {
            signal: AbortSignal.timeout(120000),
          });
          if (r.ok) {
            via = "daemon";
          } else if (r.status === 404) {
            const body = await r.json().catch(() => ({}));
            return fail(`daemon render failed: ${body.error || `unknown screen '${id}'`}`);
          }
          // other daemon errors: fall through to the gradle path
        }
      } catch {
        // no daemon listening (or it died mid-render) — gradle path below
      }
      if (via === "gradle") {
        // Parameters travel as -P properties (never --args, which Gradle's CLI
        // parsing word-splits).
        try {
          await execFileAsync(
            "./gradlew",
            [":composeApp:renderScreens", `-Pscreen=${id}`, "-q"],
            { cwd: dir, timeout: 600000 }
          );
        } catch (err) {
          return fail(
            `renderScreens failed in '${dir}' (screen '${id}'): ${err && err.message ? err.message : err}. ` +
              "Is this a create-cmp app scaffolded with the inspector feature? (The task and " +
              "inspector/PreviewRegistry.kt are generated by create-cmp >= 0.6; run the cmp-upgrade " +
              "skill or re-stamp to adopt them.) Check the screen id against previewRegistry()."
          );
        }
      }
      const previewsDir = join(dir, "composeApp", "build", "previews");
      const meta = readPngMeta(join(previewsDir, id, "screen.png"));
      return ok({
        ...meta,
        treePath: join(previewsDir, id, "tree.json"),
        previewsDir,
        via,
        displayHint: RENDER_SCREEN_DISPLAY_HINT,
      });
    }
    if (!target) {
      if (!harness) {
        return fail(
          "render_screen needs `projectDir` (render a real screen of a create-cmp app), " +
            "`source:{kind:'live'}` (capture the running app), `pngPath` " +
            "(an existing PNG), or `harness:true` (run the demo headless harness to produce one)."
        );
      }
      const dir = resolvePath(harnessDir || DEFAULT_HARNESS_DIR);
      // The documented reliable invocation: plain `./gradlew run` writes the default
      // outputs (out/tree.json, out/design-system.json, out/screen.png) — --args
      // word-splitting makes explicit flags unreliable across shells.
      try {
        await execFileAsync("./gradlew", ["run", "-q"], { cwd: dir, timeout: 300000 });
      } catch (err) {
        return fail(
          `harness render failed in '${dir}': ${err && err.message ? err.message : err}. ` +
            "Is this the inspector/harness directory of a create-cmp checkout?"
        );
      }
      target = join(dir, "out", "screen.png");
    }
    const meta = readPngMeta(target); // throws a clear error if missing / not a PNG
    return ok({ ...meta, displayHint: RENDER_SCREEN_DISPLAY_HINT });
  })
);

// before/after accept the full source union, or a bare string as a file-path
// shorthand (the typical `before` is a snapshot file saved pre-edit).
const treeRefArg = (name) =>
  z
    .union([z.string().describe("File-path shorthand (= {kind:'file'})."), sourceArg.unwrap()])
    .describe(
      `The ${name} tree: a source union ({kind:"file"|"live"|"uiautomator"}) or a file path. ` +
        `Typical use: before = a snapshot saved pre-edit, after = {kind:"live"} post-reload.`
    );

server.registerTool(
  "prove_change",
  {
    title: "Prove what a change did (the verified dev loop)",
    description:
      "After editing code and reloading the app, ONE call proves what changed and that nothing " +
      "regressed: structurally diffs the BEFORE tree (typically a pre-edit snapshot file) against the " +
      "AFTER tree (typically {kind:'live'}), then regression-checks the AFTER tree with " +
      "diff_against_design_system (catalog auto-fetched from /inspect/design-system when after is " +
      "live) and audit_a11y. Returns { changes, regressions:{drift, driftChecked, a11y}, verdict: " +
      "'proven-clean' | 'changed-with-regressions' | 'no-change' }.",
    inputSchema: {
      before: treeRefArg("BEFORE"),
      after: treeRefArg("AFTER"),
      catalogPath: z
        .string()
        .optional()
        .describe("Declared design-system catalog JSON; optional when `after` is live (auto-fetched)."),
      tolerancePx: z.number().min(0).optional().describe("Bounds-move tolerance in px (default 1)."),
      minTouchTargetPx: z.number().positive().optional().describe("a11y touch-target minimum (default 48)."),
    },
  },
  guarded(async ({ before, after, catalogPath, tolerancePx, minTouchTargetPx }) => {
    const toSource = (ref) => (typeof ref === "string" ? { kind: "file", path: ref } : ref);
    const beforeSource = toSource(before);
    const afterSource = toSource(after);
    const beforeTree = await resolveTree({ source: beforeSource });
    const afterTree = await resolveTree({ source: afterSource });

    // Catalog: explicit path wins; a live AFTER source auto-fetches the declared
    // catalog; otherwise the drift check is skipped (driftChecked:false).
    let catalog;
    const afterDesc = resolveSourceDescriptor({
      source: afterSource,
      sessionDefault: sessionDefaultSource,
    });
    if (catalogPath || afterDesc.kind === "live") {
      catalog = await resolveCatalog({
        source: afterSource,
        catalogPath,
        sessionDefault: sessionDefaultSource,
      });
    }

    return ok(proveChange({ beforeTree, afterTree, catalog, tolerancePx, minTouchTargetPx }));
  })
);

// ---------------------------------------------------------------------------
// preview — the resident live-preview loop (phase 1 of "Storybook for CMP")
// ---------------------------------------------------------------------------

// One active service per MCP server. Calling preview for a different project stops
// the old one; calling it again for the same project returns the same URL.
let previewService = null;
let previewProjectDir = null;

server.registerTool(
  "preview",
  {
    title: "Start the live preview gallery (watch + render + serve)",
    description:
      "AI-native previews of a create-cmp app's REAL screens with NO device, emulator, or " +
      "manual Gradle: starts (or reuses) a resident service that renders every screen in " +
      "inspector/PreviewRegistry.kt headlessly, serves a LIVE gallery for the human at a local " +
      "URL (pixels + wireframe + a11y per screen; the page reloads itself via SSE after every " +
      "re-render), and watches composeApp/src so every save re-renders automatically. Returns " +
      "{ url, screens:[{id, nodes, tokenized, tagged, a11yPass, tree, png}], version, " +
      "changedLastRender } — give the human the url (open it for them if you can); assert on " +
      "the returned structure or the per-screen tree paths yourself. After edits use " +
      "preview_status { waitForRender: true } (blocks until the render/compile outcome) and " +
      "preview_diff { screen } (one-call verified change). The service is owned by " +
      "this MCP server; call preview_stop to shut it down. First render includes a Gradle " +
      "compile (tens of seconds); subsequent saves re-render warm in a few seconds.",
    inputSchema: {
      projectDir: z
        .string()
        .describe("Root of the create-cmp app (the directory containing composeApp/)."),
      port: z
        .number()
        .int()
        .optional()
        .describe("First port to try for the gallery server (default 9600, probes upward)."),
      hot: z
        .boolean()
        .optional()
        .describe(
          "Phase 2 (default true): boot the resident preview daemon under Compose Hot Reload " +
            "(hotRunDesktop --mainClass=<pkg>.inspector.PreviewDaemonKt --auto) so warm saves " +
            "re-render in seconds; falls back to the gradle path transparently if it can't boot."
        ),
    },
  },
  guarded(async ({ projectDir, port, hot }) => {
    const dir = resolvePath(projectDir);
    if (previewService && previewProjectDir === dir) {
      return ok({ ...previewService.status(), note: "already running (same project) — URL unchanged." });
    }
    if (previewService) {
      previewService.stop();
      previewService = null;
    }
    const service = createPreviewService({
      projectDir: dir,
      port,
      hot,
      log: (m) => process.stderr.write(`[preview] ${m}\n`),
    });
    const st = await service.start();
    previewService = service;
    previewProjectDir = dir;
    return ok(st);
  })
);

server.registerTool(
  "preview_stop",
  {
    title: "Stop the live preview gallery",
    description:
      "Stops the resident preview service started by `preview` (file watcher + gallery server). " +
      "Returns the final status. The Gradle daemon it used stays warm (that's desirable).",
    inputSchema: {},
  },
  guarded(async () => {
    if (!previewService) return fail("No preview service is running.");
    const final = previewService.stop();
    previewService = null;
    previewProjectDir = null;
    return ok({ ...final, stopped: true });
  })
);

server.registerTool(
  "preview_status",
  {
    title: "Preview status — optionally WAIT for the next render",
    description:
      "The agent's post-edit feedback call. Without arguments: returns the preview service's " +
      "current status (mode, version, rendering, lastError/lastErrorSource, lastActivity, " +
      "changedLastRender, per-screen summaries incl. lastChangedVersion). With " +
      "waitForRender:true it BLOCKS until the next render cycle completes (success or failure) " +
      "or a hot-recompile failure is detected, then returns the same status plus `timedOut` — " +
      "so the edit loop is: edit → preview_status{waitForRender:true} → read changedLastRender " +
      "(empty = the edit reached no screen) and lastError (source 'compile' = the edit didn't " +
      "even build). No polling, no sleeps.",
    inputSchema: {
      waitForRender: z
        .boolean()
        .optional()
        .describe("Block until the next render/compile outcome instead of returning immediately."),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("waitForRender timeout (default 120000; result carries timedOut:true on expiry)."),
    },
  },
  guarded(async ({ waitForRender, timeoutMs }) => {
    if (!previewService) return fail("No preview service is running — call preview { projectDir } first.");
    if (waitForRender) return ok(await previewService.waitForRender(timeoutMs));
    return ok(previewService.status());
  })
);

server.registerTool(
  "approval_status",
  {
    title: "Governed-artifact approval status — optionally WAIT for a decision",
    description:
      "The human-approval half of the console (VERIFICATION-LAYER-DESIGN.md §4): every governed " +
      "artifact's live status (design system, architecture+structure, exemplar feature, exemplar " +
      "spec, per-feature specs — the same §1 ordered walk the Approvals tab shows), via the " +
      "PROJECT'S OWN qa/lib/approvals.mjs (never forked here). Structure only — no HTML; the tab " +
      "is for the human, this tool is for you. Without waitForDecision: the current snapshot " +
      "{available, statuses:[{id,label,status,hash,storedHash,approvedAt,fileCount,missing," +
      "resolvable}]}. With waitForDecision:true: BLOCKS — same shape as preview_status's " +
      "waitForRender — until ANY governed artifact's status changes (a console Approve click, or " +
      "`node qa/approve.mjs <artifact>` run in a terminal), then returns {timedOut, available, " +
      "changed:[artifactIds], statuses}. {available:false} in a project with no approvals library " +
      "(an older, pre-approvals-wave scaffold) — resolves immediately, there is nothing to wait " +
      "for. Typical use: propose a change, tell the human to review it in the console, then " +
      "approval_status{waitForDecision:true} instead of polling. Requires a running preview " +
      "service (call preview{projectDir} first) — that's where the project root comes from.",
    inputSchema: {
      waitForDecision: z
        .boolean()
        .optional()
        .describe("Block until any governed artifact's approval status changes instead of returning immediately."),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("waitForDecision timeout (default 120000; result carries timedOut:true on expiry)."),
    },
  },
  guarded(async ({ waitForDecision, timeoutMs }) => {
    if (!previewService) return fail("No preview service is running — call preview { projectDir } first.");
    if (waitForDecision) return ok(await previewService.waitForApprovalDecision(timeoutMs));
    return ok(await previewService.approvalStatusSnapshot());
  })
);

server.registerTool(
  "preview_diff",
  {
    title: "Diff a screen across the last two renders (one-call verified edit)",
    description:
      "prove_change with ZERO bookkeeping: the preview service already retains the previous " +
      "generation of every screen's tree, so this diffs a screen's LAST render against its " +
      "CURRENT one — no pre-edit snapshot_save needed. Returns { changes, regressions:{drift, " +
      "driftChecked, a11y}, verdict } like prove_change (drift is checked against the " +
      "previews dir's design-system.json when present). Typical loop: edit → " +
      "preview_status{waitForRender:true} → preview_diff{screen:<a changed id>}. Use " +
      "snapshot_save + prove_change instead when the baseline must survive sessions/renders.",
    inputSchema: {
      screen: z.string().describe("Registry screen id (see preview_status screens[].id)."),
      tolerancePx: z.number().min(0).optional().describe("Bounds-move tolerance in px (default 1)."),
      minTouchTargetPx: z.number().positive().optional().describe("a11y touch-target minimum (default 48)."),
    },
  },
  guarded(async ({ screen, tolerancePx, minTouchTargetPx }) => {
    if (!previewService) return fail("No preview service is running — call preview { projectDir } first.");
    const { before, after, version } = previewService.treesFor(screen);
    if (!after) {
      const known = previewService.status().screens.map((s) => s.id).join(", ");
      return fail(`Screen '${screen}' is not in the current render. Known screens: ${known || "(none yet)"}.`);
    }
    if (!before) {
      return fail(
        `No previous generation for '${screen}' yet — preview_diff compares the last two renders. ` +
          "Edit code, then preview_status { waitForRender: true }, then call this again."
      );
    }
    let catalog;
    const catalogPath = join(previewService.status().previewsDir, "design-system.json");
    if (existsSync(catalogPath)) catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    return ok({
      screen,
      fromVersion: version - 1,
      toVersion: version,
      ...proveChange({
        beforeTree: JSON.parse(before),
        afterTree: JSON.parse(after),
        catalog,
        tolerancePx,
        minTouchTargetPx,
      }),
    });
  })
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (previewService) previewService.stop();
    process.exit(0);
  });
}

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
