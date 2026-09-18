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
//                       because that run could discharge nothing, or when this branch
//                       does not contain origin/main, because the merge will bring it
//                       in and the run would describe bytes that never land (2026-09-16:
//                       four emulator runs for one merge). ALLOWED while owed, with the
//                       schedule as the reason.
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
//
// AND EVERY ONE OF THOSE VERDICTS IS ABOUT THE TREE THE COMMAND WILL ACT ON, which
// is not necessarily the tree this file was loaded from. See "WHICH TREE IS THIS
// COMMAND ABOUT?" below (KD-79): the tree is resolved from the payload's cwd and
// the command's own leading `cd`, git says whether that is a worktree of THIS
// repository, and the answer decides between judging it, saying nothing about
// somebody else's repository, and refusing because the gate could not tell.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// A COMMAND POSITION — declared ONCE, because this file has now had the same
// defect twice for having declared it twice.
//
// Two readers here need to know where a command begins: `invocation()`, which
// decides whether this gate runs at all, and `COMPOUND`, which decides whether a
// directory can be read. KD-105 was those two spelling it differently, and the
// fix gave COMPOUND a second literal list — so KD-107 was the same defect a
// commit later, with COMPOUND the WIDER one, which is the safe direction for the
// reader that refuses and the fail-open direction for the reader that is the
// door. Measured on 2026-09-18: `! gh pr merge`, `timeout 300 gh pr merge`,
// `command gh pr merge` and `2>/dev/null gh pr merge` all returned null, and a
// null makes the handler return before any verdict — an unproven merge with no
// gate in the path at all. Editing both lists to agree is what left KD-107
// behind; there is one list below, and a test asserts both readers are built
// from it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A word inside a wrapper run never crosses a character that ends a command, and
 * the gaps inside the run are HORIZONTAL whitespace — a newline ends a command as
 * surely as a `;` does. Both are true of the shell's own grammar, which is why
 * they are written; NEITHER IS PINNED BY A TEST TODAY, and saying so is the point
 * of this paragraph.
 *
 * They were load-bearing against the first cut of this declaration, which let a
 * wrapper carry bare operands: written `\S*`, an operand swallowed the `;` that
 * closed its own command, the match then began at the start of the line instead
 * of at that separator, and the prefix `commandCwd` is handed shrank to nothing.
 * Fifteen shapes of
 * test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs
 * went from refused to READ, `time . /x/s.sh; gh pr merge` among them — the
 * six-shape class KD-105's fix had just closed. Review round 1 removed the bare
 * operand run (a wrapper now carries only what its own table entry declares), and
 * with it gone, a mutation run relaxing either of these to `\S` and `\s+` leaves
 * every test in this tree green. They are kept because they are right about the
 * shell, not because anything currently measures them; that is KD-111.
 *
 * The assignment and redirection alternatives below are `\S*` and the first
 * clause is NOT true of them — KD-110, logged with the sweep that went looking
 * for a consequence and could not produce one.
 */
const IN_WORD = "[^\\s;&|()<>]";
const GAP = "[^\\S\\n]+";

/**
 * The words that may stand in front of a command without being the command, and
 * WHAT EACH ONE IS ALLOWED TO CARRY. The list is CLOSED and it is stated in
 * docs/GATE-RULES.md (Rule 4), so the next reader is not left to infer it from a
 * regex.
 *
 * `flags` are the single-letter options THAT wrapper takes a separate value for
 * — `sudo -u nobody`, `nice -n 10`, `timeout -s KILL`. A joined value (`-unobody`,
 * `--user=nobody`) is one token and needs no entry. `operand` is a bare word the
 * wrapper takes before the command, and `timeout` is the only one here that has
 * one: its duration.
 *
 * **EVERY OTHER WORD ENDS THE RUN AND IS THE COMMAND.** That sentence is the
 * whole rule, and it is here because the version that guessed at it shipped both
 * of this file's historical mistakes at once. Given "a wrapper may carry up to
 * two bare operands", the reader has no way to know what an operand MEANS, so it
 * put a command position where the shell has none:
 *
 *     time echo gh pr merge            classified as a MERGE — the shell prints three words
 *     time git add . && cd X && …      REFUSED for `if/for/while/case/{ }/source`,
 *                                      none of which is in it, because `.` landed
 *                                      in a command position it does not occupy
 *
 * The first is the mention this hook refused on its first live run; the second is
 * KD-64, one wrapper word to the left of where it was fixed. Both are measured
 * against `/bin/sh` in
 * test/a-wrapper-turns-the-words-behind-it-into-a-command-they-are-not.test.mjs,
 * which is also why the arity is per wrapper rather than one number: `sudo -u`
 * takes a value and `time -p` does not, and a union of the two reads `time -p
 * echo gh pr merge` as a merge.
 */
const WRAPPER_ARITY = Object.freeze({
  "!": { flags: "", operand: null },
  builtin: { flags: "", operand: null },
  caffeinate: { flags: "tuw", operand: null },
  command: { flags: "", operand: null },
  env: { flags: "uCS", operand: null },
  eval: { flags: "", operand: null },
  exec: { flags: "a", operand: null },
  nice: { flags: "n", operand: null },
  nohup: { flags: "", operand: null },
  sudo: { flags: "ughprtUC", operand: null },
  time: { flags: "of", operand: null },
  timeout: { flags: "sk", operand: "\\d+(?:\\.\\d+)?[smhd]?" },
  xargs: { flags: "nILPsEad", operand: null },
});

/** The closed list itself, derived from the table so there is still exactly one source for it. */
export const COMMAND_WRAPPERS = Object.freeze(Object.keys(WRAPPER_ARITY));

const WRAPPER = `(?:${[...COMMAND_WRAPPERS].sort((a, b) => b.length - a.length).join("|")})`;

/**
 * A flag's value: one word that is not a flag, not an assignment and not a
 * wrapper — so it can be read exactly one way. The assignment exclusion is not
 * taste, and unlike the two clauses above it is measured: without it
 * `sudo -u A=1` is readable both as the value of `-u` and as an iteration of the
 * assignment alternative, every such pair doubles the parses the engine walks,
 * and 20 of them hang a reader that answers in microseconds with the exclusion
 * in place. The hook has a 10s `PreToolUse` budget and a verdict it does not
 * deliver inside it is an allow, so this is a fail-open whose trigger is the
 * length of the command being judged
 * (test/the-command-position-reader-can-spend-the-whole-gate-budget-on-one-command.test.mjs,
 * which carries one row per overlapping token shape).
 */
