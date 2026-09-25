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
refuse. So the LAST round re-records after its own fix. Who does it is Karel's decision of
2026-09-26 (KD-251): that round's reviewer is resumed only while its cache is still warm, as
ADR-0015 amended that day allows, and a reviewer whose cache has gone cold is not resumed:
instead, a FRESH reviewer reads only the delta — the bytes that moved since the recorded round —
and records with `--kind rerecord` under that same round number. Re-recording is not another
round: it confirms or refutes the recorded finding against the bytes that merge, and reads
the delta, not the diff.

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

**A KD number comes from `node scripts/kd-next.mjs`, never from the highest number this branch
can see** — it reads the working tree, `origin/main` and every open PR head, and says on stderr what
it could not reach (KD-119: five numbers once named two unrelated defects each).

## The open list, in one screen

A reviewer reads this file on every round, so the whole of what it must know is here. The
entries below carry the measurement; this table carries the fact, and grepping `^### KD` gets
you the same list without opening anything.

| | | |
|---|---|---|
| **KD-3** | `executionHint` reads menu paths without its sibling's prefix filter | cannot fire — one CONTRACT declaration |
| **KD-5** | `tokenDrift` SKIPs whenever the debug app is not running | environmental, indistinguishable from broken |
| **KD-6** | `device` is not among the agnostic lint's runtime nouns | adding it fails ten core modules today |
| **KD-8** | the dangling-citation lint reads `ADR-NNNN`, not `§` | nothing dangles; a checker risks false positives |
| **KD-20** | the vendored lane's parsers refuse `--` as well | not npx-reachable |
| **KD-21** | `KNOWN_FLAGS` is hand-written where `BOOLEAN_FLAGS` is derived | zero gaps measured, both directions |
| **KD-24** | `--yes` refused at one door, accepted-and-ignored at the other | the flag is inert; the rest of the line still does what was asked |
| **KD-25** | an interrupt that printed nothing would pass the suite | wording deliberately not pinned |
| **KD-28** | the header's KD-7 measurement cites a count this log attaches to another defect | the argument does not rest on the number |
| **KD-30** | the "second lane run left no receipt" guard reads the path the first run's receipt is at | unreachable; the stale receipt reads as the overclaim |
| **KD-32** | the plant driver spells cmp's source root and pack id as literals | both fail loud, and there is one pack |
| **KD-37** | two fleet ids naming one directory are counted as two repos upgraded | the second pass is idempotent; both were named |
| **KD-39** | a harness nested under an unrelated `node_modules` borrows that project's provenance | unreachable in every layout npm/pnpm/npx produce |
| **KD-43** | the guard that says the suite is complete is collected BY the suite | no fix that keeps one decider; the declaration is a reviewed trigger path |
| **KD-44** | the matcher covers dotfiles and dot-dirs the runner skips — with the declared pattern, no exotic construct | no tracked test file is dotted; the refusal list cannot reach this |
| **KD-45** | no gate in this repo executes the Firebase or iOS paths | Firebase: an L2 run executes the add step's output at startup, owed when its bytes move (`--with-firebase`), none recorded yet; no traffic crosses the redirect (KD-210); iOS: the L2 run stamps `--no-ios`; the iOS stamp compiled once on CI (run 36181162894, dispatch-only, 0.28.0 tree) and has never run |
| **KD-46** | the iOS refusal names two causes its `catch` cannot see | half fixed in `79eafd3` (the cause is carried now); Obj-C raises abort before any Kotlin frame, and the app stops either way |
| **KD-48** | `Platform.isDebugBinary` is a build-type reading, not the Android flag's twin | the shipped Xcode project has only `Debug`/`Release`, which map correctly |
| **KD-49** | a nested `node --test` exits 0 whatever its tests did, when `NODE_TEST_CONTEXT` is inherited | nothing in the suite spawns one except the harness that measured it, which scrubs the env |
| **KD-51** | a JS masker reads the template's Kotlin; a raw string mis-parses and truncates the scanned body | it reds, not greens — the `useEmulator` tripwire catches the stub — and neither file has a raw string |
| **KD-52** | what the emulator scan's two token-level assertions do NOT decide | the inert clause is gone (`f474f17`); the rest is the floor of a shape scan, and no shape reaches it |
| **KD-58** | the proof gate reads the publish command's words inside a quoted pattern or a heredoc as the act, and refuses | refuses, never allows — and only the agent is refused |
| **KD-63** | the lane refusal reads `qa/.lane-in-progress` with none of the guards its other readers apply | one clause of the sentence degrades; the refusal, the project and ours/not-ours are unaffected |
| **KD-64** | a sibling git worktree of this repository is described as ANOTHER project's lane | errs toward waiting, and the path it prints is true |
| **KD-65** | the lane's project can still be a token the gate never verified — a `--flag=` value, or the first of two occurrences | no producer: every argv this repo and the harness spawn was verified correct |
| **KD-66** | the lane probe's bound covers its subprocesses, not the `existsSync` the same fix added | unmeasurable here — no portable way to plant a wedged mount |
| **KD-68** | criterion B omits `checkFreshness`, which needs no tree — the vendored receipt goes stale 2026-10-17 | B is behind an unsigned criterion A and reports "not reached" |
| **KD-69** | three fields of the attestation shape the gate documents are read by nothing — `schema`, `artifact.kind`, and whether `receipt` is there at all | ADR-0007: nothing routes on `schema`; the other two fail loud in criterion B |
| **KD-70** | a `file.mjs:NNN` citation goes stale the moment anything is inserted above it, and nothing checks one | 154 in the tree; three went stale in one slice; all of them are in comments and logs, none in a surface an adopter reads |
| **KD-71** | `isCalendarDay` calls every year 0001–0099 a day the calendar does not have — `Date.UTC`'s two-digit-year mapping | the refusal is right, its reason is false, and no signer types a three-leading-zero year |
| **KD-72** | the signed attestation can be rewritten without owing or reopening a review — `REVIEW_TIER_TRIGGERS` is a code allow-list and `docs/` is not on it, but that is where this one evidence-bearing file lives | the exemption is right for prose and wrong for this file; nothing is mis-served today, and the harm needs a future edit |
| **KD-73** | a bare "<n> steps" is not gated, where "<n> steps at \`<profile>\`" now is | measured 50% false positives; the profile-bound form catches every drift there was |
| **KD-74** | `nightly` is a lane profile `ground-truth.mjs` does not enumerate, so no gate can check its row | the row states no number now, so nothing false ships |
| **KD-75** | the profile-bound lane reader refuses a SUBSET of a profile's steps, and any number in a table's second column | measured: three shapes, none of them written anywhere in the tree today |
| **KD-76** | the same reader PASSES a wrong lane size written as a word, or with the profile named first | measured: three shapes, none written anywhere in the tree today |
| **KD-77** | the CLI-command count is derived, gated, and calibrated by nothing — no surface states it | the reader is idle, not wrong; a future "<n> commands" is still refused |
| **KD-80** | the ordering precondition guards the device RUN; `gh pr merge --rebase` is where an unproven tree actually lands | the hand-rebase case reopens the tier and is refused at the merge gate already |
| **KD-81** | a branch git could not name routes to "does not apply", so the check passes SILENTLY | no producer: the same git failure makes `obligation()` report `none`, which never reaches the check |
| **KD-82** | the ordering verdict is commit-graph ancestry where every other obligation here is trigger-path bytes | the refusal's remedy is the rebase you owe the merge anyway; it costs a rebase, never a run |
| **KD-83** | "the ordinary owed-allow is byte-identical to before the ordering check" is verified by nothing | the cross-path comparison beside it is real; only the historical claim is unpinned |
| **KD-84** | `declaredBudgetMs` has two implementations and the declared 10s has three spellings | all three agree today, and the unreadable-settings fallback errs small |
| **KD-86** | the anchoring detector judges `.mjs/.cjs/.js/.sh` only, so a hook invoking `python qa/x.py` or a bare `qa/tool` reads clean | measured against the template: every command it ships is `node` or `test -f`, so the allow-list refuses nothing that exists today |
| **KD-87** | the anchoring detector equates *single-quoted* with *not executed*, so `sh -c '…'` / `eval '…'` read clean; and it reads each match's prefix from the UNMASKED command, so a shell-inert `'${CLAUDE_PROJECT_DIR:-.}/…'` counts as anchored | both measured by execution and bounded by `test/hook-anchoring-differential.test.mjs`; no command in either shipped settings file is in the blind spot, and the gate reds the day one is |
| **KD-88** | "every surface that carries a command" is spelled as a two-item list (`hooks[*][*].hooks[*].command` + `statusLine.command`) in both readers, and `settings.json` executes more than that — `apiKeyHelper`, `awsAuthRefresh`, `awsCredentialExport` | measured: a fourth hook EVENT and a second hook in an existing group are both caught BY NAME; only a non-`hooks`, non-`statusLine` key is invisible, and neither settings file has one |
| **KD-90** | the `statusLine` third of the hook-anchoring fix is NOT fixed — `CLAUDE_PROJECT_DIR` is not exported to a statusLine command, so the anchor would be inert | **re-placed 2026-09-19**: the old reason (*nothing regressed*) is age, which the header abolished. The surface IS inert and an adopter IS affected — what moves it to row 2 is that they are now TOLD, by `doctor`, in the one place that could tell them. The remedy needs a different mechanism (stdin `workspace.project_dir`, KD-181), not a different spelling |
| **KD-91** | the differential's `invoking >= 3` vacuity floor names the statusLine, which its own antecedent now skips | five surfaces are counted, so the floor holds with margin; only the sentence is stale |
| **KD-92** | the actionable subset all three anchoring gates call is calibrated by nothing — `unfixedHookAnchors` replaced by `return []` leaves every anchoring test green | measured: the detector is right today, and the PLANT test calibrates the honest total; only the filter under it is unpinned |
| **KD-93** | surface-awareness landed in ONE of the two readers — the differential asks `unanchoredPaths` with no surface (whose default is "anchorable"), and both behavioural harnesses export `CLAUDE_PROJECT_DIR` to the statusLine | the shipped statusLine is relative, so no instrument answers differently today; it fires only if someone writes the anchor on that surface |
| **KD-94** | this file's header says adding an entry "cannot reopen a gate"; it reopens the SUITE gate, because the suite hash deliberately covers markdown | measured: logging costs one ~50s `npm test`, never a device run or a review round — the header's argument holds, its blanket sentence does not |
| **KD-96** | SessionStart still prints the tree the hook was LOADED from as "this tree" | a context line, not a gate — every PreToolUse verdict now judges the tree the command acts on |
| **KD-97** | the judged worktree's own `proof-plan.mjs` decides, whatever commit or state it is in | both ways it can differ fail safe: that tree's own answer, or a refusal |
| **KD-98** | an npm flag whose value the gate does not know is read as a folder operand, and the refusal names it | the direction is a refusal, and the seven flags a publish here actually uses are known |
| **KD-99** | a directory git answered 128 ABOUT is read as "another repository" and gated in SILENCE | the two producers are `cd <tree>/.git` and a repo git refuses to open; neither is typed here |
| **KD-100** | the tree probe's purse bounds its git calls, not the three filesystem calls in front of them | same unmeasurable shape as KD-66 — no portable way to plant a wedged mount |
| **KD-101** | `npm publish .` is refused as publishing something "rather than the directory it runs in" | `.` IS that directory; only the sentence is wrong, and no publish here writes one |
| **KD-102** | the judged tree is checked for one of the two files the gate imports out of it — `observed-tree.mjs` is not | the direction is a refusal; only its words are a module resolver's instead of the gate's |
| **KD-103** | the list operator that decides whether a `cd` runs — an `&&`/`\|\|` guard, a pipeline, a backgrounded list, `!` — is not read: 26 of 108 generated shapes resolve a tree the shell would not use | fail-open, and no producer: each needs a mixed `&&`/`;` list whose guard fails at runtime, a `cd` as a pipeline element, or a backgrounded AND-list in front of the gated command |
| **KD-104** | a gated command inside `sh -c '…'` is refused when anything stands in front of it INSIDE the quote, and judged at the payload's cwd when nothing does | a refusal in the first shape, sentence now true of it, remedy in the command; the second lands on the right tree — a nested shell with no `cd` inherits the cwd |
| **KD-106** | `{}` as an ARGUMENT is read as a brace group, because its own `{` is the separator its `}` needs — `find … -exec rm {} \; && gh pr merge` is refused | a refusal, only the agent is refused, the sentence names `{ }` and it IS in the command; no producer — no merge, publish or fleet-check here is typed behind a `find -exec`/`xargs -I` |
| **KD-108** | a refusal quotes the MASKED scope, not what was typed, so a quoted `cd` destination vanishes from the sentence — `cd "$HOME" && gh pr merge` is refused with the evidence `(cd)` | the refusal and its direction are right; only the parenthetical is emptier than it reads, and the remedy is still the operand in front of the user |
| **KD-109** | the third of KD-89's three failures never reproduced — and `applyConsoleCopy`'s bare `catch {}` still re-narrates ANY profile load error, a missing module included, as "this project declares no console copy" | the door refuses an uninstalled tree before any of the three runs, so the misattribution cannot reach a contributor whatever the third's trigger was; the fallback itself is deliberate — a page load must not crash on an unreadable profile |
| **KD-110** | the preflight is npm's `pretest`, so it guards `npm test`, `prepublishOnly` and CI — and not `node --test <file>`, which is how a contributor or an agent narrows to one file | the defect KD-89 recorded is a FIRST impression of the documented command, and that command is refused by name; someone running one file directly has already chosen the narrower instrument |
| **KD-111** | `installedFrom` is npm's layout — a Yarn PnP checkout has no `node_modules` at all, so every declared dependency reads missing and a working tree is refused | no producer: this repo declares npm (`package-lock.json`, npm `workspaces`, `npm ci` in CI) and no other lockfile is in the tree; the failure is a loud refusal naming a command, never a silent pass |
| **KD-112** | the door has no bypass, so every way it can be wrong ends in a correctly installed tree that cannot run its suite at all — a named `PROOFLANE_SKIP_PREFLIGHT=1` would bound the class at one line | a product decision, handed up rather than taken: the population is empty today (KD-111 has no producer, and the one real divergence found in review is fixed), and an escape hatch is how a guard becomes optional |
| **KD-113** | the two readers spell a NAMELESS workspace's name differently — npm synthesizes the directory basename (`noname`), the door falls back to the rel path (`ws/noname`) — and the landed invariant test uses that name as the set's identity | measured over twelve layouts, the only divergence left and the only one that is a LABEL rather than a member: coverage, refusal and remedy are identical. No producer — every package this repo declares names itself — and the first one that does not reds the invariant test for a reason that is not the defect it is about |
| **KD-114** | the closed wrapper list KD-107 landed does not read through five further shapes — `bash -lc "gh pr merge"`, `{ gh pr merge; }`, `ssh host '…'`, `watch -n 5 …`, and a wrapper carrying an operand its table entry does not declare (`sudo -u me -g grp extra …`) | fail-open at the classifier, and the residue the closed list names out loud rather than guessing at (docs/GATE-RULES.md, Rule 4); no producer — a merge here is typed `gh pr merge --rebase --delete-branch`, bare or behind a `cd` |
| **KD-115** | "no word in a command prefix crosses a character that ends a command" is honoured by ONE of `COMMAND_PREFIX`'s three alternatives — the assignment and redirection alternatives are still `\S*`, and `A=a;b `, `A=a&&b `, `2>a;b ` all match the prefix across the separator | the comment is wider than the code, and the code is right by accident: leftmost-match still starts the invocation at or after any `cd`, so no shape resolves a different tree — swept for one and none found. Nobody is served wrongly today; the next reader of that comment is |
| **KD-116** | `IN_WORD` and `GAP` — the two clauses that say a wrapper run does not cross a character that ends a command — are pinned by no test since the bare-operand run they guarded was removed: relaxing either to `\S`/`\s+` leaves the whole suite green | not a wrong clause, an unpinned one: both are right about the shell, nobody is served wrongly, and the honest remedy (the declaration's comment states which clauses are measured) was taken. A test with no consequence to assert would have to assert the regex's own source — the third spelling that KD-107 was |
| **KD-118** | the letter sweep runs only the direction where the shell PRINTS, so a value-taking letter MISSING from `WRAPPER_ARITY` is invisible to it — the run ends a word early and the gated program is read as the flag's value. Two were found by hand at the re-record (`command time -o F gh pr merge`, `xargs -J R gh pr merge`; both really merge, both answered `null`) and both are FIXED; what is logged is that nothing would catch a third | fail-open at the classifier, no producer — zero hits for `command time`, `/usr/bin/time` or `xargs -J` in this tree. The fix is a second sweep, costed at 13 spawns done per-wrapper (676 done per-letter); not built because this slice's two rounds are spent and it is a new mechanism rather than a correction |
| **KD-120** | the tool check's oracle for "is this a tool" is the grant line it is checking, so a name invented or misspelled identically in `tools:` and in prose clears it — and "add it to `tools:`" is the remedy its own failure message prints | the benign direction: a grant for a tool that does not exist is inert, where prose naming a tool the agent lacks is still refused. No in-tree oracle exists and the design deliberately refuses to carry a list; what WAS open — whether `SendMessage` and `TaskStop`, both added by that branch under that remedy, are real names — is answered: **both are**, confirmed 2026-09-18 from the harness's own tool schemas, i.e. from outside this tree. That the answer cannot be kept here is KD-128 |
| **KD-121** | six spellings of "use this tool" the check does not see — inside a fenced block, backticked with an argument (`` `SendMessage(a)` ``), split across a line break, not backticked at all, `mcp__x__y`, and a hump containing an acronym (`ReadPDF`) — and the comment justifying the fence strip ("examples and shell, not instructions") is false of BOTH fenced blocks in this repo's definitions | measured: every tool-shaped token anywhere in all three definitions is already visible to the checker, so no producer; the two fences hold commands the agent IS told to run, but neither names a tool |
| **KD-122** | the check reads ONE spelling of `tools:` where the harness reads YAML: a list form parses to `{"- Read"}` and drops the rest, and an ABSENT `tools:` line — which means the subagent inherits EVERY tool — is read as granting none | both fail loud, never silent (they can only manufacture offences, not hide them), and no producer: all three definitions use the comma form and all three declare one |
| **KD-123** | **FIXED same day** — three prose facts the change stated that the tree did not support: the new section cites the 5-minute rule as "below" when it is 44 lines above; its actionable remedy is scoped to `Agent` while `SendMessage` — granted by the same commit, and what RE-DELEGATE step 2 tells it to use — has the same stall shape; and the test's header attributes to SEVEN orchestrators a cold-substitute cost the commit measures at FOUR | the section's general rule ("nothing left to do but wait means you spawned it wrong") does cover the `SendMessage` path, so only the bullet is narrow; the count and the direction word are narration, and nothing routes on either |
| **KD-124** | `attribute()` in `scripts/change-price.mjs` and `mine()` inside `summarize()` in `scripts/lib/proof-history.mjs` are two spellings of ONE attribution rule — a branch match plus a time window — in two files that share no code | nobody is wrongly served: the new reader is advisory, prints a count and refuses nothing, and the difference between the two spellings is the deliberate one its own docblock names. The honest remedy edits a file this slice put out of scope |
| **KD-125** | `attribute()` matches `row.branch === branch`, and `currentBranch()` spells a detached HEAD `""` where all three history writers spell it `null` — so on a detached HEAD every recorded run is attributed to nobody and each row reads `0 record(s)` | no producer: this is an advisory a human reads on a branch, and the block's own `branch` line already prints `(detached)`. One reader-pair over from KD-113, and in the same class |
| **KD-126** | `test/the-spent-block-asserts-counts-the-records-do-not-support.test.mjs` (its header and its line-78 failure message) still tells a contributor that `proof-plan.mjs --history` prints the malformed count for these files. It does not — `--history` reads `plans`, `reviews` and `fleet`, never `qa-artifacts/suite-history.jsonl`, and sums ONE count across the three | the same false fact `6231a21` corrected in production, surviving in a second spelling in the test file that found it. Nobody outside the repo is served by it: it misleads only a contributor reading that assertion's message. Round 2 was the last round, so it is logged rather than fixed |
| **KD-127** | the second case of `test/the-advisory-states-what-its-own-input-refutes.test.mjs` opens `if (!cited) return;`, so on green bytes it asserts nothing, and the class it guards is pinned only against the literal string `proof-plan.mjs --history` — a citation to a different command that reported the fact no better would pass | deliberate and documented by its author (the test is a refuter, and the refutation has been answered), but it is a test measuring nothing today. The honest remedy is a claims table keyed on what a command reports rather than on its name; not built, because it is a new mechanism and this slice's two rounds are spent |
| **KD-128** | five tool-schema facts are now stated in this repository and none can be re-read here: four about `SendMessage` in `agents/cmp-orchestrator.md` (no `run_in_background`; a send never blocks; no reply arrives inside the sending turn; the reply is delivered to a later one), and KD-120's answer ("**Both are** … confirmed from the harness's own tool schemas") | KD-120 one level down: that entry left open whether two tool NAMES are real, and both the answer and a claim about one's parameter LIST arrived from outside the tree. They may well be right; what is logged is that no gate here can ever red if the schema moves, so the shipped bullet and the closed entry both rest on a fact this repository cannot hold |
| **KD-129** | `node scripts/change-price.mjs` now PRINTS which review round is next and what it reads — text a reader acts on, about this file's rule — and `test/the-review-rule-is-stated-twice.test.mjs` scans `.claude/agents/`, `skills/`, `agents/` and one printed string, so no `scripts/` text is read by it | nothing false is printed today: measured at zero six-word runs shared with the header across every file this slice touched, and the one printed sentence that had stopped being true of the tree was corrected here. What is logged is the hole, not a drift |
| **KD-130** | `reviewDischarge` copies six named fields of a review record into `plan.reviewDischarged`, and `round`/`kind` are not among them — so the settled-plan history `--history` reads can say a review discharged the slice and never which round did | no reader consumes a round from there: the block that prices rounds reads `review-history.jsonl`, where both fields ARE written. The honest remedy edits the plan-event schema and its summariser, which is the file KD-124 already names |
| **KD-161** | the round block prices round 2 from whether the DELTA is empty, and a round 1 that logs its findings writes to `docs/KNOWN-DEFECTS.md` — so the delta is almost never empty and the one NOT-OWED case is almost never reachable | measured on its own first use: round 1 of the slice that added it found nothing blocking, made NO fixes, wrote two log entries, and the block priced round 2 OWED. The header's rule is about round 1's FIXES, not about any delta. Advisory only — a human read it, disagreed, and took the header's answer |
| **KD-162** | the sweep proving the lock is a "class of one" allow-lists `qa/e2e/` and `qa/golden/` by PREFIX, so a machine-written file added under either is invisible to it | measured: today's three survivors under those prefixes really are app content and the lock really is the only other one, so the claim holds — what is unpinned is tomorrow's addition, not today's answer |
| **KD-132** | the review-round measurement *"round 1 took 6.9 minutes and round 2 took 3.6"* is stated in three places — `scripts/change-price.mjs`'s PART 4 header, the new round test's header and `docs/features/price-the-next-review-round.md` — and none of them says what was timed; the instrument was an agent's wall clock from spawn to report, which is outside this tree | nothing routes on the numbers and the design they support rests on the rule of record, not on them. What a reader CAN compute here is the gap between that slice's two review-history rows (20:16:05.182Z → 20:21:21.355Z, 5.3 min), which is a different quantity and matches neither figure — so the claim can be believed but never checked. KD-128 one file over |
| **KD-133** | `nextRound`'s CAP SPENT arm returns `read: null` and `settles: []` even when proof-plan reports the review tier REOPENED — the moment the rule of record's header makes the last round owe a re-record, which is what this slice's own `--kind rerecord` is for; its NOT-OWED sibling names that obligation in the same state | driven and read back rather than argued: the same screen's `spent` review row already prints *"REOPENED … a fresh record is owed for the SAME round"*, so no reader of the program's output is misled. What is missing is the block's own answer at the moment that block is the thing being read |
| **KD-150** | a declared boolean's SPACE form holding anything but `true`/`false` still hands the token to the positionals, so `prooflane init --dry-run maybe ../app` installs into `./maybe` and `create-cmp --no-firebase no my-app` scaffolds into `./no` | deliberate, and the alternative is worse: refusing it makes `create-cmp --minimal my-app` an error and re-creates KD-7, the defect class this repo cares most about. An adopter may legitimately have a directory called `no` |
| **KD-151** | a contradictory line (`--ios false --no-ios false`, `--x --no-x`) is resolved by precedence and refused by nothing — the affirmative name answers and its `no-` twin is never consulted | no answer is right, so the honest act is to pin the one that has always been given rather than invent a refusal for a line nobody types; pinned by test, so a later change to `flagBool` has to mean it |
| **KD-152** | `--version` and `--help` are the only declared booleans read by PRESENCE, so `--version false` still prints the version instead of meaning "not the version" | required by KD-15: at create-cmp's door the something-else is `create`, which writes — normalizing their value form made `create-cmp --version false --yes` scaffold an app while the user waited for a version string. A question is answered in whatever form it is asked |
| **KD-163** | the KD-15 guard's new value-form test drives `bin/create-cmp.mjs` with the REPOSITORY as its working directory, asserts only exit code and stdout, and sets no `timeout` — where the sibling test for the same defect class sandboxes the cwd, asserts it is still empty, and times out at 60s | cannot fire while the guard holds, and `myapp/` is gitignored so no gate reads what it would write. What is logged is a gate whose failure mode is a multi-minute untimed Gradle build inside `npm test` rather than an assertion |
| **KD-164** | the reason given in BOTH new copies of the arg parser for not sharing one module — "the published root tarball carries no copy of this directory" — is refuted by `npm pack` on the root: all nine files of `packages/harness/install/` ship, `args.mjs` beside `src/lib/args.mjs` in one 389-file tarball, and `package.json`'s `files` names the directory outright | the DECISION is right for a reason the comment does not give: `prooflane-harness`'s own 94-file tarball carries `install/args.mjs` and no `src/`, so the harness alone still cannot import the root's copy. Nobody is mis-served; the next reader of either file is told a packaging fact this tree answers the other way |
| **KD-166** | "when is this product's output styled" has two spellings that disagree: `src/lib/log.mjs` re-exports picocolors, which colours when `CI` is set even through a pipe, while `packages/harness/install/log.mjs` gates on `process.stdout.isTTY` and never colours through one | measured green both ways today — all 20 test files that drive `bin/create-cmp.mjs` pass with `CI=true` (154/154) — so no live member. What is logged is that the class has now been answered TWICE per-file (`bf79f72` here, and `the-fleet-command-…` before it) rather than once at the source, and that an adopter's piped CI log carries escape codes from one door and not the other |
| **KD-180** | doctor's new status-line verdict over-reports an ABSOLUTE path (`node /Users/x/app/qa/walk-status.mjs` reads as cwd-relative), and its `ok` is unreachable end-to-end while `ANCHORABLE_SURFACES.statusLine` is `false` | measured, both directions: nothing in this repo or its heal writes an absolute status line, so the over-report has no subject; the direction is the conservative one the detector chooses on purpose, and the under-report direction — an `ok` over a silent surface — is what this slice closed |
| **KD-181** | this tree stated the statusLine's stdin BOTH ways, and the false one governed a live path: `walk-status.mjs` said *the statusline gets no stdin*, `hooks.mjs` and KD-90 said it carries `workspace.project_dir` | settled 2026-09-19 from the official statusLine documentation (out of tree, KD-128's class): the comment was false and is corrected here. So the status line IS fixable — via stdin, not via the env var — and what is logged is that this slice does not take it: whether `$(cat)` can block with no payload is undocumented, and a status line that hangs is worse than one that prints nothing |
| **KD-182** | the comment explaining the new check calls `node qa/walk-status.mjs --statusline` "the pre-0.26.3" form, and it is what `template/.claude/settings.json` ships TODAY at 0.26.7 | the same slice's CHANGELOG states the population correctly ("**every new stamp**"), so nothing an adopter reads is wrong; what the false attribution can do is tell the next reader of that code that the shipped template is not among the affected |
| **KD-183** | the hook verdict reports a command that really resolves as cwd-relative — `cd "${CLAUDE_PROJECT_DIR:-.}" && node qa/walk-status.mjs` runs the walk from any directory and is named as one that does not | measured by executing it from a foreign cwd: the over-report is the conservative direction the detector chooses on purpose (KD-180's first row, one surface over), the remedy it prints leaves a working hook working, and the opposite direction is now gated by `test/doctor-claims-working-for-a-surface-a-foreign-cwd-cannot-run.test.mjs` |
| **KD-184** | `--=x` splits into the EMPTY flag name, and both doors refuse it as `--` — which is the one token both parsers DO accept, the npx end-of-options separator | refused, exit 2, nothing written; the sentence names something other than what was typed, and the doors converged on it rather than special-casing one |
| **KD-185** | the inspector bundle's freshness hash reads THIS tree while its bundler resolves `prooflane-harness` through `node_modules` | needs a rebuild run from a worktree with no install of its own; CI installs at the root |
| **KD-186** | the publish skill says `inspector/mcp` is `private: true`; it is published as `@create-cmp/inspector` | the instruction it supports (publish from the root) is right, its reason is false |
| **KD-187** | in this repo a `create-*` alias runs the REGISTRY's create-cmp-cli, not the tree's | the aliases are pass-throughs and an adopter gets the latest; no gate can exercise one against this tree |
| **KD-189** | the proof gate's `CHDIR` reader calls a command position "a separator", while `COMMAND_PREFIX` calls it "a separator plus wrappers, assignments and redirections" — so `X=1 cd /slice && gh pr merge`, `2>/dev/null cd …`, `command cd …`, `builtin cd …` and `time cd …` are `cd`s the shell PERFORMS and this reader drops, falling back to the payload's cwd | KD-107's class, a third reader over: the fallback direction is KD-79 itself, a merge judged against the session's tree. Measured against `/bin/sh` on five prefixes; unchanged by the slice that closed KD-95, which touched the operand and not the position |
| **KD-190** | the device classifier still cannot see two spellings of a fleet-check run — `node $(git rev-parse --show-toplevel)/scripts/fleet-check.mjs` and `node --no-warnings scripts/fleet-check.mjs` — so both are SILENT rather than refused | the same fail-open KD-95's fleet half was, in the two shapes that slice did not widen to: a substitution is not a literal path, and a flag before the operand is a different grammar |
| **KD-191** | `scripts/kd-next.mjs` cannot see a KD number allocated on a LOCAL branch with no pull request, which is this wave's own shape: six `wave/*` branches in flight, two open PRs | measured harmless today — all six wave branches are at 183, the same maximum `origin/main` and both PRs show — and the program says what it saw, so the gap is visible in its own output |
| **KD-192** | an unquoted brace expansion in a `cd` operand is not refused: `cd /tmp/a{b,c} && gh pr merge` resolves `/tmp/a{b,c}` while the shell runs in `/tmp/ab` | cannot mislead unless a directory literally named `{b,c}` exists — otherwise the resolved path is not there and the gate refuses for that reason; measured both ways |
| **KD-193** | the oracle test's failure message says *"the shell runs it in: the payload's cwd"* whenever the GATE resolved the payload's cwd, whatever the shell did — it printed exactly that for `cd /here"/sub"`, which the shell runs in `/here/sub` | a diagnostic only, on a failing row, in `test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs`; it misdescribes the oracle in the one moment a reader is trusting it |
| **KD-194** | `create-cmp upgrade --harness` writes `.claude/settings.json` too — `decideFile` returns `applied` whenever the app's copy equals the base stamp — where KD-85 said `doctor --fix` was the one command that does | measured preserved-or-merged, never clobbered: an app's own hooks survive and the anchors land, and the one case the merge conflicts on is the case `doctor --fix` refuses. KD-85's sentence is corrected in its closure |
| **KD-195** | the new `unanchored-hooks` finding reports every anchorable hook surface the detector faults, so KD-183's over-report can now be printed about a Stop, PreToolUse or SessionStart hook an app anchored by `cd` | the conservative direction, chosen on purpose: a `warn` that names the command and prints the anchored form, where the other direction is silence about a Stop gate that does not run; claiming health is impossible here by construction |
| **KD-198** | the two new walk fields (`unconfirmed`, `healable`) keep KD-182's fail-open `?? []`, so an `ok` still requires the absence of three fields rather than the presence of evidence | no second producer exists — `gatherWalkInputs` sets all four on every return path and is the only caller — and the fix is the one KD-182 defers, now over four fields |
| **KD-199** | two superseded commands in the shipped-hooks table are narration, and `healedForm` refuses to heal them because their successors describe a newer lane than the app may have | a decision, not an oversight: only a pair differing by the anchor alone is healed, which is identical at the project root whatever the lane version. Healing narration is two table fields plus lane-version detection |
| **KD-200** | text a test prints shares the runner's message channel, and node's parser reads it as a frame length: a third byte ≥ `0x80` (`›` `✓` `→` `—`) makes the size negative and aborts the FILE with *"Unable to deserialize cloned data"*, attributed to whichever file's stream was being parsed | the `scaffold.test.mjs` instance is fixed and the helper is guarded, but the class is not closed: a static over-approximation says 70 of 274 declared test files can reach such a write, and closing it needs either a `package.json` preload (the suite gate's own definition) or a per-file measurement |
| **KD-201** | four test files silence a CLI call by replacing `process.stdout.write`, which is the channel the reporter writes its FRAMES to — a frame flushed inside that window is swallowed, the file exits 0, and the run reports fewer tests than it ran | measured: 4 tests run, 3 reported, nothing red. Not fixed because those four files were not that slice's subject and the wave allowed running only the files it named |
| **KD-205** | `contains()` / `behindBy()` drop `gitAt`'s `why`, so one call site of the ordering check cannot say which of four causes killed a git call — a gate-timer kill, a crash and an OOM kill all read as "git could not compare this branch with origin/main" | the verdict is correct either way: the check still allows and still says it could not answer. It costs a reader one fact, in the file whose whole subject is that distinction |
| **KD-206** | the fleet scratch app is stamped `--no-ios`, so an edit to iOS-only template code moves no byte of the stamped app and the device tier reads DISCHARGED; Firebase lives in `overlays/firebase/`, which no stamp copies, so an overlay edit moves the default digest by nothing and the Firebase L2 run's digest by what it changes | no proof is lost — the L2 run never compiled either (KD-45) — so KD-45's gap is visible in the schedule instead of masked by a run that proves nothing about those files; an overlay edit owes the Firebase L2 run (KD-45); CI still compiles it on every PR; `template/` is still a review trigger |
| **KD-208** | the hook's four bounds now sum to exactly its declared budget — `1000 + 3000 + 2500 + 3500 = 10000`, the 10 s `.claude/settings.json` declares — because answering a payload now includes a stamp | the arithmetic test asserts `sum <= budget` and passes, every bound has its own kill-timer so the sum is a worst case that needs all four to saturate, and the measured real answer is ~0.5 s; what is gone is the slack; the add step shares the stamp's cap (stamp + add + two hashes 0.25–0.34 s measured), so no bound was added |
| **KD-209** | `grep -r` here obeys the scanned tree's own `.gitignore`, so a scan of a stamped app silently omits `local.properties` — the file that carries this machine's SDK path | a fact about the tooling, not the tree, logged because it nearly cost a slice a defect: `find … -exec /usr/bin/grep -l …` lists both files, and that is how the three normalisers were shown complete |
| **KD-210** | a Firebase run proves the template COMPILES, INITIALISES and REDIRECTS — no byte crosses the redirect | nothing in `commonMain` uses a Firebase client and the smoke walk is four screens, so the suite serves zero requests; the risk is a record read as "the redirect carried traffic"; the record states it (`coverage.trafficThroughRedirect: false`) |
| **KD-211** | the stamped app redirects to `10.0.2.2`, the Android emulator's host alias, so the run assumes the lane's device is an emulator | loud, never silent: a physical device fails the startup redirect and the lane goes red at `e2eSmoke`, because the template refuses to start rather than fall through to production; `fleet-check --with-firebase` refuses a non-emulator host or an unset `CMP_AVD` before starting |
| **KD-212** | the shipped-hooks table is derived from the template FILE's history, but minimal mode writes a SessionStart command that file never carried | no claim rests on it — a minimal stamp's command is fully single-quoted, so it is neither healable nor a violation, and doctor says nothing about it in either direction |
| **KD-213** | the `--dry-run` gate counts four `fs` spellings where its own header names the class — `copyFileSync`, `renameSync`, `cpSync`, `fs.promises.*` and a destructured import all pass it | zero producers in the tree, and it cannot be written as a failing test: a widened gate is green on these bytes |
| **KD-218** | both doors accept `--no-<value-flag>` as a boolean name: `prooflane init --no-profile svc` stores `no-profile: true` and installs into `./svc` (the `=` form's refusal no longer calls it a true/false flag, 2026-09-25) | the project is a token the user typed, and nothing else is written; what the parsers accept is KD-7's territory and a decision, not a wording fix |
| **KD-219** | `attach.mjs`'s new comment says the empty `--citation-roots` value "never arrives any more", and this tree's own suite passes it in | the guard it weakens the reason for is still there and still correct; only the reason is false |
| **KD-220** | a `npm publish` payload stamps the app TWICE — `obligation()` stamps when the device tier is required and `releaseContext()` stamps again — where `ANSWER_RESERVE_MS` is documented as covering one | measured 1.92 s against a 10 s budget (merge, one stamp: 1.09 s), and 1.1–1.8 s per stamp under 16 burners; the overrun direction is fail-open but has no producer today |
| **KD-221** | the `local.properties` normaliser replaces the WHOLE file, so any byte of it beyond this machine's `sdk.dir` pointer is unwatched by the device digest | measured — appending `org.gradle.java.home=/nope` moves no digest — but `writeLocalProperties` writes only `sdk.dir` and `template/` ships no `local.properties`, so there is no producer; the narrower spelling costs one regex |
| **KD-222** | `hashStampedTree` records files and symlinks, so an EMPTY DIRECTORY is invisible to the device digest | measured; git cannot ship an empty directory in `template/`, so a stamp cannot produce one as a difference today |
| **KD-223** | "the gate hashes THIS tree exactly as the release proof records it" now compares `stampedOutput` with itself, and its comment calls that "an INDEPENDENT stamp" | the device tree hash's three spellings (fixed by `a6c303c`, never given a number) really are gone, so there is nothing left for that test to catch; what is wrong is the sentence, and the pair that IS unguarded is a test nobody has written |
| **KD-224** | the console's freshness test turned "a completed render cycle IS fresh on return" into "is fresh within 5 s", and widened its boot wait from `idle` to `idle \|\| unrefreshed` | `waitFor` throws on timeout so the assertion still refuses; it is a gate relaxed on the way past, in a change whose stated subject was elsewhere |
| **KD-225** | two projects' lanes shared one emulator mid-run: create-cmp's fleet check (started 21:12 after the gate saw the other lane exit) lost its e2eSmoke at 21:14 — Maestro logged "Created execution plan" and nothing after, no per-flow report — while payment-blueprint's lane started a new Maestro run on the same `emulator-5554` at 21:14:29; the gate checks for a foreign lane only at START, and the per-serial device lease did not hold across the two projects | the run was FAIL, not a false PASS — fail-closed; the re-run in a quiet window is the remedy the gate itself names |
| **KD-226** | the fleet-check reader ends a shell word at a quote and the `cd` reader refuses one, so `node /A/scripts/fleet-check.mjs"x"` resolves tree `/A` while the shell runs `/A/scripts/fleet-check.mjsx` | the word the shell builds is not a file in any tree, so the classified run cannot execute whatever the gate decided; `scripts/` is not published |
| **KD-227** | `docs/GATE-RULES.md` says the KD-95 slice added "Four more" oracle shapes; the table went from 24 rows to 31 | a count in a contributor-facing doc, in the same paragraph KD-104's note already asks to be re-read; the invariant the sentence describes is the one the harness holds |
| **KD-228** | `formatSpine()` marks lagging fields with `spine.lagging.includes(s)` — object identity — so a spine that has been through `--json` prints no `✗` at all | nothing calls it on a parsed spine today, and the summary line still reads `NOT IN STEP`, so the surface cannot claim health it does not have |
| **KD-230** | rule 2 hides the CONTENT of `AGENTS.md`, `CLAUDE.md` and `.claude/**/*.md` from the digest because of a one-time grep (the not-read proof in `UNOBSERVED_BY_PROFILE`'s comment), and no test repeats that grep. A later lane step that opens one of them would make edits to it invisible to the digest after the one run its own code change buys | cannot fire today: re-measured this round, no non-comment reference to any of the three in `template/qa/**/*.mjs`, `*.json`, `*.kts` or `*.sh` |
| **KD-232** | "this repository enables its own plugin" is stated in the hook, its test, the proposal and the CHANGELOG, and no file in this tree enables it — the maintainer's user and local settings do, so a fresh clone runs no `resume-price` | contributors, not adopters, and the hook is advisory; the proposal also still says "plugin `hooks/`" and "Not built." |
| **KD-233** | `FRESH_HELPER_TOKENS` (37,019) is called "a floor", and measured first turns here are 8–18k for `deep-worker` and `staff-reviewer` and 18–62k for `general-purpose` | not a floor in either direction. The figure is inside the range for `general-purpose`, the type an adopter restarts, and the advice points the same way |
| **KD-234** | a `SendMessage` to a helper that is still RUNNING would be priced as "this resume", because nothing in the payload or the transcript tells a running helper from a stopped one | unobserved: every send result on record reads "Resuming agent …". Whether a running helper can be sent to at all is a tool-schema fact that cannot be kept in this tree (KD-128) |
| **KD-244** | `upgrade`'s merge base for a `--no-firebase` app stamped by 0.27 or earlier that later ran `add firebase` is the old template stamped with Firebase ON (`legacyFirebaseKeys`), a tree that app never was | measured 2026-09-25: not harmless, but loud: one spurious conflict sidecar (`composeApp/build.gradle.kts`) and exit 1, nothing removed or duplicated; a second sidecar (`libs.versions.toml`) seen in the test comes from its synthesised 0.27 catalog and does not occur with the real 0.27.2 one |
| **KD-247** | `add firebase` writes the Podfile's Firebase pods and a comment naming the GitLive version the registry paired them with (KD-243), and `upgrade` moves `firebase-gitlive` in the catalog and never the Podfile | cannot fire yet: every shipped set pairs Firebase iOS 11.x, which `~> 11.1` still resolves; the comment goes stale on the first GitLive bump, and the pins break at the first set that pairs across a Firebase iOS major |
| **KD-249** | `planShippedHookHeal` throws a `TypeError` on a settings file whose duplicated `hooks` key hides an old shipped Stop form, instead of returning a skip | guarded: its one caller, `shippedHookHealVerdict`, catches the throw and heals nothing, so doctor neither crashes nor offers a fix there; a new caller of the planner would inherit it |
| **KD-253** | the KD-231 gate still exempts a paragraph on any token that contains `create-cmp`: KD-250 stripped `create-cmp:<name>` only, and `bin/create-cmp.mjs`, `create-cmp-cli@latest`, `create-cmp.json`, `create-cmp-scaffolded` and a `/path/to/create-cmp/…` path each exempt a paragraph that never says whose file it names — 19 paragraphs across `skills/cmp-new`, `cmp-doctor`, `cmp-upgrade`, `cmp-inspect`, `cmp-firebase-connect` | none of the 19 names a create-cmp-only pattern today (measured); the same hazard as KD-250, one spelling over |
| **KD-255** | `DEVICE_TIER_IRRELEVANT`'s `*.md` would declare a markdown file under `overlays/` unable to oblige either L2 run, and `DEVICE_TIER_SHIPPED` puts back `template/` only — so an overlay `.md` that `add firebase` copies into the app would never make the Firebase L2 run required (the KD-207 shape, one root over) | no `.md` exists under `overlays/` today (measured), so nothing ships unscheduled; the repair is `overlays/` in `DEVICE_TIER_SHIPPED`, and the digest then judges it |
| **KD-256** | `--rekey` re-derives `qa-artifacts/fleet-latest.json` only, so after the next `STAMPED_OUTPUT_RULE` bump the Firebase L2 run's record reads `other-rule` and costs a full Firebase L2 run — and its reason, `recordMeetsTier`'s, still says to run `--rekey` INSTEAD, which cannot help it | cannot fire until the rule is bumped (it is 2 today, and the Firebase record is new under 2); the cost when it fires is one ~4.5 min run, never a false DISCHARGED |

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

Since 2026-09-24 the runtime tier PRINTS as `L2 run` (proof-plan, its hook, change-price); its internal key is still `device` — `TIERS.device`, a plan's `declared.device`, change-price's `what: "device"` — because renaming data orphans every plan and record already on disk.

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

### KD-44 — the matcher still reports coverage the runner does not give, using the declared pattern

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
### KD-45 — the device tier has never run the template's Firebase or iOS code

`scripts/fleet-check.mjs` (the scratch app's flags)

The scratch app every device run stamps is `--no-ios --no-firebase` (`scripts/fleet-check.mjs`, and
the banner says so out loud). So no gate in this repository executes either path: not the device
tier, not `framework-check`, not the suite. The evidence ladder's L2 rung — "the artifact ran AS THE
PROGRAM" — is earned every time by a program with Firebase and iOS compiled out.

**Measured cost, today.** Both emulator-redirect defects fixed in this slice were invisible to every
gate here and were found by an adopter session reading the code. One of them — the iOS path having
no build gate at all, so release builds redirect to 127.0.0.1 — had shipped in the template
unnoticed. A scan of the SHAPE now holds them (`test/the-emulator-redirect-cannot-fail-quietly.test.mjs`,
three of five assertions red against the code as it shipped), and a shape scan is not a run.

**Why the flags are there is sound**, which is why this is a gap and not a mistake: Firebase needs a
project and running emulators, and iOS needs Xcode, a simulator and roughly six minutes of
Kotlin/Native compile — this slice measured 367s for one iOS scaffold build. Paying that on every
device run would push the tier from ~3.5min to something nobody runs at slice close, and Rule 1's
answer to a cost like that is a nightly stage, not a per-slice gate.

**What would close it:** a second, slower fleet profile that stamps `--firebase --ios` and runs at
nightly cadence rather than per slice. `fleet-check` already takes a `--profile` (smoke | scaffold |
local | ci | nightly | release), so the seam exists and nothing here needs inventing.

**Fires when:** any defect in the template's Firebase or iOS code. It cannot be caught by this
repo's own evidence, only by an adopter. *Logged 2026-09-15, found while fixing the emulator
redirect.*

**2026-09-22 — the remedy above was rejected by the owner, and the replacement is output-keyed.**
There is to be no nightly cadence for a static template: a second profile run on a clock proves the
same bytes over and over and says nothing about the ones that moved. Firebase instead leaves
stamp-time for an add step (`create-cmp add firebase`, the next slice), after which the Firebase
proof is owed when the stamped-plus-added app's bytes move — the same output-keyed rule the device
tier now uses (KD-206 and the `[Unreleased]` entry for it). The emulator-suite run machinery is
already built and pushed on branch `wave/firebase`, held out of this wave and to be repointed at the
add step rather than at a schedule. The iOS half of this entry stays parked and is still open as
written. The decision is recorded in `docs/proposals/LIBRARIES-IN-SERVICES-OUT.md`.

**2026-09-25 — the Firebase half, amended to what is now true.** Firebase left stamp-time: the
default stamp carries none, and `create-cmp add firebase` adds it from `overlays/firebase/`. CI's
`stamp-android` job stamps the default, builds it, runs the add step on the SAME app and builds it
again (`.github/workflows/ci.yml`), so the add step's output COMPILES on every PR — the GitLive
modules, the google-services plugin over the mock config, the appended BuildConfig block and
`FirebaseEmulators.kt`. Nothing RUNS it: no gate initialises Firebase or executes the four
`useEmulator` calls, so the redirect is still held by the source scan alone
(`test/the-emulator-redirect-cannot-fail-quietly.test.mjs`, now aimed at the overlay). The
`wave/firebase` emulator-suite machinery was NOT repointed in this slice (it is path-keyed and 113
commits behind, and KD-208 says the hook's budget is spent); that runtime proof is its own slice.
The iOS half is unchanged: the add step applies it when `iosApp/` exists, says it is unproven, and
nothing compiles it except the parked `stamp-ios` job.

**2026-09-25 — the iOS half, amended: the iOS stamp has compiled on CI, once.** Run
[36181162894](https://github.com/kvdm-co-pilot/create-cmp/actions/runs/36181162894) (`workflow_dispatch`
on `dev-done` at `e6260cc`, the 0.28.0 tree) stamped the default with iOS on, ran `add firebase` on
the same app, linked the KMP framework and built the Xcode project for the iOS simulator: job
"stamp + iOS xcodebuild", success, 19:42–20:16Z. So the front door's "Android + iOS" is a claim an
iOS compile has backed. What it is not: a gate (the job runs only on dispatch), a proof of this
tree (its pods were the `~> 11.0` pin that KD-243 replaced in 0.28.1), or a run. Nothing executes
the iOS app, so its runtime and the iOS side of the Firebase emulator redirect stay unproven.

**2026-09-26 — the Firebase half: an L2 run executes it, owed when its bytes move.**
`node scripts/fleet-check.mjs --with-firebase` stamps the scratch app, runs `create-cmp add firebase
--no-verify` on it with the argv the schedule hashes (`addFirebaseArgv`), and runs the app's own lane
inside `firebase emulators:exec`. It uses the app's own `demo-` project, so there is no real project
and no login. It serves the ports the stamped tree declares and tears the suite down on every exit
path. Its record is PASS only with `e2eSmoke` PASS by name, and the tier takes it only at rung L2.
That step installs the DEBUG build, whose `USE_FIREBASE_EMULATORS` is true, so the app started only
if `FirebaseApp` initialised from the mock config and `configureFirebaseEmulators()` returned from its
four `useEmulator` calls; that function throws otherwise, and the app refuses to start. `proof-plan`
owes it as the "Firebase L2 run" exactly when the stamp-plus-add digest moves. The run writes
`qa-artifacts/fleet-firebase-latest.json`, never `fleet-latest.json`, and keeps its runs in a history
kind of their own (`fleet-firebase`), which `proof-plan --history` counts apart from the default
device runs. Proven, once a run is recorded: compile (debug and release/R8), init, and the four
redirects at startup, on an Android emulator. Not proven: traffic (KD-210), a physical device
(KD-211), iOS (above). First recorded run: **none yet** — it runs on trunk once this slice merges,
and a docs-only follow-up fills this line. This Firebase half closes only on a PASS record; until
then it stays open.

### KD-46 — the iOS refusal names two causes its catch cannot see

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

### KD-48 — `Platform.isDebugBinary` is a build-type reading, not the Android flag's twin

`template/composeApp/src/iosMain/kotlin/com/example/app/KoinHelper.kt`

The comment calls it "the Kotlin/Native equivalent of the Android flag". It is not equivalent in two
ways. It is not an opt-out — an adopter can set `USE_FIREBASE_EMULATORS=false` and debug against a
real staging project on Android, and has no iOS lever at all. And it reports the Kotlin/Native build
type, which the Kotlin Gradle plugin derives from Xcode's `$CONFIGURATION` **by name**: a
configuration called `Staging` or `QA` is not `Debug`, so it builds a release framework and the
emulators go quietly off in the build that wanted them. Cannot fire as shipped — `iosApp/project.yml`
declares no configuration beyond XcodeGen's `Debug`/`Release`. *Logged 2026-09-15, review of `b549f3b`.*

### KD-49 — a nested `node --test` cannot fail

Node's test runner sets `NODE_TEST_CONTEXT` in every file it spawns. A `node --test` started from
inside one inherits it, reports through the parent protocol, and **exits 0 whatever its tests did**.
Measured on Node 24 against one deliberately failing file: exit 1 from a clean env, exit 0 with
`NODE_TEST_CONTEXT=child-v8` set. The first draft of
`test/the-emulator-scan-blesses-a-swallowed-failure.test.mjs` read that 0 and pronounced six planted
defects refused. Nothing else in the suite spawns a nested runner today, and that harness now scrubs
the env and reads TAP counts instead of the exit code — but the trap is invisible, the symptom is a
gate that is always green, and the next person to reach for `execFileSync(node, ["--test", …])`
inside a test will hit it. *Logged 2026-09-15, review of `b549f3b`.*

### KD-51 — the emulator scan masks Kotlin with a masker written for `.mjs`

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


### KD-52 — the floor of the emulator scan: what its two token assertions do not decide

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

### KD-58 — the words of an act, quoted, are refused as the act

`scripts/hooks/proof-gate.mjs` classifies a Bash command by what it invokes, and its header already
says a quote is not an invocation. On 2026-09-17 it refused a read-only `git grep -E "…|npm publish"` with
the publish gate's own message, because the words sat inside a double-quoted `-E` alternation. Then
it refused the command that LOGGED this entry — a heredoc writing a script whose text contained the
same two words — as a publish from a non-main branch. Worded around, both ran.

Not blocking: it can only REFUSE, never allow, and only an agent's tool call passes through the hook.
But a refusal that fires on a search makes the gate's real refusals easier to dismiss, and it fired
while the gate was refusing every release for a different reason (the hash defect fixed beside this
entry). *Logged 2026-09-17.*

### KD-63 — the lane refusal reads the lane's marker with none of the guards its other readers apply

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

### KD-64 — a sibling worktree of this repository is called ANOTHER project's lane

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

### KD-65 — the lane's project can still be a token the gate never verified

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

### KD-66 — the lane probe's bound covers its subprocesses, not its filesystem

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

### KD-68 — criterion B will keep accepting a vendored receipt the repo's own hosted policy calls stale

`scripts/stage2-gate.mjs` (criterion B) · `packages/harness/src/lib/receipt-validate.mjs:183-247`

B runs `checkLaneVouching` and says it omits only "the half that needs the adopter's tree" (the
inputs hash). `checkFreshness` needs no tree, is documented in `receipt-validate.mjs` as one of the
"service-grade checks (hosted validators)" — i.e. what a notary runs — and `DEFAULT_POLICY.maxAgeMs`
is 30 days. `docs/attestations/fuelled-api-receipt.json` carries `generatedAt`
`2026-09-17T22:12:03.948Z`; measured today it is `{ok: true, ageMs: 739912}`, and on 2026-10-17 it
becomes `ok: false` with B still printing PASS. The signature the artifact is waiting for has no
deadline, so the two will diverge if it takes a month.

Also, a vendored receipt is a copy: B reads the copy and nothing re-checks it against the lane that
minted it. That half IS now guarded — `test/the-attested-profiles-agent-co-author-is-not-named-to-its-signer.test.mjs`
compares the bytes whenever `artifact.location` is reachable — so what remains here is only the
freshness gap.

Not blocking: B is currently sequenced behind an unsigned criterion A and reports "not reached", so
nothing reads a verdict from it at all, and a stale-but-genuine receipt over-states nothing about
what the lane did.

**Fires when:** criterion A is signed more than `maxAgeMs` after the receipt was minted.
*Logged 2026-09-18, raised in review round 1 of `everything-but-the-signature-for-the-first-adoption`.*

### KD-69 — three fields of the attestation's documented shape are read by nothing

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

### KD-70 — a `file:line` citation is a claim nothing in this repository checks

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

### KD-71 — `date 0050-06-15 names no calendar day`, and it does

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

### KD-73 — a bare "<n> steps" claim is not gated, and cannot be without deleting honest prose

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

### KD-74 — `nightly` is a profile the lane offers and the deriver does not enumerate

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

### KD-75 — the profile-bound lane reader cannot tell a whole lane from a slice of it

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

### KD-76 — the same reader passes a wrong lane size written as a word, or profile-first

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

### KD-77 — one of the four derived counts is gated and calibrated by nothing

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

### KD-80 — the ordering precondition guards the device RUN, not the merge that moves the tree

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

### KD-81 — a branch git could not name is treated as trunk, and the check passes silently

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

### KD-82 — the ordering verdict is ancestry; every other obligation in this repo is trigger-path bytes

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

### KD-83 — the "unchanged wording" claim is checked against the code that would change it

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

### KD-84 — `declaredBudgetMs` has two implementations, and the declared timeout has three spellings

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

### KD-72 — the one file whose CONTENT is the evidence is outside the review trigger

`scripts/observed-tree.mjs` → `REVIEW_TIER_TRIGGERS`, against
`docs/attestations/stage2-external-profile.json`

Measured on this tree, while signing that attestation:

```
before the signature   review DISCHARGED — a review of this exact tree is recorded …
edit docs/attestations/stage2-external-profile.json  (empty fields → a full signature)
after the signature    review DISCHARGED — … and no trigger path has moved since
```

`REVIEW_TIER_TRIGGERS` is an allow-list of code paths — `src/`, `bin/`, `scripts/`, `test/`,
`packages/`, `template/`, `inspector/`, `skills/`, `agents/`, `.github/`, and a handful of named
root files. `docs/` is not on it, and `grep -c docs` over the list returns **0**. So a change
confined to `docs/` never enters the hash a review is recorded against: it neither owes a review
nor reopens one. (`REVIEW_SKIP` is a second, separate filter and skips only `.md`; it is not what
does this — the attestation is `.json`.)

That exemption is correct for what `docs/` almost entirely is. Prose restates decisions taken
elsewhere, and gating a reviewer on a typo in a paragraph would make the review obligation fire
constantly and mean nothing. **One file in that directory is not prose.**
`docs/attestations/stage2-external-profile.json` is the artifact criterion A reads, and its
CONTENT is the evidence — a name, a date, an organisation, and the disclosure paragraph a reader
is meant to judge the claim by. Rewriting it changes what this repository asserts to an outside
party. Today that file can go from unsigned to signed, or from one signatory to another, or have
its `authoredBy.relationship` disclosure quietly shortened, and `proof-plan.mjs` will keep
printing `no trigger path has moved since`.

The sentence the gate prints is not false — nothing moved, by its own definition of a trigger
path. It is narrower than a reader will assume, which is the more interesting failure and the
harder one to notice.

**Nobody is wrongly served, which is why this is logged rather than fixed.** The file is correct
as it stands, it was read closely by the review rounds that ran over this slice, and no adopter
is sent into a refusal or told something false today. The harm this describes needs a *future*
edit to a signed artifact, so it sits on the second row of the line above: a real defect nobody is
wrongly served by. Placing it on the first row would mean claiming someone is mis-served now, and
nobody is.

**What the fix would be, when it is taken:** add `docs/attestations/` — not `docs/` — to
`REVIEW_TIER_TRIGGERS`, so the evidence-bearing directory triggers a review while prose stays
exempt. That is a one-line change to a trigger path, which reopens the review obligation by
construction, so it belongs to a slice that can pay for a round rather than to the slice that
happened to notice it. Found while signing, under an explicit instruction not to reopen the
review to record it.

### KD-86 — the anchoring detector reads four script extensions, and a hook could invoke something else

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

### KD-87 — "inside single quotes" is not "not executed", and an inert anchor still counts as anchoring

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

### KD-88 — the detector enumerates command surfaces by hand, and `settings.json` has more than two

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

### KD-90 — the statusLine third of the anchoring fix is not fixed, and was described as fixed

`template/.claude/settings.json` (`statusLine`) · `src/lib/hooks.mjs` (`ANCHORABLE_SURFACES`)

The hook-anchoring slice found three cwd-relative commands, anchored all three with
`${CLAUDE_PROJECT_DIR:-.}`, and said so. **The anchor only reaches two of them.**
`CLAUDE_PROJECT_DIR` is documented as exported to HOOK commands; the hooks reference additionally
names stdio MCP servers and plugin LSP servers as the other places Claude Code sets it, and
`statusLine` does not appear on that list — the list whose whole purpose is to enumerate the
non-hook consumers. The statusline reference names only `COLUMNS` and `LINES` as variables Claude
Code sets. On a statusLine command the anchor therefore expands to nothing and `:-.` silently
restores exactly the behaviour it was added to repair.

**The remedy taken was to stop claiming it, not to paper it.** The statusLine keeps its relative
form. An anchor that cannot work is worse than no anchor, for the same reason KD-87's second shape
is: it READS as protection, and the next person to look would have counted the surface as covered.
`ANCHORABLE_SURFACES` now records where the mechanism applies, and a behavioural test asserts the
statusLine *still* fails silently one directory down — a test that fails the day someone fixes it,
which is how this entry gets closed.

**Nobody is wrongly served, which is why this is logged rather than blocking.** The surface is
exactly as it was before the slice; nothing regressed, and the two surfaces that could be fixed
were. What would have wrongly served a reader is the sentence claiming three.

**What the fix would be, when it is taken:** a statusLine receives the project root on STDIN as
`workspace.project_dir`. That is a different MECHANISM, not a different spelling — the command has
to consume its own stdin, extract the root, and replay the payload into `qa/walk-status.mjs`, which
still expects the JSON. Two candidates were costed and neither is a one-line edit to this slice: a
`jq` pipeline adds a binary dependency to a shipped template, and `git rev-parse --show-toplevel`
is actively WRONG for the monorepo case this whole slice exists to serve (it returns the repository
root, not the app directory, which for payment-blueprint's `services/` layout is the wrong
directory). Note also that `project_dir` is launch-anchored — "where Claude Code was launched" —
so it is not a synonym for the project root either.

**RE-PLACED 2026-09-19. The recorded reason was age wearing a different word.** *"Nobody is wrongly
served … the surface is exactly as it was before the slice; nothing regressed"* answers who
introduced it, and the header abolished that criterion: an adopter whose session starts anywhere but
the project root gets no status line, whenever the bug arrived. What actually keeps it in row 2 is
new as of this slice and was not true when the entry was written: **they are told.** `create-cmp
doctor` reported `ok` — "The walk is wired" — over exactly this surface until today, which is the
row-1 shape (told something false, by the diagnostic, about the thing the diagnostic is for) and is
fixed in the same commit as this re-placement.

**Two corrections to this entry, neither of which changes its verdict.**

1. *"The command has to … replay the payload into `qa/walk-status.mjs`, which still expects the
   JSON"* — it does not. `readHookStdin` is called only under `--inject`; the `--statusline` path
   never reads stdin at all (`packages/harness/src/walk-status.mjs`). A fix must extract the root
   and may drop the payload entirely.
2. The mechanism half is now settled rather than costed: a statusLine command **does** receive JSON
   on stdin carrying `workspace.project_dir`, so this surface is fixable — see KD-181, which also
   records what that answer cost and why this slice still does not take it.

### KD-91 — the differential's vacuity floor names a command that can no longer reach it

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

### KD-92 — the actionable anchoring gate has no negative control; emptied, it would be invisible

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

### KD-93 — the anchor's surface-awareness landed in one reader; the harnesses still assume the other

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

### KD-94 — "logging is free" is one gate too broad: an entry here stales the suite record

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
### KD-96 — the schedule a session reads is still the tree the hook was loaded from

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

### KD-97 — the judged worktree's own scheduler decides, whatever commit or state it is in

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

### KD-98 — an npm flag whose value this gate does not know is read as a folder, and the refusal says so

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

### KD-99 — a directory git answered 128 ABOUT is read as another repository, and gated in silence

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

### KD-100 — the tree probe's purse bounds its git calls, not the filesystem calls in front of them

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

### KD-101 — `npm publish .` is refused for publishing something other than the directory it runs in

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

### KD-102 — the judged tree is checked for one of the two files the gate imports out of it

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

### KD-103 — the list operator that decides whether a `cd` runs is not read

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

### KD-104 — a gated command inside `sh -c '…'` is refused, where it used to be judged

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

### KD-106 — `{}` as an argument is read as a brace group, because its own `{` is the separator its `}` needs

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

### KD-108 — the refusal's evidence is read from the masked scope, so a quoted destination is not in it

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

### KD-109 — the third of KD-89's three failures has a channel and no reproduction

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

### KD-110 — the preflight guards `npm test`, and this repo is often run one file at a time

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

### KD-111 — the walk is npm's layout, so a working Yarn PnP checkout is refused

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

### KD-112 — the door has no bypass, and every way it can be wrong ends in a repo that cannot run its suite

`scripts/suite-preflight.mjs` · **a product decision, not a defect**

Raised by review, and it is a decision rather than a finding because no test can take it. Every
known way this door can be wrong terminates in the same place: *a correctly installed tree that can
never run `npm test` at all*. KD-111 (Yarn PnP) is one. The workspace-declaration divergence found
in review was another, and it was real — `["ws/*", "!ws/b"]` made the door refuse over dependencies
`npm ci` would never install, so the one command the refusal named could not clear it. That one is
fixed, by declining any pattern shape this reader does not implement rather than guessing at it.

The class is not closed by fixing an instance. A named escape hatch printed in the refusal itself —
`PROOFLANE_SKIP_PREFLIGHT=1` — would bound it at one line, and it costs little that this door
protects: skipping it returns you to exactly the pre-slice behaviour, which is a suite that runs and
misattributes, not a gate that passes something unproven. That is the argument FOR. The argument
against is this repo's standing one: an escape hatch is how a guard becomes optional, and the same
variable would sit in a CI file within a year.

**Why it is not taken here.** It is a call about how much a wrong door is allowed to cost, which is
a product decision and not the author's — and the population it would serve is currently empty (no
producer for KD-111, and the divergence is fixed). **Whoever takes it decides one thing:** whether
the refusal carries a bypass at all. If yes, it belongs in the refusal TEXT, because a hatch nobody
can find is the same as none.

*Logged 2026-09-18, review round 1 of the slice that closed KD-89, handed up rather than decided.*

### KD-113 — a nameless workspace is named by the two readers differently, and the invariant test compares names

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
### KD-114 — what the closed wrapper list does not read through, named rather than guessed at

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

### KD-115 — the clause that makes the declaration safe is in one of its three alternatives

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

### KD-116 — two clauses of the command-position declaration are right about the shell and pinned by nothing

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

### KD-118 — a value-taking letter MISSING from the wrapper table is the direction nothing sweeps

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

### KD-120 — the tool check's oracle is the grant line it is checking, so an invented name clears it

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

### KD-121 — six spellings of "use this tool" the check does not see, and a false reason for one of them

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

### KD-122 — the check reads one spelling of `tools:`, where the harness reads YAML

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

### KD-123 — three prose facts in this change the tree does not support

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
### KD-124 — one attribution rule, spelled twice, in two files with no shared code

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

### KD-125 — a detached HEAD is `""` to the reader and `null` to every writer, so every run reads as none

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

### KD-126 — the retired citation survives in the test file that found it

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

### KD-127 — a refuter that self-disables once its refutation is answered

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

### KD-128 — five tool-schema facts this repository states and cannot re-read

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

### KD-129 — the round block is acting text about the review rule, and the drift scan cannot read it

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

### KD-130 — a discharged review's plan event does not say which round discharged it

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

### KD-150 — a boolean's space form still takes the directory when the word is not `true` or `false`

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

### KD-151 — a contradiction is resolved by precedence and refused by nothing

`src/lib/args.mjs`, `packages/harness/install/args.mjs` (`flagBool`)

`--ios false --no-ios false` says both things at once, and so does `--ios --no-ios`. `flagBool`
answers from the affirmative name and never consults the `no-` twin, which is what it has always
done and is now pinned by test rather than left to the next reader of the body. There is no right
answer to a contradiction; there is only the choice between an arbitrary one and a refusal, and a
refusal here would have to be written and tested for a line nobody has typed.

**Fires when:** both spellings of one flag appear on one command line.
*Logged 2026-09-19, by the slice that closed KD-16.*

### KD-152 — two declared booleans are read by presence, and so ignore their own value form

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

### KD-132 — a review-round measurement stated three times, and re-readable in none of them

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

### KD-133 — the round block says CAP SPENT and hands back nothing, at the moment a re-record is owed

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
### KD-182 — the new check's own comment dates the shipped status line to a version that predates it

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

### KD-183 — a hook that resolves by `cd` is reported as one that does not resolve

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

### KD-180 — doctor's status-line verdict over-reports an absolute path, and its `ok` cannot be reached from a project

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

### KD-181 — this tree stated the statusLine's stdin both ways, and the false one governed the live path

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

### KD-161 — the round block asks whether the delta is empty, where the rule asks whether there were FIXES

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

### KD-162 — the class-of-one sweep assumes its conclusion for two directories

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

### KD-163 — the test guarding "a question does not scaffold" scaffolds into the repository when it fails

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

### KD-164 — two copies of one parser, justified by a packaging fact `npm pack` refutes

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

### KD-166 — two spellings of "when is this product's output styled", and the test suite pays for the disagreement one file at a time

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

### KD-184 — `--=x` is refused as `--`, the one token both doors accept

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

### KD-185 — the bundle's freshness hash reads this tree; the bundler reads whichever tree node_modules points at

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

### KD-186 — the publish skill calls a published package private

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

### KD-187 — in this repo the create-* aliases run the registry's CLI, not this tree's

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

### KD-189 — a `cd` the shell performs, behind a word the reader does not count as a command position

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

### KD-190 — two spellings of a fleet-check run the classifier still cannot see

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

### KD-191 — the allocator cannot see a branch that has no pull request

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

### KD-192 — an unquoted brace expansion is a path this reader reads and the shell rewrites

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

### KD-193 — the oracle's failure message describes the gate's answer as the shell's

`test/the-gate-resolves-a-directory-a-shell-would-not.test.mjs` (the `wrong.push` template)

The row prints `the shell runs it in: ${got.dir === HERE ? "the payload's cwd" : truth}` — the
condition is about what the GATE resolved, and the sentence is about what the SHELL did. For
`cd /here"/sub" && gh pr merge` the gate resolved `/here` and the shell ran in `/here/sub`, and the
failure said the shell ran it in the payload's cwd. Only a diagnostic, and only on a failing row, but
it is the moment a reader is trusting the oracle to tell them which of the two was wrong.

**Fires when:** a row of that oracle fails.
*Logged 2026-09-22, while adding rows to that table.*

### KD-194 — `create-cmp upgrade --harness` writes `.claude/settings.json` too, by merge rather than by table

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

### KD-195 — KD-183's over-report now reaches every hook surface, not only the walk's

`src/commands/doctor.mjs` (`gatherHookInputs`) · `src/lib/hooks.mjs` (`unanchoredPaths`) · KD-183

KD-183 records that a hook which resolves by `cd "${CLAUDE_PROJECT_DIR:-.}" && node qa/x.mjs` is
reported as one that does not resolve, and bounds the population to the walk surfaces doctor read.
The new `unanchored-hooks` finding reports **every** anchorable hook surface the detector faults, so
the same over-report can now be printed about a Stop, PreToolUse or SessionStart hook an app wrote
that way, or about an absolute path (KD-180's first row, same cause: `SCRIPT_PATH` cannot tell
absolute from relative).

**Nobody is wrongly served, and the direction is the one this repository chooses on purpose:** the
finding is a `warn` that names the command and prints the anchored form; the cost is a re-read of a
command that works, where the other direction is silence about a Stop gate that does not run. The
counter-direction — claiming health — is impossible here by construction: `unanchored-hooks` never
credits anything.

**Fires when:** an app hand-anchors any hook by `cd`, or writes an absolute path into one, and runs
`create-cmp doctor`.
*Logged 2026-09-22 by the slice that widened the population, against its own change.*

### KD-198 — the new walk fields keep KD-182's fail-open `?? []`

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

### KD-199 — two superseded hook forms are recorded and deliberately never healed

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

### KD-200 — ordinary text on a test's stdout aborts the file, and the third byte decides

`node:internal/test_runner/runner:469` (`#processRawBuffer`) · `test/helpers/runner-channel.mjs`

`node --test` reads each test file's child-process STDOUT as its message channel: each reporter event
is `[0xFF 0x0F][4-byte BE length][payload]`, and bytes between frames are surfaced as `test:stdout`.
Node 24.18.0's parser consumes a frame and then reads the next four bytes as a length **without
re-scanning for the header**, so text that follows a frame in one `data` chunk is read as a length.
What happens next is decided by that text's THIRD byte:

| third byte | what the parser computes | outcome |
|---|---|---|
| `0x20`–`0x7F` (plain ASCII) | length ≥ 0x20000000 | "not all here yet" → breaks → recovers on the next chunk |
| `≥ 0x80` (any UTF-8 lead or continuation byte: `›` `✓` `→` `—` `·` `✗` `…`) | `bufferHead[2] << 24` is **negative** in JS | the `rawBufferSize < fullMessageSize` guard is vacuously false and the deserializer is handed bytes that are not a frame |

```
Error: Unable to deserialize cloned data due to invalid or unsupported version.
    at #processRawBuffer (node:internal/test_runner/runner:469:20)
    at FileTest.parseMessage (node:internal/test_runner/runner:376:29)
    at Socket.<anonymous> (node:internal/test_runner/runner:524:15)
```

It is thrown in the PARENT inside the child's `stdout` data handler, and `createProcessEventHandler`
attributes it to the FileTest whose stream it was parsing — so a file is reported FAILING for
something that is not in it. It is load-shaped because the coalescing is: an idle parent reads each
write separately; a parent competing for a core reads one chunk holding a frame AND the text after it.
This is the family that aborted `npm publish` at `prepublishOnly` on 2026-09-19 and put false FAILs on
two branches the same night, and `docs/research/GO-LIVE-BOARD.md` §B's "moving between unrelated
files" is explained by it — the member is whichever file's text happened to coalesce.

Measured 2026-09-22, node v24.18.0, on `test/scaffold.test.mjs` unchanged: **15/15 green idle, 2 of 30
RED under 16 CPU burners**, both with that error; a crafted one-chunk repro (frame + `"› …"`) is red
every time and the same frame + `"skip …"` is green every time. The byte rule was checked against five
leading strings.

**The instance is fixed and the mechanism is guarded** (`4f7ce91`, `a663eae`) — but THE CLASS IS NOT
CLOSED, and that guard guards the helper, not the members.

**How many members.** Not exactly knowable without running each file. A static over-approximation —
the import graph of the 274 declared test files, flagging any that can reach a
`process.stdout.write` / `console.log` whose text STARTS with a non-ASCII glyph (treating `${…}` as one
unit, because `src/lib/log.mjs` writes `` `${pc.cyan("›")} …` ``) — says **70 of 274**. The writing
modules, by number of such writes: `src/lib/log.mjs` 87, `packages/harness/install/log.mjs` 63,
`src/lib/verify.mjs` 46, `packages/harness/install/init.mjs` 36, `packages/harness/install/fleet.mjs`
12, `scripts/fleet-check.mjs` 12, `src/commands/doctor.mjs` 8, `src/doctor.mjs` 8,
`scripts/ground-truth.mjs` 7, then single digits. Reachability is not execution, so 70 is an upper
bound on candidates and a lower bound on nothing; the honest statement is that the class is large and
only one member is fixed.

**What would actually close it.** One of: (a) a preload in the `test` script
(`node --test --import ./test/...`) that, in a runner child, routes every non-frame stdout write to
stderr — the runner surfaces stderr line by line and cannot choke on it; (b) a node version where
`#processRawBuffer` re-scans for the header (worth an upstream report either way — this is a node bug,
not ours); (c) per-file fixes, which needs the membership measurement above to be real. (a) is one
line in `package.json`'s `test` script, which is the suite gate's own definition and was shared with
five other fixers in this wave, and it cannot be validated without a full-suite run — so it is named
here as a proposal rather than taken.

**Fires when:** the suite runs on a machine busy enough that the parent reads a frame and the text
after it in one chunk — a device lane, a Gradle build, several agent sessions, or `npm publish`'s own
`prepublishOnly` while anything else runs.
*Logged 2026-09-22 by the slice that fixed the `scaffold.test.mjs` instance.*

### KD-201 — the `quiet()` helper drops reporter events, and the run reports fewer tests than it ran

`test/a-fleet-upgrade-writes-to-a-tree-the-manifest-never-named.test.mjs:41`,
`test/a-fleet-upgrade-lands-a-different-harness-in-each-repo.test.mjs:49`,
`test/one-artifact-is-recorded-with-a-different-origin-in-each-repo.test.mjs:65`,
`test/the-fleet-command-names-a-front-door-the-caller-did-not-use.test.mjs:49`

Four files silence a CLI call by replacing `process.stdout.write` with `() => true` (or with a
collector) for the duration of an AWAITED call. In a runner child, `process.stdout` is not a console —
it is the channel the v8-serializer reporter writes its frames to, by calling `process.stdout.write`.
Any frame flushed inside that window is swallowed, and nothing anywhere goes red: the stream stays
well-formed, the file exits 0, and the parent simply never learns about that event.

Measured 2026-09-22 with the `quiet()` body copied verbatim into a four-test file, one test holding a
300 ms quiet window:

```
with quiet():     ℹ tests 3   ℹ pass 3   ℹ fail 0      (four tests ran)
without:          ℹ tests 4   ℹ pass 4   ℹ fail 0
```

A test vanished from the record. Note the shape this predicts for `qa-artifacts/suite-history.jsonl`:
a total that moves between runs over identical bytes — KD-165's own two rows are `2122/2124` and
`2123/2124`, with one test unaccounted for in both. That is consistent with this, and this entry does
not claim it IS this: the connection was not measured on the real suite.

`test/helpers/runner-channel.mjs` is the shape that is safe — frames pass, text does not — and
swapping the four `quiet()`s for it is a four-line change per file. Not done by the slice that found
it: those four files were not its subject, and the wave allowed running only the files it named, so a
change there could not be verified by running it.

**Fires when:** a reporter event is flushed inside one of those four windows — which is a matter of
timing, so the loss is silent and intermittent.
*Logged 2026-09-22, found while building the helper that slice uses.*

### KD-205 — one call site of the ordering check cannot say which of its four causes happened

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

### KD-206 — an iOS-only or Firebase-only template change now owes no device run, and never got a real one

`scripts/stamped-output.mjs` (`FLEET_SCRATCH_APP.flags`) with KD-45

The fleet scratch app is stamped `--no-ios --no-firebase`, so `template/iosApp/`,
`composeApp/src/iosMain/` and every Firebase-only file are stripped out of it. The device tier is now
scheduled by that app's bytes, so **an edit to iOS-only template code leaves the digest unchanged and
the tier reads DISCHARGED**. Measured 2026-09-22 in a temp copy: appending a line to
`template/iosApp/Podfile` moved no byte of the stamped app.

Not blocking, and arguably the honest state: under the old input-path rule the same edit REOPENED the
tier, and the run it obliged compiled neither iOS nor Firebase (KD-45) — it could not have failed for
that change. No proof is lost; what changes is that KD-45's gap is now VISIBLE in the schedule instead
of masked by a run that proves nothing about those files. The review tier still obliges (`template/`
is a review trigger), so such a change still gets a reader. If the spec ever gains `--ios`, the digest
covers those files with no further change.

**Fires when:** someone reads "device DISCHARGED" on an iOS-only change as "iOS is proven".
*Logged 2026-09-22, by the slice that bound the device tier to the stamped app.*

**2026-09-25 — amended when Firebase left stamp-time.** The scratch app is now stamped `--no-ios`
only, because the default stamp carries no Firebase. The Firebase code lives in
`overlays/firebase/`, outside `template/`, so an overlay edit moves no byte of the default stamp and
the tier reads DISCHARGED for it — the same shape as the iOS half, and just as honest, because the
L2 run never compiled Firebase either. What covers an overlay edit instead is CI's stamp + `add
firebase` + assembleDebug on the PR (KD-45): compile, not runtime.

**2026-09-26 — the Firebase half, amended: an overlay edit is scheduled now.** The schedule stamps
once and hashes twice: the default app, and the same app after `add firebase --no-verify`. An edit
that moves what the add step writes, under `overlays/firebase/` or in `src/lib/add-firebase.mjs`,
leaves the L2 run DISCHARGED, because the default app did not move, and makes the Firebase L2 run
OWED (`test/a-change-the-stamped-app-never-sees-buys-a-device-run.test.mjs`). The iOS half is
unchanged: the scratch app is `--no-ios`, so an iOS-only edit moves neither digest.

### KD-208 — the four gate bounds now sum to exactly the hook's declared budget

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

### KD-209 — `grep -r` in this environment obeys .gitignore, so a scan of a stamped app can miss the file that matters

no source file — a fact about the tooling, recorded because it nearly cost a slice a defect

While hunting for machine-derived bytes in a stamped app, `grep -rl "/Users/" <app>` did not list
`local.properties`, which contains exactly that string: the shell's `grep` honours the app's own
`.gitignore`. The same scan for today's date was therefore also incomplete. Re-run through
`find <app> -type f -exec /usr/bin/grep -l ...` it lists both files, and that is how the three
normalisers in `scripts/stamped-output.mjs` were found to be complete.

**Fires when:** any future audit of a generated tree uses `grep -r` and concludes a pattern is absent.
*Logged 2026-09-22, by the slice that bound the device tier to the stamped app.*

### KD-210 — a Firebase run would prove compile, init and redirect; nothing in the template crosses the redirect

`overlays/firebase/files/composeApp/src/androidMain/kotlin/com/example/app/FirebaseEmulators.kt`
(`configureFirebaseEmulators`) · `template/qa/e2e/smoke.yaml`

What a covered run executes, exactly: the app is BUILT with the GitLive dependencies and the
google-services plugin, `assembleRelease`/R8 runs over them, `FirebaseApp` initialises from the
stamped placeholder `google-services.json`, and `configureFirebaseEmulators()` runs all four
`useEmulator` calls — which is where both escaped redirect defects lived, and where the app now
REFUSES to start if the redirect fails (`FirebaseEmulators.kt`'s catch, a thrown `IllegalStateException`
rather than the `runCatching` that once swallowed it). What it does NOT prove is that traffic
reaches the emulators: nothing in `commonMain` uses a Firebase client — `dev.gitlive` appears only
in the two `FirebaseEmulators.kt` files the add step writes (`androidMain`, `iosMain`) — and
`qa/e2e/smoke.yaml` walks first frame, the item list and two tab switches, so the suite would serve
zero requests and would serve zero if it were never started.

The emulator suite is worth running anyway: `useEmulator` is a promise about where traffic WOULD go,
and the first flow that reads a document needs it. What must not happen is a record being read as
*"the redirect carried traffic"*.

**Fires when:** anyone reads a Firebase PASS as evidence that the app talked to the emulators.
*Logged 2026-09-21 by the wave's Firebase fixer, from reading the template rather than from a run;
folded here 2026-09-22 because it describes the template on this tree, not the held branch's
machinery.*

**2026-09-26 — the record says it.** The Firebase L2 run now exists (KD-45). Its record carries
`coverage.trafficThroughRedirect: false` with this entry's reason, so a PASS is not readable as
traffic. `--ladder-plant` under `--with-firebase` makes `configureFirebaseEmulators()` throw and
requires `e2eSmoke` red with the build green, so a green run's claim that the redirect ran is
derived and not argued. Still open as written. Proving traffic would take a Firebase call on a path the lane walks,
for example an anonymous sign-in or one document read in the debug build, or an instrumented test.
That is an overlay change every adopter's debug build would carry, roughly one more lane step
(~30–60 s, estimated), and a product decision. It is not in this slice.

### KD-211 — the redirect host assumes the lane's device is an emulator

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

### KD-212 — the table is derived from the template FILE's history, and create-cmp writes a command that file never carried

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

### KD-213 — the `--dry-run` gate refuses four spellings of a write, where its own header names the class

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

### KD-218 — the unreadable-boolean refusal names `--no-<value-flag>` as a flag that takes `true` or `false`

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

### KD-219 — `attach.mjs`'s new comment says the empty value "never arrives any more", and the suite passes it in

`src/commands/attach.mjs` (`manifestFromFlags`, the `citation-roots` comment)

The comment the change put there reads *"the EMPTY value never arrives any more, because the door
refuses a value flag given none before any command runs (`emptyValues`, bin/create-cmp.mjs)"*. True
of argv through the bin; false of the function, which is exported and called with
`{ profile: "Bad Id", "citation-roots": "" }` by `test/attach-manifest.test.mjs:83` in this same
tree. The `roots.length` guard the comment was weakened around is still load-bearing and still
correct — only the reason given for keeping it is false.

**Fires when:** anyone reads the comment to decide whether the guard can go.
*Logged 2026-09-22, round 1 of the doors review.*

### KD-220 — the publish payload stamps the app twice, and the reserve is sized for one

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

### KD-221 — the local.properties normaliser blanks the whole file, not the machine pointer in it

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

### KD-222 — the device digest cannot see an empty directory

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

### KD-223 — the test that caught two spellings of one hash now compares one spelling with itself

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

### KD-224 — a render-cycle assertion became a poll, and a boot wait widened, in a change about something else

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

### KD-225 — the device is leased per project, and two projects each held it

`scripts/hooks/proof-gate.mjs` (the foreign-lane check, run once at command start) · `template/qa/lib/profiles/cmp/device-lease.mjs` (the machine-global per-serial lease a stamped lane takes)

Measured 2026-09-22 during the wave's gate pass. `proof-gate` refused the first `fleet-check` because payment-blueprint's `verify.mjs --profile e2e` (pid 20681) was running — correct. It accepted the second, started 21:12 once that pid had exited. At 21:14:29 payment-blueprint's harness started another Maestro run on the same `emulator-5554` (`/Users/test/.maestro/tests/2026-09-22_211429` is ours — `FleetCheck/qa/e2e/smoke.yaml`; the log ends at "Created execution plan"; the 20:08 run is theirs, `com.payment.wasl`). Our `e2eSmoke` failed in 18.8 s with "Maestro failed (no per-flow report was written)"; `androidChecks` then took 437 s against a usual ~25 s. The fleet verdict was FAIL and the device tier stayed OWED — the gate was fail-closed, and nothing was wrongly served.

**What is unpinned.** The gate's foreign-lane check is a point-in-time test at the START of our command; nothing holds the device for the run's duration. The lease the stamped lane takes (`device-lease.mjs`, "machine-global per-serial") is what should serialise two lanes on one serial, and it did not: either payment-blueprint's harness predates it (its tree was stamped from an older engine) or the two lanes' lease files are keyed differently. Not measured which. The template's own `PreToolUse` reminder says exactly why this matters — "the one device is scarce, slow, and fragile, so device proof is a checkpoint, never an inner loop."

**Why it does not block.** Fail-closed both ways: our run recorded FAIL, the tier stayed owed, the remedy the gate prints (wait, then run the tier once) is the right one, and the re-run in a quiet window discharges over the same stamped bytes. **Fires when:** two autonomous sessions on one machine each run a device lane against the one booted emulator. The fix is a slice, not a line: the lease must be taken by `fleet-check` itself for the scratch app's serial, and the gate should read the lease rather than `ps`. *Logged 2026-09-22 by the lead, during the wave's gate pass.*

### KD-226 — the fleet-check reader ends a word at a quote; the `cd` reader refuses one

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

### KD-227 — Rule 4's new sentence counts the oracle rows it added, and the count is wrong

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

### KD-228 — the spine's lagging marker is object identity, and `--json` publishes an object that loses it

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

### KD-230 — the not-read proof behind rule 2's unobserved list is a measurement nothing repeats

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

### KD-232 — "this repository enables its own plugin", and no file in this repository does

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

### KD-233 — the fresh-helper figure is called a floor, and it is not one

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

### KD-234 — a send to a running helper would be priced as a resume

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

### KD-244 — the upgrade base for a late-Firebase app is a tree it never was

`src/commands/upgrade.mjs:381-385`

When the base engine carries stamp-time Firebase (0.27 and earlier), the base is stamped with
`legacyFirebaseKeys(record)`. An app stamped `--no-firebase` that later ran `add firebase` records
Firebase, so its base is the old template with Firebase ON, which that app never was.

**Measured 2026-09-25, on the release-0.28.1 branch: not harmless.** A test in
`test/an-app-with-firebase-keeps-it-through-upgrade.test.mjs` (left uncommitted, patch kept by the
batch) stamps the synthesised 0.27 template `--no-firebase` with one engine change planted
(`minSdk` 23 → 24), runs this engine's `add firebase`, then `upgrade --harness --base-dir`: exit 1,
conflict sidecars on `composeApp/build.gradle.kts` and `gradle/libs.versions.toml`, the app's files
untouched, no Firebase file removed or duplicated. Re-planned against both bases with
`planHarnessUpgrade`: the Firebase-ON base conflicts on both files, the Firebase-OFF base (the tree
the app was) on `libs.versions.toml` only. So `build.gradle.kts` is this defect: the ON base's
Firebase block sits after a blank line that the `--no-firebase` stamp keeps and the current template
lacks. The `libs.versions.toml` sidecar is the test fixture’s, not an app’s: the synthesised 0.27 catalog
carries one of 0.27.2’s six GitLive libraries. Re-run with the real catalog (`git show
v0.27.2:template/gradle/libs.versions.toml`, all six unmarked, so a `--no-firebase` 0.27.2 app kept
them), `add firebase` leaves the catalog alone and the upgrade writes it cleanly; the one sidecar
left is `build.gradle.kts`. A test for this defect needs the real 0.27.2 catalog in its base, or it
fails for a reason no app has.

**Why it does not block:** unchanged in kind: the harm is loud. `upgrade --harness` exits 1 and
writes a `*.cmp-new` sidecar for a human, and changes nothing in the app. It is never a silent strip.

*Logged 2026-09-25 (0.28.0 batch).*

### KD-247 — `upgrade` moves GitLive and leaves the Podfile's Firebase pairing behind

`src/lib/add-firebase.mjs` (`firebaseIosPodFor`, the `__FIREBASE_IOS_POD__` tokens) vs `src/lib/upgrade.mjs`

Found in round 1 of the 0.28.1 slice. KD-243 made `add firebase` write
`pod 'FirebaseCore', '~> <major>.<minor>'` from the registry set's `firebaseIos` pairing, with a
Podfile comment naming it ("GitLive 2.1.0 is built against Firebase iOS 11.1.0"). `upgrade`
rewrites `[versions]` — `firebase-gitlive` included — and nothing under `src/` other than
`add-firebase.mjs` reads the Podfile or `firebaseIos` (grep, 2026-09-25). So an app that added
Firebase on one set and upgrades to a set with another GitLive version keeps the first set's pods
and a comment that names a GitLive version the catalog no longer pins.

Placed on the line: nobody is wrongly served today — the shipped sets pair 11.1.0 and 11.8.0, both
inside `~> 11.1`, so the pods resolve. It fires when a promoted set pairs a GitLive version built
against Firebase iOS 12: the upgraded app then asks CocoaPods for `~> 11.x` against bindings linked
at 12. The repair is `upgrade` carrying the pairing (or refusing across a major), the way
`promote-set` now does.

### KD-249 — `planShippedHookHeal` throws where it should skip

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

### KD-253 — the KD-231 gate's create-cmp exemption still matches file and package names

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

### KD-255 — a markdown file under `overlays/` would never oblige the Firebase L2 run

`scripts/observed-tree.mjs` (`DEVICE_TIER_IRRELEVANT`, `DEVICE_TIER_SHIPPED`) with KD-207 and KD-206

Found while wiring the Firebase L2 run into the schedule (`feat/firebase-runtime-proof`, plan R5).
`deviceTierNeed` asks the cheap question first — can anything this slice touched reach an app at
all — and `*.md` in `DEVICE_TIER_IRRELEVANT` answers "no" for every markdown path. KD-207 closed that
for `template/`, where markdown ships into the stamped app, by putting `template/` back through
`DEVICE_TIER_SHIPPED`. `overlays/` is not there. `add firebase` copies files out of
`overlays/firebase/`, so an overlay `.md` it copied would ship into the app the Firebase L2 run is
keyed on, and a slice that changed only that file would read NOT OWED for both tiers without either
digest being asked. The two halves would disagree exactly as KD-207's did: a change that did reach
the Firebase app, and was never scheduled.

**Why it does not block:** measured 2026-09-26, `find overlays -name "*.md"` returns nothing, so no
overlay markdown ships today. The repair is one entry — `overlays/` in `DEVICE_TIER_SHIPPED` — after
which the Firebase digest judges such an edit for the price of one stamp. Not built: this slice
logs it (plan R5).

*Logged 2026-09-26 (feat/firebase-runtime-proof, U2).*

### KD-256 — `--rekey` does not re-derive the Firebase L2 run's record

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
