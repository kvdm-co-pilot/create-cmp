// The flight recorder (template/qa/lib/flight-recorder.mjs) and its reader
// (template/qa/retrospective.mjs) — the lane's append-only journal of its
// own runs, and the CLI that answers "did this project drift from its
// tooling?" from the journal alone.
//
// Contracts under test, with REAL files in REAL temp dirs (no fs mocking):
//   - entries carry the run's facts (profile, mode, verdict, rung, per-step
//     verdicts) and every SKIP reason VERBATIM
//   - append is one JSON line per run and NEVER throws — an unwritable
//     journal degrades to {ok:false, reason} for the lane to note
//   - the reader states only what the journal recorded: absent journal →
//     "no flight data recorded yet" + exit 0; malformed lines counted; a
//     short journal says it is short; one full run yields no invented
//     "stretch" arithmetic
//   - appending to qa/flight-recorder.jsonl never moves the receipt's
//     inputs hash (a lane output inside the hash would invalidate the very
//     receipt that produced it)
//   - verify.mjs wiring: the entry is appended AFTER the receipt, and a
//     failed append surfaces as a note in the lane's own output

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FLIGHT_JOURNAL_REL_PATH,
  FLIGHT_SCHEMA,
  appendFlightRecord,
  buildFlightEntry,
  readFlightJournal,
  renderFlightReport,
  summarizeFlightJournal,
  neverRunTiers,
} from "../template/qa/lib/flight-recorder.mjs";
import { computeInputsHash } from "../template/qa/lib/inputs-hash.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "flight-recorder-engine-"));

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const SKIP_REASON = "no Android device/emulator attached (adb) — instrumented behavior needs the real process boundary";

function sampleEntry(overrides = {}) {
  return buildFlightEntry({
    profile: "local",
    mode: "full",
    verdict: "PASS",
    evidenceLevel: { rung: "L1", name: "desktop" },
    steps: [
      { name: "build", verdict: "PASS", durationMs: 100 },
      { name: "unitTests", verdict: "PASS", durationMs: 200 },
      { name: "androidChecks", verdict: "SKIP", reason: SKIP_REASON, durationMs: 1 },
    ],
    sha: "abc123",
    durationMs: 301,
    onDeviceSteps: [],
    degraded: [],
    ...overrides,
  });
}

test("an entry records the run's facts, SKIP reasons verbatim, and nothing about the machine or user", () => {
  const e = sampleEntry({ degraded: ["ksp-cache-collision: cleared kspCaches and retried the Gradle step"] });
  assert.equal(e.schema, FLIGHT_SCHEMA);
  assert.equal(e.profile, "local");
  assert.equal(e.mode, "full");
  assert.equal(e.verdict, "PASS");
  assert.equal(e.evidenceRung, "L1");
  assert.equal(e.commit, "abc123");
  assert.deepEqual(e.steps.map((s) => s.name), ["build", "unitTests", "androidChecks"]);
  assert.deepEqual(e.skips, [{ step: "androidChecks", reason: SKIP_REASON }], "the SKIP reason is kept verbatim");
  assert.equal(e.degraded.length, 1);
  const serialized = JSON.stringify(e);
  assert.ok(!serialized.includes(os.hostname()), "no hostname in the journal");
  assert.ok(!serialized.includes(os.userInfo().username), "no username in the journal");
});

test("per-step durations ride into the journal (drive-narration N4) — and their absence stays honest", () => {
  const e = sampleEntry();
  assert.deepEqual(
    e.steps.map((s) => s.durationMs),
    [100, 200, 1],
    "the lane's own measured step times, verbatim — the source for 'usually ~Ns', never memory",
  );
  const bare = sampleEntry({ steps: [{ name: "build", verdict: "PASS" }] });
  assert.ok(!("durationMs" in bare.steps[0]), "an unmeasured step records no duration rather than a fabricated one");
});

test("a fast run and a FAILed run record no rung — the journal never borrows evidence", () => {
  const fast = sampleEntry({ mode: "fast", evidenceLevel: null });
  assert.equal(fast.evidenceRung, null);
  const failed = sampleEntry({ verdict: "FAIL", evidenceLevel: null });
  assert.equal(failed.evidenceRung, null);
});