const VALUE = `(?!${WRAPPER}(?=\\s|$))(?![A-Za-z_][A-Za-z0-9_]*=)[^-\\s;&|()<>]${IN_WORD}*`;

/** One wrapper and the options and operand its own table entry allows it. */
const wrapperTerm = (word) => {
  const { flags, operand } = WRAPPER_ARITY[word];
  const flagRun = flags ? `(?:${GAP}-(?:[${flags}](?=\\s)${GAP}${VALUE}|${IN_WORD}*))*` : `(?:${GAP}-${IN_WORD}*)*`;
  return `${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${flagRun}${operand ? `(?:${GAP}${operand}(?=\\s|$))?` : ""}`;
};

/**
 * What may stand between a separator and the command: a run of wrappers,
 * `VAR=value` assignments and redirections, in any order. Exported as regex
 * SOURCE rather than a RegExp because both readers embed it in a larger pattern
 * — and a test reads it back out of both to prove neither grew a copy.
 */
export const COMMAND_PREFIX =
  "(?:" +
  `(?:${[...COMMAND_WRAPPERS].sort((a, b) => b.length - a.length).map(wrapperTerm).join("|")})${GAP}` +
  `|[A-Za-z_][A-Za-z0-9_]*=\\S*${GAP}` +
  `|\\d*[<>]+\\S*${GAP}` +
  ")*";

/**
 * Where a command may BEGIN. The two readers run at different moments, so they
 * honour one shared core and two deltas — and each delta is about the STAGE, not
 * about taste, which is the difference between this asymmetry and the one above:
 *
 *   the classifier reads RAW text, so `-c "` is the one place a quotation opens
 *   a command (`sh -c "node …"`), and a `{`, `}` or `)` inside a quoted word
 *   would be read as structure that is not there — `git commit -m "{gh pr
 *   merge}"` is a commit;
 *
 *   `commandCwd` reads MASKED text, where every quoted span is already blanked,
 *   so `-c "` can no longer occur at all and a brace group or a `case` pattern's
 *   `)` left standing is genuinely structural.
 */
const SEPARATORS = ";&|(\\n";
const RAW_SEPARATOR = `(?:^|[${SEPARATORS}]|-c\\s+["'])`;
const MASKED_SEPARATOR = `(?:^|[${SEPARATORS}){}])`;

/**
 * The commands this gate has an opinion about. Anything else is none of its
 * business — and "anything else" includes MENTIONING these programs: the first
 * live run of this hook refused an `echo` of a JSON payload, and then refused
 * the edit that would have fixed it, because it matched the name anywhere in
 * the string. So a match is an INVOCATION: the program at a command position —
 * the start, or after `;` `&&` `||` `|` `(` or a newline, or after `-c "` so
 * `sh -c "node …"` is seen — with `VAR=value` assignments, redirections and the
 * wrappers above in front, in any order.
 * `cat scripts/fleet-check.mjs`, `grep "node scripts/fleet-check.mjs"` and
 * `git commit -m "then gh pr merge"` are not invocations; a quote is a
 * boundary only when it opens a `-c` script, which is the one place a quoted
 * string IS a command.
 */
const invocation = (prog) => new RegExp(`${RAW_SEPARATOR}\\s*${COMMAND_PREFIX}${prog}(?=\\s|$|["')])`);

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
        return orderedRun(o, ctx?.base);
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
 * The OWED/REOPENED verdict, once the ordering question has been asked (or not).
 *
 * The allow string when nothing is wrong is byte-identical to the one this gate
 * printed before the ordering check existed, and a test calls `decide("device",
 * owed, TIERS)` with NO ctx and compares the two: a precondition that quietly
 * rewords the ordinary case would make every other test of this path a test of
 * this one.
 *
 * Three ways this can speak, and the difference between the last two is the
 * whole point of `baseContext` returning what it returns: REFUSE when the branch
 * demonstrably does not contain trunk, ALLOW-AND-SAY-SO when the question could
 * not be answered, and ALLOW-AND-SAY-SO when it was answered by this checkout's
 * own ref rather than by origin. A gate that cannot see must not pass silently.
 */
function orderedRun(o, base) {
  const owed = `the device tier is ${o.state.toUpperCase()} and this is the LAST gate: run it only when npm test and framework-check are green and you are about to open the PR — a trigger path edited afterwards reopens the slice. Then: node scripts/proof-plan.mjs --discharge`;
  const why = `A device run proves a TREE, and the merge brings origin/main into that tree — the bytes move, and the tier REOPENS for any of them that is a device trigger path, so the run is bought a second time. Measured 2026-09-16: four emulator runs for one merge, each one owed by this program and none of them needed.`;
  const fix = `git fetch origin && git rebase origin/main`;
  if (!base) return allow(owed);

  if (base.contained === false) {
    const at = String(base.sha ?? "").slice(0, 7);
    // Only the two branches below where the commit IS present and WAS compared
    // print this, so a null `behind` is a count git did not produce — never an
    // absence. The `unfetched` branch has its own sentence, and there the
    // checkout genuinely does not have the commit.
    const short = base.behind === null ? "how far behind HEAD is could not be counted" : `HEAD is ${base.behind} commit${base.behind === 1 ? "" : "s"} short of it`;
    const how = base.unfetched
      ? `origin/main has MOVED to ${at}, a commit this checkout does not even have`
      : base.source === "remote"
        ? `origin/main has MOVED to ${at} and ${short} — read from origin just now`
        : `origin/main is at ${at} and ${short} — read from this checkout's own ref, which no call to origin could make less true (and if trunk was rewound, the same fetch below corrects the ref and clears this)`;
    return deny(`the device tier is ${o.state.toUpperCase()}, but this branch does not contain origin/main: ${how}. ${why} Bring trunk in first, then run the tier once: ${fix}`);
  }

  if (base.contained === null) {
    return allow(
      `${owed}\n\nORDERING UNCHECKED: ${base.reason ?? "this gate could not ask where trunk is"}. Whether this branch contains origin/main is what makes a device run a proof of the tree the merge will keep — this gate could not tell, so it is not refusing. If trunk has moved, ${fix} before the run: ${why}`,
    );
  }

  if (base.source !== "remote") {
    return allow(
      `${owed}\n\nORDERING read from the local ref (this checkout's own origin/main at ${String(base.sha ?? "").slice(0, 7)}), not from origin: ${base.reason ?? "origin was not asked"}. By that ref this branch contains trunk — but a ref is only as fresh as its last fetch, and a stale one is exactly the 2026-09-16 case. If in doubt: ${fix}`,
    );
  }
  return allow(owed);
}

