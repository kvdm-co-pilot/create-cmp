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
//     gh pr merge       REFUSED while EITHER at-close tier is owed — the device tier, and
//                       (ADR-0014) a review record describing this exact tree. The slice
//                       closes at merge, so this is where "once, at slice close" is
//                       collected, and both refusals are reported together rather than
//                       one round trip each. The review half checks that a record EXISTS
//                       and is bound to these bytes; it never reads what the review found.
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
        // a memory file ("check pgrep first") — now it is checked. And the refusal
        // says WHOSE lane it is and how long it has left (KD-27): the two cases
        // want opposite actions, and a bare PID left the wrong one tempting.
        if (ctx?.runningLane) {
          const { ours, text } = describeLane(ctx.runningLane, { repoRoot: ctx.repoRoot ?? null });
          return deny(
            `a verify lane is already running: ${text}. A concurrent device run collides with it (wedged adbd, false reds). ` +
              (ours ? "Wait for it, then run the tier once." : "Do not kill it — it is not this slice's. Wait for it, then run the tier once."),
          );
        }
        return allow(`the device tier is ${o.state.toUpperCase()} and this is the LAST gate: run it only when npm test and framework-check are green and you are about to open the PR — a trigger path edited afterwards reopens the slice. Then: node scripts/proof-plan.mjs --discharge`);
      default:
        return deny(`the proof plan is in an unknown state (${o.state}) — refusing rather than guessing`);
    }
  }
  if (kind === "merge") {
    // TWO at-close tiers now collect here, and both are reported at once: an
    // agent told about the device tier, that pays for it, and is then refused
    // again for the review has been sent round the loop twice by a gate that
    // knew both answers the first time.
    const blocked = [];
    switch (o.state) {
      case "owed":
      case "reopened":
        blocked.push(`the device tier is ${o.state.toUpperCase()} for this slice and the slice closes at merge — this is where it is collected. Run it once: ${cmd} — then node scripts/proof-plan.mjs --discharge, then merge.`);
        break;
      case "undeclared":
        blocked.push(`trigger paths changed with no slice declared — ${o.need.reason}. Declare (${DECLARE}), discharge, then merge.`);
        break;
      default:
        break;
    }
    const r = o.review;
    switch (r?.state) {
      case "owed":
      case "reopened":
        // Existence, never content: the refusal says so, because the agent
        // reading it is the one about to decide what to put in the record, and
        // the honest answer — "nothing found" is a record — must come from the
        // program at the moment of decision, not from an ADR read hours ago.
        blocked.push(
          `a review is ${r.state.toUpperCase()} for this slice and the slice closes at merge — ${r.need.reason}. ${tiers?.review?.how ?? "have the diff read"}, then ${tiers?.review?.cmd ?? "node scripts/proof-plan.mjs --discharge-review"}, then merge. The gate checks only that a review of THESE bytes happened; it never reads what it found, and "nothing found" is a valid record (ADR-0014).`,
        );
        break;
      case "undeclared":
        if (o.state !== "undeclared") blocked.push(`paths that oblige a review changed with no slice declared — ${r.need.reason}. Declare (${DECLARE}), then have the diff read.`);
        break;
      default:
        break;
    }
    return blocked.length ? deny(blocked.join("\n\n")) : SILENT;
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
    const open = (s) => s === "owed" || s === "reopened" || s === "undeclared";
    const notes = [];
    if (open(o.state)) notes.push(`the device tier is ${o.state.toUpperCase()} for this slice; gh pr merge will refuse until it is discharged (${cmd}, then node scripts/proof-plan.mjs --discharge)`);
    if (open(o.review?.state)) notes.push(`a review is ${o.review.state.toUpperCase()}; gh pr merge will refuse until a review of these bytes is recorded (${tiers?.review?.cmd ?? "node scripts/proof-plan.mjs --discharge-review"})`);
    return notes.length ? allow(`reminder: ${notes.join(" — and ")}. Open the PR, finish everything else, run the at-close tiers last.`) : SILENT;
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

/**
 * A verify lane in flight on this machine — or null.
 *
 * `pgrep -f` matches the WHOLE command line, so the obvious spelling
 * (`pgrep -fl 'qa/verify.mjs'`) matches any process that merely MENTIONS the
 * path. It refused a legitimate device run on 2026-09-09 because another
 * project's session was holding a shell whose commit-message heredoc contained
 * those characters — a gate refusing real work for a reason that was not true,
 * which is the one failure this project cannot tolerate in its own gates.
 *
 * So a candidate must actually BE node: `pgrep` proposes, and the process's own
 * executable name disposes. A shell quoting the path reports `zsh`, an editor
 * reports its own name, and only a running lane reports `node`. Cheap, and it
 * fails toward permitting — an unreadable process table returns null and the
 * device run proceeds, because a false BLOCK is worse here than a false allow:
 * the collision it prevents is noisy and obvious, while the block is silent and
 * looks like the tree's fault.
 */
function runningLane() {
  try {
    const run = shell();
    const pids = run("pgrep -f 'qa/verify\\.mjs'").split("\n").filter(Boolean);
    for (const pid of pids) {
      if (String(pid) === String(process.pid)) continue;
      let comm = "";
      try {
        comm = run(`ps -o comm= -p ${Number(pid)}`);
      } catch {
        continue; // exited between pgrep and ps — not a lane in flight
      }
      if (!/(^|\/)node(js)?$/.test(comm.trim())) continue;
      let args = "";
      try {
        args = run(`ps -o args= -p ${Number(pid)}`);
      } catch {
        args = comm;
      }
      return laneAt(pid, args, run);
    }
    return null;
  } catch {
    return null; // pgrep exits 1 when nothing matches
  }
}

/**
 * A synchronous shell runner, loaded only when a matched command needs one —
 * and BOUNDED, because this gate can be killed while it is holding a refusal.
 *
 * `.claude/settings.json` gives this PreToolUse hook a timeout. Past it the hook
 * is killed and its decision is never delivered, and a PreToolUse decision that
 * is never delivered is not a refusal — it is a permitted command. So the budget
 * is the boundary between "refused" and "allowed", not a performance nicety, and
 * every subprocess run inside it has to be bounded by something smaller. None was:
 * measured on this tree with an `lsof` that took 20s, the hook answered at 22.2s
 * holding a `deny`, twelve seconds after it was already dead and the device run
 * had gone ahead. The process-table commands here answer in tens of milliseconds;
 * `lsof` on a wedged mount or a stuck fd answers never.
 *
 * Both bounds are well under the declared budget, and the whole probe shares one
 * deadline so that several slow calls cannot sum past it. Tripping either one
 * degrades exactly the way an unreadable process table already does — null, "a
 * project this gate could not locate", and the refusal still fires on time.
 */
const LANE_PROBE_CALL_MS = 1200;
const LANE_PROBE_TOTAL_MS = 3000;

function shell({ callMs = LANE_PROBE_CALL_MS, totalMs = LANE_PROBE_TOTAL_MS } = {}) {
  const { execSync } = createRequire(import.meta.url)("node:child_process");
  const deadline = Date.now() + totalMs;
  return (cmd) => {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error("the lane probe is out of time — answering without it");
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: Math.min(callMs, left),
      killSignal: "SIGKILL",
    }).trim();
  };
}

