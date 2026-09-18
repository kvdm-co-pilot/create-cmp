> Governed by [`NORTH-STAR.md`](./NORTH-STAR.md) (§12); this document is the home of the five gate rules and is
> cited by NORTH-STAR §7 rather than restated there.

# Three rules for building gates

> Proposed by Karel, 2026-09-03, out of the payment-blueprint adoption. Each comes
> from episodes that cost hours and is written with the episode that produced it,
> because a rule whose evidence is missing gets deleted by the next person who
> finds it inconvenient. This is the deep-dive behind principles 2 and 3 in
> `docs/PRINCIPLES.md`; the one-line form lives there and in every `CLAUDE.md`.

The harness already says *"a gate you haven't seen fail is a gate you don't
trust"* (`agents/cmp-orchestrator.md`). That convention was correct, written, and
prevented none of the episodes below. These rules say **when** the check has to
happen, name the failure mode before it, and name the one after it.

---

## Rule 0 — Prove the framework returns before you point work at it

**When there is no mature test framework in place, build the smallest end-to-end
one first and prove it can produce a deterministic PASS and a deterministic
FAIL, fast, with a bound short enough that a hang is obvious. No Gradle, no
device, no network. Only then wire real gates.**

### Why: the thing that burns hours is not a wrong verdict, it is a hang

A wrong verdict costs a re-run. A hang costs an agent hours, and it looks like
work the whole time. Every expensive episode in this harness's history is of
this kind, not the other:

- `androidChecks` sat at **0.5% CPU** waiting on a device with no bound at all —
  not a wrong answer, no answer.
- A release build ran **fourteen minutes without a byte** of output; grinding and
  wedged were indistinguishable without checking the daemon by hand.
- Maestro's driver startup wedged the emulator; a stale adb transport read as
  `device offline` and killed the next driver before its first assertion.
- A scheduled long-running audit died as **exit 143** with no row on any receipt.

Per-step deadlines were added in 0.19.0 *because* of the first of these —
reactively, hours into runs. Rule 0 is that same discovery made in the first
sixty seconds.

### Why this is not Rule 1

Rule 1 asks *is this gate reading anything*. Rule 0 asks *does this machinery
return at all, and how fast does it say no*. You can pass Rule 1 on a framework
that hangs on the next input, because Rule 1 only ever runs the happy planted
case. The template's own `qa/refusal-demo.mjs` is a Rule 1 instrument — it plants
real violations in a real scaffold and asserts the clause id in the output — and
it does not answer Rule 0: it establishes its baseline with a Gradle lane, and its
own guard is a **ten-minute** timeout, which is the hang, bounded, not a fast
deterministic failure.

### What it requires — and the command that does it

One trivially-passing and one trivially-failing case, wired through the *real*
lane machinery (the runner, the marker, the receipt, the hook), asserting both
verdicts and the wall time, bounded in **seconds**.

```bash
node qa/framework-check.mjs             # in YOUR app — bound 10 s per direction
node scripts/framework-check.mjs        # in the create-cmp repo — proves the engine and the shipped twin
```

**Which one you want depends on where you are standing** — in an adopter's app, the first; in this
repo, the second (`qa/` does not exist here). `qa/framework-check.mjs`
ships in every scaffold and runs against the tree you are standing in: it
derives which plants your project can support, reports each one it *cannot*
make and why, and restores every file it touched — including the receipt and
the README badge, so a smoke run cannot overwrite a real L1/L2 receipt with one
that proves nothing. `--record` adds the one file it does **not** put back:
`qa/evidence/framework-check.json`, the result the console's *trust* row reads
(`docs/proposals/LIVE-CONSOLE.md` D4a). It is a flag and not a default because
the restore promise above is what makes this safe to run mid-change, and three
gates hold the instrument to it. It refuses to start if a file it plants into has
uncommitted changes. Measured on a fresh scaffold: **7 plants, 1.9 s.**

The engine script stamps a scratch app, runs `--profile smoke` (every pure-Node
gate, no Gradle) and asserts PASS; then plants, one at a time, every way a test can be
skipped or faked — an orphaned citation, a `SPEC:` tag on a class with no test
under it, a device-only clause cited only from the JVM, a feature whose flow
stops citing its clause, a citation in a nested flow the lane never runs, one
edited byte in the machine-owned region — and asserts each FAILs **naming** the
step and the clause or feature; asserts the Stop hook refuses a FAIL receipt,
the forgery (verdict flipped to PASS over a failed `harnessIntegrity` row), and
a receipt whose device tier was skipped for an environmental reason; reverts
everything and asserts PASS again. A direction that does not
return inside the bound is killed and reported as a hang — the bound is the
assertion. Finally it runs the shipped `qa/framework-check.mjs` inside that
same scratch app and asserts the tree is byte-identical afterwards — the tool
we hand adopters is proven on the tree as shipped, not merely shipped.
Measured on this tree: 5.2 s for all six legs. For a greenfield repo it is the
first thing built, before the first real gate.

