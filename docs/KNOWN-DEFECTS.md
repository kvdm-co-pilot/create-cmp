# Known defects — logged, not re-raised

> **Scope.** What a review found and deliberately did not block on — decisions waiting on a
> human, taste calls, hazards that cannot fire yet, and real defects nobody is wrongly served
> by. The rule below is what decides that, and AGE IS NOT PART OF IT: this line used to open
> with "pre-existing conditions" while the table three paragraphs down had abolished exactly
> that criterion, which is the drift the file exists to catch, in the file, about itself. `docs/DOGFOODING-FINDINGS.md` is the other backlog and is not this — that one
> collects what building real apps on the harness surfaces, from a different source and at a
> different size. **This file is read by a reviewer on every round, so it stays short.** An
> entry that grows into a slice leaves here and becomes one.

## The rule this file exists to make possible

**A slice gets two review rounds, and no third.** Round 1 reads the whole diff. Round 2 —
only when round 1's fixes were more than trivial — reads what changed since round 1, not the
diff again. After round 2 the review is done: whatever remains, from either round, comes here.

The rule that stood here before said a round ends when it produces *no new defect*. That has
no fixed point. An LLM reviewer at any real effort finds something in any real diff — it is
calibrated to its own attention, not to the code's defect density — so "go again while it
finds something" means go again. Measured on the `interview-menu` slice, a two-question menu:
findings of 3, 3, 2, 1, 2, 1 across six rounds, four of them defects in the previous round's
fix, the sixth round taking 1h55m to produce a nine-line change. Rounds 1–3 found both P1s and
paid for themselves. Rounds 4–6 were the instrument reviewing itself.

So every finding is placed on one line first, and the line has two questions on it:

| | |
|---|---|
| **Would shipping it WRONGLY SERVE an adopter?** — sent into a refusal, told something false, handed a wrong result, given a tree they did not ask for | fixed before merge, as a failing test (ADR-0014) |
| **Anything else** — a product decision, a taste call, a hazard that cannot fire yet, *or a real defect nobody is wrongly served by* | logged here, in the round it was found, and not raised again |

A dead paragraph, an unread key, a scanner edge case, a summary line that could be truer:
real, logged, shipped. A reviewer that cannot place a finding on that line says so rather
than picking.

**PRE-EXISTING IS NOT ON THAT LINE.** It used to sit in the second row and it reads as an
exemption, which it is not: *pre-existing* answers whose fault, and the question above is how
bad. KD-7 is the measurement — `prooflane init --new-profile ../app` wrote fifty-two files
into the wrong repository and exited 0, was logged as non-blocking because it predated the
slice, and an adopter whose harness lands in the wrong repo is wrongly served whenever the bug
arrived. Age decides who paid for it, never whether it blocks.

**A FIX'S OWN NEW BEHAVIOUR IS IN SCOPE FOR THE ROUND THAT REVIEWS IT.** Not only the finding
it answers — the behaviour it introduces on the way. Measured across two slices: four of six
rounds found a defect in the previous round's fix, and three of round 1's four findings on the
argument-refusal slice were defects created while fixing the first one, including an
entry-point guard that would have made every npm-installed `prooflane` a silent no-op. A round
that checks only whether the finding is answered is half a round.

**ENTRIES LOGGED UNDER THE OLD LINE KEEP THEIR PLACE, NOT THEIR REASON.** Age stopped being a
routing criterion on 2026-09-14, and fourteen entries were placed before that — several citing
"pre-existing" as the reason they did not block. Re-placing all of them at once would mean
fourteen severity calls made in a batch, which is the least careful way to make any of them. So:
an entry keeps its place until it is next touched, and whatever touches it re-places it against
the line above or says why it still belongs. KD-24 was re-placed the day the rule changed,
because it was the one a review named: `--yes` at create-cmp's door is inert, and the rest of
the line still installs where the user pointed — that, and not its age, is why it does not block.

**THE RECORD STAYS BOUND TO THE TREE, and that is not in tension with the cap.** ADR-0014
binds a review record to the bytes it describes so it cannot be recycled across changes;
discharging a review of tree A while merging tree B would be the thing this product exists to
refuse. So the LAST round re-records after its own fix — resume that reviewer, do not start a
cold one. Re-recording is not another round: the same reader confirms the same finding against
the bytes that merge, and it costs one message rather than a fresh read of the diff.