/**
 * How long a lane has left, from what it declared about itself — or null.
 *
 * The lane stamps `qa/.lane-in-progress` before every step with when it started
 * (`at`) and `expectedLaneMs`, its last full run's length
 * (packages/harness/src/lib/lane-runner.mjs). Nothing here estimates; a lane with
 * no measured full run has no answer, and gets none.
 */
export function laneRemainingMs(marker, nowMs = Date.now()) {
  const at = Date.parse(marker?.at ?? "");
  const expected = marker?.expectedLaneMs;
  if (!Number.isFinite(at) || !(typeof expected === "number" && expected > 0)) return null;
  return Math.max(0, expected - (nowMs - at));
}

const shortMs = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};

/**
 * WHOSE lane, and how long it has left — the refusal's sentence, pure (KD-27).
 *
 * It used to be "a verify lane is already running (7360 node qa/verify.mjs)". On
 * 2026-09-14 that lane's cwd was /Users/test/dev/payment-blueprint, an unrelated
 * project, and finding out took four commands. This repository's own run (inside
 * `repoRoot`, or a fleet-check scratch app named `cmp-fleet-check-*`) is yours to
 * wait for or stop; another project's is neither — and a bare PID made the wrong
 * move, killing it, the fastest. Nine such refusals in ten days
 * (docs/research/g2-measure/).
 *
 * @param {{pid: number|string, project: string|null, marker: object|null}} lane
 */
export function describeLane(lane, { nowMs = Date.now(), repoRoot = null } = {}) {
  const project = lane?.project ?? null;
  const inRepo = Boolean(project && repoRoot && (project === repoRoot || project.startsWith(`${repoRoot}${path.sep}`)));
  const ours = inRepo || Boolean(project && /(^|[\\/])cmp-fleet-check-[^\\/]+([\\/]|$)/.test(project));
  const whose = !project
    ? "in a project this gate could not locate"
    : ours
      ? `in ${project} — this repository's own run`
      : `in ${project} — ANOTHER project's lane, not yours to stop`;
  const m = lane?.marker ?? null;
  const step = m?.step ? `at ${m.step}${m.index && m.total ? ` (step ${m.index} of ${m.total})` : ""}` : null;
  const left = laneRemainingMs(m, nowMs);
  const eta = !m
    ? "it wrote no progress marker, so nothing says how long it has left"
    : left === null
      ? "that lane has no measured full run, so nothing says how long it has left"
      : left === 0
        ? "already past its last full run's length"
        : `~${shortMs(left)} left by its last full run`;
  return { ours, text: `pid ${lane?.pid ?? "?"} ${whose}; ${[step, eta].filter(Boolean).join(", ")}` };
}

/**
 * The project a lane process runs in. An absolute `…/qa/verify.mjs` names it; a
 * relative one resolves against the process's own cwd — `/proc/<pid>/cwd` on Linux,
 * `lsof -d cwd` on macOS. `null` when neither answers, and the refusal says so.
 */