test("append: one JSON line per run, appended in order; reads round-trip; malformed lines are counted", () => {
  const root = tmp();
  assert.ok(appendFlightRecord(root, sampleEntry()).ok);
  assert.ok(appendFlightRecord(root, sampleEntry({ mode: "fast", evidenceLevel: null })).ok);
  const raw = fs.readFileSync(path.join(root, FLIGHT_JOURNAL_REL_PATH), "utf8");
  assert.equal(raw.trim().split("\n").length, 2, "two runs, two lines");
  fs.appendFileSync(path.join(root, FLIGHT_JOURNAL_REL_PATH), "{{{ not json\n");
  const journal = readFlightJournal(root);
  assert.equal(journal.exists, true);
  assert.equal(journal.entries.length, 2);
  assert.equal(journal.malformed, 1);
  assert.equal(journal.entries[0].mode, "full");
  assert.equal(journal.entries[1].mode, "fast");
});

test("append never throws: an unwritable journal degrades to {ok:false, reason}", () => {
  const root = tmp();
  // qa exists as a FILE, so qa/flight-recorder.jsonl cannot be created.
  fs.writeFileSync(path.join(root, "qa"), "i am a file, not a directory\n");
  const res = appendFlightRecord(root, sampleEntry());
  assert.equal(res.ok, false);
  assert.ok(typeof res.reason === "string" && res.reason.length > 0, "the failure carries its reason for the lane to note");
});

test("summarize: mode/verdict counts, verbatim skip grouping, device reach, and the longest full-lane stretch", () => {
  const entries = [
    { ...sampleEntry({ mode: "full" }), at: "2026-08-01T10:00:00.000Z" },
    { ...sampleEntry({ mode: "fast", evidenceLevel: null }), at: "2026-08-02T10:00:00.000Z" },
    { ...sampleEntry({ mode: "fast", evidenceLevel: null }), at: "2026-08-03T10:00:00.000Z" },
    { ...sampleEntry({ mode: "full", verdict: "FAIL", evidenceLevel: null }), at: "2026-08-04T10:00:00.000Z" },
    {
      ...sampleEntry({
        mode: "full",
        evidenceLevel: { rung: "L2", name: "device" },
        onDeviceSteps: ["e2eSmoke", "androidChecks"],
        steps: [{ name: "build", verdict: "PASS", durationMs: 1 }],
      }),
      at: "2026-08-13T10:00:00.000Z",
    },
  ];
  const summary = summarizeFlightJournal(entries, { now: new Date("2026-08-20T10:00:00.000Z") });
  assert.equal(summary.total, 5);
  assert.equal(summary.byMode.full, 3);
  assert.equal(summary.byMode.fast, 2);
  assert.equal(summary.byVerdict.PASS, 4);
  assert.equal(summary.byVerdict.FAIL, 1);
  // Verbatim grouping: the same reason on the same step collapses into one
  // counted group, the reason text untouched.
  const group = summary.skipReasons.find((s) => s.step === "androidChecks");
  assert.equal(group.count, 4);
  assert.equal(group.reason, SKIP_REASON);
  assert.equal(summary.device.reachedRuns, 1, "device tier reached only where a device step actually PASSed");
  assert.equal(summary.device.highestRung, "L2");
  // Longest stretch with no full lane: Aug 4 → Aug 13 (9 days), not the
  // journal's edges and not distance-to-now.
  assert.equal(summary.fullRuns.count, 3);
  assert.equal(summary.fullRuns.longestGap.from, "2026-08-04T10:00:00.000Z");
  assert.equal(summary.fullRuns.longestGap.to, "2026-08-13T10:00:00.000Z");
  assert.equal(Math.round(summary.fullRuns.longestGap.ms / 86_400_000), 9);
});

test("honesty: one full run is a date, not a stretch; a short journal says it is short; zero full runs are named", () => {
  const one = summarizeFlightJournal([{ ...sampleEntry(), at: "2026-08-01T10:00:00.000Z" }], { now: new Date("2026-08-02T10:00:00.000Z") });
  assert.equal(one.fullRuns.longestGap, null, "no gap is invented from a single full run");
  assert.equal(one.short, true);
  const oneLines = renderFlightReport(one).join("\n");
  assert.match(oneLines, /only 1 run\(s\) recorded — the counts below are individual facts, not a trend/);
  assert.match(oneLines, /one full run recorded .* no stretch to measure/);

  const allFast = summarizeFlightJournal(
    [
      { ...sampleEntry({ mode: "fast", evidenceLevel: null }), at: "2026-08-01T10:00:00.000Z" },
      { ...sampleEntry({ mode: "fast", evidenceLevel: null }), at: "2026-08-02T10:00:00.000Z" },
    ],
    { now: new Date("2026-08-03T10:00:00.000Z") },
  );
  const allFastLines = renderFlightReport(allFast).join("\n");
  assert.match(allFastLines, /full lane: never recorded — every recorded run was --fast/);
  assert.match(allFastLines, /device tier: never reached in any recorded run/);
});

