// A GIT CALL THAT DIED IS READ AS AN ANSWER — WHENEVER IT WAS NOT THIS GATE'S
// OWN KILL-TIMER THAT KILLED IT.
//
// test/a-git-call-the-gate-killed-is-read-as-an-answer.test.mjs fixed the
// INSTANCE: a call SIGKILLed by `spawnSync`'s own `timeout` no longer becomes
// "this checkout has no origin remote" / "no refs/remotes/origin/main" /
// `contained:false, unfetched:true`. The guard it added read `gitAt`'s
// `timedOut`, and `timedOut` was
//
//   Boolean(r.error && (r.error.code === "ETIMEDOUT" || r.signal === "SIGKILL"))
//
// — `r.error` FIRST, and node sets `r.error` for exactly three things: a spawn
// that never happened, its own timeout, and maxBuffer. A child that started and
// then died on a signal from ANYWHERE ELSE returns `{ error: undefined, status:
// null, signal: "SIGSEGV" | "SIGKILL" | "SIGTERM" }` — measured here, node
// 24.x — so `timedOut` is false, `spent` is false, `ok` is false, and the four
// call sites are back where round 1 found them:
//
//   git remote get-url origin         crashed -> "this checkout has no origin remote"
//   git rev-parse refs/remotes/...    crashed -> "no refs/remotes/origin/main to read"
//   git cat-file -e <remote>^{commit} crashed -> contained:false, unfetched:true -> DENY
//                                     "a commit this checkout does not even have"
//   (and with no `git` on PATH at all, the spawn fails and the FIRST of those
//    fires, saying a checkout with an origin has none — measured, one line:
//    PATH="/nowhere" node -e 'baseContext(repo, {branch:"slice", isTrunk})')
//
// Producers, none of them exotic on the machine this gate runs on: a git the
// kernel's memory pressure took out (jetsam SIGKILL, and `r.error` is undefined
// for it — it is indistinguishable from the gate's own SIGKILL only by that
// flag, which is the bug), a git that crashed (SIGSEGV/SIGBUS/SIGABRT — this
// project has a memory note about a node that segfaults under concurrent
// spawns), a `pkill git`, a process-group kill, or a fork that failed with
// EAGAIN under an emulator plus a gradle build. The device gate fires at exactly
// the moment the machine is busiest.
//
// THE INVARIANT IS "GIT PRODUCED NO ANSWER", NOT "THIS GATE'S TIMER FIRED".
// For every git call the ordering check's verdict rests on: if the call did not
// run to completion and exit — killed by anyone, crashed, or never spawned — the
// check must come back unable to answer (the allow that says so), and must never
// become a refusal, and must never become a sentence asserting that a remote, a
// ref or a commit is absent. `spawnSync` states it in one field: `status ===
// null` means no exit code was ever produced. Nothing else is needed to tell the
// two apart, and no enumeration of the ways a process can fail to answer can be
// complete — which is why round 1's two named ways (`spent`, `timedOut`) left
// this open. Both fields are gone: `gitAt` reports `answered` and a `why` that is
// true of the particular cause, and the formula quoted above no longer exists in
// the tree. It is quoted here because a test that says only what the code now
// does cannot tell you which reading of it was wrong.
//
// The world here is a LOCAL BARE REPO and the deaths are a PATH shim, so this
// file makes no network call, passes offline, and takes milliseconds: the
// shimmed git dies at once rather than being waited out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { baseContext, decide } from "../scripts/hooks/proof-gate.mjs";
import { isTrunk, TIERS } from "../scripts/proof-plan.mjs";

const owed = { state: "owed", plan: { slice: "s", branch: "slice" }, need: { reason: "r" }, branch: "slice", review: { state: "none" } };

const IDENTITY = ["-c", "user.email=gate@example.invalid", "-c", "user.name=Ordering Gate", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];
function git(cwd, args) {
  const r = spawnSync("git", [...IDENTITY, ...args], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} in ${cwd} exited ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * The same world round 1's file builds, and for the same reason: the slice's own
 * commit is now origin/main while refs/remotes/origin/main is still behind, so
 * the local ref says "contained", origin disagrees with it, and the commit
 * origin names is one this checkout HAS. That is the only world in which all
 * five calls are reached — and in it the true verdict is "contained", so a
 * refusal below is false whatever produced it.
 */
function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "died-git-call-"));
  const origin = path.join(dir, "origin.git");
  const work = path.join(dir, "work");
  fs.mkdirSync(origin);
  fs.mkdirSync(work);
  git(origin, ["init", "--bare", "--quiet"]);
  git(work, ["init", "--quiet"]);
  const commit = (t) => {
    fs.writeFileSync(path.join(work, "f.txt"), `${t}\n`);
    git(work, ["add", "."]);
    git(work, ["commit", "--quiet", "-m", t]);
  };
  commit("one");
  git(work, ["remote", "add", "origin", origin]);
  git(work, ["push", "--quiet", "-u", "origin", "main"]);
  const before = git(work, ["rev-parse", "HEAD"]);
  git(work, ["switch", "--quiet", "-c", "slice"]);
  commit("the slice");
  git(work, ["push", "--quiet", "origin", "slice:main"]);
  git(work, ["update-ref", "refs/remotes/origin/main", before]);
  return { dir, work };
}

