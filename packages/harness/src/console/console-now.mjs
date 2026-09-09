// console-now.mjs — WHAT IS HAPPENING, and where that answer comes from.
//
// docs/proposals/LIVE-CONSOLE.md's second question ("what is happening?") is
// the one the console could not answer, because the only thing the lane left
// behind was a receipt written after it ended. Phase B closes that with an
// ARTIFACT, not a push endpoint: `verify --events` appends one NDJSON object
// per finished step to qa/.lane-steps.ndjson, the console TAILS that file,
// and this module decides what the file means.
//
// WHY AN ARTIFACT AND NOT AN ENDPOINT (2026-09-09, Karel — "recommended
// approach"). Three consequences, and each one is a rule this file keeps:
//
//   1. The console never becomes the thing that runs the lane. Nothing here
//      spawns verify; nothing here produces a verdict. It reads.
//   2. It survives the console being down. A run that happened while nobody
//      was watching still renders on the next page load, because the file is
//      still on disk. So the rows are SERVER-rendered from the file first, and
//      the live stream only appends what arrives after that.
//   3. Every value on the page is read from an artifact, so "absence = not
//      derivable" stays literally true. There is no field here whose value the
//      console invents when the file does not carry it.
//
// PURE. No clock, no filesystem. `now` is a parameter and the bytes arrive as
// a string, for the same reason console-standing.mjs takes the tree's head as
// one: the cases that matter — a run that stopped mid-step, a step that came
// back impossibly fast — cannot be tested against a real clock and a real lane
// without running a real lane to fail in a particular way.
//
// ONE SPELLING. test/console-now.test.mjs refuses any other console module
// that parses this stream or decides a run's phase, the same inversion
// test/evidence-ladder.test.mjs applies to the rung. A row's MARKUP is here
// too, and that is deliberate: the same function renders the row the server
// puts on the page and the row the SSE appends while the lane runs, so a live
// row and a reloaded row can never disagree about anything, including how a
// FAIL's reason is escaped.

import { formatDurationMs } from "./console-data.mjs";
import { formatAgeCoarse } from "./console-shell.mjs";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

/**
 * Past this, a run with no end line is a lane that STOPPED, not a lane that is
 * still going. The number mirrors `LANE_MARKER_STALE_MS` in
 * qa/lib/lane-markers.mjs — the harness's own bound for "a crashed lane's
 * leftover, not a lane" — and it is restated here rather than imported because
 * that module reads the filesystem and this one may not.
 *
 * The restatement is gated, not trusted: test/console-now.test.mjs asserts the
 * two constants are equal, so the copy cannot drift from the original. Callers
 * that can import the original (the console's server-side bridge) pass it in.
 */
export const STALE_RUN_MS = 30 * 60 * 1000;

/**
 * A step whose duration is at least this many times shorter than its own
 * history is FLAGGED (LIVE-CONSOLE §3.2 — "a step that completed impossibly
 * fast is flagged by its duration; a cache replay is the tell"). It is a
 * FLAG, never a verdict: the row still says exactly what the lane said, with
 * one more observation beside it.
 */
export const REPLAY_FACTOR = 10;

/**
 * Below this, a step is too cheap for "impossibly fast" to mean anything — a
 * 6ms gate that runs in 0.4ms is noise, not a replayed cache.
 */
export const REPLAY_FLOOR_MS = 2000;

/** The states a run can be in. Never "pending" — LIVE-CONSOLE §3.2. */
export const RUN_PHASE = Object.freeze({
  NONE: "none",
  RUNNING: "running",
  DONE: "done",
  STOPPED: "stopped",
});

/** The states a single step can be in. Never "pending" — LIVE-CONSOLE §3.2. */
export const STEP_STATE = Object.freeze({
  DONE: "done",
  RUNNING: "running",
  NOT_YET: "not yet",
  NOT_RUN: "not run",
});

