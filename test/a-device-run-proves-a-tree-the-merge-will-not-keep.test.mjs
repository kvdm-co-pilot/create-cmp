// A DEVICE RUN PROVES A TREE. A REBASE MOVES THAT TREE, AND THE TIER REOPENS.
//
// `gh pr merge --rebase` of a branch that does not contain origin/main moves the
// bytes the device run described — and so does the rebase an agent does first, by
// hand, when main's CI turns red under it. Either way the run that was just paid
// for describes a tree that will not merge, the trigger hash moves, and
// scripts/proof-plan.mjs reports the tier REOPENED. Measured 2026-09-16: FOUR
// emulator runs for one merge, every one of them owed by the program and none of
// them needed. The rule — "check main's CI first" — was in project memory, where
// no program could see it.
//
// The invariant: when a device run is about to be allowed, the gate first asks
// whether this branch contains origin/main, and refuses by name when it does not.
// Three things that refusal must never become:
//   - a SECOND baseline. Every obligation in this repo is derived from
//     `git merge-base HEAD origin/main`, so the gate reads the remote with
//     `ls-remote` and never `fetch`: a gate that fetched would move the state it
//     exists to read, and every other gate would compute against the new one.
//   - a SILENT pass. "could not answer" and "the local ref says so" are allows
//     that SAY which of the two they are.
//   - a LATE answer. Past the timeout .claude/settings.json declares, the hook is
//     killed and a refusal it was holding is a permitted command, so the whole
//     check runs on one purse derived from that number, and the arithmetic is
//     pinned below rather than chosen.
//
// origin is a LOCAL BARE REPO in every test here: `git ls-remote` speaks the file
// transport, so this file makes no network call and passes offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ANSWER_RESERVE_MS, baseContext, decide, declaredBudgetMs, LANE_PROBE_TOTAL_MS, REMOTE_CALL_CAP_MS, REMOTE_CALL_FLOOR_MS, remoteBudgetMs, TREE_PROBE_TOTAL_MS } from "../scripts/hooks/proof-gate.mjs";
import { isTrunk, TIERS } from "../scripts/proof-plan.mjs";

const owed = { state: "owed", plan: { slice: "s", branch: "b" }, need: { reason: "r" }, branch: "b", review: { state: "none" } };
/** What this gate said before an ordering check existed. The ordinary case must still say exactly this. */
const TODAYS_OWED_ALLOW = decide("device", owed, TIERS).reason;

