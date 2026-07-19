// console-tabs.mjs — pure (data) -> html generators for the console tabs on
// the resident preview gallery: Design System + Components (§4, §7.2),
// Architecture (§7.1), Approvals (§4), Specs (§4), Comments (§7.3). The
// Screens tab is untouched gallery markup (still built inline by
// preview-service.mjs's galleryHtml).
//
// Pure and dependency-free, same style as preview-service.mjs's galleryHtml:
// (state) -> html string, no DOM, no CDN. Every tab degrades honestly to an
// empty-state explanation when its data source isn't available yet — never
// fabricated values.

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
  [/^design-system$/, 1],
  [/^architecture$/, 2],
  [/^components$/, 3],
  [/^exemplar-feature$/, 4],
  [/^exemplar-spec$/, 5],
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

/**
 * The Design System tab: swatch grid (colors) + a dimens table, sourced from
 * whatever the caller resolved (previews dir design-system.json, else a live
 * /inspect/design-system fetch), plus a Components section (§7.2, from a
 * separate static scan — see components.mjs). Never fabricates values — an
 * unavailable catalog/scan gets an honest empty-state explaining how to
 * produce one. The two sections are independent: a project with tokens but
 * no components/ dir (or vice versa) still shows whichever half resolved.
 * §2 "Design-language candidates (variants)": in genesis mode (design-system
 * status unreviewed/reopened — `artifactStatus`), also renders the candidates
 * strip below Components — one card per `snapshot_variant`-stashed variant,
 * its screens side by side, with a Pick button. Steward mode (approved, incl.
 * defaults-accepted) omits the strip entirely, per §2's "no global mode
 * switch — the per-artifact status IS the mode". `artifactStatus` is the
 * design-system artifact's live `status` string (or undefined, which reads
 * as steward — the safe default when the caller has no approvals data at all).
 * @param {{available: boolean, source?: "previews"|"live", catalog?: {colors?: object, dimens?: object}}} ds
 * @param {{available: boolean, reason?: string, components?: object[]}} [components]
 * @param {{available: boolean, variants?: Array<{name: string, screens: Array<{id: string, png: string}>, hasDesignSystem: boolean}>}} [variants]
 * @param {string} [artifactStatus] the design-system artifact's live status (see approvalsTabHtml)
 * @param {{approval?: object|null, drift?: object, violations?: object, stateVariants?: object}} [componentsMeta]
 *   the components artifact's own approval record + mtime-based drift +
 *   ARCH-11-style hand-rolled-state violations + any live `@loading/@empty/
 *   @error` variant renders (CV-1 W3b) — every field optional, every field
 *   degrades to an honest empty state when absent
 */