test("the report prints the verbatim skip reasons and the malformed-line count", () => {
  const summary = summarizeFlightJournal(
    [
      { ...sampleEntry(), at: "2026-08-01T10:00:00.000Z" },
      { ...sampleEntry(), at: "2026-08-02T10:00:00.000Z" },
    ],
    { now: new Date("2026-08-03T10:00:00.000Z") },
  );
  const lines = renderFlightReport(summary, { malformed: 3 }).join("\n");
  assert.match(lines, /2 lane run\(s\) recorded/);
  assert.match(lines, /3 line\(s\) could not be parsed and are not counted/);
  assert.ok(lines.includes(`2× [androidChecks] ${SKIP_REASON}`), "skip reasons appear verbatim, grouped with counts");
});

// The reader CLI, run exactly as a stamped app runs it: the real files
// copied into a project-shaped temp dir (retrospective.mjs resolves its
// project root from its own location, like every qa/ CLI).
function makeCliProject() {
  const root = tmp();
  for (const rel of ["qa/retrospective.mjs", "qa/lib/flight-recorder.mjs"]) {
    write(root, rel, fs.readFileSync(path.join(REPO_ROOT, "template", rel), "utf8"));
  }
  return root;
}

test("retrospective CLI: absent journal → 'no flight data recorded yet', exit 0 — never an error, never a fabricated baseline", () => {
  const root = makeCliProject();
  const out = execFileSync(process.execPath, ["qa/retrospective.mjs"], { cwd: root, encoding: "utf8" });
  assert.match(out, /no flight data recorded yet/);
});

test("retrospective CLI: with a journal it reports counts and verbatim reasons from the journal alone", () => {
  const root = makeCliProject();
  appendFlightRecord(root, sampleEntry());
  appendFlightRecord(root, sampleEntry({ mode: "fast", evidenceLevel: null }));
  const out = execFileSync(process.execPath, ["qa/retrospective.mjs"], { cwd: root, encoding: "utf8" });
  assert.match(out, /2 lane run\(s\) recorded/);
  assert.match(out, /1 full · 1 fast/);
  assert.ok(out.includes(SKIP_REASON), "the verbatim skip reason reaches the human");
  assert.match(out, /individual facts, not a trend/, "a short journal says so");
});

test("appending to the journal never moves the receipt's inputs hash", () => {
  const root = tmp();
  write(root, "composeApp/src/commonMain/kotlin/Main.kt", "fun main() {}\n");
  write(root, "qa/verify.mjs", "// lane stub\n");
  write(root, "specs/app-base.spec.md", "## [BASE-01] clause\n");
  const before = computeInputsHash(root).hash;
  assert.ok(appendFlightRecord(root, sampleEntry()).ok);
  assert.equal(computeInputsHash(root).hash, before, "the journal is a lane output — hashing it would make every run invalidate its own receipt");
});

