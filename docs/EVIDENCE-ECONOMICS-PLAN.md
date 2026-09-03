# Evidence economics — implementation plan (doc of record across sessions)

**Status:** ACTIVE. **Started:** 2026-09-02. **Proposal:** docs/proposals/evidence-economics.md
(the six causes, the phases, the named practices). This file is the *execution* record: what is
being done, in what order, by which session, with what proof — so every session working on or
with the harness (create-cmp, create-cmp-showcase, payment-blueprint) reads the same state.

**Any session touching the lane, the console, approvals, or spec coverage reads this first.**
Update the status column when a slice lands. One slice per commit. A slice is not "landed"
until its planted-failure proof is in the suite.

---

## The rule this plan is executed under

The disease being cured is **capability outrunning proof**. Therefore:

1. Every slice ships with its own tests, written before the slice is called done.
2. Every gate-shaped change ships with a **planted failure** — a fixture that must go red.
3. Nothing is reported as landed in any session without the suite output that says so.
4. One slice, one commit, on `feat/studio-self-renewal` (branch off `main`; merge `--ff-only`).

---

## Slices, in execution order

| # | Slice | Cause | Repo | Session | Status |
|---|---|---|---|---|---|
| S0 | Mutation out of the per-change lane | C1 | payment-blueprint | blueprint | **YES given 2026-09-03** — relayed to the blueprint session; it lands there |
| S1 | Prove the uncommitted P2/P3 batch | C2 C3 C4 | create-cmp | this | **landed** (see Log) |
| S2 | Console opens without `composeApp/` | C6 | create-cmp | this | **landed** — proven live on payment-blueprint |
| S3 | Agent-stage pulse (observed activity between prompt and lane) | C4 | create-cmp | this | **landed** |
| S4 | `ERROR` verdict + per-step deadlines | C3 C4 | create-cmp | this | **landed** |
| S5 | Reopen walks back only what it amends; `touches` stay hash-enforced | C5 | create-cmp | this | **landed** |
| S6 | `nightly` stage + receipt names its stage | C1 | create-cmp | this | **landed** (no-cache audit deferred to P1) |
| S7 | Sync path: showcase + blueprint receive S1–S6 | C6 | all three | this, then each | **handed off** — dry-runs done here; the writes belong to the owning sessions (below) |
| S8 | Spine / step-pack / surface split | C6 | create-cmp | this | **landed** (a: runner · b: pack · c: adoption docs) |
| S9 | Per-step input hashes (P1) | C1 C5 | create-cmp | after S8, **conditional** | approved 2026-09-03; trigger = the showcase's journal after its upgrade shows the change-stage lane still too slow |

---

## S0 — payment-blueprint: mutation leaves the per-change lane

**Owner:** the blueprint session, on Karel's yes. Do not run another full lane before this lands.

1. `qa/verify.mjs`: remove `mutation` from the `local` profile; keep it in a new `nightly`
   profile (or `ci --nightly`).
2. `qa/mutation.mjs`: on-demand entry that runs the same step and writes its score into the
   receipt's existing field.
3. CI: a scheduled job running `node qa/verify.mjs --profile nightly` that fails on a ratchet
   regression. Thresholds unchanged.
4. Keep the inputs-keyed cache already written there — it makes the nightly job skip when no
   mutated source changed.
5. **Proof:** a local full lane completes in ≤ ~2 min; the nightly job fails on a planted
   threshold regression.

---

## S1 — create-cmp: prove the uncommitted batch

Already written, untested (see the honest accounting in the 2026-09-02 conversation). Each
line below gains a test; gate-shaped lines gain a planted failure.