/**
 * A device run proves a TREE the merge has to keep — and the budget the question
 * is allowed to cost.
 *
 * MEASURED 2026-09-16: four emulator runs for one merge, every one of them owed
 * by this program and none of them needed. main's CI was red, the fix merged
 * under the release branch, the branch was rebased onto it — and each rebase
 * moved the bytes the last run had described, so the tier REOPENED. The rule
 * ("check main's CI first") was in project memory; the program could not see it.
 * This is the program seeing it, at the one moment it matters.
 *
 * THE REMOTE IS READ WITH `git ls-remote`, NEVER `git fetch`:
 *   (a) A GATE MUST NOT MOVE THE BASELINE IT JUDGES. Every obligation here is
 *       derived from `git merge-base HEAD origin/main` (changedPaths(),
 *       scripts/proof-plan.mjs). A fetching hook would advance
 *       refs/remotes/origin/main and silently change what the NEXT obligation()
 *       computes — the gate would alter the state it exists to read. `ls-remote`
 *       writes nothing: no refs, no FETCH_HEAD, no packs.
 *   (b) THIS RUNS INSIDE A KILL-TIMER. A SIGKILLed `git fetch` can leave a
 *       partial pack or a refs/remotes/origin/main.lock behind; a SIGKILLed
 *       `ls-remote` cannot leave anything.
 *   (c) There is no speed argument either way. Measured 2026-09-17 against this
 *       repo's real origin: ls-remote 1.01 / 1.19 / 1.34 s, `fetch --quiet
 *       origin main` 0.94 / 1.02 / 1.03 s — both dominated by connection setup.
 *       The tie breaks on safety.
 * A remote sha this checkout does not have still answers the question: you
 * cannot contain a commit you do not have, so "not present locally" IS "not
 * contained", and it makes the more informative refusal.
 *
 * THE CHEAP LOCAL ANSWER COMES FIRST, AND THE REFUSAL PATH ASKS ORIGIN NOTHING.
 * If the local ref already says HEAD does not contain it, the verdict is settled:
 * asking origin could only move trunk further ahead. Origin is asked in exactly
 * one case — the local ref says "contained" — because that is the only case where
 * the answer can change, and a stale ref saying "contained" about a main that has
 * moved IS the 2026-09-16 failure. The one false refusal this admits is a
 * force-push that REWOUND main; trunk here never rewinds, the refusal names the
 * sha it used, and the fetch-and-rebase it prints corrects the ref and clears it.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Near enough to when Claude Code started this hook's kill-timer: node's own
 * startup before this line is tens of ms.
 */
export const STARTED_MS = Date.now();

/**
 * What the gate keeps back for ANSWERING — node startup, obligation()'s own git,
 * and emitting the decision. Measured on this tree 2026-09-17: the real hook
 * answers a device payload in 0.16–0.19s. This is ~8x that.
 */
export const ANSWER_RESERVE_MS = 1500;

/** No question put to origin is worth more than this. The three measured ls-remote answers were 1.01 / 1.19 / 1.34s; this is the slowest, roughly doubled. */
export const REMOTE_CALL_CAP_MS = 2500;

/** The fastest measured answer was 1.01s, so with less than this left there is nothing to buy: do not ask, and say the answer is the local ref's. */
export const REMOTE_CALL_FLOOR_MS = 1000;

/** Each local git call inside the check. They answer in ~10ms; this is the bound for the day one does not. */
const LOCAL_CALL_CAP_MS = 1000;

/**
 * The whole "which tree is this command about" question, on one purse.
 *
 * It is at most two `rev-parse` calls against local git dirs, which answer in
 * ~10ms; this is a hundred times that, and it is spent BEFORE anything else the
 * gate does, so it shrinks the purse the ordering check is later given
 * (remoteBudgetMs reads the clock, not a constant). Exported because it is now
 * a term of the arithmetic invariant a test reads off the wiring.
 */
export const TREE_PROBE_TOTAL_MS = 1000;

/**
 * The budget this hook's own wiring declares for it, in ms.
 *
 * Past it the hook is KILLED and its decision is never delivered — and a
 * PreToolUse decision that is never delivered is not a refusal, it is a
 * PERMITTED command (see the shell() comment below, and the test named for it).
 * So every bound in here is derived from this number rather than chosen, and a
 * test pins the sum.
 */
export function declaredBudgetMs(root = REPO_ROOT) {
  const fs = createRequire(import.meta.url)("node:fs");
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(path.join(root, ".claude", "settings.json"), "utf8"));
  } catch {
    return 10000; // unreadable wiring: assume the number this repo declares today
  }
  const entry = (settings.hooks?.PreToolUse ?? []).flatMap((e) => e.hooks ?? []).find((h) => String(h.command ?? "").includes("scripts/hooks/proof-gate.mjs"));
  // Claude Code's own default when a hook declares no timeout is 60s.
  return (typeof entry?.timeout === "number" ? entry.timeout : 60) * 1000;
}

/** What is left for the whole ordering check, after what is already spent and what answering will cost. Can be zero or negative, and then nothing is asked. */
export function remoteBudgetMs(elapsedMs = Date.now() - STARTED_MS) {
  return Math.min(REMOTE_CALL_CAP_MS, declaredBudgetMs() - elapsedMs - ANSWER_RESERVE_MS);
}

/**
 * WHY a call produced no exit code, as a phrase that is true of THAT cause —
 * never a shared one. A single widened sentence would tell the empty-PATH case
 * that git "was killed at its bound", which is itself a false statement, and the
 * whole point of this pair of fields is that the gate says only true things
 * about what it could not find out. Ordered by specificity: node's own three
 * failures carry an `error` (with a `code` for two of them), anything that
 * reached a process and died carries a `signal`.
 */
function whyNoAnswer(r, boundMs) {
  if (r.error?.code === "ETIMEDOUT") return `git did not answer inside ${boundMs}ms and was killed at its bound`;
  if (r.error?.code === "ENOBUFS") return "git produced more output than this gate will read, so it did not answer";
  if (r.error) return `git could not be run (${r.error.code ?? r.error.message})`;
  if (r.signal) return `git, killed by ${r.signal}, did not answer`;
  return "git produced no exit code, so it did not answer";
}

