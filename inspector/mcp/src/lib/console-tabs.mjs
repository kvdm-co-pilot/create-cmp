// console-tabs.mjs — pure (data) -> html generators for the console's section
// bodies, each in its profession's §3 form (docs/STUDIO-REDESIGN.md): Design
// language (§3.1), Architecture (§3.2), Components (§3.3), Specs (§3.5, the
// traceability matrix), Evidence (§3.6, the release-readiness report), plus
// the Approvals and Comments ledgers. The Screens body is still built inline
// by preview-service.mjs's galleryHtml.
//
// Pure generators, same style as preview-service.mjs's galleryHtml:
// (state) -> html string, no DOM, no CDN. Derivation math (contrast pairs,
// dimens classification) comes from design-language.mjs; nothing here reads
// the filesystem. Every section degrades honestly to an empty-state
// explanation when its data source isn't available yet — never fabricated
// values, and every absence uses the one standardized form
// ("Not derivable statically — <reason>").

import { classifyDimens, deriveContrastPairs } from "./design-language.mjs";
import { componentStoryId } from "./components.mjs";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Same as esc(), plus double-quote escaping — required for values embedded
// inside a double-quoted HTML attribute (the comment target JSON below always
// contains `"`, being JSON; esc() alone would corrupt the markup).
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

/**
 * A 💬 control (§7.3): a button that reveals an inline popover (pure JS,
 * wired by preview-service.mjs's wireCommentButtons) posting to
 * POST /api/comment. `target` is a §7.3 Comment target object — serialized
 * as JSON into a data attribute, escaped for attribute-safety (comment text
 * is USER input; the target itself is server-constructed but still escaped
 * rigorously, per this package's style). Pass `{ testTagInput: true }` to
 * additionally show an optional testTag field (screen cards: "with optional
 * testTag field for element-level" — filled in, the console POSTs
 * {type:"element", screen, testTag} instead of {type:"screen", screen}).
 * @param {object} target a §7.3 Comment target ({type, ...fields})
 * @param {{testTagInput?: boolean}} [opts]
 */
export function commentControlHtml(target, opts = {}) {
  const targetJson = escAttr(JSON.stringify(target));
  const testTagField = opts.testTagInput
    ? `<input type="text" class="comment-testtag" placeholder="testTag (optional — element-level)">`
    : "";
  return `<span class="comment-ctl" data-target="${targetJson}">
      <button type="button" class="comment-btn" title="Add comment">&#128172;</button>
      <span class="comment-popover" hidden>
        ${testTagField}
        <textarea class="comment-text" rows="2" placeholder="Add a comment&hellip;"></textarea>
        <div class="comment-popover-actions">
          <button type="button" class="comment-cancel">Cancel</button>
          <button type="button" class="comment-submit">Post</button>
        </div>
        <p class="comment-error" hidden></p>
      </span>
    </span>`;
}

function shortHash(hash) {
  return hash ? String(hash).slice(0, 8) : "none";
}

// The §1 ordered-walk numbering (GENESIS-FLOW-DESIGN.md §1, superseding
// VERIFICATION-LAYER-DESIGN.md §1's numbering) — shown so the human sees the
// intended DEFINITION order (each artifact is the vocabulary the next is
// written in), not just an alphabetical/registry list. `intent` and
// `components` are new rows (§1's registry table); a project whose approvals
// library predates them simply never reports those ids, so their numbers
// just never appear — no fabrication, no renumbering surprise for the ids
// that already existed.
const ORDER_BY_ID = [
  [/^intent$/, 0],
  [/^architecture$/, 1],
  // Spec-first: the exemplar's clauses are confirmed BEFORE the slice is built.
  [/^exemplar-spec$/, 2],
  [/^exemplar-feature$/, 3],
  // UI-first: the design system locks on — and the components are distilled
  // from — the real exemplar screens, so both FOLLOW the exemplar.
  [/^design-system$/, 4],
  [/^components$/, 5],
  [/^feature-spec:/, 6],
];
function orderNumber(id) {
  for (const [re, n] of ORDER_BY_ID) if (re.test(id)) return n;
  return "–";
}

// --- §2 mode presentation: per-artifact genesis/steward banners --------------
//
// "unreviewed"/"reopened" ⇒ genesis (workbench affordances + a one-line "what
// shapes this artifact" guide); "approved" ⇒ steward; "approved" + mode
// "defaults-accepted" ⇒ steward with the unshaped note. No global mode switch
// — the per-artifact status IS the mode (§2 "Mode presentation").

/** The one-line genesis guide, by artifact id pattern — never fabricated for an unknown id. */
function genesisGuide(id) {
  if (/^intent$/.test(id)) return "the interview that becomes this app's purpose, audience, platforms, and first screens.";
  if (/^design-system$/.test(id)) return "the palette, type, and shape every screen renders in — react in your own words, never hex codes.";
  if (/^architecture$/.test(id)) return "the layer map and structural decisions this harness enforces — approval means you understand and accept this shape.";
  if (/^components$/.test(id)) return "the component vocabulary this app speaks in — shape each one; once approved it's law for every future feature.";
  if (/^exemplar-feature$/.test(id)) return "this app's first real feature — the DNA every future feature is cloned from.";
  if (/^exemplar-spec$/.test(id)) return "the Given/When/Then spec for that first feature's behavior.";
  if (/^feature-spec:/.test(id)) return "a spec conversation in the frozen vocabulary — this feature's behavior, clause by clause.";
  return "shapes this artifact.";
}

/**
 * One artifact's genesis/steward banner. `undefined`/unknown `status` values
 * (an older project lib, or "changed-since-approval") render NO banner —
 * §2 defines the mapping only for unreviewed/reopened/approved; drift is a
 * different concern (the hash mismatch already speaks for itself in the row).
 */
export function artifactBannerHtml(s) {
  if (s.status === "unreviewed" || s.status === "reopened") {
    return `<div class="artifact-banner banner-genesis"><span class="banner-mode">genesis</span> ${esc(genesisGuide(s.id))}</div>`;
  }
  if (s.status === "approved") {
    const unshaped = s.mode === "defaults-accepted";
    return unshaped
      ? `<div class="artifact-banner banner-steward banner-unshaped"><span class="banner-mode">steward</span> approved with defaults — unshaped; a real approval after shaping clears this note.</div>`
      : `<div class="artifact-banner banner-steward"><span class="banner-mode">steward</span> frozen — drift is detected automatically; reopen for a deliberate redesign.</div>`;
  }
  return "";
}

// --- Design language (§3.1) — the designer's handoff spec --------------------
//
// What a design team hands engineering: the color token table with live
// swatches and per-token usage counts from the real tree, the WCAG 2.2
// contrast matrix computed from the real token values, the spacing scale
// drawn to scale, radii/elevation sub-tables, and the type ramp (or its
// honest absence — the catalog carries no typography today). Genesis mode
// appends the candidates strip. The Components registry is its OWN section
// now (componentsBodyHtml) — the vocabulary is artifact 3, not a token
// appendix.

const px = (n) => `${Math.round(n * 100) / 100}px`;

// Spacing bars are drawn to a fixed scale so widths compare truthfully
// within and across projects: 4 CSS px per dp.
const SPACING_BAR_PX_PER_DP = 4;

/** "N uses in commonMain" — 0 is stated plainly, never hidden. */
function usageText(n) {
  return `${n} use${n === 1 ? "" : "s"} in commonMain`;
}

/**
 * The color token table: swatch · token · value · usage count. The usage
 * column renders only when the scan resolved a declaring object for these
 * tokens (design-language.mjs getTokenUsage); an unavailable scan states the
 * absence under the table instead. `usage` omitted entirely (a caller that
 * doesn't wire the scan) renders neither column nor claim — silence.
 */
function colorTokenTableHtml(colors, usage) {
  const entries = Object.entries(colors);
  if (entries.length === 0) return `  <p class="empty-inline">no color tokens declared</p>`;
  const counts = usage && usage.available && usage.colors ? usage.colors.counts : null;
  const rows = entries
    .map(([name, hex]) => {
      const usageCell = counts ? `<td class="tok-usage">${esc(usageText(counts[name] ?? 0))}</td>` : "";
      return `    <tr>
      <td class="tok-swatch-cell"><span class="tok-swatch" style="background:${esc(hex)}"></span></td>
      <td>${esc(name)}${commentControlHtml({ type: "design-system", token: name })}</td>
      <td><code>${esc(hex)}</code></td>
      ${usageCell}
    </tr>`;
    })
    .join("\n");
  let absence = "";
  if (usage && !counts) {
    const reason =
      (usage.available === false && usage.reason) ||
      "no Kotlin object declaring these tokens was found under composeApp/src/commonMain/kotlin";
    absence = `\n  <p class="empty-inline">usage counts: Not derivable statically &mdash; ${esc(reason)}</p>`;
  }
  return `  <table class="tok-table">
    <thead><tr><th></th><th>Token</th><th>Value</th>${counts ? "<th>Usage</th>" : ""}</tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>${absence}`;
}

/**
 * The WCAG 2.2 contrast matrix — pairs derived from the catalog by the
 * On-convention (design-language.mjs deriveContrastPairs), each row a live
 * sample chip in the actual pair colors, the computed ratio, and the
 * normal-text AA/AAA verdicts. Failures use the semantic drift color — the
 * rule is violated HERE, so it is drawn here. Underivable pairs are absent.
 */
