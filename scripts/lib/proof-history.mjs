// THE PROOF RECORDS ARE KEPT.
//
// Every at-close record this repo writes described ONE moment and was then
// destroyed: `proof-plan.json` was deleted when its slice settled,
// `review-latest.json` and `fleet-latest.json` were overwritten by the next run.
// Each was right for the question its gate asks ("is THIS tree discharged?"),
// and together they made the question G2 asks unanswerable from the repo: where
// did the wall-clock between prompt and merged change go?
//
// Measured 2026-09-17: answering it took thirteen Claude Code session
// transcripts and a macOS sleep log (docs/research/g2-measure/) — vendor files
// outside the repository, for a product whose guarantee §8.1 is that the
// contract lives in the repository. ADR-0014 had also promised that what reviews
// produce "can be counted over time", and only the latest record existed to
// count.
//
// So each writer now also APPENDS what it wrote, one JSON object per line, under
// `qa-artifacts/` (gitignored — local evidence, never shipped, and outside every
// hash a record is bound to). Nothing here is a gate and nothing reads history in
// a refusal path: an append that fails is reported by its return value and never
// thrown, because bookkeeping must not fail a gate.
import fs from "node:fs";
import path from "node:path";

export const HISTORY_FILES = Object.freeze({
  plans: "proof-plan-history.jsonl",
  reviews: "review-history.jsonl",
  fleet: "fleet-history.jsonl",
  suite: "suite-history.jsonl",
});

export const PLAN_EVENT_SCHEMA = "prooflane-proof-plan-event/1";

/**
 * Where a kind of history lives under a repo root.
 *
 * `PROOFLANE_HISTORY_DIR` moves it, and only a test that drives a REAL writer as a
 * subprocess (the merge hook) sets it: that test's fixture plan is otherwise kept
 * as a closed slice in this repo's own history on every `npm test` from trunk —
 * KD-59, found by review of the slice that added the history.
 */
export function historyPath(root, kind) {
  if (!HISTORY_FILES[kind]) throw new Error(`no history kind "${kind}" — known: ${Object.keys(HISTORY_FILES).join(", ")}`);
  const dir = process.env.PROOFLANE_HISTORY_DIR || path.join(root, "qa-artifacts");
  return path.join(dir, HISTORY_FILES[kind]);
}

/** Append one row. Never throws; `false` means it was not written. */
export function appendHistory(file, row) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every row of one history file. An absent file is an empty history; a line that
 * does not parse is skipped and COUNTED, so a torn write shows up in the report
 * instead of silently shrinking it.
 */
export function readHistory(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { rows: [], malformed: 0 };
  }
  const rows = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      malformed++;
    }
  }
  return { rows, malformed };
}

const ms = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
};
const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * What each slice cost, attributed — pure.
 *
 * A device run or a review belongs to a slice when it was recorded ON that
 * slice's branch INSIDE that slice's lifetime (opened → closed). Both halves are
 * needed: a branch name is reused (`fix-ci` twice in a month), and a window alone
 * would hand one slice another session's run. Every row lands in exactly one
 * bucket — a closed slice, a slice that never closed (replaced, cleared), or
 * unattributed (a release proof on trunk, a slice still open) — so the three
 * always add up to the history.
 *
 * @param {{plans: object[], reviews: object[], fleet: object[]}} rows
 */