**Reading this file before reporting is part of a review.** A finding already logged here is
not reported again — that is the whole point, and the measured reason: on the `interview-menu`
slice, `askLadderMenu({current})` was raised in three consecutive rounds by three cold
readers, each correctly, because nothing recorded that it had already been heard.

**Logging is free, and that is deliberate.** This file is markdown under `docs/`, which
`scripts/observed-tree.mjs` declares irrelevant to BOTH the review tier and the device tier
(`REVIEW_TIER_IRRELEVANT`, `DEVICE_TIER_IRRELEVANT`). Adding an entry cannot reopen a gate.
If it could, logging a defect would cost a device run, and the honest thing would stop
happening — which is the same argument ADR-0014 makes for why the review gate never reads
what a review found.

**The author's half of the same rule:** bound the fix to the finding. Measured on the same
slice — round 1's fix caused round 2's first finding, and round 2's fix caused round 3's.
Each correction was reasonable and each reached slightly past what was found, and every reach
cost a round. A review loop is generated by over-correction far more reliably than by a
reviewer finding too much.

## The open list, in one screen

A reviewer reads this file on every round, so the whole of what it must know is here. The
entries below carry the measurement; this table carries the fact, and grepping `^### KD` gets
you the same list without opening anything.

| | | |
|---|---|---|
| **KD-3** | `executionHint` reads menu paths without its sibling's prefix filter | cannot fire — one CONTRACT declaration |
| **KD-4** | `create-cmp`'s `harness init` flag line omits `--new-profile` | the two help surfaces have drifted |
| **KD-5** | `tokenDrift` SKIPs whenever the debug app is not running | environmental, indistinguishable from broken |
| **KD-6** | `device` is not among the agnostic lint's runtime nouns | adding it fails ten core modules today |
| **KD-8** | the dangling-citation lint reads `ADR-NNNN`, not `§` | nothing dangles; a checker risks false positives |
| **KD-14** | `create-cmp`'s parser does not split `--flag=value` | never promised; pairs with KD-4 |
| **KD-16** | a boolean's value form is consumed by a reader that cannot read it | `prooflane` has no `flagBool` at all |
| **KD-18** | the symlink gate reads 2 of the 8 bins this repo publishes | all eight pass today |
| **KD-20** | the vendored lane's parsers refuse `--` as well | not npx-reachable |
| **KD-21** | `KNOWN_FLAGS` is hand-written where `BOOLEAN_FLAGS` is derived | zero gaps measured, both directions |
| **KD-24** | `--yes` refused at one door, accepted-and-ignored at the other | the flag is inert; the rest of the line still does what was asked |
| **KD-25** | an interrupt that printed nothing would pass the suite | wording deliberately not pinned |
| **KD-27** | the lane-already-running refusal does not say WHICH repo is running it | four commands to find out |
| **KD-28** | the header's KD-7 measurement cites a count this log attaches to another defect | the argument does not rest on the number |
| **KD-30** | the "second lane run left no receipt" guard reads the path the first run's receipt is at | unreachable; the stale receipt reads as the overclaim |
| **KD-31** | the vendored contract tells its reader to run `scripts/fleet-check.mjs`, which no stamped app has | an import error, not a wrong result |
| **KD-32** | the plant driver spells cmp's source root and pack id as literals | both fail loud, and there is one pack |
| **KD-37** | two fleet ids naming one directory are counted as two repos upgraded | the second pass is idempotent; both were named |
| **KD-39** | a harness nested under an unrelated `node_modules` borrows that project's provenance | unreachable in every layout npm/pnpm/npx produce |
| **KD-40** | `--minimal` strips the lane and leaves `qa/harness.lock.json` describing it | the lock is invisible to the stripper: not `.mjs`, not a declaration |
| **KD-43** | the guard that says the suite is complete is collected BY the suite | no fix that keeps one decider; the declaration is a reviewed trigger path |

---

## Open

### KD-3 — `executionHint` reads menu paths without the prefix filter its sibling applies

`packages/harness/install/init.mjs` (`executionHint`) vs `packages/harness/install/interview.mjs`

