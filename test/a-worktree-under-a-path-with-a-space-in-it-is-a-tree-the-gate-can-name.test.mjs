// A WORKTREE UNDER A PATH WITH A SPACE IN IT IS A TREE THE GATE CAN NAME — WHEN THE COMMAND QUOTES IT.
//
// KD-95. The proof gate reads the tree a command acts on from a leading `cd` and
// from a `node …/scripts/fleet-check.mjs` operand. As found, on 4b81ee1:
//
//   cd "/Users/k/my trees/slice" && gh pr merge    REFUSED, "a `cd` this gate cannot read literally (cd)"
//   cd "/tmp" && gh pr merge                       REFUSED the same way — no space needed. The
//                                                  reader blanks every quoted span before it
//                                                  looks for a `cd`, so a quoted operand reached
//                                                  it as blanks, whatever was inside the quotes
//   node "/Users/k/my trees/scripts/fleet-check.mjs"
//                                                  NOT CLASSIFIED. The device pattern's `\S*/`
//                                                  cannot cross the space, so the hook said
//                                                  nothing and the run went ahead UNGATED
//
// The entry recorded the third as a refusal ("a form this gate cannot resolve to
// a file"). It was silence — the direction this gate exists to make impossible.
//
// QUOTES DELIMIT, so a space inside them is part of the path and the path can be
// read exactly. What the shell would EXPAND or ESCAPE still cannot be, quoted or
// not, and stays refused: `$`, a backquote, a glob, `~`, a backslash, a quotation
// that never closes, and a word the shell assembles from quoted and unquoted
// pieces. The gate's rule is unchanged — the tree the command RUNS IN, or a
// refusal (docs/GATE-RULES.md, Rule 4) — and `/bin/sh` is the oracle for where
// it runs, exactly as in test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { classify, commandCwd } from "../scripts/hooks/proof-gate.mjs";

const LIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATED = "gh pr merge 1 --rebase";
const DEVICE = "CMP_AVD=Medium_Phone_API_35 node scripts/fleet-check.mjs --min-level L2";

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gate-spaced-path-")));
const HERE = path.join(tmp, "here");
/** The shapes a real macOS path takes: a space, and an apostrophe beside it. */
const SPACED = path.join(tmp, "my trees", "slice");
const APOSTROPHE = path.join(tmp, "Karel's trees", "slice");
for (const d of [HERE, SPACED, APOSTROPHE]) fs.mkdirSync(d, { recursive: true });