export function designSystemTabHtml(ds, components, variants, artifactStatus, componentsMeta) {
  let dsHtml;
  if (!ds || !ds.available) {
    dsHtml = `<div class="empty">
      <p>No design-system catalog available yet.</p>
      <p>Produce one by letting the preview gallery render at least once (writes
      <code>composeApp/build/previews/design-system.json</code>), or connect a running
      DEBUG build (<code>connect_live</code>) so it can be read live from
      <code>/inspect/design-system</code>.</p>
    </div>`;
  } else {
    const colors = (ds.catalog && ds.catalog.colors) || {};
    const dimens = (ds.catalog && ds.catalog.dimens) || {};
    const colorCards = Object.entries(colors)
      .map(
        ([name, hex]) => `    <div class="swatch-card">
      <div class="swatch" style="background:${esc(hex)}"></div>
      <div class="swatch-name">${esc(name)}${commentControlHtml({ type: "design-system", token: name })}</div>
      <div class="swatch-value"><code>${esc(hex)}</code></div>
    </div>`,
      )
      .join("\n");
    const dimenRows = Object.entries(dimens)
      .map(
        ([name, val]) =>
          `    <tr><td>${esc(name)}${commentControlHtml({ type: "design-system", token: name })}</td><td><code>${esc(val)}</code></td></tr>`,
      )
      .join("\n");
    const sourceLabel =
      ds.source === "live" ? "running app (GET /inspect/design-system)" : "composeApp/build/previews/design-system.json";
    dsHtml = `  <p class="meta">source: ${esc(sourceLabel)}</p>
  <h3>Colors</h3>
  <div class="swatch-grid">
${colorCards || '    <p class="empty-inline">no colors declared</p>'}
  </div>
  <h3>Dimens</h3>
  <table class="dimens-table"><tbody>
${dimenRows || '    <tr><td colspan="2" class="empty-inline">no dimens declared</td></tr>'}
  </tbody></table>`;
  }
  const genesisMode = artifactStatus === "unreviewed" || artifactStatus === "reopened";
  const candidatesSection = genesisMode
    ? `  <h3>Design-language candidates</h3>
${candidatesStripHtml(variants)}`
    : "";
  return `${dsHtml}
  <h3>Components</h3>
${componentsSectionHtml(components, componentsMeta || {})}
${candidatesSection}`;
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
 * The signature block — `fun Name(param: Type = default, ...)`, one param
 * per line, straight from `paramsParsed` (parameter ORDER preserved exactly
 * as scanned — the Compose guidelines ordering `component-system-deep-
 * dive.md` §2 cites: required -> modifier -> optional -> trailing slot —
 * this block simply shows what the source actually declares, never a
 * reordered "ideal" signature).
 * @param {string} name
 * @param {Array<{raw: string, name: string, type: (string|null), default: (string|null)}>} paramsParsed
 */
function signatureBlockHtml(name, paramsParsed) {
  if (!paramsParsed || paramsParsed.length === 0) {
    return `<pre class="component-sig">fun ${esc(name)}()</pre>`;
  }
  const lines = paramsParsed
    .map((p) => {
      const type = p.type ? `: ${esc(p.type)}` : "";
      const def = p.default ? ` = ${esc(p.default)}` : "";
      return `  ${esc(p.name)}${type}${def},`;
    })
    .join("\n");
  return `<pre class="component-sig">fun ${esc(name)}(\n${lines}\n)</pre>`;
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
      <p class="empty-inline">not derivable statically — no <code>@${esc(state)}</code> preview-registry entry has rendered yet</p>
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
 * The used-in list, split into screens vs. everything else — "which screens
 * compose it" is the used-in question a staff-level reference actually
 * answers first. A screen that ALSO hand-rolls a state this component owns
 * (the ARCH-11 mirror, handrolled-state.mjs) gets a violation chip inline —
 * "surfaced as a violation chip on the offending screen reference", never
 * just a banner.
 * @param {string[]} usedIn full used-in list
 * @param {string[]} usedInScreens the screen subset
 * @param {Map<string, object>} violationsByFile file -> handrolled-state.mjs violation entry
 */
function usedInHtml(usedIn, usedInScreens, violationsByFile) {
  if (!usedIn || usedIn.length === 0) {
    return `<p class="empty-inline">no call sites found under presentation/**</p>`;
  }
  const screenSet = new Set(usedInScreens || []);
  const items = usedIn
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
 * The Components section — the CV-1 three-in-one standard: a staff-level
 * component library reference (authored form), every fact DERIVED from the
 * real tree (never hand-written prose that can rot — see components.mjs's
 * deriveFacts and this file's evidence-or-silence subsections), and the
 * ordering/drift surface (per-card approval status, mtime-based drift, and
 * ARCH-11-style hand-rolled-state violations on the offending used-in
 * screen). A signature the scanner couldn't parse cleanly shows name + file
 * only, with an honest note — never a guessed parameter list.
 * @param {{available: boolean, reason?: string, components?: Array<object>}} [components]
 * @param {{approval?: object|null, drift?: object, violations?: object, stateVariants?: object}} [meta]
 */
function componentsSectionHtml(components, meta = {}) {
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
  const cards = components.components
    .map((c) => {
      const header = `<h4>${esc(c.name)}${commentControlHtml({ type: "design-system", token: `component:${c.name}` })}</h4>`;
      const badge = componentApprovalBadgeHtml(meta.approval, meta.drift, c.file);
      if (c.parseError) {
        return `    <div class="component-card">
      ${header}
      ${badge}
      <p class="meta"><code>${esc(c.file)}</code></p>
      <p class="unresolvable-note">signature could not be parsed cleanly — showing name + file only.</p>
    </div>`;
      }
      const paramsParsed = c.paramsParsed || [];
      const facts = c.facts || {};
      const hasScreenTagParam = paramsParsed.some((p) => p.name === "screenTag");
      const kdocHtml = c.kdoc
        ? `<p class="lbl">usage notes &mdash; from the component's own doc comment</p><blockquote class="component-kdoc">${esc(c.kdoc)}</blockquote>`
        : "";
      const usedIn = usedInHtml(c.usedIn, c.usedInScreens, violationsByFile);
      return `    <div class="component-card">
      ${header}
      ${badge}
      <p class="meta"><code>${esc(c.file)}</code></p>
      <p class="lbl">signature</p>
      ${signatureBlockHtml(c.name, paramsParsed)}
      ${stateContractHtml(facts, hasScreenTagParam)}
      ${kdocHtml}
      ${liveVariantsHtml(facts.derivedTags, meta.stateVariants)}
      <p class="lbl">used in</p>${usedIn}
    </div>`;
    })
    .join("\n");
  return `  <div class="component-grid">
${cards}
  </div>`;
}

/**
 * The Approvals tab: every governed artifact, its §1 order number, live status,
 * file count, hash/approvedAt, and an Approve button (disabled + marked
 * "unresolvable" when `resolvable === false`, mirroring qa/approve.mjs --status).
 * @param {{available: boolean, error?: string, statuses?: object[]}} approvals
 */
export function approvalsTabHtml(approvals) {
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
      return `    <tr class="approval-row" data-artifact="${esc(s.id)}">
      <td class="order-num">${orderNumber(s.id)}</td>
      <td>${esc(s.label)}<div class="artifact-id">${esc(s.id)}</div>${artifactBannerHtml(s)}</td>
      <td><span class="badge ${badgeClass}">${esc(statusLabel)}</span></td>
      <td>${s.fileCount}</td>
      <td>${hashInfo}${s.approvedAt ? `<div class="approved-at">${esc(s.approvedAt)}</div>` : ""}${unresolvableNote}${missingNote}</td>
      <td><button class="approve-btn" data-artifact="${esc(s.id)}"${s.resolvable === false ? " disabled" : ""}>${btnLabel}</button> ${reopenBtn}</td>
    </tr>`;
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

/**
 * The Specs tab: per spec file, its clause list — id + prose, struck-through
 * for withdrawn clauses, plus a best-effort coverage badge per live clause
 * (see specs.mjs getSpecsData for what "coverage" means here — a lightweight
 * citation check, not the verify-lane's full orphan-tag report).
 * @param {{available: boolean, files?: Array<{file: string, clauses: object[]}>}} specs
 */
export function specsTabHtml(specs) {
  if (!specs || !specs.available) {
    return `<div class="empty"><p>No specs/ directory found in this project.</p></div>`;
  }
  return specs.files
    .map((f) => {
      const items = f.clauses
        .map((c) => {
          const covClass = c.cited === null ? "cov-na" : c.cited ? "cov-yes" : "cov-no";
          const covLabel = c.cited === null ? "withdrawn" : c.cited ? "covered" : "no citing test";
          const prose = esc(c.prose);
          return `      <li class="clause${c.withdrawn ? " withdrawn" : ""}">
        <span class="clause-id"><code>${esc(c.id)}</code></span>
        <span class="clause-prose">${c.withdrawn ? `<s>${prose}</s>` : prose}</span>
        <span class="cov-badge ${covClass}">${covLabel}</span>
        ${commentControlHtml({ type: "spec-line", file: `specs/${f.file}`, clauseId: c.id })}
      </li>`;
        })
        .join("\n");
      return `  <div class="spec-file">
    <h3>${esc(f.file)}</h3>
    <ul class="clause-list">
${items || '      <li class="empty-inline">no clauses parsed</li>'}
    </ul>
  </div>`;
    })
    .join("\n");
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

function systemContextHtml(sc) {
  if (!sc || !sc.available) {
    return `<p class="empty-inline">${esc((sc && sc.reason) || "docs/ARCHITECTURE.md not found")}</p>`;
  }
  const intro = sc.intro ? `<p>${inlineMdHtml(sc.intro)}</p>` : "";
  const table = sc.table
    ? mdTableHtml({ available: true, headers: sc.table.headers, rows: sc.table.rows })
    : `<p class="empty-inline">no integration table found under "${esc(sc.heading)}"</p>`;
  return `${intro}${table}`;
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

/** The architecture artifact's own approval badge — same visual vocabulary as componentApprovalBadgeHtml, single-file so no per-file mtime drift is needed. */
function architectureApprovalBadgeHtml(approval) {
  if (!approval) return "";
  const s = approval.status;
  if (s === "approved") {
    const unshaped = approval.mode === "defaults-accepted";
    return `<span class="badge badge-approved${unshaped ? " badge-unshaped" : ""}" title="architecture artifact approved at ${shortDate(approval.approvedAt)}">approved &middot; ${shortHash(approval.hash)}</span>`;
  }
  if (s === "changed-since-approval") {
    return `<span class="badge badge-changed" title="approved ${shortHash(approval.storedHash)} &rarr; now ${shortHash(approval.hash)}">drift &middot; architecture artifact changed since approval</span>`;
  }
  if (s === "reopened") return `<span class="badge badge-reopened">reopened for redesign</span>`;
  return `<span class="badge badge-unreviewed">not yet approved</span>`;
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
 * `meta.approval` (optional) is the "architecture" governed artifact's own
 * live status record (approvals-bridge.mjs), rendered as a badge + the same
 * genesis/steward banner the Approvals tab's rows use — reused via
 * artifactBannerHtml, not re-implemented. `meta.lastReceipt` (optional,
 * receipt-bridge.mjs's getLastReceipt() result) drives each ARCH-* clause
 * row's last-receipt status in the governed contract (Wave C item 1) — an
 * omitted `meta.lastReceipt` is treated exactly like "no receipt exists",
 * so every ARCH-* clause row still shows the honest "no receipt yet" badge
 * rather than silently rendering as if receipts don't apply here.
 * @param {{layerMap: object, governedContract: object, featureShape: object, dependencyGraph?: object, doc?: object}} data
 * @param {{approval?: object|null, lastReceipt?: object|null}} [meta]
 */
export function architectureTabHtml(data, meta = {}) {
  const { layerMap, governedContract, featureShape, dependencyGraph, doc } = data || {};
  const topStatus = meta.approval
    ? `  <div class="arch-top-status">
    ${architectureApprovalBadgeHtml(meta.approval)}
    ${artifactBannerHtml(meta.approval)}
  </div>`
    : "";
  return `${topStatus}
  <section class="arch-section" id="arch-purpose">
    <h3>1. Purpose &amp; quality goals</h3>
${mdTableHtml(doc && doc.qualityAttributes)}
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