| Change | Where | Test to write |
|---|---|---|
| `[tier: device]` on a clause; `unmetTier`; specCoverage FAILs | `lib/spec-coverage.mjs`, `verify.mjs` | `test/spec-coverage-tier.test.mjs`: parse; unmet when only desktop cites; satisfied by instrumented/e2e; undeclared unchanged; **planted:** a fixture project whose lane goes red on the desktop-only citation |
| androidChecks says "did not execute" when 0 tests ran | `verify.mjs` | extract `androidChecksOutcome(res, summary)` as a pure export in a new `lib/step-outcomes.mjs`; test: 0 tests → not-accusing reason + `executed:false`; N>0 failed → the behaviour message |
| Never-run tiers printed from the journal | `verify.mjs` | extract `neverRunTiers(steps, entries)` into `lib/flight-recorder.mjs`; test: 37 skips → listed; 2 skips → not listed (floor); one run PASSed → not listed |
| Skip grouping on the reason's first line | `lib/flight-recorder.mjs` | extend `test/flight-recorder.test.mjs`: 7 multi-line approvals reasons → 1 row |
| Stop hook names the running lane instead of "run the lane" | `receipt-check.mjs` | extend the receipt-check test: with a fresh marker, stderr says "ALREADY RUNNING"; stale marker → the normal instruction |
| Cost quoted as last + typical + worst | `lib/walk.mjs`, console-overview | done (L4 tests) |
| `releaseBuild` after the cheap tier | `verify.mjs` | structural pin: local profile order has `unitTests`, `conformance`, `goldenTrees`, `a11y` before `releaseBuild` |
| Lane narrator (pulse during a step) | `lib/lane-narrator.mjs`, `verify.mjs` | `test/lane-narrator.test.mjs`: pulseLine cadence (pure); process test: spawn against a tmp marker, assert one stderr line within the window; parent kill leaves no child |

**Proof of the slice:** both suites green, every new test present, one commit.

---

## S2 — the console opens without `composeApp/`

The `no composeApp/` refusal in `preview-service.mjs` becomes a **capability**, not a gate.

1. `detectCapabilities(projectDir)` → `{ governance: true, screens: boolean }` where `screens`
   = `composeApp/` exists. `governance` requires only `qa/`.
2. `start()`: without `screens`, do not create the src watcher, the classes watcher, the
   daemon, or the render cycle. Serve the page from governance data alone.
3. `galleryHtml`: sections gated — Drive, Approvals, Evidence, Comments, Retrospective always;
   Screens / Components / Live device only with `screens`. The rail says which capability is
   absent and why (one line, not a banner).
4. `/status` reports `capabilities`. The inject's studio line is unchanged.
5. **Proof:** a fixture with `qa/` and no `composeApp/` starts, serves `/`, `/status` shows
   `screens:false`; a CMP fixture is unchanged; **planted:** removing `qa/` still refuses.
6. **Honest scope:** payment-blueprint's hand-built `qa/` lacks `walk.mjs`/`plan.mjs`, so it
   gets approvals + evidence + comments now; walks and the chain arrive with S7/S8.

---

## S3 — the agent-stage pulse

Between the prompt and the lane, the Drive strip moves only if the agent declares steps.
Corroborate mechanically, the way the lane marker already corroborates the lane.

1. `lib/walk.mjs` `deriveChain`: add `observed.activity = { filesChanged, lastWriteAgoMs }`
   computed from the working tree (`git status --porcelain` count; newest mtime among changed
   files) **since `qa/.request.json`'s timestamp**. Fail-soft; null outside git.
2. Render: chain strip and inject show `observed: 12 files written · last 4s ago` beside the
   declared step; `stalled Nm` when nothing written and no lane/render running for > 10 min.
3. Console: the existing src watcher additionally broadcasts a debounced `governance` event so
   the strip refreshes on real work, not only on declarations.
4. **Proof:** fixture with a request stamp, then writes → activity counts them; writes before the
   stamp → not counted; no git → null and the strip omits the line.

---

## S4 — `ERROR` verdict and per-step deadlines

1. Verdict vocabulary: `PASS | FAIL | SKIP | CACHED | ERROR`. Lane verdict is FAIL if any step
   is FAIL **or ERROR**. `evidence-level.mjs`: ERROR earns no rung. Flight recorder, receipt
   validator, console, statusline: accept and render it distinctly (`⊘`).
2. `shGradle` and every subprocess helper take a `timeoutMs`; expiry → `ERROR — no output for
   N min`. Defaults per step from the journal's p95 × 3, floor 5 min, ceiling 30.
3. androidChecks 0-tests → `ERROR` (S1 keeps it FAIL with the honest message; S4 upgrades it).
4. Retries are explicit and recorded on the receipt; never automatic.
5. **Proof:** planted hang (a step that sleeps past its deadline) → ERROR at the deadline; planted
   0-test run → ERROR; receipt/rung/console all render it; an old receipt without ERROR still
   validates.

---

## S5 — reopen re-signs only what drifted

1. `lib/approvals.mjs` reopen path: for each artifact in the blast radius, compare the current
   content hash to the signed hash; unchanged → leave signed, record `reopenSkipped: unchanged`.
