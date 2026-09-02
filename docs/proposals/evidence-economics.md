# Evidence economics — making proof cost what the change costs

**Status:** proposal, unapproved. **Date:** 2026-09-02.
**Evidence:** the create-cmp-showcase analysis (13 findings, "Instrument Check"), the
payment-blueprint mutation investigation (2026-09-02, ~20 min lanes), and three working
sessions' logs.

This is not thirteen bugs. It is **six structural mistakes**, each of which generated several
of the symptoms, plus one packaging mistake that prevents any fix from reaching the repos
that need it.

---

## The six causes

### C1 — Proof is all-or-nothing and whole-tree, so every change costs the slowest step

One receipt binds a hash of the **entire tree** to one verdict from one **full** run. Nothing
is proven per-step; nothing is proven per-input. Therefore:

- any edit invalidates every step's verdict, including steps the edit cannot affect;
- the cost of *any* change equals the cost of the *slowest* step;
- signing an approval writes into the hashed tree, so it invalidates the receipt that
  permitted the signing — prove, approve, prove again;
- expensive checks get placed in the per-change lane because there is only one lane;
- `--fast` exists but is refused as done-evidence, so the cheap path is a dead end by design.

Measured: payment-blueprint's lane is ~20 minutes because PIT mutation testing sits in the
per-commit profile — 180 mutants on `core-domain` (~7 min) plus 343 on `shared` (~13 min).
A doc-link fix costs 20 minutes. So does signing an approval.

Pulling mutation out is correct and should happen today. It is not the fix: the next
expensive step (release build, instrumented tier, k6, chaos) recreates the same condition.

### C2 — Absence of evidence is recorded but never accounted, so it reads as evidence

SKIP is deliberately non-fatal — a missing device must not red-bar a developer. Right call.
But nothing ever counts the accumulated absence, so "ran and passed" and "has never run
here" are indistinguishable inside a green lane.

Measured: maestro was never installed on one machine, so `e2eSmoke` skipped **every one of 37
recorded runs** while the lane reported PASS each time. The end-to-end flow had never
executed. `tokenDrift` skipped 13× for no device and 13× for an unreachable `:9500`. The
device tier's highest recorded rung is L2.

The instrument for this already exists and was deliberately left descriptive:
`clauseTierCoverage` computes `desktopOnly` and `verify.mjs` puts it on the receipt as
`details.tierNote`, under a comment reading *"Tier visibility, not a gate (industry rule:
instrument before you police)."* The first move was right. The second was never made.

### C3 — Steps report on the thing they check, without distinguishing "it failed" from "I could not run"

The verdict vocabulary is PASS / FAIL / SKIP. There is no ERROR. So a step that exits
non-zero because its *infrastructure* broke reports a *behaviour* failure.

Measured: a concurrent `adb` session collided with `androidChecks`. Gradle exited non-zero
having executed **zero tests**. The step reported *"an on-device behavior claim is broken.
Fix the behavior, not the test."* The identical task passed 8 tests moments later. Believed,
that message sends you hunting a defect that does not exist. Disbelieved once, it teaches you
to discount every future red from that step.

The same shape at the coverage gate: a citation *exists*, so the clause is "covered" — with no
way to ask whether the citing test could ever observe the promise. A clause claiming
behaviour "once per process start" was cited by a desktop Compose test, a tier with no process
lifecycle at all. The gate was green and the defect reached a user.

### C4 — The lane is a black box while it runs, and no step has a deadline

Steps are **synchronous** (`execSync`/`spawnSync`), so no timer inside the lane process can
fire while one runs: the lane can only print when a step *finishes*. Observed: fourteen
minutes without a byte during a release build; the only way to distinguish grinding from
wedged was checking the Gradle daemon's CPU by hand. Separately, `androidChecks` hung at 0.5%
CPU waiting on a device with no timeout at all.

And the one cost figure the surfaces quote is the **last** run's, which is dominated by
Gradle's cache state — a no-op run advertising 25s against a 140s median and a 558s worst.

### C5 — Approvals share the code proof's binding, so signing is expensive and re-signing is meaningless

Approval state lives in the hashed tree. Signing invalidates the proof; a feature-wide reopen
re-opens everything in the brief's declared blast radius rather than what actually drifted.

Measured: amending one clause reopened **12 governed artifacts**; every one came back
byte-identical (`design-system d8fbdce8 → d8fbdce8`). Twelve signatures for zero changes,
which trains the signer to approve without reading — the exact habit approvals exist to
prevent.

### C6 — The governance layer travels between repos; the visibility layer does not; neither is versioned

The console hard-refuses any project without `composeApp/`. But Drive, walks, approvals,
evidence, comments, the chain and the retrospective derive from `qa/` alone — only Screens,
preview, live-device and tokenDrift need a Compose app.

