// step-outcomes.mjs — a step's VERDICT, separated from its INVOCATION.
//
// A step that ran zero tests knows nothing about behaviour and must not speak
// as though it does. Observed 2026-09-02 (create-cmp-showcase): a concurrent
// adb session collided with androidChecks, Gradle exited non-zero having
// executed no tests, and the step reported "an on-device behavior claim is
// broken. Fix the behavior, not the test." The identical task passed 8 tests
// moments later. Believed, that sends the reader hunting a defect that does not
// exist; disbelieved once, it teaches them to discount every future red from
// the step — a gate that misattributes its own failures corrodes the gates that
// are right.
//
// Pure, so the wording and the rule are testable without Gradle or a device.
// (docs/proposals/evidence-economics.md C3, S4.)
//
// FOUR VERDICTS. PASS / FAIL / SKIP had no way to say "I could not run": a
// step whose infrastructure broke reported a behaviour failure. ERROR is that
// fourth word — zero tests executed, a deadline passed, a tool vanished, a
// step threw. An ERROR never accuses the change, never counts as evidence
// (evidence-level derives no rung over it; the plausibility check does not
// count it as executed), is visibly distinct from FAIL (⊘, not ✗), and is
// never silently retried. It still makes the lane FAIL — "could not check" is
// not green. This is JUnit's error-vs-failure, Bazel's FAILED_TO_BUILD /
// TIMEOUT vs FAILED, pytest's error vs failed — the distinction every mature
// runner makes and this one did not.

/**
 * The androidChecks outcome from Gradle's exit and the JUnit summary.
 *
 * @param {{ok: boolean, out: string}} res the Gradle invocation
 * @param {{tests: number, failures: number, errors: number}|null} summary parsed JUnit
 *   results, or null when none were written
 * @param {{gradlew?: string}} [opts]
 * @returns {{verdict: "PASS"|"FAIL"|"ERROR", executed: boolean, reason?: string}}
 */
export function androidChecksOutcome(res, summary, { gradlew = "./gradlew" } = {}) {
  const executed = Boolean(summary && summary.tests > 0);
  if (res.ok) return { verdict: "PASS", executed };
  const tail = String(res.out ?? "")
    .split("\n")
    .filter((l) => /FAILED|error:|failed/i.test(l))
    .slice(0, 12)
    .join("\n");
  if (executed) {
    return {
      verdict: "FAIL",
      executed,
      reason:
        `connectedDebugAndroidTest failed (${summary.failures + summary.errors} of ${summary.tests} tests) — ` +
        `an on-device behavior claim is broken. Fix the behavior, not the test:\n${tail}`,
    };
  }
  // ERROR, not FAIL: the step could not execute. A device tier that could not
  // run is not evidence (the lane still FAILs), and going green would be the
  // worse lie — but "your behaviour is broken" is withdrawn, and the receipt
  // can tell a red that measured something from a red that measured nothing.
  return {
    verdict: "ERROR",
    executed,
    reason:
      "connectedDebugAndroidTest DID NOT EXECUTE — the run reported no tests at all, so this step has observed " +
      "nothing about your change and is not accusing it. Usual cause: another adb/Gradle session touching the same " +
      "device (a manual `adb` command, a second lane, a running preview), or an install that never landed. " +
      `Re-run this step alone with nothing else on the device before suspecting the code:\n  ${gradlew} :composeApp:connectedDebugAndroidTest --rerun\n${tail}`,
  };
}

/** Thrown by the lane's subprocess helper when a step's deadline passes. */
export class StepTimeout extends Error {
  constructor(cmd, deadlineMs) {
    super(`deadline of ${Math.round(deadlineMs / 60000)} min passed: ${cmd}`);
    this.name = "StepTimeout";
    this.cmd = cmd;
    this.deadlineMs = deadlineMs;
  }
}

/**
 * Did a spawnSync result hit its deadline? Node reports ETIMEDOUT on
 * `error.code` and the kill signal on `signal`; either alone is enough — an
 * older Node sets only one of them.
 * @param {{error?: {code?: string}, signal?: string|null}} res
 * @returns {boolean}
 */
export function spawnTimedOut(res) {
  if (!res) return false;
  if (res.error && res.error.code === "ETIMEDOUT") return true;
  return res.signal === "SIGTERM" && (res.status === null || res.status === undefined);
}

/**
 * A step's own deadline, from the journal's last measured duration for it:
 * three times what it usually takes, never under five minutes (a cold Gradle
 * daemon is slow, not wedged), never over thirty (past that it IS wedged).
 * Unknown steps get the ceiling — a first run is never cut short.
 * @param {number|null|undefined} expectedMs
 * @returns {number}
 */
export function stepDeadlineMs(expectedMs, { floorMs = 5 * 60_000, ceilingMs = 30 * 60_000 } = {}) {
  if (!(expectedMs > 0)) return ceilingMs;
  return Math.min(ceilingMs, Math.max(floorMs, Math.round(expectedMs * 3)));
}

/**
 * The step result for a step that could not run — a deadline, or any throw
 * out of the step's own body (which used to crash the whole lane; now it is
 * one ERROR row and the lane keeps going, because the other steps' verdicts
 * are still worth having).
 * @param {string} name the step's display name
 * @param {unknown} err
 * @param {number} durationMs
 * @returns {{name: string, verdict: "ERROR", reason: string, durationMs: number, details: {executed: false, kind: string}}}
 */
