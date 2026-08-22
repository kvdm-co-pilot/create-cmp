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
//   - Sign where you read. The front door NAMES the act and TAKES YOU THERE;
//     it does not grow its own signature controls. A second approve button is a
//     second mechanism, and the reason this console exists is that the product
//     has one.
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
 */
export function overviewBodyHtml({
  queue = [],
  statuses = [],
  features = [],
  anchoredDiffs = {},
  digestHtml = "",
  digestSince = null,
  statusGlyph,
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
    queueHtml = `  <ol class="fd-queue">
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
        <button type="button" class="gov-jump fd-go" data-go-tab="${escAttr(item.tab)}" data-go-artifact="${escAttr(item.artifact)}" title="take me there">take me there</button></p>
${itemEvidenceHtml(item, { byArtifact, byFeature, anchoredDiffs })}
    </li>`;
  })
  .join("\n")}
  </ol>`;
  }

  const since = digestSince ? ` <span class="fd-since">window: since ${esc(digestSince)}</span>` : "";
  const changedBlock = digestHtml
    ? `  <h3 class="fd-h">What changed${since}</h3>
<div class="fd-digest">
${digestHtml}
</div>`
    : "";

  return `  <p class="meta">The three questions, in the order they get asked. Every line below is arranged
  from the section that owns it &mdash; this page derives nothing of its own, and signing happens where you read.</p>
  <h3 class="fd-h">What needs you${queue.length ? ` <span class="fd-count">${queue.length}</span>` : ""}</h3>
${queueHtml}
${changedBlock}`;
}

/** The front door's rail glyph — the queue's own state, never a fifth meaning. */
export function overviewGlyph(queue = [], statuses = []) {
  if (statuses.length === 0) return null;
  if (queue.length === 0) return { ch: "●", cls: "glyph-signed", label: "nothing waiting on you" };
  const drifted = queue.some((q) => /it changed since signing/.test(q.label));
  return drifted
    ? { ch: "⚠", cls: "glyph-drift", label: `${queue.length} act(s) waiting — drift among them` }
    : { ch: "○", cls: "glyph-unsigned", label: `${queue.length} act(s) waiting on you` };
}
