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

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLEET_RECORD = path.join(REPO_ROOT, "qa-artifacts", "fleet-latest.json");

/**
 * The paths a device run can observe, for THIS repo.
 *
 * create-cmp is the engine, not a stamped app, so its "device tier" is
 * `fleet-check` and what feeds it is the template plus the package sources the
 * template is built from. A stamped project passes its own — `layout.sourceRoots`
 * plus the flows dir — to the same harness function.
 */
const DEVICE_TIER_TRIGGERS = ["template/", "packages/harness/src/", "packages/receipts/src/"];

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
  const need = deriveTierNeed(paths, { observedRoots: DEVICE_TIER_TRIGGERS, tierName: "fleet L2" });
  return { ...need, why: DEVICE_TIER_TRIGGERS.filter((t) => paths.some((p) => p.startsWith(t))) };
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
export function readFleetRecord(recordPath = FLEET_RECORD, head = null) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  } catch {
    return { present: false };
  }
  const at = head ?? (sh("git", ["rev-parse", "HEAD"]).stdout ?? "").trim();
  return {
    present: true,
    record,
    forThisCommit: Boolean(at) && record.commit === at,
    staleReason: record.commit === at ? null : `recorded against ${String(record.commit).slice(0, 7)}, HEAD is ${at.slice(0, 7)}`,
  };
}

function collect({ run }) {
  const suite = run ? parseSuite(sh("npm", ["test"]).stdout ?? "") : null;
  const fc = run ? parseFrameworkCheck(sh("node", ["scripts/framework-check.mjs"]).stdout ?? "") : null;
  const paths = changedPaths();
  return { suite, frameworkCheck: fc, device: deviceTierRequired(paths), fleet: readFleetRecord(), changed: paths.length };
}

function render(d) {
  const L = [];
  L.push("fit test — the derived half (docs/NORTH-STAR.md §10)\n");
  L.push("6. Proof at altitude");
  L.push(`   suite             ${d.suite ? `${d.suite.pass}/${d.suite.tests}${d.suite.fail ? ` — ${d.suite.fail} FAILING` : ""}` : "not run (--no-run)"}`);
  L.push(`   framework-check   ${d.frameworkCheck ? `${d.frameworkCheck.verdict} · ${d.frameworkCheck.plants} plants · ${d.frameworkCheck.ms} ms` : "not run (--no-run)"}`);

  const { required, why } = d.device;
  L.push(`   fleet L2          ${required ? `REQUIRED — ${why.join(", ")} moved` : "not required — nothing under the locked region or template moved"}`);
  if (d.fleet.present) {
    const r = d.fleet.record;
    const dev = r.steps.filter((s) => ["e2eSmoke", "androidChecks"].includes(s.name));
    L.push(`                     ${r.verdict} · rung ${r.rung ?? "none"} (required >=${r.requiredLevel})${dev.length ? ` · ${dev.map((s) => `${s.name} ${(s.durationMs / 1000).toFixed(1)}s`).join(", ")}` : ""}`);
    L.push(`                     ${d.fleet.forThisCommit ? "ran against this commit ✓" : `STALE — ${d.fleet.staleReason}`}${r.treeWasDirty ? " · tree was dirty when it ran" : ""}`);
  } else if (required) {
    L.push("                     NO RECORD — a device run is required and none is recorded for this tree");
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