/**
 * The stream as objects: the run's opening line, its finished steps, and its
 * closing line if it got one.
 *
 * A partial last line (the lane was mid-write when we read) is dropped, not
 * guessed at. Lines from an EARLIER run are dropped too: the last `run/start`
 * wins, because verify truncates the file at the start of every run and a
 * leftover prefix can only mean a crash between truncate and write.
 *
 * @param {string|null|undefined} text the file's bytes
 * @returns {{available: boolean, reason?: string, run: object|null, steps: object[], end: object|null}}
 */
export function parseStepStream(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { available: false, reason: "no step stream — the lane has not run with --events in this tree", run: null, steps: [], end: null };
  }
  let run = null;
  let end = null;
  let steps = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    let obj;
    try {
      obj = JSON.parse(t);
    } catch {
      continue; // a torn final line; the next read gets it whole
    }
    if (!obj || typeof obj !== "object") continue;
    if (obj.event === "run" && obj.phase === "start") {
      run = obj;
      end = null;
      steps = [];
      continue;
    }
    if (obj.event === "run" && obj.phase === "end") {
      end = obj;
      continue;
    }
    if (obj.event === "step") steps.push(obj);
  }
  if (!run && steps.length === 0) {
    return { available: false, reason: "the step stream carries no run", run: null, steps: [], end: null };
  }
  return { available: true, run, steps, end };
}

/** The instant this stream last moved, as ms — the run's start, or its last step. */
function lastMovedMs(parsed) {
  const stamps = [];
  if (parsed.run && parsed.run.startedAt) stamps.push(Date.parse(parsed.run.startedAt));
  for (const s of parsed.steps) if (s.at) stamps.push(Date.parse(s.at));
  if (parsed.end && parsed.end.endedAt) stamps.push(Date.parse(parsed.end.endedAt));
  const usable = stamps.filter((n) => !Number.isNaN(n));
  return usable.length ? Math.max(...usable) : null;
}

/**
 * Is this step's duration the tell of a replayed cache?
 * `expectedMs` is the step's OWN history, stamped on the event by the lane
 * from its flight journal — so a 6ms gate is judged against 6ms and a
 * 52-second build against 52 seconds. No history, no flag: an unknown
 * expectation is not evidence of anything.
 */
function replaySuspect(step) {
  const expected = typeof step.expectedMs === "number" ? step.expectedMs : null;
  const actual = typeof step.durationMs === "number" ? step.durationMs : null;
  if (expected === null || actual === null) return false;
  if (expected < REPLAY_FLOOR_MS) return false;
  return actual * REPLAY_FACTOR <= expected;
}

/**
 * What the file means, as the rows a page draws.
 *
 * @param {object} parsed parseStepStream's result
 * @param {{now?: number, staleAfterMs?: number}} [opts] `now` is the reader's clock;
 *   `staleAfterMs` is how long a run with no end line may go silent before it
 *   is reported as STOPPED rather than running (the caller passes the
 *   harness's own LANE_MARKER_STALE_MS; see STALE_RUN_MS).
 * @returns {object}
 */