2. Studio and CLI say "12 in scope, 1 drifted, 11 unchanged and still signed."
3. **Proof:** fixture with 12 artifacts, one edited → exactly one reopened; **planted:** an edit
   that changes bytes but not the projection is still reopened (bytes are the contract).

---

## S6 — `nightly` stage, and the receipt names its stage

1. Profiles gain `nightly`: `ci` + `determinism` + the **no-cache audit** (a full run with every
   cache disabled whose verdict must equal the last composed receipt's — a disagreement is a P1
   harness defect and is printed as such).
2. Receipt gains `stage`. `receipt-check` accepts `local`/`ci`/`release` as done-evidence for
   a change; `nightly` never satisfies the Stop hook (it proves the harness, not the change).
3. Docs: USAGE, CONTRACT, template CLAUDE.md state the stage model in one table.
4. **Proof:** `--profile nightly` runs the audit; a planted cache mismatch prints the defect;
   a nightly receipt is refused by the hook.

---

## S7 — sync path

1. `scripts/sync-harness.mjs` already vendors package → template. Add `harness upgrade`: copy the
   machine-owned region into an adopting repo, honouring `harness.lock.json`.
2. showcase: run it; re-run the lane; confirm S1's messages appear.
3. payment-blueprint: its lane is hand-built — upgrade lands `lib/` only (spec-coverage,
   flight-recorder, walk, plan, receipt-check) and leaves `verify.mjs` alone until S8.
4. **Proof:** both repos' `qa/lib` byte-match the package; their suites green.

---

## S8 / S9 — later

S8 (spine / step packs / surfaces) and S9 (per-step input hashes) are specified in the
proposal. S9 is **conditional**: built only if the change-stage lane is still too slow after
S6. Neither starts until S1–S7 are landed and proven.

---

## Log

- 2026-09-02 — plan written; S1 in progress in the create-cmp session. S0 awaiting Karel's yes
  in the blueprint session. Console self-renewal already landed (`52e9d1c`); the golden
  serializer change was reverted pending a real run + migration (tracked in
  DOGFOODING-FINDINGS).
- 2026-09-02 — **S1 landed.** Every line of the batch now has a test, gate-shaped lines have a
  planted failure: `test/spec-coverage-tier.test.mjs` (the MOTION-13 case goes red),
  `test/step-outcomes.test.mjs` (the 0-of-0 collision says "did not execute"),
  `test/lane-narrator.test.mjs` (cadence + a real process writing one stderr line),
  flight-recorder (first-line grouping; `neverRunTiers` — 37 skips named, 2 not, fast ignored),
  harness-surfaces (the Stop hook says WAIT at a running lane, "run the lane" at a stale
  marker), verify-flags (cheap tier before `releaseBuild`). Two extractions made the untestable
  testable: `lib/step-outcomes.mjs` (`androidChecksOutcome`) and `neverRunTiers` in
  `lib/flight-recorder.mjs`. S2 next.
- 2026-09-02 — **S2 landed.** `detectCapabilities(projectDir)` → `{governance, screens}`;
  `start()` refuses only when BOTH are absent; without composeApp/ the src watcher, classes
  watcher, render cycle and daemon are never started, Screens and Live device are absent from
  the rail and the page, one rail line says "governance only · no Compose app", `/status`
  carries `capabilities`. The governance watch's `mkdir` is gated on `screens` so the console
  can never manufacture a composeApp/ inside a backend repo. **Proven live:** started against
  the real `/Users/test/dev/payment-blueprint` — `{"governance":true,"screens":false}`, eleven
  sections served, no composeApp/ created. Tests: `inspector/mcp/test/console-capabilities.test.mjs`
  (governance-only, CMP unchanged, planted refusal on neither). **Blueprint session: the
  console now opens there** — `node <create-cmp>/inspector/mcp/bin/console.mjs
  /Users/test/dev/payment-blueprint`. Walks and the chain need its hand-built lane to carry
  `walk.mjs`/`plan.mjs` (S7).
