// The governance strip + the ONE human-queue derivation (2026-07-28 flow
// audit, fixes 3 & 5).
//
// deriveHumanQueue is the single answer to "whose turn is it?" — the strip,
// the guided prompt (preview-service's pendingOnHuman), and the post-decision
// payload all read it. The audit's finding 3 was two derivations disagreeing:
// the Features card said "waiting on you" (next-step table) while the guided
// queue said nothing was (its reopened-exclusion comment). These tests pin the
// single derivation's split: reopened+unproven stays OUT of the queue,
// reopened+provenDone (a finished, proven redesign) comes IN.

import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveHumanQueue, governanceStripHtml } from "../src/lib/console-shell.mjs";

const status = (id, status, extra = {}) => ({ id, status, resolvable: true, ...extra });

test("deriveHumanQueue: unreviewed and drifted artifacts queue; approved and unresolvable never do", () => {
  const queue = deriveHumanQueue({
    statuses: [
      status("intent", "approved"),
      status("design-system", "unreviewed"),
      status("components", "unreviewed", { resolvable: false }),
      status("architecture", "changed-since-approval"),
    ],
    features: [],
  });
  assert.deepEqual(
    queue.map((q) => q.artifact),
    ["design-system", "architecture"],
  );
  assert.match(queue.find((q) => q.artifact === "architecture").label, /changed since signing/);
});

test("THE SPLIT: a reopened brief queues iff its redesign derives provenDone", () => {
  const statuses = [status("feature-brief:meal-plan", "reopened")];

  // Mid-redesign: waits on the WORK — the queue must stay silent.
  const midWork = deriveHumanQueue({
    statuses,
    features: [{ name: "meal-plan", phase: "reopened", provenDone: false }],
  });
  assert.equal(midWork.length, 0, "prompting a re-approval mid-redesign would invite signing an unfinished redesign");

  // Redesign proven (23/23 cited, receipt PASS, attests the tree): it is now
  // exactly the human's turn — the meal-plan case the audit reconstructed.
  const proven = deriveHumanQueue({
    statuses,
    features: [{ name: "meal-plan", phase: "reopened", provenDone: true }],
  });
  assert.equal(proven.length, 1);
  assert.equal(proven[0].artifact, "feature-brief:meal-plan");
  assert.equal(proven[0].tab, "features");
  assert.match(proven[0].label, /redesign is proven/);
});

test("deriveHumanQueue: a NON-brief reopened artifact never queues (no doneness to derive — it waits on the work)", () => {
  const queue = deriveHumanQueue({
    statuses: [status("design-system", "reopened")],
    features: [{ name: "meal-plan", phase: "reopened", provenDone: true }],
  });
  assert.equal(queue.length, 0);
});

test("deriveHumanQueue: proven features queue their acceptance; excludeArtifact drops the just-acted-on item", () => {
  const data = {
    statuses: [status("feature-brief:meal", "approved"), status("design-system", "unreviewed")],
    features: [{ name: "meal", phase: "proven", provenDone: true }],
  };
  assert.deepEqual(
    deriveHumanQueue(data).map((q) => q.artifact),
    ["design-system", "feature-brief:meal"],
  );
  assert.deepEqual(
    deriveHumanQueue(data, "feature-brief:meal").map((q) => q.artifact),
    ["design-system"],
  );
});

test("governanceStripHtml: counts, the one next act as a jump button, and (+n more)", () => {
  const html = governanceStripHtml({
    statuses: [
      status("intent", "approved"),
      status("architecture", "approved"),
      status("design-system", "reopened"),
      status("components", "changed-since-approval"),
      status("feature-brief:meal", "unreviewed"),
    ],
    features: [],
    journal: [],
  });
  assert.match(html, /id="gov-strip"/);
  assert.match(html, /2 signed/);
  assert.match(html, /2 await you/); // components (drift) + feature-brief:meal (unreviewed)
  assert.match(html, /1 in redesign/); // design-system: reopened, unproven — not in the queue
  assert.match(html, /1 drifted/);
  // The next act is the FIRST queue item, as a jump button speaking the same
  // data-tab/data-artifact contract the guided prompt's "Take me there" uses.
  assert.match(html, /class="gov-next" data-go-tab="components" data-go-artifact="components"/);
  assert.match(html, /\(\+1 more\)/);
});

test("governanceStripHtml: nothing pending says so; no statuses at all renders NOTHING (silence, not a fabricated dashboard)", () => {
  const clear = governanceStripHtml({ statuses: [status("intent", "approved")], features: [], journal: [] });
  assert.match(clear, /Nothing waits on you\./);
  assert.doesNotMatch(clear, /gov-next/);

  assert.equal(governanceStripHtml({ statuses: [], features: [], journal: [] }), "");
});

test("governanceStripHtml: History reads the journal — verb, artifact, via, and the reopen's REASON — newest first, escaped", () => {
  const html = governanceStripHtml({
    statuses: [status("intent", "approved")],
    features: [],
    journal: [
      { at: "2026-07-27T06:12:38.016Z", verb: "approve", artifact: "feature-brief:meal-plan", via: "console" },
      { at: "2026-07-27T16:03:48.381Z", verb: "reopen", artifact: "feature-brief:meal-plan", via: "cli", reason: "reminders <join> the brief" },
    ],
  });
  assert.match(html, /<details class="gov-history">/);
  assert.match(html, /reopen feature-brief:meal-plan via cli/);
  // The reason renders, HTML-escaped.
  assert.match(html, /reminders &lt;join&gt; the brief/);
  assert.doesNotMatch(html, /<join>/);
  // Newest first: the reopen (later) appears before the approve (earlier).
  assert.ok(html.indexOf("reopen feature-brief:meal-plan") < html.indexOf("approve feature-brief:meal-plan"));
});
