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
| **KD-28** | the header's KD-7 measurement cites a count this log attaches to another defect | the argument does not rest on the number |
| **KD-30** | the "second lane run left no receipt" guard reads the path the first run's receipt is at | unreachable; the stale receipt reads as the overclaim |
| **KD-31** | the vendored contract tells its reader to run `scripts/fleet-check.mjs`, which no stamped app has | an import error, not a wrong result |
| **KD-32** | the plant driver spells cmp's source root and pack id as literals | both fail loud, and there is one pack |
| **KD-37** | two fleet ids naming one directory are counted as two repos upgraded | the second pass is idempotent; both were named |
| **KD-39** | a harness nested under an unrelated `node_modules` borrows that project's provenance | unreachable in every layout npm/pnpm/npx produce |
| **KD-40** | `--minimal` strips the lane and leaves `qa/harness.lock.json` describing it | the lock is invisible to the stripper: not `.mjs`, not a declaration |
| **KD-43** | the guard that says the suite is complete is collected BY the suite | no fix that keeps one decider; the declaration is a reviewed trigger path |
| **KD-44** | the matcher covers dotfiles and dot-dirs the runner skips — with the declared pattern, no exotic construct | no tracked test file is dotted; the refusal list cannot reach this |
| **KD-45** | no gate in this repo executes the template's Firebase or iOS paths | the device tier stamps `--no-ios --no-firebase`; shape is scanned, runtime is not |
| **KD-46** | the iOS refusal names two causes its `catch` cannot see | half fixed in `79eafd3` (the cause is carried now); Obj-C raises abort before any Kotlin frame, and the app stops either way |
| **KD-47** | the four emulator ports are spelled in `build.gradle.kts` and again in `KoinHelper.kt` | they agree today, and no `firebase.json` ships to be a third |
| **KD-48** | `Platform.isDebugBinary` is a build-type reading, not the Android flag's twin | the shipped Xcode project has only `Debug`/`Release`, which map correctly |
| **KD-49** | a nested `node --test` exits 0 whatever its tests did, when `NODE_TEST_CONTEXT` is inherited | nothing in the suite spawns one except the harness that measured it, which scrubs the env |
| **KD-50** | the template ships create-cmp's own changelog as source comments in the adopter's app | true prose, wrong repository |
| **KD-51** | a JS masker reads the template's Kotlin; a raw string mis-parses and truncates the scanned body | it reds, not greens — the `useEmulator` tripwire catches the stub — and neither file has a raw string |
| **KD-52** | what the emulator scan's two token-level assertions do NOT decide | the inert clause is gone (`f474f17`); the rest is the floor of a shape scan, and no shape reaches it |
| **KD-56** | `console-now-sse` fails inside a full suite run and passes alone — the message, captured 2026-09-18, is post-test async activity throwing `TypeError: Invalid URL`, not the frame timeout this entry guessed | the failure is the TEST leaving work running after it returns, not the transport; it is now reproducible and belongs to a slice that owns `inspector/mcp/` |
| **KD-58** | the proof gate reads the publish command's words inside a quoted pattern or a heredoc as the act, and refuses | refuses, never allows — and only the agent is refused |
| **KD-63** | the lane refusal reads `qa/.lane-in-progress` with none of the guards its other readers apply | one clause of the sentence degrades; the refusal, the project and ours/not-ours are unaffected |
| **KD-64** | a sibling git worktree of this repository is described as ANOTHER project's lane | errs toward waiting, and the path it prints is true |
| **KD-65** | the lane's project can still be a token the gate never verified — a `--flag=` value, or the first of two occurrences | no producer: every argv this repo and the harness spawn was verified correct |
| **KD-66** | the lane probe's bound covers its subprocesses, not the `existsSync` the same fix added | unmeasurable here — no portable way to plant a wedged mount |
| **KD-67** | §9 says the attestation is NOT MET "while none exists", and one now does, unsigned | the gate names the real reason; the row and the count are unchanged |
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
| **KD-78** | two npm pages still serve "8 gates" from bytes already published; the tree's copy is fixed | no act available here — a registry description changes only by publishing |
| **KD-80** | the ordering precondition guards the device RUN; `gh pr merge --rebase` is where an unproven tree actually lands | the hand-rebase case reopens the tier and is refused at the merge gate already |
| **KD-81** | a branch git could not name routes to "does not apply", so the check passes SILENTLY | no producer: the same git failure makes `obligation()` report `none`, which never reaches the check |
| **KD-82** | the ordering verdict is commit-graph ancestry where every other obligation here is trigger-path bytes | the refusal's remedy is the rebase you owe the merge anyway; it costs a rebase, never a run |
| **KD-83** | "the ordinary owed-allow is byte-identical to before the ordering check" is verified by nothing | the cross-path comparison beside it is real; only the historical claim is unpinned |
| **KD-84** | `declaredBudgetMs` has two implementations and the declared 10s has three spellings | all three agree today, and the unreadable-settings fallback errs small |
| **KD-85** | every app stamped through 0.26.2 keeps three cwd-relative hook commands, and nothing retro-anchors them — not `doctor --fix`, which adds the walk wiring and never rewrites a hook the app already has | no act available here — those trees are other repositories; and no command an adopter runs would tell them |
| **KD-86** | the anchoring detector judges `.mjs/.cjs/.js/.sh` only, so a hook invoking `python qa/x.py` or a bare `qa/tool` reads clean | measured against the template: every command it ships is `node` or `test -f`, so the allow-list refuses nothing that exists today |
| **KD-87** | the anchoring detector equates *single-quoted* with *not executed*, so `sh -c '…'` / `eval '…'` read clean; and it reads each match's prefix from the UNMASKED command, so a shell-inert `'${CLAUDE_PROJECT_DIR:-.}/…'` counts as anchored | both measured by execution and bounded by `test/hook-anchoring-differential.test.mjs`; no command in either shipped settings file is in the blind spot, and the gate reds the day one is |
| **KD-88** | "every surface that carries a command" is spelled as a two-item list (`hooks[*][*].hooks[*].command` + `statusLine.command`) in both readers, and `settings.json` executes more than that — `apiKeyHelper`, `awsAuthRefresh`, `awsCredentialExport` | measured: a fourth hook EVENT and a second hook in an existing group are both caught BY NAME; only a non-`hooks`, non-`statusLine` key is invisible, and neither settings file has one |
| **KD-90** | the `statusLine` third of the hook-anchoring fix is NOT fixed — `CLAUDE_PROJECT_DIR` is not exported to a statusLine command, so the anchor would be inert | measured against the docs, not guessed; the surface keeps its relative form rather than an anchor that reads as protection, and a behavioural test pins it still failing |
| **KD-91** | the differential's `invoking >= 3` vacuity floor names the statusLine, which its own antecedent now skips | five surfaces are counted, so the floor holds with margin; only the sentence is stale |
| **KD-92** | the actionable subset all three anchoring gates call is calibrated by nothing — `unfixedHookAnchors` replaced by `return []` leaves every anchoring test green | measured: the detector is right today, and the PLANT test calibrates the honest total; only the filter under it is unpinned |
| **KD-93** | surface-awareness landed in ONE of the two readers — the differential asks `unanchoredPaths` with no surface (whose default is "anchorable"), and both behavioural harnesses export `CLAUDE_PROJECT_DIR` to the statusLine | the shipped statusLine is relative, so no instrument answers differently today; it fires only if someone writes the anchor on that surface |
| **KD-94** | this file's header says adding an entry "cannot reopen a gate"; it reopens the SUITE gate, because the suite hash deliberately covers markdown | measured: logging costs one ~50s `npm test`, never a device run or a review round — the header's argument holds, its blanket sentence does not |
| **KD-95** | a worktree under a path containing a space cannot be read from a `cd` or a fleet-check operand | no producer: every worktree of this repo lives under a space-free path, and the answer is a refusal |
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
| **KD-119** | KD numbers are allocated per BRANCH, so two branches in flight allocate the same ones: as found, this branch's KD-109..113 and `origin/main`'s KD-109..113 named ten unrelated defects under five numbers, and `scripts/hooks/proof-gate.mjs` cites three of them in comments no rebase conflict ever shows. The collision is FIXED — this branch renumbered to 114-119, above main's maximum, before any rebase | the log is prose and no program routes on a KD number; what stays logged is that nothing makes re-reading main's maximum routine, and that a deriver for it would have to fetch — which `proof-plan.mjs` deliberately never does, because a gate that fetched would move the baseline it judges |
| **KD-120** | the tool check's oracle for "is this a tool" is the grant line it is checking, so a name invented or misspelled identically in `tools:` and in prose clears it — and "add it to `tools:`" is the remedy its own failure message prints | the benign direction: a grant for a tool that does not exist is inert, where prose naming a tool the agent lacks is still refused. No in-tree oracle exists and the design deliberately refuses to carry a list; what is open is whether `SendMessage` and `TaskStop`, both added by this branch under that remedy, are real names |
| **KD-121** | six spellings of "use this tool" the check does not see — inside a fenced block, backticked with an argument (`` `SendMessage(a)` ``), split across a line break, not backticked at all, `mcp__x__y`, and a hump containing an acronym (`ReadPDF`) — and the comment justifying the fence strip ("examples and shell, not instructions") is false of BOTH fenced blocks in this repo's definitions | measured: every tool-shaped token anywhere in all three definitions is already visible to the checker, so no producer; the two fences hold commands the agent IS told to run, but neither names a tool |
| **KD-122** | the check reads ONE spelling of `tools:` where the harness reads YAML: a list form parses to `{"- Read"}` and drops the rest, and an ABSENT `tools:` line — which means the subagent inherits EVERY tool — is read as granting none | both fail loud, never silent (they can only manufacture offences, not hide them), and no producer: all three definitions use the comma form and all three declare one |
| **KD-123** | three prose facts this change states that the tree does not support: the new section cites the 5-minute rule as "below" when it is 44 lines above; its actionable remedy is scoped to `Agent` while `SendMessage` — granted by the same commit, and what RE-DELEGATE step 2 tells it to use — has the same stall shape; and the test's header attributes to SEVEN orchestrators a cold-substitute cost the commit measures at FOUR | the section's general rule ("nothing left to do but wait means you spawned it wrong") does cover the `SendMessage` path, so only the bullet is narrow; the count and the direction word are narration, and nothing routes on either |
| **KD-124** | `attribute()` in `scripts/change-price.mjs` and `mine()` inside `summarize()` in `scripts/lib/proof-history.mjs` are two spellings of ONE attribution rule — a branch match plus a time window — in two files that share no code | nobody is wrongly served: the new reader is advisory, prints a count and refuses nothing, and the difference between the two spellings is the deliberate one its own docblock names. The honest remedy edits a file this slice put out of scope |
| **KD-125** | `attribute()` matches `row.branch === branch`, and `currentBranch()` spells a detached HEAD `""` where all three history writers spell it `null` — so on a detached HEAD every recorded run is attributed to nobody and each row reads `0 record(s)` | no producer: this is an advisory a human reads on a branch, and the block's own `branch` line already prints `(detached)`. One reader-pair over from KD-113, and in the same class |
| **KD-126** | `test/the-spent-block-asserts-counts-the-records-do-not-support.test.mjs` (its header and its line-78 failure message) still tells a contributor that `proof-plan.mjs --history` prints the malformed count for these files. It does not — `--history` reads `plans`, `reviews` and `fleet`, never `qa-artifacts/suite-history.jsonl`, and sums ONE count across the three | the same false fact `6231a21` corrected in production, surviving in a second spelling in the test file that found it. Nobody outside the repo is served by it: it misleads only a contributor reading that assertion's message. Round 2 was the last round, so it is logged rather than fixed |
| **KD-127** | the second case of `test/the-advisory-states-what-its-own-input-refutes.test.mjs` opens `if (!cited) return;`, so on green bytes it asserts nothing, and the class it guards is pinned only against the literal string `proof-plan.mjs --history` — a citation to a different command that reported the fact no better would pass | deliberate and documented by its author (the test is a refuter, and the refutation has been answered), but it is a test measuring nothing today. The honest remedy is a claims table keyed on what a command reports rather than on its name; not built, because it is a new mechanism and this slice's two rounds are spent |

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