- 2026-09-02 — **S3 landed.** `observeActivity(root, request.at)` in `lib/plan.mjs` counts files
  written under composeApp/src, specs, qa, docs since the current request (machinery files —
  .plan.json, .request.json, the journals, evidence — excluded so the pulse cannot corroborate
  itself; no git dependency). `deriveChain` carries `activity`; `describeBusy` folds it into the
  one observed phrase every surface speaks — a running lane still wins; with nothing running it
  is "N files written since the request · last 4s ago", or "stalled — nothing written for 12
  min" past ACTIVITY_STALL_MS. `renderChain` now prints the observed tier even with NO declared
  plan — the undeclared chain was the still photo, and that is the case fixed. The console's src
  watcher broadcasts a debounced governance refresh so the Drive strip moves on what the agent
  DID. Tests in walk-status: since/before/machinery/no-request, stall, lane-wins.
- 2026-09-02 — **S4 in progress.** Four verdicts: PASS / FAIL / SKIP / ERROR (`lib/step-outcomes.mjs`).
  ERROR = could not run — a deadline, zero tests executed, a throw. Never an accusation, never
  evidence (evidence-level: no rung; receipt plausibility: not "executed"; neverRunTiers: not
  a run; step-cache: never reused), visibly distinct (⊘), and it still FAILs the lane. Every
  subprocess inherits a per-step deadline from the journal's own measured duration
  (`stepDeadlineMs`: ×3, floor 5 min, ceiling 30, unknown → 30); a deadline throws
  `StepTimeout`, the step loop catches ANY throw into one ERROR row and keeps going (a throw
  used to crash the whole lane). androidChecks' did-not-execute is now ERROR. Planted: a real
  `sleep 5` under a 150ms deadline classifies as timeout; a `TypeError` inside a step becomes
  a row. Remaining: the console's step glyph, the bundle, both suites.
- 2026-09-02 — **S4 landed** (`9dea4de`). **S5 in progress — and its shape changed on reading
  the decision of record.** The finding said "compare hashes and reopen only what drifted"; but
  an `approved` artifact is, by construction, one whose bytes still match its signature — so
  every reopen of a touched artifact was a reopen of an unchanged one, twelve for twelve. Not
  an accident: `reopenFeature` walked back every declared `touches` entry. CHANGE-FLOW-DESIGN
  §touches says the opposite — "hashes enforce, declaration lets the console tell as-planned
  from undeclared blast" — and `feature-brief.mjs:99` repeats it. So the fix aligns the verb
  with the decided flow: a feature reopen walks back the brief, its declared spec(s), and its
  design when `screens: true` (the documents the change AMENDS); declared `touches` stay
  signed and are reported as `stillSigned`, with the hash demanding a fresh signature only if
  the change actually moves them. No new decision was taken.
- 2026-09-02 — **S5 landed.** `reopenFeature` walks back the brief, its declared spec(s), and
  its design when `screens: true`; declared `touches` stay signed and come back as
  `stillSigned` (id, state, signed hash). CLI prints "N in scope · M reopened · K still signed"
  and, per touch, "re-signature demanded only if it changes; the hash enforces that". Planted:
  a real byte edit to a touched component flips it to `changed-since-approval` with no reopen
  verb anywhere. Twelve-for-zero becomes two-for-two. Tests in governance-journal.

- 2026-09-02 — **S6 in progress, scope stated honestly.** `--profile nightly` = ci with the
  determinism probe forced on; the receipt carries `stage` (scaffold / change / merge / nightly
  / release) and the Stop hook refuses a nightly receipt as done-evidence exactly as it refuses
  `--fast`. The "no-cache audit that must agree with the composed receipt" is NOT built here:
  it is P1's mitigation, and without per-step hashes there is no composed receipt to audit
  against. It lands with P1 if P1 lands. In create-cmp's own lane the suite-scaled step is the
  determinism probe; in payment-blueprint it is mutation — S0 is the same decision there.
