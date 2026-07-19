// console-shell.mjs — the ONE frame every console section renders inside
// (docs/STUDIO-REDESIGN.md §2). The shell is the whole design system: the
// sidebar ordering/coverage rail, the per-page header grammar, the type ramp,
// the spacing scale, the color roles, and the provenance footer. Sections
// contribute ONLY a document body — they may not invent their own chrome.
//
// Design rules encoded here (§2, non-negotiable for every section):
// - Ink/paper neutrals with ONE accent. Semantic red/amber/green are RESERVED
//   for drift/reopened/signed (and gate FAIL/PASS, the same three meanings) —
//   never decoration.
// - A 4-step type ramp and an 8px spacing scale. Readable measure for prose;
//   full-bleed only for galleries.
// - The rail lists sections in the genesis definition order, each with its
//   live state glyph (● signed · ○ unsigned · ◐ reopened · ⚠ drifted). The
//   dashboard function is ambient — never a separate tab.
// - Every page: header block (title · status line) → document body →
//   provenance footer ("derived from the live tree … absence = not derivable").
// - Light + dark via prefers-color-scheme. Pure server-rendered HTML/CSS,
//   zero external dependencies.

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- state glyphs -------------------------------------------------------------

/**
 * A governed artifact's live status -> its rail/header glyph. The four §2
 * states, plus the express-lane nuance: approved-with-defaults is still
 * SIGNED (●) — the "unshaped" caveat belongs in the status line's words, not
 * in a fifth glyph nobody can read. `null`/unknown statuses get NO glyph
 * (evidence-or-silence: an older project lib that never reports a status is
 * not "unsigned", it's unknown).
 * @param {object|null|undefined} record an approvals status record ({status, mode, ...})
 * @returns {{ch: string, cls: string, label: string}|null}
 */
export function statusGlyph(record) {
  if (!record || !record.status) return null;
  switch (record.status) {
    case "approved":
      return { ch: "●", cls: "glyph-signed", label: record.mode === "defaults-accepted" ? "signed (defaults accepted — unshaped)" : "signed" };
    case "changed-since-approval":
      return { ch: "⚠", cls: "glyph-drift", label: "drifted — changed since approval" };
    case "reopened":
      return { ch: "◐", cls: "glyph-reopen", label: "reopened for redesign" };
    case "unreviewed":
      return { ch: "○", cls: "glyph-unsigned", label: "unsigned" };
    default:
      return null;
  }
}

const shortHash = (h) => (h ? String(h).slice(0, 8) : null);

/**
 * The header status line for a section governed by ONE artifact — the §2
 * grammar: "● signed a1b2c3 · approved <when>" / "○ unsigned" / "⚠ drifted
 * (a1b2c3 → d4e5f6)" / "◐ reopened for redesign". Returns "" when there is
 * no record (approvals unavailable / older scaffold): silence, not a
 * fabricated state.
 * @param {object|null|undefined} record an approvals status record
 */
export function artifactStatusHtml(record) {
  const g = statusGlyph(record);
  if (!g) return "";
  const glyph = `<span class="glyph ${g.cls}">${g.ch}</span>`;
  if (record.status === "approved") {
    const unshaped = record.mode === "defaults-accepted" ? " · defaults accepted — unshaped" : "";
    const at = record.approvedAt ? ` · approved ${esc(record.approvedAt)}` : "";
    return `${glyph} signed <code>${esc(shortHash(record.hash) || "?")}</code>${at}${unshaped}`;
  }
  if (record.status === "changed-since-approval") {
    const from = shortHash(record.storedHash);
    const to = shortHash(record.hash);
    const move = from && to ? ` (<code>${esc(from)}</code> &rarr; <code>${esc(to)}</code>)` : "";
    return `${glyph} <span class="status-drift">drifted — changed since approval${move}</span>`;
  }
  if (record.status === "reopened") {
    return `${glyph} <span class="status-reopen">reopened for redesign</span>`;
  }
  return `${glyph} unsigned — not yet approved`;
}

// --- the rail -----------------------------------------------------------------