export function summarize({ plans = [], reviews = [], fleet = [] }) {
  const slices = [];
  const claimed = { fleet: new Set(), reviews: new Set() };
  for (const ev of plans) {
    if (ev?.schema !== PLAN_EVENT_SCHEMA || !ev.plan) continue;
    const from = ms(ev.plan.openedAt);
    const to = ms(ev.at);
    if (from === null || to === null) continue;
    const mine = (row, i, kind) => {
      const at = ms(row?.ranAt);
      if (row?.branch !== ev.plan.branch || at === null || at < from || at > to || claimed[kind].has(i)) return false;
      claimed[kind].add(i);
      return true;
    };
    const runs = fleet.filter((r, i) => mine(r, i, "fleet"));
    const reads = reviews.filter((r, i) => mine(r, i, "reviews"));
    slices.push({
      slice: ev.plan.slice,
      branch: ev.plan.branch,
      openedAt: ev.plan.openedAt,
      endedAt: ev.at,
      event: ev.event,
      via: ev.via ?? null,
      durationMs: to - from,
      device: runs.map((r) => ({ verdict: r.verdict, rung: r.rung ?? null, durationMs: ms(r.startedAt) === null ? null : ms(r.ranAt) - ms(r.startedAt) })),
      reviews: reads.map((r) => ({
        tests: Array.isArray(r.tests) ? r.tests.length : 0,
        decisions: Array.isArray(r.decisions) ? r.decisions.length : 0,
        nothingFound: Boolean(r.nothingFound),
      })),
    });
  }
  // Per-slice rates are over CLOSED slices only — a replaced or cleared plan is not
  // a slice that finished — but every row lands in exactly one of three buckets, so
  // closed + other slices + unattributed is always the whole history (KD-60).
  const closed = slices.filter((s) => s.event === "closed");
  const others = slices.filter((s) => s.event !== "closed");
  const allRuns = closed.flatMap((s) => s.device);
  const allReads = closed.flatMap((s) => s.reviews);
  return {
    slices,
    totals: {
      closed: closed.length,
      notClosed: others.length,
      medianSliceMs: median(closed.map((s) => s.durationMs)),
      deviceRuns: allRuns.length,
      devicePass: allRuns.filter((r) => r.verdict === "PASS").length,
      medianDeviceRunMs: median(allRuns.map((r) => r.durationMs)),
      reviews: allReads.length,
      reviewsWithTests: allReads.filter((r) => r.tests > 0).length,
      reviewsNothingFound: allReads.filter((r) => r.nothingFound).length,
      reviewTests: allReads.reduce((a, r) => a + r.tests, 0),
      reviewDecisions: allReads.reduce((a, r) => a + r.decisions, 0),
      deviceRunsInOtherSlices: others.reduce((a, s) => a + s.device.length, 0),
      reviewsInOtherSlices: others.reduce((a, s) => a + s.reviews.length, 0),
      unattributedDeviceRuns: fleet.length - claimed.fleet.size,
      unattributedReviews: reviews.length - claimed.reviews.size,
    },
  };
}

const minutes = (x) => (typeof x === "number" ? `${Math.round(x / 60000)} min` : "—");

export function renderHistory(summary, { malformed = 0 } = {}) {
  const t = summary.totals;
  const L = ["proof history — what settled slices cost (qa-artifacts/*-history.jsonl)", ""];
  if (!summary.slices.length) {
    L.push("  no settled slice is recorded yet — history starts with the first slice closed after it existed");
  }
  for (const s of summary.slices) {
    const found = s.reviews.map((r) => (r.nothingFound ? "nothing" : `${r.tests}t/${r.decisions}d`)).join(", ") || "none";
    const runs = s.device.map((r) => `${r.verdict}${r.durationMs === null ? "" : ` ${minutes(r.durationMs)}`}`).join(", ") || "none";
    L.push(`  ${s.event === "closed" ? "" : `(${s.event}) `}${s.slice}`);
    L.push(`      ${s.branch} · ${s.openedAt.slice(0, 16)} → ${s.endedAt.slice(0, 16)} · ${minutes(s.durationMs)} · device ${runs} · reviews ${found}`);
  }
  if (t.closed) {
    L.push("");
    L.push(
      `  ${t.closed} slice(s) closed · median ${minutes(t.medianSliceMs)} open→closed · ` +
        `device runs ${(t.deviceRuns / t.closed).toFixed(1)} per slice (${t.devicePass} PASS of ${t.deviceRuns}, median ${minutes(t.medianDeviceRunMs)}) · ` +
        `reviews ${(t.reviews / t.closed).toFixed(1)} per slice — ${t.reviewsWithTests} wrote a test (${t.reviewTests} tests), ${t.reviewDecisions} decision(s) handed up, ${t.reviewsNothingFound} found nothing`,
    );
  }
  if (t.deviceRunsInOtherSlices || t.reviewsInOtherSlices) {
    L.push(`  inside ${t.notClosed} slice(s) that never closed (replaced, or cleared): ${t.deviceRunsInOtherSlices} device run(s), ${t.reviewsInOtherSlices} review(s)`);
  }
  if (t.unattributedDeviceRuns || t.unattributedReviews) {
    L.push(`  not inside any settled slice: ${t.unattributedDeviceRuns} device run(s), ${t.unattributedReviews} review(s) — trunk release proofs, or a slice still open`);
  }
  if (malformed) L.push(`  ${malformed} history line(s) did not parse and are not counted`);
  return L.join("\n");
}