export function nowState(parsed, { now = Date.now(), staleAfterMs = STALE_RUN_MS } = {}) {
  if (!parsed || !parsed.available) {
    return {
      available: false,
      reason: (parsed && parsed.reason) || "no step stream",
      phase: RUN_PHASE.NONE,
      rows: [],
    };
  }
  const run = parsed.run;
  const byIndex = new Map();
  for (const s of parsed.steps) if (Number.isInteger(s.index)) byIndex.set(s.index, s);

  // `total` from the run line, else from the last step event that carried one,
  // else the count we have. Every one of those is the artifact's own word.
  const total =
    (run && Number.isInteger(run.total) && run.total) ||
    parsed.steps.reduce((n, s) => (Number.isInteger(s.total) ? s.total : n), 0) ||
    parsed.steps.length;
  const names = run && Array.isArray(run.steps) ? run.steps : [];
  const completed = byIndex.size;

  const moved = lastMovedMs(parsed);
  const silentMs = moved === null ? null : Math.max(0, now - moved);
  let phase;
  if (parsed.end) phase = RUN_PHASE.DONE;
  else if (silentMs !== null && silentMs >= staleAfterMs) phase = RUN_PHASE.STOPPED;
  else phase = RUN_PHASE.RUNNING;

  // The running step started when the one before it finished — the artifact's
  // own instants, never a guess. For the first step that is the run's start.
  const prev = byIndex.get(completed - 1);
  const runningSince = phase === RUN_PHASE.RUNNING ? (prev && prev.at) || (run && run.startedAt) || null : null;

  const rows = [];
  const upper = Math.max(total, completed);
  for (let i = 0; i < upper; i += 1) {
    const done = byIndex.get(i);
    if (done) {
      rows.push({
        index: i,
        name: typeof done.name === "string" ? done.name : `step ${i + 1}`,
        state: STEP_STATE.DONE,
        verdict: typeof done.verdict === "string" ? done.verdict : null,
        durationMs: typeof done.durationMs === "number" ? done.durationMs : null,
        expectedMs: typeof done.expectedMs === "number" ? done.expectedMs : null,
        note: typeof done.note === "string" && done.note ? done.note : null,
        reason: typeof done.reason === "string" && done.reason ? done.reason : null,
        replaySuspect: replaySuspect(done),
      });
      continue;
    }
    const name = typeof names[i] === "string" ? names[i] : null;
    if (phase === RUN_PHASE.RUNNING && i === completed) {
      rows.push({ index: i, name: name ?? `step ${i + 1}`, state: STEP_STATE.RUNNING, since: runningSince });
      continue;
    }
    rows.push({
      index: i,
      name: name ?? `step ${i + 1}`,
      state: phase === RUN_PHASE.RUNNING ? STEP_STATE.NOT_YET : STEP_STATE.NOT_RUN,
    });
  }

  const count = (v) => parsed.steps.filter((s) => s.verdict === v).length;
  return {
    available: true,
    phase,
    runId: (run && run.runId) || (parsed.steps[0] && parsed.steps[0].runId) || null,
    // "fast" is the inner loop's mode and it is NAMED, never hidden: a fast run
    // earns no rung (qa/lib/evidence-level.mjs) and a row that let it read as
    // the full lane would be the console lending it strength it does not have.
    mode: (run && typeof run.mode === "string" && run.mode) || null,
    profile: (run && typeof run.profile === "string" && run.profile) || null,
    startedAt: (run && run.startedAt) || null,
    ageMs: moved === null ? null : Math.max(0, now - moved),
    total,
    completed,
    runningSince,
    stoppedEarly: Boolean(parsed.end && Number.isInteger(parsed.end.completed) && parsed.end.completed < total),
    verdict: parsed.end && typeof parsed.end.verdict === "string" ? parsed.end.verdict : null,
    durationMs: parsed.end && typeof parsed.end.durationMs === "number" ? parsed.end.durationMs : null,
    tally: { pass: count("PASS"), fail: count("FAIL"), skip: count("SKIP"), error: count("ERROR"), cached: count("CACHED") },
    rows,
  };
}

/**
 * The class the console already uses for a verdict — console-tabs.mjs's
 * receipt table speaks these four, and the now rows speak the same four so a
 * step means the same colour wherever it is read. SKIP is muted, never green
 * (LIVE-CONSOLE §7).
 */
function verdictClass(verdict) {
  if (verdict === "PASS") return "step-verdict-pass";
  if (verdict === "FAIL") return "step-verdict-fail";
  if (verdict === "ERROR") return "step-verdict-error";
  return "step-verdict-skip";
}

/** Did this step's verdict mean something went WRONG? (Never the field's question.) */
const stepFailed = (row) => row.verdict === "FAIL" || row.verdict === "ERROR";