export function stepErrorResult(name, err, durationMs) {
  const timeout = err instanceof StepTimeout;
  const reason = timeout
    ? `DID NOT COMPLETE — no result within its deadline (${Math.round(err.deadlineMs / 60000)} min). This step has observed nothing about your change and is not accusing it. ` +
      `A wedged Gradle daemon or a device that stopped answering are the usual causes; check \`./gradlew --status\` and \`adb devices\`, then re-run the step alone.
  ${err.cmd}`
    : `DID NOT RUN — the step threw before producing a verdict: ${err && err.message ? err.message : String(err)}. ` +
      `Nothing here is a claim about your change.`;
  return { name, verdict: "ERROR", reason, durationMs, details: { executed: false, kind: timeout ? "deadline" : "threw" } };
}

// ── Maestro directory run → per-flow outcome ────────────────────────────────
/**
 * Parse Maestro's JUnit report (`maestro test <dir> --format junit --output f`)
 * into one row per flow. Tolerant: a report that is missing or unparsable
 * returns null and the caller falls back to the exit code — never a fabricated
 * per-flow list.
 * @param {string|null} xml
 * @returns {Array<{flow: string, ok: boolean, message?: string}>|null}
 */
export function parseMaestroJunit(xml) {
  if (typeof xml !== "string" || !/<testcase\b/.test(xml)) return null;
  const rows = [];
  const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = caseRe.exec(xml))) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const name = (attrs.match(/\bname="([^"]*)"/) || [])[1] ?? (attrs.match(/\bid="([^"]*)"/) || [])[1] ?? "?";
    const status = (attrs.match(/\bstatus="([^"]*)"/) || [])[1];
    const failed = /<(failure|error)\b/.test(body) || (status && !/^(SUCCESS|PASSED?|OK)$/i.test(status));
    const message = failed ? ((body.match(/<(?:failure|error)\b[^>]*message="([^"]*)"/) || [])[1] ?? body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)) : undefined;
    rows.push(failed ? { flow: name, ok: false, message } : { flow: name, ok: true });
  }
  return rows.length ? rows : null;
}

/**
 * The e2e step's verdict from the Maestro run: exit code + per-flow report +
 * the list of flows the directory held. FAIL names every failing flow; a run
 * whose report lists fewer flows than the directory holds is ERROR — the lane
 * cannot claim flows it has no row for.
 * @param {{ok: boolean, out: string}} res
 * @param {Array<{flow: string, ok: boolean, message?: string}>|null} perFlow
 * @param {string[]} flows root-relative flow files the directory holds
 * @returns {{verdict: "PASS"|"FAIL"|"ERROR", reason?: string, details: object}}
 */
export function maestroOutcome(res, perFlow, flows) {
  const details = { flows, results: perFlow ?? undefined };
  if (perFlow) {
    const failed = perFlow.filter((r) => !r.ok);
    if (failed.length) {
      return {
        verdict: "FAIL",
        reason: `Maestro: ${failed.length} of ${perFlow.length} flow${perFlow.length === 1 ? "" : "s"} failed — ${failed.map((r) => `${r.flow}${r.message ? ` (${r.message.split("\n")[0].slice(0, 120)})` : ""}`).join("; ")}`,
        details,
      };
    }
    if (perFlow.length < flows.length) {
      return {
        verdict: "ERROR",
        reason: `Maestro reported ${perFlow.length} flow${perFlow.length === 1 ? "" : "s"} but ${E2E_DIR_LABEL} holds ${flows.length} — the run did not cover every flow, so no verdict can be claimed for the rest`,
        details,
      };
    }
    if (!res.ok) {
      return { verdict: "FAIL", reason: `Maestro exited non-zero with every flow reported green — treat as a run failure:\n${String(res.out).split("\n").slice(-10).join("\n")}`, details };
    }
    return { verdict: "PASS", details };
  }
  if (!res.ok) {
    return { verdict: "FAIL", reason: `Maestro failed (no per-flow report was written):\n${String(res.out).split("\n").slice(-15).join("\n")}`, details };
  }
  return { verdict: "PASS", reason: "Maestro exited 0 but wrote no per-flow report — verdict from the exit code only", details };
}
const E2E_DIR_LABEL = "qa/e2e";

// ── Device-log incidents, scoped to the app under test ──────────────────────
/**
 * ANR / fatal-exception lines from `adb logcat -d -b system,crash,main` that
 * belong to one of `appIds` (an app's process may be `pkg` or `pkg:remote`).
 * An emulator carries other apps — on 2026-09-03 the first self-booted lane
 * went red on `ANR in com.karel.bratometer` while driving com.fleet.check —
 * so an incident in another package is NOT this lane's failure. With no
 * appIds known the sweep stays unscoped (every incident counts) and says so.
 * @param {string} log
 * @param {string[]} appIds
 * @returns {{lines: string[], scoped: boolean}}
 */
export function deviceLogIncidents(log, appIds = []) {
  const lines = String(log ?? "").split("\n");
  const ids = appIds.filter((id) => typeof id === "string" && id.trim() && id !== "__PACKAGE__");
  const scoped = ids.length > 0;
  const ours = (proc) => !scoped || ids.some((id) => proc === id || proc.startsWith(`${id}:`));
  const out = [];
  lines.forEach((line, i) => {
    const anr = line.match(/ANR in (\S+?)(?:\s|,|$)/);
    if (anr) {
      if (ours(anr[1].replace(/[,)]$/, ""))) out.push(line);
      return;
    }
    if (/FATAL EXCEPTION/i.test(line)) {
      if (!scoped) {
        out.push(line);
        return;
      }
      // The crash buffer names the process on one of the next few lines.
      const window = lines.slice(i, i + 8).join("\n");
      const proc = window.match(/Process:\s*(\S+?)(?:,|\s|$)/);
      if (proc && ours(proc[1])) out.push(line);
    }
  });
  return { lines: out, scoped };
}
