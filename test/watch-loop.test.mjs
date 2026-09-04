// Watch mode (template/qa/watch.mjs) — the resident inner loop's pure logic,
// tested without spawning a single watcher or Gradle process:
//   - CLI parsing: strict refusal of unknown args, --once/--json/--help
//   - the ignore-set predicate (build dirs, dotfiles/markers, qa/evidence —
//     watching your own output is an infinite loop)
//   - marker-coordination decisions (fresh foreign lane/render = wait;
//     stale = proceed), with the staleness bounds mirroring the consumers
//   - debounce + coalescing: a save storm = ONE run; changes mid-run queue
//     EXACTLY ONE follow-up; deferral polls without re-noticing
//   - the run block: step table, verbatim FAIL reasons, the standing
//     not-a-gate footer, and no completion claims
//   - --once semantics end-to-end against a STUB verify.mjs (real spawn, no
//     Gradle): --fast --json are passed, exit code is the child's, one NDJSON
//     run event per pass, and a stale lane marker does not wedge it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEBOUNCE_MS,
  FOOTER,
  LANE_MARKER_STALE_MS,
  RENDER_MARKER_FRESH_MS,
  watchRoots,
  clearMarkerIfOwnedBy,
  createRunLoop,
  formatRunBlock,
  formatTrigger,
  markerDecision,
  parseReceipt,
  parseWatchArgs,
  shouldIgnorePath,
} from "../template/qa/watch.mjs";
import { installHarnessLib } from "./helpers/harness-fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WATCH_SRC = path.join(HERE, "..", "template", "qa", "watch.mjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "watch-engine-"));

// ── CLI parsing ─────────────────────────────────────────────────────────────

test("parseWatchArgs: recognized flags parse; anything unknown is refused by name", () => {
  assert.deepEqual(parseWatchArgs([]), { help: false, once: false, json: false });
  assert.deepEqual(parseWatchArgs(["--once", "--json"]), { help: false, once: true, json: true });
  assert.equal(parseWatchArgs(["-h"]).help, true);
  assert.equal(parseWatchArgs(["--help"]).help, true);
  const refused = parseWatchArgs(["--fast"]);
  assert.match(refused.error, /unknown argument "--fast"/);
  assert.match(parseWatchArgs(["--once", "--wat"]).error, /--wat/);
});

// ── Ignore predicate ────────────────────────────────────────────────────────

test("shouldIgnorePath: build dirs, dotfiles/markers, and qa/evidence are out; sources, specs, and qa scripts are in", () => {
  // In: the watch set's real content.
  assert.equal(shouldIgnorePath("composeApp/src/commonMain/kotlin/app/HomeViewModel.kt"), false);
  assert.equal(shouldIgnorePath("specs/home.spec.md"), false);
  assert.equal(shouldIgnorePath("qa/e2e/smoke.yaml"), false);
  assert.equal(shouldIgnorePath("qa/golden/home.tree.json"), false);
  assert.equal(shouldIgnorePath("qa/verify.mjs"), false);
  // Out: build output at any depth (watching it would re-trigger on every run).
  assert.equal(shouldIgnorePath("composeApp/build/anything.txt"), true);
  assert.equal(shouldIgnorePath("qa/somewhere/build/out.json"), true);
  // Out: the lane's own output — the one path that makes watch feed itself.
  assert.equal(shouldIgnorePath("qa/evidence/latest.json"), true);
  assert.equal(shouldIgnorePath("qa/evidence"), true);
  // Out: dotfiles anywhere — VCS internals and the coordination markers themselves.
  assert.equal(shouldIgnorePath(".git/index"), true);
  assert.equal(shouldIgnorePath("composeApp/src/.DS_Store"), true);
  assert.equal(shouldIgnorePath("composeApp/build/.cmp-lane-in-progress"), true);
  // Windows separators normalize.
  assert.equal(shouldIgnorePath("composeApp\\build\\x.txt"), true);
  assert.equal(shouldIgnorePath(""), true);
});

test("the watch set is the PROFILE's source roots + its specs dir + qa/; no manifest means the core roots and a said-out-loud note", () => {
  // Stage 0 PR 6b: this was a hardcoded ["composeApp/src", "specs", "qa"], so
  // the inner loop in a repo whose code lives anywhere else watched two of
  // three roots and never fired on a source edit — a watcher that looks idle
  // and is. The roots come from the profile now.
  const app = tmp();
  installHarnessLib(app);
  assert.deepEqual(watchRoots(app), { roots: ["composeApp/src", "specs", "qa"], degraded: null });

  const bare = tmp();
  const bareRoots = watchRoots(bare);
  assert.deepEqual(bareRoots.roots, ["specs", "qa"], "never guess a source layout");
  assert.match(bareRoots.degraded, /harness-manifest\.json is missing/, "and never watch less than it looks, silently");
});

