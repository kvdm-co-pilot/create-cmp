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

// Karel, 2026-08-24: "in the overview give the option to approve as well" —
// superseding the original "names the act and jumps, never signs" rule. The
// hard constraint survives: it must not be a SECOND approve path. The row
// emits exactly the markup the existing wiring already speaks, so there is one
// approve endpoint, one accept endpoint, and refusals stay the server's.
test("each queue row carries its own signature control, on the EXISTING wiring contract", () => {
  const statuses = [drifted, unsigned];
  const html = overviewBodyHtml({ queue: deriveHumanQueue({ statuses, features: [] }), statuses, statusGlyph });
  // .approve-btn[data-artifact] is what wireApproveButtons binds — same class,
  // same attribute, same POST. A bespoke class here would be a second path.
  assert.match(html, /class="approve-btn fd-sign" data-artifact="architecture">Re-approve</, "a drifted row re-approves");
  assert.match(html, /class="approve-btn fd-sign" data-artifact="intent">Approve</, "an unsigned row approves");
  // Reading it in full stays one click away — the rule's purpose, kept.
  assert.match(html, /class="gov-jump fd-go" data-go-tab="architecture" data-go-artifact="architecture"/);
  assert.match(html, /read it first/);
  // A refusal must surface on THIS panel, not in a hidden box on another tab.
  assert.match(html, /class="banner sig-error" id="overview-error" hidden/);
});

test("a proven feature offers ACCEPT — a different verb on a different endpoint", () => {
  const features = [{ name: "meal", phase: "proven", provenDone: true, covered: 9, total: 9, receipt: { present: true, verdict: "PASS", attestsTree: true } }];
  const statuses = [{ id: "feature-brief:meal", status: "approved" }];
  const html = overviewBodyHtml({ queue: deriveHumanQueue({ statuses, features }), statuses, features, statusGlyph });
  assert.match(html, /class="feature-accept-btn fd-sign" data-name="meal">Accept</, "acceptance is not an approval");
  assert.doesNotMatch(html, /data-artifact="feature-brief:meal"/, "the brief is already signed — re-approving it is not the act");
});

