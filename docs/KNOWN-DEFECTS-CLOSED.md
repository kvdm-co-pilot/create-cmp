# Known defects — closed

> Moved out of [`KNOWN-DEFECTS.md`](KNOWN-DEFECTS.md) on 2026-09-17, so the log a reviewer opens every
> round holds only what is still open. **The rule for what blocks and what is logged is that file's
> header; nothing here restates it.** Entries keep their ids and their words — code and tests cite
> them by id (`KD-7`, `KD-41`), and a grep for the id lands here.


*An entry moves here when the thing is fixed or the decision is taken, with the commit that did
it.*

### KD-117 — one measurement, two defect numbers: the doc credited KD-79 where the code credits KD-105 — **CLOSED 2026-09-18, in the round that found it**

`docs/GATE-RULES.md` (Rule 4) vs `scripts/hooks/proof-gate.mjs` (`IN_WORD`, `GAP`)

Both sentences describe the same measurement — fifteen shapes of the construct sweep went from
refused to READ when a word in the wrapper run was written `\S*`, `time . /x/s.sh; gh pr merge`
among them, "the six-shape class whose fix had just closed". The code comment said that class is
**KD-105**'s and the doc paragraph two files away said it is **KD-79**'s. KD-105 is the entry that
carries the six shapes; KD-79 is the device-tier scheduler defect. They disagreed because one commit
corrected the comment while rewriting the paragraph that carries the same citation and leaving its
number alone.

Nothing was decided on it — no verdict, tree or refusal reads either sentence — and the reviewer
placed it as logged, in KD-28's shape, on the ground that "the citation names the entry that carries
the measurement" is not a statement a program can decide. **Closed rather than logged because the
remedy was one word and the round was already open:** `docs/GATE-RULES.md` now says KD-105, which is
what the code says and what `KNOWN-DEFECTS-CLOSED.md` carries. The reviewer's argument against a
mechanical guard stands and no guard was added; every `KD-NNN` in this repository that a checker
could resolve already does. *Found in review round 2 of the slice that closed KD-107, and corrected
in it.*

### KD-107 — the two readers agree in one direction, and the other direction is where the gate goes silent — **CLOSED 2026-09-18**

`scripts/hooks/proof-gate.mjs` (`COMPOUND` vs `invocation`)

KD-105 was *the two readers in this file do not mean the same thing by a command position*, and the
fix gave `COMPOUND` a wrapper run of its own. It is a second literal spelling, not the shared
declaration KD-105's entry proposed, and it is not the same list: `COMPOUND` carries
`!|nohup|time|env|caffeinate|sudo|command|builtin` plus `\d*[<>]+\S*` redirections, `invocation()`
carries `nohup|time|env|caffeinate|sudo` and nothing else. So the two still answer differently — now
with `COMPOUND` the wider one, which is the safe direction FOR COMPOUND and the unsafe one for the
reader that decides whether this gate runs at all.

Measured 2026-09-18 at `7bc38dd`, by feeding the hook a real `PreToolUse` payload on this worktree:

    gh pr merge 1 --rebase               deny
    time gh pr merge 1 --rebase          deny
    ! gh pr merge 1 --rebase             SILENT — classify() returns null, no gate runs
    command gh pr merge 1 --rebase       SILENT
    2>/dev/null gh pr merge 1 --rebase   SILENT
    timeout 300 gh pr merge 1 --rebase   SILENT

`classify()` returning null makes the hook `return` before any verdict, so these merge without the
proof gate having an opinion — a fail-open at the door rather than in the tree-reading this slice is
about. It is also why the comment above `COMPOUND` still cannot be read literally: it says *the same
rule `WATCHED` uses*, which is what `168187f`'s comment said and what KD-105 was written about, and it
is no truer now, only untrue in the opposite direction.

