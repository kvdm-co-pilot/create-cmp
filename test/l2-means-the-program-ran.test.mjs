// THE RUNG'S OWN CLAIM, MADE FALSIFIABLE.
//
// `l2Execution` is a list of step names a profile author writes, and until this
// instrument existed nothing ever asked whether those steps DO what the rung
// says. The defect that motivated it is real and named in the contract: a
// Python adopter earned L2 with an integration suite that imported the app and
// called its functions — named, running, green, and never once a program.
//
// The discrimination is: break STARTUP in a way that still COMPILES, run the
// lane twice, and require BOTH halves. An L1 step must stay green (it cannot see
// a crash at launch), an L2 step must go red (it starts the program). A plant
// that reddens everything broke the build and measured nothing; one that reddens
// nothing is the overclaim.
//
// These tests drive the JUDGEMENT with receipts written by hand, because the
// judgement is the part that must be right and it is pure. Feeding it two REAL
// receipts costs an emulator and belongs to the device tier; nothing here
// pretends to be that run.
import { test } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assessLadderPlant, describeLadderPlant } from "../packages/harness/src/lib/ladder-plant.mjs";
import { startupPlant } from "../packages/harness/src/lib/profiles/cmp/plants.mjs";
import { CMP_LADDER } from "../packages/harness/src/lib/profiles/cmp/ladder.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LADDER = { l1Required: ["releaseBuild", "conformance"], l2Execution: ["e2eSmoke", "androidChecks"] };
const receipt = (verdicts) => ({ steps: Object.entries(verdicts).map(([name, verdict]) => ({ name, verdict })) });

const ALL_GREEN = receipt({ releaseBuild: "PASS", conformance: "PASS", e2eSmoke: "PASS", androidChecks: "PASS" });

test("the shape it exists to bless: L1 blind, L2 caught it", () => {
  const r = assessLadderPlant({
    before: ALL_GREEN,
    after: receipt({ releaseBuild: "PASS", conformance: "PASS", e2eSmoke: "FAIL", androidChecks: "FAIL" }),
    ladder: LADDER,
  });
  assert.equal(r.ok, true, r.reason ?? "");
  assert.deepEqual(r.blind, ["releaseBuild", "conformance"]);
  assert.deepEqual(r.caught, ["e2eSmoke", "androidChecks"]);
  assert.match(describeLadderPlant(r), /start the program/);
});

