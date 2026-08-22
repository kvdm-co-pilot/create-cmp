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
