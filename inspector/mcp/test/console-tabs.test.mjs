// console-tabs.mjs — pure (data) -> html generators for the Design System,
// Approvals, and Specs gallery tabs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { designSystemTabHtml, approvalsTabHtml, specsTabHtml } from "../src/lib/console-tabs.mjs";

test("designSystemTabHtml: unavailable -> honest empty-state explaining how to produce a catalog", () => {
  const html = designSystemTabHtml({ available: false });
  assert.match(html, /No design-system catalog available yet/);
  assert.match(html, /design-system\.json/);
  assert.match(html, /connect_live/);
});

test("designSystemTabHtml: available (previews source) -> swatch grid + dimens table, never fabricated", () => {
  const html = designSystemTabHtml({
    available: true,
    source: "previews",
    catalog: { colors: { Primary: "#0A2540" }, dimens: { PaddingPage: "16dp" } },
  });
  assert.match(html, /Primary/);
  assert.match(html, /#0A2540/);
  assert.match(html, /background:#0A2540/, "the swatch is actually rendered in the declared color");
  assert.match(html, /PaddingPage/);
  assert.match(html, /16dp/);
  assert.match(html, /composeApp\/build\/previews\/design-system\.json/, "source is disclosed");
});

test("designSystemTabHtml: available (live source) -> labelled distinctly; empty catalog -> honest inline notes", () => {
  const html = designSystemTabHtml({ available: true, source: "live", catalog: { colors: {}, dimens: {} } });
  assert.match(html, /inspect\/design-system/);
  assert.match(html, /no colors declared/);
  assert.match(html, /no dimens declared/);
});

test("approvalsTabHtml: unavailable -> honest not-available state, with and without a library error", () => {
  const noReason = approvalsTabHtml({ available: false });
  assert.match(noReason, /not available in this project/);
  assert.match(noReason, /older scaffold/);

  const withReason = approvalsTabHtml({ available: false, error: "kaboom" });
  assert.match(withReason, /kaboom/);
});

test("approvalsTabHtml: no governed artifacts resolved yet", () => {
  const html = approvalsTabHtml({ available: true, statuses: [] });
  assert.match(html, /No governed artifacts resolved in this project yet/);
});

test("approvalsTabHtml: §1 order numbers, status badges, short hash, and an Approve button per resolvable artifact", () => {
  const html = approvalsTabHtml({
    available: true,
    statuses: [
      {
        id: "design-system",
        label: "Design system",
        status: "approved",
        hash: "abcdef0123456789",
        storedHash: "abcdef0123456789",
        approvedAt: "2026-07-18T09:00:00.000Z",
        fileCount: 2,
        missing: [],
        resolvable: true,
      },
      {
        id: "architecture",
        label: "Architecture",
        status: "unreviewed",
        hash: "1111111100000000",
        storedHash: null,
        approvedAt: null,
        fileCount: 1,
        missing: [],
        resolvable: true,
      },
      {
        id: "exemplar-feature",
        label: "Exemplar feature",
        status: "changed-since-approval",
        hash: "222222220000",
        storedHash: "333333330000",
        approvedAt: "2026-07-01T00:00:00.000Z",
        fileCount: 9,
        missing: [],
        resolvable: true,
      },
      {
        id: "feature-spec:tags",
        label: "Feature spec (tags)",
        status: "unreviewed",
        hash: null,
        storedHash: null,
        approvedAt: null,
        fileCount: 0,
        missing: ["specs/tags.spec.md"],
        resolvable: false,
      },
    ],
  });
  // §1 ordered-walk numbering.
  assert.match(html, /<td class="order-num">1<\/td>/, "design-system is #1");
  assert.match(html, /<td class="order-num">2<\/td>/, "architecture is #2");
  assert.match(html, /<td class="order-num">3<\/td>/, "exemplar-feature is #3");
  assert.match(html, /<td class="order-num">5<\/td>/, "feature-spec:* is #5");
  // Status badges.
  assert.match(html, /badge-approved/);
  assert.match(html, /badge-unreviewed/);
  assert.match(html, /badge-changed/);
  // Short hash + re-approve wording on an already-approved artifact.
  assert.match(html, /abcdef01/);
  assert.match(html, /Re-approve/);
  // The unresolvable artifact's button is disabled and carries the CLI's marking.
  assert.match(html, /data-artifact="feature-spec:tags"[^>]*disabled/);
  assert.match(html, /unresolvable \(0 of expected files resolved\) — not approvable/);
  assert.match(html, /missing: specs\/tags\.spec\.md/);
  // A resolvable artifact's button is NOT disabled.
  assert.doesNotMatch(html, /data-artifact="design-system"[^>]*disabled/);
});

test("specsTabHtml: unavailable -> honest empty-state", () => {
  assert.match(specsTabHtml({ available: false }), /No specs\/ directory found/);
});

test("specsTabHtml: clause list with coverage badges, strikes through withdrawn prose", () => {
  const html = specsTabHtml({
    available: true,
    files: [
      {
        file: "home.spec.md",
        clauses: [
          { id: "HOME-01", withdrawn: false, prose: "Given X, Then Y", cited: true },
          { id: "HOME-02", withdrawn: false, prose: "Given A, Then B", cited: false },
          { id: "HOME-03", withdrawn: true, prose: "old behavior", cited: null },
        ],
      },
    ],
  });
  assert.match(html, /home\.spec\.md/);
  assert.match(html, /HOME-01/);
  assert.match(html, /cov-yes">covered/);
  assert.match(html, /cov-no">no citing test/);
  assert.match(html, /cov-na">withdrawn/);
  assert.match(html, /<s>old behavior<\/s>/, "withdrawn prose is struck through");
  assert.match(html, /class="clause withdrawn"/);
});
