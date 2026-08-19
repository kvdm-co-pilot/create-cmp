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

// --- the human's queue (ONE derivation — the strip, the guided prompt, and ---
// --- approval_status all read this; two derivations was the 07-28 audit's ----
// --- finding 3: the card said "waiting on you" while the queue said nothing --

/**
 * Everything currently waiting on the HUMAN, as actionable items, derived
 * from the live statuses + feature board. Each item names the action in plain
 * words and the tab where its signature control lives (sign-where-you-read).
 *
 * `reopened` is included ONLY when it has become the human's turn: a reopened
 * feature brief whose feature derives provenDone (the redesign is finished
 * and proven — same derivation acceptance trusts). A reopened artifact still
 * mid-redesign stays out: prompting a re-approval there would invite signing
 * an unfinished redesign.
 * @param {{statuses?: object[], features?: object[]}} data
 * @param {string} [excludeArtifact] the artifact just acted on (its own prompt
 *   should not re-list it)
 * @returns {Array<{artifact: string, tab: string, label: string}>}
 */
export function deriveHumanQueue({ statuses = [], features = [] }, excludeArtifact) {
  const tabOf = (id) =>
    id === "intent" || id === "architecture" || id === "design-system" || id === "components"
      ? id
      : id.startsWith("feature-brief:") || id.startsWith("feature-design:")
        ? "features"
        : id === "exemplar-spec" || id.startsWith("feature-spec:")
          ? "specs"
          : "approvals";
  const readyBriefs = new Set(
    features.filter((f) => f.phase === "reopened" && f.provenDone).map((f) => `feature-brief:${f.name}`),
  );
  const items = [];
  for (const s of statuses) {
    if (s.id === excludeArtifact) continue;
    if (s.status === "unreviewed" && s.resolvable !== false) {
      items.push({ artifact: s.id, tab: tabOf(s.id), label: `Approve ${s.id}` });
    } else if (s.status === "changed-since-approval") {
      items.push({ artifact: s.id, tab: tabOf(s.id), label: `Re-approve ${s.id} — it changed since signing` });
    } else if (s.status === "reopened" && readyBriefs.has(s.id)) {
      items.push({ artifact: s.id, tab: tabOf(s.id), label: `Re-approve ${s.id} — the redesign is proven` });
    }
  }
  for (const f of features) {
    if (f.phase === "proven" && `feature-brief:${f.name}` !== excludeArtifact) {
      items.push({ artifact: `feature-brief:${f.name}`, tab: "features", label: `Accept ${f.name} — proven done` });
    }
  }
  return items;
}

// --- the governance strip (rail-resident — visible on EVERY tab) --------------

/**
 * The always-visible aggregate (07-28 audit, fix 5 — the andon-board answer to
 * "I should be able to see the status at all times"): one counts line, the
 * single next human act as a jump button, and the journal's recent history.
 * Renders in the rail, so no tab choice can hide it. Returns "" when there is
 * nothing derivable (no statuses at all — an ungoverned or older project):
 * silence, not a fabricated dashboard.
 * @param {{statuses?: object[], features?: object[], journal?: object[]}} data
 * @param {(ageMs: number) => string} [formatAge]
 */
