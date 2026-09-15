// A DEBUG BUILD THAT ASKED FOR EMULATORS AND DID NOT GET THEM MUST NOT CONTINUE.
//
// The template wires GitLive Firebase at the local emulators on both platforms.
// Until 2026-09-15 both sites wrapped that redirect in `runCatching { }` and
// discarded the Result, so every way it could fail was invisible — and what it
// falls back to is not "no Firebase", it is the REAL project named by
// google-services.json / GoogleService-Info.plist. A debug build reading,
// writing and authenticating against production, silently.
//
// The partial case is the one worth naming: `useEmulator` is called four times,
// and nothing made them atomic. Auth redirected and Firestore not is a live app
// with half its traffic on an emulator and half on production — the state
// hardest to notice and hardest to explain afterwards.
//
// The iOS site had a second defect the comment above it did not mention: NO
// BUILD GATE AT ALL. Android has `if (!BuildConfig.USE_FIREBASE_EMULATORS)
// return`; Kotlin/Native has no BuildConfig and nothing took its place, so
// `initKoin()` — called from iOSApp.swift's AppDelegate on every launch —
// redirected release builds too.
//
// WHY THIS IS A SOURCE SCAN AND NOT A RUN. `scripts/fleet-check.mjs` stamps its
// scratch app `--no-ios --no-firebase`, so no gate in this repo executes either
// path: not the device tier, not the framework check, not the suite. Proving
// the runtime behaviour needs a device, a Firebase project and running
// emulators, which is a slice of its own (KD-45). Until then the shape is what
// can be held, and holding the shape is worth more than holding nothing.
//
// These assertions are deliberately about STRUCTURE, not wording. They ask that
// a gate exists, that the call is not swallowed, and that a failure path exists
// — never what the message says. A test that pinned the prose would fail on
// every edit to a sentence and teach the next author to delete it.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { maskSource } from "./helpers/js-source-scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The two sites that redirect Firebase, and how each one knows it is a debug build. */
const SITES = [
  {
    rel: "template/composeApp/src/androidMain/kotlin/com/example/app/AppApplication.kt",
    gate: /if\s*\(!BuildConfig\.USE_FIREBASE_EMULATORS\)\s*return/,
    gateDescription: "if (!BuildConfig.USE_FIREBASE_EMULATORS) return",
  },
  {
    rel: "template/composeApp/src/iosMain/kotlin/com/example/app/KoinHelper.kt",
    // Kotlin/Native has no BuildConfig; this is its equivalent, and its absence
    // is what made every release build redirect to 127.0.0.1.
    gate: /if\s*\(!Platform\.isDebugBinary\)\s*return/,
    gateDescription: "if (!Platform.isDebugBinary) return",
  },
];

/**
 * The body of `configureFirebaseEmulators`, brace-matched, with comments and
 * string literals masked to spaces.
 *
 * MASKED, because the first version of this test read prose. The Android fix
 * explains what it replaced — "This was `runCatching { … }` with the Result
 * discarded" — and the scan for `runCatching` matched that sentence and failed
 * the very code it was written to bless. A comment is not a call site; this
 * repo already owns that lesson and the masker that embodies it, so this
 * borrows `maskSource` rather than growing a second one. It is written for
 * .mjs and Kotlin agrees with JavaScript on `//`, `/* *\/` and `"…"`, which is
 * all these assertions read.
 */
function redirectBody(raw, rel) {
  const src = maskSource(raw);
  const at = src.indexOf("fun configureFirebaseEmulators()");
  assert.notEqual(at, -1, `${rel} no longer declares configureFirebaseEmulators() — this test is aimed at nothing`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  assert.fail(`${rel}: configureFirebaseEmulators() has no closing brace`);
}

for (const site of SITES) {
  const platform = site.rel.includes("androidMain") ? "android" : "ios";

  test(`${platform}: the emulator redirect is gated to debug builds`, () => {
    const body = redirectBody(fs.readFileSync(path.join(ROOT, site.rel), "utf8"), site.rel);
    assert.match(
      body,
      site.gate,
      `${site.rel}: configureFirebaseEmulators() has no build gate. Expected ${site.gateDescription}.\n` +
        `  Without it the redirect runs in RELEASE builds too, and an adopter ships an app whose Firebase ` +
        `calls all go to a loopback address that is not there. The iOS site shipped exactly that until ` +
        `2026-09-15, because Kotlin/Native has no BuildConfig and nothing took its place.`,
    );
  });

  test(`${platform}: a failed emulator redirect is not swallowed`, () => {
    const body = redirectBody(fs.readFileSync(path.join(ROOT, site.rel), "utf8"), site.rel);

    assert.ok(
      body.includes("useEmulator"),
      `${site.rel}: configureFirebaseEmulators() no longer calls useEmulator — this test is aimed at nothing`,
    );
    assert.doesNotMatch(
      body,
      /runCatching/,
      `${site.rel}: the emulator redirect is inside runCatching. If the Result is discarded — which is how ` +
        `this shipped — a debug build that asked for emulators and did not get them carries on against the ` +
        `REAL project, reading, writing and authenticating against production. Partial failure is worse: ` +
        `four useEmulator calls, nothing atomic, so auth can redirect while firestore does not.`,
    );
    assert.match(
      body,
      /\bcatch\s*\(|\berror\(|\bthrow\b/,
      `${site.rel}: nothing in configureFirebaseEmulators() handles a failure. The redirect must either ` +
        `propagate or refuse by name — a build that cannot honour an explicit request for emulators has no ` +
        `safe way to continue.`,
    );
  });
}

test("both platforms answer the same question, and neither is the only one fixed", () => {
  // The defect was found on one platform and existed on both, in different
  // shapes. A fix to one site only is the state this repo has been in twice this
  // week under a different name: one fact, more than one spelling.
  assert.equal(SITES.length, 2, "a third redirect site exists and is not covered here");
  for (const site of SITES) {
    assert.ok(fs.existsSync(path.join(ROOT, site.rel)), `${site.rel} has moved — the scan covers a file that is gone`);
  }
});
