// The determinism probe's comparison half (template/qa/lib/determinism.mjs)
// and its lane wiring (template/qa/verify.mjs --determinism).
//
// Contracts under test, with REAL files in REAL temp dirs (no fs mocking):
//   - the JUnit parse reads verdicts and failure output, NEVER durations —
//     two runs differing only in time="…" attributes compare as identical
//   - a verdict flip is reported naming the test, the OWNING LANE STEP, and
//     the observable difference under both timezone labels — never a bare
//     "nondeterministic"
//   - identical failures under both legs are NOT a difference (deterministic
//     red is the owning test step's problem, not the probe's)
//   - a test that executed in only one leg is a difference
//   - the probe's timezones are 26 hours apart (UTC-12 / UTC+14), so the two
//     legs can never share a calendar date — the property the probe's power
//     rests on
//   - verify.mjs wiring: the flag is recognized, refused with --fast and
//     with non-ci profiles, opt-in (SKIP) inside ci, and both legs force
//     --rerun so Gradle cannot replay leg one's results into leg two

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// S8b: the lane is TWO files now — qa/verify.mjs (the spine) and
// qa/lib/profiles/cmp/steps-cmp.mjs (the step pack). A structural read of "the lane's
// source" must see both, or it pins a file that no longer holds the steps.
const laneSrc = (dir) =>
  `${fs.readFileSync(path.join(dir, "qa/verify.mjs"), "utf8")}\n${fs.readFileSync(path.join(dir, "qa/lib/profiles/cmp/steps-cmp.mjs"), "utf8")}`;


import {
  DETERMINISM_TIMEZONES,
  compareOutcomes,
  laneStepForTestClass,
  parseJUnitOutcomes,
  reportFormatProblem,
} from "../template/qa/lib/determinism.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "determinism-engine-"));

function writeResults(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, xml] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), xml);
  }
}