export function governanceStripHtml({ statuses = [], features = [], journal = [] }, formatAge = formatAgeCoarse) {
  if (statuses.length === 0) return "";
  const queue = deriveHumanQueue({ statuses, features });
  const signed = statuses.filter((s) => s.status === "approved").length;
  const queued = new Set(queue.map((q) => q.artifact));
  const redesigning = statuses.filter((s) => s.status === "reopened" && !queued.has(s.id));
  const drifted = statuses.filter((s) => s.status === "changed-since-approval");

  // A bare "1 in redesign" is a number with no referent — it names no artifact,
  // no owner, and no way to reach it, which is exactly how a reader ends up
  // asking "what does that mean and where do I see it?" (2026-07-28). So each
  // non-zero count names its artifact when there is only one, and every count is
  // a jump button to the Approvals row that explains itself.
  const countBtn = (cls, text, artifact) =>
    `<button type="button" class="gov-n ${cls} gov-jump" data-go-tab="approvals"${
      artifact ? ` data-go-artifact="${esc(artifact)}"` : ""
    } title="take me there">${esc(text)}</button>`;
  const namesOf = (rows, noun) =>
    rows.length === 1 ? `${noun}: ${rows[0].label || rows[0].id}` : `${rows.length} ${noun}`;

  const counts = [
    `<span class="gov-n gov-signed">${signed} signed</span>`,
    queue.length > 0 ? `<span class="gov-n gov-awaiting">${queue.length} await${queue.length === 1 ? "s" : ""} you</span>` : null,
    redesigning.length > 0
      ? countBtn("gov-redesign", namesOf(redesigning, "in redesign"), redesigning.length === 1 ? redesigning[0].id : null)
      : null,
    drifted.length > 0 ? countBtn("gov-drift", namesOf(drifted, "drifted"), drifted.length === 1 ? drifted[0].id : null) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const next =
    queue.length > 0
      ? // data-go-* (NOT data-tab/data-artifact): a strip jump is not a rail tab
        // button, and overloading the rail's attributes would collide with every
        // selector that treats data-tab as "a tab exists here".
        `<button type="button" class="gov-next" data-go-tab="${esc(queue[0].tab)}" data-go-artifact="${esc(queue[0].artifact)}" title="take me there">${esc(queue[0].label)}${queue.length > 1 ? ` <span class="gov-more">(+${queue.length - 1} more)</span>` : ""}</button>`
      : `<p class="gov-clear">Nothing waits on you.</p>`;

  // Newest first, capped — the strip is a glance, the full history is --log.
  const recent = [...journal].slice(-8).reverse();
  const history =
    recent.length === 0
      ? ""
      : `<details class="gov-history"><summary>History</summary>
${recent
  .map((e) => {
    const glyph = e.verb === "approve" ? "●" : e.verb === "reopen" ? "◐" : e.verb === "accept" ? "◆" : "·";
    const age = e.at && formatAge ? formatAge(Date.now() - Date.parse(e.at)) : "";
    const who = e.via ? ` via ${e.via}` : "";
    return `  <p class="gov-event" title="${esc(e.at || "")}${e.reason ? ` — ${esc(e.reason)}` : ""}"><span class="gov-event-glyph">${glyph}</span> ${esc(e.verb)} ${esc(e.artifact || "")}${esc(who)}${age ? ` · ${esc(age)}` : ""}${e.reason ? `<span class="gov-event-reason">${esc(e.reason)}</span>` : ""}</p>`;
  })
  .join("\n")}
</details>`;

  return `<div id="gov-strip">
  <p class="gov-counts">${counts}</p>
  ${next}
${history}
</div>`;
}

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
    // The SIGNED hash is `storedHash` — what the human's signature was bound to.
    // `hash` is the live recompute; the two agree for everything signed on the
    // current basis, but on a `hashBasis: "raw-bytes"` row the live value is a
    // number nobody ever signed, and printing it here would be a fabricated
    // provenance claim in the one surface whose whole job is provenance.
    // (`storedHash` is always set on an approved row; the fallback is belt.)
    const signedHash = shortHash(record.storedHash) || shortHash(record.hash) || "?";
    const basis =
      record.hashBasis === "raw-bytes" ? " · signed pre-strip — bytes unchanged since" : "";
    return `${glyph} signed <code>${esc(signedHash)}</code>${at}${unshaped}${basis}`;
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
 * A verify receipt's state -> its glyph — ONE derivation for everywhere the
 * receipt shows as a symbol (the rail's Evidence item, the rail foot):
 * ✓ fresh PASS · ✗ FAIL · ⚠ stale (never presented as a live PASS) · ○ none.
 * @param {object|null|undefined} receipt receipt-bridge.mjs getLastReceipt() result
 * @returns {{ch: string, cls: string, label: string}}
 */
export function receiptGlyph(receipt) {
  if (!receipt || !receipt.available) {
    return { ch: "○", cls: "glyph-unsigned", label: "no verify receipt yet" };
  }
  if (receipt.stale) {
    return { ch: "⚠", cls: "glyph-drift", label: `verify ${receipt.verdict || "?"} — stale, the tree changed since` };
  }
  const verdict = receipt.verdict || "?";
  if (verdict === "PASS") return { ch: "✓", cls: "glyph-signed", label: "verify PASS" };
  if (verdict === "FAIL") return { ch: "✗", cls: "glyph-drift", label: "verify FAIL" };
  return { ch: "○", cls: "glyph-unsigned", label: `verify ${verdict}` };
}

/**
 * The verify-receipt line at the rail's foot (§2: "Bottom of the rail: last
 * verify receipt verdict + age"). Honest about every degraded state: no
 * receipt, unparseable receipt, stale (inputsHash no longer matches the
 * tree), or freshness-unknown — a stale green is NEVER shown as a live PASS.
 * The glyph itself comes from receiptGlyph, the one shared derivation.
 * @param {object|null|undefined} receipt receipt-bridge.mjs getLastReceipt() result
 */
export function railReceiptHtml(receipt, formatAge = formatAgeCoarse) {
  const g = receiptGlyph(receipt);
  const glyph = `<span class="glyph ${g.cls}">${g.ch}</span>`;
  if (!receipt || !receipt.available) {
    return `${glyph} no verify receipt yet`;
  }
  const verdict = receipt.verdict || "?";
  const age = typeof receipt.ageMs === "number" ? formatAge(receipt.ageMs) : "age unknown";
  if (receipt.stale) {
    return `${glyph} verify ${esc(verdict)} ${esc(age)} &mdash; stale (tree changed since)`;
  }
  const unknown = receipt.stale === null ? " &middot; freshness unverified" : "";
  // The evidence-ladder rung, verbatim from the receipt's own derived
  // evidenceLevel — absent (FAIL / pre-ladder receipt) means no rung shown.
  const rung = receipt.evidenceLevel ? ` &middot; ${esc(receipt.evidenceLevel.rung)} ${esc(receipt.evidenceLevel.name)}` : "";
  return `${glyph} verify ${esc(verdict)}${rung} ${esc(age)}${unknown}`;
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
  // Which build of the CONSOLE drew this page. Provenance already answers
  // "which tree is this derived from"; without this it could not answer "and
  // which code did the deriving" — the question that cost two hours to answer
  // by hand (2026-07-27/28).
  const build = p.build && p.build.id ? ` &middot; console <code>${esc(String(p.build.id).slice(0, 8))}</code>` : "";
  return `${tree}${render}${build} &middot; absence = not derivable`;
}

/**
 * The stale-console banner: this page was drawn by code that is no longer the
 * code on disk. Sits with the other page-top banners because it invalidates
 * everything below it — a reader who trusts a stale page is the exact failure
 * (twice in two days) that this whole handshake exists to prevent.
 *
 * Silent when fresh, and silent when freshness is UNKNOWN (`stale: null`) —
 * an unknown must not be dressed up as either a warning or a clean bill of
 * health; the provenance footer still shows whatever id there is.
 * @param {{id: string|null, mode: string, stale: boolean|null, diskId: string|null}|null|undefined} build
 */
export function staleConsoleBannerHtml(build) {
  if (!build || build.stale !== true) return "";
  const from = build.id ? `<code>${esc(String(build.id).slice(0, 8))}</code>` : "an unknown build";
  const to = build.diskId ? `<code>${esc(String(build.diskId).slice(0, 8))}</code>` : "a newer build";
  const how =
    build.mode === "bundle"
      ? "the bundle was rebuilt after this console started"
      : "the console's sources changed after it started";
  return `<div class="banner banner-stale-build">This console is running ${from}; the code on disk is now ${to} &mdash; ${how}. Everything below was drawn by the older code. Restart the console to pick it up: <code>node inspector/mcp/bin/console.mjs &lt;projectDir&gt;</code></div>`;
}

/** "HH:MM" in server-local time, from an ISO timestamp — null-safe. */
function clockTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toTimeString().slice(0, 5);
  } catch {
    return null;
  }
}

