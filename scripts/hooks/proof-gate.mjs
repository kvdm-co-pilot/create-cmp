#!/usr/bin/env node
// THE PROGRAM AT THE DECISION POINT.
//
// GATE-RULES Rule 4 landed as a program — scripts/proof-plan.mjs — and the
// audit the next day found that nothing invoked it. No `.claude/settings.json`
// in this repo, no git hooks; every `proof-plan --open` lived in prose, which is
// the same defect the program was written to close, one layer up: a rule made
// executable and left for the reader to remember to run. Meanwhile the template
// this repo STAMPS carries PreToolUse hooks that say "device proof is a
// checkpoint, never an inner loop" at the moment an adopter's agent types
// `maestro test`. The harness enforced on adopters what it did not enforce on
// itself. This is the same hook, for this repo. Claude Code runs it from
// `.claude/settings.json`:
//
//   SessionStart        the schedule is the first thing a session reads.
//   PreToolUse (Bash)   and the thing in front of the reader when it matters:
//     fleet-check.mjs   REFUSED when nothing is owed, or when the tier is already
//                       discharged for this exact tree — a second run over the same
//                       bytes is the 2026-09-08 defect — or when no slice is declared,
//                       because that run could discharge nothing. ALLOWED while owed,
//                       with the schedule as the reason.
//     gh pr merge       REFUSED while the tier is owed. The slice closes at merge, so
//                       this is where "once, at slice close" is collected.
//     gh pr create      allowed, reminded.
//     anything else     silent, and cheap: nothing is imported before a match, so an
//                       ordinary Bash call pays node's startup and no more.
//
// A matched command the gate cannot answer is REFUSED (exit 2, reason on stderr):
// "I could not check" is not "I checked". An unmatched command never reaches code
// that can throw — a gate that blocked every Bash call because stdin was odd would
// be removed within the hour, and rightly.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * The commands this gate has an opinion about. Anything else is none of its
 * business — and "anything else" includes MENTIONING these programs: the first
 * live run of this hook refused an `echo` of a JSON payload, and then refused
 * the edit that would have fixed it, because it matched the name anywhere in
 * the string. So a match is an INVOCATION: the program at a command position —
 * the start, or after `;` `&&` `||` `|` `(` or a newline, or after `-c "` so
 * `sh -c "node …"` is seen — with `VAR=value` assignments and the usual
 * wrappers (`nohup`, `time`, `env`, `caffeinate`) in front, in any order.
 * `cat scripts/fleet-check.mjs`, `grep "node scripts/fleet-check.mjs"` and
 * `git commit -m "then gh pr merge"` are not invocations; a quote is a
 * boundary only when it opens a `-c` script, which is the one place a quoted
 * string IS a command.
 */
const invocation = (prog) =>
  new RegExp(
    `(?:^|[;&|(\\n]|-c\\s+["'])\\s*(?:(?:nohup|time|env|caffeinate|sudo)(?:\\s+-\\S+)*\\s+|[A-Za-z_][A-Za-z0-9_]*=\\S*\\s+)*${prog}(?=\\s|$|["')])`,
  );

export const WATCHED = Object.freeze({
  device: invocation("node\\s+(?:\\S*/)?fleet-check\\.mjs"),
  merge: invocation("gh\\s+pr\\s+merge"),
  create: invocation("gh\\s+pr\\s+create"),
});

export function classify(command) {
  for (const [kind, re] of Object.entries(WATCHED)) if (re.test(command)) return kind;
  return null;
}

const allow = (reason) => ({ action: "allow", reason });
const deny = (reason) => ({ action: "deny", reason });
const SILENT = Object.freeze({ action: "silent" });
const DECLARE = 'node scripts/proof-plan.mjs --open "<what you are building>" (on a branch — trunk is not a slice)';

/**
 * The decision, pure: a watched command kind and what the slice owes
 * (`obligation()` from scripts/proof-plan.mjs) in, a verdict out.
 *
 * Every reason names the state it was decided on and what to do next, and none
 * of them contains the word REQUIRED — that is the word an agent acted on three
 * times in one session, and a test pins its absence.
 */
