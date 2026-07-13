// preview-service.mjs — the resident preview loop ("Storybook for CMP", phase 1).
//
// One long-lived service per project, owned by the MCP server, so neither the human
// nor the agent ever runs Gradle by hand:
//
//   watch composeApp/src  ──debounce──►  :composeApp:renderScreens (serialized, queued)
//        ▲                                        │
//        │                                        ▼
//   edit & save                    composeApp/build/previews/<id>/{tree.json, screen.png}
//                                                 │
//                                                 ▼
//                    local HTTP server: live gallery (/) + SSE reload (/events)
//                    + static previews (/previews/*) + JSON status (/status)
//
// The human opens ONE URL once; every save re-renders and the page reloads itself.
// The agent gets the same state structurally (status(), changed screen ids, per-screen
// node/token/a11y summaries) — pixels flow to the human, structure flows to the AI.
//
// Design notes:
// - The render runner is INJECTED (runRender) so the core is unit-testable without
//   Gradle; the default runner shells to `./gradlew :composeApp:renderScreens -q`.
//   Renders are serialized; changes arriving mid-render queue exactly one follow-up.
// - fs.watch(recursive) is used where supported (macOS/Windows/modern Linux); on
//   ENOSYS/ERR_FEATURE_UNAVAILABLE it falls back to a 2s mtime poll — same debounce.
// - The gallery page is regenerated in-memory per render from manifest.json + the
//   trees, reusing the pure render/a11y libs (wireframe SVG inline; PNGs served
//   statically with a version cache-buster, not base64 — the page stays light).

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { renderTreeSvg } from "./render.mjs";
import { auditA11y } from "./a11y.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_PORT = 9600;
const DEFAULT_DAEMON_PORT = 9601;
const PORT_ATTEMPTS = 10;
const DEBOUNCE_MS = 400;
// Classes events arrive DURING recompile; the hot swap applies shortly after the last
// write. A longer trailing debounce here avoids rendering once with pre-swap code.
const CLASSES_DEBOUNCE_MS = 1500;
const POLL_FALLBACK_MS = 2000;
const DAEMON_BOOT_TIMEOUT_MS = 240000; // first boot may compile + download a JBR
const DAEMON_RENDER_TIMEOUT_MS = 120000;
// The hot recompiler is a SEPARATE Gradle daemon whose output we cannot observe. If a
// source change produces no in-JVM reload within this window, the service runs its own
// compile check to fetch the compiler's verdict (the only way a broken edit surfaces).
const COMPILE_WATCHDOG_MS = 20000;
// A render that lands before the hot swap composes pre-swap code. When the daemon is
// reload-aware, such stale renders are retried on this cadence until the swap lands.
const STALE_RETRY_MS = 2500;
const MAX_STALE_RETRIES = 3;

/**
 * The app's base package — needed to address the daemon main class
 * (<package>.inspector.PreviewDaemonKt). create-cmp >= 0.5 apps carry it in
 * create-cmp.json; older apps fall back to the Android namespace declaration.
 */
export function detectAppPackage(projectDir) {
  const spec = path.join(projectDir, "create-cmp.json");
  if (fs.existsSync(spec)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(spec, "utf8")).package;
      if (pkg) return pkg;
    } catch {}
  }
  const gradle = path.join(projectDir, "composeApp", "build.gradle.kts");
  if (fs.existsSync(gradle)) {
    const m = fs.readFileSync(gradle, "utf8").match(/namespace\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error(
    "cannot detect the app package (no create-cmp.json `package`, no `namespace` in composeApp/build.gradle.kts)",
  );
}

// --- pure helpers (unit-tested) ----------------------------------------------------

/** Per-screen structural summary used by /status, the gallery meta line, and the agent. */
export function summarizeTree(tree) {
  let nodes = 0;
  let tokenized = 0;
  let tagged = 0;
  (function walk(n) {
    nodes++;
    if (n.designToken) tokenized++;
    if (n.testTag) tagged++;
    (n.children || []).forEach(walk);
  })(tree.root);
  return { nodes, tokenized, tagged };
}

/**
 * Which screens changed between two render generations, by comparing the serialized
 * tree content (bounds jitter included — the tree is already integer-rounded).
 * @param {Map<string,string>|null} prev  screen id -> tree JSON string (previous render)
 * @param {Map<string,string>} next       screen id -> tree JSON string (current render)
 * @returns {string[]} changed/added/removed screen ids, gallery order preserved by caller
 */
export function diffScreenTrees(prev, next) {
  if (!prev) return [];
  const changed = [];
  for (const [id, json] of next) {
    if (!prev.has(id) || prev.get(id) !== json) changed.push(id);
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) changed.push(id);
  }
  return changed;
}

