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
readers, each correctly, because nothing recorded that it had already been heard. An entry marked
**RETIRED** in `KNOWN-DEFECTS-CLOSED.md` was heard too — 122 moved there on 2026-09-26 because
nobody is wrongly served by them — so grep both files before reporting.

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
| **KD-5** | `tokenDrift` SKIPs whenever the debug app is not running | environmental, indistinguishable from broken |
| **KD-45** | no gate in this repo executes the Firebase or iOS paths | Firebase: CLOSED 2026-09-26 — the Firebase L2 run (`--with-firebase`, owed when the add step's output moves) PASSED at L2 on 0.28.2, androidChecks and its redirect plant included; no traffic crosses the redirect (KD-210); iOS: the L2 run stamps `--no-ios`; the iOS stamp compiled once on CI (run 36181162894, dispatch-only, 0.28.0 tree) and has never run |
| **KD-68** | criterion B omits `checkFreshness`, which needs no tree — the vendored receipt goes stale 2026-10-17 | B is behind an unsigned criterion A and reports "not reached" |
| **KD-72** | the signed attestation can be rewritten without owing or reopening a review — `REVIEW_TIER_TRIGGERS` is a code allow-list and `docs/` is not on it, but that is where this one evidence-bearing file lives | the exemption is right for prose and wrong for this file; nothing is mis-served today, and the harm needs a future edit |
| **KD-90** | the `statusLine` third of the hook-anchoring fix is NOT fixed — `CLAUDE_PROJECT_DIR` is not exported to a statusLine command, so the anchor would be inert | **re-placed 2026-09-19**: the old reason (*nothing regressed*) is age, which the header abolished. The surface IS inert and an adopter IS affected — what moves it to row 2 is that they are now TOLD, by `doctor`, in the one place that could tell them. The remedy needs a different mechanism (stdin `workspace.project_dir`, KD-181), not a different spelling |
| **KD-112** | the door has no bypass, so every way it can be wrong ends in a correctly installed tree that cannot run its suite at all — a named `PROOFLANE_SKIP_PREFLIGHT=1` would bound the class at one line | a product decision, handed up rather than taken: the population is empty today (KD-111 has no producer, and the one real divergence found in review is fixed), and an escape hatch is how a guard becomes optional |
| **KD-195** | the new `unanchored-hooks` finding reports every anchorable hook surface the detector faults, so KD-183's over-report can now be printed about a Stop, PreToolUse or SessionStart hook an app anchored by `cd` | the conservative direction, chosen on purpose: a `warn` that names the command and prints the anchored form, where the other direction is silence about a Stop gate that does not run; claiming health is impossible here by construction |
| **KD-200** | text a test prints shares the runner's message channel, and node's parser reads it as a frame length: a third byte ≥ `0x80` (`›` `✓` `→` `—`) makes the size negative and aborts the FILE with *"Unable to deserialize cloned data"*, attributed to whichever file's stream was being parsed | the `scaffold.test.mjs` instance is fixed and the helper is guarded, but the class is not closed: a static over-approximation says 70 of 274 declared test files can reach such a write, and closing it needs either a `package.json` preload (the suite gate's own definition) or a per-file measurement |
| **KD-201** | four test files silence a CLI call by replacing `process.stdout.write`, which is the channel the reporter writes its FRAMES to — a frame flushed inside that window is swallowed, the file exits 0, and the run reports fewer tests than it ran | measured: 4 tests run, 3 reported, nothing red. Not fixed because those four files were not that slice's subject and the wave allowed running only the files it named |
| **KD-206** | the fleet scratch app is stamped `--no-ios`, so an edit to iOS-only template code moves no byte of the stamped app and the device tier reads DISCHARGED; Firebase lives in `overlays/firebase/`, which no stamp copies, so an overlay edit moves the default digest by nothing and the Firebase L2 run's digest by what it changes | no proof is lost — the L2 run never compiled either (KD-45) — so KD-45's gap is visible in the schedule instead of masked by a run that proves nothing about those files; an overlay edit owes the Firebase L2 run (KD-45); CI still compiles it on every PR; `template/` is still a review trigger |
| **KD-210** | a Firebase run proves the template COMPILES, INITIALISES and REDIRECTS — no byte crosses the redirect | nothing in `commonMain` uses a Firebase client and the smoke walk is four screens, so the suite serves zero requests; the risk is a record read as "the redirect carried traffic"; the record states it (`coverage.trafficThroughRedirect: false`) |
| **KD-225** | two projects' lanes shared one emulator mid-run: create-cmp's fleet check (started 21:12 after the gate saw the other lane exit) lost its e2eSmoke at 21:14 — Maestro logged "Created execution plan" and nothing after, no per-flow report — while payment-blueprint's lane started a new Maestro run on the same `emulator-5554` at 21:14:29; the gate checks for a foreign lane only at START, and the per-serial device lease did not hold across the two projects | the run was FAIL, not a false PASS — fail-closed; the re-run in a quiet window is the remedy the gate itself names |
| **KD-244** | `upgrade`'s merge base for a `--no-firebase` app stamped by 0.27 or earlier that later ran `add firebase` is the old template stamped with Firebase ON (`legacyFirebaseKeys`), a tree that app never was | measured 2026-09-25: not harmless, but loud: one spurious conflict sidecar (`composeApp/build.gradle.kts`) and exit 1, nothing removed or duplicated; a second sidecar (`libs.versions.toml`) seen in the test comes from its synthesised 0.27 catalog and does not occur with the real 0.27.2 one |
| **KD-247** | `add firebase` writes the Podfile's Firebase pods and a comment naming the GitLive version the registry paired them with (KD-243), and `upgrade` moves `firebase-gitlive` in the catalog and never the Podfile | cannot fire yet: every shipped set pairs Firebase iOS 11.x, which `~> 11.1` still resolves; the comment goes stale on the first GitLive bump, and the pins break at the first set that pairs across a Firebase iOS major |
| **KD-255** | `DEVICE_TIER_IRRELEVANT`'s `*.md` would declare a markdown file under `overlays/` unable to oblige either L2 run, and `DEVICE_TIER_SHIPPED` puts back `template/` only — so an overlay `.md` that `add firebase` copies into the app would never make the Firebase L2 run required (the KD-207 shape, one root over) | no `.md` exists under `overlays/` today (measured), so nothing ships unscheduled; the repair is `overlays/` in `DEVICE_TIER_SHIPPED`, and the digest then judges it |
| **KD-257** | a change to an L2 tier's own RUNNER (`scripts/fleet-check.mjs`, `scripts/lib/fleet-firebase.mjs`) owes no run of that tier, so the gate refuses the only run that would exercise the new runner on its branch — the Firebase L2 run merged unexercised and ran first on trunk | a decision, handed up: the tiers are keyed on output bytes (settled), and a runner is not an output; the runner's first real run is a trunk release proof, fixed forward if red |
| **KD-263** | nothing before the suite refuses a registry set whose `firebase-bom` is missing or was not measured for its own `firebase-gitlive`: `promotedSet` accepts a candidate with no `firebase-bom` (on which `add firebase` then refuses every app) and one that moves GitLive to 2.5.0 while carrying 33.15.0; the KD-260 table test passes when both the GitLive version and the BoM are unknown (`undefined === undefined`) | maintainer path only, and no candidate pins `firebase-gitlive` today; a promoted set with no BoM is still refused by the scaffold-based `add firebase` tests once the template moves onto it. The repair is the KD-243 shape: promotion refuses a candidate `add firebase` would refuse, and the table test requires a measured row for every GitLive version |
| **KD-265** | nothing now refuses a stamp + `add firebase` that outgrows the hook's `STAMP_CAP_MS` (3000 ms): the one measured assertion (`ms < STAMP_CAP_MS` in `two-stamps-of-one-tree-are-not-the-same-app`) became `ms < CEILING_MS` (60 s) with the suite's own cap, and `ANSWER_RESERVE_MS`'s "0.25–0.34s measured" is now prose no test holds | cannot fire today (279 ms measured on this tree, 2026-09-26) and fails safe when it does: the Firebase half reads unanswerable and the tier OWED, naming the cap, never DISCHARGED. Whether a wall-clock guard belongs in a suite that runs under `prepublishOnly` load is Karel's call |
| **KD-268** | the demo's plant test stamps from its own config, not the demo's `--no-ios --yes` | not today — the injectors plant on the demo's own stamp |
| **KD-269** | injector #4 adds its import only when the file starts with `package` | every template screen does |

