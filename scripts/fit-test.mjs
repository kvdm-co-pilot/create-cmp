// The derived half of the fit test (docs/NORTH-STAR.md §10).
//
// §10 asks eight questions in every PR. Two of them — 6 (proof at altitude) and
// 7 (mobile) — ask for facts this repo already derives, and asking a human to
// type them puts a CLAIM where a DERIVATION exists. That is the one thing this
// product refuses everywhere else, sitting in the document that defines it.
// Hand-typed proof also drifts: a number copied from scrollback into a commit
// message is unverifiable the moment the scrollback is gone.
//
// So this runs the gates and reads the evidence, and prints 6 and 7 ready to
// paste. Questions 1-5 stay written by a human, because they are judgements and
// nothing here can make them.
//
//   node scripts/fit-test.mjs            run the gates, print the block
//   node scripts/fit-test.mjs --json     the same, as data
//   node scripts/fit-test.mjs --no-run   read existing evidence only, run nothing
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deriveTierNeed } from "../packages/harness/src/lib/affected-tests.mjs";
import { observedTreeHash, DEVICE_TIER_TRIGGERS, DEVICE_TIER_IRRELEVANT } from "./observed-tree.mjs";
import { obligation } from "./proof-plan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLEET_RECORD = path.join(REPO_ROOT, "qa-artifacts", "fleet-latest.json");


function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

/**
 * Every path this branch changes: committed since the merge base with the
 * trunk, plus anything still uncommitted. Both halves matter — a device tier
 * that "was not required" because the trigger is only in the working tree is
 * the wrong answer.
 */
function changedPaths() {
  const base = sh("git", ["merge-base", "HEAD", "origin/main"]);
  const out = new Set();
  if (base.status === 0) {
    const diff = sh("git", ["diff", "--name-only", `${base.stdout.trim()}...HEAD`]);
    if (diff.status === 0) for (const l of diff.stdout.split("\n")) if (l.trim()) out.add(l.trim());
  }
  const dirty = sh("git", ["status", "--porcelain"]);
  if (dirty.status === 0) for (const l of dirty.stdout.split("\n")) if (l.trim()) out.add(l.slice(3).trim());
  return [...out];
}

export function deviceTierRequired(paths) {
  return deriveTierNeed(paths, { irrelevantRoots: DEVICE_TIER_IRRELEVANT, tierName: "fleet L2" });
}

/** `ℹ tests 1525 / ℹ pass 1525 / ℹ fail 0` out of the node test runner. */
export function parseSuite(stdout) {
  const n = (k) => {
    const m = stdout.match(new RegExp(`^\\u2139 ${k} (\\d+)$`, "m"));
    return m ? Number(m[1]) : null;
  };
  return { tests: n("tests"), pass: n("pass"), fail: n("fail") };
}

/** `framework check: PASS — … 7 plants, 2883ms total`. */
export function parseFrameworkCheck(stdout) {
  const verdict = /framework check: PASS/.test(stdout) ? "PASS" : /framework check: FAIL/.test(stdout) ? "FAIL" : null;
  const plants = stdout.match(/(\d+) plants/);
  const ms = stdout.match(/(\d+)ms total/);
  return { verdict, plants: plants ? Number(plants[1]) : null, ms: ms ? Number(ms[1]) : null };
}

/**
 * The fleet record, and whether it describes THIS tree.
 *
 * A green record for a different commit is the exact failure this is meant to
 * stop: quoting yesterday's device run as today's proof. Said plainly rather
 * than silently accepted.
 */
export function readFleetRecord(recordPath = FLEET_RECORD, currentHash = null) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  } catch {
    return { present: false };
  }
  const now = currentHash ?? observedTreeHash(REPO_ROOT, DEVICE_TIER_TRIGGERS);
  // A record written before content-binding has no hash to compare. It is not
  // trusted and not silently discarded: it is named as unverifiable, which is
  // the honest third answer.
  if (typeof record.observedHash !== "string") {
    return { present: true, record, current: false, staleReason: "written before the record was content-bound — cannot be verified against this tree" };
  }
  const current = record.observedHash === now;
  return {
    present: true,
    record,
    current,
    staleReason: current ? null : `the code feeding the device tier changed since this run (${record.observedHash.slice(0, 7)} → ${now.slice(0, 7)})`,
  };
}