// ── Marker coordination ─────────────────────────────────────────────────────

test("markerDecision: no markers → launch", () => {
  assert.deepEqual(markerDecision({ nowMs: 1000 }), { launch: true });
});

test("markerDecision: a FRESH foreign lane defers (never two Gradle invocations); a stale one is ignored", () => {
  const now = Date.now();
  const fresh = markerDecision({ laneMtimeMs: now - 1000, nowMs: now });
  assert.equal(fresh.launch, false);
  assert.match(fresh.reason, /lane .*in progress/i);
  const stale = markerDecision({ laneMtimeMs: now - LANE_MARKER_STALE_MS - 1, nowMs: now });
  assert.equal(stale.launch, true);
});

test("markerDecision: a FRESH preview render defers; a stale one is ignored — bound mirrors verify.mjs's", () => {
  const now = Date.now();
  const fresh = markerDecision({ renderMtimeMs: now - 1000, nowMs: now });
  assert.equal(fresh.launch, false);
  assert.match(fresh.reason, /preview daemon/i);
  const stale = markerDecision({ renderMtimeMs: now - RENDER_MARKER_FRESH_MS - 1, nowMs: now });
  assert.equal(stale.launch, true);
  assert.equal(RENDER_MARKER_FRESH_MS, 5 * 60 * 1000);
  assert.equal(LANE_MARKER_STALE_MS, 30 * 60 * 1000);
});

test("clearMarkerIfOwnedBy: removes only the marker OUR child stamped, leaves a foreign holder's alone", () => {
  const dir = tmp();
  const marker = path.join(dir, ".cmp-lane-in-progress");
  fs.writeFileSync(marker, `4711 ${new Date().toISOString()}\n`);
  assert.equal(clearMarkerIfOwnedBy(marker, 9999), false, "foreign pid must not clear");
  assert.ok(fs.existsSync(marker));
  assert.equal(clearMarkerIfOwnedBy(marker, 4711), true);
  assert.ok(!fs.existsSync(marker));
  assert.equal(clearMarkerIfOwnedBy(marker, 4711), false, "absent marker is a no-op");
});

// ── Debounce + coalescing ───────────────────────────────────────────────────

test("a save storm within the debounce window triggers ONE run carrying every path", async () => {
  const runs = [];
  const loop = createRunLoop({
    debounceMs: 25,
    pollMs: 10,
    canLaunch: () => ({ launch: true }),
    runOnce: async (paths) => {
      runs.push(paths);
    },
  });
  loop.change("a.kt");
  await sleep(5);
  loop.change("b.kt");
  await sleep(5);
  loop.change("c.kt");
  await sleep(120);
  assert.equal(runs.length, 1, `expected one coalesced run, got ${runs.length}`);
  assert.deepEqual([...runs[0]].sort(), ["a.kt", "b.kt", "c.kt"]);
  loop.stop();
});

test("changes while a run is in flight queue EXACTLY ONE follow-up (coalesce, never stack)", async () => {
  const runs = [];
  let releaseFirst;
  const firstGate = new Promise((r) => (releaseFirst = r));
  const loop = createRunLoop({
    debounceMs: 10,
    pollMs: 10,
    canLaunch: () => ({ launch: true }),
    runOnce: async (paths) => {
      runs.push(paths);
      if (runs.length === 1) await firstGate; // hold run #1 open
    },
  });
  loop.change("first.kt");
  await sleep(40); // run #1 is now in flight, held open
  assert.equal(runs.length, 1);
  assert.equal(loop.running, true);
  loop.change("during-1.kt");
  loop.change("during-2.kt");
  loop.change("during-3.kt");
  assert.equal(loop.queued, true);
  releaseFirst();
  await sleep(60);
  assert.equal(runs.length, 2, "three mid-run changes must coalesce into ONE follow-up");
  assert.deepEqual([...runs[1]].sort(), ["during-1.kt", "during-2.kt", "during-3.kt"]);
  await sleep(40);
  assert.equal(runs.length, 2, "no third run without a third change");
  loop.stop();
});