/**
 * ONE row. This exact function renders the row the server puts on the page AND
 * the row the SSE appends mid-run — the page appends bytes the server derived
 * and derives nothing itself, which is why a live row and a reloaded row are
 * the same row.
 *
 * It is a `<tr>`, and it lives inside a `<tbody>` — the design of record's
 * `table.steps`, four columns, nothing scrolling.
 *
 * WHY THE TBODY, AND WHY NOT THE REASON THIS COMMENT USED TO GIVE. It claimed
 * the parser DROPS a bare `<tr>` inserted into a `<table>` (foster parenting).
 * That is false, and it was checked in a real browser rather than argued from
 * the spec: `table.insertAdjacentHTML("beforeend", "<tr><td>x</td></tr>")`
 * yields `<tbody><tr><td>x</td></tr></tbody>` — one row, auto-wrapped, not
 * dropped. WHATWG HTML 13.2.6.4.9 "in table" acts as if a `tbody` start tag had
 * been seen and reprocesses the token.
 *
 * The tbody is still required, for the duller and truer reason: the live append
 * addresses `#now-steps`, and that id must sit on an element that EXISTS in the
 * server-rendered markup and survives a panel swap. An auto-wrapped tbody is
 * created by the parser and carries no id, so there would be nothing to append
 * to. The design of record has one, and `#now-steps` is on it.
 *
 * @param {object} row a nowState() row
 * @returns {string}
 */
export function stepRowHtml(row) {
  const cell = (cls, inner) => `<td class="${cls}">${inner}</td>`;
  const step = cell("step", esc(row.name));
  if (row.state === STEP_STATE.RUNNING) {
    // Elapsed is the one number on this page the SERVER cannot know: it is a
    // reading of the reader's clock, not a value in the artifact. The artifact
    // supplies the INSTANT it started; the page counts from there.
    return `<tr class="now-step now-running" data-index="${row.index}">${step}${cell("verd", "running")}${cell(
      "dur",
      `<span class="now-elapsed" data-since="${escAttr(row.since || "")}"></span>`,
    )}${cell("why", "")}</tr>`;
  }
  if (row.state === STEP_STATE.NOT_YET || row.state === STEP_STATE.NOT_RUN) {
    return `<tr class="now-step now-waiting" data-index="${row.index}">${step}${cell("verd", "&mdash;")}${cell(
      "dur",
      "",
    )}${cell("why", esc(row.state))}</tr>`;
  }
  const verdict = `<span class="${verdictClass(row.verdict)}">${esc(row.verdict || "")}</span>`;
  const dur = formatDurationMs(row.durationMs);
  // The step's own words, never the console's: a note explains a SKIP and a
  // reason explains a FAIL, and rewording either is how a console starts
  // telling a story the lane did not (LIVE-CONSOLE §7).
  const note = row.note ? `<span class="now-note">${esc(row.note)}</span>` : "";
  // WHICH BLOCK A REASON GETS IS THE VERDICT'S QUESTION, NEVER THE FIELD'S.
  // A step explains itself in `reason` whether it FAILED or merely SKIPped —
  // the generic profile's specCoverage puts "no specs/ directory" there — and
  // rendering both in the red verbatim block would paint a skip as a failure
  // and then ask what the fix was. Red is reserved for the two verdicts that
  // mean something went wrong (console-shell.mjs's three semantic colours).
  // A passing or skipped step's own words, in its own voice and no louder; a
  // FAIL's go verbatim into stepReasonHtml, below the table.
  const said = row.reason && !stepFailed(row) ? `<span class="now-note">${esc(row.reason)}</span>` : "";
  const flag = row.replaySuspect
    ? `<span class="now-flag" title="a build cache can replay a PASS from another tree — qa/verify.mjs forces --rerun where it can">far faster than its own history (${esc(formatDurationMs(row.expectedMs))})</span>`
    : "";
  const why = [note, said, flag].filter(Boolean).join(" ");
  return `<tr class="now-step" data-index="${row.index}">${step}${cell("verd", verdict)}${cell("dur", esc(dur || ""))}${cell("why", why)}</tr>`;
}

/**
 * A FAILED step's own words, VERBATIM — the block that sits after the table
 * (docs/reference/live-console-prototype.html: "The console shows what the lane
 * said, verbatim. It does not reword a failure.").
 *
 * It is below the table rather than inside a cell because it is the one piece
 * of this block that is prose the lane wrote: newlines, coordinates, its own
 * fix line. A four-column row cannot hold it without either reflowing it — the
 * one thing "verbatim" forbids — or blowing the column widths that make the
 * other sixteen rows scannable.
 *
 * Returns "" for anything that did not fail, so a SKIP's explanation is never
 * dressed as a failure.
 *
 * @param {object} row a nowState() row
 * @returns {string}
 */
