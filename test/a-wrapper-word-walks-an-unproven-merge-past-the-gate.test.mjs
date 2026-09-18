// A COMMAND THAT WILL INVOKE A GATED ACT MUST REACH THE GATE, HOWEVER IT IS WRAPPED.
//
// `classify()` is the door. The PreToolUse handler returns before any verdict
// when it answers null, so a command it does not recognise is not allowed by a
// gate that looked — it is merged with no gate having an opinion at all. That
// makes the classifier the one reader in this file whose error is a FAIL-OPEN
// by construction, and KD-107 measured it open:
//
//   gh pr merge 1 --rebase               deny
//   ! gh pr merge 1 --rebase             SILENT — no gate ran
//   timeout 300 gh pr merge 1 --rebase   SILENT
//   command gh pr merge 1 --rebase       SILENT
//   2>/dev/null gh pr merge 1 --rebase   SILENT
//
// The cause is the defect KD-105 named and KD-107 re-measured in the other
// direction: this file had TWO literal spellings of "a command position", and
// they were not the same list. `COMPOUND` — the reader that REFUSES, so its
// error costs a message — knew `!`, `command`, `builtin` and redirections.
// `invocation()` — the reader that decides whether this gate runs AT ALL, so
// its error costs a certification — did not. The wider list was on the reader
// that needed it less.
//
// THE ORACLE IS `/bin/sh`, reused from the harness KD-79's slice landed
// (test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs and
// test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs).
// There the question was "which directory does the shell end in"; here it is
// "did the shell INVOKE the gated program", and it is answered the same way —
// by a real shell, not by a second opinion about shells. A stand-in `gh`, `npm`
// and `node` on PATH record their own argv, so "this shape invokes a merge" is
// measured. `sudo` and `timeout` are stand-ins too, for the two reasons a test
// may not run the real thing: one prompts for a password and one does not exist
// on macOS. Each stand-in skips its own options exactly as the real program
// documents, so what is being measured is still the SHELL's answer to which
// word is the command name.
//
// Only one direction is swept, and deliberately: a shape the shell really does
// run must be classified. The converse is not a defect of the same kind — a
// classifier that is too wide costs a message about a command that was not
// there, which is the direction this file is settled to err in — so the
// false-positive side is pinned on a hand-picked table below, where every row
// is ALSO put to the shell and proven to invoke nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { classify } from "../scripts/hooks/proof-gate.mjs";

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/hooks/proof-gate.mjs");

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gate-wrapper-oracle-")));
const BIN = path.join(tmp, "bin");
const HERE = path.join(tmp, "here");
const MARK = path.join(tmp, "invoked");
for (const d of [BIN, HERE, path.join(HERE, "scripts")]) fs.mkdirSync(d, { recursive: true });

/** A stand-in that records the argv the shell handed it — the whole measurement. */
const recorder = (name) => `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> ${JSON.stringify(MARK)}\n`;

/**
 * A stand-in wrapper that skips its own options and execs the rest, which is
 * what the real one does. `sudo` may not run in a test (it prompts) and
 * `timeout` is not installed on macOS, so the shapes that matter most would
 * otherwise be the two that could never be measured.
 */
const skipper = (valueFlags) => `#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    ${valueFlags} ) shift 2 ;;
    -* ) shift ;;
    * ) break ;;
  esac
done
`;

for (const [name, body] of [
  ["gh", recorder("gh")],
  ["npm", recorder("npm")],
  ["node", recorder("node")],
  ["sudo", `${skipper("-u|-g|-p|-U")}exec "$@"\n`],
  ["timeout", `${skipper("-s|-k")}shift\nexec "$@"\n`],
]) {
  fs.writeFileSync(path.join(BIN, name), body, { mode: 0o755 });
}
fs.writeFileSync(path.join(HERE, "scripts", "fleet-check.mjs"), "// stand-in\n");

/** The four acts this gate has an opinion about, spelled the way this repository types them. */
const GATED = [
  ["merge", "gh pr merge 1 --rebase --delete-branch"],
  ["create", "gh pr create --title x --body y"],
  ["publish", "npm publish --access public"],
  ["device", "node scripts/fleet-check.mjs --min-level L2"],
];

/**
 * A command position is a separator plus a run of wrappers, assignments and
 * redirections. These are the wrappers — every one of them a word a human or an
 * agent plausibly types in front of a long command, and `!` the one that is not
 * a program at all but a reserved word of the shell itself.
 */