export function laneProject(pid, args, run = shell()) {
  const read = laneOperand(args);
  if (!read) return null;
  if (read.absolute) return projectOf(read.operand);

  const fs = createRequire(import.meta.url)("node:fs");
  let cwd = null;
  try {
    cwd = fs.readlinkSync(`/proc/${Number(pid)}/cwd`);
  } catch {
    try {
      cwd = run(`lsof -a -p ${Number(pid)} -d cwd -Fn`).split("\n").find((l) => l.startsWith("n"))?.slice(1) ?? null;
    } catch {
      cwd = null;
    }
  }
  if (!cwd) return null;

  const relative = path.resolve(cwd, projectOf(read.operand));
  // One reading, because nothing before the operand could have been the start of
  // an absolute path the space-join split in two.
  if (!read.joined) return relative;
  // Two readings, and the disk decides between them: the lane's own file is in
  // exactly one of these directories. Neither, or both, and the gate says it
  // could not locate the project rather than picking (KD-27).
  const absolute = projectOf(read.joined);
  const holdsLane = (dir) => {
    try {
      return fs.existsSync(path.join(dir, "qa", "verify.mjs"));
    } catch {
      return false;
    }
  };
  const a = holdsLane(absolute);
  const r = holdsLane(relative);
  if (a === r) return null;
  return a ? absolute : relative;
}

/** `…/qa/verify.mjs` -> the project directory two levels up. */
const projectOf = (operand) => path.dirname(path.dirname(operand));

/**
 * The `…/qa/verify.mjs` operand in a process's argument string, or null.
 *
 * `ps -o args=` hands back argv JOINED BY SPACES, and that join is lossy: a
 * project path containing a space is indistinguishable from two arguments. The
 * old reading tried an absolute pattern, then fell back to a relative one that
 * happily matched a FRAGMENT of the same absolute path and resolved it against
 * the wrong directory — `node /Users/k/my proj/qa/verify.mjs` named `<cwd>/proj`,
 * a directory that does not exist and, being inside repoRoot, made the refusal
 * call another project's lane "this repository's own run". That is the precise
 * move KD-27 exists to stop a reader making, made by the gate itself.
 *
 * So: a quoted operand is delimited and is read exactly. An unquoted one that
 * starts with `/` is its own operand. An unquoted RELATIVE one preceded by an
 * absolute-looking argument has two readings and is returned as both, for the
 * caller to settle against the disk — never silently completed into one.
 */
function laneOperand(args) {
  const s = String(args ?? "");
  const quoted = /(?:^|\s)(["'])((?:[^"']*\/)?qa\/verify\.mjs)\1(?=\s|$)/.exec(s);
  if (quoted) return { operand: quoted[2], absolute: quoted[2].startsWith("/"), joined: null };

  const tokens = s.split(/\s+/).filter(Boolean);
  const i = tokens.findIndex((t) => t === "qa/verify.mjs" || t.endsWith("/qa/verify.mjs"));
  if (i === -1) return null;
  const operand = tokens[i];
  if (operand.startsWith("/")) return { operand, absolute: true, joined: null };

  // The last absolute-looking token before it: if the real operand was an
  // absolute path with a space in it, that is where it began.
  let j = -1;
  for (let k = i - 1; k >= 0; k -= 1) {
    if (tokens[k].startsWith("/")) {
      j = k;
      break;
    }
  }
  return { operand, absolute: false, joined: j === -1 ? null : tokens.slice(j, i + 1).join(" ") };
}

/** Everything the refusal says about one lane process. Exported so a test can point it at a real one. */
export function laneAt(pid, args, run = shell()) {
  const project = laneProject(pid, args, run);
  let marker = null;
  if (project) {
    try {
      marker = JSON.parse(createRequire(import.meta.url)("node:fs").readFileSync(path.join(project, "qa", ".lane-in-progress"), "utf8"));
    } catch {
      marker = null;
    }
  }
  return { pid: Number(pid), args, project, marker };
}

/** The fleet record and the hash of the tree it would have to describe. */
export async function releaseContext() {
  const fs = await import("node:fs");
  const { deviceTreeHash } = await import("../observed-tree.mjs");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  let record = null;
  try {
    record = JSON.parse(fs.readFileSync(path.join(root, "qa-artifacts", "fleet-latest.json"), "utf8"));
  } catch {
    record = null;
  }
  return { record, now: deviceTreeHash(root) };
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
      const ctx =
        kind === "publish"
          ? await releaseContext()
          : kind === "device"
            ? { runningLane: runningLane(), repoRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..") }
            : undefined;
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
      close(undefined, { via: "merge" });
    } catch {
      /* a failed close leaves the plan, which the next session names as stale */
    }
    return;
  }

  if (event === "SessionStart") {
    try {
      const { obligation, render } = await import("../proof-plan.mjs");
      const { suiteStatus } = await import("../suite-record.mjs");
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
            render({ ...obligation(), suite: suiteStatus() }) +
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
