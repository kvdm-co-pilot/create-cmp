// A GIT CALL THE GATE KILLED IS READ AS AN ANSWER.
//
// The ordering precondition in scripts/hooks/proof-gate.mjs runs every git call
// on one purse with `timeout` and `killSignal: "SIGKILL"`, which is right: a
// refusal delivered past the hook's declared timeout is a permitted command.
// But a call that was KILLED returned no answer, and `baseContext`/`askOrigin`
// read four of their five calls as though it had:
//
//   git remote get-url origin        killed -> "this checkout has no origin remote"
//   git rev-parse refs/remotes/...   killed -> "this checkout has no refs/remotes/origin/main to read"
//   git cat-file -e <remote>^{commit} killed -> contained:false, unfetched:true
//                                     -> DENY, "a commit this checkout does not even have"
//
// The first two are false statements about a checkout that has both. The third
// is a false REFUSAL, and it is the one that costs: measured on this tree, the
// same world, the same question, with only a 1s `cat-file` between them —
//
//   git answers:  { contained: true,  source: "remote" }              -> allow
//   git is killed:{ contained: false, unfetched: true }               -> deny
//     "origin/main has MOVED to 03c702b, a commit this checkout does not
//      even have" — 03c702b being this checkout's own HEAD.
//
// That is the one thing this precondition's own header forbids: "a question git
// cannot answer must ALLOW", and "a refusal computed with no time to compute it
// is a guess". The `spent` flag the three of them branched on was not the flag
// that says so — it was only ever true when the purse was empty BEFORE the spawn,
// which for the first call in the check cannot happen.
//
// The first fix for this added a second flag, `timedOut`, and the round after it
// found that naming causes cannot be complete: a child killed from OUTSIDE node's
// own timer sets neither. Both flags are gone. `gitAt` now reports `answered` —
// `typeof status === "number"`, an exit code or no exit code — and a `why` that
// is true of the particular cause. This file predates that and is kept as the
// round that found the first half.
//
// THE INVARIANT IS THE CLASS, not the three calls: for every git call whose
// answer the check's VERDICT rests on, being killed must leave the check unable
// to answer — an allow that says git did not answer — and must never become a
// refusal, and must never become a sentence asserting that a remote, a ref or a
// commit is absent. The check cannot distinguish "git said no" from "git was not
// allowed to finish" unless it looks, so each call is stalled in turn and the
// verdict read off the same world.
//
// The one call NOT in the loop is `behindBy`'s `git rev-list --count HEAD..<sha>`,
// which is reached only on the refusal path and cannot change the verdict — but
// it carried the same defect in its RENDERING: killed, it returns null, and
// `orderedRun` turned that null into "HEAD does not have it at all", about a
// commit this checkout has and could count. That phrase was corrected alongside
// the five cases below — it now says how far behind could not be counted — and
// reaching it through a real git world needs a stall this file does not build.
// It does not need one: the rendering is pure, so it is pinned through `decide`
// with a hand-built base, in test/a-device-run-proves-a-tree-the-merge-will-not-keep.test.mjs
// ("a count git never produced is rendered as a count that could not be made").
//
// origin is a LOCAL BARE REPO and the stall is a PATH shim, so this file makes no
// network call and passes offline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { baseContext, decide, REMOTE_CALL_CAP_MS } from "../scripts/hooks/proof-gate.mjs";
import { isTrunk, TIERS } from "../scripts/proof-plan.mjs";

const owed = { state: "owed", plan: { slice: "s", branch: "slice" }, need: { reason: "r" }, branch: "slice", review: { state: "none" } };

const IDENTITY = ["-c", "user.email=gate@example.invalid", "-c", "user.name=Ordering Gate", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];
function git(cwd, args) {
  const r = spawnSync("git", [...IDENTITY, ...args], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} in ${cwd} exited ${r.status}: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * ONE WORLD in which all five of the check's git calls are reached, and in which
 * the true answer is "contained" — so a refusal here is false whatever produced
 * it.
 *
 * The slice's own commit is now origin/main (the shape of every merged PR read
 * from a checkout that has not pulled since), while refs/remotes/origin/main is
 * still where it was. So: the local ref says contained, origin disagrees with the
 * local ref, and the commit origin names is one this checkout HAS — which is what
 * takes the check through `ls-remote`, `cat-file` and the second `--is-ancestor`.
 */