const WRAPPED = (gated) => [
  ["!", `! ${gated}`],
  ["timeout with a bare duration", `timeout 300 ${gated}`],
  ["timeout with a unit", `timeout 5m ${gated}`],
  ["timeout with a flag and its value", `timeout -s KILL 300 ${gated}`],
  ["command", `command ${gated}`],
  ["env", `env ${gated}`],
  ["env with an assignment", `env FOO=bar ${gated}`],
  ["env with a flag and its value", `env -u FOO ${gated}`],
  ["nice", `nice ${gated}`],
  ["nice with a level", `nice -n 10 ${gated}`],
  ["nohup", `nohup ${gated}`],
  ["sudo", `sudo ${gated}`],
  ["sudo with a user", `sudo -u nobody ${gated}`],
  ["time", `time ${gated}`],
  ["exec", `exec ${gated}`],
  ["eval", `eval ${gated}`],
  ["builtin", `builtin ${gated}`],
  ["xargs", `printf 'x\\n' | xargs -n1 ${gated}`],
  ["a redirection", `2>/dev/null ${gated}`],
  ["a redirection with a descriptor", `>out 2>&1 ${gated}`],
  ["two wrappers", `nohup nice ${gated}`],
  ["a wrapper after an assignment", `FOO=bar timeout 300 ${gated}`],
];

/**
 * Every place the wrapped command may legally stand. Four, not every separator
 * this file honours: the separator class is not what this slice changed, it is
 * already swept in
 * test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs,
 * and each row here costs two processes on every `npm test`. `after a cd` earns
 * its place by being how this repository actually types a merge.
 */
const CONTEXTS = [
  ["at the start", (c) => c],
  ["after &&", (c) => `true && ${c}`],
  ["after a newline", (c) => `true\n${c}`],
  ["after a cd", (c) => `cd ${HERE} && ${c}`],
];

/**
 * The argv of a gated act, as the program itself would see it. `npm test` and
 * `gh pr view` run the same stand-ins and are not gated acts, so the marker is
 * read against the act, never against the program name.
 */
const GATED_ARGV = [
  ["merge", /^gh pr merge(?:\s|$)/],
  ["create", /^gh pr create(?:\s|$)/],
  ["publish", /^npm publish(?:\s|$)/],
  ["device", /^node (?:\S*\/)?fleet-check\.mjs(?:\s|$)/],
];

