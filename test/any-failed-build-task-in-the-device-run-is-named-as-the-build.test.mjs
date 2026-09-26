// ANY BUILD TASK THAT FAILED INSIDE THE DEVICE RUN IS THE BUILD, NOT THE DEVICE.
//
// KD-261 fixed one instance: a `compile…AndroidTest…` task FAILED was answered
// "DID NOT EXECUTE … Usual cause: another adb/Gradle session touching the same
// device", sending an adopter with a broken build to look at the environment. The
// fix matches that one task-name shape. `connectedDebugAndroidTest` builds the
// whole androidTest APK first, and every one of those tasks writes no JUnit
// results when it fails — so the same false sentence is still printed for the
// failures an adopter adding an instrumented-test dependency meets most often:
// a META-INF clash (`mergeDebugAndroidTestJavaResource`), a duplicate class
// (`checkDebugAndroidTestDuplicateClasses`), a manifest merger conflict
// (`processDebugAndroidTestManifest`), KSP over the test sources
// (`kspDebugAndroidTestKotlinAndroid`), or the main sources themselves
// (`compileDebugKotlinAndroid`).
//
// The invariant: when Gradle names a FAILED task that is not the device task
// itself, the reason names that task and does not tell the adopter to suspect
// the device. The verdict stays ERROR (nothing was observed). A failure of
// `connectedDebugAndroidTest` itself keeps the environment advice.

import assert from "node:assert/strict";
import test from "node:test";

const COPIES = {
  harness: "../packages/harness/src/lib/profiles/cmp/android-checks.mjs",
  template: "../template/qa/lib/profiles/cmp/android-checks.mjs",
};

const BUILD_FAILURES = {
  mergeDebugAndroidTestJavaResource: "2 files found with path 'META-INF/LICENSE.md' from inputs:",
  checkDebugAndroidTestDuplicateClasses: "Duplicate class kotlin.collections.jdk8.CollectionsJDK8Kt found in modules",
  processDebugAndroidTestManifest: "Manifest merger failed : uses-sdk:minSdkVersion 24 cannot be smaller than version 26 declared in library",
  kspDebugAndroidTestKotlinAndroid: "e: [ksp] InvalidQuery: no such table",
  compileDebugKotlinAndroid: "e: file:///app/composeApp/src/androidMain/kotlin/App.kt:3:8 Unresolved reference 'Foo'.",
};

for (const [name, rel] of Object.entries(COPIES)) {
  for (const [task, line] of Object.entries(BUILD_FAILURES)) {
    test(`${name}: :composeApp:${task} FAILED is named as the build, not the environment`, async () => {
      const { androidChecksOutcome } = await import(rel);
      const res = {
        ok: false,
        out: [`> Task :composeApp:${task} FAILED`, line, "FAILURE: Build failed with an exception."].join("\n"),
      };
      const r = androidChecksOutcome(res, null);
      assert.equal(r.verdict, "ERROR");
      assert.equal(r.executed, false);
      assert.doesNotMatch(r.reason, /another adb\/Gradle session/, r.reason);
      assert.doesNotMatch(r.reason, /before suspecting the code/, r.reason);
      assert.match(r.reason, new RegExp(task), r.reason);
    });
  }

  test(`${name}: connectedDebugAndroidTest itself failing keeps the environment advice`, async () => {
    const { androidChecksOutcome } = await import(rel);
    const r = androidChecksOutcome(
      { ok: false, out: "> Task :composeApp:connectedDebugAndroidTest FAILED\ncom.android.builder.testing.api.DeviceException: No connected devices!" },
      null,
    );
    assert.equal(r.verdict, "ERROR");
    assert.match(r.reason, /another adb\/Gradle session/, r.reason);
  });
}
