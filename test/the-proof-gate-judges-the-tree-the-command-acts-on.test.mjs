// THE GATE MUST JUDGE THE TREE THE COMMAND WILL ACT ON — NOT THE ONE IT LIVES IN.
//
// KD-79, measured 2026-09-18 and paid for three times in one session. The hook
// derives its root from its own file's location, and `.claude/settings.json`
// runs it as `node "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/proof-gate.mjs"` — so
// the tree it judges is always the SESSION's, whatever tree the command it is
// gating will actually run in. With more than one worktree of this repository
// checked out at once, which is how this repo is worked, those are routinely
// different trees. What it cost:
//
//   1. A `fleet-check` that WAS owed was refused, with the reason "nothing is
//      owed — every changed path is declared unable to affect fleet L2" over a
//      change set that was not the running tree's. The slice could not close its
//      own last gate until a human moved a worktree onto the right branch by hand.
//   2. `gh pr merge` on PR #150 was refused, naming three files that were not in
//      that PR — another slice's uncommitted work in the session's worktree.
//
// And the same defect has a FAIL-OPEN half that nobody measured, because it is
// silent: a merge in a worktree that owes both at-close tiers is ALLOWED when the
// session's own tree happens to owe nothing. One bug, two directions; the
// refusing direction is merely the one that got noticed.
//
// So the property is not "refuse more" or "refuse less". It is: THE VERDICT
// FOLLOWS THE TREE THE COMMAND WILL ACT ON, and when that tree cannot be
// determined the gate REFUSES — this gate's whole value is that it over-refuses
// rather than certifying something false.
//
// THE FIXTURE IS TWO WORKTREES OF ONE THROWAWAY REPOSITORY, because that is the
// only shape in which the two readers can disagree, and a copy of THIS tree's
// `scripts/` is what they run — so these tests exercise the hook as it is now,
// not a paraphrase of it. `slice` is checked out INSIDE the session worktree
// (`.claude/worktrees/`), exactly where this repo puts them, which is also why no
// path-prefix shortcut can ever stand in for asking git: the tree that must be
// judged is a subdirectory of the tree that must not be.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEVICE = "CMP_AVD=Medium_Phone_API_35 node scripts/fleet-check.mjs --min-level L2";

/** The session's worktree (A), the tree a command is about (B), and a repository that is none of this gate's business (C). */
let tmp, A, B, C, env, hook;

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} in ${cwd}: ${r.stderr}`);
  return r.stdout.trim();
}

const commit = (cwd, message) =>
  git(cwd, ["-c", "user.email=fixture@example.com", "-c", "user.name=fixture", "-c", "commit.gpgsign=false", "commit", "-qm", message]);

/**
 * What a tree's OWN scheduler says it owes — the reader the hook is supposed to
 * agree with. It exits 1 while anything is outstanding, so the exit code is half
 * the premise and is asserted rather than discarded.
 */
function schedule(tree) {
  const r = spawnSync(process.execPath, [path.join(tree, "scripts", "proof-plan.mjs")], { cwd: tree, encoding: "utf8", env });
  assert.ok(r.status === 0 || r.status === 1, `the scheduler failed in ${tree}: ${r.stderr}`);
  return { outstanding: r.status === 1, text: r.stdout };
}

/**
 * One PreToolUse decision from the hook that lives in A, as Claude Code delivers
 * it: `cwd` in the payload, and the hook process itself started in the session's
 * own directory. No stdout at all is the gate's third answer — silence.
 */
function pre(command, cwd) {
  const payload = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } };
  if (cwd !== undefined) payload.cwd = cwd;
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), cwd: A, encoding: "utf8", env, timeout: 20000 });
  assert.equal(r.signal, null, `the hook was killed rather than answering: ${r.stderr}`);
  assert.equal(r.status, 0, `the hook failed rather than deciding: ${r.stderr}`);
  if (!r.stdout) return { action: "silent", reason: "" };
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  return { action: out.permissionDecision, reason: out.permissionDecisionReason };
}

before(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gate-judges-the-tree-")));
  A = path.join(tmp, "session-worktree");
  B = path.join(A, ".claude", "worktrees", "slice");
  C = path.join(tmp, "another-repository");

  fs.mkdirSync(A, { recursive: true });
  fs.cpSync(path.join(LIVE, "scripts"), path.join(A, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(A, "packages", "harness", "src", "lib"), { recursive: true });
  fs.copyFileSync(
    path.join(LIVE, "packages", "harness", "src", "lib", "affected-tests.mjs"),
    path.join(A, "packages", "harness", "src", "lib", "affected-tests.mjs"),
  );
  fs.mkdirSync(path.join(A, ".claude"), { recursive: true });
  fs.copyFileSync(path.join(LIVE, ".claude", "settings.json"), path.join(A, ".claude", "settings.json"));
  // The two directories a worktree of this repo carries and never commits. With
  // them tracked, each tree's change set would be dominated by its own
  // bookkeeping and neither premise below would be about a trigger path.
  fs.writeFileSync(path.join(A, ".gitignore"), ".claude/worktrees/\nqa-artifacts/\n");

  git(A, ["init", "-q", "-b", "main"]);
  git(A, ["add", "-A"]);
  commit(A, "the base both worktrees share");
  // A trunk to be measured against. `changedPaths()` reads refs/remotes/origin/main
  // and nothing else, so the ref alone is enough and no remote is configured —
  // which also keeps the ordering check off the network (it says so, and allows).
  git(A, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(A, ["worktree", "add", "-q", "-b", "slice", B]);
  git(A, ["checkout", "-q", "-b", "session-worktree"]);

  // A owes nothing: `docs/` is declared unable to affect either at-close tier.
  fs.mkdirSync(path.join(A, "docs"), { recursive: true });
  fs.writeFileSync(path.join(A, "docs", "only.md"), "prose, and nothing else\n");
  // B owes the device tier: `packages/harness/src/` is a device trigger path.
  fs.mkdirSync(path.join(B, "packages", "harness", "src"), { recursive: true });
  fs.writeFileSync(path.join(B, "packages", "harness", "src", "x.mjs"), "export const x = 1;\n");

  fs.mkdirSync(C, { recursive: true });
  git(C, ["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(C, "README"), "someone else's project\n");
  git(C, ["add", "-A"]);
  commit(C, "not this repository");

  // THE PROCESS TABLE, MADE DETERMINISTIC. `runningLane()` runs `pgrep -f
  // 'qa/verify.mjs'` machine-wide, so without this the verdicts below would
  // depend on whether another agent happens to be running a lane right now. An
  // empty process table is the degradation the hook already documents (null, and
  // the run proceeds), not a behaviour invented for this test.
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "pgrep"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    PROOFLANE_HISTORY_DIR: path.join(tmp, "history"),
    PROOFLANE_SUITE_ROOT: path.join(tmp, "suite"),
  };
  hook = path.join(A, "scripts", "hooks", "proof-gate.mjs");

  const open = spawnSync(process.execPath, [path.join(B, "scripts", "proof-plan.mjs"), "--open", "the slice this command is about"], {
    cwd: B,
    encoding: "utf8",
    env,
  });
  assert.equal(open.status, 0, open.stderr);
});