export function stepReasonHtml(row) {
  if (!row || !row.reason || !stepFailed(row)) return "";
  // If the tool printed no fix, the absence is STATED rather than filled in.
  const printedFix = /^\s*fix\b/im.test(row.reason);
  return (
    `<div class="reason" data-reason-for="${row.index}"><span class="reason-step">${esc(row.name)}</span>\n${esc(row.reason)}</div>` +
    (printedFix ? "" : `\n  <p class="now-nofix">fix: the harness printed none &mdash; the step's own output is above</p>`)
  );
}

/** Every failed step's verbatim block, in run order — the tail of the *now* body. */
export function stepReasonsHtml(state) {
  const rows = state && state.available ? state.rows : [];
  return rows.map(stepReasonHtml).filter(Boolean).join("\n  ");
}

/**
 * The row's one line — what the lane is doing, or what it last did. One
 * question, one row (LIVE-CONSOLE §3.4): this line never grows a second fact
 * about anything but the run.
 *
 * It returns the line's INNER markup, not a paragraph: the line is the
 * collapsed row's value cell (`summary > .v`), and the same bytes are written
 * into that cell by the SSE. A `<p>` inside a `<summary>`'s grid cell would
 * break the one-line-with-ellipsis geometry the design of record specifies.
 */
export function nowHeadHtml(state) {
  if (!state || !state.available) {
    return `<span class="now-absent">${esc((state && state.reason) || "no step stream")} &mdash; run <code>node qa/verify.mjs --events</code></span>`;
  }
  const modeClause = state.mode === "fast" ? " &middot; fast lane (inner loop &mdash; earns no rung)" : "";
  const profile = state.profile ? ` &middot; profile ${esc(state.profile)}` : "";
  if (state.phase === RUN_PHASE.RUNNING) {
    const row = state.rows.find((r) => r.state === STEP_STATE.RUNNING);
    const which = row ? ` &middot; step ${row.index + 1} of ${state.total} &middot; <code>${esc(row.name)}</code>` : "";
    return `<span class="now-live">RUNNING</span>${which}${modeClause}${profile}`;
  }
  const parts = [];
  parts.push(`${state.completed} step${state.completed === 1 ? "" : "s"}`);
  for (const [label, n] of [["FAIL", state.tally.fail], ["ERROR", state.tally.error], ["SKIP", state.tally.skip], ["CACHED", state.tally.cached]]) {
    if (n > 0) parts.push(`${n} ${label}`);
  }
  const dur = formatDurationMs(state.durationMs);
  if (dur) parts.push(dur);
  if (state.ageMs !== null && state.ageMs !== undefined) parts.push(formatAgeCoarse(state.ageMs));
  const lead =
    state.phase === RUN_PHASE.STOPPED
      ? `the lane STOPPED without finishing after step ${state.completed} of ${state.total}`
      : state.stoppedEarly
        ? `the lane stopped after step ${state.completed} of ${state.total}`
        : "idle &mdash; last run";
  return `${lead} &middot; ${parts.map((p) => esc(p)).join(" &middot; ")}${modeClause}${profile}`;
}

/**
 * What the page must change when one line lands in the stream — the ONLY
 * instruction the client ever acts on.
 *
 * The page derives nothing: it is handed the head's markup and the markup of
 * the rows that actually changed, and it puts them where their `data-index`
 * says. Which rows changed is decided HERE, from the same state the server
 * render used, so a row appended live and a row drawn on a reload are the same
 * bytes from the same function.
 *
 *   run/start — every row, and a clear: the list on screen belongs to the
 *               previous run and interleaving two runs is a lie about both.
 *   step      — the step that just finished, and the one that is now running.
 *               Nothing else moved, so nothing else is touched: this is the
 *               "rows append, the page does not blink" case, and it is the
 *               case 95% of the frames are.
 *   run/end   — every row that is not done, because "not yet" became "not run"
 *               the moment the lane stopped.
 *
 * `reasonsHtml` is the whole verbatim tail, replaced wholesale rather than
 * patched: it is at most a handful of blocks, a FAIL can be superseded by a
 * later run's PASS, and a full replacement cannot leave an orphan behind the
 * way an append could.
 *
 * @param {object} state nowState()'s result
 * @param {object} event the line that just landed (a run or step event)
 * @returns {{type: "step", runId: string|null, clear: boolean, headHtml: string, reasonsHtml: string, rows: Array<{index:number, html:string}>}}
 */
