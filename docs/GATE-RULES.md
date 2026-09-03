# Three rules for building gates

> Proposed by Karel, 2026-09-03, out of the payment-blueprint adoption. Each comes
> from episodes that cost hours and is written with the episode that produced it,
> because a rule whose evidence is missing gets deleted by the next person who
> finds it inconvenient. This is the deep-dive behind principles 2 and 3 in
> `docs/PRINCIPLES.md`; the one-line form lives there and in every `CLAUDE.md`.

The harness already says *"a gate you haven't seen fail is a gate you don't
trust"* (`agents/cmp-orchestrator.md`). That convention was correct, written, and
prevented none of the episodes below. These rules say **when** the check has to
happen, name the failure mode before it, and name the one after it.

---

## Rule 0 — Prove the framework returns before you point work at it

**When there is no mature test framework in place, build the smallest end-to-end
one first and prove it can produce a deterministic PASS and a deterministic
FAIL, fast, with a bound short enough that a hang is obvious. No Gradle, no
device, no network. Only then wire real gates.**

### Why: the thing that burns hours is not a wrong verdict, it is a hang

A wrong verdict costs a re-run. A hang costs an agent hours, and it looks like
work the whole time. Every expensive episode in this harness's history is of
this kind, not the other:

- `androidChecks` sat at **0.5% CPU** waiting on a device with no bound at all —
  not a wrong answer, no answer.
- A release build ran **fourteen minutes without a byte** of output; grinding and
  wedged were indistinguishable without checking the daemon by hand.
- Maestro's driver startup wedged the emulator; a stale adb transport read as
  `device offline` and killed the next driver before its first assertion.
- A scheduled long-running audit died as **exit 143** with no row on any receipt.

Per-step deadlines were added in 0.19.0 *because* of the first of these —
reactively, hours into runs. Rule 0 is that same discovery made in the first
sixty seconds.

### Why this is not Rule 1

Rule 1 asks *is this gate reading anything*. Rule 0 asks *does this machinery
return at all, and how fast does it say no*. You can pass Rule 1 on a framework
that hangs on the next input, because Rule 1 only ever runs the happy planted
case. The template's own `qa/refusal-demo.mjs` is a Rule 1 instrument — it plants
real violations in a real scaffold and asserts the clause id in the output — and
it does not answer Rule 0: it establishes its baseline with a Gradle lane, and its
own guard is a **ten-minute** timeout, which is the hang, bounded, not a fast
deterministic failure.

### What it requires — and the command that does it

One trivially-passing and one trivially-failing case, wired through the *real*
lane machinery (the runner, the marker, the receipt, the hook), asserting both
verdicts and the wall time, bounded in **seconds**.

```bash
node scripts/framework-check.mjs        # bound 10 s per direction; --bound-ms to change
```

It stamps a scratch app, runs `--profile smoke` (every pure-Node gate, no
Gradle) and asserts PASS; then plants, one at a time, every way a test can be
skipped or faked — an orphaned citation, a `SPEC:` tag on a class with no test
under it, a device-only clause cited only from the JVM, a feature whose flow
stops citing its clause, a citation in a nested flow the lane never runs, one
edited byte in the machine-owned region — and asserts each FAILs **naming** the
step and the clause or feature; asserts the Stop hook refuses a FAIL receipt,
the forgery (verdict flipped to PASS over a failed `harnessIntegrity` row), and
a receipt whose device tier was skipped for an environmental reason; reverts
everything and asserts PASS again. A direction that does not
return inside the bound is killed and reported as a hang — the bound is the
assertion. Measured on this tree: 947 ms for all four legs. For a greenfield
repo it is the first thing built, before the first real gate.

---

## Rule 1 — Calibrate a gate before you wire it

**A gate is not wired into the lane until it has been calibrated on a trivial
planted case: plant the violation it exists to catch and watch it FAIL BY NAME,
revert and watch it pass, and record the runtime of that case. A gate that has
only ever passed is an unread instrument. The runtime you measured decides its
stage — change, merge, or nightly.**

Four steps, seconds each.

### Why: a broken gate does not fail, it reports confidently and wrong

Three episodes, all in one adoption, all from gates wired before they were read:

**detekt analysed nothing and said PASS.** detekt 1.23.x matches each rule's
`excludes` globs against a file's **absolute path**. The checkout was
`/Users/test/dev/payment-blueprint` — a literal `test` path segment — so every
rule that excludes test sources silently stopped running. The gate went green for
a full phase. The baselines generated from that machine recorded **127 findings
where the same commit records 228**: 101 findings invisible, dominated by
`MagicNumber` (86) and `TooGenericExceptionCaught` (15). It was found by CI going
red on an identical commit, then proven by copying the tree to a path without a
`test` segment. One planted magic number at adoption would have shown it in
seconds, because the calibration would have failed to fail.