---

## Open

### KD-5 — `tokenDrift` SKIPs whenever the debug app is not already running

`packages/harness/src/` token-drift step; observed on every fleet run

`inspector endpoint not reachable on :9500 (debug app not running?)` — the live tier needs a
debug build already launched, which a headless fleet run does not provide. The SKIP is
environmental and non-blocking (the 2026-09-11 run still graded **L2 device, PASS**), but it is
indistinguishable at a glance from a step that was skipped because it was broken.

**Worth deciding:** classify it as environmental so a reader can tell the two apart.
*Logged 2026-09-11.*

**2026-09-27 — decided (Karel), and now pinned.** A SKIP with no `skipKind` in a current receipt is
not refused, by the harness or by the library KD-266 moved the refusals into — tokenDrift's
`unreachable()` SKIP (`steps-cmp.mjs`) is the one current emitter, on every headless L2 run, and
labelling it `environment` would refuse every such receipt. `packages/receipts/test/done-evidence.test.mjs`
pins it. What stays open is the cause: the step launches the debug app and polls ~10 s, and the
inspector on :9500 still never answers. That is a diagnosis, not a label.

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
(KD-211), iOS (above). First recorded run: **2026-09-26, trunk d2162b8, FAIL** (~10 min wall-clock,
`--with-firebase --ladder-plant`). The emulator suite served `demo-mock-not-real`; build (33.8 s),
releaseBuild/R8 (220 s) and e2eSmoke (35 s) PASSED, so the debug app compiled, initialised and ran
its four redirects; androidChecks then failed at `compileDebugAndroidTestKotlinAndroid`, because
nothing put the Firebase BoM on the instrumented tests' classpath (KD-260, fixed in 0.28.2). The
redirect plant did not run: it runs only after a green lane. This Firebase half closes only on a PASS
record; until then it stays open.

