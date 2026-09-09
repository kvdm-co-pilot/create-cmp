// TAP AND CTRF — the second and third formats the core can read.
//
// Both were named as "next" beside REPORT_FORMATS for months, and a profile
// declaring either got a refusal saying a parser was its own change. These are
// those parsers, and every test here exists to hold ONE line: read only
// verdict-bearing content.
//
// That is not fastidiousness. The determinism probe runs a suite twice and
// reports every test whose outcome differs; a parser that let a duration
// through would make the second run differ from the first by construction, and
// the probe would report its own noise as the stack's defect — while a genuine
// timezone flip sat in the same list, indistinguishable.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REPORT_FORMATS,
  compareOutcomes,
  parseCtrfReport,
  parseReportOutcomes,
  parseTapStream,
  reportFormatProblem,
} from "../packages/harness/src/lib/determinism.mjs";

const dirWith = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reports-"));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(root, name), body);
  return root;
};

test("both formats are declarable, and an undeclared one is still refused BY NAME", () => {
  assert.deepEqual([...REPORT_FORMATS], ["junit-xml", "tap", "ctrf"]);
  assert.equal(reportFormatProblem({ format: "tap" }), null);
  assert.equal(reportFormatProblem({ format: "ctrf" }), null);
  assert.match(reportFormatProblem({ format: "trx" }), /is not one the core can read/);
  assert.match(reportFormatProblem(null), /declares no `reports`/);
});

test("TAP: a duration changes nothing — not in the key, not in the messages", () => {
  // The property the probe rests on. Same verdicts, different timings.
  const a = parseTapStream("1..2\nok 1 - adds # time=12ms\nnot ok 2 - subtracts\n  ---\n  message: expected 2 got 3\n  duration_ms: 4.2\n  ...\n");
  const b = parseTapStream("1..2\nok 1 - adds # time=987ms\nnot ok 2 - subtracts\n  ---\n  message: expected 2 got 3\n  duration_ms: 91.7\n  ...\n");
  assert.deepEqual(a, b, "two runs differing only in duration must produce identical outcome maps");
  assert.deepEqual(compareOutcomes(a, b, "TZ=A", "TZ=B", () => "unit"), []);
  assert.deepEqual(Object.keys(a), ["adds", "subtracts"], "the `# time=` trailer must never reach a key");
});

test("TAP: directives decide the status, because that is TAP's own semantics", () => {
  const o = parseTapStream("ok 1 - ran it\nnot ok 2 - known bug # TODO fix me\nok 3 - platform only # SKIP not here\nnot ok 4 - broke\n");
  assert.equal(o["ran it"].status, "pass");
  assert.equal(o["known bug"].status, "skip", "a TODO failure is an EXPECTED one — reading it as a fail breaks a passing suite");
  assert.equal(o["platform only"].status, "skip");
  assert.equal(o["broke"].status, "fail");
});

test("TAP: the number is not part of the identity — reordering is not a change", () => {
  const first = parseTapStream("ok 1 - alpha\nok 2 - beta\n");
  const second = parseTapStream("ok 1 - beta\nok 2 - alpha\n");
  assert.deepEqual(compareOutcomes(first, second, "TZ=A", "TZ=B", () => "unit"), [], "positional numbering must not read as every test changing");
});

test("TAP: two tests with one name are disambiguated rather than collapsed", () => {
  // The JUnit parser's original defect, one format over: last-write-wins made
  // a whole class collapse onto one key and a real flip vanish.
  const o = parseTapStream("ok 1 - same\nnot ok 2 - same\n");
  assert.deepEqual(Object.keys(o), ["same", "same #2"]);
  assert.equal(o["same"].status, "pass");
  assert.equal(o["same #2"].status, "fail");
});

test("CTRF: every status maps, and an UNKNOWN one is an error, never a pass", () => {
  const o = parseCtrfReport(
    JSON.stringify({
      results: {
        tests: [
          { name: "a", status: "passed", duration: 10 },
          { name: "b", status: "failed", message: "boom", duration: 20 },
          { name: "c", status: "skipped" },
          { name: "d", status: "pending" },
          { name: "e", status: "invented-tomorrow" },
        ],
      },
    }),
  );
  assert.equal(o.a.status, "pass");
  assert.equal(o.b.status, "fail");
  assert.equal(o.c.status, "skip");
  assert.equal(o.d.status, "skip", "pending means it did not run");
  assert.equal(o.e.status, "error", '"I do not know what this means" is not "it passed"');
});

test("CTRF: durations and timestamps are invisible, and the suite keys like JUnit's classname", () => {
  const one = parseCtrfReport(JSON.stringify({ results: { summary: { start: 1, stop: 2 }, tests: [{ name: "t", suite: "math", status: "passed", duration: 5, start: 1, stop: 6 }] } }));
  const two = parseCtrfReport(JSON.stringify({ results: { summary: { start: 9, stop: 99 }, tests: [{ name: "t", suite: "math", status: "passed", duration: 400, start: 9, stop: 409 }] } }));
  assert.deepEqual(one, two);
  assert.deepEqual(Object.keys(one), ["math.t"], "suite.name mirrors JUnit's classname.name so both formats key the same test the same way");
});

test("CTRF: a corrupt document reads as EMPTY, and the caller's rule turns that into a refusal", () => {
  assert.deepEqual(parseCtrfReport("{not json"), {});
  // The honest chain: empty here, and the probe treats an empty leg as a
  // refusal rather than a pass — so an unreadable report can never be green.
});

