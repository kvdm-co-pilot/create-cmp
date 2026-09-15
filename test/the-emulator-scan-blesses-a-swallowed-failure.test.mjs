// THE SCAN THAT SAYS "NOT SWALLOWED" ACCEPTS A SWALLOWED FAILURE.
//
// `test/the-emulator-redirect-cannot-fail-quietly.test.mjs` is the only gate in
// this repository that holds the template's Firebase emulator redirect — KD-45
// records that nothing here EXECUTES that code, so a scan of its shape is the
// whole of what is held. A gate that is the only gate has to refuse the DEFECT,
// not one spelling of it.
//
// It refuses one spelling. Measured by this file, on the tree that added it:
//
//   RED    runCatching restored                 <- the spelling that shipped
//   RED    the build gate deleted               <- the iOS defect
//   GREEN  catch (cause: Throwable) { }         <- the same swallow, one word over
//   GREEN  catch (cause: Throwable) { log(…) }  <- likewise
//   GREEN  configureFirebaseEmulators() never called
//
// The first two are the instance the author had in front of them. The last
// three are the class, and the class is what is actually wrong: `runCatching`
// was never the defect, DISCARDING THE FAILURE was, and an empty catch discards
// it identically while satisfying the scan's `/\bcatch\s*\(/` as "a failure path
// exists". A refusal nothing calls is not a refusal at all.
//
// WHY A MUTATION TEST AND NOT A STRONGER SCAN. The template's Kotlin is correct
// today: it is gated, it throws, and it is called. So an invariant asserted
// against the template source is GREEN and proves nothing about the instrument.
// The defect is in the instrument, so the instrument is what this executes —
// plant the defect, demand the red. Same shape as `scripts/framework-check.mjs`:
// a lane that only ever returns PASS has not been shown to return.
//
// IT MUTATES NOTHING IN THIS TREE. Each case assembles a throwaway root in a
// temp dir — the gate's own bytes, its helper's own bytes, and the two Kotlin
// files with one defect planted — and runs the gate there. Concurrent runs,
// a dirty working tree and an interrupted run are all harmless, because the
// repository is only ever read.
import { test } from "node:test";
import assert from "node:assert/strict";

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { maskSource, matchBracket } from "./helpers/js-source-scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GATE = "test/the-emulator-redirect-cannot-fail-quietly.test.mjs";
const HELPER = "test/helpers/js-source-scan.mjs";
const ANDROID = "template/composeApp/src/androidMain/kotlin/com/example/app/AppApplication.kt";
const IOS = "template/composeApp/src/iosMain/kotlin/com/example/app/KoinHelper.kt";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/**
 * How many assertions the gate must be seen to run before its answer counts.
 * A floor, not an equality: the gate growing an assertion is the point of this
 * file, and must not turn it red.
 */
const MIN_ASSERTIONS = 5;

/**
 * The body of the FIRST catch block, replaced. Brace-matched on the masked copy,
 * because the catch body this replaces contains `${cause.message}` and a raw
 * brace count would stop inside the string.
 */
function withCatchBody(raw, replacement) {
  const masked = maskSource(raw);
  const at = masked.indexOf("catch (");
  assert.notEqual(at, -1, "the redirect no longer has a catch block — this mutation is aimed at nothing");
  const open = masked.indexOf("{", masked.indexOf(")", at));
  const close = matchBracket(masked, open);
  assert.notEqual(close, -1, "the catch block has no closing brace");
  return `${raw.slice(0, open + 1)}\n${replacement}\n    ${raw.slice(close)}`;
}

/** The CALL, never the declaration: a call sits alone on its line, a declaration does not. */
function withoutTheCall(raw) {
  return raw.replace(/^[ \t]*configureFirebaseEmulators\(\)[ \t]*\n/m, "");
}

const unchanged = (s) => s;

/**
 * Run the gate against a throwaway root holding these exact bytes, and read its
 * TAP counts.
 *
 * NOT THE EXIT CODE ALONE, and not the inherited environment. Node's test
 * runner sets `NODE_TEST_CONTEXT` in every file it spawns, and a nested
 * `node --test` that sees it reports through the parent protocol and **exits 0
 * whatever its tests did** — measured here, on Node 24: the same failing file is
 * exit 1 from a clean env and exit 0 with `NODE_TEST_CONTEXT=child-v8` set. The
 * first draft of this harness read that 0 and called six planted defects
 * REFUSED. A mutation harness that cannot fail is worth less than none, so the
 * env is scrubbed and the verdict comes from counts the child had to produce.
 *
 * @returns {"GREEN"|"RED"}
 */
