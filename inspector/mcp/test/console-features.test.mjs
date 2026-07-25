// The Features section (console-tabs.mjs featuresTabHtml): the per-feature
// view's render states. Pure-function tests — the board data shape comes from
// the project lib's getFeatureBoard (covered by the template-side
// test/feature-brief.test.mjs); here we prove the console renders each phase
// honestly and offers each action only when it is the real next step.

import { test } from "node:test";
import assert from "node:assert/strict";

import { featuresTabHtml } from "../src/lib/console-tabs.mjs";

const baseFeature = (over = {}) => ({
  name: "meal",
  rel: "docs/features/meal.md",
  phase: "approved",
  record: { status: "approved", approvedAt: "2026-07-24T10:00:00Z", via: "console" },
  touches: [{ id: "components", status: "approved", label: "Components" }],
  blockError: null,
  specRel: "specs/meal.spec.md",
  specExists: true,
  clauses: [
    { id: "MEAL-01", withdrawn: false, cited: true },
    { id: "MEAL-02", withdrawn: false, cited: false },
  ],
  covered: 1,
  total: 2,
  receipt: { present: true, verdict: "PASS", attestsTree: false },
  provenDone: false,
  doneReason: "1/2 clauses cited — 1 promise(s) have no citing test",
  ...over,
});

test("degrades honestly when the project lib predates the wave", () => {
  const html = featuresTabHtml({ available: false });
  assert.match(html, /not available in this project/);
  assert.match(html, /docs\/features\//);
});

test("empty board explains how a brief is born — location is the opt-in", () => {
  const html = featuresTabHtml({ available: true, board: { features: [], undeclared: [] } });
  assert.match(html, /no feature briefs yet/);
  assert.match(html, /docs\/features\//);
  assert.match(html, /location is the governance opt-in/);
});

test("proposed brief offers Approve; approved brief shows building, never a button", () => {
  const proposed = featuresTabHtml({
    available: true,
    board: { features: [baseFeature({ phase: "proposed", record: null })], undeclared: [] },
  });
  assert.match(proposed, /class="approve-btn" data-artifact="feature-brief:meal"/);

  const approved = featuresTabHtml({ available: true, board: { features: [baseFeature()], undeclared: [] } });
  assert.doesNotMatch(approved, /approve-btn/);
  assert.doesNotMatch(approved, /feature-accept-btn/);
  assert.match(approved, /building — Accept enables when doneness derives/);
  // there is NO agent verb anywhere on the card
  assert.doesNotMatch(approved, /--deliver/);
});

test("the clause slice renders each clause's live citation state and the honest doneReason", () => {
  const html = featuresTabHtml({ available: true, board: { features: [baseFeature()], undeclared: [] } });
  assert.match(html, /MEAL-01/);
  assert.match(html, /cited by a test/);
  assert.match(html, /no citing test yet/);
  assert.match(html, /1\/2 clauses cited/);
  assert.match(html, /not yet proven done/);
});

test("proven (derived, never claimed) offers Accept; anything less does not", () => {
  const proven = featuresTabHtml({
    available: true,
    board: {
      features: [
        baseFeature({
          phase: "proven",
          clauses: [
            { id: "MEAL-01", withdrawn: false, cited: true },
            { id: "MEAL-02", withdrawn: false, cited: true },
          ],
          covered: 2,
          receipt: { present: true, verdict: "PASS", attestsTree: true },
          provenDone: true,
          doneReason: "2/2 clauses cited · receipt PASS · attests this tree",
        }),
      ],
      undeclared: [],
    },
  });
  assert.match(proven, /feature-accept-btn/);
  assert.match(proven, /✓ proven done/);

  const stale = featuresTabHtml({ available: true, board: { features: [baseFeature()], undeclared: [] } });
  assert.doesNotMatch(stale, /feature-accept-btn/);
});

test("a missing spec renders the contract-step explanation, not a crash", () => {
  const html = featuresTabHtml({
    available: true,
    board: {
      features: [
        baseFeature({
          phase: "proposed",
          record: null,
          specExists: false,
          clauses: [],
          covered: 0,
          total: 0,
          receipt: { present: false, verdict: null, attestsTree: false },
          doneReason: "no spec yet (specs/meal.spec.md) — behavior starts as clauses there",
        }),
      ],
      undeclared: [],
    },
  });
  assert.match(html, /no spec yet/);
  assert.match(html, /behavior starts as clauses there/);
});

test("declared drift reads as planned; undeclared blast gets the banner", () => {
  const html = featuresTabHtml({
    available: true,
    board: {
      features: [baseFeature({ touches: [{ id: "components", status: "changed-since-approval", label: "Components" }] })],
      undeclared: [{ id: "design-system", label: "Design system" }],
    },
  });
  assert.match(html, /as declared/);
  assert.match(html, /Undeclared blast/);
  assert.match(html, /design-system/);
});

test("a malformed cmp:feature block is surfaced, escaped, never markup", () => {
  const html = featuresTabHtml({
    available: true,
    board: {
      features: [baseFeature({ blockError: `not valid JSON — <script>alert(1)</script>` })],
      undeclared: [],
    },
  });
  assert.match(html, /cmp:feature block/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});