/**
 * The renderer's OWN failure banner (FI-9 Change B) — distinct from `p.error`
 * (which also covers compile/reload messages that already have their own
 * presentation, right above each screen). This fires only when the render
 * PIPELINE itself is dead (the last Gradle/daemon render call threw outright):
 * "the eyes are stale", not "your edit didn't build". Amber (--reopen), the
 * same "stale, not necessarily broken" vocabulary the rail-foot receipt line
 * already uses for a stale-but-not-failed verify receipt — kept visually
 * distinct from the red `.banner` a compile/reload failure shows.
 * @param {{lastOutcome: string, lastSuccessAt: string|null, lastAttemptAt: string|null, consecutiveFailures: number, lastError?: string|null}|null} r
 */
export function rendererDownBannerHtml(r) {
  if (!r || r.lastOutcome !== "failed") return "";
  const since = clockTime(r.lastSuccessAt);
  const headline = since
    ? `Renderer down since ${since} &mdash; screens below are stale.`
    : `Renderer down &mdash; no render has completed yet, so there are no screens to show.`;
  const streak = r.consecutiveFailures > 1 ? ` (${r.consecutiveFailures} renders in a row have failed.)` : "";
  const errTail = r.lastError ? ` Last error: ${esc(r.lastError)}` : "";
  return `<div class="banner banner-renderer">${headline}${streak}${errTail}</div>`;
}

