// The Features section (console-tabs.mjs featuresTabHtml): the post-genesis
// delivery board's render states. Pure-function tests — the board data shape
// comes from the project lib's getFeatureBoard (covered by the template-side
// test/feature-intent.test.mjs); here we prove the console renders each phase
// honestly and offers each action only when it is the real next step.

import { test } from "node:test";
import assert from "node:assert/strict";

import { featuresTabHtml } from "../src/lib/console-tabs.mjs";

const baseFeature = (over = {}) => ({
  name: "meal-plan",
  rel: "docs/proposals/meal-plan.md",
  phase: "approved",
  record: { status: "approved", approvedAt: "2026-07-24T10:00:00Z", via: "console" },
  checks: { satisfied: 1, total: 3, results: [{ id: "clauses", kind: "spec-clauses", ok: true, detail: "ok" }], error: null },
  failing: [],
  touches: [{ id: "components", status: "approved", label: "Components" }],
  ...over,
});

test("degrades honestly when the project lib predates the wave", () => {
  const html = featuresTabHtml({ available: false });
  assert.match(html, /not available in this project/);
  assert.match(html, /cmp:intent-checks/);
});

test("empty board explains how a brief is born", () => {
  const html = featuresTabHtml({ available: true, board: { features: [], undeclared: [] } });
  assert.match(html, /no feature briefs yet/);
  assert.match(html, /docs\/proposals\//);
});

test("proposed brief offers Approve; approved brief offers the agent's --deliver hint, never a button", () => {
  const proposed = featuresTabHtml({
    available: true,
    board: { features: [baseFeature({ phase: "proposed", record: null })], undeclared: [] },
  });
  assert.match(proposed, /class="approve-btn" data-artifact="feature-intent:meal-plan"/);

  const approved = featuresTabHtml({ available: true, board: { features: [baseFeature()], undeclared: [] } });
  assert.doesNotMatch(approved, /approve-btn/);
  assert.doesNotMatch(approved, /feature-accept-btn/);
  assert.match(approved, /--deliver meal-plan/);
});

test("delivered+green offers Accept; delivered+red does not", () => {
  const green = featuresTabHtml({
    available: true,
    board: {
      features: [
        baseFeature({
          phase: "delivered",
          record: { status: "approved", approvedAt: "x", delivered: true, deliveredAt: "y" },
          checks: { satisfied: 2, total: 2, results: [], error: null },
        }),
      ],
      undeclared: [],
    },
  });
  assert.match(green, /feature-accept-btn/);

  const red = featuresTabHtml({
    available: true,
    board: {
      features: [
        baseFeature({
          phase: "delivered",
          record: { status: "approved", approvedAt: "x", delivered: true, deliveredAt: "y" },
          checks: { satisfied: 1, total: 2, results: [{ id: "day", kind: "pattern", ok: false, detail: "missing" }], error: null },
        }),
      ],
      undeclared: [],
    },
  });
  assert.doesNotMatch(red, /feature-accept-btn/);
  // armed + failing renders the lane's red mark, not the informational ○
  assert.match(red, /bad-inline/);
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

test("check details are escaped — a brief's text never becomes markup", () => {
  const html = featuresTabHtml({
    available: true,
    board: {
      features: [
        baseFeature({
          checks: {
            satisfied: 0,
            total: 1,
            results: [{ id: "x", kind: "pattern", ok: false, detail: `<script>alert(1)</script>` }],
            error: null,
          },
        }),
      ],
      undeclared: [],
    },
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});
