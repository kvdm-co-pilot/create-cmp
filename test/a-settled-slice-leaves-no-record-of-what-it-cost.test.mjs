// A SETTLED SLICE LEFT NO RECORD OF WHAT IT COST.
//
// `close()` deleted `qa-artifacts/proof-plan.json`, `--record-review` overwrote
// `review-latest.json`, and every fleet run overwrote `fleet-latest.json`. Each was
// right for its gate and together they erased G2's evidence: on 2026-09-17 the
// question "where does a slice's wall-clock go" could only be answered from
// thirteen vendor session transcripts and a macOS sleep log.
//
// The invariant tested here is the class, not one writer: EVERY at-close record
// this repo writes is also appended to a history under qa-artifacts, and the
// history reader attributes what it holds to the slice that owned it. The live
// working files are never touched — every write goes to a temp root.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

import { close, openPlan, recordReview } from "../scripts/proof-plan.mjs";
import { writeFleetRecord } from "../scripts/fleet-check.mjs";
import { appendHistory, historyPath, readHistory, summarize, renderHistory, PLAN_EVENT_SCHEMA, HISTORY_FILES } from "../scripts/lib/proof-history.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "proof-history-"));
const rows = (root, kind) => readHistory(historyPath(root, kind)).rows;

const plan = (over = {}) => ({
  schema: "prooflane-proof-plan/1",
  slice: "a slice under test",
  branch: "a-slice-under-test",
  openedAt: "2026-09-17T10:00:00.000Z",
  base: null,
  declared: { suite: "per-commit", frameworkCheck: "per-commit", device: "at-close", review: "at-close" },
  discharged: { at: "2026-09-17T10:40:00.000Z", stampedHash: "f".repeat(64), verdict: "PASS", rung: "L2" },
  reviewDischarged: null,
  ...over,
});

