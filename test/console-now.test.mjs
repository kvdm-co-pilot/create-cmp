// "What is happening?" — the rules, gated.
//
// docs/proposals/LIVE-CONSOLE.md §3 adds four rules that only apply to a page
// which claims to be live, because a live page can lie in ways a document
// cannot. Three of them are this module's to keep and are pinned here:
//
//   §3.2 a step is not-yet, running or done — NEVER "pending"; running shows
//        elapsed; a step that completed impossibly fast is flagged by duration.
//   §3.3 disconnected is SAID, not hidden (the block carries its own clause).
//   §3.4 one question per row — the *now* row answers about the run, and the
//        rows under it answer about steps, and neither grows a second fact.
//
// And §7's refusals, which are what a "live dashboard" usually is: no health
// score, no percentage, no spinner, no green for SKIP, and above all no
// rewording of what the lane printed.
//
// The second half is the one-spelling rule, the same inversion
// test/evidence-ladder.test.mjs applies to the rung: no other console module
// may parse the step stream or decide a run's phase.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RUN_PHASE,
  STALE_RUN_MS,
  STEP_STATE,
  nowFrame,
  nowHeadHtml,
  nowSectionHtml,
  nowState,
  parseStepStream,
  stepRowHtml,
} from "../packages/harness/src/console/console-now.mjs";
import { LANE_MARKER_STALE_MS } from "../packages/harness/src/lib/lane-markers.mjs";
import { galleryHtml } from "../packages/harness/src/console/preview-service.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONSOLE_DIR = path.join(ROOT, "packages/harness/src/console");

const T0 = Date.parse("2026-09-09T12:00:00.000Z");
const iso = (offsetMs) => new Date(T0 + offsetMs).toISOString();

/** One run's worth of stream, as verify writes it. */
function stream({ steps = [], end = null, runId = "r1", names = ["a", "b", "c"] } = {}) {
  const lines = [
    JSON.stringify({ event: "run", phase: "start", runId, startedAt: iso(0), profile: "local", mode: "full", total: names.length, steps: names }),
    ...steps.map((s, i) =>
      JSON.stringify({ event: "step", runId, at: iso(1000 * (i + 1)), index: i, total: names.length, name: names[i], ...s }),
    ),
  ];
  if (end) lines.push(JSON.stringify({ event: "run", phase: "end", runId, endedAt: iso(9000), total: names.length, ...end }));
  return `${lines.join("\n")}\n`;
}

const at = (state, i) => state.rows.find((r) => r.index === i);

test("a run in flight: finished steps are done, the next one is RUNNING, the rest are not yet", () => {
  const s = nowState(parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 10 }] })), { now: T0 + 2000 });
  assert.equal(s.phase, RUN_PHASE.RUNNING);
  assert.equal(at(s, 0).state, STEP_STATE.DONE);
  assert.equal(at(s, 1).state, STEP_STATE.RUNNING, "the step after the last finished one is the one running");
  assert.equal(at(s, 2).state, STEP_STATE.NOT_YET);
  // Running shows ELAPSED (§3.2) — and the instant it counts from is the
  // artifact's own, the moment the previous step finished.
  assert.equal(at(s, 1).since, iso(1000));
  assert.match(stepRowHtml(at(s, 1)), /data-since="2026-09-09T12:00:01\.000Z"/);
});

test('§3.2: no state is ever called "pending", in any row, in any phase', () => {
  const running = nowState(parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 1 }] })), { now: T0 + 2000 });
  const done = nowState(parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 1 }], end: { verdict: "FAIL", completed: 1 } })), { now: T0 + 20000 });
  const stopped = nowState(parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 1 }] })), { now: T0 + LANE_MARKER_STALE_MS + 1 });
  for (const [what, state] of [["running", running], ["done", done], ["stopped", stopped]]) {
    const html = nowSectionHtml(state);
    assert.ok(!/pending/i.test(html), `${what}: the console must not call a step "pending" — ${html}`);
    for (const row of state.rows) {
      assert.ok(
        Object.values(STEP_STATE).includes(row.state),
        `${what}: ${row.name} is in state ${JSON.stringify(row.state)}, which is not one of the three`,
      );
    }
  }
});

test("§3.2: a run that went silent past the lane's own bound reads as STOPPED, never as forever-running", () => {
  const parsed = parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 5 }] }));
  const live = nowState(parsed, { now: T0 + 60_000 });
  assert.equal(live.phase, RUN_PHASE.RUNNING, "a minute of silence is a slow step, not a dead lane");

  const dead = nowState(parsed, { now: T0 + LANE_MARKER_STALE_MS + 1000 });
  assert.equal(dead.phase, RUN_PHASE.STOPPED);
  assert.match(nowHeadHtml(dead), /STOPPED without finishing after step 1 of 3/);
  assert.equal(at(dead, 1).state, STEP_STATE.NOT_RUN, "a step of a dead lane is not-run, not still-running");
});