// Nothing this file runs may read the machine's own git identity or signing config.
const IDENTITY = ["-c", "user.email=gate@example.invalid", "-c", "user.name=Ordering Gate", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];
const raw = (cwd, args) => spawnSync("git", [...IDENTITY, ...args], { cwd, encoding: "utf8" });
function git(cwd, args) {
  const r = raw(cwd, args);
  assert.equal(r.status, 0, `git ${args.join(" ")} in ${cwd} exited ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
}
function commit(repo, text) {
  fs.writeFileSync(path.join(repo, "f.txt"), `${text}\n`);
  git(repo, ["add", "."]);
  git(repo, ["commit", "--quiet", "-m", text]);
}

/**
 * A real origin (bare), a real working clone, and a SECOND clone — because a
 * commit pushed from `work` would update `work`'s own origin/main and destroy
 * the very staleness the 2026-09-16 case is made of.
 */
function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "device-run-proves-a-tree-"));
  const origin = path.join(dir, "origin.git");
  const work = path.join(dir, "work");
  const other = path.join(dir, "other");
  fs.mkdirSync(origin);
  fs.mkdirSync(work);
  git(origin, ["init", "--bare", "--quiet"]);
  git(work, ["init", "--quiet"]);
  commit(work, "one");
  git(work, ["remote", "add", "origin", origin]);
  git(work, ["push", "--quiet", "-u", "origin", "main"]);
  git(dir, ["clone", "--quiet", origin, other]);
  return { dir, origin, work, other };
}
const trunkMovesOn = (w, text) => {
  commit(w.other, text);
  git(w.other, ["push", "--quiet", "origin", "main"]);
};
const gone = (w) => fs.rmSync(w.dir, { recursive: true, force: true });

/**
 * EVERY `baseContext` CALL BELOW NAMES ITS OWN PURSE, AT THE CALL SITE, AND THE
 * BRANCH RULE IT IS JUDGED BY.
 *
 * The production default for the purse is `remoteBudgetMs()`, measured from
 * module load: what is LEFT of the hook's kill-timer. That is exactly right in a
 * process that lives a fifth of a second to answer one payload, and it measures
 * something else entirely in this one, where the same clock is counting how long
 * the SUITE has been running. Past `declaredBudgetMs() - ANSWER_RESERVE_MS`
 * — 8.5s on today's wiring — the default purse is empty, the check correctly
 * answers "could not ask", and THE PLANT's `contained === false` goes red
 * because the machine was busy. A calibration whose verdict depends on the load
 * teaches its readers that a red here means run it again, which is worse than
 * having no calibration at all. No helper wraps this: a helper would hide the
 * one number these tests exist to make visible. The arithmetic test at the
 * bottom is the only place `remoteBudgetMs` itself is still read — its own
 * arithmetic, at elapsed times it states — which is where a change to the
 * production purse is felt. The branch rule travels the same way and for the
 * same reason, from scripts/proof-plan.mjs where it is defined once; the single
 * call that leaves it out is the one whose subject is leaving it out.
 */

test("THE PLANT: a branch that does not contain origin/main is refused a device run, by name", () => {
  const w = world();
  try {
    git(w.work, ["switch", "--quiet", "-c", "slice"]);
    trunkMovesOn(w, "two");
    git(w.work, ["fetch", "--quiet", "origin"]); // this checkout's own ref now knows

    const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: REMOTE_CALL_CAP_MS });
    assert.equal(base.contained, false);
    assert.equal(base.behind, 1, "one commit of origin/main is missing from this branch");
    assert.equal(base.source, "local", "the local ref already settled it");
    assert.equal(base.reachedRemote, false, "and the refusal path asks origin nothing: origin could only be further ahead");

    const d = decide("device", owed, TIERS, { base });
    assert.equal(d.action, "deny");
    assert.match(d.reason, /does not contain origin\/main/, "names what is wrong");
    assert.match(d.reason, /OWED/, "and the state it was decided on");
    assert.match(d.reason, /REOPENS/, "and what a run now would cost: the tier reopens and is bought twice");
    assert.match(d.reason, /2026-09-16: four emulator runs for one merge/, "and the measurement that bought this gate");
    assert.match(d.reason, /git fetch origin && git rebase origin\/main/, "and the exact next command");
    assert.ok(!/REQUIRED/.test(d.reason), "never that word");
  } finally {
    gone(w);
  }
});

test("THE REVERT: rebased onto origin/main, the same call allows — and says exactly what it said before this gate existed", () => {
  const w = world();
  try {
    git(w.work, ["switch", "--quiet", "-c", "slice"]);
    trunkMovesOn(w, "two");
    git(w.work, ["fetch", "--quiet", "origin"]);
    git(w.work, ["rebase", "--quiet", "origin/main"]);

    const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: REMOTE_CALL_CAP_MS });
    assert.equal(base.contained, true);
    assert.equal(base.source, "remote", "origin itself confirmed it, over the file transport");
    assert.equal(base.reachedRemote, true);

    const d = decide("device", owed, TIERS, { base });
    assert.equal(d.action, "allow");
    assert.equal(d.reason, TODAYS_OWED_ALLOW, "an answered, contained branch gets NO note: the ordinary reason is byte-identical");
    // And with no context at all — the shape every other test of this path uses.
    assert.equal(decide("device", owed, TIERS, {}).reason, TODAYS_OWED_ALLOW);
    assert.equal(decide("device", owed, TIERS, { base: null }).reason, TODAYS_OWED_ALLOW);
  } finally {
    gone(w);
  }
});

test("THE 2026-09-16 CASE: the local ref says contained and origin says MOVED — the remote answer is the one that decides", () => {
  const w = world();
  try {
    git(w.work, ["switch", "--quiet", "-c", "slice"]);
    commit(w.work, "slice work");
    trunkMovesOn(w, "the fix that went in under this branch"); // pushed from the OTHER clone: work's ref stays stale

    assert.equal(git(w.work, ["rev-parse", "refs/remotes/origin/main"]), git(w.work, ["rev-parse", "HEAD~1"]), "this checkout's ref still believes it is up to date");

    const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: REMOTE_CALL_CAP_MS });
    assert.equal(base.contained, false, "origin knows better than the ref");
    assert.equal(base.unfetched, true, "and names a commit this checkout does not even have");
    assert.equal(base.source, "remote");
    assert.equal(base.reachedRemote, true);
    assert.equal(base.sha, git(w.other, ["rev-parse", "HEAD"]), "the sha the answer was computed against is the one origin has");

    const d = decide("device", owed, TIERS, { base });
    assert.equal(d.action, "deny");
    assert.match(d.reason, /origin\/main has MOVED/, "says the ref was stale, not that the branch was lazy");
    assert.match(d.reason, /does not contain origin\/main/);
    assert.match(d.reason, /git fetch origin && git rebase origin\/main/);
  } finally {
    gone(w);
  }
});

test("AN UNREACHABLE ORIGIN ALLOWS — and the allow says the answer came from the local ref", () => {
  const w = world();
  try {
    git(w.work, ["switch", "--quiet", "-c", "slice"]);
    git(w.work, ["remote", "set-url", "origin", path.join(w.dir, "no-such-origin.git")]);

    const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: REMOTE_CALL_CAP_MS });
    assert.equal(base.contained, true, "the local ref still answers, and it says this branch contains trunk");
    assert.equal(base.reachedRemote, false, "origin was asked and could not be reached");
    assert.equal(base.source, "local");

    const d = decide("device", owed, TIERS, { base });
    assert.equal(d.action, "allow", "a precondition that cannot see must not block a real run");
    assert.notEqual(d.reason, TODAYS_OWED_ALLOW, "but it must not pass silently either");
    assert.match(d.reason, /local ref/, "the allow says which half answered");
    assert.match(d.reason, /could not be reached/);
    assert.match(d.reason, /git fetch origin && git rebase origin\/main/);
  } finally {
    gone(w);
  }
});

test("NO ORIGIN AT ALL: the check says it could not run, and the run goes ahead", () => {
  const w = world();
  try {
    git(w.work, ["switch", "--quiet", "-c", "slice"]);
    git(w.work, ["remote", "remove", "origin"]);
    assert.equal(raw(w.work, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"]).status, 1, "removing the remote takes its refs with it");

    const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: REMOTE_CALL_CAP_MS });
    assert.equal(base.contained, null, "'could not answer' is not 'contained' and is not 'not contained'");
    assert.match(base.reason, /no origin remote/);

    const d = decide("device", owed, TIERS, { base });
    assert.equal(d.action, "allow");
    assert.match(d.reason, /ORDERING UNCHECKED/, "a gate that cannot see must say so rather than block a run for a reason that is not true");
    assert.match(d.reason, /no origin remote/);
  } finally {
    gone(w);
  }
});

test("TRUNK AND A DETACHED HEAD ARE NOT SLICES — and the two spellings of 'which branch' disagree on one of them", () => {
  const w = world();
  try {
    assert.equal(baseContext(w.work, { branch: "main", isTrunk, budgetMs: REMOTE_CALL_CAP_MS }), null, "trunk owes nothing per slice and has nothing to be behind");
    assert.equal(baseContext(w.work, { branch: "", isTrunk, budgetMs: REMOTE_CALL_CAP_MS }), null, "a detached HEAD is not a slice either");

    // Pinned by a run, not by a comment: obligation() reads the branch with
    // `--show-current`, and the same question asked with `--abbrev-ref` answers
    // "HEAD" — a non-empty string that isTrunk() would call a branch. Code
    // written against the second spelling passes on a laptop and fires this
    // gate in a CI checkout, which is always detached. What the second spelling
    // answers is pinned beside the first, against a real detached HEAD, in
    // test/the-current-branch-is-read-two-ways.test.mjs — that fact's home, and
    // the test whose lint forbids naming that flag as a literal anywhere here.
    git(w.work, ["checkout", "--quiet", "--detach", "HEAD"]);
    assert.equal(git(w.work, ["branch", "--show-current"]), "", "--show-current: empty on a detached HEAD");
    assert.notEqual(baseContext(w.work, { branch: "HEAD", isTrunk, budgetMs: REMOTE_CALL_CAP_MS }), null, "which is exactly why the branch is passed in from --show-current and never re-read here");
  } finally {
    gone(w);
  }
});

// The shim has to `exec`, so the process the kill-timer signals IS the sleeper:
// a shell that merely waited would be killed while the sleeper kept the stdout
// pipe open, and spawnSync would sit there reading it long past the timeout.
const REAL_GIT = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
function stallingLsRemote(dir) {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "git"), `#!/bin/sh\nfor a in "$@"; do\n  if [ "$a" = ls-remote ]; then exec sleep 30; fi\ndone\nexec ${REAL_GIT} "$@"\n`, { mode: 0o755 });
  return bin;
}

test("THE BOUND IS REAL: an origin that never answers costs the budget, not the session", { skip: process.platform === "win32" ? "POSIX shim" : false }, () => {
  const w = world();
  const saved = process.env.PATH;
  try {
    git(w.work, ["switch", "--quiet", "-c", "slice"]);
    // Node resolves the executable from PATH at spawn time, so this reaches the
    // gate's own `git` calls without touching the gate.
    process.env.PATH = `${stallingLsRemote(w.dir)}${path.delimiter}${saved}`;
    git(w.work, ["rev-parse", "HEAD"]); // through the shim once, so the measurement is not the shim's first read
    // The purse has to be comfortably clear of REMOTE_CALL_FLOOR_MS after the
    // three local calls, or the check legitimately declines to ask and this test
    // measures the test below instead — which is how its first version passed
    // while proving nothing (it returned in 960ms, having skipped the stall).
    const budgetMs = REMOTE_CALL_CAP_MS;
    const t0 = Date.now();
    const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs });
    const elapsed = Date.now() - t0;

    assert.match(base.reason ?? "", /did not answer inside/, `origin must actually have been ASKED and killed; it answered "${base.reason}" in ${elapsed}ms. If that names the floor, this machine's local git calls ate the purse — raise budgetMs here, do not relax the bound.`);
    assert.equal(base.reachedRemote, false, `origin never answered (measured ${elapsed}ms)`);
    assert.equal(base.contained, true, "so the local ref's answer stands");
    assert.equal(base.source, "local");
    assert.ok(
      elapsed < budgetMs + 700,
      `the check took ${elapsed}ms against a ${budgetMs}ms purse, with an origin that never answers. Past the ${declaredBudgetMs()}ms .claude/settings.json declares, this hook is KILLED and the decision it is holding is never delivered — which is a permitted command, not a refusal. Every subprocess here takes a timeout and killSignal SIGKILL and draws on one deadline.`,
    );
    process.stdout.write(`    [measured] stalled origin, ${budgetMs}ms purse: returned in ${elapsed}ms (${base.reason})\n`);
  } finally {
    process.env.PATH = saved;
    gone(w);
  }
});