---

## Rule 1 — Calibrate a gate before you wire it

**A gate is not wired into the lane until it has been calibrated on a trivial
planted case: plant the violation it exists to catch and watch it FAIL BY NAME,
revert and watch it pass, and record the runtime of that case. A gate that has
only ever passed is an unread instrument. The runtime you measured decides its
stage — change, merge, or nightly.**

Four steps, seconds each.

### Where the plant goes — the instrument, not the ceremony

**Add the plant to `qa/framework-check.mjs` and run that.** Rule 1 states a
PROPERTY that must hold — this gate fails, by name, on its own violation — not a
procedure you perform by hand. The distinction is the whole of this section,
because the procedural reading is the natural one for anyone writing an
instruction, and it is expensive:

> payment-blueprint read Rule 1 as a sequence and briefed a wave to prove each
> new gate by hand: plant the defect, run `./gradlew`, confirm red by name,
> revert, build again. On a composite build that is 30–60 s per cycle. Dozens of
> cycles is ~38 minutes with nothing committed — and the instruction *reads* as
> uncompromising, so nobody costed it. It had already violated this rule's own
> "seconds each" on the first cycle. Third occurrence of the class; the first
> two are the episodes below.

A plant that lives in the instrument is run by everyone, forever, in
milliseconds. A plant performed by hand is run once, by one person, and is gone
the moment they close the terminal — you paid the full cost of a calibration and
kept none of it. **If a gate is worth calibrating, its plant is worth keeping.**

The instrument reports its own cost for the same reason: `--budget-ms` (default
5 s per cycle) turns "seconds each" from prose into a line in the output. Prose
does not refuse.

### Why: a broken gate does not fail, it reports confidently and wrong

Three episodes, all in one adoption, all from gates wired before they were read:

**detekt analysed nothing and said PASS.** detekt 1.23.x matches each rule's
`excludes` globs against a file's **absolute path**. The checkout was
`/Users/test/dev/payment-blueprint` — a literal `test` path segment — so every
rule that excludes test sources silently stopped running. The gate went green for
a full phase. The baselines generated from that machine recorded **127 findings
where the same commit records 228**: 101 findings invisible, dominated by
`MagicNumber` (86) and `TooGenericExceptionCaught` (15). It was found by CI going
red on an identical commit, then proven by copying the tree to a path without a
`test` segment. One planted magic number at adoption would have shown it in
seconds, because the calibration would have failed to fail.

**A suite-scaled step sat in the per-change lane at ~20 minutes.** Its cost scaled
with the size of the test suite times its start-up, not with the size of the change
being checked — and because a receipt binds the whole tree, every unrelated edit
paid it. Signing an approval, which cannot move that step's result, cost a full
20-minute re-run. Wiring it to one small module first and reading the clock would
have tiered it correctly on day one. It cost roughly three hours of waiting before
it was moved out — and days more before it was removed (2026-09-03): two verdicts in
24 runs, the last at 24 m 26 s against a 30-minute cap, and it pinned every core of a
shared machine when it ran.

**A threshold was set 11 points above an unreachable ceiling.** An agent raised a
score threshold from 70 to 95 on a tool whose instrumentation could not see
Kotlin `inline fun` bodies — 12 of 30 in that kernel were `Result`'s inlined
combinators, all genuinely tested — so even a perfect suite capped the score at
83.6%. The agent ground against an arithmetically impossible target with nothing
committed. One measured run at
adoption gives you the ceiling.

**The strongest evidence is that an agent invented this rule under duress.**
Needing to trust a CI-mirror detekt run, it wrote: *"a green mirror run alone
doesn't prove the strict rules were active — I ran a positive control first: I
temporarily rewrote one entry as `KWD(code = "KWD", exponent = 3)` and
`:core-domain:detekt` failed with `MagicNumber`."* That is this rule, executed
reactively about nine hours after the gate was adopted instead of proactively in
the sixty seconds before. It also discovered that the named-argument form is
load-bearing for that rule — knowledge nobody had, which a calibration at
adoption would have documented from day one.