**2026-09-26 — the Firebase half CLOSES on its first PASS.** Trunk 8f41f21 (0.28.2),
`--with-firebase --ladder-plant`: PASS at rung L2 (`qa-artifacts/fleet-firebase-latest.json`, ranAt
2026-09-26T01:30:37Z, post-add digest `2cfddaf5e6ea…`). Under the suite (auth 9099, firestore 8080,
storage 9199; functions unserved, with its reason) build (16.9 s), releaseBuild/R8 (482.6 s, cold
over the BoM's dependency graph), e2eSmoke (39.5 s) and androidChecks (60.6 s) all PASSED, so KD-260's
fix holds at runtime as well as at compile. The redirect plant PASSED: with
`configureFirebaseEmulators()` throwing, e2eSmoke went red while build and releaseBuild stayed green,
so the green run's e2eSmoke ran the redirect. Wall-clock: ~22 min for both lanes (started
01:08:29Z); one lane is ~11.6 min of steps, where `TIERS.firebase.cost` still prints "~4.5min". What
stays open in this entry is the iOS half; KD-210 (no request crosses the redirect) and KD-211 (the
host assumes an emulator) stand as written.

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

### KD-225 — the device is leased per project, and two projects each held it

`scripts/hooks/proof-gate.mjs` (the foreign-lane check, run once at command start) · `template/qa/lib/profiles/cmp/device-lease.mjs` (the machine-global per-serial lease a stamped lane takes)

