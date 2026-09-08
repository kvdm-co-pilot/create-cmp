# ADR-0009: A change has a derived proof obligation — and a deferral is evidence, not a skip

- **Status:** proposed
- **Date:** 2026-09-06
- **Related:** GATE-RULES Rule 4 (landed 2026-09-08) is the harness-side half of this idea — WHEN
  a tier is due (`scripts/proof-plan.mjs`, enforced by `scripts/hooks/proof-gate.mjs`). This ADR
  is the adopter-lane half: WHETHER, and what a deferral is allowed to claim.

## Context

The harness proves a TREE. Every full lane re-derives every verdict from scratch, which is why a
receipt can bind a tree hash and mean it. But an agent iterating makes twenty changes and pays for
twenty whole-tree proofs, and on 2026-09-06 that cost was measured in this repo rather than guessed:
eight full suite runs, five device runs, ~390 lines of executable code. Four of the device runs
proved a Compose app still worked after edits to a `.gitignore` parser, a receipt validator and a
markdown file. One took nineteen minutes and failed for an unrelated wedged emulator.

Latency is not a comfort problem. It is the mechanism by which an agent gives up and CLAIMS instead
of deriving, which is G1 and G2 in one. A gate nobody can afford to run is a gate that gets typed
into a commit message instead.

**Every ingredient for a better answer already exists, and nothing composes them.**

- **What each step costs, measured.** `readFlightJournal` → `expectedDurations` gives per-step
  durations from this project's own history (`verify.mjs:392-398`). It is read for exactly one
  purpose: setting deadlines.
- **What feeds each step.** The profile declares `layout.sourceRoots`, `citationRoots`,
  `flows.dir`, `buildDir` — already used for citations, watching and affected-test selection.
- **What each rung requires.** The pack's `evidenceLadder` declares `l0Required`, `l1Required`,
  `deviceExecution`, `release`.
- **A way to record not-running honestly.** SKIP rows carry reasons and appear on the receipt;
  `listSkippedSteps` exists so green-with-gaps is visible rather than silently equated with
  fully-verified.

So the harness knows what is expensive, what a change touches, what a rung demands, and how to say
"I did not run this". It has never been asked to put those four together.

`deriveAffectedFilter` is the one place that reasons about change impact, and it is scoped to
picking unit-test patterns in fast mode. Its principle is the right one and is adopted wholesale
below: **fail open, and always carry the honest reason.**

## Decision

> **A change has a PROOF OBLIGATION, derived from what it touches, what the profile declares feeds
> each step, and what each step has been measured to cost. The lane runs the cheapest set of steps
> that discharges the obligation. Every step it deliberately did not run is recorded on the receipt
> as DEFERRED with the derived reason. The evidence rung reflects only what actually executed.**

Four properties, each load-bearing:

**A deferral is not a skip and not a cache.** SKIP means the step tried and could not, or does not
apply. DEFERRED means: this step was not run, here is the derived reason, and here is what it cost
last time it did. No prior verdict is reused — the step cache stays fast-mode-only and the full
lane still never reads it. Nothing is claimed that was not derived; what changes is that the
receipt says out loud what it declined to derive.

**The rung is only what ran, and this is the whole safeguard.** A lane that defers the device tier
earns L1, not L2 — deferring makes the claim SMALLER, never cheaper. That inverts the incentive
that makes every other "smart skip" dangerous: you cannot buy a rung by not running something. A
release or CI profile discharges every obligation unconditionally and this reasoning does not
apply to it.

**Cheap steps are never reasoned about.** Deciding whether to run a 3ms step costs more than
running it. The threshold is derived from the journal's own distribution, not a constant: today's
lesson is that a constant like `minExecutedMs: 5000` or `ceilingMs: 30 min` is one stack's number
wearing a universal face (§9.1). A project with no journal has no thresholds and runs everything.

**Fail open, everywhere.** No journal, no declared roots, no git, a path matching nothing, a change
under the harness's own directory — every uncertain case runs the step. Being wrong toward running
costs minutes; being wrong toward deferring costs a regression nobody saw.

## Consequences

- **The receipt gains one row kind and no new claim.** DEFERRED joins PASS/FAIL/SKIP/ERROR/CACHED.
  A reader who ignores it sees a lane that ran fewer steps and earned a lower rung — which is true.
- **Every deferral is arguable.** The reason names the paths that did not move and the roots that
  would have mattered, so a reviewer can say "that is wrong, this change does touch the UI" and be
  right. A skip nobody can argue with is the failure mode; this is the opposite.
- **`fleet-check` and the release gate are untouched.** They demand a rung, and a deferring lane
  earns less. The gate does not need to know this exists.
- **Adopters get the mechanism, not a policy.** The "feeds" relation is the profile's declaration,
  already written for other reasons. A profile that declares nothing defers nothing.

## What would make this wrong

**An incomplete "feeds" relation.** If a path can affect the device tier without being under any
declared root — a Gradle version catalog, a manifest, a resource file, a CI workflow — a change
there would be deferred and a regression could ship. That is the real risk and it is not
theoretical: `layout.sourceRoots` for `cmp` is `["composeApp/src"]`, which excludes
`build.gradle.kts` and `gradle/libs.versions.toml`, both of which absolutely change what the device
runs. **So the relation must be the profile's to declare explicitly for this purpose, and its
default must be "everything not proven irrelevant" rather than "everything not listed".** Getting
that inversion backwards turns this ADR into the thing it is trying to prevent.

**A rung that quietly inflates.** If any future code lets a deferred step count toward a rung, the
whole safeguard is gone and this becomes a way to buy L2 without a device. That is the invariant to
plant a gate against before any of this ships.

## Related

- `docs/NORTH-STAR.md` G1 (done is derived), G2 (agents move fast and never get stuck), §8 (the
  presumption against new mechanism), §9.1 (constants that are one stack's).
- `packages/harness/src/lib/affected-tests.mjs` — `deriveAffectedFilter`'s fail-open-with-a-reason
  shape, adopted here; `deriveTierNeed` (2026-09-06) is the first primitive of this decision and is
  deliberately only a primitive.
- `docs/adr/0005-evidence-binding-by-inputs-hash.md` — what a receipt binds.
- `packages/harness/src/lib/step-cache.mjs` — the caching/integrity tension this does NOT resolve
  by caching.
