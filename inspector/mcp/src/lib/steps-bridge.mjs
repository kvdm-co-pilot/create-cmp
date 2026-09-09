// steps-bridge.mjs — the console's link to the lane's LIVE step stream
// (docs/proposals/LIVE-CONSOLE.md Phase B, decided 2026-09-09).
//
// File ownership, exactly as receipt-bridge.mjs states it: this package owns
// inspector/mcp/**, not the lane. `qa/.lane-steps.ndjson` is written by the
// project's own qa/verify.mjs under `--events` — one JSON object per line: a
// `run/start` naming the steps, one `step` per finished step, a `run/end`. This
// file READS those bytes and hands them to console-now.mjs, which owns what
// they mean. Nothing here parses a run, decides a phase, or renders a row.
//
// WHY A FILE AND NOT A PUSH ENDPOINT. Three consequences the decision names,
// and this module exists to keep all three:
//
//   1. The console never becomes the thing that runs the lane — there is no
//      spawn here, and no verdict-producing work behind a page load.
//   2. A run that happened while nobody was watching still renders: the file
//      outlives the process, so `readStepStream` on the next page load is the
//      same read the tail was doing.
//   3. Every value on the page comes from an artifact, so "absence = not
//      derivable" stays literally true — an unreadable or missing file is
//      reported as absent, never as "nothing is running".
//
// The tail is byte-OFFSET based, and it resets when the file SHRINKS: verify
// truncates the stream at the start of every run, so a shrink is precisely the
// signal "a new run began", not an error.

import fs from "node:fs";
import path from "node:path";

import { nowState, parseStepStream, STALE_RUN_MS } from "prooflane-harness/console/console-now.mjs";
import { LANE_MARKER_STALE_MS, LANE_STEPS_REL, laneStepsPath } from "prooflane-harness/lib/lane-markers.mjs";

/** The stream's file name, for the watcher's own filter. */
export const STEPS_FILE_NAME = LANE_STEPS_REL.split("/").pop();

/** How often the tail re-checks the file's size behind the watch. See watchStepStream. */
export const POLL_MS = 1000;

/**
 * Where this project's lane leaves its step stream.
 *
 * TAKEN FROM THE HARNESS, never re-derived: `qa/lib/lane-markers.mjs` is the
 * module whose entire job is "where the lane says what it is doing", and the
 * lane writes this file from that same constant. A console that computed the
 * path a second way could look in the wrong place and then report an
 * honest-looking absence — the exact failure project-layout.mjs was carved out
 * to end.
 *
 * @param {string} root
 * @returns {{ok: true, rel: string, abs: string}}
 */
export function resolveStepsPath(root) {
  return { ok: true, rel: LANE_STEPS_REL, abs: laneStepsPath(root) };
}

/**
 * The stream as the console reads it: parsed by console-now.mjs, and turned
 * into rows by console-now.mjs. This function only supplies the bytes and the
 * clock.
 *
 * `staleAfterMs` is the harness's OWN bound for "a crashed lane's leftover,
 * not a lane" (qa/lib/lane-markers.mjs). It is passed in rather than left to
 * the console's default so the production path uses the original constant and
 * not the copy the pure module has to keep.
 *
 * @param {string} root
 * @param {{now?: number}} [opts]
 * @returns {object} nowState()'s result — always shaped, never thrown
 */
export function readStepStream(root, { now = Date.now() } = {}) {
  const resolved = resolveStepsPath(root);
  // `relPath` rides on the result so the page can NAME the file it is reading
  // without the console keeping a path of its own — the reader that opened it
  // is the only thing that knows which one it was.
  let text;
  try {
    text = fs.readFileSync(resolved.abs, "utf8");
  } catch (err) {
    const missing = err && err.code === "ENOENT";
    return {
      ...nowState(
        {
          available: false,
          reason: missing
            ? `no step stream at ${resolved.rel} — the lane has not run with --events in this tree`
            : `${resolved.rel} could not be read (${err && err.message ? err.message : String(err)})`,
        },
        { now },
      ),
      relPath: resolved.rel,
    };
  }
  return { ...nowState(parseStepStream(text), { now, staleAfterMs: LANE_MARKER_STALE_MS }), relPath: resolved.rel };
}