function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "killed-git-call-"));
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
  git(work, ["push", "--quiet", "origin", "slice:main"]); // it landed
  git(work, ["update-ref", "refs/remotes/origin/main", before]); // this checkout has not pulled since
  return { dir, work };
}

// The shim has to `exec`, so the process SIGKILL reaches IS the sleeper: a shell
// that merely waited would die while the sleeper held the stdout pipe open, and
// spawnSync would read it long past the timeout.
const REAL_GIT = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
function stallOn(dir, token) {
  const bin = path.join(dir, `bin-${token.replace(/\W/g, "")}`);
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "git"), `#!/bin/sh\nfor a in "$@"; do\n  if [ "$a" = "${token}" ]; then exec sleep 30; fi\ndone\nexec ${REAL_GIT} "$@"\n`, { mode: 0o755 });
  return bin;
}

/** Every git call the ordering check makes, by the argument that identifies it. */
const CALLS = ["get-url", "rev-parse", "--is-ancestor", "ls-remote", "cat-file"];

const ASSERTS_ABSENCE = /has no origin remote|has no refs\/|does not even have/;
const ADMITS_IT_DID_NOT_ANSWER = /did not answer|could not|ran out/;

test("a git call the gate killed is not an answer: stalling each one in turn must cost the check its verdict, never win one", { skip: process.platform === "win32" ? "POSIX shim" : false }, () => {
  const w = world();
  const saved = process.env.PATH;
  try {
    // THE CONTROL. With every call answering, the true verdict in this world is
    // "contained", from origin itself — so nothing below may refuse.
    const control = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: REMOTE_CALL_CAP_MS });
    assert.deepEqual(
      { contained: control.contained, source: control.source, reachedRemote: control.reachedRemote },
      { contained: true, source: "remote", reachedRemote: true },
      `the control must reach origin and be told this branch contains trunk, or the cases below prove nothing: ${JSON.stringify(control)}`,
    );
    assert.equal(decide("device", owed, TIERS, { base: control }).action, "allow");

    const wrong = [];
    for (const call of CALLS) {
      // No warm-up call through the shim: for `rev-parse` the shim IS the stall,
      // and a helper without a timeout would wait out the whole `sleep`.
      process.env.PATH = `${stallOn(w.dir, call)}${path.delimiter}${saved}`;
      const t0 = Date.now();
      const base = baseContext(w.work, { branch: "slice", isTrunk, budgetMs: REMOTE_CALL_CAP_MS });
      const elapsed = Date.now() - t0;
      process.env.PATH = saved;
      const d = decide("device", owed, TIERS, { base });
      const seen = `\`git … ${call} …\` killed after ${elapsed}ms -> ${JSON.stringify(base)}\n      the agent reads: ${d.reason.split("\n\n").pop()}`;

      // A case that never reached the stalled call proves nothing and must not
      // read as a pass — the purse has to be comfortably clear of the floor
      // after the local half, or the two remote cases quietly skip the stall.
      if (/origin was not asked/.test(String(base.reason ?? ""))) wrong.push(`never asked origin, so the ${call} stall was never reached: raise budgetMs at this call site, do not relax the bound. ${seen}`);
      else if (d.action === "deny") wrong.push(`REFUSED a run on a question git never answered: ${seen}`);
      else if (ASSERTS_ABSENCE.test(d.reason)) wrong.push(`told the agent something absent that is not: ${seen}`);
      else if (!ADMITS_IT_DID_NOT_ANSWER.test(String(base.reason ?? ""))) wrong.push(`allowed without saying git was killed: ${seen}`);
      else process.stdout.write(`    [ok] ${call} killed after ${elapsed}ms: ${base.reason}\n`);
    }
    assert.deepEqual(
      wrong,
      [],
      `these git calls were SIGKILLed by the gate's own purse and their non-answer was read as an answer. A killed call must return the check to "could not ask" — the allow that says so — never a refusal and never an assertion of absence. gitAt() reports \`answered\` (an exit code, or none) for exactly this; a caller that branches on anything narrower is naming causes, and naming causes is how the last one of these was missed:\n\n  - ${wrong.join("\n\n  - ")}\n`,
    );
  } finally {
    process.env.PATH = saved;
    fs.rmSync(w.dir, { recursive: true, force: true });
  }
});
