// A STAGE DOES NOT START UNTIL ITS EXIT IS A COMMAND.
//
// The road (NORTH-STAR §9) is five stages, each with an exit criterion written
// as a sentence. A sentence cannot terminate a loop. Stage 0's criterion —
// "every verdict-bearing core function returns the same verdict under two
// unlike profiles" — named no list, so nothing could evaluate it: every
// iteration did real work and left the stopping condition exactly as untrue as
// before. It outlived three criteria and took a human saying "we can't even
// complete one stage" to close, and it closed within a day of becoming a
// predicate.
//
// This is the fix, and it is a PRECONDITION rather than a report: a stage whose
// exit is not yet a command is not ready to be worked on, and this prints that
// rather than a number nobody can act on. Writing the predicate is the first
// task of the stage, not the last.
//
//   node scripts/stage-gate.mjs          every stage
//   node scripts/stage-gate.mjs 0        one stage
//
// Exit 0 when the named stage passes (or, with no argument, when the first
// unexited stage's criteria all pass). Exit 1 when a criterion fails. Exit 2
// when a stage has no predicate — the state this exists to make visible.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readFleetRecord } from "./fit-test.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Each criterion is a COMMAND or a piece of recorded evidence — never a
 * judgement. `pending` is the honest third state: the criterion is known and
 * has no evaluator yet, which blocks the stage from starting.
 */
const STAGES = [
  {
    id: "0",
    name: "the lane seam",
    exited: "2026-09-07",
    criteria: [
      { what: "differential conformance, every profile-dependent verdict function", cmd: ["--test", "test/stage0-differential-coverage.test.mjs"] },
      { what: "cold adoption, nothing to a proven lane, per ecosystem", cmd: ["scripts/cold-adoption.mjs"] },
      { what: "fleet L2 green for the current lane code", fleet: true },
    ],
  },
  {
    id: "0.5",
    name: "the console into the harness",
    exited: "2026-09-07",
    criteria: [{ what: "console baseline, honesty floor, declared sections, no Compose furniture off-Compose", cmd: ["scripts/stage05-gate.mjs"] }],
  },
  {
    id: "1",
    name: "distribution",
    criteria: [{ what: "installs without create-cmp; a core fix reaches the tree by one command", cmd: ["scripts/stage1-gate.mjs"] }],
  },
  {
    id: "2",
    name: "profiles as artifacts",
    // The criterion names an AUTHOR this project does not control, so half of it
    // is not automatable and pretending otherwise would be the vacuous green.
    // The gate splits it: provenance is read from a human-written attestation
    // and reported NOT MET while none exists; acceptance — does the machinery
    // take a foreign profile end to end, and refuse what §8 says it must — is
    // executed. It is red today, and seven of its ten rows are findings.
    criteria: [{ what: "a foreign profile is accepted end to end, and the badge floor refuses what it must", cmd: ["scripts/stage2-gate.mjs"] }],
  },
  {
    id: "3",
    name: "fleet",
    // "Nothing to count yet" is the honest state and it is not the same as zero:
    // an absent fleet manifest is REFUSED (§8.7 one layer up), never counted as
    // a fleet of none and called done. The count itself is read out of §9 rather
    // than kept as a constant here, so lowering the bar means editing the road.
    criteria: [{ what: "a declared fleet, upgraded by one command, with the proof in each tree", cmd: ["scripts/stage3-gate.mjs"] }],
  },
];

/**
 * Three outcomes, not two. Exit 2 means the criterion could not be EVALUATED —
 * `scripts/cold-adoption.mjs` refuses to run against a dirty tree, because an
 * adoption experiment that can edit the engine is measuring itself. Reporting
 * that as a failure made stage 0, which is exited, read ✗ whenever anyone had
 * uncommitted work. "I could not check" and "I checked and it is broken" are
 * different claims, and this file exists to stop exactly that conflation one
 * level up.
 */
function runCmd(argv) {
  const r = spawnSync(process.execPath, argv, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const tail = ((r.stdout ?? "") + (r.stderr ?? "")).trim().split("\n").slice(-2).join(" ");
  if (r.status === 2) return { ok: false, unevaluable: true, tail };
  return { ok: r.status === 0, tail };
}

function checkFleet() {
  const rec = readFleetRecord();
  if (!rec.present) return { ok: false, tail: "no device run recorded — run scripts/fleet-check.mjs" };
  if (!rec.current) return { ok: false, tail: `recorded run does not cover this code: ${rec.staleReason}` };
  return { ok: rec.record.verdict === "PASS", tail: `rung ${rec.record.rung ?? "none"}, verdict ${rec.record.verdict}` };
}

function evaluate(stage) {
  if (!stage.criteria) return { state: "pending" };
  const results = stage.criteria.map((c) => ({ what: c.what, ...(c.fleet ? checkFleet() : runCmd(c.cmd)) }));
  if (results.every((r) => r.ok)) return { state: "pass", results };
  // Unevaluable is not failing. A stage nobody could check is reported as
  // unchecked, and the process exits 2 — the same code the criterion used to
  // say it — rather than asserting a verdict nobody derived.
  if (results.some((r) => r.unevaluable) && results.every((r) => r.ok || r.unevaluable)) return { state: "unevaluable", results };
  return { state: "fail", results };
}

function main() {
  const only = process.argv[2];
  const wanted = only ? STAGES.filter((s) => s.id === only) : STAGES;
  if (!wanted.length) {
    process.stderr.write(`no such stage: ${only}. Known: ${STAGES.map((s) => s.id).join(", ")}\n`);
    process.exit(2);
  }
  let worst = 0;
  process.stdout.write("stage gate — the road's exit criteria, as commands (NORTH-STAR §9)\n\n");
  for (const stage of wanted) {
    const r = evaluate(stage);
    if (r.state === "pending") {
      process.stdout.write(`  ⧗ stage ${stage.id} — ${stage.name}\n      NO PREDICATE (${stage.pending ?? "no criteria declared"}). This stage may not start until its exit is a command.\n      ${stage.pending}\n\n`);
      worst = Math.max(worst, 2);
      continue;
    }
    const mark = r.state === "pass" ? "✓" : r.state === "unevaluable" ? "?" : "✗";
    process.stdout.write(`  ${mark} stage ${stage.id} — ${stage.name}${stage.exited ? ` (exited ${stage.exited})` : ""}\n`);
    for (const c of r.results) process.stdout.write(`      ${c.ok ? "✓" : c.unevaluable ? "?" : "✗"} ${c.what}\n        ${c.tail}\n`);
    if (r.state === "unevaluable") process.stdout.write("      (not a failure — nothing could be checked; commit and re-run)\n");
    process.stdout.write("\n");
    if (r.state === "fail") worst = Math.max(worst, 1);
    if (r.state === "unevaluable") worst = Math.max(worst, 2);
  }
  process.exit(worst);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
export { STAGES, evaluate };