- 2026-09-02 — **S7 handed off, with the exact state.** Both target repos have live sessions;
  nothing was written into either tree from here.

  **create-cmp-showcase** — a real stamped app (`@create-cmp/harness 0.16.0`). Its path is the
  engine's own three-way upgrade. Dry-run from create-cmp:

  ```bash
  node bin/create-cmp.mjs upgrade --harness --target-dir /Users/test/dev/create-cmp-showcase --dry-run
  ```

  Result: **7 lane files refresh cleanly** (machine-owned, untouched since install —
  `qa/verify.mjs`, `qa/approve.mjs`, `lib/evidence-level`, `lib/flight-recorder`,
  `lib/receipt-validate`, `lib/spec-coverage`, `lib/step-cache`); **2 added**
  (`lib/lane-narrator.mjs`, `lib/step-outcomes.mjs`); `specs/README.md` applied; `.gitignore`
  and `CLAUDE.md` conflict (new content lands beside as `*.cmp-new`, never clobbered).
  **5 are LOCAL FORKS and are NOT re-applied**: `qa/receipt-check.mjs`, `lib/approvals.mjs`,
  `lib/inputs-hash.mjs`, `lib/plan.mjs`, `lib/walk.mjs` — the engine's new content goes to
  `qa/harness-local.patch`. **Consequence, stated plainly:** the Stop-hook in-flight guard
  (S1), the activity pulse (S3), the cost distribution (S1) and the reopen fix (S5) do NOT
  reach the showcase until its session reconciles that patch. What DOES land on `--yes`: the
  ERROR verdict + deadlines (S4), `[tier: device]` (S1), never-run tiers (S1), the narrator
  (S1), step order (S1), skip grouping (S1), the nightly stage (S6).
  **Showcase session:** run the dry-run, read it, then `--yes` at a moment with no lane in
  flight; then reconcile `qa/harness-local.patch` for the five forks. Commit the receipt after
  the next full lane.

  **payment-blueprint** — NOT a stamped app. Its `qa/harness.lock.json` is its own schema
  (`pb-harness/1`); its `qa/verify.mjs` is hand-written; every `qa/lib` file is a deep fork
  (`approvals.mjs` +231/−1353 lines vs the package; `spec-coverage.mjs` +325/−128;
  `inputs-hash.mjs` +107/−171). There is nothing to refresh — it is a re-implementation, and
  a copy would destroy its work. It receives S1–S6 only through **S8** (the spine as a
  dependency), or by hand-porting the two self-contained behaviours it needs today: the
  in-flight guard in its own `receipt-check.mjs`, and the ERROR/deadline pattern
  (`step-outcomes.mjs` is dependency-free and can be dropped in as-is). The console already
  opens there (S2).
- 2026-09-03 — Karel: YES to S0 (relayed to the blueprint session with the proof-of-done), YES to
  S8 and S9. **Then merge and publish.** S8 shape: (a) `lib/lane-runner.mjs` — the step loop
  (marker, deadline, narrator, catch → ERROR, verdict) as a function any repo's verify.mjs can
  call, proven with fake steps; (b) `lib/steps-cmp.mjs` — the CMP steps behind
  `createCmpSteps(ctx)`, verify.mjs becomes composition; (c) docs for adopting the spine in a
  non-CMP repo with the blueprint as the worked example. S9's trigger cannot be measured here
  (no Gradle app in this repo); it is read off the showcase's flight journal after its
  `upgrade --harness` lands.

- 2026-09-03 — **S8a written.** `lib/lane-runner.mjs`: `runLane(ctx)` — marker narration,
  per-step deadline via a `setDeadline` hook, the pulse, throw/timeout → one ERROR row, the
  mark, `laneVerdict`, `onFinally` — pure of project knowledge (no ROOT, no Gradle, no argv);
  `expectedDurations`, `stepDisplayName`, `verdictMark` exported for step packs. `verify.mjs`
  now composes it. Proven with fake steps against a real marker file
  (`test/lane-runner.test.mjs`); the S4 structural pins moved with the code.
- 2026-09-03 — **S8b written.** `lib/steps-cmp.mjs` (1,261 lines) — every CMP step, the device
  lease, the fast-exclusion tables and the profile compositions behind `createCmpSteps(ctx)`;
  the bodies moved verbatim by string anchor, not by hand. `verify.mjs` 1,835 → 641 lines: the
  spine — args, `sh()` with its deadline, markers, the runner, the receipt, the journal — and
  one composition line whose ctx makes the borrowing visible. Pins moved with the code; a new
  pack test proves construction executes nothing (every borrowed helper is a trap) and hands
  back the profiles by name in order.
- 2026-09-03 — **S8b proven.** Two latent defects surfaced the moment step names were asserted at
  runtime instead of in source: the memoized wrappers and `gradleTestStep`'s returned functions
  had NO inferred name, so the lane marker narrated specCoverage / approvals / componentStories
  / reachability / archDoc / conformance / goldenTrees / a11y as `null` and gave them the
  30-minute default deadline. Both now carry explicit names. Structural tests that grep "the
  lane's source" read both files (`laneSrc`), and `scripts/ground-truth.mjs` derives the
  profile counts from the pack.
