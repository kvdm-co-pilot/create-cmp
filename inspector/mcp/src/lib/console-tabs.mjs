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

// The §1 ordered-walk numbering (VERIFICATION-LAYER-DESIGN.md §1) — shown so the
// human sees the intended approval order, not just an alphabetical/registry list.
const ORDER_BY_ID = [
  [/^design-system$/, 1],
  [/^architecture$/, 2],
  [/^exemplar-feature$/, 3],
  [/^exemplar-spec$/, 4],
  [/^feature-spec:/, 5],
];
function orderNumber(id) {
  for (const [re, n] of ORDER_BY_ID) if (re.test(id)) return n;
  return "–";
}

/**
 * The Design System tab: swatch grid (colors) + a dimens table, sourced from
 * whatever the caller resolved (previews dir design-system.json, else a live
 * /inspect/design-system fetch), plus a Components section (§7.2, from a
 * separate static scan — see components.mjs). Never fabricates values — an
 * unavailable catalog/scan gets an honest empty-state explaining how to
 * produce one. The two sections are independent: a project with tokens but
 * no components/ dir (or vice versa) still shows whichever half resolved.
 * @param {{available: boolean, source?: "previews"|"live", catalog?: {colors?: object, dimens?: object}}} ds
 * @param {{available: boolean, reason?: string, components?: object[]}} [components]
 */
export function designSystemTabHtml(ds, components) {
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
  return `${dsHtml}
  <h3>Components</h3>
${componentsSectionHtml(components)}`;
}

/**
 * The Components section (§7.2): every `@Composable` found under
 * presentation/components/*.kt (see components.mjs), each with its file,
 * parameter list, and used-in list. A signature the scanner couldn't parse
 * cleanly shows name + file only, with an honest note — never a guessed
 * parameter list. Isolated preview rendering is explicitly deferred (§7.2) —
 * this is structural truth only.
 * @param {{available: boolean, reason?: string, components?: Array<{name: string, file: string, params: string[], parseError: boolean, usedIn: string[]}>}} [components]
 */
function componentsSectionHtml(components) {
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
  const cards = components.components
    .map((c) => {
      const header = `<h4>${esc(c.name)}${commentControlHtml({ type: "design-system", token: `component:${c.name}` })}</h4>`;
      if (c.parseError) {
        return `    <div class="component-card">
      ${header}
      <p class="meta"><code>${esc(c.file)}</code></p>
      <p class="unresolvable-note">signature could not be parsed cleanly — showing name + file only.</p>
    </div>`;
      }
      const params =
        c.params && c.params.length
          ? `<ul class="component-params">${c.params.map((p) => `<li><code>${esc(p)}</code></li>`).join("")}</ul>`
          : `<p class="empty-inline">no parameters</p>`;
      const usedIn =
        c.usedIn && c.usedIn.length
          ? `<ul class="component-used-in">${c.usedIn.map((f) => `<li><code>${esc(f)}</code></li>`).join("")}</ul>`
          : `<p class="empty-inline">no call sites found under presentation/**</p>`;
      return `    <div class="component-card">
      ${header}
      <p class="meta"><code>${esc(c.file)}</code></p>
      <p class="lbl">parameters</p>${params}
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
      const badgeClass =
        s.status === "approved" ? "badge-approved" : s.status === "changed-since-approval" ? "badge-changed" : "badge-unreviewed";
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
      return `    <tr class="approval-row" data-artifact="${esc(s.id)}">
      <td class="order-num">${orderNumber(s.id)}</td>
      <td>${esc(s.label)}<div class="artifact-id">${esc(s.id)}</div></td>
      <td><span class="badge ${badgeClass}">${esc(s.status)}</span></td>
      <td>${s.fileCount}</td>
      <td>${hashInfo}${s.approvedAt ? `<div class="approved-at">${esc(s.approvedAt)}</div>` : ""}${unresolvableNote}${missingNote}</td>
      <td><button class="approve-btn" data-artifact="${esc(s.id)}"${s.resolvable === false ? " disabled" : ""}>${btnLabel}</button></td>
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

// --- Architecture tab (§7.1) -------------------------------------------------

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

function governedContractHtml(gc) {
  if (!gc || !gc.available) {
    return `<div class="empty">
      <p>No governed contract available.</p>
      <p>${esc((gc && gc.reason) || "specs/app-base.spec.md not found.")}</p>
    </div>`;
  }
  const items = gc.clauses
    .map((c) => {
      const prose = esc(c.prose);
      return `      <li class="clause${c.withdrawn ? " withdrawn" : ""}">
        <span class="clause-id"><code>${esc(c.id)}</code></span>
        <span class="clause-prose">${c.withdrawn ? `<s>${prose}</s>` : prose}</span>
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
 * The Architecture tab (§7.1): the layer map (a real walk of
 * composeApp/src/commonMain/kotlin/**, see architecture.mjs's getLayerMap),
 * the governed contract (specs/app-base.spec.md's clauses, via specs.mjs —
 * reused, not forked), and the exemplar feature shape (the real `home`
 * feature's files on disk). Every section degrades independently — one
 * missing source never hides the other two.
 * @param {{layerMap: object, governedContract: object, featureShape: object}} data
 */
export function architectureTabHtml(data) {
  const { layerMap, governedContract, featureShape } = data || {};
  return `  <section class="arch-section">
    <h3>Layer map</h3>
${layerMapHtml(layerMap)}
  </section>
  <section class="arch-section">
    <h3>The governed contract</h3>
${governedContractHtml(governedContract)}
  </section>
  <section class="arch-section">
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