test("deferral: while canLaunch says wait, the loop polls (noticing once) and coalesces; the run fires when the project frees up", async () => {
  const runs = [];
  const notices = [];
  let blocked = true;
  const loop = createRunLoop({
    debounceMs: 10,
    pollMs: 15,
    canLaunch: () => (blocked ? { launch: false, reason: "lane in progress" } : { launch: true }),
    runOnce: async (paths) => {
      runs.push(paths);
    },
    onDefer: (reason) => notices.push(reason),
  });
  loop.change("a.kt");
  await sleep(70); // several poll cycles while blocked
  assert.equal(runs.length, 0, "must not launch into a foreign lane");
  assert.equal(notices.length, 1, "the deferral is noticed once per wait, not per poll");
  loop.change("b.kt"); // arrives during the wait — coalesces
  blocked = false;
  await sleep(60);
  assert.equal(runs.length, 1);
  assert.deepEqual([...runs[0]].sort(), ["a.kt", "b.kt"]);
  loop.stop();
});

test("stop() ends the loop: no timer fires after shutdown", async () => {
  const runs = [];
  const loop = createRunLoop({
    debounceMs: 10,
    pollMs: 10,
    canLaunch: () => ({ launch: true }),
    runOnce: async (p) => {
      runs.push(p);
    },
  });
  loop.change("a.kt");
  loop.stop();
  await sleep(50);
  assert.equal(runs.length, 0);
});

test("the shipped debounce sits in the justified 300–500ms band", () => {
  assert.ok(DEBOUNCE_MS >= 300 && DEBOUNCE_MS <= 500, `DEBOUNCE_MS=${DEBOUNCE_MS}`);
});

// ── Output block ────────────────────────────────────────────────────────────

test("formatTrigger caps the path list", () => {
  assert.equal(formatTrigger([]), "(manual)");
  assert.equal(formatTrigger(["a", "b"]), "a, b");
  assert.equal(formatTrigger(["a", "b", "c", "d", "e"]), "a, b, c (+2 more)");
});