test("BELOW THE FLOOR ORIGIN IS NOT ASKED AT ALL — the local half still runs, and says it is the local half", { skip: process.platform === "win32" ? "POSIX shim" : false }, () => {
  const w = world();
  const saved = process.env.PATH;
  try {
    git(w.work, ["switch", "--quiet", "-c", "slice"]);
    // The same shim: had this asked, it would have hung for 30s and been killed
    // at the purse. That it returns in a fraction of the purse, with a reason
    // naming the budget, is the proof it never asked.
    process.env.PATH = `${stallingLsRemote(w.dir)}${path.delimiter}${saved}`;
    git(w.work, ["rev-parse", "HEAD"]);
    const budgetMs = REMOTE_CALL_FLOOR_MS - 1;
    const t0 = Date.now();
    const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs });
    const elapsed = Date.now() - t0;

    assert.equal(base.contained, true, `the local half is the valuable half and must still run on a purse this small; it answered ${JSON.stringify(base)} in ${elapsed}ms`);
    assert.equal(base.source, "local");
    assert.equal(base.reachedRemote, false);
    assert.match(base.reason, /ms of the gate's budget was left/, "and the allow names the budget it did not have");
    assert.match(base.reason, /origin was not asked/);
    assert.ok(elapsed < budgetMs, `it returned in ${elapsed}ms: the three local git calls and nothing else. Asking a stalled origin would have run to the end of the ${budgetMs}ms purse.`);
    assert.match(decide("device", owed, TIERS, { base }).reason, /local ref/);
    process.stdout.write(`    [measured] ${budgetMs}ms purse, under the ${REMOTE_CALL_FLOOR_MS}ms floor: returned in ${elapsed}ms\n`);
  } finally {
    process.env.PATH = saved;
    gone(w);
  }
});

