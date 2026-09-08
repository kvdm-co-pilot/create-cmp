// WHAT THIS SLICE WILL OWE, DECLARED BEFORE THE WORK STARTS.
//
// THE DEFECT THIS EXISTS TO CLOSE. `deriveTierNeed` answers WHETHER a tier is
// required and nothing anywhere answers WHEN. So `scripts/fit-test.mjs` printed
// "fleet L2 REQUIRED" the moment any commit touched the harness source, and an
// agent reading that at the moment of decision ran a three-and-a-half-minute
// emulator suite. On 2026-09-08 that happened three times in one session, and
// the third was triggered by a COMMENT and a message string changing in
// `evidence-level.mjs` — twenty minutes after the same agent had written down
// that re-running a device suite for a comment is ceremony. Naming it did not
// stop it, because at the moment of decision the program was the thing in front
// of the reader, saying REQUIRED.
//
// That is the whole lesson and it is bigger than this file: EIGHTEEN documents
// in this repository state the device-tier rule and not one of them is a
// program. The one memory that states it says "gate a RELEASE at L2" — a slice
// boundary — while the program obliged the tier per COMMIT. Prose and program
// disagreed, and the program won, as it always will: prose is read once at the
// start of a session and the program speaks at the moment of the decision. The
// fix for a rule that keeps getting lost is never a nineteenth restatement.
//
// SO: the obligation ACCRUES across a slice and is DISCHARGED once, at the end.
//
//   node scripts/proof-plan.mjs --open "<what this slice is>"
//   node scripts/proof-plan.mjs                     what is owed right now
//   node scripts/proof-plan.mjs --discharge         record that the device tier ran
//   node scripts/proof-plan.mjs --close             refuse if anything is still owed
//
// THE ORDERING RULE, AND WHY IT IS THE HONEST ANSWER. A device run proves a
// TREE. Any later edit to a trigger path — a comment included, because nothing
// here can tell a comment from a statement without parsing every language it
// might meet — leaves the run describing a tree that no longer exists. Rather
// than pretend some edits are safe, this makes the ordering explicit: the
// device tier is the LAST gate, and a trigger path edited after a discharge
// REOPENS the slice and says so. The agent that discharged and then edited docs
// is told exactly that, instead of silently paying for a second run. Cheaper
// than either alternative — a smarter hash that must understand every
// ecosystem's syntax, or an exception list that decides comments are harmless
// and is wrong the first time someone edits a string a test asserts on.
//
// Exit 0 when nothing is owed, 1 when something is, 2 when the question could
// not be answered — the same three outcomes `scripts/stage-gate.mjs` uses, and
// for the same reason: "I could not check" is not "I checked and it is broken".
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deriveTierNeed } from "../packages/harness/src/lib/affected-tests.mjs";
import { observedTreeHash, DEVICE_TIER_TRIGGERS, DEVICE_TIER_IRRELEVANT } from "./observed-tree.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_PATH = path.join(REPO_ROOT, "qa-artifacts", "proof-plan.json");
const SCHEMA = "prooflane-proof-plan/1";

/**
 * The tiers this repo can run, and WHEN each is due. This is the declaration
 * the rule used to live in prose: the fast ones run continuously because they
 * cost seconds and catch the most, and the device tier runs ONCE, at the end of
 * a slice, because it costs minutes and can only answer a question about a
 * finished tree.
 *
 * `at-close` is not a weaker claim than `per-commit`. The same run happens; it
 * happens once, over everything the slice changed, instead of once per commit
 * over a tree nobody is going to ship.
 */
const TIERS = Object.freeze({
  suite: { when: "per-commit", cost: "~50s", cmd: "npm test" },
  frameworkCheck: { when: "per-commit", cost: "~4s", cmd: "node scripts/framework-check.mjs" },
  device: { when: "at-close", cost: "~3.5min + an emulator", cmd: 'CMP_AVD=Medium_Phone_API_35 node scripts/fleet-check.mjs --min-level L2' },
});

