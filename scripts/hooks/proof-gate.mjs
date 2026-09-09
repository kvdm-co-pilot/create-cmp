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
//     npm publish       REFUSED unless on a clean trunk with a fleet record that is PASS at
//                       L2 on THIS tree — the npm-publish skill's steps 1 and 2, which were
//                       prose, and 0.11.0 shipped a release build nobody had run.
//     anything else     silent, and cheap: nothing is imported before a match, so an
//                       ordinary Bash call pays node's startup and no more.
//   PostToolUse (Bash)  after `gh pr merge`, the finished slice's plan is closed, so it is
//                       never found lying around by the next one.
//
// ONE EXCEPTION, and why it is not a hole: a device run on a clean TRUNK is allowed.
// Trunk owes nothing per slice, so by the rule above the run would be refused as
// waste — but a release proof over trunk is exactly what publishing needs, and it
// is the release manager's explicit act, not an inner loop. `proof-plan` marks
// that state `trunk`; a docs-only branch is not trunk and is still refused.
//
// A matched command the gate cannot answer is REFUSED (exit 2, reason on stderr):
// "I could not check" is not "I checked". An unmatched command never reaches code
// that can throw — a gate that blocked every Bash call because stdin was odd would
// be removed within the hour, and rightly.
import { createRequire } from "node:module";
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
  publish: invocation("npm\\s+publish"),
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
export function decide(kind, o, tiers, ctx) {
  const cmd = tiers?.device?.cmd ?? "the fleet check";
  if (kind === "device") {
    switch (o.state) {
      case "none":
        if (o.trunk) return allow(`nothing is owed per slice — this is trunk — so this can only be a RELEASE proof (npm-publish skill step 2): allowed. Then npm publish reads its record.`);
        return deny(`nothing is owed — ${o.need.reason}. A device run over this tree proves nothing this slice needs (GATE-RULES Rule 4: the tier runs once, at the close of a slice that changed something it can see).`);
      case "discharged":
        return deny(`already discharged for this exact tree at ${o.plan.discharged.at} (verdict ${o.plan.discharged.verdict}, rung ${o.plan.discharged.rung ?? "none"}). A second run over the same bytes is the 2026-09-08 defect; had a trigger path moved, the state would read REOPENED.`);
      case "undeclared":
        return deny(`no slice is declared, so this run could discharge nothing — ${o.need.reason}. Declare first: ${DECLARE}. Then run the tier once, at close.`);
      case "owed":
      case "reopened":
        // A lane already driving the one device makes a second run worse than
        // wasted: it has wedged Maestro before its first flow. This was a line in
        // a memory file ("check pgrep first") — now it is checked.
        if (ctx?.runningLane) return deny(`a verify lane is already running (${ctx.runningLane}) — a concurrent device run collides with it (wedged adbd, false reds). Wait for it, then run the tier once.`);
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
  if (kind === "publish") {
    // The npm-publish skill's first two steps, as a program: clean trunk, and a
    // fleet record that is PASS at L2 on these exact bytes. Read, never asserted.
    if (!o.trunk) {
      const where = o.branch === "main" ? "main, but with commits or edits not yet on origin/main — publish only what is merged" : `${o.branch || "a detached HEAD"}, not main`;
      return deny(`publish only from a clean main — this is ${where}${o.state === "none" ? "" : `; the device tier is ${o.state.toUpperCase()} here`} (npm-publish skill step 1).`);
    }
    const r = ctx?.record;
    if (!r) return deny(`no fleet record — run ${cmd} first; a release proof is read from its record, never asserted (npm-publish skill step 2).`);
    if (r.observedHash !== ctx.now) return deny(`the fleet record describes another tree (${String(r.observedHash).slice(0, 7)} → ${String(ctx.now).slice(0, 7)}) — run ${cmd} on this one.`);
    if (r.verdict !== "PASS") return deny(`the fleet record on this tree is ${r.verdict}, not PASS — the scratch app is the crime scene; do not bump the version.`);
    const rung = Number(String(r.rung ?? "").replace(/^L/, ""));
    if (!(rung >= 2)) return deny(`the fleet record on this tree is rung ${r.rung ?? "none"} — a release requires L2: attach an emulator and run ${cmd}.`);
    return allow(`release proof on this tree: ${r.verdict} at ${r.rung}, ran ${r.ranAt}.`);
  }
  if (kind === "create") {
    return o.state === "owed" || o.state === "reopened" || o.state === "undeclared"
      ? allow(`reminder: the device tier is ${o.state.toUpperCase()} for this slice; gh pr merge will refuse until it is discharged (${cmd}, then node scripts/proof-plan.mjs --discharge). Open the PR, finish everything else, run the tier last.`)
      : SILENT;
  }
  return SILENT;
}

/**
 * The session's memory files, scanned for the device cadence the lint hunts in
 * tracked docs — memory is the one surface git cannot see. Non-fatal: a hit is
 * a line in the session's context, never a refusal. `PROOFLANE_MEMORY_DIR`
 * overrides the location so a test can plant one.
 */
export async function memoryRestatements(dir = process.env.PROOFLANE_MEMORY_DIR) {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const { restatements } = await import("../lib/cadence.mjs");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const where = dir ?? path.join(os.homedir(), ".claude", "projects", root.replace(/\//g, "-"), "memory");
  let files = [];
  try {
    files = fs.readdirSync(where).filter((f) => f.endsWith(".md"));
  } catch {
    return "";
  }
  const hits = [];
  for (const f of files) {
    for (const h of restatements(fs.readFileSync(path.join(where, f), "utf8"))) hits.push(`${f}:${h.line} (${h.what})`);
  }
  return hits.length ? `\n\nmemory restates the device cadence — the program is the rule, edit the memory: ${hits.join("; ")}` : "";
}

/** A verify lane in flight on this machine, by its command line — or null. */
function runningLane() {
  try {
    const { execSync } = createRequire(import.meta.url)("node:child_process");
    const out = execSync("pgrep -fl 'qa/verify.mjs'", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out ? out.split("\n")[0].slice(0, 80) : null;
  } catch {
    return null; // pgrep exits 1 when nothing matches
  }
}

/** The fleet record and the hash of the tree it would have to describe. */
async function releaseContext() {
  const fs = await import("node:fs");
  const { observedTreeHash, DEVICE_TIER_TRIGGERS } = await import("../observed-tree.mjs");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  let record = null;
  try {
    record = JSON.parse(fs.readFileSync(path.join(root, "qa-artifacts", "fleet-latest.json"), "utf8"));
  } catch {
    record = null;
  }
  return { record, now: observedTreeHash(root, DEVICE_TIER_TRIGGERS) };
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
      const ctx = kind === "publish" ? await releaseContext() : kind === "device" ? { runningLane: runningLane() } : undefined;
      const d = decide(kind, obligation(), TIERS, ctx);
      if (d.action === "silent") return;
      emit({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: d.action, permissionDecisionReason: d.reason } });
    } catch (e) {
      process.stderr.write(`proof gate could not answer for "${kind}": ${e?.message ?? e} — refusing rather than allowing\n`);
      process.exit(2);
    }
    return;
  }

  if (event === "PostToolUse") {
    if (input.tool_name !== "Bash" || classify(String(input.tool_input?.command ?? "")) !== "merge") return;
    // Best effort and read-only in effect: close() removes the plan only when
    // nothing is owed, which after a merge the gate allowed is always true.
    try {
      const { close } = await import("../proof-plan.mjs");
      close();
    } catch {
      /* a failed close leaves the plan, which the next session names as stale */
    }
    return;
  }

  if (event === "SessionStart") {
    try {
      const { obligation, render } = await import("../proof-plan.mjs");
      // The installed plugin's staleness, one line. It is here and not in a
      // document because the two days it went unnoticed were exactly the days
      // nobody thought to look — and a session reads this before anything else.
      // `summary` never refreshes and never throws; a null is silence, not a gap.
      let pluginLine = "";
      try {
        const { summary } = await import("../plugin-refresh.mjs");
        const line = summary({ repoRoot: path.resolve(fileURLToPath(import.meta.url), "../../.."), timeoutMs: 3000 });
        if (line) pluginLine = `\n\n${line}`;
      } catch {
        /* the plugin is not this tree's concern when it cannot be read */
      }
      emit({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext:
            "Proof schedule for this tree — GATE-RULES Rule 4, enforced by scripts/hooks/proof-gate.mjs on fleet-check and gh pr merge, not by any document:\n" +
            render(obligation()) +
            pluginLine +
            (await memoryRestatements()),
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