test("THE DEFECT THIS WAS BUILT FOR: startup is broken and every L2 step still passes", () => {
  // The Python adopter's shape, in receipt form. Steps named for the rung, green
  // twice, and the program never started.
  const r = assessLadderPlant({
    before: ALL_GREEN,
    after: ALL_GREEN,
    ladder: LADDER,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /do not start the program/);
  assert.match(r.reason, /started the way it really starts/, "the refusal quotes the rung's own words back");
});

test("a plant that reddens an L1 step broke the BUILD, and the run is void", () => {
  // The opposite failure, and it must not read as success. If `releaseBuild`
  // goes red the edit did not compile, so the L2 steps went red for the wrong
  // reason and their redness proves nothing about starting a program.
  const r = assessLadderPlant({
    before: ALL_GREEN,
    after: receipt({ releaseBuild: "FAIL", conformance: "PASS", e2eSmoke: "FAIL", androidChecks: "FAIL" }),
    ladder: LADDER,
  });
  assert.equal(r.ok, false, "an L2 step went red, but for the wrong reason");
  assert.deepEqual(r.broke, ["releaseBuild"]);
  assert.match(r.reason, /broke the BUILD, not the startup/);
});

test("a step that was not green BEFORE the plant cannot be evidence after it", () => {
  // The hole that would let a run with no device attached "catch" the plant by
  // SKIPping twice. A SKIP is not a catch, and a step already FAILing is not
  // this plant's doing.
  const r = assessLadderPlant({
    before: receipt({ releaseBuild: "PASS", conformance: "PASS", e2eSmoke: "SKIP", androidChecks: "SKIP" }),
    after: receipt({ releaseBuild: "PASS", conformance: "PASS", e2eSmoke: "SKIP", androidChecks: "SKIP" }),
    ladder: LADDER,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no l2Execution step PASSED before the plant/);
  assert.match(r.reason, /e2eSmoke=SKIP/, "the refusal names what it saw rather than asserting a generality");
});

test("one L2 step catching it is enough, and the others are not held against the rung", () => {
  // `tokenDrift` SKIPs whenever the debug app is not running (KD-5), and a
  // profile may legitimately declare an execution step that a given run cannot
  // reach. The claim is that STARTING THE PROGRAM is observable, not that every
  // declared step observes it.
  const r = assessLadderPlant({
    before: ALL_GREEN,
    after: receipt({ releaseBuild: "PASS", conformance: "PASS", e2eSmoke: "FAIL", androidChecks: "PASS" }),
    ladder: LADDER,
  });
  assert.equal(r.ok, true, r.reason ?? "");
  assert.deepEqual(r.caught, ["e2eSmoke"]);
});

test("a profile that declares no l2Execution is told so, not quietly passed", () => {
  const r = assessLadderPlant({ before: ALL_GREEN, after: ALL_GREEN, ladder: { l1Required: ["conformance"], l2Execution: [] } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /declares no l2Execution steps/);
});

test("the cmp profile's break still finds, and still changes, this template's entry point", () => {
  // The plant is only as good as its aim. If the template's MainActivity is
  // restructured — `onCreate` renamed, `super.onCreate` moved, the whole file
  // replaced by a different entry point — the edit silently becomes a no-op,
  // the lane stays green with "startup broken", and the instrument reports the
  // OVERCLAIM it exists to catch, about a program that was never broken.
  //
  // So this asserts against the real file rather than a fixture. It cannot tell
  // whether the result COMPILES — that costs Gradle and belongs to the run — but
  // it can refuse a plant that no longer plants.
  const entry = path.join(ROOT, "template", "composeApp", "src", "androidMain", "kotlin", "com", "example", "app", startupPlant.entryPointBasename);
  assert.ok(fs.existsSync(entry), `the profile aims its startup plant at ${startupPlant.entryPointBasename}, and the template has no such file at ${path.relative(ROOT, entry)}`);

  const src = fs.readFileSync(entry, "utf8");
  assert.equal(startupPlant.recognises(src), true, `the profile no longer recognises its own entry point:\n${src.slice(0, 400)}`);

  const broken = startupPlant.breakStartup(src);
  assert.notEqual(broken, src, "breakStartup returned the file unchanged — the plant would report a green lane as proof that startup was broken");
  assert.match(broken, /throw IllegalStateException/, "the break does not throw");
  assert.ok(
    broken.indexOf("throw IllegalStateException") > broken.indexOf("super.onCreate(savedInstanceState)"),
    "the throw must land AFTER super.onCreate, so the Activity starts correctly and the APP's first instruction is what fails",
  );
});

// ── STAGE 0's criterion, for this function ────────────────────────────────────
//
// NORTH-STAR §9: every verdict-bearing core function returns the same verdict
// for the same logical input under two unlike profiles, proved by EXECUTION.
//
// It matters more here than for most. This judgement exists because a PYTHON
// adopter earned L2 with a suite that imported the app — so a version of it that
// only works when the steps are called `e2eSmoke` and run on a phone would miss
// the case it was built for. The step names are the profile's; the question is
// the core's.
const PY_ALIEN_LADDER = {
  // A backend pack: nothing here is a device step, and "starting the program"
  // means binding a port rather than launching an Activity.
  l1Required: ["mypy", "pytest"],
  l2Execution: ["localServerSmoke"],
};

/** The same SHAPE of run, told in each profile's own step names. */
function runShapedAs(ladder, { l1After, l2After }) {
  const green = Object.fromEntries([...ladder.l1Required, ...ladder.l2Execution].map((n) => [n, "PASS"]));
  const after = {
    ...green,
    ...Object.fromEntries(ladder.l1Required.map((n) => [n, l1After])),
    ...Object.fromEntries(ladder.l2Execution.map((n) => [n, l2After])),
  };
  return { before: receipt(green), after: receipt(after), ladder };
}

test("STAGE 0: the same logical run gets the same verdict under cmp and under a backend pack", () => {
  const cmp = { l1Required: [...CMP_LADDER.l1Required], l2Execution: [...CMP_LADDER.l2Execution] };
  assert.notDeepEqual(cmp.l2Execution, PY_ALIEN_LADDER.l2Execution, "the two profiles must be UNLIKE or this proves nothing");

  for (const [shape, inputs] of [
    ["startup broken and caught", { l1After: "PASS", l2After: "FAIL" }],
    ["the overclaim — nothing noticed", { l1After: "PASS", l2After: "PASS" }],
    ["the plant broke the build", { l1After: "FAIL", l2After: "FAIL" }],
  ]) {
    const a = assessLadderPlant(runShapedAs(cmp, inputs));
    const b = assessLadderPlant(runShapedAs(PY_ALIEN_LADDER, inputs));
    assert.equal(
      a.ok, b.ok,
      `"${shape}" is ${a.ok ? "accepted" : "refused"} for profiles/cmp and ${b.ok ? "accepted" : "refused"} for py-alien. ` +
        "The verdict is the core's and must not depend on what a pack calls its steps:\n" +
        `  cmp:      ${describeLadderPlant(a)}\n  py-alien: ${describeLadderPlant(b)}`,
    );
  }
});