/** Coarse "2h ago" age, from a bridge-computed ageMs (pure — no clock read here). */
export function formatAgeCoarse(ageMs) {
  if (typeof ageMs !== "number" || Number.isNaN(ageMs)) return "age unknown";
  if (ageMs < 60_000) return "just now";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The verify-receipt line at the rail's foot (§2: "Bottom of the rail: last
 * verify receipt verdict + age"). Honest about every degraded state: no
 * receipt, unparseable receipt, stale (inputsHash no longer matches the
 * tree), or freshness-unknown — a stale green is NEVER shown as a live PASS.
 * @param {object|null|undefined} receipt receipt-bridge.mjs getLastReceipt() result
 */
export function railReceiptHtml(receipt, formatAge = formatAgeCoarse) {
  if (!receipt || !receipt.available) {
    return `<span class="glyph glyph-unsigned">○</span> no verify receipt yet`;
  }
  const verdict = receipt.verdict || "?";
  const age = typeof receipt.ageMs === "number" ? formatAge(receipt.ageMs) : "age unknown";
  if (receipt.stale) {
    return `<span class="glyph glyph-drift">⚠</span> verify ${esc(verdict)} ${esc(age)} &mdash; stale (tree changed since)`;
  }
  const cls = verdict === "PASS" ? "glyph-signed" : verdict === "FAIL" ? "glyph-drift" : "glyph-unsigned";
  const ch = verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : "○";
  const unknown = receipt.stale === null ? " &middot; freshness unverified" : "";
  return `<span class="glyph ${cls}">${ch}</span> verify ${esc(verdict)} ${esc(age)}${unknown}`;
}

/**
 * One rail nav item. Keeps the `.tab-btn`/`data-tab` contract the behavior
 * script and the browser gates already speak — the rail is a restyled
 * navigation, not a new mechanism.
 * @param {{id: string, label: string, glyph: object|null, active?: boolean, badgeHtml?: string}} item
 */
function railItemHtml(item) {
  const g = item.glyph;
  const glyph = g
    ? `<span class="glyph ${g.cls}" title="${esc(g.label)}">${g.ch}</span>`
    : `<span class="glyph glyph-none">&middot;</span>`;
  return `<button class="tab-btn${item.active ? " active" : ""}" data-tab="${esc(item.id)}">${glyph}<span class="rail-label">${esc(item.label)}</span>${item.badgeHtml || ""}</button>`;
}

// --- the page frame -----------------------------------------------------------

/**
 * One section, wrapped in the §2 page grammar: header block (title + status
 * line) → the document body → the provenance footer. The `#tab-<id>` /
 * `.tab-panel` contract is unchanged (SSE in-place swaps target these ids).
 * @param {{id: string, title: string, statusHtml?: string, bodyHtml: string, active?: boolean, fullBleed?: boolean, headExtraHtml?: string}} s
 * @param {string} provenanceHtml the shared footer line (same for every page)
 */
function sectionHtml(s, provenanceHtml) {
  const status = s.statusHtml ? `<p class="page-status">${s.statusHtml}</p>` : "";
  return `<section id="tab-${esc(s.id)}" class="tab-panel${s.active ? " active" : ""}${s.fullBleed ? " full-bleed" : ""}" data-tab="${esc(s.id)}">
<header class="page-head">
  <h2>${esc(s.title)}</h2>
  ${status}${s.headExtraHtml || ""}
</header>
<div class="page-body">
${s.bodyHtml}
</div>
<footer class="page-foot">${provenanceHtml}</footer>
</section>`;
}

/**
 * The provenance footer (§2): what this page was derived FROM, and the
 * standing epistemic rule. `treeHash` is the project's git HEAD when the
 * caller could resolve one — omitted (not faked) otherwise.
 * @param {{treeHash?: string|null, version?: number}} p
 */
export function provenanceHtml(p = {}) {
  const tree = p.treeHash ? `derived from tree <code>@${esc(p.treeHash)}</code>` : "derived from the live tree";
  const render = typeof p.version === "number" && p.version > 0 ? ` &middot; render #${p.version}` : "";
  return `${tree}${render} &middot; absence = not derivable`;
}

/**
 * The full page. Everything visible is composed here; the caller supplies
 * only data (rail items, section bodies) and behavior (`bodyScript`).
 * @param {object} p
 * @param {string} p.appName
 * @param {Array} p.railItems  railItemHtml inputs, in genesis order
 * @param {string} p.railFootHtml  the verify-receipt line
 * @param {Array} p.sections  sectionHtml inputs
 * @param {string|null} [p.error]  last render failure (banner above the pages)
 * @param {string} [p.extraCss]  caller-computed rules (viewport-derived sizes)
 * @param {string} p.bodyScript  the behavior <script> body (unowned by the shell)
 * @param {{treeHash?: string|null, version?: number}} [p.provenance]
 */
export function renderShellPage(p) {
  const prov = provenanceHtml(p.provenance || {});
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.appName)} &middot; studio</title>
<style>
${SHELL_CSS}
${p.extraCss || ""}
</style>
<aside id="rail">
  <div class="rail-head">
    <p class="rail-app">${esc(p.appName)}</p>
    <p class="rail-sub">studio console</p>
    <span id="pill">live</span>
  </div>
  <nav class="rail-nav">
