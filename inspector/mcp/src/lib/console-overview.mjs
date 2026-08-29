// console-overview.mjs — the front door (STUDIO-REDESIGN.md §3.7).
//
// WHY THIS SECTION EXISTS, and what it supersedes. §2 of the redesign made the
// dashboard function "ambient — never a separate tab": every fact renders in
// the section that owns it, and the rail carries the roll-up. That rule was
// right about ownership and wrong about ENTRY. It was patched once already —
// the 07-28 audit added the governance strip to answer "I should be able to see
// the status at all times" — and the second report of the same failure (2026-08-22,
// Karel: "not easy to see and use ... there is so much happening all over the
// place") is the evidence that a rail widget cannot carry it. Nine peer sections
// with no hierarchy of attention above them is not a navigation problem; it is a
// missing page.
//
// So the ambient rule is superseded HERE and ONLY here: exactly one section may
// aggregate, it is the first one, and it OWNS NO FACTS. Every rule that made the
// ambient design right still binds:
//
//   - Composition only. This module derives nothing. It arranges what
//     deriveHumanQueue, getApprovalAnchoredDiff, getDigestData and the receipt
//     bridge already returned. If a number here could ever disagree with the
//     section that owns it, this file is wrong.
//   - Sign where you read, AMENDED 2026-08-24 (Karel: "in the overview give the
//     option to approve as well"). Each row now carries its own signature
//     control, because the rule's purpose — never sign what you have not read —
//     is served by the evidence already on the row (the drift file split, the
//     promise tally and receipt) plus "read it first" one click away, not by
//     forcing a round trip for a decision already made. The control is NOT a
//     second mechanism: it emits the exact markup the existing wiring speaks
//     (.approve-btn / .feature-accept-btn), so there is still one approve path,
//     one accept path, and refusals stay the server's.
//   - Evidence-or-silence. An unavailable ledger says so in its own words. No
//     block invents an empty state that reads like a clean bill of health.
//
// The page answers the returning owner's three questions, in the order they are
// actually asked: what needs me (queue) · what changed (digest) · is it still
// proven (the standing line in the header).

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

/**
 * The section's status line — the "is it still proven" answer, in one line:
 * the lane's own glyph + verdict + rung, then the signing tally. Both halves
 * are read from data the rail already shows, so the two can never disagree.
 *
 * @param {{receipt?: object|null, statuses?: object[], receiptGlyph: Function,
 *   formatAge?: Function}} p `receiptGlyph` is injected (console-shell owns
 *   that derivation — importing it here would fork nothing, but passing it
 *   keeps the ONE-derivation rule visible at the call site).
 */
export function overviewStatusHtml({ receipt, statuses = [], receiptGlyph, formatAge } = {}) {
  const g = receiptGlyph ? receiptGlyph(receipt) : null;
  const lane = g
    ? `<span class="glyph ${g.cls}" title="${escAttr(g.label)}">${g.ch}</span> ${esc(g.label)}`
    : "";
  const age =
    receipt && receipt.available && typeof receipt.ageMs === "number" && formatAge
      ? ` &middot; ${esc(formatAge(receipt.ageMs))}`
      : "";
  const rung =
    receipt && receipt.available && receipt.evidenceLevel
      ? ` &middot; <span class="badge evidence-rung">${esc(receipt.evidenceLevel.rung)} ${esc(receipt.evidenceLevel.name)}</span>`
      : "";
  // The tally is silent on an ungoverned project rather than printing "0 of 0
  // signed", which reads as a finding when it is an absence.
  const tally = statuses.length
    ? ` &middot; ${statuses.filter((s) => s.status === "approved").length} of ${statuses.length} signed`
    : "";
  return `${lane}${age}${rung}${tally}`;
}