const suiteXml = (cases) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="s" tests="${cases.length}" skipped="0" failures="0" errors="0" timestamp="2026-08-20T01:02:03" time="1.234">\n${cases.join("\n")}\n</testsuite>\n`;

const passCase = (cls, name, time) => `  <testcase name="${name}" classname="${cls}" time="${time}"/>`;
const failCase = (cls, name, time, message, body = "stack\n  at Foo.kt:12") =>
  `  <testcase name="${name}" classname="${cls}" time="${time}">\n    <failure message="${message}" type="org.opentest4j.AssertionFailedError">${body}</failure>\n  </testcase>`;
const skipCase = (cls, name, time) => `  <testcase name="${name}" classname="${cls}" time="${time}">\n    <skipped/>\n  </testcase>`;

/**
 * The cmp pack's own attribution, mirrored here so these tests exercise the
 * same mapping the lane does. It lives in profiles/cmp/steps-cmp.mjs, and the
 * final assertion below pins that this copy has not drifted from it.
 */
const CMP_ATTRIBUTION = (classname) => {
  if (/GoldenTreeTest$/.test(classname)) return "goldenTrees";
  if (/ArchitectureConformanceTest$/.test(classname)) return "conformance";
  if (/A11yConformanceTest$/.test(classname)) return "a11y";
  return "unitTests";
};

test("probe timezones: 26 hours apart, so the two legs never share a calendar date", () => {
  assert.equal(DETERMINISM_TIMEZONES.length, 2);
  const [a, b] = DETERMINISM_TIMEZONES;
  // POSIX Etc/GMT sign inversion: Etc/GMT+12 is UTC-12, Etc/GMT-14 is UTC+14.
  assert.equal(a.tz, "Etc/GMT+12");
  assert.equal(b.tz, "Etc/GMT-14");
  // The property itself, checked mechanically at a few arbitrary instants:
  // the two zones' local dates always differ (offset spread 26h > 24h).
  for (const iso of ["2026-08-20T00:00:00Z", "2026-08-20T09:59:00Z", "2026-08-20T12:00:00Z", "2026-08-20T23:59:00Z"]) {
    const at = new Date(iso);
    const dayIn = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "short" }).format(at);
    assert.notEqual(dayIn(a.tz), dayIn(b.tz), `legs share a date at ${iso}`);
  }
});

test("parse: verdicts and failure text come out; time attributes are never part of the outcome", () => {
  const dir = tmp();
  writeResults(dir, {
    "TEST-com.acme.HomeViewModelTest.xml": suiteXml([
      passCase("com.acme.HomeViewModelTest", "loads items", "0.101"),
      failCase("com.acme.HomeViewModelTest", "formats the date", "0.202", "expected &lt;2026-08-20&gt; but was &lt;2026-08-21&gt;"),
      skipCase("com.acme.HomeViewModelTest", "ignored one", "0.001"),
    ]),
  });
  const outcomes = parseJUnitOutcomes(dir, { format: "junit-xml" });
  assert.equal(outcomes["com.acme.HomeViewModelTest.loads items"].status, "pass");
  const failed = outcomes["com.acme.HomeViewModelTest.formats the date"];
  assert.equal(failed.status, "fail");
  assert.equal(failed.messages[0], "expected <2026-08-20> but was <2026-08-21>", "failure message is unescaped and kept verbatim");
  assert.equal(outcomes["com.acme.HomeViewModelTest.ignored one"].status, "skip");
  // No outcome field carries the duration at all.
  for (const o of Object.values(outcomes)) assert.ok(!("time" in o) && !("durationMs" in o));
});

test("duration-only differences are NOT differences: identical suites with different times compare clean", () => {
  const a = tmp();
  const b = tmp();
  const mk = (t1, t2) => ({
    "TEST-com.acme.HomeGoldenTreeTest.xml": suiteXml([
      passCase("com.acme.HomeGoldenTreeTest", "home renders", t1),
      failCase("com.acme.HomeGoldenTreeTest", "empty state renders", t2, "golden mismatch at node 3"),
    ]),
  });
  writeResults(a, mk("0.100", "0.900"));
  writeResults(b, mk("7.777", "0.001")); // wildly different timings, same verdicts, same failure text
  const diffs = compareOutcomes(parseJUnitOutcomes(a, { format: "junit-xml" }), parseJUnitOutcomes(b, { format: "junit-xml" }), "TZ=A", "TZ=B", CMP_ATTRIBUTION);
  assert.deepEqual(diffs, [], "a timing wobble must not register as nondeterminism");
});

test("a verdict flip names the test, the owning lane step, both legs, and the failure line", () => {
  const a = tmp();
  const b = tmp();
  writeResults(a, {
    "TEST-com.acme.HomeGoldenTreeTest.xml": suiteXml([passCase("com.acme.HomeGoldenTreeTest", "home renders today header", "0.1")]),
  });
  writeResults(b, {
    "TEST-com.acme.HomeGoldenTreeTest.xml": suiteXml([
      failCase("com.acme.HomeGoldenTreeTest", "home renders today header", "0.1", "expected 'Aug 20' but was 'Aug 21'"),
    ]),
  });
  const diffs = compareOutcomes(parseJUnitOutcomes(a, { format: "junit-xml" }), parseJUnitOutcomes(b, { format: "junit-xml" }), "TZ=Etc/GMT+12 (UTC-12)", "TZ=Etc/GMT-14 (UTC+14)", CMP_ATTRIBUTION);
  assert.equal(diffs.length, 1);
  const d = diffs[0];
  assert.equal(d.kind, "verdict-flip");
  assert.equal(d.step, "goldenTrees", "the diff names the lane step that owns golden tests");
  assert.equal(d.test, "com.acme.HomeGoldenTreeTest.home renders today header");
  assert.match(d.detail, /PASS under TZ=Etc\/GMT\+12 \(UTC-12\)/);
  assert.match(d.detail, /FAIL under TZ=Etc\/GMT-14 \(UTC\+14\)/);
  assert.match(d.detail, /expected 'Aug 20' but was 'Aug 21'/, "the observable difference is in the message");
});

test("identical failures under both legs are deterministic — no difference reported", () => {
  const a = tmp();
  const b = tmp();
  const mk = () => ({
    "TEST-com.acme.FooTest.xml": suiteXml([failCase("com.acme.FooTest", "broken thing", "0.5", "expected 4 but was 5")]),
  });
  writeResults(a, mk());
  writeResults(b, mk());
  assert.deepEqual(compareOutcomes(parseJUnitOutcomes(a, { format: "junit-xml" }), parseJUnitOutcomes(b, { format: "junit-xml" }), "TZ=A", "TZ=B", CMP_ATTRIBUTION), []);
});

test("failing in both legs with DIFFERENT output is a difference (a date in the message is still a leak)", () => {
  const a = tmp();
  const b = tmp();
  writeResults(a, { "TEST-com.acme.FooTest.xml": suiteXml([failCase("com.acme.FooTest", "boundary", "0.5", "expected day 2026-08-19")]) });
  writeResults(b, { "TEST-com.acme.FooTest.xml": suiteXml([failCase("com.acme.FooTest", "boundary", "0.5", "expected day 2026-08-21")]) });
  const diffs = compareOutcomes(parseJUnitOutcomes(a, { format: "junit-xml" }), parseJUnitOutcomes(b, { format: "junit-xml" }), "TZ=A", "TZ=B", CMP_ATTRIBUTION);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "failure-text-changed");
  assert.match(diffs[0].detail, /2026-08-19/);
  assert.match(diffs[0].detail, /2026-08-21/);
});

test("a test that executed in only one leg is a difference, attributed to its step", () => {
  const a = tmp();
  const b = tmp();
  writeResults(a, {
    "TEST-com.acme.BarTest.xml": suiteXml([
      passCase("com.acme.BarTest", "stable one", "0.1"),
      passCase("com.acme.BarTest", "date-gated one", "0.1"),
    ]),
  });
  writeResults(b, { "TEST-com.acme.BarTest.xml": suiteXml([passCase("com.acme.BarTest", "stable one", "0.1")]) });
  const diffs = compareOutcomes(parseJUnitOutcomes(a, { format: "junit-xml" }), parseJUnitOutcomes(b, { format: "junit-xml" }), "TZ=A", "TZ=B", CMP_ATTRIBUTION);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].kind, "only-in-one-leg");
  assert.equal(diffs[0].step, "unitTests");
  assert.match(diffs[0].detail, /no result under TZ=B/);
});

test("lane-step attribution is the PROFILE'S — the core supplies no names of its own", () => {
  // This mapping used to live in qa/lib/determinism.mjs, and compareOutcomes
  // called it unconditionally: three of its four answers exist only in the cmp
  // pack, so ANY profile reusing the core's determinism comparison got another
  // stack's step names stamped onto its diffs. Handed the profile's mapping the
  // answers are the same as they always were.
  assert.equal(laneStepForTestClass("com.acme.HomeGoldenTreeTest", CMP_ATTRIBUTION), "goldenTrees");
  assert.equal(laneStepForTestClass("com.acme.ArchitectureConformanceTest", CMP_ATTRIBUTION), "conformance");
  assert.equal(laneStepForTestClass("com.acme.A11yConformanceTest", CMP_ATTRIBUTION), "a11y");
  assert.equal(laneStepForTestClass("com.acme.HomeViewModelTest", CMP_ATTRIBUTION), "unitTests");

  // Handed nothing, it answers NOTHING. An honest absence, not a borrowed name.
  assert.equal(laneStepForTestClass("com.acme.HomeGoldenTreeTest"), null);
  assert.equal(laneStepForTestClass("whatever.AnythingAtAll"), null);

  // And the mapping the cmp pack actually ships is the one asserted above.
  const packSrc = fs.readFileSync(path.join(REPO_ROOT, "template/qa/lib/profiles/cmp/steps-cmp.mjs"), "utf8");
  for (const name of ["goldenTrees", "conformance", "a11y", "unitTests"]) {
    assert.match(packSrc, new RegExp(`return "${name}"`), `the cmp pack owns the "${name}" attribution`);
  }
});

test("verify.mjs wiring: opt-in in ci, refused combinations, --rerun on both legs, no receipt from a bare probe", () => {
  const verify = laneSrc(path.join(REPO_ROOT, "template"));
  // Recognized and documented.
  assert.match(verify, /"--determinism"/, "flag is a recognized argument");
  assert.match(verify, /--determinism {2,}.*run the timezone determinism probe|--determinism\s+run the timezone determinism probe/s, "USAGE documents the flag");
  // Never in --fast; never in profiles that don't own the row.
  assert.match(verify, /determinism && fast/, "the --fast combination is refused up front");
  assert.match(verify, /profile !== "ci" && profile !== "release"/, "non-ci profiles are refused by name");
  // The row belongs to ci (release inherits) — and local stays without it.
  assert.match(verify, /stepsForProfile\.ci = \[\.\.\.stepsForProfile\.local, stepDeterminism\]/, "ci = local + the probe's row");
  // The step is opt-in: without the flag it SKIPs with the pointer.
  assert.match(verify, /determinism probe is opt-in/, "SKIP reason names the opt-in");
  // Both legs force execution — Gradle must not replay leg one into leg two.
  // (RERUN is the mode-scoped flag; the --fast refusal above guarantees it
  // resolves to " --rerun" whenever a leg actually runs.)
  assert.match(verify, /desktopTest\$\{RERUN\} --console=plain`, \{ env: \{ \.\.\.process\.env, TZ: tz \} \}/, "legs run with the rerun flag and TZ through the child env");
  // A bare probe run must never mint a receipt.
  assert.match(verify, /determinism && !profileExplicit/, "bare --determinism has its own branch");
  assert.match(verify, /NO receipt/, "the probe-only branch states the no-receipt rule");
});

test("the report format is DECLARED: undeclared or unsupported is a refusal by name, never an empty outcome map", () => {
  // Until 2026-09-08 the parser assumed JUnit XML and returned {} for anything
  // else — an empty leg that read as "no tests". PATTERN: JUnit XML as the
  // lingua franca, declared by the profile. What this pins is the silent {}:
  // it is now a throw with the missing declaration named.
  //
  // The EXAMPLE of an unsupported format moved on 2026-09-09: `tap` used to be
  // one and is now readable, along with `ctrf`. The property is untouched —
  // what is pinned is that a format the core cannot read is named, not that any
  // particular format is missing. `trx` (the .NET runner's) stands in, and will
  // be replaced the day someone writes that parser.
  assert.match(reportFormatProblem(undefined) ?? "", /declares no `reports`/);
  assert.match(reportFormatProblem({ format: "trx" }) ?? "", /not one the core can read/);
  assert.equal(reportFormatProblem({ format: "junit-xml" }), null);
  for (const readable of ["tap", "ctrf"]) assert.equal(reportFormatProblem({ format: readable }), null);
  assert.throws(() => parseJUnitOutcomes("/nonexistent"), /declares no `reports`|reports\.format/);
});
