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

import { walk } from "../src/lib/tree.mjs";
import { getNode, siblingLayoutGaps } from "../src/lib/query.mjs";
import { auditA11y } from "../src/lib/a11y.mjs";
import { resolveTree as resolveTreeFromSource } from "../src/lib/source.mjs";
import {
  fetchHealth,
  fetchLiveCrashes,
  fetchLiveDbQuery,
  validatePort,
  validateSerial,
  DEFAULT_HOST,
} from "../src/lib/live.mjs";
import { gradleEnv } from "../src/lib/jdk.mjs";
import { navigateAndInspect, writeLiveScreenshot, DEFAULT_SETTLE_MS } from "../src/lib/navigate.mjs";
import { connectLive, ConnectError } from "../src/lib/connect.mjs";
import { readDeviceLease, listLiveDeviceLeases, formatHolder } from "../src/lib/device-lease.mjs";
import { renderTreeSvg, countRenderable } from "../src/lib/render.mjs";
import { readPngMeta } from "../src/lib/png.mjs";
import { attributeCrash } from "../src/lib/attribution.mjs";
import { parseLogcat } from "../src/lib/logcat.mjs";
import { createPreviewService } from "../src/lib/preview-service.mjs";
import { buildStatus, loadedBuildId } from "../src/lib/build-id.mjs";
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

// The adb serial connect_live actually resolved — the device-lease key for
// later live-driving calls (navigate_and_inspect). connect_live itself checks
// the lease inside connectLive(); this session record lets each subsequent tap
// re-check the SAME device, because a verify lane can start at any moment
// during an open console session. Check, never hold — see
// src/lib/device-lease.mjs for the decision and the shared on-disk contract.
let sessionDeviceSerial = null;

/**
 * The live lease standing between us and a device-driving call, or null.
 * With no recorded serial (source came from env/legacy, not connect_live) any
 * live lease on the machine refuses conservatively: a one-device machine is
 * the very case this mechanism exists for, and a blind tap into a lane's
 * device phase is exactly the collision it prevents.
 */
function deviceLeaseInTheWay() {
  if (sessionDeviceSerial) {
    const held = readDeviceLease(sessionDeviceSerial);
    return held ? { serial: sessionDeviceSerial, ...held } : null;
  }
  return listLiveDeviceLeases()[0] ?? null;
}

// sha256 of the previous render_screen{live} capture — the stale-frame tripwire.
// Two captures of two DIFFERENT screens hashing the same means the pixel path is
// lying (the device-side hazard: a software draw replaying a stale layer
// recording); the flag surfaces it so no one trusts a lying frame silently.
let lastLiveCaptureSha256 = null;

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