${p.railItems.map(railItemHtml).join("\n")}
  </nav>
  <div class="rail-foot">${p.railFootHtml}</div>
</aside>
<main>
${p.error ? `<div class="banner">last render FAILED &mdash; showing previous state\n${esc(p.error)}</div>` : ""}
${p.sections.map((s) => sectionHtml(s, prov)).join("\n")}
</main>
<script>
${p.bodyScript}
</script>
`;
}

// --- the design system (one stylesheet, all sections) -------------------------
//
// Color roles: --paper/--surface/--ink/--ink-2/--muted/--line are the
// neutrals; --accent is the ONE accent (navigation, actions, attention that
// is not a verdict); --signed/--drift/--reopen (+ -bg) are the reserved
// semantic trio. Type ramp: --fs-title 18 / --fs-head 14 / --fs-body 13 /
// --fs-meta 11.5 (+ the uppercase .lbl micro-label). Spacing: 8px steps used
// literally (8/16/24/32/40). Prose sits in a readable measure via
// .page-body's max-width; .full-bleed pages (the screens gallery) opt out.

export const SHELL_CSS = `
  :root {
    --paper: #FFFFFF; --surface: #F5F6F8; --ink: #1D2126; --ink-2: #4A5361;
    --muted: #8A919C; --line: #E4E7EB;
    --accent: #3557C0; --accent-ink: #FFFFFF; --accent-bg: #EDF1FB;
    --signed: #1E7A44; --signed-bg: #E8F4ED;
    --drift: #C03A2E; --drift-bg: #FBEDEB;
    --reopen: #96690A; --reopen-bg: #FAF2DF;
    --fs-title: 18px; --fs-head: 14px; --fs-body: 13px; --fs-meta: 11.5px;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #17191D; --surface: #1F2329; --ink: #E8EAEE; --ink-2: #B6BDC8;
      --muted: #7E8794; --line: #2B3038;
      --accent: #8AA3F0; --accent-ink: #10131A; --accent-bg: #232D45;
      --signed: #5CB985; --signed-bg: #1B2E23;
      --drift: #E4766A; --drift-bg: #392019;
      --reopen: #D9A845; --reopen-bg: #33290F;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; display: flex; min-height: 100vh; background: var(--paper); color: var(--ink);
         font-family: -apple-system, system-ui, "Segoe UI", sans-serif; font-size: var(--fs-body); line-height: 1.55; }
  code { font-family: var(--mono); font-size: 0.92em; }

  /* --- the rail (§2: ordering + coverage, ambient and permanent) --- */
  #rail { width: 216px; flex: none; position: sticky; top: 0; height: 100vh; overflow-y: auto;
          display: flex; flex-direction: column; gap: 24px; padding: 24px 12px 16px;
          border-right: 1px solid var(--line); background: var(--paper); }
  .rail-head { padding: 0 10px; }
  .rail-app { margin: 0; font-size: var(--fs-head); font-weight: 650; letter-spacing: .01em; }
  .rail-sub { margin: 2px 0 8px; font-size: var(--fs-meta); color: var(--muted); }
  #pill { font-size: 10.5px; font-weight: 650; border-radius: 999px; padding: 2px 9px;
          background: var(--signed-bg); color: var(--signed); }
  #pill.rendering { background: var(--reopen-bg); color: var(--reopen); }
  #pill.error { background: var(--drift-bg); color: var(--drift); }
  .rail-nav { display: flex; flex-direction: column; gap: 1px; }
  .tab-btn { appearance: none; display: flex; align-items: center; gap: 9px; width: 100%;
             padding: 7px 10px; border: none; border-radius: 8px; background: none; cursor: pointer;
             font: inherit; font-size: var(--fs-body); color: var(--ink-2); text-align: left; }
  .tab-btn:hover { background: var(--surface); }
  .tab-btn.active { background: var(--accent-bg); color: var(--accent); font-weight: 600; }
  .rail-label { flex: 1; }
  .glyph { flex: none; width: 1.1em; text-align: center; font-size: 11px; line-height: 1; }
  .glyph-signed { color: var(--signed); }
  .glyph-unsigned { color: var(--muted); }
  .glyph-reopen { color: var(--reopen); }
  .glyph-drift { color: var(--drift); }
  .glyph-none { color: var(--line); }
  .rail-foot { margin-top: auto; padding: 12px 10px 0; border-top: 1px solid var(--line);
               font-size: var(--fs-meta); color: var(--muted); line-height: 1.5; }
  .tab-badge { display: inline-block; min-width: 16px; padding: 1px 6px; border-radius: 999px;
               background: var(--drift); color: #fff; font-size: 10px; font-weight: 700; text-align: center; }
  .tab-badge[hidden] { display: none !important; }

  /* --- pages (§2 grammar: head → body → provenance foot) --- */
  main { flex: 1; min-width: 0; }
  .banner { margin: 24px 40px 0; padding: 10px 14px; border-radius: 10px; background: var(--drift-bg);
            color: var(--drift); font-size: var(--fs-body); white-space: pre-wrap; }
  .tab-panel { display: none; padding: 32px 40px 48px; }
  .tab-panel.active { display: block; }
  .page-head { margin: 0 0 24px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
  .page-head h2 { margin: 0; font-size: var(--fs-title); font-weight: 650; letter-spacing: .01em; }
  .page-status { margin: 6px 0 0; font-size: var(--fs-meta); color: var(--muted);
                 display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .page-status .glyph { font-size: 10px; }
  .status-drift { color: var(--drift); font-weight: 600; }
  .status-reopen { color: var(--reopen); font-weight: 600; }
  .page-body { max-width: 860px; }
  .full-bleed .page-body { max-width: none; }
  .page-foot { margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--line);
               font-size: var(--fs-meta); color: var(--muted); }

  /* --- shared document vocabulary (labels, tables, chips, empty states) --- */
  h3 { font-size: var(--fs-head); font-weight: 650; margin: 24px 0 8px; }
  .page-body > h3:first-child { margin-top: 0; }
  .lbl { font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); margin: 0 0 4px; }
  .meta { color: var(--muted); font-size: var(--fs-meta); margin: 0 0 8px; }
  .empty { padding: 16px; border: 1px dashed var(--line); border-radius: 10px; color: var(--ink-2);
           font-size: var(--fs-body); max-width: 66ch; }
  .empty p { margin: 0 0 6px; } .empty p:last-child { margin: 0; }
  .empty-inline { color: var(--muted); font-size: var(--fs-meta); }
  .badge { font-size: 10.5px; font-weight: 650; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
  .badge-approved { background: var(--signed-bg); color: var(--signed); }
  .badge-unreviewed { background: var(--surface); color: var(--ink-2); }
  .badge-changed { background: var(--drift-bg); color: var(--drift); }
  .badge-reopened { background: var(--reopen-bg); color: var(--reopen); }
  .badge-unshaped { box-shadow: inset 0 0 0 1px var(--reopen); }
  .badge-open { background: var(--accent-bg); color: var(--accent); }
  .badge-resolved { background: var(--signed-bg); color: var(--signed); }

  /* --- screens gallery --- */
  .screens-toolbar { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  #filter { font: inherit; font-size: var(--fs-body); padding: 5px 12px; width: 240px;
            border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: inherit; }
  .grid { display: flex; flex-wrap: wrap; gap: 24px; }
  .card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 16px; }
  .card.changed { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-bg); }
  .card h2 { margin: 0 0 2px; font-size: var(--fs-head); font-weight: 650; }
  .card h2 .flag { font-size: 10px; font-weight: 700; color: var(--accent); vertical-align: middle;
                   margin-left: 6px; letter-spacing: .05em; }
  .meta .fail { color: var(--drift); font-weight: 600; }
  .meta .pass { color: var(--signed); font-weight: 600; }
  .meta .chg { color: var(--accent); font-weight: 600; }
  .panes { display: flex; gap: 12px; align-items: flex-start; }
  .panes img { border: 1px solid var(--line); border-radius: 10px; display: block; }
  .cmp img.prev { display: none; }
  .cmp:hover img.prev { display: block; }
  .cmp:hover img.cur { display: none; }
  .wire { border: 1px dashed var(--line); border-radius: 10px; overflow: hidden; }
  .wire svg { height: auto; display: block; }

  /* --- design language (§3.1: the designer's handoff spec) --- */
  .tok-table, .approvals-table, .comments-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body); margin-top: 8px; }
  .tok-table td, .tok-table th, .approvals-table td, .approvals-table th, .comments-table td, .comments-table th {
    padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  .tok-table th, .approvals-table th, .comments-table th { color: var(--muted); font-weight: 600; font-size: var(--fs-meta); }
  .tok-table td { vertical-align: middle; }
  .tok-swatch-cell { width: 44px; }
  .tok-swatch { display: block; width: 32px; height: 24px; border-radius: 6px; border: 1px solid var(--line); }
  .tok-usage { font-size: var(--fs-meta); color: var(--ink-2); white-space: nowrap; }
  .contrast-sample { display: inline-grid; place-items: center; width: 44px; height: 26px; border-radius: 6px;
                     border: 1px solid var(--line); font-size: 12px; font-weight: 650; margin-right: 10px;
                     vertical-align: middle; }
  .contrast-ratio { font-family: var(--mono); font-size: var(--fs-meta); white-space: nowrap; }
  .wcag-pass { color: var(--signed); font-weight: 600; font-size: var(--fs-meta); }
  .wcag-fail { color: var(--drift); font-weight: 600; font-size: var(--fs-meta); }
  .scale-list { margin-top: 8px; }
  .scale-row { display: flex; align-items: center; gap: 14px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .scale-name { flex: 0 0 176px; font-size: var(--fs-meta); }
  .scale-bar { height: 12px; border-radius: 3px; background: var(--accent); flex: none; max-width: 55%; }
  .scale-value { font-size: var(--fs-meta); font-family: var(--mono); color: var(--muted); }
  .candidates-strip { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
  .candidate-card { flex: 1 1 260px; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--paper); }
  .candidate-card h4 { margin: 0 0 8px; font-size: var(--fs-body); }
  .candidate-shots { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
  .candidate-shot { width: 90px; }
  .candidate-shot img { width: 100%; border: 1px solid var(--line); border-radius: 8px; display: block; }

  /* --- buttons (actions use the accent; destructive-direction uses amber) --- */
  .approve-btn, .pick-btn { font: inherit; font-size: var(--fs-meta); font-weight: 600; padding: 6px 12px;
    border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); cursor: pointer; }
  .approve-btn:disabled, .pick-btn:disabled { background: var(--surface); border-color: var(--line); color: var(--muted); cursor: not-allowed; }
  .reopen-btn { font: inherit; font-size: var(--fs-meta); font-weight: 600; padding: 6px 12px; border-radius: 8px;
                border: 1px solid var(--reopen); background: var(--paper); color: var(--reopen); cursor: pointer; }

  /* --- approvals detail --- */
  .artifact-id, .approved-at { font-size: var(--fs-meta); color: var(--muted); }
  .approved-at { margin-top: 2px; }
  .unresolvable-note, .missing-note { font-size: var(--fs-meta); color: var(--reopen); margin: 4px 0 0; }
  .order-num { color: var(--muted); }
  .artifact-banner { font-size: var(--fs-meta); margin-top: 4px; padding: 4px 8px; border-radius: 8px; max-width: 340px; }
  .banner-mode { font-weight: 700; text-transform: uppercase; letter-spacing: .04em; margin-right: 4px; font-size: 9.5px; }
  .banner-genesis { background: var(--accent-bg); color: var(--accent); }
  .banner-steward { background: var(--surface); color: var(--ink-2); }
  .banner-unshaped { background: var(--reopen-bg); color: var(--reopen); }

  /* --- specs / clauses --- */
  .spec-file h3 { margin: 24px 0 8px; }
  .spec-file:first-child h3 { margin-top: 0; }
  .clause-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .clause { display: flex; align-items: baseline; gap: 10px; font-size: var(--fs-body); padding: 8px 10px;
            border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
  .clause.withdrawn { opacity: .55; }
  .clause-id { font-size: var(--fs-meta); color: var(--accent); font-weight: 700; flex: 0 0 auto; }
  .clause-prose { flex: 1; }
  .cov-badge, .receipt-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; flex: 0 0 auto; white-space: nowrap; }
  .cov-yes, .receipt-pass { background: var(--signed-bg); color: var(--signed); }
  .cov-no, .receipt-fail { background: var(--drift-bg); color: var(--drift); }
  .cov-na, .receipt-none { background: var(--surface); color: var(--muted); }
  .receipt-stale { background: var(--reopen-bg); color: var(--reopen); }
  .receipt-age { font-size: 10px; color: var(--muted); white-space: nowrap; }

  /* --- architecture document --- */
  .arch-section { margin-bottom: 32px; }
  .arch-section h3 { margin: 0 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
  .arch-section h4 { margin: 16px 0 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  .arch-top-status { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; flex-wrap: wrap; }
  .doc-table { width: 100%; border-collapse: collapse; font-size: var(--fs-meta); margin: 4px 0 12px; }
  .doc-table th, .doc-table td { padding: 7px 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  .doc-table th { color: var(--muted); font-weight: 600; }
  .doc-prose { font-size: var(--fs-body); max-width: 75ch; }
  .doc-prose p { margin: 0 0 10px; }
  .doc-prose h4, .doc-prose h5 { margin: 14px 0 6px; font-size: var(--fs-meta); color: var(--ink); }
  .doc-list { margin: 0 0 10px; padding-left: 20px; }
  .doc-list li { margin-bottom: 4px; }
  .doc-code, .component-sig { font-family: var(--mono); font-size: var(--fs-meta); line-height: 1.55; background: var(--surface);
    border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; overflow-x: auto; white-space: pre; }
  .doc-quote { margin: 0 0 10px; padding: 6px 10px; border-left: 3px solid var(--line); color: var(--ink-2); }
  .dep-edges { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .dep-edge { display: flex; align-items: center; gap: 8px; font-size: var(--fs-body); padding: 6px 10px;
              border: 1px solid var(--line); border-radius: 8px; background: var(--paper); }
  .dep-edge.dep-violation { border-color: var(--drift); background: var(--drift-bg); }
  .dep-count { font-size: var(--fs-meta); color: var(--muted); }
  .dep-violations { margin-top: 6px; }
  .dep-violation-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .dep-violation-item { font-size: var(--fs-meta); padding: 6px 10px; border: 1px solid var(--drift); border-radius: 8px;
                        background: var(--drift-bg); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .dep-advisory { font-size: var(--fs-meta); color: var(--muted); margin: 8px 0 0; max-width: 75ch; }
  .layer-map { display: flex; flex-wrap: wrap; gap: 14px; }
  .layer-box { flex: 1 1 220px; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--paper); }
  .layer-box.layer-empty { opacity: .55; border-style: dashed; }
  .layer-box h4 { margin: 0 0 4px; font-size: var(--fs-body); font-weight: 650; text-transform: none; letter-spacing: 0;
                  color: var(--ink); display: flex; align-items: center; gap: 6px; }
  .layer-desc { font-size: var(--fs-meta); color: var(--muted); margin: 0 0 8px; }
  .layer-files, .feature-tree, .component-used-in { list-style: none; margin: 0; padding: 0;
    font-size: var(--fs-meta); font-family: var(--mono); display: flex; flex-direction: column; gap: 3px;
    max-height: 220px; overflow-y: auto; }
  .layer-files li, .feature-tree li { display: flex; align-items: center; gap: 6px; }
  .layer-others { margin-top: 14px; }

  /* --- components (§3.3: the platform engineer's library reference) --- */
  .component-list { display: flex; flex-direction: column; }
  .component-entry { padding: 24px 0 28px; border-bottom: 1px solid var(--line); }
  .component-entry:first-child { padding-top: 4px; }
  .component-entry:last-child { border-bottom: none; }
  .component-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 0 0 2px; }
  .component-head h3 { margin: 0; }
  .component-file { margin: 2px 0 12px; }
  .params-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body); margin: 4px 0 12px; }
  .params-table th, .params-table td { padding: 7px 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  .params-table th { color: var(--muted); font-weight: 600; font-size: var(--fs-meta); }
  .param-required { color: var(--muted); font-size: var(--fs-meta); }
  .param-note { font-size: var(--fs-meta); color: var(--ink-2); }
  .component-facts { list-style: none; margin: 0 0 10px; padding: 0; font-size: var(--fs-meta); display: flex; flex-direction: column; gap: 4px; }
  .component-facts li { padding-left: 14px; position: relative; }
  .component-facts li::before { content: "\\2022"; position: absolute; left: 0; color: var(--muted); }
  .component-kdoc { margin: 4px 0 10px; padding: 8px 10px; border-left: 3px solid var(--line); font-size: var(--fs-meta);
                    color: var(--ink-2); white-space: pre-wrap; }
  .component-live-variants { margin-bottom: 10px; }
  .state-variant-block { margin-bottom: 8px; }
  .state-variant-thumbs { display: flex; flex-wrap: wrap; gap: 8px; }
  .state-variant-thumb { width: 90px; }
  .state-variant-thumb img { width: 100%; border: 1px solid var(--line); border-radius: 6px; display: block; }
  .violation-chip { margin-left: 4px; }

  /* --- comments (ledger table + the margin-quiet affordance) --- */
  .comment-text-cell { max-width: 320px; white-space: pre-wrap; }
  .comment-resolution { margin-top: 4px; }
  .comment-resolution-note { font-size: var(--fs-meta); color: var(--ink-2); margin: 2px 0 0; }
  /* §2: comments are a QUIET affordance revealed on hover — no floating emoji
     over content. The control's emoji glyph is suppressed (font-size: 0) and
     replaced with a small outlined "+"; it stays invisible until its host
     element is hovered (or the button itself is keyboard-focused). */
  .comment-ctl { position: relative; display: inline-block; margin-left: 4px; vertical-align: middle; }
  .comment-btn { appearance: none; border: 1px solid var(--line); background: var(--paper); cursor: pointer;
                 font-size: 0; width: 16px; height: 16px; line-height: 1; border-radius: 50%; padding: 0;
                 opacity: 0; transition: opacity .12s; position: relative; }
  .comment-btn::before { content: "+"; font-size: 11px; color: var(--muted);
                         position: absolute; inset: 0; display: grid; place-items: center; }
  *:hover > .comment-ctl .comment-btn, .comment-ctl:hover .comment-btn,
  .comment-btn:focus-visible { opacity: 1; }
  .comment-btn:hover::before { color: var(--accent); }
  .comment-btn:hover { border-color: var(--accent); }
  .comment-popover { position: absolute; z-index: 20; top: 100%; left: 0; margin-top: 4px; width: 230px;
                     background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 10px;
                     box-shadow: 0 4px 16px rgba(0,0,0,.14); display: flex; flex-direction: column; gap: 6px; }
  /* The popover and badge are toggled with the hidden ATTRIBUTE, but their author
     display rules (flex / inline-block) override the UA stylesheet's [hidden]
     { display: none } — without these guards every "hidden" popover stays painted,
     and its children (the textarea especially) overflow the 0x0 box and invisibly
     intercept clicks (elementFromPoint-verified in the VL-7 browser gate). */
  .comment-popover[hidden] { display: none !important; }
  .comment-popover textarea, .comment-popover input { font: inherit; font-size: var(--fs-meta); padding: 6px 8px;
    border: 1px solid var(--line); border-radius: 8px; resize: vertical; width: 100%; box-sizing: border-box;
    background: var(--paper); color: inherit; }
  .comment-popover-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .comment-popover-actions button { font: inherit; font-size: var(--fs-meta); padding: 4px 10px; border-radius: 6px;
    border: 1px solid var(--line); background: var(--surface); color: inherit; cursor: pointer; }
  .comment-submit { border-color: var(--accent) !important; background: var(--accent) !important; color: var(--accent-ink); }
  .comment-error { color: var(--drift); font-size: var(--fs-meta); margin: 0; }
`;