**A suite-scaled step sat in the per-change lane at ~20 minutes.** Its cost scaled
with the size of the test suite times its start-up, not with the size of the change
being checked — and because a receipt binds the whole tree, every unrelated edit
paid it. Signing an approval, which cannot move that step's result, cost a full
20-minute re-run. Wiring it to one small module first and reading the clock would
have tiered it correctly on day one. It cost roughly three hours of waiting before
it was moved out — and days more before it was removed (2026-09-03): two verdicts in
24 runs, the last at 24 m 26 s against a 30-minute cap, and it pinned every core of a
shared machine when it ran.

**A threshold was set 11 points above an unreachable ceiling.** An agent raised a
score threshold from 70 to 95 on a tool whose instrumentation could not see
Kotlin `inline fun` bodies — 12 of 30 in that kernel were `Result`'s inlined
combinators, all genuinely tested — so even a perfect suite capped the score at
83.6%. The agent ground against an arithmetically impossible target with nothing
committed. One measured run at
adoption gives you the ceiling.

**The strongest evidence is that an agent invented this rule under duress.**
Needing to trust a CI-mirror detekt run, it wrote: *"a green mirror run alone
doesn't prove the strict rules were active — I ran a positive control first: I
temporarily rewrote one entry as `KWD(code = "KWD", exponent = 3)` and
`:core-domain:detekt` failed with `MagicNumber`."* That is this rule, executed
reactively about nine hours after the gate was adopted instead of proactively in
the sixty seconds before. It also discovered that the named-argument form is
load-bearing for that rule — knowledge nobody had, which a calibration at
adoption would have documented from day one.

### FAIL BY NAME, not merely fail

detekt's failure mode was that it **ran and passed** while executing none of the
rules it claimed. "The gate went green" and "the gate is working" were
indistinguishable from the outside. Only a failure that names the rule separates
them. A calibration that merely observes a non-zero exit proves the plumbing, not
the gate.

### At adoption, not at review

The existing convention is a review-time practice. Every episode above shows
review-time is hours too late: by then the gate has produced baselines, receipts
and green runs that all have to be redone. Calibration is cheap **only** at the
moment the gate is wired.

### The runtime you measured is not decoration — and it has a home

Record it **beside the step**, not in a commit message. The flight journal
(`qa/flight-recorder.jsonl`) already stores per-step durations, and the lane
already reads them to set each step's deadline and to narrate its expected cost —
so a calibrated runtime recorded there is one the lane can *check against*, and
drift from it becomes detectable instead of remembered.

Let it choose the stage, in the names the receipt carries since 0.19.0:
**change** (per commit, ~90 s budget), **merge** (minutes), **nightly**
(unbounded). A gate whose cost scales with something other
than the size of the change (mutant count, corpus size, fleet size) belongs in a
scheduled job no matter how fast it looks on a toy input — measure it on
something real before deciding.

---

## Rule 2 — The layer you changed cannot certify itself

**A change is proven only by running it in an environment nobody has run it in
yet. A green suite at the layer you edited is evidence about that layer and
nothing else.**

For this repo that means: a library change is not done until the **full suite**
runs; a template or harness change is not done until a **fresh app is stamped**
(`node scripts/fleet-check.mjs`); an environment-sensitive change is not done
until **CI** runs it.

### Why: three instances in two days, all the same shape

| Change | Verified at | Broke in |
|---|---|---|
| PIT thread count raised 4 → 6 | local machine, passing | CI runner — exit 143 (SIGTERM), six forked minions beside a 4 GB daemon |
| Three harness patches | each library's own tests, all green | every consumer — the studio console could no longer approve anything (12+ failures); one patch edited a **vendored** file that `scripts/sync-harness.mjs` overwrites, so the next sync would have silently deleted the export |
| A `// SPEC:` citation-binding rule | root suite, 1244/1244 green | a **fresh scaffold**, red out of the box — the template's own `ARCH-04` tag sat above two helper declarations that consumed the binding window |

Not three lessons. One. Every failure was invisible from the layer the change was
made at, and every one was caught by running somewhere nobody had run yet.

### The trap is that a green suite feels like enough

The third episode is the sharpest: the suite was green at 1244/1244 **and the
scaffold was red**, because the suite never stamps an app. The reviewer who found
it had run the full suite and still missed it the first time. Breadth of testing
at one layer does not substitute for depth across layers — you cannot verify your
way out of an environment you never ran in.

### Why this is separate from Rule 1

Rule 1 catches gates that were never read. Rule 2 catches changes that were read
at the wrong altitude. Calibrating a gate perfectly tells you nothing about
whether its consumers still work; running every consumer tells you nothing about
whether the gate was ever executing. Keep them separate — collapsing them into
"test more" loses both.