after(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test("the premise KD-79 measured: two worktrees of one repository, and only one of them owes the device tier", () => {
  const session = schedule(A);
  const slice = schedule(B);
  assert.match(session.text, /device \(fleet L2\) NOT OWED/, `the session's worktree owes nothing — its only change is prose:\n${session.text}`);
  assert.equal(session.outstanding, false, `and so its scheduler exits clean:\n${session.text}`);
  assert.match(slice.text, /device \(fleet L2\) OWED/, `the tree the command is about owes the tier — its change is a trigger path:\n${slice.text}`);
  assert.match(slice.text, /packages\/harness\/src\/x\.mjs/, "and it says which path obliges it");
  assert.equal(slice.outstanding, true, "so its scheduler exits 1");
});

test("a device run is judged by the tree it will run in — the refusal KD-79 could not get past", () => {
  // Both spellings of "this command runs over there": the session's cwd IS the
  // other worktree, and the command says so itself with a leading `cd`. The first
  // is how a subagent with its own worktree runs; the second is how the main
  // session reaches one.
  for (const [how, command, cwd] of [
    ["the session runs in it", DEVICE, B],
    ["the command cd's into it", `cd ${B} && ${DEVICE}`, A],
  ]) {
    const d = pre(command, cwd);
    assert.doesNotMatch(d.reason, /nothing is owed/, `${how}: the tier IS owed in the tree this run would prove`);
    assert.equal(d.action, "allow", `${how}: ${d.reason}`);
    assert.match(d.reason, /the device tier is OWED/, how);
    // And it says WHICH tree it judged. KD-79's refusals were unplaceable —
    // they named a change set the reader could not locate — so a verdict about
    // a tree other than the gate's own has to name it, which is also what makes
    // a wrong resolution visible instead of mysterious.
    assert.ok(d.reason.includes(`JUDGED TREE: ${B}`), `${how}: the decision must name the tree it judged — ${d.reason}`);
  }
});

test("a merge is refused for what the tree it merges owes — the fail-open half of the same defect", () => {
  // Nothing measured this one, because it is silent: the session's worktree owes
  // nothing, so the gate said nothing, and a merge that owed both at-close tiers
  // went through. That is the direction this gate exists to make impossible.
  const d = pre(`cd ${B} && gh pr merge 1 --rebase --delete-branch`, A);
  assert.equal(d.action, "deny", d.reason);
  assert.match(d.reason, /the device tier is OWED/);
  assert.match(d.reason, /a review is OWED/);
});

test("a cd inside a subshell that has already closed changes nothing, and is not read as if it had", () => {
  // `x=$(cd /elsewhere && pwd) && gh pr merge` runs the merge exactly where it
  // started. A parser that read that `cd` would hand the gate a tree the command
  // never touches — KD-79 again, with this file's own reader as the mistaken one.
  const d = pre(`REF=$(cd ${A} && git rev-parse HEAD) && gh pr merge 1 --rebase`, B);
  assert.equal(d.action, "deny", d.reason);
  assert.match(d.reason, /the device tier is OWED/, "the merge still runs in the slice worktree, which owes both tiers");
  // And the same `cd` at the depth the command is at DOES apply.
  assert.equal(pre(`(cd ${A} && gh pr merge 1 --rebase)`, B).action, "silent", "inside the same subshell, the cd is the command's own");
});

test("the tree the hook lives in is still judged exactly as before, including with no cwd to read", () => {
  // The fix must not make the gate stop answering for its own tree — that is
  // every other test of this hook, and the common case by a wide margin.
  for (const [how, cwd] of [
    ["the payload names it", A],
    ["the payload carries no cwd, so the hook's own is read", undefined],
  ]) {
    const d = pre(DEVICE, cwd);
    assert.equal(d.action, "deny", how);
    assert.match(d.reason, /nothing is owed/, how);
    assert.equal(pre("gh pr merge 1 --rebase", cwd).action, "silent", `${how}: nothing owed, nothing said`);
  }
});

test("when the gate cannot tell which tree the command acts on, it REFUSES", () => {
  // Every one of these is a command whose tree is genuinely unreadable here. The
  // answer is the same in all of them, and it is not "assume the session's".
  // Each carries the phrase for its OWN cause: a gate that refuses five different
  // things with one sentence has stopped saying anything true about any of them,
  // and the reader of the refusal is the one who has to fix the command.
  const unreadable = [
    ["a cd this gate cannot read literally", `cd "$SLICE_DIR" && gh pr merge 1`, /cannot read literally/],
    ["a cd into a path with a space in it", `cd "${tmp}/my worktrees/slice" && gh pr merge 1`, /cannot read literally/],
    ["a cd into a directory that is not there", `cd ${path.join(tmp, "no-such-worktree")} && gh pr merge 1`, /is not there/],
    ["a repository named out of band", "gh pr merge 1 --repo someone/create-cmp", /out of band/],
    ["the same, in the environment", "GH_REPO=someone/create-cmp gh pr merge 1", /out of band/],
    ["a directory changed by something other than cd", `pushd ${B} && gh pr merge 1`, /pushd/],
    // The two halves of "this reader could not even find the commands". A shell
    // would reject the first outright and read the second as the tail of
    // something that began out of sight; either way the tree is not knowable.
    ["a quotation the prefix never closes", `cd ${B} " && gh pr merge 1`, /never closes/],
    ["a `)` whose opener this reader never saw", `cd ${B} ) && gh pr merge 1`, /no opener/],
    ["a device run whose tree is unreadable", `cd "$SLICE_DIR" && ${DEVICE}`, /cannot read literally/],
    // npm publishes a PACKAGE, and the three ways of naming one that is not the
    // directory the command runs in are the same defect wearing npm's flags.
    ["a package relocated by --prefix", `npm publish --prefix ${A}`, /out of band/],
    ["a package relocated to a workspace", "npm publish -w packages/harness", /out of band/],
    ["a package named as a folder operand", "npm publish ./packages/harness", /rather than the directory it runs in/],
    ["a package named as a tarball", "npm publish --access public create-cmp-0.1.0.tgz", /rather than the directory it runs in/],
  ];
  for (const [how, command, why] of unreadable) {
    const d = pre(command, A);
    assert.equal(d.action, "deny", `${how}: ${d.reason}`);
    assert.match(d.reason, /could not tell which tree/, how);
    assert.match(d.reason, why, `${how}: the refusal must say what it could not read — ${d.reason}`);
  }
});

test("the forms this gate DOES honour resolve, and chain", () => {
  // The three honoured forms, each one asserted to land on the slice worktree —
  // because a reader that refuses everything it does not understand is only
  // useful if what it does understand covers the way the work is actually done.
  const owed = (d, how) => {
    assert.equal(d.action, "allow", `${how}: ${d.reason}`);
    assert.match(d.reason, /the device tier is OWED/, how);
    assert.ok(d.reason.includes(`JUDGED TREE: ${B}`), `${how}: ${d.reason}`);
  };
  owed(pre(`cd ${path.dirname(B)} && cd slice && ${DEVICE}`, A), "two cds compose");
  owed(pre(`cd ${B}/packages && ${DEVICE}`, A), "a subdirectory resolves to the worktree that holds it");
  owed(pre(`CMP_AVD=X node ${B}/scripts/fleet-check.mjs --min-level L2`, A), "the fleet check's own path names the tree it will prove");
  // And the real publish spelling — `cd <subdir> && npm publish` — still reads
  // the worktree that subdirectory belongs to (docs/PUBLISHING.md, the skill).
  const publish = pre(`cd ${B}/packages/harness && npm publish --access public`, A);
  assert.equal(publish.action, "deny", publish.reason);
  assert.match(publish.reason, /clean main/, "the slice branch is not trunk, which is what the publish gate checks");
  assert.doesNotMatch(publish.reason, /could not tell which tree/, "and it got there by reading the tree, not by failing to");
});

test("a `-R` that is not gh's repository flag leaves the tree perfectly readable", () => {
  // `-R` is gh's short --repo AND cp's recursive. Read over the whole command
  // string, the first refuses the second — a gate blocking real work for a reason
  // that is not true, which is the one failure this gate is least allowed to have
  // (KD-64 is the standing entry about making exactly this mistake).
  const d = pre(`cp -R ${A}/docs /tmp/kd79-not-a-real-copy && gh pr merge 1 --rebase`, B);
  assert.doesNotMatch(d.reason, /out of band/, d.reason);
  assert.equal(d.action, "deny", d.reason);
  assert.match(d.reason, /the device tier is OWED/, "and it is refused for what the tree actually owes");
});

test("gh pr create is still never blocked — it says it could not tell, and lets the PR be opened", () => {
  // `create` is advisory by design (the PR is the review surface, the merge is
  // the close), so the honest answer to an unreadable tree is to say so, not to
  // refuse. A reminder about the wrong tree's obligations would be worse than no
  // reminder: it is a true-sounding statement about somebody else's slice.
  const d = pre(`cd "$SLICE_DIR" && gh pr create --title x --body y`, A);
  assert.equal(d.action, "allow");
  assert.match(d.reason, /could not tell which tree/);
});

test("a cd the shell never performs does not move the tree the gate judges", () => {
  // THE FAIL-OPEN HALF, REACHED THROUGH THE FIX. The reader above scans the whole
  // prefix for a `cd` at what it takes to be a command position, and two of the
  // things it takes for one are not: the body of a nested `sh -c`, which is
  // ANOTHER PROCESS whose cwd dies with it, and a `cd` written inside a quoted
  // word. Both resolve a tree this merge will not touch — and here that tree is
  // the session's, which owes nothing, so the merge of a worktree owing BOTH
  // at-close tiers is allowed in silence. That is KD-79's measured fail-open
  // direction, with this gate's own parser as the mistaken reader.
  for (const [how, command] of [
    ["a nested sh -c's cd", `sh -c 'cd ${A} && git rev-parse HEAD' && gh pr merge 1 --rebase`],
    ["a cd inside a quoted word", `echo "next; cd ${A}" && gh pr merge 1 --rebase`],
  ]) {
    const d = pre(command, B);
    assert.notEqual(d.action, "silent", `${how}: the merge runs in ${B}, which owes both at-close tiers`);
    assert.equal(d.action, "deny", `${how}: ${d.reason}`);
    assert.match(d.reason, /the device tier is OWED/, how);
  }
});

test("a cd the shell DOES perform is not silently ignored in favour of the session's tree", () => {
  // The same reader's other half. `if`, `for` and `{ }` are command positions a
  // POSIX shell honours — a brace group is not even a subshell — and a `cd`
  // inside one is the command's own. Read as if it were not there, the gate
  // falls back on the payload's cwd, which is precisely the assumption this
  // slice exists to delete: "assume the session's" is the defect, not the
  // fallback. Refusing is a fine answer here; judging A is not.
  for (const [how, command] of [
    ["an if-branch that runs", `if true; then cd ${B}; fi; gh pr merge 1 --rebase`],
    ["a loop body", `for d in one; do cd ${B}; done; gh pr merge 1 --rebase`],
    ["a brace group", `{ cd ${B}; }; gh pr merge 1 --rebase`],
  ]) {
    const d = pre(command, A);
    assert.notEqual(d.action, "silent", `${how}: the merge runs in ${B}, and the gate judged the session's worktree instead`);
  }
});

test("another repository is not this gate's business", () => {
  // KD-64 is the same reader making the opposite mistake. This gate enforces THIS
  // repository's proof schedule; a command that acts on a tree which is not a
  // worktree of it has no obligation here to state, and refusing one would be a
  // gate blocking real work for a reason that is not true.
  assert.equal(pre(DEVICE, C).action, "silent");
  assert.equal(pre(`cd ${C} && gh pr merge 1`, A).action, "silent");
});
