// A DEBUG BUILD THAT ASKED FOR EMULATORS AND DID NOT GET THEM MUST NOT CONTINUE.
//
// `create-cmp add firebase` wires GitLive Firebase at the local emulators on
// both platforms (overlays/firebase/; until 2026-09-25 it was the template's
// default).
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
// WHY THIS IS A SOURCE SCAN AND NOT A RUN. The fleet's scratch app is the
// default stamp, which carries no Firebase, and is stamped `--no-ios`; CI's
// stamp + add firebase job COMPILES the Android redirect but nothing executes
// it — not the L2 run, not the framework check, not the suite. That gap is
// KD-45, and it is why an adopter found this defect and we did not.
//
// THE ONE QUESTION A SCAN COULD NOT ANSWER WAS MEASURED ONCE, BY HAND. Review
// asked whether the old `runCatching` was load-bearing for the placeholder
// `google-services.json` the template ships — if `Firebase.auth` throws under
// placeholder config, making the redirect throw turns every adopter's first
// `installDebug` into a crash. Reasoning said probably not; reasoning is not
// evidence. So: scaffold `--firebase --no-ios` against this template, headless
// Medium_Phone_API_35, `installDebug`, `am start`, read logcat.
//
//   BuildConfig.USE_FIREBASE_EMULATORS   true    (the gate passed; the redirect RAN)
//   FATAL / IllegalStateException         none
//   process after launch                  alive, and still alive 20s later
//
// The redirect executed against placeholder config and did not throw. The
// `runCatching` was hiding nothing that happens on a first run — which is
// exactly why it was so cheap to leave in and so expensive to keep.
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

/**
 * The add step's edit list. The redirect is DECLARED in the overlay's
 * FirebaseEmulators.kt and CALLED from a line this file inserts into the app's
 * own entry point — so whether the refusal runs is a fact about this file.
 */
const EDITS = "overlays/firebase/edits.json";

/**
 * The two sites that redirect Firebase, how each one knows it is a debug build,
 * and the entry point the add step makes call it (a template file, anchored by
 * EDITS).
 */
const SITES = [
  {
    rel: "overlays/firebase/files/composeApp/src/androidMain/kotlin/com/example/app/FirebaseEmulators.kt",
    caller: "composeApp/src/androidMain/kotlin/com/example/app/AppApplication.kt",
    gate: /if\s*\(!BuildConfig\.USE_FIREBASE_EMULATORS\)\s*return/,
    gateDescription: "if (!BuildConfig.USE_FIREBASE_EMULATORS) return",
  },
  {
    rel: "overlays/firebase/files/composeApp/src/iosMain/kotlin/com/example/app/FirebaseEmulators.kt",
    caller: "composeApp/src/iosMain/kotlin/com/example/app/KoinHelper.kt",
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
  return braceBody(src, src.indexOf("{", at), rel);
}

/**
 * The site's entry point as `create-cmp add firebase` leaves it: the template's
 * file, with every insertion EDITS makes into it applied at its anchor — the
 * same whole-line, trimmed, exactly-once rule the add step refuses on.
 */
function callerAfterAdd(site) {
  const edits = JSON.parse(fs.readFileSync(path.join(ROOT, EDITS), "utf8"));
  let lines = fs.readFileSync(path.join(ROOT, "template", site.caller), "utf8").split("\n");
  for (const insert of edits.inserts.filter((i) => i.file === site.caller)) {
    const anchor = insert.after ?? insert.before;
    const hits = lines.flatMap((l, i) => (l.trim() === anchor ? [i] : []));
    assert.equal(hits.length, 1, `${EDITS}: the anchor \`${anchor}\` must occur once in template/${site.caller}, and occurs ${hits.length} times`);
    const indent = /^[ \t]*/.exec(lines[hits[0]])[0];
    const at = insert.after ? hits[0] + 1 : hits[0];
    lines = [...lines.slice(0, at), ...insert.lines.map((l) => indent + l), ...lines.slice(at)];
  }
  return lines.join("\n");
}

/** The `{ … }` starting at `open`, brace-matched. */
function braceBody(src, open, rel) {
  assert.notEqual(open, -1, `${rel}: expected a block and found none`);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  assert.fail(`${rel}: a block opened at ${open} has no closing brace`);
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
    // `runCatching` WAS NEVER THE DEFECT — discarding the failure was, and an
    // empty catch discards it identically. The first version of this test asked
    // only that a catch EXISTED, and review proved the gap by planting
    // `catch (cause: Throwable) { }` and `catch (cause: Throwable) { println(…) }`
    // on the two sites: both passed, and the app still starts against production.
    // EVERY catch, not the first. Kotlin chains them, and reading only the
    // leading one blessed exactly the shape this repo TEACHES:
    //
    //   } catch (cancel: CancellationException) { throw cancel }
    //   } catch (cause: Throwable) { /* swallowed */ }
    //
    // The first supplies the `throw` a single-catch assertion looks for; the
    // broad one behind it discards every real failure and the app starts against
    // the real project. ARCH-08 and template/CLAUDE.md name that two-catch form
    // as the house convention for the data layer, so an author following the
    // rules writes the shape that walks past the guard. Found in review round 2.
    const catches = [...body.matchAll(/\bcatch\s*\(/g)].map((m) => m.index);
    assert.ok(
      catches.length,
      `${site.rel}: nothing in configureFirebaseEmulators() handles a failure. The redirect must ` +
        `propagate or refuse by name — a build that cannot honour an explicit request for emulators has no ` +
        `safe way to continue.`,
    );
    catches.forEach((at, i) => {
      const caught = braceBody(body, body.indexOf("{", at), site.rel);
      assert.match(
        caught,
        /\bthrow\b/,
        `${site.rel}: catch #${i + 1} of ${catches.length} around the emulator redirect does not rethrow. ` +
          `Catching and continuing is the defect this file exists to refuse, wearing a different keyword — ` +
          `the build asked for emulators, did not get them, and carries on against the REAL project. ` +
          `Logging is not refusing: nobody reads logcat on the run where it mattered. A chained catch counts: ` +
          `one that rethrows CancellationException does not license a broad one behind it that does not.`,
      );
    });
  });

  test(`${platform}: the refusal is actually CALLED`, () => {
    // A refusal nothing invokes is not a refusal. Review deleted the one-line
    // call site on each platform and every other assertion here still passed —
    // a guard blessing a gate that never runs. The call is now a line the add
    // step inserts into the app's entry point, so it is read from there: the
    // template's file with EDITS applied.
    const src = maskSource(callerAfterAdd(site));
    const calls = [...src.matchAll(/\bconfigureFirebaseEmulators\(\)/g)].map((m) => m.index);
    // The lookbehind is the whole test. `at !== declaration` was also here and
    // can never be false — `declaration` indexes `fun`, every match indexes that
    // plus four — so it was a second spelling of one intent, which is the class
    // this repo keeps closing. Removed rather than left decorative (KD-52).
    assert.ok(
      calls.some((at) => !src.slice(Math.max(0, at - 4), at).includes("fun ")),
      `${site.rel}: configureFirebaseEmulators() is declared and never called. Everything else this file ` +
        `asserts is true of code that does not run — the redirect never happens, and the build talks to ` +
        `whatever google-services.json / GoogleService-Info.plist names. (The call is inserted by ` +
        `${EDITS} into template/${site.caller}.)`,
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
    assert.ok(fs.existsSync(path.join(ROOT, "template", site.caller)), `template/${site.caller} has moved — the call is inserted into a file that is gone`);
  }
});
