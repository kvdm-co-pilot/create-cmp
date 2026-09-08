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