### FAIL BY NAME, not merely fail

detekt's failure mode was that it **ran and passed** while executing none of the
rules it claimed. "The gate went green" and "the gate is working" were
indistinguishable from the outside. Only a failure that names the rule separates
them. A calibration that merely observes a non-zero exit proves the plumbing, not
the gate.

### At adoption, not at review

The existing convention is a review-time practice. Every episode above shows
review-time is hours too late: by then the gate has produced baselines, receipts
and green runs that all have to be redone. Calibration is cheap **only** at the
moment the gate is wired.

### The runtime you measured is not decoration — and it has a home

Record it **beside the step**, not in a commit message. The flight journal
(`qa/flight-recorder.jsonl`) already stores per-step durations, and the lane
already reads them to set each step's deadline and to narrate its expected cost —
so a calibrated runtime recorded there is one the lane can *check against*, and
drift from it becomes detectable instead of remembered.

Let it choose the stage, in the names the receipt carries since 0.19.0:
**change** (per commit, ~90 s budget), **merge** (minutes), **nightly**
(unbounded). A gate whose cost scales with something other
than the size of the change (mutant count, corpus size, fleet size) belongs in a
scheduled job no matter how fast it looks on a toy input — measure it on
something real before deciding.

---

## Rule 2 — The layer you changed cannot certify itself

**A change is proven only by running it in an environment nobody has run it in
yet. A green suite at the layer you edited is evidence about that layer and
nothing else.**

For this repo that means: a library change is not done until the **full suite**
runs; a template or harness change is not done until a **fresh app is stamped**
(`node scripts/fleet-check.mjs`); an environment-sensitive change is not done
until **CI** runs it.

### Why: three instances in two days, all the same shape

| Change | Verified at | Broke in |
|---|---|---|
| PIT thread count raised 4 → 6 | local machine, passing | CI runner — exit 143 (SIGTERM), six forked minions beside a 4 GB daemon |
| Three harness patches | each library's own tests, all green | every consumer — the studio console could no longer approve anything (12+ failures); one patch edited a **vendored** file that `scripts/sync-harness.mjs` overwrites, so the next sync would have silently deleted the export |
| A `// SPEC:` citation-binding rule | root suite, 1244/1244 green | a **fresh scaffold**, red out of the box — the template's own `ARCH-04` tag sat above two helper declarations that consumed the binding window |

Not three lessons. One. Every failure was invisible from the layer the change was
made at, and every one was caught by running somewhere nobody had run yet.

### The trap is that a green suite feels like enough

The third episode is the sharpest: the suite was green at 1244/1244 **and the
scaffold was red**, because the suite never stamps an app. The reviewer who found
it had run the full suite and still missed it the first time. Breadth of testing
at one layer does not substitute for depth across layers — you cannot verify your
way out of an environment you never ran in.

### Why this is separate from Rule 1

Rule 1 catches gates that were never read. Rule 2 catches changes that were read
at the wrong altitude. Calibrating a gate perfectly tells you nothing about
whether its consumers still work; running every consumer tells you nothing about
whether the gate was ever executing. Keep them separate — collapsing them into
"test more" loses both.

---

## Rule 3 — A loop cannot certify its own termination

Rule 2 says the layer you changed cannot certify itself. The same holds one level up: **the loop
doing the work cannot be the thing that decides the work is finished.**

An exit condition written as prose is decided by whoever reads it, which in an agentic loop is
the agent that just did the work. It will read the sentence charitably — not dishonestly, but in
the direction of its own effort. The measured cost of that, in this repo: Stage 0 outlived three
exit criteria over weeks, and each iteration produced real defects fixed and left the stopping
condition exactly as untrue as before.

### What it requires

**The exit is a command, written before the work starts.** `node scripts/stage-gate.mjs`. A stage
whose exit is not yet a command has not started; writing the predicate is its first task. The
command exits non-zero, prints what remains, and takes no view on how hard anyone tried.

**A criterion met once by hand is not a criterion.** It decays into a sentence in a commit
message that nothing re-runs and nothing notices breaking. Stage 0's cold adoption was a manual
run that found a real wrong verdict; it is `scripts/cold-adoption.mjs` now, and reverting the fix
makes it fail by name in both ecosystems.

**Four terminators, layered.** A verifier, an iteration cap, a budget, and no-progress detection.
Any one alone fails: a verifier with no cap runs forever on an impossible goal; a cap with no
verifier stops at an arbitrary place and calls it done.