/**
 * A queue item's own signature control (Karel, 2026-08-24: "in the overview
 * give the option to approve as well").
 *
 * This SUPERSEDES the front door's original "names the act and jumps, never
 * signs" rule. What that rule was protecting — never sign what you have not
 * read — is preserved by construction rather than by making you travel: every
 * row already carries the evidence its signature is about (a drifted
 * artifact's changed/still-signed file split, a proven feature's promise tally
 * and receipt), and "read it in full" stays one click away as the secondary
 * action. What the rule was costing was a mandatory round trip for the
 * decision you had already made.
 *
 * It is NOT a second mechanism: the markup is exactly the contract the
 * existing wiring speaks (.approve-btn[data-artifact] -> POST /api/approve,
 * .feature-accept-btn[data-name] -> POST /api/feature/accept), the panel is
 * already in GOVERNED_PANELS so the SSE swap re-wires these buttons like any
 * other, and refusals stay the server's to make.
 */
function itemActionHtml(item, { byArtifact, byFeature }) {
  const record = byArtifact.get(item.artifact) || null;
  const featureName = item.artifact.startsWith("feature-brief:") ? item.artifact.slice("feature-brief:".length) : null;
  const feature = featureName ? byFeature.get(featureName) : null;

  // Acceptance is a different verb on a different endpoint: the brief is
  // already signed; what is being said is "the proven thing is what I wanted".
  if (feature && feature.provenDone && record && record.status === "approved") {
    return `<button type="button" class="feature-accept-btn fd-sign" data-name="${escAttr(featureName)}">Accept</button>`;
  }
  // A refused artifact never gets a button that could only fail on click —
  // the same honesty signatureBarHtml applies at its own bar.
  if (record && record.resolvable === false) return "";
  const label = record && record.status === "unreviewed" ? "Approve" : "Re-approve";
  return `<button type="button" class="approve-btn fd-sign" data-artifact="${escAttr(item.artifact)}">${label}</button>`;
}

/**
 * A queue item's supporting evidence — enough to judge urgency WITHOUT opening
 * the owning section, and never more. A drifted artifact shows the file split
 * (the changed/still-signed counts approval-diff already computed) and names
 * the changed files; the DIFF ITSELF stays in the section that owns it. A
 * proven feature shows the derivation that made it proven.
 */
function itemEvidenceHtml(item, { byArtifact, byFeature, anchoredDiffs }) {
  const record = byArtifact.get(item.artifact) || null;
  const anchored = anchoredDiffs ? anchoredDiffs[item.artifact] : null;

  if (record && (record.status === "changed-since-approval" || record.status === "reopened")) {
    if (!anchored || !anchored.available) {
      // The honest failure: approval-diff could not locate the signed bytes.
      // Saying so is the point — a guessed "roughly then" diff is the one
      // output that would make this page untrustworthy.
      const why = anchored && anchored.reason ? anchored.reason : "the signed bytes were not located in recent history";
      return `      <p class="fd-evidence fd-evidence-absent">what changed vs. the signed bytes is not derivable &mdash; ${esc(why)}</p>`;
    }
    const files = anchored.files || { changed: [], unchanged: [] };
    const changed = files.changed || [];
    const unchanged = files.unchanged || [];
    const total = changed.length + unchanged.length;
    if (changed.length === 0) {
      return `      <p class="fd-evidence">no file in this artifact differs from the signed bytes &mdash; the hash moved for another reason; open the section for the anchored diff</p>`;
    }
    const list = changed
      .slice(0, 8)
      .map((f) => `<li><span class="fd-status">${esc(f.status)}</span> <code>${esc(f.path)}</code></li>`)
      .join("");
    const more = changed.length > 8 ? `<li class="fd-more">&hellip; and ${changed.length - 8} more</li>` : "";
    const still =
      unchanged.length > 0
        ? ` &middot; ${unchanged.length} of ${total} still exactly as signed`
        : "";
    return `      <details class="fd-evidence">
        <summary>${changed.length} file${changed.length === 1 ? "" : "s"} changed since you signed${still}</summary>
        <ul class="fd-files">${list}${more}</ul>
      </details>`;
  }

  // A proven feature awaiting acceptance: show WHY it is proven — the same
  // derivation the Features card states, never a re-computation of it.
  const featureName = item.artifact.startsWith("feature-brief:") ? item.artifact.slice("feature-brief:".length) : null;
  const feature = featureName ? byFeature.get(featureName) : null;
  if (feature && feature.provenDone) {
    const clauses =
      typeof feature.covered === "number" && typeof feature.total === "number" && feature.total > 0
        ? `${feature.covered} of ${feature.total} clauses cited`
        : null;
    const verdict = feature.receipt && feature.receipt.present ? `receipt ${feature.receipt.verdict}` : null;
    const attests = feature.receipt && feature.receipt.attestsTree ? "attesting this tree" : null;
    const bits = [clauses, verdict, attests].filter(Boolean).join(" &middot; ");
    return bits ? `      <p class="fd-evidence">${bits}</p>` : "";
  }

  if (record && record.status === "unreviewed") {
    return `      <p class="fd-evidence">never signed &mdash; this artifact has had no human judgment yet</p>`;
  }
  return "";
}