Measured 2026-09-22 during the wave's gate pass. `proof-gate` refused the first `fleet-check` because payment-blueprint's `verify.mjs --profile e2e` (pid 20681) was running — correct. It accepted the second, started 21:12 once that pid had exited. At 21:14:29 payment-blueprint's harness started another Maestro run on the same `emulator-5554` (`/Users/test/.maestro/tests/2026-09-22_211429` is ours — `FleetCheck/qa/e2e/smoke.yaml`; the log ends at "Created execution plan"; the 20:08 run is theirs, `com.payment.wasl`). Our `e2eSmoke` failed in 18.8 s with "Maestro failed (no per-flow report was written)"; `androidChecks` then took 437 s against a usual ~25 s. The fleet verdict was FAIL and the device tier stayed OWED — the gate was fail-closed, and nothing was wrongly served.

**What is unpinned.** The gate's foreign-lane check is a point-in-time test at the START of our command; nothing holds the device for the run's duration. The lease the stamped lane takes (`device-lease.mjs`, "machine-global per-serial") is what should serialise two lanes on one serial, and it did not: either payment-blueprint's harness predates it (its tree was stamped from an older engine) or the two lanes' lease files are keyed differently. Not measured which. The template's own `PreToolUse` reminder says exactly why this matters — "the one device is scarce, slow, and fragile, so device proof is a checkpoint, never an inner loop."

**Why it does not block.** Fail-closed both ways: our run recorded FAIL, the tier stayed owed, the remedy the gate prints (wait, then run the tier once) is the right one, and the re-run in a quiet window discharges over the same stamped bytes. **Fires when:** two autonomous sessions on one machine each run a device lane against the one booted emulator. The fix is a slice, not a line: the lease must be taken by `fleet-check` itself for the scratch app's serial, and the gate should read the lease rather than `ps`. *Logged 2026-09-22 by the lead, during the wave's gate pass.*

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

### KD-257 — a change to an L2 tier's runner owes no run of that tier

`scripts/proof-plan.mjs` (`DEVICE_TIER_IRRELEVANT` declares `scripts/` unable to affect the L2
run) with `scripts/hooks/proof-gate.mjs` (`decide("device")` denies a run when nothing is owed)

Found planning the Firebase L2 run (`feat/firebase-runtime-proof`, plan D1). Both L2 tiers are
keyed on the stamped app's OUTPUT bytes (settled: `docs/proposals/LIBRARIES-IN-SERVICES-OUT.md`
Decision 1 and the slice's owed-trigger decision), and a runner's source is not an output. So a
slice that only builds or changes `fleet-check.mjs` and `scripts/lib/fleet-firebase.mjs` owes
neither run, and the hook refuses `fleet-check` on that branch with "nothing is owed". The slice
that built `--with-firebase` therefore merged with its runner exercised only by unit tests over
stubs and real stamps, and its first real run was a release proof on trunk after merge, which the
hook allows.