**Direction: fail-open, and UNCHANGED FROM `main`** — `invocation()` is byte-identical on `main` and
on this branch; nothing in this slice widened or narrowed it, and merging changes nothing about which
commands reach the gate. **No producer:** every merge, publish and fleet-check in this repository is
typed bare or behind a `cd`, and the four wrappers that a human or an agent plausibly writes in front
of a long command — `time`, `env`, `sudo`, `nohup` — plus `VAR=x` assignments are all classified
today. **The fix is one declaration, not two lists:** export the command-position prefix once and let
both readers spell it from that, which is the invariant KD-105's closed entry already names and the
only thing that stops this pair drifting a third time. *Logged 2026-09-18, at the re-record of review
round 2 (KD-79's slice). The placement call is the reviewer's: it is a fail-open, and it blocks
nothing only because merging is not what introduces it.*

Closed by `COMMAND_PREFIX` in `scripts/hooks/proof-gate.mjs` — one exported declaration of what may
stand between a separator and a command, embedded by BOTH `invocation()` and `COMPOUND`, with a test
that reads it back out of each so a third spelling cannot be added without failing. The accepted
wrapper words are a closed list stated in `docs/GATE-RULES.md` (Rule 4) and bound to the code by the
same test; what the list does not read through is named there and logged as KD-114 rather than
inferred. The separator classes were deliberately NOT unified, and that is the one place the fix
departs from the entry above: the two readers run at different moments — `invocation()` on raw text,
`COMPOUND` after every quoted span has been blanked — so `-c "` is meaningful only to the first and
`{`, `}` and a `case` pattern's `)` are structural only to the second. Unifying those would make
`git commit -m "{gh pr merge}"` a merge, which is KD-64's mistake in a new costume.

`test/a-wrapper-word-walks-an-unproven-merge-past-the-gate.test.mjs` holds it, with `/bin/sh` as the
oracle in the same shape KD-79's slice landed: a stand-in `gh`, `npm` and `node` on PATH record
their own argv, so "this shape really invokes a merge" is measured rather than asserted. 135 of 180
shapes were silent when it was written. **The unification also weakened a refusal before it fixed
anything, and the sweep KD-105's fix landed is what said so:** written with `\S*` for a wrapper's
operands, the run swallowed its own `;` and the match began at the start of the line, so the prefix
`commandCwd` reads shrank to nothing and fifteen shapes of
`test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs` went from
refused to READ — including `time . /x/s.sh; gh pr merge`, the six-shape class KD-105's own fix had
just closed. No word in a command prefix may cross a character that ends a command, newline
included; that clause is in the declaration because a guard test refused the version without it.

### KD-105 — `COMPOUND` and `WATCHED` do not mean the same thing by "a command position" — **CLOSED 2026-09-18, in the round that found it**

`scripts/hooks/proof-gate.mjs` (`COMPOUND`, `invocation`)

`168187f` narrowed `COMPOUND`'s boundary to `(?:^|[;&|(){}\n])\s*` and its comment says this is
*the same rule WATCHED uses*. It is not the same rule. `WATCHED`'s `invocation()` spells a command
position as a separator **plus an optional run of wrapper words and assignments** —
`(?:nohup|time|env|caffeinate|sudo)(?:\s+-\S+)*\s+` and `[A-Za-z_][A-Za-z0-9_]*=\S*\s+` — because
those are exactly the words a shell allows in front of a command without ending the command
position. `COMPOUND` now accepts only the separator. So one reader in this file says `time X` is a
command position and the other says it is not, which is the two-spellings-of-one-fact shape, and it
drifted in the reader that was edited.

The consequence is a fail-open, measured 2026-09-18 with the same oracle the slice's own test uses —
`/bin/sh` with the gated command replaced by `pwd -P` — over 12 constructs × 10 command positions,
120 of which the shell ran to completion. 114 refuse correctly. Six resolve the payload's cwd where
the shell has moved:

    time . <dir>/s.sh; gh pr merge 1        shell: <dir>    gate: the payload's cwd
    ! . <dir>/s.sh; gh pr merge 1           shell: <dir>    gate: the payload's cwd
    time source <dir>/s.sh; …               shell: <dir>    gate: the payload's cwd
    ! source <dir>/s.sh; …                  shell: <dir>    gate: the payload's cwd
    time eval cd <dir>; …                   shell: <dir>    gate: the payload's cwd
    ! eval cd <dir>; …                      shell: <dir>    gate: the payload's cwd
    FOO=bar . <dir>/s.sh; …                 shell: <dir>    gate: the payload's cwd
    2>/dev/null . <dir>/s.sh; …             shell: <dir>    gate: the payload's cwd

Only the three keyword-ONLY constructs leak: `if`/`for`/`while`/`case`/`{ }` after `time` or `!` are
still refused, because their own internal `;`/`{` re-establishes a separator for `COMPOUND` to find.
`. ./env.sh && gh pr merge`, with no prefix, is still refused — the unprefixed forms are unaffected.
All eight shapes above were REFUSED at `91b4129` under the old whitespace boundary, so this is a
regression the fix opened while closing the false positives it was for; the old boundary refused
them for the wrong reason (it refused `git add .` too) and this is the sliver where the wrong reason
happened to give the right answer.

**Direction: fail-open** — the session's tree is judged in place of the command's, which is KD-79's
own direction. **No producer:** nothing in this repository, its session logs, or the surfaces that
produce these commands writes a wrapper word, a `!` or a `VAR=x` assignment in front of a sourced
script or an `eval` before a gated command; a merge here is typed as `gh pr merge --rebase
--delete-branch` with at most a leading `cd`. **The fix, when it is taken up, is one edit and not a
parser:** give `COMPOUND` the prefix run `WATCHED` already declares, from one shared declaration, so
the two cannot answer the question differently again — the invariant being *the two readers in this
file agree on where a command begins*, which is what a landed harness should assert rather than any
one of these eight shapes. *Logged 2026-09-18, at the re-record of review round 2 (KD-79's slice).*

**Closed in the round that found it.** The direction decided it: this is a FAIL-OPEN, and it was
opened by this slice's own previous commit rather than inherited — `91b4129` refused all eight of
these shapes and `168187f` let them through. A defect that hands back a tree the command will not
act on is the thing this slice exists to stop, so "no producer" buys a delay it does not need when
the fix is the clause `invocation()` in the same file has always carried.

`COMPOUND`'s boundary is now a separator plus that same optional run of wrappers, assignments and
redirections, and the two readers agree about where a command begins.
`test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs` keeps them
agreeing: 12 constructs x 12 command positions against `/bin/sh` as the oracle, asserting that every
shape the shell runs is REFUSED — including the ones where the construct happens not to move the
directory, because a reader that got those right did so by not following a branch it would not have
followed the other way either. Both errors this boundary has made are mutation-pinned: widen it back
to "preceded by whitespace" and the argument sweep goes red; narrow it to "preceded by a separator"
and the construct sweep does.

### KD-79 — the scheduler says the device tier is OWED and the gate enforcing it says nothing is owed — **CLOSED 2026-09-18, in the slice that fixed it**

`scripts/hooks/proof-gate.mjs` (`decide`, `kind === "device"`, `o.state === "none"`) vs
`scripts/proof-plan.mjs`

Measured 2026-09-18 on this branch, one command apart. `node scripts/proof-plan.mjs`:

```
device (fleet L2) OWED — discharge at slice close, NOT NOW
    8 changed path(s) are not declared irrelevant to fleet L2:
    .claude-plugin/marketplace.json, .claude-plugin/plugin.json, llms.txt, ….
```

`CMP_AVD=Medium_Phone_API_35 node scripts/fleet-check.mjs --min-level L2`, refused by the
PreToolUse hook before the runner started:

```
nothing is owed — every changed path is declared unable to affect fleet L2
(docs/, test/, scripts/, .github/, *.md, inspector/mcp/, .claude/, packages/harness/src/console/).
```

Both read `obligation()` from the same module, so they cannot disagree on one input — and the
hook's stated reason is impossible for this slice's change set. `.claude-plugin/` is not `.claude/`,
`llms.txt` is not `*.md`, and `package.json`, `package-lock.json` and
`packages/aliases/*/package.json` match no prefix on that list. Whatever set it judged, it was not
this branch's. Two candidates, not distinguished here: the hook compared the WORKING TREE against
HEAD, which is clean after a commit, so "every changed path is irrelevant" is vacuously true over
an empty set — this repo's own recurring shape, a guard written against ABSENCE passing on
VACUITY; or it resolved a sibling git worktree, whose uncommitted paths that day were exactly
`docs/GATE-RULES.md`, `scripts/hooks/proof-gate.mjs` and one `test/` file — every one of them on
the irrelevant list, which would explain the reason word for word (KD-64 is the same reader
confusing sibling worktrees).

**Not fixed here, deliberately.** `scripts/hooks/proof-gate.mjs` is owned by another slice that was
in flight the same day, and editing a gate from under it is worse than the disagreement. Nor was
the refusal worked around: a gate that refuses is obeyed, and this slice's device tier is left owed
and undischarged rather than run behind the gate's back.

**The direction is safe, and that is why this is logged rather than blocking**: it REFUSES a run
that is owed, so nothing false is ever certified. The cost is a slice that cannot close its own
last gate. The unsafe mirror image — allowing a run to discharge a tier the merge will not keep —
is what the sibling slice is about, so both directions are known.

**Fires when:** the tier is invoked from a worktree whose slice changes only paths one of the two
readers can see.
*Logged 2026-09-18, measured while closing the count-gate slice.*

Closed by the tree resolution in `scripts/hooks/proof-gate.mjs` ("WHICH TREE IS THIS COMMAND
ABOUT?"). **Of the two candidates above, the second is the one that fired**, and the first is ruled
out: `changedPaths()` reads `merge-base HEAD origin/main`, never `HEAD`, so a clean working tree
after a commit is not an empty change set. The hook judged the SESSION's worktree — `REPO_ROOT`,
fixed by the `node "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/proof-gate.mjs"` wiring — whatever tree
the command it was gating would run in, and this repo keeps several worktrees of itself checked out
at once. The reason it printed was word-for-word true of that other tree, which is why it read as
impossible.

Every PreToolUse verdict is now about the tree the command will act on: read from the payload's
`cwd` and from the command's own leading `cd`, settled by `git rev-parse --show-toplevel
--git-common-dir` — the call KD-64 named and left for a slice that could pay for it deliberately —
and REFUSED outright when it cannot be told, because "assume the session's" is the defect and not
the fallback. A tree that is not a worktree of this repository gets silence rather than a refusal
about somebody else's slice. `test/the-proof-gate-judges-the-tree-the-command-acts-on.test.mjs`
holds it on two real worktrees of one throwaway repository, running a copy of this tree's own
`scripts/` — including the FAIL-OPEN half nobody had measured, a merge ALLOWED because the session's
tree owed nothing while the tree being merged owed both at-close tiers.

### KD-61 — a narrowed run of the declared suite is recorded as the suite — **CLOSED 2026-09-17, in the slice that found it**

`scripts/suite-reporter.mjs` says it records "exactly when the DECLARED suite runs … and never for a
targeted run, which must not be recorded as one". It cannot tell. Provoked 2026-09-17 in a scratch repo
whose one test file holds a passing and a failing test, with `package.json`'s `test` script copied
verbatim: `NODE_OPTIONS=--test-name-pattern=ok npm test` exits 0 and writes `verdict: PASS`,
`tests: 1`, bound to the tree hash; `suiteStatus` calls it `fresh` and `describeSuiteStatus` prints
`PASS 1/1 … for this exact tree — read it, do not re-run it`, and `fit-test.mjs` would print it as the
suite. The same holds for `NODE_OPTIONS=--test-skip-pattern=…` and `--test-only` (both measured), and for any hand-run
`node --test --test-reporter=./scripts/suite-reporter.mjs <fewer files>`. (`npm test -- --test-name-pattern=x`
does NOT narrow: the flag lands after the file operands and the whole suite runs.) Relatedly,
`suiteStatus` never reads `verdict`, so an `INCOMPLETE` record for these bytes is also `fresh` — the
reporter writes none on SIGINT (measured), so no path to one was found.

Not blocking: every reach is deliberate narrowing, and the readers are this repo's own gates and
agents, not an adopter. The class, when it is fixed: a record is fresh only for a finished,
unnarrowed run of the declared operands — the reporter can see the runner's flags in
`process.execArgv` and `NODE_OPTIONS`. *Logged 2026-09-17, review round 1 of `suite-record`.*

**Closed before merge** (`suite-record`, round 1 → fix): the reporter compares the run's own filter flags (execArgv, NODE_OPTIONS) and file operands with the files package.json declares, expanded by the shell; anything less is recorded `scope: "narrowed"` with its reasons, and `suiteStatus` reads only a finished run of the declared suite as fresh. Pinned by `test/a-green-suite-is-run-again-because-nothing-recorded-it.test.mjs`, including the NODE_OPTIONS reproduction end to end.

### KD-62 — the suite hash skips gitignored files a suite test reads — **CLOSED 2026-09-17, in the slice that found it**

`scripts/suite-record.mjs` justifies its git view with "tracked plus untracked-not-ignored files is
exactly the working tree a test run sees". Not quite: `test/ground-truth-derivation.test.mjs` reads
`docs/research/launch/GROUND-TRUTH.md` when present, and `git check-ignore` confirms `docs/research/`
is ignored — so regenerating that file (`ground-truth.mjs --markdown`) can turn the assertion red
without moving the hash, and a fresh PASS record survives it. `node_modules/` is the same shape for a
dependency changed without a lockfile edit.

Not blocking: one optional file, one assertion, repo-internal reader. The class, when it is fixed:
either no suite test reads an ignored path, or the hash covers what the suite reads. *Logged 2026-09-17,
review round 1 of `suite-record`.*

**Closed before merge** (`suite-record`, round 1 → fix): the suite hash covers every file git can list, ignored ones included, minus generated output (`SUITE_HASH_SKIP`), so a gitignored input that moves makes the record stale. A directory missing from the skip list costs a re-run, never a false fresh.

### KD-59 — the plan history records as `closed` slices that never closed — **CLOSED 2026-09-17, in the slice that found it**

`close()` appends a `closed` row for whatever plan `obligation()` hands it, and on trunk that is
`o.stale` — ANY leftover plan, not the one the merge just landed. Two ways that row attests nothing,
both executed on 2026-09-17 (branch `proof-history`, round 1):

- `test/proof-gate-hook.test.mjs` "PostToolUse after a merge" writes a fake discharged plan and runs
  the real hook. It restores `proof-plan.json` but not the history: `npm test` on a clean `main`
  (a clone with `origin/main` = HEAD) left `a plan this test wrote · 0 min` in
  `qa-artifacts/proof-plan-history.jsonl`, and `--history` counted it as a closed slice. Every suite
  run on trunk, or on a docs-only branch, adds another and pulls the median toward zero.
- A plan abandoned on branch `a` (never discharged, never merged) is recorded as `closed via merge`
  when some OTHER branch merges without `--open`, with a duration spanning both. The row's
  `device`/`review` fields are the trunk's `none`, never the slice's — in the ordinary merge path too.

Not blocking: `scripts/` is not shipped and `--history` sits in no refusal path; nobody but this
repo's own G2 measurement is misled. But that measurement is the slice's whole reason. The fix is
two lines of isolation (the hook test must also save/restore the history, or the hook take a history
path from env) plus recording a stale plan whose branch is not the merged one as `abandoned`, not
`closed`. *Logged 2026-09-17.*

**Closed before merge** (`proof-history`, round 1 → fix): the merge-hook test now points the hook at a scratch history (`PROOFLANE_HISTORY_DIR`) with a fixture that settles on every branch, and asserts the real history is untouched; a leftover plan whose branch still exists is recorded `cleared`, and a stale plan's row no longer carries trunk's tier states. Pinned by `test/a-settled-slice-leaves-no-record-of-what-it-cost.test.mjs` and `test/proof-gate-hook.test.mjs`.

### KD-60 — "the totals always add up" does not hold once a plan is replaced — **CLOSED 2026-09-17, in the slice that found it**

`summarize()` claims a device run or review matching no closed slice is counted as unattributed
"so the totals always add up". A run inside a `replaced` slice's window is claimed (so not
unattributed) and excluded from `deviceRuns` (closed only): replaced run at 10:30 + closed run at
11:30 on one branch gives `deviceRuns 1, unattributedDeviceRuns 0` of 2 rows. The per-slice line
still shows it; the summary line does not. Not blocking: a report line under-counts, no gate reads
it. *Logged 2026-09-17.*

**Closed before merge** (`proof-history`, round 1 → fix): totals now have three buckets — closed slices, slices that never closed, unattributed — and a test asserts they add up to the history for both runs and reviews.

### KD-57 — on Node 20, nine tests ran and did not report — **CLOSED, 2026-09-16**

CI on `f58ca39`: Node 20 counted `1932` tests where Node 22 and 24 counted `1941` on the same runner
and the same `sh`-expanded file list, `fail 0`. The nine were every test in
`test/one-command-upgrades-a-declared-fleet.test.mjs` but the last. Its `quiet(fn)` helper replaced
the global `process.stdout.write` with a no-op across an `await`, and Node 20's runner writes each
result through that writer — so results emitted while a swap was pending went into it. Review
reproduced it on 20.19.0 (`# tests 1` for the file alone) and showed a failure inside a swap still
exited 1: the COUNT lied, not the verdict. Fixed by removing the helper; the commands' output is let
through, and none of it reads as TAP. Logged by review as KD-53 and renumbered, because the 0.26.0
branch had already taken 53–56.

**Four more test files swap the same writer** —
`a-fleet-upgrade-lands-a-different-harness-in-each-repo`,
`a-fleet-upgrade-writes-to-a-tree-the-manifest-never-named`,
`one-artifact-is-recorded-with-a-different-origin-in-each-repo`, and
`the-fleet-command-names-a-front-door-the-caller-did-not-use` (which captures rather than discards).
None lost a result on this CI run; each would, on Node 20, the day a test is added after its swap.
Not fixed here, because nothing is lost today and the change asked for was the one that was.

The same round corrected a count: the guard's comment said 228 tracked test files, and on this
branch there are 226 — 228 was measured on the 0.26.0 branch, which adds two. The comment no longer
carries a number.

### KD-53, KD-54, KD-55 — three holes in the drift walk, logged by round 1 and closed in its own fix — **CLOSED, 2026-09-16**

All three were logged by the review of `7ca2fec` as not blocking, and all three sat inside
`publishedBytesDrift()`'s walk, which round 1's blocking findings required rewriting anyway. The
reviewer's own note on KD-53 said whoever next touched the walk should close it there rather than
paying for a second fixture; that was the same afternoon.

- **KD-53, the anchor was the newest unbroken run of a version.** Bump away and revert onto a
  published number, and the anchor became the revert — everything shipped under the first run was
  forgiven. The walk now takes the OLDEST commit that ever bore the version, which over-reports rather
  than under-reports; a version reused across two trees is the defect itself, so over-reporting it is
  not a false alarm. Held by a fixture in
  `test/a-version-number-cannot-name-two-different-trees.test.mjs`, and planting the run form back
  turns that test red.
- **KD-54, git read one tree and the manifest another.** The walk ran git in `cwd` and read `files`
  from the module's own `ROOT`. Round 1's fix added npm as a third reader in `cwd`, which would have
  made the split two-against-one — so all three now read one tree. Held by a fixture whose `files`
  names a directory no package in this repo ships; planting the `ROOT` read back turns it red.
- **KD-55, "SIXTY-FOUR" and an unreachable branch.** The header now says 66, as the commit, the test
  and the measurement do; the dead `p.unanchored ?` arm went with the renderer rewrite.

### KD-35 — the prose named a syscall nobody sees — **CLOSED, 2026-09-15**
Round 2 executed two error-code claims I had written from memory twenty minutes earlier and found
one wrong in both places: `node '${CLAUDE_PLUGIN_ROOT}/…/server.mjs'` exits `MODULE_NOT_FOUND`, not
`ENOENT`. ENOENT is the syscall underneath; an MCP client shows a third thing again,
`CONNECTION_CLOSED`. (The other claim held — `bin/server.mjs` with no `node_modules` really is
`ERR_MODULE_NOT_FOUND` for `@modelcontextprotocol/sdk`.)

Logged as non-blocking and fixed anyway, because the round had just established that it was FREE to:
`scripts/observed-tree.mjs`'s `REVIEW_SKIP` is `relPath.endsWith(".md")`, so a markdown edit cannot
move the review hash. The log exists to stop findings being re-litigated, not to preserve a sentence
I know is wrong and can correct at no cost to any gate. Both sites now name what the reader sees,
and the README names all three layers, since which one you get depends on where you are standing.

### KD-38 — the fix moved the mechanism and left the prose pointing at the old one — **CLOSED, 2026-09-15**
Both halves were comments, and both were mine, written in the round that fixed the thing they
described. Fixed rather than logged because a comment file cannot be edited "for free" the way
markdown can — `REVIEW_SKIP` is `.md` only — but the provenance fix in the same commit was already
moving the review hash, so there was no round to save by leaving them.

**`fleet.mjs`'s header still asserted the claim round 1 measured as false.** "`resolveHarness` falls
back to the package the running binary ships from, so a single process carries a single artifact
into every tree" — naming a function `runFleetUpgrade` no longer calls, whose rule is deliberately
the opposite. The paragraph now says what the mechanism is AND carries the measurement that killed
the old one, because a header that only states the right answer teaches nobody why the wrong one was
attractive.

**Extracting `harnessAt` stranded `resolveHarness`'s JSDoc on it.** "`node_modules` first is the
whole point… @param {string} root" sat above a function taking `(pkgDir, where)`, and the exported
`resolveHarness` had no doc at all. Moved back, with a line pointing at `runningHarness` for why a
fleet does not use it.

*Found in review round 2 of `fleet-upgrade`, fixed in it.*

### KD-36 — the criterion-E test proved its plant was gone, not that bytes arrived — **CLOSED, 2026-09-15**
Logged non-blocking by the round that found it, and fixed in the same round, because the test's NAME
was the harm: "THE CRITERION: one command, and the bytes arrive in EVERY tree". It planted staleness
by APPENDING a comment to a vendored file, so "the upgrade arrived" and "my edit was undone" were
the same observation. Review ran the two assertions against a three-line impostor that reverted the
planted file and did nothing else; both passed.

The plant now also DELETES a machine-owned file (`qa/lib/evidence-ladder.mjs`), and the test asserts
it is back and byte-identical to the package's copy. Nothing can put a deleted file back except
vendoring it. Verified by mutation rather than by reasoning: an upgrade that copies `changed` files
but skips `new` ones — precisely a reverter — turns it red.

The class is one this branch has now hit three times and it is worth stating once more: **a test
that cannot refuse the defect in its own name is worse than no test, because the file's name says
it is covered.** Here the fix was to strengthen rather than to cut, because the criterion is real
and per-commit; the two earlier cases had nothing left to assert once the duplicate was removed.

### KD-42 — the hand-rolled glob translation disagreed with the runner — **CLOSED, 2026-09-15**
It refuses what it cannot translate. `?`, character classes, brace alternation and a bare `**` all
throw by name; the two constructs it implements (`**/` spans path segments, `*` spans characters
within one) are unchanged.

Found by differential against the actual runner on a fixture tree — eleven pattern shapes, six
divergent — not by reading. Five diverged in the SAFE direction (guard stricter than runner, a false
alarm at worst). One did not:

```
"test/a?.test.mjs"   runner ran [ab.test.mjs]   guard matched [a.test.mjs]
```

`?` is absent from the escape set, so it reached the RegExp as a QUANTIFIER and the guard reported a
file covered that never runs — **KD-41's unsafe direction, one construct over, inside the function
written to close KD-41.**

Logged non-blocking (nothing in the declaration uses those constructs) and fixed anyway, for the
reason that keeps recurring this week: a translation that silently disagrees with the runner about
ANY construct cannot be trusted about the ones it does implement, and "which of the six is safe" is
a fact about today's declaration rather than about the function. Refusing the whole set ends the
class instead of patching the one character that happened to be dangerous.

The alternative the round offered — stop translating, materialise the tracked paths as empty files
in a temp dir and let `node --test` itself answer in about a second — is the better long-term shape
and is not taken here, because it trades a pure function for a temp-dir side effect in a guard that
runs on every commit. Recorded so nobody re-derives it.

### KD-41 — the guard checked a root PREFIX, so a pattern matching nothing satisfied it — **CLOSED, 2026-09-15**
It asks the globber now: `fs.globSync(pattern, { cwd: ROOT })`, and the two assertions became "every
tracked test file is MATCHED by some pattern" and "every pattern MATCHES something".

Logged non-blocking by the round that found it and fixed in the same round, because what it
measured is the guard failing at its one job. `rootOf` took the substring before the first `*` and
compared with `startsWith` — containment, not matching — so every narrowing after the root was
invisible. Executed: declaring `test/**/nope*` for all three patterns ran `npm test` to **zero
tests, exit 0**, with all three assertions passing. A guard whose entire purpose is "the suite
cannot silently shrink" passed a suite that had shrunk to nothing.

**This is the shape a peer session named the same day**, having paid for it in a Gradle task that
existed, ran, compiled zero Kotlin files and exited 0 while a criterion sat green over a client
nothing ever built: **a guard written against ABSENCE does not catch VACUITY.** Missing pattern,
missing task, missing term — all anticipated. Present-and-empty is the one that gets through, and
from outside it is identical to a property that holds. Three of this session's findings are that
one shape, and it is now the reason this guard asks what a pattern MATCHES rather than where it
points.

Four mutations, each red: patterns matching nothing; `prepublishOnly` back to a bare glob; `ci.yml`
back to a bare glob; and `test/**/*` narrowed to `test/*` — that last one green until a
`test/sub/` file exists, so it was proved at the moment it costs something by creating one and
watching the guard refuse.

The structural half the round also named stands and is not re-logged: the guard lives under a
pattern it audits, so it cannot refuse a declaration that excludes itself. Nothing checks that, and
a fix would be a third declaration of the same fact.

### KD-26 — `npm test` globbed the whole tree, so any directory in it was this repo's suite — **CLOSED, 2026-09-15**
The script names its roots:

```
node --test "test/**/*.test.mjs" "inspector/mcp/test/**/*.test.mjs" "packages/receipts/test/**/*.test.mjs"
```

**The defect, executed both ways.** A stray `wt-probe/test/planted.test.mjs` with one failing
assertion: under the bare glob, `tests 1926, fail 1` — a tree that is not this repo's, failing this
repo's suite. Under the named roots, `tests 1920, fail 0`. The silent direction is the worse one and
the same fix closes it: a worktree whose tests all PASS was adding green rows to a number nobody
audits.

**1925 → 1917, and the eight were not tests.** Node's default patterns include `**/test/**/*.mjs`
and `**/*-test.mjs`, not just `*.test.mjs`, so the runner was executing seven fixtures and helpers
(`test/fixtures/profiles/py-alien/index.mjs`, `test/helpers/harness-fixture.mjs`, …) and — the
one worth naming — `scripts/fit-test.mjs`, a PROGRAM, on every `npm test`. Each counted as one
passing test for not throwing. Those eight rows asserted nothing, and `scripts/fit-test.mjs` is
covered properly by `test/fit-test.test.mjs`, which predates this.

**The fix has its own failure mode, and it is the dangerous direction**: a misspelled root, or a test
written where no root reaches, is not an error — it is a smaller suite that still says PASS. So
`test/a-test-file-outside-the-named-roots-is-never-run.test.mjs` reads the roots OUT of
`package.json` (a constant here would be a second declaration of one fact, which is the defect class
rather than a guard against it) and refuses both directions: a tracked test file under no root, and a
root matching no tracked file. Four mutations, each caught by name — a root dropped, a root
misspelled, an unanchored pattern, and a regression to the bare glob.

**`.claude/worktrees/` is now in `.gitignore`**, not only in `.git/info/exclude`. It holds 355 test
files and was invisible to the old glob solely because Node skips dot-directories — on any other
clone it is 355 untracked files inside the repo, and every "is the tree clean" check sees them.

### KD-19 — a refusal wording the classifier could not read — **CLOSED, 2026-09-15**
Resolved exactly as the entry predicted, by `upgrade --fleet` existing.

`looksUnimplemented` decides *no such command yet* versus *answered and failed* by matching
`/unknown (sub)?command|not a command|unrecognized/i`, and "`--fleet` is not a flag this command
knows" matched neither. That misclassification needed the flag to be UNIMPLEMENTED to fire. It is
implemented, so criterion D now spawns a command that runs, and a non-zero exit from it genuinely
is a failure rather than an absence — which is what the classifier would say.

Closed on the instance, and the class it named stands and is worth restating once: **a refusal
message has a reader somewhere, and adding a spelling without telling the reader makes the reader
silently wrong.** Nothing gates that today. It is not re-logged as an open entry, because an entry
that says "be careful" with no measurement behind it is the kind this file's header refuses.

### KD-33 — the plugin launched its MCP server by a path relative to nothing in particular — **CLOSED, 2026-09-15**
`.mcp.json` names `${CLAUDE_PLUGIN_ROOT}/inspector/mcp/dist/server.mjs`, and the gate now asserts the two properties
its own comment always claimed to be about.

**Karel's change, and his reason is the precise one:** point at this repo from another. A relative
path resolves against the MCP client's cwd, so the plugin's server only ever started for someone
whose cwd happened to be the plugin root.

**Where the variable resolves, measured — and my first measurement of it was WRONG.** I called the
project-scoped `cmp-inspector` after editing the file, got the server's own error rather than a
transport failure, and concluded the path had resolved. MCP servers launch at SESSION START: the
server that answered was started from the relative path, in a checkout where it works. The tell was
in the next session reminder, not in my reasoning.

Corrected, both halves executed:

```
plugin_create-cmp_cmp-inspector   answers          → resolves in PLUGIN scope
cmp-inspector (project)           CONNECTION_CLOSED → does NOT resolve in project scope
printenv CLAUDE_PLUGIN_ROOT       unset             → not an environment variable
node '${CLAUDE_PLUGIN_ROOT}/…/server.mjs'  MODULE_NOT_FOUND
```

**ONE FILE, TWO ROLES — the thing the next reader will trip on.** This repo IS the plugin, so
`.mcp.json` is the plugin's config from the marketplace cache and a project config in this checkout.
The anchored spelling that makes the plugin work everywhere leaves the project-scoped copy dead in
this one directory. That is the correct trade, not a defect: the plugin server serves the same tools
from anywhere, and the project-scoped one was a duplicate that only ever worked here. The test
carries that paragraph so the round trip — seeing `CONNECTION_CLOSED` and "fixing" it by going
relative again — is refused rather than rediscovered.

**The test was re-aimed, and that is a strengthening; here is the direction rather than the
argument.** It pinned `deepEqual(args, ["inspector/mcp/dist/server.mjs"])` — a spelling. Pinning a
spelling looks stricter than asserting a property and is weaker: it cannot tell a correction from a
regression, so it refuses both. The new form asserts one argument, anchored to the plugin root,
naming the committed bundle rather than `bin/server.mjs`, at a path that EXISTS — which the old form
could not reach at all. Executed against four wrong shapes:

```
the OLD spelling (relative, pre-fix)            RED
anchored but pointing at bin/server.mjs         RED
anchored, right shape, file does not exist      RED
two arguments                                   RED
the fix itself                                  green
```

It is not a strict superset and should not be described as one: it gives up exactly one refusal —
of the correct spelling — and buys four. `f5077c8` fixed WHICH FILE, measured against the real
cached install, and inherited FROM WHERE without weighing it; for a year the gate held the half that
had already been fixed.

**"Buys four" is an overclaim, measured — the review round that checked it, 2026-09-15.** Both
forms accept exactly ONE string and refuse every other, so `deepEqual` already refused all four of
those shapes; the new form does not buy them, it inherits them. Run differentially — old gate and
new gate over the same eight candidate `args`, `.mcp.json` rewritten between runs — the two
acceptance sets are singletons that swap: old accepts only the relative spelling, new only the
anchored one, and every other shape (bin, nonexistent file, two args, empty, absolute, trailing
space) is RED under both. What the re-aim actually buys is not a refusal count: the expected value
is now COMPUTED from `BUNDLE` rather than typed, so it tracks a rename instead of pinning a
spelling, and it says WHICH property failed when it fails. The third property — that the file
exists — is real but not new to the suite: `bundle-freshness.test.mjs`'s first test has asserted
`fs.existsSync(BUNDLE)` all along. Nothing to fix; the gate is sound and the argument for it was
one notch stronger than the facts. *Logged 2026-09-15, review round 1 of `plugin-root-path`.*

### KD-34 — a test named for the record-ordering defect was green at the commit that had it — **CLOSED, 2026-09-15**
Cut, which is what the entry asked for, in the round that logged it. Round 2 measured rather than
read: it built a worktree at `283294e` — the tree where the record was written before the ladder
plant — copied both of HEAD's tests in, and ran them. The source scan FAILED there and passes here,
which is the whole gate and it is sound. `a run that FAILED its last check leaves a record the
publish gate refuses` PASSED there, carrying the defect's name and unable to refuse it. I reproduced
that before agreeing.

It could never have done otherwise. Ordering is a fact about the SOURCE; the writer was always
correct, and nothing done with the writer in isolation can see when it is called. The test's first
half restated `verdict: failures.length ? "FAIL" : "PASS"` one line from itself and its second is
asserted by `test/proof-gate-hook.test.mjs:93`, which predates this branch.

Residue of a correct catch, and the round-1 version was mine and worse — it replayed the old call
order by hand and asserted a property no fix could give it. Rewriting it to something TRUE traded a
test that was red for the wrong reason for one that was green for no reason, and kept the name.
That is the third time on this branch that the honest move was to remove a test rather than keep
it: the duplicate that "closed" KD-10, the third KD-29 test, and this. **A test that cannot refuse
the defect in its own name is worse than no test, because the file's name says it is covered.** The
header now says so, and the file carries one test.

### KD-29 — the ladder plant blessed a run that never showed the edit compiled — **CLOSED, 2026-09-15**
The refusal is now symmetric. `assessLadderPlant` requires an `l1Required` step that PASSED before
the plant, exactly as it already required one for `l2Execution`, and names what it saw instead of
asserting a generality. The comment above `wasGreen` was right all along and applied to one half:
"a step that did not PASS before the plant proves nothing after it."

Both halves of the refusal are red at `46393d0` and green here — the receipt from the report
(`releaseBuild: FAIL` before and after, `e2eSmoke` PASS→FAIL) and the one-line version, a ladder
declaring `l2Execution` with no `l1Required` at all. A third test asserting that a blessed verdict
names both halves was written and **cut**: it is green at the merge-base, so it proves nothing about
this fix, and a name like "PASS is never printed with a hole" would have read as the proof.

### KD-12 — the gate printed a rule that contradicted the rule — **CLOSED 2026-09-14**
Half real, half not, and checking which was the work. The printed paraphrase WAS stale — it
carried the new severity test on the old termination shape — and it is now a pointer that
paraphrases nothing, because the second statement of a rule is always the one nobody updates.
The other half asked to loosen `--discharge-review`'s tree binding so the last round's fix
could discharge. It does not need loosening: ADR-0014 is right that merging bytes nobody read
is the thing to refuse, and the last round RE-RECORDS after its own fix instead. That is not a
third round, it costs one message, and it had already been the working practice for three
slices before anyone wrote it down.

### KD-22, KD-23 — a duplicate contract test, and a charter that still required an index of itself — **CLOSED `af1ba7e`, 2026-09-14**
The duplicate `every menu field's recommended answer is one of the answers it offers` was deleted;
`a field with options names a default, and the default is one of them` is again the single spelling,
and measured in round 2 it still covers exactly `MENU_FIELDS` (`CONTRACT_PATHS.filter(options)` and
`MENU_FIELDS` are the same two paths, asserted executably). The Closed note for KD-10 was corrected
to say the guard predated the branch. `DOCUMENTATION.md` §6.2 and §7 stopped demanding an
exhaustive index the header had renounced — §6.2 now points "below" at a reading order that is
above it (§2/§3, lines 40 and 137), which is the whole remainder.

### KD-1, KD-2, KD-9, KD-10, KD-13 — the ladder interview — **CLOSED 2026-09-14, Karel's calls**
`--yes` dropped from `harness init` (it meant the opposite of `--yes` everywhere else in the same
CLI, and never reached a user — 0.25.0 shipped three days before the interview merged).
`askLadderMenu({current})` deleted with both sentences claiming `upgrade` asks. **`^C` abandons
the install** — every question is asked before a byte is written, so honouring it costs nothing,
and a person who pressed stop and found 52 files had been ignored. A menu default that is not one of its own
options was ALREADY gated — `a field with options names a default, and the default is one of
them` has asserted it since before this branch, and the duplicate I added claiming to close
KD-10 was removed rather than kept (KD-22). KD-10 is closed because it was never live, not
because this change fixed it. And `ladderSummary` stopped telling a person to
uncomment a seeded ladder in a file this command never wrote.

### KD-11 — the doc charter claimed to be exhaustive — **CLOSED 2026-09-14, Karel's call**
It stops claiming it. `DOCUMENTATION.md` is a curated reading order now, which can be honestly
incomplete; an exhaustive index cannot, and nothing was ever going to enforce this one. The
"which doc is authoritative" question points at NORTH-STAR §12, a precedence table and a
different instrument.

### KD-7 — a boolean flag swallows the target directory — **CLOSED**
`18af5c3`, `91a3ac2`. Flags that take no value are declared; the token after them stays the
user's. Two rounds of review found three more defects in the fix itself, including an
entry-point guard that would have made every npm-installed `prooflane` a silent no-op.

### KD-15 — `create-cmp --version` scaffolds an app — **CLOSED**
Refusing the unrecognised never reached it: `--version` is a DOCUMENTED flag, so it passed
every check and fell through the dispatcher into `create`. It answers before acting now, the
way `prooflane` always has.

### KD-17 — the flag lists could not reach a typo or a short flag — **CLOSED**
Not by a longer list. `--verfiy`, `--anything` and `-y` all failed identically and no list
reaches them, so both doors now refuse an argument they cannot account for — by name, exit 2,
nothing written — which is the answer `unknown command` already gave one branch down.

### KD-27 — the lane-already-running refusal names a PID and not a project — **CLOSED 2026-09-17**

`scripts/fleet-check.mjs` (the concurrent-lane guard)

    a verify lane is already running (7360 node qa/verify.mjs) — a concurrent device
    run collides with it (wedged adbd, false reds). Wait for it, then run the tier once.

The refusal is RIGHT — two lanes share one adb and one emulator, so the second must not
start — and it is right across repositories, which is the part the message does not say.
Measured 2026-09-14: the blocking lane's cwd was `/Users/test/dev/payment-blueprint`, an
unrelated project, and finding that out took four commands (`ps`, `pgrep -fl`, `lsof`, then
reading the guard). The message had the PID all along and could have had the path.

It matters more than a nicety because of what the reader concludes in the meantime. A lane
"already running" in YOUR repo is something you started and can wait for or kill; one in
someone else's is neither, and the two demand opposite actions. Until the message says which,
the fastest wrong move — killing it — is also the most tempting.

**Fires when:** anyone runs two lanes on one machine, which fleet work makes normal.
*Logged 2026-09-14, hit while closing the interview slice.*

Closed by `describeLane` in `scripts/hooks/proof-gate.mjs`: the refusal now names the project
(resolved from the lane's own cwd via `/proc/<pid>/cwd` or `lsof`, and from an absolute operand
when it has one), says outright when it is ANOTHER project's and must not be killed, and reports
the step and the time left from the lane's own `qa/.lane-in-progress` marker measured against its
last full run — or says which of the two it could not find, never guessing.
`test/a-lane-refusal-names-a-pid-and-not-a-project.test.mjs` holds it, with one test pointed at a
REAL spawned lane process so the `lsof`/`/proc` read is not an unread instrument.

### KD-89 — a partly-installed tree fails three tests, and two of them do not look like a missing install — **CLOSED 2026-09-18 by `scripts/suite-preflight.mjs`, wired as `pretest`**

`package.json` (`workspaces`, `scripts.test`) · `scripts/suite-reporter.mjs`

Measured 2026-09-18 in a fresh git worktree whose ROOT `node_modules` existed but whose
`inspector/mcp/node_modules` did not. `npm test` reported three failures:

```
✖ inspector/mcp/test/bundle-freshness.test.mjs   ERR_MODULE_NOT_FOUND: Cannot find package 'esbuild'
✖ inspector/mcp/test/server-tools.test.mjs
✖ the console host delivers no profile console copy, so the Evidence tab links no step
    to the section it governs        AssertionError: the host delivered stepGoverns={}
```

`npm ci` provisioning the workspace turned all three green, with the tree otherwise untouched.

**The defect is not that an uninstalled tree fails — it is the SHAPE of two of the three failures.**
`inspector/mcp` is a root workspace (`package.json`), so one root `npm ci` provisions it, and
`.github/workflows/ci.yml` does exactly that deliberately ("ONE install, not two"). CI is therefore
never in this state and no adopter ever is. A contributor in a worktree can be, and what they are
shown is one honest module error and **one semantic assertion about console copy and `stepGoverns`**
— a message that reads as a real product defect in code they may have just touched. The cost is a
wrong diagnosis, not a wrong verdict, which is why it is here and not on the first row: nobody is
served anything false by the shipped product, and the failure is loud rather than silent.

It is recorded because it was expensive to disbelieve. The honest way to clear it was to run the
three files on a clean `origin/main` FIRST and watch them fail there too — which proves "not mine"
but still misattributes the cause to the repo. Only chasing `ERR_MODULE_NOT_FOUND` to an absent
workspace directory got the real answer.

**What the fix would be, when it is taken:** a preflight in the suite reporter that checks each
declared workspace has a `node_modules` before the run and says *"workspaces are not installed — run
`npm ci` at the repository root"* instead of letting the assertions speak. That is a change to how
the suite bootstraps, which is a slice with its own failure modes (a preflight that itself goes
wrong makes every run unrunnable), not a line in this one.

**Closed by a door rather than a message, and the paragraph above got two things wrong.** `npm test`
now runs `scripts/suite-preflight.mjs` as `pretest`: it refuses the run by name — which package,
which dependencies, `npm ci` — and `node --test` never starts.

The first correction is the PREDICATE. "Each declared workspace has a `node_modules`" is false for
**10 of this repo's 12 declared packages** after a clean `npm ci`, because their dependencies hoist
to the root; that check refuses a correct tree. Two resolver spellings fail the other way and were
measured too: `import.meta.resolve(spec, parent)` ignores its second argument without
`--experimental-import-meta-resolve` (it reported `esbuild`, `zod` and `@modelcontextprotocol/sdk`
missing while installed), and `require.resolve("@modelcontextprotocol/sdk")` throws
`MODULE_NOT_FOUND` from `inspector/mcp` where it IS installed, because that package has only subpath
exports. What holds is the resolver's own directory walk and nothing above it.

The second is the PLACE. A preflight *in the reporter* can annotate a run; it cannot stop one, and a
skip is worse than the failure it replaces here: `recordRun` computes its verdict from `counts.fail`
and `counts.cancelled`, so `counts.skipped` never reaches it and an uninstalled tree would have
recorded **PASS**. A skip must also name its victims, and the third of the three never reproduced
from the absent workspace alone — logged as KD-109, along with the `catch {}` in `applyConsoleCopy`
that can turn any load error into that same assertion. The risk this entry named — a preflight that
itself goes wrong making every run unrunnable — is answered by construction: the door fails OPEN on
anything it cannot read, and imports only `node:` builtins so it can load on the tree it describes.
`test/an-uninstalled-tree-fails-as-if-the-contributor-broke-it.test.mjs` holds all of it, including
a fixture that proves npm's `pretest` really does abort the run before the test script leaves a
marker.

### KD-78 — the npm pages for two aliases said "8 gates" — **CLOSED 2026-09-18**

`packages/aliases/create-kmp/package.json:4`, `packages/aliases/create-compose-multiplatform/package.json:4`

Both descriptions read *"a machine-enforced verify lane (8 gates, evidence receipts)"*. The lane
that holds an AI-driven change is `local` (17) or `ci` (18); the only profile that runs 8 is
`smoke`, whose receipt `qa/receipt-check.mjs` refuses as done-evidence. **In the tree this is
fixed** — the bare number is gone, and
`test/a-published-npm-description-states-a-lane-size-that-names-no-profile.test.mjs` refuses the
next one. What is NOT fixed, and cannot be from here, is what npmjs.com serves: a registry
description is a property of *published bytes*, and it changes only when someone publishes. Until
`create-kmp@0.1.6` and `create-compose-multiplatform@0.1.6` are published, the pages a stranger
reads before installing still carry the false number, at the versions already live (`0.1.4`).

This is logged rather than blocked because there is no act available in this repository that would
close it — not because nobody is wrongly served. Somebody is, on two npm pages, right now. The
remedy is an outward-facing human act (`docs/PUBLISHING.md`), and standing one up unasked is the
thing this project does not do on its own.

**Fires until:** both aliases are published at the versions this tree holds.
*Logged 2026-09-18, review round 1 of the count-gate slice; the tree-side half was fixed in the
same round.*

**CLOSED by publishing, which is the only act that could close it.** `create-kmp@0.1.6`,
`create-compose-multiplatform@0.1.6` and `create-mobile@0.1.2` are live; the registry's `latest`
tag serves all three, and none of their descriptions contains the bare number. Verified against
`https://registry.npmjs.org/<name>` directly rather than through `npm view`, because npm's local
packument cache served the OLD versions for several minutes after the publishes succeeded — long
enough that `npx <alias>@latest` failed `ETARGET` against a registry that already had the bytes.
A cache reading stale is the `served-page-is-not-your-code` shape, one registry over.

The release proof this publish required (`scripts/hooks/proof-gate.mjs` refuses `npm publish`
without it): fleet check PASS at rung L2 on `06c5aa1`, clean trunk, `treeWasDirty: false`.

*Closed 2026-09-18 by the publish itself. The entry is kept whole above because its reasoning —
that a registry description is a property of published bytes and no commit here can change one —
is the record, and it is the same shape as every other artifact this repo cannot reach from a
commit.*

### KD-40 — a minimal scaffold keeps the lock for a lane it just deleted

`src/lib/minimal.mjs` (`subtractLane`), `packages/harness/src/lib/harness-region.mjs` (`isHarnessFile`)

`subtractLane` deletes every machine-owned lane file outside the keep-set, walking
`listHarnessFiles`, which yields only what `isHarnessFile` accepts: the two DECLARATIONS, the one
GENERATED record, and otherwise `.mjs` alone. `qa/harness.lock.json` is none of those, so the
stripper never sees it. Executed:

```
qa/harness.lock.json     NOT a harness file — --minimal never sees it
qa/harness-source.json   IS a harness file (strippable)
qa/harness-manifest.json IS a harness file (strippable)
qa/verify.mjs            IS a harness file (strippable)
```

So a minimal scaffold keeps a lock whose `files` map names a hundred-odd paths that no longer exist
and whose `fileCount` is wrong — a record that describes a lane the same command removed.

**Reported from outside, with its cost measured.** The `payment-blueprint` session hit this: a
`--minimal` re-scaffold stripped 66 lane files and left the lock, and `gitleaks` then flagged a
SHA-256 content digest inside it as a `generic-api-key`. Its lane went red on an orphan written by
nothing and read by nothing. That is the honest shape of the harm — not that the lock is wrong (no
reader is left to be misled) but that it is an unexplained file full of high-entropy strings sitting
in an adopter's repo, and a secret scanner is exactly the thing that will find it.

**Not fixed here**, and the fix is a decision rather than a line: either the stripper learns about
the lock (and `isHarnessFile`'s `.mjs`-or-declaration rule grows a third case), or `--minimal`
stops being a lane-subtraction and becomes a lane-less install. The second is probably right and is
a slice, not an edit.

**Fires when:** anyone runs `create-cmp … --minimal` over a tree that has a lane. *Logged
2026-09-15, reported by the payment-blueprint session and verified here by execution.*

**CLOSED 2026-09-19 — NOT REPRODUCIBLE, and the entry above was false when it was written.**

Everything from *"the lock it wrote describes a lane the same command removed"* onward is wrong.
Measured by executing the real template twice: a fresh `--minimal` stamp locks **7** files reading
`intact`, and re-stamping `--minimal --force` over a full 73-file tree locks the same 7. The cause
is ordering that predates this entry: `applyMinimalMode` runs BEFORE `writeLaneLock`
(`src/scaffold.mjs:484-493`, whose own comment says so, and `:301-317`), so the lock is rewritten
over the kept subset every time. That ordering and `test/minimal-mode.test.mjs:83-91` both landed in
`2ddce4f` on **2026-08-21** — three weeks before this was logged on 2026-09-15.

**The gitleaks harm was real and mis-attributed.** A full stamp's lock holds **73** sha256 digests
and a minimal one holds **7**, so `--minimal` REDUCES the high-entropy strings blamed on it. That
finding is now its own entry, KD-160, where it belongs.

**The `isHarnessFile` route this entry implies is refused on the merits, not on cost.**
`packages/harness/src/lib/harness-lock.mjs:33-34`: *"The lock is deliberately NOT a .mjs file, so it
is not part of the region it describes — a manifest inside its own manifest could never settle."*
`writeHarnessLock` hashes the region and then writes the file, so a lock inside its own region would
record its pre-write bytes and read `modified` the instant it was taken.

**The residue, and it is harmless.** `isHarnessFile` does not recognise the lock, so `subtractLane`
cannot see it — and a swept `qa/` shows it is a class of one: of 7 files outside the region in a
full stamp, `--minimal` removes `approvals.json`, `comments.json` and `evidence/schema.json`, and
the survivors are `qa/e2e/README.md`, `qa/e2e/smoke.yaml`, `qa/golden/home.json` (app content, kept
by design) and the lock. Nothing reads a minimal tree's lock: `harden.mjs:200` reads one only on the
`alreadyFull` branch, and `src/lib/harness-upgrade.mjs:62-69` excludes it as derived state.

**Closed by a pin, not by an argument.** `test/a-minimal-lock-names-a-lane-the-tree-does-not-carry.test.mjs`
asserts what is true and was refuter-tested: moving `writeLaneLock` before the `config.harness ===
false` block makes it fail with *"the lock names 66 path(s) the tree does not carry"* — **66, the
exact number this entry reported from payment-blueprint.** So the failure MODE it describes is real,
the code already prevents it, and the prevention is now held in place.

*Closed 2026-09-19. The lesson is the file's own: an entry written from reading, about behaviour
nobody executed, drifts from the tree it describes. This is the third today.*

