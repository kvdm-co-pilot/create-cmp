# Known defects — closed

> Moved out of [`KNOWN-DEFECTS.md`](KNOWN-DEFECTS.md) on 2026-09-17, so the log a reviewer opens every
> round holds only what is still open. **The rule for what blocks and what is logged is that file's
> header; nothing here restates it.** Entries keep their ids and their words — code and tests cite
> them by id (`KD-7`, `KD-41`), and a grep for the id lands here.


*An entry moves here when the thing is fixed or the decision is taken, with the commit that did
it.*

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