/**
 * The front door body.
 *
 * @param {object} p
 * @param {Array<{artifact: string, tab: string, label: string}>} p.queue deriveHumanQueue()
 * @param {object[]} [p.statuses] approvals statuses (for the ungoverned empty state)
 * @param {object[]} [p.features] the feature board's features
 * @param {object} [p.anchoredDiffs] artifact id -> getApprovalAnchoredDiff() result
 * @param {string} [p.digestHtml] digestTabHtml(digest) — passed in, not imported,
 *   so this module stays acyclic and the digest keeps ONE renderer
 * @param {string} [p.digestSince] the digest window, for the block's own subtitle
 * @param {Function} [p.statusGlyph] console-shell's statusGlyph (injected, one derivation)
 * @param {object[]} [p.journal] the signing journal's events — History, moved
 *   here from the rail strip so the strip could stop duplicating this page
 * @param {Function} [p.formatAge] console-shell's formatAgeCoarse (injected)
 */
export function overviewBodyHtml({
  queue = [],
  statuses = [],
  features = [],
  anchoredDiffs = {},
  digestHtml = "",
  digestSince = null,
  statusGlyph,
  journal = [],
  formatAge,
  walks = null,
} = {}) {
  const byArtifact = new Map(statuses.map((s) => [s.id, s]));
  const byFeature = new Map(features.map((f) => [f.name, f]));

  let queueHtml;
  if (statuses.length === 0) {
    // Not "nothing waits on you" — that is a claim. There is no ledger to read.
    queueHtml = `  <p class="empty-inline">no approvals ledger in this project &mdash; nothing here is governed yet, so no signature can be waiting. A project gains a ledger at <code>qa/approvals.json</code>.</p>`;
  } else if (queue.length === 0) {
    queueHtml = `  <p class="fd-clear"><span class="glyph glyph-signed">&#9679;</span> Nothing waits on you. Every governed artifact is signed and unchanged since.</p>`;
  } else {
    queueHtml = `  <div class="banner sig-error" id="overview-error" hidden></div>
  <ol class="fd-queue">
${queue
  .map((item) => {
    const record = byArtifact.get(item.artifact) || null;
    // The glyph states the ACT, not the artifact's current status. An
    // acceptance row's artifact is `approved` — its brief was signed long ago —
    // and statusGlyph would correctly render that as a green ●, which on a
    // queue of things waiting on you reads as "done". `glyph-attn` is the rail's
    // existing vocabulary for exactly this state (accent ●: needs your
    // acceptance), so the two surfaces stay in one language.
    const g =
      record && record.status === "approved"
        ? { ch: "●", cls: "glyph-attn", label: "proven — awaiting your acceptance" }
        : statusGlyph
          ? statusGlyph(record)
          : null;
    const glyph = g
      ? `<span class="glyph ${g.cls}" title="${escAttr(g.label)}">${g.ch}</span>`
      : `<span class="glyph glyph-unsigned">&#9675;</span>`;
    // data-go-* is the strip's jump contract, delegated at document level so
    // this page reuses the SAME navigation the governance strip uses — one
    // handler, one behavior, no second mechanism.
    return `    <li class="fd-item">
      <p class="fd-act">${glyph} <span class="fd-label">${esc(item.label)}</span>
        <span class="fd-actions">${itemActionHtml(item, { byArtifact, byFeature })}<button type="button" class="gov-jump fd-go" data-go-tab="${escAttr(item.tab)}" data-go-artifact="${escAttr(item.artifact)}" title="open the artifact and read it in full">read it first</button></span></p>
${itemEvidenceHtml(item, { byArtifact, byFeature, anchoredDiffs })}
    </li>`;
  })
  .join("\n")}
  </ol>`;
  }

  // History, moved off the rail strip (2026-08-22) so the strip could stop being
  // a lower-fidelity copy of this page. The journal is the SIGNING record —
  // verb, artifact, who, and a reopen's reason — which is a different ledger
  // from the digest's git-derived events, so it sits alongside them, not
  // instead of them. Newest first, capped: this is a glance; `--log` is the
  // full record.
  const recent = [...journal].slice(-8).reverse();
  const historyHtml =
    recent.length === 0
      ? ""
      : `  <h3 class="fd-h">History</h3>
  <div class="fd-history">