/** Which gated act a real shell actually invoked, or null. The marker file, and nothing else, answers. */
function shellInvoked(command) {
  fs.writeFileSync(MARK, "");
  spawnSync("/bin/sh", ["-c", command], {
    cwd: HERE,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` },
    stdio: ["pipe", "ignore", "ignore"],
  });
  for (const line of fs.readFileSync(MARK, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)) {
    const hit = GATED_ARGV.find(([, re]) => re.test(line));
    if (hit) return { kind: hit[0], line };
  }
  return null;
}

test("a command that invokes a gated act reaches the gate however it is wrapped", { skip: process.platform === "win32" ? "POSIX shell" : false }, () => {
  const silent = [];
  let ran = 0;
  for (const [kind, gated] of GATED) {
    // The merge carries the sweep — it is the act KD-107 was measured on and the
    // one whose fail-open certifies something untrue. The other three acts come
    // out of the SAME builder, so they are sampled rather than swept: enough to
    // prove they share the declaration, not enough to pay for it four times.
    const contexts = kind === "merge" ? CONTEXTS : CONTEXTS.slice(0, 1);
    const shapes = kind === "merge" ? WRAPPED(gated) : WRAPPED(gated).filter(([how]) => /^(!|timeout with a bare duration|command|a redirection)$/.test(how));
    for (const [how, wrapped] of shapes) {
      for (const [where, build] of contexts) {
        const command = build(wrapped);
        // A shape the shell REFUSES is not ground truth about anything — and
        // several here are refused on purpose by one platform or another
        // (`builtin gh` is not a builtin; GNU xargs skips an empty input).
        const truth = shellInvoked(command);
        if (truth?.kind !== kind) continue;
        ran += 1;
        const got = classify(command);
        if (got === kind) continue;
        silent.push(
          `${kind} / ${how} / ${where}\n    ${JSON.stringify(command)}\n` +
            `    the shell ran: ${truth.line}\n` +
            `    the gate classified it as: ${got === null ? "NOTHING — the hook returns before any verdict, so this act merges with no gate having an opinion" : got}`,
        );
      }
    }
  }

  assert.ok(ran >= 55, `the sweep proves nothing if the shell refused most of it: only ${ran} shapes ran`);
  assert.deepEqual(
    silent,
    [],
    `${silent.length} of ${ran} shapes invoke a gated act that no gate sees.\n\n${silent.join("\n\n")}\n\n` +
      "classify() returning null makes the hook `return` before it reaches decide(), so these are not allowed by a gate that looked — " +
      "they are an unproven merge, publish or device run with no gate in the path at all. " +
      "A command position is a separator PLUS a run of wrappers, assignments and redirections (docs/GATE-RULES.md, Rule 4), " +
      "and this file must spell it ONCE: two lists is KD-105, and the same two lists disagreeing the other way is KD-107.",
  );
});

/**
 * The other direction, hand-picked and measured the same way. A classifier that
 * is too wide costs a message about a command that is not there — cheaper than a
 * certification, but it is how this hook's first live run refused an `echo` and
 * then refused the edit that would have fixed it, so the widening above is
 * pinned against it.
 */
const MENTIONS = [
  'git commit -m "then gh pr merge"',
  'time git commit -m "then gh pr merge"',
  'sudo git commit -m "then gh pr merge"',
  'echo "npm publish is step 4"',
  'nohup echo "gh pr merge" > out 2>&1',
  "grep -rn 'gh pr merge' README.md",
  "timeout 5 grep -rn 'npm publish' README.md",
  "env FOO=bar grep -rn 'node scripts/fleet-check.mjs' README.md",
  "cat scripts/fleet-check.mjs",
  "npm test",
];

test("a mention behind a wrapper is still a mention — the shell runs no gated act, and neither reader claims one", { skip: process.platform === "win32" ? "POSIX shell" : false }, () => {
  fs.writeFileSync(path.join(HERE, "README.md"), "gh pr merge\nnpm publish\nnode scripts/fleet-check.mjs\n");
  const claimed = [];
  for (const command of MENTIONS) {
    const invoked = shellInvoked(command);
    assert.equal(invoked, null, `this row is not a mention — the shell really ran something gated: ${command} -> ${invoked?.line}`);
    const got = classify(command);
    if (got !== null) claimed.push(`${JSON.stringify(command)}\n    the shell invoked nothing gated, and the gate called it: ${got}`);
  }
  assert.deepEqual(
    claimed,
    [],
    `${claimed.length} of ${MENTIONS.length} commands are refused for an act they only MENTION.\n\n${claimed.join("\n\n")}\n\n` +
      "The first live run of this hook refused an `echo` of a JSON payload and then refused the edit that would have fixed it. " +
      "A wrapper word in front of a command does not make the rest of the line a command.",
  );
});

test("the two readers spell a command position ONCE — a second literal list is the defect itself", async () => {
  // KD-105 was the two lists disagreeing; KD-107 was the same two lists
  // disagreeing the other way, a commit later. Neither is fixed by editing both
  // lists to match: that is the state KD-105's fix left behind, and it drifted
  // inside one slice. So the invariant is structural — ONE declaration, and both
  // readers built from it.
  const { COMMAND_PREFIX, WATCHED, COMPOUND } = await import("../scripts/hooks/proof-gate.mjs");
  assert.equal(typeof COMMAND_PREFIX, "string", "the command-position prefix is declared once and exported");
  for (const [kind, re] of Object.entries(WATCHED)) {
    assert.ok(re.source.includes(COMMAND_PREFIX), `WATCHED.${kind} must be built from the shared declaration, not a second spelling of it`);
  }
  assert.ok(COMPOUND.source.includes(COMMAND_PREFIX), "COMPOUND must be built from the shared declaration too");
});

test("the closed list is stated where a reader will find it, and it is the list the code enforces", async () => {
  // "Enumerate what you accept, refuse the rest by name, and state the list in
  // docs/GATE-RULES.md so the next reader does not have to infer it from code."
  // A list stated in prose and enforced in a regex is two spellings of one fact,
  // which is the defect this slice is closing — so the prose is read back out of
  // the doc and compared, rather than trusted to stay true.
  const { COMMAND_WRAPPERS } = await import("../scripts/hooks/proof-gate.mjs");
  const rules = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs/GATE-RULES.md"), "utf8");
  const stated = /these wrapper words:([\s\S]*?)\. Each wrapper carries/.exec(rules);
  assert.ok(stated, "docs/GATE-RULES.md must state the accepted wrapper words under Rule 4");
  const named = [...stated[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual([...named].sort(), [...COMMAND_WRAPPERS].sort(), "the doc's list and the code's list are the same list");
});

test("the sweep is pointed at the reader the wiring actually runs", () => {
  // The import above could drift to a copy; this pins that the door under test
  // is the one .claude/settings.json spawns.
  const src = fs.readFileSync(HOOK, "utf8");
  assert.match(src, /export function classify\(/, "classify must be exported from the hook the settings file names");
  assert.match(src, /export const COMMAND_PREFIX/, "and the command-position declaration with it");
});

process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