/** Where /bin/sh runs the gated command — ground truth by construction, as in the oracle test. */
function whereTheShellRuns(command) {
  const r = spawnSync("/bin/sh", ["-c", command.replace(GATED, "pwd -P")], { cwd: HERE, encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 0, `the oracle shape did not run cleanly, so it cannot be ground truth: ${command}\n${r.stderr}`);
  return r.stdout.trim().split("\n").at(-1);
}

/** A path as a shell user would type it WITHOUT quotes: every space escaped. */
const escaped = (p) => p.replace(/ /g, "\\ ");

test("a quoted cd operand resolves to EXACTLY the directory /bin/sh runs the command in — not to a refusal", () => {
  // Stricter than the oracle test's property, on purpose: that one accepts a
  // refusal for every shape, and a refusal is exactly what KD-95 is. These are
  // the shapes this gate now claims to read, so reading them is the assertion.
  const refused = [];
  for (const [how, command] of [
    ["double-quoted, with a space", `cd "${SPACED}" && ${GATED}`],
    ["single-quoted, with a space", `cd '${SPACED}' && ${GATED}`],
    ["double-quoted, with an apostrophe beside the space", `cd "${APOSTROPHE}" && ${GATED}`],
    ["quoted with no space at all — refused as found, which is the tell that the reader never saw the quotes", `cd "${HERE}" && ${GATED}`],
    ["a quoted cd composed with a relative one", `cd "${path.dirname(SPACED)}" && cd slice && ${GATED}`],
    ["a quoted cd joined with ;", `cd '${SPACED}'; ${GATED}`],
  ]) {
    const truth = whereTheShellRuns(command);
    const got = commandCwd("merge", command, HERE);
    if (got.dir !== truth) refused.push(`${how}\n    command: ${JSON.stringify(command)}\n    the shell runs it in: ${truth}\n    the gate: ${got.unknown ? `REFUSED — ${got.unknown}` : got.dir}`);
  }
  assert.deepEqual(refused, [], `${refused.length} quoted operand(s) the gate could have read exactly and did not:\n\n${refused.join("\n\n")}`);
});

test("what the shell would expand or escape is still refused, quoted or not", () => {
  // The other half, and the one a relaxation is most likely to lose. Each of
  // these either expands, escapes, or is assembled from pieces, so the path the
  // shell ends up with is not the text between two quotes — and a gate that
  // resolved "the text between two quotes" would be judging a tree the command
  // never enters. Refused, with a reason, every one.
  for (const [how, command, why] of [
    ["a variable inside double quotes", `cd "$SLICE_DIR" && ${GATED}`, /cannot read literally/],
    ["a variable inside single quotes — not expanded there, and refused all the same: one rule for both quote styles", `cd '$SLICE_DIR' && ${GATED}`, /cannot read literally/],
    ["a substitution inside double quotes", `cd "$(pwd)/slice" && ${GATED}`, /cannot read literally/],
    ["a backquote inside double quotes", `cd "\`pwd\`" && ${GATED}`, /cannot read literally/],
    ["a glob inside quotes", `cd "${tmp}/my trees/*" && ${GATED}`, /cannot read literally/],
    ["a tilde inside quotes", `cd "~/my trees/slice" && ${GATED}`, /cannot read literally/],
    ["a backslash escape inside double quotes", `cd "${escaped(SPACED)}" && ${GATED}`, /cannot read literally/],
    ["an unquoted path whose spaces are escaped", `cd ${escaped(SPACED)} && ${GATED}`, /cannot read literally/],
    ["a quotation that never closes", `cd "${SPACED} && ${GATED}`, /still open where the command begins/],
    ["a quoted piece the shell joins to an unquoted one", `cd "${tmp}/my trees"/slice && ${GATED}`, /cannot read literally/],
    ["two words where cd takes one", `cd "${SPACED}" extra && ${GATED}`, /cannot read literally/],
    ["an empty quoted operand", `cd "" && ${GATED}`, /cannot read literally/],
    ["a quoted dash, which is cd's own `-`", `cd "-" && ${GATED}`, /cannot read literally/],
    ["a tab inside quotes", `cd "${tmp}/my\ttrees" && ${GATED}`, /cannot read literally/],
  ]) {
    const got = commandCwd("merge", command, HERE);
    assert.ok(got.unknown, `${how}: the gate resolved ${got.dir} — ${JSON.stringify(command)}`);
    assert.match(got.unknown, why, `${how}: the refusal must name what it could not read — ${got.unknown}`);
  }
});

test("the fleet check named by a quoted path is CLASSIFIED, and resolves to the tree it names", () => {
  // As found this was not a refusal but silence: `classify` returned null, so the
  // hook never judged the run at all.
  for (const [how, command] of [
    ["double-quoted", `CMP_AVD=X node "${SPACED}/scripts/fleet-check.mjs" --min-level L2`],
    ["single-quoted", `node '${SPACED}/scripts/fleet-check.mjs'`],
    ["inside a quoted -c script", `sh -c 'node "${SPACED}/scripts/fleet-check.mjs"'`],
  ]) {
    assert.equal(classify(command), "device", `${how}: ${JSON.stringify(command)} is a device run and the hook must see it`);
    const got = commandCwd("device", command, HERE);
    assert.equal(got.dir, SPACED, `${how}: ${got.unknown ?? got.dir}`);
  }
  // And the ordinary spellings are untouched, including the unbalanced closing
  // quote a `sh -c "…"` wrapper leaves after the file name.
  assert.equal(commandCwd("device", `node ${HERE}/scripts/fleet-check.mjs`, "/").dir, HERE);
  assert.equal(commandCwd("device", `sh -c "node scripts/fleet-check.mjs"`, HERE).dir, HERE);
  assert.equal(commandCwd("device", `node "${HERE}/scripts/fleet-check.mjs"`, "/").dir, HERE);
});

test("a fleet-check path the gate cannot read exactly is REFUSED — never passed in silence", () => {
  // The spellings the shell accepts and this gate cannot read. As found, all of
  // them were UNCLASSIFIED: the run was a device run and the hook said nothing.
  for (const [how, command] of [
    ["an escaped space", `node ${escaped(SPACED)}/scripts/fleet-check.mjs`],
    ["a quoted piece joined to an unquoted one", `node "${tmp}/my trees"/slice/scripts/fleet-check.mjs`],
    ["a variable inside the quotes", `node "$ROOT/my trees/scripts/fleet-check.mjs"`],
  ]) {
    assert.equal(classify(command), "device", `${how}: ${JSON.stringify(command)} runs the fleet check, so the hook must judge it`);
    const got = commandCwd("device", command, HERE);
    assert.ok(got.unknown, `${how}: the gate resolved ${got.dir}`);
    assert.match(got.unknown, /cannot read literally/, how);
  }
  // A mention is still not an invocation, spaces or not.
  assert.equal(classify(`echo 'node "${SPACED}/scripts/fleet-check.mjs"'`), null);
  assert.equal(classify(`grep -n "node '${SPACED}/scripts/fleet-check.mjs'" x.md`), null);
});

test("classifying a long quoted fleet-check operand costs what its length costs", () => {
  // The device pattern now reads quoted pieces, and a pattern that can read one
  // span two ways doubles its work per span (the class
  // test/the-command-position-reader-can-spend-the-whole-gate-budget-on-one-command.test.mjs
  // measures for the prefix). Scale-invariant, as there: the ratio, never a millisecond.
  const costMs = (command) => {
    let best = Infinity;
    for (let i = 0; i < 3; i += 1) {
      const t0 = process.hrtime.bigint();
      classify(command);
      best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return best;
  };
  for (const [how, shape] of [
    ["closed quoted pieces, never reaching the file", (n) => `node ${'"a b"/'.repeat(n)}x.mjs`],
    ["one quotation that never closes", (n) => `node "${"a b/".repeat(n)}x.mjs`],
    ["escapes, never reaching the file", (n) => `node ${"a\\ b/".repeat(n)}x.mjs`],
  ]) {
    const ratio = costMs(shape(400)) / Math.max(costMs(shape(200)), 0.01);
    assert.ok(ratio < 10, `${how}: doubling the operand multiplied the classifier's work by ${ratio.toFixed(0)}x`);
  }
});

// ── the hook, end to end, over a real worktree under a spaced path ─────────
//
// The fixture is the one test/the-proof-gate-judges-the-tree-the-command-acts-on.test.mjs
// builds, moved under a space: a session worktree A that owes nothing, and a
// slice worktree B that owes the device tier. A copy of THIS tree's `scripts/`
// is what runs, so this is the hook as it is now.
let A, B, env, hook;

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} in ${cwd}: ${r.stderr}`);
  return r.stdout.trim();
}

function pre(command, cwd) {
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd }),
    cwd: A,
    encoding: "utf8",
    env,
    timeout: 20000,
  });
  assert.equal(r.signal, null, `the hook was killed rather than answering: ${r.stderr}`);
  assert.equal(r.status, 0, `the hook failed rather than deciding: ${r.stderr}`);
  if (!r.stdout) return { action: "silent", reason: "" };
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  return { action: out.permissionDecision, reason: out.permissionDecisionReason };
}

before(() => {
  A = path.join(tmp, "session-tree");
  B = path.join(tmp, "my worktrees", "slice");
  fs.mkdirSync(A, { recursive: true });
  fs.cpSync(path.join(LIVE, "scripts"), path.join(A, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(A, "packages", "harness", "src", "lib"), { recursive: true });
  fs.copyFileSync(path.join(LIVE, "packages", "harness", "src", "lib", "affected-tests.mjs"), path.join(A, "packages", "harness", "src", "lib", "affected-tests.mjs"));
  fs.mkdirSync(path.join(A, ".claude"), { recursive: true });
  fs.copyFileSync(path.join(LIVE, ".claude", "settings.json"), path.join(A, ".claude", "settings.json"));
  fs.writeFileSync(path.join(A, ".gitignore"), ".claude/worktrees/\nqa-artifacts/\n");
  git(A, ["init", "-q", "-b", "main"]);
  git(A, ["add", "-A"]);
  git(A, ["-c", "user.email=fixture@example.com", "-c", "user.name=fixture", "-c", "commit.gpgsign=false", "commit", "-qm", "base"]);
  git(A, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(A, ["worktree", "add", "-q", "-b", "slice", B]);
  git(A, ["checkout", "-q", "-b", "session-tree"]);
  fs.mkdirSync(path.join(A, "docs"), { recursive: true });
  fs.writeFileSync(path.join(A, "docs", "only.md"), "prose, and nothing else\n");
  fs.mkdirSync(path.join(B, "packages", "harness", "src"), { recursive: true });
  fs.writeFileSync(path.join(B, "packages", "harness", "src", "x.mjs"), "export const x = 1;\n");

  // The process table made deterministic, exactly as the sibling fixture does.
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "pgrep"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, PROOFLANE_HISTORY_DIR: path.join(tmp, "history"), PROOFLANE_SUITE_ROOT: path.join(tmp, "suite") };
  hook = path.join(A, "scripts", "hooks", "proof-gate.mjs");
  const open = spawnSync(process.execPath, [path.join(B, "scripts", "proof-plan.mjs"), "--open", "a slice under a spaced path"], { cwd: B, encoding: "utf8", env });
  assert.equal(open.status, 0, open.stderr);
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("the hook judges a worktree under a spaced path when the command quotes it — both readers, both verdicts", () => {
  const judged = (d, how) => {
    assert.doesNotMatch(d.reason, /could not tell which tree/, `${how}: ${d.reason}`);
    assert.match(d.reason, /the device tier is OWED/, `${how}: ${d.reason}`);
    assert.ok(d.reason.includes(`JUDGED TREE: ${B}`), `${how}: the decision must name the tree it judged — ${d.reason}`);
  };
  const cdDevice = pre(`cd "${B}" && ${DEVICE}`, A);
  judged(cdDevice, "a device run behind a quoted cd");
  assert.equal(cdDevice.action, "allow", cdDevice.reason);

  const named = pre(`CMP_AVD=X node '${B}/scripts/fleet-check.mjs' --min-level L2`, A);
  assert.notEqual(named.action, "silent", "the fleet check named by a quoted path is a device run the gate must judge");
  judged(named, "a fleet check named by a quoted path");
  assert.equal(named.action, "allow", named.reason);

  const merge = pre(`cd '${B}' && ${GATED}`, A);
  assert.equal(merge.action, "deny", merge.reason);
  assert.match(merge.reason, /the device tier is OWED/, "refused for what the slice owes, not for how its path was spelled");
});

test("the hook still refuses the spellings of that path it cannot read exactly", () => {
  for (const [how, command] of [
    ["an escaped cd", `cd ${escaped(B)} && ${GATED}`],
    ["an escaped fleet-check path — as found, silence", `node ${escaped(B)}/scripts/fleet-check.mjs --min-level L2`],
  ]) {
    const d = pre(command, A);
    assert.equal(d.action, "deny", `${how}: ${d.reason || "(silent)"}`);
    assert.match(d.reason, /could not tell which tree/, how);
    assert.match(d.reason, /cannot read literally/, how);
  }
});