- 2026-09-03 — **S8c: adoption documented** in `packages/harness/README.md` — spine vs pack, the
  three-step swap, and payment-blueprint as the worked example. **S8 landed.** S9 stays
  conditional: its trigger is the change-stage lane's cost in the showcase's flight journal
  after its `upgrade --harness`; no Gradle app exists in this repo to measure it here.
- 2026-09-03 — **Merged, published, released.** PR #23 (S1–S8 + console self-renewal) and PR #24
  (0.19.0 bump, plugin manifests, changelog) rebase-merged to main. **`create-cmp-cli@0.19.0` is
  live** (`dist-tags.latest = 0.19.0`), tag `v0.19.0` pushed, GitHub release cut from the
  changelog section. Verified against the REGISTRY, not the local tree: the published tarball
  carries `template/qa/lib/{lane-runner,steps-cmp,step-outcomes,lane-narrator}.mjs`, both new
  modules import cleanly and export what the spine expects, the published `verify.mjs` composes
  `createCmpSteps`, and `npx create-cmp-cli@0.19.0 --help` runs from a clean cache. Release gate
  before publish: root 1231 / inspector 579 / receipts 17 green, and a fleet check that stamped a
  scratch app and ran its full lane to PASS at L1 on the split spine+pack. (The first token paste
  returned E401 — a 43-character value where a granular token is 40; `npm login` resolved it.)
- 2026-09-03 — **Peer finding on S8, verified and partly fixed.** The blueprint session flagged
  four things its `qa/` has that the 0.19.0 spine does not. All four confirmed in this tree.
  **#4 was a defect in what I shipped, and it was mine**: `VERIFIED_SURFACE` was hardcoded inside
  `packages/receipts/src/inputs-hash.mjs` — the spine — so a repo whose code lives outside
  `composeApp/` that followed my own S8c adoption doc had its verified surface silently shrink.
  Reproduced in our own tree: the published 0.19.0 spine, run on `myapp/` (nested, not a git
  root), returns `e3b0c44298fc1c14…` — the sha256 of the empty string — a confident 64-hex digest
  attesting **0 files**, with no error and no failed step.
  **Fixed:** the surface is per-project via `qa/verified-surface.json` (one file both
  `verify.mjs` and `receipt-check.mjs` read, so they can never disagree), the CMP list stays the
  default, a malformed or empty declaration is refused rather than silently defaulted, a surface
  matching zero files throws instead of hashing nothing, and the Stop hook turns that throw into
  a refusal with its reason rather than a stack trace. **Back-compat proven**: create-cmp-showcase
  hashes 485 files to `6e1b0a095c23667a` before and after — byte-identical, no receipt
  invalidated. S8c's adoption doc now tells adopters to declare the surface.
  **#1–#3 are NOT fixed and need Karel's call** — each is a real gap AND a breaking change to
  existing gates: approver identity (`approvedBy`, absent everywhere — an agent's approval is
  indistinguishable from a human's), citation binding (`scanCitations` counts a SPEC tag on any
  line, so one comment turns a red coverage gate green — this also weakens S1's `[tier: device]`,
  since a device-tier citation can be a bare comment), and the unvouched-lane guard (the receipt
  validator never checks that `harnessIntegrity` PASSed).
- 2026-09-03 — **Governing principles landed** (`docs/PRINCIPLES.md`, seven rules, each with its
  episode, requirements and enforcement; `docs/GATE-RULES.md` as the deep-dive behind 2 and 3,
  now three rules with Rule 0 — prove the framework returns before pointing work at it — ahead
  of calibration). Placed where sessions actually load instructions: the one-line form in
  `template/CLAUDE.md` (every scaffolded app), `agents/cmp-orchestrator.md` (the planner), this
  repo's `AGENTS.md`, and the three in-the-moment rules re-told every prompt by the inject.
  Karel's correction recorded: the expensive class is the hang, not the wrong verdict; R0 is the
  smallest end-to-end harness proving fast deterministic pass AND fail before any gate. Next: R0
  built as a script (step 2, approved). Still open: SKIP-vs-PASS for pre-lock apps → 0.20.0.