test("an UNRESOLVABLE artifact gets no button that could only fail on click", () => {
  // Drift stays queued even when unresolvable — deleted signed files MUST
  // surface (deriveHumanQueue). That is the row that exists but cannot be
  // signed: it keeps the route to go look, and offers no button that would
  // only be refused. (An unresolvable UNSIGNED artifact never queues at all —
  // it is the agent's work, not a decision the human can make.)
  const statuses = [{ id: "components", status: "changed-since-approval", resolvable: false, fileCount: 0 }];
  const html = overviewBodyHtml({ queue: deriveHumanQueue({ statuses, features: [] }), statuses, statusGlyph });
  assert.match(html, /Re-approve components/, "the act is still named");
  assert.doesNotMatch(html, /approve-btn/, "the same honesty the signature bar applies at its own bar");
  assert.match(html, /read it first/, "…and the route to go look stays");
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

// ── The rich In-flight rendering (walk-legibility L5) ────────────────────────
// walksHtml with the project's OWN walk derivation: the promise list itself,
// per-promise kept state, the stage gloss, Prove's measured cost, signature
// buttons on the your-turn row, and arrivals with now-or-after buttons.

const richWalk = {
  name: "combo",
  phase: "approved",
  open: true,
  currentStage: "contract",
  stages: [
    { key: "decide", label: "Decide", state: "done" },
    { key: "design", label: "Design", state: "skipped", note: "no UI surface" },
    { key: "contract", label: "Contract", state: "current" },
    { key: "build", label: "Build", state: "pending" },
    { key: "prove", label: "Prove", state: "pending", note: "98s last full run" },
    { key: "signoff", label: "Sign-off", state: "pending" },
  ],
  promises: {
    total: 2,
    kept: 1,
    current: { id: "B-01", title: "beta holds" },
    all: [
      { id: "A-01", title: "alpha holds", kept: true },
      { id: "B-01", title: "beta holds", kept: false },
    ],
  },
  you: {
    turn: "you",
    act: "sign the contract (feature-spec:alpha, feature-spec:beta)",
    signable: [
      { verb: "approve", artifact: "feature-spec:alpha" },
      { verb: "approve", artifact: "feature-spec:beta" },
    ],
  },
  stops: ["Contract", "Sign-off"],
  doneReason: "…",
};
const richData = {
  available: true,
  walks: [richWalk],
  arrivals: [{ id: "design-system", label: "Design system", status: "reopened", reason: "harness wave" }],
  lane: { durationMs: 98000, verdict: "PASS" },
  console: { url: "http://127.0.0.1:9600/" },
  gloss: { contract: "agreeing what it promises" },
};

test("L5: the rich card renders the promises THEMSELVES with kept state, not only a tally", () => {
  const html = walksHtml([], [], richData);
  assert.match(html, /wk-plist/);
  assert.match(html, /A-01/);
  assert.match(html, /alpha holds/);
  assert.match(html, /wk-p-kept/, "a kept promise is marked kept");
  assert.match(html, /wk-p-cur/, "the promise being kept NOW is marked current");
  assert.match(html, /1 of 2 promises kept/);
  assert.match(html, /agreeing what it promises/, "the harness's own gloss renders (L3)");
  assert.match(html, /98s last full run/, "Prove carries its measured cost (L4)");
});

test("L5: the your-turn row carries the signature buttons — the ONE existing approve wire", () => {
  const statuses = [
    { id: "feature-spec:alpha", status: "approved" },
    { id: "feature-spec:beta", status: "unreviewed" },
  ];
  const html = walksHtml([], statuses, richData);
  assert.match(html, /class="approve-btn fd-sign" data-artifact="feature-spec:beta"/);
  assert.doesNotMatch(
    html,
    /data-artifact="feature-spec:alpha"/,
    "an already-approved artifact never gets a button that could only fail",
  );
});

test("L5: arrivals render the now-or-after choice as two buttons", () => {
  const html = walksHtml([], [], richData);
  assert.match(html, /wk-arrival-btn" data-arrival="design-system" data-choice="now"/);
  assert.match(html, /data-choice="after"/);
  assert.match(html, /harness wave/, "the journal's reason rides along");
});

test("L5: an accept step renders the feature-accept button", () => {
  const acceptWalk = {
    ...richWalk,
    currentStage: "signoff",
    you: { turn: "you", act: "accept — the proven thing awaits your judgment", signable: [{ verb: "accept", artifact: "combo" }] },
  };
  const html = walksHtml([], [], { ...richData, walks: [acceptWalk], arrivals: [] });
  assert.match(html, /class="feature-accept-btn fd-sign" data-name="combo"/);
});

test("L5: without the walk derivation, the board-mirroring fallback still renders", () => {
  const f = { name: "meal", phase: "approved", nextStep: { key: "build", owner: "agent", label: "build" }, design: null, total: 2, covered: 1, touches: [] };
  const html = walksHtml([f], [], null);
  assert.match(html, /wk-card/);
  assert.match(html, /1 of 2 promises kept/);
  assert.doesNotMatch(html, /wk-plist/, "the rich list needs the derivation — never fabricated from the board");
});

// ── The live chain strip + page anatomy (studio-drive-mode) ──────────────────

import { driveChainHtml } from "../src/lib/console-overview.mjs";
import { renderShellPage } from "../src/lib/console-shell.mjs";

const chainFixture = {
  request: { text: "add supplements with reminders", at: "now" },
  plan: {
    title: "supplement schedules",
    feature: "supplements",
    steps: [
      { n: 1, label: "sign the brief", done: true },
      { n: 2, label: "build", done: false },
      { n: 3, label: "full check", done: false },
    ],
    current: 2,
    updatedAt: "now",
  },
  planAgeMs: 40000,
  busy: { lane: true, render: false },
};

test("chain strip: request, numbered steps with position, freshness, and live corroboration", () => {
  const html = driveChainHtml(chainFixture);
  assert.match(html, /Request<\/span> supplement schedules/, "the agent's restated title leads when declared");
  assert.match(html, /ch-done/);
  assert.match(html, /ch-cur/);
  assert.match(html, /now: step 2 of 3 — build/);
  assert.match(html, /ch-prov-dec[^>]*>declared<\/span> <span class="ch-age">updated 40s ago/, "declared state always carries its provenance + age");
  assert.match(html, /the full check is running NOW/, "tier-3 corroboration comes from the markers, not the plan");
});

test("chain strip: provenance chips label all three tiers (drive-narration N3)", () => {
  const html = driveChainHtml(chainFixture);
  assert.match(html, /ch-prov-obs[^>]*>recorded</, "the request wears the machine's chip — it is the human's own prompt");
  assert.match(html, /ch-prov-obs[^>]*>observed</, "the busy line wears the machine's chip");
  assert.match(html, /ch-prov-dec[^>]*>declared</, "the steps wear the agent's chip");
});

test("chain strip: the harness's pre-rendered narration is rendered verbatim, never paraphrased (N2)", () => {
  const html = driveChainHtml({
    ...chainFixture,
    busyText: "full check — unitTests (10/16) · 12s of ~6s, usually ~52s total",
  });
  assert.match(html, /full check — unitTests \(10\/16\) · 12s of ~6s, usually ~52s total/);
  assert.doesNotMatch(html, /running NOW/, "the legacy phrase yields to the lane's own narration");
});

test("chain strip: step timing derives from the declaration's own stamps (N1)", () => {
  const twoMinAgo = new Date(Date.now() - 120000).toISOString();
  const oneMinAgo = new Date(Date.now() - 60000).toISOString();
  const html = driveChainHtml({
    ...chainFixture,
    plan: {
      ...chainFixture.plan,
      steps: [
        { n: 1, label: "sign the brief", done: true, startedAt: twoMinAgo, doneAt: oneMinAgo },
        { n: 2, label: "build", done: false, startedAt: oneMinAgo },
        { n: 3, label: "full check", done: false },
      ],
    },
  });
  assert.match(html, /ch-time">\(60s\)/, "a done step wears its wall time");
  assert.match(html, /ch-time">60s in/, "the current step wears its elapsed");
});

test("chain strip: closed chains render as the Recent-requests fold (N5)", () => {
  const html = driveChainHtml({
    ...chainFixture,
    history: [
      {
        at: new Date(Date.now() - 40000).toISOString(),
        title: "navigation redesign",
        steps: ["sign", "build", "check"],
        durationMs: 95000,
        receipt: { verdict: "PASS", rung: "L1" },
      },
      { at: new Date(Date.now() - 90000).toISOString(), request: "fix the header", steps: ["build"], durationMs: null, receipt: null },
    ],
  });
  assert.match(html, /<details class="ch-hist"><summary>Recent requests/);
  assert.match(html, /navigation redesign/);
  assert.match(html, /PASS &middot; L1/, "the outcome is the receipt's word at close, not a claim");
  assert.match(html, /no receipt at close/, "an absent receipt is stated, never papered over");
});

test("chain strip: no plan and no request is silence, never an empty frame", () => {
  assert.equal(driveChainHtml(null), "");
  assert.equal(driveChainHtml({ request: null, plan: null, busy: {} }), "");
});

test("chain strip: a bare request (no declared plan) renders honestly as undeclared", () => {
  const html = driveChainHtml({ ...chainFixture, plan: null, planAgeMs: null, busy: {} });
  assert.match(html, /add supplements with reminders/, "the human's own words, recorded mechanically");
  assert.match(html, /no declared step chain/);
});

test("page anatomy: mirror sections collapse to their verdict; queue-targeted ones open; Drive never folds", () => {
  const page = renderShellPage({
    appName: "Acme",
    railItems: [],
    railFootHtml: "",
    bodyScript: "",
    sections: [
      { id: "overview", title: "Drive", statusHtml: "s", bodyHtml: "<p>drive body</p>", active: true },
      { id: "specs", title: "Specs", statusHtml: "verdict", bodyHtml: "<p>the corpus</p>", mirror: true },
      { id: "architecture", title: "Architecture", statusHtml: "v", bodyHtml: "<p>arch</p>", mirror: true, mirrorOpen: true },
    ],
  });
  assert.match(page, /<details class="mirror-details"><summary>Read the full Specs/);
  assert.match(page, /<details class="mirror-details" open><summary>Read the full Architecture/, "a section the queue points at greets open");
  assert.doesNotMatch(page, /Read the full Drive/, "the driving surface is an instrument, never a folded document");
});