**Why it does not block:** the direction is safe — a runner that is wrong fails its own first run
loud on trunk and is fixed forward; it cannot write a PASS record for bytes it did not run, and no
adopter ships `scripts/`. **Decision asked:** should a change to a tier's runner owe that tier once
(an input-path trigger, which the owed-trigger decision rules out for the app's bytes but not
obviously for the runner's), or is "first run on trunk, fixed forward" the rule?

*Logged 2026-09-26 (feat/firebase-runtime-proof, orchestrator, from plan D1).*

### KD-263 — promotion admits a set whose Firebase BoM `add firebase` refuses or never measured

`scripts/lib/promoted-set.mjs` `firebaseIosPairingProblem`/`promotedSet`,
`test/the-firebase-ios-pods-follow-the-gitlive-version.test.mjs` (`GITLIVE_BOM` table test)

Measured: `promotedSet` over a clone of set `2026.07r` with `firebase-bom` deleted returns a set, and
`registryVersionsFor(kotlin, versionsFromRegistry, {sets:[it]})` then refuses with `names no
"firebase-bom" version` — every app on that set. A clone with `firebase-gitlive` 2.5.0 (and a matching
`firebaseIos`) carrying `firebase-bom` 33.15.0 is also promoted. The promotion check exists for the
iOS half (KD-243: the set must be one `add firebase` accepts) and not for the catalog keys. The KD-260
table test catches the split once the registry is written, but passes vacuously for a GitLive version
it has no row for when the set also names no BoM, so KD-260's closed record ("refused by nothing
except the KD-260 test's table") overstates it.

**Why it does not block:** no adopter path; `candidates.json` pins no `firebase-gitlive` today, and a
promoted set without a BoM would still be refused by the scaffold-based `add firebase` tests when the
template moves onto it. Repair: `firebaseIosPairingProblem`'s rule generalised to every
`versionsFromRegistry` key, the BoM recorded with the GitLive version it was read for (as
`firebaseIos` is), and the table test asserting a measured row exists for each GitLive version.

*Logged 2026-09-26 (fix/add-firebase-android-test-compile, review round 1).*

### KD-265 — the stamp + add's fit inside the hook's cap is prose no test holds

`test/two-stamps-of-one-tree-are-not-the-same-app.test.mjs` ("ONE STAMP, TWO DIGESTS"),
`scripts/hooks/proof-gate.mjs` `ANSWER_RESERVE_MS`, `scripts/stamped-output.mjs` `defaultStampCapMs`

Until 659929c the measured test asserted `stampedApps(ROOT).ms < STAMP_CAP_MS`: the only assertion
that stamp + hash + add + hash fits the 3000 ms the hook's budget sums over. It now asserts
`ms < CEILING_MS` (60 s), and the suite stamps under `TEST_STAMP_CAP_MS`, so an `add firebase` that
grew to 5 s would pass every test while every production call — the hook and `proof-plan
--discharge` alike, both outside the runner — reads the Firebase half unanswerable. The relaxation
was for a real cause (13 of 112 red under 96 CPU burners, green idle), and a wall-clock bound in a
suite that runs under `prepublishOnly` load is flaky by construction.

**Why it does not block:** cannot fire today (`stampedApps` 279 ms on this tree, idle,
2026-09-26), and fails safe: the tier reads OWED and names the cap, never DISCHARGED. Decision asked
of Karel: a guard measured where the machine is idle (proof-plan printing `ms` against the cap on
every discharge, say), or accept that the first sign is an OWED that names the cap.

*Logged 2026-09-26 (fix/stamp-cap-under-suite-load, review round 1).*

### KD-268 — the demo's plant test stamps a different app from the one the demo stamps

`test/the-refusal-demo-plants-fewer-violations-than-it-reports.test.mjs` (its stamp config) · `qa/refusal-demo.mjs` (`--no-ios --yes`)

The test builds its app from a hand-written config (room, e2e, inspector, Home/Profile tabs); the demo
stamps its own with `--no-ios --yes`. If the `--yes` defaults move away from that config, the test can
stay green while the demo fails to plant — the KD-267 shape again. Not today: round 1 ran the four
injectors on the demo's own stamp and all four planted.

**Fires when:** the `--yes` defaults change what a stamp carries.
*Logged 2026-09-27, round 1 of slice `kd-266-267`.*

### KD-269 — injector #4 adds its `Text` import only to a screen file that starts with `package`

`qa/refusal-demo.mjs` (the #4 injector, `text.replace(/^(package .+\n)/, …)`)

No multiline flag, so a screen file opening with a licence header or an `@file:` annotation gets no
import; the planted node then fails to compile and the compiler, not the golden gate, refuses it —
the demo would still report a refusal, by the wrong gate. Every template screen starts with
`package` today.

**Fires when:** a template screen gains a header above its `package` line.
*Logged 2026-09-27, round 1 of slice `kd-266-267`.*

