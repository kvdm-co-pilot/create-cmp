// console-overview.mjs — the front door (§3.0). Its whole contract is that it
// AGGREGATES WITHOUT OWNING: every number it prints came from the module that
// derived it, it grows no signature control of its own, and an absent ledger
// is stated as absent rather than dressed up as "nothing to do".
import { test } from "node:test";
import assert from "node:assert/strict";
import { overviewBodyHtml, overviewStatusHtml, overviewGlyph } from "../src/lib/console-overview.mjs";
import { statusGlyph, receiptGlyph, formatAgeCoarse, deriveHumanQueue } from "../src/lib/console-shell.mjs";

const drifted = { id: "architecture", status: "changed-since-approval" };
const unsigned = { id: "intent", status: "unreviewed" };
const signed = { id: "design-system", status: "approved" };

test("the queue is deriveHumanQueue's, in its order — the front door invents no work", () => {
  const statuses = [signed, drifted, unsigned];
  const queue = deriveHumanQueue({ statuses, features: [] });
  const html = overviewBodyHtml({ queue, statuses, statusGlyph });
  // Every derived item is rendered, and nothing else is.
  for (const item of queue) assert.match(html, new RegExp(item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal((html.match(/class="fd-item"/g) || []).length, queue.length);
  // Order is the derivation's, not a visual choice.
  assert.ok(html.indexOf("Approve intent") !== html.indexOf("Re-approve architecture"));
});

test("no ledger is stated as absent — never as 'nothing waits on you'", () => {
  const html = overviewBodyHtml({ queue: [], statuses: [], statusGlyph });
  assert.match(html, /no approvals ledger in this project/);
  assert.doesNotMatch(html, /Nothing waits on you/, "an absent ledger must never read as a clean bill of health");
});

test("a genuinely empty queue says so, and only when there IS a ledger", () => {
  const html = overviewBodyHtml({ queue: [], statuses: [signed], statusGlyph });
  assert.match(html, /Nothing waits on you/);
});

test("a drifted item shows the file split from approval-diff — the counts, not the diff", () => {
  const statuses = [drifted];
  const queue = deriveHumanQueue({ statuses, features: [] });
  const html = overviewBodyHtml({
    queue,
    statuses,
    statusGlyph,
    anchoredDiffs: {
      architecture: {
        available: true,
        anchorSha: "abc1234",
        diff: "--- a/specs/app-base.spec.md\n+++ b/specs/app-base.spec.md\n+ARCH-06 …",
        files: {
          changed: [{ status: "M", path: "specs/app-base.spec.md" }],
          unchanged: ["docs/ARCHITECTURE.md", "composeApp/build.gradle.kts"],
        },
      },
    },
  });
  assert.match(html, /1 file changed since you signed/);
  assert.match(html, /2 of 3 still exactly as signed/, "what is STILL signed is half the answer");
  assert.match(html, /specs\/app-base\.spec\.md/);
  // The raw diff belongs to the owning section; duplicating it here would make
  // the front door a second copy of everything — the exact failure it fixes.
  assert.doesNotMatch(html, /\+\+\+ b\//, "the anchored diff itself stays in the section that owns it");
});

test("an unlocatable anchor says it is not derivable — it never guesses a diff", () => {
  const statuses = [drifted];
  const html = overviewBodyHtml({
    queue: deriveHumanQueue({ statuses, features: [] }),
    statuses,
    statusGlyph,
    anchoredDiffs: { architecture: { available: false, reason: "no commit in the last 120 matched the stored hash" } },
  });
  assert.match(html, /not derivable/);
  assert.match(html, /no commit in the last 120 matched the stored hash/);
});

test("a proven feature awaiting acceptance shows WHY it is proven", () => {
  const features = [
    {
      name: "meal",
      phase: "proven",
      provenDone: true,
      covered: 9,
      total: 9,
      receipt: { present: true, verdict: "PASS", attestsTree: true },
    },
  ];
  const statuses = [signed];
  const queue = deriveHumanQueue({ statuses, features });
  const html = overviewBodyHtml({ queue, statuses, features, statusGlyph });
  assert.match(html, /Accept meal — proven done/);
  assert.match(html, /9 of 9 clauses cited/);
  assert.match(html, /receipt PASS/);
  assert.match(html, /attesting this tree/);
});

test("the front door grows NO signature control — it names the act and jumps", () => {
  const statuses = [drifted, unsigned];
  const html = overviewBodyHtml({ queue: deriveHumanQueue({ statuses, features: [] }), statuses, statusGlyph });
  assert.doesNotMatch(html, /api\/approve|class="approve|data-approve/, "sign where you read: no second approve button");
  // The jump reuses the strip's contract so one delegated handler serves both.
  assert.match(html, /class="gov-jump fd-go" data-go-tab="architecture" data-go-artifact="architecture"/);
  assert.match(html, /data-go-tab="intent"/);
});

test("the digest is embedded, not re-derived — the front door passes it through verbatim", () => {
  const html = overviewBodyHtml({
    queue: [],
    statuses: [signed],
    statusGlyph,
    digestHtml: "<h3>Lane runs</h3><p>SENTINEL</p>",
    digestSince: "7 days ago",
  });
  assert.match(html, /What changed/);
  assert.match(html, /window: since 7 days ago/);
  assert.match(html, /SENTINEL/);
});

test("no digest -> the block is absent entirely, not an invented empty state", () => {
  const html = overviewBodyHtml({ queue: [], statuses: [signed], statusGlyph });
  assert.doesNotMatch(html, /What changed/);
});

test("the standing line reuses receiptGlyph and states the signing tally", () => {
  const html = overviewStatusHtml({
    receipt: { available: true, verdict: "PASS", stale: false, ageMs: 3_600_000, evidenceLevel: { rung: "L2", name: "device" } },
    statuses: [signed, drifted],
    receiptGlyph,
    formatAge: formatAgeCoarse,
  });
  assert.match(html, /verify PASS/);
  assert.match(html, /1h ago/);
  assert.match(html, /L2 device/);
  assert.match(html, /1 of 2 signed/);
});

test("the standing line is silent about a tally it has no ledger for", () => {
  const html = overviewStatusHtml({ receipt: { available: false }, statuses: [], receiptGlyph, formatAge: formatAgeCoarse });
  assert.doesNotMatch(html, /0 of 0 signed/, "an absence must not print as a finding");
});

test("a stale PASS is never presented as a live green on the front door", () => {
  const html = overviewStatusHtml({
    receipt: { available: true, verdict: "PASS", stale: true, ageMs: 1000 },
    statuses: [signed],
    receiptGlyph,
    formatAge: formatAgeCoarse,
  });
  assert.match(html, /stale/);
  assert.match(html, /glyph-drift/, "the shared derivation demotes it — the front door does not re-decide");
});

test("the rail glyph follows the queue, and drift outranks a plain wait", () => {
  assert.equal(overviewGlyph([], []), null, "ungoverned project gets no glyph, not a green one");
  assert.equal(overviewGlyph([], [signed]).cls, "glyph-signed");
  const waiting = overviewGlyph([{ artifact: "intent", tab: "intent", label: "Approve intent" }], [unsigned]);
  assert.equal(waiting.cls, "glyph-unsigned");
  const drift = overviewGlyph(
    [{ artifact: "architecture", tab: "architecture", label: "Re-approve architecture — it changed since signing" }],
    [drifted]
  );
  assert.equal(drift.cls, "glyph-drift");
});

test("the rail glyph reads DRIFT from the ledger, not from the label's wording", () => {
  // Reword deriveHumanQueue's prose and the glyph must not change: a colour
  // that depends on a sentence stops going red the day someone edits the
  // sentence, and nobody finds out.
  const reworded = [{ artifact: "architecture", tab: "architecture", label: "architecture needs another look" }];
  assert.equal(overviewGlyph(reworded, [drifted]).cls, "glyph-drift");
  // …and the converse: drift-sounding prose on a merely-unsigned artifact must
  // NOT borrow the reserved red.
  const alarming = [{ artifact: "components", tab: "components", label: "Approve components — it changed since signing" }];
  assert.equal(overviewGlyph(alarming, [{ id: "components", status: "unreviewed" }]).cls, "glyph-unsigned");
});

test("a queue glyph states the ACT, not the artifact — an acceptance never reads as done", () => {
  const features = [
    { name: "meal", phase: "proven", provenDone: true, covered: 9, total: 9, receipt: { present: true, verdict: "PASS", attestsTree: true } },
  ];
  // The brief itself IS approved — statusGlyph would call that a green ●, and
  // on a queue of things waiting on you that reads as "nothing to do here".
  const statuses = [{ id: "feature-brief:meal", status: "approved" }];
  const html = overviewBodyHtml({ queue: deriveHumanQueue({ statuses, features }), statuses, features, statusGlyph });
  assert.match(html, /glyph-attn/, "the rail's existing 'needs your acceptance' vocabulary, not a green signed dot");
  assert.doesNotMatch(html, /class="glyph glyph-signed"/, "a row that waits on you is never drawn as signed");
});

// History moved here from the rail strip (2026-08-22): the strip had become a
// lower-fidelity copy of this page, shown next to this page. Nothing was
// dropped in the move — the journal is the SIGNING record (verb, who, and a
// reopen's reason), a different ledger from the digest's git-derived events.
test("History reads the journal — verb, artifact, via, and the reopen's REASON — newest first, escaped", () => {
  const html = overviewBodyHtml({
    queue: [],
    statuses: [{ id: "intent", status: "approved" }],
    statusGlyph,
    formatAge: formatAgeCoarse,
    journal: [
      { at: "2026-07-27T06:12:38.016Z", verb: "approve", artifact: "feature-brief:meal-plan", via: "console" },
      { at: "2026-07-27T16:03:48.381Z", verb: "reopen", artifact: "feature-brief:meal-plan", via: "cli", reason: "reminders <join> the brief" },
    ],
  });
  assert.match(html, /History/);
  assert.match(html, /reopen feature-brief:meal-plan via cli/);
  assert.match(html, /reminders &lt;join&gt; the brief/);
  assert.doesNotMatch(html, /<join>/, "a reason is ledger text — escaped, never markup");
  assert.ok(
    html.indexOf("reopen feature-brief:meal-plan") < html.indexOf("approve feature-brief:meal-plan"),
    "newest first"
  );
});

test("an empty journal renders no History block at all", () => {
  const html = overviewBodyHtml({ queue: [], statuses: [{ id: "intent", status: "approved" }], statusGlyph, journal: [] });
  assert.doesNotMatch(html, /fd-history/);
});

// ── In flight — the walks (docs/features/walk-status.md) ──────────────────────
import { walksHtml } from "../src/lib/console-overview.mjs";

const buildingFeature = {
  name: "meal", phase: "approved", design: null, covered: 4, total: 7,
  touches: [], nextStep: { key: "build", owner: "agent", label: "build & cite: 3 clause(s) have no citing test yet" },
};

test("walks: a building feature renders the six-stage tracker, promises kept, and the agent's turn", () => {
  const html = walksHtml([buildingFeature], []);
  assert.match(html, /In flight/);
  for (const label of ["Decide", "Design", "Contract", "Build", "Prove", "Sign-off"]) assert.match(html, new RegExp(label));
  assert.match(html, /wk-cur"[^>]*><span class="wk-dot"><\/span>Build/, "Build is the current stage");
  assert.match(html, /4 of 7 promises kept/);
  assert.match(html, /wk-agent/, "building is the agent's turn — quiet, not a YOUR TURN chip");
  assert.match(html, /Design — no UI surface/, "a skipped Design says why, never silently");
});

test("walks: a proven feature shows YOUR TURN at Sign-off; an accepted one is absent entirely", () => {
  const proven = { ...buildingFeature, name: "goals", covered: 7, phase: "proven", nextStep: { key: "accept", owner: "human", label: "accept — the proven thing awaits your judgment" } };
  const html = walksHtml([proven, { ...buildingFeature, name: "closed", phase: "accepted" }], []);
  assert.match(html, /wk-turn">YOUR TURN/);
  assert.doesNotMatch(html, /data-walk="closed"/, "an accepted walk is closed — not in flight");
});

test("walks: a reopened artifact no open walk accounts for renders as an ARRIVAL; owned ones never do", () => {
  const statuses = [
    { id: "feature-design:settings", status: "reopened", label: "Feature design (settings)" },
    { id: "feature-design:meal", status: "reopened", label: "Feature design (meal)" },
  ];
  const withDesign = { ...buildingFeature, design: { id: "feature-design:meal", status: "reopened" } };
  const html = walksHtml([withDesign], statuses);
  assert.match(html, /ARRIVED, UNPLANNED &mdash; Feature design \(settings\)/, "the harness-wave reopen surfaces");
  assert.doesNotMatch(html, /ARRIVED, UNPLANNED &mdash; Feature design \(meal\)/, "an open walk's own design is its Design stage, not an arrival");
});

test("walks: nothing open and nothing arrived renders NOTHING — silence, not an empty frame", () => {
  assert.equal(walksHtml([{ ...buildingFeature, phase: "accepted" }], []), "");
  assert.equal(walksHtml([], []), "");
});