`executionHint` iterates all of `MENU_FIELDS` and resolves each as `` `ladder.${field}` ``,
while `interview.mjs` filters to the `ladder.` prefix first and carries a comment explaining
why. No defect today: `CONTRACT` has one declaration, so every menu field is a ladder field.
The day a second declaration offers a menu, the two readers disagree and the invitation loop
breaks silently rather than loudly.

**Fires when:** a second CONTRACT declaration gains a field with `options`.
*Logged 2026-09-11, raised in review round 3.*

### KD-4 — `create-cmp`'s `harness init` flag line omits `--new-profile`

`bin/create-cmp.mjs:133`

Pre-existing. The two help surfaces have drifted from each other, and `prooflane --help` is the
fuller one — it names `--new-profile`, `create-cmp`'s `harness init flags:` line does not.

*Logged 2026-09-11, noticed in review round 1. Reason corrected 2026-09-11 after review round 4:
this entry first said `--new-profile` was "parsed at the front door rather than there" and so out
of the new lint's reach. It is branched on at `packages/harness/install/init.mjs:950`, and the
lint does cover it — against `prooflane --help`, which names it. Only create-cmp's help omits it.
The conclusion held; the reason was wrong.*

### KD-5 — `tokenDrift` SKIPs whenever the debug app is not already running

`packages/harness/src/` token-drift step; observed on every fleet run

`inspector endpoint not reachable on :9500 (debug app not running?)` — the live tier needs a
debug build already launched, which a headless fleet run does not provide. The SKIP is
environmental and non-blocking (the 2026-09-11 run still graded **L2 device, PASS**), but it is
indistinguishable at a glance from a step that was skipped because it was broken.

**Worth deciding:** classify it as environmental so a reader can tell the two apart.
*Logged 2026-09-11.*

### KD-6 — `device` is not among the agnostic lint's typed runtime nouns

`test/agnostic-lint.test.mjs`

`emulator`, `simulator`, `adb`, `avd`, `CMP_DEVICE` are banned from `packages/harness/src`;
`device` is not, and its absence is a measurement rather than an oversight — adding it fails
ten core modules today: console-shell, console-standing, console-tabs, preview-service,
framework-check, affected-tests, evidence-badge, evidence-html, flight-recorder, verify.

**Fires when:** someone sweeps those ten. The exception list is asserted to only ever shrink.
*Logged 2026-09-11, measured earlier the same day.*

### KD-8 — the dangling-citation lint covers `ADR-NNNN`, and the instance that provoked it was a `§`

`test/cited-decision-that-does-not-exist.test.mjs`

The lint refuses a source comment citing an ADR number `docs/adr` does not hold. The finding it
came from was `NORTH-STAR §11 D2` (removed by hand in 5a0251c) — a section citation, which the
lint does not read. Measured 2026-09-11: nothing dangles today. Every `NORTH-STAR §N` and `§N.M`
in source resolves (§6 has 7 numbered items, §8 has 12, §9.1/§9.2 are headings), and
`PACKAGE-SPLIT D2` exists and says what the line citing it claims.

Not raised as a defect because there is nothing to fail on, and not proposed as a lint: source
cites eighteen documents in five numbering styles (`§8.9` is a list item, `§9.2` a heading, `D2` a
table row, `Rule 4` neither), so a checker would be a slice with real false-positive risk — which
is the one thing the helper's own header says gets a scanner deleted.

**Fires when:** the next hand-typed `§` goes stale. *Logged 2026-09-11, review round 5.*

### KD-14 — `create-cmp`'s parser does not split `--flag=value`

`src/lib/args.mjs` (`parseArgs`)

`prooflane`'s parser splits on `=`; this one never has. `create-cmp harness init --profile=svc`
produces a flag literally named `profile=svc` and the profile id falls back to the directory
name. Not a regression and not promised — no help text in `bin/create-cmp.mjs` offers the `=`
form, every example uses the space form — so a user reaches it only by habit from other CLIs.

Found while fixing KD-7, as a test I had written that asserted the `=` form in BOTH parsers.
That test was reaching past its own slice; it now asserts `=` where `=` is parsed, and this
entry holds the rest.