function gateVerdictOn(androidSrc, iosSrc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmp-emulator-scan-"));
  try {
    for (const [rel, body] of [
      [GATE, read(GATE)],
      [HELPER, read(HELPER)],
      [ANDROID, androidSrc],
      [IOS, iosSrc],
    ]) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_TEST_WORKER_ID;
    const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", GATE], {
      cwd: dir,
      env,
      encoding: "utf8",
    });
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    const count = (label) => Number(new RegExp(`^# ${label} (\\d+)$`, "m").exec(out)?.[1] ?? NaN);
    const pass = count("pass");
    const fail = count("fail");
    assert.ok(
      Number.isFinite(pass) && Number.isFinite(fail) && pass + fail >= MIN_ASSERTIONS,
      `the sandboxed run of ${GATE} did not produce ${MIN_ASSERTIONS} results, so its verdict attests nothing.\n` +
        `  exit ${run.status}\n${out}`,
    );
    return fail === 0 ? "GREEN" : "RED";
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Every planted defect, and the verdict the gate owes it.
 *
 * `expect: "GREEN"` appears exactly once, on the unmutated tree: an instrument
 * that reds on everything refuses nothing either, and a mutation suite without
 * that row cannot tell the two apart.
 */
const CASES = [
  {
    what: "the template as it stands, unmutated",
    expect: "GREEN",
    android: unchanged,
    ios: unchanged,
    why: "the sandbox is not a faithful copy of the gate's inputs — every other row below is red for the wrong reason",
  },
  {
    what: "android: the redirect back inside runCatching",
    expect: "RED",
    android: (s) => s.replace(/\btry \{\n(\s+)Firebase\.auth/, "runCatching {\n$1Firebase.auth"),
    ios: unchanged,
    why: "the exact spelling that shipped",
  },
  {
    what: "ios: the debug build gate deleted",
    expect: "RED",
    android: unchanged,
    ios: (s) => s.replace(/^[ \t]*if \(!Platform\.isDebugBinary\) return[ \t]*\n/m, ""),
    why: "the iOS defect this slice fixed: release builds redirect to a loopback address that is not there",
  },
  // ——— the class, not the instance ———
  {
    what: "android: a catch block that discards the failure",
    expect: "RED",
    android: (s) => withCatchBody(s, "            // nothing"),
    ios: unchanged,
    why:
      "`runCatching` was never the defect — DISCARDING THE FAILURE was, and an empty catch discards it " +
      "identically. A debug build that asked for emulators, did not get them, and carried on against the " +
      "real project in google-services.json is the same app whichever keyword hid it",
  },
  {
    what: "ios: a catch block that only logs the failure",
    expect: "RED",
    android: unchanged,
    ios: (s) => withCatchBody(s, '        println("emulator redirect failed: " + cause.message)'),
    why:
      "a line in the console is not a refusal. The app still starts, still authenticates against the real " +
      "project in GoogleService-Info.plist, and still does it with half its clients on the emulator",
  },
  {
    what: "android: nothing calls configureFirebaseEmulators()",
    expect: "RED",
    android: withoutTheCall,
    ios: unchanged,
    why: "a refusal nothing performs. The gate reads the function and never asks whether it has a caller",
  },
  {
    what: "ios: nothing calls configureFirebaseEmulators()",
    expect: "RED",
    android: unchanged,
    ios: withoutTheCall,
    why: "same, on the platform whose call site is a single line in initKoin()",
  },
];

for (const c of CASES) {
  test(`the emulator scan must be ${c.expect} when: ${c.what}`, () => {
    const android = c.android(read(ANDROID));
    const ios = c.ios(read(IOS));
    if (c.expect === "RED") {
      assert.ok(
        android !== read(ANDROID) || ios !== read(IOS),
        `the mutation "${c.what}" no longer applies to the template — it is planting nothing, so its red proves nothing. ` +
          `Re-aim it at the code as it now stands, or delete the row.`,
      );
    }
    assert.equal(
      gateVerdictOn(android, ios),
      c.expect,
      `${GATE} answered the wrong way for a planted defect.\n` +
        `  planted: ${c.what}\n` +
        `  why it must be refused: ${c.why}\n` +
        `  That gate is the ONLY thing holding the template's emulator redirect — KD-45: nothing in this ` +
        `repository executes that code. A scan that refuses one spelling of a defect refuses the defect the ` +
        `next author happens not to write.`,
    );
  });
}
