// profiles/cmp/android-checks.mjs — the instrumented-test step's verdict.
// Mobile's, by definition (docs/NORTH-STAR.md §6).
//
// This lived in qa/lib/step-outcomes.mjs beside the neutral verdict helpers
// (StepTimeout, stepErrorResult, spawnTimedOut), and it is not neutral: it
// reads a Gradle invocation's output, a JUnit summary from
// connectedDebugAndroidTest, and tells the operator to re-run a Gradle task on
// a device. A backend profile has none of those. Stage 0 PR 6b.2 moved it here
// so step-outcomes.mjs is the spine's again. The body is verbatim — the tests
// that pinned it moved with it.
//
// The distinction it draws is the load-bearing part, and it is the core's
// principle applied to one step: a tier that could not RUN is ERROR, never
// FAIL. "Your behaviour is broken" is a claim, and this step has observed
// nothing to support it.

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