test("the dispatcher reads the DECLARED format, and refuses one it cannot", () => {
  const tap = dirWith({ "results.tap": "ok 1 - alpha\nnot ok 2 - beta\n" });
  const ctrf = dirWith({ "report.json": JSON.stringify({ results: { tests: [{ name: "gamma", status: "passed" }] } }) });
  try {
    assert.deepEqual(Object.keys(parseReportOutcomes(tap, { format: "tap" })), ["alpha", "beta"]);
    assert.deepEqual(Object.keys(parseReportOutcomes(ctrf, { format: "ctrf" })), ["gamma"]);
    assert.deepEqual(parseReportOutcomes(tap, { format: "ctrf" }), {}, "the wrong declared format finds nothing rather than guessing");
    assert.throws(() => parseReportOutcomes(tap, { format: "trx" }), /is not one the core can read/);
    assert.deepEqual(parseReportOutcomes(path.join(tap, "nope"), { format: "tap" }), {}, "an absent directory is empty, never a throw");
  } finally {
    for (const d of [tap, ctrf]) fs.rmSync(d, { recursive: true, force: true });
  }
});

// ── MEETING A REAL RUNNER ───────────────────────────────────────────────────
//
// Everything above was written from the format specs. §8.8 counts "adversarial
// input the fix was not written against" among its terminators, and names the
// score: eight wrong verdicts this year found by executing in an ecosystem the
// code had never met, and NONE by reading it.
//
// So the parser was pointed at Node's own `--test-reporter=tap` — a real
// producer, already installed, emitting a stream nobody here authored. It found
// two defects in minutes, and neither was visible in the spec:
//
//   1. EVERY FAILURE MESSAGE WAS LOST. The parser read `message:`, which is what
//      the TAP spec's examples show. Node writes the failure text under
//      `error:` as a BLOCK SCALAR. So every failing test parsed with no
//      messages, and `compareOutcomes`'s "failed under both, with different
//      output" — a whole determinism-leak class — could never fire for the most
//      widely available TAP producer there is.
//   2. NESTED SUBTESTS TOOK THE WRONG PARENT. TAP emits a parent's `ok` AFTER
//      its children, so a stack built from result lines makes the previous
//      SIBLING the parent. Children came out under the test before them.
test("a real runner's TAP: failure text survives, because that is what a determinism leak IS", () => {
  // Node's shape, verbatim — block scalar and all.
  const real = [
    "TAP version 13",
    "# Subtest: a real failure",
    "not ok 1 - a real failure",
    "  ---",
    "  duration_ms: 1.23",
    "  location: '/abs/path/that/must/not/be/read.mjs:10:11'",
    "  failureType: 'testCodeFailure'",
    "  error: |-",
    "    Expected values to be strictly equal:",
    "",
    "    'a' !== 'b'",
    "  code: 'ERR_ASSERTION'",
    "  ...",
    "1..1",
  ].join("\n");
  const o = parseTapStream(real);
  const entry = o["a real failure"];
  assert.equal(entry.status, "fail");
  assert.ok(entry.messages.length > 0, "a failure with no message makes 'failed differently' unobservable");
  assert.ok(
    entry.messages.some((msg) => /Expected values to be strictly equal/.test(msg)),
    `the block scalar's text must reach the outcome: ${JSON.stringify(entry.messages)}`,
  );
  assert.ok(!entry.messages.some((msg) => /duration_ms|1\.23/.test(msg)), "time is never verdict-bearing");
  assert.ok(!entry.messages.some((msg) => /\/abs\/path/.test(msg)), "an absolute path would differ per machine");
});

test("a real runner's TAP: two runs that fail DIFFERENTLY are caught — the class the lost messages hid", () => {
  const withError = (text) =>
    parseTapStream(["# Subtest: t", "not ok 1 - t", "  ---", "  error: |-", `    ${text}`, "  ...", "1..1"].join("\n"));
  const diffs = compareOutcomes(withError("'a' !== 'b'"), withError("'a' !== 'c'"), "TZ=A", "TZ=B", () => "unit");
  assert.equal(diffs.length, 1, "the same test failing with different output is a finding, not a match");
  assert.equal(diffs[0].kind, "failure-text-changed");
});

test("a real runner's TAP: a nested subtest is keyed by its REAL parent, not the test before it", () => {
  const real = [
    "TAP version 13",
    "# Subtest: alpha",
    "ok 1 - alpha",
    "# Subtest: parent",
    "    # Subtest: child",
    "    ok 1 - child",
    "    1..1",
    "ok 2 - parent",
    "1..2",
  ].join("\n");
  const keys = Object.keys(parseTapStream(real));
  assert.ok(keys.includes("parent > child"), `child must carry its real parent: ${JSON.stringify(keys)}`);
  assert.ok(!keys.includes("alpha > child"), "the previous SIBLING is not the parent — TAP emits a parent's result AFTER its children");
  assert.ok(keys.includes("alpha") && keys.includes("parent"));
});

test("a real runner's TAP: same-named children under different parents do not collide", () => {
  // Why the path matters rather than the bare name: a positional `#2` suffix
  // would move if the parents ran in a different order, reintroducing exactly
  // the ordering sensitivity the bare test number was excluded to avoid.
  const stream = (first, second) =>
    parseTapStream(
      [
        `# Subtest: ${first}`,
        "    # Subtest: works",
        "    ok 1 - works",
        `ok 1 - ${first}`,
        `# Subtest: ${second}`,
        "    # Subtest: works",
        "    ok 1 - works",
        `ok 2 - ${second}`,
      ].join("\n"),
    );
  const ab = stream("alpha", "beta");
  assert.deepEqual(
    Object.keys(ab).filter((k) => k.includes("works")).sort(),
    ["alpha > works", "beta > works"],
  );
  // Run the parents the other way round: the same two tests, same two keys.
  const ba = stream("beta", "alpha");
  assert.deepEqual(compareOutcomes(ab, ba, "TZ=A", "TZ=B", () => "unit"), [], "reordering parents is not a change");
});