export function nowFrame(state, event = null) {
  const rowsById = new Map((state && state.rows ? state.rows : []).map((r) => [r.index, r]));
  const pick = (indices) =>
    [...new Set(indices)]
      .filter((i) => rowsById.has(i))
      .sort((a, b) => a - b)
      .map((i) => ({ index: i, html: stepRowHtml(rowsById.get(i)) }));

  const isStart = Boolean(event && event.event === "run" && event.phase === "start");
  const isEnd = Boolean(event && event.event === "run" && event.phase === "end");
  const isStep = Boolean(event && event.event === "step" && Number.isInteger(event.index));
  // No event at all is the FULL frame: what a client gets the moment it
  // connects, so a page that was open through a disconnection is caught up in
  // one message instead of being left to guess what it missed.
  const full = isStart || !(isEnd || isStep);
  let rows;
  if (full) rows = pick([...rowsById.keys()]);
  else if (isEnd) rows = pick([...rowsById.keys()].filter((i) => rowsById.get(i).state !== STEP_STATE.DONE));
  else rows = pick([event.index, event.index + 1]);

  return {
    type: "step",
    runId: (state && state.runId) || null,
    clear: full,
    headHtml: nowHeadHtml(state),
    reasonsHtml: stepReasonsHtml(state),
    rows,
  };
}

/**
 * The *now* ROW — one line when idle, expanding in place (LIVE-CONSOLE §2, and
 * the design of record's four `<details class="row">`). The summary is the
 * question's one-line answer; the body is the step table and, after it, every
 * failed step's verbatim words.
 *
 * `data-run` is how the page knows an arriving row belongs to the run on screen
 * rather than the one before it.
 *
 * IT OPENS ITSELF for the two states somebody came to watch — a lane that is
 * running, and a lane that failed. Everything else is the 95% case and stays
 * one line, which is the whole point of the shape.
 *
 * The liveness clause is NOT here: §3.3 puts "disconnected is said, not hidden"
 * in the STRIP, and a clause inside a collapsed row is a clause that is hidden.
 * console-overview.mjs's `overviewStatusHtml` carries `#now-live`.
 */
export function nowSectionHtml(state) {
  const live = state && state.available;
  const runAttr = live && state.runId ? escAttr(state.runId) : "";
  const rows = live ? state.rows.map(stepRowHtml).join("\n    ") : "";
  const reasons = stepReasonsHtml(state);
  const watching =
    live && (state.phase === RUN_PHASE.RUNNING || state.tally.fail > 0 || state.tally.error > 0);
  // The file is NAMED, and the name comes from the reader that opened it — the
  // console does not carry a path of its own (qa/lib/lane-markers.mjs owns it,
  // and the lane writes from the same constant). A caller that supplies none
  // gets the phrase without the path rather than a path that might be wrong.
  const rel = state && typeof state.relPath === "string" && state.relPath ? state.relPath : null;
  const source = rel ? `reading <code>${esc(rel)}</code>` : "reading the lane's step stream";
  return `  <details class="row" id="now" data-run="${runAttr}"${watching ? " open" : ""}>
  <summary><span class="k">now</span><span class="v" id="now-head">${nowHeadHtml(state)}</span><span class="chev">&rsaquo;</span></summary>
  <div class="body">
  <table class="steps"><tbody id="now-steps">
    ${rows}
  </tbody></table>
  <div id="now-reasons">${reasons}</div>
  <p class="now-link" id="now-link">${source}</p>
  </div>
  </details>`;
}