test("formatRunBlock: step table + verbatim FAIL reason + the standing not-a-gate footer; never a completion claim", () => {
  const reason = "desktopTest failed (1 of 41 tests). Fix the failing behavior:\nHomeViewModelTest > loads FAILED\n  expected 3, got 2";
  const block = formatRunBlock({
    n: 3,
    startedAtIso: "2026-08-19T12:00:00.000Z",
    trigger: ["composeApp/src/commonMain/kotlin/app/Home.kt"],
    receipt: {
      verdict: "FAIL",
      steps: [
        { name: "specCoverage", verdict: "PASS", durationMs: 12 },
        { name: "approvals", verdict: "SKIP", durationMs: 1, reason: "3 artifacts unreviewed\nsecond line stays out of the table" },
        { name: "unitTests", verdict: "FAIL", durationMs: 32000, reason },
      ],
    },
    exitCode: 1,
    durationMs: 41000,
  });
  assert.match(block, /watch run #3/);
  assert.match(block, /✓ specCoverage PASS/);
  assert.match(block, /→ approvals SKIP .*3 artifacts unreviewed/);
  assert.ok(!block.includes("second line stays out of the table"), "SKIP keeps only its first reason line");
  assert.match(block, /✗ unitTests FAIL/);
  // The failing step's reason is surfaced VERBATIM — every line of it.
  for (const line of reason.split("\n")) assert.ok(block.includes(line), `verbatim reason line missing: ${line}`);
  assert.match(block, /FAIL in 41\.0s/);
  assert.ok(block.includes(FOOTER), "every block ends with the standing footer");
  // Not a gate: no completion claims, ever ("done" appears only inside
  // "done-gate", the name of the thing this is not).
  assert.ok(!/\bverified\b/i.test(block));
  assert.ok(!/\bcomplete\b/i.test(block));
  assert.ok(!/\bdone\b(?!-gate)/i.test(block));
});

test("formatRunBlock without a parseable receipt surfaces the child's tail instead of fabricating a verdict", () => {
  const block = formatRunBlock({
    n: 1,
    startedAtIso: "2026-08-19T12:00:00.000Z",
    trigger: [],
    receipt: null,
    exitCode: 2,
    durationMs: 300,
    rawTail: ["unknown argument \"--nope\" — run node qa/verify.mjs --help"],
  });
  assert.match(block, /NO RECEIPT/);
  assert.match(block, /verify exited 2/);
  assert.match(block, /unknown argument/);
  assert.ok(block.includes(FOOTER));
});

test("parseReceipt: whole-JSON, prefixed-noise JSON, and garbage", () => {
  assert.deepEqual(parseReceipt('{"verdict":"PASS"}'), { verdict: "PASS" });
  assert.deepEqual(parseReceipt('noise line\n{"verdict":"FAIL"}'), { verdict: "FAIL" });
  assert.equal(parseReceipt("no json here"), null);
  assert.equal(parseReceipt(""), null);
});

// ── --once semantics, end-to-end against a stub verify.mjs ──────────────────

function makeFakeProject({ verdict = "PASS", exitCode = 0 } = {}) {
  const root = tmp();
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  // The vendored lib + manifest a real project carries: since Stage 0 PR 6a
  // watch.mjs resolves both markers through qa/lib/lane-markers.mjs, which
  // asks the manifest for the profile whose buildDir holds the render marker.
  installHarnessLib(root);
  fs.copyFileSync(WATCH_SRC, path.join(root, "qa", "watch.mjs"));
  const receipt = {
    schema: "cmp-evidence/1",
    profile: "local",
    mode: "fast",
    verdict,
    steps: [
      { name: "specCoverage", verdict: "PASS", durationMs: 3 },
      verdict === "FAIL"
        ? { name: "unitTests", verdict: "FAIL", durationMs: 8, reason: "desktopTest failed\nFooTest > bar FAILED" }
        : { name: "unitTests", verdict: "PASS", durationMs: 8 },
    ],
  };
  fs.writeFileSync(
    path.join(root, "qa", "verify.mjs"),
    [
      "#!/usr/bin/env node",
      "// stub verify — asserts watch invokes the SANCTIONED fast tier, JSON out",
      'if (!process.argv.includes("--fast") || !process.argv.includes("--json")) {',
      '  console.error("stub: watch must pass --fast --json"); process.exit(2);',
      "}",
      `console.log(${JSON.stringify(JSON.stringify(receipt, null, 2))});`,
      `process.exit(${exitCode});`,
      "",
    ].join("\n"),
  );
  return root;
}

test("--once: single coordinated pass — passes --fast --json to verify, exits with the child's code, one NDJSON run event", () => {
  const root = makeFakeProject({ verdict: "PASS", exitCode: 0 });
  const res = spawnSync(process.execPath, [path.join(root, "qa", "watch.mjs"), "--once", "--json"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${res.stdout}\n${res.stderr}`);
  const events = res.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const runEvents = events.filter((e) => e.event === "run");
  assert.equal(runEvents.length, 1, "exactly one run per --once pass");
  assert.equal(runEvents[0].verdict, "PASS");
  assert.equal(runEvents[0].mode, "fast");
  assert.equal(runEvents[0].innerLoopOnly, true);
  assert.ok(Array.isArray(runEvents[0].steps) && runEvents[0].steps.length === 2);
  assert.equal(runEvents[0].note, FOOTER);
});

test("--once on a red fast lane: exit 1, the FAIL step's reason rides the run event verbatim", () => {
  const root = makeFakeProject({ verdict: "FAIL", exitCode: 1 });
  const res = spawnSync(process.execPath, [path.join(root, "qa", "watch.mjs"), "--once", "--json"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 1, `expected exit 1, got ${res.status}\n${res.stdout}\n${res.stderr}`);
  const run = res.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.event === "run");
  assert.equal(run.verdict, "FAIL");
  const failStep = run.steps.find((s) => s.verdict === "FAIL");
  assert.equal(failStep.reason, "desktopTest failed\nFooTest > bar FAILED");
});

test("--once in human mode: the block carries the step table and the footer; no cursor-control escapes anywhere", () => {
  const root = makeFakeProject({ verdict: "PASS", exitCode: 0 });
  const res = spawnSync(process.execPath, [path.join(root, "qa", "watch.mjs"), "--once"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /✓ specCoverage PASS/);
  assert.ok(res.stdout.includes(FOOTER));
  // Greppable contract: no ESC sequences that would corrupt a piped read.
  assert.ok(!/\x1b\[/.test(res.stdout + res.stderr), "no ANSI escape codes in watch output");
});

test("--once with a STALE lane marker present does not wedge — stale means proceed", () => {
  const root = makeFakeProject({ verdict: "PASS", exitCode: 0 });
  const markerDir = path.join(root, "qa");
  fs.mkdirSync(markerDir, { recursive: true });
  const marker = path.join(markerDir, ".lane-in-progress");
  fs.writeFileSync(marker, "99999 2026-01-01T00:00:00.000Z\n");
  const old = new Date(Date.now() - LANE_MARKER_STALE_MS - 60_000);
  fs.utimesSync(marker, old, old);
  const res = spawnSync(process.execPath, [path.join(root, "qa", "watch.mjs"), "--once", "--json"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0, `stale marker must not block: ${res.stdout}\n${res.stderr}`);
  const events = res.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.event === "run"), "the pass ran");
});