Measured: payment-blueprint runs a fifteen-phase programme under the full governance stack
(receipt, Stop hook, approvals, spec coverage) with **no studio at all**, because it has no
`composeApp/`. And because the spine was worth having, it was **hand-rebuilt there — 2,769
lines** with its own steps (`compositeBuild`, `gitleaks`, `linkCheck`, `mutation`,
`legacyPlatform`). That fork receives no fix ever made upstream.

---

## The plan

Ordered by relief per unit of risk. Each phase is independently shippable and independently
provable; none of them requires the next.

### P0 — Today, five lines: move mutation out of the per-change lane

`mutation` becomes `node qa/mutation.mjs` (on demand) plus a scheduled CI job that fails on a
regression against the existing ratchet. Thresholds and receipt fields unchanged — the gate
still exists, it runs where a 20-minute job belongs. Local full lane: ~20 min → ~90s.

This is right independent of everything below, and it is *not* a fix for C1 — it is the
correct placement of one step. **P1 is what stops the next expensive step recreating it.**

### P1 — Per-step input hashes: proof costs what the change costs

Each step declares its **input surface** (globs) and carries its own hash in the receipt. The
receipt becomes a composition: per step, `{verdict, inputsHash, ranAt, treeSha}`. Doneness at
a stage = every required step has a valid verdict **against its own current inputs**.

Consequences: signing an approval re-runs the approvals gate (~1s) and nothing else. A doc fix
re-runs the link check. The whole-tree hash stops being the unit of invalidation. `--fast`
stops being a dead end, because a cheap step's verdict is *real evidence* for that step.

This is Bazel / Nx / Turborepo's model applied to a verification lane, and it is the single
highest-leverage change here. It also dissolves C5's circularity without any special-casing.

**The danger, stated plainly.** An under-declared input surface is a step that does not re-run
when it should — a false green, and the classic Bazel missing-dependency bug. Three mitigations,
all mandatory, none optional:

1. **Conservative by default.** A step with no declared surface hashes the whole tree, exactly
   as today. Narrowing is a deliberate, reviewed act per step.
2. **A cache-poisoning detector.** A scheduled no-cache full run must agree with the composed
   receipt. Disagreement is a P1 harness defect, not a flake.
3. **The receipt states its own composition** — which steps were reused, from when, against
   what hash. A composed green must never be readable as a single-execution green.

### P2 — Four verdicts: PASS / FAIL / SKIP / ERROR, and a deadline on every step

`ERROR` means *the step could not execute*: zero tests ran, a tool vanished mid-run, the
device was contended, the deadline passed. An ERROR never accuses the change, never counts as
evidence, is visibly distinct from FAIL, and is never silently retried into a PASS (retries
are explicit and recorded).

Every step gets a timeout. A wedged step becomes `ERROR — no output for N minutes`, not a
fourteen-minute silence. This is standard practice everywhere (JUnit error vs failure, Bazel
`FAILED_TO_BUILD` vs `FAILED`, pytest error vs fail) and its absence is C3's whole cause.

### P3 — Absence becomes accounted: instrument, then police

- **Skip streaks** from the journal: `e2eSmoke — skipped in all 37 recorded full runs`, printed
  by the lane, not buried in a receipt field.
- **Required tiers per stage.** A tier a stage *requires* that SKIPs is an ERROR at that stage.
- **Clauses declare the tier that can observe them** — `[tier: device]` — and `specCoverage`
  FAILs when no citing test comes from a tier that could see it.
- **The evidence ladder becomes prescriptive**: a feature whose clauses require device evidence
  cannot be marked done at L1. Today the rung is a report; it should be a requirement.

### P4 — Stage the pipeline, so "done" means something different at each gate

| Stage | Budget | Carries |
|---|---|---|
| inner (on save) | seconds | unit, conformance, goldens — cached |
| change (per commit) | ~90s | + approvals, coverage, arch, schema, build |
| merge (PR) | minutes | + release build, instrumented, e2e |
| nightly | long | mutation, load, determinism, chaos, the no-cache audit |
| release | longest | everything + release smoke |

Falls out of P1 almost for free, and generalises P0 so the placement decision is made once
rather than per expensive step. The receipt names the stage it attests, so an L-rung can never
be read as more than it is.

### P5 — Split the packaging: spine, steps, surfaces

- `@create-cmp/lane` — the spine: step protocol, staged profiles, per-step hashing, receipts,
  approvals, spec coverage, walk/chain, flight recorder, Stop hook. **Framework-free.**
- `steps-cmp`, `steps-jvm-backend`, … — step packs. payment-blueprint's 2,769 hand-written
  lines become a pack plus a dependency.
- **The console is capability-gated, not app-gated.** `qa/` alone yields Drive, walks,
  approvals, evidence, comments, the chain, the retrospective. A Compose app *additionally*
  yields Screens, preview, live device, token drift. A backend repo gets its window today.
- A lockfile and `harness upgrade`, so an adopting repo stops being a fork.