/** `git`, bounded twice: every call has its own cap, and they all draw from one deadline so several slow ones cannot sum past the budget. */
function gitAt(root, deadline) {
  const { spawnSync } = createRequire(import.meta.url)("node:child_process");
  return (args, capMs = LOCAL_CALL_CAP_MS) => {
    const left = deadline - Date.now();
    if (left <= 0) return { answered: false, ok: false, out: "", status: null, why: "the budget ran out before git could be asked" };
    const boundMs = Math.min(capMs, left);
    const r = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: boundMs,
      killSignal: "SIGKILL",
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        // Nothing here may block on a human, and nothing here may write: no
        // credential prompt, no index lock refresh, and no lazy fetch of an
        // object a partial clone does not have.
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_NO_LAZY_FETCH: "1",
      },
    });
    // ONE COMPLETE TEST, not an enumeration of deaths. `r.error` is set by node
    // for EXACTLY three things — a spawn that never happened, node's own
    // `timeout`, and `maxBuffer` — so a child that started and was then killed
    // by anyone else (an OOM kill, a `pkill`, a segfault) comes back with
    // `error` undefined and slips through any guard that names causes. Naming
    // causes is precisely how the previous round left this one open. `status` is
    // a number when and only when the child produced an exit code, which is the
    // fact every caller here actually needs, and it cannot leave a fifth cause
    // open. `why` then says which cause it was, for the agent, not for the
    // branching.
    const answered = typeof r.status === "number";
    return { answered, ok: answered && r.status === 0, out: String(r.stdout ?? "").trim(), status: answered ? r.status : null, why: answered ? null : whyNoAnswer(r, boundMs) };
  };
}

const SHA = /^[0-9a-f]{40}$/;
const cannotSay = (reason) => ({ contained: null, behind: null, sha: null, source: null, reachedRemote: false, unfetched: false, reason });

/**
 * Does this branch contain trunk? `null` when the question does not apply.
 *
 * Four outcomes, and "does not apply" is not "could not answer":
 *   null                            — trunk, or a detached HEAD. Silence.
 *   { contained: null, reason }     — git could not answer. An ALLOW that says so.
 *   { contained: false, … }         — REFUSE.
 *   { contained: true, … }          — ALLOW, with a note unless origin itself said it.
 *
 * The branch is passed IN rather than read again: obligation() already has it on
 * `o.branch`, from `git branch --show-current`, and a second reading spelled
 * `rev-parse --abbrev-ref HEAD` would answer "HEAD" on a detached checkout where
 * the first answers "" — a difference that passes locally and misbehaves in CI.
 * A test pins both spellings against a real detached HEAD.
 *
 * `isTrunk` is handed in for the same reason and one more: the trunk rule stays
 * defined exactly once, in scripts/proof-plan.mjs, instead of being restated
 * here where the two copies would drift apart. And taking it as an argument is
 * what lets this file go on importing NOTHING before a command has matched —
 * the property its own header claims and test/proof-gate-hook.test.mjs:148
 * measures — without reaching for a module loader on a refusal path to get it.
 */
