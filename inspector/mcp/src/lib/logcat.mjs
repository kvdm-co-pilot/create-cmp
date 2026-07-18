// logcat.mjs — parse `adb logcat -v threadtime` output into structured entries, with optional
// level/since filtering. Pure text parsing — no child_process here (server.mjs shells adb; this
// module never does), so it is unit-testable against captured sample output.

// Ascending severity, adb's own ordering. A `level` filter means "this level AND ABOVE" —
// matches adb's own `*:W` style priority filters.
const LEVELS = ["V", "D", "I", "W", "E", "F"];

// threadtime format: "MM-DD HH:mm:ss.mmm  PID  TID L Tag: message"
// e.g. "07-18 10:23:45.123  1234  1234 I ActivityManager: Displayed com.example.app/.MainActivity"
const LINE_RE = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s?(.*)$/;

/** "MM-DD HH:mm:ss.mmm" (logcat carries no year) → an ISO string for `year` (defaults to now). */
function threadtimeToIso(ts, year = new Date().getFullYear()) {
  const [datePart, timePart] = ts.trim().split(/\s+/);
  const [mm, dd] = datePart.split("-");
  return `${year}-${mm}-${dd}T${timePart}`;
}

/** Parse ONE `-v threadtime` line into a structured entry, or null if it doesn't match. */
export function parseLogcatLine(line, { year } = {}) {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const [, ts, pid, tid, level, tag, message] = m;
  return {
    timestamp: threadtimeToIso(ts, year),
    pid: Number(pid),
    tid: Number(tid),
    level,
    tag: tag.trim(),
    message,
  };
}

/**
 * Parse full logcat output + apply level/since filters. Both filters are best-effort: an
 * unparseable `since` or an unrecognized `level` never throws — it just doesn't filter, which
 * is safer for a debugging tool than silently dropping everything on a bad argument.
 *
 * @param {string} raw  full stdout of `adb logcat -v threadtime --pid=<pid> -d`
 * @param {{since?:string, level?:string}} [opts]
 * @returns {Array<{timestamp:string,pid:number,tid:number,level:string,tag:string,message:string}>}
 */
export function parseLogcat(raw, opts = {}) {
  const entries = String(raw || "")
    .split("\n")
    .map((line) => parseLogcatLine(line))
    .filter(Boolean);

  let filtered = entries;
  if (opts.level && LEVELS.includes(opts.level)) {
    const min = LEVELS.indexOf(opts.level);
    filtered = filtered.filter((e) => LEVELS.indexOf(e.level) >= min);
  }
  if (opts.since) {
    const sinceMs = Date.parse(opts.since);
    if (!Number.isNaN(sinceMs)) {
      filtered = filtered.filter((e) => {
        const ms = Date.parse(e.timestamp);
        return Number.isNaN(ms) || ms >= sinceMs;
      });
    }
  }
  return filtered;
}