**Held-out input.** A gate the agent wrote is a gate the agent can satisfy, and long-horizon
coding agents measurably drift toward passing the visible checks rather than being correct — the
gap widening with task length. The counter is adversarial input the fix was not written against:
a second ecosystem, a kept plant, a squatted port. Eight wrong verdicts were found that way this
year. None were found by reading.

### Why this is not Rule 0

Rule 0 proves the INSTRUMENT returns before you trust a reading from it. Rule 3 proves the
CRITERION is evaluable before you point a loop at it. A perfectly calibrated instrument attached
to a goal nobody can evaluate still never finishes.

---

## Rule 4 — Proof is SCHEDULED, not triggered: declare what a slice will owe before starting it

An expensive tier does not run when something changes. It runs **once, at the end of the slice
that changed it.** What a slice will owe is declared before the first line is written, and the
obligation accrues until the slice closes.

```bash
node scripts/proof-plan.mjs --open "<what you are building>"   # before the work
node scripts/proof-plan.mjs                                    # what is owed, and WHEN
node scripts/proof-plan.mjs --discharge                        # after the run, read from its record
node scripts/proof-plan.mjs --record-review                    # the reviewer's own output, bound to this tree
node scripts/proof-plan.mjs --discharge-review                 # after the review, read from its record
node scripts/proof-plan.mjs --close                            # refuses if anything is owed
node scripts/proof-plan.mjs --history                          # what settled slices cost, read from the kept records
```

Nothing a slice writes is thrown away: settled plans, every review record and every device run are
appended to `qa-artifacts/*-history.jsonl`, so a slice's cost is read from this repository — not
reconstructed from session transcripts, which is how it had to be measured on 2026-09-17.

### Why: the rule was stated in eighteen documents and lost every time

On 2026-09-08 a device suite costing three and a half minutes and an emulator ran **three times in
one session**. The third was triggered by a comment and a message string changing in one file —
twenty minutes after the same agent had written down, in the same session, that re-running a device
suite for a comment is ceremony. Naming it did not stop it.