test("the staleness bound is the harness's own — the console's copy may not drift from it", () => {
  // console-now.mjs cannot IMPORT lane-markers.mjs (that module reads the
  // filesystem and the console is pure), so it restates the number. A restated
  // constant is only safe while something refuses the drift; this is that.
  assert.equal(
    STALE_RUN_MS,
    LANE_MARKER_STALE_MS,
    "console-now.mjs's STALE_RUN_MS must equal qa/lib/lane-markers.mjs's LANE_MARKER_STALE_MS",
  );
});

test("a FAIL row shows the tool's own reason VERBATIM, newlines and all", () => {
  const reason = "error: unresolved reference `Foo` (src/main.kt:12)\nfix: define Foo or drop the reference";
  const s = nowState(parseStepStream(stream({ steps: [{ verdict: "FAIL", durationMs: 41_000, reason }], end: { verdict: "FAIL", completed: 1 } })), { now: T0 + 10_000 });
  const html = stepRowHtml(at(s, 0));
  assert.match(html, /unresolved reference/);
  assert.match(html, /src\/main\.kt:12/, "the tool's own coordinates survive");
  assert.match(html, /fix: define Foo or drop the reference/, "the tool's own FIX survives — the console never rewrites it");
  assert.ok(html.includes("\n"), "a multi-line reason stays multi-line — that is what verbatim means");
  assert.ok(!/the harness printed none/.test(html), "a tool that printed a fix must not be told it printed none");
});

test("a FAIL with no fix STATES the absence rather than inventing one", () => {
  const s = nowState(parseStepStream(stream({ steps: [{ verdict: "FAIL", durationMs: 12, reason: "3 tests failed" }], end: { verdict: "FAIL", completed: 1 } })), { now: T0 + 10_000 });
  const html = stepRowHtml(at(s, 0));
  assert.match(html, /3 tests failed/);
  assert.match(html, /fix: the harness printed none/);
});

test("§7: SKIP is muted and never green, and a skip's reason is never dressed as a failure", () => {
  const s = nowState(
    parseStepStream(stream({ steps: [{ verdict: "SKIP", durationMs: 18, reason: "no device attached — nothing to drive" }], end: { verdict: "PASS", completed: 1 } })),
    { now: T0 + 10_000 },
  );
  const html = stepRowHtml(at(s, 0));
  assert.match(html, /step-verdict-skip/);
  assert.ok(!/step-verdict-pass/.test(html), "a SKIP must never wear the PASS role");
  assert.ok(!/now-reason/.test(html), "a skip's explanation is not a failure block");
  assert.ok(!/printed none/.test(html), "and a skip is never asked what its fix was");
  assert.match(html, /no device attached/, "but the step's own words are still shown");
});

test("§3.2: a step an order of magnitude faster than its OWN history is flagged; a cheap step is not", () => {
  const replayed = nowState(
    parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 300, expectedMs: 52_000 }], end: { verdict: "PASS", completed: 1 } })),
    { now: T0 + 10_000 },
  );
  assert.equal(at(replayed, 0).replaySuspect, true);
  assert.match(stepRowHtml(at(replayed, 0)), /far faster than its own history/);
  assert.match(stepRowHtml(at(replayed, 0)), /step-verdict-pass/, "it is a FLAG beside the verdict, never a verdict of its own");

  const cheap = nowState(
    parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 0, expectedMs: 6 }], end: { verdict: "PASS", completed: 1 } })),
    { now: T0 + 10_000 },
  );
  assert.equal(at(cheap, 0).replaySuspect, false, "a 6ms gate finishing in under a millisecond is noise, not a cache replay");

  const unknown = nowState(
    parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 1, expectedMs: null }], end: { verdict: "PASS", completed: 1 } })),
    { now: T0 + 10_000 },
  );
  assert.equal(at(unknown, 0).replaySuspect, false, "no history is not evidence of anything");
});