**Worth doing with KD-4:** both are drift between the two front doors, and one slice should
close them together.
*Logged 2026-09-13.*

### KD-16 — a boolean flag's value form is consumed by a reader that cannot read it — **RE-OPENED**

`packages/harness/install/args.mjs`, `src/lib/args.mjs` (`consumesNext`, `flagBool`)

`consumesNext` lets a declared boolean swallow the next token when it is exactly `true` or
`false`, and its docstring gives the reason: "`flagBool` is tri-state by contract". Two places
that value arrives where nothing is tri-state: `packages/harness` has no `flagBool` at all (every
reader is truthiness, and `Boolean("false")` is `true`), and `flagBool` reads the value form of
`x` but never of `no-x` while `consumesNext` consumes it either way.

Re-opened by review round 1 of `refuse-unknown-args`, because `5c2cea6` moved it to **Closed**
under a heading that describes KD-17 ("the flag lists could not reach a typo or a short flag"),
and refusing an unrecognised argument cannot reach it: `--dry-run` and `--no-ios` are both
*recognised*. Both halves reproduce verbatim on `5c2cea6`:

```
$ cd cwd && prooflane init --dry-run false ../pC --no-interview
  project: …/pC   ✓ 50 files written   ! --dry-run: nothing was written.

$ node -e 'parseArgs(["--no-ios","true","./my-app"])'  →  {"no-ios":"true"}
  flagBool(flags, "ios", true)  →  true          ← the flag the user typed does nothing
```

Its placement on the line above has not changed and is not being re-litigated — neither half is a
regression, the 168-row differential against the merge-base still stands, and an adopter is no
worse served than before. What changed is only that the record said it was fixed.

**Fires when:** anyone writes `--flag false` at prooflane, or `--no-flag true` anywhere.
*Logged 2026-09-14 (review round 2 of `fix-flag-eats-target`); closed and re-opened 2026-09-14.*

### KD-20 — the vendored lane's two strict parsers refuse `--` as well

`packages/harness/src/verify.mjs` (~:199), `packages/harness/src/watch.mjs` (`parseWatchArgs`)

The same defect a failing test now refuses at the two front doors, in the two parsers the adopter
runs *inside* their repo. Executed on `5c2cea6`:
`parseWatchArgs(["--", "--once"])` → `unknown argument "--" — run node qa/watch.mjs --help`.

Pre-existing — both predate `refuse-unknown-args`, and neither is reached through npx (`node
qa/verify.mjs` / `node qa/watch.mjs` are the documented forms, and node does not insert a
separator), so the `npx` path that makes the front-door instance blocking does not exist here.
Worth sweeping with whatever fix lands for the front doors, so there is one answer to `--` in the
product rather than three.

**Fires when:** an adopter wraps the lane in an `npm run` script and passes `-- --fast` through a
layer that forwards the separator. *Logged 2026-09-14, review round 1 of `refuse-unknown-args`.*

### KD-21 — `KNOWN_FLAGS` is a hand-written second spelling of "what this CLI reads", and the cost of forgetting it inverted

`src/lib/args.mjs`, `packages/harness/install/args.mjs` (`KNOWN_FLAGS`)

`BOOLEAN_FLAGS` has a deriver — `test/a-flag-is-boolean-to-one-reader-and-not-to-the-other.test.mjs`
scans `flagBool`'s call sites and refuses the list when the two disagree, "so it cannot drift again
by hand". `KNOWN_FLAGS` has no such gate, and it is now the more dangerous of the two: before
`5c2cea6`, a name left off a list was ignored; after it, a name left off `KNOWN_FLAGS` makes the CLI
**refuse a flag it documents and reads**.

Not raised as a defect because there is nothing to fail on. Measured 2026-09-14 across both doors:
every name reachable as `flags.x`, `flags["x"]`, `flagBool(flags,"x")` or `flagBoolWithAlias` in
`src/**` + `bin/create-cmp.mjs` and in `packages/harness/{install,bin}/**` is in its door's
`KNOWN_FLAGS`, and every `--flag` either door's own `--help` prints is too — zero gaps in both
directions. The one repo invocation the refusal now rejects is
`scripts/stage3-gate.mjs`'s `prooflane upgrade --fleet`, which names a command that does not exist
yet (KD-19), so a deriver landed today would need an exception for it on day one.

