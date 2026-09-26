# Known defects — closed

> Moved out of [`KNOWN-DEFECTS.md`](KNOWN-DEFECTS.md) on 2026-09-17, so the log a reviewer opens every
> round holds only what is still open. **The rule for what blocks and what is logged is that file's
> header; nothing here restates it.** Entries keep their ids and their words — code and tests cite
> them by id (`KD-7`, `KD-41`), and a grep for the id lands here.


*An entry moves here when the thing is fixed or the decision is taken, with the commit that did
it.*

### KD-3 — `executionHint` reads menu paths without the prefix filter its sibling applies — **RETIRED 2026-09-26**

`packages/harness/install/init.mjs` (`executionHint`) vs `packages/harness/install/interview.mjs`

`executionHint` iterates all of `MENU_FIELDS` and resolves each as `` `ladder.${field}` ``,
while `interview.mjs` filters to the `ladder.` prefix first and carries a comment explaining
why. No defect today: `CONTRACT` has one declaration, so every menu field is a ladder field.
The day a second declaration offers a menu, the two readers disagree and the invitation loop
breaks silently rather than loudly.

**Fires when:** a second CONTRACT declaration gains a field with `options`.
*Logged 2026-09-11, raised in review round 3.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: cannot fire — one CONTRACT declaration. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-6 — `device` is not among the agnostic lint's typed runtime nouns — **RETIRED 2026-09-26**

`test/agnostic-lint.test.mjs`

`emulator`, `simulator`, `adb`, `avd`, `CMP_DEVICE` are banned from `packages/harness/src`;
`device` is not, and its absence is a measurement rather than an oversight — adding it fails
ten core modules today: console-shell, console-standing, console-tabs, preview-service,
framework-check, affected-tests, evidence-badge, evidence-html, flight-recorder, verify.

**Fires when:** someone sweeps those ten. The exception list is asserted to only ever shrink.
*Logged 2026-09-11, measured earlier the same day.*

Since 2026-09-24 the runtime tier PRINTS as `L2 run` (proof-plan, its hook, change-price); its internal key is still `device` — `TIERS.device`, a plan's `declared.device`, change-price's `what: "device"` — because renaming data orphans every plan and record already on disk.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: adding it fails ten core modules today. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-8 — the dangling-citation lint covers `ADR-NNNN`, and the instance that provoked it was a `§` — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: nothing dangles; a checker risks false positives. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-20 — the vendored lane's two strict parsers refuse `--` as well — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: not npx-reachable. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-21 — `KNOWN_FLAGS` is a hand-written second spelling of "what this CLI reads", and the cost of forgetting it inverted — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: zero gaps measured, both directions. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-24 — `--yes` is refused by one door of `harness init` and accepted-and-ignored by the other — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the flag is inert; the rest of the line still does what was asked. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-28 — the rule's own KD-7 measurement cites a count this log attaches to another defect — **RETIRED 2026-09-26**

