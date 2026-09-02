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
| S0 | Mutation out of the per-change lane | C1 | payment-blueprint | blueprint | **AWAITING KAREL'S YES** — the other session has the five-line change ready |
| S1 | Prove the uncommitted P2/P3 batch | C2 C3 C4 | create-cmp | this | **landed** (see Log) |
| S2 | Console opens without `composeApp/` | C6 | create-cmp | this | **landed** — proven live on payment-blueprint |
| S3 | Agent-stage pulse (observed activity between prompt and lane) | C4 | create-cmp | this | **landed** |
| S4 | `ERROR` verdict + per-step deadlines | C3 C4 | create-cmp | this | in progress |
| S5 | Reopen diffs, re-signs only what drifted | C5 | create-cmp | this | queued |
| S6 | `nightly` stage + receipt names its stage | C1 | create-cmp | this | queued |
| S7 | Sync path: showcase + blueprint receive S1–S6 | C6 | all three | this, then each | queued |
| S8 | Spine / step-pack / surface split | C6 | create-cmp | later | not started |
| S9 | Per-step input hashes (P1) | C1 C5 | create-cmp | later, **conditional** | not started |

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
