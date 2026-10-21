// INVARIANT: a step's deadline is bounded only by a duration measured on the
// same class of machine as this run. Under CI, only CI-measured durations
// count; with none, every step gets the ceiling (KD-291).
//
// The journal (qa/flight-recorder.jsonl) is committed from the developer's
// machine. The showcase's was measured on a warm Mac — `build` ~12 s — so on a
// cold ubuntu runner stepDeadlineMs gave `build` and `releaseBuild` 3× that,
// clamped up to the 5-minute floor, and CI on main reported both as "DID NOT
// COMPLETE — no result within its deadline (5 min)" while the PR run of the
// same `--profile ci` passed (run 37345438746, attempts 1–2). A red CI cannot
// attest, so this blocked "CI attested" outright.
import { test } from "node:test";
import assert from "node:assert/strict";

import { expectedDurations } from "../packages/harness/src/lib/lane-runner.mjs";
import { CI_MARKERS, buildFlightEntry, machineClass } from "../packages/harness/src/lib/flight-recorder.mjs";
import { DEFAULT_STEP_DEADLINES, stepDeadlineMs } from "../packages/harness/src/lib/step-outcomes.mjs";

const { ceilingMs } = DEFAULT_STEP_DEADLINES;

// What the showcase's committed journal looks like: full runs written on a
// laptop, some before the `machine` field existed.
const LOCAL_ONLY = [
  { mode: "full", durationMs: 60_000, steps: [{ name: "build", durationMs: 12_000 }] },
  { mode: "full", machine: "local", durationMs: 50_000, steps: [{ name: "build", durationMs: 11_000 }, { name: "releaseBuild", durationMs: 14_000 }] },
];

test("under CI, a journal measured only on laptops bounds no step — each gets the ceiling", () => {
  const e = expectedDurations(LOCAL_ONLY, { machine: "ci" });
  for (const step of ["build", "releaseBuild"]) {
    assert.equal(stepDeadlineMs(e.byName.get(step)), ceilingMs, `${step} was bounded by a laptop's duration on a CI run`);
  }
  assert.equal(e.laneMs, null);
});

test("under CI, a CI-measured run bounds the step, and a later laptop run does not displace it", () => {
  const entries = [
    ...LOCAL_ONLY.slice(0, 1),
    { mode: "full", machine: "ci", durationMs: 600_000, steps: [{ name: "build", durationMs: 240_000 }] },
    ...LOCAL_ONLY.slice(1),
  ];
  const e = expectedDurations(entries, { machine: "ci" });
  assert.equal(e.byName.get("build"), 240_000);
  assert.equal(stepDeadlineMs(e.byName.get("build")), 720_000);
});

test("locally, a CI-measured run never bounds the step; an entry from before the field still does", () => {
  const entries = [...LOCAL_ONLY, { mode: "full", machine: "ci", durationMs: 600_000, steps: [{ name: "build", durationMs: 240_000 }] }];
  assert.equal(expectedDurations(entries, { machine: "local" }).byName.get("build"), 11_000);
  assert.equal(expectedDurations(LOCAL_ONLY.slice(0, 1)).byName.get("build"), 12_000, "the default class is local");
});

test("machineClass reads the CI convention variable; unset, empty, 0 and false are local", () => {
  for (const v of ["true", "1", "TRUE", "yes"]) assert.equal(machineClass({ CI: v }), "ci", `CI=${v}`);
  for (const v of [undefined, "", "0", "false", "False"]) assert.equal(machineClass({ CI: v }), "local", `CI=${v}`);
  assert.equal(machineClass({}), "local");
});

// KD-294: Jenkins, Azure Pipelines, TeamCity and CodeBuild never set CI, so
// reading CI alone called their runners local and KD-291 fired there unfixed.
test("a runner that never sets CI is still CI, by its vendor's own marker", () => {
  const runners = {
    Jenkins: { JENKINS_URL: "https://ci.example/", BUILD_ID: "7" },
    "Azure Pipelines": { TF_BUILD: "True" },
    TeamCity: { TEAMCITY_VERSION: "2024.12" },
    CodeBuild: { CODEBUILD_BUILD_ID: "proj:1234" },
  };
  for (const [name, env] of Object.entries(runners)) assert.equal(machineClass(env), "ci", `${name} was called local`);
  for (const k of CI_MARKERS) assert.equal(machineClass({ [k]: "" }), "local", `${k} set but empty is not a runner`);
});

test("the journal entry records the class that measured it, so the next run can tell", () => {
  const entry = (machine) => buildFlightEntry({ profile: "ci", mode: "full", verdict: "PASS", steps: [{ name: "build", verdict: "PASS", durationMs: 5 }], durationMs: 10, machine });
  assert.equal(entry("ci").machine, "ci");
  assert.equal(entry("local").machine, "local");
  const roundTrip = expectedDurations([entry("ci")], { machine: "ci" });
  assert.equal(roundTrip.byName.get("build"), 5, "an entry written under CI is read back under CI");
});