function sh(cmd, args) {
  return spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/**
 * Every path this slice has touched: committed since the trunk, plus the
 * working tree. `null` when git cannot answer — and the difference between
 * "nothing changed" and "could not tell" is the whole point of returning it:
 * an empty list is a tree that IS trunk and owes nothing, while `null` fails
 * open through `deriveTierNeed` and owes the tier, because an unanswerable
 * question costs a device run rather than a missed regression.
 */
function changedPaths() {
  const base = sh("git", ["merge-base", "HEAD", "origin/main"]);
  if (base.status !== 0) return null;
  const diff = sh("git", ["diff", "--name-only", `${base.stdout.trim()}...HEAD`]);
  if (diff.status !== 0) return null;
  const dirty = sh("git", ["status", "--porcelain"]);
  if (dirty.status !== 0) return null;
  const out = new Set();
  for (const l of diff.stdout.split("\n")) if (l.trim()) out.add(l.trim());
  for (const l of dirty.stdout.split("\n")) {
    if (!l.trim()) continue;
    // A rename is two changed paths: the trigger that vanished and wherever it went.
    for (const p of l.slice(3).trim().split(" -> ")) out.add(p);
  }
  return [...out];
}

/** The branch this tree is on; "" when detached, null when git cannot say. */
function currentBranch() {
  const r = sh("git", ["branch", "--show-current"]);
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Trunk is not a slice. A slice is a branch — that is what trunk-based means here. */
const isTrunk = (branch) => !branch || branch === "main";

function read() {
  try {
    const p = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
    return p && p.schema === SCHEMA ? p : null;
  } catch {
    return null;
  }
}

function write(plan) {
  fs.mkdirSync(path.dirname(PLAN_PATH), { recursive: true });
  fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);
}

/**
 * What this slice owes, right now.
 *
 * `required` is the existing derivation and is untouched — it answers whether
 * the device tier CAN be skipped, and it deliberately fails open, so an
 * unclassified path costs a device run rather than a missed regression. What is
 * added here is only the second half: when it is due.
 *
 * TWO THINGS THE 2026-09-08 AUDIT FOUND, the day after this file landed:
 *
 * A clean `main` reported OWED. `deriveTierNeed` fails open on an empty list —
 * right for the lane, which cannot see its diff, and wrong here, where git
 * answered and the answer was "nothing". A tree that IS trunk owes nothing:
 * whatever it owed was owed by the slice that produced it and collected at
 * that slice's merge. So the empty case is decided here, before the derivation.
 *
 * And the previous slice's plan was still on disk, applying itself to whatever
 * came next. A plan is bound to the branch it was opened on — a slice IS a
 * branch under trunk-based development — so a leftover is named as stale and
 * never silently reused.
 */
export function obligation(plan = read(), paths = changedPaths(), branch = currentBranch()) {
  const stale = plan && plan.branch !== branch ? plan : null;
  if (stale) plan = null;
  const base = { plan, stale, branch };

  if (Array.isArray(paths) && paths.length === 0) {
    const where = branch ? ` (${branch})` : "";
    // `trunk` is read by the hook: "none because the diff is docs-only" makes a
    // device run pure waste, while "none because this IS trunk" is the one
    // place a device run is legitimate without a slice — a release proof.
    return {
      state: "none",
      trunk: true,
      ...base,
      need: { required: false, obliging: [], reason: `nothing has changed since origin/main and the working tree is clean — this tree is trunk${where}, and whatever it owed was collected when its slice merged` },
    };
  }
  const need = deriveTierNeed(paths, { irrelevantRoots: DEVICE_TIER_IRRELEVANT, tierName: "fleet L2" });
  if (!need.required) return { state: "none", need, ...base };
  if (!plan) return { state: "undeclared", need, ...base };

  const now = observedTreeHash(REPO_ROOT, DEVICE_TIER_TRIGGERS);
  const d = plan.discharged;
  if (!d) return { state: "owed", need, ...base, now };
  if (d.treeHash === now) return { state: "discharged", need, ...base, now };
  // Discharged, then a trigger path moved. The slice reopened — and saying so
  // is the point: an agent that edits after the last gate should be told it has
  // reopened the slice, not silently charged for another emulator.
  return { state: "reopened", need, ...base, now };
}

/**
 * Close the slice: remove the plan when nothing is owed. The merge hook calls
 * this after `gh pr merge` so a finished slice's plan never lies around to be
 * named stale by the next one — the 2026-09-08 audit found PR #84's still there.
 */
export function close(o = obligation()) {
  const settled = o.state === "none" || o.state === "discharged";
  const had = Boolean(o.plan || o.stale);
  if (settled && had) fs.rmSync(PLAN_PATH, { force: true });
  return { closed: settled, removed: settled && had, state: o.state };
}

export function render(o) {
  const L = [];
  const t = TIERS.device;
  L.push("proof plan — what this slice owes (NORTH-STAR §7)\n");
  if (o.plan) L.push(`  slice   ${o.plan.slice}\n  branch  ${o.plan.branch}\n  opened  ${o.plan.openedAt}\n`);
  else if (o.branch !== undefined) L.push(`  branch  ${o.branch || "(detached)"}${isTrunk(o.branch) ? " — trunk, not a slice" : ""}\n`);
  if (o.stale) L.push(`  (a plan from slice "${o.stale.slice}" on branch ${o.stale.branch ?? "unknown"} is still on disk and does not apply here — --close removes it)\n`);

  for (const [name, tier] of Object.entries(TIERS)) {
    if (name === "device") continue;
    L.push(`  ${name.padEnd(16)} ${tier.when.padEnd(12)} ${tier.cost.padEnd(22)} ${tier.cmd}`);
  }

  const line = (verdict, detail) => L.push(`  ${"device (fleet L2)".padEnd(16)} ${verdict}\n      ${detail}`);
  switch (o.state) {
    case "none":
      line("NOT OWED", o.need.reason);
      break;
    case "undeclared":
      line(
        "OWED — but no slice is declared",
        `${o.need.reason}.\n      ${isTrunk(o.branch) ? "You are on trunk — branch first (git switch -c <name>), then declare the slice" : "Declare the slice first"}: node scripts/proof-plan.mjs --open "<what you are building>".\n      Declaring up front is the point — a slice that knows it will need an emulator can be\n      scoped differently, and one that knows it will not never pays for one.`,
      );
      break;
    case "owed":
      line(
        "OWED — discharge at slice close, NOT NOW",
        `${o.need.reason}.\n      This is the last gate. Run it when everything else is green and you are about to open\n      the PR — ${t.cost}:\n        ${t.cmd}\n      Then: node scripts/proof-plan.mjs --discharge`,
      );
      break;
    case "discharged":
      line("DISCHARGED", `ran at ${o.plan.discharged.at} — verdict ${o.plan.discharged.verdict}, rung ${o.plan.discharged.rung ?? "none"}, and no trigger path has moved since`);
      break;
    case "reopened":
      line(
        "REOPENED — a trigger path moved after the device run",
        `the run at ${o.plan.discharged.at} describes a tree that no longer exists (${o.plan.discharged.treeHash.slice(0, 7)} → ${o.now.slice(0, 7)}).\n      The device tier is the LAST gate: either revert what moved, or accept a second run.\n      This is the ordering mistake that cost three device runs in one session on 2026-09-08.`,
      );
      break;
  }
  return L.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.indexOf(n);

  if (flag("--open") !== -1) {
    const name = argv[flag("--open") + 1];
    if (!name || name.startsWith("--")) {
      process.stderr.write('--open needs a name: node scripts/proof-plan.mjs --open "the ladder seam"\n');
      process.exit(2);
    }
    const branch = currentBranch();
    if (isTrunk(branch)) {
      process.stderr.write(`${branch || "a detached HEAD"} is trunk, not a slice — branch first (git switch -c <name>), then declare\n`);
      process.exit(2);
    }
    const base = sh("git", ["merge-base", "HEAD", "origin/main"]);
    write({
      schema: SCHEMA,
      slice: name,
      branch,
      openedAt: new Date().toISOString(),
      base: base.status === 0 ? base.stdout.trim() : null,
      declared: Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.when])),
      discharged: null,
    });
    process.stdout.write(`${render(obligation())}\n`);
    process.exit(0);
  }

  if (flag("--discharge") !== -1) {
    const plan = read();
    const branch = currentBranch();
    if (!plan || plan.branch !== branch) {
      process.stderr.write(plan
        ? `the plan on disk belongs to slice "${plan.slice}" on branch ${plan.branch ?? "unknown"}, not ${branch || "this detached HEAD"} — declare one here first\n`
        : 'no slice is declared — node scripts/proof-plan.mjs --open "<what you are building>"\n');
      process.exit(2);
    }
    // Read the run rather than take the caller's word for it: a discharge that
    // trusts an argument is a claim, and this whole product exists to refuse
    // exactly that shape. The record fleet-check writes is the evidence.
    let rec;
    try {
      rec = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "qa-artifacts", "fleet-latest.json"), "utf8"));
    } catch {
      process.stderr.write("no device run is recorded — run the fleet check first; a discharge is read from its record, never asserted\n");
      process.exit(2);
    }
    const now = observedTreeHash(REPO_ROOT, DEVICE_TIER_TRIGGERS);
    if (rec.observedHash !== now) {
      process.stderr.write(`the recorded device run does not describe this tree (${String(rec.observedHash).slice(0, 7)} → ${now.slice(0, 7)}) — it cannot discharge anything\n`);
      process.exit(1);
    }
    if (rec.verdict !== "PASS") {
      process.stderr.write(`the recorded device run is ${rec.verdict}, not PASS — a failing run discharges nothing\n`);
      process.exit(1);
    }
    plan.discharged = { at: rec.ranAt, treeHash: now, verdict: rec.verdict, rung: rec.rung ?? null };
    write(plan);
    process.stdout.write(`${render(obligation(plan))}\n`);
    process.exit(0);
  }

  const o = obligation();
  if (flag("--close") !== -1) {
    process.stdout.write(`${render(o)}\n`);
    if (close(o).closed) {
      process.stdout.write("\nslice closed — nothing owed.\n");
      process.exit(0);
    }
    process.stdout.write("\nslice NOT closed — the device tier is still owed.\n");
    process.exit(1);
  }

  process.stdout.write(`${render(o)}\n`);
  process.exit(o.state === "owed" || o.state === "reopened" || o.state === "undeclared" ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
export { TIERS, read, changedPaths, currentBranch, isTrunk };