export function decide(kind, o, tiers) {
  const cmd = tiers?.device?.cmd ?? "the fleet check";
  if (kind === "device") {
    switch (o.state) {
      case "none":
        return deny(`nothing is owed — ${o.need.reason}. A device run over this tree proves nothing this slice needs (GATE-RULES Rule 4: the tier runs once, at the close of a slice that changed something it can see).`);
      case "discharged":
        return deny(`already discharged for this exact tree at ${o.plan.discharged.at} (verdict ${o.plan.discharged.verdict}, rung ${o.plan.discharged.rung ?? "none"}). A second run over the same bytes is the 2026-09-08 defect; had a trigger path moved, the state would read REOPENED.`);
      case "undeclared":
        return deny(`no slice is declared, so this run could discharge nothing — ${o.need.reason}. Declare first: ${DECLARE}. Then run the tier once, at close.`);
      case "owed":
      case "reopened":
        return allow(`the device tier is ${o.state.toUpperCase()} and this is the LAST gate: run it only when npm test and framework-check are green and you are about to open the PR — a trigger path edited afterwards reopens the slice. Then: node scripts/proof-plan.mjs --discharge`);
      default:
        return deny(`the proof plan is in an unknown state (${o.state}) — refusing rather than guessing`);
    }
  }
  if (kind === "merge") {
    switch (o.state) {
      case "owed":
      case "reopened":
        return deny(`the device tier is ${o.state.toUpperCase()} for this slice and the slice closes at merge — this is where it is collected. Run it once: ${cmd} — then node scripts/proof-plan.mjs --discharge, then merge.`);
      case "undeclared":
        return deny(`trigger paths changed with no slice declared — ${o.need.reason}. Declare (${DECLARE}), discharge, then merge.`);
      default:
        return SILENT;
    }
  }
  if (kind === "create") {
    return o.state === "owed" || o.state === "reopened" || o.state === "undeclared"
      ? allow(`reminder: the device tier is ${o.state.toUpperCase()} for this slice; gh pr merge will refuse until it is discharged (${cmd}, then node scripts/proof-plan.mjs --discharge). Open the PR, finish everything else, run the tier last.`)
      : SILENT;
  }
  return SILENT;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (s += c));
    process.stdin.on("end", () => resolve(s));
    process.stdin.on("error", () => resolve(""));
  });
}

const emit = (payload) => process.stdout.write(JSON.stringify(payload));

async function main() {
  let input = {};
  try {
    input = JSON.parse((await readStdin()) || "{}");
  } catch {
    return; // not a hook payload — none of this gate's business
  }
  const event = input.hook_event_name;

  if (event === "PreToolUse") {
    if (input.tool_name !== "Bash") return;
    const kind = classify(String(input.tool_input?.command ?? ""));
    if (!kind) return;
    // Matched. From here on, a failure is a refusal.
    try {
      const { obligation, TIERS } = await import("../proof-plan.mjs");
      const d = decide(kind, obligation(), TIERS);
      if (d.action === "silent") return;
      emit({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: d.action, permissionDecisionReason: d.reason } });
    } catch (e) {
      process.stderr.write(`proof gate could not answer for "${kind}": ${e?.message ?? e} — refusing rather than allowing\n`);
      process.exit(2);
    }
    return;
  }

  if (event === "SessionStart") {
    try {
      const { obligation, render } = await import("../proof-plan.mjs");
      emit({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext:
            "Proof schedule for this tree — GATE-RULES Rule 4, enforced by scripts/hooks/proof-gate.mjs on fleet-check and gh pr merge, not by any document:\n" +
            render(obligation()),
        },
      });
    } catch (e) {
      process.stderr.write(`proof gate could not render the schedule: ${e?.message ?? e}\n`);
    }
  }
}

// Only as the entry module: importing this file must not wait on stdin — the
// first test that imported it hung until the tool timeout, because `main()`
// ran at load and stdin was an open pipe that never ended.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