test("a --fast run is NAMED as one — the inner loop never reads as the full lane", () => {
  // qa/watch.mjs spawns `--fast --events` on every save, so most of what this
  // row ever shows is the inner loop. A fast receipt earns no rung
  // (qa/lib/evidence-level.mjs) and is refused as done-evidence; a row that let
  // it read as the full lane would be the console lending it strength it does
  // not have — §7's "a rung without its pack", one layer over.
  const fast = `${JSON.stringify({ event: "run", phase: "start", runId: "f1", startedAt: iso(0), profile: "local", mode: "fast", total: 1, steps: ["a"] })}\n${JSON.stringify({ event: "step", runId: "f1", at: iso(500), index: 0, total: 1, name: "a", verdict: "PASS", durationMs: 5 })}\n${JSON.stringify({ event: "run", phase: "end", runId: "f1", endedAt: iso(600), verdict: "PASS", durationMs: 600, completed: 1, total: 1 })}\n`;
  const s = nowState(parseStepStream(fast), { now: T0 + 10_000 });
  assert.equal(s.mode, "fast");
  const head = nowHeadHtml(s);
  assert.match(head, /fast lane \(inner loop/);
  assert.match(head, /earns no rung/);
  assert.ok(!/L\d/.test(head), "and it shows no rung of its own — there is none to show");

  const full = nowState(parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 5 }], end: { verdict: "PASS", completed: 1 } })), { now: T0 + 10_000 });
  assert.ok(!/fast lane/.test(nowHeadHtml(full)), "and a full run is not labelled as the inner loop");
});

test("the last run/start wins — a crashed run's leftover prefix is never interleaved with this one", () => {
  const old = stream({ runId: "old", steps: [{ verdict: "FAIL", durationMs: 9 }] });
  const fresh = stream({ runId: "new", steps: [{ verdict: "PASS", durationMs: 3 }], end: { verdict: "PASS", completed: 1 } });
  const s = nowState(parseStepStream(old + fresh), { now: T0 + 10_000 });
  assert.equal(s.runId, "new");
  assert.equal(s.completed, 1);
  assert.equal(at(s, 0).verdict, "PASS", "the old run's FAIL must not appear under the new run's id");
});

test("a torn last line is dropped, not guessed at", () => {
  const text = `${stream({ steps: [{ verdict: "PASS", durationMs: 3 }] }).trimEnd()}\n{"event":"step","index":1,"na`;
  const s = nowState(parseStepStream(text), { now: T0 + 2000 });
  assert.equal(s.completed, 1, "half a line is not a step");
  assert.equal(at(s, 1).state, STEP_STATE.RUNNING);
});

test("absence is stated as absence — never as 'nothing is running'", () => {
  const s = nowState(parseStepStream(""), { now: T0 });
  assert.equal(s.available, false);
  assert.equal(s.phase, RUN_PHASE.NONE);
  const html = nowSectionHtml(s);
  assert.match(html, /no step stream/);
  assert.match(html, /--events/, "and it names the command that would produce one");
  assert.ok(!/idle/.test(html), "a tree that never ran the lane is not 'idle'");
});

test("a step frame touches ONLY the step that finished and the one now running", () => {
  const parsed = parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 5 }, { verdict: "PASS", durationMs: 5 }] }));
  const s = nowState(parsed, { now: T0 + 3000 });
  const frame = nowFrame(s, { event: "step", index: 1 });
  assert.deepEqual(frame.rows.map((r) => r.index), [1, 2], "the finished row and the newly running one, and nothing else");
  assert.equal(frame.clear, false, "a step frame never clears the list — rows append");
  assert.match(frame.rows[1].html, /now-running/);
  assert.equal(frame.runId, "r1");
});

test("a full frame (a connect, or a new run) clears and rewrites — the only time rows are replaced", () => {
  const s = nowState(parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 5 }] })), { now: T0 + 2000 });
  for (const [what, ev] of [["a connect", null], ["a new run", { event: "run", phase: "start" }]]) {
    const frame = nowFrame(s, ev);
    assert.equal(frame.clear, true, `${what} must clear`);
    assert.deepEqual(frame.rows.map((r) => r.index), [0, 1, 2], `${what} must carry every row`);
  }
  const end = nowState(parseStepStream(stream({ steps: [{ verdict: "FAIL", durationMs: 5 }], end: { verdict: "FAIL", completed: 1 } })), { now: T0 + 10_000 });
  const frame = nowFrame(end, { event: "run", phase: "end" });
  assert.deepEqual(frame.rows.map((r) => r.index), [1, 2], "at the end only the rows that changed meaning are sent");
  assert.match(frame.rows[0].html, /not run/, "'not yet' becomes 'not run' the moment the lane stops");
});

test("§7: the block carries no score, no percentage, no spinner, and no second accent", () => {
  const s = nowState(
    parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 10 }, { verdict: "SKIP", durationMs: 2 }] })),
    { now: T0 + 3000 },
  );
  const html = nowSectionHtml(s);
  assert.ok(!/%/.test(html), "no percentages");
  assert.ok(!/[⠋⣾◐◓◑◒]|spinner/i.test(html), "no spinners");
  assert.ok(!/health|score|all systems/i.test(html), "no health score");
  assert.ok(!/<progress|<meter/.test(html), "no progress bars");
  assert.ok(!/style="/.test(html), "no inline colour — the shell owns the palette");
});