function contrastMatrixHtml(colors) {
  if (Object.keys(colors).length === 0) return `  <p class="empty-inline">no color tokens declared</p>`;
  const pairs = deriveContrastPairs(colors);
  if (pairs.length === 0) {
    return `  <p class="empty-inline">Not derivable statically &mdash; the catalog names no On-convention pairs to check</p>`;
  }
  const rows = pairs
    .map((p) => {
      const ratio = `${Math.round(p.ratio * 100) / 100}:1`;
      const aa = p.aa ? `<span class="wcag-pass">pass</span>` : `<span class="wcag-fail">fail</span>`;
      const aaa = p.aaa ? `<span class="wcag-pass">pass</span>` : `<span class="wcag-fail">fail</span>`;
      return `    <tr>
      <td><span class="contrast-sample" style="background:${esc(p.bgHex)};color:${esc(p.fgHex)}">Aa</span>
          <code>${esc(p.fg)}</code> on <code>${esc(p.bg)}</code></td>
      <td class="tok-usage">${esc(p.role)}</td>
      <td class="contrast-ratio">${esc(ratio)}</td>
      <td>${aa}</td>
      <td>${aaa}</td>
    </tr>`;
    })
    .join("\n");
  return `  <p class="meta">normal text: AA &ge; 4.5:1 &middot; AAA &ge; 7:1 &middot; computed from the token values above</p>
  <table class="tok-table contrast-table">
    <thead><tr><th>Pair</th><th>Role</th><th>Ratio</th><th>AA</th><th>AAA</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

/** One name·value sub-table (radii, elevation, unclassified dimens). */
function dimenSubTableHtml(entries) {
  const rows = entries
    .map(
      (d) =>
        `    <tr><td>${esc(d.name)}${commentControlHtml({ type: "design-system", token: d.name })}</td><td><code>${esc(d.value)}</code></td></tr>`,
    )
    .join("\n");
  return `  <table class="tok-table"><tbody>
${rows}
  </tbody></table>`;
}

/** The spacing scale drawn to scale: one bar per token, 4px per dp, ascending. */
function spacingScaleHtml(spacing) {
  const rows = spacing
    .map(
      (d) => `    <div class="scale-row">
      <span class="scale-name">${esc(d.name)}${commentControlHtml({ type: "design-system", token: d.name })}</span>
      <span class="scale-bar" style="width:${px(d.dp * SPACING_BAR_PX_PER_DP)}"></span>
      <span class="scale-value">${esc(d.value)}</span>
    </div>`,
    )
    .join("\n");
  return `  <div class="scale-list">
${rows}
  </div>`;
}

/**
 * The Design language section body (§3.1). `meta`:
 * - `usage`: design-language.mjs getTokenUsage() result (per-token counts).
 * - `variants` + `artifactStatus`: the genesis candidates strip — rendered
 *   only while the design-system artifact is unreviewed/reopened (§2 of
 *   GENESIS-FLOW-DESIGN.md: the per-artifact status IS the mode; an
 *   undefined status reads as steward, the safe no-strip default).
 * Never fabricates: an unavailable catalog gets the honest empty state
 * explaining how to produce one; the type ramp states its absence in the
 * standardized form rather than faking a specimen.
 * @param {{available: boolean, source?: "previews"|"live", catalog?: {colors?: object, dimens?: object, typography?: object}}} ds
 * @param {{usage?: object, variants?: object, artifactStatus?: string}} [meta]
 */
/**
 * The type ramp, shown the way a designer reads one: a specimen line SET in
 * each rung's real size, weight and tracking, with the numbers beside it —
 * not a table of numbers alone. The catalog publishes the ramp as an ordered
 * array (PreviewHarness's `typography` block, lifted from the same data the
 * Typography factory builds its styles from), which is why order is preserved
 * rather than sorted: display → headline → title → body → label IS the ramp.
 *
 * A flat `{name: value}` object is still accepted — an older catalog that
 * exported typography some other way renders as plain rows rather than
 * nothing. A catalog with no typography at all keeps the honest absence line;
 * this never invents a specimen.
 * @param {Array<object>|object|undefined} typography
 */
function typeRampHtml(typography) {
  const absent = `  <p class="empty-inline">Not derivable statically &mdash; the design-system catalog carries no typography tokens</p>`;
  if (!typography) return absent;
  if (!Array.isArray(typography)) {
    const entries = Object.entries(typography);
    if (!entries.length) return absent;
    return dimenSubTableHtml(entries.map(([name, value]) => ({ name, value: String(value) })));
  }
  if (!typography.length) return absent;
  const px = (v) => {
    const n = Number.parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };
  const rows = typography
    .map((spec) => {
      const size = px(spec.size);
      const weight = Number.isFinite(Number(spec.weight)) ? Number(spec.weight) : 400;
      const tracking = spec.tracking == null ? null : px(spec.tracking);
      const style = [
        size == null ? null : `font-size:${size}px`,
        `font-weight:${weight}`,
        px(spec.lineHeight) == null ? null : `line-height:${px(spec.lineHeight)}px`,
        tracking == null ? null : `letter-spacing:${tracking}px`,
      ]
        .filter(Boolean)
        .join(";");
      const numbers = [
        spec.size ? `${spec.size}` : null,
        `w${weight}`,
        spec.lineHeight ? `lh ${spec.lineHeight}` : null,
        spec.tracking == null ? "tracking unset" : `tracking ${spec.tracking}`,
      ]
        .filter(Boolean)
        .join(" &middot; ");
      return `      <tr>
        <td class="ramp-name"><code>${esc(spec.name ?? "—")}</code></td>
        <td class="ramp-specimen"><span style="${style}">Ag</span></td>
        <td class="ramp-numbers">${numbers}</td>
      </tr>`;
    })
    .join("\n");
  return `  <table class="doc-table type-ramp">
    <tbody>
${rows}
    </tbody>
  </table>`;
}

export function designLanguageBodyHtml(ds, meta = {}) {
  const genesisMode = meta.artifactStatus === "unreviewed" || meta.artifactStatus === "reopened";
  const candidatesSection = genesisMode
    ? `\n  <h3>Design-language candidates</h3>\n${candidatesStripHtml(meta.variants)}`
    : "";
  if (!ds || !ds.available) {
    return `<div class="empty">
      <p>No design-system catalog available yet.</p>
      <p>Produce one by letting the preview gallery render at least once (writes
      <code>composeApp/build/previews/design-system.json</code>), or connect a running
      DEBUG build (<code>connect_live</code>) so it can be read live from
      <code>/inspect/design-system</code>.</p>
    </div>${candidatesSection}`;
  }
  const colors = (ds.catalog && ds.catalog.colors) || {};
  const dimens = (ds.catalog && ds.catalog.dimens) || {};
  const typography = ds.catalog && ds.catalog.typography;
  const sourceLabel =
    ds.source === "live" ? "running app (GET /inspect/design-system)" : "composeApp/build/previews/design-system.json";

  const { spacing, radius, elevation, other } = classifyDimens(dimens);
  const dimenSections = [];
  if (Object.keys(dimens).length === 0) {
    dimenSections.push(`  <h3>Spacing &amp; shape</h3>\n  <p class="empty-inline">no dimens declared</p>`);
  } else {
    if (spacing.length) dimenSections.push(`  <h3>Spacing scale</h3>\n${spacingScaleHtml(spacing)}`);
    if (radius.length) dimenSections.push(`  <h3>Corner radii</h3>\n${dimenSubTableHtml(radius)}`);
    if (elevation.length) dimenSections.push(`  <h3>Elevation</h3>\n${dimenSubTableHtml(elevation)}`);
    if (other.length) dimenSections.push(`  <h3>Other dimensions</h3>\n${dimenSubTableHtml(other)}`);
  }

  const typeRamp = typeRampHtml(typography);

  return `  <p class="meta">source: ${esc(sourceLabel)}</p>
  <h3>Color tokens</h3>
${colorTokenTableHtml(colors, meta.usage)}
  <h3>Contrast &mdash; WCAG 2.2</h3>
${contrastMatrixHtml(colors)}
${dimenSections.join("\n")}
  <h3>Type ramp</h3>
${typeRamp}${candidatesSection}`;
}

/**
 * The genesis candidates strip (§2): each stashed variant's name + its
 * stashed screen renders side by side (served via the existing /previews/
 * static route — a variant's PNGs live under
 * composeApp/build/previews/variants/<name>/<screenId>/screen.png, same
 * layout as a normal render generation, just nested one level deeper), plus
 * a Pick button. No candidates yet is an honest empty state, not an error —
 * the strip is only ever shown in genesis mode (caller's concern), so this
 * function itself doesn't need to know why it's being asked to render.
 */
function candidatesStripHtml(variants) {
  if (!variants || !variants.available || !variants.variants || variants.variants.length === 0) {
    return `<div class="empty">
      <p>No design-language candidates stashed yet.</p>
      <p>Edit <code>Tokens.kt</code>, let the preview re-render, then stash the result with the
      <code>snapshot_variant</code> tool (e.g. <code>{name: "warmer"}</code>) — repeat per idea, then
      compare them here and Pick one.</p>
    </div>`;
  }
  const cards = variants.variants
    .map((v) => {
      const shots = v.screens
        .map(
          (s) => `        <div class="candidate-shot">
          <img alt="${escAttr(v.name)} — ${escAttr(s.id)}" src="/previews/${escAttr(s.png)}">
          <p class="lbl">${esc(s.id)}</p>
        </div>`,
        )
        .join("\n");
      return `    <div class="candidate-card">
      <h4>${esc(v.name)}</h4>
      <div class="candidate-shots">
${shots || '        <p class="empty-inline">no screens stashed for this candidate</p>'}
      </div>
      <button type="button" class="pick-btn" data-variant="${escAttr(v.name)}">Pick &ldquo;${esc(v.name)}&rdquo;</button>
    </div>`;
    })
    .join("\n");
  return `  <div class="candidates-strip">
${cards}
  </div>
  <div id="pick-error" class="banner" hidden></div>`;
}

function shortDate(iso) {
  return iso ? esc(String(iso)) : "";
}

/**
 * The approval/drift badge for a component card — the WHOLE `components`
 * artifact's live status (one hash covers every file in the registry glob),
 * plus, when the artifact is `changed-since-approval`, THIS card's own
 * mtime-based drift evidence (component-drift.mjs) — "shown ON the affected
 * component cards, not just a banner" (CV-1 W3b). No approval data at all
 * (older scaffold, or approvals unavailable) renders NOTHING — silence, not
 * a fabricated "unreviewed" claim.
 * @param {object|null|undefined} approval the components artifact's status record
 * @param {{available: boolean, byFile?: object}} [drift]
 * @param {string} file this card's own file (for the per-file drift lookup)
 */
function componentApprovalBadgeHtml(approval, drift, file) {
  if (!approval) return "";
  const s = approval.status;
  if (s === "approved") {
    const unshaped = approval.mode === "defaults-accepted";
    return `<span class="badge badge-approved${unshaped ? " badge-unshaped" : ""}" title="components artifact approved at ${shortDate(approval.approvedAt)}">approved &middot; ${shortHash(approval.hash)}</span>`;
  }
  if (s === "changed-since-approval") {
    const perFile = drift && drift.available ? drift.byFile && drift.byFile[file] : null;
    const fileNote =
      perFile && perFile.modifiedSinceApproval === true
        ? `<span class="badge badge-changed" title="this file's mtime is after the components artifact's approvedAt">likely changed (mtime)</span>`
        : perFile && perFile.modifiedSinceApproval === false
          ? `<span class="badge badge-approved" title="this file's mtime is at/before the components artifact's approvedAt">unchanged since approval (mtime)</span>`
          : "";
    return `<span class="badge badge-changed" title="the components artifact hash no longer matches its stored approval">drift &middot; artifact changed since approval</span>${fileNote}`;
  }
  if (s === "reopened") {
    return `<span class="badge badge-reopened">reopened for redesign</span>`;
  }
  return `<span class="badge badge-unreviewed">not yet approved</span>`;
}

/**
 * The signature as a params TABLE — name / type / default / notes, the form
 * a library reference actually documents an API in. Parameter ORDER is
 * preserved exactly as declared (the Compose guidelines ordering
 * `component-system-deep-dive.md` §2 cites: required -> modifier ->
 * optional -> trailing slot — this table shows what the source declares,
 * never a reordered "ideal"). Notes come from the component's own KDoc
 * `@param` tags (components.mjs parseKdocSections); a parameter without one
 * gets an empty cell, never invented prose. No default value in the source
 * means the parameter is required — stated as such, a derived fact.
 * @param {Array<{raw: string, name: string, type: (string|null), default: (string|null)}>} paramsParsed
 * @param {Record<string, string>} [paramDocs]
 */
function paramsTableHtml(paramsParsed, paramDocs = {}) {
  if (!paramsParsed || paramsParsed.length === 0) {
    return `<p class="meta">takes no parameters</p>`;
  }
  const rows = paramsParsed
    .map((p) => {
      const type = p.type
        ? `<code>${esc(p.type)}</code>`
        : `<span class="empty-inline">not parsed</span>`;
      const def = p.default
        ? `<code>${esc(p.default)}</code>`
        : `<span class="param-required">required</span>`;
      const note = paramDocs[p.name] ? esc(paramDocs[p.name]) : "";
      return `    <tr><td><code>${esc(p.name)}</code></td><td>${type}</td><td>${def}</td><td class="param-note">${note}</td></tr>`;
    })
    .join("\n");
  return `<table class="params-table">
    <thead><tr><th>Parameter</th><th>Type</th><th>Default</th><th>Notes</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

/**
 * The "state contract" bullet list — every fact components.mjs's deriveFacts
 * found IN THIS COMPONENT'S OWN BODY, positive-evidence-only (§ anti-slop:
 * evidence-or-silence — a fact not found is simply not listed, never
 * rendered as a "does NOT" claim). Returns "" when nothing was found, so the
 * caller can omit the whole subsection rather than showing an empty header.
 * @param {object} facts components.mjs's per-component `facts`
 * @param {boolean} hasScreenTagParam derived from paramsParsed, not facts
 *   (facts only scans the body — the param itself is a signature fact)
 */
function stateContractHtml(facts, hasScreenTagParam) {
  const items = [];
  if (hasScreenTagParam) {
    items.push(
      facts.derivedTags && facts.derivedTags.length
        ? `owns testTags derived from <code>screenTag</code>: ${facts.derivedTags.map((t) => `<code>&lt;screenTag&gt;_${esc(t)}</code>`).join(", ")}`
        : `takes a required <code>screenTag</code> parameter (tag suffixes not found in this scan)`,
    );
  }
  if (facts.contentUiStateArms && facts.contentUiStateArms.length) {
    items.push(`renders <code>ContentUiState</code> arms: ${facts.contentUiStateArms.map((a) => `<code>${esc(a)}</code>`).join(", ")}`);
  }
  if (facts.a11yFloorEvidence && facts.a11yFloorEvidence.length) {
    items.push(`enforces the 48dp a11y touch-target floor (evidence: ${facts.a11yFloorEvidence.map((e) => `<code>${esc(e)}</code>`).join(", ")})`);
  }
  if (facts.insetsApis && facts.insetsApis.length) {
    items.push(`owns insets: ${facts.insetsApis.map((a) => `<code>${esc(a)}</code>`).join(", ")}`);
  }
  if (facts.tokensReferenced && facts.tokensReferenced.length) {
    items.push(`tokens: ${facts.tokensReferenced.map((t) => `<code>${esc(t)}</code>`).join(", ")}`);
  }
  if (facts.selfReportsDesignToken) {
    items.push(`self-reports resolved values to the inspector (<code>designToken(...)</code>)`);
  }
  if (items.length === 0) return "";
  return `<p class="lbl">state contract</p><ul class="component-facts">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

/**
 * The component's OWN story render (§3.3) — the top of every entry's visual
 * strip: the `component.<kebab-name>` preview-registry entry rendered by the
 * same pipeline as every screen, labeled with its registry id. Changed
 * attribution keeps the Screens grid's vocabulary: a persistent
 * "changed #N" chip from `changedVersions` (no hover-compare here). A story
 * not in the current render states the absence in the standardized form —
 * never a broken image, never a fabricated thumbnail.
 * @param {string} name the component's composable name (AppHeader, …)
 * @param {Record<string, {id:string,title:string,png:string}>} [componentStories]
 *   preview-service.mjs's componentStoryCards(cards), keyed by kebab name
 * @param {number} [version] current render generation (PNG cache-buster)
 * @param {Record<string, number>} [changedVersions] screen/story id -> render # last changed
 */
function componentStoryHtml(name, componentStories, version, changedVersions) {
  const id = componentStoryId(name);
  const kebab = id.slice("component.".length);
  const card = componentStories ? componentStories[kebab] : undefined;
  if (!card) {
    return `  <div class="component-story">
    <p class="lbl">story render &mdash; <code>${esc(id)}</code></p>
    <p class="empty-inline">no story render yet &mdash; run the preview render to produce <code>${esc(id)}</code></p>
  </div>`;
  }
  const changedIn = changedVersions ? changedVersions[card.id] : undefined;
  const chip = changedIn ? ` <span class="chg">changed #${Number(changedIn)}</span>` : "";
  const buster = version ? `?v=${Number(version)}` : "";
  return `  <div class="component-story">
    <p class="lbl">story render &mdash; <code>${esc(card.id)}</code>${chip}</p>
    <img alt="${escAttr(card.id)} story render" src="/previews/${escAttr(card.png)}${buster}">
  </div>`;
}

// A component's state suffix -> the preview-registry variant suffix(es) that
// would exercise it live (CV-1 W3b: "@loading/@empty/@error variants ...
// integrate defensively"). Keyed off derivedTags (the `${screenTag}_xxx` tag
// suffix the component itself emits) rather than a hardcoded component-name
// map, so a renamed/added component that emits e.g. `_empty` is picked up
// the same way EmptyState is, with no per-component special-casing.
const STATE_TAG_TO_VARIANT = { loading: "loading", empty: "empty", error: "error", retry: "error" };

/**
 * Live variant renders for a state-owning component (CV-1 W3b): thumbnails
 * from any CURRENTLY RENDERED `<screen>@<state>` preview-registry entry whose
 * state matches one of this component's own derived tag suffixes. The
 * `@loading/@empty/@error` variants are being registered by a parallel wave
 * (docs/proposals/component-system-deep-dive.md §6.5) — this degrades
 * HONESTLY when none exist yet (never an error, never a fabricated
 * thumbnail), and picks them up automatically once they land (no re-wiring
 * needed here). Components with no state-suffix tags at all (e.g.
 * `ScreenColumn`, `AppHeader`) render nothing — there is no state to show.
 * @param {string[]} derivedTags this component's own `facts.derivedTags`
 * @param {{loading: object[], empty: object[], error: object[]}} [stateVariants]
 *   preview-service.mjs's stateVariantCards(cards) — grouped by state suffix
 */
function liveVariantsHtml(derivedTags, stateVariants) {
  const states = [...new Set((derivedTags || []).map((t) => STATE_TAG_TO_VARIANT[t]).filter(Boolean))].sort();
  if (states.length === 0) return "";
  const sv = stateVariants || {};
  const blocks = states.map((state) => {
    const entries = sv[state] || [];
    if (entries.length === 0) {
      return `    <div class="state-variant-block">
      <p class="lbl">live &#64;${esc(state)} render</p>
      <p class="empty-inline">Not derivable statically &mdash; no <code>@${esc(state)}</code> preview-registry entry has rendered yet</p>
    </div>`;
    }
    const thumbs = entries
      .map(
        (v) => `<div class="state-variant-thumb"><img alt="${escAttr(v.id)}" src="/previews/${escAttr(v.png)}"><p class="lbl">${esc(v.id)}</p></div>`,
      )
      .join("");
    return `    <div class="state-variant-block">
      <p class="lbl">live &#64;${esc(state)} render</p>
      <div class="state-variant-thumbs">${thumbs}</div>
    </div>`;
  });
  return `  <div class="component-live-variants">\n${blocks.join("\n")}\n  </div>`;
}

/**
 * The used-in list, screens FIRST — "which screens compose it" is the
 * used-in question a library reference answers before anything else. A
 * screen that ALSO hand-rolls a state this component owns (the ARCH-11
 * mirror, handrolled-state.mjs) gets a violation chip inline at the
 * offending reference — never just a banner.
 * @param {string[]} usedIn full used-in list
 * @param {string[]} usedInScreens the screen subset
 * @param {Map<string, object>} violationsByFile file -> handrolled-state.mjs violation entry
 */
function usedInHtml(usedIn, usedInScreens, violationsByFile) {
  if (!usedIn || usedIn.length === 0) {
    return `<p class="empty-inline">no call sites found under presentation/**</p>`;
  }
  const screenSet = new Set(usedInScreens || []);
  const ordered = [...usedIn].sort(
    (a, b) => Number(screenSet.has(b)) - Number(screenSet.has(a)) || a.localeCompare(b),
  );
  const items = ordered
    .map((f) => {
      const v = violationsByFile.get(f);
      const chip = v
        ? `<span class="badge badge-changed violation-chip" title="hand-rolls ${esc(v.indicators.map((i) => i.name).join(", "))} directly instead of via the components registry">&#9888; hand-rolled state</span>`
        : "";
      const kind = screenSet.has(f) ? `<span class="badge badge-open">screen</span>` : "";
      return `<li><code>${esc(f)}</code> ${kind}${chip}</li>`;
    })
    .join("");
  return `<ul class="component-used-in">${items}</ul>`;
}

/**
 * The Components section body (§3.3) — the platform engineer's library
 * reference, one document entry per component in library-docs order: the
 * component's own story render first (its `component.<kebab>` registry entry,
 * componentStoryHtml), then any live @state previews matched via the
 * component's own derived tags · the component's own KDoc description verbatim · the
 * signature as a params table (notes from KDoc @param) · the state contract
 * and what the component owns (derived facts, evidence-or-silence) ·
 * used-in, screens first, with hand-rolled-state violation chips at the
 * offending reference. Approval/drift chips per entry. A signature the
 * scanner couldn't parse cleanly shows name + file + "signature not parsed"
 * — never a guessed parameter list.
 * @param {{available: boolean, reason?: string, components?: Array<object>}} [components]
 * @param {{approval?: object|null, drift?: object, violations?: object, stateVariants?: object}} [meta]
 */
export function componentsBodyHtml(components, meta = {}) {
  if (!components || !components.available) {
    return `<div class="empty">
      <p>No components scan available yet.</p>
      <p>${esc(
        (components && components.reason) ||
          "No presentation/components directory found in this project.",
      )}</p>
    </div>`;
  }
  if (!components.components || components.components.length === 0) {
    return `<div class="empty-inline">no @Composable components found in presentation/components/*.kt</div>`;
  }
  const violationsByFile = new Map(
    meta.violations && meta.violations.available ? meta.violations.violations.map((v) => [v.file, v]) : [],
  );
  const entries = components.components
    .map((c) => {
      const head = `<header class="component-head">
      <h3>${esc(c.name)}${commentControlHtml({ type: "design-system", token: `component:${c.name}` })}</h3>
      ${componentApprovalBadgeHtml(meta.approval, meta.drift, c.file)}
    </header>
    <p class="meta component-file"><code>${esc(c.file)}</code></p>`;
      // The story render is scan-independent evidence (it comes from the
      // render pipeline, not the signature parser), so it shows on
      // parse-error entries too.
      const storyHtml = componentStoryHtml(c.name, meta.componentStories, meta.version, meta.changedVersions);
      if (c.parseError) {
        return `  <article class="component-entry">
    ${head}
    ${storyHtml}
    <p class="unresolvable-note">signature not parsed &mdash; showing name and file only</p>
  </article>`;
      }
      const paramsParsed = c.paramsParsed || [];
      const facts = c.facts || {};
      const hasScreenTagParam = paramsParsed.some((p) => p.name === "screenTag");
      // The description part of the component's own doc comment, verbatim
      // (@param tags render in the table above, not re-quoted here). Older
      // scan data without kdocDescription falls back to the full kdoc.
      const doc = c.kdocDescription ?? c.kdoc;
      const kdocHtml = doc
        ? `<p class="lbl">usage notes &mdash; from the component's own doc comment</p><blockquote class="component-kdoc">${esc(doc)}</blockquote>`
        : "";
      // Entry order is the Storybook/Material-docs reading order: visual
      // states first, then the component's own words, then the API table,
      // then the derived contract and call sites.
      return `  <article class="component-entry">
    ${head}
    ${storyHtml}
    ${liveVariantsHtml(facts.derivedTags, meta.stateVariants)}
    ${kdocHtml}
    <p class="lbl">signature</p>
    ${paramsTableHtml(paramsParsed, c.paramDocs || {})}
    ${stateContractHtml(facts, hasScreenTagParam)}
    <p class="lbl">used in</p>${usedInHtml(c.usedIn, c.usedInScreens, violationsByFile)}
  </article>`;
    })
    .join("\n");
  return `<div class="component-list">
${entries}
</div>
${promotionQueueHtml(components.ungoverned)}`;
}

/**
 * The PROMOTION QUEUE — the drift half of the Components section: composables your
 * screens define OUTSIDE the registry, each with signals only (cross-feature use,
 * composes-registry hint). Deliberately verdict-free: promote-vs-keep-local is the
 * agent's rubric call (ARCHITECTURE.md §7, the five questions), ratified at the
 * Components approval — this surface exists so nothing stays invisible to that call,
 * and so the human reviewing the approval can challenge a call without re-deriving
 * the inventory.
 */
export function promotionQueueHtml(ungoverned) {
  if (!Array.isArray(ungoverned)) return "";
  if (ungoverned.length === 0) {
    return `<section class="promotion-queue">
  <h3>In your screens, not in the registry</h3>
  <p class="meta">none &mdash; every screen composable is either governed or a *Screen/*Route seam wrapper.</p>
</section>`;
  }
  const rows = ungoverned
    .map(
      (u) => `    <tr>
      <td><code>${esc(u.name)}</code></td>
      <td><code>${esc(u.file)}</code></td>
      <td>${esc(u.feature)}</td>
      <td>${u.crossFeatureUseCount > 0 ? `<strong>${u.crossFeatureUseCount}</strong>` : "0"}</td>
      <td>${u.composesRegistry ? "composes registry components" : "self-contained"}</td>
    </tr>`,
    )
    .join("\n");
  return `<section class="promotion-queue">
  <h3>In your screens, not in the registry &mdash; the promotion queue</h3>
  <p class="meta">Ungoverned composables (seam wrappers excluded). Signals only &mdash; whether each
  is promoted, kept local, or generalized is a judgment call made against the inclusion rubric
  (ARCHITECTURE.md &sect;7) and ratified at the Components approval. Cross-feature use is a signal,
  never the rule.</p>
  <table class="params-table">
    <thead><tr><th>composable</th><th>file</th><th>feature</th><th>cross-feature uses</th><th>composition</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</section>`;
}

/**
 * The Approvals tab: every governed artifact, its §1 order number, live status,
 * file count, hash/approvedAt, and an Approve button (disabled + marked
 * "unresolvable" when `resolvable === false`, mirroring qa/approve.mjs --status).
 * @param {{available: boolean, error?: string, statuses?: object[]}} approvals
 */
export function approvalsTabHtml(approvals, meta = {}) {
  if (!approvals || !approvals.available) {
    const detail = approvals && approvals.error
      ? esc(approvals.error)
      : "This looks like an older scaffold that predates the approvals wave (no qa/lib/approvals.mjs).";
    return `<div class="empty">
      <p>Approvals are not available in this project.</p>
      <p>${detail}</p>
    </div>`;
  }
  if (!approvals.statuses || approvals.statuses.length === 0) {
    return `<div class="empty"><p>No governed artifacts resolved in this project yet.</p></div>`;
  }
  const rows = approvals.statuses
    .map((s) => {
      // `reopened` (§2 "Reopen for redesign") is a DELIBERATE state, visually
      // distinct from unreviewed — never collapsed into badge-unreviewed even
      // though the gate treats them the same (SKIP, non-blocking). An older
      // project lib that predates reopen simply never reports this status, so
      // this branch is dead code there — no fabrication either way.
      const unshaped = s.status === "approved" && s.mode === "defaults-accepted";
      const badgeClass = [
        s.status === "approved"
          ? "badge-approved"
          : s.status === "changed-since-approval"
            ? "badge-changed"
            : s.status === "reopened"
              ? "badge-reopened"
              : "badge-unreviewed",
        unshaped ? "badge-unshaped" : "",
      ]
        .filter(Boolean)
        .join(" ");
      // §2 express lane: "approved · defaults accepted — unshaped" is the
      // human-facing label for status approved + mode defaults-accepted —
      // distinct wording from a shaped approval, per §2's "visually distinct
      // from a shaped approval". A real approval later clears `mode`, which
      // falls straight back to the plain "approved" label below.
      const statusLabel = unshaped ? "approved · defaults accepted — unshaped" : s.status;
      // `resolvable` may be `undefined` against an older project-side approvals.mjs
      // that predates the field (a stale pre-approvals-refinement scaffold) — treat
      // that the same as "resolvable" (never FABRICATE an "unresolvable" claim the
      // library didn't make); only an explicit `false` counts as unresolvable, same
      // check the disabled-button / unresolvableNote logic below already uses.
      const unresolvable = s.resolvable === false;
      const hashInfo =
        s.status === "changed-since-approval"
          ? unresolvable
            ? `approved ${shortHash(s.storedHash)} &rarr; unresolvable`
            : `approved ${shortHash(s.storedHash)} &rarr; now ${shortHash(s.hash)}`
          : s.status === "approved"
            ? shortHash(s.hash)
            : unresolvable
              ? "unresolvable"
              : `would approve at ${shortHash(s.hash)}`;
      const unresolvableNote =
        s.resolvable === false
          ? `<p class="unresolvable-note">unresolvable (${s.fileCount} of expected files resolved) — not approvable</p>`
          : "";
      const missingNote =
        s.missing && s.missing.length > 0 ? `<p class="missing-note">missing: ${esc(s.missing.join(", "))}</p>` : "";
      const btnLabel = s.status === "approved" ? "Re-approve" : "Approve";
      // §2/§3 Reopen control: beside Re-approve on approved rows only — reopening
      // the unreviewed/reopened/changed-since-approval is meaningless (the
      // library refuses it too; the button just never offers it here). Always
      // rendered when approved (never conditioned on lib support the tab data
      // can't see) — the honest degrade lives in the bridge/endpoint: an older
      // lib without reopenArtifact surfaces its refusal in #approve-error on
      // click, never a crash (GENESIS-FLOW-DESIGN.md §3 "honest degrade").
      const reopenBtn =
        s.status === "approved"
          ? `<button class="reopen-btn" data-artifact="${esc(s.id)}">Reopen</button>`
          : "";
      // B5 — approval-anchored diff: on a changed-since-approval row, the drift
      // is shown AGAINST THE APPROVED BYTES (anchor located by hash match in
      // git history, hashed with the project's own library). When the anchor
      // can't be found, the honest reason renders instead — the chip alone
      // said "something changed"; this says WHAT, or exactly why it can't.
      const anchored = meta.anchoredDiffs ? meta.anchoredDiffs[s.id] : null;
      const diffRow =
        s.status === "changed-since-approval" && anchored
          ? anchored.available
            ? `    <tr class="approval-diff-row"><td colspan="6"><details>
      <summary>diff against approved bytes (anchor ${esc(anchored.anchorSha)} · ${esc(anchored.anchorWhen || "")}${anchored.truncated ? " · truncated" : ""})</summary>
      <pre class="approval-diff">${esc(anchored.diff)}</pre>
    </details></td></tr>`
            : `    <tr class="approval-diff-row"><td colspan="6"><p class="empty-inline">anchored diff unavailable &mdash; ${esc(anchored.reason)}</p></td></tr>`
          : "";
      return `    <tr class="approval-row" data-artifact="${esc(s.id)}">
      <td class="order-num">${orderNumber(s.id)}</td>
      <td>${esc(s.label)}<div class="artifact-id">${esc(s.id)}</div>${artifactBannerHtml(s)}</td>
      <td><span class="badge ${badgeClass}">${esc(statusLabel)}</span></td>
      <td>${s.fileCount}</td>
      <td>${hashInfo}${s.approvedAt ? `<div class="approved-at">${esc(s.approvedAt)}</div>` : ""}${unresolvableNote}${missingNote}</td>
      <td><button class="approve-btn" data-artifact="${esc(s.id)}"${s.resolvable === false ? " disabled" : ""}>${btnLabel}</button> ${reopenBtn}</td>
    </tr>
${diffRow}`;
    })
    .join("\n");
  return `  <table class="approvals-table">
    <thead><tr><th>#</th><th>Artifact</th><th>Status</th><th>Files</th><th>Hash / approved</th><th></th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <div id="approve-error" class="banner" hidden></div>`;
}

// --- Specs (§3.5) — the QA lead's traceability matrix ------------------------
//
// One RTM per spec file: clause ↔ prose ↔ citing test(s) ↔ gate ↔ last-receipt
// verdict, coverage counts stated at the top, withdrawn clauses struck-through
// and kept, orphans in BOTH directions surfaced as the defects they are. No
// prose padding — the matrix is the artifact.

/**
 * Which verify-lane gate enforces this clause's row — only mappings the lane
 * itself states, never a guess:
 * - ARCH-*: the `conformance` step (*ArchitectureConformanceTest — template/
 *   qa/verify.mjs names it as enforcing "specs/app-base.spec.md ARCH clauses").
 * - SHELL-04: the `a11y` step (its failure message names SHELL-04 explicitly).
 * - every other live clause: the `specCoverage` step — the bidirectional
 *   citation gate is exactly what this row's clause↔test link claims.
 * - withdrawn: no gate (coverage-exempt, mirroring stepSpecCoverage).
 * @returns {string|null} the receipt step name, or null for withdrawn clauses
 */
function gateForClause(c) {
  if (c.withdrawn) return null;
  if (/^ARCH-/i.test(c.id)) return "conformance";
  if (c.id === "SHELL-04") return "a11y";
  return "specCoverage";
}

/** The citing-tests cell: real file:line list, or the honest defect/exemption. */
function citingTestsCellHtml(c) {
  if (c.withdrawn) return `<span class="empty-inline">withdrawn &mdash; citation-exempt</span>`;
  if (c.citedBy && c.citedBy.length) {
    const items = c.citedBy
      .map((s) => `<li><code>${esc(s.file)}:${s.line}</code></li>`)
      .join("");
    return `<ul class="rtm-tests">${items}</ul>`;
  }
  if (c.cited) {
    // Older data with a `cited` flag but no citedBy sites (a caller that
    // didn't run the indexed scan): the coverage claim is real, the sites
    // aren't known here.
    return `<span class="empty-inline">covered &mdash; citing tests not indexed</span>`;
  }
  return `<span class="rtm-defect">defect &mdash; no citing test</span>`;
}

/**
 * The Specs section body (§3.5). `meta.lastReceipt` (receipt-bridge.mjs's
 * getLastReceipt() result) drives the per-clause last-receipt column via each
 * row's own gate; omitted, every row shows the honest "no receipt yet".
 * `specs.orphanCitations` (specs.mjs) renders the reverse-direction defects;
 * when the field is absent (older data), the block is silent rather than
 * claiming a clean scan that never ran.
 * @param {{available: boolean, files?: Array<{file: string, clauses: object[]}>, orphanCitations?: object[]}} specs
 * @param {{lastReceipt?: object|null}} [meta]
 */
export function specsTabHtml(specs, meta = {}) {
  if (!specs || !specs.available) {
    return `<div class="empty"><p>No specs/ directory found in this project.</p></div>`;
  }
  const matrices = specs.files
    .map((f) => {
      const live = f.clauses.filter((c) => !c.withdrawn);
      const covered = live.filter((c) => c.cited).length;
      const withdrawn = f.clauses.length - live.length;
      const uncovered = live.length - covered;
      const counts = [
        `${f.clauses.length} clause${f.clauses.length === 1 ? "" : "s"}`,
        `${covered} covered`,
        `${withdrawn} withdrawn`,
        uncovered ? `<span class="rtm-defect">${uncovered} uncovered</span>` : null,
      ]
        .filter(Boolean)
        .join(" &middot; ");
      const rows = f.clauses
        .map((c) => {
          const prose = esc(c.prose);
          const gate = gateForClause(c);
          return `    <tr class="rtm-row${c.withdrawn ? " rtm-withdrawn" : ""}">
      <td><span class="clause-id"><code>${esc(c.id)}</code></span>${commentControlHtml({ type: "spec-line", file: `specs/${f.file}`, clauseId: c.id })}</td>
      <td class="rtm-prose">${c.withdrawn ? `<s>${prose}</s>` : prose}</td>
      <td>${citingTestsCellHtml(c)}</td>
      <td class="rtm-gate">${gate ? `<code>${esc(gate)}</code>` : `<span class="empty-inline">&mdash;</span>`}</td>
      <td>${gate ? stepReceiptCellHtml(meta.lastReceipt, gate) : `<span class="empty-inline">&mdash;</span>`}</td>
    </tr>`;
        })
        .join("\n");
      return `  <div class="spec-file">
    <h3>specs/${esc(f.file)}</h3>
    <p class="rtm-counts">${counts}</p>
    ${
      rows
        ? `<table class="doc-table rtm-table">
    <thead><tr><th>Clause</th><th>Requirement</th><th>Citing tests</th><th>Gate</th><th>Last receipt</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`
        : `<p class="empty-inline">no clauses parsed</p>`
    }
  </div>`;
    })
    .join("\n");

  // Reverse-direction orphans: a `SPEC:` tag pointing at a withdrawn or
  // nonexistent clause. `undefined` means the indexed scan didn't run
  // (older caller data) — silence, never a fabricated "clean".
  let orphansHtml = "";
  if (Array.isArray(specs.orphanCitations)) {
    orphansHtml = specs.orphanCitations.length
      ? `  <div class="rtm-orphans">
    <h3>Citation defects</h3>
    <ul class="rtm-defect-list">
${specs.orphanCitations
  .map(
    (o) => `      <li class="rtm-defect-item">
        <code>${esc(o.file)}:${o.line}</code> cites <code>${esc(o.id)}</code>
        <span class="badge badge-changed">${esc(o.reason)}</span>
      </li>`,
  )
  .join("\n")}
    </ul>
  </div>`
      : `  <p class="empty-inline">no citation defects &mdash; every <code>SPEC:</code> tag cites a live clause</p>`;
  }
  return `${matrices}
${orphansHtml}`;
}

// --- Architecture tab (§7.1, rebuilt to the AD-1 three-in-one standard) -----
//
// Mirrors template/docs/ARCHITECTURE.md's own section shape (authored form):
// purpose & quality goals, system context, platform & deployment view,
// building blocks (layer map + observed dependency arrows + the governed
// contract), runtime view, crosscutting policies, decisions, and the exemplar
// feature shape. Every fact is either a real tree walk (layer map, dependency
// graph) or a structural parse of the doc itself (tables verbatim, prose
// rendered through the small markdown-to-html helpers below) — never
// paraphrased, never fabricated. A missing source degrades to an honest
// inline note, section by section, so one missing table never hides the rest.

/** Escape, then apply the doc's own inline markdown (bold/code/links) — safe because escaping runs first. */
function inlineMdHtml(text) {
  let s = esc(String(text));
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Markdown links -> plain text: the console has no route for docs/adr/* files,
  // so a live link would be dead weight (or worse, a broken href in the console).
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return s;
}

/** A GFM table (already parsed by architecture.mjs) as an HTML table — inline markdown per cell. */
function mdTableHtml(table) {
  if (!table || !table.available) {
    return `<p class="empty-inline">${esc((table && table.reason) || "not available")}</p>`;
  }
  const head = `<tr>${table.headers.map((h) => `<th>${inlineMdHtml(h)}</th>`).join("")}</tr>`;
  const body = table.rows
    .map((r) => `<tr>${r.map((c) => `<td>${inlineMdHtml(c)}</td>`).join("")}</tr>`)
    .join("\n");
  return `<table class="doc-table"><thead>${head}</thead><tbody>\n${body}\n</tbody></table>`;
}

/**
 * A small, deliberately non-exhaustive markdown block renderer for
 * doc-section prose (runtime view, crosscutting policies) — paragraphs,
 * `### ` subheadings, bullet/numbered lists (with indented continuation
 * lines folded into the current item), fenced code blocks, and blockquotes.
 * Not a full CommonMark implementation (no nested lists, no tables — those
 * are parsed structurally by architecture.mjs instead); good enough to
 * render this project's own doc faithfully without pulling in a markdown
 * dependency. Every text span still runs through inlineMdHtml, so escaping
 * is never skipped.
 */
function mdProseHtml(md) {
  if (!md || !md.trim()) return "";
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let para = [];
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMdHtml(para.join(" "))}</p>`);
      para = [];
    }
  };
  const consumeList = (marker) => {
    const items = [];
    while (i < lines.length) {
      const raw = lines[i];
      const t = raw.trim();
      if (marker === "ul" ? /^[-*]\s+/.test(t) : /^\d+\.\s+/.test(t)) {
        items.push(t.replace(marker === "ul" ? /^[-*]\s+/ : /^\d+\.\s+/, ""));
        i++;
      } else if (t !== "" && /^\s/.test(raw) && items.length) {
        items[items.length - 1] += ` ${t}`;
        i++;
      } else {
        break;
      }
    }
    return items;
  };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === "") {
      flushPara();
      i++;
      continue;
    }
    if (t.startsWith("```")) {
      flushPara();
      i++;
      const code = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(`<pre class="doc-code">${esc(code.join("\n"))}</pre>`);
      continue;
    }
    if (/^####?\s+/.test(t)) {
      flushPara();
      const level = t.startsWith("####") ? 5 : 4;
      out.push(`<h${level}>${inlineMdHtml(t.replace(/^####?\s+/, ""))}</h${level}>`);
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      flushPara();
      const items = consumeList("ul");
      out.push(`<ul class="doc-list">${items.map((it) => `<li>${inlineMdHtml(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      flushPara();
      const items = consumeList("ol");
      out.push(`<ol class="doc-list">${items.map((it) => `<li>${inlineMdHtml(it)}</li>`).join("")}</ol>`);
      continue;
    }
    if (t.startsWith(">")) {
      flushPara();
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote class="doc-quote">${inlineMdHtml(quote.join(" "))}</blockquote>`);
      continue;
    }
    para.push(t);
    i++;
  }
  flushPara();
  return out.join("\n");
}

function docSectionProseHtml(section) {
  if (!section || !section.available) {
    return `<p class="empty-inline">${esc((section && section.reason) || "docs/ARCHITECTURE.md not found")}</p>`;
  }
  return `<div class="doc-prose">${mdProseHtml(section.body)}</div>`;
}

/**
 * C4 level 1 as clean CSS boxes (§3.2), derived from the doc's OWN
 * integration table: the app in the center, one box per integration row
 * (first cell = the name, second = the doc's own "what" text), connected by
 * plain stems. No direction is drawn on the connectors — the table states
 * WHAT each integration is, not who calls whom, and a fabricated arrowhead
 * would be a claim the source doesn't make. The table itself stays below as
 * the detailed record; with no table, there is no diagram (the brief's "don't
 * force a diagram from thin data").
 */
function contextDiagramHtml(table) {
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) return "";
  const nodes = table.rows
    .filter((r) => r[0])
    .map(
      (r) => `      <div class="ctx-node">
        <h5>${inlineMdHtml(r[0])}</h5>
        ${r[1] ? `<p>${inlineMdHtml(r[1])}</p>` : ""}
      </div>`,
    )
    .join("\n");
  if (!nodes) return "";
  return `  <div class="ctx-diagram">
    <div class="ctx-app">This app</div>
    <div class="ctx-nodes">
${nodes}
    </div>
  </div>`;
}

function systemContextHtml(sc) {
  if (!sc || !sc.available) {
    return `<p class="empty-inline">${esc((sc && sc.reason) || "docs/ARCHITECTURE.md not found")}</p>`;
  }
  const intro = sc.intro ? `<p>${inlineMdHtml(sc.intro)}</p>` : "";
  const diagram = sc.table ? contextDiagramHtml(sc.table) : "";
  const table = sc.table
    ? mdTableHtml({ available: true, headers: sc.table.headers, rows: sc.table.rows })
    : `<p class="empty-inline">no integration table found under "${esc(sc.heading)}"</p>`;
  return `${intro}${diagram}${table}`;
}

/**
 * §2 as spec + mirror at once. The authored bullets are the constraint; the
 * version-set table under them is the SAME set read live from
 * `gradle/libs.versions.toml`, with the version §2's prose claims beside it.
 * A row where those two disagree is drift the doc cannot see about itself —
 * §2 tags its own version rule `[advisory — no version-drift gate ships
 * yet]`, so this table is the eyes that rule does not have. The KSP
 * `<kotlin>-<ksp>` invariant §2 states in bold is checked against the live
 * values, never against the prose.
 * @param {object} versionSet architecture.mjs's doc.versionSet
 */
function versionSetHtml(versionSet) {
  if (!versionSet || !versionSet.available) {
    return `<p class="empty-inline">${esc((versionSet && versionSet.reason) || "gradle/libs.versions.toml not readable")}</p>`;
  }
  const badge = (status) => {
    if (status === "match") return `<span class="glyph glyph-signed">&#10003;</span> pinned as documented`;
    if (status === "drift") return `<span class="glyph glyph-drift">&#9888;</span> drift — the doc says otherwise`;
    if (status === "undocumented") return `<span class="glyph glyph-unsigned">&#9675;</span> not named in §2`;
    return `<span class="glyph glyph-drift">&#9888;</span> missing from the catalog`;
  };
  const rows = versionSet.rows
    .map(
      (r) => `      <tr>
        <td>${esc(r.library)}</td>
        <td><code>${esc(r.catalogVersion ?? "—")}</code></td>
        <td><code>${esc(r.docVersion ?? "—")}</code></td>
        <td>${badge(r.status)}</td>
      </tr>`,
    )
    .join("\n");
  const inv = versionSet.kspInvariant;
  const invLine = inv.available
    ? inv.ok
      ? `<p class="status-line"><span class="glyph glyph-signed">&#10003;</span> KSP is <code>&lt;kotlin&gt;-&lt;ksp&gt;</code> — <code>${esc(inv.ksp)}</code> carries Kotlin <code>${esc(inv.kotlin)}</code>.</p>`
      : `<p class="status-line"><span class="glyph glyph-drift">&#9888;</span> KSP <code>${esc(inv.ksp)}</code> is not prefixed by Kotlin <code>${esc(inv.kotlin)}</code> — Room's KMP native compilation breaks on this.</p>`
    : `<p class="empty-inline">${esc(inv.reason)}</p>`;
  return `  <h4>The frozen set, as pinned</h4>
  <table class="doc-table">
    <thead><tr><th>Library</th><th>${esc("gradle/libs.versions.toml")}</th><th>§2 says</th><th>Verdict</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
${invLine}`;
}

function platformViewHtml(pv) {
  if (!pv || !pv.available) {
    return `<p class="empty-inline">${esc((pv && pv.reason) || "docs/ARCHITECTURE.md not found")}</p>`;
  }
  const main = mdTableHtml({ available: true, headers: pv.headers, rows: pv.rows });
  const expectActual = pv.expectActual
    ? `<h4>Expect/actual boundary</h4>${mdTableHtml({ available: true, headers: pv.expectActual.headers, rows: pv.expectActual.rows })}`
    : "";
  return `${main}${expectActual}`;
}

/**
 * The dependency graph (drift surface): every observed cross-layer edge, and
 * — where the governed contract's own clauses resolved forbidden edges (see
 * architecture.mjs's deriveLayerRules) — a violation badge on the offending
 * edge PLUS a file:line list underneath, exactly where a lead architect would
 * mark it up. `rulesApplied:false` (no governed contract to check against) is
 * shown as "unchecked", never silently reported as "clean".
 * @param {object} graph architecture.mjs's getDependencyGraph() result
 */
// Wave C item 2 (architecture-document-standard.md §6's risk row): the console's
// dependency graph is a live JS import scan between verify-lane runs — real,
// but not the gate. It must never be read as a verdict in its own right, so
// every rendered graph carries this line in the section's own vocabulary,
// right under the graph itself (never a top-of-tab banner — that visual
// weight is reserved for the artifact's own approval status).
const DEP_GRAPH_ADVISORY_HTML = `<p class="dep-advisory">Advisory preview; the lane is the law &mdash; this is a live scan of real imports between <code>node qa/verify.mjs</code> runs, not a verdict. The Kotlin conformance gates (and the receipt they write, below) are authoritative.</p>`;

function dependencyGraphHtml(graph) {
  if (!graph || !graph.available) {
    return `<div class="empty">
      <p>No dependency graph available.</p>
      <p>${esc((graph && graph.reason) || "composeApp/src/commonMain/kotlin not found.")}</p>
    </div>`;
  }
  if (graph.edges.length === 0) {
    return `<p class="empty-inline">no cross-layer imports observed under <code>${esc(graph.appPackage)}</code></p>
${DEP_GRAPH_ADVISORY_HTML}`;
  }
  const rows = graph.edges
    .map((e) => {
      const chip = e.violation
        ? `<span class="badge badge-changed violation-chip">violates ${esc(e.clauseId)}</span>`
        : "";
      return `    <li class="dep-edge${e.violation ? " dep-violation" : ""}">
      <code>${esc(e.from)}</code> &rarr; <code>${esc(e.to)}</code>
      <span class="dep-count">${e.count} import${e.count === 1 ? "" : "s"}</span>
      ${chip}
    </li>`;
    })
    .join("\n");
  const violationsHtml = graph.violations.length
    ? `  <div class="dep-violations">
    <p class="lbl">violations &mdash; file:line</p>
    <ul class="dep-violation-list">
${graph.violations
  .map(
    (v) => `      <li class="dep-violation-item">
        <code>${esc(v.file)}:${v.line}</code> imports <code>${esc(v.imported)}</code>
        <span class="badge badge-changed">${esc(v.from)} &rarr; ${esc(v.to)} violates ${esc(v.clauseId)}</span>
      </li>`,
  )
  .join("\n")}
    </ul>
  </div>`
    : graph.rulesApplied
      ? `  <p class="empty-inline">no layer violations observed</p>`
      : `  <p class="empty-inline">no governed layer rules could be derived (the governed contract is unavailable) &mdash; violations are unchecked, not clean</p>`;
  return `  <ul class="dep-edges">
${rows}
  </ul>
${violationsHtml}
${DEP_GRAPH_ADVISORY_HTML}`;
}

function layerMapHtml(layerMap) {
  if (!layerMap || !layerMap.available) {
    return `<div class="empty">
      <p>No layer map available.</p>
      <p>${esc((layerMap && layerMap.reason) || "composeApp/src/commonMain/kotlin not found.")}</p>
    </div>`;
  }
  const boxes = layerMap.layers
    .map(
      (l) => `    <div class="layer-box${l.present ? "" : " layer-empty"}">
      <h4>${esc(l.id)}${commentControlHtml({ type: "architecture", path: l.id })}</h4>
      <p class="layer-desc">${esc(l.label)}</p>
      ${
        l.present
          ? l.files.length
            ? `<ul class="layer-files">${l.files.map((f) => `<li><code>${esc(f)}</code></li>`).join("")}</ul>`
            : `<p class="empty-inline">no files</p>`
          : `<p class="empty-inline">directory not present</p>`
      }
    </div>`,
    )
    .join("\n");
  const others =
    layerMap.otherPackages && layerMap.otherPackages.length
      ? `  <div class="layer-others">
    <p class="lbl">other top-level packages</p>
    <ul class="layer-files">${layerMap.otherPackages
      .map((p) => `<li><code>${esc(p.name)}</code> (${p.files.length} file${p.files.length === 1 ? "" : "s"})</li>`)
      .join("")}</ul>
  </div>`
      : "";
  return `  <p class="meta">package <code>${esc(layerMap.appPackage)}</code> &middot; navigation lives under <code>presentation/navigation</code> (shown as part of presentation, below)</p>
  <div class="layer-map">
${boxes}
  </div>
${others}`;
}

/** How long ago, in the coarse "Xm/Xh/Xd ago" shape used across the console's badges. `null`/NaN renders as "age unknown" rather than a fabricated number. */
function formatReceiptAge(ageMs) {
  if (typeof ageMs !== "number" || Number.isNaN(ageMs)) return "age unknown";
  if (ageMs < 60_000) return "just now";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Per-ARCH-clause receipt status (architecture-document-standard.md §6, Wave C
 * item 1): the last verify-lane receipt's "conformance" step — the
 * *ArchitectureConformanceTest gate that enforces the ARCH-* clauses (see
 * receipt-bridge.mjs's getLastReceipt) — plus the receipt's age and whether
 * its inputsHash still matches the current tree. Scoped to ARCH-* clauses
 * only by the caller (governedContractHtml): SHELL-* clauses are enforced by
 * a different gate (a11y/e2eSmoke) this one receipt step doesn't attribute
 * per-clause, so they render without this badge rather than borrow a status
 * that isn't theirs.
 *
 * Never fabricates: no receipt, no conformance step, or a stale inputsHash
 * all say so explicitly — a stale receipt is labeled "stale receipt", never
 * presented as a live PASS.
 * @param {object|null|undefined} lastReceipt receipt-bridge.mjs's getLastReceipt() result
 */
function clauseReceiptStatusHtml(lastReceipt) {
  if (!lastReceipt || !lastReceipt.available) {
    const reason = (lastReceipt && lastReceipt.reason) || "no receipt at qa/evidence/latest.json — run node qa/verify.mjs";
    return `<span class="receipt-badge receipt-none" title="${escAttr(reason)}">no receipt yet &mdash; run node qa/verify.mjs</span>`;
  }
  if (!lastReceipt.conformance) {
    return `<span class="receipt-badge receipt-none">last receipt has no conformance step &mdash; run node qa/verify.mjs</span>`;
  }
  const age = formatReceiptAge(lastReceipt.ageMs);
  const generatedTitle = lastReceipt.generatedAt ? ` title="generated ${escAttr(lastReceipt.generatedAt)}"` : "";
  if (lastReceipt.stale) {
    return `<span class="receipt-badge receipt-stale"${generatedTitle}>stale receipt</span><span class="receipt-age">conformance was ${esc(lastReceipt.conformance.verdict)} ${age} &mdash; source changed since</span>`;
  }
  const verdictClass = lastReceipt.conformance.verdict === "PASS" ? "receipt-pass" : lastReceipt.conformance.verdict === "FAIL" ? "receipt-fail" : "receipt-none";
  const freshnessNote = lastReceipt.stale === null ? " &middot; freshness unverified" : "";
  return `<span class="receipt-badge ${verdictClass}"${generatedTitle}>conformance: ${esc(lastReceipt.conformance.verdict)}</span><span class="receipt-age">${age}${freshnessNote}</span>`;
}

/**
 * One receipt STEP's status as a compact matrix cell (the Specs RTM's
 * last-receipt column) — the same honesty rules as clauseReceiptStatusHtml,
 * generalized to any step name: no receipt, step-not-in-receipt (e.g. a
 * scaffold-profile run never executes `conformance`), stale (never presented
 * as a live verdict), freshness-unknown, or the real verdict + age.
 * @param {object|null|undefined} lastReceipt receipt-bridge.mjs's getLastReceipt() result
 * @param {string} stepName a receipt steps[] name (specCoverage, conformance, a11y, …)
 */
function stepReceiptCellHtml(lastReceipt, stepName) {
  if (!lastReceipt || !lastReceipt.available) {
    const reason = (lastReceipt && lastReceipt.reason) || "no receipt at qa/evidence/latest.json — run node qa/verify.mjs";
    return `<span class="receipt-badge receipt-none" title="${escAttr(reason)}">no receipt yet</span>`;
  }
  const step = (lastReceipt.steps || []).find((s) => s && s.name === stepName);
  if (!step) {
    const profile = lastReceipt.profile ? ` (profile ${esc(lastReceipt.profile)})` : "";
    return `<span class="receipt-badge receipt-none">not in last receipt${profile}</span>`;
  }
  const age = formatReceiptAge(lastReceipt.ageMs);
  if (lastReceipt.stale) {
    return `<span class="receipt-badge receipt-stale">stale &mdash; was ${esc(step.verdict)} ${age}</span>`;
  }
  const cls = step.verdict === "PASS" ? "receipt-pass" : step.verdict === "FAIL" ? "receipt-fail" : "receipt-none";
  const freshness = lastReceipt.stale === null ? " &middot; freshness unverified" : "";
  const title = step.reason ? ` title="${escAttr(step.reason)}"` : "";
  return `<span class="receipt-badge ${cls}"${title}>${esc(step.verdict)}</span><span class="receipt-age">${age}${freshness}</span>`;
}

/**
 * @param {object} gc getGovernedContract() result
 * @param {object|null|undefined} [lastReceipt] receipt-bridge.mjs's getLastReceipt() result. Omitted (callers that don't wire it) is treated exactly like an explicit `{available: false}` — every ARCH-* clause row still gets the honest "no receipt yet" badge, never silence that could be misread as "unattested" rather than "no receipt at all".
 */
function governedContractHtml(gc, lastReceipt) {
  if (!gc || !gc.available) {
    return `<div class="empty">
      <p>No governed contract available.</p>
      <p>${esc((gc && gc.reason) || "specs/app-base.spec.md not found.")}</p>
    </div>`;
  }
  const items = gc.clauses
    .map((c) => {
      const prose = esc(c.prose);
      const receiptStatus = /^ARCH-/i.test(c.id) ? clauseReceiptStatusHtml(lastReceipt) : "";
      return `      <li class="clause${c.withdrawn ? " withdrawn" : ""}">
        <span class="clause-id"><code>${esc(c.id)}</code></span>
        <span class="clause-prose">${c.withdrawn ? `<s>${prose}</s>` : prose}</span>
        ${receiptStatus}
        ${commentControlHtml({ type: "spec-line", file: `specs/${gc.file}`, clauseId: c.id })}
      </li>`;
    })
    .join("\n");
  return `  <p class="meta">specs/${esc(gc.file)}</p>
  <ul class="clause-list">
${items || '    <li class="empty-inline">no clauses parsed</li>'}
  </ul>`;
}

function featureShapeHtml(shape) {
  if (!shape || !shape.available) {
    return `<div class="empty">
      <p>No feature shape available.</p>
      <p>${esc((shape && shape.reason) || "presentation/home not found.")}</p>
    </div>`;
  }
  const items = shape.files
    .map((f) => `    <li><code>${esc(f)}</code>${commentControlHtml({ type: "architecture", path: f })}</li>`)
    .join("\n");
  return `  <p class="meta">${shape.files.length} file(s) &mdash; the shape <code>qa/scaffold-feature.mjs</code> clones for a new feature</p>
  <ul class="feature-tree">
${items}
  </ul>`;
}

/**
 * The Architecture tab (§7.1, AD-1 rebuild): mirrors template/docs/
 * ARCHITECTURE.md's own section shape — purpose & quality goals, system
 * context, platform & deployment view, building blocks (layer map +
 * dependency arrows + the governed contract), runtime view, crosscutting
 * policies, decisions — plus the exemplar feature shape at the end. Every
 * section degrades independently; one missing source never hides the rest.
 * The artifact's approval status is NOT re-rendered in the body: the shell's
 * page header (§2 grammar, preview-service.mjs's archStatus line) already
 * carries it, and a second copy here was pure duplication — drift-in-place
 * for architecture means violations at their edges (dependencyGraphHtml) and
 * receipt badges on the ARCH-* clauses, not a repeated banner.
 * `meta.lastReceipt` (optional, receipt-bridge.mjs's getLastReceipt() result)
 * drives each ARCH-* clause row's last-receipt status in the governed
 * contract (Wave C item 1) — an omitted `meta.lastReceipt` is treated exactly
 * like "no receipt exists", so every ARCH-* clause row still shows the honest
 * "no receipt yet" badge rather than silently rendering as if receipts don't
 * apply here.
 * @param {{layerMap: object, governedContract: object, featureShape: object, dependencyGraph?: object, doc?: object}} data
 * @param {{approval?: object|null, lastReceipt?: object|null}} [meta] `approval` is accepted for caller compatibility but unused here — the shell header owns that rendering
 */
export function architectureTabHtml(data, meta = {}) {
  const { layerMap, governedContract, featureShape, dependencyGraph, doc } = data || {};
  return `  <section class="arch-section" id="arch-purpose">
    <h3>1. Purpose &amp; quality goals</h3>
${mdTableHtml(doc && doc.qualityAttributes)}
  </section>
  <section class="arch-section" id="arch-constraints">
    <h3>2. Constraints</h3>
${docSectionProseHtml(doc && doc.constraints)}
${versionSetHtml(doc && doc.versionSet)}
  </section>
  <section class="arch-section" id="arch-context">
    <h3>3. System context</h3>
${systemContextHtml(doc && doc.systemContext)}
  </section>
  <section class="arch-section" id="arch-platform">
    <h3>4. Platform &amp; deployment view</h3>
${platformViewHtml(doc && doc.platformView)}
  </section>
  <section class="arch-section" id="arch-building-blocks">
    <h3>5. Building blocks &mdash; the layer model</h3>
    <h4>Layer map</h4>
${layerMapHtml(layerMap)}
    <h4>Dependency arrows (observed from real imports)</h4>
${dependencyGraphHtml(dependencyGraph)}
    <h4>The governed contract</h4>
${governedContractHtml(governedContract, meta.lastReceipt)}
  </section>
  <section class="arch-section" id="arch-runtime">
    <h3>6. Runtime view</h3>
${docSectionProseHtml(doc && doc.runtimeView)}
  </section>
  <section class="arch-section" id="arch-crosscutting">
    <h3>7. Crosscutting policies</h3>
${docSectionProseHtml(doc && doc.crosscuttingPolicies)}
  </section>
  <section class="arch-section" id="arch-decisions">
    <h3>8. Decisions</h3>
${mdTableHtml(doc && doc.decisions)}
  </section>
  <section class="arch-section" id="arch-feature-shape">
    <h3>Feature shape (what <code>add-feature</code> stamps)</h3>
${featureShapeHtml(featureShape)}
  </section>`;
}

// --- Evidence (§3.6) — the SDET's release-readiness report -------------------
//
// The page a release manager reads before shipping: the latest receipt as the
// headline (verdict, profile, commit, age, inputs binding vs the CURRENT
// tree), per-step rows with honest SKIP reasons, and the receipt timeline.
// The lane is the law: this page renders ONLY what qa/evidence attests —
// nothing here is a live re-derivation presented as a verdict.

/**
 * Which console section a receipt step governs — only mappings the lane's own
 * step definitions state (template/qa/verify.mjs); `build` and `unitTests`
 * gate the whole tree, not one section, so they get NO link — never a
 * guessed one.
 * - specCoverage → Specs (the clause↔test citation gate).
 * - conformance / archDoc → Architecture (the ARCH-* gates; the doc-drift check).
 * - componentStories → Components (one story per registry component).
 * - goldenTrees / a11y / e2eSmoke → Screens (rendered-structure, a11y-floor,
 *   and on-device checks of the screens themselves).
 * - tokenDrift → Design language (declared catalog vs live values).
 * - approvals → Approvals (the governed-artifact hash gate).
 */
const STEP_GOVERNS = {
  specCoverage: { section: "specs", label: "Specs" },
  conformance: { section: "architecture", label: "Architecture" },
  archDoc: { section: "architecture", label: "Architecture" },
  componentStories: { section: "components", label: "Components" },
  goldenTrees: { section: "screens", label: "Screens" },
  a11y: { section: "screens", label: "Screens" },
  e2eSmoke: { section: "screens", label: "Screens" },
  tokenDrift: { section: "design-system", label: "Design language" },
  approvals: { section: "approvals", label: "Approvals" },
};

/** A step duration in human units — "" (silence) when the receipt carries none. */
function formatDurationMs(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${Math.round(secs * 10) / 10}s`;
  return `${Math.floor(secs / 60)}m ${String(Math.round(secs % 60)).padStart(2, "0")}s`;
}

/**
 * The inputs-binding line — three-valued, per receipt-bridge.mjs's staleness
 * contract: confirmed fresh, confirmed stale (drift-colored, with the fix),
 * or honestly unknown with the bridge's own reason. Unknown is NEVER rendered
 * as fresh.
 */
function inputsBindingHtml(r) {
  if (r.stale === true) {
    const move =
      r.inputsHash && r.currentInputsHash
        ? ` (<code>${esc(shortHash(r.inputsHash))}</code> &rarr; <code>${esc(shortHash(r.currentInputsHash))}</code>)`
        : "";
    return `<span class="evidence-binding-stale">inputs no longer match the current tree${move} &mdash; re-run <code>node qa/verify.mjs</code></span>`;
  }
  if (r.stale === false) {
    const files = typeof r.inputsFileCount === "number" ? ` over ${r.inputsFileCount} files` : "";
    return `inputs bound to the current tree &mdash; hash <code>${esc(shortHash(r.inputsHash))}</code> still matches${files}`;
  }
  return `inputs binding unknown &mdash; ${esc(r.staleReason || "freshness could not be recomputed")}`;
}

/**
 * One committed receipt as a timeline row — the compliance record: the verdict
 * as attested at that commit, plus git's own attribution (commit · author ·
 * when). Stated facts only; nothing re-derived.
 */
function timelineRowHtml(r) {
  const cls = r.verdict === "PASS" ? "step-verdict-pass" : r.verdict === "FAIL" ? "step-verdict-fail" : "step-verdict-skip";
  const age = typeof r.ageMs === "number" ? formatReceiptAge(r.ageMs) : "age unknown";
  const commit = r.commitSha ? `<span class="meta">commit <code>${esc(String(r.commitSha).slice(0, 7))}</code></span>` : "";
  const author = r.author ? `<span class="meta">by ${esc(r.author)}</span>` : "";
  const when = r.committedAt ? esc(r.committedAt) : "commit date unknown";
  return `    <li>
      <span class="${cls}">${esc(r.verdict || "?")}</span>
      ${r.profile ? `<span class="meta">profile <code>${esc(r.profile)}</code></span>` : ""}
      ${commit}
      ${author}
      <span class="meta">committed ${when} &middot; ${esc(age)}</span>
    </li>`;
}

/**
 * The Evidence section body (§3.6). Renders ONLY what the receipt attests:
 * - headline: verdict (visually demoted, never green, when the receipt is
 *   stale), profile, commit, generatedAt + age, the three-valued inputs
 *   binding;
 * - per-step rows: verdict, honest SKIP/FAIL reasons verbatim, humanized
 *   duration, and a link to the section the step governs where that mapping
 *   is real (STEP_GOVERNS — unmapped steps get no link);
 * - timeline: the committed receipt audit trail, newest-first, reconstructed
 *   from git (receipt-bridge.mjs listReceiptHistory) — one attributed entry per
 *   verified commit; else the standardized absence line until the first receipt
 *   is committed.
 * @param {object|null|undefined} lastReceipt receipt-bridge.mjs's getLastReceipt() result
 * @param {{available: boolean, reason?: string, receipts?: object[]}} [history] listReceiptHistory() result
 */
export function evidenceBodyHtml(lastReceipt, history) {
  if (!lastReceipt || !lastReceipt.available) {
    const reason = (lastReceipt && lastReceipt.reason) || "no receipt at qa/evidence/latest.json";
    return `<div class="empty">
      <p>No verify receipt yet.</p>
      <p>${esc(reason)}</p>
      <p>Run <code>node qa/verify.mjs</code> &mdash; the lane writes <code>qa/evidence/latest.json</code>,
      and this page renders exactly what that receipt attests. Nothing here is derived any other way.</p>
    </div>`;
  }
  const r = lastReceipt;
  const stale = r.stale === true;
  // Stale demotion: the verdict keeps its word (it IS what the lane said) but
  // loses its color — a stale PASS is never presented as a live green.
  const verdictCls = stale
    ? "verdict-muted"
    : r.verdict === "PASS"
      ? "verdict-pass"
      : r.verdict === "FAIL"
        ? "verdict-fail"
        : "verdict-muted";
  const staleChip = stale
    ? ` <span class="badge badge-changed">STALE &mdash; the tree changed since this run</span>`
    : r.stale === null
      ? ` <span class="badge badge-unreviewed">freshness unknown</span>`
      : "";
  const age = formatReceiptAge(r.ageMs);
  const dirty =
    r.commitDirty && r.commitDirty.length
      ? ` &middot; ${r.commitDirty.length} uncommitted file${r.commitDirty.length === 1 ? "" : "s"} at run time`
      : "";
  const facts = [
    r.profile ? `<li>profile <code>${esc(r.profile)}</code></li>` : "",
    r.commitSha ? `<li>commit <code>${esc(shortHash(r.commitSha))}</code>${dirty}</li>` : "",
    `<li>generated ${r.generatedAt ? esc(r.generatedAt) : "at an unknown time"} &middot; ${esc(age)}</li>`,
    `<li>${inputsBindingHtml(r)}</li>`,
  ]
    .filter(Boolean)
    .join("\n      ");

  const stepRows = (r.steps || [])
    .map((s) => {
      const cls = s.verdict === "PASS" ? "step-verdict-pass" : s.verdict === "FAIL" ? "step-verdict-fail" : "step-verdict-skip";
      const governs = STEP_GOVERNS[s.name];
      const governsCell = governs ? `<a class="step-link" href="#${esc(governs.section)}">${esc(governs.label)}</a>` : "";
      const reason = s.reason ? `<span class="step-reason">${esc(s.reason)}</span>` : "";
      return `    <tr>
      <td><code>${esc(s.name)}</code></td>
      <td><span class="${cls}">${esc(s.verdict)}</span></td>
      <td>${esc(formatDurationMs(s.durationMs))}</td>
      <td>${governsCell}</td>
      <td>${reason}</td>
    </tr>`;
    })
    .join("\n");
  const stepsHtml = stepRows
    ? `  <table class="doc-table step-table">
    <thead><tr><th>Step</th><th>Verdict</th><th>Duration</th><th>Governs</th><th>Detail</th></tr></thead>
    <tbody>
${stepRows}
    </tbody>
  </table>`
    : `  <p class="empty-inline">the receipt carries no steps</p>`;

  const timelineHtml =
    history && history.available && history.receipts && history.receipts.length
      ? `  <ul class="evidence-timeline">
${history.receipts.map(timelineRowHtml).join("\n")}
  </ul>`
      : `  <p class="empty-inline">${esc((history && history.reason) || "no committed receipt history yet")} &mdash; each commit of <code>qa/evidence/latest.json</code> becomes one entry in the audit trail</p>`;

  return `  <p class="meta">Rendered from <code>${esc(r.relPath || "qa/evidence/latest.json")}</code> &mdash; the verify lane's own attestation.
  The lane is the law: nothing on this page is re-derived live.</p>
  <div class="evidence-headline${stale ? " evidence-stale" : ""}">
    <p class="lbl">latest receipt</p>
    <span class="evidence-verdict ${verdictCls}">${esc(r.verdict || "?")}</span>${staleChip}
    <ul class="evidence-facts">
      ${facts}
    </ul>
  </div>
  <h3>Steps</h3>
${stepsHtml}
  <h3>Audit trail &mdash; committed receipts</h3>
  <p class="meta">Every commit of <code>qa/evidence/latest.json</code> is one verified state of record, attributed from git. Newest first.</p>
${timelineHtml}`;
}

// --- Comments tab (§7.3) -----------------------------------------------------

/** Render a §7.3 Comment target readably — never the raw JSON. */
function describeTarget(t) {
  if (!t || typeof t !== "object") return '<span class="empty-inline">unknown target</span>';
  switch (t.type) {
    case "screen":
      return `screen <code>${esc(t.screen)}</code>`;
    case "element":
      return `screen <code>${esc(t.screen)}</code>${t.testTag ? ` &middot; element <code>${esc(t.testTag)}</code>` : ""}`;
    case "spec-line":
      return `spec <code>${esc(t.file)}</code>${t.clauseId ? ` &middot; clause <code>${esc(t.clauseId)}</code>` : ""}`;
    case "design-system":
      return `design system <code>${esc(t.token)}</code>`;
    case "architecture":
      return `architecture <code>${esc(t.path)}</code>`;
    case "general":
      return "general";
    default:
      return `<span class="empty-inline">${esc(t.type || "unknown target")}</span>`;
  }
}

/**
 * The Comments tab (§7.3): the full ledger — target (rendered readably, never
 * raw JSON), text, author, createdAt, status badge, and the resolution note
 * once resolved. Humans add comments (via the 💬 controls elsewhere in the
 * console); only an agent resolves them (`resolve_comment`) — this tab never
 * renders a resolve control, per §4's "the console never edits code" and
 * §7.3's "humans add/see; agents resolve".
 * @param {{available: boolean, error?: string, comments?: object[]}} comments
 */
export function commentsTabHtml(comments) {
  if (!comments || !comments.available) {
    const detail =
      comments && comments.error
        ? esc(comments.error)
        : "This looks like an older scaffold that predates the comments wave (no qa/lib/comments.mjs).";
    return `<div class="empty">
      <p>Comments are not available in this project.</p>
      <p>${detail}</p>
    </div>`;
  }
  if (!comments.comments || comments.comments.length === 0) {
    return `<div class="empty"><p>No comments yet &mdash; use the &#128172; control on any screen, spec clause, token, component, or architecture node to leave one.</p></div>`;
  }
  const rows = [...comments.comments]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)) // newest first
    .map((c) => {
      const badgeClass = c.status === "resolved" ? "badge-resolved" : "badge-open";
      const resolution =
        c.status === "resolved"
          ? `<div class="comment-resolution"><span class="lbl">resolved by ${esc(c.resolvedBy || "?")}${c.resolvedAt ? ` at ${esc(c.resolvedAt)}` : ""}</span>${
              c.resolutionNote ? `<p class="comment-resolution-note">${esc(c.resolutionNote)}</p>` : ""
            }</div>`
          : "";
      return `    <tr class="comment-row" data-id="${esc(c.id)}">
      <td><code>${esc(c.id)}</code></td>
      <td>${describeTarget(c.target)}</td>
      <td class="comment-text-cell">${esc(c.text)}</td>
      <td>${esc(c.author)}</td>
      <td>${esc(c.createdAt)}</td>
      <td><span class="badge ${badgeClass}">${esc(c.status)}</span>${resolution}</td>
    </tr>`;
    })
    .join("\n");
  return `  <table class="comments-table">
    <thead><tr><th>ID</th><th>Target</th><th>Comment</th><th>Author</th><th>Created</th><th>Status</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

// --- Screens (§3.4) — the design-review gallery ------------------------------
//
// The screen × state matrix: rows = screens (base preview-registry entries),
// columns = default + whichever @loading/@empty/@error states ANY screen
// registers, each cell that screen's live render. A cell whose state the
// screen doesn't register is a quiet dash — the matrix's own geometry states
// the absence; one line under the matrix says where states come from. Each
// row ends in the derived chips (nodes/tokenized/tagged, a11y, changed-#N
// attribution, the comment affordance) and expands (details/summary, pure
// HTML) into the wireframe SVG plus the screen's governing spec clauses with
// their receipt status — §3.4's render + wireframe + clauses, without
// per-screen routing the console doesn't have.

// The same state-suffix grammar preview-service.mjs's stateVariantCards uses
// (docs/proposals/component-system-deep-dive.md §6.5's `"home@empty"`
// convention) — duplicated as a literal rather than imported to keep this
// module free of preview-service imports (it's the other way around).
const SCREEN_STATE_ID_RE = /^(.+)@(loading|empty|error)$/;
const SCREEN_STATE_ORDER = ["loading", "empty", "error"];

/**
 * The spec clauses governing one screen — derived, never asserted: a live
 * clause governs screen `screenId` when at least one of its citing tests'
 * paths carries a path segment equal to the screen id (e.g.
 * `…/presentation/home/HomeScreenTest.kt` has segment `home`). That is the
 * only mapping the tree itself states (tests live in their feature's
 * directory); no name-similarity guessing. Returns `null` when specs data is
 * unavailable (not derivable at all — distinct from "derivable and empty").
 * @param {{available: boolean, files?: Array<{file: string, clauses: object[]}>}} specs specs.mjs getSpecsData() result
 * @param {string} screenId a BASE screen id (no @state suffix)
 * @returns {Array<{file: string, clause: object}>|null}
 */
export function clausesForScreen(specs, screenId) {
  if (!specs || !specs.available || !Array.isArray(specs.files)) return null;
  const out = [];
  for (const f of specs.files) {
    for (const clause of f.clauses) {
      if (clause.withdrawn) continue;
      const cites = (clause.citedBy || []).some((site) =>
        String(site.file).split("/").some((seg) => seg === screenId),
      );
      if (cites) out.push({ file: f.file, clause });
    }
  }
  return out;
}

/** One matrix cell: the live render (changed cells keep the hover before/after compare), or the quiet dash for an unregistered state. */
function matrixCellHtml(card, state, changedSet, version) {
  if (!card) {
    const what = state === "default" ? "no default entry registered" : `no @${escAttr(state)} entry registered`;
    return `<div class="matrix-cell matrix-none" title="${what} for this screen">&mdash;</div>`;
  }
  const id = card.screen.id;
  const isChanged = changedSet.has(id);
  const compare = isChanged && version > 1;
  const buster = `?v=${Number(version)}`;
  const cur = `<img class="cur" alt="${escAttr(id)} render" src="/previews/${escAttr(card.screen.png)}${buster}">`;
  let inner = cur;
  let label = "";
  if (compare) {
    const prevPng = String(card.screen.png).replace(/screen\.png$/, "screen.prev.png");
    inner = `<div class="cmp">${cur}<img class="prev" alt="${escAttr(id)} before" src="/previews/${escAttr(prevPng)}${buster}"></div>`;
    label = `<p class="lbl">hover = before</p>`;
  }
  return `<div class="matrix-cell${isChanged ? " changed" : ""}">${inner}${label}</div>`;
}

/** The row-end chips: derived counts + a11y from the DEFAULT render, changed-#N attribution, the comment affordance. */
function matrixRowEndHtml(baseId, baseCard, changedVersions) {
  const changedIn = changedVersions[baseId];
  const chgChip = changedIn ? ` &middot; <span class="chg">changed #${Number(changedIn)}</span>` : "";
  const comment = commentControlHtml({ type: "screen", screen: baseId }, { testTagInput: true });
  if (!baseCard) {
    return `<p class="meta">Not derivable statically &mdash; no default render for this screen${chgChip}</p>${comment}`;
  }
  const { summary, a11y } = baseCard;
  const a11yChip = a11y.pass
    ? `<span class="pass">PASS</span>`
    : `<span class="fail">${esc(`${a11y.violations.length} violation${a11y.violations.length === 1 ? "" : "s"}`)}</span>`;
  return `<p class="meta">${summary.nodes} nodes &middot; ${summary.tokenized} tokenized &middot; ${summary.tagged} tagged</p>
      <p class="meta">a11y ${a11yChip}${chgChip}</p>
      ${comment}`;
}

/** The expanded row's governing-clauses block — receipt status per clause via its own gate; honest absences in the standardized form. */
function rowClausesHtml(specs, baseId, lastReceipt) {
  const governing = clausesForScreen(specs, baseId);
  if (governing === null) {
    return `<p class="empty-inline">governing clauses: Not derivable statically &mdash; no specs/ directory found</p>`;
  }
  if (governing.length === 0) {
    return `<p class="empty-inline">governing clauses: Not derivable statically &mdash; no spec clause's citing tests carry a <code>${esc(baseId)}</code> path segment</p>`;
  }
  const items = governing
    .map(({ file, clause }) => {
      const gate = gateForClause(clause);
      return `      <li class="clause">
        <span class="clause-id"><code>${esc(clause.id)}</code></span>
        <span class="clause-prose">${esc(clause.prose)}</span>
        ${gate ? stepReceiptCellHtml(lastReceipt, gate) : ""}
        ${commentControlHtml({ type: "spec-line", file: `specs/${file}`, clauseId: clause.id })}
      </li>`;
    })
    .join("\n");
  return `<p class="lbl">governing clauses &mdash; clauses whose citing tests live under <code>${esc(baseId)}</code></p>
    <ul class="clause-list">
${items}
    </ul>`;
}

/**
 * The Screens section body (§3.4): the screen × state matrix. Pure — the
 * caller (preview-service.mjs's galleryHtml) passes the current render's
 * screen cards (component stories already excluded), the changed vocabulary,
 * and the specs/receipt data the expanded rows read.
 * @param {object} data { cards, changed, changedVersions, version, specs, lastReceipt }
 *   `cards` = [{screen:{id,title,png}, svg, summary, a11y}], base entries and
 *   `<base>@<state>` variants alike — the matrix regroups them by base id.
 */
export function screensBodyHtml(data) {
  const {
    cards = [],
    changed = [],
    changedVersions = {},
    version = 0,
    specs = { available: false },
    lastReceipt = null,
  } = data || {};
  if (cards.length === 0) {
    return `<div class="empty">
      <p>No screens rendered yet.</p>
      <p>The preview loop fills this page on its first render &mdash; every entry in
      <code>inspector/PreviewRegistry.kt</code> becomes a row.</p>
    </div>`;
  }
  const changedSet = new Set(changed);
  // Regroup the flat card list into rows: base id -> its default render +
  // whichever @state variants are registered. A variant whose base entry
  // isn't registered still gets a row (its default cell is then the dash and
  // its chips state their own underivability) — never silently dropped.
  const byBase = new Map();
  for (const card of cards) {
    const m = SCREEN_STATE_ID_RE.exec(card.screen.id);
    const baseId = m ? m[1] : card.screen.id;
    if (!byBase.has(baseId)) byBase.set(baseId, { base: null, variants: new Map() });
    if (m) byBase.get(baseId).variants.set(m[2], card);
    else byBase.get(baseId).base = card;
  }
  // Columns: default + only the states at least one screen registers, in the
  // fixed loading/empty/error order. No screen registers any state -> the
  // matrix is a single default column; nothing is fabricated.
  const stateCols = SCREEN_STATE_ORDER.filter((s) =>
    [...byBase.values()].some((row) => row.variants.has(s)),
  );
  const headCols = ["default", ...stateCols]
    .map((c) => `<span class="matrix-col">${esc(c)}</span>`)
    .join("");
  const rows = [...byBase.entries()]
    .map(([baseId, row]) => {
      const title = row.base ? row.base.screen.title : baseId;
      const rowChanged =
        changedSet.has(baseId) || [...row.variants.values()].some((c) => changedSet.has(c.screen.id));
      const cells = [
        matrixCellHtml(row.base, "default", changedSet, version),
        ...stateCols.map((s) => matrixCellHtml(row.variants.get(s) || null, s, changedSet, version)),
      ].join("\n        ");
      const wire = row.base
        ? `<div class="wire">${row.base.svg}</div>`
        : `<p class="empty-inline">wireframe: Not derivable statically &mdash; no default render for this screen</p>`;
      return `  <section class="matrix-row${rowChanged ? " changed" : ""}" id="card-${esc(baseId)}">
    <div class="matrix-line">
      <div class="matrix-rowhead">
        <h3>${esc(title)}${rowChanged ? '<span class="flag">CHANGED</span>' : ""}</h3>
        <p class="meta">id <code>${esc(baseId)}</code></p>
      </div>
      <div class="matrix-cells">
        ${cells}
      </div>
      <div class="matrix-rowend">
      ${matrixRowEndHtml(baseId, row.base, changedVersions)}
      </div>
    </div>
    <details class="row-detail">
      <summary>structure &amp; governing clauses</summary>
      <div class="row-detail-body">
        ${wire}
        <div class="row-clauses">
    ${rowClausesHtml(specs, baseId, lastReceipt)}
        </div>
      </div>
    </details>
  </section>`;
    })
    .join("\n");
  return `<div class="matrix">
  <div class="matrix-head" aria-hidden="true"><span class="matrix-gutter"></span>${headCols}</div>
${rows}
</div>
<p class="meta matrix-note">An empty cell means the screen registers no entry for that state. States come from
<code>@state</code> preview-registry entries in <code>inspector/PreviewRegistry.kt</code> (e.g. <code>"home@empty"</code>).</p>`;
}

// --- Intent (§3.0) — the product strategist's brief --------------------------
//
// The working-backwards brief rendered from the project's REAL specs/intent.md
// (intent.mjs), section by section in the file's own order. Sections the
// interview hasn't filled state themselves plainly — the seed template's own
// "_not yet captured_" marker is the evidence, and its guidance prose is
// rendered as the document's own prompt, muted. A project with no intent.md
// at all gets the §3.0 placeholder styled as the document's own pending
// state, never an error box. The ## Glossary section renders as a definition
// table when its body is the template's `**Term** — definition` list (or a
// GFM table); anything else renders as prose — no forced structure.

const GLOSSARY_ITEM_RE = /^[-*]\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/;

/**
 * Try to read a glossary body as term/definition rows. Returns null unless
 * EVERY non-blank line parses as either a `- **Term** — definition` item or a
 * GFM table row — a mixed body renders as prose instead of a half-parsed
 * table.
 * @returns {Array<{term: string, def: string}>|null}
 */
function parseGlossaryRows(body) {
  const rows = [];
  const lines = String(body).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const tableLines = lines.filter((l) => l.startsWith("|"));
  if (tableLines.length === lines.length && tableLines.length >= 2) {
    // GFM table: skip the header + separator rows, take cell 1/2 per row.
    for (const l of tableLines.slice(2)) {
      const cells = l.split("|").map((c) => c.trim()).filter((c, i, a) => !(i === 0 && c === "") && !(i === a.length - 1 && c === ""));
      if (cells.length < 2) return null;
      rows.push({ term: cells[0], def: cells[1] });
    }
    return rows.length ? rows : null;
  }
  for (const l of lines) {
    const m = l.match(GLOSSARY_ITEM_RE);
    if (!m) return null;
    rows.push({ term: m[1], def: m[2] });
  }
  return rows.length ? rows : null;
}

function glossaryHtml(body) {
  const rows = parseGlossaryRows(body);
  if (!rows) return `<div class="doc-prose">${mdProseHtml(body)}</div>`;
  const trs = rows
    .map((r) => `    <tr><td><strong>${inlineMdHtml(r.term)}</strong></td><td>${inlineMdHtml(r.def)}</td></tr>`)
    .join("\n");
  return `<table class="doc-table glossary-table">
    <thead><tr><th>Term</th><th>Definition</th></tr></thead>
    <tbody>
${trs}
    </tbody>
  </table>`;
}

/**
 * The Intent section body (§3.0). Comment affordances target
 * {type:"spec-line", file:"specs/intent.md", clauseId:<heading>} — the
 * ledger's spec-line contract requires both fields (qa/lib/comments.mjs), and
 * for a prose brief the section heading IS the addressable unit.
 * @param {{available: boolean, reason?: string, sections?: Array<{heading: string, body: string, filled: boolean, guidance: string|null}>}} intent intent.mjs getIntentData() result
 */
export function intentBodyHtml(intent) {
  if (!intent || !intent.available) {
    return `<div class="brief-pending">
      <p class="brief-pending-state">Not yet captured &mdash; conversation 0 pending.</p>
      <p>The genesis walk's first conversation writes <code>specs/intent.md</code> &mdash; purpose,
      audience, platforms, brand feel, reference apps, first screens, glossary. Every later
      artifact is expressed in the vocabulary this brief establishes.</p>
    </div>`;
  }
  if (!intent.sections || intent.sections.length === 0) {
    return `<div class="brief-pending">
      <p class="brief-pending-state">Not yet captured &mdash; conversation 0 pending.</p>
      <p><code>specs/intent.md</code> exists but carries no <code>##</code> sections yet.</p>
    </div>`;
  }
  const sections = intent.sections
    .map((sec) => {
      const comment = commentControlHtml({ type: "spec-line", file: "specs/intent.md", clauseId: sec.heading });
      let body;
      if (sec.filled) {
        body = /^glossary$/i.test(sec.heading)
          ? glossaryHtml(sec.body)
          : `<div class="doc-prose">${mdProseHtml(sec.body)}</div>`;
      } else {
        // The seed's own guidance prose (lead-in stripped) is the document's
        // words for what belongs here — rendered muted, never invented.
        const guidance = sec.guidance ? `<p class="brief-guidance">${inlineMdHtml(sec.guidance)}</p>` : "";
        body = `<p class="brief-pending-inline">Not yet captured &mdash; conversation 0 pending.</p>${guidance}`;
      }
      return `  <section class="brief-section${sec.filled ? "" : " brief-unfilled"}">
    <h3>${esc(sec.heading)}${comment}</h3>
    ${body}
  </section>`;
    })
    .join("\n");
  return `<div class="brief">
${sections}
</div>`;
}

// --- Walkthrough (A2/A3) — the generated report as a console section ---------
//
// Derived truth only: everything rendered here is read from a run's committed
// manifest (walkthrough-data.mjs) — the console never re-walks or re-computes.
// The section is the report's summary + deep links; report.html stays the
// full-fidelity artifact.

export function walkthroughTabHtml(wt) {
  if (!wt || !wt.available) {
    return `<div class="empty">
      <p>No walkthrough runs yet.</p>
      <p>With the debug app live (adb forward tcp:9500), run <code>node qa/walkthrough.mjs</code> —
      it walks every tab and parameterless route, captures pixels + tree + a11y from one proven
      frame per screen, reads the DB at capture time, and writes a committable report under
      <code>qa/evidence/walkthrough/</code>.</p>
    </div>`;
  }
  const latest = wt.runs[0];
  const m = latest.manifest;
  const cards = (m.screens ?? [])
    .map((s) => {
      const a11yLine =
        (s.a11y?.violations ?? []).length === 0
          ? `<span class="ok-inline">a11y 0 violations</span>`
          : `<span class="bad-inline">a11y ${s.a11y.violations.length} violations</span>`;
      const settled = s.settled === false ? ` <span class="bad-inline">captured mid-load</span>` : "";
      const spec = s.spec ? ` · spec ${esc(s.spec.file)} (${s.spec.clauses.length} clauses)` : "";
      const variants = (s.variants ?? []).length ? ` · ${s.variants.length} tier-0 variants` : "";
      return `    <div class="wt-card">
      <img src="/walkthrough/${esc(latest.relDirBase || "")}/${esc(s.png)}" loading="lazy">
      <div class="wt-meta"><strong>${esc(s.id)}</strong> <span class="chip">${esc(s.kind)}</span>${settled}<br>
      route <code>${esc(s.route ?? "—")}</code> · ${s.nodes} nodes · ${a11yLine}${spec}${variants}</div>
    </div>`;
    })
    .join("\n");
  const notWalked = (m.notWalked ?? []).length
    ? `  <h3>Not walked</h3>
  <ul class="wt-notwalked">${m.notWalked.map((n) => `<li><code>${esc(n.target)}</code> — ${esc(n.reason)}</li>`).join("")}</ul>`
    : "";
  const db = m.db
    ? `  <h3>DB at capture time</h3>
  <table class="params-table"><thead><tr><th>table</th><th>rows</th></tr></thead><tbody>
${m.db.tables.map((t) => `    <tr><td><code>${esc(t.name)}</code></td><td>${t.error ? esc(t.error) : t.rowCount ?? "?"}</td></tr>`).join("\n")}
  </tbody></table>`
    : `  <p class="empty-inline">no DB appendix — Room off or the app predates /inspect/db</p>`;
  const history =
    wt.runs.length > 1
      ? `  <h3>Previous runs</h3>
  <ul class="wt-history">${wt.runs
    .slice(1)
    .map((r) =>
      r.error
        ? `<li>${esc(r.relDir)} — <span class="bad-inline">${esc(r.error)}</span></li>`
        : `<li>${esc(r.generatedAt)} — ${r.screenCount} screens, ${r.a11yViolations} a11y violations
          <span class="empty-inline">(diff: <code>node qa/walkthrough.mjs --compare ${esc(r.relDir)} ${esc(wt.runs[0].relDir)}</code>)</span></li>`
    )
    .join("")}</ul>`
      : "";
  return `  <p class="meta">latest: ${esc(latest.generatedAt)} · ${latest.screenCount} screens · ${latest.a11yViolations} a11y violations · ${latest.notWalked} not walked${latest.unsettled ? ` · <strong>${latest.unsettled} captured mid-load</strong>` : ""} —
  <a href="/walkthrough/${esc(latest.relDirBase || "")}/report.html" target="_blank">open full report</a></p>
  <div class="wt-grid">
${cards}
  </div>
${notWalked}
${db}
${history}`;
}

// --- Live device (A1) — the console arc ends DRIVE ---------------------------
//
// Reachable: embed /inspect/remote (already a self-contained page that mirrors
// and drives the real device) with the status chip. Unreachable: the honest
// state + the Start button, which runs the whole chain (boot AVD if needed →
// installDebug → launch → forward → health) server-side; the page polls
// /live/status and renders each step's real outcome.

export function liveDeviceTabHtml(live, session) {
  const chainHtml = session && session.steps && session.steps.length
    ? `  <ol class="live-steps">
${session.steps
  .map(
    (s) =>
      `    <li class="live-step-${esc(s.status)}"><code>${esc(s.name)}</code> — ${esc(s.status)}${s.detail ? `: ${esc(s.detail)}` : ""}${s.ms != null ? ` <span class="empty-inline">(${Math.round(s.ms / 100) / 10}s)</span>` : ""}</li>`
  )
  .join("\n")}
  </ol>`
    : "";
  if (live && live.reachable) {
    return `  <p class="meta"><span class="ok-inline">●</span> ${esc(live.appId)} · ${esc(live.buildType)} · process started ${esc(
      live.processStartedAtMs ? new Date(live.processStartedAtMs).toISOString() : "unknown"
    )} — <a href="${esc(live.remoteUrl)}" target="_blank">open in its own tab</a></p>
  <iframe class="live-remote" src="${esc(live.remoteUrl)}" title="live device"></iframe>
${chainHtml}`;
  }
  return `  <p class="meta"><span class="bad-inline">○</span> ${esc(live ? live.reason : "status unknown")}</p>
  <p>Start the whole chain from here — boot a headless AVD if no device is attached, install the
  debug build, launch it, forward the inspector port, and wait for health:</p>
  <p><button id="live-start-btn"${session && session.running ? " disabled" : ""}>${session && session.running ? "Starting…" : "Start live session"}</button></p>
${chainHtml}
  <div id="live-error" class="banner" hidden></div>`;
}

// --- Digest (B4) — what happened since you last looked -----------------------
//
// The narrative layer over ledgers that already exist (git log, committed
// receipts, the approvals + comments ledgers). Every line is derived; the
// digest can never disagree with the audit trail because it IS the audit
// trail, grouped.

export function digestTabHtml(digest) {
  if (!digest || !digest.available) {
    return `<div class="empty"><p>No digest — ${esc(digest ? digest.reason : "unavailable")}</p></div>`;
  }
  const lane = digest.laneRuns.length
    ? `  <h3>Lane runs</h3>
  <table class="params-table"><thead><tr><th>when</th><th>commit</th><th>verdict</th><th>strength</th></tr></thead><tbody>
${digest.laneRuns
  .map(
    (r) =>
      `    <tr><td>${esc(r.when)}</td><td><code>${esc(r.sha)}</code></td><td><span class="${r.verdict === "PASS" ? "ok-inline" : "bad-inline"}">${esc(r.verdict)}</span></td><td>${esc(r.strength ?? "—")}</td></tr>`
  )
  .join("\n")}
  </tbody></table>`
    : `  <h3>Lane runs</h3>
  <p class="empty-inline">no committed receipts in the window — the lane has not run (or its receipt was not committed)</p>`;
  const approvals = digest.approvalEvents.length
    ? `  <h3>Approval events</h3>
  <ul class="digest-list">${digest.approvalEvents.map((e) => `<li>${esc(e.when)} · <code>${esc(e.sha)}</code> — ${esc(e.subject)}</li>`).join("")}</ul>`
    : "";
  const commits = digest.commits.length
    ? `  <h3>Commits</h3>
  <ul class="digest-list">${digest.commits.map((c) => `<li>${esc(c.when)} · <code>${esc(c.sha)}</code> — ${esc(c.subject)}</li>`).join("")}</ul>`
    : `  <p class="empty-inline">no commits in the window</p>`;
  const comments =
    digest.openComments == null
      ? ""
      : `  <p class="meta">${digest.openComments} open comment${digest.openComments === 1 ? "" : "s"} awaiting action</p>`;
  return `  <p class="meta">window: since ${esc(digest.since)}</p>
${comments}
${lane}
${approvals}
${commits}`;
}