test("THE ARITHMETIC, READ OFF THE WIRING: the lane probe, the one question to origin, and the answer all fit in the declared budget", () => {
  const budget = declaredBudgetMs();
  // Four terms now, and the newest one is spent FIRST: resolving which tree the
  // command is about (KD-79) happens before the lane probe, before obligation()
  // and before anything is asked of origin. A term left out of this sum is a
  // bound nobody is holding to the budget, which is the whole failure this test
  // exists to keep impossible.
  const sum = TREE_PROBE_TOTAL_MS + LANE_PROBE_TOTAL_MS + REMOTE_CALL_CAP_MS + ANSWER_RESERVE_MS;
  assert.ok(
    sum <= budget,
    `the gate's own bounds sum to ${sum}ms against the ${budget}ms .claude/settings.json gives this hook. Past that it is killed and a decision it is holding is never delivered — a late refusal is a PERMITTED command. Lower REMOTE_CALL_CAP_MS (or raise the declared timeout, deliberately), never leave the sum above the budget.`,
  );
  assert.ok(REMOTE_CALL_FLOOR_MS <= REMOTE_CALL_CAP_MS, "the floor is the cheapest answer worth waiting for; the cap is the dearest");

  for (const elapsed of [0, 250, 3000, budget - ANSWER_RESERVE_MS - 500, budget - ANSWER_RESERVE_MS + 500]) {
    assert.ok(remoteBudgetMs(elapsed) <= budget - elapsed - ANSWER_RESERVE_MS, `at ${elapsed}ms spent, the purse must never exceed what is left minus the reserve`);
    assert.ok(remoteBudgetMs(elapsed) <= REMOTE_CALL_CAP_MS, `at ${elapsed}ms spent, the purse must never exceed the cap`);
  }
  assert.ok(remoteBudgetMs(budget - ANSWER_RESERVE_MS - 500) < REMOTE_CALL_FLOOR_MS, "late enough, the purse drops below the floor and origin is not asked");
  assert.ok(remoteBudgetMs(budget - ANSWER_RESERVE_MS + 500) < 0, "later still, it goes negative — and then nothing runs at all");
  assert.equal(baseContext(process.cwd(), { branch: "slice", isTrunk, budgetMs: 0 }).contained, null, "an empty purse runs NOTHING and answers 'could not', which is an allow");
  assert.equal(baseContext(process.cwd(), { branch: "slice", isTrunk, budgetMs: -1 }).contained, null);

  // The branch rule is handed in from scripts/proof-plan.mjs, where it is
  // defined once. A caller that forgets must LOSE the check, not gain a block.
  assert.equal(
    baseContext(process.cwd(), { branch: "slice", budgetMs: REMOTE_CALL_CAP_MS }).contained,
    null,
    "with no branch rule supplied, the check degrades to an allow that says so — and never to a refusal: a precondition whose own wiring is missing must not be the thing that stops a real device run",
  );
});