- 2026-09-03 — **R0 built and proven** (step 2, approved). `--profile smoke` — every pure-Node gate,
  no Gradle — through the real runner/marker/receipt/journal; its receipt names `stage: "smoke"`
  and is refused as done-evidence like `--fast` and `nightly`. `scripts/framework-check.mjs`
  stamps a scratch app (229 ms), asserts PASS (245 ms), plants one spec edit and asserts FAIL BY
  NAME — `specCoverage` naming `HOME-01` (236 ms) — asserts the Stop hook refuses, reverts and
  asserts PASS (237 ms): **947 ms total**, each direction killed and reported as a hang past
  `--bound-ms` (default 10 s). Tested by running it, plus a planted absurd bound that must read
  as a hang. USAGE, template CLAUDE.md, GATE-RULES and ground-truth carry the profile.
- 2026-09-03 — **0.20.0 composed, gated, release-prepped.** Karel: **strict** — a receipt whose
  `harnessIntegrity` row is not PASS is refused; pre-lock apps run `create-cmp upgrade --harness`
  first (it writes the lock). The three peer fixes (signer, citation binding, lane vouching) on
  current main; gate on the composition: root 1260 · inspector 579 + bundle current · receipts 21
  · fleet check PASS L1 · framework check 989 ms. CHANGELOG 0.20.0 carries the four-step
  migration in order. Version + plugin manifests 0.20.0. Publish follows on main.
- 2026-09-03 — **0.20.0 published** (`create-cmp-cli@0.20.0`, `latest`; tag v0.20.0 → e866dea;
  GitHub release from the changelog). Verified against the registry: the tarball carries
  citationIsBound, checkLaneVouching, approvedBy, the smoke profile, the per-project surface and
  the principles block; `npx create-cmp-cli@0.20.0 --help` runs from a clean cache. Both peer
  sessions handed the four-step migration. Local fix/tmp branches deleted (content on main via
  PR #29). Open: S7 execution in the showcase (its upgrade + five forks) and the blueprint's
  spine adoption; S9 conditional on the showcase's measured change-stage cost.
- 2026-09-03 — **Console follows the project's layout** (peer finding from the blueprint's
  spine adoption, c00fa67: the console had the VERIFIED_SURFACE bug one level up — receipt
  path, architecture doc, spec dir and citation roots as Compose constants; Evidence, history,
  audit trail, digest and Architecture blind for an adopter). Landed: `qa/harness-manifest.json`
  resolved per project (`inspector/mcp/src/lib/project-layout.mjs`; default = Compose, malformed
  = refused, never defaulted), every console reader routed through it, the Specs page bridging
  to the project's own `qa/lib/spec-coverage.mjs`, layer-tagged receipt rows stamped by the
  runner from `fn.layer` and grouped on the Evidence page, the Compose pack tagged
  spine/compose/device. Items 3–4 of the peer's proposal (`describe()` on the pack contract;
  per-layer MCP inspectors with Rule-1 planted proofs) are recorded as roadmap in
  docs/proposals/cross-stack-console.md, not built. Verified against a clone of the blueprint.
- 2026-09-03 — **Replanned from scratch and grilled** (Karel: "see if it's needed"). A nine-slice
  cross-stack programme (units, seams, in-toto, OSCAL, OTel, per-layer inspectors) was drafted
  and rejected on the repo's own rules: VISION §6 forbids a cross-stack port without countable
  demand (none: no open issues, the only adopter is Karel's own repo); three of its slices
  restated S9, Rule 1 and Rule 0; the standards carried no repo file:line showing the gap.
  What survived: four spine defects the blueprint adoption found, each derived and closed
  (journal widening `--fast`; smoke rewriting the badge; the Compose ladder in the spine; the
  allowlist's silence about new top-level dirs), and a seam paragraph in
  docs/proposals/cross-stack-console.md as the record of the one new kind of proof. Shipped
  as 0.21.0 with PR #31's console work. Everything else waits for the pinned-issue trigger.
- 2026-09-03 — **0.21.0 proven at L2 after publish** (Karel: "did you run the e2e maestro tests?
  they can be run headlessly"). The release had been gated at L1 with the device tier SKIPped —
  a visible gap reported as proof, which is the wrong order. Re-run on a headless
  Medium_Phone_API_35 (boot 36 s): fleet check `--min-level L2` PASS, rung L2 device; e2eSmoke
  109 s (installDebug + Maestro), androidChecks 64 s (connectedDebugAndroidTest), lane 218 s.
  releaseBuild is assembleRelease compile-only — nothing from it is installed; the device steps
  run the DEBUG build. Rule from here: a publish is gated at L2; the emulator costs minutes.