### KD-47 — the emulator ports are spelled twice, and declared nowhere

`template/composeApp/build.gradle.kts` (debug `buildConfigField`) · `.../iosMain/.../KoinHelper.kt`

9099 / 8080 / 5001 / 9199 appear as Android BuildConfig fields and again as integer literals in the
iOS redirect. There is no `firebase.json` in the template, so nothing declares them once and the
Firebase CLI defaults are the only thing keeping the two copies honest. An adopter who moves a port
moves it on one platform. Measured today: both copies agree, and the host legitimately differs
(`10.0.2.2` is the Android emulator's host alias, `127.0.0.1` the simulator's), so this is one fact
with two spellings and no drift yet. *Logged 2026-09-15, review of `b549f3b`.*

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

### KD-50 — the template ships create-cmp's changelog as the adopter's source comments

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

### KD-56 — one unreproduced failure, and the instrument that saw it discarded the reason

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

### KD-67 — §9 says the attestation is reported NOT MET "while none exists", and one now does

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

### KD-78 — the npm pages for two aliases still say "8 gates", and no commit can change that

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

### KD-85 — apps stamped through 0.26.2 keep the unanchored hooks, and nothing this repo can run will fix them

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
### KD-95 — a worktree under a path with a space in it is a tree this gate refuses to name

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

### KD-119 — a KD number is allocated per branch, and two branches in flight allocate the same one

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
prose naming a tool the agent does not have, is still refused. What is open is not the check's
shape but one fact about this branch: whether `SendMessage` and `TaskStop` are real names.

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
fenced blocks in this repository's agent definitions are instructions: `agents/cmp-orchestrator.md`
lines 152–156 are the `qa/plan.mjs --hold/--beat/--release` claim the orchestrator is told to make,
and `.claude/agents/staff-reviewer.md` lines 117–120 are the `--record-review` command it is told
not to hand-write. Neither names a tool, so the behaviour is right and only its justification is
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

*Logged 2026-09-18, review round 1.*
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

Closed entries live in [`KNOWN-DEFECTS-CLOSED.md`](KNOWN-DEFECTS-CLOSED.md), so this file stays the size a
reviewer can read every round. An entry moves there when the thing is fixed or the decision is
taken, with the commit that did it.

## Closed