const REAL_GIT = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();

/**
 * A `git` that dies on the named call the way a crash or an OOM kill does: the
 * signal reaches a process that has already started, and no exit code is ever
 * produced. `exec` is not used and must not be — the point is that the SHELL
 * dies, i.e. that the child node waited on terminated by signal, with node's own
 * kill-timer never involved. Every other call is the real git.
 *
 * THE SHIM KEEPS ITS OWN RECORD, and that record is what says which path the run
 * took (KD-165). It writes `reached` before signalling itself, and `survived`
 * after — a line that can only appear if the signal did NOT end the process, in
 * which case whatever ended the call was the gate's own 1000ms kill-timer, i.e.
 * round 1's case and not this one. So:
 *
 *   reached, no survived   the call ran and died on OUR signal — the case under test
 *   no reached             the call was never made (a purse that ran dry, an
 *                          earlier call that died first): nothing was exercised
 *   survived               the signal did not kill it; the timer is what ended it
 *
 * This replaces a wall-clock bound (`elapsed < 600ms`) that a loaded machine
 * crossed while the code under test was behaving perfectly — one tree, a FAIL
 * and a PASS three minutes apart, KD-165.
 */
function diesOn(dir, token, signal) {
  const bin = path.join(dir, `bin-${token.replace(/\W/g, "")}`);
  fs.mkdirSync(bin, { recursive: true });
  const marks = path.join(bin, "marks");
  fs.rmSync(marks, { force: true });
  const shim = path.join(bin, "git");
  fs.writeFileSync(
    shim,
    `#!/bin/sh\nfor a in "$@"; do\n  if [ "$a" = "${token}" ]; then echo reached >> "${marks}"; kill -${signal} $$; echo survived >> "${marks}"; sleep 5; fi\ndone\nexec ${REAL_GIT} "$@"\n`,
    { mode: 0o755 },
  );
  // WARMED, on an argument that matches no token and so is the real git: macOS
  // charges ~500ms to the FIRST exec of a newly written executable, and that
  // half-second is spent inside the very kill-timer under test. Cold, a call
  // could hit its 1000ms cap and die of the timer instead — which is round 1's
  // case, already covered, and would make these cases pass for the wrong reason
  // the moment the timer path is the one that is fixed.
  spawnSync(shim, ["--version"], { encoding: "utf8", timeout: 10000 });
  const read = () => {
    try {
      return fs.readFileSync(marks, "utf8").split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  return { bin, read };
}

/** Every git call the ordering check makes, by the argument that identifies it, and a way it can die that is not this gate's timer. */
const CALLS = [
  ["get-url", "KILL"],
  ["rev-parse", "SEGV"],
  ["--is-ancestor", "TERM"],
  ["ls-remote", "KILL"],
  ["cat-file", "SEGV"],
];

/**
 * The gate's own timer says so in words. `whyNoAnswer` gives each cause a
 * sentence that is true of THAT cause, and the two below are the ones that mean
 * "this run did not exercise the case": a call the gate killed at its bound is
 * round 1's case, and a purse that ran dry never reached the death at all.
 * Reading them is how this file knows which path a run took without timing it.
 */
const THE_GATES_OWN_TIMER = /killed at its bound/;
const NEVER_ASKED = /budget ran out before git could be asked|origin was not asked/;

/**
 * One purse for the whole check, and it is DELIBERATELY LARGE (the gate's own
 * default is a fraction of this). The purse is not what this file measures — the
 * caps inside the check are unchanged by it, since every call is bounded by
 * `min(capMs, whatever is left)` — and a purse sized for a quiet machine is the
 * one thing here that a busy machine can empty, which turns "the death was never
 * reached" into a failure about load. The test's own remedy line has always said
 * so: *raise budgetMs at this call site, do not relax the bound.*
 */
const A_PURSE_NO_LOAD_CAN_EMPTY_MS = 60_000;

const ASSERTS_ABSENCE = /has no origin remote|has no refs\/|does not even have/;
const ADMITS_IT_DID_NOT_ANSWER = /did not answer|could not|ran out|not be reached/;

test("node sets no `error` for a child killed by anyone but node — so `timedOut` cannot be the flag that means 'no answer'", () => {
  for (const sig of ["KILL", "SEGV", "TERM"]) {
    const r = spawnSync("sh", ["-c", `kill -${sig} $$; sleep 5`], { encoding: "utf8", timeout: 10000, killSignal: "SIGKILL" });
    assert.equal(r.error, undefined, `a child killed by SIG${sig} leaves spawnSync's \`error\` unset, so any guard reading \`r.error &&\` is blind to it`);
    assert.equal(r.status, null, "and `status` is null: NO EXIT CODE WAS EVER PRODUCED, which is the fact the check needs and the one it does not read");
    assert.equal(r.signal, `SIG${sig}`);
  }
});

test("a git call that died outside the kill-timer is not an answer: crashing each one in turn must cost the check its verdict, never win one", { skip: process.platform === "win32" ? "POSIX shim" : false }, () => {
  const w = world();
  const saved = process.env.PATH;
  try {
    // THE CONTROL. Every call answering, so the true verdict in this world is
    // "contained", from origin itself — nothing below may refuse.
    const control = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: A_PURSE_NO_LOAD_CAN_EMPTY_MS });
    assert.deepEqual(
      { contained: control.contained, source: control.source, reachedRemote: control.reachedRemote },
      { contained: true, source: "remote", reachedRemote: true },
      `the control must reach origin and be told this branch contains trunk, or the cases below prove nothing: ${JSON.stringify(control)}`,
    );
    assert.equal(decide("device", owed, TIERS, { base: control }).action, "allow");

    const wrong = [];
    const judge = (label, base, extra = "") => {
      const d = decide("device", owed, TIERS, { base });
      const seen = `${label} -> ${JSON.stringify(base)}\n      the agent reads: ${d.reason.split("\n\n").pop()}`;
      if (/origin was not asked/.test(String(base.reason ?? ""))) wrong.push(`never asked origin, so the death was never reached: raise budgetMs at this call site, do not relax the bound. ${seen}`);
      else if (d.action === "deny") wrong.push(`REFUSED a run on a question git never answered${extra}: ${seen}`);
      else if (ASSERTS_ABSENCE.test(d.reason)) wrong.push(`told the agent something absent that is not${extra}: ${seen}`);
      else if (!ADMITS_IT_DID_NOT_ANSWER.test(String(base.reason ?? ""))) wrong.push(`allowed without saying git never answered${extra}: ${seen}`);
      else process.stdout.write(`    [ok] ${label}: ${base.reason}\n`);
    };

    for (const [call, signal] of CALLS) {
      const shim = diesOn(w.dir, call, signal);
      process.env.PATH = `${shim.bin}${path.delimiter}${saved}`;
      const t0 = Date.now();
      const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: A_PURSE_NO_LOAD_CAN_EMPTY_MS });
      const elapsed = Date.now() - t0;
      process.env.PATH = saved;

      // WHICH PATH THIS RUN TOOK, read from what the shim and the gate each
      // RECORDED — never from how long the machine took (KD-165: the same tree
      // carried a FAIL and a PASS three minutes apart, separated by nothing but
      // load, on a `elapsed < 600ms` bound). Both facts below are the run's own:
      const marks = shim.read();
      const reason = String(base.reason ?? "");
      assert.ok(
        marks.includes("reached"),
        `\`git … ${call} …\` was never called (the shim left no mark in ${elapsed}ms), so this case exercised nothing: raise budgetMs at this call site, do not relax what it asserts. The check said: ${reason || JSON.stringify(base)}`,
      );
      assert.ok(
        !marks.includes("survived"),
        `\`git … ${call} …\` was signalled SIG${signal} and did NOT die of it, so whatever ended that call was the gate's own kill-timer — which is round 1's case and is already owned by test/a-git-call-the-gate-killed-is-read-as-an-answer.test.mjs, not this file`,
      );
      assert.doesNotMatch(
        reason,
        THE_GATES_OWN_TIMER,
        `\`git … ${call} …\` died on SIG${signal}, but the gate reports the death as its own timer's, so this case is round 1's and proves nothing here: ${reason}`,
      );
      assert.doesNotMatch(
        reason,
        NEVER_ASKED,
        `the check ran out of purse before it reached \`git … ${call} …\`, so the death under test was never in the path: raise budgetMs at this call site, do not relax what it asserts: ${reason}`,
      );
      judge(`\`git … ${call} …\` died on SIG${signal} after ${elapsed}ms`, base);
    }

    // AND THE SPAWN THAT NEVER HAPPENED. Same class, other end: no exit code,
    // because no process. It can only reach the first call, and that is enough
    // to show the sentence is about the checkout and not about git.
    process.env.PATH = path.join(w.dir, "no-git-here");
    const unspawnable = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: A_PURSE_NO_LOAD_CAN_EMPTY_MS });
    process.env.PATH = saved;
    judge("`git` could not be spawned at all (empty PATH)", unspawnable, " about a checkout whose origin this test just pushed to");

    assert.deepEqual(
      wrong,
      [],
      `these git calls produced NO EXIT CODE — killed by something other than this gate's own timer, or never spawned — and their non-answer was read as an answer. \`timedOut\` cannot carry this: it is gated on spawnSync's \`error\`, which node sets only for its own timeout, its own maxBuffer, and a failed spawn, so a git that crashed or was killed by the OS passes straight through it. The fact that separates the two is \`status === null\` — no exit code was ever produced — and it is already on gitAt()'s return:\n\n  - ${wrong.join("\n\n  - ")}\n`,
    );
  } finally {
    process.env.PATH = saved;
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});
