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
import { fetchLiveCatalog } from "./live.mjs";
import {
  getApprovalsData,
  approveArtifact as approveArtifactViaLib,
  reopenArtifact as reopenArtifactViaLib,
} from "./approvals-bridge.mjs";
import {
  getCommentsData,
  addComment as addCommentViaLib,
  resolveComment as resolveCommentViaLib,
} from "./comments-bridge.mjs";
import { getSpecsData } from "./specs.mjs";
import { getArchitectureData } from "./architecture.mjs";
import { getComponentsData } from "./components.mjs";
import { getVariantsData } from "./variants.mjs";
import {
  designSystemTabHtml,
  approvalsTabHtml,
  specsTabHtml,
  architectureTabHtml,
  commentsTabHtml,
  commentControlHtml,
} from "./console-tabs.mjs";

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
 * @param {object} state { appName, viewport, cards, version, changed, changedVersions, error,
 *   approvals, specs, designSystem, architecture, components, comments, variants }
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
    approvals = { available: false },
    specs = { available: false },
    designSystem = { available: false },
    architecture = { layerMap: { available: false }, governedContract: { available: false }, featureShape: { available: false } },
    components = { available: false },
    comments = { available: false },
    variants = { available: false },
  } = state;
  const width = viewport?.width ?? 411;
  const changedSet = new Set(changed);
  // Tab-bar badge (§7.3): count of OPEN comments, shown next to the Comments
  // tab. Always renders the badge element (even at 0, just hidden) so the SSE
  // "comment" handler below can always find #comments-badge to update in place.
  const openCommentCount = comments.available ? comments.comments.filter((c) => c.status === "open").length : 0;
  // §2 mode presentation: the Design System tab's candidates strip is genesis-
  // mode only — derived from the design-system ARTIFACT's own live status
  // (undefined when approvals data isn't available at all, which reads as
  // steward — the safe default: no strip rather than a fabricated one).
  const designSystemStatus = approvals.available
    ? (approvals.statuses.find((s) => s.id === "design-system") || {}).status
    : undefined;
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
  nav.tabs { display: flex; gap: 4px; padding: 4px 28px 0; border-bottom: 1px solid #E5E7EB; }
  nav.tabs button { appearance: none; background: none; border: none; padding: 10px 14px;
                     font: inherit; font-size: 13px; font-weight: 600; color: #6B7280;
                     cursor: pointer; border-bottom: 2px solid transparent; }
  nav.tabs button.active { color: #0A2540; border-bottom-color: #00B96B; }
  .tab-panel { display: none; padding: 20px 28px 40px; }
  .tab-panel.active { display: block; }
  #tab-screens.tab-panel { padding: 0; }
  .empty { padding: 20px 28px; color: #6B7280; font-size: 13px; }
  .empty-inline { color: #9CA3AF; font-size: 12px; }
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
  .swatch-grid { display: flex; flex-wrap: wrap; gap: 16px; }
  .swatch-card { width: 130px; }
  .swatch { width: 100%; height: 60px; border-radius: 10px; border: 1px solid #E5E7EB; }
  .swatch-name { font-size: 12px; font-weight: 600; margin-top: 6px; }
  .swatch-value { font-size: 11px; color: #6B7280; }
  .dimens-table, .approvals-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  .dimens-table td, .approvals-table td, .approvals-table th {
    padding: 8px 10px; border-bottom: 1px solid #E5E7EB; text-align: left; vertical-align: top; }
  .badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
  .badge-approved { background: #E8F7EF; color: #16A34A; }
  .badge-unreviewed { background: #EEF2FF; color: #4338CA; }
  .badge-changed { background: #FDECEC; color: #DC2626; }
  /* reopened (§2 "Reopen for redesign") — a deliberate state, so it gets its own color
     rather than reusing badge-unreviewed even though the gate treats them the same. */
  .badge-reopened { background: #FEF6E7; color: #B45309; }
  /* defaults-accepted (§2 express lane) layers ON TOP of badge-approved — a distinct
     outline, not a different fill, so "approved" stays legible at a glance. */
  .badge-unshaped { box-shadow: inset 0 0 0 1px #B45309; }
  .artifact-id { font-size: 11px; color: #9CA3AF; }
  .approved-at { font-size: 11px; color: #9CA3AF; margin-top: 2px; }
  .unresolvable-note, .missing-note { font-size: 11px; color: #B45309; margin: 4px 0 0; }
  .approve-btn { font: inherit; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 8px;
                 border: 1px solid #0A2540; background: #0A2540; color: #fff; cursor: pointer; }
  .approve-btn:disabled { background: #E5E7EB; border-color: #E5E7EB; color: #9CA3AF; cursor: not-allowed; }
  .reopen-btn { font: inherit; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 8px;
                border: 1px solid #B45309; background: #fff; color: #B45309; cursor: pointer; }
  /* §2 mode presentation: the per-artifact genesis/steward banner, inline under the label. */
  .artifact-banner { font-size: 11px; margin-top: 4px; padding: 4px 8px; border-radius: 8px; max-width: 320px; }
  .banner-mode { font-weight: 700; text-transform: uppercase; letter-spacing: .04em; margin-right: 4px; }
  .banner-genesis { background: #EEF2FF; color: #312E81; }
  .banner-steward { background: #F3F4F6; color: #4B5563; }
  .banner-unshaped { background: #FEF6E7; color: #92400E; }
  /* §2 candidates strip (Design System tab, genesis mode only). */
  .candidates-strip { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px; }
  .candidate-card { flex: 1 1 260px; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; background: #fff; }
  .candidate-card h4 { margin: 0 0 8px; font-size: 13px; }
  .candidate-shots { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
  .candidate-shot { width: 90px; }
  .candidate-shot img { width: 100%; border: 1px solid #E5E7EB; border-radius: 8px; display: block; }
  .pick-btn { font: inherit; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 8px;
              border: 1px solid #0A2540; background: #0A2540; color: #fff; cursor: pointer; }
  .pick-btn:disabled { background: #E5E7EB; border-color: #E5E7EB; color: #9CA3AF; cursor: not-allowed; }
  .spec-file h3 { margin: 18px 0 6px; font-size: 14px; }
  .spec-file:first-child h3 { margin-top: 0; }
  .clause-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .clause { display: flex; align-items: baseline; gap: 10px; font-size: 13px; padding: 8px 10px;
            border: 1px solid #E5E7EB; border-radius: 10px; background: #fff; }
  .clause.withdrawn { opacity: .6; }
  .clause-id { font-size: 11px; color: #0A2540; font-weight: 700; flex: 0 0 auto; }
  .clause-prose { flex: 1; }
  .cov-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; flex: 0 0 auto; white-space: nowrap; }
  .cov-yes { background: #E8F7EF; color: #16A34A; }
  .cov-no { background: #FDECEC; color: #DC2626; }
  .cov-na { background: #F3F4F6; color: #9CA3AF; }
  .arch-section { margin-bottom: 28px; }
  .arch-section h3 { margin: 0 0 10px; font-size: 14px; }
  .layer-map { display: flex; flex-wrap: wrap; gap: 14px; }
  .layer-box { flex: 1 1 220px; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; background: #fff; }
  .layer-box.layer-empty { opacity: .55; border-style: dashed; }
  .layer-box h4 { margin: 0 0 4px; font-size: 13px; display: flex; align-items: center; gap: 6px; }
  .layer-desc { font-size: 11px; color: #6B7280; margin: 0 0 8px; }
  .layer-files, .feature-tree, .component-params, .component-used-in { list-style: none; margin: 0; padding: 0;
    font-size: 12px; display: flex; flex-direction: column; gap: 3px; max-height: 220px; overflow-y: auto; }
  .layer-files li, .feature-tree li { display: flex; align-items: center; gap: 6px; }
  .layer-others { margin-top: 14px; }
  .component-grid { display: flex; flex-wrap: wrap; gap: 16px; }
  .component-card { flex: 1 1 260px; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; background: #fff; }
  .component-card h4 { margin: 0 0 4px; font-size: 13px; display: flex; align-items: center; gap: 6px; }
  .comments-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  .comments-table td, .comments-table th { padding: 8px 10px; border-bottom: 1px solid #E5E7EB; text-align: left; vertical-align: top; }
  .comment-text-cell { max-width: 320px; white-space: pre-wrap; }
  .badge-open { background: #EEF2FF; color: #4338CA; }
  .badge-resolved { background: #E8F7EF; color: #16A34A; }
  .comment-resolution { margin-top: 4px; }
  .comment-resolution-note { font-size: 12px; color: #6B7280; margin: 2px 0 0; }
  .tab-badge { display: inline-block; min-width: 16px; padding: 1px 6px; margin-left: 4px; border-radius: 999px;
               background: #DC2626; color: #fff; font-size: 10px; font-weight: 700; text-align: center; }
  .comment-ctl { position: relative; display: inline-block; }
  .comment-btn { appearance: none; border: none; background: none; cursor: pointer; font-size: 12px;
                 padding: 0 2px; line-height: 1; opacity: .6; }
  .comment-btn:hover { opacity: 1; }
  .comment-popover { position: absolute; z-index: 20; top: 100%; left: 0; margin-top: 4px; width: 220px;
                      background: #fff; border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px;
                      box-shadow: 0 4px 16px rgba(0,0,0,.12); display: flex; flex-direction: column; gap: 6px; }
  /* The popover and badge are toggled with the hidden ATTRIBUTE, but their author
     display rules (flex / inline-block) override the UA stylesheet's [hidden]
     { display: none } — without these guards every "hidden" popover stays painted,
     and its children (the textarea especially) overflow the 0x0 box and invisibly
     intercept clicks: on the dense specs tab, clicking one clause's visible Post
     button actually hit the NEXT clause's hidden textarea (elementFromPoint-verified
     — the VL-7 browser gate's repro), so the submit never fired. */
  .comment-popover[hidden] { display: none !important; }
  .tab-badge[hidden] { display: none !important; }
  .comment-popover textarea, .comment-popover input { font: inherit; font-size: 12px; padding: 6px 8px;
                      border: 1px solid #E5E7EB; border-radius: 8px; resize: vertical; width: 100%; box-sizing: border-box; }
  .comment-popover-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .comment-popover-actions button { font: inherit; font-size: 11px; padding: 4px 10px; border-radius: 6px;
                      border: 1px solid #E5E7EB; background: #F7F9FC; cursor: pointer; }
  .comment-submit { border-color: #0A2540 !important; background: #0A2540 !important; color: #fff; }
  .comment-error { color: #DC2626; font-size: 11px; margin: 0; }
</style>
<header>
  <h1>${esc(appName)} — live previews</h1>
  <p>edit code → save → this page re-renders itself · render #${version}</p>
  <input id="filter" type="search" placeholder="filter screens…">
  <span id="pill">live</span>
</header>
${error ? `<div class="banner">last render FAILED — showing previous state\n${esc(error)}</div>` : ""}
<nav class="tabs">
  <button class="tab-btn active" data-tab="screens">Screens</button>
  <button class="tab-btn" data-tab="design-system">Design System</button>
  <button class="tab-btn" data-tab="architecture">Architecture</button>
  <button class="tab-btn" data-tab="approvals">Approvals</button>
  <button class="tab-btn" data-tab="specs">Specs</button>
  <button class="tab-btn" data-tab="comments">Comments <span class="tab-badge" id="comments-badge"${openCommentCount === 0 ? " hidden" : ""}>${openCommentCount}</span></button>
</nav>
<div id="tab-screens" class="tab-panel active" data-tab="screens">
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
    <h2>${esc(screen.title)}${isChanged ? '<span class="flag">CHANGED</span>' : ""}${commentControlHtml({ type: "screen", screen: screen.id }, { testTagInput: true })}</h2>
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
</div>
<div id="tab-design-system" class="tab-panel" data-tab="design-system">
${designSystemTabHtml(designSystem, components, variants, designSystemStatus)}
</div>
<div id="tab-architecture" class="tab-panel" data-tab="architecture">
${architectureTabHtml(architecture)}
</div>
<div id="tab-approvals" class="tab-panel" data-tab="approvals">
${approvalsTabHtml(approvals)}
</div>
<div id="tab-specs" class="tab-panel" data-tab="specs">
${specsTabHtml(specs)}
</div>
<div id="tab-comments" class="tab-panel" data-tab="comments">
${commentsTabHtml(comments)}
</div>
<script>
  const pill = document.getElementById("pill");
  const es = new EventSource("/events");
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "rendering") { pill.textContent = "rendering…"; pill.className = "rendering"; }
    if (msg.type === "render") location.reload();
    // Approvals refresh IN PLACE (no location.reload()): a full reload on every
    // approval flashes the page, drops scroll, and blanks assistive/agent views
    // of the document mid-navigation — an approval only changes the Approvals
    // tab's markup, so swap exactly that panel from a re-fetched page.
    if (msg.type === "approval") {
      fetch("/").then((r) => r.text()).then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const fresh = doc.querySelector("#tab-approvals");
        const cur = document.querySelector("#tab-approvals");
        if (fresh && cur) {
          const wasActive = cur.classList.contains("active");
          cur.innerHTML = fresh.innerHTML;
          if (wasActive) cur.classList.add("active");
          wireApproveButtons(cur);
          wireReopenButtons(cur);
        } else {
          location.reload(); // fallback: unexpected markup — the old behavior
        }
      }).catch(() => location.reload());
    }
    // Comments refresh IN PLACE too (§7.3, same VL-6 pattern as approvals):
    // one SSE event covers BOTH a new comment (POST /api/comment, console)
    // and a resolution (resolve_comment, agent) — either way, only the
    // Comments tab's markup and the tab-bar open-count badge changed.
    if (msg.type === "comment") {
      fetch("/").then((r) => r.text()).then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const freshPanel = doc.querySelector("#tab-comments");
        const curPanel = document.querySelector("#tab-comments");
        if (freshPanel && curPanel) {
          const wasActive = curPanel.classList.contains("active");
          curPanel.innerHTML = freshPanel.innerHTML;
          if (wasActive) curPanel.classList.add("active");
        } else {
          location.reload();
          return;
        }
        const freshBadge = doc.querySelector("#comments-badge");
        const curBadge = document.querySelector("#comments-badge");
        if (freshBadge && curBadge) {
          curBadge.textContent = freshBadge.textContent;
          curBadge.hidden = freshBadge.hidden;
        }
      }).catch(() => location.reload());
    }
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
  // Tabs — deep-linkable via location.hash (#approvals bookmarks/shares the tab,
  // and automation can land on any tab by URL), with sessionStorage as the
  // fallback so SSE-triggered reloads keep the tab even without a hash.
  const tabBtns = [...document.querySelectorAll(".tab-btn")];
  const panels = [...document.querySelectorAll(".tab-panel")];
  const validTab = (t) => tabBtns.some((b) => b.dataset.tab === t);
  function showTab(tab) {
    sessionStorage.setItem("previewTab", tab);
    if (("#" + tab) !== location.hash) history.replaceState(null, "", "#" + tab);
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle("active", p.dataset.tab === tab));
  }
  tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  window.addEventListener("hashchange", () => {
    const t = location.hash.slice(1);
    if (validTab(t)) showTab(t);
  });
  const fromHash = location.hash.slice(1);
  showTab(validTab(fromHash) ? fromHash : (sessionStorage.getItem("previewTab") || "screens"));
  // Approvals — POST /api/approve; a successful approve is confirmed by the
  // server's SSE "approval" broadcast above (which swaps the Approvals panel
  // in place), not by this handler mutating state itself — the two never race.
  // Wiring lives in a function because the SSE swap replaces the panel's DOM
  // and must re-attach these listeners to the fresh buttons.
  function wireApproveButtons(scope) {
  scope.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const artifact = btn.dataset.artifact;
      const errBox = document.getElementById("approve-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Approving…";
      try {
        const res = await fetch("/api/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifact }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "approval refused"; }
          btn.disabled = false;
          btn.textContent = original;
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wireApproveButtons(document);
  // Reopen (§2/§3) — POST /api/reopen; confirmed the same way approve is: the
  // server's SSE "approval" broadcast (reopen reuses that event type — it's
  // still just "an artifact's status changed", the same in-place refresh
  // covers both) swaps the Approvals panel, not this handler. An older
  // project lib without reopenArtifact surfaces its refusal in #approve-error
  // — never a crash (GENESIS-FLOW-DESIGN.md §3 "honest degrade").
  function wireReopenButtons(scope) {
  scope.querySelectorAll(".reopen-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const artifact = btn.dataset.artifact;
      const errBox = document.getElementById("approve-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Reopening…";
      try {
        const res = await fetch("/api/reopen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifact }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "reopen refused"; }
          btn.disabled = false;
          btn.textContent = original;
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wireReopenButtons(document);
  // Pick (§2 candidates strip) — POSTs the EXISTING /api/comment endpoint with
  // target {type:"design-system"}, text "pick:<name>" — no new decision
  // machinery; the agent observes it via review_comments{waitForComment}. A
  // successful pick is confirmed by the same "comment" SSE broadcast every
  // other comment produces (refreshes the Comments tab + badge); this handler
  // just gives immediate button feedback so the human isn't left guessing.
  function wirePickButtons(scope) {
  scope.querySelectorAll(".pick-btn").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async () => {
      const name = btn.dataset.variant;
      const errBox = document.getElementById("pick-error");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Picking…";
      try {
        const res = await fetch("/api/comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: { type: "design-system" }, text: "pick:" + name }),
        });
        const body = await res.json();
        if (!body.ok) {
          if (errBox) { errBox.hidden = false; errBox.textContent = body.reason || "pick refused"; }
          btn.disabled = false;
          btn.textContent = original;
        } else {
          btn.textContent = "Picked";
        }
      } catch (err) {
        if (errBox) { errBox.hidden = false; errBox.textContent = String(err); }
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
  }
  wirePickButtons(document);
  // Comments (§7.3) — every 💬 control (screens, spec clauses, tokens,
  // components, architecture nodes) opens the same inline popover and POSTs
  // to /api/comment; a successful post is confirmed by the server's SSE
  // "comment" broadcast (which refreshes the Comments tab + badge in place),
  // not by this handler — same non-racing split as wireApproveButtons.
  // dataset.wired guards against double-binding across repeated calls
  // (initial load + no-op re-scans of the same, never-swapped card markup).
  function wireCommentButtons(scope) {
    scope.querySelectorAll(".comment-ctl").forEach((ctl) => {
      const btn = ctl.querySelector(".comment-btn");
      const pop = ctl.querySelector(".comment-popover");
      if (!btn || !pop || btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", () => { pop.hidden = !pop.hidden; });
      const cancelBtn = pop.querySelector(".comment-cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", () => { pop.hidden = true; });
      const submitBtn = pop.querySelector(".comment-submit");
      if (submitBtn) submitBtn.addEventListener("click", async () => {
        const textEl = pop.querySelector(".comment-text");
        const ttEl = pop.querySelector(".comment-testtag");
        const errEl = pop.querySelector(".comment-error");
        if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
        let target;
        try { target = JSON.parse(ctl.dataset.target); } catch { target = { type: "general" }; }
        if (ttEl && ttEl.value.trim()) target = { type: "element", screen: target.screen, testTag: ttEl.value.trim() };
        submitBtn.disabled = true;
        try {
          const res = await fetch("/api/comment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target, text: textEl ? textEl.value : "" }),
          });
          const body = await res.json();
          if (!body.ok) {
            if (errEl) { errEl.hidden = false; errEl.textContent = body.reason || "comment refused"; }
          } else {
            pop.hidden = true;
            if (textEl) textEl.value = "";
            if (ttEl) ttEl.value = "";
          }
        } catch (err) {
          if (errEl) { errEl.hidden = false; errEl.textContent = String(err); }
        } finally {
          submitBtn.disabled = false;
        }
      });
    });
  }
  wireCommentButtons(document);
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
  const approvalWaiters = new Set(); // waitForApprovalDecision() promises pending a status change
  let approvalPollTimer = null; // only ticks while approvalWaiters is non-empty
  const commentWaiters = new Set(); // waitForNewComment() promises pending a NEW comment id
  let commentPollTimer = null; // only ticks while commentWaiters is non-empty
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
   * Every governed artifact's live status, via the project's own qa/lib/approvals.mjs
   * (approvals-bridge.mjs — never forked here). Same shape the Approvals tab renders:
   * { available: false } for projects predating the approvals wave, else
   * { available: true, statuses: [...] }.
   */
  function approvalStatusSnapshot() {
    return getApprovalsData(projectDir);
  }

  /** Artifact ids whose (status, hash, approvedAt) differ, or that appeared/disappeared. */
  function diffApprovalStatusIds(beforeStatuses, afterStatuses) {
    const beforeMap = new Map(beforeStatuses.map((s) => [s.id, `${s.status}|${s.hash}|${s.approvedAt}`]));
    const changed = [];
    const afterIds = new Set();
    for (const s of afterStatuses) {
      afterIds.add(s.id);
      if (beforeMap.get(s.id) !== `${s.status}|${s.hash}|${s.approvedAt}`) changed.push(s.id);
    }
    for (const s of beforeStatuses) {
      if (!afterIds.has(s.id)) changed.push(s.id);
    }
    return changed;
  }

  function ensureApprovalPoll() {
    if (approvalPollTimer) return;
    approvalPollTimer = setInterval(() => void checkApprovalWaiters(), 1000);
  }
  function maybeStopApprovalPoll() {
    if (approvalWaiters.size === 0 && approvalPollTimer) {
      clearInterval(approvalPollTimer);
      approvalPollTimer = null;
    }
  }

  /**
   * Settle any waitForApprovalDecision() calls whose snapshot has since changed.
   * Called immediately after a successful POST /api/approve (event-driven, near-
   * instant) AND on a 1s poll while waiters are pending (so an approval recorded
   * OUTSIDE this server — `node qa/approve.mjs` from a terminal — is caught too;
   * design doc §4 permits either "poll or event-driven off the POST handler").
   */
  async function checkApprovalWaiters() {
    if (approvalWaiters.size === 0) return;
    const now = await approvalStatusSnapshot();
    const nowStatuses = now.available ? now.statuses : [];
    for (const w of [...approvalWaiters]) {
      const changed = diffApprovalStatusIds(w.beforeStatuses, nowStatuses);
      if (changed.length > 0 || now.available !== w.beforeAvailable) {
        clearTimeout(w.timer);
        approvalWaiters.delete(w);
        w.resolve({ timedOut: false, available: now.available, changed, statuses: nowStatuses });
      }
    }
    maybeStopApprovalPoll();
  }

  /** Resolve every pending waitForApprovalDecision immediately (service stopping). */
  function settleApprovalWaiters() {
    for (const w of approvalWaiters) {
      clearTimeout(w.timer);
      w.resolve({ timedOut: false, available: w.beforeAvailable, changed: [], statuses: w.beforeStatuses });
    }
    approvalWaiters.clear();
    if (approvalPollTimer) {
      clearInterval(approvalPollTimer);
      approvalPollTimer = null;
    }
  }

  /**
   * The agent's approval primitive (VERIFICATION-LAYER-DESIGN.md §4): without
   * waitForDecision, the current snapshot. With it, blocks until ANY governed
   * artifact's status CHANGES — exactly waitForRender's blocking+timeout shape,
   * applied to approvals instead of renders. Resolves immediately with
   * {available:false} in a project with no approvals library — there is no
   * decision to wait for.
   */
  async function waitForApprovalDecision(timeoutMs = 120000) {
    const before = await approvalStatusSnapshot();
    if (!before.available) {
      return { timedOut: false, available: false, changed: [], statuses: [] };
    }
    return new Promise((resolve) => {
      const w = { resolve, beforeStatuses: before.statuses, beforeAvailable: before.available };
      w.timer = setTimeout(async () => {
        approvalWaiters.delete(w);
        const now = await approvalStatusSnapshot();
        resolve({ timedOut: true, available: now.available, changed: [], statuses: now.available ? now.statuses : [] });
        maybeStopApprovalPoll();
      }, timeoutMs);
      approvalWaiters.add(w);
      ensureApprovalPoll();
    });
  }

  // --- comments (§7.3) -------------------------------------------------------------

  /**
   * The full comment ledger, via the project's own qa/lib/comments.mjs
   * (comments-bridge.mjs — never forked here). Same shape the Comments tab
   * renders: { available: false } for projects predating the comments wave,
   * else { available: true, schema, comments: [...] }.
   */
  function commentsSnapshot(status) {
    return getCommentsData(projectDir, status ? { status } : undefined);
  }

  function ensureCommentPoll() {
    if (commentPollTimer) return;
    commentPollTimer = setInterval(() => void checkCommentWaiters(), 1000);
  }
  function maybeStopCommentPoll() {
    if (commentWaiters.size === 0 && commentPollTimer) {
      clearInterval(commentPollTimer);
      commentPollTimer = null;
    }
  }

  /**
   * Settle any waitForNewComment() calls once a comment id appears that
   * wasn't in their `before` snapshot — mirrors checkApprovalWaiters' split
   * (event-driven off the POST handler + a 1s poll fallback for a comment
   * recorded OUTSIDE this server, e.g. `node qa/comment.mjs` from a
   * terminal), but keyed on NEW ids specifically (unlike approvals, a
   * resolve() should NOT wake a waitForNewComment() caller — only a fresh
   * comment landing does).
   */
  async function checkCommentWaiters() {
    if (commentWaiters.size === 0) return;
    const now = await commentsSnapshot();
    const nowComments = now.available ? now.comments : [];
    for (const w of [...commentWaiters]) {
      const added = nowComments.filter((c) => !w.beforeIds.has(c.id));
      if (added.length > 0 || now.available !== w.beforeAvailable) {
        clearTimeout(w.timer);
        commentWaiters.delete(w);
        w.resolve({ timedOut: false, available: now.available, added, comments: nowComments });
      }
    }
    maybeStopCommentPoll();
  }

  /** Resolve every pending waitForNewComment immediately (service stopping). */
  function settleCommentWaiters() {
    for (const w of commentWaiters) {
      clearTimeout(w.timer);
      w.resolve({ timedOut: false, available: w.beforeAvailable, added: [], comments: [] });
    }
    commentWaiters.clear();
    if (commentPollTimer) {
      clearInterval(commentPollTimer);
      commentPollTimer = null;
    }
  }

  /**
   * The agent's comment primitive (VERIFICATION-LAYER-DESIGN.md §7.3): without
   * waitForComment, the current snapshot. With it, blocks until a NEW comment
   * lands (an id absent from the `before` snapshot) — same blocking+timeout
   * shape as waitForApprovalDecision, applied to "a human left feedback"
   * instead of "a human decided". Resolves immediately with
   * {available:false} in a project with no comments library.
   */
  async function waitForNewComment(timeoutMs = 120000) {
    const before = await commentsSnapshot();
    if (!before.available) {
      return { timedOut: false, available: false, added: [], comments: [] };
    }
    const beforeIds = new Set(before.comments.map((c) => c.id));
    return new Promise((resolve) => {
      const w = { resolve, beforeIds, beforeAvailable: before.available };
      w.timer = setTimeout(async () => {
        commentWaiters.delete(w);
        const now = await commentsSnapshot();
        resolve({ timedOut: true, available: now.available, added: [], comments: now.available ? now.comments : [] });
        maybeStopCommentPoll();
      }, timeoutMs);
      commentWaiters.add(w);
      ensureCommentPoll();
    });
  }

  /**
   * The agent's resolve primitive (§7.3): closes the loop AFTER acting on a
   * comment, recording author "agent" and the note (what was done). A
   * successful resolve broadcasts the same SSE "comment" event a new comment
   * does — the Comments tab shows the resolution either way.
   */
  async function resolveCommentById(id, note) {
    const result = await resolveCommentViaLib(projectDir, id, { note, author: "agent" });
    if (result.ok) {
      touch("comment-resolved");
      broadcast({ type: "comment" });
      void checkCommentWaiters();
    }
    return result;
  }

  /** Design System tab data: previews-dir catalog first, else a best-effort live fetch. */
  async function getDesignSystemData() {
    const catalogPath = path.join(previewsDir, "design-system.json");
    if (fs.existsSync(catalogPath)) {
      try {
        return { available: true, source: "previews", catalog: JSON.parse(fs.readFileSync(catalogPath, "utf8")) };
      } catch (err) {
        log(`design-system.json at ${catalogPath} is not valid JSON (${err.message}) — trying a live session`);
      }
    }
    try {
      const catalog = await fetchLiveCatalog({ timeoutMs: 800 });
      return { available: true, source: "live", catalog };
    } catch {
      return { available: false };
    }
  }

  const VARIANT_NAME_RE = /^[a-z0-9-]+$/;

  /**
   * §2 "Design-language candidates": stash the CURRENT render outputs (each
   * screen's screen.png from the last completed render, held in `cards`) plus
   * design-system.json into composeApp/build/previews/variants/<name>/,
   * REPLACING that variant if one already exists — an rmSync then copy, both
   * synchronous, so no caller ever observes a half-written variant directory.
   * The MCP tool's zod schema is the first gate on `name`, but this primitive
   * is also a direct test seam — never trust a caller's regex alone, so the
   * shape is re-checked here too.
   * @param {string} name
   * @returns {{ok:true, name:string, screens:string[], designSystemStashed:boolean, dir:string} | {ok:false, reason:string}}
   */
  function snapshotVariant(name) {
    if (typeof name !== "string" || !VARIANT_NAME_RE.test(name)) {
      return {
        ok: false,
        reason: `invalid variant name "${name}" — must match [a-z0-9-]+ (lowercase letters, digits, hyphens)`,
      };
    }
    if (cards.length === 0) {
      return {
        ok: false,
        reason: "no current render to stash — call preview {projectDir} and wait for a render to complete first",
      };
    }
    const variantDir = path.join(previewsDir, "variants", name);
    try {
      fs.rmSync(variantDir, { recursive: true, force: true }); // replace, per §2
      fs.mkdirSync(variantDir, { recursive: true });
    } catch (err) {
      return { ok: false, reason: `could not prepare ${variantDir}: ${err && err.message ? err.message : err}` };
    }
    const screens = [];
    for (const { screen } of cards) {
      const src = path.join(previewsDir, screen.png);
      if (!fs.existsSync(src)) continue; // honest: only stash what actually rendered
      const dst = path.join(variantDir, screen.png);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      screens.push(screen.id);
    }
    let designSystemStashed = false;
    const dsSrc = path.join(previewsDir, "design-system.json");
    if (fs.existsSync(dsSrc)) {
      fs.copyFileSync(dsSrc, path.join(variantDir, "design-system.json"));
      designSystemStashed = true;
    }
    touch("variant-snapshot");
    return { ok: true, name, screens, designSystemStashed, dir: variantDir };
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

  /** Buffer a request body (JSON POSTs only — bounded so a bad client can't OOM the service). */
  function readBody(req, limitBytes = 1_000_000) {
    return new Promise((resolve, reject) => {
      let data = "";
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > limitBytes) {
          reject(new Error("request body too large"));
          req.destroy();
          return;
        }
        data += chunk;
      });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      if (url.pathname === "/") {
        const [approvals, designSystem, comments] = await Promise.all([
          approvalStatusSnapshot(),
          getDesignSystemData(),
          commentsSnapshot(),
        ]);
        const specs = getSpecsData(projectDir);
        const architecture = getArchitectureData(projectDir);
        const components = getComponentsData(projectDir);
        const variants = getVariantsData(projectDir);
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
            approvals,
            specs,
            designSystem,
            architecture,
            components,
            comments,
            variants,
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
      if (url.pathname === "/api/approve") {
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: `invalid JSON body: ${err.message}` }));
          return;
        }
        const artifact = body && body.artifact;
        if (!artifact || typeof artifact !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `artifact` (string) in the request body" }));
          return;
        }
        const result = await approveArtifactViaLib(projectDir, artifact);
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("approval");
          broadcast({ type: "approval", artifact });
          void checkApprovalWaiters(); // settle any waitForApprovalDecision() faster than the 1s poll
        }
        return;
      }
      if (url.pathname === "/api/reopen") {
        // §2/§3 Reopen for redesign — same request/response shape as /api/approve
        // (POST, {artifact}, {ok,...}|{ok:false,reason}), because it's the same
        // KIND of thing: one governed artifact's status transitioning via the
        // project's own approvals library. Deliberately NOT folded into
        // /api/approve as a mode flag — "approve" and "reopen" are opposite
        // directions of the same door, and conflating them in one endpoint would
        // make a client-side bug (wrong flag) silently do the wrong transition.
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: `invalid JSON body: ${err.message}` }));
          return;
        }
        const artifact = body && body.artifact;
        if (!artifact || typeof artifact !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `artifact` (string) in the request body" }));
          return;
        }
        const result = await reopenArtifactViaLib(projectDir, artifact);
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("reopen");
          // Reuses the "approval" SSE event type on purpose (design doc §3: "SSE
          // `approval` event — existing in-place refresh covers the panel") — the
          // client's approval-swap handler doesn't care WHICH transition fired,
          // only that the Approvals panel needs a re-fetch.
          broadcast({ type: "approval", artifact });
          void checkApprovalWaiters();
        }
        return;
      }
      if (url.pathname === "/api/comment") {
        if (req.method !== "POST") {
          res.writeHead(405, { "content-type": "application/json", allow: "POST" });
          res.end(JSON.stringify({ ok: false, reason: "method not allowed — use POST" }));
          return;
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: `invalid JSON body: ${err.message}` }));
          return;
        }
        const target = body && body.target;
        const text = body && body.text;
        if (!target || typeof target !== "object") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `target` (object) in the request body" }));
          return;
        }
        if (typeof text !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, reason: "missing `text` (string) in the request body" }));
          return;
        }
        // author is ALWAYS "human-console" here — the console is the only caller of
        // this route; an agent adds evidence via tools, never via this endpoint.
        const result = await addCommentViaLib(projectDir, { target, text, author: "human-console" });
        res.writeHead(result.ok ? 200 : 409, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        if (result.ok) {
          touch("comment");
          broadcast({ type: "comment" });
          void checkCommentWaiters(); // settle any waitForNewComment() faster than the 1s poll
        }
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
    } catch (err) {
      // A route handler threw (e.g. a filesystem error mid-request) — never let an
      // async request listener's rejection go unhandled (Node treats that as fatal).
      log(`request handler error (${req.method} ${req.url}): ${err && err.message ? err.message : err}`);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
      } else {
        res.end();
      }
    }
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
      settleApprovalWaiters(); // ditto for pending waitForApprovalDecision() calls
      settleCommentWaiters(); // ditto for pending waitForNewComment() calls
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
    /** Current approval statuses (§4 tab data) — {available:false} with no approvals library. */
    approvalStatusSnapshot,
    /** Blocks until any governed artifact's status changes (or timeoutMs elapses). */
    waitForApprovalDecision,
    /** Current comment ledger (§7.3 tab data) — {available:false} with no comments library. */
    commentsSnapshot,
    /** Blocks until a NEW comment lands (or timeoutMs elapses). */
    waitForNewComment,
    /** The agent's resolve primitive — records author "agent" + the note. */
    resolveComment: resolveCommentById,
    /** §2 candidates strip primitive: stash the current render as a named variant (replaces if present). */
    snapshotVariant,
    /** Test seam: force one render cycle without touching the filesystem watcher. */
    _renderCycle: renderCycle,
    /** Test seam: feed daemon-child output through the compile-failure scanner. */
    _noteDaemonOutput: noteDaemonOutput,
    /** Test seam: simulate a source-change event (swap-pending + watchdog arming). */
    _noteSrcChange: noteSrcChange,
  };
}
