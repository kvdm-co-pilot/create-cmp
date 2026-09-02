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
// (docs/proposals/evidence-economics.md C3; S4 upgrades "did not execute" from
// an honest FAIL to a distinct ERROR verdict.)

/**
 * The androidChecks outcome from Gradle's exit and the JUnit summary.
 *
 * @param {{ok: boolean, out: string}} res the Gradle invocation
 * @param {{tests: number, failures: number, errors: number}|null} summary parsed JUnit
 *   results, or null when none were written
 * @param {{gradlew?: string}} [opts]
 * @returns {{verdict: "PASS"|"FAIL", executed: boolean, reason?: string}}
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
  // It still FAILs — a device tier that could not execute is not evidence, and
  // going green would be the worse lie. Only the ACCUSATION is withdrawn.
  return {
    verdict: "FAIL",
    executed,
    reason:
      "connectedDebugAndroidTest DID NOT EXECUTE — the run reported no tests at all, so this step has observed " +
      "nothing about your change and is not accusing it. Usual cause: another adb/Gradle session touching the same " +
      "device (a manual `adb` command, a second lane, a running preview), or an install that never landed. " +
      `Re-run this step alone with nothing else on the device before suspecting the code:\n  ${gradlew} :composeApp:connectedDebugAndroidTest --rerun\n${tail}`,
  };
}