### P6 — Approvals decoupled and diffed

Reopen compares artifact hashes and reopens **only what drifted**. With P1, the approvals
gate's input surface is `qa/approvals.json` alone, so signing costs a second.

---

## Grounding — the practice each phase borrows, by name

None of this is invented here. Each phase is an established practice applied to a
verification lane; the table names the source so the borrowing is checkable.

| Phase | Practice | Where it comes from |
|---|---|---|
| P1 | Content-addressed, per-target invalidation: work is keyed by the digest of *its own* inputs, never the whole repo | Bazel action cache; Gradle build cache; Nx / Turborepo task hashing; Pants |
| P1 (mitigation 2) | A periodic uncached run that must agree with the cached result — cache-poisoning detection | Bazel `--nocache_test_results` audits; Gradle's cache-miss verification builds |
| P2 | Distinguish "the check failed" from "the check could not run": error ≠ failure, and timeouts are a distinct outcome | JUnit error vs failure; pytest `error` vs `failed`; Bazel `FAILED_TO_BUILD` / `TIMEOUT` / `NO_STATUS` vs `FAILED` |
| P2 | A deadline on every step | GitHub Actions `timeout-minutes`; Bazel `--test_timeout`; Gradle `Test.timeout` |
| P3 | Required checks cannot be satisfied by not running; skipped-required is a failure | GitHub branch protection required status checks; GitLab `allow_failure: false` |
| P3 | Ratchets: no new gaps, regressions block | diff-cover; Codecov patch coverage; PIT's `mutationThreshold` as a ratchet |
| P3 | Tests declare what they can observe, and a claim is only covered by a test of adequate size | Google small / medium / large test sizes (each size declares its resource access); the test pyramid |
| P4 | Staged pipelines with different evidence per stage: commit → acceptance → capacity → release | Humble & Farley, *Continuous Delivery* (commit stage / acceptance stage); Google TAP presubmit vs postsubmit |
| P4 / P0 | Mutation testing is incremental and off the hot path — mutate the diff, surface at review, full runs nightly | Google's mutation testing at scale (Petrović & Ivanković, ICSE-SEIP 2018): diff-scoped mutants surfaced in code review, never full-suite per commit; PIT's own guidance to run incrementally |
| P5 | A framework-free core with a stable plugin protocol, consumed as a versioned dependency with a lockfile and a migrate command | ESLint / Jest plugin models; Gradle plugins; Nx executors + `nx migrate`; Angular `ng update` |
| P6 | Review state bound to the content hash of the thing reviewed; re-review only what changed | Gerrit patchset review state; git tree hashes; CODEOWNERS approvals surviving unrelated commits |
| C4 fix | Quote a distribution, never a single sample; instrument the pipeline itself | Bazel Build Event Protocol; Gradle build scans; SRE practice of p50/p99 over "last value" |

## Sequencing — revised after a last holistic pass

**P0 → P2 + P3 + the console capability gate + the agent-stage pulse → P4 → P6 → P5 → P1 only
if still needed.**

Two corrections to the first draft of this section, owned here rather than buried:

**P4 before P1, and P1 becomes conditional.** The first draft called per-step input hashes
"the single highest-leverage change." Re-examined: staging alone (P4) removes ~80% of the pain
— a doc fix or an approval costs the change-stage lane (~90s), not the slowest step — at
almost none of P1's trust-model risk. The inner loop is already covered by `qa/watch.mjs`
running the fast tier on save, and `affected-tests.mjs` already scopes it. P1's remaining
value (approval = 1s, `--fast` as real evidence) is real but is the last mile, and it is the
one phase that can make the harness *less* trustworthy if its mitigations slip. So it moves
last, and is built only if 90s is still too slow in practice.

**The agent-stage pulse was missing.** C4 was stated for the lane only. The same blindness
exists for the forty minutes between a prompt and a lane: the Drive strip moves only if the
agent volunteers `qa/plan.mjs --step`, so an undeclared chain is a still photo until the lane
lands. Fix, same shape as the lane's: corroborate mechanically — files written in the working
tree since the current request began, last write N seconds ago — shown beside the declared
step and overriding it exactly as the lane marker already does. No agent cooperation required,
which is the point.

**The console capability gate is a partial win for payment-blueprint until P5.** It gives that
repo approvals, evidence and comments from its existing `qa/`; walks and the chain need
`walk.mjs`/`plan.mjs`, which its hand-rebuilt lane does not carry. That arrives with the spine.

**The exit-144 background-waiter deaths are a symptom, not a defect.** The agent pattern
"arm a waiter that commits when the lane passes" exists only because the lane is 20 minutes.
The waiter dies with the session. Fix C1/C4 and the pattern — and its failure — disappear.

**Delivery rule for this plan, given how the last batch went:** one phase per commit, tests
first, no phase reported as landed without its own proof. The failure mode being corrected
here is capability outrunning proof; the plan must not be executed the same way.