/** "4 minutes" / "2 hours" / "3 days" — how old, in words a reader can act on. */
function ageWords(ms) {
  if (ms === null || ms === undefined) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "moments";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The freshness banner — the console's central honesty guarantee: pixels are NEVER shown
 * without saying whether they are current, and when they are not, what is being done.
 *
 * Deliberately not an error dump. A concurrent build is normal and reads as a calm
 * "refreshing"; only a render that stays stuck earns alarm styling, and even then the
 * message says the screens are still being retried, because they are.
 *
 * @param {{state: string, phase: string, detail: string|null, ageMs: number|null}|null} f
 */
export function freshnessBannerHtml(f) {
  if (!f) return "";
  if (f.state === "never") {
    return `<div class="banner banner-renderer">No render yet &mdash; there are no screens to show until the first one completes.</div>`;
  }
  if (f.state === "fresh") return ""; // current: the pixels speak for themselves
  const age = ageWords(f.ageMs);
  const shown = age ? `Showing the last good render from ${age} ago.` : "Showing the last good render.";
  const because = f.detail ? ` ${esc(f.detail)}.` : "";
  if (f.phase === "rendering") {
    return `<div class="banner banner-stale">Refreshing now &mdash; ${shown.toLowerCase()}</div>`;
  }
  if (f.phase === "waiting-build" || f.phase === "waiting-lane") {
    return `<div class="banner banner-stale">Waiting to refresh:${because} ${shown} This updates itself.</div>`;
  }
  if (f.phase === "stuck") {
    return `<div class="banner banner-renderer">Cannot refresh right now &mdash; still retrying.${because} ${shown}</div>`;
  }
  if (f.phase === "unrefreshed") {
    // Stale with nothing pending: a save did not reach the renderer. Say that plainly
    // rather than promising a refresh that is not coming.
    return `<div class="banner banner-renderer">Out of date and NOT refreshing &mdash; a change has not reached the renderer.${because} ${shown}</div>`;
  }
  return `<div class="banner banner-stale">Out of date &mdash; ${shown} A refresh is queued.</div>`;
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
 * @param {object|null} [p.rendererDown]  renderer health when dead (see rendererDownBannerHtml)
 * @param {object|null} [p.freshness]  derived freshness (see freshnessBannerHtml) — the
 *   provenance of the pixels below; absent only in callers that render no screens
 * @param {string} [p.extraCss]  caller-computed rules (viewport-derived sizes)
 * @param {string} p.bodyScript  the behavior <script> body (unowned by the shell)
 * @param {{treeHash?: string|null, version?: number, build?: object}} [p.provenance]
 * @param {string} [p.govStripHtml]  the governance strip (governanceStripHtml) —
 *   rail-resident so it is visible on EVERY tab; "" renders nothing
 * @param {object|null} [p.build]  the console's own build handshake
 *   (buildStatus) — drives the stale banner; absent renders nothing
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
${p.govStripHtml || ""}
  <nav class="rail-nav">
${p.railItems.map(railItemHtml).join("\n")}
  </nav>
  <div class="rail-foot">${p.railFootHtml}</div>
</aside>
<main>
${staleConsoleBannerHtml(p.build)}
${freshnessBannerHtml(p.freshness)}
${rendererDownBannerHtml(p.rendererDown)}
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
  /* --- the governance strip (07-28 audit fix 5: status visible at ALL times,
         on every tab — counts, the one next human act, recent history) --- */
  #gov-strip { margin: 0 4px; padding: 10px; border: 1px solid var(--line); border-radius: 10px;
               background: var(--surface); display: flex; flex-direction: column; gap: 8px; }
  .gov-counts { margin: 0; font-size: var(--fs-meta); color: var(--ink-2); line-height: 1.6; }
  .gov-n { white-space: nowrap; }
  /* A count that names an artifact wraps — the name is the point, not the digit. */
  .gov-jump { white-space: normal; text-align: left; appearance: none; border: none; background: none;
              padding: 0; margin: 0; font: inherit; cursor: pointer; text-decoration: underline;
              text-decoration-style: dotted; text-underline-offset: 2px; }
  .gov-jump:hover { text-decoration-style: solid; }
  .gov-signed { color: var(--signed); font-weight: 600; }
  .gov-awaiting { color: var(--accent); font-weight: 650; }
  .gov-redesign { color: var(--reopen); font-weight: 600; }
  .gov-drift { color: var(--drift); font-weight: 650; }
  .gov-next { appearance: none; border: none; border-radius: 8px; padding: 6px 9px; cursor: pointer;
              font: inherit; font-size: var(--fs-meta); font-weight: 600; text-align: left;
              background: var(--accent-bg); color: var(--accent); line-height: 1.45; }
  .gov-next:hover { filter: brightness(0.97); }
  .gov-more { font-weight: 400; color: var(--muted); }
  .gov-clear { margin: 0; font-size: var(--fs-meta); color: var(--muted); }
  .gov-history summary { font-size: var(--fs-meta); color: var(--muted); cursor: pointer; }
  .gov-event { margin: 6px 0 0; font-size: var(--fs-meta); color: var(--ink-2); line-height: 1.4;
               overflow-wrap: anywhere; }
  .gov-event-glyph { color: var(--muted); }
  .gov-event-reason { display: block; color: var(--muted); font-style: italic; }
  .rail-nav { display: flex; flex-direction: column; gap: 1px; }
  .tab-btn { appearance: none; display: flex; align-items: center; gap: 9px; width: 100%;
             padding: 7px 10px; border: none; border-radius: 8px; background: none; cursor: pointer;
             font: inherit; font-size: var(--fs-body); color: var(--ink-2); text-align: left; }
  .tab-btn:hover { background: var(--surface); }
  .tab-btn.active { background: var(--accent-bg); color: var(--accent); font-weight: 600; }
  .rail-label { flex: 1; }
  .glyph { flex: none; width: 1.1em; text-align: center; font-size: 11px; line-height: 1; }
  .glyph-signed { color: var(--signed); }
  /* Waiting-on-you states are ACCENT, not grey — the rail-truth rule: grey is
     reserved for "truly nothing pending" (glyph-none); anything that needs the
     human's signature (unsigned ○) or acceptance (attn ●) must read as colour. */
  .glyph-unsigned { color: var(--accent); }
  .glyph-attn { color: var(--accent); }
  .glyph-reopen { color: var(--reopen); }
  .glyph-drift { color: var(--drift); }
  .glyph-none { color: var(--line); }
  .rail-foot { margin-top: auto; padding: 12px 10px 0; border-top: 1px solid var(--line);
               font-size: var(--fs-meta); color: var(--muted); line-height: 1.5; }
  /* The rail foot doubles as the deep link to Evidence — same .tab-btn/data-tab
     wiring as the nav items, styled as the quiet meta line it always was. */
  .rail-foot .tab-btn { padding: 0; border-radius: 6px; font-size: var(--fs-meta);
                        color: var(--muted); gap: 6px; }
  .rail-foot .tab-btn:hover { background: none; color: var(--ink-2); text-decoration: underline; }
  .rail-foot .tab-btn.active { background: none; color: var(--accent); font-weight: 600; }
  .tab-badge { display: inline-block; min-width: 16px; padding: 1px 6px; border-radius: 999px;
               background: var(--drift); color: #fff; font-size: 10px; font-weight: 700; text-align: center; }
  .tab-badge[hidden] { display: none !important; }

  /* --- pages (§2 grammar: head → body → provenance foot) --- */
  main { flex: 1; min-width: 0; }
  .banner { margin: 24px 40px 0; padding: 10px 14px; border-radius: 10px; background: var(--drift-bg);
            color: var(--drift); font-size: var(--fs-body); white-space: pre-wrap; }
  /* Renderer-down (FI-9 Change B): amber/--reopen, not red/--drift — "the eyes
     are stale", the same "stale, not broken" vocabulary the rail-foot receipt
     line uses, kept visually distinct from a compile/reload .banner. */
  .banner-renderer { background: var(--reopen-bg); color: var(--reopen); }
  /* Stale-but-working-on-it: informational, NOT alarm. A concurrent build is normal;
     only a render that stays stuck earns the renderer banner's colour. */
  .banner-stale { background: var(--surface-2, rgba(255,255,255,.05)); color: var(--muted); }
  /* A stale console invalidates the whole page below it, so it reads as DRIFT
     (the reserved red), never as the quiet grey a queued refresh gets. */
  .banner-stale-build { background: var(--drift-bg); color: var(--drift); font-weight: 600; }
  .banner-stale-build code { font-weight: 500; }
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
  .evidence-rung { background: var(--accent-bg); color: var(--accent); }

  /* --- screens (§3.4: the screen × state matrix) --- */
  .screens-toolbar { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  #filter { font: inherit; font-size: var(--fs-body); padding: 5px 12px; width: 240px;
            border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: inherit; }
  .matrix { display: flex; flex-direction: column; }
  .matrix-head { display: flex; gap: 16px; padding-bottom: 8px; }
  .matrix-gutter { flex: 0 0 184px; }
  .matrix-col { flex: none; font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
  .matrix-row { border-top: 1px solid var(--line); padding: 16px 0; }
  .matrix-line { display: flex; gap: 16px; align-items: flex-start; }
  .matrix-rowhead { flex: 0 0 184px; min-width: 0; }
  .matrix-rowhead h3 { margin: 0 0 2px; }
  .matrix-rowhead h3 .flag { font-size: 10px; font-weight: 700; color: var(--accent); vertical-align: middle;
                             margin-left: 6px; letter-spacing: .05em; }
  .matrix-cells { display: flex; gap: 16px; }
  .matrix-cell { flex: none; }
  .matrix-cell img { border: 1px solid var(--line); border-radius: 10px; display: block; }
  .matrix-cell.changed img { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-bg); }
  .matrix-cell .lbl { margin: 4px 0 0; }
  .matrix-none { display: grid; place-items: center; min-height: 96px; border: 1px dashed var(--line);
                 border-radius: 10px; color: var(--muted); opacity: .6; font-size: 15px; }
  .matrix-rowend { flex: 0 0 190px; }
  .matrix-rowend .meta { margin: 0 0 4px; }
  .matrix-note { margin-top: 16px; max-width: 75ch; }
  .row-detail { margin-top: 8px; }
  .row-detail summary { cursor: pointer; font-size: var(--fs-meta); color: var(--ink-2); width: max-content; }
  .row-detail summary:hover { color: var(--accent); }
  .row-detail-body { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; margin-top: 12px; }
  .row-clauses { flex: 1 1 320px; min-width: 0; }
  .meta .fail { color: var(--drift); font-weight: 600; }
  .meta .pass { color: var(--signed); font-weight: 600; }
  .meta .chg { color: var(--accent); font-weight: 600; }
  .cmp img.prev { display: none; }
  .cmp:hover img.prev { display: block; }
  .cmp:hover img.cur { display: none; }
  .wire { border: 1px dashed var(--line); border-radius: 10px; overflow: hidden; flex: none; }
  .wire svg { height: auto; display: block; }

  /* --- intent (§3.0: the product strategist's brief) --- */
  .brief-section { margin-bottom: 28px; }
  .brief-section h3 { margin: 0 0 8px; }
  .brief-unfilled h3 { color: var(--ink-2); }
  .brief-pending { padding: 24px; border: 1px dashed var(--line); border-radius: 12px; max-width: 66ch; }
  .brief-pending p { margin: 0 0 8px; color: var(--ink-2); } .brief-pending p:last-child { margin: 0; }
  .brief-pending-state { font-size: var(--fs-head); font-weight: 650; color: var(--ink) !important; }
  .brief-pending-inline { margin: 0 0 6px; color: var(--muted); font-style: italic; }
  .brief-guidance { margin: 0; font-size: var(--fs-meta); color: var(--muted); max-width: 66ch; }

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
  .reopen-note { font-size: var(--fs-meta); color: var(--reopen); margin: 4px 0 0; overflow-wrap: anywhere; }
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
  .doc-table { width: 100%; border-collapse: collapse; font-size: var(--fs-meta); margin: 4px 0 12px; }
  .doc-table th, .doc-table td { padding: 7px 9px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  .doc-table th { color: var(--muted); font-weight: 600; }
  /* Type ramp: the specimen column is set in the rung's OWN size/weight/tracking,
     so the row heights are deliberately uneven — that unevenness is the ramp. */
  .type-ramp td { vertical-align: middle; }
  .type-ramp .ramp-name { width: 16ch; white-space: nowrap; }
  .type-ramp .ramp-specimen { color: var(--ink); overflow: hidden; }
  .type-ramp .ramp-numbers { width: 34ch; color: var(--muted); text-align: right; white-space: nowrap; }
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

  /* --- system context (§3.2: C4 level 1 as clean CSS boxes) --- */
  .ctx-diagram { display: flex; flex-direction: column; align-items: center; margin: 12px 0 16px; }
  .ctx-app { padding: 10px 22px; border: 1.5px solid var(--ink-2); border-radius: 10px;
             background: var(--surface); font-weight: 650; font-size: var(--fs-body); }
  .ctx-nodes { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 24px; }
  .ctx-node { position: relative; flex: 1 1 150px; max-width: 210px; border: 1px solid var(--line);
              border-radius: 10px; padding: 10px 12px; background: var(--paper); }
  .ctx-node::before { content: ""; position: absolute; top: -24px; left: 50%; width: 1px; height: 24px;
                      background: var(--line); }
  .ctx-node h5 { margin: 0 0 4px; font-size: var(--fs-body); font-weight: 650; }
  .ctx-node p { margin: 0; font-size: var(--fs-meta); color: var(--muted); }

  /* --- specs RTM (§3.5: the QA lead's traceability matrix) --- */
  .rtm-counts { font-size: var(--fs-meta); color: var(--muted); margin: 2px 0 8px; }
  .rtm-table td { vertical-align: top; }
  .rtm-tests { list-style: none; margin: 0; padding: 0; font-family: var(--mono); font-size: 10.5px;
               display: flex; flex-direction: column; gap: 2px; white-space: nowrap; }
  .rtm-gate { font-family: var(--mono); font-size: 10.5px; white-space: nowrap; }
  .rtm-defect { color: var(--drift); font-weight: 600; font-size: var(--fs-meta); white-space: nowrap; }
  .rtm-defect-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .rtm-defect-item { font-size: var(--fs-meta); padding: 6px 10px; border: 1px solid var(--drift);
                     border-radius: 8px; background: var(--drift-bg); display: flex; align-items: center;
                     gap: 8px; flex-wrap: wrap; }

  /* --- evidence (§3.6: the SDET's release-readiness report) --- */
  .evidence-headline { border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin: 4px 0 16px; }
  .evidence-headline.evidence-stale { border-color: var(--drift); }
  .evidence-verdict { font-size: var(--fs-title); font-weight: 700; margin-right: 8px; }
  .verdict-pass { color: var(--signed); }
  .verdict-fail { color: var(--drift); }
  .verdict-muted { color: var(--muted); }
  .evidence-facts { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 10px 0 0;
                    padding: 0; font-size: var(--fs-meta); color: var(--ink-2); }
  .evidence-binding-stale { color: var(--drift); font-weight: 600; }
  .step-table .step-reason { white-space: pre-wrap; font-size: var(--fs-meta); color: var(--ink-2); }
  .step-verdict-pass { color: var(--signed); font-weight: 650; }
  .step-verdict-fail { color: var(--drift); font-weight: 650; }
  .step-verdict-skip { color: var(--muted); font-weight: 650; }
  .evidence-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .evidence-timeline li { display: flex; gap: 10px; align-items: baseline; font-size: var(--fs-body);
                          padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; }

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
  .component-story { margin-bottom: 10px; }
  .component-story .chg { color: var(--accent); font-weight: 600; }
  .component-story img { width: 180px; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; display: block; }
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

  /* --- features (the post-genesis delivery board) --- */
  .feature-board { display: flex; flex-direction: column; gap: 14px; }
  .feature-card { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; background: var(--surface); }
  .feature-card-closed { opacity: 0.65; }
  .feature-card-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .feature-card-head h3 { margin: 0; }
  .feature-phase { font-size: var(--fs-meta); font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
  .phase-proposed { color: var(--muted); }
  .phase-approved { color: var(--accent); border-color: var(--accent); }
  .phase-proven { color: var(--reopen); border-color: var(--reopen); }
  .feature-done-yes { color: var(--ok, #3a8f5a); font-size: var(--fs-meta); font-weight: 600; }
  .feature-done { margin: 4px 0; font-size: var(--fs-meta); }
  .feature-next { margin: 6px 0 2px; font-size: var(--fs-meta); font-weight: 600; color: var(--accent); }
  .feature-decisions { border-left: 3px solid var(--accent); padding: 2px 0 2px 12px; margin: 8px 0; }
  .feature-decisions h4 { margin: 0 0 4px; font-size: var(--fs-meta); }
  .feature-brief-full { margin: 8px 0 2px; font-size: var(--fs-meta); }
  .feature-brief-full h4 { margin: 10px 0 4px; }
  .feature-brief-full .doc-prose, .feature-decisions .doc-prose { font-size: var(--fs-meta); }
  .phase-accepted { color: var(--ok, #3a8f5a); border-color: currentColor; }
  .phase-drift, .phase-reopened { color: var(--drift); border-color: var(--drift); }
  .feature-tally { color: var(--muted); font-size: var(--fs-meta); }
  .feature-doc-link { margin-left: auto; color: var(--muted); font-size: var(--fs-meta); text-decoration: none; }
  .feature-touches { font-size: var(--fs-meta); margin: 6px 0; }
  .feature-as-declared { color: var(--muted); font-style: italic; }
  /* Check details are file paths and regexes — long, unbreakable-looking
     strings. Without an explicit wrap they blow the table past the card and
     the right-hand end (the part that says WHY a check is unmet) is clipped
     off-screen, which is the one thing the row exists to tell you. */
  .feature-checks { margin-top: 6px; table-layout: auto; width: 100%; }
  .feature-checks td, .feature-checks th { vertical-align: top; }
  .feature-check-detail { color: var(--muted); overflow-wrap: anywhere; word-break: break-word; }
  .pending-inline { color: var(--muted); }
  .feature-actions { margin-top: 10px; display: flex; gap: 8px; align-items: center; }
  .feature-actions button { font: inherit; font-size: var(--fs-meta); padding: 4px 12px; border-radius: 6px;
    border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); cursor: pointer; }
  /* The guided-flow prompt: every decision ends with "do you want to …?" */
  .next-prompt { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
                 max-width: min(720px, calc(100vw - 48px)); z-index: 60;
                 display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
                 border: 1px solid var(--accent); border-radius: 12px; padding: 12px 16px;
                 background: var(--accent-bg); color: var(--ink); font-size: var(--fs-meta);
                 box-shadow: 0 6px 24px rgba(0,0,0,.18); }
  .next-prompt-did { font-weight: 650; }
  .next-prompt button { font: inherit; font-size: var(--fs-meta); padding: 4px 12px; border-radius: 6px; cursor: pointer; }
  .next-prompt-primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .next-prompt-dismiss { border: 1px solid var(--line); background: var(--paper); color: var(--muted); }

  /* Sign where you read: every governed section's own signature control. */
  .signature-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
                   border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px;
                   margin: 0 0 14px; background: var(--surface); font-size: var(--fs-meta); }
  .signature-line { color: var(--muted); }
  .signature-id { color: var(--muted); }
  .signature-actions { margin-left: auto; display: flex; gap: 8px; }
  .signature-actions button { font: inherit; font-size: var(--fs-meta); padding: 4px 12px; border-radius: 6px;
                              border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; }
  .signature-actions button:hover { border-color: var(--accent); color: var(--accent); }
  .spec-file .signature-bar { margin-top: 6px; }

  /* The change surface: what changed vs. what is still exactly as signed —
     rendered at the top of the drifted artifact's own section AND inside the
     Approvals table (driftPanelHtml — one renderer, everywhere). */
  .drift-panel { border: 1px solid var(--drift); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;
                 background: var(--drift-bg); font-size: var(--fs-meta); }
  .drift-panel .drift-head { margin: 0 0 6px; }
  .drift-summary { margin: 6px 0 4px; }
  .drift-files { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .drift-files code, .drift-still-signed code { overflow-wrap: anywhere; }
  .drift-still-signed { margin: 4px 0; }
  .drift-still-signed ul { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .drift-diff { margin: 6px 0 0; }
  .approvals-table .drift-panel { margin-bottom: 0; }
  .feature-undeclared { border: 1px solid var(--drift); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px;
    font-size: var(--fs-meta); }
`;