${recent
  .map((e) => {
    const glyph = e.verb === "approve" ? "●" : e.verb === "reopen" ? "◐" : e.verb === "accept" ? "◆" : "·";
    const ageMs = e.at ? Date.now() - Date.parse(e.at) : NaN;
    const age = formatAge && !Number.isNaN(ageMs) ? formatAge(ageMs) : "";
    const who = e.via ? ` via ${e.via}` : "";
    return `    <p class="gov-event" title="${escAttr(e.at || "")}"><span class="gov-event-glyph">${glyph}</span> ${esc(e.verb)} ${esc(e.artifact || "")}${esc(who)}${age ? ` &middot; ${esc(age)}` : ""}${e.reason ? `<span class="gov-event-reason">${esc(e.reason)}</span>` : ""}</p>`;
  })
  .join("\n")}
  </div>`;

  const since = digestSince ? ` <span class="fd-since">window: since ${esc(digestSince)}</span>` : "";
  const changedBlock = digestHtml
    ? `  <h3 class="fd-h">What changed${since}</h3>
<div class="fd-digest">
${digestHtml}
</div>`
    : "";

  // Page anatomy (studio-drive-mode): Drive leads with the live chain, then
  // what-needs-you, then the walks; the digest and history are the page's own
  // MIRROR tail — complete, derived, and collapsed by default.
  const fold = (label, inner) =>
    inner ? `  <details class="fd-fold"><summary>${label}</summary>\n${inner}\n  </details>` : "";

  return `${driveChainHtml(walks && walks.chain ? walks.chain : null)}  <p class="meta">The three questions, in the order they get asked. Every line below is arranged
  from the section that owns it &mdash; this page derives nothing of its own, and signing happens where you read.</p>
  <h3 class="fd-h">What needs you${queue.length ? ` <span class="fd-count">${queue.length}</span>` : ""}</h3>
${queueHtml}
${walksHtml(features, statuses, walks)}
${fold("What changed", changedBlock)}
${fold("History", historyHtml)}`;
}

// ── The live chain (studio-drive-mode) ───────────────────────────────────────
//
// What the agent is doing in the CURRENT REQUEST: the request itself (tier 1,
// recorded mechanically from the human's own prompt), the declared step chain
// (tier 2 — agent-declared, so its AGE is always shown), and what is actually
// running right now (tier 3 — the lane/render markers, derived, overriding).
// The chain gates nothing; the walk below stays the truth for doneness.

/** "40s ago" / "12 min ago" — mirror of the harness's formatAge, display-only. */
function fmtChainAge(ms) {
  if (!(ms >= 0)) return "age unknown";
  if (ms < 90000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 90 * 60000) return `${Math.round(ms / 60000)} min ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