// Version. The bundled build (dist/server.mjs, what the Claude Code plugin runs)
// has this inlined by esbuild's `define`, so it depends on NO sibling file — a
// bundle that has to read ../package.json is not self-contained, and the whole
// reason the bundle exists is that nothing installs or arranges files around it.
// Running from source, the identifier is undefined and the manifest is read as
// before; `typeof` on an undeclared name is safe, a bare reference would throw.
const SERVER_VERSION =
  typeof __CMP_BUNDLE_VERSION__ !== "undefined"
    ? __CMP_BUNDLE_VERSION__
    : JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const server = new McpServer({
  name: "cmp-inspector",
  version: SERVER_VERSION,
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
    "daemon). Inspect the RUNNING app (tier 1): connect_live (SELF-HEALING — creates the " +
    "adb forward, launches the debug app when its health endpoint is dead, resets a stale " +
    "adb transport, and can force a verified relaunch with {relaunch:true}), then " +
    "inspect_tree (one node via testTag, an SVG wireframe via format:'wireframe', spacing " +
    "via includeLayoutGaps) and navigate_and_inspect. " +
    "Runtime eyes beyond the tree: runtime_crashes (persisted crashes + cause attribution), " +
    "runtime_logs (adb logcat, structured + bounded), db_query (read-only SQLite " +
    "state). Human approval gates: the preview gallery's Screens/Design System/Architecture/" +
    "Approvals/Specs/Comments tabs (same URL as `preview`) are where the human reviews and signs " +
    "governed artifacts, sees the app's layer map + governed contract + feature shape, and leaves " +
    "review feedback; approval_status { waitForDecision: true } blocks on an approval decision the " +
    "same way preview_status blocks on a render, and review_comments { waitForComment: true } blocks " +
    "on new review feedback the same way — act on it, then resolve_comment. Genesis mode (a fresh " +
    "app's unreviewed/reopened artifacts): snapshot_variant stashes the current render as a named " +
    "design-language candidate for the Design System tab's candidates strip; the human's Pick lands " +
    "as a `pick:<name>` comment, observed the normal review_comments way. Always assert on tree " +
    "JSON; never read PNG bytes into context.",
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
      "Load the enriched Compose semantics tree (hierarchy + geometry + resolved design tokens) as JSON, " +
      "plus a compact summary { nodeCount, taggedCount, tokenizedCount }. With source {kind:'live'} this reads " +
      "the RUNNING app's current screen (real data + nav state) on every call. Options: `testTag` returns only " +
      "that node's subtree; format:'wireframe' returns the (sub)tree as a deterministic SVG wireframe instead " +
      "of raw JSON (footprint nodes as rects, tokenized nodes highlighted with a resolved-values chip, " +
      "clickable nodes with a distinct outline, testTags as mono labels — SVG is structured text, safe for " +
      "model context; a11yOverlay:true marks accessibility violations, `out` also writes the file); " +
      "includeLayoutGaps:true adds `layoutGaps` — the spacing between each pair of consecutive TAGGED siblings " +
      "({parentPath, a, b, gaps:{gapX,gapY,dxLeft,dyTop}}).",
    inputSchema: {
      source: sourceArg,
      treePath: treePathArg,
      testTag: z.string().optional().describe("Return only the subtree rooted at the node with this testTag."),
      format: z
        .enum(["json", "wireframe"])
        .optional()
        .describe("Default 'json'. 'wireframe' renders the (sub)tree as a deterministic SVG wireframe."),
      out: z.string().optional().describe("wireframe only: also write the SVG to this path."),
      a11yOverlay: z
        .boolean()
        .optional()
        .describe("wireframe only: overlay accessibility-audit violations in a danger style."),
      maxDepth: z.number().int().min(0).optional().describe("wireframe only: only draw nodes up to this depth (root = 0)."),
      scale: z.number().positive().optional().describe("wireframe only: explicit px scale (default fits width to ~740)."),
      includeLayoutGaps: z
        .boolean()
        .optional()
        .describe("Add `layoutGaps`: spacing between consecutive tagged siblings, tree-wide."),
    },
  },
  guarded(async ({ source, treePath, testTag, format, out, a11yOverlay, maxDepth, scale, includeLayoutGaps }) => {
    const full = await resolveTree({ source, treePath });
    let tree = full;
    if (testTag != null) {
      const node = getNode(full, testTag);
      if (!node) return fail(`No node found with testTag '${testTag}'.`);
      tree = { ...full, root: node };
    }
    const extras = includeLayoutGaps ? { layoutGaps: siblingLayoutGaps(tree) } : {};
    if (format === "wireframe") {
      const svg = renderTreeSvg(tree, { a11y: a11yOverlay ? auditA11y(tree) : undefined, maxDepth, scale });
      let svgPath = null;
      if (out) {
        svgPath = resolvePath(out);
        const dir = dirname(svgPath);
        if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
        writeFileSync(svgPath, svg);
      }
      const { total } = countRenderable(tree, { maxDepth });
      const [, w, h] = svg.match(/<svg[^>]* width="(\d+)" height="(\d+)"/) || [];
      return ok({
        summary: summarize(tree),
        svg,
        svgPath,
        nodeCount: total,
        width: Number(w),
        height: Number(h),
        ...extras,
      });
    }
    return ok({ summary: summarize(tree), tree, ...extras });
  })
);