test("a slice that closes is removed from the working state and KEPT in the history", () => {
  const root = tmp();
  try {
    const planPath = path.join(root, "qa-artifacts", "proof-plan.json");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify(plan()));
    const r = close(
      { state: "discharged", plan: plan(), stale: null, branch: "a-slice-under-test", review: { state: "discharged" } },
      { planPath, historyFile: historyPath(root, "plans"), via: "merge", now: new Date("2026-09-17T11:00:00.000Z") },
    );
    assert.equal(r.removed, true);
    assert.ok(!fs.existsSync(planPath), "the working plan is still removed — a finished slice must not be named stale by the next one");
    const kept = rows(root, "plans");
    assert.equal(kept.length, 1, "a removed plan must leave exactly one history row");
    assert.equal(kept[0].schema, PLAN_EVENT_SCHEMA);
    assert.equal(kept[0].event, "closed");
    assert.equal(kept[0].via, "merge");
    assert.equal(kept[0].plan.slice, "a slice under test");
    assert.equal(kept[0].plan.openedAt, "2026-09-17T10:00:00.000Z", "without openedAt the slice's duration is unrecoverable");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("after `gh pr merge --delete-branch` the plan arrives STALE (the checkout is trunk) and is kept all the same", () => {
  const root = tmp();
  try {
    const planPath = path.join(root, "qa-artifacts", "proof-plan.json");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify(plan()));
    close(
      { state: "none", trunk: true, plan: null, stale: plan(), branch: "main", review: { state: "none" } },
      { planPath, historyFile: historyPath(root, "plans"), via: "merge", branchExists: () => false },
    );
    const kept = rows(root, "plans");
    assert.equal(kept.length, 1);
    assert.equal(kept[0].event, "closed", "its branch is gone — this is the slice the merge landed");
    assert.equal(kept[0].plan.branch, "a-slice-under-test");
    assert.equal(kept[0].onBranch, "main");
    assert.equal(kept[0].device, null, "trunk's `none` describes trunk, not the slice — the slice's own state is in the plan");
    assert.equal(kept[0].plan.discharged.verdict, "PASS");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("KD-59: a leftover plan whose branch still exists did not close here — it is `cleared`, never `closed`", () => {
  const root = tmp();
  try {
    const planPath = path.join(root, "qa-artifacts", "proof-plan.json");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify(plan({ branch: "abandoned", discharged: null })));
    close(
      { state: "none", trunk: true, plan: null, stale: plan({ branch: "abandoned", discharged: null }), branch: "main", review: { state: "none" } },
      { planPath, historyFile: historyPath(root, "plans"), via: "merge", branchExists: (b) => b === "abandoned" },
    );
    const kept = rows(root, "plans");
    assert.equal(kept.length, 1);
    assert.equal(kept[0].event, "cleared");
    assert.equal(summarize({ plans: kept }).totals.closed, 0, "a cleared plan must not count as a slice that closed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a slice closed on its OWN branch records the tiers' states as they stood at close", () => {
  const root = tmp();
  try {
    const planPath = path.join(root, "qa-artifacts", "proof-plan.json");
    close(
      { state: "discharged", plan: plan(), stale: null, branch: "a-slice-under-test", review: { state: "none" } },
      { planPath, historyFile: historyPath(root, "plans"), via: "close" },
    );
    const [row] = rows(root, "plans");
    assert.equal(row.device, "discharged");
    assert.equal(row.review, "none");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a slice that may NOT close writes nothing to the history", () => {
  const root = tmp();
  try {
    const planPath = path.join(root, "qa-artifacts", "proof-plan.json");
    for (const state of ["owed", "reopened", "undeclared"]) {
      close({ state, plan: plan(), stale: null, review: { state: "none" } }, { planPath, historyFile: historyPath(root, "plans") });
    }
    assert.deepEqual(rows(root, "plans"), [], "only a settled slice ends; an owed one is still in flight");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a plan replaced by another --open is kept as `replaced`, not overwritten away", () => {
  const root = tmp();
  try {
    const planPath = path.join(root, "qa-artifacts", "proof-plan.json");
    const historyFile = historyPath(root, "plans");
    openPlan({ name: "first", branch: "one" }, { planPath, historyFile });
    assert.deepEqual(rows(root, "plans"), [], "opening onto nothing replaces nothing");
    openPlan({ name: "second", branch: "two" }, { planPath, historyFile });
    const kept = rows(root, "plans");
    assert.equal(kept.length, 1);
    assert.equal(kept[0].event, "replaced");
    assert.equal(kept[0].plan.slice, "first");
    assert.equal(JSON.parse(fs.readFileSync(planPath, "utf8")).slice, "second");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("every review record is kept — the latest is what a discharge reads, the history is every one", () => {
  const root = tmp();
  try {
    recordReview({ tests: ["a test that fails"], decisions: [] }, { root, now: new Date("2026-09-17T10:10:00.000Z") });
    recordReview({ nothingFound: true }, { root, now: new Date("2026-09-17T10:20:00.000Z") });
    const latest = JSON.parse(fs.readFileSync(path.join(root, "qa-artifacts", "review-latest.json"), "utf8"));
    assert.equal(latest.nothingFound, true, "the latest record is still the last one written");
    const kept = rows(root, "reviews");
    assert.equal(kept.length, 2, "ADR-0014: what reviews produce can be counted over time — that needs every record");
    assert.deepEqual(kept.map((r) => r.tests.length), [1, 0]);
    assert.ok("branch" in kept[0], "a history row names its branch, or it cannot be attributed to a slice");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("every device run is kept, PASS and FAIL alike, with when it started", () => {
  const root = tmp();
  try {
    const run = (verdict, startedAt) =>
      writeFleetRecord({ root, rung: verdict === "PASS" ? "L2" : null, minLevel: "L2", failures: verdict === "PASS" ? [] : ["lane FAIL"], avd: null, startedAt, receipt: { verdict, steps: [] } });
    run("PASS", "2026-09-17T10:30:00.000Z");
    run("FAIL", "2026-09-17T10:35:00.000Z");
    const latest = JSON.parse(fs.readFileSync(path.join(root, "qa-artifacts", "fleet-latest.json"), "utf8"));
    assert.equal(latest.verdict, "FAIL");
    assert.ok(!("startedAt" in latest), "the record the gates read keeps its shape; history carries the extra fields");
    const kept = rows(root, "fleet");
    assert.deepEqual(kept.map((r) => r.verdict), ["PASS", "FAIL"], "a history that kept only green runs could not refute anything");
    assert.equal(kept[0].startedAt, "2026-09-17T10:30:00.000Z");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the reader gives a slice only what ran on ITS branch inside ITS lifetime, and counts the rest", () => {
  const ev = (slice, branch, openedAt, at) => ({ schema: PLAN_EVENT_SCHEMA, event: "closed", via: "merge", at, plan: { slice, branch, openedAt } });
  const summary = summarize({
    plans: [ev("alpha", "fix-ci", "2026-09-17T10:00:00Z", "2026-09-17T11:00:00Z"), ev("beta", "fix-ci", "2026-09-18T10:00:00Z", "2026-09-18T12:00:00Z")],
    fleet: [
      { branch: "fix-ci", verdict: "PASS", rung: "L2", startedAt: "2026-09-17T10:40:00Z", ranAt: "2026-09-17T10:44:00Z" },
      { branch: "fix-ci", verdict: "FAIL", rung: null, startedAt: "2026-09-18T11:00:00Z", ranAt: "2026-09-18T11:03:00Z" },
      { branch: "main", verdict: "PASS", rung: "L2", startedAt: "2026-09-17T10:50:00Z", ranAt: "2026-09-17T10:55:00Z" },
    ],
    reviews: [
      { branch: "fix-ci", ranAt: "2026-09-17T10:30:00Z", tests: ["t"], decisions: ["d"], nothingFound: false },
      { branch: "fix-ci", ranAt: "2026-09-19T09:00:00Z", tests: [], decisions: [], nothingFound: true },
    ],
  });
  const [alpha, beta] = summary.slices;
  assert.deepEqual(alpha.device.map((r) => r.verdict), ["PASS"], "a reused branch name must not hand one slice another's run");
  assert.equal(alpha.device[0].durationMs, 4 * 60000);
  assert.deepEqual(beta.device.map((r) => r.verdict), ["FAIL"]);
  assert.equal(alpha.reviews.length, 1);
  assert.equal(beta.reviews.length, 0, "a review recorded after the slice closed is not the slice's");
  assert.equal(summary.totals.unattributedDeviceRuns, 1, "the trunk release proof is counted, not dropped");
  assert.equal(summary.totals.unattributedReviews, 1);
  assert.equal(summary.totals.medianSliceMs, 90 * 60000);
  assert.match(renderHistory(summary), /2 slice\(s\) closed/);
});

test("KD-60: every row lands in exactly one bucket — closed slices, slices that never closed, unattributed", () => {
  const ev = (event, slice, openedAt, at) => ({ schema: PLAN_EVENT_SCHEMA, event, at, plan: { slice, branch: "b", openedAt } });
  const summary = summarize({
    plans: [ev("replaced", "first", "2026-09-17T10:00:00Z", "2026-09-17T11:00:00Z"), ev("closed", "second", "2026-09-17T11:00:01Z", "2026-09-17T12:00:00Z"), ev("cleared", "third", "2026-09-18T09:00:00Z", "2026-09-18T10:00:00Z")],
    fleet: [
      { branch: "b", verdict: "PASS", ranAt: "2026-09-17T10:30:00Z" },
      { branch: "b", verdict: "PASS", ranAt: "2026-09-17T11:30:00Z" },
      { branch: "b", verdict: "FAIL", ranAt: "2026-09-18T09:30:00Z" },
      { branch: "main", verdict: "PASS", ranAt: "2026-09-17T11:45:00Z" },
    ],
    reviews: [
      { branch: "b", ranAt: "2026-09-17T10:40:00Z", tests: [], decisions: [], nothingFound: true },
      { branch: "b", ranAt: "2026-09-17T11:40:00Z", tests: ["t"], decisions: [], nothingFound: false },
      { branch: "c", ranAt: "2026-09-17T11:40:00Z", tests: [], decisions: [], nothingFound: true },
    ],
  });
  const t = summary.totals;
  assert.equal(t.deviceRuns + t.deviceRunsInOtherSlices + t.unattributedDeviceRuns, 4, "device runs must add up to the history");
  assert.equal(t.reviews + t.reviewsInOtherSlices + t.unattributedReviews, 3, "reviews must add up to the history");
  assert.equal(t.deviceRuns, 1);
  assert.equal(t.deviceRunsInOtherSlices, 2);
  assert.equal(t.closed, 1);
});

test("a Firebase L2 run is kept as its OWN kind and counted as its own kind — never folded into the device runs", () => {
  assert.equal(HISTORY_FILES["fleet-firebase"], "fleet-firebase-history.jsonl");
  const ev = (event, slice, openedAt, at) => ({ schema: PLAN_EVENT_SCHEMA, event, at, plan: { slice, branch: "b", openedAt } });
  const summary = summarize({
    plans: [ev("closed", "one", "2026-09-26T10:00:00Z", "2026-09-26T11:00:00Z"), ev("replaced", "two", "2026-09-26T11:00:01Z", "2026-09-26T12:00:00Z")],
    fleet: [{ branch: "b", verdict: "PASS", rung: "L2", startedAt: "2026-09-26T10:10:00Z", ranAt: "2026-09-26T10:13:00Z" }],
    firebase: [
      { branch: "b", verdict: "PASS", rung: "L2", startedAt: "2026-09-26T10:20:00Z", ranAt: "2026-09-26T10:25:00Z" },
      { branch: "b", verdict: "FAIL", rung: null, startedAt: "2026-09-26T11:10:00Z", ranAt: "2026-09-26T11:12:00Z" },
      { branch: "main", verdict: "PASS", rung: "L2", startedAt: "2026-09-26T10:30:00Z", ranAt: "2026-09-26T10:35:00Z" },
    ],
  });
  const [one] = summary.slices;
  assert.deepEqual(one.device.map((r) => r.verdict), ["PASS"], "a Firebase run is not a default device run");
  assert.deepEqual(one.firebase.map((r) => r.verdict), ["PASS"]);
  assert.equal(one.firebase[0].durationMs, 5 * 60000);
  const t = summary.totals;
  assert.equal(t.deviceRuns + t.deviceRunsInOtherSlices + t.unattributedDeviceRuns, 1, "device runs count only the default kind");
  assert.equal(t.unattributedDeviceRuns, 0);
  assert.equal(t.unattributedFirebaseRuns, 1, "the trunk Firebase run is counted beside the unattributed device runs, not in them");
  assert.equal(t.firebaseRuns + t.firebaseRunsInOtherSlices + t.unattributedFirebaseRuns, 3, "Firebase runs must add up to their history (KD-60)");
  assert.match(renderHistory(summary), /1 Firebase L2 run\(s\)/);
});

test("proof-plan --history reads the fleet-firebase history and passes it to the summary", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-history-firebase-"));
  try {
    fs.writeFileSync(path.join(dir, HISTORY_FILES["fleet-firebase"]), `${JSON.stringify({ branch: "main", verdict: "PASS", rung: "L2", ranAt: "2026-09-26T10:35:00Z" })}\n`);
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "proof-plan.mjs");
    const res = spawnSync(process.execPath, [script, "--history", "--json"], { encoding: "utf8", env: { ...process.env, PROOFLANE_HISTORY_DIR: dir } });
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.totals.unattributedFirebaseRuns, 1, "the kept Firebase run is invisible to --history");
    assert.equal(out.totals.unattributedDeviceRuns, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bookkeeping never fails a gate: an append that cannot be written returns false and does not throw", () => {
  const root = tmp();
  try {
    const blocker = path.join(root, "qa-artifacts");
    fs.writeFileSync(blocker, "a FILE where the directory should be");
    assert.equal(appendHistory(path.join(blocker, "x.jsonl"), { a: 1 }), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
