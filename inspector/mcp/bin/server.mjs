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
import { fetchHealth, validatePort, validateSerial, DEFAULT_HOST } from "../src/lib/live.mjs";
import { navigateAndInspect, writeLiveScreenshot, DEFAULT_SETTLE_MS } from "../src/lib/navigate.mjs";
import { renderTreeSvg, countRenderable } from "../src/lib/render.mjs";
import { readPngMeta } from "../src/lib/png.mjs";
import { proveChange } from "../src/lib/prove.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
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

// ---------------------------------------------------------------------------
// server + tools
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "cmp-inspector",
  version: "0.4.0",
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
      "nodeCount}, after:{tags,textSample,nodeCount}, changed } — assert the navigation structurally " +
      "(old screen's tags gone, new content present). Requires connect_live (or a reachable forward).",
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
      "'shell') renders a REAL screen of a create-cmp app headlessly via its generated " +
      "`:composeApp:renderScreens` task — no device/emulator — and also returns `treePath` (the " +
      "structural twin) and `previewsDir`; `source:{kind:'live',port?}` fetches the RUNNING app's " +
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
      // Project mode: the generated per-project harness renders REAL screens. Parameters
      // travel as -P properties (never --args, which Gradle's CLI parsing word-splits).
      const dir = resolvePath(projectDir);
      const id = screen || "shell";
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
      const previewsDir = join(dir, "composeApp", "build", "previews");
      const meta = readPngMeta(join(previewsDir, id, "screen.png"));
      return ok({
        ...meta,
        treePath: join(previewsDir, id, "tree.json"),
        previewsDir,
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