**Fires when:** the next flag is added to a command and not to `KNOWN_FLAGS`.
*Logged 2026-09-14, review round 1 of `refuse-unknown-args`.*

### KD-18 — the symlink gate reads two of the eight bins this repo publishes

`test/a-published-bin-does-nothing-when-npm-symlinks-it.test.mjs` (`declaredBins`)

Its header says "EVERY bin every package.json declares". The scan reads the root manifest and
`packages/*/package.json` — one level — so it sees `create-cmp` and `prooflane-harness` and misses
the five alias bins under `packages/aliases/*/` (`prooflane`, `create-mobile`, `create-kmp`,
`create-ktor`, `create-compose-multiplatform`) and `inspector/mcp`. `assert.ok(bins.length > 0)`
passes on two, so the narrowing is silent. The missed set includes `prooflane`, which is the name an
adopter actually `npx`es.

Nothing is broken behind it: all eight were run directly and through a symlink on 2026-09-14 and
every one produced identical bytes and status. Logged as a gate narrower than its own claim, not as
a defect — the repair is to recurse `packages/` (or read `workspaces`) rather than to list two
depths.

**Fires when:** an alias bin gains an entry-point guard, or any other realpath-sensitive line.
*Logged 2026-09-14, review round 2 of `fix-flag-eats-target`.*

### KD-24 — `--yes` is refused by one door of `harness init` and accepted-and-ignored by the other

`packages/harness/install/args.mjs` vs `src/lib/args.mjs`, for the one shared installer

Executed on `cfddc58`, same command, same flag, same tree:

```
$ prooflane init ./p --dry-run --no-interview --yes
  ✗ prooflane: --yes is not a flag this command knows … Nothing was written.     (exit 2)
$ create-cmp harness init ./p --dry-run --no-interview --yes
  … ladder   not asked (--no-interview) … ! --dry-run: nothing was written.      (exit 0)
```

`yes`/`y` left `packages/harness/install/args.mjs` with this change and stay in `src/lib/args.mjs`,
where `harden`, `attach`, `doctor`, `clean`, `upgrade` and `create` genuinely read them — so the
create-cmp door cannot drop them, and `harness init` is the one command there for which they now
mean nothing. `prooflane.mjs`'s own header states the property this crosses: "Two front doors, one
behaviour." The class is pre-existing and wider than `--yes` (`--force`, `--minimal`, `--fix` are
accepted-and-ignored by `create-cmp harness init` today); `--yes` is the newest member.

Not blocked: no published package ever gave `--yes` a meaning here — `create-cmp-cli 0.25.0` and
`prooflane-harness 0.21.1` both shipped 2026-09-09, `flags.yes` entered `install/init.mjs` with the
interview on the 12th (`47943de`), and neither published `--help` named it. An adopter typing it at
the create-cmp door is told nothing, not told something false.

**Worth doing with KD-4 and KD-14** — all three are drift between the two front doors, and one
slice should close them together. A per-COMMAND known-flag set, rather than a per-door one, is
what would make the class unreachable.
*Logged 2026-09-14, review round 1 of `interview-decisions`.*

### KD-12 — the gate printed a rule that contradicted the rule — **CLOSED 2026-09-14**
Half real, half not, and checking which was the work. The printed paraphrase WAS stale — it
carried the new severity test on the old termination shape — and it is now a pointer that
paraphrases nothing, because the second statement of a rule is always the one nobody updates.
The other half asked to loosen `--discharge-review`'s tree binding so the last round's fix
could discharge. It does not need loosening: ADR-0014 is right that merging bytes nobody read
is the thing to refuse, and the last round RE-RECORDS after its own fix instead. That is not a
third round, it costs one message, and it had already been the working practice for three
slices before anyone wrote it down.

### KD-27 — the lane-already-running refusal names a PID and not a project

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

### KD-28 — the rule's own KD-7 measurement cites a count this log attaches to another defect