// A COUNT THAT WAS NEVER PRODUCED MUST NOT BE READ AS AN ABSENCE.
//
// `behind` is null whenever `git rev-list --count` produced no exit code — killed
// at its bound, killed from outside it, or never spawned. The refusal used to
// render that null as "HEAD does not have it at all", which is false in both
// branches that can print it: reaching either one means the commit IS present and
// WAS compared. Both review rounds found this class one cause at a time, so the
// sentence gets its own assertion rather than a note saying nobody checks it.
// It is reachable through `decide` alone — no git world needed, because the
// rendering is pure — which is why this costs two asserts and not a fixture.
test("a count git never produced is rendered as a count that could not be made, never as an absence", () => {
  for (const source of ["remote", "local"]) {
    const d = decide("device", owed, TIERS, { base: { contained: false, behind: null, sha: "0123456789abcdef0123456789abcdef01234567", source, reachedRemote: source === "remote", unfetched: false, reason: null } });
    assert.equal(d.action, "deny", "the branch still does not contain trunk — an uncountable distance is not a reprieve");
    assert.match(d.reason, /could not be counted/, `read from the ${source} ref, an absent count must say it is absent`);
    assert.doesNotMatch(
      d.reason,
      /does not (?:even )?have it/,
      `read from the ${source} ref, the commit IS present and WAS compared — only the DISTANCE is unknown. Saying the checkout does not have it is the same false-absence the killed-call rounds were about, in the one place it is printed rather than returned.`,
    );
  }
  // And the genuinely absent case still says so: that sentence is correct and must survive.
  const unfetched = decide("device", owed, TIERS, { base: { contained: false, behind: null, sha: "0123456789abcdef0123456789abcdef01234567", source: "remote", reachedRemote: true, unfetched: true, reason: null } });
  assert.match(unfetched.reason, /a commit this checkout does not even have/, "when origin names a commit we really do not have, the refusal still says exactly that");
});