export function baseContext(root = REPO_ROOT, { branch, isTrunk, budgetMs = remoteBudgetMs() } = {}) {
  if (typeof isTrunk !== "function") return cannotSay("the branch rule was not supplied to this check");
  if (isTrunk(branch)) return null;

  // ONE PURSE FOR THE WHOLE CHECK. Nothing runs at all when it is already empty:
  // that is an allow that says so, never a refusal — a refusal delivered after
  // the kill-timer is a permitted command, and a refusal computed with no time
  // to compute it is a guess.
  if (!(budgetMs > 0)) return cannotSay(`there was no budget left to ask (the gate keeps ${ANSWER_RESERVE_MS}ms of its ${declaredBudgetMs()}ms back for delivering this decision)`);
  const deadline = Date.now() + budgetMs;
  const git = gitAt(root, deadline);

  // A CALL THAT PRODUCED NO EXIT CODE IS NOT AN ANSWER — and, in particular, it
  // is not this call's "no". So every one of these sites asks `answered` FIRST
  // and only then reads `ok`: a git that was never spawned, that was killed at
  // its bound, or that the OS took out was otherwise reported as a checkout with
  // no origin at all. All of those are "could not answer", and `why` says which
  // one it was — the purse running out, a call killed at its bound, a git that
  // crashed and a git that is not on PATH are different facts, and this whole
  // design turns on not collapsing "could not answer" into "answered no".
  const origin = git(["remote", "get-url", "origin"]);
  if (!origin.answered) return cannotSay(`${origin.why}, so this checkout could not be asked whether it has an origin remote`);
  if (!origin.ok) return cannotSay("this checkout has no origin remote, so there is no trunk for it to be behind");

  const ref = git(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"]);
  if (!ref.answered) return cannotSay(`${ref.why}, so refs/remotes/origin/main could not be read`);
  if (!ref.ok || !SHA.test(ref.out)) return cannotSay("this checkout has no refs/remotes/origin/main to read");
  const local = ref.out;

  const behindBy = (sha) => {
    // A count git never produced an exit code for — killed at its bound, killed
    // from outside it, or never spawned — or one it declined to produce, is
    // not a count and is not a zero: `null`, which the refusal renders as "could
    // not be counted" (orderedRun) and never as an absence git did not report.
    const n = git(["rev-list", "--count", `HEAD..${sha}`]);
    return n.ok && /^\d+$/.test(n.out) ? Number(n.out) : null;
  };
  const contains = (sha) => {
    // `--is-ancestor` exits 0 for yes and 1 for no; anything else is git failing
    // to answer, which is not a no.
    const r = git(["merge-base", "--is-ancestor", sha, "HEAD"]);
    return r.status === 0 ? true : r.status === 1 ? false : null;
  };

  const localSays = contains(local);
  if (localSays === null) return cannotSay("git could not compare this branch with origin/main");
  if (localSays === false) {
    return { contained: false, behind: behindBy(local), sha: local, source: "local", reachedRemote: false, unfetched: false, reason: null };
  }

  // The local ref says "contained", which is the one case origin can overturn.
  // A purse too small for a call to origin still spends the local half — it
  // costs tens of milliseconds and it is the valuable half; only the question to
  // origin is dropped, and the allow says which of the two answered.
  return askOrigin(git, { local, deadline, behindBy, contains });
}

/** The second half: the local ref says "contained", so origin is the only thing that can change the verdict. */
function askOrigin(git, { local, deadline, behindBy, contains }) {
  const settled = (over) => ({ contained: true, behind: 0, sha: local, source: "local", reachedRemote: false, unfetched: false, reason: null, ...over });

  const left = deadline - Date.now();
  if (left < REMOTE_CALL_FLOOR_MS) return settled({ reason: `${Math.max(0, left)}ms of the gate's budget was left and the fastest answer measured from this repo's origin was 1.01s, so origin was not asked` });

  const probe = git(["ls-remote", "origin", "refs/heads/main"], Math.min(REMOTE_CALL_CAP_MS, left));
  if (!probe.answered) return settled({ reason: probe.why });
  if (!probe.ok) return settled({ reason: "origin could not be reached" });

  const remote = String(probe.out.split(/\s+/)[0] ?? "");
  if (!SHA.test(remote)) return settled({ reachedRemote: true, reason: "origin has no refs/heads/main" });
  if (remote === local) return { contained: true, behind: 0, sha: remote, source: "remote", reachedRemote: true, unfetched: false, reason: null };

  // ASKED BEFORE `ok`, because this is the one call whose non-answer would
  // REFUSE: `!ok` here means "this checkout does not have that commit", and a
  // call that produced no exit code — killed at its bound, killed by the OS,
  // crashed, never spawned — means nothing of the kind. Read as a no it printed
  // "a commit this checkout does not even have" about a commit the checkout
  // demonstrably has — the false block this precondition's own contract forbids:
  // a question git cannot answer must allow and say so.
  const have = git(["cat-file", "-e", `${remote}^{commit}`]);
  if (!have.answered) return cannotSay(`origin/main is ${remote.slice(0, 7)} and ${have.why}, so this checkout could not be asked whether it has that commit`);
  if (!have.ok) return { contained: false, behind: null, sha: remote, source: "remote", reachedRemote: true, unfetched: true, reason: null };

  const says = contains(remote);
  if (says === null) return cannotSay(`origin/main is ${remote.slice(0, 7)} and git could not compare it with this branch`);
  if (says) return { contained: true, behind: 0, sha: remote, source: "remote", reachedRemote: true, unfetched: false, reason: null };
  return { contained: false, behind: behindBy(remote), sha: remote, source: "remote", reachedRemote: true, unfetched: false, reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// WHICH TREE IS THIS COMMAND ABOUT? (KD-79)
//
// Everything above judges a TREE, and until this section existed the tree was
// always this file's own — `REPO_ROOT`, which `.claude/settings.json` fixes to
// the SESSION's worktree by spelling the hook `node
// "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/proof-gate.mjs"`. The command being
// gated runs wherever the Bash tool runs it, and with more than one worktree of
// this repository checked out at once — which is how this repo is worked —
// those are routinely different trees. Measured 2026-09-18, three times in one
// session: an OWED fleet check refused as "nothing is owed"; `gh pr merge` on
// PR #150 refused over three files that were in another worktree; and, silently,
// the mirror image, a merge ALLOWED because the session's tree happened to owe
// nothing while the tree being merged owed both at-close tiers.
//
// So the tree is resolved first, from two things the gate is actually given:
//   the cwd     Claude Code puts it in the PreToolUse payload. Absent, the hook
//               process's own cwd is read — which is not a guess: the wiring's
//               own `:-.` fallback already resolves this file against exactly
//               that directory, so when it is taken, cwd IS `REPO_ROOT`.
//   the command a command that runs elsewhere usually says so. A leading `cd`
//               is read when it is written literally, and `node
//               <somewhere>/scripts/fleet-check.mjs` names its tree outright.
// Then git decides the rest, because no string comparison can: this repo keeps
// its worktrees INSIDE the checkout (`.claude/worktrees/`), so the tree that
// must be judged is routinely a subdirectory of the tree that must not be. Two
// `rev-parse --show-toplevel --git-common-dir` calls settle both questions —
// where the worktree begins, and whether it is a worktree of THIS repository.
// KD-64 named this call and left it for a slice that could pay for it
// deliberately; this is that slice.
//
// THREE ANSWERS, AND THE DIRECTION OF EACH IS THE POINT:
//   a worktree of this repo   judge it — its plan, its diff, its branch.
//   NOT this repo             SILENT. This gate enforces this repository's proof
//                             schedule; a command acting on another repository's
//                             tree has no obligation here to state, and refusing
//                             one would be a gate blocking real work for a reason
//                             that is not true (KD-64 is that mistake, made the
//                             other way round).
//   could not tell            REFUSE. Not "assume the session's" — that
//                             assumption IS the defect. The one exception is
//                             `gh pr create`, which is advisory by design and
//                             says it could not tell instead of blocking.
// Every parsing failure below lands in the third answer, which is why the
// parsing is allowed to be conservative rather than clever.
// ─────────────────────────────────────────────────────────────────────────────

/** A directory operand this gate will act on only when it is written literally — no variable, subshell, glob, `~` or embedded space. */
const LITERAL_PATH = /^[^$`*?[\]~\s]+$/;

/**
 * The ways a shell changes directory, at a command position. No `-c ["']`
 * boundary, unlike WATCHED: by the time this runs, every quoted span is blanked,
 * so a `cd` inside `sh -c '…'` is not there to be read — which is correct, that
 * `cd` belongs to another process and dies with it.
 */
const CHDIR = /(?:^|[;&|(\n])\s*(cd|pushd|popd|chdir)(?=[\s;&|)]|$)([^;&|)\n]*)/g;

/**
 * Shell forms whose control flow decides whether a `cd` ran at all, and which
 * this reader does not follow. A brace group is the one that catches people out:
 * `{ cd X; }` is NOT a subshell, so its `cd` persists — no paren to count, and a
 * reader that only counts parens misses it and falls back to the session's tree,
 * which is KD-79 itself.
 *
 * AT A COMMAND POSITION — `COMMAND_PREFIX` above, the one declaration this file
 * has, and not a second copy of it. The boundary was wrong twice in two commits,
 * once in each direction, and both halves are measured. Spelled as "preceded by
 * whitespace", this matched `done`, `for` and `.` wherever they stood as
 * ARGUMENTS: `git add .`, `echo done`, `touch done`. It turned an everyday
 * command in front of a merge into a refusal whose sentence named
 * `if/for/while/case/{ }/source`, none of which was in the command, so there was
 * nothing in it for the reader to change. Narrowed to "preceded by a separator"
 * it then let SIX shapes through, because a command position is a separator plus
 * an optional run of wrappers and assignments — `time . ./s.sh`, `! source
 * ./s.sh`, `FOO=bar . ./s.sh`, `2>/dev/null . ./s.sh`. The fix for THAT was a
 * second literal list here, which is KD-107: it drifted from `invocation()`'s
 * inside one slice, in the direction that costs a certification rather than a
 * message. Both errors, and every construct this refuses, are swept against
 * `/bin/sh` in
 * test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs.
 */
export const COMPOUND = new RegExp(
  `${MASKED_SEPARATOR}\\s*${COMMAND_PREFIX}(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|select|function|\\{|\\}|source|eval|exec|\\.)(?=[\\s;&|(){}]|$)`,
);

/** `gh` will act on a repository named out of band from ANY directory, so a command that names one has no tree to read. */
const NAMED_REPO = /(?:^|\s)(?:--repo[=\s]|-R\s)|(?:^|\s)GH_REPO=/;

/** npm flags that move the package being published away from the directory the command runs in. */
const NPM_RELOCATES = /(?:^|\s)(?:--prefix|--workspaces?|-w|-C)(?:[=\s]|$)/;

/** npm flags whose NEXT token is a value, not the folder operand — so `npm publish --access public` is not read as publishing "public". */
const NPM_TAKES_VALUE = new Set(["--access", "--tag", "--otp", "--registry", "--auth-type", "--userconfig", "--provenance-file"]);

/**
 * The command prefix with everything this reader must not read blanked to spaces
 * — or `{ unknown }` when it cannot get that far.
 *
 * THE POINT OF MASKING FIRST. A `cd` is only a `cd` if the shell would perform
 * it, and the difference is decided by quoting, by which process runs it, and by
 * control flow — none of which a regex over raw text can see. Measured against
 * `/bin/sh` as an oracle (test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs),
 * the raw reader was wrong on ten shapes in BOTH directions: it read `cd`s the
 * shell never performs (inside `echo "…"`, inside a heredoc, inside a nested
 * `sh -c`, and one kept alive by an unbalanced `(` in a quoted word) and it
 * dropped `cd`s the shell does perform (inside `if`/`for`/`{ }`, and one killed
 * by an unbalanced `)` in a quoted word). Both directions end in a false ALLOW.
 *
 * So the spans that are not commands are blanked — LENGTH-PRESERVING, because
 * the invocation's index is already measured against the raw string — and once
 * they are, every paren left is structural and counting them is sound. What
 * cannot be blanked is refused, which is the whole rule of this file: a tree
 * this gate cannot determine is one it refuses to judge.
 */
function readablePrefix(prefix) {
  let s = "";
  for (let i = 0; i < prefix.length; ) {
    const c = prefix[i];
    if (c === "\\") {
      s += i + 1 < prefix.length ? "  " : " ";
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      // Single quotes take no escapes; double quotes do. Either way the span is
      // not a command, so what is inside it is not read.
      let j = i + 1;
      while (j < prefix.length && prefix[j] !== c) j += c === '"' && prefix[j] === "\\" ? 2 : 1;
      // STILL OPEN WHERE THE COMMAND BEGINS, which is two different facts and one
      // honest sentence. Either the quoting is unbalanced, or — far more often —
      // the gated command is INSIDE the quotation: `sh -c "cd /x && gh pr merge"`
      // runs in a nested shell whose directory this reader does not follow, and
      // the prefix it was handed stops at the invocation, so the closing quote is
      // not in it to be found. Saying "never closes" was false for that shape and
      // it is the listed spelling of an invocation (test/proof-gate-hook.test.mjs).
      if (j >= prefix.length) return { unknown: "a quotation still open where the command begins — the command is inside a quoted script (`sh -c \"…\"`) or the quoting is unbalanced, and this reader follows neither" };
      s += " ".repeat(j - i + 1);
      i = j + 1;
      continue;
    }
    s += c;
    i += 1;
  }

  // A substitution runs in its own shell, so its `cd` never reaches this one.
  // Matched by counting, which is only sound now that quoted parens are gone.
  for (let open = s.indexOf("$("); open !== -1; open = s.indexOf("$(")) {
    let depth = 0;
    let j = open + 1;
    for (; j < s.length; j += 1) {
      if (s[j] === "(") depth += 1;
      else if (s[j] === ")" && (depth -= 1) === 0) break;
    }
    if (j >= s.length) return { unknown: "a `$(` it never closes" };
    s = `${s.slice(0, open)}${" ".repeat(j - open + 1)}${s.slice(j + 1)}`;
  }

  if (s.includes("`")) return { unknown: "a backquoted substitution, whose end this reader does not chase" };
  if (s.includes("<<")) return { unknown: "a heredoc, whose body this reader does not read" };
  if (COMPOUND.test(s)) return { unknown: "a compound command or a sourced script (if/for/while/case/{ }/source), whose control flow decides whether a `cd` ran at all" };

  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth += 1;
    else if (ch === ")" && (depth -= 1) < 0) return { unknown: "a `)` with no opener before it — the command sits inside something this reader did not see begin" };
  }
  return { text: s, depth };
}

/** The operand of a `cd`, when it is a directory this gate can name with certainty. */
function literalDir(raw) {
  let s = String(raw ?? "").trim();
  const quoted = /^(["'])(.*)\1$/.exec(s);
  // A quoted operand is delimited and is read exactly; an unquoted one can still
  // carry the closing quote of the `sh -c "…"` wrapper it was found inside.
  s = quoted ? quoted[2].trim() : s.replace(/["']+$/, "").trim();
  if (!s || s.startsWith("-")) return null; // `cd -`, `cd -P /x`: a destination this gate does not compute
  return LITERAL_PATH.test(s) ? s : null;
}

/**
 * The directory the command will run in — from the cwd the hook was given, and
 * from the command itself. `{ unknown }` when it cannot be read, never a guess.
 *
 * A `cd` whose destination is a variable refuses. A `cd` into a directory that is
 * not there refuses (below, on the disk) — which also covers `cd /gone; gh pr
 * merge`, where the `;` means the merge runs in the ORIGINAL directory after the
 * `cd` fails: the gate cannot tell those apart, so it does not try.
 */
export function commandCwd(kind, command, cwd) {
  const cmd = String(command ?? "");
  let dir = typeof cwd === "string" && cwd ? cwd : process.cwd();
  const at = WATCHED[kind]?.exec(cmd)?.index ?? 0;
  const prefix = cmd.slice(0, at);

  // THE `gh` COMMAND'S OWN ARGUMENTS, and not the whole string: `cp -R a b && gh
  // pr merge` is a compound command whose first half happens to contain gh's
  // short spelling of --repo, and refusing it would be this gate blocking real
  // work for a reason that is not true — the failure it is least allowed to have.
  const invoked = cmd.slice(at).replace(/^[;&|(\n]+/, "").split(/[;&|)\n]/)[0];
  if ((kind === "merge" || kind === "create") && NAMED_REPO.test(invoked)) {
    return { unknown: "it names its repository out of band (--repo / GH_REPO), which is not a directory on this machine" };
  }
  // WHAT IN FRONT OF THE COMMAND IS ACTUALLY A COMMAND. Everything that is not
  // gets blanked first; what cannot be blanked is refused rather than guessed at.
  const read = readablePrefix(prefix);
  if (read.unknown) return { unknown: `what runs in front of it contains ${read.unknown}` };

  // A SUBSHELL'S `cd` DIES WITH THE SUBSHELL. `(cd /elsewhere && true) && gh pr
  // merge` changes nothing for the merge, and reading it would hand the gate a
  // tree the command never touches — KD-79 again, with the gate's own parser as
  // the mistaken reader. So a `cd` applies only when the depth it sits at is
  // still open where the command is: deeper means its scope closed first.
  const scope = read.text;
  const depthAt = (i) => (scope.slice(0, i).match(/\(/g)?.length ?? 0) - (scope.slice(0, i).match(/\)/g)?.length ?? 0);
  const here = read.depth;
  CHDIR.lastIndex = 0;
  for (let m = CHDIR.exec(scope); m; m = CHDIR.exec(scope)) {
    // At the VERB, not at the match — the match begins on the separator before it.
    if (depthAt(m.index + m[0].indexOf(m[1])) > here) continue;
    // `cd /x & wait; …` BACKGROUNDS the cd, which makes it a subshell with no
    // paren to count: the parent's directory never moves. A single trailing `&`
    // is that; `&&` is an ordinary chain. Read from the WHOLE command, not from
    // the prefix — the prefix is cut at the invocation's own separator, so the
    // `&&` that chains the last `cd` to it would show here as a lone `&` and
    // every chained `cd` would be dropped as backgrounded. Masking is
    // length-preserving precisely so this index still means what it says.
    if (/^&(?!&)/.test(cmd.slice(m.index + m[0].length))) continue;
    if (m[1] !== "cd") return { unknown: `it changes directory with \`${m[1]}\`, whose destination this gate does not track` };
    const to = literalDir(m[2]);
    if (!to) return { unknown: `it begins with a \`cd\` this gate cannot read literally (${m[0].trim()})` };
    dir = path.resolve(dir, to);
  }

  if (kind === "device") {
    // The fleet check is a FILE, and a path to it names the tree the run will
    // prove more directly than any cwd does: `node /elsewhere/scripts/fleet-check.mjs`
    // proves /elsewhere, whatever directory it was typed in.
    const m = /node\s+(["']?)((?:\S*\/)?)fleet-check\.mjs/.exec(cmd.slice(at));
    if (!m) return { unknown: "the fleet check it invokes is written in a form this gate cannot resolve to a file" };
    if (m[2] && !LITERAL_PATH.test(m[2])) return { unknown: `the fleet check it names sits under a path this gate cannot read literally (${m[2]})` };
    if (m[2]) dir = path.resolve(dir, m[2], "..");
  }

  if (kind === "publish") {
    // npm publishes a PACKAGE, and the package is not always the directory the
    // command runs in: `--prefix`/`-C` move the whole run, `-w` picks a workspace
    // under it, and a positional operand names a folder or a tarball outright.
    // This reader resolves directories, so a command that names its package any
    // other way is one whose tree it has not read — and the publish gate is the
    // one place a wrong answer ships bytes to a registry.
    if (NPM_RELOCATES.test(invoked)) return { unknown: "it names the package directory out of band (--prefix, -C or --workspace), which this gate does not resolve to a tree" };
    const tokens = invoked.split(/\s+/).filter(Boolean);
    for (let k = tokens.indexOf("publish") + 1; k > 0 && k < tokens.length; k += 1) {
      if (!tokens[k].startsWith("-")) return { unknown: `it publishes "${tokens[k]}" rather than the directory it runs in, and this gate reads only directories` };
      if (NPM_TAKES_VALUE.has(tokens[k])) k += 1;
    }
  }
  return { dir };
}

/** A path as the disk knows it, so /var and /private/var are one directory and not two. */
function realpath(p) {
  try {
    return createRequire(import.meta.url)("node:fs").realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * The worktree a directory sits in, and the repository that worktree is OF.
 *
 * One call, two answers: `--show-toplevel` is where the worktree begins and
 * `--git-common-dir` is the repository's identity — the same for every linked
 * worktree of one repo, and different for any other repo. `-C` rather than a
 * spawn cwd on purpose: a spawn into a missing directory comes back ENOENT,
 * which `whyNoAnswer` renders as "git could not be run", indistinguishable from
 * git not being on PATH. With `-C`, git answers about the directory.
 */
function worktreeAt(dir, git) {
  const r = git(["-C", dir, "rev-parse", "--show-toplevel", "--git-common-dir"]);
  if (!r.answered) return { why: `${r.why}, so this gate could not ask which tree ${dir} belongs to` };
  if (!r.ok) return { outside: true };
  const [top, common] = r.out.split("\n").map((s) => s.trim());
  if (!top || !common) return { why: `git named no worktree for ${dir}` };
  // `--git-common-dir` is relative to where git ran, which `-C` made `dir`.
  return { root: realpath(top), id: realpath(path.resolve(dir, common)) };
}

/**
 * The tree this gate will judge this command against.
 *
 *   { root }     a worktree of this repository — judge it.
 *   { foreign }  not this repository's tree — silence.
 *   { unknown }  REFUSE (and, for `gh pr create`, say so and allow anyway).
 */
export function judgedTree(kind, command, cwd, { budgetMs = TREE_PROBE_TOTAL_MS, repoRoot = REPO_ROOT } = {}) {
  const asked = commandCwd(kind, command, cwd);
  if (asked.unknown) return asked;
  const dir = path.resolve(asked.dir);
  // THE ORDINARY CASE PAYS NOTHING. One session, one worktree, no `cd`: the
  // directory is this file's own tree and not a single git call is made — which
  // is also why every existing test of this hook is untouched by any of it.
  if (dir === repoRoot) return { root: repoRoot };

  const fs = createRequire(import.meta.url)("node:fs");
  let there;
  try {
    if (!fs.statSync(dir).isDirectory()) return { unknown: `the path it runs in (${dir}) is not a directory` };
  } catch {
    return { unknown: `the directory it runs in (${dir}) is not there` };
  }

  const git = gitAt(repoRoot, Date.now() + budgetMs);
  there = worktreeAt(dir, git);
  if (there.why) return { unknown: there.why };
  if (there.outside) return { foreign: `${dir} is not inside a git worktree` };

  const here = worktreeAt(repoRoot, git);
  if (here.why || here.outside) {
    const why = here.why ?? `this gate's own checkout (${repoRoot}) is not inside a git worktree`;
    return { unknown: `${why}, so it could not tell whether ${dir} is a worktree of the repository this gate enforces` };
  }
  if (there.id !== here.id) return { foreign: `${there.root} is a worktree of another repository` };

  // A worktree of this repo checked out before this program existed has no
  // schedule to read, and importing a file that is not there would come back as
  // "could not answer" with a module resolver's words rather than this gate's.
  if (!fs.existsSync(path.join(there.root, "scripts", "proof-plan.mjs"))) {
    return { unknown: `the worktree at ${there.root} carries no scripts/proof-plan.mjs, so it has no proof schedule to read` };
  }
  return { root: there.root };
}

/** The judged tree's OWN scheduler — its plan file, its change set, its branch rule, its trigger lists. A worktree answers for itself. */
const planOf = (root) => (root === REPO_ROOT ? import("../proof-plan.mjs") : import(pathToFileURL(path.join(root, "scripts", "proof-plan.mjs")).href));

const HONOURED = "Three forms are read: the cwd this hook was given, a literal `cd /absolute/path && …` in front of the command (a subdirectory is fine — it resolves to the worktree that holds it), and `node /absolute/path/scripts/fleet-check.mjs`. Anything else is refused rather than guessed at (docs/GATE-RULES.md, Rule 4).";

const cannotTell = (why) =>
  `this gate could not tell which tree this command will act on: ${why}. It judges the tree the command RUNS IN, never the session's own — that assumption is KD-79, which refused an owed device run and refused a merge over another worktree's files — so a tree it cannot name is a tree it cannot check. ${HONOURED}`;

const cannotTellCreate = (why) =>
  `reminder: this gate could not tell which tree this command will act on: ${why}. Nothing is blocked — the PR is the review surface and gh pr merge is where the at-close tiers are collected — but the reminder you would normally get here would be about a tree this gate could not name, so none is being invented. ${HONOURED}`;

/**
 * The whole PreToolUse decision: which tree, then what that tree owes.
 *
 * The lane probe stays EAGER for every device payload whose tree is known — it
 * is what the timeout proof stalls inside, and making it conditional would
 * retire that proof without anyone noticing.
 */
async function verdict(kind, command, cwd) {
  const where = judgedTree(kind, command, cwd);
  if (where.foreign) return SILENT;
  if (where.unknown) return kind === "create" ? allow(cannotTellCreate(where.unknown)) : deny(cannotTell(where.unknown));

  const root = where.root;
  const { obligation, TIERS, isTrunk } = await planOf(root);
  const o = obligation();
  let ctx;
  if (kind === "publish") ctx = await releaseContext(root);
  else if (kind === "device") {
    ctx = { runningLane: runningLane(), repoRoot: root };
    // Where trunk is only matters when the run would otherwise go ahead. A run
    // already refused — nothing owed, discharged, undeclared, or a lane in
    // flight — needs no second reason, and the lane refusal is reported alone
    // because it asks for something else entirely.
    if (!ctx.runningLane && (o.state === "owed" || o.state === "reopened")) ctx.base = baseContext(root, { branch: o.branch, isTrunk });
  }
  const d = decide(kind, o, TIERS, ctx);
  if (root === REPO_ROOT || d.action === "silent") return d;
  // KD-79's refusals were unplaceable: they named a change set the reader could
  // not locate. When the judged tree is not the one this file was loaded from,
  // the decision says so — which is also the line that makes a WRONG resolution
  // visible instead of mysterious.
  return { ...d, reason: `${d.reason}\n\nJUDGED TREE: ${root} — the worktree this command runs in, not the one this gate was loaded from (${REPO_ROOT}).` };
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
// Exported because it is one term of an arithmetic invariant a test reads off
// the wiring: the lane probe, plus the one question this gate may put to origin,
// plus what it keeps back to answer, has to fit inside declaredBudgetMs().
export const LANE_PROBE_TOTAL_MS = 3000;

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

/**
 * The fleet record and the hash of the tree it would have to describe — for the
 * tree the publish will act on, hashed by THAT tree's own trigger lists, because
 * a record written by one worktree's `fleet-check` is only comparable with the
 * hash its own `observed-tree.mjs` takes.
 */
export async function releaseContext(root = REPO_ROOT) {
  const fs = await import("node:fs");
  const { deviceTreeHash } = root === REPO_ROOT ? await import("../observed-tree.mjs") : await import(pathToFileURL(path.join(root, "scripts", "observed-tree.mjs")).href);
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
    const command = String(input.tool_input?.command ?? "");
    const kind = classify(command);
    if (!kind) return;
    // Matched. From here on, a failure is a refusal.
    try {
      const d = await verdict(kind, command, input.cwd);
      if (d.action === "silent") return;
      emit({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: d.action, permissionDecisionReason: d.reason } });
    } catch (e) {
      process.stderr.write(`proof gate could not answer for "${kind}": ${e?.message ?? e} — refusing rather than allowing\n`);
      process.exit(2);
    }
    return;
  }

  if (event === "PostToolUse") {
    if (input.tool_name !== "Bash") return;
    const command = String(input.tool_input?.command ?? "");
    if (classify(command) !== "merge") return;
    // Best effort and read-only in effect: close() removes the plan only when
    // nothing is owed, which after a merge the gate allowed is always true. It
    // closes the plan of the tree that was MERGED — closing the session's
    // instead would delete a slice that is still open, which is the same
    // mistaken reader as KD-79 doing damage rather than refusing.
    try {
      const where = judgedTree("merge", command, input.cwd);
      if (!where.root) return; // another repository's merge, or a tree that could not be named: close nothing
      const { close } = await planOf(where.root);
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
