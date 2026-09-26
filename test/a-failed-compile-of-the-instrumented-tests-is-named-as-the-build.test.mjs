// A FAILED COMPILE OF THE INSTRUMENTED TESTS WAS REPORTED AS A RUN THAT NEVER STARTED (KD-261).
//
// `androidChecksOutcome` answered every red Gradle run with no JUnit results as
// "DID NOT EXECUTE … not accusing it. Usual cause: another adb/Gradle session …" —
// and a compile failure of the androidTest sources writes no results either, so an
// adopter whose build was broken was sent to look at the device. A `compile…AndroidTest…`
// task FAILED in Gradle's output is the build: it is named as that, with the task,
// and the environment advice is kept for the run that really did not start. The
// verdict stays ERROR — no behaviour was observed either way. Both copies (the
// harness package and the template's vendored mirror) answer the same.

import assert from "node:assert/strict";
import test from "node:test";

const COPIES = {
  harness: "../packages/harness/src/lib/profiles/cmp/android-checks.mjs",
  template: "../template/qa/lib/profiles/cmp/android-checks.mjs",
};

const COMPILE_RED = {
  ok: false,
  out: [
    "> Task :composeApp:compileDebugAndroidTestKotlinAndroid FAILED",
    "e: file:///app/composeApp/src/androidInstrumentedTest/kotlin/AppTest.kt:3:8 Unresolved reference 'Foo'.",
    "FAILURE: Build failed with an exception.",
  ].join("\n"),
};
const DEVICE_RED = { ok: false, out: "> Task :composeApp:connectedDebugAndroidTest FAILED\ncom.android.builder.testing.api.DeviceException: No connected devices!" };

for (const [name, rel] of Object.entries(COPIES)) {
  test(`${name}: a red androidTest compile is named as the build, with its task, not as the environment`, async () => {
    const { androidChecksOutcome } = await import(rel);
    const r = androidChecksOutcome(COMPILE_RED, null);
    assert.equal(r.verdict, "ERROR");
    assert.equal(r.executed, false);
    assert.match(r.reason, /did not compile/i, r.reason);
    assert.match(r.reason, /compileDebugAndroidTestKotlinAndroid/, r.reason);
    assert.doesNotMatch(r.reason, /another adb\/Gradle session/, r.reason);
  });

  test(`${name}: a run that never started keeps the environment advice`, async () => {
    const { androidChecksOutcome } = await import(rel);
    const r = androidChecksOutcome(DEVICE_RED, null);
    assert.equal(r.verdict, "ERROR");
    assert.match(r.reason, /DID NOT EXECUTE/, r.reason);
    assert.match(r.reason, /another adb\/Gradle session/, r.reason);
  });
}
