// console-tabs.mjs — pure (data) -> html generators for the three new console
// tabs on the resident preview gallery (VERIFICATION-LAYER-DESIGN.md §4): Design
// System, Approvals, Specs. The Screens tab is untouched gallery markup (still
// built inline by preview-service.mjs's galleryHtml).
//
// Pure and dependency-free, same style as preview-service.mjs's galleryHtml:
// (state) -> html string, no DOM, no CDN. Every tab degrades honestly to an
// empty-state explanation when its data source isn't available yet — never
// fabricated values.

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
 * /inspect/design-system fetch). Never fabricates values — an unavailable
 * catalog gets an honest empty-state explaining how to produce one.
 * @param {{available: boolean, source?: "previews"|"live", catalog?: {colors?: object, dimens?: object}}} ds
 */
export function designSystemTabHtml(ds) {
  if (!ds || !ds.available) {
    return `<div class="empty">
      <p>No design-system catalog available yet.</p>
      <p>Produce one by letting the preview gallery render at least once (writes
      <code>composeApp/build/previews/design-system.json</code>), or connect a running
      DEBUG build (<code>connect_live</code>) so it can be read live from
      <code>/inspect/design-system</code>.</p>
    </div>`;
  }
  const colors = (ds.catalog && ds.catalog.colors) || {};
  const dimens = (ds.catalog && ds.catalog.dimens) || {};
  const colorCards = Object.entries(colors)
    .map(
      ([name, hex]) => `    <div class="swatch-card">
      <div class="swatch" style="background:${esc(hex)}"></div>
      <div class="swatch-name">${esc(name)}</div>
      <div class="swatch-value"><code>${esc(hex)}</code></div>
    </div>`,
    )
    .join("\n");
  const dimenRows = Object.entries(dimens)
    .map(([name, val]) => `    <tr><td>${esc(name)}</td><td><code>${esc(val)}</code></td></tr>`)
    .join("\n");
  const sourceLabel =
    ds.source === "live" ? "running app (GET /inspect/design-system)" : "composeApp/build/previews/design-system.json";
  return `  <p class="meta">source: ${esc(sourceLabel)}</p>
  <h3>Colors</h3>
  <div class="swatch-grid">
${colorCards || '    <p class="empty-inline">no colors declared</p>'}
  </div>
  <h3>Dimens</h3>
  <table class="dimens-table"><tbody>
${dimenRows || '    <tr><td colspan="2" class="empty-inline">no dimens declared</td></tr>'}
  </tbody></table>`;
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