/**
 * Compile-failure lines in Compose Hot Reload / Gradle recompile output. In daemon mode
 * a broken edit produces NO render (no classes are written, so no trigger fires) — these
 * markers are the only signal, so the service promotes them into lastError. Kotlin
 * compiler errors arrive as `e: file://… error` lines; Gradle adds task/BUILD FAILED.
 * @returns {string[]} the matching lines (empty = no failure in this chunk)
 */
export function extractCompileErrors(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        /^e: /.test(l) ||
        /Compilation failed/i.test(l) ||
        /^> Task :\S+ FAILED$/.test(l) ||
        /^BUILD FAILED/.test(l),
    );
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The live gallery page. Pure: (state) -> html. PNGs are referenced via /previews/…
 * with a version cache-buster; wireframe SVGs are inlined (SVG is structured text).
 * Cards changed in THIS render get the CHANGED flag plus a hover before/after compare
 * (screen.prev.png is the pre-render copy); every card keeps a persistent
 * "changed #N" badge from `changedVersions` so attribution outlives the next render.
 * @param {object} state { appName, viewport, cards, version, changed, changedVersions, error }
 */
export function galleryHtml(state) {
  const {
    appName,
    viewport,
    cards,
    version,
    changed = [],
    changedVersions = {},
    error = null,
  } = state;
  const width = viewport?.width ?? 411;
  const changedSet = new Set(changed);
  return `<!doctype html>
<meta charset="utf-8">
<title>${esc(appName)} — live previews</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; background: #F7F9FC; color: #1A1A1A; }
  header { padding: 20px 28px 8px; display: flex; align-items: baseline; gap: 14px; }
  header h1 { margin: 0; font-size: 20px; }
  header p { margin: 0; color: #6B7280; font-size: 13px; }
  #filter { margin-left: auto; font: inherit; font-size: 13px; padding: 4px 10px;
            border: 1px solid #E5E7EB; border-radius: 999px; background: #fff; color: inherit; }
  #pill { font-size: 12px; font-weight: 600; border-radius: 999px; padding: 4px 12px;
          background: #E8F7EF; color: #16A34A; }
  #pill.rendering { background: #FEF6E7; color: #B45309; }
  #pill.error { background: #FDECEC; color: #DC2626; }
  .banner { margin: 10px 28px 0; padding: 10px 14px; border-radius: 12px; background: #FDECEC;
            color: #7F1D1D; font-size: 13px; white-space: pre-wrap; }
  .grid { display: flex; flex-wrap: wrap; gap: 24px; padding: 20px 28px 40px; }
  .card { background: #fff; border: 1px solid #E5E7EB; border-radius: 16px; padding: 16px; }
  .card.changed { border-color: #00B96B; box-shadow: 0 0 0 2px rgba(0,185,107,.25); }
  .card h2 { margin: 0 0 2px; font-size: 15px; }
  .card h2 .flag { font-size: 10px; font-weight: 700; color: #00B96B; vertical-align: middle;
                   margin-left: 6px; letter-spacing: .05em; }
  .meta { color: #6B7280; font-size: 12px; margin: 0 0 10px; }
  .meta .fail { color: #DC2626; font-weight: 600; }
  .meta .pass { color: #16A34A; font-weight: 600; }
  .meta .chg { color: #B45309; font-weight: 600; }
  .panes { display: flex; gap: 12px; align-items: flex-start; }
  .panes img { width: ${Math.round(width * 0.62)}px; border: 1px solid #E5E7EB; border-radius: 12px; display: block; }
  .cmp img.prev { display: none; }
  .cmp:hover img.prev { display: block; }
  .cmp:hover img.cur { display: none; }
  .panes .wire svg { width: ${Math.round(width * 0.78)}px; height: auto; display: block; }
  .wire { border: 1px dashed #C8D0DA; border-radius: 12px; overflow: hidden; }
  .lbl { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #9CA3AF; margin: 0 0 4px; }
</style>
<header>
  <h1>${esc(appName)} — live previews</h1>
  <p>edit code → save → this page re-renders itself · render #${version}</p>
  <input id="filter" type="search" placeholder="filter screens…">
  <span id="pill">live</span>
</header>
${error ? `<div class="banner">last render FAILED — showing previous state\n${esc(error)}</div>` : ""}
<div class="grid">
${cards
  .map(({ screen, svg, summary, a11y }) => {
    const isChanged = changedSet.has(screen.id);
    const changedIn = changedVersions[screen.id];
    // hover before/after: screen.prev.png is the pre-render copy (exists once a
    // second render has happened — the first generation has nothing to compare to)
    const compare = isChanged && version > 1;
    const prevPng = String(screen.png).replace(/screen\.png$/, "screen.prev.png");
    const pixels = compare
      ? `<div class="cmp"><img class="cur" alt="${esc(screen.id)} pixels" src="/previews/${esc(screen.png)}?v=${version}"><img class="prev" alt="${esc(screen.id)} before" src="/previews/${esc(prevPng)}?v=${version}"></div>`
      : `<img alt="${esc(screen.id)} pixels" src="/previews/${esc(screen.png)}?v=${version}">`;
    return `  <div class="card${isChanged ? " changed" : ""}" id="card-${esc(screen.id)}">
    <h2>${esc(screen.title)}${isChanged ? '<span class="flag">CHANGED</span>' : ""}</h2>
    <p class="meta">id <code>${esc(screen.id)}</code> · ${summary.nodes} nodes ·
       ${summary.tokenized} tokenized · ${summary.tagged} tagged ·
       a11y <span class="${a11y.pass ? "pass" : "fail"}">${
      a11y.pass ? "PASS" : esc(a11y.violations.length + " violation(s)")
    }</span>${changedIn ? ` · <span class="chg">changed #${Number(changedIn)}</span>` : ""}</p>
    <div class="panes">
      <div><p class="lbl">${compare ? "pixels · hover = before" : "pixels"}</p>${pixels}</div>
      <div><p class="lbl">structure</p><div class="wire">${svg}</div></div>
    </div>
  </div>`;
  })
  .join("\n")}
</div>
<script>
  const pill = document.getElementById("pill");
  const es = new EventSource("/events");
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "rendering") { pill.textContent = "rendering…"; pill.className = "rendering"; }
    if (msg.type === "render") location.reload();
    if (msg.type === "error") {
      pill.textContent = msg.source === "compile" ? "compile failed" : "render failed";
      pill.className = "error";
    }
  };
  es.onerror = () => { pill.textContent = "disconnected"; pill.className = "error"; };
  // Screen filter — survives the SSE-triggered reloads via sessionStorage.
  const filter = document.getElementById("filter");
  filter.value = sessionStorage.getItem("previewFilter") || "";
  const applyFilter = () => {
    const q = filter.value.trim().toLowerCase();
    sessionStorage.setItem("previewFilter", q);
    document.querySelectorAll(".card").forEach((c) => {
      c.style.display = !q || c.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };
  filter.addEventListener("input", applyFilter);
  applyFilter();
</script>
`;
}