/**
 * Watch the stream and hand back each NEW line as it lands.
 *
 * Deliberately NOT debounced: the debounce on the governed-file watcher exists
 * because those events cause a whole panel to be refetched, and a save storm
 * should be one refetch. A step line causes one row to appear, and the row
 * appearing when the step finishes IS the feature.
 *
 * @param {string} root
 * @param {(event: object) => void} onEvent called once per parsed line, in order
 * @returns {{close: () => void, path: string|null}}
 */
export function watchStepStream(root, onEvent) {
  const resolved = resolveStepsPath(root);
  if (!resolved.ok) return { close: () => {}, path: null };
  const abs = resolved.abs;
  const dir = path.dirname(abs);
  let offset = 0;
  let partial = "";
  let watcher = null;

  // Start from the END of whatever is already there: the page was
  // SERVER-rendered from those same bytes a moment ago, and replaying them
  // would append a second copy of every row already on screen.
  try {
    offset = fs.statSync(abs).size;
  } catch {
    offset = 0;
  }

  const drain = () => {
    let size;
    try {
      size = fs.statSync(abs).size;
    } catch {
      offset = 0;
      partial = "";
      return; // the file went away; the next run recreates it
    }
    // SHRANK = verify truncated it = a new run began. Read from the top.
    if (size < offset) {
      offset = 0;
      partial = "";
    }
    if (size === offset) return;
    let chunk = "";
    try {
      const fd = fs.openSync(abs, "r");
      try {
        const buf = Buffer.alloc(size - offset);
        const read = fs.readSync(fd, buf, 0, buf.length, offset);
        chunk = buf.subarray(0, read).toString("utf8");
        offset += read;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return; // an unreadable moment is a row that arrives on the next write
    }
    partial += chunk;
    const lines = partial.split("\n");
    partial = lines.pop() ?? ""; // a torn last line waits for its remainder
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      let obj;
      try {
        obj = JSON.parse(t);
      } catch {
        continue;
      }
      try {
        onEvent(obj);
      } catch {
        /* a reporter may not break the watcher, for the same reason it may
           not break the lane (qa/lib/lane-runner.mjs's onStep) */
      }
    }
  };

  // The DIRECTORY is watched, not the file: verify creates the file on its
  // first `--events` run, and a watch opened on a path that does not exist yet
  // never fires. qa/ exists in every tree that carries a lane; when it does
  // not, there is nothing to watch and nothing to show.
  try {
    watcher = fs.watch(dir, (_event, filename) => {
      if (filename && path.basename(String(filename)) !== STEPS_FILE_NAME) return;
      drain();
    });
  } catch {
    /* an unwatchable directory leaves the poll below as the only reader */
  }

  // AND a poll, because a watch that silently misses an event is the one
  // failure this feature cannot survive: a row that never appears leaves the
  // page saying "running" about a step that finished, which is precisely the
  // frozen-state-presented-as-live that LIVE-CONSOLE §3.3 forbids. fs.watch on
  // macOS coalesces and can drop under load, and the service already takes this
  // stance elsewhere (its own source watcher falls back to an mtime poll). The
  // cost is one statSync a second, and it broadcasts nothing when the file has
  // not grown.
  const timer = setInterval(drain, POLL_MS);
  if (typeof timer.unref === "function") timer.unref(); // never hold the process open

  return {
    close: () => {
      clearInterval(timer);
      try {
        if (watcher) watcher.close();
      } catch {
        /* already closed */
      }
    },
    path: abs,
  };
}

/** Re-exported so a reader of this file can see the bound the console is given. */
export { STALE_RUN_MS, LANE_MARKER_STALE_MS };