`docs/KNOWN-DEFECTS.md` (the header's pre-existing paragraph)

The paragraph says `prooflane init --new-profile ../app` "wrote fifty-two files into the wrong
repository and exited 0". KD-7 measured `qa/` landing in `cwdtest2` with exit 0 and no count;
the only 52 in this file belongs to a different finding — the `^C` decision, "a person who
pressed stop and found 52 files had been ignored". The argument does not rest on the number:
wrong repository, exit 0, logged because it predated the slice is the whole of it.

**Fires when:** the next reader checks the measurement and finds the other defect.
*Logged 2026-09-14, review round 1 of `review-gate-rule`.*

### KD-25 — an interrupt that printed nothing at all would pass the suite

`test/a-session-cut-short-is-reported-as-one-that-finished.test.mjs`,
`test/an-interrupt-abandons-the-install.test.mjs`

The gate is real — executed on the merge-base it fails with `an interrupted install reported
success (exit 0)` — and its assertion (non-zero exit, empty tree) is strictly stronger about the
TREE. What it stopped asserting for that one ending is the property the file it lives in is named
for: that the ending is told apart *in what the command prints*. `init` does print "interrupted —
nothing was written", and nothing refuses its absence; a change that exits 1 silently is green in
every test here. Pinning the wording is what the author deliberately declined, so this is a gap
without an obvious cheap repair, and no adopter is wrongly served today.

Alongside it: `an-interrupt-abandons-the-install.test.mjs`'s "THE CONTROL: answering, and skipping
every question, both still install" installs nothing — it asserts over `askLadderMenu`'s return
value only, so the half of the control that would catch an `init` which refuses too often lives in
the gate above and in `test/prooflane-bin.test.mjs`, not in the file whose header claims it.

**Fires when:** someone makes the interrupt path quieter, or reads that file's CONTROL for what it
measures. *Logged 2026-09-14, review round 1 of `interview-decisions`; narrowed in round 2 to what
`af1ba7e` left standing.*

### KD-30 — the plant's "no receipt from the second run" guard reads the first run's receipt

`scripts/fleet-check.mjs` (`runLadderPlant`)

`afterPath` is `qa/evidence/latest.json` — the same path `main()` already refused to continue
without at step 3. So `if (!fs.existsSync(afterPath))` cannot fire, and a second lane run that dies
before writing a receipt (killed, a wedged daemon, a throw in the runner) leaves the BASELINE
receipt in place to be read as the "after". Every L2 step is green in it, so the instrument returns
the overclaim: "startup is broken and every l2Execution step still passes … These steps do not start
the program." A profile is accused of the exact defect the instrument exists to catch, because the
run that would have exonerated it never happened. Receipts carry `generatedAt`; nothing compares the
two.

Not blocking: repo-only, and a human reads the line. *Logged 2026-09-14, review round 1 of
`startup-plant`.*

### KD-31 — the contract vendored into every stamped app names a script no stamped app has

`template/qa/lib/profile-contract.mjs` (comment above `l2Execution`)

"Run it with `node scripts/fleet-check.mjs --ladder-plant`." The template ships no `scripts/`
directory; `fleet-check.mjs` lives in create-cmp and is not vendored. The contract's own header
names "the author" — a person writing a profile, in their own tree — as one of its three consumers,
and this is the one instruction it gives them that their tree cannot carry out. The file already
carries one reference of the same shape (`node scripts/sync-harness.mjs`, `profile.mjs:26`), but
that one says "in the create-cmp repo" beside it.

Not blocking: a reader who tries gets `Cannot find module`, immediately, rather than a wrong answer.
**Fires when:** a second-stack author follows it. *Logged 2026-09-14, review round 1 of
`startup-plant`.*

### KD-32 — the plant driver spells this stack's tree shape where the seam says it must not

`scripts/fleet-check.mjs` (`findEntryPoint`, `runLadderPlant`)

The slice's own division is that the profile owns the break and the core owns the question.
`findEntryPoint` walks from `path.join(appDir, "composeApp", "src")` — a literal cmp source root —
while its own doc comment says the instrument "finds it under the source roots", which the profile
declares as `layout`. `runLadderPlant` imports `qa/lib/profiles/cmp/plants.mjs` by a hardcoded pack
id, three lines below a `packId` the same run read off the receipt. Both are second spellings of
facts a profile already publishes.

Not blocking: both fail loud (no entry point found; the `.catch` reports "declares no startupPlant"),
never quietly, and there is one pack. **Fires when:** a second pack, or a template whose source root
moves. *Logged 2026-09-14, review round 1 of `startup-plant`.*

### KD-37 — two ids naming one directory are two repos in the fleet's report

`packages/harness/install/fleet.mjs` (`readFleetManifest`)

Duplicate `id`s are refused by name; duplicate *directories* are not. `[{id:"a",path:"../x"},
{id:"b",path:"../x"}]` — or the same tree reached once directly and once through a symlink or a
`..` — upgrades `../x` twice and reports "fleet: 2 of 2 repo(s) upgraded". The second pass is
idempotent, so nothing is corrupted and no unnamed tree is touched; the cost is a count that reads
as two repositories when the operator has one, in the summary line that is the whole output of an
unattended run. Not blocking: the manifest is the operator's own file, and every directory in the
report is one they named. **Fires when:** a fleet grows past the size its author can hold in their
head, which is the size at which this command starts being worth having. *Logged 2026-09-15, review
round 1 of `fleet-upgrade`.*

### KD-39 — `lastIndexOf("node_modules")` answers for a package root that is merely nested under one

`packages/harness/install/upgrade.mjs` (`runningHarness`)

The fleet's artifact now derives its own `source` by finding a `node_modules` segment in its package
root and asking the project above it. The segment is found, never verified to be the one that
INSTALLED this package, so a harness at `proj/node_modules/mono/packages/harness` reads
`proj/package-lock.json` and inherits whatever origin that project recorded for its own
`prooflane-harness` — a different artifact. Measured 2026-09-15 by copying the package to each
layout and importing `runningHarness` from the copy:

| layout | `source` | right? |
|---|---|---|
| dev checkout, no `node_modules` in the path | `"local"` | yes |
| `proj/node_modules/prooflane-harness` + lockfile | `"registry"` | yes |
| `proj/node_modules/foo/node_modules/prooflane-harness` | `null` | yes — `indexOf` would have said `"registry"` |
| pnpm: `node_modules/.pnpm/prooflane-harness@X/node_modules/prooflane-harness` | `null` | yes, honestly unrecorded |
| npx cache: `_npx/<hash>/node_modules/prooflane-harness` | `"registry"` | yes |
| `proj/node_modules/mono/packages/harness` | `"registry"` | **no — borrowed** |

So `lastIndexOf` is the right call for both cases it was chosen for, and the only wrong answer needs
the running harness's package root to sit inside some *other* installed package whose project
lockfile also names `prooflane-harness`. No installer produces that. Not blocking: unreachable in
every real layout, and `verify.mjs` states the field "is reported, never consulted: no verdict, gate
or level reads this field". The tightening, if it is ever wanted, is one condition — require the
segment after `node_modules` to be the package itself (`prooflane-harness`, or `@scope` then the
name) rather than any ancestor. **Fires when:** someone vendors this repo inside a dependency, or
a future installer nests package roots differently. *Logged 2026-09-15, review round 2
(re-record) of `fleet-upgrade`.*

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

### KD-43 — the guard that says the suite is complete is collected by the suite

`test/a-test-file-outside-the-named-roots-is-never-run.test.mjs`, `package.json` (`scripts.test`)

The guard is matched by one of the patterns it audits, so the declaration that would defeat it —
one that stops collecting the guard — is the one it cannot refuse. Measured in round 1: patterns
narrowed to match nothing ran `npm test` to zero tests, exit 0, with the guard not collected and
therefore not consulted.

**It stands, and this entry is why, so the next cold reader does not re-raise it.** Every check
that lives in the suite has this fixed point; moving it outside means something other than
`scripts.test` deciding what the suite is, which is a second spelling of the fact the round just
finished collapsing into one — a worse defect than the one it closes. The control that actually
holds is not a test: `package.json` is a trigger path for both the review and device tiers, so an
edit to the declaration cannot reach main without a review round that reads it.

**Fires when:** someone edits `scripts.test` to exclude `test/**` and no reviewer reads the diff.
*Logged 2026-09-15, review round 2 of `test-roots-named`, raised in round 1 and kept deliberately.*

## Closed

*An entry moves here when the thing is fixed or the decision is taken, with the commit that did
it.*

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