test("§3.3: the block says whether it is live, in its own words, beside the file it reads", () => {
  const s = nowState(parseStepStream(stream({ steps: [] })), { now: T0 + 1000 });
  const html = nowSectionHtml(s);
  assert.match(html, /id="now-live"/, "there is a place for the liveness clause to be written");
  assert.match(html, /reading the lane's step stream/, "and the page says what it is reading");

  // The PATH comes from the reader that opened the file — the console keeps no
  // path of its own, because qa/lib/lane-markers.mjs owns it and the lane
  // writes from that same constant.
  const named = nowSectionHtml({ ...s, relPath: "qa/.lane-steps.ndjson" });
  assert.match(named, /reading <code>qa\/\.lane-steps\.ndjson<\/code>/, "when the reader names the file, so does the page");
  assert.ok(!/lane-steps/.test(html), "and when it does not, the page does not invent one");
});

test("the front door renders the rows, and a caller that supplies no stream renders no block", () => {
  const base = { appName: "Acme", viewport: { width: 411, height: 891 }, version: 1, cards: [] };
  const s = nowState(
    parseStepStream(stream({ steps: [{ verdict: "PASS", durationMs: 10 }], names: ["harnessIntegrity", "unitTests", "build"] })),
    { now: T0 + 2000 },
  );
  const withNow = galleryHtml({ ...base, now: s });
  assert.match(withNow, /<h3 class="fd-h">Now<\/h3>/);
  assert.match(withNow, /id="now-steps"/);
  assert.match(withNow, /harnessIntegrity/);
  assert.match(withNow, /now-running/);

  const without = galleryHtml(base);
  assert.ok(!/id="now-steps"/.test(without), "no stream supplied means no block — never an empty one that reads as idle");
});

test("the page APPENDS: its script writes rows by data-index and never reloads for a step", () => {
  // The behaviour itself is browser-side, so what is pinned here is the
  // contract the browser executes: a step message goes through the append
  // path, that path addresses rows by index, and no branch of it reloads.
  const html = galleryHtml({ appName: "A", viewport: { width: 411, height: 891 }, version: 1, cards: [] });
  const script = html.slice(html.lastIndexOf("<script>"));
  assert.match(script, /if \(msg\.type === "step"\) applyNowFrame\(msg\);/);
  assert.match(script, /insertAdjacentHTML\("beforeend", rows\[i\]\.html\)/, "a new row is APPENDED");
  assert.match(script, /data-index="' \+ rows\[i\]\.index/, "an existing row is addressed by its index, never by position");
  const applyFn = script.slice(script.indexOf("function applyNowFrame"), script.indexOf("function tickNowElapsed"));
  assert.ok(!/location\.reload/.test(applyFn), "a step must never reload the page (LIVE-CONSOLE §8: the reload count stays at zero)");
  // The panel refresh must not redraw the block either — the lane rewrites its
  // marker at every step start, and that is a governed-file event.
  assert.match(script, /const keptNow = document\.getElementById\("now"\);/);
  assert.match(script, /replaceChild\(keptNow, freshNow\)/);
});

test("THE CLASS: no console module reads the step stream or decides a run's phase but console-now.mjs", () => {
  // The same inversion evidence-ladder.test.mjs uses for the rung: deny by
  // default over the whole directory, so the SECOND module to reach for the
  // stream is caught the day it is written and by nobody remembering a list.
  const files = fs
    .readdirSync(CONSOLE_DIR)
    .filter((f) => f.endsWith(".mjs") && f !== "console-now.mjs")
    .sort();
  assert.ok(files.length >= 5, `expected the whole console to be scanned, saw ${files.length} modules`);
  const offenders = [];
  for (const f of files) {
    const src = fs
      .readFileSync(path.join(CONSOLE_DIR, f), "utf8")
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    src.split("\n").forEach((line, i) => {
      const readsStream = /steps\.ndjson/.test(line);
      // Dispatching on the stream's own event vocabulary is the second
      // spelling this exists to refuse — a module deciding for itself what a
      // `run`/`step` line means.
      const decidesPhase = /\bphase\s*===\s*["']start["']|\bevent\s*===\s*["']step["']|\bevent\s*===\s*["']run["']/.test(line);
      if (readsStream || decidesPhase) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `these console modules read the lane's step stream themselves — go through console-now.mjs instead:\n  ${offenders.join("\n  ")}`,
  );
});