server.registerTool(
  "connect_live",
  {
    title: "Connect to a running app's live inspector (self-healing)",
    description:
      "Tier 1 handshake, SELF-HEALING: ensures a device/emulator is attached, ensures the " +
      "`adb forward tcp:<port> tcp:<port>` exists (creating it — the debug-only inspector server binds " +
      "loopback on the device), then GETs /inspect/health. If health is dead it LAUNCHES the debug app " +
      "(applicationId parsed from the project — composeApp/build.gradle.kts / create-cmp.json — never " +
      "hardcoded; pass `projectDir` when the server's cwd is not the app repo, or `appId` to skip " +
      "resolution) and re-polls with bounded backoff. On a `device offline`-class adb error (a stale adb " +
      "server transport — the client says offline while `adb devices` says device) it resets the adb " +
      "server (kill-server / start-server / wait-for-device) once and retries the whole sequence once. " +
      "{relaunch:true} forces a VERIFIED restart from a known state (adb force-stop → optional `pm clear` " +
      "via clearState → launch → health's processStartedAtMs proven to move forward). Every failure names " +
      "the stage that failed and the one command to run next — never a bare timeout. On success, sets the " +
      "session default source to {kind:'live', port} so subsequent tool calls can omit `source`; the " +
      "result's `healed` lists what it had to fix (app-launched, adb-transport-reset, relaunched). " +
      "Requires a create-cmp DEBUG build installed on the device (the inspector is structurally absent " +
      "from release builds). This tool never starts emulators.",
    inputSchema: {
      port: z.number().int().optional().describe("Inspector port (default 9500)."),
      serial: z.string().optional().describe("adb device serial (when several devices are attached)."),
      projectDir: z
        .string()
        .optional()
        .describe("App repo root, for applicationId resolution when the app must be launched (default: cwd)."),
      appId: z.string().optional().describe("Explicit applicationId (skips resolution from the project)."),
      relaunch: z
        .boolean()
        .optional()
        .describe("Force a verified relaunch (force-stop + launch, proven by processStartedAtMs advancing)."),
      clearState: z
        .boolean()
        .optional()
        .describe("With relaunch: also `pm clear` — pristine app data (Room DBs, prefs, first-run state)."),
    },
  },
  guarded(async ({ port, serial, projectDir, appId, relaunch, clearState }) => {
    const p = validatePort(port);
    const s = validateSerial(serial);
    let result;
    try {
      result = await connectLive({
        port: p,
        serial: s,
        projectDir: projectDir ? resolvePath(projectDir) : undefined,
        appId,
        relaunch,
        clearState,
        exec: (cmd, args) => execFileAsync(cmd, args, { timeout: 20_000 }),
        fetchHealthImpl: (o) => fetchHealth({ port: p, ...o }),
      });
    } catch (err) {
      if (err instanceof ConnectError) {
        return fail(`connect_live failed at stage '${err.stage}': ${err.message} Next: ${err.fix}`);
      }
      throw err;
    }
    sessionDefaultSource = { kind: "live", host: "127.0.0.1", port: p };
    sessionDeviceSerial = result.serial ?? sessionDeviceSerial; // the lease key later taps re-check
    return ok({
      status: "connected",
      forwarded: `tcp:${p} -> tcp:${p}`,
      sessionDefaultSource,
      serial: result.serial,
      appId: result.appId,
      healed: result.healed,
      ...(result.relaunch ? { relaunch: result.relaunch } : {}),
      health: result.health,
      remoteUrl: `http://127.0.0.1:${p}/inspect/remote`,
      remoteUrlHint:
        "Offer to open remoteUrl in the HUMAN's browser — it is the live device view: they " +
        "watch and click-to-drive the real app while you inspect the tree (inspect_tree / " +
        "navigate_and_inspect). Do not fetch it yourself.",
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
    // Same stance as connect_live's stage-"lease" refusal, re-checked per tap:
    // a verify lane can begin its device phase at any moment during an open
    // console session, and tapping into it is the collision class this exists
    // to prevent. Check, never hold (src/lib/device-lease.mjs).
    const held = deviceLeaseInTheWay();
    if (held) {
      return fail(
        `navigate_and_inspect refused at stage 'lease': device ${held.serial} is held by ` +
          `${formatHolder(held)} — a lane is driving this device right now; device evidence is ` +
          `batched, not concurrent. Next: wait for the holder to finish (its lease clears on exit), then retry.`
      );
    }
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
  "db_query",
  {
    title: "Read rows from one SQLite table (read-only, bounded)",
    description:
      "GET /inspect/db?table=<name>&limit=<n> on the running app — assert PERSISTED state in the live " +
      "tier. `table` must be a real table name (the app's Room schema JSONs and @Entity classes are " +
      "in-repo) — the device validates it strictly against `sqlite_master` before ever touching a " +
      "query, so an unknown name 404s rather than running arbitrary SQL. Rows are capped by `limit` " +
      "(device-side default/max apply regardless of what's requested). Returns { table, columns, rows, " +
      "rowCount }. Requires connect_live.",
    inputSchema: {
      table: z.string().describe("Exact table name (see the app's Room schema JSONs / @Entity classes)."),
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

const RENDER_SCREEN_DISPLAY_HINT =
  "Pixels are for the HUMAN, structure is for the AI: do NOT read this PNG's bytes into model " +
  "context. To show it, write a small HTML file embedding <img src=\"file://<path>\"> and open it " +
  "(e.g. `open preview.html` on macOS), or attach the file through the host UI. For your own " +
  "reasoning, use inspect_tree (optionally format:'wireframe') on the same screen instead.";

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
      "with inspect_tree (format:'wireframe') for the structural twin.",
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
      const identicalToPrevious = meta.sha256 === lastLiveCaptureSha256;
      lastLiveCaptureSha256 = meta.sha256;
      const staleness = identicalToPrevious
        ? {
            identicalToPrevious,
            staleWarning:
              "This capture is byte-identical to the previous live capture. If the screen " +
              "changed between the two (navigation, interaction), the pixel path is serving a " +
              "stale frame — cross-check with `adb exec-out screencap -p` and do not present " +
              "this PNG as evidence of the current screen.",
          }
        : { identicalToPrevious };
      return ok({ ...meta, ...staleness, displayHint: RENDER_SCREEN_DISPLAY_HINT });
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
            { cwd: dir, timeout: 600000, env: gradleEnv() }
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
        await execFileAsync("./gradlew", ["run", "-q"], { cwd: dir, timeout: 300000, env: gradleEnv() });
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

// ---------------------------------------------------------------------------
// preview — the resident live-preview loop (phase 1 of "Storybook for CMP")
// ---------------------------------------------------------------------------

// One active service per MCP server. Calling preview for a different project stops
// the old one; calling it again for the same project returns the same URL.
let previewService = null;
let previewProjectDir = null;

// The session's resolved console (console-protocol.md decision 4): set by a
// successful `preview` call — whether it STARTED a service in this process or
// ADOPTED one another process is serving. Every console-backed tool below
// speaks HTTP to `url` and never touches the service object (decision 1: one
// wire, whoever started the process — the in-process object was a second data
// path, and dual paths drift). `external` exists for exactly one decision:
// preview_stop refuses to reach through the wire and close the human's window.
let activeConsole = null; // {url, projectDir, external}

/**
 * One call on the console's wire. `holdMs` is how long the SERVER may
 * legitimately hold the request (long-polls pass their wait budget); the
 * client aborts 15s later, so the server's own `timedOut:true` answer always
 * wins the race and the abort only fires when the console truly stopped
 * answering. Failures come back as {failed: reason} in plain words — a dead
 * console is reported as exactly that, never a stack trace (decision 6).
 */
async function consoleCall(pathname, { method = "GET", body, holdMs = 15000 } = {}) {
  if (!activeConsole) return { failed: "No preview service is running — call preview { projectDir } first." };
  let res;
  try {
    res = await fetch(new URL(pathname, activeConsole.url), {
      method,
      ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(holdMs + 15000),
    });
  } catch {
    return {
      failed:
        `The console at ${activeConsole.url} stopped answering — it may have been stopped or crashed. ` +
        `Call preview { projectDir: "${activeConsole.projectDir}" } again.`,
    };
  }
  if (res.status === 404) {
    // A console that answers but lacks the route predates the protocol — the
    // build handshake's vocabulary, reused (console-protocol.md edge case 3).
    return {
      failed:
        `The console at ${activeConsole.url} predates this protocol route (${pathname}) — it is running an ` +
        `older build. Restart it: node inspector/mcp/bin/console.mjs ${activeConsole.projectDir}`,
    };
  }
  const json = await res.json().catch(() => null);
  if (json === null) return { failed: `The console at ${activeConsole.url} answered ${res.status} with a non-JSON body for ${pathname}.` };
  return { json, httpStatus: res.status };
}

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
      const st = previewService.status();
      activeConsole = { url: st.url, projectDir: dir, external: false };
      return ok({ ...st, note: "already running (same project) — URL unchanged." });
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
    let st;
    try {
      st = await service.start();
    } catch (err) {
      // Another PROCESS already serves this project (the one-console-per-project guard).
      // This tool's contract is "starts or reuses", so reuse is the honest answer: point
      // the caller at the console that is actually serving rather than starting a second
      // render loop against the same build directory.
      if (err && err.code === "CMP_CONSOLE_ALREADY_RUNNING") {
        // Adoption is right, but SILENT adoption of a console running older code
        // is exactly how 2026-07-27/28 were lost: the page looked fine and was
        // built from a previous module graph. Ask it which build it is running
        // and say so when it disagrees with ours — refusing to pretend costs one
        // HTTP call.
        let adoptedBuild = null;
        try {
          const remote = await (await fetch(`${err.existing.url}status`, { signal: AbortSignal.timeout(3000) })).json();
          adoptedBuild = remote && remote.build ? remote.build : null;
        } catch {
          /* a console that answers "/" but not "/status" predates the handshake — unknown, not stale */
        }
        const mine = buildStatus(loadedBuildId().id);
        const mismatch = adoptedBuild && adoptedBuild.id && mine.id && adoptedBuild.id !== mine.id;
        // Adoption resolves the session's console: every console-backed tool
        // now speaks to it over the wire, identically to an owned one.
        activeConsole = { url: err.existing.url, projectDir: dir, external: true };
        return ok({
          ...err.existing,
          projectDir: dir,
          reusedExternal: true,
          build: adoptedBuild,
          buildMatchesThisProcess: adoptedBuild && adoptedBuild.id ? !mismatch : null,
          note:
            `A studio console for this project is already running in another process ` +
            `(pid ${err.existing.pid}). Use it at ${err.existing.url} — a second one would ` +
            `render into the same build directory and the two would disagree.` +
            (mismatch
              ? ` WARNING: it is running build ${String(adoptedBuild.id).slice(0, 8)}, but this process is ` +
                `${String(mine.id).slice(0, 8)} — the page it serves was drawn by different code than you are editing. ` +
                `Restart it (node inspector/mcp/bin/console.mjs ${dir}) before trusting what it shows.`
              : adoptedBuild && adoptedBuild.stale === true
                ? ` WARNING: that console reports itself STALE — the code on disk changed after it started. Restart it.`
                : ""),
        });
      }
      throw err;
    }
    previewService = service;
    previewProjectDir = dir;
    activeConsole = { url: st.url, projectDir: dir, external: false };
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
    // The one tool that does NOT go over the wire (console-protocol.md
    // decision 5): stopping is an act of ownership. A console another process
    // serves is the HUMAN's standalone window — an agent tool named "stop
    // preview" must not reach through the wire and close it; the human's own
    // verb exists and the refusal names it.
    if (activeConsole && activeConsole.external) {
      return fail(
        `That console (${activeConsole.url}) is a standalone process this session did not start — refusing to stop ` +
          `the human's window. To stop it deliberately: node inspector/mcp/bin/console.mjs ${activeConsole.projectDir} --stop`,
      );
    }
    if (!previewService) return fail("No preview service is running.");
    const final = previewService.stop();
    previewService = null;
    previewProjectDir = null;
    activeConsole = null;
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
      "changedLastRender, per-screen summaries incl. lastChangedVersion, and `renderer` — the " +
      "render PIPELINE's own health: {lastOutcome:'ok'|'failed'|'never', lastSuccessAt, " +
      "lastAttemptAt, consecutiveFailures}, tracked independently of lastError so a later, " +
      "unrelated compile message can never mask a dead renderer. renderer.lastOutcome:'failed' " +
      "means every render since lastSuccessAt has failed outright (Gradle/daemon call itself " +
      "threw) — the screens below are stale pixels, not a fresh 'no changes' result; this is " +
      "different from lastErrorSource:'compile' (the user's edit didn't build). With " +
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
    // Over the wire (console-protocol.md decision 1) — identically against a
    // console this process started and one it adopted. The wait is a
    // long-poll: the console holds the request and answers with the same
    // snapshot-plus-timedOut shape the in-process method returned.
    const call = waitForRender
      ? await consoleCall(`/api/render-wait${timeoutMs ? `?timeoutMs=${timeoutMs}` : ""}`, { holdMs: timeoutMs ?? 120000 })
      : await consoleCall("/status");
    if (call.failed) return fail(call.failed);
    return ok(call.json);
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
    const call = waitForDecision
      ? await consoleCall(`/api/approval-wait${timeoutMs ? `?timeoutMs=${timeoutMs}` : ""}`, { holdMs: timeoutMs ?? 120000 })
      : await consoleCall("/api/approvals");
    if (call.failed) return fail(call.failed);
    return ok(call.json);
  })
);

server.registerTool(
  "review_comments",
  {
    title: "Console comment ledger — optionally WAIT for a new comment",
    description:
      "The human-comment half of the console (VERIFICATION-LAYER-DESIGN.md §7.3: 'pixels flow to the " +
      "human, structure flows to the AI, judgment flows back through comments'): the full comment " +
      "ledger, via the PROJECT'S OWN qa/lib/comments.mjs (never forked here) — target (screen/element/" +
      "spec-line/design-system/architecture/general, rendered readably in the console's Comments tab), " +
      "text, author, createdAt, status, resolution. Without waitForComment: the current snapshot " +
      "{available, schema, comments}. With waitForComment:true: BLOCKS — same shape as " +
      "approval_status's waitForDecision — until a NEW comment lands (a 💬 submitted in the console), " +
      "then returns {timedOut, available, added:[newComments], comments}. A resolve does NOT wake this " +
      "wait — only a fresh comment does. {available:false} in a project with no comments library (an " +
      "older, pre-comments-wave scaffold) — resolves immediately, there is nothing to wait for. Loop of " +
      "record: propose a change, tell the human to review it in the console, " +
      "review_comments{waitForComment:true} instead of polling, act on `added`, then resolve_comment " +
      "with what you did. Requires a running preview service (call preview{projectDir} first).",
    inputSchema: {
      status: z.enum(["open", "resolved"]).optional().describe("Filter the snapshot to one status."),
      waitForComment: z
        .boolean()
        .optional()
        .describe("Block until a new comment lands instead of returning immediately."),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("waitForComment timeout (default 120000; result carries timedOut:true on expiry)."),
    },
  },
  guarded(async ({ status, waitForComment, timeoutMs }) => {
    const call = waitForComment
      ? await consoleCall(`/api/comment-wait${timeoutMs ? `?timeoutMs=${timeoutMs}` : ""}`, { holdMs: timeoutMs ?? 120000 })
      : await consoleCall(`/api/comments${status ? `?status=${status}` : ""}`);
    if (call.failed) return fail(call.failed);
    return ok(call.json);
  })
);

server.registerTool(
  "resolve_comment",
  {
    title: "Resolve a console comment (the agent closes the loop)",
    description:
      "Marks a comment resolved via the project's own qa/lib/comments.mjs, recording author 'agent' " +
      "and `note` (what you actually did about it — update the spec/plan/code FIRST, then resolve; " +
      "the console never edits code itself, per §4's principle, so this is the only way a comment " +
      "closes). Returns {ok:true, comment} or {ok:false, reason} — the library's refusal verbatim " +
      "(unknown id, already resolved). The console's Comments tab then shows the resolution + note. " +
      "Requires a running preview service (call preview{projectDir} first).",
    inputSchema: {
      id: z.string().describe("Comment id (see review_comments)."),
      note: z.string().describe("What you did in response to the comment."),
    },
  },
  guarded(async ({ id, note }) => {
    const call = await consoleCall("/api/resolve-comment", { method: "POST", body: { id, note } });
    if (call.failed) return fail(call.failed);
    return ok(call.json);
  })
);

server.registerTool(
  "snapshot_variant",
  {
    title: "Stash the current renders as a named design-language candidate",
    description:
      "GENESIS-FLOW-DESIGN.md §2 'Design-language candidates (variants)': copies the CURRENT " +
      "preview render (every screen's screen.png from the last completed render) plus " +
      "design-system.json into composeApp/build/previews/variants/<name>/, REPLACING that " +
      "variant if one with the same name already exists. Returns { name, screens, " +
      "designSystemStashed, dir }. `name` must match [a-z0-9-]+ (lowercase letters, digits, " +
      "hyphens) — anything else is refused, not sanitized. Typical loop: edit Tokens.kt, " +
      "preview_status{waitForRender:true}, snapshot_variant{name:'warmer'}, repeat per " +
      "candidate token set, then tell the human to compare them side by side in the Design " +
      "System tab's candidates strip and click Pick — observed via " +
      "review_comments{waitForComment:true} as a `pick:<name>` comment targeting design-system; " +
      "apply the chosen tokens, resolve_comment with a note, then approve. Requires a running " +
      "preview service (call preview{projectDir} first) with at least one completed render.",
    inputSchema: {
      name: z
        .string()
        .regex(/^[a-z0-9-]+$/, "must match [a-z0-9-]+ (lowercase letters, digits, hyphens)")
        .describe("Candidate name, e.g. 'warmer' or 'rounded-v2' — used as the variant's directory name."),
    },
  },
  guarded(async ({ name }) => {
    const call = await consoleCall("/api/variant", { method: "POST", body: { name } });
    if (call.failed) return fail(call.failed);
    if (!call.json.ok) return fail(call.json.reason);
    return ok(call.json);
  })
);

server.registerTool(
  "preview_diff",
  {
    title: "Diff a screen across the last two renders (one-call verified edit)",
    description:
      "The verified dev loop with ZERO bookkeeping: the preview service already retains the previous " +
      "generation of every screen's tree, so this diffs a screen's LAST render against its " +
      "CURRENT one — no pre-edit snapshot needed. Returns { changes, regressions:{drift, " +
      "driftChecked, a11y}, verdict: 'proven-clean' | 'changed-with-regressions' | 'no-change' } " +
      "(drift is checked against the previews dir's design-system.json when present). Typical loop: " +
      "edit → preview_status{waitForRender:true} → preview_diff{screen:<a changed id>}. For a " +
      "baseline that must survive sessions, the lane's golden trees (qa/golden/, UPDATE_GOLDEN=1) " +
      "are the durable regression layer.",
    inputSchema: {
      screen: z.string().describe("Registry screen id (see preview_status screens[].id)."),
      tolerancePx: z.number().min(0).optional().describe("Bounds-move tolerance in px (default 1)."),
      minTouchTargetPx: z.number().positive().optional().describe("a11y touch-target minimum (default 48)."),
    },
  },
  guarded(async ({ screen, tolerancePx, minTouchTargetPx }) => {
    // The diff computes SERVER-SIDE (console-protocol.md decision 3): the
    // previous tree generation exists only in the console process's memory, so
    // the verdict crosses the wire, never the inputs.
    const params = new URLSearchParams({ screen });
    if (tolerancePx !== undefined) params.set("tolerancePx", String(tolerancePx));
    if (minTouchTargetPx !== undefined) params.set("minTouchTargetPx", String(minTouchTargetPx));
    const call = await consoleCall(`/api/diff?${params}`);
    if (call.failed) return fail(call.failed);
    if (!call.json.ok) return fail(call.json.reason);
    return ok(call.json);
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