function collect({ run }) {
  const suite = run ? parseSuite(sh("npm", ["test"]).stdout ?? "") : null;
  const fc = run ? parseFrameworkCheck(sh("node", ["scripts/framework-check.mjs"]).stdout ?? "") : null;
  const paths = changedPaths();
  const device = deviceTierRequired(paths);
  return { suite, frameworkCheck: fc, device, owed: obligation(undefined, paths), fleet: readFleetRecord(), changed: paths.length };
}

function render(d) {
  const L = [];
  L.push("fit test — the derived half (docs/NORTH-STAR.md §10)\n");
  L.push("6. Proof at altitude");
  L.push(`   suite             ${d.suite ? `${d.suite.pass}/${d.suite.tests}${d.suite.fail ? ` — ${d.suite.fail} FAILING` : ""}` : "not run (--no-run)"}`);
  L.push(`   framework-check   ${d.frameworkCheck ? `${d.frameworkCheck.verdict} · ${d.frameworkCheck.plants} plants · ${d.frameworkCheck.ms} ms` : "not run (--no-run)"}`);

  // The reason comes from deriveTierNeed and is PRINTED, not reconstructed. The
  // first version rebuilt it from a path list and produced "REQUIRED —  moved"
  // whenever the honest answer was a fail-open one, throwing away the only
  // sentence a reader could argue with.
  // WHETHER and WHEN are two questions, and printing only the first is what
  // made this line cost three emulator runs in one session on 2026-09-08. It
  // said REQUIRED the moment any commit touched the harness source; an agent
  // reading that at the moment of decision ran the device suite, and one of
  // those runs was triggered by a comment. The word REQUIRED is gone on
  // purpose: this now routes through scripts/proof-plan.mjs, which says WHEN,
  // and whose whole answer to a mid-slice commit is "not now".
  // A caller that hands over no schedule is not silently given the old
  // behaviour: an obligation whose timing nobody declared is UNDECLARED, which
  // reads as "declare the slice", never as "run it now".
  const state = d.owed ? d.owed.state : d.device.required ? "undeclared" : "none";
  const owed = { none: "not required", undeclared: "OWED — no slice declared", owed: "OWED — at slice close, NOT NOW", discharged: "DISCHARGED", reopened: "REOPENED — a trigger moved after the run" }[state];
  L.push(`   fleet L2          ${owed} — ${d.device.reason}`);
  if (d.fleet.present) {
    const r = d.fleet.record;
    const dev = r.steps.filter((s) => ["e2eSmoke", "androidChecks"].includes(s.name));
    L.push(`                     ${r.verdict} · rung ${r.rung ?? "none"} (required >=${r.requiredLevel})${dev.length ? ` · ${dev.map((s) => `${s.name} ${(s.durationMs / 1000).toFixed(1)}s`).join(", ")}` : ""}`);
    L.push(`                     ${d.fleet.current ? "ran against this exact code ✓" : `STALE — ${d.fleet.staleReason}`}${r.treeWasDirty ? " · tree was dirty when it ran" : ""}`);
  } else if (d.device.required) {
    // HOW LOUD depends on WHEN, and that is the whole fix. Mid-slice an absent
    // record is the expected state and saying NO RECORD there is what made an
    // agent go and buy one. At close — or with no slice declared — an absent
    // record is the failure mode this line has always existed to break, so it
    // keeps shouting.
    L.push(
      state === "owed"
        ? "                     no record yet — expected mid-slice; it is due at close"
        : "                     NO RECORD — a device run is due and none is recorded for this tree",
    );
  }

  L.push("\n7. Mobile");
  if (d.fleet.present) {
    const r = d.fleet.record;
    const fail = r.steps.filter((s) => s.verdict === "FAIL");
    const skip = r.steps.filter((s) => s.verdict === "SKIP");
    L.push(`   a Compose app stamped from this tree ran the same commands: ${r.steps.length} steps, ${fail.length} FAIL, ${skip.length} SKIP${skip.length ? ` (${skip.map((s) => s.name).join(", ")})` : ""}`);
  } else {
    L.push("   no stamped-app run recorded — run scripts/fleet-check.mjs");
  }
  L.push("\nstill yours: 1 goal · 2 derived-or-claimed · 3 mechanism · 4 stack knowledge · 5 receipt meaning · residue");
  return L.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const data = collect({ run: !argv.includes("--no-run") });
  process.stdout.write(argv.includes("--json") ? `${JSON.stringify(data, null, 2)}\n` : `${render(data)}\n`);
  // Reporting is not a gate: this prints what is true, including "not run".
  process.exit(0);
}

export { render, collect };
