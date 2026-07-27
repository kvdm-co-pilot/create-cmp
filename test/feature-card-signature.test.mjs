// "Sign where you read" (80a4c29) — applied to the one card that renders a
// whole brief.
//
// The Features card shows the brief's decisions, its phase chip, its derived
// doneness, and a derived next step naming the human who owns it. For a
// `reopened` brief that next step reads "finish the redesign, then re-approve
// the brief · human" — and the card used to offer no way to do it, sending the
// reader to the Approvals table to perform the act the card had just asked for.
//
// `reopened` is a first-class phase (qa/lib/approvals.mjs: "changed-since-
// approval / reopened read as themselves"), so it needs the same control the
// other awaiting-signature phases get.

import { test } from "node:test";
import assert from "node:assert/strict";

import { featuresTabHtml } from "../inspector/mcp/src/lib/console-tabs.mjs";

/** A board of one feature in the given phase — the shape featuresTabHtml renders. */
function boardWith(phase, overrides = {}) {
  return {
    available: true,
    board: {
      features: [
        {
          name: "meal-plan",
          rel: "docs/features/meal-plan.md",
          phase,
          covered: 23,
          total: 23,
          decisions: [],
          touches: [],
          clauses: [],
          record: null,
          design: null,
          nextStep: { label: "finish the redesign, then re-approve the brief", owner: "human" },
          specExists: true,
          specRel: "specs/meal-plan.spec.md",
          receipt: { present: true, verdict: "PASS", attestsTree: true },
          provenDone: true,
          doneReason: "23/23 clauses cited · receipt PASS · attests this tree",
          ...overrides,
        },
      ],
      undeclared: [],
    },
  };
}

test("a REOPENED brief offers its re-approval on the card that renders it", () => {
  const html = featuresTabHtml(boardWith("reopened"));

  // The same approve-btn contract every other signature control speaks, aimed
  // at this feature's brief artifact.
  assert.match(html, /class="approve-btn" data-artifact="feature-brief:meal-plan"/);
  assert.match(html, /Re-approve brief/);
});

test("an unsigned brief offers Approve; a drifted one offers Re-approve", () => {
  const proposed = featuresTabHtml(boardWith("proposed"));
  assert.match(proposed, /data-artifact="feature-brief:meal-plan"/);
  assert.match(proposed, /Approve brief/);
  assert.doesNotMatch(proposed, /Re-approve brief/);

  const drifted = featuresTabHtml(boardWith("changed-since-approval"));
  assert.match(drifted, /data-artifact="feature-brief:meal-plan"/);
  assert.match(drifted, /Re-approve brief/);
});

test("phases whose next step is NOT a signature offer no approve control", () => {
  // `approved` is mid-build and `accepted` is closed — offering a signature on
  // either would invent a decision the human does not currently owe.
  for (const phase of ["approved", "accepted"]) {
    const html = featuresTabHtml(boardWith(phase));
    assert.doesNotMatch(
      html,
      /class="approve-btn" data-artifact="feature-brief:meal-plan"/,
      `${phase} must not offer a brief signature`,
    );
  }
});

test("the card never grows an agent verb — only the human's two moments", () => {
  // Agents hold no signing verb. Whatever else the card gains, the only
  // buttons on it are the human's: approve the brief, accept the feature.
  const html = featuresTabHtml(boardWith("proven"));
  const buttons = [...html.matchAll(/class="([a-z-]*btn)"/g)].map((m) => m[1]);

  for (const cls of buttons) {
    assert.ok(
      ["approve-btn", "reopen-btn", "feature-accept-btn"].includes(cls),
      `unexpected control on the feature card: ${cls}`,
    );
  }
});