// --- the service --------------------------------------------------------------------

/**
 * Create (not yet start) a preview service for one project.
 *
 * @param {object} opts
 * @param {string} opts.projectDir              create-cmp app root (has composeApp/)
 * @param {string} [opts.appName]               gallery heading (default: dir basename)
 * @param {number} [opts.port]                  first port to try (default 9600, +1 up to 10x)
 * @param {(dir:string)=>Promise<void>} [opts.runRender]  render runner (default: gradlew)
 * @param {(msg:string)=>void} [opts.log]
 */
export function createPreviewService(opts) {
  const projectDir = path.resolve(opts.projectDir);
  const appName = opts.appName || path.basename(projectDir);
  const previewsDir = path.join(projectDir, "composeApp", "build", "previews");
  const srcDir = path.join(projectDir, "composeApp", "src");
  const log = opts.log || (() => {});
  const hot = opts.hot !== false; // phase 2 on by default; falls back to gradle transparently
  const daemonUrl = opts.daemonUrl || `http://127.0.0.1:${opts.daemonPort || DEFAULT_DAEMON_PORT}`;
  const runRender =
    opts.runRender ||
    (async (dir) => {
      await execFileAsync(
        "./gradlew",
        [":composeApp:renderScreens", "-q", "--console=plain"],
        { cwd: dir, timeout: 600000, maxBuffer: 16 * 1024 * 1024 },
      );
    });
  const runCompileCheck =
    opts.runCompileCheck ||
    (async (dir) => {
      await execFileAsync(
        "./gradlew",
        [":composeApp:compileKotlinDesktop", "-q", "--console=plain"],
        { cwd: dir, timeout: 300000, maxBuffer: 16 * 1024 * 1024 },
      );
    });
  const watchdogMs = opts.watchdogMs ?? COMPILE_WATCHDOG_MS;
  const staleRetryMs = opts.staleRetryMs ?? STALE_RETRY_MS;

  let server = null;
  let port = null;
  let watcher = null;
  let classesWatcher = null;
  let mode = "gradle"; // "gradle" (task per render) | "daemon" (resident hot JVM)
  let daemonChild = null;
  let daemonBootDeadline = null;
  let pollTimer = null;
  let debounceTimer = null;
  let rendering = false;
  let renderQueued = false;
  let version = 0;
  let lastError = null;
  let lastErrorSource = null; // "render" | "compile" — what produced lastError
  let lastActivity = null; // { what, at } — last observed signal, so the agent can tell "quiet" from "dead"
  let compileErrorLines = []; // accumulated hot-recompile failures (cleared on next good render)
  let lastChanged = [];
  let prevTrees = null; // current generation: screen id -> tree JSON
  let prevGenTrees = null; // the generation BEFORE that — preview_diff's automatic `before`
  const changedAt = new Map(); // screen id -> render version that last changed it
  const renderWaiters = new Set(); // waitForRender() promises pending a render/compile outcome
  let daemonReloadCount = -1; // last successful-reload count seen from the daemon (-1 = unknown)
  let daemonReloadErrors = -1; // last failed-swap count seen from the daemon
  let daemonReloadHooked = false; // daemon has the in-JVM after-reload hook
  let pendingSrcChange = false; // daemon mode: a save whose swap outcome is unconfirmed
  let staleRetries = 0;
  let watchdogTimer = null;
  let cards = [];
  let viewport = null;
  const sseClients = new Set();

  function touch(what) {
    lastActivity = { what, at: new Date().toISOString() };
  }

  /** Resolve every pending waitForRender with the (just-updated) status. */
  function settleWaiters() {
    for (const w of renderWaiters) {
      clearTimeout(w.timer);
      w.resolve({ timedOut: false, ...status() });
    }
    renderWaiters.clear();
  }

  /**
   * The agent's post-edit primitive: resolves with { timedOut, ...status() } when the
   * NEXT render cycle completes (success or failure) OR a hot-recompile failure is
   * detected (in daemon mode a broken edit produces no render at all — the compile
   * error is the outcome). One call replaces polling /status over HTTP.
   */
  function waitForRender(timeoutMs = 120000) {
    return new Promise((resolve) => {
      const w = { resolve };
      w.timer = setTimeout(() => {
        renderWaiters.delete(w);
        resolve({ timedOut: true, ...status() });
      }, timeoutMs);
      renderWaiters.add(w);
    });
  }

  /**
   * Every daemon-child output line flows through here: logged, and scanned for
   * compile failures so a broken edit is VISIBLE (lastError + SSE error + settled
   * waiters) instead of silent — without this, daemon mode gives no signal at all
   * when the hot recompile fails (no classes written -> no render trigger).
   */
  function noteDaemonOutput(chunk) {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) log(`[daemon] ${line.trimEnd()}`);
    }
    touch("daemon-output");
    const errs = extractCompileErrors(text);
    if (errs.length) {
      compileErrorLines.push(...errs);
      lastError = compileErrorLines.join("\n");
      lastErrorSource = "compile";
      touch("compile-failed");
      log(`compile FAILED (hot recompile): ${errs[0]}`);
      broadcast({ type: "error", error: lastError, source: "compile" });
      settleWaiters();
    }
  }

  function broadcast(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const res of sseClients) res.write(data);
  }

  /** Reload previews dir into cards + tree map. Throws if the dir/manifest is missing. */
  function loadPreviews() {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(previewsDir, "manifest.json"), "utf8"),
    );
    viewport = manifest.viewport;
    const trees = new Map();
    cards = manifest.screens.map((screen) => {
      const treeJson = fs.readFileSync(path.join(previewsDir, screen.tree), "utf8");
      trees.set(screen.id, treeJson);
      const tree = JSON.parse(treeJson);
      const a11y = auditA11y(tree);
      return {
        screen,
        svg: renderTreeSvg(tree, { a11y }),
        summary: summarizeTree(tree),
        a11y: { pass: a11y.pass, violations: a11y.violations },
      };
    });
    lastChanged = diffScreenTrees(prevTrees, trees);
    prevGenTrees = prevTrees;
    prevTrees = trees;
    version++;
    for (const id of lastChanged) changedAt.set(id, version);
  }

  /**
   * The last two generations of a screen's tree, for preview_diff: `before` is the
   * previous render's tree (null until a second render exists), `after` the current.
   */
  function treesFor(id) {
    return {
      before: prevGenTrees?.get(id) ?? null,
      after: prevTrees?.get(id) ?? null,
      version,
    };
  }

  /**
   * Copy each screen's current PNG to screen.prev.png before a render overwrites it,
   * so the gallery can show hover before/after on changed cards.
   */
  function snapshotPngs() {
    for (const { screen } of cards) {
      const src = path.join(previewsDir, screen.png);
      const dst = path.join(previewsDir, String(screen.png).replace(/screen\.png$/, "screen.prev.png"));
      try {
        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
      } catch {}
    }
  }

  async function daemonFetch(pathname, timeoutMs) {
    const res = await fetch(`${daemonUrl}${pathname}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json()).error || "";
      } catch {}
      throw new Error(`daemon ${pathname} -> HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return res.json();
  }

  function noteDaemonReload(r) {
    if (typeof r.reloadCount === "number") daemonReloadCount = r.reloadCount;
    if (typeof r.reloadErrors === "number") daemonReloadErrors = r.reloadErrors;
    if (typeof r.reloadHooked === "boolean") daemonReloadHooked = r.reloadHooked;
  }

  async function daemonHealthy() {
    try {
      noteDaemonReload(await daemonFetch("/health", 2000));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A source change in daemon mode: mark the swap outcome as unconfirmed (renders wait
   * for the reload via afterReload) and arm the compile watchdog — the hot recompiler
   * is a separate Gradle daemon whose failures are otherwise INVISIBLE (a broken edit
   * writes no classes, so nothing else ever fires).
   */
  function noteSrcChange() {
    if (mode !== "daemon") return;
    pendingSrcChange = true;
    staleRetries = 0;
    clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => void compileWatchdog(), watchdogMs);
  }

  function confirmSwapOutcome() {
    pendingSrcChange = false;
    staleRetries = 0;
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }

  async function compileWatchdog() {
    if (!pendingSrcChange || mode !== "daemon") return;
    log("no hot swap observed since the last save — running a compile check");
    try {
      await runCompileCheck(projectDir);
      log("compile check ok — refreshed classes will trigger the next render");
      confirmSwapOutcome(); // the edit builds; whatever renders next is the outcome
      scheduleRender(staleRetryMs);
    } catch (err) {
      const all = [err && err.message, err && err.stdout, err && err.stderr]
        .filter(Boolean)
        .join("\n");
      const errs = extractCompileErrors(all);
      lastError = errs.length ? errs.join("\n") : all;
      lastErrorSource = "compile";
      confirmSwapOutcome(); // outcome delivered; the next save re-arms
      touch("compile-failed");
      log(`compile FAILED: ${(errs[0] || String(err && err.message)).slice(0, 300)}`);
      broadcast({ type: "error", error: lastError, source: "compile" });
      settleWaiters();
    }
  }

  const spawnDaemon =
    opts.spawnDaemon ||
    (() => {
      const appPackage = detectAppPackage(projectDir);
      return spawn(
        "./gradlew",
        [
          ":composeApp:hotRunDesktop",
          `--mainClass=${appPackage}.inspector.PreviewDaemonKt`,
          "--auto",
          "--console=plain",
          "-q",
        ],
        { cwd: projectDir, stdio: ["ignore", "pipe", "pipe"] },
      );
    });

  /** Wire a spawned daemon child's streams/exit into the service (also for injected spawns). */
  function adoptDaemonChild(child) {
    child.stdout?.on("data", noteDaemonOutput);
    child.stderr?.on("data", noteDaemonOutput);
    child.on?.("exit", (code) => {
      log(`daemon gradle client exited (${code})`);
      if (mode === "daemon") {
        mode = "gradle";
        if (classesWatcher) {
          classesWatcher.close();
          classesWatcher = null;
        }
      }
      daemonChild = null;
    });
  }

  /**
   * Bring the resident daemon up in the BACKGROUND: reuse a healthy one on the port,
   * else spawn `hotRunDesktop --mainClass=<pkg>.inspector.PreviewDaemonKt --auto` and
   * poll /health. Until it's up, renders take the gradle path; once up, the classes
   * dir becomes the render trigger (the hot agent recompiles on save; freshly written
   * classes are the "code landed" signal).
   */
  async function ensureDaemon() {
    if (await daemonHealthy()) {
      enterDaemonMode("reusing already-running daemon");
      return;
    }
    try {
      daemonChild = spawnDaemon();
      adoptDaemonChild(daemonChild);
    } catch (err) {
      log(`daemon spawn failed (${err.message}) — staying on the gradle path`);
      return;
    }
    daemonBootDeadline = Date.now() + DAEMON_BOOT_TIMEOUT_MS;
    while (Date.now() < daemonBootDeadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (!daemonChild) return; // exited during boot
      if (await daemonHealthy()) {
        enterDaemonMode("daemon booted");
        return;
      }
    }
    log("daemon did not become healthy in time — staying on the gradle path");
  }

  function enterDaemonMode(why) {
    mode = "daemon";
    log(`${why} — warm renders via ${daemonUrl}`);
    watchClasses();
    // A hot swap may already have landed while we were booting; render once now.
    scheduleRender();
  }

  function watchClasses() {
    if (classesWatcher) return;
    const classesDir = path.join(projectDir, "composeApp", "build", "classes", "kotlin", "desktop", "main");
    try {
      classesWatcher = fs.watch(classesDir, { recursive: true }, () => {
        touch("classes-change");
        scheduleRender(CLASSES_DEBOUNCE_MS);
      });
      log(`watching ${classesDir} (post-hot-swap render trigger)`);
    } catch {
      // Classes dir not there yet (or recursive unsupported): the src watcher still
      // triggers renders; the daemon serves them warm either way.
      classesWatcher = null;
      log("classes dir not watchable — src watcher remains the trigger");
    }
  }

  async function renderCycle() {
    if (rendering) {
      renderQueued = true;
      return;
    }
    rendering = true;
    touch("render-start");
    snapshotPngs(); // keep the pre-render pixels for the gallery's before/after compare
    broadcast({ type: "rendering" });
    let suppressSettle = false;
    try {
      let reloadAdvanced = false;
      let swapFailed = false;
      if (mode === "daemon") {
        try {
          // Swap-aware render: after a save, ask the daemon to hold the render until
          // the in-JVM reload actually lands (classes on disk precede the swap).
          const wantReload = daemonReloadHooked && pendingSrcChange;
          const query = wantReload ? `&afterReload=${daemonReloadCount}` : "";
          const prevReload = daemonReloadCount;
          const prevErrors = daemonReloadErrors;
          const r = await daemonFetch(`/render?screen=all${query}`, DAEMON_RENDER_TIMEOUT_MS);
          noteDaemonReload(r);
          reloadAdvanced = daemonReloadCount > prevReload;
          swapFailed = prevErrors >= 0 && daemonReloadErrors > prevErrors;
          log(
            `daemon rendered ${r.rendered.length} screens in ${r.ms}ms` +
              (wantReload ? ` (swap ${reloadAdvanced ? "landed" : swapFailed ? "FAILED" : "NOT observed"})` : ""),
          );
        } catch (err) {
          log(`daemon render failed (${err.message}) — falling back to the gradle path`);
          mode = "gradle";
          await runRender(projectDir);
        }
      } else {
        await runRender(projectDir);
      }
      loadPreviews();
      lastError = null;
      lastErrorSource = null;
      compileErrorLines = [];
      if (swapFailed) {
        // The agent could not apply the swap (typically a structural change beyond
        // Compose Hot Reload). Previews show pre-swap code — say so, don't retry.
        lastError =
          "hot swap FAILED to apply (structural change beyond the reload agent?) — " +
          "previews show pre-swap code; restart the preview to pick the change up";
        lastErrorSource = "reload";
        confirmSwapOutcome();
        touch("swap-failed");
        log(`render #${version}: ${lastError}`);
        broadcast({ type: "error", error: lastError, source: "reload" });
        return;
      }
      // Stale render: a save is pending, the swap hasn't landed, and nothing changed —
      // we likely composed pre-swap code. Retry shortly instead of a false `changed: []`
      // (when the daemon lacks the reload hook this is time-based and bounded).
      const stale =
        mode === "daemon" &&
        pendingSrcChange &&
        !reloadAdvanced &&
        lastChanged.length === 0;
      if (stale && staleRetries < MAX_STALE_RETRIES) {
        staleRetries++;
        suppressSettle = true; // waiters get the retry's outcome, not this stale one
        touch("render-stale");
        log(`render #${version} preceded the hot swap — retry ${staleRetries}/${MAX_STALE_RETRIES} in ${staleRetryMs}ms`);
        scheduleRender(staleRetryMs);
      } else {
        if (stale) {
          touch("swap-not-observed");
          log(
            `no hot swap observed after ${MAX_STALE_RETRIES} retries — settling with the current render ` +
              "(a no-op edit, or a structural change the hot agent can't apply; restart preview to heal the latter)",
          );
        } else {
          touch("render-ok");
        }
        confirmSwapOutcome();
        log(`render #${version} ok${lastChanged.length ? ` (changed: ${lastChanged.join(", ")})` : ""}`);
        broadcast({ type: "render", version, changed: lastChanged });
      }
    } catch (err) {
      lastError = err && err.message ? err.message : String(err);
      lastErrorSource = "render";
      touch("render-failed");
      log(`render FAILED: ${lastError}`);
      broadcast({ type: "error", error: lastError, source: "render" });
    } finally {
      rendering = false;
      if (renderQueued) {
        renderQueued = false;
        void renderCycle();
      } else if (!suppressSettle) {
        settleWaiters(); // no follow-up pending — this cycle IS the outcome waiters asked for
      }
    }
  }

  function scheduleRender(delayMs = DEBOUNCE_MS) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void renderCycle(), delayMs);
  }

  const IGNORE = /(^|[\\/])(build|\.gradle|\.idea|\.DS_Store)([\\/]|$)/;

  function startWatching() {
    try {
      watcher = fs.watch(srcDir, { recursive: true }, (_event, filename) => {
        if (filename && IGNORE.test(filename)) return;
        touch("src-change");
        noteSrcChange(); // daemon mode: mark swap-pending + arm the compile watchdog
        // Daemon mode: the hot agent recompiles on save and the classes watcher fires
        // once fresh classes land — rendering now would race it with stale code.
        if (mode === "daemon" && classesWatcher) return;
        scheduleRender();
      });
      log(`watching ${srcDir} (fs events)`);
    } catch {
      // Recursive watch unsupported → cheap mtime poll over the source tree.
      let lastStamp = scanStamp();
      pollTimer = setInterval(() => {
        const stamp = scanStamp();
        if (stamp !== lastStamp) {
          lastStamp = stamp;
          touch("src-change");
          noteSrcChange();
          scheduleRender();
        }
      }, POLL_FALLBACK_MS);
      log(`watching ${srcDir} (poll fallback)`);
    }
  }

  function scanStamp() {
    let stamp = 0;
    (function walk(dir) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (IGNORE.test(p)) continue;
        if (e.isDirectory()) walk(p);
        else {
          try {
            stamp = Math.max(stamp, fs.statSync(p).mtimeMs);
          } catch {}
        }
      }
    })(srcDir);
    return stamp;
  }

  function handleRequest(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        galleryHtml({
          appName,
          viewport,
          cards,
          version,
          changed: lastChanged,
          changedVersions: Object.fromEntries(changedAt),
          error: lastError,
        }),
      );
      return;
    }
    if (url.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "hello", version })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }
    if (url.pathname === "/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(status(), null, 2));
      return;
    }
    if (url.pathname.startsWith("/previews/")) {
      // Static previews: constrain to previewsDir (no traversal).
      const rel = decodeURIComponent(url.pathname.slice("/previews/".length));
      const file = path.normalize(path.join(previewsDir, rel));
      if (!file.startsWith(previewsDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const type = file.endsWith(".png")
        ? "image/png"
        : file.endsWith(".json")
          ? "application/json"
          : file.endsWith(".svg")
            ? "image/svg+xml"
            : "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  }

  function listen(startPort) {
    return new Promise((resolvePromise, reject) => {
      let attempt = 0;
      const tryPort = (p) => {
        const srv = http.createServer(handleRequest);
        srv.once("error", (err) => {
          if (err.code === "EADDRINUSE" && attempt < PORT_ATTEMPTS - 1) {
            attempt++;
            tryPort(p + 1);
          } else {
            reject(err);
          }
        });
        srv.listen(p, "127.0.0.1", () => {
          server = srv;
          port = p;
          resolvePromise(p);
        });
      };
      tryPort(startPort);
    });
  }

  function status() {
    return {
      projectDir,
      url: port ? `http://127.0.0.1:${port}/` : null,
      previewsDir,
      mode,
      daemon: { url: daemonUrl, active: mode === "daemon" },
      version,
      rendering,
      lastError,
      lastErrorSource,
      lastActivity,
      changedLastRender: lastChanged,
      screens: cards.map(({ screen, summary, a11y }) => ({
        id: screen.id,
        title: screen.title,
        ...summary,
        a11yPass: a11y.pass,
        a11yViolations: a11y.violations.length,
        lastChangedVersion: changedAt.get(screen.id) ?? null,
        tree: path.join(previewsDir, screen.tree),
        png: path.join(previewsDir, screen.png),
      })),
    };
  }

  return {
    /** Initial render (unless fresh previews already exist), then serve + watch. */
    async start() {
      if (!fs.existsSync(path.join(projectDir, "composeApp"))) {
        throw new Error(
          `'${projectDir}' does not look like a create-cmp app (no composeApp/).`,
        );
      }
      if (fs.existsSync(path.join(previewsDir, "manifest.json"))) {
        // Serve what's on disk immediately; a fresh render still runs right after,
        // so the human sees SOMETHING at once and current state seconds later.
        loadPreviews();
      }
      await listen(opts.port || DEFAULT_PORT);
      startWatching();
      void renderCycle();
      if (hot) void ensureDaemon();
      return status();
    },
    stop() {
      clearTimeout(debounceTimer);
      clearInterval(pollTimer);
      clearTimeout(watchdogTimer);
      settleWaiters(); // don't leave agents hanging on a stopped service
      daemonBootDeadline = 0; // abort any in-flight boot poll
      if (classesWatcher) classesWatcher.close();
      // Best-effort daemon teardown: ask the JVM to exit, then kill the gradle client.
      fetch(`${daemonUrl}/shutdown`, { signal: AbortSignal.timeout(1500) }).catch(() => {});
      if (daemonChild) daemonChild.kill("SIGTERM");
      if (watcher) watcher.close();
      for (const res of sseClients) res.end();
      sseClients.clear();
      if (server) server.close();
      const final = status();
      server = null;
      port = null;
      return final;
    },
    status,
    waitForRender,
    treesFor,
    /** Test seam: force one render cycle without touching the filesystem watcher. */
    _renderCycle: renderCycle,
    /** Test seam: feed daemon-child output through the compile-failure scanner. */
    _noteDaemonOutput: noteDaemonOutput,
    /** Test seam: simulate a source-change event (swap-pending + watchdog arming). */
    _noteSrcChange: noteSrcChange,
  };
}