`docs/KNOWN-DEFECTS.md` (the header's pre-existing paragraph)

The paragraph says `prooflane init --new-profile ../app` "wrote fifty-two files into the wrong
repository and exited 0". KD-7 measured `qa/` landing in `cwdtest2` with exit 0 and no count;
the only 52 in this file belongs to a different finding — the `^C` decision, "a person who
pressed stop and found 52 files had been ignored". The argument does not rest on the number:
wrong repository, exit 0, logged because it predated the slice is the whole of it.

**Fires when:** the next reader checks the measurement and finds the other defect.
*Logged 2026-09-14, review round 1 of `review-gate-rule`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the argument does not rest on the number. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-25 — an interrupt that printed nothing at all would pass the suite — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: wording deliberately not pinned. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-30 — the plant's "no receipt from the second run" guard reads the first run's receipt — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: unreachable; the stale receipt reads as the overclaim. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-32 — the plant driver spells this stack's tree shape where the seam says it must not — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: both fail loud, and there is one pack. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-37 — two ids naming one directory are two repos in the fleet's report — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the second pass is idempotent; both were named. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-39 — `lastIndexOf("node_modules")` answers for a package root that is merely nested under one — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: unreachable in every layout npm/pnpm/npx produce. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-43 — the guard that says the suite is complete is collected by the suite — **RETIRED 2026-09-26**

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

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no fix that keeps one decider; the declaration is a reviewed trigger path. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-44 — the matcher still reports coverage the runner does not give, using the declared pattern — **RETIRED 2026-09-26**

`test/a-test-file-outside-the-named-roots-is-never-run.test.mjs` (`globMatches`)

KD-42 refused four constructs the translation does not implement. The unsafe direction survives in
the two it does: `*` becomes `[^/]*` and `**/` becomes `(?:.*/)?`, and both match a leading dot,
where `node --test` matches neither. Measured against the runner with THIS repo's declared pattern,
`test/**/*.test.mjs`, nothing exotic and no refusal triggered:

```
runner runs : test/a.test.mjs
guard covers: test/a.test.mjs, test/.hidden.test.mjs, test/.dotdir/a.test.mjs, test/sub/.hidden.test.mjs
GUARD SAYS COVERED, RUNNER NEVER RUNS: the three dotted ones
```

So a committed `test/.something.test.mjs`, or anything under a `test/.fixtures/`, is reported as
covered and never runs — "yes, that is tested" about a file the runner skips, which is the one
direction this guard exists to refuse. It is also the assumption KD-26 was built on, inverted: that
entry's whole argument was that Node skips dot-directories.

**Same round also measured, same class, harmless direction:** the refusal is a BLACKLIST, so the
extglob forms `+(a|b)`, `!(b)`, `@(a)`, `*(a)` — all honoured by the runner — pass it and are
translated as literals, as do `./test/*.test.mjs` and `test//*.test.mjs`. Every one of those makes
the guard match FEWER files than the runner, so they fail loud and mislead rather than lie. They are
listed because they are the evidence for the shape of the fix: enumerating the constructs known to
be missing cannot terminate, since the list is a fact about the runner's globber that nobody here
owns. An alphabet whitelist — refuse any pattern with a character outside the implemented set —
terminates, and the temp-dir replica recorded under KD-42 gets dotfiles right for free because the
runner answers.

**Not blocking:** no tracked test file is dotted, so it cannot fire today. **Fires when:** anyone
commits a test file, or a directory of them, whose name begins with a dot. *Logged 2026-09-15,
review round 2 (re-record) of `test-roots-named`, measured differentially against `node --test`.*


**THE THIRD HOLE OF THIS SHAPE IN ONE FUNCTION, and that is the finding.** `globMatches` has now
reported "covered" about a file the runner never runs three times: by prefix containment (KD-41), by
`?` reaching the RegExp as a quantifier (KD-42), and now by a leading dot — this one with **no
exotic construct at all**, using the declaration this repo actually ships. Each patch was correct
and each left another hole, which is the tell that the approach is wrong rather than the
implementation.

The round that found it named why, and it is worth keeping in these words: enumerating the
constructs a translation is missing **cannot terminate**, because the list is a fact about a globber
nobody in this repo owns. Two things do terminate — an alphabet whitelist (refuse any pattern
outside a known-safe character set, rather than listing what is known-bad), or replacing the
translation entirely: materialise the tracked paths as empty files in a temp dir and let
`node --test` itself answer. The second gets dotfiles right for free, because the runner is the
authority being asked.

**Deliberately not patched a fourth time.** No tracked test file is dotted, so nobody is wrongly
served, and the slice's actual defect — three spellings of the runner, and a whole-tree glob — is
fixed and proven. A fourth patch to the same function is the over-correction loop this log's header
was written about: five consecutive rounds where the fix became the next round's finding. **Whoever
touches this next should take one of the two terminating fixes rather than add a fifth case.**

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no tracked test file is dotted; the refusal list cannot reach this. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-46 — the iOS refusal names two causes its catch cannot see — **RETIRED 2026-09-26**

`template/composeApp/src/iosMain/kotlin/com/example/app/KoinHelper.kt`

The catch tells the reader to "check that FirebaseApp.configure() ran first" and that "no Firebase
client was used before initKoin()". Both of those fail inside the Firebase iOS SDK as an
Objective-C raise or a Swift `fatalError` — neither of which a Kotlin/Native `catch (cause:
Throwable)` frame can intercept; the process aborts before the catch exists. The failures it CAN
catch are Kotlin ones from the GitLive bindings, which are not the two it names.

**The second half is fixed; this is the first half, still open.** As logged, the catch also threw
`error(msg)`, which builds an `IllegalStateException` with **no cause** — the original stack
dropped, `cause.message` interpolated, and `Cause: null` in the crash for a great many bridged
throwables. `79eafd3` replaced both sites with `throw IllegalStateException(msg, cause)`. What
remains is the message itself: it still tells the reader to check `FirebaseApp.configure()` and
prior client use, and those are exactly the two conditions under which this catch cannot have run.
The honest shape is a message about what it CAN see — a Kotlin-level failure in the GitLive
binding, plus the cause it now carries — with the configure/ordering advice in the comment above
the function, where a human reads it before the crash rather than in a string that can only print
when neither happened. Still not blocking: the app stops in every one of these cases, which is what
the refusal is for. *Logged 2026-09-15 (review of `b549f3b`), re-placed 2026-09-15 after `79eafd3`
closed the cause-dropping half.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: half fixed in `79eafd3` (the cause is carried now); Obj-C raises abort before any Kotlin frame, and the app stops either way. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-48 — `Platform.isDebugBinary` is a build-type reading, not the Android flag's twin — **RETIRED 2026-09-26**

`template/composeApp/src/iosMain/kotlin/com/example/app/KoinHelper.kt`

The comment calls it "the Kotlin/Native equivalent of the Android flag". It is not equivalent in two
ways. It is not an opt-out — an adopter can set `USE_FIREBASE_EMULATORS=false` and debug against a
real staging project on Android, and has no iOS lever at all. And it reports the Kotlin/Native build
type, which the Kotlin Gradle plugin derives from Xcode's `$CONFIGURATION` **by name**: a
configuration called `Staging` or `QA` is not `Debug`, so it builds a release framework and the
emulators go quietly off in the build that wanted them. Cannot fire as shipped — `iosApp/project.yml`
declares no configuration beyond XcodeGen's `Debug`/`Release`. *Logged 2026-09-15, review of `b549f3b`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the shipped Xcode project has only `Debug`/`Release`, which map correctly. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-49 — a nested `node --test` cannot fail — **RETIRED 2026-09-26**

Node's test runner sets `NODE_TEST_CONTEXT` in every file it spawns. A `node --test` started from
inside one inherits it, reports through the parent protocol, and **exits 0 whatever its tests did**.
Measured on Node 24 against one deliberately failing file: exit 1 from a clean env, exit 0 with
`NODE_TEST_CONTEXT=child-v8` set. The first draft of
`test/the-emulator-scan-blesses-a-swallowed-failure.test.mjs` read that 0 and pronounced six planted
defects refused. Nothing else in the suite spawns a nested runner today, and that harness now scrubs
the env and reads TAP counts instead of the exit code — but the trap is invisible, the symptom is a
gate that is always green, and the next person to reach for `execFileSync(node, ["--test", …])`
inside a test will hit it. *Logged 2026-09-15, review of `b549f3b`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: nothing in the suite spawns one except the harness that measured it, which scrubs the env. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-51 — the emulator scan masks Kotlin with a masker written for `.mjs` — **RETIRED 2026-09-26**

`test/the-emulator-redirect-cannot-fail-quietly.test.mjs` → `test/helpers/js-source-scan.mjs`

`maskSource` handles `//`, `/* */` and `"…"`, which is what the scan reads — and Kotlin agrees with
JavaScript on all three. It does not agree on raw strings. Executed: insert the perfectly valid
`val hint = """try: firebase emulators:start" }"""` before the redirect and the masker leaves that
`}` live, so the brace matcher closes the function 253 characters in and the scan reads a stub.
Kotlin also has nested block comments (JavaScript has none) and backtick identifiers (JavaScript
reads a backtick as a template literal).

**It fails toward red, which is the survivable direction, and that is not luck** — the scan asserts
`body.includes("useEmulator")` before judging, so a truncated body is refused as "aimed at nothing"
rather than blessed as clean. The message then blames the wrong thing, which costs a reader minutes,
not a shipped defect. Neither Kotlin file contains a raw string, a nested comment or a backtick
identifier today. *Logged 2026-09-15, review of `b549f3b`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: it reds, not greens — the `useEmulator` tripwire catches the stub — and neither file has a raw string. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-52 — the floor of the emulator scan: what its two token assertions do not decide — **RETIRED 2026-09-26**

`test/the-emulator-redirect-cannot-fail-quietly.test.mjs`

**The one defect here is fixed.** `calls.some((at) => at !== declaration && …)` carried a clause
that can never be false — `declaration` indexes `fun`, every match indexes that plus four, measured
`2144` vs `2148` and `1620` vs `1624` — so the four-character lookbehind was doing the whole job
while a second spelling of the same intent sat inside a guard about second spellings. Removed in
`f474f17`. The rest of this entry is not a defect list; it is **the boundary of what a token-level
scan of Kotlin source can decide**, recorded once so the next round does not rediscover it as a
finding. Every item is measured, and none is a false GREEN a plausible edit would reach.

The call-site assertion:

- **Presence is not reachability.** Move the call into a `private fun unusedSetup()` that nothing
  invokes and the assertion passes — the refusal still never runs. The realistic form of this defect
  is deleting the call, which `79eafd3` now catches; relocating it into dead code is the tail. The
  cheap close, if it is ever worth it, is to require the call inside the entry point the comment
  already names (`onCreate` / `initKoin`), using the brace matcher the file already has.
- **A declaration the lookbehind misses** — `fun  configureFirebaseEmulators()` with two spaces is
  valid Kotlin and is not preceded by `fun `, so it counts as its own caller. It cannot ship a false
  green: `redirectBody` keys off the single-space spelling, so the sibling assertions go red first.
  Measured.
- **Two false REDs on correct code** — `run(::configureFirebaseEmulators)` and
  `configureFirebaseEmulators( )` are real calls the `\bname\(\)` regex does not match. Nobody
  writes the second; the first is idiomatic Kotlin but not plausible at this call site.

The rethrow assertion, now that `f474f17` applies it to EVERY catch rather than the first — it asks
for `\bthrow\b` somewhere in the catch body, and two shapes satisfy that without refusing anything.
Both measured GREEN against `f474f17`:

- `catch (cause: Throwable) { if (cause is X) throw cause }` — a conditional rethrow swallows
  everything the condition does not name.
- `catch (cause: Throwable) { val giveUp = { throw … } }` — a `throw` inside a lambda nobody
  invokes.

**Neither is where the multi-catch hole was, and that distinction is the whole reason this is logged
rather than fixed.** The multi-catch shape is the one `ARCH-08` and `template/CLAUDE.md` actively
teach, so an author following the house rules writes it; these two are shapes nobody writes — there
is no condition to branch on in a four-line redirect, and an uninvoked throwing lambda is not a
thing. Closing them needs flow analysis, which is a parser, which is a dependency this repo has
decided not to grow for a lint (`test/helpers/js-source-scan.mjs`, header). *Logged 2026-09-15
(review of `79eafd3`), re-placed 2026-09-15 after `f474f17` removed the inert clause and widened the
rethrow assertion.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the inert clause is gone (`f474f17`); the rest is the floor of a shape scan, and no shape reaches it. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-58 — the words of an act, quoted, are refused as the act — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` classifies a Bash command by what it invokes, and its header already
says a quote is not an invocation. On 2026-09-17 it refused a read-only `git grep -E "…|npm publish"` with
the publish gate's own message, because the words sat inside a double-quoted `-E` alternation. Then
it refused the command that LOGGED this entry — a heredoc writing a script whose text contained the
same two words — as a publish from a non-main branch. Worded around, both ran.

Not blocking: it can only REFUSE, never allow, and only an agent's tool call passes through the hook.
But a refusal that fires on a search makes the gate's real refusals easier to dismiss, and it fired
while the gate was refusing every release for a different reason (the hash defect fixed beside this
entry). *Logged 2026-09-17.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: refuses, never allows — and only the agent is refused. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-63 — the lane refusal reads the lane's marker with none of the guards its other readers apply — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`laneAt`, `describeLane`) vs `packages/harness/src/lib/plan.mjs`
(`markerInfo`) and `packages/harness/src/lib/lane-markers.mjs`

`laneAt` JSON-parses `qa/.lane-in-progress` and renders anything it cannot parse as "it wrote no
progress marker, so nothing says how long it has left". Three guards the file's other readers apply
are missing here:

- **The legacy `"<pid> <iso>"` form reads as absent.** `markerInfo` documents and accepts it
  ("older lanes"), and this repo writes it today — `packages/harness/src/verify.mjs:415` stamps it
  around the `--determinism` probe. Planted on 2026-09-17: a real legacy marker on disk produced
  "it wrote no progress marker". The gate's whole job is reading ANOTHER project's marker, whose
  vendored harness version it does not control, so the older form is the likely one there.
- **No staleness bound.** `LANE_MARKER_STALE_MS` (30 min) is what every other reader uses to tell a
  lane from a killed lane's leftover; `laneAt` has none.
- **No attribution.** The marker carries the `pid` that wrote it and the gate holds the pid it is
  describing, and the two are never compared — so the step and the ETA are narrated for a process
  that may not have written them.

Not blocking: the refusal still fires, still names the project, and still decides ours/not-ours
without touching the marker. What degrades is one clause — "it wrote no progress marker" where "a
marker I could not read" is what is true, or a step name from a run that has ended. Nobody is sent
into or out of a refusal by it.

**Fires when:** the foreign project runs an older vendored lane, or `verify.mjs --determinism`, or a
killed lane's marker is still on disk. *Logged 2026-09-17, raised in review round 1 of
`lane-refusal-names-project`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: one clause of the sentence degrades; the refusal, the project and ours/not-ours are unaffected. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-64 — a sibling worktree of this repository is called ANOTHER project's lane — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`describeLane`)

`ours` is prefix containment against `repoRoot`, which is the directory the hook file itself sits
in. This repository's normal way of working is worktrees (`.claude/worktrees/*`), so a lane running
in the main checkout — or in another worktree of the same repo, against the same emulator — is
outside `repoRoot` and is described as "ANOTHER project's lane, not yours to stop", with "Do not
kill it — it is not this slice's."

Not blocking: the path it prints is true, and the advice errs toward waiting, which is the safe
direction for a lane holding the one device. Making it right means asking git for the common git
dir from inside a hook that has a 10s budget, which is a call worth making deliberately rather than
in passing. *Logged 2026-09-17, raised in review round 1 of `lane-refusal-names-project`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: errs toward waiting, and the path it prints is true. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-65 — the lane's project can still be a token the gate never verified — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`laneOperand`, `laneProject`)

The reading is settled against the disk only when the operand has TWO readings. A single reading is
returned unverified, and the operand is any token ENDING in `/qa/verify.mjs` — so a flag carrying the
path is read as the path. Measured 2026-09-17, with the lane's cwd at `<cwd>`:

```
node --import=/p/qa/verify.mjs                    ->  <cwd>/--import=/p   (a directory that cannot exist)
node -r /decoy/qa/verify.mjs /proj/qa/verify.mjs  ->  /decoy              (the first occurrence wins)
```

Both belong to the class round 1 blocked on — a project the gate names without being able to see it —
and both are one line from gone: `holdsLane` already exists and already states the invariant (the
named project holds the lane's own `qa/verify.mjs`), and it is applied to the ambiguous branch only.

Not blocking: nothing in this repo or the harness produces either argv. The lane is spawned as
`node <abs>/qa/verify.mjs` (`packages/harness/src/framework-check.mjs:269`) or `node qa/verify.mjs`
(`refusal-demo.mjs`), and every shape that IS produced was re-verified against a real project
directory whose path contains a space — bare, quoted, relative-after-an-absolute-node — all exact. A
scanner edge case with no producer.

**Fires when:** a node process's argv carries `…/qa/verify.mjs` inside a `--flag=` value, or twice.
*Logged 2026-09-17, raised in review round 2 of `lane-refusal-names-project`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no producer: every argv this repo and the harness spawn was verified correct. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-66 — the lane probe's bound covers its subprocesses, not its filesystem — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`shell`, `holdsLane`)

`LANE_PROBE_CALL_MS` / `LANE_PROBE_TOTAL_MS` bound every `execSync` the probe runs, which was the
whole of the hazard when they were written. The same change then added `fs.existsSync` on a directory
derived from ANOTHER process's argv, and a synchronous stat takes no timeout: on a wedged or
automounting path it blocks in the kernel past the budget, and a PreToolUse decision that arrives
late is a permitted command — the same shape as the defect the bound answers.

Unmeasured, and deliberately: `/net/<nonexistent>` and a missing `/Volumes/<x>` both answered in
under 1ms here, and there is no portable way to plant a wedged mount in the suite — which is why the
landed budget test (`the-proof-gate-can-outlive-the-timeout-its-own-wiring-declares`) plants a slow
`lsof` and cannot plant a slow stat. Narrow besides: the directories stat'd are ones a LIVE process's
argv names, so the mount under them is one something is currently running from.

Second, smaller: `killSignal: "SIGKILL"` kills the `/bin/sh` that `execSync` spawned, not the probe
under it. Observed after a trip — a `sleep 12` reparented to pid 1, outliving the gate that gave up
on it. A stuck `lsof` would be stuck anyway and the gate no longer waits for it; it leaves one behind
per trip. *Logged 2026-09-17, raised in review round 2 of `lane-refusal-names-project`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: unmeasurable here — no portable way to plant a wedged mount. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-69 — three fields of the attestation's documented shape are read by nothing — **RETIRED 2026-09-26**

`scripts/stage2-gate.mjs:57-69` (the documented shape) · `:571-591` (`attestationProblems`)

The header comment publishes the attestation's shape and a human hand-writes the file against it,
but the validator checks only `claim`, `date`, `attestedBy.name`, `profile.id`,
`authoredBy.organisation`, `authoredBy.contact` and `artifact.location`. Measured by blanking each
of the rest on a fully-filled document: `schema: "someone-elses/9"`, `schema` absent,
`artifact.kind: "banana"`, `artifact.kind` absent and `receipt` absent all return `[]`.

`prooflane-attestation/1` is also the only schema id in the tree that exists nowhere but a comment:
`prooflane-evidence/1` has `packages/harness/evidence/schema.json` with an enum, and
`prooflane-harness-source/1` has an exported `SOURCE_SCHEMA` plus a test.

Not blocking, and a refusal would argue with a signed decision: `evidence/schema.json` records
ADR-0007's position that `schema` is "ROUTING METADATA, not part of the claim … Nothing routes on
this field — readers dispatch on field SHAPE". The two that could mislead cannot: a wrong
`artifact.kind` contradicts a `location` a reader can see, and a missing `receipt` is criterion B's
first refusal, by name. Related, one line: `docs/attestations/README.md` says "Three more fields are
in the shape and checked by nothing" — true of the human-owned fields, and `schema` and
`artifact.kind` make it five.

**Fires when:** someone hand-writes the attestation from the documented shape and mistypes a field
the gate does not read.
*Logged 2026-09-18, raised in review of `everything-but-the-signature-for-the-first-adoption`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: ADR-0007: nothing routes on `schema`; the other two fail loud in criterion B. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-70 — a `file:line` citation is a claim nothing in this repository checks — **RETIRED 2026-09-26**

`test/an-attestation-is-dated-by-a-clock-that-is-not-a-calendar.test.mjs:4` ·
`test/a-recorded-probe-reports-a-gate-outcome-its-own-inputs-cannot-produce.test.mjs:20` ·
`docs/KNOWN-DEFECTS.md` KD-69's own header

Measured on this tree. The `isCalendarDay` / `dayBegunSomewhere` fix inserted 48 lines at
`scripts/stage2-gate.mjs:565`, and every citation into that file below the insertion point moved
without its citer moving. Three now name the wrong lines in the present tense:

- two test headers say *"scripts/stage2-gate.mjs:580-581 is the whole of it"* and *"criterion A
  refuses any `date` that is not four-two-two (scripts/stage2-gate.mjs:580)"*. `:580-581` is now
  `isCalendarDay`'s `return` and its closing brace.
- KD-69, three entries above, cites `:571-591` for `attestationProblems`, which is at `:615-637`.

The citations above the insertion point were checked and are correct — `:13-17` and `:226`, quoted
in `docs/attestations/README.md`, still say what it quotes, and `:3-6` still quotes §9.

**Why this is logged and not fixed.** The instance is three comments; the class is 154 distinct
`file.(mjs|md|json):NNN` citations across `test/`, `docs/`, `scripts/` and `packages/harness/src/`,
and a checker for them is a slice, not an edit — it needs a rule for what a citation asserts (that
the lines exist? that they contain a quoted fragment?) before it can refuse anything, and
`docs/KNOWN-DEFECTS.md` KD-8 already records the same shape of decision for `ADR-NNNN` citations
and the false-positive risk in checking them. Fixing three and leaving 151 unguarded buys one round
of tidiness and no invariant.

**Nobody is wrongly served.** Every one of the 154 is in a source comment, a log entry or a
proposal — none is in a refusal message, a receipt, a CLI surface or anything a `prooflane` adopter
reads. A reader who follows a stale one lands a few lines off in a file whose symbol names are
right beside them; the surrounding prose names the function, which `grep` finds.

**Fires when:** anything is inserted above a cited line, which is most commits.
*Logged 2026-09-18, raised in the final review round of `everything-but-the-signature-for-the-first-adoption`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: 154 in the tree; three went stale in one slice; all of them are in comments and logs, none in a surface an adopter reads. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-71 — `date 0050-06-15 names no calendar day`, and it does — **RETIRED 2026-09-26**

`scripts/stage2-gate.mjs` → `isCalendarDay`

Measured on this tree, against the function as it stands:

```
date 0050-06-15  → ["date 0050-06-15 names no calendar day"]
date 0099-12-31  → ["date 0099-12-31 names no calendar day"]
date 0100-01-01  → []
date 1750-03-04  → []
```

`new Date(Date.UTC(50, 5, 15)).getUTCFullYear()` is **1950**: `Date.UTC` maps years 0–99 to
1900+year, by specification and forever. So the round-trip `isCalendarDay` uses to separate a day
from four-two-two digits reads back a year the caller never asked about, and every date in the
first century fails a check it should pass. Years ≥ 100 are unaffected — the mapping does not
apply — which is why `1750-03-04` is accepted. The independent oracle is date-only ISO parsing,
which has no such mapping: `new Date("0050-06-15T00:00:00Z").toISOString()` round-trips exactly,
while `new Date("2026-02-30T00:00:00Z")` rolls forward to March, so it still refuses a non-day.

This is the same class as the defect the fix that introduced it answered — a refusal stating
something false about the value it refused — one message over, which is why it is recorded here
rather than left to be re-found.

**Nobody is wrongly served.** The only reachable value is a `date` a human types into
`docs/attestations/stage2-external-profile.json`, and reaching this needs a four-digit year under
100, i.e. two or three deliberate leading zeros — no plausible typo of `2026` produces one
(dropping a digit leaves three characters, which the shape check refuses with the right reason).
The outcome is correct in every case that reaches it: a date two millennia off must be refused.
Only the sentence is wrong, and the year is 2000 years from what the signer meant, so they are not
sent hunting for a fault they cannot see — it is in front of them.
`an-attestation-is-dated-by-a-clock-that-is-not-a-calendar.test.mjs` keeps the control that a
shape-conforming non-day is still refused, so the check cannot be deleted to make this go away.

**Fires when:** an attestation's `date` names a year between 0001 and 0099.
*Logged 2026-09-18, in the round that reviewed the `needsText` / `isCalendarDay` fix.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the refusal is right, its reason is false, and no signer types a three-leading-zero year. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-73 — a bare "<n> steps" claim is not gated, and cannot be without deleting honest prose — **RETIRED 2026-09-26**

`test/doc-counts.test.mjs` (`laneSizeClaims`)

The count gate now refuses a lane size bound to a profile — `` | `local` | 17 | ``, `17 steps at
`local``, `20 at `release`` — and eight such claims were wrong when it was wired. A bare `<n>
steps` is still invisible, and the measurement is why: across the seventeen surfaces the gate
reads, a bare-noun scanner refuses four strings and **two of them are honest prose** — README's
"three steps, each priced in what you have at that moment" and `packages/harness/README.md`'s
"Two steps ship in it". A 50% false-positive rate on a gate that blocks a merge is the shape this
repo deletes scanners for (KD-8's reasoning), and the alternative — an exception list of allowed
sentences — is a hand-maintained list inside a derivation, which is the defect class KD-21 already
logs.

Not blocking: the ambiguity is in the NOUN, not in the claim. Every drift actually measured named
its profile, and that form is gated. A stale bare "<n> steps" would have to be written in a shape
no surface currently uses.

**Fires when:** someone writes a lane size in prose without naming the profile.
*Logged 2026-09-18, measured the same day while wiring the profile-bound reader.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured 50% false positives; the profile-bound form catches every drift there was. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-74 — `nightly` is a profile the lane offers and the deriver does not enumerate — **RETIRED 2026-09-26**

`scripts/ground-truth.mjs` (`verifyProfiles`) vs `docs/USAGE.md` §3

`groundTruth().verifyProfiles` derives five profiles — `smoke`, `scaffold`, `local`, `ci`,
`release`. The lane offers a sixth: `nightly` is documented in §3's table, named as a receipt
`stage`, and refused as done-evidence by `qa/receipt-check.mjs` under that name. Because the
deriver does not know it, no gate can check a number written against it — and §3's `nightly` row
held `17` while `ci`, which it is defined as ("`ci` with the determinism probe **forced on**"),
had moved to 18.

Nobody is wrongly served today, because the remedy applied was to state no number rather than a
hand-counted one: the row now reads `` = `ci` ``, which is what its own description says and
cannot drift. The defect is the deriver's blind spot, not the doc's.

**Worth deciding:** whether `nightly` is a profile `verifyProfiles` should enumerate, or a stage
that reuses `ci`'s step set — the two answers want different fixes, and the second may mean the
row is already as true as it can be.
*Logged 2026-09-18, found while gating the profile-bound lane size.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the row states no number now, so nothing false ships. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-75 — the profile-bound lane reader cannot tell a whole lane from a slice of it — **RETIRED 2026-09-26**

`test/doc-counts.test.mjs` (`laneSizeClaims`)

The reader is bound to a profile name, which is what makes reading the word `steps` safe at all
(KD-73). It is not bound to the claim being about the WHOLE profile, and it treats any number in a
table's second column as a step count. Three shapes, each run through the real function:

| planted sentence | verdict |
|---|---|
| ``Of the 17 steps, 4 steps at `local` need a device`` | REFUSED — reads `4 steps at \`local\`` against 17 |
| ``It takes about 3 at `local` minutes`` | REFUSED — the `<n> at \`profile\`` form has no unit |
| ``\| \`local\` \| 12 \| median wall-clock minutes \|`` | REFUSED — any second column is read as Steps |

Not blocking, and not the same call as KD-73: none of these shapes is written anywhere in the tree
(measured tree-wide — twelve matches, every one a genuine lane size), and the second column of the
only profile table that exists is headed **Steps**. The failure direction is also the safe one: it
reds, never greens, and the refusal quotes the string it read, so a false positive costs a
contributor one rephrase rather than a wrong number shipped.

**Fires when:** someone documents a subset of a profile's steps in prose, or gives a profile table a
second numeric column that is not a step count.
*Logged 2026-09-18, raised in review of `slice-22-eleven-skills-twelve`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured: three shapes, none of them written anywhere in the tree today. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-76 — the same reader passes a wrong lane size written as a word, or profile-first — **RETIRED 2026-09-26**

`test/doc-counts.test.mjs` (`laneSizeClaims`)

KD-75 is the over-refusal direction. This is the other one, and it is the direction that GREENS.
The reader takes `\d+` only and one word order — `<n> [steps] at \`<profile>\`` or a table row —
so three natural spellings of a *wrong*, profile-bound lane size are read as nothing. Each run
through the real function, against the real deriver:

| planted sentence | verdict |
|---|---|
| ``sixteen steps at `local` and nineteen at `release` `` | PASSES — the number is a word |
| ``The `local` profile runs 16 steps`` | PASSES — the profile is named first |
| ``the lane at `local` is 16 steps long`` | PASSES — a unit sits between the number and the profile |

This is NOT KD-73, which is about a bare `<n> steps` that names no profile and so cannot be
disambiguated. All three above name their profile, which is the exact condition the reader's own
comment gives for why reading the word `steps` is safe — so they fall inside the stated rule and
outside the code. The word-number case is not hypothetical style either: both gated plugin
manifests write their own count as `Twelve skills`, and `claims()` reads spelled-out numbers
precisely because of that. The two readers in this one file disagree about what a number is.

Not blocking: no surface writes any of these shapes today (measured tree-wide — every lane size in
the tree is a digit in the gated form), and the eight drifts this slice found were all caught.

**Fires when:** someone writes a lane size in words, or puts the profile before the number.
*Logged 2026-09-18, measured in review of `slice-22-eleven-skills-twelve`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured: three shapes, none written anywhere in the tree today. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-77 — one of the four derived counts is gated and calibrated by nothing — **RETIRED 2026-09-26**

`test/doc-counts.test.mjs` (`GATED_COUNTS` `CLI commands`, and the calibration below it)

The calibration plants a wrong number "in every surface the gate lists and every count the gate
covers", skipping a surface that states no such count (`if (!real) continue`). Measured across all
seventeen surfaces: **no surface states a CLI-command count at all**, so that spec is planted
nowhere and its reader is never exercised — `planted` comes back with entries for `skills`, `MCP
tools` and `verify lane gates` only. The CHANGELOG entry for this slice says the plant "requires
each one back refused ... every count it derives"; it is three of four. The front-door guard below
cannot see it either: it checks that each of `README.md` and the two manifests was planted at
least once, not that each derived COUNT was.

Not blocking: the reader is idle rather than wrong. `GT.cliCommands.count` is still derived, and a
future surface that writes "8 commands" is still refused — nothing false can ship through it
today, because nothing goes through it.

**Fires when:** `claims()` breaks for a noun no surface currently uses, and the calibration reports
green over it.
*Logged 2026-09-18, measured in review of `slice-22-eleven-skills-twelve`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the reader is idle, not wrong; a future "<n> commands" is still refused. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-80 — the ordering precondition guards the device RUN, not the merge that moves the tree — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`decide`, kind `device` vs kind `merge`)

The rule as written — "a device run proves a tree the merge has to keep" — is checked before the
run and nowhere else. Discharge the tier on a branch that contains `origin/main`, let trunk move,
then `gh pr merge --rebase`: GitHub rebases, the landed tree is not the tree that was proved, and
the merge gate never asked. `deviceTreeHash` is computed over the local working tree, so it does
not move when trunk does, and the tier does not read REOPENED.

Narrow, and the narrowing is why it is here rather than fixed: the 2026-09-16 sequence the slice was
bought to stop involves a rebase done BY HAND, which moves trigger bytes, reopens the tier and is
refused at the merge gate already. Only the server-side rebase escapes, and only when trunk moved
between the run and the merge. Fixing it means asking the same question at the merge gate, which is
a second slice's worth of decisions (the merge gate's budget, and whether a merge should ever be
refused for being behind). *Logged 2026-09-18, review round 1 of `ordering-precondition-before-a-device-run`.*

*2026-09-22: `deviceTreeHash` no longer exists — the device tier is scheduled by the bytes of the
STAMPED APP (`scripts/stamped-output.mjs`) — and the sentence above holds word for word with that
name in its place.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the hand-rebase case reopens the tier and is refused at the merge gate already. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-81 — a branch git could not name is treated as trunk, and the check passes silently — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`baseContext`, first line) with `isTrunk` from `scripts/proof-plan.mjs`

`currentBranch()` returns `null` when git cannot say, `""` on a detached HEAD, and `isTrunk` is
`!branch || branch === "main"` — so both arrive as `true` and `baseContext` returns `null`, which
`orderedRun` renders as the plain allow with no note at all. That is the one shape the check's own
header forbids: "a gate that cannot see must not pass silently." The four-outcome contract has a
place for it (`{ contained: null, reason }`, the allow that says so); `null` is "does not apply",
and "git could not name the branch" is not that.

No producer measured: the git failure that makes `currentBranch()` return `null` also makes
`changedPaths()` return `[]`, and an empty diff is reported `state: "none", trunk: true`, which never
reaches the ordering check. Sharing `isTrunk` with `proof-plan` is the right trade even so — one
definition of trunk beats two — so the fix belongs at the call site in `main()`, not in `isTrunk`.
*Logged 2026-09-18, review round 1 of `ordering-precondition-before-a-device-run`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no producer: the same git failure makes `obligation()` report `none`, which never reaches the check. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-82 — the ordering verdict is ancestry; every other obligation in this repo is trigger-path bytes — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`baseContext` → `merge-base --is-ancestor`, and the `why` string in `orderedRun`)

Two definitions of "the tree moved" now coexist: commit-graph ancestry here, and trigger-path bytes
in `tierState`/`deriveTierNeed`, where the tier reopens only when `deviceTreeHash` — a hash of the
DEVICE TRIGGER PATHS — moves. This precondition is the stricter of the two, so it can still refuse a
run that would have been a valid proof: a trunk that moved only under `docs/` — the commonest way
main moves in this repo — leaves every trigger byte identical after the rebase, so the tier would not
reopen and the refused run describes the tree that lands after all. The refusal's own wording was
made conditional in the same slice (it now says the tier reopens "for any of them that is a device
trigger path"), so what remains is the verdict, not a sentence asserting a reopen it did not check.

Nobody is stranded: the remedy the refusal prints is the rebase the merge needs anyway, so the cost
of being wrong is one rebase rather than one emulator run, and the conservative direction is the safe
one for a 3.5-minute tier. Deciding it on bytes would mean diffing `HEAD...origin/main` against
`DEVICE_TIER_IRRELEVANT` inside a 10-second hook, which is a product decision about how clever this
precondition should be. *Logged 2026-09-18, review round 1 of `ordering-precondition-before-a-device-run`.*

*2026-09-22: "trigger-path bytes" no longer exists — the tier is now the digest of the STAMPED APP
(`scripts/stamped-output.mjs`) — which leaves this finding intact and its worked example stronger,
since a trunk that moved only under `docs/` demonstrably leaves that app identical.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the refusal's remedy is the rebase you owe the merge anyway; it costs a rebase, never a run. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-83 — the "unchanged wording" claim is checked against the code that would change it — **RETIRED 2026-09-26**

`test/a-device-run-proves-a-tree-the-merge-will-not-keep.test.mjs` (`TODAYS_OWED_ALLOW`)

`const TODAYS_OWED_ALLOW = decide("device", owed, TIERS).reason` is named "what this gate said
before an ordering check existed" and compared against later `decide` calls. Both sides come out of
the same function: reword the `owed` string in `orderedRun` and both move together, green. So the
constraint the comment states — the ordinary owed-allow is byte-identical to the pre-slice one — is
pinned by no bytes anywhere; `test/proof-gate-hook.test.mjs:74` pins only `/LAST gate/`.

What the assertions DO measure is real and is the more valuable half: that the contained-and-answered
path, the no-`ctx` path and the `base: null` path all produce the SAME string, i.e. that the
precondition adds nothing to the ordinary case. Only the historical half is unpinned, and pinning it
means a literal copy of a long sentence in a test — a second spelling with its own drift.
*Logged 2026-09-18, review round 1 of `ordering-precondition-before-a-device-run`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the cross-path comparison beside it is real; only the historical claim is unpinned. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-84 — `declaredBudgetMs` has two implementations, and the declared timeout has three spellings — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`declaredBudgetMs`) and `test/the-proof-gate-can-outlive-the-timeout-its-own-wiring-declares.test.mjs:36`

The slice exported `declaredBudgetMs` so a test could read the hook's budget off the wiring — and
left the older hand-rolled copy in the timeout test, which now reads the same `.claude/settings.json`
through its own five lines. They differ where it matters least and drift where it matters most: the
copy asserts the PreToolUse entry exists, the export falls back to Claude Code's 60s default; and
the export's unreadable-settings branch hard-codes `10000`, a third spelling of the `"timeout": 10`
in `.claude/settings.json` that nothing compares against it.

They agree today, both directions, and every disagreement errs toward a SMALLER budget, which means
asking origin less and allowing-with-a-note more — never a late refusal. The import that would
collapse them is one line in the timeout test. *Logged 2026-09-18, review round 1 of `ordering-precondition-before-a-device-run`.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: all three agree today, and the unreadable-settings fallback errs small. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-86 — the anchoring detector reads four script extensions, and a hook could invoke something else — **RETIRED 2026-09-26**

`src/lib/hooks.mjs` (`SCRIPT_PATH`)

`unanchoredPaths` recognises a path only if it ends `.mjs`, `.cjs`, `.js` or `.sh`. A hook written
`python qa/report.py`, or one invoking a bare executable `qa/tool`, would read clean while being
exactly as unanchored. The bare-executable case is the harder one and is deliberately out: a
single-segment word is not distinguishable from a command name, and a detector that guessed would
flag `grep`, `node` and `printf`.

**Nobody is wrongly served, which is why this is logged rather than fixed.** Measured against the
template as it ships: every command it carries is `node` or `test -f` against a `.mjs` path, so the
allow-list refuses nothing that exists. The gate is narrower than its name suggests, not wrong —
and the shape it would miss is one nothing in this repo writes. Found while writing the detector,
and left narrow on purpose: widening it costs false positives on narration, which is the failure
mode that would make the gate un-adoptable.

**AMENDED 2026-09-26 — the other-language half is fixed; the extensionless half stays.** `SCRIPT_PATH`
now reads `.py .rb .pl .ts .mts .cts .bash .zsh .kts` beside node's and sh's, so an adopter's
`python3 qa/report.py` hook is reported unanchored and its `${CLAUDE_PROJECT_DIR:-.}/…` form reads
clean (`test/a-hook-in-another-script-language-reads-as-unanchored.test.mjs`). An extensionless
`qa/tool` is still not judged, for the reason above: without an extension a path is a guess.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a multi-segment word with no extension is not distinguishable from `origin/main` or `dev/null` without guessing; nothing the template ships is extensionless. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-87 — "inside single quotes" is not "not executed", and an inert anchor still counts as anchoring — **RETIRED 2026-09-26**

`src/lib/hooks.mjs` (`maskQuotedNarration`, `unanchoredPaths`)

`unanchoredPaths` masks single-quoted spans so that narration naming `qa/…` is not mistaken for an
invocation. Two shapes escape it, both **measured by execution** (root vs. one directory down) in
`test/hook-anchoring-differential.test.mjs` rather than argued:

1. **A single-quoted span the shell hands to another interpreter executes.** `sh -c 'node
   qa/walk-status.mjs'` and `eval 'node qa/walk-status.mjs'` both run the script at the project root
   and both fail one directory down, while the detector returns `[]`. This is the *under-report*
   direction — the one the module's own comment says it is conservative against.
2. **The anchor's prefix is read from the UNMASKED command.** `node
   '${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs'` reads as anchored because the literal text is
   there, but the shell never expands a single-quoted variable, so the command reaches nothing from
   anywhere. Measured: the static gate on the STAMPED settings (`harness-surfaces`) and the gate on
   what `doctor --fix` writes (`doctor-walk-wiring`) both pass green against a template mutated this
   way; only the behavioural tests in `hook-anchoring.test.mjs` catch it, and those name three
   commands by literal index.

**Nobody is wrongly served, which is why this is logged rather than fixed.** Neither shape is
written anywhere in this repo — `template/.claude/settings.json` and `.claude/settings.json` between
them carry ten commands, every anchor double-quoted and no subshell payload — and the detector is a
test-only gate no adopter runs. The bound is now a program rather than this paragraph: the
differential test executes **every** command in both files and refuses any the detector calls
anchored that loses a script from a subdirectory, which is also the coverage the three hand-indexed
behavioural tests do not extend to a fourth command.

**One correction to the reason, not the verdict.** `src/lib/hooks.mjs` and the 0.26.3 CHANGELOG
entry both justify the parse as "exact here rather than approximate, because `sessionStartCommand`
already REFUSES copy containing an apostrophe." That guarantee does not cover the input: the
template's SessionStart and PreToolUse commands are hand-written JSON that `sessionStartCommand`
never builds, and nothing refuses an apostrophe in them. The conclusion survives for a better
reason — `sh` pairs single quotes by exactly the rule the masker does, so an odd apostrophe is a
shell **syntax error** rather than a hidden invocation (measured; the shape does not run at the
project root either). KD-71's shape: the verdict is right and its stated reason is not.

*Logged 2026-09-18, review round 1 of the hook-anchoring slice.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: both measured by execution and bounded by `test/hook-anchoring-differential.test.mjs`; no command in either shipped settings file is in the blind spot, and the gate reds the day one is. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-88 — the detector enumerates command surfaces by hand, and `settings.json` has more than two — **RETIRED 2026-09-26**

`src/lib/hooks.mjs` (`anchorViolations`) · `test/hook-anchoring-differential.test.mjs` (`commandSurfaces`)

The narrow form of the question is answered, and answered well. Measured against the real template:
a FOURTH hook event added tomorrow (`hooks.PostToolUse[0].hooks[0]`) and a second hook inside an
existing group (`hooks.Stop[0].hooks[1]`) are both reported by surface name, because the walk is
`Object.entries(settings.hooks)` and not a list of the four events the template happens to ship. An
unanchored command in a new hook does not silently pass.

What is invisible is a command-bearing KEY that is neither `hooks` nor `statusLine`. Claude Code's
`settings.json` runs `apiKeyHelper` through `/bin/sh`, and `awsAuthRefresh` / `awsCredentialExport`
the same way. Measured: plant all three into the template with cwd-relative paths
(`"apiKeyHelper": "qa/key-helper.sh"`) and `anchorViolations` returns `[]`. The same two-item list is
spelled a second time in the differential harness's `commandSurfaces()`, so the blind spot is
identical in the instrument built to check the detector — which is the shape that makes it worth a
line here rather than a shrug.

**Nobody is wrongly served, which is why this is logged rather than fixed.** Neither
`template/.claude/settings.json` nor `.claude/settings.json` carries any of those keys, and none of
them is a surface this harness has a reason to write. It is also the third time this module has paid
for the same enumeration: its own header records that the minimal-mode rule "just has to be applied
to every surface that carries a command, not only to `hooks`" after a lane-referencing `statusLine`
shipped into a minimal scaffold. The fix, when it is taken, is to stop enumerating — walk the
settings object for string values and judge every one — which costs false positives on
`permissions` entries and is therefore a decision, not a line.

*Logged 2026-09-18, review round 1 of the hook-anchoring slice.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured: a fourth hook EVENT and a second hook in an existing group are both caught BY NAME; only a non-`hooks`, non-`statusLine` key is invisible, and neither settings file has one. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-91 — the differential's vacuity floor names a command that can no longer reach it — **RETIRED 2026-09-26**

`test/hook-anchoring-differential.test.mjs` (the `invoking >= 3` guard)

The floor exists so the differential cannot go quietly vacuous: *"expected at least the Stop,
UserPromptSubmit and statusLine commands to actually run a script"*. Its antecedent is
`unanchoredPaths(command).length === 0`, so the statusLine — reverted to its relative form in the
same commit, and therefore a violation — is `continue`d before it can be counted. The three the
message names are now two. Measured on this tree: five surfaces are counted (the template's Stop
and UserPromptSubmit, and this repo's own three `scripts/hooks/proof-gate.mjs` entries), so the
floor holds with margin and nothing is vacuous today.

**Nobody is wrongly served, which is why this is logged.** The guard still guards; only its
sentence is stale, and the surface it over-claims is the one KD-90 already says is unfixed. It is
worth a line because the floor is the thing standing between this gate and silence, and a floor
justified by a command that can never satisfy it is a floor nobody can re-derive.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: five surfaces are counted, so the floor holds with margin; only the sentence is stale. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-92 — the actionable anchoring gate has no negative control; emptied, it would be invisible — **RETIRED 2026-09-26**

`src/lib/hooks.mjs` (`unfixedHookAnchors`) · its three callers

`unfixedHookAnchors` is what the gates ask — `test/hook-anchoring.test.mjs` (the template),
`test/harness-surfaces.test.mjs` (the stamped `settings.json`), `test/doctor-walk-wiring.test.mjs`
(what `doctor --fix` writes) — and all three assert it is EMPTY. Nothing anywhere asserts it is
ever non-empty. Measured on this tree: replacing its body with `return []` leaves all 62 tests in
those three files plus `test/hook-anchoring-differential.test.mjs` and
`test/inert-anchor-scored-as-protection.test.mjs` green, 0 failures. The PLANT test is the
calibration that makes the mechanism trustworthy, but it reads `anchorViolations` — the honest
total — so the filter standing between the total and the three gates is pinned by nothing.

**Nobody is wrongly served, which is why this is logged.** The filter is correct today, measured
by execution rather than read: a relative hook command yields one violation with `kind:"hooks"`,
the anchored form yields none, and the fix's new selector (`ANCHORABLE_SURFACES[v.kind] === true`)
returns the same surfaces as the one it replaced (`v.event !== null`) on the template, on this
repo's own settings, on a planted all-relative template, and on an anchored statusLine.

**Fires when:** anything changes the `kind` `anchorViolations` records, or the predicate reading
it, such that no hook surface is selected — at which point every gate demanding zero goes green by
being handed nothing, in the file whose subject is instruments that read as protection.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured: the detector is right today, and the PLANT test calibrates the honest total; only the filter under it is unpinned. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-93 — the anchor's surface-awareness landed in one reader; the harnesses still assume the other — **RETIRED 2026-09-26**

`test/hook-anchoring-differential.test.mjs` (`reached`, and `unanchoredPaths(command)` with no
surface) · `test/hook-anchoring.test.mjs` (`runHook`, the statusLine pin) · `src/lib/hooks.mjs`
(`unanchoredPaths`'s `anchorable = true` default)

`anchorViolations` now passes each surface's `ANCHORABLE_SURFACES` answer, so no spelling of the
anchor can clear a statusLine violation. The differential asks the same question a second way —
`unanchoredPaths(command)` with no options, over a surface list that includes `statusLine` — and
the parameter's default is `anchorable = true`, the "assume it reaches" default that the comment
two functions below calls the unsafe one. Both behavioural harnesses then execute every command
with `CLAUDE_PROJECT_DIR` set, including the surface ANCHORABLE_SURFACES declares never receives it.

**Nothing answers differently today**, which is why this is logged: the shipped statusLine is
relative, so the differential `continue`s past it and the behavioural pin gets the same silence
with the variable set or unset, and `test/inert-anchor-scored-as-protection.test.mjs` executes the
unset case head-on. **Fires when:** someone writes the anchor on the statusLine. `anchorViolations`
keeps reporting the violation (so the static KD-90 pin stays GREEN and says nothing), the
differential credits the anchor and then measures it in a world with the variable set (so it stays
green too), and the single instrument that reds is the behavioural pin, whose message reads *"if it
was fixed, delete this test and close KD-90"* — the wrong remedy, for a command still broken in
every stamped app.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the shipped statusLine is relative, so no instrument answers differently today; it fires only if someone writes the anchor on that surface. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-94 — "logging is free" is one gate too broad: an entry here stales the suite record — **RETIRED 2026-09-26**

`docs/KNOWN-DEFECTS.md` (the header's *"Logging is free"* paragraph) · `scripts/suite-record.mjs`
(`SUITE_HASH_SKIP`)

The header names `REVIEW_TIER_IRRELEVANT` and `DEVICE_TIER_IRRELEVANT` — both true, `docs/` and
`*.md` are in the first — and then concludes *"Adding an entry cannot reopen a gate."* The suite
hash is a third hash and it covers markdown ON PURPOSE (`scripts/suite-record.mjs`: a hash that
skipped markdown would be wrong more often than it saved, "and it errs toward re-running").
Measured while adding KD-92/93 to this file: with them, `node scripts/proof-plan.mjs` prints *"the
recorded run (PASS 2027/2028) describes another tree — run npm test"*; with the file reverted, the
same command prints *"for this exact tree — read it, do not re-run it"*.

**Nobody is wrongly served, which is why this is logged.** The paragraph's ARGUMENT is intact —
logging cannot cost a device run or a review round, which is what it is defending. The cost it
does carry is one ~50s suite re-run, which a reviewer who logs late has to either run or hand to
the author. The sentence is one gate too broad, not the policy.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured: logging costs one ~50s `npm test`, never a device run or a review round — the header's argument holds, its blanket sentence does not. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-96 — the schedule a session reads is still the tree the hook was loaded from — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`main`, the SessionStart branch)

PreToolUse now resolves the tree the command will act on. SessionStart does not: it renders
`obligation()` from `REPO_ROOT` under the heading "Proof schedule for this tree". In a session whose
cwd is a different worktree of this repository — which is how this repo is worked, several at once —
the first thing the session reads is another tree's schedule, stated as though it were this one's.

Not fixed here, deliberately. SessionStart is a context line and nothing routes on it; every
refusal that can cost or permit anything is PreToolUse, and all of those now judge the right tree.
Fixing it means resolving from the SessionStart payload's cwd and threading a root through
`render`, `suiteStatus` and `plugin-refresh.summary` — three more surfaces in a slice whose subject
is the gate. **Fires when:** a session's cwd is not the worktree the hook file was loaded from.
*Logged 2026-09-18, in the slice that fixed the PreToolUse half (KD-79).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a context line, not a gate — every PreToolUse verdict now judges the tree the command acts on. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-97 — the judged worktree's own scheduler decides, whatever commit or state it is in — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`planOf`)

A worktree of this repository answers for itself: the gate imports `<that tree>/scripts/proof-plan.mjs`
rather than re-deriving another tree's obligations with this one's code. That is deliberate — its
plan file, its change set, its branch rule, its trigger lists, and no second copy of `obligation()`
to drift — and it has two consequences worth writing down. A worktree parked on an older commit is
judged by that commit's rules, which may be looser than trunk's. And a worktree whose
`proof-plan.mjs` is mid-edit and throws lands in the gate's catch-all: exit 2, "could not answer …
refusing rather than allowing", carrying a module resolver's words rather than the gate's.

Both are the safe direction, which is why this is logged and not fixed. The second refuses. The
first gives exactly the answer that tree's own `node scripts/proof-plan.mjs` gives, which is the
answer its slice will be held to at its own merge — a gate that overruled it with trunk's rules
would be judging the tree by bytes the tree does not have. Only the second case's message is worse
than it could be. **Fires when:** a gated command acts on a worktree at a different commit, or on
one whose scheduler is being edited. *Logged 2026-09-18, in the slice that added it (KD-79).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: both ways it can differ fail safe: that tree's own answer, or a refusal. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-98 — an npm flag whose value this gate does not know is read as a folder, and the refusal says so — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`NPM_TAKES_VALUE`, in `commandCwd`)

`npm publish` can name a package that is not the directory it runs in, so any bare token after
`publish` is read as a folder or tarball operand and refused. Which tokens are *values* of a
preceding flag is decided by a list of seven — `--access`, `--tag`, `--otp`, `--registry`,
`--auth-type`, `--userconfig`, `--provenance-file` — and a flag outside it whose value is spelled
with a space (`npm publish --cache /tmp/x`) has that value read as the package: refused, with a
sentence that names `/tmp/x` as the thing being published, which it is not.

The direction is the safe one and the honest fix is not obvious — npm's flag surface is large, it
moves between majors, and a gate that shelled out to `npm` to ask would be running the command it
is gating. Nobody is wrongly served today: every publish in this repo is `cd <package> && npm
publish [--access public]` (`docs/PUBLISHING.md`, the npm-publish skill), and `--access` is on the
list. What is wrong is only the sentence, and only in a refusal that is otherwise correct to make.
**Fires when:** a publish uses a space-separated value for a flag outside those seven.
*Logged 2026-09-18, in the slice that added the reader (KD-79).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the direction is a refusal, and the seven flags a publish here actually uses are known. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-99 — a directory git answered 128 ABOUT is read as another repository, and gated in silence — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`worktreeAt`)

`worktreeAt` asks `answered` first, as slice 5 requires, and then reads `!r.ok` as *this directory
is not in a worktree of this repository* — which routes to `{ foreign }`, and foreign is SILENCE.
But `rev-parse --show-toplevel --git-common-dir` exits 128 for more than one reason, and the exit
code is the only thing read. Measured 2026-09-18, same git (2.50.1), same 128, two different facts:

    a plain non-repo directory   fatal: not a git repository (or any of the parent directories)
    a worktree's .git directory  fatal: this operation must be run in a work tree

The second is a directory inside a tree this gate is supposed to judge, and it is gated in silence
— the allow that leaves no message. `dubious ownership` and an unopenable object store land the
same way. Distinguishing them means reading git's stderr, which `gitAt` deliberately routes to
`ignore`, or asking a second question; both are more than this is worth today. **Fires when:** a
gated command runs in `<worktree>/.git`, or in a worktree git declines to open. No producer here:
nothing merges or publishes from inside `.git`, and this is a single-user machine.
*Logged 2026-09-18, review round 1 of the slice that added the reader (KD-79).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the two producers are `cd <tree>/.git` and a repo git refuses to open; neither is typed here. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-100 — the tree probe's purse bounds its git calls, not the filesystem calls in front of them — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`judgedTree`, `realpath`)

`TREE_PROBE_TOTAL_MS` is a deadline for `gitAt`, and it is now a term of the arithmetic invariant
the hook's budget test reads off the wiring. It does not cover the `statSync` that checks the
directory is there, the `existsSync` that checks the worktree carries a `scripts/proof-plan.mjs`,
or the two `realpathSync` calls in `realpath` — all four run in the new path, all four are
unbounded, and they run FIRST, inside a 10s PreToolUse timeout where a decision delivered late is
a permitted command. This is KD-66's shape in a new path: node offers no bounded synchronous stat,
and there is no portable way to plant a wedged mount to measure it. **Fires when:** a gated command
names a directory on an unresponsive filesystem. *Logged 2026-09-18, review round 1 of the slice
that added the probe (KD-79).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: same unmeasurable shape as KD-66 — no portable way to plant a wedged mount. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-101 — `npm publish .` is refused for publishing something other than the directory it runs in — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`commandCwd`, the publish operand loop)

Any bare token after `publish` is read as a folder-or-tarball operand and refused with *it
publishes "X" rather than the directory it runs in, and this gate reads only directories*. For `.`,
`./` and `$PWD`-free spellings of the current directory that sentence contradicts itself: `.` **is**
the directory it runs in, and it is a directory this reader could resolve. KD-98 is the same
refusal reached through a flag's value; this is the operand that needs no flag. The direction is a
refusal, never an allow, and no publish in this repo writes one — `docs/PUBLISHING.md` and the
npm-publish skill are `cd <package> && npm publish [--access public]` throughout. **Fires when:**
someone types `npm publish .`. *Logged 2026-09-18, review round 1 of the slice that added the
reader (KD-79).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: `.` IS that directory; only the sentence is wrong, and no publish here writes one. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-102 — the judged tree is checked for one of the two files the gate imports out of it — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`judgedTree`, `releaseContext`)

`judgedTree` ends by checking `scripts/proof-plan.mjs` is there, and says exactly why: *importing a
file that is not there would come back as "could not answer" with a module resolver's words rather
than this gate's*. The publish path then imports a SECOND file out of that same tree —
`releaseContext(root)` takes `deviceTreeHash` from `<root>/scripts/observed-tree.mjs` — and nothing
checks for it. Measured 2026-09-18 by calling it against a directory that has neither:

    ERR_MODULE_NOT_FOUND | Cannot find module '<root>/scripts/observed-tree.mjs'
    imported from .../scripts/hooks/proof-gate.mjs

which `main`'s catch turns into `proof gate could not answer for "publish": <that> — refusing rather
than allowing`. So the DIRECTION is right and nothing is allowed; what is wrong is that the
guarantee the check exists to give covers one import and not the other. **Fires when:** a publish
runs in a worktree of this repository carrying `scripts/proof-plan.mjs` and no
`scripts/observed-tree.mjs` — a checkout from before that file existed. No producer today: the two
files have shipped together since the tier was written. *Logged 2026-09-18, review round 1 of the
slice that added the reader (KD-79).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the direction is a refusal; only its words are a module resolver's instead of the gate's. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-103 — the list operator that decides whether a `cd` runs is not read — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`commandCwd`, `CHDIR`)

Masking settled quoting, and paren-counting settles subshells. What is still unread is the LIST
OPERATOR around the `cd` — which is the third thing that decides whether the shell performs it.
Measured 2026-09-18 by a generated sweep (6 guards × 8 forms × 3 joiners = 144 shapes, 108 of which
the shell ran to completion) against the same oracle as
`test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs`, `/bin/sh` with the gated command
replaced by `pwd -P`. Twenty-six resolve a directory the command will not run in, in four shapes:

    false && cd X; gh pr merge          the guard fails, the cd never runs, the gate resolves X
    true || cd X; gh pr merge           the same, the other way round
    cd X | cat; gh pr merge             a pipeline element is a subshell; the parent never moves
    cd X && sleep 0 &\ngh pr merge      the `&` backgrounds the whole AND-list, and the new `&`
                                        check reads only the character after the cd's OWN operand,
                                        where it finds `&&` and applies the cd
    ! cd X; gh pr merge                 `!` is not one of CHDIR's separators, so this cd is DROPPED
                                        and the payload's cwd is judged — KD-79's own direction

**Direction: fail-open**, and the tree's own words for it are the harshest available (that test
file's header: *a directory the gate resolves WRONGLY is the worst outcome available here*). **Fires
when:** one of those five shapes stands in front of a gated command AND the resolved tree owes less
than the real one. **No producer:** the first two need a mixed `&&`/`;` list whose guard happens to
fail at runtime, the third needs a `cd` written as a pipeline element, the fourth a backgrounded
AND-list with the gated command after it, the fifth a `!` on a `cd` — none is written anywhere in
this repository, in its session logs, or by the surfaces that produce these commands, and a merge in
this repo is typed as `gh pr merge --rebase --delete-branch` with at most a leading `cd`.

*A second thing to decide with it, no edit proposed here:* Rule 4 now says the harness "runs 24
shapes through a real shell, and holds the invariant that the gate resolves the directory the shell
would run the command in **or resolves nothing at all**". The harness holds it — over its 24 shapes.
The code holds it for 82 of the 108 generated ones. The sentence reads as a guarantee about the
gate, and what it measures is a sample; saying "24 shapes" and saying "the invariant" in one breath
is what makes it read that way. *Logged 2026-09-18, review round 2 of the same slice.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: fail-open, and no producer: each needs a mixed `&&`/`;` list whose guard fails at runtime, a `cd` as a pipeline element, or a backgrounded AND-list in front of the gated command. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-104 — a gated command inside `sh -c '…'` is refused, where it used to be judged — **RETIRED 2026-09-26**

**Re-placed in the round that found it.** The half of this that WRONGLY SERVED — the sentence — was
fixed before merge, because it told the reader something false about the command they had typed. The
refusal it named is deliberate and stays, and that is what the entry now describes. The original
measurement is kept below it, unedited, because it is the evidence.

`scripts/hooks/proof-gate.mjs` (`readablePrefix`) now says *a quotation still open where the command
begins — the command is inside a quoted script (`sh -c "…"`) or the quoting is unbalanced, and this
reader follows neither*, which is true of both shapes that reach it. What remains is only the
refusal, and it reaches FEWER shapes than this entry first claimed. Re-measured 2026-09-18 by
importing `commandCwd` from `13440ad`, `91b4129` and `168187f` side by side:

    sh -c "cd <tree> && gh pr merge 1"     13440ad: threw (no such export)   91b4129: REFUSED   168187f: REFUSED
    sh -c "node scripts/fleet-check.mjs"   13440ad: threw (no such export)   91b4129: judged    168187f: judged

The refusal fires only when something stands between the opening quote and the invocation, because
`WATCHED` treats `-c ["']` as a command position: the invocation's index then falls ON the quote, the
prefix stops before it, and there is no unclosed quote in the prefix to find. So the bare wrapper —
the spelling `test/proof-gate-hook.test.mjs` lists — is judged at the payload's cwd, which is the
RIGHT tree for it: a nested shell with no `cd` in it inherits the cwd it was started in. The refusal
that does fire is the safe direction, the remedy is visible in the command (drop the wrapper), and
reading it properly means deciding that a gated command inside a quoted wrapper belongs to that
wrapper's shell — a reader this slice did not build, and one that would have to answer for that
shell's own cwd. A test pins the refusal and its sentence, for the shape that has one.

<details><summary>as first logged, round 2, before the sentence was fixed</summary>

#### a gated command inside `sh -c '…'` is refused as a quotation that never closes

`scripts/hooks/proof-gate.mjs` (`readablePrefix`)

`readablePrefix` is handed `cmd.slice(0, at)` — the command CUT at the invocation — so a quotation
that opens before the invocation and closes after it is unclosed in the slice and closed in the
command. The fix's own backgrounded-`cd` branch reaches back to the WHOLE command for exactly this
reason, and says so in its comment; the quote branch does not. Measured 2026-09-18, `072433d` against
`91b4129`:

    sh -c "node scripts/fleet-check.mjs"        judged the payload's cwd  →  refused
    sh -c 'cd <tree> && gh pr merge 1'          resolved <tree>           →  refused

both with *what runs in front of it contains a quotation it never closes*, which is false of the
command the agent typed. The first shape is listed in `test/proof-gate-hook.test.mjs` as an
invocation `classify` must catch, so it is a form somebody wrote; no test asserts a verdict for it.
**Direction: a refusal**, and the remedy — drop the wrapper — is visible in the command even though
the sentence does not name it. Reading it properly means deciding that a gated command inside a
quoted wrapper belongs to that wrapper's shell, which is a reader this slice did not build.
*Logged 2026-09-18, review round 2 of the slice that added the reader (KD-79).*

**The first row of that table is wrong, and stands here because it is what was written.**
Re-measured at the re-record by importing `commandCwd` from both commits side by side:
`sh -c "node scripts/fleet-check.mjs"` is judged at the payload's cwd at `91b4129` and at `168187f`
alike — it never reached the quote refusal at all, because `WATCHED`'s `-c ["']` boundary puts the
invocation's index ON the quote and the prefix stops in front of it. Only the second row refused.
The entry above states what the commits do.

</details>

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a refusal in the first shape, sentence now true of it, remedy in the command; the second lands on the right tree — a nested shell with no `cd` inherits the cwd. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-106 — `{}` as an argument is read as a brace group, because its own `{` is the separator its `}` needs — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`COMPOUND`)

The boundary this slice fixed twice asks that a keyword stand after a separator (plus the optional
run of wrappers, assignments and redirections that `invocation()` spells out). The word `{}` passes
that test against ITSELF: `[;&|(){}\n]` matches the `{`, and the `}` one character later is a listed
keyword with a space after it. So a `{}` anywhere in front of a gated command is read as a brace
group and the tree is refused as unreadable — the same class as `git add .` and `echo done`, which
was fixed in `168187f`, surviving in the one spelling where the argument carries its own separator.

Measured 2026-09-18 at `7bc38dd`, over 21 argument words × 4 carrier commands × 12 command positions
(1008 pairs, each compared against the same command with a neutral word and both run by `/bin/sh` to
confirm the row really is an argument): 48 differ from the neutral spelling, all 48 of them `{}`, all
48 in the refusal direction. Two everyday shapes out of a 57-command battery:

    find . -name '*.log' -exec rm {} \; && gh pr merge 1   REFUSED — "…contains a compound command…"
    ls | xargs -I {} echo {} && gh pr merge 1              REFUSED — "…contains a compound command…"

Both are refused at `91b4129`, at `168187f` and at `7bc38dd` alike, so no boundary this slice shipped
is better or worse on it; the word is opaque to all three.

**Direction: a refusal** — never an allow, and only the agent typing the command is refused. Unlike
the false refusals that did block (`git add .`, KD-64's class), the sentence names `{ }` and `{ }` is
in the command, so there is something in it to act on: run the `find` as its own call. **No
producer:** a merge here is typed as `gh pr merge --rebase --delete-branch` with at most a leading
`cd`, and nothing in this repository puts a `find -exec`/`xargs -I` in front of a gated command.
**The fix is not another boundary clause:** `{`/`}` are keywords only when they are a whole word, so
the reader would need to see that `{}` is one word — which is a tokenizer, not a wider regex, and the
next spelling of this class (`{};`, `{}\;`) arrives with it. *Logged 2026-09-18, at the re-record of
review round 2 (KD-79's slice); the placement call is the reviewer's and the header's second row.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a refusal, only the agent is refused, the sentence names `{ }` and it IS in the command; no producer — no merge, publish or fleet-check here is typed behind a `find -exec`/`xargs -I`. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-108 — the refusal's evidence is read from the masked scope, so a quoted destination is not in it — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`commandCwd`, the `cd`-not-literal branch)

`readablePrefix` blanks quoted regions length-preservingly, and the `CHDIR` loop then matches against
that masked `scope`. The refusal it raises echoes `m[0].trim()` — which is text taken FROM the mask,
so every character inside the quotes has already become a space. The operand is therefore absent from
exactly the sentence whose job is to name it. Measured 2026-09-18 by importing `commandCwd` on this
tree:

    cd $HOME && gh pr merge                        (cd $HOME)   <- unquoted: the evidence is there
    cd "$HOME" && gh pr merge                      (cd)
    cd "${CLAUDE_PROJECT_DIR:-.}" && gh pr merge   (cd)
    cd "$(pwd)" && gh pr merge                     (cd)
    cd "a b" && gh pr merge                        (cd)

So the reader is told *a `cd` this gate cannot read literally (cd)* and the parenthetical, which is
the entry's whole contribution, carries nothing — while the unquoted spelling of the same refusal
carries it. Nothing false is said and the decision is unaffected: all five are genuine refusals of a
destination this gate does not compute, the direction is a refusal in every case, and only the agent
is ever refused. The remedy also remains visible without the echo, because the operand is still in
the command the reader just typed. **The fix is one word:** echo from `cmd` at the match's index
rather than from `scope`, the masking being length-preserving precisely so that index still means
what it says — the same property the `&`-backgrounding check two lines below it already relies on.
**Fires when:** any gated command is typed behind a `cd` whose destination is quoted. This is the
sentence, not the verdict; KD-95 covers the space case's refusal, and this covers what all of them
say. *Logged 2026-09-18, at the re-record of review round 2 (KD-79's slice), found by probing the
reader with the `${CLAUDE_PROJECT_DIR:-.}` construct the sibling slice put into the hook commands.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the refusal and its direction are right; only the parenthetical is emptier than it reads, and the remedy is still the operand in front of the user. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-109 — the third of KD-89's three failures has a channel and no reproduction — **RETIRED 2026-09-26**

`inspector/mcp/src/lib/preview-service.mjs` (`applyConsoleCopy`) · `test/console-copy-delivery.test.mjs`

KD-89 recorded three failures on a partly-installed tree, and the slice that closed it reproduced
**two**. With `inspector/mcp/node_modules` removed from an otherwise clean worktree, both
`bundle-freshness` and `server-tools` fail with `ERR_MODULE_NOT_FOUND`, deterministically, every
time; `console-copy-delivery` **passes**. The original measurement records only that the root
`node_modules` existed and the workspace's did not, and on exactly that state the third test is
green — so the tree that produced `stepGoverns={}` is not recoverable from what was written down.

What the slice did find is the CHANNEL that can produce it, and it is still here. `applyConsoleCopy`
wraps the manifest read and the profile load in a bare `catch { setConsoleCopy(null) }`, so any
throw — a module the resolver cannot find included — is re-narrated downstream as *this project
declares no console copy*, and the first thing a reader sees is an assertion about the Evidence tab
not linking a step to the section it governs. The degradation is deliberate and should stay: a page
load must not crash because a profile is unreadable. Discarding the cause is the part that is not.

**Why it does not block.** The door refuses an uninstalled tree before any of the three runs, so the
misattribution cannot reach a contributor whatever the third's trigger was — which is itself the
argument for a door over a skip, since a skip would have had to name this victim and nobody can.
What remains is a console that renders neutral without saying why, to a reader who is already
looking at something else. **What the fix would be, when it is taken:** keep the fallback and stop
throwing the cause away — log the caught error, or carry it into the console copy so a neutral page
states its reason. That is a change to the inspector's degradation contract, not a line.

*Logged 2026-09-18, by the slice that closed KD-89.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the door refuses an uninstalled tree before any of the three runs, so the misattribution cannot reach a contributor whatever the third's trigger was; the fallback itself is deliberate — a page load must not crash on an unreadable profile. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-110 — the preflight guards `npm test`, and this repo is often run one file at a time — **RETIRED 2026-09-26**

`package.json` (`pretest`) · `scripts/suite-preflight.mjs`

The door is npm's `pretest` lifecycle, which is what lets one wiring reach `npm test`,
`prepublishOnly` and `.github/workflows/ci.yml` without any of the three naming it. It does not
reach `node --test <file>`. That is how a contributor or an agent narrows to one file while working,
and it is how KD-89's three failures were read in the first place; `.claude/skills/npm-publish`
step 1 names a bare `node --test` too.

**WHAT A READER MEETS THERE, measured rather than assumed** — an earlier draft of this entry said
"the original misattribution, unchanged", which contradicts KD-109 in the same commit and a review
caught it. On an uninstalled tree the two `ERR_MODULE_NOT_FOUND` failures are genuinely unchanged;
`console-copy-delivery` PASSES (`# pass 1  # fail 0`), because the third failure never reproduced
from that condition. So the direct path is not the three-failure experience KD-89 recorded — it is
the two readable ones, plus this slice's own test files, whose messages now name an uninstalled tree
as the first candidate rather than blaming the code in front of the reader.

**Why it does not block.** What KD-89 recorded is a FIRST impression — a fresh clone running the
command this repository documents — and that command is now refused by name before anything runs.
Someone invoking the runner directly has already chosen the narrower instrument, and what they see
explains itself. **What the fix would be, when it is taken:** the runner has no
per-file preflight hook, so covering that path means either a guard inside each test file — the skip
this slice measured its way out of — or a wrapper every direct run must be typed through, which is a
change to how the repo is worked rather than a line in it.

*Logged 2026-09-18, by the slice that closed KD-89.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the defect KD-89 recorded is a FIRST impression of the documented command, and that command is refused by name; someone running one file directly has already chosen the narrower instrument. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-111 — the walk is npm's layout, so a working Yarn PnP checkout is refused — **RETIRED 2026-09-26**

`scripts/suite-preflight.mjs` (`installedFrom`)

`installedFrom` is Node's `node_modules` walk: up from the package's directory, asking whether
`node_modules/<name>/package.json` exists. Under Yarn PnP there is no `node_modules` at all —
resolution goes through `.pnp.cjs` — so every declared dependency reads missing and the door refuses
a tree that works perfectly. pnpm is unaffected: it links direct dependencies into `node_modules`,
which is the thing the walk looks for.

**Why it does not block.** This repository declares npm and nothing else — `package-lock.json`, npm
`workspaces`, `npm ci` in CI — and no other package manager's lockfile is in the tree, so there is
no producer today. The failure is also in the safe direction: a loud refusal naming a command, never
a silent pass. **What the fix would be, when it is taken:** ask the resolver instead of the
filesystem — but every resolver spelling measured for this slice calls an installed package missing
for its own reason (`exports` maps with no `.` entry, and `import.meta.resolve`'s second argument
being ignored unflagged), so this needs a real answer rather than a swap.

*Logged 2026-09-18, by the slice that closed KD-89.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no producer: this repo declares npm (`package-lock.json`, npm `workspaces`, `npm ci` in CI) and no other lockfile is in the tree; the failure is a loud refusal naming a command, never a silent pass. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-113 — a nameless workspace is named by the two readers differently, and the invariant test compares names — **RETIRED 2026-09-26**

`scripts/suite-preflight.mjs` · `test/a-package-the-workspace-declaration-excludes-is-refused-as-uninstalled.test.mjs`

Found while attacking the expansion fix, by running the declaration through both readers over twelve
directory layouts rather than the three the landed test carries. Eleven agree. The twelfth is a
workspace whose `package.json` has no `name`:

    ws/noname/package.json = { "version": "0.0.0" }   under the declaration ["ws/*"]
        npm  : [@f/a, noname]        — npm synthesizes the directory basename
        door : [@f/a, ws/noname]     — `name: typeof pkg.name === "string" ? pkg.name : rel`

The same directory, counted by both, spelled two ways. Everything that matters is identical: the
package is in the set, its dependencies are walked, and a missing one is refused with the same
remedy. Only the label in the refusal's `rel (name)` column differs, and the door's label is a true
fact about the tree rather than a false one.

**Why it is logged and not fixed.** Nobody is wrongly served: no package this repo declares is
nameless (`this repository's own declaration is one both readers agree on` passes), so there is no
producer, and the divergence cannot change a verdict — only how a line reads.

**What makes it worth a line anyway** is where it lands. The invariant this slice wrote is *the
door's package set is npm's own, or the door declines*, and the test asks that question by comparing
NAMES — a label the two readers derive by different rules — rather than rel paths, which they derive
identically. So the first nameless workspace anyone adds reds
`the door expands a glob the way npm expands it, or declines` and
`the preflight judges the packages npm declares, or declines to judge`, for a cosmetic reason, and
whoever sees it will be reading the expansion for a bug that is not there. Whoever touches this next
decides whether the oracle compares `rel` and the name is display-only, or the fallback becomes
`path.basename(rel)` so the two spellings converge.

*Logged 2026-09-18, review round 2 (the re-record) of the slice that closed KD-89. Measured by
execution over twelve layouts against `npm pkg get name --workspaces`; not landed as a test, because
this slice's two rounds are spent and nobody is wrongly served by it.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured over twelve layouts, the only divergence left and the only one that is a LABEL rather than a member: coverage, refusal and remedy are identical. No producer — every package this repo declares names itself — and the first one that does not reds the invariant test for a reason that is not the defect it is about. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-114 — what the closed wrapper list does not read through, named rather than guessed at — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`COMMAND_PREFIX`)

KD-107's fix makes the accepted command-position prefix a CLOSED list: a separator, then any run of
`VAR=value` assignments, redirections, and thirteen wrapper words, each carrying its own options,
the values of the options that wrapper declares it takes separately, and a bare operand only where
it has one (`timeout`'s duration). **Every other word ends the run and is the command** — which is
the rule, not a limitation: a reader that guessed at an unknown operand read `time echo gh pr merge`
as a merge and refused `time git add . && cd X && gh pr merge` for a construct that was not in it.
But the rule leaves a residue, and the residue is a fail-open, so it is named here rather than
inferred from the regex. Measured 2026-09-18 by importing `classify` on this tree:

    bash -lc "gh pr merge 1"                 null   — the `-c` boundary is spelled `-c`, and `-lc` is not it
    { gh pr merge 1; }                       null   — `{` is a separator to COMPOUND, not to the raw reader
    ssh host "gh pr merge 1"                 null   — the command runs on another machine's shell
    watch -n 5 gh pr merge 1                 null   — `watch` is not on the list
    sudo -u me -g grp extra gh pr merge 1    null   — `-u me` and `-g grp` are read; `extra` ends the run

**Direction: fail-open at the classifier**, the same class as KD-107 and without KD-107's producers:
`!` and `timeout N` are things an agent types, and these are not. Every merge, publish and fleet
check in this repository is typed bare or behind a `cd`, nothing here runs a gated act over `ssh` or
under `watch`, and `sudo` in front of one would already be unusual. **The fix for the first four is
one list entry each and the fifth is one letter in a table**, which is exactly why they are not taken now: a
list widened without a shell to check it against is how KD-105 and KD-107 happened, and each of
these wants its own row in the `/bin/sh` sweep, where the shell says whether the shape really
invokes anything. `{ gh pr merge; }` is the one with a genuine argument against fixing it: making
`{` a separator for the RAW reader turns `git commit -m "{gh pr merge}"` into a merge, because that
reader runs before quoted spans are blanked — KD-64's mistake in a new costume. *Logged 2026-09-18,
by the slice that closed KD-107, from the probe that measured its own fix.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: fail-open at the classifier, and the residue the closed list names out loud rather than guessing at (docs/GATE-RULES.md, Rule 4); no producer — a merge here is typed `gh pr merge --rebase --delete-branch`, bare or behind a `cd`. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-115 — the clause that makes the declaration safe is in one of its three alternatives — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`COMMAND_PREFIX`)

The declaration carries a comment that reads as a property of the whole thing: *a word inside a
command prefix NEVER CROSSES A CHARACTER THAT ENDS A COMMAND*, with fifteen shapes of the construct
sweep cited as what it cost to learn. `IN_WORD` and `GAP` honour it. The other two alternatives do
not: an assignment is `[A-Za-z_][A-Za-z0-9_]*=\S*` and a redirection is `\d*[<>]+\S*`, and `\S`
crosses every one of `; & | ( ) < >`. Measured 2026-09-18 against `^COMMAND_PREFIX$`:

    time a;b      no match      — the clause holds where it was written
    A=a;b         MATCHES       — the assignment's value crossed the `;`
    A=a&&b        MATCHES
    A=a|b         MATCHES
    2>a;b         MATCHES
    2>a&&b        MATCHES

**Direction: none measured, and that is the entry.** The shapes were swept for the consequence the
clause exists to prevent — a match that begins before a `cd` and drops it out of the prefix
`commandCwd` reads — and there is not one, because a run that swallows a separator must still be
followed by horizontal whitespace and then the gated program, and `cd`'s own operand is separated
from it by a space that `\S*` cannot cross. `A=x;cd;gh pr merge`, `>x;gh pr merge` and
`FOO=a\;cd /x && gh pr merge` all leave the `cd` inside the prefix or refuse. So the code is right,
and it is right for a reason the comment does not state. **Why it is here and not a fix:** narrowing
those two to `IN_WORD` is a one-word change with no failing test to justify it, and this file has
now twice been the place where a list was edited without a shell to check it against. What is wrong
today is the SENTENCE — it claims of three alternatives what is true of one — and the reader it
misleads is the next person who adds a fourth. *Logged 2026-09-18, review round 1 of the slice that
closed KD-107, from a probe built to break the clause and unable to.*

**The sentence was scoped in the same round; the code asymmetry is what stays logged.** Both the
declaration's comment and `docs/GATE-RULES.md` Rule 4 now say the clause is true of the WRAPPER RUN
and not of the two alternatives beside it, and both name this entry. That was free and carried no
risk. Narrowing the two alternatives to `IN_WORD` was not taken, on the entry's own argument: there
is no failing test to justify it, and this file has twice been where a pattern was widened or
narrowed without a shell to check it against.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the comment is wider than the code, and the code is right by accident: leftmost-match still starts the invocation at or after any `cd`, so no shape resolves a different tree — swept for one and none found. Nobody is served wrongly today; the next reader of that comment is. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-116 — two clauses of the command-position declaration are right about the shell and pinned by nothing — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`IN_WORD`, `GAP`)

Both clauses say the same thing about the shell: a word inside a wrapper run does not cross a
character that ends a command, and neither does the whitespace between them. Both were measured
load-bearing against the FIRST cut of this declaration, which let a wrapper carry bare operands —
relaxing either put fifteen shapes of the construct sweep from refused to READ. Review round 1
removed the bare-operand run, and the mutation run against the bytes that merge says the clauses
stopped mattering with it:

    IN_WORD = "\S"      every test in this tree stays GREEN
    GAP     = "\s+"     every test in this tree stays GREEN

The reason is structural, not an oversight in the sweeps: `COMPOUND` is used with `.test()`, which
tries every start position, so a word that swallows a `;` in one attempt does not stop a later
attempt starting AT that `;` from finding the keyword; and the classifier can only lose a `cd` if
the gated program stands directly after the swallowed text, which no shape does now that a wrapper's
run ends at the first word its table entry does not declare.

**Direction: none — this is an unpinned clause, not a wrong one.** Nobody is served wrongly by code
that is right; the exposure is that a future edit could relax either one and no gate would say so,
which is how KD-105 and KD-107 both happened. **The fix is a test, not a change**, and it is not
taken here because a test with no consequence to assert would have to assert the regex's own source,
which is the "rule stated twice" shape this repository refuses — the third spelling of a thing is
exactly what KD-107 was. The honest remedy was taken instead: the declaration's own comment states
which of its clauses are measured and which are not. *Logged 2026-09-18, by the slice that closed
KD-107, from the mutation run over its own new tests.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: not a wrong clause, an unpinned one: both are right about the shell, nobody is served wrongly, and the honest remedy (the declaration's comment states which clauses are measured) was taken. A test with no consequence to assert would have to assert the regex's own source — the third spelling that KD-107 was. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-118 — a value-taking letter MISSING from the wrapper table is the direction nothing sweeps — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`WRAPPER_ARITY`) and
`test/a-wrapper-flag-the-program-takes-no-value-for-eats-the-command-name.test.mjs`

Round 2's sweep enumerates the letters the READER believes take a value and asks `/bin/sh` to
contradict them. The opposite direction — a letter the reader does NOT believe in, which the program
really does consume — is outside that sweep by construction: a letter the reader never spells is
never run. And it is the expensive direction. The run ends a word early, the gated program is read
as the flag's value, and nothing reaches the gate at all. The re-record found two, measured against
the real programs with a stand-in `gh` that records whether it was invoked:

    command time -o F gh pr merge 1 --rebase     /usr/bin/time ran it — the merge REALLY RAN, gate: null
    printf 'x\n' | xargs -J R gh pr merge R      xargs ran it — the merge REALLY RAN, gate: null

**Both were one letter and both are fixed** (`time: "of"`, `xargs: "…JRS"`), so what is logged here
is not those two — it is that nothing would have caught a third. The re-record also argued `time`
was a fork with no one-word answer, because `time` names two programs: the shell's keyword, which
takes only `-p`, and `/usr/bin/time`, which `command time` reaches. Measured on this tree, that
argument does not hold. The flag's value is consumed on BOTH readings before the run ends, so `echo`
still ends it:

    command time -o F gh pr merge     merge   (and the shell really merges)
    command time -o F echo gh pr …    null    (and the shell really prints)
    time -o F gh pr merge             merge   (and the shell refuses the line: `-o: command not found`)

The residue of the fork is the third row's CLASS, and it is worth naming as a class rather than as
one shape: `time -f F gh pr merge`, `eval time -o F gh pr merge`, `builtin time -o F gh pr merge`,
and `command time -f F gh pr merge` (BSD `/usr/bin/time` has no `-f`) join it. Every member is a
message about a command the shell refuses to run — the cheapest error available, and the direction
Rule 4 settles on. Swept for a member in the expensive direction and there is not one.

**Direction: fail-open at the classifier, and no producer** — zero hits for `command time`,
`/usr/bin/time` or `xargs -J` anywhere in this tree, and a merge here is typed `gh pr merge --rebase
--delete-branch`, bare or behind a `cd`. **The fix is a second sweep and it is costed, not
hand-waved:** for each wrapper, run the letters it does NOT declare and ask whether the program
consumed the next word. Spelled one shell per letter that is 13 x 52 = 676 spawns, roughly 7-10s on
a 90s suite; spelled one shell per wrapper looping over letters it is 13, and that is the shape to
build. It is not built here because this slice's two rounds are spent and it is a new mechanism, not
a correction — the rule that a round has a fixed point is worth more than this entry.

**One further measurement about that sweep, recorded rather than raised again:** on darwin it
confirms 5 of the 28 declared letters (`env -u`, `exec -a`, `xargs -E`, `xargs -I`, `xargs -J`) and
drops the other 23 as unmeasurable — `sudo` needs a tty, `timeout` is not installed, and
`caffeinate -t`/`nice -n`/`xargs -n` reject `echo` as a value. It says so in its own failure
message, which is the honest form, but it is thinner than its title reads. That census is a count of
THIS tree and moves whenever a letter is added: it read 4 of 23 one commit ago, and the five letters
this entry is about moved it. *Logged 2026-09-18 at the re-record of the slice that
closed KD-107; the two letters it found were fixed in the same commit, and the sweep that would
have found them was not.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: fail-open at the classifier, no producer — zero hits for `command time`, `/usr/bin/time` or `xargs -J` in this tree. The fix is a second sweep, costed at 13 spawns done per-wrapper (676 done per-letter); not built because this slice's two rounds are spent and it is a new mechanism rather than a correction. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-120 — the tool check's oracle is the grant line it is checking, so an invented name clears it — **RETIRED 2026-09-26**

`test/an-agent-definition-names-a-tool-it-was-not-given.test.mjs`

The check derives what a tool IS from two readings of the tree at run time: a backticked
multi-hump shape, and the union of every `tools:` line. Neither can separate a real tool from a
typo or an invention. Measured by planting a definition and calling the file's own exports:

    tools: Read, SendMesage     prose: "Call `SendMesage` now."    →  0 offences

So the remedy the failure message prints — *"add the name to that file's `tools:` line"* — clears
the check whether or not the harness has such a tool, and the grant it adds is inert. This branch
took that remedy twice, for `SendMessage` and `TaskStop`. Nothing in this repository can confirm
either name exists; the check's own design refuses to carry the list that could, and there are no
recorded tool payloads in `qa-artifacts/` to derive one from.

**Why logged and not fixed.** An oracle needs either a hand-maintained list of tool names — the
drift `scripts/ground-truth.mjs` exists to abolish, and the reason this check carries none — or a
probe of a live session, which no test here has. The direction is also the benign one: a grant for
a tool that does not exist gives the agent nothing, while the defect the check was written for,
prose naming a tool the agent does not have, is still refused. What WAS open is not the check's
shape but one fact about that branch: whether `SendMessage` and `TaskStop` are real names. **Both
are** — confirmed 2026-09-18 from the harness's own tool schemas, which is to say from outside this
tree, exactly as this entry says would be needed. That the confirmation cannot be made here, or kept
here, is KD-128.

*Logged 2026-09-18, review round 1 of the direct-lane fix that added the check.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the benign direction: a grant for a tool that does not exist is inert, where prose naming a tool the agent lacks is still refused. No in-tree oracle exists and the design deliberately refuses to carry a list; what WAS open — whether `SendMessage` and `TaskStop`, both added by that branch under that remedy, are real names — is answered: **both are**, confirmed 2026-09-18 from the harness's own tool schemas, i.e. from outside this tree. That the answer cannot be kept here is KD-128. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-121 — six spellings of "use this tool" the check does not see, and a false reason for one of them — **RETIRED 2026-09-26**

`test/an-agent-definition-names-a-tool-it-was-not-given.test.mjs` (`readDefinition`, `toolsNamedInProse`)

Measured by feeding one planted contradiction — a definition granting `Read` whose prose tells the
agent to use `SendMessage` — through the file's own exports in eleven spellings:

    CAUGHT   comma `tools:` + plain backticked mention      MISSED   inside a fenced block
    CAUGHT   YAML list `tools:` (for the wrong reason)      MISSED   `SendMessage(agent)` — backticked with an argument
    CAUGHT   no `tools:` line (for the wrong reason)        MISSED   split across a line break inside one span
    CAUGHT   `tools:` wrapped onto two lines                MISSED   named without backticks
    CAUGHT   CRLF frontmatter (for the wrong reason)        MISSED   `mcp__ide__getDiagnostics`
                                                            MISSED   granted and named with the SAME typo (KD-120)

A seventh, unplanted: `MULTI_HUMP` requires every hump to be `[A-Z][a-z0-9]+`, so a tool name
carrying an acronym (`ReadPDF`, `HTTPFetch`) is invisible to the shape derivation and visible only
if some definition grants it.

**No producer.** Swept in the other direction too: every multi-hump token appearing ANYWHERE in the
bodies of all three definitions, however spelled, is already visible to the checker — zero
invisible. The blind spots are what a future edit can walk into, not what is wrong today.

**What is wrong today is the reason given for one of them.** `readDefinition` strips fenced blocks
under the comment *"Fenced blocks are examples and shell, not instructions to this agent."* Both
fenced blocks in this repository's agent definitions are instructions: the
`qa/plan.mjs --hold/--beat/--release` block under *Progress must be visible while it happens* in
`agents/cmp-orchestrator.md` is the claim the orchestrator is told to make, and the block under
*Leave a record* in `.claude/agents/staff-reviewer.md` is the `--record-review` command it is told
not to hand-write. (Both were cited by line number until 2026-09-19, when an edit to each file
moved both — KD-70, in the log that logged it. Sections do not renumber.) Neither names a tool, so the behaviour is right and only its justification is
false — and the justification is what the next person will reason from.

*Logged 2026-09-18, review round 1. Measured by execution, not read.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured: every tool-shaped token anywhere in all three definitions is already visible to the checker, so no producer; the two fences hold commands the agent IS told to run, but neither names a tool. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-122 — the check reads one spelling of `tools:`, where the harness reads YAML — **RETIRED 2026-09-26**

`test/an-agent-definition-names-a-tool-it-was-not-given.test.mjs` (`readDefinition`)

`granted` is `/^tools:\s*(.+)$/m` split on commas. Two frontmatter shapes the harness accepts are
read differently, both measured:

    tools:                         →  granted = {"- Read"}       the `\s*` eats the newline, `.+` takes
      - Read                                                     the first item, the rest are dropped
      - SendMessage

    (no `tools:` line at all)      →  granted = {}               which in Claude Code means the subagent
                                                                 INHERITS every tool, not none

This is the two-readers-disagree class (KD-113), one file over. Both failures point the same,
survivable way: a wrong `granted` set can only manufacture offences, never hide one, so the check
reds loudly on a definition that is correct rather than greening on one that is not — and the
message it prints would send its reader looking for a contradiction that is not there.

**No producer.** All three definitions in the tree use the comma form and all three declare one.

*Logged 2026-09-18, review round 1.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: both fail loud, never silent (they can only manufacture offences, not hide them), and no producer: all three definitions use the comma form and all three declare one. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-123 — three prose facts in this change the tree does not support — **RETIRED 2026-09-26**

`agents/cmp-orchestrator.md` · `test/an-agent-definition-names-a-tool-it-was-not-given.test.mjs`

1. **The cross-reference points the wrong way.** The new section reads "The *status you owe upward
   past ~5 minutes* rule **below** means post a line and keep working." That rule is at line 146,
   44 lines ABOVE the sentence citing it. An agent sent downward from there finds `## Parallelism`.

2. **The actionable remedy is scoped to one tool.** The section's mechanism is `Agent` and its
   `run_in_background` default. `SendMessage` is granted by the same commit and is what RE-DELEGATE
   step 2, immediately above, tells the orchestrator to use — and a re-brief followed by an ended
   turn stalls exactly the way the section exists to stop. The section's general rule ("if you have
   nothing left to do but wait, you spawned it wrong") does cover that path; only the bullet naming
   a parameter does not. Open, and unanswerable from this tree: whether `SendMessage` takes
   `run_in_background` at all. No tool schema is recorded anywhere in the repository.

3. **One population, two counts.** The test file's header says seven orchestrators "could not
   resume a reviewer, and each ran a COLD substitute pass instead". Commit `71d4f43` measures FOUR
   subagents reporting the missing grant and running cold substitutes, and attributes the seven
   stalls to the backgrounding default — two causes with two populations, merged into one sentence
   in the artifact that outlives the commit message. Same shape as KD-28.

Nothing routes on a count, a direction word, or the width of a bullet, so nobody is served wrongly;
what each costs is the next reader's time, and (2) costs it at the moment the same stall recurs one
call over.

**FIXED 2026-09-18** — all three, in the commit that carries this line. (1) reads "above". (3) reads
FOUR. (2) is fixed, and this entry was WRONG about it: `SendMessage` does not have "the same stall
shape" in the sense that matters, because it has no `run_in_background` at all — a send never
blocks, so the remedy named for `Agent` has nothing to attach to. The new bullet says the stall is
the same and the fix is not, rather than widening the old one. The first attempt at that bullet
offered `notify_when_idle: true` as an alternative to working on in the same turn, which refuted
its own first sentence and would have licensed the exact stall the section exists to stop; review
round 1 caught it before it merged. Where the schema facts came from, and that nothing in this
tree can check them, is KD-128.

*Logged 2026-09-18, review round 1. Fixed same day, review round 1 of the fix.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the section's general rule ("nothing left to do but wait means you spawned it wrong") does cover the `SendMessage` path, so only the bullet is narrow; the count and the direction word are narration, and nothing routes on either. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-124 — one attribution rule, spelled twice, in two files with no shared code — **RETIRED 2026-09-26**

`scripts/change-price.mjs` · `scripts/lib/proof-history.mjs`

Found in review round 1 of the slice that added `change-price.mjs`. A recorded run belongs to a
slice when it was written ON that slice's branch INSIDE that slice's lifetime. That rule is now
written out twice, in two files, with nothing shared between them:

    proof-history.mjs, mine() inside summarize():
        row?.branch !== ev.plan.branch || at === null || at < from || at > to   → not this slice's
    change-price.mjs, attribute():
        r.branch === branch,  then  stamp(r.ranAt) >= stamp(plan.openedAt)      → this slice's

The second is the first with the upper bound removed, because the plan it reads has not closed
yet and there is no `closedAt` to bound with. `attribute()`'s own docblock says exactly that, and
says the difference is deliberate — "That is deliberately not a SECOND attribution rule". The
words are in one file; the code is in two.

**Why it is logged and not fixed.** The honest remedy is one predicate living in
`proof-history.mjs`, parameterised on the upper bound (absent while the slice is open), imported
by the reader that needs it — and that edits a file this slice declared out of scope, which is
where a fix stops being bounded by the finding. Nobody is wrongly served meanwhile: the new
reader refuses nothing and writes nothing, so a divergence would mis-state a number in an
advisory block rather than change a verdict. What makes it worth a line is that the drift is
cheap and silent — the day `summarize()` learns something about attribution (a run with no
`ranAt`, a branch renamed mid-slice), the second spelling does not learn it, and the two counts
disagree with no test standing between them.

*Logged 2026-09-18, review round 1 of the slice that added `scripts/change-price.mjs`. Verified by
reading both functions, not by execution: they agree on every row either would count today, and
the class is the duplication rather than a present disagreement.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: nobody is wrongly served: the new reader is advisory, prints a count and refuses nothing, and the difference between the two spellings is the deliberate one its own docblock names. The honest remedy edits a file this slice put out of scope. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-125 — a detached HEAD is `""` to the reader and `null` to every writer, so every run reads as none — **RETIRED 2026-09-26**

`scripts/change-price.mjs` · `scripts/proof-plan.mjs` · `scripts/suite-reporter.mjs` · `scripts/fleet-check.mjs`

`currentBranch()` states its own answer in its docblock — *"The branch this tree is on; `""` when
detached, null when git cannot say"* — and the three programs that append a history row all spell
that same state the other way:

    proof-plan.mjs:466      branch: branch.status === 0 ? branch.stdout.trim() || null : null
    suite-reporter.mjs:112  branch: branch.status === 0 ? branch.stdout.trim() || null : null
    fleet-check.mjs:560     branch: branch.status === 0 ? branch.stdout.trim() || null : null

`attribute()` in `change-price.mjs` keeps a row when `r.branch === branch`. On a detached HEAD the
reader is holding `""` and every row is holding `null`, so the filter matches nothing and all
three `spent` rows print `0 record(s)` against whatever they owed — a full history read as an
empty one, in the half of the program written to notice a spend.

**Why it is logged and not fixed.** There is no producer: this is an advisory a human runs on the
branch they are working on, and the rendered block's own first line already prints `(detached)`
for that state (`m.branch || "(detached)"`). What it does not do is carry that fact down into the
counts, so the one reader who could reach this is told the state and not told what it did to the
numbers underneath. The fix is one spelling shared by the reader and the writers, which means
touching the writers — out of this slice's scope — and it is the same shape as KD-113: two
programs deriving one label by different rules, agreeing everywhere except the empty case.

*Logged 2026-09-18, review round 1 of the slice that added `scripts/change-price.mjs`. Verified by
reading the four files rather than by detaching HEAD: the writers' expression is identical in all
three, and `currentBranch()`'s own docblock states the other spelling.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no producer: this is an advisory a human reads on a branch, and the block's own `branch` line already prints `(detached)`. One reader-pair over from KD-113, and in the same class. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-126 — the retired citation survives in the test file that found it — **RETIRED 2026-09-26**

`test/the-spent-block-asserts-counts-the-records-do-not-support.test.mjs`

Review round 2 found `scripts/change-price.mjs` citing `proof-plan.mjs --history` as printing the
"N history line(s) did not parse" count for the file being disclosed. It does not: `--history`
reads `plans`, `reviews` and `fleet` (`scripts/proof-plan.mjs:551`) and sums a single `malformed`
across those three (`:553`). `qa-artifacts/suite-history.jsonl` is never opened, so a reader
checking a suite row's "3 lines did not parse" against that command is told `0`.

The production line was corrected in `6231a21`. The same claim is still made in prose in the test
file that found it — its header paragraph and the failure message on its line 78 — where it will
be read by the next contributor who reddens that assertion and goes looking for the command.

Not fixed because the finding arrived in round 2, and `docs/KNOWN-DEFECTS.md` caps a slice at two
rounds and admits no third. It is a comment, in a test, in this repository: the routing line's
second row, and not close to the first.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the same false fact `6231a21` corrected in production, surviving in a second spelling in the test file that found it. Nobody outside the repo is served by it: it misleads only a contributor reading that assertion's message. Round 2 was the last round, so it is logged rather than fixed. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-127 — a refuter that self-disables once its refutation is answered — **RETIRED 2026-09-26**

`test/the-advisory-states-what-its-own-input-refutes.test.mjs`

The file's second case guards the class *a message names a command as reporting a fact that
command does not report*. It opens with an escape — `if (!cited) return;` — so once the citation
was removed the case asserts nothing at all, and the class is pinned only against the literal
string `proof-plan.mjs --history`. A future citation to some other command that reported the fact
no better would pass it silently.

Its author documented the escape deliberately: the test was landed to be watched failing, and a
refuter whose refutation has been answered has no consequence left to assert without asserting
the implementation's own source. That reasoning is sound and is why this is the second row rather
than the first — nobody is handed a wrong result, and the production defect it found is fixed and
stays fixed by the sentence-level claims table in the same file's first case.

The honest remedy is a claims table keyed on *what a command reports*, derived by running it,
rather than on the command's name. That is a new mechanism, not a correction, and this slice's
two rounds are spent. Logged for whoever next touches the disclosure.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: deliberate and documented by its author (the test is a refuter, and the refutation has been answered), but it is a test measuring nothing today. The honest remedy is a claims table keyed on what a command reports rather than on its name; not built, because it is a new mechanism and this slice's two rounds are spent. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-128 — five tool-schema facts this repository states and cannot re-read — **RETIRED 2026-09-26**

`agents/cmp-orchestrator.md` · `docs/KNOWN-DEFECTS.md` (KD-120)

The `NEVER END A TURN WAITING ON YOUR OWN CHILD` section asserts, in bold, that **`SendMessage`
has no such parameter** (`run_in_background`), that **a send never blocks**, that **no reply
arrives inside the turn that sent it**, and that the reply **is delivered to a later one**. KD-120's
entry closes its open question the same way: `SendMessage` and `TaskStop` are real names, "confirmed
2026-09-18 from the harness's own tool schemas". Every one of those five is a reading of a schema
this repository does not hold. `scripts/ground-truth.mjs` — the deriver this project uses precisely
so that counts and names are never hand-stated — has no source to derive one from, and there are no
recorded tool payloads in `qa-artifacts/` either.

This is KD-120 one level down. That entry left open whether two tool NAMES exist; this adds the
answer, plus claims about one of their parameter LISTS and its delivery semantics, and the answer
is now load-bearing — a shipped agent definition tells an orchestrator what to do on the strength
of it. The tool check cannot see any of it: a `key: value` inside backticks is not a bare
identifier, which is KD-121's blind spot, and even a bare one would be judged against the grant
line rather than against the harness, which is KD-120's.

A sixth, retracted, is what round 1 caught: the bullet's first attempt offered `notify_when_idle:
true` as an alternative to working on in the same turn. It is gone from the tree — the parameter is
main-conversation-only, so a subagent orchestrator could never have used it — and it is the
measurement for why this entry exists: an unre-readable schema fact WAS wrong once, in this file,
in this slice, and only a human reading the bullet against the schema caught it.

**Why logged and not fixed.** The same missing oracle KD-120 names, and the same reason no fix is
available: a hand-maintained schema list is the drift the deriver exists to abolish, and no test
here can probe a live session. What is logged is narrower than "are they true" — it is that
out-of-tree facts are now written into a shipped surface and into a closed entry with no marker
distinguishing them from this repository's derived claims, and nothing reds if the schema moves.

*Logged 2026-09-18, review round 1 of the fix; corrected round 2, when round 1's own fix made the
first version of this entry false of the tree.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: KD-120 one level down: that entry left open whether two tool NAMES are real, and both the answer and a claim about one's parameter LIST arrived from outside the tree. They may well be right; what is logged is that no gate here can ever red if the schema moves, so the shipped bullet and the closed entry both rest on a fact this repository cannot hold. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-129 — the round block is acting text about the review rule, and the drift scan cannot read it — **RETIRED 2026-09-26**

`scripts/change-price.mjs` (PART 4) · `test/the-review-rule-is-stated-twice.test.mjs` (`actingTexts`)

That test derives its own subject rather than listing it: every tracked file under
`.claude/agents/`, `skills/` or `agents/` that names this file, plus `TIERS.review.how` taken from
the program so a reworded one is still scanned. What it is protecting is text a reader ACTS ON at
the moment of decision. As of this slice, `node scripts/change-price.mjs` prints which round is
next, the command that round must read, and whether it is owed — text a reader acts on, about this
file's rule — and no prefix in that derivation matches `scripts/`.

**Why it does not block.** Nothing false is printed today, and that is measured rather than
asserted: run the scan's own six-word-run comparison against the header over every file this slice
touched (`scripts/change-price.mjs`, `scripts/proof-plan.mjs`'s printed `how`,
`.claude/agents/staff-reviewer.md`, `agents/cmp-orchestrator.md`, the brief and the test) and the
shared count is **zero**. The one printed sentence that HAD stopped being true of the tree — "nothing
here records which of these rows was a round", false the moment `--record-review` grew `--round` —
was corrected in this same slice rather than logged. What is logged is the HOLE: the drift this gate
exists to catch can now happen one file over, silently, and the next person to reword the round
block has nothing checking them.

**Why logged and not fixed.** Widening `actingTexts()` is new mechanism inside a gate and outside
the brief that commissioned this slice, and a wider refusal owes docs/GATE-RULES.md Rule 1 a
calibrated kept plant of its own. It is also not a one-line widening: that test's header explains
why `TIERS.review`'s comment block is deliberately outside the scan — a comment may quote a dead
rule as history without being a second statement of the live one — and `scripts/` is full of exactly
that shape. The honest remedy scans what a program PRINTS, as it already does for one string, which
means driving each program's render rather than reading its source.

*Logged 2026-09-19 by the slice that created the hole, before any review round.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: nothing false is printed today: measured at zero six-word runs shared with the header across every file this slice touched, and the one printed sentence that had stopped being true of the tree was corrected here. What is logged is the hole, not a drift. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-130 — a discharged review's plan event does not say which round discharged it — **RETIRED 2026-09-26**

`scripts/proof-plan.mjs` (`reviewDischarge`, `planEvent`) · `scripts/lib/proof-history.mjs`

`reviewDischarge` builds `plan.reviewDischarged` from six named fields of the review record — `at`,
`treeHash`, `commit`, `tests`, `decisions`, `nothingFound` — and `--close` appends the whole plan to
`proof-plan-history.jsonl`. `round` and `kind`, added to the record in this slice, are not among the
six. So the kept plan history, which is what `--history` reads to answer what a settled slice cost,
can say that a review discharged a slice and never say which round it was.

**Why it does not block.** Nothing reads a round from there. The block that prices rounds reads
`qa-artifacts/review-history.jsonl`, where `recordReview` writes both fields, and that is the file
the pricing question needs; `--history` counts records, which is the honest unit for the question it
answers. Nobody is wrongly served today — what is lost is a future question ("how many rounds did
settled slices actually take?") that nothing asks yet.

**Why logged and not fixed.** Carrying the fields forward means touching the plan-event shape and
the summariser that reads it, which is `scripts/lib/proof-history.mjs` — the file KD-124 already
names as holding the second spelling of the attribution rule. Adding a field to it while that is
open would be a change bolted onto a seam this repository has already logged as needing a slice of
its own.

*Logged 2026-09-19 by the slice that created the gap, before any review round.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no reader consumes a round from there: the block that prices rounds reads `review-history.jsonl`, where both fields ARE written. The honest remedy edits the plan-event schema and its summariser, which is the file KD-124 already names. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-151 — a contradiction is resolved by precedence and refused by nothing — **RETIRED 2026-09-26**

`src/lib/args.mjs`, `packages/harness/install/args.mjs` (`flagBool`)

`--ios false --no-ios false` says both things at once, and so does `--ios --no-ios`. `flagBool`
answers from the affirmative name and never consults the `no-` twin, which is what it has always
done and is now pinned by test rather than left to the next reader of the body. There is no right
answer to a contradiction; there is only the choice between an arbitrary one and a refusal, and a
refusal here would have to be written and tested for a line nobody has typed.

**Fires when:** both spellings of one flag appear on one command line.
*Logged 2026-09-19, by the slice that closed KD-16.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no answer is right, so the honest act is to pin the one that has always been given rather than invent a refusal for a line nobody types; pinned by test, so a later change to `flagBool` has to mean it. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-152 — two declared booleans are read by presence, and so ignore their own value form — **RETIRED 2026-09-26**

`bin/create-cmp.mjs`, `packages/harness/bin/prooflane.mjs`

`--version` and `--help` are declared boolean — they must be, or they eat the token after them —
but both bins read them as `"version" in flags`, not as what the value says. So `--version false`
prints the version at both doors, which is the one place the tri-state contract does not hold.

It is required by KD-15. `--version` is a question, and the something-else at create-cmp's door is
the default command, `create`, which writes: with the value form normalized and no guard,
`create-cmp --version false --yes` fell through the dispatcher and scaffolded an app — KD-15's
exact shape, re-created by KD-16's fix on the way past. Measured before the guard was written.

**Fires when:** anyone writes `--version` or `--help` with a value.
*Logged 2026-09-19, by the slice that closed KD-16.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: required by KD-15: at create-cmp's door the something-else is `create`, which writes — normalizing their value form made `create-cmp --version false --yes` scaffold an app while the user waited for a version string. A question is answered in whatever form it is asked. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-132 — a review-round measurement stated three times, and re-readable in none of them — **RETIRED 2026-09-26**

`scripts/change-price.mjs` (PART 4 header) · `test/nothing-says-which-review-round-is-next-or-what-it-must-read.test.mjs` (header) · `docs/features/price-the-next-review-round.md`

All three carry the same sentence about the KD-123 slice — round 1 took **6.9 minutes**, round 2
took **3.6** — as the measurement that justifies printing the delta command for a later round. None
of the three says what was timed. The instrument was an agent's wall clock from spawn to report,
held by the human who ran it; nothing in this repository records a round's duration. The only
quantity a reader here can compute is the gap between that slice's two rows in
`qa-artifacts/review-history.jsonl` — `2026-09-18T20:16:05.182Z` to `20:21:21.355Z`, 5.3 minutes —
which is a different measurement of a different thing and matches neither number. So a reader who
tries to check the claim against the tree finds a third figure and no way to tell which is which.

**Why it does not block.** Nothing routes on the numbers, and the design they are offered in support
of does not rest on them: a later round reads the delta because `docs/KNOWN-DEFECTS.md`'s header
bounds it there, not because a stopwatch said so. The figures are very likely right.

**Why logged and not fixed.** The two honest remedies are both worse than the entry. Naming the
instrument in each of the three places makes three copies of one unheld fact where there are already
three copies of the fact itself. Recording it instead is new mechanism: a record carries `ranAt`,
which is one point in time, so a duration needs a start the reviewer does not currently write down.
This is KD-128's shape — a fact stated here that this repository can never red on — one file over.

*Logged 2026-09-19, review round 1. The 5.3-minute figure was computed from the kept records, not
estimated.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: nothing routes on the numbers and the design they support rests on the rule of record, not on them. What a reader CAN compute here is the gap between that slice's two review-history rows (20:16:05.182Z → 20:21:21.355Z, 5.3 min), which is a different quantity and matches neither figure — so the claim can be believed but never checked. KD-128 one file over. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-133 — the round block says CAP SPENT and hands back nothing, at the moment a re-record is owed — **RETIRED 2026-09-26**

`scripts/change-price.mjs` (`nextRound`, the cap arm)

Driven and read back rather than argued. With two rows attributed to the slice stating rounds 1 and
2 and `reviewState: "reopened"`, `nextRound` returns `verdict: "CAP SPENT — no third round"`,
`read: null`, `settles: []`. REOPENED is precisely the state the header's *"the LAST round re-records
after its own fix"* paragraph is about, and `--kind rerecord` — added by this same slice so that row
can be told from a cold read — is how that record is written. The sibling NOT-OWED arm, in the same
state, appends: *"proof-plan still reports the review tier REOPENED — that is a RECORD owed for these
bytes (`--record-review`, then `--discharge-review`), which is not another round."* Two arms of one
function, one of which knows this and one of which does not.

**Why it does not block.** The same screen already says it. Rendering that state end to end, the
`spent` review row prints *"REOPENED — nothing recorded here is standing … a fresh record is owed for
the SAME round"*, so no reader of the program's output is left without the act. What is lost is the
block's own answer at the moment that block is the thing being read, and the block is advisory
either way.

**Measured alongside it, and smaller:** the NOT-OWED arm's dirty branch — *"and the working tree adds
nothing either"* — cannot fire. `changedPaths` unions the range with `git status --porcelain`, so a
dirty tree always makes the delta non-empty and an empty delta always means a clean one. A sweep of
745,040 synthetic states over `nextRound` found NOT OWED reached only with an empty anchor delta and
CAP SPENT only with a row stating round ≥ 2 — the two directions that would ship a skipped review —
with that clause the only arm nothing reaches.

*Logged 2026-09-19, review round 1.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: driven and read back rather than argued: the same screen's `spent` review row already prints *"REOPENED … a fresh record is owed for the SAME round"*, so no reader of the program's output is misled. What is missing is the block's own answer at the moment that block is the thing being read. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-182 — the new check's own comment dates the shipped status line to a version that predates it — **RETIRED 2026-09-26**

`src/commands/doctor.mjs` (`cwdRelativeWalkSurfaces`, docblock) · `template/.claude/settings.json`

> *"`invokesWalk` above can only answer presence — it is a substring test, so the pre-0.26.3
> `node qa/walk-status.mjs --statusline` satisfies it while resolving against the SESSION's
> directory rather than this one."*

`template/.claude/settings.json` at 0.26.7 ships
`test -f qa/walk-status.mjs && node qa/walk-status.mjs --statusline || true`. The form the comment
dates to before 0.26.3 is the form in the tree now, and `git log -S` over that file finds no commit
that ever anchored the status line — KD-90 is the record of why it cannot be. So the sentence names
a population (older stamps) where the truth is every stamp, which is the very claim the same
commit's CHANGELOG gets right two files away: *"and **every new stamp**, because the template's
status line is still relative as it ships."*

**Nobody outside the repository is served by it** — it is a code comment, the diagnostic's behaviour
is correct, and the adopter-facing text does not repeat the error. What it can do is mislead the
next reader of the check into believing a current stamp is unaffected, which is the reader most
likely to touch it.

**Found in the same read:** `diagnoseProject` spells the new input `walk.cwdRelative ?? []`, so walk
inputs that omit the field score `ok` — health from an absent field, the fail-open direction. No
producer: `gatherWalkInputs` sets it on every return path and is the only caller. It is noted here
rather than separately because the remedy (drop the `??`) also edits
`test/project-doctor.test.mjs`'s untouched `wired` fixture, which is a second slice's decision.

*Logged 2026-09-19, review round 1 of the doctor-wiring slice.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the same slice's CHANGELOG states the population correctly ("**every new stamp**"), so nothing an adopter reads is wrong; what the false attribution can do is tell the next reader of that code that the shipped template is not among the affected. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-183 — a hook that resolves by `cd` is reported as one that does not resolve — **RETIRED 2026-09-26**

`src/commands/doctor.mjs` (`cwdRelativeWalkSurfaces`) · `src/lib/hooks.mjs` (`SCRIPT_PATH`, `unanchoredPaths`)

The anchoring detector reads one form of "this command resolves from any directory" — the path
itself carrying `${CLAUDE_PROJECT_DIR:-.}`. A command that gets there another way is reported as
inert. Measured by execution rather than argued, running each hook command through `/bin/sh` from a
temporary directory that is not the project, with `CLAUDE_PROJECT_DIR` exported as a hook receives
it, and watching for the walk's own output:

| hook command | walk ran from elsewhere | doctor says |
|---|---|---|
| `cd "${CLAUDE_PROJECT_DIR:-.}" && node qa/walk-status.mjs --inject \|\| true` | **yes** | cwd-relative; "only runs when the session starts at the project root" |
| `test -f "${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs" && node "${…}/qa/walk-status.mjs" --inject` | yes | anchored and still works |

So an adopter whose hook is already correct is told to anchor it, and the remedy printed
(`"${CLAUDE_PROJECT_DIR:-.}/qa/walk-status.mjs"`) leaves a working hook working.

**Nobody is wrongly served, and the direction is deliberate.** This is KD-180's first row one
surface over: over-reporting costs an adopter a re-read of a command that works, where the opposite
direction — claiming health over a surface that prints nothing — is the defect the whole slice
exists to close. `src/lib/hooks.mjs` says in as many words that it over-reports rather than
under-reports on purpose.

**It is also why the gate this round landed is one-directional.**
`test/doctor-claims-working-for-a-surface-a-foreign-cwd-cannot-run.test.mjs` asserts only that
doctor never CLAIMS a surface works when the shell says it does not; asserting the equality both
ways would have made a conservative refusal into a test failure, and a test that can be quoted to
argue for weakening a refusal is worth less than the refusal.

**Fires when:** an app hand-writes a `cd`-anchored, `pushd`-anchored or absolute-path hook and is
told by doctor that a surface which works does not.

*Logged 2026-09-19, review round 2 (re-record) of the doctor-wiring slice, by the reviewer, from the
same execution harness that produced the round's blocking test.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured by executing it from a foreign cwd: the over-report is the conservative direction the detector chooses on purpose (KD-180's first row, one surface over), the remedy it prints leaves a working hook working, and the opposite direction is now gated by `test/doctor-claims-working-for-a-surface-a-foreign-cwd-cannot-run.test.mjs`. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-180 — doctor's status-line verdict over-reports an absolute path, and its `ok` cannot be reached from a project — **RETIRED 2026-09-26**

`src/commands/doctor.mjs` (`cwdRelativeWalkSurfaces`) · `src/lib/hooks.mjs` (`ANCHORABLE_SURFACES`, `SCRIPT_PATH`)

Two properties of the check that stopped doctor scoring a silent status line as wired, both measured
on this tree rather than reasoned:

1. **An absolute path reads as cwd-relative.** `node /Users/x/app/qa/walk-status.mjs --statusline`
   resolves from every directory there is; the check reports it anyway. Two causes compound:
   `ANCHORABLE_SURFACES.statusLine === false` means no form written there is credited, and
   `SCRIPT_PATH` cannot tell absolute from relative — its first segment cannot start with `/`, so
   the match begins after the leading slash and the prefix is lost.
2. **`ok` is therefore unreachable end-to-end** for any project whose status line invokes the walk,
   which makes the warn unfalsifiable from a fixture directory. The two places the answer CAN still
   vary are pinned instead, and that is the whole of the negative control: the pure finding reads
   `ok` when handed `cwdRelative: []`, and the deriver returns `[]` for a project whose only walk
   invocation is an anchored hook — so it is not a function that always accuses.

**Nobody is wrongly served, which is why this is logged.** Nothing in this repository writes an
absolute status line and `doctor --fix` cannot (it copies the template), so the over-report has no
subject today; and over-reporting is the direction `src/lib/hooks.mjs` chooses on purpose, because
the other direction is an `ok` over a broken surface — the defect this slice exists to close. The
hook side keeps KD-86's blind spot unchanged: a single-segment `node walk-status.mjs` in a HOOK
still reads clean, where the same shape on the status line no longer does.

**Amended by review round 1, 2026-09-19 — the hook-side clause is unchanged in COVERAGE and changed
in CONSEQUENCE.** Reading clean used to withhold a warning; in the new finding it is read as credit
and printed as *"The UserPromptSubmit hook is anchored and still works from any directory"*, which
is a false sentence about a surface that produces nothing. That is not this entry's second row — an
adopter is told something false — so it is landed as a failing test rather than logged here:
`test/doctor-names-an-unanchored-surface-as-working.test.mjs`, which sweeps six hook spellings and
reds on three (bare basename, `sh -c '…'`, `eval '…'`).

**Fires when:** an app hand-writes an absolute status line and is told to fix a surface that works;
or `ANCHORABLE_SURFACES.statusLine` becomes `true`, at which point `ok` becomes reachable and the
fixtures in `test/doctor-calls-a-silent-status-line-wired.test.mjs` answer differently.
*Logged 2026-09-19, by the slice that introduced the check, against its own change.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured, both directions: nothing in this repo or its heal writes an absolute status line, so the over-report has no subject; the direction is the conservative one the detector chooses on purpose, and the under-report direction — an `ok` over a silent surface — is what this slice closed. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-181 — this tree stated the statusLine's stdin both ways, and the false one governed the live path — **RETIRED 2026-09-26**

`packages/harness/src/walk-status.mjs` + `template/qa/walk-status.mjs` (`readHookStdin`) · `src/lib/hooks.mjs` (`ANCHORABLE_SURFACES`) · KD-90

Two statements, both in this repository, that cannot both be true:

- `src/lib/hooks.mjs` and KD-90: *"A statusLine command receives the project root on STDIN instead,
  as `workspace.project_dir`."*
- `walk-status.mjs`, in a comment on the function that reads stdin: *"the statusline gets no stdin
  and must not wait on one."*

**Settled 2026-09-19 from the official Claude Code statusLine documentation — and the code comment
was the false one.** It is corrected in this commit rather than deleted, because it is the fact
whoever takes the real fix will need, and the version that was there would have sent them looking
for a mechanism that already exists. No behaviour changed: `readHookStdin` is called only under
`--inject`, and `--statusline` never read stdin either way.

**The out-of-tree facts, marked as such, which is KD-128's whole point** — all from that
documentation, read 2026-09-19, and nothing here reds if any of them moves:

| | |
|---|---|
| a statusLine command receives JSON on stdin | documented; every official example reads it |
| the payload carries `workspace.project_dir` (launch dir) and `workspace.current_dir` | documented schema |
| `CLAUDE_PROJECT_DIR` is **not** set for a statusLine — only `COLUMNS` and `LINES` | documented; this is the half KD-90 already had right, and it is why the anchor is inert there |
| the cwd of a statusLine command | **not documented** — which is precisely why a relative command is unreliable rather than merely unanchored |
| whether stdin EOFs when no payload is sent | **not documented** — so *"`in=$(cat)` cannot block"* is an INFERENCE, not a fact |

**So the honest framing, which KD-90 did not have: the mechanism exists.** The status line is
fixable — via stdin, not via a spelling of the env var. What is logged is that this slice does not
take it, and the reason is the last row of that table: a shipped template command that hangs would
make every session's status line wait forever, which is worse than one that prints nothing, and no
gate in this repository can red it. Taking it also means deliberately retiring two pins written to
fail the day it is fixed (`test/hook-anchoring.test.mjs`'s statusLine case and the executed case in
`test/inert-anchor-scored-as-protection.test.mjs`) — a deliberate act with its own proof, not a side
effect of correcting a diagnostic.

*Logged 2026-09-19, review round 1 of the doctor-wiring slice; the contradiction was found while
checking the brief's premises, and settled by a reading outside this tree.*

Closed entries live in [`KNOWN-DEFECTS-CLOSED.md`](KNOWN-DEFECTS-CLOSED.md), so this file stays the size a
reviewer can read every round. An entry moves there when the thing is fixed or the decision is
taken, with the commit that did it.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: settled 2026-09-19 from the official statusLine documentation (out of tree, KD-128's class): the comment was false and is corrected here. So the status line IS fixable — via stdin, not via the env var — and what is logged is that this slice does not take it: whether `$(cat)` can block with no payload is undocumented, and a status line that hangs is worse than one that prints nothing. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-161 — the round block asks whether the delta is empty, where the rule asks whether there were FIXES — **RETIRED 2026-09-26**

`scripts/change-price.mjs` (`nextRound`) · the rule is `docs/KNOWN-DEFECTS.md`'s header

The header conditions round 2 on one thing: **round 1's fixes were more than trivial.** The block
approximates that with "is the delta since round 1's record empty", and the two come apart in the
case that happens almost every time.

**Measured on the block's own first use.** Round 1 of the slice that added it (PR #163) found
nothing blocking, landed no failing test and **made no fixes at all** — and then did what this
file's header instructs every reviewer to do, which is log what it found. Two entries later the
delta was non-empty, and the block priced round 2 **OWED**. By the rule it was not owed: there were
no fixes to be trivial or otherwise.

**Why this is close to the whole population.** A round that finds nothing and logs nothing is rare;
a round that finds something and logs it is the normal case, and logging writes to this file. So
the delta is non-empty after almost every round 1, and the single NOT-OWED case the block can reach
is nearly unreachable in practice. The author of the slice predicted the same shape from the other
side — that until `--round` is populated everywhere, unknown resolves to OWED — and named the risk
as the `fleet L2 REQUIRED` wallpaper that `scripts/proof-plan.mjs`'s own header was born from.

**Why logged and not fixed, and why nobody is wrongly served.** It is an advisory: it refuses
nothing, exits 0, and in the measured case a human read it, disagreed with it and took the header's
answer, which is exactly the authority the block claims for itself (*"this cannot know whether the
fixes from round 1 were more than trivial, because nothing records it, and it does not guess"*).
Its error is in the expensive direction — it over-prices, never under-prices — which is the
direction this product chooses everywhere else.

**What would actually fix it, for whoever takes it.** Not a triviality rule: that was tried and
falsified before the slice was built (`adc947c` — a round-1 fix touching only review-irrelevant
paths, whose round 2 found a blocking defect). The honest lever is to separate the reviewer's own
log entries from the author's fixes in the delta, which needs the record to say which commits
answered the round — a fact nothing captures today, and the same shape as the `round`/`kind` gap
this slice just closed one level up.

*Logged 2026-09-19, from the first real use of the program it is about.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured on its own first use: round 1 of the slice that added it found nothing blocking, made NO fixes, wrote two log entries, and the block priced round 2 OWED. The header's rule is about round 1's FIXES, not about any delta. Advisory only — a human read it, disagreed, and took the header's answer. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-162 — the class-of-one sweep assumes its conclusion for two directories — **RETIRED 2026-09-26**

`test/a-minimal-lock-names-a-lane-the-tree-does-not-carry.test.mjs` (third case)

The third case proves `qa/harness.lock.json` is the only machine-written file outliving `--minimal`
by filtering the survivors through `APP_OWNED = ["qa/e2e/", "qa/golden/"]` — two whole directories
taken as app content by prefix. **That assumes the conclusion for everything under them.**

Executed on a real `--minimal` stamp, the claim is true today: the `qa/` survivors are exactly
`e2e/README.md`, `e2e/smoke.yaml`, `golden/home.json` (all authored for the app), the seven region
files, and the lock. So the sweep's answer is right; its *reason* is one degree weaker than it
reads.

**Why logged and not fixed.** A stronger sweep would have to derive app-ownership rather than
declare it, and nothing in the tree records who authors a file under `qa/e2e/`. Nobody is wrongly
served — the test's own subject is unaffected, and a new machine-written file under either prefix
would be a change someone made deliberately.

*Logged 2026-09-19, review round 1 of the KD-40 closure. Found by a reviewer reading the sweep's
allow-list rather than its verdict.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured: today's three survivors under those prefixes really are app content and the lock really is the only other one, so the claim holds — what is unpinned is tomorrow's addition, not today's answer. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-163 — the test guarding "a question does not scaffold" scaffolds into the repository when it fails — **RETIRED 2026-09-26**

`test/a-declared-booleans-value-arrives-as-a-string.test.mjs` (`run`, the KD-15 case)

Its subject is KD-15's shape re-created by KD-16's fix: `--version false` normalizes to the
boolean `false`, `if (flags.version)` stops being true, and the dispatcher falls through to
`create` — which writes. The bins now read `"version" in flags`, and this test drives the three
value forms through the real bin to prove it.

It drives them with `cwd = ROOT`, which is this repository's working tree, and asserts only
`r.code === 0` and what was printed. Its `run()` helper passes no `timeout`. So on the one
regression it exists to catch, the assertion it reports is not reached until the fall-through has
finished: measured 2026-09-19, `create-cmp` with a non-TTY stdin and no positional scaffolds into
the directory it runs in —

```
$ cd <empty dir> && node bin/create-cmp.mjs --no-install --no-ios --no-firebase --minimal </dev/null
  …  GREEN — build proven.   Done. cd ./myapp
  → 1788 files, a real :composeApp:assembleDebug (31.4s), exit 0
```

and `verify` defaults to TRUE, so the unqualified fall-through this test would produce runs that
build three times over, untimed, inside `npm test`.

The convention it departs from is in the same suite and for the same class:
`test/an-unrecognised-argument-is-obeyed-instead-of-refused.test.mjs`, *"a flag that asks for
information does not perform an action"*, builds a `sandbox()` cwd, sets `timeout: 60_000`, and
asserts `fs.readdirSync(box.cwd)` is `[]` with the message *"create-cmp --version wrote into the
working directory instead of answering"*. That third assertion is the one that turns this class
of failure into a sentence instead of a build.

**Why it is logged and not fixed.** Nothing fires while the guard holds, and the guard is green
and pinned; `myapp/` is gitignored (`.gitignore:57`, "Scratch scaffolds from engine test runs"),
so nothing a fall-through wrote would reach `observed-tree.mjs` or move a gate. No adopter is
reachable by it at all — the population is contributors running the suite on a tree where the
version guard has already regressed. The remedy is the sibling's three lines: a temp cwd, a
`timeout`, and `assert.deepEqual(fs.readdirSync(cwd), [])`.

**Fires when:** the `"version" in flags` presence guard at either door regresses to truthiness.
*Logged 2026-09-19, review round 1 of `fix-boolean-value-form-inverted-2`. Found by executing the
fall-through rather than reading it.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: cannot fire while the guard holds, and `myapp/` is gitignored so no gate reads what it would write. What is logged is a gate whose failure mode is a multi-minute untimed Gradle build inside `npm test` rather than an assertion. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-164 — two copies of one parser, justified by a packaging fact `npm pack` refutes — **RETIRED 2026-09-26**

`packages/harness/install/args.mjs` (`flagBool` docblock),
`test/a-declared-booleans-value-arrives-as-a-string.test.mjs` ("the two spellings … are the same
function")

Both say the same thing, and it is the whole stated reason the function is copied rather than
imported:

> neither package depends on the other, and the published root tarball carries no copy of this
> directory (`docs/proposals/PACKAGE-SPLIT.md` holds that decision)

Measured 2026-09-19, `npm pack --dry-run --json` at the repository root:

```
create-cmp-cli          389 files
  src/lib/args.mjs
  packages/harness/install/args.mjs      ← and eight more files of that directory
```

`package.json`'s `files` names `packages/harness/install` outright, and it has to: `bin/
create-cmp.mjs` imports `../packages/harness/install/init.mjs` for `create-cmp harness init`. So
the two copies ship in ONE tarball, which is the opposite of what the comment offers as the
reason they must be two. `docs/proposals/PACKAGE-SPLIT.md` is cited for the decision and says
nothing about tarballs or about that directory's publication.

**The decision survives; the reason does not.** The fact that actually forbids the import is the
other tarball: `prooflane-harness` packs 94 files, carries `install/args.mjs`, and carries no
`src/` at all — so `install/args.mjs` importing `../../../src/lib/args.mjs` would resolve in this
repository and crash for every adopter who installed the harness alone. That is a checkable fact
about the tree, it is the one the copy rests on, and it is not the one written down.

Nobody outside the repository is served by either sentence. What is logged is that the next
reader of the copy is told a packaging fact this tree answers the other way — and that unlike
KD-128, where the facts could not be re-read here, this one can: it is one `npm pack --dry-run`
away, in both directions.

**Fires when:** anyone reasons about whether the duplication can be collapsed.
*Logged 2026-09-19, review round 1 of `fix-boolean-value-form-inverted-2`. Found by packing both
packages rather than reading the comment.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the DECISION is right for a reason the comment does not give: `prooflane-harness`'s own 94-file tarball carries `install/args.mjs` and no `src/`, so the harness alone still cannot import the root's copy. Nobody is mis-served; the next reader of either file is told a packaging fact this tree answers the other way. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-166 — two spellings of "when is this product's output styled", and the test suite pays for the disagreement one file at a time — **RETIRED 2026-09-26**

`src/lib/log.mjs` vs `packages/harness/install/log.mjs`; `bf79f72`'s fix in
`test/a-dry-run-asked-for-in-words-writes-the-tree.test.mjs`

One product, two front doors, two rules for colour:

```
src/lib/log.mjs                      export const colors = pc        // picocolors
packages/harness/install/log.mjs     const enabled = !NO_COLOR && TERM !== "dumb"
                                                     && Boolean(process.stdout.isTTY)
```

picocolors also enables colour when `CI` is set, *whether or not stdout is a terminal*. The
harness's copy does not — its docblock says so outright: *"a log piped into a file or a CI
transcript carries no escape codes"*. So the same run through a pipe is styled at one door and
plain at the other.

**What it cost, twice.** `bf79f72` is the second per-file answer to this in the suite. `create-cmp
upgrade` prints `Dry run` in yellow, so under `CI=true` the reset lands mid-phrase and
`/Dry run — nothing written/` misses a message that is right there: green on a laptop, red on all
three CI Node versions. The fix strips styling in that file's `run()` helper — and
`test/the-fleet-command-names-a-front-door-the-caller-did-not-use.test.mjs` already carried its
own stripper for the same reason. Two files have the guard; **eighteen** other test files drive
`bin/create-cmp.mjs` and assert on its output without one.

Measured here, 2026-09-19, all twenty driven under the failing condition:

```
$ CI=true node --test <every test file that spawns bin/create-cmp.mjs>
  ℹ tests 154   ℹ pass 154   ℹ fail 0
```

so the class has no live member today: the other eighteen either assert on unstyled words or
match across the escape codes by accident.

**Why logged and not fixed.** Nobody is wrongly served. The adopter-facing half is cosmetic —
escape codes in a piped CI log from `create-cmp` and none from `prooflane` — and picocolors'
CI detection is a deliberate behaviour of a dependency this product chose. The contributor-facing
half has no live member to red. The honest remedies are both bigger than a review: one shared
stripper in `test/helpers/`, or one shared answer to the colour question that both doors read.

**Fires when:** the next assertion is written against a create-cmp word the command styles — it
will be green for its author and red on every runner, which is the shape this already took twice.
*Logged 2026-09-19, review round 2 (re-record) of `fix-boolean-value-form-inverted-2`. Found by
running the bin-driving half of the suite with `CI=true` rather than reading the fix.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured green both ways today — all 20 test files that drive `bin/create-cmp.mjs` pass with `CI=true` (154/154) — so no live member. What is logged is that the class has now been answered TWICE per-file (`bf79f72` here, and `the-fleet-command-…` before it) rather than once at the source, and that an adopter's piped CI log carries escape codes from one door and not the other. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-184 — `--=x` is refused as `--`, the one token both doors accept — **RETIRED 2026-09-26**

`src/lib/args.mjs`, `packages/harness/install/args.mjs` (`parseArgs`, the `=` branch);
`bin/create-cmp.mjs` (the unknown-argument refusal), `packages/harness/bin/prooflane.mjs`

`--=x` splits into the EMPTY name with value `x`, the empty name is unknown, and both refusals name
it as `--${name}`. Measured on `4be6b36`:

```
$ create-cmp upgrade --=x
  create-cmp: -- is not an argument this command knows.  …Nothing was written.
$ prooflane init --=x
  ✗ prooflane: -- is not a flag this command knows  …Nothing was written.
```

`--` is exactly the token both parsers DO accept (the npx end-of-options separator, dropped as
inert), so the sentence names something other than what was typed and calls it unknown. Refused,
exit 2, nothing written — nobody is wrongly served; the sentence is wrong. Before `4be6b36`
create-cmp named it `--=x`; the doors now agree on the worse sentence, because the settled design
converged the edge case rather than special-casing it at one door.

**Fires when:** anyone types `--=` followed by anything.
*Logged 2026-09-22, by the slice that closed KD-14 — its own finding, ruled logged rather than
fixed in this wave.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: refused, exit 2, nothing written; the sentence names something other than what was typed, and the doors converged on it rather than special-casing one. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-185 — the bundle's freshness hash reads this tree; the bundler reads whichever tree node_modules points at — **RETIRED 2026-09-26**

`inspector/mcp/src/lib/build-id.mjs` (`sourceFiles`, `harnessLibDir`) · `inspector/mcp/src/lib/ladder-bridge.mjs:33-36`

`sourceFiles()` walks `path.resolve(root, "..", "..", "packages", "harness", "src", <dir>)` — a
RELATIVE path, always this checkout. The modules it is hashing on the bundle's behalf are imported
by BARE specifier: `import { evidenceLadderFor } from "prooflane-harness/lib/evidence-ladder.mjs"`
and six more, which esbuild resolves the way Node does, by walking `node_modules` upward from the
importing file. In a git worktree with no `node_modules` of its own — which is every worktree in
`.claude/worktrees/`, and the shape this wave ran in — that walk climbs out of the worktree and
finds the MAIN checkout's `node_modules/prooflane-harness`, a symlink to the main checkout's
`packages/harness`. A rebuild there records this tree's hash over the neighbour's bytes, and both
freshness guards then call the artifact current.

Measured 2026-09-22, the resolution half only: from the worktree at `.claude/worktrees/wave-publish`,
`node packages/aliases/create-kmp/bin/create-kmp.mjs --help` printed 2270 bytes — the registry's
`create-cmp-cli@0.24.0` reached through the main checkout's `node_modules` — where this tree's own
`bin/create-cmp.mjs --help` prints 2951. The same worktree moved to `/private/tmp/...` resolves
neither. **The esbuild half is NOT measured**: esbuild is not installed in that worktree and no
rebuild was run, so "esbuild resolves it the same way Node does" is inference from its
`packages: "bundle"` setting, not an observation.

Not blocking: CI runs one root `npm ci`, which links the workspace `prooflane-harness` into the tree
being built, and `scripts/suite-preflight.mjs` refuses an uninstalled tree before the suite starts.
The exposure is a human or agent rebuilding the bundle from a worktree.

**Fires when:** someone rebuilds `dist/server.mjs` in a worktree that was never installed — which
the next person to touch `packages/harness/src/lib/` will be asked to do.
*Logged 2026-09-22, by the slice that closed KD-18, KD-31 and KD-134, against its own hand-off.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: needs a rebuild run from a worktree with no install of its own; CI installs at the root. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-186 — the publish skill calls a published package private — **RETIRED 2026-09-26**

`.claude/skills/npm-publish/SKILL.md:159-160`

"Publish from the **repo root only** — subpackages like `inspector/mcp` are `private: true` and will
fail with `EPRIVATE` (that error means wrong directory, not a config problem)."
`inspector/mcp/package.json` carries no `private` field and does carry
`"publishConfig": {"access": "public"}`; `@create-cmp/inspector@0.9.0` is one of the twelve names
`node scripts/ground-truth.mjs` lists as owned, under `independent`. Running `npm publish` there
publishes the inspector rather than failing.

Not blocking: the instruction the sentence supports is correct — the CLI is published from the root
— and a reader who follows it is in the right directory. What is false is the reason, and it is the
kind a reader repeats.

**Fires when:** someone reasons from "the subpackages are private" about what this repo ships, or
tries to publish the inspector and is told by the skill it cannot be done.
*Logged 2026-09-22, found while reading the release path for KD-134.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the instruction it supports (publish from the root) is right, its reason is false. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-187 — in this repo the create-* aliases run the registry's CLI, not this tree's — **RETIRED 2026-09-26**

`packages/aliases/{create-kmp,create-mobile,create-compose-multiplatform}/package.json` ·
`package-lock.json:1079`

Each alias declares `"create-cmp-cli": ">=0.7.1"` and resolves it at runtime with
`require.resolve("create-cmp-cli/package.json")`. The root package is not a workspace of itself, so
`npm ci` installs that dependency from the REGISTRY: the lock records `node_modules/create-cmp-cli`
at `0.24.0` while the tree holds `0.26.6`. Measured 2026-09-22 in an installed checkout:
`create-kmp --help` prints 2270 bytes, `bin/create-cmp.mjs --help` prints 2951 — different CLIs, two
versions apart.

Not blocking, and arguably correct: an adopter's `npx create-kmp` resolves `>=0.7.1` to the latest
published CLI, which is the intended pass-through. What is logged is that NO gate in this repo can
exercise an alias against the bytes this repo is about to publish; anything an alias appears to
prove here is a statement about an old release. The symlink gate KD-18 closed is unaffected — it
compares each alias against ITSELF through a link, and both runs reach the same delegate.

**Fires when:** a test is written that asserts an alias's behaviour and reads it as this tree's.
*Logged 2026-09-22, in the slice that closed KD-18.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the aliases are pass-throughs and an adopter gets the latest; no gate can exercise one against this tree. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-189 — a `cd` the shell performs, behind a word the reader does not count as a command position — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`CHDIR`, against `COMMAND_PREFIX`)

`COMMAND_PREFIX` is this file's one declaration of where a command may begin: a separator, plus a run
of wrappers, `VAR=value` assignments and redirections in any order. `CHDIR` does not use it. Its
command position is `(?:^|[;&|(\n])\s*`, a bare separator — so a `cd` with anything at all in front of
it is not found, the loop resolves nothing, and `commandCwd` falls back on the payload's cwd. That is
KD-79's own defect: the session's tree judged in place of the command's, which ALLOWS a merge whenever
the session happens to owe nothing.

Measured against `/bin/sh` as the oracle, `cd <X>` behind twelve prefixes, with `pwd -P` in place of
the gated command. Five are `cd`s the shell performs and the gate misses:

    X=1 cd X && gh pr merge          shell: X    gate: the payload's cwd
    2>/dev/null cd X && …            shell: X    gate: the payload's cwd
    command cd X && …                shell: X    gate: the payload's cwd
    builtin cd X && …                shell: X    gate: the payload's cwd
    time cd X && …                   shell: X    gate: the payload's cwd

`eval cd X` is refused (the safe direction), and `nice`, `env` and `nohup` cannot run a builtin at
all, so the shell does not move and the gate agrees. The live set is exactly the prefixes that keep
the `cd` in the outer shell.

This is KD-105/KD-107's class — two readers in one file meaning different things by "a command
position" — one reader further on. Not fixed by the slice that closed KD-95 because its subject was
the OPERAND, and the position is a second question with its own sweep to write: the honest fix gives
`CHDIR` the shared `COMMAND_PREFIX` run and re-runs the `/bin/sh` oracle over every wrapper, which is
the shape `test/a-construct-this-reader-cannot-follow-is-refused-wherever-it-stands.test.mjs` already
has for `COMPOUND`.

**Fires when:** a gated command puts an assignment, a redirection, `command`, `builtin` or `time` in
front of a `cd` that names another worktree.
*Logged 2026-09-22, by the fuzz that checked the KD-95 fix (49 disagreements with `/bin/sh` before
it, 23 after, and all 23 are this class).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: KD-107's class, a third reader over: the fallback direction is KD-79 itself, a merge judged against the session's tree. Measured against `/bin/sh` on five prefixes; unchanged by the slice that closed KD-95, which touched the operand and not the position. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-190 — two spellings of a fleet-check run the classifier still cannot see — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`FLEET_CHECK_WORD`, and `WATCHED.device` through it)

KD-95 widened the device pattern from "a run of non-space characters ending in a slash" to a shell
word with quoted spans and escapes in it, because the narrow one could not cross a space and a fleet
check under a spaced path was therefore never classified — silence, not refusal. Two spellings are
still outside it, measured with the module's own `classify`:

    node $(git rev-parse --show-toplevel)/scripts/fleet-check.mjs   →  null  (SILENT)
    node --no-warnings scripts/fleet-check.mjs                      →  null  (SILENT)

Both run the fleet check and neither reaches the gate, so an at-close device tier can be discharged —
or wasted — with no verdict in the path. They are not the same problem: the first is a substitution,
which the reader cannot read to a path and would refuse if it saw (`node "$(…)/scripts/fleet-check.mjs"`,
quoted, IS seen today and IS refused); the second is node's own flag grammar, which nothing in this
file models. Widening to either is a grammar decision, not a regex tweak, and the slice that takes it
should decide whether an unreadable-but-seen device run is refused or reported.

**Fires when:** a fleet check is invoked through a command substitution or behind a `node` flag.
*Logged 2026-09-22, in the slice that closed KD-95.*

**2026-09-22 — a third spelling, found by round 1 of the wave's review, and neither reason above
reaches it.** Quoting the FILE NAME itself — `node /T/A/scripts/"fleet-check.mjs"` or
`node /T/A/scripts/'fleet-check.mjs'` — is a wholly literal path with no substitution and no flag,
and `classify()` returns `null` for both while the shell runs the real file: SILENCE, which is what
KD-95 was. The cause is structural: every quoted alternative inside `FLEET_CHECK_WORD` has to end at
a `/`, so a quoted span that closes on the file name matches nothing and any quoted span not ending
at a separator is invisible. It is swept now rather than listed —
`test/a-fleet-check-the-shell-really-runs-goes-unjudged-or-is-judged-against-another-tree.test.mjs`
(`fb5715a`, on `wave/review-gates`) runs 690 real device-run spellings and pins these 84 rows as the
exact known-silent set by REASON, so a silent spelling of any other shape fails the suite, and
closing this one fails it too until the declaration is deleted.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the same fail-open KD-95's fleet half was, in the two shapes that slice did not widen to: a substitution is not a literal path, and a flag before the operand is a different grammar. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-191 — the allocator cannot see a branch that has no pull request — **RETIRED 2026-09-26**

`scripts/kd-next.mjs` (`nextKd`)

The three places it reads — the working tree, origin's main, every open PR head — do not include a
local branch with no PR, and that is this wave's own shape: six `wave/*` branches in flight against
two open PRs (#165, #167). Measured 2026-09-22: every wave branch's highest is 183, the same as
`origin/main`'s view and both PR heads', so nothing collided here — but only because none of them had
allocated a number yet when this ran.

Two things bound it. The program PRINTS what it saw, place by place, so a reader who knows a branch is
missing can see that it is missing rather than infer it. And no method can see an UNCOMMITTED entry in
another worktree, which is where a wave's numbers live for most of their life — `git show <branch>:…`
reads commits. Adding `git for-each-ref refs/heads` is four lines and covers the committed half; it was
not taken because the brief named three sources and a fourth changes what the printed account means.

**Fires when:** two branches with no PR both allocate, and the second one runs this.
*Logged 2026-09-22, in the slice that wrote it (KD-119).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured harmless today — all six wave branches are at 183, the same maximum `origin/main` and both PRs show — and the program says what it saw, so the gap is visible in its own output. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-192 — an unquoted brace expansion is a path this reader reads and the shell rewrites — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`LITERAL_PATH`)

`LITERAL_PATH` refuses `$`, backticks, `*?[]`, `~`, quotes, backslashes and whitespace, and does not
refuse `{` `}`. Measured: `cd /tmp/a{b,c} && gh pr merge` resolves `/tmp/a{b,c}` while `/bin/sh` runs
the merge in `/tmp/ab`. Nobody is wrongly served unless a directory literally named `{b,c}` exists —
with none, the resolved path is not on disk and the gate refuses with "is not there", which is the
right answer for the wrong reason — and `cd /tmp/a{b}` is not expanded by the shell at all (one
element), so the two agree. Left alone deliberately: the slice that closed KD-95 relaxed quoting and
tightened escapes, and adding a character to the unquoted class is a third change with its own oracle
rows to write.

**Fires when:** a `cd` operand carries a brace list AND the unexpanded spelling exists as a directory.
*Logged 2026-09-22, in the slice that closed KD-95.*

**2026-09-22 — the same shape one metacharacter over, found by round 1 of the wave's review.**
`LITERAL_PATH` also admits `>` and `<`, which a shell reads as redirection operators rather than path
characters: measured against `/bin/sh`, `cd /tmp/sweep/a>b;` in front of a gated command leaves the
shell in `/tmp/sweep/here` (its `cd /tmp/sweep/a` failed, stdout sent to `b`) while the gate resolved
`/tmp/sweep/a>b`. This entry's reason holds unchanged — the resolved path is reachable only if a
directory literally named with the operator exists, and otherwise the gate refuses it for not being
there — so it is recorded here rather than by widening `LITERAL_PATH`. It is pinned as the exact
known-bad reason by
`test/a-quoting-style-no-curated-row-covers-resolves-a-directory-the-shell-would-not.test.mjs`
(`4ec50f0`, on `wave/review-gates`), so it can neither grow to another character class silently nor
outlive its fix.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: cannot mislead unless a directory literally named `{b,c}` exists — otherwise the resolved path is not there and the gate refuses for that reason; measured both ways. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-193 — the oracle's failure message describes the gate's answer as the shell's — **RETIRED 2026-09-26**

`test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs` (the `wrong.push` template)

The row prints `the shell runs it in: ${got.dir === HERE ? "the payload's cwd" : truth}` — the
condition is about what the GATE resolved, and the sentence is about what the SHELL did. For
`cd /here"/sub" && gh pr merge` the gate resolved `/here` and the shell ran in `/here/sub`, and the
failure said the shell ran it in the payload's cwd. Only a diagnostic, and only on a failing row, but
it is the moment a reader is trusting the oracle to tell them which of the two was wrong.

**Fires when:** a row of that oracle fails.
*Logged 2026-09-22, while adding rows to that table.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a diagnostic only, on a failing row, in `test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs`; it misdescribes the oracle in the one moment a reader is trusting it. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-194 — `create-cmp upgrade --harness` writes `.claude/settings.json` too, by merge rather than by table — **RETIRED 2026-09-26**

`src/lib/harness-upgrade.mjs` (`EXCLUDED_PATTERNS`, `decideFile`) · KD-85, row 2

KD-85 stated: *"`create-cmp doctor --fix` is the one command that already writes into an app's
`.claude/settings.json`."* It is not. `create-cmp upgrade --harness` sweeps base ∪ new stamped trees,
`.claude/settings.json` is in neither exclusion list, and `decideFile` returns `applied` (write the
new engine's file) whenever the app's copy equals the base stamp. Measured:

```
isExcludedPath(".claude/settings.json") === false
decideFile({relPath:".claude/settings.json", base:A, next:B, theirs:A}).bucket === "applied"
```

**What the sweep does to an app's own hooks — measured.** Driven through the same `decideFile` the
planner calls per path (it really runs `git merge-file`), with base = the 0.26.2 template bytes,
next = the template at HEAD, theirs = that 0.26.2 file with one app edit on top:

| the app's `.claude/settings.json` | bucket | what lands |
|---|---|---|
| never touched | `applied` | replaced with the current template **exactly**; both anchors land |
| its own extra PreToolUse hook added, create-cmp's commands untouched | `merged` | **the app's own hook survives** and both anchors land; the file is not the template |
| create-cmp's Stop command replaced with the app's own | `conflicted` | **the app's file is not rewritten**; the engine's version lands beside it as `.cmp-new` |
| the Stop hook anchored by hand, differently (`cd "${CLAUDE_PROJECT_DIR:-.}" && …`) | `conflicted` | same — not rewritten, sidecar only |

So: **preserved or merged, never clobbered** — an app's own hooks survive, and the anchoring reaches
every case except a conflict on the very command create-cmp changed, which is also the case
`doctor --fix` refuses (a hand-edited command is not a shipped form). Two bounds on reading this as
KD-85's second reach: it is a whole-tree refresh (every engine-owned file, not the hooks) that
requires `create-cmp.json` and an explicit apply (`--harness` dry-runs by default), and what was
measured is the decision function with real bytes, not the end-to-end command, which additionally
stamps base and new from the app's recorded config. A minimal-mode app was not measured: its settings
file was re-serialised at stamp time, so its three-way merge is a different question.

`create-cmp harness upgrade` and `harness relock` really do not touch it —
`packages/harness/install/*.mjs` writes only the harness region (`isHarnessFile`: `qa/**` `.mjs`, two
declaration files, `qa/harness-source.json`), never `.claude/`.

**Nobody is wrongly served:** both doors leave a correct file; they differ only in mechanism, and
`doctor --fix` covers the case the merge conflicts on. What was wrong is KD-85's sentence, and the
correction is written into KD-85's closure rather than carried here. What stays logged is the fact
that sentence got wrong: there are TWO write paths into that file, and adding the table heal to the
merge path would be a second write path into a file the merge already governs.

**Fires when:** anyone reasons about which command can reach an app's `.claude/settings.json` from
the doctor heal alone.
*Logged 2026-09-22, by the slice that closed KD-85, while answering its brief's reach question —
found by reading the sweep and executing its decision table.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured preserved-or-merged, never clobbered: an app's own hooks survive and the anchors land, and the one case the merge conflicts on is the case `doctor --fix` refuses. KD-85's sentence is corrected in its closure. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-198 — the new walk fields keep KD-182's fail-open `?? []` — **RETIRED 2026-09-26**

`src/lib/project-doctor.mjs` (walk-wiring branch) · KD-182

KD-182's second paragraph records that `walk.cwdRelative ?? []` scores health from an absent field,
with the remedy deferred because it would edit `test/project-doctor.test.mjs`'s untouched `wired`
fixture. The KD-85 slice adds `walk.unconfirmed ?? []` and `walk.healable ?? []` in the same shape, on
purpose: mixing conventions inside one branch would be worse than the convention, and the producer
(`gatherWalkInputs`) sets all four on every return path and is the only caller. An `ok` therefore
still requires the absence of three fields rather than the presence of evidence.

**Nobody is wrongly served today** — no other producer exists — and the fix is the same one KD-182
defers, now over four fields instead of one.

**Fires when:** a second producer of the walk inputs is written and omits a field.
*Logged 2026-09-22 by the slice that added the fields.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no second producer exists — `gatherWalkInputs` sets all four on every return path and is the only caller — and the fix is the one KD-182 defers, now over four fields. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-199 — two superseded hook forms are recorded and deliberately never healed — **RETIRED 2026-09-26**

`src/lib/shipped-hooks.mjs` (`healedForm`, the narration entries)

The table records eleven commands. Two superseded ones are narration rather than invocation: the
pre-`f77e1cf` SessionStart (*"done is `node qa/verify.mjs` with a committed receipt"*, where the
current text says *"a receipt that attests this tree"*) and the pre-`f77e1cf` device-lease PreToolUse
reminder (which names `qa/lib/device-lease.mjs`, a path that later moved under `qa/lib/profiles/cmp/`,
and matches no `emulator`/`installDebug` command). `healedForm` refuses both, because their successors
describe a **newer lane than the app may have**: rewriting them into an app stamped at 0.25 would have
its agent told about a script that is not in its tree. Only a pair whose successor differs by the
anchor alone is healed — a rewrite that is identical at the project root whatever the lane version,
which the suite proves by executing both forms.

This is a decision, not an oversight, and it reads narrower than the brief that produced it ("replace
with that form's `current` successor"). Healing narration too is a field on two table entries plus a
decision about lane-version detection — and the diagnosis would have to say what it is changing,
because that rewrite changes what an agent is told rather than where a script is found.

**Fires when:** an app stamped through 0.26.2 carries a superseded narration command and someone
expects `doctor --fix` to bring it current.
*Logged 2026-09-22, as the one place that slice chose the narrow reading of its brief.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a decision, not an oversight: only a pair differing by the anchor alone is healed, which is identical at the project root whatever the lane version. Healing narration is two table fields plus lane-version detection. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-205 — one call site of the ordering check cannot say which of its four causes happened — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` — `contains()` and `behindBy()` inside `baseContext`

`gitAt` returns `{answered, ok, out, status, why}` and the design's own comment says *"`why` then says
which cause it was, for the agent"*. Four of the five call sites carry it into the reason. The two that
go through `contains()` / `behindBy()` do not: a `merge-base --is-ancestor` that produced no exit code
becomes `cannotSay("git could not compare this branch with origin/main")`, with the cause dropped.
Observed in the rewritten KD-165 test's own output:

```
[ok] `git … --is-ancestor …` died on SIGTERM after 91ms: git could not compare this branch with origin/main
[ok] `git … rev-parse …`     died on SIGSEGV after 64ms: git, killed by SIGSEGV, did not answer, so refs/remotes/origin/main could not be read
```

So for that one call the agent cannot tell a gate-timer kill from a crash from an OOM kill, which is
the distinction the whole file is about. The verdict is correct either way — this is about what the
allow SAYS, not what it decides. The fix is to return the `why` from `contains()` / `behindBy()` and
interpolate it the way the other sites do.

**Why it does not block.** Nobody is wrongly served: the check still allows and still says it could
not answer. It costs a reader one fact.
*Logged 2026-09-22, found while making KD-165's test read the path taken.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the verdict is correct either way: the check still allows and still says it could not answer. It costs a reader one fact, in the file whose whole subject is that distinction. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-208 — the four gate bounds now sum to exactly the hook's declared budget — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`ANSWER_RESERVE_MS`) with `.claude/settings.json`

Answering a PreToolUse payload now includes a stamp, so `ANSWER_RESERVE_MS` went 1500 → 3500
(measured stamp 0.27 / 0.26 / 0.30 s, capped at `STAMP_CAP_MS` = 3000). `TREE_PROBE_TOTAL_MS(1000) +
LANE_PROBE_TOTAL_MS(3000) + REMOTE_CALL_CAP_MS(2500) + ANSWER_RESERVE_MS(3500) = 10000`, which is
exactly the 10 s `.claude/settings.json` declares. The arithmetic test asserts `sum <= budget` and
passes, and the end-to-end slow-process-table test still answers well inside the budget — but there is
now **no slack**: the next bound added to this hook has to come out of `REMOTE_CALL_CAP_MS`, out of
the stamp's cap, or out of a deliberately raised timeout.

Not blocking: every bound is enforced by a kill-timer on its own subprocess, so the sum is a
worst case that requires all four to saturate at once; the measured real answer is ~0.5 s.

**Fires when:** a fifth bound is added without re-deriving this sum.
*Logged 2026-09-22, by the slice that bound the device tier to the stamped app.*

**2026-09-26 — the add step shares the stamp's cap; there is no fifth bound.** The schedule's one
stamp now also runs `create-cmp add firebase --no-verify` on the same scratch app and hashes it
again (`stampedApps`, `scripts/stamped-output.mjs`), so the Firebase L2 run is keyed on output
bytes. Measured on 2026-09-26 (3 rounds, node 24.18.0): the stamp took 161–233 ms, the add 58–66 ms
and each hash 14–25 ms, which is 0.25–0.34 s for both digests. The add runs under the stamp's own
deadline (`STAMP_CAP_MS` minus what the stamp spent), so `ANSWER_RESERVE_MS` still covers it and the
bounds still sum to 10000. If the cap is spent first, the Firebase half is unanswerable and its tier
reads OWED, naming why. It is never DISCHARGED, and the default half is unaffected.

**2026-09-26 — the suite stamps under its own bound; the hook keeps this one.** Under full-suite load
(`npm publish`'s `prepublishOnly`) a stamp plus its add outran 3000 ms, so tests whose claim is about
bytes failed on the clock: reproduced as 13 of 112 cases red under 96 CPU burners, green idle. A stamp
with no `timeoutMs` now takes `defaultStampCapMs()`: `STAMP_CAP_MS` everywhere, and `TEST_STAMP_CAP_MS`
(60 s) only under node's test runner (`NODE_TEST_CONTEXT`). The tests that are about the cap pass
`timeoutMs` and inject `now`. The hook's bound and this sum are unchanged, and a test pins that.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the arithmetic test asserts `sum <= budget` and passes, every bound has its own kill-timer so the sum is a worst case that needs all four to saturate, and the measured real answer is ~0.5 s; what is gone is the slack; the add step shares the stamp's cap (stamp + add + two hashes 0.25–0.34 s measured), so no bound was added. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-209 — `grep -r` in this environment obeys .gitignore, so a scan of a stamped app can miss the file that matters — **RETIRED 2026-09-26**

no source file — a fact about the tooling, recorded because it nearly cost a slice a defect

While hunting for machine-derived bytes in a stamped app, `grep -rl "/Users/" <app>` did not list
`local.properties`, which contains exactly that string: the shell's `grep` honours the app's own
`.gitignore`. The same scan for today's date was therefore also incomplete. Re-run through
`find <app> -type f -exec /usr/bin/grep -l ...` it lists both files, and that is how the three
normalisers in `scripts/stamped-output.mjs` were found to be complete.

**Fires when:** any future audit of a generated tree uses `grep -r` and concludes a pattern is absent.
*Logged 2026-09-22, by the slice that bound the device tier to the stamped app.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a fact about the tooling, not the tree, logged because it nearly cost a slice a defect: `find … -exec /usr/bin/grep -l …` lists both files, and that is how the three normalisers were shown complete. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-211 — the redirect host assumes the lane's device is an emulator — **RETIRED 2026-09-26**

`overlays/firebase/append/composeApp/build.gradle.kts` (`FIREBASE_EMULATOR_HOST`) ·
`template/composeApp/src/androidDebug/res/xml/debug_network_security_config.xml`

The stamped app redirects to `10.0.2.2`, the Android emulator's alias for the host's loopback, and a
Firebase emulator suite binds `127.0.0.1` because that is where the alias leads. If the lane's device
is not an emulator — `CMP_AVD` unset, a phone on USB — `10.0.2.2` is not the host, the startup
redirect fails, and because the template refuses to start rather than fall through to production
(KD-210) the failure is loud and the lane goes red at `e2eSmoke`.

The half of this that can refuse a wrongly declared host lives in the run machinery on branch
`wave/firebase` (`emulatorPlanFor`), which is not on this tree; what is on this tree is the
assumption itself, in the two files above. Loud and never silent, and the direction is the safe one:
a physical device cannot make a Firebase run pass against production.

**Fires when:** someone runs the covered check with a physical device attached.
*Logged 2026-09-21 by the wave's Firebase fixer; folded here 2026-09-22, re-aimed at the template
files that carry the assumption on this tree.*

**2026-09-26 — the refusal is on this tree.** `fleet-check --with-firebase` reads the redirect host
from the stamped tree (`readDeclaredRedirect`, `emulatorPlanFor` in `scripts/lib/fleet-firebase.mjs`).
It refuses when `CMP_AVD` is unset, before stamping anything, and when the host is not `10.0.2.2`,
before the suite or the lane starts, because only an emulator makes `10.0.2.2` the host. Which device
the lane drives when `CMP_AVD` is set AND a phone is attached is not verified here. An adopter's own
lane on a physical device still fails loud at `e2eSmoke`, as written.

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: loud, never silent: a physical device fails the startup redirect and the lane goes red at `e2eSmoke`, because the template refuses to start rather than fall through to production; `fleet-check --with-firebase` refuses a non-emulator host or an unset `CMP_AVD` before starting. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-212 — the table is derived from the template FILE's history, and create-cmp writes a command that file never carried — **RETIRED 2026-09-26**

`src/lib/shipped-hooks.mjs` (header claim, `SHIPPED_COMMANDS`) · `src/lib/minimal.mjs:148` ·
`test/shipped-hooks-table.test.mjs` ("every command this file has EVER carried is in the table")

The module header says the table is "every command create-cmp's template has ever written into an
app's `.claude/settings.json`, per surface". The guarding test reads exactly one source for that
claim — `git log --follow -- template/.claude/settings.json`, every commit, every command — and the
stamper does not only copy that file. `applyMinimalMode` rewrites the stamped copy and writes
`sessionStartCommand(MINIMAL_SESSION_CONTEXT)` into it: a string generated at stamp time from a
constant in `src/lib/minimal.mjs`, which `template/.claude/settings.json` has never carried at any
commit and which therefore cannot appear in the walk the test performs. Every past value of
`MINIMAL_SESSION_CONTEXT` sits in the same position. So the set of bytes create-cmp has put into an
adopter's settings file is strictly larger than the set the table is proven complete over, and the
one sentence stating the wider claim is guarded by nothing.

**Nobody is wrongly served today, in either direction.** A minimal stamp's SessionStart command is a
`printf` whose payload is entirely single-quoted, so the anchoring detector masks it and raises no
violation; it has no successor, so it is not healable; and a minimal scaffold has no
`qa/walk-status.mjs`, so `gatherWalkInputs` returns `null` and the walk-wiring finding never runs.
Doctor recognises nothing about it and claims nothing about it — which is the correct answer, reached
without the table. What is unpinned is the header's sentence, not any answer the tree gives.

**Fires when:** a future heal, or a future "doctor recognises this form" claim, is scoped to
`SHIPPED_COMMANDS` and meets a minimal-mode stamp — or when `MINIMAL_SESSION_CONTEXT` changes and the
old command becomes a superseded form with nowhere to be recorded.
*Logged 2026-09-22, review round 1 of the wave (doctor hooks area).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: no claim rests on it — a minimal stamp's command is fully single-quoted, so it is neither healable nor a violation, and doctor says nothing about it in either direction. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-213 — the `--dry-run` gate refuses four spellings of a write, where its own header names the class — **RETIRED 2026-09-26**

`test/a-dry-run-writes-the-tree-it-is-previewing.test.mjs` ("no project heal writes on its own") ·
`src/commands/doctor.mjs` (`healWriter`)

The slice's structural gate is the right shape: one writer, `healWriter`, owns every project heal, so
`--dry-run` is answered in one place rather than remembered in three — which is the fix for the defect
where three heals each ignored the flag. The test that enforces it, though, is an enumeration. It
counts `fs.writeFileSync(`, `fs.mkdirSync(`, `fs.rmSync(` and `fs.appendFileSync(` in the file's
non-comment lines and asserts the tuple `{1, 1, 0, 0}`. Its own header states the invariant one level
up — *"a heal that calls `fs` itself is invisible to `--dry-run`, which is exactly how three heals
came to ignore it"* — and that invariant is wider than the four strings. A heal added tomorrow that
used `fs.copyFileSync`, `fs.renameSync`, `fs.cpSync`, `fs.unlinkSync`, `fs.truncateSync`,
`fs.openSync` with `fs.writeSync`, `fs.promises.writeFile`, or `import { writeFileSync } from
"node:fs"` would mutate the adopter's tree under the flag and leave the gate green.

**Nobody is wrongly served today** — `src/commands/doctor.mjs` contains none of those calls, and the
two it does contain are both inside `healWriter`, which the same test checks. It is logged rather than
fixed because it cannot be landed as a failing test: a gate widened to the class is green on these
bytes, and this file's rule is that a review's output is a test that fails for the reason it claims.
The honest fix is a mechanism rather than a longer list — an allow-list of what `doctor.mjs` may
import from `node:fs` at all, which is a change to the module, not to the gate.

**Fires when:** the next project heal is written with any `fs` call other than the four, under
`--fix --dry-run`.
*Logged 2026-09-22, review round 1 of the wave (doctor hooks area).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: zero producers in the tree, and it cannot be written as a failing test: a widened gate is green on these bytes. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-220 — the publish payload stamps the app twice, and the reserve is sized for one — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`verdict`, `releaseContext`, `ANSWER_RESERVE_MS`)

`verdict()` calls `obligation()` for every classified kind, and `obligation()` stamps the app
whenever the device tier is required (`readStamped` → `stampedOutput`). For a `publish` payload it
then calls `releaseContext(root)`, which stamps again — unconditionally, and before `decide()`, so
it happens even on a branch the first line of the publish rule is about to refuse. Measured on this
tree 2026-09-22: `npm publish` 1.92 s, `gh pr merge --rebase` 1.09 s, the difference being one whole
stamp. `ANSWER_RESERVE_MS` is documented as covering one — *"Worst case: 3000 + ~200ms"* — so the
release path's worst case is 6200 ms of a 3500 ms reserve, and the arithmetic KD-208 is about no
longer describes it.

Not blocking: the whole hook answers in 1.9 s against a 10 s budget, and a stamp under 16 CPU
burners measured 1142–1824 ms against its 3000 ms cap, so the four bounds cannot saturate together
on any load this machine can produce. Worth saying plainly because the overrun direction is
fail-OPEN — a PreToolUse decision never delivered is a permitted command — and because the cheap fix
is to pass the stamp `obligation()` already took into `releaseContext` rather than taking a second.

**Fires when:** the stamp gets slower (a bigger template, a colder disk) on a release payload,
where a single reading is worth two everywhere else.
*Logged 2026-09-22, round 1 review of wave/review-proofs.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured 1.92 s against a 10 s budget (merge, one stamp: 1.09 s), and 1.1–1.8 s per stamp under 16 burners; the overrun direction is fail-open but has no producer today. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-221 — the local.properties normaliser blanks the whole file, not the machine pointer in it — **RETIRED 2026-09-26**

`scripts/stamped-output.mjs` (`NORMALISERS`, `MACHINE_POINTER`)

`local.properties` carries this machine's Android SDK path, which is rightly not a byte of the app —
so it is normalised. But the normaliser is `apply: () => MACHINE_POINTER`: it replaces the file's
ENTIRE content with a fixed buffer, where the thing that is machine-dependent is the `sdk.dir=` line.
Measured 2026-09-22 on a live stamp: appending `org.gradle.java.home=/nope` to a stamped app's
`local.properties` moves no digest at all. The file's own docstring states the narrower intent ("a
POINTER to a directory on this laptop"), and the module's rule three paragraphs up states the
standard this falls short of: *"A normaliser that dropped a field carrying real information would be
a hash that cannot see a change to the stamped app, which is the failure direction that matters."*

Not blocking, and deliberately not fixed by the round that found it: `src/scaffold.mjs`'s
`writeLocalProperties` writes `sdk.dir` and nothing else, and `template/` ships no
`local.properties` — only `local.properties.example`, which is watched in full. There is no producer
today, so no digest can be fooled by it.

**Fires when:** anything the scaffold writes into `local.properties` stops being a path to this
laptop's SDK. The fix is a line-scoped replace (`/^sdk\.dir=.*$/m`) instead of a whole-file one.
*Logged 2026-09-22, round 1 review of wave/review-proofs.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured — appending `org.gradle.java.home=/nope` moves no digest — but `writeLocalProperties` writes only `sdk.dir` and `template/` ships no `local.properties`, so there is no producer; the narrower spelling costs one regex. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-222 — the device digest cannot see an empty directory — **RETIRED 2026-09-26**

`scripts/stamped-output.mjs` (`hashStampedTree`)

The walk records a manifest row for a file and for a symlink; a directory is only recursed into. So
a directory that contains nothing contributes nothing, and two stamped apps differing by exactly one
empty directory hash the same. Measured 2026-09-22: creating
`composeApp/src/brandNewSourceSet/` in a stamped app moves no digest, where every other mutation
probed the same way — exec bit, dotfile content, added file, deleted file, new symlink, retargeted
symlink, `create-cmp.json` field, ADR body — moves it.

Not blocking: git cannot store an empty directory, so `template/` cannot ship one, and the scaffold's
feature strip removes whole directories rather than emptying them. No tree change today can produce
an app whose only difference is an empty directory, and an empty source set changes nothing Gradle
resolves.

**Fires when:** the scaffold starts creating a directory it does not immediately fill — a
placeholder source set, an output dir, a `.gitkeep`-less scaffold hole. The fix is one manifest row
for a directory the walk found empty.
*Logged 2026-09-22, round 1 review of wave/review-proofs.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: measured; git cannot ship an empty directory in `template/`, so a stamp cannot produce one as a difference today. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-223 — the test that caught two spellings of one hash now compares one spelling with itself — **RETIRED 2026-09-26**

`test/proof-gate-hook.test.mjs` ("npm publish: the gate hashes THIS tree exactly as the release proof records it")

The test exists because of the three-hash defect, fixed by `a6c303c` on 2026-09-17 and never given a
number: `fleet-check` recorded one hash, `proof-plan` compared a second and the publish gate computed
a third, and a release proof that PASSED on main was refused twice by a
gate no passing run could satisfy. Under the stamped-app criterion it now asserts
`releaseContext().now === stampedOutput(ROOT).hash` — and `releaseContext` *is*
`stampedOutputHash(root)`, imported from the same module, so both sides are one function called
twice. What it asserts is that the stamp is reproducible, which
`test/two-stamps-of-one-tree-are-not-the-same-app.test.mjs` already owns outright. Its comment calls
the right-hand side "an INDEPENDENT stamp … the same thing `fleet-check` hashes", which is not what
it is; the meta-guard that made the old comparison non-trivial (`observedTreeHash(…,
DEVICE_TIER_TRIGGERS) !== deviceTreeHash(…)`, i.e. "DEVICE_SKIP excludes something, so this test can
tell the two apart") was deleted in the same edit.

Not blocking, and it is not a gate edited into agreement: the three spellings really are gone — there
is one function and every reader calls it — so this test has nothing left to catch. What is wrong is
the sentence over it. The pair that genuinely must agree and is unguarded is `fleet-check`'s own
stamp path (`run()` with inherited stdio into `cmp-fleet-check-*`, then `hashStampedTree`) against
`stampScratchApp`'s (`spawnSync`, stdout ignored, into `cmp-stamped-output-*`); measured by hand
2026-09-22 over 242 files, the two agree, and no test holds them to it.

**Fires when:** the two stamp paths drift — a flag, a cwd, an stdio mode, a `--keep` — and the
first symptom is a device tier that can never be discharged by a real fleet run.
*Logged 2026-09-22, round 1 review of wave/review-proofs.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the device tree hash's three spellings (fixed by `a6c303c`, never given a number) really are gone, so there is nothing left for that test to catch; what is wrong is the sentence, and the pair that IS unguarded is a test nobody has written. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-224 — a render-cycle assertion became a poll, and a boot wait widened, in a change about something else — **RETIRED 2026-09-26**

`inspector/mcp/test/preview-service.test.mjs` ("service: a stale state with NOTHING pending says so")

The KD-131 fix is correct about its subject — the banner was fetched after the state was asserted,
and it is now taken between two readings of the state and kept only when both agree. Two other
things moved with it. `assert.equal(service.status().freshness.state, "fresh")`, immediately after an
awaited `_renderCycle()`, became `await waitFor(() => … === "fresh")`: the property "a completed
render cycle IS fresh on return" is now "is fresh within 5 s". And the boot wait, which was
`phase !== "idle"`, became `settled = pending === false && (phase === "idle" || phase ===
"unrefreshed")`.

Not blocking: `waitFor` throws on timeout, so both assertions still refuse — what changed is what
they refuse, not whether they do, and no adopter runs these tests. Logged because it is a gate
relaxed on the way past a different fix, which is the one thing a review round is for.

**Fires when:** `_renderCycle()` starts returning before the state it computed is visible, which
the old spelling would have failed on and this one waits out.
*Logged 2026-09-22, round 1 review of wave/review-proofs.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: `waitFor` throws on timeout so the assertion still refuses; it is a gate relaxed on the way past, in a change whose stated subject was elsewhere. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-226 — the fleet-check reader ends a word at a quote; the `cd` reader refuses one — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs` (`WORD_END`, `commandCwd`'s `device` branch) · KD-107's and KD-189's class, a third reader over

The slice added `WORD_END` so that a word continuing past its closing quote is refused instead of
resolved, and `test/a-worktree-under-a-path-with-a-space-in-it-is-a-tree-the-gate-can-name.test.mjs`
pins that row. The quote characters are in `WORD_END` deliberately — an `sh -c` wrapper around a
`node scripts/fleet-check.mjs` leaves its own closing quote sitting right after the file name, and
that row is pinned too. But a quote after an *unquoted* head does not end a shell word, it continues
it, so the mirror image of the pinned row is accepted. Measured against `/bin/sh`, 2026-09-22:

```
node /T/A/scripts/fleet-check.mjs"x"   shell word: /T/A/scripts/fleet-check.mjsx   gate: DIR /T/A
node /T/A/scripts/fleet-check.mjs'x'   shell word: /T/A/scripts/fleet-check.mjsx   gate: DIR /T/A
node "/T/A/scripts/fleet-check.mjs"x   shell word: /T/A/scripts/fleet-check.mjsx   gate: REFUSED   <- the pinned row
```

**The same tree's other reader refuses the identical construct.** A `cd` written as an unquoted head
with a quoted tail comes back *"a `cd` this gate cannot read literally"*, because `LITERAL_PATH`
excludes a quote from an unquoted word on exactly this reasoning ("an unquoted word carrying either
is one the shell assembles"). Two readers in one file, one rule — *where does a shell word end* —
and two answers. That is the class, and it is the class this file has already been bitten by twice.

**Direction: resolves a tree the command will not act in** — the direction that file's own header
calls "the worst outcome available here". **Fires when:** a `node <path>fleet-check.mjs` operand has
an unquoted head and a quoted tail. **Nobody is wrongly served:** the word the shell actually builds
is `…/fleet-check.mjsx`, which is not a file in any tree, so the run node performs is `Cannot find
module` whatever verdict the gate reached — there is no spelling of this that makes a *real* fleet
check run against an unjudged tree, because the concatenation can only ever extend
`fleet-check.mjs`. And `scripts/` is not in the published tarball, so no adopter reaches this reader.

**Not a one-line fix, which is why it is logged rather than patched.** Dropping the two quote
characters from `WORD_END` reds the `sh -c` row: there, `unclosedQuote(word)` is `null` because the
word itself contains no quote — the opening quote is before `node`, outside the slice `commandCwd`
looks at. Telling the wrapper's quote from the word's needs the reader to carry "was a quote already
open when `node` was reached", which `cmd.slice(at)` has thrown away. The honest fix is one
declaration of word-ending shared by both readers, which is a slice.

*Logged 2026-09-22, review round 1 of the review-gates area of the integrated wave.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: the word the shell builds is not a file in any tree, so the classified run cannot execute whatever the gate decided; `scripts/` is not published. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-227 — Rule 4's new sentence counts the oracle rows it added, and the count is wrong — **RETIRED 2026-09-26**

`docs/GATE-RULES.md` (Rule 4, the `/bin/sh`-as-oracle paragraph) · `test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs`

The paragraph now reads: *"Ten of the 24 shapes disagreed when that harness was written… **Four more
were added with KD-95**, for operands the reader saw only part of."* Counted off the two refs:

```
origin/main  SHAPES rows: 24
HEAD         SHAPES rows: 31      -> seven added, not four
```

The seven are: quoted-with-space, the same single-quoted, quoted-with-no-space, quoted joined to
unquoted, unquoted joined to quoted, a substitution joined to a path, and an escape at the end of a
path.

**Nobody is wrongly served and the argument does not rest on it** — the sentence's claim, that the
gate resolves what the shell would or resolves nothing, is the property the harness holds, and it
holds it over more rows than the doc credits. What the number does is the thing this repo has a
standing objection to: a count in the one document a reader is sent to instead of counting. It sits
in the same paragraph as the second half of **KD-104**, which already asks a human to decide whether
"runs 24 shapes" and "holds the invariant" should be said in one breath; that half was partly
answered here (the slice replaced "24 shapes" with "every shape in its table") and the new sentence
re-introduced a hard number one clause later. Worth fixing with KD-104 rather than alone.

*Logged 2026-09-22, review round 1 of the review-gates area of the integrated wave.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a count in a contributor-facing doc, in the same paragraph KD-104's note already asks to be re-read; the invariant the sentence describes is the one the harness holds. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-228 — the spine's lagging marker is object identity, and `--json` publishes an object that loses it — **RETIRED 2026-09-26**

`scripts/ground-truth.mjs` (`formatSpine`, `versionSpine`)

`formatSpine` marks a lagging surface with `spine.lagging.includes(s)` — reference equality against
the same array `versionSpine()` built. `groundTruth()` puts the whole spine on `--json`, and the
header of `versionSpine` says it is the answer `CLAUDE.md` sends every agent to for "counts and
versions, never by hand". A spine that has been serialised and read back — which is what `--json`
exists for — has a `lagging` array of *copies*, so `includes` is false for every row. Measured
2026-09-22 on a spine with one field forced to `0.26.9`:

```
live object:        X  .claude-plugin/plugin.json  version   0.26.9
                       NOT IN STEP: 1 field(s) do not read 0.27.0
after JSON round:      .claude-plugin/plugin.json  version   0.26.9    <- no marker
                       NOT IN STEP: 1 field(s) do not read 0.27.0
```

**Latent, not live:** the only caller today is `main()`, on the object it just built, and all six
test call sites pass a live `versionSpine(dir)`. **And the failure is not silent even then** — the
summary line is computed from `spine.lagging.length`, which survives the round trip, so a reader is
still told the spine is not in step; what they lose is *which field*. The fix is comparing
`s.version !== spine.version` in the formatter, which is the same predicate `versionSpine` already
uses to build `lagging` — i.e. the marker should be derived where it is printed rather than carried
by reference.

*Logged 2026-09-22, review round 1 of the review-gates area of the integrated wave.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: nothing calls it on a parsed spine today, and the summary line still reads `NOT IN STEP`, so the surface cannot claim health it does not have. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-230 — the not-read proof behind rule 2's unobserved list is a measurement nothing repeats — **RETIRED 2026-09-26**

`scripts/stamped-output.mjs` (`UNOBSERVED_BY_PROFILE`, and the NOT-READ PROOF comment above it)

Under rule 2, the digest holds the CONTENT of `AGENTS.md`, `CLAUDE.md` and `.claude/**/*.md` at a
placeholder for the `cmp` profile, because a grep on 2026-09-24 showed that no program in the L2 run
opens them. That is true, and this round measured it again: there is no non-comment reference to any
of them in `template/qa/**/*.mjs`, `*.json`, `*.kts` or `*.sh`, and the lane's directory walks start
at `docs/features`, `docs/adr` and the verified surface. But the proof exists only as a comment.
Suppose a later lane step reads one of these files (a Definition-of-done parser over `CLAUDE.md`,
say). The change to the step's code moves the digest once and buys one run. After that, edits to
the file it now reads move nothing, so a lane verdict can change with no L2 run owed.

**Why it does not block:** nothing reads these files today, so nothing is hidden. The remedy is a test
that repeats the proof: stamp the app, and fail if any file NOT on the unobserved list names an
unobserved path outside a comment. That test stops the list and the lane from drifting apart.

*Logged 2026-09-24, review round 1 of the first-job slice (L2 digest rule 2 + --rekey + cadence).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: cannot fire today: re-measured this round, no non-comment reference to any of the three in `template/qa/**/*.mjs`, `*.json`, `*.kts` or `*.sh`. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-232 — "this repository enables its own plugin", and no file in this repository does — **RETIRED 2026-09-26**

`scripts/hooks/resume-price.mjs:73`, `test/a-resumed-helper-is-priced-at-the-moment-of-the-send.test.mjs:295`,
`docs/proposals/RESUME-COSTS-MORE-THAN-RESTART.md:30-31`, `CHANGELOG.md` [Unreleased] Added

`e5f909c` removed the `.claude/settings.json` wiring so the note would not print twice. Its commit
message is accurate: the plugin is enabled "(user and local scope)". The prose in the tree says
something different: *this repository* enables its plugin, "the way every adopter does". In fact
`.claude/settings.json` has no `enabledPlugins`. The enablement lives in the maintainer's
`~/.claude/settings.json` and the untracked `settings.local.json`. A fresh clone of this
repository gets no `resume-price` note, and nothing in the tree can show whether it does. The proposal's bullet
also still says the hook ships as "plugin `hooks/`". It ships at `scripts/hooks/plugin-hooks.json`,
and the file's own comment says why. The proposal's Status line still reads "Not built."

**Why it does not block:** the note is advisory, and the only people who miss it are contributors
running without the plugin. The adopter path, through the plugin, is the one that was validated.
**Decision it asks for:** the approved brief said "wired in this repo's `.claude/settings.json` too".
The build reversed that, and the reversal was written into the brief as "decided 2026-09-24, at build".
Keep the reversal and correct the prose? Or enable the plugin in the project's
`.claude/settings.json`, so the sentence becomes true of the tree?

*Logged 2026-09-25, review round 1 of the resume-price slice.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: contributors, not adopters, and the hook is advisory; the proposal also still says "plugin `hooks/`" and "Not built.". Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-233 — the fresh-helper figure is called a floor, and it is not one — **RETIRED 2026-09-26**

`scripts/hooks/resume-price.mjs:86-93` (`FRESH_HELPER_TOKENS`)

The comment says the 37,019 comparison "is to a floor, as the carried figure is". This round measured
the first assistant turn's prompt (input + cache read + cache creation) in the helper transcripts on
the maintainer's machine, grouped by `agentType` from each `agent-<id>.meta.json`:

| agentType | n | first-turn prompt, median (range) |
|---|---|---|
| `deep-worker` | 83 | 11,377 (8,205–17,890) |
| `staff-reviewer` | 103 | 11,617 (9,009–13,420) |
| `general-purpose` | 363 | 50,444 (17,929–62,002) |
| `Explore` | 28 | 31,315 (14,641–39,912) |

For the helpers this repository restarts, 37k is roughly three times the real start. For
`general-purpose` it is below the median. Either way it is not a floor.

**Why it does not block:** the note tells an adopter "a fresh helper … starts at ~37k". That is within
the measured range for `general-purpose`, which is what an adopter's orchestrator spawns, and in every
case it is far below the threshold. The advice points the same way whatever the helper type. What
the log records is the word "floor" and a single sample standing in for several distributions.

*Logged 2026-09-25, review round 1 of the resume-price slice.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: not a floor in either direction. The figure is inside the range for `general-purpose`, the type an adopter restarts, and the advice points the same way. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-234 — a send to a running helper would be priced as a resume — **RETIRED 2026-09-26**

`scripts/hooks/resume-price.mjs` (`respond`, `advisory`)

The hook prices every `SendMessage` addressed by id to a helper in this session. The payload does not
say whether the helper has stopped, and neither does its transcript. If the harness delivers a send
to a helper that is still running, the note says "each step of this resume costs …" and "Resume
only if it holds unsaved state you need". In that case there is no resume. The helper's steps happen
whatever the sender does, and the advice could lead the sender to stop a healthy helper.

**Why it does not block:** this has not been seen. Every `SendMessage` result in the slice's own
session reads `"Resuming agent …"`. Whether a running helper can receive a send is a fact about
the tool's schema, and this tree cannot hold one (KD-128). If it can, one remedy is to stay silent
while the helper's transcript was written within the last few seconds. That needs a threshold,
which is a new calibration question.

*Logged 2026-09-25, review round 1 of the resume-price slice.*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: unobserved: every send result on record reads "Resuming agent …". Whether a running helper can be sent to at all is a tool-schema fact that cannot be kept in this tree (KD-128). Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-249 — `planShippedHookHeal` throws where it should skip — **RETIRED 2026-09-26**

`src/lib/shipped-hooks.mjs` (`planShippedHookHeal`; the catch in `shippedHookHealVerdict`, ~:488)

Found while fixing round 1 of the 0.28.1 slice. A settings file whose `hooks` key is written twice,
with the dropped copy holding an old shipped Stop form
(`{"hooks":{"Stop":[<old form>]},"hooks":{"UserPromptSubmit":[]}}`), makes `planShippedHookHeal`
throw a `TypeError` rather than return the skip it returns for a duplicated key elsewhere. Reproduced
by a direct call, not end to end. Before this slice `doctor --fix` reached the throw unguarded; the
offer fix made `shippedHookHealVerdict` the planner’s only caller (grep, 2026-09-25), and it catches
the throw and treats the file as healing nothing.

**Why it does not block:** no path reaches the throw unguarded now, and the file it needs is one
that only `JSON.parse`’s last-key-wins reading makes sense of. The planner itself still throws, so
a new caller would inherit it; the repair is the planner returning a skip for that shape.

*Logged 2026-09-25 (0.28.1 batch, round 1 fix).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: guarded: its one caller, `shippedHookHealVerdict`, catches the throw and heals nothing, so doctor neither crashes nor offers a fix there; a new caller of the planner would inherit it. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-253 — the KD-231 gate's create-cmp exemption still matches file and package names — **RETIRED 2026-09-26**

`test/a-shipped-agent-points-at-a-file-only-create-cmp-has.test.mjs:65` (the exemption after KD-250)

Found in review round 1 of `fix/kd-250-251-252`. KD-250 was one instance of a class — *a token
that contains `create-cmp` is not a statement of whose file a thing is* — and its repair strips one
spelling, `create-cmp:[\w-]+`. Measured by testing each shipped paragraph against a standalone
`(?<![\w./-])create-cmp(?![\w.:@/-])` instead: 19 paragraphs are exempt today ONLY by
`bin/create-cmp.mjs` / `<repo>/bin/create-cmp.mjs` (cmp-new, cmp-doctor, cmp-upgrade),
`create-cmp-cli@latest` / `create-cmp-cli` (the adopter's own npm command), `create-cmp.json` (the
adopter's own config file, cmp-firebase-connect), `create-cmp-scaffolded` (frontmatter) and
`/absolute/path/to/create-cmp/inspector/…` (cmp-inspect). None names a create-cmp-only pattern, so
nothing false ships; the gate is blind over those paragraphs for the next edit.

**Why it does not block:** a hazard that cannot fire yet. The repair is the class, not a longer
strip list: the exemption asks for `create-cmp` standing alone as a word, not inside a path, file,
package or namespace name.

*Logged 2026-09-26 (fix/kd-250-251-252, review round 1).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: none of the 19 names a create-cmp-only pattern today (measured); the same hazard as KD-250, one spelling over. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-256 — `--rekey` does not re-derive the Firebase L2 run's record — **RETIRED 2026-09-26**

`scripts/proof-plan.mjs` (`rekey`, `firebaseRecordMeets`) with KD-206

Found while wiring the Firebase L2 run into the schedule (`feat/firebase-runtime-proof`, plan R6).
A digest-rule bump (`STAMPED_OUTPUT_RULE` in `scripts/stamped-output.mjs`) makes every recorded
digest incomparable, and `--rekey` exists so that costs a stamp instead of a run: it re-stamps the
recorded commit, proves the old digest reproduces, and writes the new-rule digest beside the record.
It reads `readFleetRecord()` and writes `qa-artifacts/fleet-rekey-latest.json` — the DEFAULT run
only. The Firebase record (`qa-artifacts/fleet-firebase-latest.json`) has no rekey, and
`firebaseRecordMeets` passes `rekey: null` so the default run's rekey can never speak for it. After a
bump it therefore reads `other-rule`, and the tier is OWED until the Firebase L2 run runs again.
Worse for the reader: that answer's sentence is `recordMeetsTier`'s, which says to run `--rekey`
INSTEAD of the L2 run — for this tier, an instruction that changes nothing.

**Why it does not block:** it cannot fire until the rule moves, and when it does the direction is
safe — one ~4.5 min run, never a Firebase tier discharged by a digest nobody reproduced. The repair
is `--rekey` taking the Firebase record as a second input (and its own rekey file), or the reason
naming the tier it applies to. Not built: this slice logs it (plan R6).

*Logged 2026-09-26 (feat/firebase-runtime-proof, U2).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: cannot fire until the rule is bumped (it is 2 today, and the Firebase record is new under 2); the cost when it fires is one ~4.5 min run, never a false DISCHARGED. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-258 — a change-price assertion about unparsed history lines cannot fail — **RETIRED 2026-09-26**

`test/the-change-price-advisory-asserts-what-it-did-not-check.test.mjs` ("a history line that did
not parse leaves the count …")

Found by U6 of `feat/firebase-runtime-proof`. The loop asserts `r.malformed > 0 ||
/did not parse|malformed|unreadable/i.test(JSON.stringify(r))`. Every row `spendOf` returns carries
a `malformed` key, so the serialised row always contains the word and the assertion holds whatever
the count is. The test was written to catch a reader that drops the count; it would not.

**Why it does not block:** it is a test that cannot fail, not a product path that is wrong, and
the reader it guards is advisory (`change-price` refuses nothing). The repair is asserting
`r.malformed > 0` (or matching the rendered text, not the JSON), which may then expose the drop.

*Logged 2026-09-26 (feat/firebase-runtime-proof, U6).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: a vacuous assertion in a test, not a product path; the repair is asserting `r.malformed > 0` alone, which may then expose the drop the test was written to catch. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-259 — an UNDECLARED gate answer names less than the next step needs — **RETIRED 2026-09-26**

`scripts/hooks/proof-gate.mjs`, `decide("create")` and `decide("merge")`.

Found by review round 2 of `feat/firebase-runtime-proof`, measured over all 125 combinations of
the three at-close tiers' states. Two members of one class:

- The `gh pr create` reminder, in every combination where any tier reads UNDECLARED (61 of 125),
  never names `proof-plan.mjs --open`. It names the L2 command (`fleet-check`, or with
  `--with-firebase`) and `--discharge` — and the device gate refuses that command in that state
  with "no slice is declared … Declare first". The default tier and the review have done this
  since the reminder existed; the round-1 fix (`b6fffe4`) added the Firebase tier to it by parity.
- The merge refusal, when an L2 tier reads UNDECLARED, pushes one "Declare (…), discharge, then
  merge" line and suppresses the review's UNDECLARED line — and when both L2 tiers are UNDECLARED
  the Firebase one is suppressed too (`undeclaredRun` answers the default first). Declaring opens
  every tier, so an agent that follows the line literally — declare, run one L2 run, discharge,
  merge — is refused again for the tier the first answer already knew about.

What holds, measured in the same sweep: the reminder is issued in exactly the combinations the
merge refuses, and every merge refusal with a tier UNDECLARED names `--open`.

**Why it does not block:** this is create-cmp's own gate (`.claude/settings.json`), not an adopter
path; no answer is false, every refusal the instructions lead to names the right remedy, and after
`--open` `proof-plan.mjs` lists every owed tier. The repair is appending the declare step to an
UNDECLARED reminder note, and "then read node scripts/proof-plan.mjs" in place of "discharge, then
merge" on the undeclared merge line.

*Logged 2026-09-26 (feat/firebase-runtime-proof, review round 2).*

*Retired 2026-09-26 in the board cleanup: nobody is wrongly served, and nothing here is scheduled. Its own line: this repo's own gate, not an adopter path; every refusal it leads to names the right remedy (`--open`), and declaring opens every tier at once so `proof-plan.mjs` then lists them all. Round 2 of the Firebase slice extended both shapes to the Firebase tier by parity, which is the settled fix. Heard, so not re-raised; it moves back to the open log only if it fires.*

### KD-219 — `attach.mjs`'s new comment says the empty value "never arrives any more", and the suite passes it in — **CLOSED 2026-09-26**

`src/commands/attach.mjs` (`manifestFromFlags`, the `citation-roots` comment)

The comment the change put there reads *"the EMPTY value never arrives any more, because the door
refuses a value flag given none before any command runs (`emptyValues`, bin/create-cmp.mjs)"*. True
of argv through the bin; false of the function, which is exported and called with
`{ profile: "Bad Id", "citation-roots": "" }` by `test/attach-manifest.test.mjs:83` in this same
tree. The `roots.length` guard the comment was weakened around is still load-bearing and still
correct — only the reason given for keeping it is false.

**Fires when:** anyone reads the comment to decide whether the guard can go.
*Logged 2026-09-22, round 1 of the doors review.*

**CLOSED 2026-09-26 — the comment says both.** It now states that through the bin only `","` and its
like arrive, that the function is exported and called directly with `""`
(`test/attach-manifest.test.mjs`), and that the `roots.length` guard therefore cannot go. Comment
only; no behaviour moved, so no test was written for it.

### KD-261 — a failed compile of the instrumented tests is reported as a run that never started — **CLOSED 2026-09-26**

`packages/harness/src/lib/profiles/cmp/android-checks.mjs:51-54`, `androidChecksOutcome`; mirrored at
`template/qa/lib/profiles/cmp/android-checks.mjs:51-54`.

Found with KD-260. `androidChecksOutcome` answers every red Gradle run that wrote no JUnit results
the same way: "connectedDebugAndroidTest DID NOT EXECUTE — the run reported no tests at all, so this
step has observed nothing about your change and is not accusing it. Usual cause: another adb/Gradle
session touching the same device … Re-run this step alone with nothing else on the device before
suspecting the code". A compile failure of `src/androidInstrumentedTest` writes no results either, so
it gets that text, and an adopter whose build is broken is sent to look at the environment.

**Why it does not block:** the step is red (verdict ERROR, and the lane fails), never green; and the
Gradle tail printed under the text (the output lines matching `FAILED|error:|failed`) carries
`> Task :composeApp:compileDebugAndroidTestKotlinAndroid FAILED`. The repair is telling the two
apart: a `compile…AndroidTest…` task FAILED in the output is the build, not the device.

*Logged 2026-09-26 (fix/add-firebase-android-test-compile).*

**CLOSED 2026-09-26 — the build is named as the build.** `androidChecksOutcome` (both copies) now
tells the two apart the way the repair above says: a `> Task …compile…AndroidTest… FAILED` line in
Gradle's output answers *"the instrumented tests did not compile — <task> FAILED, so
connectedDebugAndroidTest never ran. This is the build, not the device"*, with the compiler's own
`e:` lines in the tail. The verdict stays ERROR (no behaviour was observed); a run that never started
keeps the environment advice. Test:
`test/a-failed-compile-of-the-instrumented-tests-is-named-as-the-build.test.mjs`.

### KD-262 — an earlier adopter's re-run of `add firebase` says the block is there and leaves the BoM out — **CLOSED 2026-09-26**

`src/lib/add-firebase.mjs` `planAppend` (`text.includes(BLOCK_OPEN)` returns null), `src/lib/upgrade.mjs`
`diffAgainstSet` (`notInProject` — "nothing is added")

Measured in-process on this branch: scaffold, plan and write `add firebase`, strip the `firebase-bom`
catalog lines and the `androidMain` platform line (the shape an app has after `add firebase` before
KD-260's fix), plan again. The re-run writes only `gradle/libs.versions.toml` (the `firebase-bom`
version and library come back) and lists `composeApp/build.gradle.kts (the add-firebase block)` under
`present`, which `create-cmp add` prints as `already there: …`. The platform line is never added, so
`compileDebugAndroidTestKotlinAndroid` still fails on that app. `create-cmp upgrade` does not add the
key either: a set key the app's catalog does not declare is `notInProject` and left out.

**Why it does not block, and the decision:** this slice does not make that app worse, and the
CHANGELOG's Fixed entry names the by-hand remedy. Whether `add firebase` should bring an older block
of its own forward (recognise its earlier bytes and rewrite them, as it already does for the legacy
`FirebaseConfig.kt`) or at least name the missing line instead of "already there" is a product
decision. KD-260's closed record carried this as "still open"; it lives here so it is read.

*Logged 2026-09-26 (fix/add-firebase-android-test-compile, review round 1).*

**CLOSED 2026-09-26 — the step brings its own earlier block forward.** The decision taken is the first
option above, the one the step already applies to the legacy `FirebaseConfig.kt`: `planAppend` reads
this step's earlier block for a file from `overlays/firebase/append-earlier/<rel>` (today one file:
the pre-KD-260 Gradle block, `git show a2accc1^:overlays/firebase/append/composeApp/build.gradle.kts`),
and when the app carries it byte for byte, rewrites it to the current block — the `androidMain` BoM
line lands, the marker appears once. A block that matches neither is the adopter's, edited, and is
still answered `already there`; that residue is narrower than this entry and is not re-logged. Test:
`test/a-re-run-of-add-firebase-brings-its-earlier-block-forward.test.mjs`.

### KD-218 — the unreadable-boolean refusal names `--no-<value-flag>` as a flag that takes `true` or `false` — **CLOSED 2026-09-26**

`bin/create-cmp.mjs`, `packages/harness/bin/prooflane.mjs` (the `unreadableBooleanValues` refusal);
`takesNoValue` in both `args.mjs`

`takesNoValue` returns true for **any** name beginning `no-`, and `unknownFlags` treats `no-x` as
known whenever `x` is — a rule written for `flagBool`'s boolean twins. Together they make
`--no-<value-flag>` a name both doors accept and then describe:

```
$ create-cmp harness init --no-target-dir=x
  create-cmp: --no-target-dir=x — that flag takes `true` or `false`, or no value at all.
$ prooflane init --no-profile=svc
  ✗ prooflane: --no-profile=svc — that flag takes `true` or `false`, or no value at all
```

There is no `--no-target-dir` and no `--no-profile`; the refusal tells the user those flags exist
and would take `true`. The bare form is worse but quieter: `prooflane init --no-profile svc` stores
`no-profile: true`, leaves `svc` a positional, and installs the lane into `./svc`. Refused or
accepted, nothing is written to a tree the user did not name — the sentence is wrong, the same
shape as KD-184.

**Fires when:** anyone writes `--no-` in front of a value flag.
*Logged 2026-09-22, round 1 of the doors review.*

**AMENDED 2026-09-25 — the words are fixed; the name is still accepted.** Both refusals now split
`--no-<value flag>` out of the booleans and say so: *"--no-target-dir=x — there is no
`--no-target-dir`: `--target-dir` takes a value, and has no `--no-` form."* A declared boolean's
refusal keeps its words byte for byte, and a line carrying both gets both sentences
(`test/a-refusal-names-a-no-form-a-value-flag-does-not-have.test.mjs`). What is left is the other
half of this entry, and it is not a wording fix: `takesNoValue` still reads every `no-` name as
boolean and `unknownFlags` still knows `no-x` whenever it knows `x`, so the bare form
`--no-profile svc` is accepted and `svc` becomes the project. Refusing it changes what both parsers
accept — KD-7's territory, where refusing a space-form token is how a user's directory gets eaten —
so it stays open for that decision.

**CLOSED 2026-09-26 — the bare form is refused too, in the same words.** `negatedValueFlags` (both
`args.mjs`) names every `--no-x` whose `x` is a known value flag, and both doors refuse the bare form
alongside the `=` form: *"--no-profile — there is no `--no-profile`: `--profile` takes a value, and has
no `--no-` form"*, exit 2, nothing written. A declared boolean's `--no-` form is untouched, and at
`create` the three declines `firebaseStampFlags` honours (`--no-region`, `--no-auth`,
`--no-google-services`) stay accepted. Refusing a name nothing reads is not KD-7's refusal of a space
form: no directory is eaten, the line is refused whole. Test:
`test/a-bare-no-form-of-a-value-flag-cannot-install-into-the-next-word.test.mjs`.

### KD-150 — a boolean's space form still takes the directory when the word is not `true` or `false` — **CLOSED 2026-09-26**

`src/lib/args.mjs`, `packages/harness/install/args.mjs` (`consumesNext`)

KD-16's fix normalizes `--x true` / `--x false` into real booleans. It deliberately stops there:
anything else after a declared boolean stays the user's positional, so both of these do what they
did before, measured 2026-09-19 —

```
$ prooflane init --dry-run maybe ../app     project: …/maybe   (not ../app)
$ create-cmp --no-firebase no my-app        scaffolds into ./no
```

Refusing the space form is the fix that re-creates KD-7: `create-cmp --minimal my-app` would
become an error, and an adopter may have a directory called `no`. Only the `=` form, which has no
positional to lose, is refused (KD-153). What is logged is that the space form remains a way to
lose the directory you named — `--flag <dir>` for a boolean `--flag` puts `<dir>` first in the
positionals, and for `prooflane init` the first positional is the tree to install into.

**Fires when:** anyone writes a word that is not `true`/`false` after a declared boolean.
*Logged 2026-09-19, by the slice that closed KD-16.*

**CLOSED 2026-09-26 — two directories are refused; the one-directory space form still works.** The
directory was lost because every command read a fixed number of positionals and silently dropped the
rest, not because the boolean took the word. Both doors now refuse a surplus positional (exit 2,
nothing written): `prooflane init|relock|upgrade` take one directory, `create-cmp` one (two for
`add` and `harness`, whose first is the subcommand). `create-cmp --minimal my-app` and
`prooflane init --dry-run maybe` are unchanged — the word is still the directory, and says so in
`project:`. Test: `test/a-word-after-a-boolean-cannot-push-the-named-directory-out.test.mjs`; the
control in `test/a-declared-booleans-value-arrives-as-a-string.test.mjs` now pins the one-directory
form and that the two-directory form is not refused as an unreadable value.

### KD-260 — after `add firebase` the instrumented tests do not compile: no Firebase BOM on the androidTest classpath — **CLOSED 2026-09-26**

`overlays/firebase/append/composeApp/build.gradle.kts` (the step's Gradle block), `overlays/firebase/edits.json:4`,
`src/versions/registry.json`

Found by the first Firebase L2 run (trunk, d2162b8, 2026-09-26). The fleet scratch app, after
`create-cmp add firebase --no-verify`, passed build, releaseBuild (R8) and e2eSmoke; `androidChecks`
then failed at `:composeApp:compileDebugAndroidTestKotlinAndroid` resolving
`:composeApp:debugAndroidTestCompileClasspath`: `Could not find com.google.firebase:firebase-auth-ktx:.`,
and the same EMPTY version for firebase-firestore, -functions, -storage, -messaging, -config-ktx and
-common-ktx. An adopter who adds Firebase and then runs their own lane goes red there.

**Cause, measured.** GitLive's android artifacts publish their `com.google.firebase` dependencies
with no version and leave it to the Firebase BoM, which they require on their RUNTIME variant only.
`dev.gitlive:firebase-app-android-debug:2.1.0`'s `.module` on Maven Central lists
`firebase-common-ktx` without a version on both `debugApiElements-published` and
`debugRuntimeElements-published`, and `firebase-bom` (`requires 33.2.0`, category `platform`) on the
runtime one alone; `firebase-auth-android-debug:2.1.0` has the same shape, and
`firebase-app-android:2.4.0` requires `firebase-bom` 33.15.0 the same way. The debug and release
classpaths resolved (CI's `assembleDebug`); the instrumented tests' compile classpath, which sees the
API variant only, had no BoM, and the post-add `composeApp/build.gradle.kts` named none.

**Closed 2026-09-26, on `fix/add-firebase-android-test-compile`.** The BoM version sits in the same
registry row as `firebase-gitlive`, as `versions["firebase-bom"]` (`src/versions/registry.json:23`
and `:70`, 33.2.0 beside GitLive 2.1.0; `:117`, 33.15.0 beside 2.4.0), so `upgrade` moves it with
`firebase-gitlive` and promotion carries it with the set's `versions`. `add firebase` reads it through
`versionsFromRegistry` (`overlays/firebase/edits.json:4`) into the catalog, with a `firebase-bom`
library (`:13`), and the step's Gradle block adds
`androidMain.dependencies { implementation(project.dependencies.platform(libs.firebase.bom)) }`
(`overlays/firebase/append/composeApp/build.gradle.kts:19-21`): androidMain reaches the debug,
release and instrumented-test classpaths alike. The default stamp does not change.
`test/fixtures/libs.versions.toml` gains the key, because `test/upgrade.test.mjs` asserts that fixture
declares every key of set `2026.06`.

**Proof.** On the kept failing app, `compileDebugAndroidTestKotlinAndroid` FAILED in 1 s before the
hand edit; after it, that task plus `assembleDebug` were BUILD SUCCESSFUL in 1m42s (57 tasks
executed). On a fresh fleet stamp (`--yes --name FleetCheck --package com.fleet.check --no-ios
--no-verify`) plus `add firebase --no-verify` from this branch, the same two tasks were BUILD
SUCCESSFUL, and again with `--rerun-tasks --no-build-cache` in 19 s (58 executed), so the green was
not replayed from the kept app's build cache. `test/the-firebase-ios-pods-follow-the-gitlive-version.test.mjs`
fails 2 of its 5 tests without the change (3beac39) and passes 5/5 with it. Not run: the
instrumented tests themselves (compile-only proof).

**Still open, logged not built.** An app that ran `add firebase` before this fix already carries the
step's block, and `planAppend` writes nothing when `BLOCK_OPEN` is present
(`src/lib/add-firebase.mjs:313`, read, not run), so a second run does not add the BoM line; the
adopter adds it by hand. And a candidate set that moves `firebase-gitlive` without `firebase-bom` is
refused by nothing except the KD-260 test's table of measured pairs.

### KD-254 — KD-251's closing record said a comment was not changed that its own branch changed — **CLOSED 2026-09-26**

`docs/KNOWN-DEFECTS-CLOSED.md` (KD-251's closing paragraph, last sentence)

Found in review round 1 of `fix/kd-250-251-252`: the record ended by saying
`test/an-agent-definition-names-a-tool-it-was-not-given.test.mjs:7-9`'s comment was unchanged, and
2744188 on the same branch had rewritten it, and had changed the resume line in
`.claude/agents/staff-reviewer.md`, which the record did not mention. **Closed** on the same branch
by rewriting that sentence to say what 2744188 changed. Measured by reading 2744188's diff against
the corrected sentence.

### KD-251 — a warm-cache resume rule and a resume-the-reviewer re-record rule — **CLOSED 2026-09-26**

`agents/cmp-orchestrator.md` ("Resume or fresh" and the `resume-price` paragraph after it);
this file's header ("the LAST round re-records after its own fix — resume that reviewer")

Found reading 24474f7..51ad59e. 47ad12e made a resume require a warm cache, "within about five
minutes of its last step". The orchestrator's next paragraph still says a reviewer asked to
re-record "holds the kind of state that rule means", and this file's header says to resume that
reviewer rather than start a cold one. A re-record comes after the author's fix commit and usually
a suite run, so the reviewer's cache is past five minutes by then, and under the amended rule it is
started fresh.

**Why it does not block:** the re-record sentence is create-cmp's own process and no adopter is
served wrongly by it. **Decision asked:** does the re-record exception survive a cold cache (the
reviewer's reading is worth its uncached re-read), or does a re-record become a fresh reader
confirming one finding against the moved bytes? Either way, one of the two texts changes.

**Closed 2026-09-26, on the `fix/kd-250-251-252` branch — Karel's decision of 2026-09-26.** A reviewer whose cache has gone cold is not resumed to re-record; a FRESH reviewer reads only the delta (the bytes that moved since the recorded round) and records with `--kind rerecord` under the same round number, and a reviewer is resumed only while its cache is warm, per ADR-0015 as amended 2026-09-26. The decision is stated in two places, once each: this file's header ("THE RECORD STAYS BOUND TO THE TREE", the rule of record for when a re-record is owed and who does it) and `.claude/agents/staff-reviewer.md` ("Briefed for a re-record?", what that reviewer does, pointing at the header for when). `agents/cmp-orchestrator.md`'s `resume-price` paragraph no longer claims a re-recording reviewer "holds the kind of state that rule means" and only points at the header, and `scripts/proof-plan.mjs`'s `REVIEW_KINDS` comment no longer calls a re-record "the same reader" (a comment; no program printed the old rule). Measured: `test/the-review-rule-is-stated-twice.test.mjs` (no acting text shares a six-word run with the header) and the KD-231 gate pass after the edits. 2744188 then made `test/an-agent-definition-names-a-tool-it-was-not-given.test.mjs:7-9`'s comment a pointer to the header, and made `.claude/agents/staff-reviewer.md`'s "For the orchestrator" resume line read the warm cache as a condition, as ADR-0015 amended it (KD-254 corrected this record, which first said that comment was unchanged).

### KD-250 — the plugin's agent name satisfies the create-cmp-only marking — **CLOSED 2026-09-26**

`test/a-shipped-agent-points-at-a-file-only-create-cmp-has.test.mjs` (the `/create-cmp/.test(para)` skip)

Found reading 24474f7..51ad59e (the 0.28.1 additions). The KD-231 gate lets a paragraph name
create-cmp's own files when the paragraph "says create-cmp", and tests that with a bare substring.
`create-cmp:executor` is the plugin's namespace, not a statement of whose file something is, yet it
matches. Measured by stripping `create-cmp:<name>` and re-running the paragraph split over both
shipped agents: exactly one paragraph loses its exemption — `agents/cmp-orchestrator.md`'s
"Model tiering" block, a single paragraph because its bullets have no blank lines between them —
and it names none of the create-cmp-only patterns today.

**Why it does not block:** nothing false ships now; the gate is blind over that paragraph for the
next edit. The repair is one line: test the paragraph with `create-cmp:[\w-]+` removed.

**Closed 2026-09-26, on the `fix/kd-250-251-252` branch.** The gate now tests the paragraph for `create-cmp` only after removing every `create-cmp:<name>` (`para.replace(/create-cmp:[\w-]+/g, "")`, `test/a-shipped-agent-points-at-a-file-only-create-cmp-has.test.mjs:65`), so the plugin's namespace in an agent name no longer marks a paragraph as create-cmp's. Measured: with `scripts/proof-plan.mjs` planted in the orchestrator's "Model tiering" paragraph, the old test passed 2/2 (blind), and the new one failed by name — `agents/cmp-orchestrator.md: names "scripts/proof-plan.mjs" in a paragraph that never says it is create-cmp's: ## Model tiering — delegate execution, keep judgment`; with the plant reverted, the new test passes 2/2.

### KD-252 — a stamp-failed test's scratch cleanup races git on CI — **CLOSED 2026-09-26**

`test/a-run-whose-stamp-failed-is-refused-for-a-reason-that-is-not-true.test.mjs` (its `fs.rmSync`
cleanups)

Found on PR #175's CI, 2026-09-26: "and the program says the same thing: --discharge on a
stamp-failed record names the stamp" failed with `ENOTEMPTY: directory not empty, rmdir
'/tmp/stamp-failed-…/.git/objects'`, so Node 20 and 24 were cancelled with it. The re-run passed on
all three, and the file passes locally. A recursive remove that meets a directory still being
written — most likely a git process the test spawned, finishing after the test returned — fails
this way.

**Why it does not block:** no product path is involved and nobody is served wrongly; it costs a CI
re-run when it fires. The likely repair is `maxRetries` on those `rmSync` calls, or waiting for the
spawned git to exit before cleanup.

**Closed 2026-09-26, on the `fix/kd-250-251-252` branch.** The file's three scratch cleanups (`test/a-run-whose-stamp-failed-is-refused-for-a-reason-that-is-not-true.test.mjs:124`, `:151`, `:194`, the only `rmSync` calls in it) now pass `maxRetries: 5, retryDelay: 100`, which Node documents as retrying a recursive remove that meets `ENOTEMPTY` (or `EBUSY`, `EMFILE`, `ENFILE`, `EPERM`) with a linear backoff, instead of throwing on the first. Measured: the file passes 6/6 locally on Node 24.18.0 with the change. Not measured: the race itself, which reproduces locally neither in the entry's measurement nor in this run, so the fix rests on Node's documented retry and not on an observed failure turned green; the other repair the entry named, waiting for the spawned git to exit, was not built.

### KD-248 — `harden --dry-run` does not list the architecture doc the apply regenerates — **CLOSED 2026-09-25**

`src/commands/harden.mjs` (`runHarden`'s dry-run listing vs `hardenProject`'s `regenerateArchDoc`)

Found in round 1 of the 0.28.1 slice. KD-242 added `regenerateArchDoc(projectDir)` to the apply
path; the dry-run listing is built from the merge plan and the seed plan only, so it prints every
file the apply writes except `docs/ARCHITECTURE.md`, and the apply then reports
"regenerated docs/ARCHITECTURE.md". The write touches only the `cmp:generated` sections, which the
lane's archDoc step owns and would fail on anyway — so the adopter is not handed a change to text
they own. Logged, not blocked: the preview is one line short, not wrong.

**Closed 2026-09-25, on the release-0.28.1 branch: not a defect, measured.** The premise was that
the dry-run listing, built from the merge plan, lacks the doc. On the KD-242 fixture (`--minimal`,
`add firebase`, then `harden --dry-run`) the merge plan already carries `docs/ARCHITECTURE.md` as a
write, and the listing prints every planned write (`src/commands/harden.mjs:233-236`), so the
preview names it; the apply's regeneration then rewrites the `cmp:generated` sections of a file the
plan was writing anyway. On a plain `--minimal` app the plan writes the doc too, and the apply does
not regenerate it. Measured by an in-process run of the plan and the apply on both fixtures, and by
the CLI's `--dry-run` output. Unmeasured, and reasoned only: the doc would be missing from the
preview if the merge left it byte-identical while the generator still rewrote a section; the dry
run also never says WHICH sections it regenerates.

### KD-241 — a heal write is not atomic — **CLOSED 2026-09-25**

`src/commands/doctor.mjs:482-491` (`healWriter`)

`healWriter` writes with `fs.writeFileSync(target, content)`. That truncates the target before it
writes. A full disk or a kill mid-write can leave a truncated `.claude/settings.json` where the app's
own file was.

**Why it does not block:** it has not been observed, and it needs a failure inside one small write.
A write that throws is still reported as "could not write" (KD-214), but the original bytes are not
restored. The atomic form is to write a temporary file beside the target and rename it.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** `healWriter` no longer writes onto the target: its own body (`src/commands/doctor.mjs:521`, write at :584-586) writes the content to a temporary file in the target's directory, keeps the target's mode, and `renameSync`s it over the target (following a symlink to the file it names); on any failure it `unlinkSync`s the temporary file and rethrows, so the original bytes stay and KD-214 still reports "could not write". A file this user may not write is still refused with EACCES before any write (:578), since a rename needs only the directory's permission. `test/a-heal-write-never-truncates-the-file-it-replaces.test.mjs` proves it (a write that fails part-way, a rename that fails, and a success that keeps mode and symlink): 1/3 before the fix, 3/3 after; `test/a-heal-that-cannot-write-takes-the-diagnosis-down.test.mjs` stays green. The dry-run gate `test/a-dry-run-writes-the-tree-it-is-previewing.test.mjs:208` was strengthened, not loosened: every mutating `fs` call (sync, callback or promises form, rename/chmod/unlink included) must sit inside `healWriter`'s body, and a stray `fs.renameSync(` planted outside it was seen to fail the gate by name. A symlinked target keeps its link whether it is live or dangling, and the write lands where the system reads the link: a live one is resolved with `fs.realpathSync.native`, and the rename goes ahead only if `statSync(target)` (the kernel's own reading) names that same file and it is a regular file (:549-556); a dangling one is followed hop by hop, each link's text appended as a string to its directory, that path's parent resolved with `realpathSync.native` and the last name kept (:566-575), so the temporary file is written beside the file the last link names and renamed onto it; a destination directory that does not exist is reported as "could not write" (KD-214), never made. Link text ending in "/" (or in `.`/`..`), or a target the system does not read as a regular file, is refused on `.failed` with the tree untouched. As first closed, a dangling link was replaced by a plain file; review round 1 caught that with `test/a-heal-write-keeps-every-symlink-it-writes-through.test.mjs` (live and dangling, absolute and relative): 2/4 before the fix, 4/4 after. After that round, resolution was Node's JS `realpathSync` and `path.resolve`, which read `..` as text and drop a trailing "/": a link to `linked/../settings.json` (where `linked` links a directory) hung `doctor --fix`, `linked/../x.json` printed "wrote" into a stray file, and a dangling link ending in "/" printed "wrote" over a path the link then read as ENOTDIR. Review round 2 caught that with `test/a-heal-write-lands-where-the-system-reads-the-link.test.mjs`, the kernel as oracle: 1/5 before the fix, 5/5 after. `realpathSync.native` alone is not the kernel's reading either: macOS realpath(3) returns the file for a live link ending in "/", which the kernel refuses with ENOTDIR (measured), hence the `statSync` check. Residual, not built: a hard-linked target is split from its other links.

### KD-243 — Firebase iOS is pinned while GitLive floats — **CLOSED 2026-09-25**

`overlays/firebase/edits.json:69-71` (the Podfile lines), `:4` (`versionsFromRegistry`)

The overlay writes `pod 'FirebaseCore'`, `'FirebaseAuth'` and `'FirebaseFirestore'` at `'~> 11.0'`.
The GitLive Kotlin version (`firebase-gitlive`) is taken from the registry at add time. A GitLive
release built against a newer Firebase iOS would get pods one major version behind it.

**Why it does not block:** only an iOS build reads the pods, and no L2 run compiles one (KD-206). A
mismatch fails at pod resolution or link time, loudly.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** The registry is a local pinned file
(`src/versions/registry.json`), so the pairing now sits next to `firebase-gitlive` in each set, as
`firebaseIos` (`:27`, `:73`, `:119`), with GitLive's own catalog as the source: `firebase-cocoapods`
in `GitLiveApp/firebase-kotlin-sdk` `gradle/libs.versions.toml` is `11.1.0` at tag `v2.1.0` and
`11.8.0` at `v2.4.0`, and `firebase-app/build.gradle.kts` builds its `pod("FirebaseCore")` at that
version at both tags (fetched 2026-09-25). The overlay's Podfile lines carry tokens
(`overlays/firebase/edits.json:68-75`); `firebaseIosPodFor` (`src/lib/add-firebase.mjs:200`) writes
`~> <major>.<minor>` of the paired version and refuses, naming the file and the GitLive tag to read,
when the set's GitLive has no pairing or a pairing for another version (`:438`, `:475`). Measured
through the CLI: a Kotlin 2.2.20 app gets GitLive 2.1.0 and `pod 'FirebaseCore', '~> 11.1'`, where it
got `'~> 11.0'` before. `test/the-firebase-ios-pods-follow-the-gitlive-version.test.mjs` fails
3/3 without the change and passes 3/3 with it. Still open: `scripts/promote-set.mjs` copies no
`firebaseIos` from a candidate, so a newly promoted set fails that test and is refused for an iOS
app until the pairing is recorded, loudly rather than with a guessed pin.

### KD-242 — `--minimal`, then `add firebase`, then `harden` may leave the architecture doc stale — **CLOSED 2026-09-25**

`src/lib/add-firebase.mjs:591-593`, `src/lib/minimal.mjs:14-16,23-24`

`add firebase` regenerates `docs/ARCHITECTURE.md` with the app's own `qa/lib/arch-doc.mjs`, and
skips when that file is absent. Minimal subtraction deletes machine-owned `qa/` scripts outside the
preview entry points' keep-set, and `harden` installs them back. If the generator is outside the
keep-set, the doc misses the Firebase change and the freshness check fails after `harden`.

**Why it does not block:** no part of this has been measured, including whether the generator is
outside the keep-set. If it fires, it is a red check the adopter clears by regenerating the doc,
never a false green.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** Measured first, and it fired. A CLI stamp with
`--minimal --no-verify` kept only `qa/preview-gallery.mjs` and its imports, so `qa/lib/arch-doc.mjs`
was gone; `add firebase --no-verify` left `docs/ARCHITECTURE.md` byte-identical; after `harden`,
`node qa/arch-doc.mjs --check` exited 1 on `[layer-file-inventory]`, which lacked
`remote/FirebaseConfig.kt`. The same stamp and `harden` without `add firebase` checked fresh. By
reading, not measured: anything else a minimal app gains while it has no walker is missed the same
way. `harden` now regenerates the generated sections with the
walker it has just installed, before the lock is taken (`src/commands/harden.mjs:156-162`, the
app's own generator, no second copy), and says which sections it rewrote. Re-measured through the
CLI: `--check` exits 0. `test/a-minimal-app-that-added-firebase-hardens-to-a-fresh-arch-doc.test.mjs`
fails without the change and passes with it, with no Gradle run.

### KD-240 — two style reads in `json-in-place` that are slightly wrong — **CLOSED 2026-09-25**

`src/lib/json-in-place.mjs:171`, `:196`, `:245-246`

The file's escape style is read from `/\\u[0-9a-fA-F]{4}/` over the raw text. That also matches a
string holding a literal backslash-u and four hex digits (`"C:\\ucafe"`), so such a file gets its
inserted non-ASCII escaped. Separately, in a one-line file an inserted value is written as
`JSON.stringify(v)`. The key separator follows the file, but the colons inside the inserted value
have no space after them, whatever the file uses.

**Why it does not block:** neither changes what the JSON means. Both are the file's own style read
slightly wrong, on a path whose purpose is keeping that style (KD-197).

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** (a) The escape style now counts only a real
`\uXXXX` escape, whose backslash follows an even run of backslashes, zero included:
`/(?<!\\)(?:\\\\)*\\u[0-9a-fA-F]{4}/` (`src/lib/json-in-place.mjs:198`). (b) A value rendered on
one line goes through `withSeps` (`:147`), which spells each key colon in `JSON.stringify`'s output
as the file's own key separator, and each comma between items as the file's own item separator
(`itemSep`, `:235`, read from the first two members that share a line). It skips strings, so a colon
or a comma inside a string value is left alone (`:224`); items inserted into an empty container on
one line are joined the same way (`:291`). That covers a one-line file and a member added on the
bracket's line in a multi-line file. `test/json-in-place-reads-the-files-style.test.mjs` checks all
three, and JSON.parse of every result deep-equals the edit's value. Its escape and colon tests fail
on the tree before the first fixing commit, and its comma test on the tree before the second (4/5
pass there, 5/5 after). Its two controls pass on both trees: a real escape, and an escaped
backslash before a real escape.

### KD-237 — doctor offers `--fix` on a settings file `--fix` declines — **CLOSED 2026-09-25**

`src/lib/project-doctor.mjs:481-498`, `src/commands/doctor.mjs:724,727` (the offer), `:588,593` (the decline)

The "installed but not wired up" walk-wiring finding always carries `fix: { auto: true }`, so doctor
prints `fix (--fix):` under it. When `.claude/settings.json` is not JSON doctor can read, or parses
into a shape it does not read, `--fix` declines to write it. Since this batch the decline is printed
with its reason. The offer above it is unchanged.

**Why it does not block:** nothing is written and nothing is claimed healed. What is wrong is a
promise one line above a refusal that names itself.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** The readable-or-not judgement is now one
function, `readWalkSettings` (`src/commands/doctor.mjs:264`): JSON.parse plus
`walkSettingsShapeProblem`. The heal's decline calls it (`:610`), and so does the diagnosis
(`:287`), which now hands a parse failure to the finding as `walk.unparseable` next to the existing
`walk.unreadable`. The walk-wiring "installed but not wired up" finding offers `fix (--fix):` only
when neither is set; otherwise it is a plain `fix:` that says what to do by hand
(`src/lib/project-doctor.mjs:498-520`). `test/doctor-offers-fix-only-where-fix-writes.test.mjs`
runs `doctor` on an unparseable file, a `hooks` array and a top-level array (no `--fix` offered,
the by-hand words printed) and on a readable file (still offered). It fails 3 of 4 on the tree
before this commit. A readable file that `tryEditJsonInPlace` declines (a duplicate key) is not a residual: `--fix`
falls back to rewriting the whole file and says so (`src/commands/doctor.mjs:705`, from `1397047`),
so the offer holds there too. Measured with `doctor --fix` on a duplicate-key file (rewritten whole)
and a first member on the bracket’s line (edited in place).

### KD-246 — the Stage 3 gate's header quotes a bar the road lowered — **CLOSED 2026-09-25**

`scripts/stage3-gate.mjs:3-4`, `docs/NORTH-STAR.md:419`

The header quotes §9 as "10 repos upgraded by one command". The road dropped the bar to 2 on
2026-09-09, and the gate reads the figure out of NORTH-STAR rather than holding it. The sibling
comment in `scripts/stage-gate.mjs` ("seven of its ten rows") is already gone.

**Why it does not block:** it is a comment in an unpublished script, and the predicate reads the live
figure.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** The header of `scripts/stage3-gate.mjs:3-6` no longer quotes a count: it gives §9's criterion as "N repos upgraded by one command", says N is read out of `docs/NORTH-STAR.md` and never held in the file, and states the trigger as "more than N repos" (the road's trigger had also moved, to "more than 2"). The two other comments that stated the bar as ten went the same way: `:31` ("§9's N repos") and `:126-127` ("It does not run N lanes … one lane run per repo"). The "ten" left in the file is illustration, not the bar: an operator holding ten repos (`:63`) and the attack list (`:156-195`, "Ten paths is not ten repos"). The predicate is unchanged; `test/stage3-fleet-size.test.mjs`, `test/one-command-upgrades-a-declared-fleet.test.mjs` and `test/two-fleet-readers-diverge-on-a-field-the-corpus-never-varies.test.mjs` pass (12/0).

### KD-245 — "KD-67" names two defects — **CLOSED 2026-09-25**

`docs/KNOWN-DEFECTS.md` (KD-223's entry and row), `test/two-stamps-of-one-tree-are-not-the-same-app.test.mjs:107`,
`docs/KNOWN-DEFECTS-CLOSED.md:58`

KD-223 and the test comment cite KD-67 for the three-hash defect: `fleet-check` recorded one hash,
`proof-plan` compared a second and the publish gate computed a third. KD-67 in the closed log is a
different defect, "§9 says the attestation is reported NOT MET". The number collides in the log
that `kd-next` exists to keep collision-free (KD-119).

**Why it does not block:** only a person reads the number. The three-hash defect's own number was
not found in either file, so the correction needs that looked up first.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** The three-hash defect never had a number. It was found and fixed in one commit, `a6c303c` (2026-09-17, "fix(gate): the release gate hashes the tree the way the release proof records it"), whose message records the incident — a proof that PASSED at L2 on main, recorded `3ed5e09`, refused twice by a gate that computed `eb734f5`, and 0.26.0 published by hand — and which logged only KD-58, a different defect. Neither KNOWN-DEFECTS file nor CHANGELOG.md names it under any number, and `git log -S "KD-67"` over both logs reaches back only to `9728527`, the attestation commit that KD-67 belongs to. So no number was allocated: the three citations now describe the defect and name `a6c303c` — KD-223's row and entry in `docs/KNOWN-DEFECTS.md`, and the comment at `test/two-stamps-of-one-tree-are-not-the-same-app.test.mjs:107-109`. The line this entry cited in `KNOWN-DEFECTS-CLOSED.md` is KD-67's own heading, which is right and did not change.

### KD-239 — `cmp-new` points at a `docs/CONTRACT.md` that does not exist — **CLOSED 2026-09-25**

`skills/cmp-new/SKILL.md:162`

"Build exactly the shape from `docs/CONTRACT.md` (validated by `options.schema.json`)". No
`CONTRACT.md` is tracked anywhere in this tree, in `docs/` or in `template/`.

**Why it does not block:** the same sentence names `options.schema.json`, which exists and is what
validates the shape. The dangling pointer costs the agent one failed read.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** `skills/cmp-new/SKILL.md:162-163` now reads "Build exactly the shape the engine's `options.schema.json` defines — it is the options reference, and the schema the engine validates this object against". That is what is true: `src/scaffold.mjs:47` validates against `options.schema.json`, the npm package ships it (`package.json` `files`), and `docs/USAGE.md:171` names it "the authoritative shape". `docs/USAGE.md` is not named in the skill, because the agent running `cmp-new` sits in the adopter's tree, where create-cmp's `docs/` is not; the skill's `:214` already says "the engine's `--help` / `options.schema.json`". No `CONTRACT.md` was created. The same name in two engine comments that ship in the npm package, `src/lib/toggle.mjs:4` and
`src/lib/tokens.mjs:3`, is gone too: each comment states the syntax it cited. `docs/DOCUMENTATION.md:116`
keeps its `CONTRACT.md` row, correctly: it lists the file among the maintainer-local docs `.gitignore`
keeps out of a clone. No test: the change is one sentence of skill prose, and a gate that every path a skill cites exists would be a new gate.

### KD-238 — the architecture diagram names a third party's package — **CLOSED 2026-09-25**

`docs/ARCHITECTURE.md:12`

The diagram labels the CLI "`npx create-cmp` ← the CLI, usable by anyone". `create-cmp` on npm is not
ours. ADR-0006 keeps the name `create-cmp-cli` because the bare name will never resolve to this
project.

**Why it does not block:** it is a label in a contributor-facing diagram, not an install step. The
correction is one word.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** `docs/ARCHITECTURE.md:12` now labels the CLI `npx create-cmp-cli`, the name ADR-0006 keeps; the column width of the diagram is unchanged. The file is hand-written: it carries no generated region markers, no script in `scripts/` or `src/` writes it (the `docs/ARCHITECTURE.md` those name is the stamped app's), and its history is three hand commits. No test: it is a label in a contributor-facing diagram, and `test/an-adopter-is-told-to-npx-a-package-this-project-does-not-publish.test.mjs` walks `template`, `overlays` and `skills`, not `docs/`.

### KD-236 — the iOS-off ADR credits an interview that a command line never had — **CLOSED 2026-09-25**

`src/lib/adr-seed.mjs:126`

The seeded ADR says iOS was switched off "(`platforms.ios: false`) during the cmp-new interview".
An app stamped with `--no-ios` on the command line had no interview. The room-off ADR had the same
sentence and was corrected in this batch (`:99` now says "answered at the stamp's interview or stated
on its command line"). This one was not.

**Why it does not block:** the decision the ADR records is right. Only the clause about where it was
made is wrong, and the file belongs to the app.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** The iOS-off ADR's context (`src/lib/adr-seed.mjs:126-128`) now reads "`platforms.ios: false` in `create-cmp.json`, answered at the stamp's interview or stated on its command line as `--no-ios`", the room-off ADR's wording at `:99`; the lean preset is not named because it turns off Room only (`src/commands/create.mjs:90`). `test/adr-seed.test.mjs:97` reads the seeded ADR and asserts the old clause is gone and the new one is present; it failed before the fix.

### KD-235 — the hold names a remedy a foreign-cwd session cannot run — **CLOSED 2026-09-25**

`template/qa/lib/agent-hold.mjs:196`

The "held" message ends: "`node qa/plan.mjs --release` if it is gone." The path is relative to the
project root. A session whose cwd is elsewhere, which is the case KD-215 fixed for the Stop gate's
remedy, runs it and gets "Cannot find module". This is KD-215's class, and this file was missed.

**Why it does not block:** the hold is right, and the remedy fails loud rather than doing something
else. The fix is KD-215's: a path that resolves from any cwd.

*Logged 2026-09-25 (0.28.0 batch).*

**Closed 2026-09-25, on the release-0.28.1 branch.** `describeHold()` (`packages/harness/src/lib/agent-hold.mjs:192`, vendored byte-identical to `template/qa/lib/agent-hold.mjs` by `scripts/sync-harness.mjs`) now spells its remedy through `fromRoot()` (`:210`), which is KD-215's `laneCommand()` from `receipt-check.mjs` applied to this line: from the project root the short `node qa/plan.mjs --release` stays, and from anywhere else it becomes `cd "<root>" && node qa/plan.mjs --release`. The root is derived from the file's own place under `qa/lib/` (`:202`), so the two callers (`plan.mjs`, `receipt-check.mjs`) did not change. `test/agent-hold.test.mjs` "describeHold's remedy names a plan.mjs that exists from a foreign cwd" resolves the command from a temp directory against the stamped copy and asserts the file exists; it failed before the fix ("node qa/plan.mjs --release does not resolve from …").

### KD-50 — the template ships create-cmp's changelog as the adopter's source comments — **CLOSED 2026-09-25**

`.../iosMain/.../KoinHelper.kt` · `.../androidMain/.../AppApplication.kt`

"TWO DEFECTS LIVED HERE, and the comment above described neither" and "This was `runCatching { … }`
with the Result discarded" are stamped verbatim into every `--firebase` scaffold. They are true, and
they are about create-cmp's history, not the adopter's app — a reader of their own repo is told about
a bug that was never in it. The invariant the comments are protecting (do not re-wrap this in
something that discards the failure) is worth stating; the archaeology belongs in create-cmp's
CHANGELOG. Taste call, nobody wrongly served.

**MEASURED, because the question asked was whether it belongs in this slice: it is five sites, and
three of them predate this slice.** The two above, plus `template/composeApp/build.gradle.kts` at
lines 209 ("dead files that look live: the debug network-security config never applied"), 243
("Declaring the flag alone made release the one build…") and 280 ("AGP's bug, **not ours**" — where
*ours* is create-cmp, in a file that is the adopter's). So fixing it here edits two of five and
leaves three, which is the instance-over-class pattern this log's header was written about. **It is
its own slice**, and what that slice produces is not two rewritten comments but a rule — a template
comment is addressed to the adopter, in the present tense, about their code — and something that
can hold it, which is buildable: the tell is first-person and past-tense prose in a shipped template
comment, and it greps. *Logged 2026-09-15 (review of `b549f3b`), scoped 2026-09-15 in review of
`79eafd3`.*

**Closed 2026-09-25, on the dev-done branch.** All five sites are gone from what an adopter receives. Moving Firebase into `overlays/firebase/` retired three of them: the two `--firebase` comments, and the release-flag comment that went out with the Firebase R8 rules. The remaining two in `template/composeApp/build.gradle.kts` now describe the adopter's build in the present tense (the debug source-set wiring, and "an AGP bug"). The rule-plus-grep this entry proposed is not built; that is a new gate, and the mechanism is frozen for 1.0.

### KD-47 — the emulator ports are spelled twice, and declared nowhere — **CLOSED 2026-09-25**

`template/composeApp/build.gradle.kts` (debug `buildConfigField`) · `.../iosMain/.../KoinHelper.kt`

9099 / 8080 / 5001 / 9199 appear as Android BuildConfig fields and again as integer literals in the
iOS redirect. There is no `firebase.json` in the template, so nothing declares them once and the
Firebase CLI defaults are the only thing keeping the two copies honest. An adopter who moves a port
moves it on one platform. Measured today: both copies agree, and the host legitimately differs
(`10.0.2.2` is the Android emulator's host alias, `127.0.0.1` the simulator's), so this is one fact
with two spellings and no drift yet. *Logged 2026-09-15, review of `b549f3b`.*

**CLOSED by `f809a1b`, which moved Firebase into `overlays/firebase/` for `create-cmp add firebase`,
and moved here in the same slice.** The four ports are declared ONCE, as commonMain constants in
`overlays/firebase/files/composeApp/src/commonMain/kotlin/com/example/app/data/remote/FirebaseConfig.kt`
(`FIREBASE_AUTH_EMULATOR_PORT` and three siblings), and both platforms' `FirebaseEmulators.kt` read
them; the Android `buildConfigField` port rows are gone, leaving only the flag and the host, which
legitimately differ by platform. An adopter who moves a port now moves it in one file.
`test/add-firebase.test.mjs` pins it on the tree the step leaves: each port appears once in
`FirebaseConfig.kt`, and neither `FirebaseEmulators.kt` passes a literal port. Still no
`firebase.json` ships — the constants match the Firebase CLI's defaults, and the file says so.

### KD-67 — §9 says the attestation is reported NOT MET "while none exists", and one now does — **CLOSED 2026-09-25**

`docs/NORTH-STAR.md:418`

The road's Stage 2 row describes the provenance half as "reported NOT MET **while none exists** and
never derived". As of the `everything-but-the-signature` slice, `docs/attestations/stage2-external-profile.json`
exists with its derivable fields measured and its four human-owned fields empty, so the gate's
refusal is no longer "the file is absent" — it is "these four fields are". §9's sentence is still
true as a conditional and its conclusion is unchanged (the row is red, the count is 8/10), but a
reader of §9 alone would conclude no such file is in the tree.

Not blocked, and not edited: NORTH-STAR is signed, a reviewer proposes rather than writes, and the
instrument a reader is sent to — `node scripts/stage2-gate.mjs` — names the current reason exactly.
Nobody is wrongly served by the doc being one state behind the program it points at.

**Fires when:** someone reads §9's provenance sentence instead of running the gate.
*Logged 2026-09-18, raised in review round 1 of `everything-but-the-signature-for-the-first-adoption`.*

**CLOSED by the commit that moved it here, which rewrote the sentence and the state around it.** The
criterion now reads "reported NOT MET until a human has written and signed it, and never derived",
true before the file existed, while its fields were empty, and after. The row it sat in had gone two
states further behind than this entry measured: Karel signed the attestation on 2026-09-18 (21e723f)
and Stage 2 exited, while §9 still said 8/10. So the State column stopped carrying counts at all —
it keeps each stage's exit date and why, and each cell sends the reader to
`node scripts/stage-gate.mjs <stage>` for today's rows. The entry's reason for not editing,
"NORTH-STAR is signed", names no record this tree holds: NORTH-STAR carries no signature line and
no digest, and nothing in `scripts/` or `packages/` reads one.

### KD-204 — every `stop()` sends `GET /shutdown` to the daemon port, daemon or no daemon — **CLOSED 2026-09-25**

`inspector/mcp/src/lib/preview-service.mjs` (`stop()`), `daemonUrl` from `:715`

`stop()` fires ``fetch(`${daemonUrl}/shutdown`)`` unconditionally — `hot: false`, no daemon ever
started, still sent. Measured 2026-09-22 with a bystander HTTP server on the daemon port: it receives
`GET /shutdown` from a `hot: false` console's stop. Since `daemonUrl` defaults to
`http://127.0.0.1:9601`, every console in every process sends a request to a fixed address that
anything may be listening on — the console of another test process, or a developer's own console.
Combined with KD-202 and KD-203 this is the complete path from "a suite ran" to "a passed test is
recorded as FAILED".

**Why it does not block.** Harmless where nothing listens (the `.catch(() => {})` swallows the
refusal), and a real daemon is the intended recipient. The guard is cheap: send it only when a daemon
was actually started (`mode === "daemon"` / `daemonChild`).

**Fires when:** any console stops while anything at all is listening on `127.0.0.1:9601`.
*Logged 2026-09-22, measured while proving KD-56's mechanism.*

**CLOSED by the guard this entry named, in the commit that moved it here.** A `daemonOurs` flag is
set where this console STARTS a daemon (`adoptDaemonChild`, which the spawn and any injected spawn
go through) and where it CONFIRMS one (`enterDaemonMode`, reached only after `daemonHealthy` found
it healthy and serving this project's `previewsDir`, or reporting none — the existing adoption rule).
`stop()` sends `GET /shutdown` only when the flag is set. A `hot: false` console, or a hot one whose
daemon never booted or belonged to another project, sends nothing. `inspector/mcp/test/console-stop.test.mjs`
puts a recording server at `daemonUrl`: a `hot: false` console's stop sends it nothing, and a
console that adopted it as its daemon still sends `/shutdown` — the teardown the request exists for.
The comment on `freePort` in `console-now-sse.test.mjs`, which described KD-202..204 as current,
now says they are fixed. `inspector/mcp/dist/server.mjs` is not rebuilt in this commit.

### KD-203 — `port: 0` asks for an ephemeral port and is given the well-known one — **CLOSED 2026-09-25**

`inspector/mcp/src/lib/preview-service.mjs:2752` (`await listen(opts.port || DEFAULT_PORT)`) and
`:2617` (`port = p`)

`0 || 9600` is `9600`. Three tests in `console-now-sse.test.mjs` passed `port: 0` — the standard way to
ask the OS for a free port — and got the console's default, probing upward from it. Measured
2026-09-22 on the machine that found it, where a real console holds 9600: the service bound **9601**,
which is `DEFAULT_DAEMON_PORT`. Two lines make it right: `opts.port ?? DEFAULT_PORT`, and
`port = srv.address().port` so the bound port is read back rather than assumed (with `0`, `p` is not
the port).

**Why it does not block.** An adopter starting a console gets the default port either way; the caller
who says `0` is, today, only a test. It becomes a defect the moment anything runs two consoles.

**Fires when:** any caller asks this service for an ephemeral port.
*Logged 2026-09-22, while fixing KD-56.*

**CLOSED by the two lines this entry named, in the commit that moved it here.** `start()` calls
`listen(opts.port ?? DEFAULT_PORT)`, so `0` reaches `listen` and asks the OS for a port; `undefined`
and `null` still mean the default. `listen` records `srv.address().port` — the port actually bound —
and resolves with it, so the status URL and the console registry name the port that answers. The
upward probe on `EADDRINUSE` is unchanged, since `0` never collides. `inspector/mcp/test/console-stop.test.mjs`
starts a console at `port: 0` and asserts that it reports a port that is neither 9600 nor 9601 and
that answers `/status` there. `inspector/mcp/dist/server.mjs` is not rebuilt in this commit.

### KD-202 — a request that arrives after `stop()` is answered with a null port, and the runner blames a test that passed — **CLOSED 2026-09-25**

`inspector/mcp/src/lib/preview-service.mjs:2085` (`handleRequest`) and its `stop()`

```js
  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);   // OUTSIDE the try
```

`stop()` sets `port = null` after `server.close()`. `server.close()` does not end a connection whose
request is already in flight, so a request that lands in that window is handled with `port === null`,
`new URL(req.url, "http://127.0.0.1:null")` throws `TypeError: Invalid URL`, and because the listener
is `async` the throw is an **unhandledRejection**. Node's runner reports an unhandled rejection
against whichever test in that process has most recently finished — as *"generated asynchronous
activity after the test ended … created the error 'TypeError: Invalid URL'"*, which is KD-56's message
verbatim, blaming a test at `:113` that had already passed.

Reproduced deterministically 2026-09-22 (instrument, not a test): start a service, connect a raw
socket, send half a request, call `service.stop()`, send the rest → `UNHANDLED REJECTION: TypeError:
Invalid URL`.

**Who sends such a request in a suite:** KD-203 and KD-204 — every console's `stop()` sends
`GET /shutdown` to a WELL-KNOWN port, and services that asked for an ephemeral port were listening on
exactly that port. The slice that closed KD-56 removed the exposure for
`inspector/mcp/test/console-now-sse.test.mjs` by giving it real ephemeral ports; the defect itself is
untouched.

**Why it does not block.** No adopter runs these tests, and in a real console a stray request during
shutdown produces one rejected promise in a process that is exiting. What it costs is suite records: a
FAIL against a test that passed, on a tree that is fine.

**The fix** is `const url = new URL(req.url, "http://127.0.0.1")` (the port carries no meaning for
`pathname` / `searchParams`) or moving the line inside the try — plus a rebuild of
`inspector/mcp/dist/server.mjs`, which is why a test-only slice did not do it: shipped bytes and a
bundle rebuild belong to the slice that owns `inspector/mcp/`.

**Fires when:** anything sends the console a request while it is stopping — which the suite does to
itself.
*Logged 2026-09-22, found by reading KD-56's kept message.*

**CLOSED by the fix this entry named, in the commit that moved it here.** `handleRequest` builds its
URL inside the `try`, on the base `http://127.0.0.1`: every read of it is `pathname` or
`searchParams`, and the port means nothing to either. `stop()` still nulls `port`, which `status()`
reports, but the handler no longer reads it, so a request that finishes arriving after the stop is
answered or fails into the handler's own `catch` — never an unhandled rejection.
`inspector/mcp/test/console-stop.test.mjs` runs this entry's recipe — half a request on a raw
socket, `stop()`, then the rest — and asserts no unhandled rejection. `inspector/mcp/dist/server.mjs`
is not rebuilt in this commit; the bundle is rebuilt once, at verification.

### KD-188 — `cmp-inspector-mcp --help` starts a server and exits silently — **CLOSED 2026-09-25**

`inspector/mcp/bin/server.mjs` (`main`, bottom of file)

There is no argv handling: any argument at all starts the stdio MCP server, which writes
`cmp-inspector MCP server running on stdio` to stderr and exits 0 when stdin closes. Measured
2026-09-22 with the SDK present: `--help` → exit 0, 0 bytes of stdout, 42 of stderr, both directly
and through a symlink.

Not blocking: an MCP client never passes `--help`, and the one line it does print goes to the channel
a stdio server may speak on. It is logged because a person who types `--help` at a bin gets a process
that looks like it hung until stdin is closed, and because the symlink gate KD-18 closed now has to
carry a sentence explaining why "prints nothing on stdout" is legitimate here.

**Fires when:** a person, rather than an MCP client, runs the inspector bin with an argument.
*Logged 2026-09-22, in the slice that closed KD-18.*

**CLOSED by answering the question, in the commit that moved it here.** `main()` in
`inspector/mcp/bin/server.mjs` now checks for `--help` or `-h` before it opens the transport. It
prints a constant usage text to stdout — the bin's name and version, that an MCP client starts it and
it speaks on stdin/stdout, and where registration is described — and exits 0 once the write has
flushed. Every other argument still starts the server, as before: an MCP client passes none, and
refusing unknown arguments was not what this entry asked. `inspector/mcp/test/server-help.test.mjs`
pins both flags and a control that the bare bin is still the stdio server. The symlink gate's
comparison of the direct and linked runs sees the same bytes either way, since the text does not
depend on the invoked path. `inspector/mcp/dist/server.mjs` is NOT rebuilt in this commit: the bundle
is rebuilt once, at verification, and until then `bundle-freshness` reports it stale.

### KD-160 — the lane lock commits one sha256 per file, and a secret scanner cannot tell that from a credential — **CLOSED 2026-09-25**

`packages/harness/src/lib/harness-lock.mjs` · `qa/harness.lock.json` in every stamped tree

The lock's `files` map carries a sha256 per locked path so the harness can say whether the
machine-owned region was edited. Measured on real stamps: **a full tree's lock holds 73 digests, a
`--minimal` tree's holds 7.** A 64-character hex string is exactly what a generic secret rule looks
for, and an adopter's gitleaks flagged one as `generic-api-key` and turned their CI red on a file
nothing in their repo authored.

**Surfaced by KD-40, which attributed it to the wrong cause.** That entry blamed `--minimal` for
leaving the lock behind; `--minimal` in fact *reduces* the digest count from 73 to 7, and every
create-cmp tree carries them. The harm is real and it belongs to the lock itself.

**The scanner was the adopter's own.** This repository ships no gitleaks configuration —
`gitleaks` appears only as a lane step name (`packages/harness/src/lib/profiles/cmp/ladder.mjs:16`)
— so nothing here fired, and nothing here can fix their config either.

**Why logged and not fixed.** The digests are load-bearing: remove them and the lock stops being
able to answer the one question it exists for. The candidate remedies — ship an allowlist fragment
with the template, or document the shape so an adopter can allow it once — are product decisions
about what create-cmp puts in someone else's repository, and that is not a call to take inside the
slice that found it. What is NOT in doubt is that it fires: it already did, once, outside.

*Logged 2026-09-19, while closing KD-40 as not reproducible. The measurement is the useful part of
an entry whose central claim was false.*

**CLOSED by the second remedy this entry named — the format stays, and the shape is
documented where an adopter meets it — in the commit that moved it here.** The decision: the lock
keeps one sha256 per locked path, since the digests are what lets it name the file that changed, and
create-cmp ships no scanner config into someone else's repository. What an adopter is owed is to
recognise the hit and to allow it once. `template/AGENTS.md` now says, outside every feature region
so a `--minimal` stamp carries it too, that a scanner flagging `qa/harness.lock.json` has found sha256
digests and not a credential, what each one is a digest of, and to allowlist the path rather than the
values, which change with every upgrade and relock. It gives the gitleaks form (`paths` under
`[allowlist]` in `.gitleaks.toml`). The full rendering adds that committed receipts under
`qa/evidence/` carry the same shape. `packages/harness/README.md` says the same for a repo `prooflane
init` locked. `test/agents-md.test.mjs` pins the paragraph in every rendering. The gitleaks snippet is
the v8 global-allowlist form and was not run against gitleaks in this commit.

### KD-197 — the walk-wiring ADD heal re-serialises the whole settings file — **CLOSED 2026-09-25**

`src/commands/doctor.mjs` (`applySafeFixes`, `f.id === "walk-wiring"`)

The add heal writes `JSON.stringify(settings, null, 2)`, so an app whose `.claude/settings.json`
carries `—` escapes (the template's own SessionStart and PreToolUse commands do), four-space
indentation, tabs, or key order of its own gets all of that rewritten as a side effect of having a
status line added. The rewrite heal added beside it deliberately does the opposite — it edits the
command's string token in the raw text and leaves every other byte — and the two now sit in the same
command.

**Nobody is wrongly served by the CONTENT** (the settings mean the same thing), and the adopter did
ask for a write. What they did not ask for is the diff. Bounded today: the add heal only runs when a
surface is missing.

**Fires when:** `doctor --fix` adds the walk wiring to a settings file the app has formatted its own
way.
*Logged 2026-09-22, found while writing the in-place rewrite next to it.*

**CLOSED by editing the raw text, like the rewrite heal beside it, in the commit that moved it here.**
The add heal now turns what it adds into edits — a member added to an object, groups appended to an
array, or a `null` slot filled — and `editJsonInPlace` (`src/lib/json-in-place.mjs`) applies them to
the app's own bytes. Every byte outside an insertion stays where it was. What is inserted follows the
file's own layout: its indentation unit (spaces or tabs, read from the container), its line ending,
its key separator, one-line when the container or the whole file is one line, and `\uXXXX` escapes
when the file already uses them. The result is parsed and compared with the parsed original plus the
additions before anything is written, and a text it cannot account for (not JSON, a duplicate key, a
slot of the wrong kind) is left alone, like the unparseable file before it. A file that does not
exist is still created in the template's two-space shape, since there are no bytes to keep.
`test/the-walk-wiring-heal-rewrites-the-whole-settings-file.test.mjs` checks that every line of a
four-space file with its own key order and a `—` escape survives, a one-line file stays one
line, a tab-indented app hook keeps its bytes and gets the walk's group appended, and the editor's
refusals.

### KD-231 — the shipped orchestrator's hand-off point is the maintainer's private file — **CLOSED 2026-09-25**

`agents/cmp-orchestrator.md:220-222` (shipped through `.claude-plugin/plugin.json` `agents`), and
`.claude/agents/deep-worker.md:79-81`

The rewrite tells the orchestrator to hand its own session off "at the budget point the user-level
instructions set (`~/.claude/CLAUDE.md`)". It adds "This file names no number, so it cannot disagree
with that one". That holds on the maintainer's machine, where `~/.claude/CLAUDE.md` has a "Session
budget" section. An adopter who installs the plugin has no such section, so the line points at a
number that does not exist. The same problem in `deep-worker.md` only affects contributors to this
repository.

**Why it does not block:** the line does nothing for an adopter. Without a budget point, their
orchestrator hands off the way it did before this slice. Nobody is refused or given a wrong result.
**Decision it asks for:** should the shipped orchestrator carry a default hand-off point of its own?
If it should, it is the one statement an adopter has, so it is not a restatement. The other choice
is to drop the pointer from the shipped definition.

*Logged 2026-09-25, review round 1 of the resume-price slice.*

**CLOSED by the second choice this entry named — the pointer is gone, and the rule carries no number —
in the commit that moved it here.** The orchestrator now says: hand your own session off when a fresh
orchestrator started from the hand-off costs less than your next steps; if your instructions set a
budget point, use that. The `~/.claude/CLAUDE.md` pointer and the "cannot disagree" sentence are
removed. The same commit swept every shipped agent and skill for the class: in the orchestrator,
`docs/NORTH-STAR.md`, `docs/PRINCIPLES.md`, ADR-0015, the review-round paragraph (`change-price`,
`proof-plan`, `KNOWN-DEFECTS`, `staff-reviewer`), the engine suite, the pointer at `KNOWN-DEFECTS`'s
header and three dated measurements are marked "in create-cmp", and "Karel" is "the human you report
to" in both places; in `cmp-qa-prep`, the attribution goes and `scripts/fleet-check.mjs` is marked;
in `cmp-audit`, `docs/CHANGE-FLOW-DESIGN.md` is marked. `plugin-refresh` is not changed — it is a
maintainer's procedure throughout, and whether it ships is the owner's decision.
`.claude/agents/deep-worker.md` keeps its pointer: it is not shipped, and only a contributor to this
repository reads it. `test/a-shipped-agent-points-at-a-file-only-create-cmp-has.test.mjs` scans the
plugin's agents and skills and the template's skills, `plugin-refresh` excepted by name.

### KD-215 — the heal revives the Stop gate for foreign-cwd sessions, and its remedy is a path those sessions cannot resolve — **CLOSED 2026-09-25**

`template/qa/receipt-check.mjs` (the `--hook` refusal text) · `src/lib/shipped-hooks.mjs`
(`stop-receipt-relative` → `stop-receipt-anchored`) · KD-85

Reviving the Stop gate is the point of the heal, and it works: executed from a directory that is not
the project, with `CLAUDE_PROJECT_DIR` exported the way Claude Code exports it,
`node "${CLAUDE_PROJECT_DIR:-.}/qa/receipt-check.mjs" --hook` produces the same refusal and the same
exit 2 as it does from the project root — byte-identical message, verified both ways. The message it
feeds back to the agent is *"Run `node qa/verify.mjs` (it checks every promise and writes the
receipt), commit the receipt, or see README §Verification enforcement to bypass."* That path is
relative, and the session being told it is, by construction, not at the project root — a session that
was at the root had a working Stop hook before the heal and did not need it. So the one population the
heal newly reaches is the one population for which the remedy's path does not resolve.

**Nobody is handed a wrong verdict.** The gate refuses correctly, for the correct reason, with the
correct exit code, from both directories; only the remedy's spelling assumes a cwd. An agent that runs
the command and gets `ENOENT` learns where it is rather than something false. The text is also
pre-existing and untouched by this change — it is logged here, rather than left to the file that owns
it, because a fix's own new behaviour is in scope for the round that reviews it, and this heal is what
makes the message reachable at all.

**Fires when:** a session opened outside the project root ends a turn in an app whose Stop hook has
been healed, and the receipt does not attest the tree.
*Logged 2026-09-22, review round 1 of the wave (doctor hooks area).*

**CLOSED by spelling the remedy from where the hook runs, in the commit that moved it here.**
`receipt-check.mjs` (`packages/harness/src/` and its byte-identical `template/qa/` copy) compares its
own project root with the process's cwd, both through `realpath`. At the root the instruction is
unchanged, byte for byte; anywhere else it reads *"Run `cd "<root>" && node qa/verify.mjs` …"*, with
the path single-quoted instead when it carries a character double quotes do not protect (`"`, `$`,
a backtick, `\`, `!`). `test/the-stop-hook-remedy-names-a-path-a-foreign-cwd-cannot-resolve.test.mjs`
takes the command out of the refusal and runs it with `sh -c` from where the session stands: from the
root the words are the old ones, from a foreign directory the bare form fails and the new one reaches
the lane, and a root with `$` in its name is still reached. `test/harness-surfaces.test.mjs`'s
lane-in-flight case now runs the hook at the project root, which its two assertions on the bare form
had assumed without saying. Out of this entry's scope and unchanged: the `reason` strings from
`evaluate()` (e.g. *"no receipt — run `node qa/verify.mjs`"*) still spell the relative form, in the
same message, ahead of the corrected instruction.

### KD-214 — a heal that cannot write takes the whole project diagnosis down with it — **CLOSED 2026-09-25**

`src/commands/doctor.mjs` (`healWriter`, `healShippedHookCommands`, `runDoctor` — no `try` around the
heals) · KD-194 · KD-196 · KD-197

Measured on this tree, with `.claude/settings.json` at mode `0444` and 0.26.2 content:
`create-cmp doctor --fix --yes --no-install --no-ios --target-dir <tmp>` prints the rewrite preview,
then

```
Fatal: Error: EACCES: permission denied, open '…/.claude/settings.json'
    at write (…/src/commands/doctor.mjs:439:8)
    at healShippedHookCommands (…/src/commands/doctor.mjs:577:10)
    at async runDoctor (…/src/commands/doctor.mjs:633:23)
```

and exits 1. `printFindings` never runs, so every finding the adopter invoked doctor to read — the
version-catalog checks, `local.properties`, disk headroom, the walk wiring, the unanchored hooks — is
discarded by a failure in one optional heal. Any heal that already succeeded earlier in the same run
(`local.properties`, `ksp.useKSP2`) stays applied, with the `✓ --fix: wrote …` line as the only record
of it, and no re-diagnosis. The shape is pre-existing: `applySafeFixes` has always called the writer
with no `try`. What this slice adds is a second, later writer on the same unguarded path, so the
window in which a failed write throws away the report is wider than it was, and it now covers the one
file the adopter is most likely to have made read-only.

**Nobody is wrongly served by what is SAID.** The failure is loud, names its cause and its exact path,
the settings file is left byte-for-byte unchanged, and nothing false is printed — the crash happens
before the `✓ --fix: wrote …` line, not after it. An unwritable `.claude/settings.json` is also a state
the adopter created. The cost is a diagnosis they have to re-run without `--fix` to get, which is a
degraded result rather than a wrong one.

**Fires when:** any project heal's target is read-only, on a read-only mount, or otherwise unwritable —
most plausibly a `.claude/` checked out read-only or owned by another user.
*Logged 2026-09-22, review round 1 of the wave (doctor hooks area).*

**CLOSED by catching the refusal at the writer, in the commit that moved it here.** `healWriter` now
catches an error the operating system raised (one carrying a `syscall`) around its `mkdirSync` and
`writeFileSync`, prints `✗ --fix: could not write <what> — <reason>` with the reason in words and the
code in brackets (`permission denied: … (EACCES)`, read-only file system, disk full, …) and the path
beneath it, records it on `.failed`, and returns false. Any other error is still thrown: a defect in a
heal is not a full disk. `applySafeFixes` no longer counts a refused write as a healed finding.
`runDoctor` re-diagnoses if anything was written, prints the findings and the verdict line as before,
then says how many heals could not be written, lists each with its reason, names every heal already
applied in the run (or says none was), and exits 1. `test/a-heal-that-cannot-write-takes-the-diagnosis-down.test.mjs`
pins the writer's contract, the non-system error that must still crash, the uncounted heal, and the
measured case end to end — `.claude/settings.json` at `0444`: the diagnosis and its verdict print, the
settings refusal is named in words, the `local.properties` and `ksp.useKSP2` heals are listed as
applied, the run exits 1, and the settings file is byte-for-byte unchanged. Its permission cases skip
under root, where mode bits refuse nothing. *Written without running it — the batch is verified once,
at its end; that run is what confirms this paragraph.*

### KD-4 — `create-cmp`'s `harness init` flag line omits `--new-profile` — **CLOSED 2026-09-25**

`bin/create-cmp.mjs:133`

Pre-existing. The two help surfaces have drifted from each other, and `prooflane --help` is the
fuller one — it names `--new-profile`, `create-cmp`'s `harness init flags:` line does not.

*Logged 2026-09-11, noticed in review round 1. Reason corrected 2026-09-11 after review round 4:
this entry first said `--new-profile` was "parsed at the front door rather than there" and so out
of the new lint's reach. It is branched on at `packages/harness/install/init.mjs:950`, and the
lint does cover it — against `prooflane --help`, which names it. Only create-cmp's help omits it.
The conclusion held; the reason was wrong.*

**CLOSED by naming the flag, in the commit that moved it here.** `create-cmp --help`'s `harness init
flags:` block gains a `--new-profile` line in `prooflane --help`'s words, and the usage line the
`harness` door prints for an unknown subcommand gains `[--new-profile]` — the same list in its second
spelling. `test/create-cmp-harness-init-help-omits-a-flag-init-branches-on.test.mjs` reads every flag
`packages/harness/install/init.mjs` branches on and asserts each is printed in both places, so the
next flag init learns cannot drift the same way.

### KD-216 — "always works", in the paragraph explaining why it does not — **CLOSED 2026-09-25**

`src/lib/project-doctor.mjs` (walk-wiring warn branch, the `working.length > 0` detail) · KD-126 ·
KD-182

The new branch that credits a surface ends its detail with *"…and running `node qa/walk-status.mjs` by
hand always works."* The paragraph it closes exists to say the opposite about that exact spelling: two
sentences earlier it explains that a command naming the script by a path relative to the session's
directory "finds no script there", and that `|| true` makes the miss silent. `always` is the word that
is not true — the pre-existing fallback one line below, which this branch was written beside, says
"still works", which is accurate. The finding therefore states the general rule it is teaching and
then contradicts it in its own last clause, in the one report whose subject is that distinction.

**Nobody is wrongly served.** An adopter reading a report about their project reads "by hand" as "from
the project", which is where they are; nothing in the tree routes on the sentence, and the remedy
lines above it are correct. It is the class KD-126 and KD-182 are in — a false fact surviving in a
second spelling, in prose a contributor or an adopter reads and nothing checks.

**Fires when:** a reader takes the sentence literally and runs the relative command from a
subdirectory, having just been told by the same paragraph that it will not work there.
*Logged 2026-09-22, review round 1 of the wave (doctor hooks area).*

**CLOSED by the one word, in the commit that moved it here.** The clause now reads *"…and running
`node qa/walk-status.mjs` by hand from the project root still works"* — the place the relative path
resolves from, in the wording of the fallback one line below. The other two by-hand sentences in the
finding were already accurate and are unchanged. `test/doctor-claims-working-for-a-surface-a-foreign-cwd-cannot-run.test.mjs`
pins it against the same oracle as the rest of that file: the shell, run from another directory,
does not run the by-hand form, and the detail no longer promises that it always does.

### KD-196 — the contract vendored into every app says `doctor --fix` asks before any repair, and three of its four heals do not — **CLOSED 2026-09-25**

`template/AGENTS.md` (line 42) · `src/commands/doctor.mjs` (`applySafeFixes`)

> `npx create-cmp-cli doctor --fix` — diagnoses machine AND project (kotlin↔ksp lockstep, catalog
> drift); **asks before any repair**

After the slice that closed KD-85, one heal asks (the shipped-hook rewrite). `local.properties`,
`ksp.useKSP2` and the walk-wiring add still write on `--fix` with no prompt — the sentence was false
when it was written and is now three-quarters false. The line is in the file every stamped app
carries, so the reader it misleads is the agent working in an adopter's repo.

**Nobody is wrongly served by the WRITES** — they are the safe heals `--fix` exists for, and the flag
is the consent — so this is a docs/consent-model decision (make the sentence true, or make the other
heals ask) rather than a defect in what the command does. Out of that slice's brief, which named the
rewrite's consent only.

**Fires when:** an agent in an adopter's repo reads the contract and expects to be asked.
*Logged 2026-09-22, found while looking for the consent helper that slice's brief pointed at.*

**CLOSED by making the sentence true, in the two commits that did it; this entry moved when that
was checked against the code.** `8b81e88` rewrote the row in `template/AGENTS.md`: the shipped-hook
rewrite is the one PROJECT heal that asks first, installing a missing tool asks too (`runInstall` in
`src/bootstrap/exec.mjs`, "Run install: `…`?"), and `local.properties`, `ksp.useKSP2` and the walk
wiring are written without a prompt — which is what `applySafeFixes` and `healShippedHookCommands`
in `src/commands/doctor.mjs` do. `deac423` did the same for the copy `create-cmp attach` writes into
an existing repo (`attachAgentsMd` in `src/commands/attach.mjs`), which names the two heals that can
fire there: an attached repo carries no `qa/walk-status.mjs`, so the walk-wiring finding never
reaches it. No shipped surface still says `doctor --fix` "asks before any repair". The consent
model was left as it is — the flag is the consent for the safe heals — so no heal was made to ask.

### KD-229 — the tier was renamed `L2 run`, and the cadence lint does not know the new name — **CLOSED 2026-09-24**

`scripts/lib/cadence.mjs` (`CADENCE_PHRASES`), read by `test/policy-home.test.mjs` over every tracked
document and by `scripts/hooks/proof-gate.mjs` over memory files at SessionStart

The first-job slice (ddf86b3..6ec08c4) changed the tier's printed name from `device (fleet L2)` to
`L2 run` in `proof-plan.mjs`, the hook and `change-price.mjs`. That is the text an agent reads, so
these are the words it will quote. The lint that stops the cadence being restated matches only
`device`, `emulator` and `fleet L2`. Measured by calling `restatements()` on six lines: the old
name followed by a per-commit cadence, the device noun followed by one, and the old name's
REQUIRED schedule row each read as ONE restatement; the new name followed by a per-commit cadence,
the new name followed by an every-PR cadence, and the new name's REQUIRED schedule row each read as
ZERO. (The lines themselves are not quoted here: this file is one of the documents the lint reads.)

**Why it does not block:** the module's own header limits it to the phrasings that were found. The
rule is enforced by the hook and `proof-plan.mjs`, not by this lint, and nothing in the tree or in
a memory file restates the cadence in the new words today. The fix is one alternation (`L2 run`)
in the three patterns, with those lines added as plants to the policy-home test.

*Logged 2026-09-24, review round 1 of the first-job slice (L2 digest rule 2 + --rekey + cadence).*

**CLOSED by the alternation this entry named, in the commit that moved it here.** Every pattern in
`CADENCE_PHRASES` that knew `device` or `fleet L2` knows `L2 run` too — four, where the entry counted
three: the per-PR / per-commit pattern, both directions of the keyed-to-commits-PRs-or-steps pattern, and the REQUIRED row, which
still passes a backtick-quoted line. `test/policy-home.test.mjs`'s plant pins five restatements in
the new words — the ones measured above among them — and two lines that must stay clean: the new name
with no cadence, and the REQUIRED row quoted in backticks. Re-scanned with the new patterns, every
tracked document `test/policy-home.test.mjs` reads (132) and this machine's memory files: the only
hits were this entry's own quotations, which the paragraph above now describes instead.

### KD-207 — markdown that SHIPS can reopen the device tier but can never oblige it — **CLOSED 2026-09-24**

`scripts/observed-tree.mjs` (`DEVICE_TIER_IRRELEVANT`'s `*.md`) with `scripts/stamped-output.mjs`

`DEVICE_TIER_IRRELEVANT` declares `*.md` unable to oblige a device run, matched on the repo path, so a
change to `template/README.md` — which ships INTO the stamped app — cannot make the tier required. If
some other path in the same slice does make it required, the same file's bytes then move the stamped
digest and REOPEN a discharged slice. The two halves disagree for exactly the shipped-markdown set.

Pre-existing in the same shape (the old device hash covered `template/` wholesale including its
markdown, while `*.md` was declared irrelevant) and unchanged in severity by the slice that found it.
The direction of the error is the safe one — a shipped doc can cost a run, never hide one — and the
fix is a product decision: either `*.md` stops being declared irrelevant (every README typo in
`template/` then obliges a run), or the oracle normalises markdown inside the app (a comment in a
shipped `AGENTS.md` an agent executes would then be invisible to the tier).

**Fires when:** a slice touches one non-markdown path and one `template/**/*.md`, discharges, and is
reopened naming the markdown file.
*Logged 2026-09-22, by the slice that bound the device tier to the stamped app.*

**CLOSED by `fcd1f58` (branch `wave/l2-digest`), the first of the two spellings this entry named, with the
cost of the second removed.** `*.md` still declares this repo's own prose unable to oblige the tier, and it
no longer reaches `template/`: `DEVICE_TIER_SHIPPED` in `scripts/observed-tree.mjs` puts every path under
`template/` back, through `deviceTierNeed`, the one derivation `proof-plan` and `fit-test` now share. Every
such edit is then ASKED about, and the stamped digest answers: under digest rule 2
(`scripts/stamped-output.mjs`) prose the cmp profile's L2 run never opens — `AGENTS.md`, `CLAUDE.md`,
`.claude/**/*.md`, each with its not-read proof — holds the digest, so a matching record discharges it for
the price of one stamp. A spec is read by the lane and moves it. Both directions are driven in
`test/what-the-l2-run-never-reads-does-not-move-the-stamped-digest.test.mjs`: `template/specs/home.spec.md` →
required, digest moved, OWED; `template/AGENTS.md` → required, digest held, DISCHARGED by the record.
The shipped `README.md` is NOT held — `qa/verify.mjs` rewrites its badge on every run — so the README
typo this entry priced still costs an L2 run: that file is read by the run, and the price is the honest one.

### KD-14 — `create-cmp`'s parser does not split `--flag=value` — **CLOSED 2026-09-22**

`src/lib/args.mjs` (`parseArgs`)

`prooflane`'s parser splits on `=`; this one never has. `create-cmp harness init --profile=svc`
produces a flag literally named `profile=svc`, which this door now REFUSES by name — `create-cmp:
--profile=svc is not an argument this command knows`, exit 2, nothing written (measured
2026-09-19). The sentence here used to say the profile id falls back to the directory name, and
that stopped being true when the unknown-argument refusal landed: the flag is unrecognised
because its name carries the value. Not a regression and not promised — no help text in
`bin/create-cmp.mjs` offers the `=` form, every example uses the space form — so a user reaches
it only by habit from other CLIs, and now hears about it instead of being surprised later.

Found while fixing KD-7, as a test I had written that asserted the `=` form in BOTH parsers.
That test was reaching past its own slice; it now asserts `=` where `=` is parsed, and this
entry holds the rest.

**Worth doing with KD-4:** both are drift between the two front doors, and one slice should
close them together.
*Logged 2026-09-13.*

**CLOSED by `4be6b36`.** `src/lib/args.mjs`'s `parseArgs` is prooflane's loop token for token now,
so both doors split `--name=value` at the first `=`: the attached form of a declared boolean means
what its space form means, a value flag works attached (`--target-dir=./app`, `--profile=svc`), a
declared flag carrying a value it cannot mean is refused by what was typed, and an unknown name is
refused by its name rather than by name-plus-value. Red first on `4b81ee1`, twice —
`test/an-equals-sign-turns-a-known-flag-into-an-unknown-one.test.mjs` through the real
`create-cmp upgrade` (`259e86e`, 6 of 6), and the source pin in
`test/a-declared-booleans-value-arrives-as-a-string.test.mjs` that holds the two `parseArgs` equal
as code, return value aside (`61efc60`).

**What did NOT close with it.** KD-4 — the paragraph above says these two are one slice, and the
`harness init` flag line that omits `--new-profile` was not touched, so KD-4 stays open. And the
split brought one edge case of its own, logged as KD-184: `--=x` splits into the EMPTY flag name,
which both doors now refuse as `--`, the one token they accept.

### KD-153 — half the new refusal is unreachable, at the door that cannot produce the shape — **CLOSED 2026-09-22**

`bin/create-cmp.mjs`, `src/lib/args.mjs` (`unreadableBooleanValues`)

A declared boolean can only still hold a string when the value was attached with `=`, and
create-cmp's parser has never split on `=` (KD-14): `--dry-run=maybe` becomes a flag literally
named `dry-run=maybe` and is refused as an unknown argument. So at that door the new check runs
over every invocation and can never find anything.

It is there anyway because the two parsers are pinned equal by test, function for function, and
because the day KD-14 is closed is the day the shape arrives. The user is refused either way,
with a sentence naming what they typed; only the sentence differs. At prooflane's door, which
does split `=`, the refusal is the reachable one and is driven by test through the real bin.

**Fires when:** never, at this door, until `create-cmp`'s parser splits `=`.
*Logged 2026-09-19, by the slice that closed KD-16.*

**CLOSED by `4be6b36`, which is the day this entry named.** With `=` split at create-cmp's door,
`--dry-run=maybe` and `--dry-run=` reach `unreadableBooleanValues` and are refused as a value the
flag cannot mean — exit 2, the typed token named, the version catalog byte-identical — instead of
being refused as an unknown flag NAME. Driven through the real `create-cmp upgrade` in
`test/an-equals-sign-turns-a-known-flag-into-an-unknown-one.test.mjs`, red on `4b81ee1`. The SPACE
form holding something else is still deliberately not refused: that is KD-150, measured untouched
by this change (`["--no-firebase","no","my-app"] → positionals ["no","my-app"]`).

### KD-18 — the symlink gate reads two of the eight bins this repo publishes — **CLOSED 2026-09-22**

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

**CLOSED by `1f33325`, red at `b2e67bc`.** The gate enumerates published packages through
`ownedNames()` — the one list `scripts/ground-truth.mjs` derives and
`test/a-version-number-cannot-name-two-different-trees.test.mjs` holds to every tracked publishable
manifest — and links every bin NAME rather than every deduplicated target, so its reach is now
asserted rather than counted: `assert.ok(bins.length > 0)` is gone.

**The count in this entry was low. It is NINE bin names, not eight, and it ran two of them.** At
`b2e67bc` the gate reds with the seven it never ran — `cmp-inspector-mcp` (`@create-cmp/inspector`),
`create-cmp-cli`, `create-compose-multiplatform`, `create-kmp`, `create-ktor`, `create-mobile` and
`prooflane` — and passes over nine at `1f33325`. What the entry got right is that nothing was broken
behind it; what was broken was the gate's claim about itself. Refuters: a dead entry-point guard
planted in `packages/aliases/prooflane/bin/cli.mjs`, in `create-ktor`'s and in
`inspector/mcp/bin/server.mjs` each reds by name, and narrowing the enumeration back
(`p.dir === "inspector/mcp"` skipped) reds the coverage assertion.

Two of the newly read bins legitimately print nothing on stdout — the inspector is a stdio MCP
server that announces itself on stderr (KD-188), and an alias whose dependency is absent says so on
stderr and exits 1 — so the comparison reads stderr as well as stdout now, and a dead entry point is
stated as what it actually looks like: exit 0 in silence.

### KD-134 — the version deriver names three surfaces where a bump must move four — **CLOSED 2026-09-22**

`scripts/ground-truth.mjs` · `package-lock.json`

`CLAUDE.md` says to ask the programs, not a document, and names `ground-truth.mjs` for "counts and
versions, never by hand". It reports the spine as `cli / plugin / marketplace`. A version bump must
actually move **four** surfaces: those three plus `package-lock.json`, which records the root
manifest's own version in two places.

**Measured on this slice.** Bumping 0.26.4 → 0.26.5 across the three the deriver names left the
suite red: `actual: '0.26.4', expected: '0.26.5'`. The author had read the deriver, moved exactly
what it listed, and was still wrong.

**Nobody is wrongly served, and that is why it is logged.** `test/workspace-lock-sync.test.mjs`
refuses the drift by name with the remedy printed, so the lockfile cannot ship stale. The lock is
also genuinely derived state, which is a fair reason for a *count* deriver not to list it as a
package.

**What is logged is narrower and worse:** "which surfaces must move together" is not derived
anywhere, and the program that exists so nobody hand-counts this answers with three of four. A
reader who trusts it exactly as `CLAUDE.md` instructs is handed an incomplete answer and finds out
from a test. That is the drift `ground-truth.mjs` was written to abolish, in the deriver itself.

*Logged 2026-09-19, review round 1 of the packaging slice — by the reviewer, about the author.*

**CLOSED by `a2570ad`.** `scripts/ground-truth.mjs` derives a **version spine**: the six FIELDS a
bump must move — `package.json`, the lock's `version` and its `packages[""].version`, `plugin.json`,
and the marketplace's `metadata.version` plus every `plugins[*].version` — with which of them lag
printed in the table and answered in `--json`. So the program `CLAUDE.md` sends a reader to now
answers the question this entry says it was asked. Before it, both shipped-surface tests red: the
`--json` answer "never mentions package-lock.json version, package-lock.json packages[""].version",
and the printed table never mentioned the lock; after, 13 pass. Refuters: deleting the two lock
surfaces from `versionSpine()` reds six tests including every fixture, and deleting the print line
from `main()` reds the table test.

The four FILES are this entry's; the FIELD list inside them is the closing slice's own reading, and
`npm version` moves `package.json` and the lock for you — so what the spine is worth is worth
exactly for the hand-edited bump this entry measured.

### KD-31 — the contract vendored into every stamped app names a script no stamped app has — **CLOSED 2026-09-22**

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

**CLOSED by `a1c3e16`, red at `330ba88`.** `template/qa/lib/profile-contract.mjs` says the run
happens in the create-cmp repo, in the sentence that gives the instruction, and the CLASS closes
with it: `test/a-vendored-instruction-names-a-script-no-stamped-app-has.test.mjs` scans every
tracked file under `template/` for `node <path>` and refuses a path the template does not ship
unless the SENTENCE the instruction sits in says the script lives in the create-cmp repo. Refuter:
planting "run `node scripts/nope.mjs`" into `template/qa/verify.mjs` reds it.

**It was sixteen instructions, not one, and the sibling this entry called correct is one of them.**
The paragraph above reads `node scripts/sync-harness.mjs` at `profile.mjs:26` as already saying "in
the create-cmp repo" beside it — it says it in the sentence BEFORE, which under the same-sentence
rule is not beside it at all. Fifteen SINGLE SOURCE OF TRUTH headers were live for that reason; all
sixteen now carry the repo in their own sentence. The paragraph reading was measured as the
alternative and refuses exactly one instruction, this entry's, while exempting the other fifteen on
a mention in a neighbouring sentence — a hole, because those headers are precisely where the next
instruction of this kind gets written.

### KD-95 — a worktree under a path with a space in it is a tree this gate refuses to name — **CLOSED 2026-09-22**

`scripts/hooks/proof-gate.mjs` (`literalDir` / `LITERAL_PATH`, and the fleet-check operand reader)

The gate reads the tree a command acts on from the command's own `cd` and from a
`…/scripts/fleet-check.mjs` operand, and it reads both only when they are written literally —
`LITERAL_PATH` excludes whitespace along with `$`, backticks, globs and `~`, and the operand reader
is a `\S*` that cannot cross a space. So `cd "/Users/k/my trees/slice" && gh pr merge` is refused
with "a `cd` this gate cannot read literally", and `node "/Users/k/my trees/scripts/fleet-check.mjs"`
with "a form this gate cannot resolve to a file". Both are true sentences and both are refusals of
work that is real.

The quoted case is the one that could be read exactly — quotes delimit, so a space inside them is
part of the path — and it is not, because the unquoted case next to it cannot be, and one relaxation
without the other is the kind of half-rule that reads as a general guarantee. Nobody is wrongly
served today: every worktree of this repository lives under a space-free path, and the alternative
to refusing is resolving half a path and judging whatever tree happens to sit there — the defect
this slice just closed, made by the gate itself. **Fires when:** a worktree of this repo is checked
out under a path containing a space and a gated command names it. *Logged 2026-09-18, in the slice
that added the reader (KD-79).*

**CLOSED by `87ae6d4`, red at `af85171`.** A `cd` operand and a `…/scripts/fleet-check.mjs` operand
are read from the command as written, so a wholly quoted path with a space in it resolves exactly,
while everything the shell would expand, escape or assemble from pieces — a substitution, a glob, a
`~`, an escape, a path built from adjacent pieces — stays refused. The oracle is `/bin/sh` itself:
`test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs` gained seven rows, and
`test/a-worktree-under-a-path-with-a-space-in-it-is-a-tree-the-gate-can-name.test.mjs` is the red
one at `af85171`. `docs/GATE-RULES.md` moved in the same commit, and its "runs 24 shapes" sentence
now names the table rather than a count.

**Half of what this entry recorded was wrong, and the wrong half was the fail-open one.** It says
`node "/Users/k/my trees/scripts/fleet-check.mjs"` was *refused* with "a form this gate cannot
resolve to a file". It was not refused: measured on `4b81ee1` by calling the module's own
`classify`, that command returns `null` — the hook printed nothing and the device run went ahead
**ungated**. Silence, not refusal, which is the opposite direction from the one this entry argued
was safe. The `cd` half is right about the refusal and wrong about its cause: `cd "/tmp" && gh pr
merge` was refused too, with no space in it at all, because `readablePrefix` blanks every quoted
span before `CHDIR` looks for the operand, so `LITERAL_PATH`'s whitespace exclusion was never
reached.

**What stayed open, named rather than guessed at:** two spellings of a fleet-check run are still
silent (KD-190), the `cd` reader's command position is still a bare separator where
`COMMAND_PREFIX` is not (KD-189), an unquoted brace expansion is still read as a literal path
(KD-192), and the oracle's failure message still describes the gate's answer as the shell's
(KD-193).

### KD-119 — a KD number is allocated per branch, and two branches in flight allocate the same one — **CLOSED 2026-09-22**

`docs/KNOWN-DEFECTS.md` (the open table and its entries), `scripts/hooks/proof-gate.mjs` (comments
that cite a KD number)

Measured 2026-09-18 at this slice's final re-record, between this branch and `origin/main` at
`4b59451`. Both files number their new entries from the highest number they can see, and neither
branch can see the other's. As found, FIVE numbers named two unrelated defects each:

    this branch   KD-109  KD-110  KD-111  KD-112  KD-113   (109-111, 113 open; 112 closed)
    origin/main   KD-109  KD-110  KD-111  KD-112  KD-113   (all open)

`origin/main`'s KD-110 is the preflight guarding `npm test`; this branch's was `COMMAND_PREFIX`'s
three alternatives. Its KD-113 is a nameless workspace spelled two ways; this branch's was the letter
sweep's blind direction. The table rows and entry bodies collide in the same file, so a rebase puts
both in front of whoever does it — the same surface as `b3670aa`, "the rebase kept both copies of
this branch's own rows", one step earlier. **What a rebase does NOT put in front of anybody is the
citation in code:** `scripts/hooks/proof-gate.mjs` cites KD numbers in three comments, and no
conflict hunk ever shows them.

**The collision itself is FIXED, in the commit that logged this:** this branch's five ids were
renumbered to 114-119 — above `origin/main`'s maximum, in every file that carries one including the
three code comments — BEFORE any rebase, because renumbering inside conflict hunks misses the entry
sections that do not conflict. What stays logged is the absence of anything that makes that routine,
and the fact that this entry's own body was rewritten by the renumber that fixed it: a blanket
substitution moved the `origin/main` row of the table above as well as this branch's, which is the
smallest possible demonstration that a KD number is a string in prose and nothing else.

**Direction: a reader is sent to the wrong entry, and nothing else.** No program in this repo parses
a KD number — grepped `scripts/` and `test/`, and `proof-plan.mjs`'s only mention of this file is a
sentence naming it — so no gate, refusal or count routes on one. Nothing false reaches an adopter.
The rule that avoids it is that the number comes from a place both branches can see — `origin/main`'s
highest, re-read at logging time, not the branch's own — and it is a convention, not a program.
Making it one is cheap to state and not free to get right: the deriver would have to fetch, which is
the thing `scripts/proof-plan.mjs` deliberately never does because a gate that fetched would move
the baseline it judges. So the convention stands, unenforced, and this entry is the record of what
it costs when it is missed. *Found 2026-09-18 by the third declared substitute reader, at the final
re-record of the slice that closed KD-107 — outside the four confirmations that re-record was
bounded to, so it landed as a log entry rather than a fix. The author took the fix on the same pass,
because a renumber is cheaper before a rebase than inside one.*

**CLOSED by `3516dc7`.** `node scripts/kd-next.mjs` allocates the next number from every place that
can hold one — the working tree, `origin/main` and every open PR head — prints what it read place by
place, and names on stderr anything it could not reach. So the convention this entry recorded as
"unenforced, and stated in prose" is a program now, and the header of `docs/KNOWN-DEFECTS.md` sends
a reader to it. It does not fetch to get there: it reads `origin/main` as the local remote-tracking
ref and the PR heads through `gh`, which is why the account it prints is part of the answer rather
than a footnote.

What it cannot see is a branch with no pull request — this wave's own shape — and that is logged as
KD-191 rather than carried here. `test/a-kd-number-is-allocated-per-branch-so-two-branches-allocate-the-same-one.test.mjs`
holds the program.

### KD-85 — apps stamped through 0.26.2 keep the unanchored hooks, and nothing this repo can run will fix them — **CLOSED 2026-09-22**

`template/.claude/settings.json` (fixed in 0.26.3) · `src/commands/doctor.mjs` (`applySafeFixes`)

Through 0.26.2 the template shipped three cwd-relative hook commands — `Stop`
(`node qa/receipt-check.mjs --hook`), `UserPromptSubmit` and `statusLine` (both
`test -f qa/walk-status.mjs && … || true`). Claude Code runs a hook in the SESSION's working
directory, so a session opened in a subdirectory loses the Stop gate loudly and loses the walk's
status line and prompt injection **silently**, because `|| true` turns a wrong directory into a
clean exit with no output. payment-blueprint hit the loud half on 2026-09-02 and anchored its own
copy on 2026-09-10; the template was never fixed, so every app stamped in between carries it.

**This slice anchors the template and gates it, and that reaches new stamps only.** Two reasons
the existing population stays broken, and neither is age:

1. Those trees are *other repositories*. No commit here edits them, which is the KD-78 shape — the
   entry exists so the gap is recorded rather than mistaken for coverage.
2. `create-cmp doctor --fix` is the one command that already writes into an app's
   `.claude/settings.json`, and it deliberately **adds** the walk wiring without ever rewriting a
   hook the app already has. That restraint is correct (it is the app's file), and it is also why
   the heal cannot carry this fix. `test/doctor-walk-wiring.test.mjs` pins the legacy string
   deliberately so the limit is stated rather than discovered. What the heal writes IS anchored,
   because it copies the template — gated in the same file.

**What the fix would be, when it is taken:** a `doctor` finding that reports unanchored commands
(the detector is already exported — `anchorViolations` in `src/lib/hooks.mjs`), and a heal that
rewrites only commands matching the shapes the template itself shipped, leaving anything an app
authored alone. That is a new adopter-facing diagnosis with its own consent question about
rewriting a file the app owns, so it is a slice, not a line — and it is the same change that would
close KD-86's half of this.

**RE-PLACED 2026-09-19, and half the recorded reason was not a reason.** It read *"no act available
here — those trees are other repositories; and no command an adopter runs would tell them."* The
first clause answers who can be REACHED from this repository; the second answers who is SERVED, and
that is the header's row-1 question. The second is now false: `create-cmp doctor` reads the app's
own `.claude/settings.json` and names each walk surface whose invocation will not resolve, with the
exact anchor to write for a hook (`src/commands/doctor.mjs`, `cwdRelativeWalkSurfaces`). The
population that was broken AND uninformed is now merely broken and informed, which is row 2.

**What this slice did NOT do, stated so the entry is not read as closed.** (1) No heal. Rewriting a
command an app authored still needs the consent question this entry names, and `--fix` still only
adds. (2) **Only two of the three commands are reported.** The finding filters to the walk
(`walk-status.mjs`), so a 0.26.2 app's `Stop` hook — `node qa/receipt-check.mjs --hook` — is still
diagnosed by nothing here. That one fails LOUDLY, which is why it is the third and not the first:
the silent pair is what an adopter could not otherwise find out.

**CLOSED by `63ba3f0`, red at `1581d00` (7 of 8 cases), finished at `f760f35`.** Both halves this
entry said the fix would be. The DIAGNOSIS: `shipped-hooks` and `unanchored-hooks` name every
anchorable hook surface that will not resolve, the Stop hook this entry recorded as diagnosed by
nothing included. The HEAL: `create-cmp doctor --fix` rewrites a hook command **in place** — the
command string changes and no other byte of `.claude/settings.json` does, so an app's own
formatting, escapes and hand-written hooks survive verbatim. What may be rewritten is bounded by a
committed table of every command the template has ever shipped (`src/lib/shipped-hooks.mjs`, every
string taken from git history) and narrowed again to a pair that differs by the anchor alone, so the
rewrite runs the same script whatever version of the lane the app carries. The consent question this
entry named is asked: `--yes` approves, a non-interactive run declines and prints what it would have
done, `--dry-run` previews and writes nothing. A command the app wrote is never rewritten — it is
reported with the anchored form to paste. The status line is still never rewritten (KD-90).

**The reach is TWO commands, not one, and this entry's row 2 is wrong about that.** It says
`doctor --fix` "is the one command that already writes into an app's `.claude/settings.json`".
`create-cmp upgrade --harness` also does: that file is in neither exclusion list of the sweep, and
`decideFile` returns `applied` whenever the app's copy equals the base stamp. Measured through the
same decision function the planner calls, with real bytes — an app that never touched the file gets
the current template exactly, an app that added its own hook gets a three-way `merged` file in which
**its own hook survives and both anchors land**, and an app that replaced or hand-anchored
create-cmp's own command gets `conflicted`: its file is NOT rewritten and the engine's version lands
beside it as `.cmp-new`. Preserved or merged, never clobbered — and the one case the merge refuses is
the same case the table heal refuses, because a hand-edited command is not a shipped form. The two
doors differ in mechanism and agree in outcome; the second one is logged as KD-194, with what was and
was not measured.

**What this closure does not reach, unchanged.** The population is still other repositories: no
commit here edits them, and an app is repaired when somebody runs `create-cmp doctor --fix` or
`create-cmp upgrade --harness` in it. That was always the remedy this entry named. KD-86's crediting
half goes with it — a bare-basename hook can no longer be read as health, because credit now requires
byte-recognition rather than the detector's silence — but KD-86 stays open for its detection half,
and KD-87's blind spot is likewise improved and not closed. KD-90 (the status line is unanchorable),
KD-180, KD-181 and KD-183 stay open as written, and KD-183's population is widened by KD-195.

*Closed 2026-09-22. The dry-run defect found while closing it — `doctor --fix --dry-run` wrote
`local.properties`, `gradle.properties` and a created `.claude/settings.json` — was ruled blocking
and fixed in the same branch by `af1bfbe` rather than logged, so it has no entry here.*

### KD-131 — one tree, two verdicts: a fixed-port preview-service test under full-suite load — **CLOSED 2026-09-22**

`inspector/mcp/test/preview-service.test.mjs:2922` · `qa-artifacts/suite-history.jsonl`

Measured 2026-09-19 while gating the round-pricing slice. The full suite ran twice over bytes
nothing had touched in between, and the kept records say it plainly — same `observedHash`
(`e386597…`), `FAIL` at 22:10:52Z and `PASS` at 22:12:22Z. The failing assertion is
`assert.match(page, /NOT refreshing/)`: the service was in the right state (`stale`, `pending:
false`, `phase: "unrefreshed"` all asserted and passing on the line above), and what came back from
`fetch` was a console page that did not carry the banner. Run alone, the file is 83/83.

Two things in the test are load-shaped rather than logic-shaped: it binds a FIXED port (19737)
rather than an ephemeral one, and it waits for `phase !== "idle"` on a 100 × 20 ms budget that a
busy machine can exhaust. A fixed port makes "the page I fetched is the service I started" an
assumption rather than a derivation, which is this repository's own
`served-page-is-not-your-code` shape one process over.

**Why it does not block.** No adopter runs create-cmp's inspector tests, and nothing in the failing
path is imported by the slice that observed it — the change under gate was `scripts/`, agent
definitions and docs. The second record over identical bytes IS the evidence that it is
non-deterministic rather than a break: a deterministic consequence of a diff does not pass ninety
seconds later on the same tree.

**Why logged and not fixed.** `inspector/mcp/` is another slice's file, KD-56 already holds the
class for it ("fails inside a full suite run and passes alone", and it names the owner), and the
honest fix — an ephemeral port and a derived readiness wait — is a change to a test this slice has
no business editing while gating something else. What this entry adds is the measurement KD-56 asks
for and a warning to the next reader of this branch's suite history: the `FAIL` row is this, and it
is followed by a `PASS` over the same hash.

*Logged 2026-09-19 by the slice that ran the suite, before any review round.*

**CLOSED by `1201495`.** The fixed port 19737 and the 100 × 20 ms budget are both gone: the service
takes an ephemeral port, the wait is derived rather than counted, and the page is fetched BETWEEN two
equal readings of the freshness — so the banner is judged only against the state the page was actually
served from, and "the page I fetched is the service I started" is a derivation instead of the
assumption this entry named.

Two things were ruled out on the way and are worth keeping. It was **not** a port collision:
`status().url` reports the port the service really bound and the service probes upward on EADDRINUSE,
so a collision cannot misroute the fetch — the fixed port was removed anyway, because it is a bet.
And it is **not** CPU load alone: 40 runs of that test under 24 burners were all green, which matches
KD-56's own note about this family. What explains the FAIL is the state moving between the assertions
and the request, which the fix makes impossible to mistake.

### KD-165 — one tree, two suite verdicts, three minutes apart — from a test whose verdict rests on wall-clock budgets — **CLOSED 2026-09-22**

`test/a-git-call-that-died-outside-the-kill-timer-is-read-as-an-answer.test.mjs` (second case),
`qa-artifacts/suite-history.jsonl`

Both rows are against the SAME `observedHash` (`b359f866…`) and the same commit (`bf79f72`):

```
05:47:00Z  FAIL  2122/2124   268552 ms   failing: "a git call that died outside the kill-timer
                                          is not an answer: crashing each one in turn must cost
                                          the check its verdict, never win one"
05:50:02Z  PASS  2123/2124   105713 ms   failing: []
```

The FAIL was what `node scripts/proof-plan.mjs` read out for this tree at the start of this
review — *"read it, do not re-run it"* — and the PASS was appended while the review was running.
Both are true of the same bytes, which is the whole entry.

**It is not this slice's code.** That file imports `scripts/hooks/proof-gate.mjs`; nothing in the
KD-16 change — neither parser, neither bin, none of the six installer read sites — is on its
import graph. What separates the two runs is load: 268552 ms against 105713 ms, and against
35489 ms and 36400 ms for the two full runs of this same branch ninety minutes earlier.

Executed here, 2026-09-19, on the same bytes:

```
$ node --test test/a-git-call-that-died-outside-the-kill-timer-is-read-as-an-answer.test.mjs
  ✔ 2 pass, 0 fail, duration_ms 7722          (the case itself: 7423 ms)
$ 12 concurrent CPU burners, same command
  ✔ 2 pass, 0 fail                             (the case itself: 4048 ms)
```

So it did not reproduce at the load available here, and this entry claims no diagnosis it cannot
show. What the test's own structure shows is where load reaches it: each of its six cases spawns
git with `budgetMs: REMOTE_CALL_CAP_MS` and then asserts `elapsed < NO_CAP_WAS_WAITED_OUT_MS` —
two wall-clock bounds per case, either of which a loaded machine crosses without the code under
test being wrong. Its own failure message names the first and tells the reader to *"raise
budgetMs at this call site, do not relax the bound"*.

**Why logged and not fixed.** No adopter runs this repository's suite, and the refusal the test
guards is not degraded — it is green whenever the machine is not saturated. Raising either bound
is the one remedy the test explicitly refuses. This is KD-131's class exactly (the same bytes
carrying a FAIL and a PASS, both on disk), with one thing genuinely new: KD-131 and KD-56 both
scope themselves to `inspector/mcp/`, and this member is a test of the **proof gate's own refusal
path**, so the sentence *"no adopter runs this repository's inspector tests"* no longer covers
the class.

**What a reader of the record cannot tell.** `suite-history.jsonl` records the verdict, the
duration and the tree, and nothing about the machine — so the only evidence that the FAIL was
load and not a defect is the duration beside it, read by a human. A gate that consumed these rows
would have to pick one of the two answers for one tree, and nothing tells it which.

**Fires when:** the suite runs on a machine busy enough to stretch it past ~3×, which on this
project is a device lane, a Gradle build, or several agent sessions at once.
*Logged 2026-09-19, review round 2 (re-record) of `fix-boolean-value-form-inverted-2`. Found by
reading the plan's suite line rather than re-running it — and corrected in the same round when
the PASS landed underneath it.*

**CLOSED by `d3ff9c0`.** The two wall-clock bounds per case are replaced by what the run RECORDED —
the shim's own `reached` / `survived` marks and the gate's own `why` sentence — so each case is proven
by which path the run took rather than by how fast the machine was. The one remedy the test itself
refuses was not taken: the bound is not relaxed, the purse is raised to 60 s, which is what its own
failure message names.

Measured both ways. The UNCHANGED file under 32 burners: **1 RED in 12 runs** — `` `git …
--is-ancestor …` died on SIGTERM but the whole check took 667ms ``. The rewritten file under the same
32 burners: **12/12 green**, with per-case elapsed values of 636, 699, 802 and 846 ms — every one past
the old 600 ms bound, and every one a run in which the gate was right.

**What this entry logged about the RECORD is unchanged and still true.** `suite-history.jsonl` records
the verdict, the duration and the tree and nothing about the machine, so no reader and no gate can
tell load from defect for the next member of this class; this closure removes one member, not the
class. One further member was found inside this test's own output and is logged as KD-205 — the
ordering check's `contains()` / `behindBy()` call site drops the `why` that says which of four causes
killed a git call.

### KD-56 — one unreproduced failure, and the instrument that saw it discarded the reason — **CLOSED AT THE TEST 2026-09-22; the production half is KD-202**

`node scripts/fit-test.mjs` ran `npm test` while `fleet-check` was compiling the scratch app and
booting the emulator, and reported `1951/1952 — 1 FAILING ✖ inspector/mcp/test/console-now-sse.test.mjs`
on `f2f7d24`. Nothing that followed reproduced it: that file alone five times with the emulator
running, 5/5; the full suite idle, 1951/1951; the full suite with all eight cores saturated by `yes`,
1951/1951. The slice touched neither the test nor `steps-bridge.mjs`/`preview-service.mjs`.

Two readings of the source narrow it. The lane-silence bound is 30 minutes, so the fixture's
`startedAt` cannot go stale inside a run. And `watchStepStream` polls once a second behind its
`fs.watch` — written precisely because "fs.watch on macOS coalesces and can drop under load" — so a
dropped FSEvents notification cannot outlast the test's 8 s frame deadline. What remains is a
test-process event loop starved for most of 8 s, under a load CPU alone did not recreate (the real
condition also had Gradle's and the emulator's disk I/O), or a failure that is not a frame timeout.

**It is logged and not chased further because the message is gone**, and that is the finding worth
keeping. `fit-test.mjs` runs the suite fresh and parses its stdout for the NAMES of failing tests — its
own comment says a bare count is unactionable — and discards the rest, so the one run that failed left
a name and no reason. Keeping the failing tests' output (or the whole log, under `qa-artifacts/`) is
the change that turns the next occurrence into a diagnosis. Not an adopter-facing defect: it is a test
of the live console's transport, which has the fallback that would make the real feature survive this.
*Logged 2026-09-16, during the device tier of `published-bytes-drift`.*

**THE MESSAGE, 2026-09-18 — and it is not what this entry guessed.** It recurred twice in one hour on
the `gate-judges-the-tree-the-command-acts-on` branch, under a full `npm test` and not under a lane;
the file passes 3/3 alone, immediately after, every time. Kept verbatim this time, which is the change
this entry asked for:

```
Error: Test "a line appended to the stream arrives as the RENDERED row — the page interprets nothing"
at inspector/mcp/test/console-now-sse.test.mjs:113:1 generated asynchronous activity after the test
ended. This activity created the error "TypeError: Invalid URL" and would have caused the test to
fail, but instead triggered an unhandledRejection event.
```

So it is **not a frame timeout**, which is what both readings above narrowed to, and not a starved
event loop: it is work the test leaves running after it returns, which then throws `TypeError: Invalid
URL`. Node's runner attributes post-test async activity to the test that spawned it, so the *reported*
failure is a test that had already passed — which is why every isolated re-run is green and why this
looked like load sensitivity for two days. The suspect is an un-awaited fetch or EventSource in the
`:113` test whose URL is built from a server that the test's own teardown has already closed. **Whose
defect: the test's, not the transport's** — nothing here says the console is wrong, and the two
readings above stay correct about the transport. The fix is to await or abort that activity before the
test returns, in a slice that owns `inspector/mcp/`.

**This is now a producer, so it is no longer unreproduced.** It cost this branch two recorded suite
verdicts and one of them stood as a `FAIL` the gate told its author not to re-run.
*Re-placed 2026-09-18 with the message it was missing, by the slice that hit it.*

**CLOSED AT THE TEST by `4413078`, and the production defect it was hiding is open as KD-202.** The
symptom is out of the suite: the three services in `inspector/mcp/test/console-now-sse.test.mjs` that
asked for `port: 0` — the standard way to ask the OS for a free port — were handed the console's
well-known port instead (`opts.port || DEFAULT_PORT`, and `0 || 9600` is `9600`), and were measured
binding **9601**, which is `DEFAULT_DAEMON_PORT`. Every console's `stop()` fires `GET /shutdown` at
that address unconditionally, daemon or no daemon, so a test service was sitting exactly where the
stray request goes. Those three now take an OS-assigned port that nothing else in the suite
addresses.

**The mechanism this entry asked for, measured rather than narrowed.**
`inspector/mcp/src/lib/preview-service.mjs` builds ``new URL(req.url, `http://127.0.0.1:${port}`)``
OUTSIDE its `try`, and `stop()` sets `port = null` after `server.close()` — which does not end a
request already in flight. A request landing in that window is handled with a null port, the URL
constructor throws `TypeError: Invalid URL`, and because the listener is `async` it becomes an
unhandledRejection, which node's runner attributes to whichever test most recently finished. That is
this entry's kept message verbatim, blaming the `:113` test that had already passed. Reproduced
deterministically: start a service, connect a raw socket, send half a request, call `stop()`, send
the rest.

**So the suspicion this entry recorded was wrong in its subject.** It reads "an un-awaited fetch or
EventSource in the `:113` test whose URL is built from a server that the test's own teardown has
already closed" — nothing in that test is at fault, and *"whose defect: the test's, not the
transport's"* is the wrong way round. The production half is NOT fixed here: it is shipped bytes plus
a `dist/server.mjs` rebuild, which belongs to the slice that owns `inspector/mcp/`. It is logged as
**KD-202**, with the two facts that put a request in that window logged beside it — **KD-203**
(`port: 0` is read as the default) and **KD-204** (`stop()` always sends `GET /shutdown` to the
daemon port). The change this entry asked of `fit-test.mjs` — keep the failing run's output — was
not made either; what closed this was the message being kept by hand in 2026-09-18's re-placement.

### KD-217 — `--fleet`'s empty form was traded for the generic sentence; two docblocks in the same file disagree about it — **CLOSED 2026-09-23**

`src/lib/args.mjs`, `packages/harness/install/args.mjs` (the `DESTINATION_FLAGS` docblock vs. the
`emptyValues` docblock immediately below it)

Both copies say, of `DESTINATION_FLAGS`: *"`--fleet` is deliberately NOT here … it already refuses
both its empty and its bare form with a sentence that teaches the manifest format. Folding it in
would trade that sentence for this one."* `emptyValues` tests `flags[k] === ""` for **every** value
flag before consulting `destinations`, so the empty form is already traded — keeping `--fleet` out
of `DESTINATION_FLAGS` only preserves the **bare** form's sentence. The `emptyValues` docblock
twelve lines down says the opposite (*"this is that refusal for every value flag, before any
command runs"*), and the same slice's own test asserts the new behaviour
(`an-empty-directory-flag-installs-into-the-working-directory.test.mjs:133`, *"every value flag the
installer takes refuses an empty value by name — `--profile=`, `--fleet=`"*). Measured on
`e21fc3d`:

```
$ prooflane upgrade --fleet=
  ✗ prooflane: --fleet needs a value, and was given none …      exit 2
$ prooflane upgrade --fleet
  ✗ --fleet needs the path to a fleet manifest.  A fleet is a file you write… exit 2
```

Both refuse and write nothing, so nobody is wrongly served; one fact has two spellings in one file
and the first is false.

**Fires when:** anyone reads either docblock to decide what `DESTINATION_FLAGS` buys.
*Logged 2026-09-22, round 1 of the doors review.*

**CLOSED by `8a0b7fc`, confirmed by the round-2 reviewer.** Both `DESTINATION_FLAGS` docblocks —
`src/lib/args.mjs` and `packages/harness/install/args.mjs` — no longer say that folding `--fleet` in
"would trade that sentence for this one". They now say what the two measurements above show:
`upgrade --fleet=` is already refused by `emptyValues` with the generic sentence, because that check
runs for every value flag before the destination set is consulted, and only the BARE `--fleet` still
reaches `fleet.mjs`'s sentence teaching the manifest format — which is the whole reason for keeping
`--fleet` out of the set. One fact, one spelling, and it agrees with the `emptyValues` docblock below
it. `8a0b7fc` is on `wave/review-doors` and is not yet an ancestor of the branch this closure was
written on; it lands when that branch merges into the wave, ahead of this one.

### KD-16 — a boolean flag's value form is consumed by a reader that cannot read it — **CLOSED 2026-09-19**

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

**Its placement was wrong, and the reason it kept was the abolished exemption in a new costume.**
The entry said "neither half is a regression … and an adopter is no worse served than before" —
which is *pre-existing*, the criterion this file's header struck off the line on 2026-09-14,
wearing the words "no worse than before" instead of the word "pre-existing". The header's own
answer is that age decides who paid for a defect and never whether it blocks; the question is
whether shipping it WRONGLY SERVES an adopter. Re-placed against that line on 2026-09-19 and
measured on `8bd782a`, it is the first row twice over — *given a tree they did not ask for*, and
*sent into a refusal* the wrong way round:

```
$ create-cmp upgrade --dry-run true --yes --target-dir <a two-line version catalog>
  Apply these changes (backups written as *.bak-upgrade)? (auto-yes)
  ✓ wrote gradle/libs.versions.toml (backup: gradle/libs.versions.toml.bak-upgrade)
  Applied.

$ prooflane init --new-profile false --dry-run --no-interview <a tree the cmp profile claims>
  ✓ 51 files written          ← the claimed-tree refusal (install/init.mjs:950) never fired
```

An adopter who wrote `--dry-run true` had their version catalog rewritten, with the consent
prompt skipped by the `--yes` on the same line — the flag that protects the tree was the one
misread, and the flag that removes the last question was the one read correctly.

**CLOSED at the parser, which is the only place that reaches every reader.** A declared boolean
that consumes `true`/`false` now stores the BOOLEAN, at both doors and at the harness door's `=`
branch, so the ~24 sites spelled `=== true` / `!== true` / `Boolean(...)` are right without one
of them being edited. `flagBool` reads `x` and `no-x` through one tri-state helper (`--no-x
false` is true; today's precedence — the affirmative name answers first — is unchanged and now
pinned), the harness package has the same `flagBool` and its six boolean reads go through it, and
a declared boolean still holding a string after all that (`--dry-run=maybe`, reachable only
through the `=` form) is refused by name at both bins. The SPACE form holding anything else is
deliberately not refused: that is KD-7's shape, and KD-150 logs what it costs.

*Logged 2026-09-14 (review round 2 of `fix-flag-eats-target`); closed and re-opened 2026-09-14;
closed 2026-09-19 by the slice that fixed it, with
`test/a-dry-run-asked-for-in-words-writes-the-tree.test.mjs` and
`test/a-declared-booleans-value-arrives-as-a-string.test.mjs` — 54 of the truth table's 162 rows,
and all three end-to-end shapes, measured red on `8bd782a` first.*

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