test("lane wiring: the entry is appended AFTER the receipt is written, and a failed append is noted, not fatal", () => {
  const verify = fs.readFileSync(path.join(REPO_ROOT, "template", "qa", "verify.mjs"), "utf8");
  const receiptWrite = verify.indexOf('fs.writeFileSync(path.join(EVIDENCE_DIR, "latest.json")');
  const flightAppend = verify.indexOf("appendFlightRecord(");
  assert.ok(receiptWrite > 0 && flightAppend > receiptWrite, "the journal entry records the final verdict — appended after the receipt");
  assert.match(verify, /flight recorder: journal append failed/, "a failed append surfaces in the lane's own output");
  assert.match(verify, /lane verdict is unaffected/, "and says the lane result stands");
  assert.match(verify, /DEGRADED_PATHS\.push\("ksp-cache-collision/, "the KSP self-heal is journaled as a degraded path");
  assert.match(verify, /DEGRADED_PATHS\.push\("affected-test filter matched no tests/, "the affected-filter fallback is journaled as a degraded path");
});

// ── The watch exemption ─────────────────────────────────────────────────────
// qa/watch.mjs runs the fast lane on EVERY SAVE. Journaling those would add
// hundreds of lines a day to a committed file and leave the tree permanently
// dirty inside the loop the recorder exists to observe — the same rule the
// README evidence badge follows: the inner loop does not write to committed
// files. These pin the wiring AND the disclosure, because an undisclosed gap
// in a census is a lie.
test("watch mode passes --no-journal, so save-triggered runs are never journaled", () => {
  const watch = fs.readFileSync(new URL("../template/qa/watch.mjs", import.meta.url), "utf8");
  const spawnLine = watch.split("\n").find((l) => l.includes('"qa", "verify.mjs"'));
  assert.ok(spawnLine, "watch.mjs must spawn verify.mjs");
  assert.match(spawnLine, /--fast/);
  assert.match(spawnLine, /--no-journal/, "the inner loop must not append to the committed journal");
});

test("the lane honours --no-journal by skipping the append, not by faking one", () => {
  const verify = fs.readFileSync(new URL("../template/qa/verify.mjs", import.meta.url), "utf8");
  assert.match(verify, /const noJournal = args\.includes\("--no-journal"\)/);
  // The guard must short-circuit the append itself — not write a placeholder
  // entry, which would put a run in the journal that never happened.
  assert.match(verify, /noJournal\s*\n?\s*\?\s*\{ ok: true, skipped: true \}/);
});

test("the report DISCLOSES the watch gap rather than presenting a partial census as whole", () => {
  const lines = renderFlightReport(
    summarizeFlightJournal([
      buildFlightEntry({ profile: "local", mode: "full", verdict: "PASS", steps: [], sha: "a".repeat(40), durationMs: 1 }),
      buildFlightEntry({ profile: "local", mode: "fast", verdict: "PASS", steps: [], sha: "b".repeat(40), durationMs: 1 }),
    ]),
  );
  const joined = lines.join("\n");
  assert.match(joined, /modes:/);
  assert.match(joined, /deliberate runs only/, "the fast count must not read as a complete census");
  assert.match(joined, /watch\.mjs/, "and it must name what is missing");
});

// The retrospective's skip grouping did not group: the approvals gate ends its
// reason with a variable list of artifact names, so ONE recurring reason
// rendered as seven near-identical rows the reader had to add up by eye.
// Group on the first line — which is what the report prints.
test("skip grouping keys on the reason's FIRST LINE, so a variable tail does not split one problem into seven rows", () => {
  const mk = (tail) => ({
    ...sampleEntry({ mode: "full" }),
    steps: [{ name: "approvals", verdict: "SKIP" }],
    skips: [{ step: "approvals", reason: `governed artifacts await review — the lane cannot attest them:\n${tail}` }],
  });
  const entries = [mk("design-system"), mk("design-system, components"), mk("feature-brief:meal"), mk("design-system, components, specs")];
  const summary = summarizeFlightJournal(entries, { now: new Date("2026-09-02T10:00:00.000Z") });
  const rows = summary.skipReasons.filter((s) => s.step === "approvals");
  assert.equal(rows.length, 1, "one problem, one row");
  assert.equal(rows[0].count, 4);
  assert.equal(rows[0].reason, "governed artifacts await review — the lane cannot attest them:");
});

// A tier that has never run here. A single SKIP is a fact; skipping every
// recorded run is a different fact, and only the journal can tell them apart.
test("neverRunTiers: PLANTED — e2eSmoke skipped in every recorded full run is named; a tier that ran once is not", () => {
  const skip = { name: "e2eSmoke", verdict: "SKIP", reason: "maestro CLI not installed — curl -fsSL https://get.maestro.mobile.dev | bash" };
  const full = (steps) => ({ ...sampleEntry({ mode: "full" }), steps });
  const journal = Array.from({ length: 37 }, () => full([{ name: "build", verdict: "PASS" }, { name: "e2eSmoke", verdict: "SKIP" }]));
  const never = neverRunTiers([skip], journal);
  assert.equal(never.length, 1);
  assert.equal(never[0].name, "e2eSmoke");
  assert.equal(never[0].runs, 37);
  assert.match(never[0].reason, /maestro CLI not installed/);
  // One PASS anywhere in the history and it is not "never" — it is "not lately".
  const ranOnce = [...journal, full([{ name: "e2eSmoke", verdict: "PASS" }])];
  assert.equal(neverRunTiers([skip], ranOnce).length, 0);
});

test("neverRunTiers: below the floor, 'every time' is a coincidence — two skips name nothing; fast runs never count", () => {
  const skip = { name: "e2eSmoke", verdict: "SKIP", reason: "no device" };
  const full = (steps) => ({ ...sampleEntry({ mode: "full" }), steps });
  const fast = (steps) => ({ ...sampleEntry({ mode: "fast", evidenceLevel: null }), steps });
  assert.equal(neverRunTiers([skip], [full([{ name: "e2eSmoke", verdict: "SKIP" }]), full([{ name: "e2eSmoke", verdict: "SKIP" }])]).length, 0);
  const fastOnly = Array.from({ length: 10 }, () => fast([{ name: "e2eSmoke", verdict: "SKIP" }]));
  assert.equal(neverRunTiers([skip], fastOnly).length, 0, "the inner loop skips the device tier by design");
  assert.equal(neverRunTiers([{ name: "build", verdict: "PASS" }], fastOnly).length, 0, "a step that PASSed this run is not asked");
});