/** "12s" / "~3 min" — mirror of the harness's formatDuration, display-only. */
function fmtChainDur(ms) {
  if (!(ms >= 0)) return "";
  if (ms < 120000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  return `~${Math.round(ms / 60000)} min`;
}

// Provenance chips (drive-narration N3) — each chain tier labeled as what it
// is: the request `recorded` (mechanically, from the human's own prompt), the
// steps `declared` (by the agent, aged), the busy line `observed` (the lane's
// own marker). The one distinction no self-reported progress display makes.
const CH_PROV = {
  recorded: `<span class="ch-prov ch-prov-obs" title="recorded mechanically from your own prompt — not the agent's words">recorded</span>`,
  declared: `<span class="ch-prov ch-prov-dec" title="declared by the agent — the age says how fresh the claim is">declared</span>`,
  observed: `<span class="ch-prov ch-prov-obs" title="observed from the lane's own marker — not an agent claim">observed</span>`,
};

/**
 * The busy phrase: the harness's own pre-rendered narration when the project's
 * plan.mjs provides it (busyText — one voice everywhere), else the legacy
 * truthiness phrasing for older harnesses.
 */
function chainBusyPhrase(chain) {
  if (typeof chain.busyText === "string") return chain.busyText;
  if (chain.busy && chain.busy.lane) return "the full check is running NOW";
  if (chain.busy && chain.busy.render) return "a preview render is in flight";
  return "";
}

/** One row per closed chain (N5): request → steps → outcome, newest first. */
function chainHistoryHtml(history) {
  if (!Array.isArray(history) || history.length === 0) return "";
  const rows = history
    .map((h) => {
      const label = h.title || h.request || "(untitled request)";
      const ageMs = h.at ? Date.now() - Date.parse(h.at) : NaN;
      const outcome = h.receipt && h.receipt.verdict
        ? `<span class="ch-hist-outcome ${h.receipt.verdict === "PASS" ? "ok" : "bad"}">${esc(h.receipt.verdict)}${h.receipt.rung ? ` &middot; ${esc(h.receipt.rung)}` : ""}</span>`
        : `<span class="ch-hist-outcome">no receipt at close</span>`;
      const dur = typeof h.durationMs === "number" && h.durationMs > 0 ? ` &middot; ${esc(fmtChainDur(h.durationMs))}` : "";
      const steps = Array.isArray(h.steps) && h.steps.length ? ` &middot; ${h.steps.length} step${h.steps.length === 1 ? "" : "s"}` : "";
      return `    <p class="ch-hist-row" title="${escAttr(Array.isArray(h.steps) ? h.steps.join(" → ") : "")}">${esc(label)}${steps}${dur} &middot; ${outcome}${Number.isNaN(ageMs) ? "" : ` &middot; ${esc(fmtChainAge(ageMs))}`}</p>`;
    })
    .join("\n");
  return `  <details class="ch-hist"><summary>Recent requests <span class="fd-count">${history.length}</span></summary>\n${rows}\n  </details>\n`;
}

export function driveChainHtml(chain) {
  if (!chain || (!chain.plan && !chain.request)) return "";
  const title = chain.plan && chain.plan.title ? chain.plan.title : chain.request ? chain.request.text : "";
  const busyPhrase = chainBusyPhrase(chain);
  const busy = busyPhrase !== "" ? `${CH_PROV.observed} <span class="ch-busy">${esc(busyPhrase)}</span>` : "";
  let steps = "";
  let meta = "";
  if (chain.plan) {
    const cur = chain.plan.current;
    const nowMs = Date.now();
    steps = `  <p class="ch-steps">${chain.plan.steps
      .map((st) => {
        const cls = st.done ? "ch-done" : st.n === cur ? "ch-cur" : "ch-todo";
        const glyph = st.done ? "✓" : st.n === cur ? "◉" : "○";
        // N1: a done step wears its wall time, the current one its elapsed —
        // derived from the declaration's own write stamps, absent pre-N1.
        let time = "";
        if (st.done) {
          const a = Date.parse(st.startedAt || "");
          const b = Date.parse(st.doneAt || "");
          if (!Number.isNaN(a) && !Number.isNaN(b)) time = ` <span class="ch-time">(${esc(fmtChainDur(Math.max(0, b - a)))})</span>`;
        } else if (st.n === cur) {
          const a = Date.parse(st.startedAt || "");
          if (!Number.isNaN(a)) time = ` <span class="ch-time">${esc(fmtChainDur(Math.max(0, nowMs - a)))} in</span>`;
        }
        return `<span class="ch-step ${cls}"><span class="ch-glyph">${glyph}</span> ${st.n}. ${esc(st.label)}${time}</span>`;
      })
      .join('<span class="ch-arrow">→</span>')}</p>`;
    const now = chain.plan.steps.find((st) => st.n === cur) ?? null;
    meta = `  <p class="ch-meta">${now ? `now: step ${now.n} of ${chain.plan.steps.length} — ${esc(now.label)}` : "chain complete"}${busy ? ` &middot; ${busy}` : ""} &middot; ${CH_PROV.declared} <span class="ch-age">updated ${esc(fmtChainAge(chain.planAgeMs))}</span></p>`;
  } else {
    meta = `  <p class="ch-meta">no declared step chain for this request yet${busy ? ` &middot; ${busy}` : ""}</p>`;
  }
  return `  <div class="ch-strip">
  <p class="ch-request"><span class="lbl">Request</span> ${esc(title)} ${CH_PROV.recorded}</p>
${steps}${meta}${chainHistoryHtml(chain.history)}  </div>
`;
}

// ── In flight — the walks (docs/features/walk-status.md) ─────────────────────
//
// The six-stage projection of the feature board: Decide · Design · Contract ·
// Build · Prove · Sign-off, promises (clauses) as Build's inner progress.
// STEP_STAGE mirrors qa/lib/walk.mjs VERBATIM — the harness owns the mapping;
// this is its rendering. Stage states are positional around the board's own
// derived nextStep, exactly like walkOfFeature.

const WK_STAGES = [
  ["decide", "Decide"], ["design", "Design"], ["contract", "Contract"],
  ["build", "Build"], ["prove", "Prove"], ["signoff", "Sign-off"],
];
const WK_STEP_STAGE = {
  "sign-brief": "decide", "re-approve": "decide",
  design: "design", audit: "design", "sign-design": "design",
  contract: "contract", "sign-spec": "contract",
  build: "build", redesign: "build", prove: "prove", accept: "signoff",
};

/**
 * The In-flight block: one card per OPEN walk (most-recent board order), plus
 * arrivals — REOPENED artifacts no open walk accounts for (a harness wave's
 * rule-change reopens). Drifted artifacts are deliberately NOT repeated here:
 * they are already loud in the What-needs-you queue above; one fact, one place.
 * Empty walks + no arrivals -> "" (silence, never an empty frame).
 *
 * Two renderings (walk-legibility L5). When the project's own walk derivation
 * is available (`walksData` from getWalksData — qa/lib/walk.mjs), the card is
 * the walk's PRIMARY human surface: the promise list itself with per-promise
 * kept state, the stage gloss, Prove's measured lane cost, the signature
 * button ON the your-turn row (the same .approve-btn/.feature-accept-btn wire
 * every other control speaks — one approve path), and each arrival's
 * now-or-after choice as two buttons that post a general comment for the
 * agent to observe (the pick-btn precedent — no new decision machinery).
 * Without it (pre-walk scaffolds), the original board-mirroring thumbnail.
 */
export function walksHtml(features = [], statuses = [], walksData = null) {
  if (walksData && walksData.available) return walksRichHtml(walksData, statuses);
  const open = features.filter((f) => f.phase !== "accepted");
  const owned = new Set();
  for (const f of open) {
    owned.add(`feature-brief:${f.name}`);
    owned.add(`feature-design:${f.name}`);
    for (const n of f.specNames || [f.name]) owned.add(`feature-spec:${n}`);
    for (const t of f.touches || []) owned.add(t.id);
  }
  const arrivals = statuses.filter((s) => s.status === "reopened" && !owned.has(s.id));
  if (open.length === 0 && arrivals.length === 0) return "";

  const cards = open.map((f) => {
    const currentKey = WK_STEP_STAGE[f.nextStep && f.nextStep.key] ?? null;
    const idx = currentKey ? WK_STAGES.findIndex(([k]) => k === currentKey) : WK_STAGES.length;
    const dots = WK_STAGES.map(([key, label], i) => {
      const state =
        key === "design" && f.design === null ? "skip" : i < idx ? "done" : i === idx ? "cur" : "todo";
      const title = state === "skip" ? `${label} — no UI surface` : label;
      return `<span class="wk-stage wk-${state}" title="${escAttr(title)}"><span class="wk-dot"></span>${esc(label)}</span>`;
    }).join("");
    const promises =
      typeof f.total === "number" && f.total > 0
        ? `<span class="wk-promises">${f.covered} of ${f.total} promises kept</span>`
        : "";
    const owner = f.nextStep ? f.nextStep.label : "";
    const you =
      f.nextStep && f.nextStep.owner === "human"
        ? `<span class="wk-turn">YOUR TURN</span> ${esc(owner)}`
        : `<span class="wk-agent">agent</span> ${esc(owner)}`;
    return `  <div class="wk-card" data-walk="${escAttr(f.name)}">
    <p class="wk-name">${esc(f.name)}${promises}</p>
    <p class="wk-stages">${dots}</p>
    <p class="wk-you">${you}</p>
  </div>`;
  });

  const arrived = arrivals.map(
    (a) =>
      `  <p class="wk-arrival">&#9650; ARRIVED, UNPLANNED &mdash; ${esc(a.label || a.id)} &middot; reopened outside every open walk &mdash; now, or after the current walk lands?</p>`,
  );

  return `  <h3 class="fd-h">In flight${open.length ? ` <span class="fd-count">${open.length}</span>` : ""}</h3>
${cards.join("\n")}
${arrived.join("\n")}`;
}

/**
 * The rich In-flight rendering — the walk derivation's own objects
 * (qa/lib/walk.mjs via getWalksData), arranged. Derives nothing: stage
 * states, promise kept-ness, the measured lane cost and whose-turn all
 * arrive computed; this maps them to markup.
 */
function walksRichHtml(walksData, statuses = []) {
  const { walks = [], arrivals = [], gloss = {} } = walksData;
  if (walks.length === 0 && arrivals.length === 0) return "";
  const byId = new Map(statuses.map((s) => [s.id, s]));

  const stageState = { done: "done", current: "cur", pending: "todo", skipped: "skip" };
  const cards = walks.map((w) => {
    const dots = w.stages
      .map((s) => {
        const cls = stageState[s.state] ?? "todo";
        const title = s.note ? `${s.label} — ${s.note}` : s.label;
        const note = s.note && s.key === "prove" ? ` <span class="wk-note">${esc(s.note)}</span>` : "";
        return `<span class="wk-stage wk-${cls}" title="${escAttr(title)}"><span class="wk-dot"></span>${esc(s.label)}${note}</span>`;
      })
      .join("");

    const g = gloss[w.currentStage];
    const stageLine = w.currentStage
      ? `<span class="wk-gloss">${esc(w.stages.find((s) => s.key === w.currentStage)?.label ?? "")}${g ? ` — ${esc(g)}` : ""}</span>`
      : "";

    // The promises THEMSELVES (L5): kept ✓ / being-kept ▸ / pending ○, in the
    // spec's own words. The list scrolls (CSS) rather than truncates — a
    // collapsed tally is exactly what this rendering replaces.
    const all = (w.promises && w.promises.all) || [];
    const currentId = w.promises && w.promises.current ? w.promises.current.id : null;
    const promiseList =
      all.length > 0
        ? `    <ul class="wk-plist">\n${all
            .map((p) => {
              const cls = p.kept ? "wk-p-kept" : p.id === currentId ? "wk-p-cur" : "wk-p-todo";
              const glyph = p.kept ? "✓" : p.id === currentId ? "▸" : "○";
              return `      <li class="${cls}"><span class="wk-p-glyph">${glyph}</span> <code>${esc(p.id)}</code>${p.title ? ` ${esc(p.title)}` : ""}</li>`;
            })
            .join("\n")}\n    </ul>`
        : "";

    // The signature ON the row (L5): the walk names which signature the step
    // waits for; the button speaks the one existing wire (.approve-btn /
    // .feature-accept-btn — refusals stay the server's). An already-approved
    // artifact gets no button that could only fail on click.
    const buttons = (w.you.signable || [])
      .map((s) => {
        if (s.verb === "accept")
          return `<button type="button" class="feature-accept-btn fd-sign" data-name="${escAttr(s.artifact)}">Accept</button>`;
        const record = byId.get(s.artifact);
        if (record && record.status === "approved") return "";
        if (record && record.resolvable === false) return "";
        const label = record && record.status === "unreviewed" ? "Approve" : "Re-approve";
        return `<button type="button" class="approve-btn fd-sign" data-artifact="${escAttr(s.artifact)}">${label}</button>`;
      })
      .filter(Boolean)
      .join(" ");

    const you =
      w.you.turn === "you"
        ? `<span class="wk-turn">YOUR TURN</span> ${esc(w.you.act ?? "")}${buttons ? ` ${buttons}` : ""}`
        : w.you.turn === "agent"
          ? `<span class="wk-agent">agent</span> ${esc(w.you.act ?? "")}${
              w.stops && w.stops.length
                ? ` <span class="wk-stops">next stop${w.stops.length > 1 ? "s" : ""} for you: ${esc(w.stops.join(", "))}</span>`
                : ""
            }`
          : esc(w.doneReason ?? "closed");

    const tally =
      w.promises && typeof w.promises.total === "number" && w.promises.total > 0
        ? `<span class="wk-promises">${w.promises.kept} of ${w.promises.total} promises kept</span>`
        : "";

    return `  <div class="wk-card" data-walk="${escAttr(w.name)}">
    <p class="wk-name">${esc(w.name)}${tally} ${stageLine}</p>
    <p class="wk-stages">${dots}</p>
${promiseList ? `${promiseList}\n` : ""}    <p class="wk-you">${you}</p>
  </div>`;
  });

  // Arrivals: the now-or-after question as two buttons (L5). Each posts a
  // general comment over the EXISTING /api/comment wire (the pick-btn
  // precedent) — the agent observes it via review_comments; no new state.
  const arrived = arrivals.map(
    (a) =>
      `  <p class="wk-arrival">&#9650; ARRIVED, UNPLANNED &mdash; ${esc(a.label || a.id)}${
        a.reason ? ` &middot; ${esc(a.reason)}` : ""
      } &mdash; when?
    <button type="button" class="wk-arrival-btn" data-arrival="${escAttr(a.id)}" data-choice="now">Now</button>
    <button type="button" class="wk-arrival-btn" data-arrival="${escAttr(a.id)}" data-choice="after">After the current walk</button>
  </p>`,
  );

  const laneLine =
    walksData.lane && typeof walksData.lane.durationMs === "number"
      ? `  <p class="wk-lane">full check: ${esc(fmtLaneMs(walksData.lane.durationMs))} last run (measured)</p>`
      : "";

  return `  <h3 class="fd-h">In flight${walks.length ? ` <span class="fd-count">${walks.length}</span>` : ""}</h3>
${cards.join("\n")}
${arrived.join("\n")}
${laneLine}`;
}

/** Mirror of the harness's humanDuration formatting, display-only. */
function fmtLaneMs(ms) {
  if (!(ms > 0)) return "unknown";
  return ms < 120000 ? `${Math.round(ms / 1000)}s` : `~${Math.round(ms / 60000)} min`;
}

/** The front door's rail glyph — the queue's own state, never a fifth meaning. */
export function overviewGlyph(queue = [], statuses = []) {
  if (statuses.length === 0) return null;
  if (queue.length === 0) return { ch: "●", cls: "glyph-signed", label: "nothing waiting on you" };
  // Drift is read from the LEDGER, never from the label's wording — matching
  // prose to pick a colour makes the glyph silently wrong the day someone
  // rewords deriveHumanQueue, and a rail glyph that quietly stops going red is
  // the failure this console exists to prevent.
  const byId = new Map(statuses.map((st) => [st.id, st]));
  const drifted = queue.some((q) => {
    const record = byId.get(q.artifact);
    return record && record.status === "changed-since-approval";
  });
  return drifted
    ? { ch: "⚠", cls: "glyph-drift", label: `${queue.length} act(s) waiting — drift among them` }
    : { ch: "○", cls: "glyph-unsigned", label: `${queue.length} act(s) waiting on you` };
}