The reason it did not stop it is the rule worth keeping. **Eighteen documents in this repository
stated the device-tier policy and not one of them was a program** (a wider grep the next day counted
twenty-eight, the harness's own plugin agent and project memory among them). They also disagreed: the
project memory said *"gate a RELEASE at L2"* — a slice boundary — while `scripts/fit-test.mjs`
printed **`fleet L2 REQUIRED`** on any commit touching the harness source. Prose and program
contradicted each other, and **the program won, as it always will**: prose is read once at the
start of a session, and a program speaks at the moment of the decision.

So the fix for a rule that keeps getting lost is never a nineteenth restatement. It is to change
the sentence the program prints. That line now reads `OWED — at slice close, NOT NOW`, and the word
`REQUIRED` is gone from it on purpose, pinned by a test.

### What it requires

- **`deriveTierNeed` answers WHETHER. Something must answer WHEN.** That was the entire defect:
  the repo had a careful, fail-open derivation of whether a device run could be skipped, and no
  concept at all of *not yet*. A tier with no schedule is a tier that runs now.
- **Declared before the work, not derived after it.** A slice that knows up front it will need an
  emulator can be scoped differently; a slice that knows it will not never pays for one. This is
  the same move as Rule 3 — the predicate is the FIRST task — applied to cost instead of to
  termination.
- **The expensive tier is the LAST gate, and after it the slice is frozen.** A trigger path edited
  after a discharge REOPENS the slice and is told so by name. This is deliberately not solved by a
  cleverer hash that tries to tell a comment from a statement: doing that correctly needs a parser
  for every ecosystem the harness might meet, and doing it by exception list is wrong the first
  time someone edits a string a test asserts on. The ordering rule is cheaper and it is honest.
- **A discharge is READ, never asserted.** It comes from the run's own recorded verdict and tree
  hash — a discharge that trusted its caller would be exactly the shape of claim this product
  exists to refuse.
- **There are two at-close tiers, and the second is a review** (ADR-0014). A slice that changes
  anything but prose owes a review record bound to these exact bytes, and `gh pr merge` refuses
  until one exists. The gate checks that the record EXISTS and describes this tree; it never reads
  what the review found, because a gate that graded findings would be the uncalibrated instrument
  in the refusal path that ADR-0014 exists to avoid. The trigger sets differ on purpose:
  `scripts/` and `test/` cannot reach a phone and are irrelevant to the device tier, and they are
  where this repo's refusals live, so they oblige a reader. Both are declared in
  `scripts/observed-tree.mjs`, and a test refuses any path that could oblige a review without
  being able to reopen one.
- **Enforced at the decision point, never by reading.** `.claude/settings.json` runs
  `scripts/hooks/proof-gate.mjs` on every Bash call. An invocation of `fleet-check.mjs` is
  refused when nothing is owed, when the tier is already discharged for this exact tree, or when
  no slice is declared (the run could discharge nothing); it is allowed while owed, with the
  schedule as the reason. `gh pr merge` is refused while the tier is owed — the slice closes at
  merge, so that is where "once, at slice close" is collected. SessionStart puts the schedule in
  front of the session. The audit the day after this rule landed found the program above existed
  and **nothing invoked it**: no settings file in this repo, no git hooks, every `--open` in prose.
  A rule made executable and left for the reader to remember to run is the same defect one layer
  up — while the template this repo stamps had carried the equivalent PreToolUse hooks for
  adopters all along. The harness enforced on adopters what it did not enforce on itself.
- **A command position is a separator plus the wrappers nobody remembers, and the list is CLOSED.**
  Two readers in that hook ask where a command begins — the classifier that decides whether this
  gate runs at all, and the one that decides whether a directory can be read — and for two commits
  they answered from two different lists. KD-105 was the disagreement; KD-107 was the same
  disagreement a commit later, with the classifier the NARROWER one, which is the fail-open
  direction: `! gh pr merge`, `timeout 300 gh pr merge`, `command gh pr merge` and
  `2>/dev/null gh pr merge` each reached the act with no gate having an opinion at all — not
  allowed by a gate that looked, which is worse. There is one declaration now, `COMMAND_PREFIX`,
  and a test reads it back out of both readers, because editing two lists to agree is what left
  KD-107 behind.

  **Accepted:** a separator — the start, `;` `&&` `||` `|` `(`, a newline, or `-c "` which is the
  one place a quotation opens a command — then any run, in any order, of `VAR=value` assignments,
  redirections (`2>/dev/null`, `>out`, `2>&1`), and these wrapper words: `!`, `builtin`,
  `caffeinate`, `command`, `env`, `eval`, `exec`, `nice`, `nohup`, `sudo`, `time`, `timeout`,
  `xargs`. Each wrapper may carry its own options and **at most two bare operands** — what
  `timeout 300`, `timeout -s KILL 300`, `nice -n 10` and `sudo -u nobody` need.

  **Refused by name, rather than guessed at:** any other word ENDS the run and is read as the
  command itself. So `watch -n 5 …`, `script`, `parallel`, `ssh host '…'`, `docker run …`,
  `find … -exec`, a `-c` not spelled exactly `-c` (`bash -lc "…"`), and a brace group whose first
  word is the gated command (`{ gh pr merge; }`) are not read through. The operand bound is the
  same refusal in miniature: unbounded, the run walks across a whole second command and reads the
  `gh pr merge` inside `time git commit -m "then gh pr merge"` as a merge. What is not read through
  is a fail-open with no producer here and is logged (KD-109), not inferred silently.

  **And no word in a prefix crosses a character that ends a command** — not `;`, `&`, `|`, `(`,
  `)`, `<`, `>`, nor a newline. Without that clause the operand run swallows its own `;`, the match
  begins at the start of the line instead of at that separator, and the prefix the directory reader
  is handed shrinks to nothing: fifteen shapes of the construct sweep went from refused to READ
  while this declaration was being unified, including `time . /x/s.sh; gh pr merge` — the six-shape
  class KD-79's own fix had just closed. Both directions are swept against `/bin/sh` in
  `test/a-wrapper-word-walks-an-unproven-merge-past-the-gate.test.mjs`, which asks the shell whether
  the gated program was really executed rather than asserting that it was.
- **And it judges the tree the COMMAND acts on, never the session's.** `.claude/settings.json`
  spells the hook `node "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/proof-gate.mjs"`, so until
  2026-09-18 every verdict was about the SESSION's worktree whatever tree the command ran in — and
  this repo keeps several worktrees of itself checked out at once, inside the checkout. Measured
  three times in one session (KD-79): an OWED device run refused as "nothing is owed", `gh pr merge`
  refused over three files that were in a different worktree, and — silently, the mirror image — a
  merge ALLOWED because the session's tree owed nothing while the tree being merged owed both
  at-close tiers. The tree is now read from the payload's `cwd` and from the command's own leading
  `cd`, and git settles the rest with one `rev-parse --show-toplevel --git-common-dir`, because no
  string comparison can: the worktrees live under `.claude/worktrees/`, so the tree to judge is
  routinely a subdirectory of the tree not to.

  **It honours exactly four forms, and refuses to guess at anything else.** A gate that infers a
  directory from a command string will be wrong on some string, so the set is small enough to state
  in one place and every refusal names which form it wanted:
  1. the `cwd` in the hook payload — or, when there is none, the hook process's own, which is the
     directory the wiring's `:-.` already resolves this file against;
  2. a `cd` **the shell would actually perform**: a real command in the outer shell, written
     literally, not backgrounded with `&`, and not inside a subshell that has already closed.
     Chained `cd a && cd b` compose, and a subdirectory resolves to the worktree that holds it, so
     `cd packages/harness && npm publish` reads the tree it is in;
  3. the path in `node <somewhere>/scripts/fleet-check.mjs`, which names the tree a run will prove
     whatever directory it was typed in;
  4. nothing else.

  **"A `cd` the shell would perform" is the load-bearing phrase, and it is measured, not asserted.**
  A `cd` inside `echo "…"`, inside a heredoc, inside `$( )`, or inside a nested `sh -c '…'` is not
  one — the shell never performs it, or performs it in a process whose directory dies with it — and
  a `cd` inside `if`/`for`/`{ }` IS one, brace groups especially, since they are not subshells and
  have no paren to count. A regex over raw text sees none of that. So everything that is not a
  command is blanked first — quoted spans, substitutions — and only then are the remaining parens
  counted, which is the one point at which counting them is sound. `/bin/sh` is the oracle:
  `test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs` replaces the gated command with
  `pwd -P`, runs 24 shapes through a real shell, and holds the invariant that the gate resolves the
  directory the shell would run the command in **or resolves nothing at all**. Ten of those shapes
  disagreed when that harness was written, in both directions, and both directions end in a false
  ALLOW.

  Everything outside the set REFUSES and says why: `pushd`; a `cd` whose destination is a variable,
  a glob, `~` or a path with a space in it; a heredoc, a backquote, an unclosed quotation, a
  compound command or a sourced script, or a `)` whose opener this reader never saw; a directory
  that is not there; `gh --repo`/`-R`/`GH_REPO` naming a repository out of band; `npm publish
  --prefix`/`-C`/`-w` or a folder or tarball operand; and any git question about the directory that
  git did not answer. A false refusal costs a minute and a message that says what to type; a false
  allow certifies something untrue, which is the one thing this product exists to prevent. A tree
  that is not a worktree of this repository is the one case that gets SILENCE rather than either —
  this gate has no obligation of its own to state about another repository, and refusing there would
  block real work for a reason that is not true (KD-64 is that mistake made the other way round).
- **And ORDERED: a device run proves a tree the merge has to keep.** The same hook refuses an
  invocation of `fleet-check.mjs` on a branch that does not contain `origin/main`. The merge brings
  trunk in and the bytes move — the tier REOPENS for any of them that is a device trigger path, and
  the run that was just paid for described a tree that will not land. On 2026-09-16 that cost
  **four emulator runs for one merge**: main's CI was
  red, the fix merged under the release branch, and each rebase moved the tree the previous run had
  proved. The rule — check main's CI first — was in project memory, where no program could read it.
  The question is asked only when the run would otherwise be allowed, and the remote is read with
  `git ls-remote`, never `git fetch`: every obligation here is derived from
  `git merge-base HEAD origin/main`, so a gate that fetched would move the baseline it judges. When
  it cannot see — no origin, no `origin/main`, a git call killed at its bound, no time left inside
  the hook's declared timeout — it allows and says which half answered, because a precondition that
  blocks real work for a reason that is not true costs more than the run it saves.
- **A tree that is trunk owes nothing, and a plan belongs to its branch.** The same audit found a
  clean `main` reporting OWED: `deriveTierNeed` fails open on an empty list because the lane
  cannot see its diff — right there, wrong here, where git answered "nothing". And the previous
  slice's plan file was still on disk, applying itself to whatever came next. A plan now records
  the branch it was opened on, `--open` refuses on trunk, and a leftover is named as stale rather
  than reused.

### Why this is not Rule 2

Rule 2 says the layer you changed cannot certify itself, and it is about WHICH proof is valid.
Rule 4 is about WHEN a valid proof is bought. They pull in opposite directions on purpose: Rule 2
argues for more expensive proof, Rule 4 argues for buying it once. A product that resolves G1
against G2 has to hold both, and the place they meet is the slice boundary.
