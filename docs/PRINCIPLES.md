# create-cmp — governing principles

> The engineering doctrine under [`NORTH-STAR.md`](./NORTH-STAR.md) — the governing document
> names the goals these principles serve and ranks them; this file keeps the rules, each with
> the episode that produced it and its enforcement. Seven rules, each with the
> episode that produced it, what it requires, and how it is enforced. Written 2026-09-03 from
> two days in which every one of these was violated at least once and each violation cost
> hours. **Read this first in any session touching the harness, the console, or a project's
> `qa/`.** The one-line form is carried into every session by `CLAUDE.md` and re-told every
> prompt by the inject, because a principle that lives only in a document is a principle that
> gets performed.

The essence these serve: **a spec-driven workflow with automated proof, in which agents move
fast and never get stuck.** Every rule below is a resolution of that tension. A rule that only
adds rigour grinds the loop to a halt; a rule that only removes friction lets blind gates
through. Each of these is written to do both.

## Why this is the right place, and the right shape

Three patterns from how agentic systems are actually built, applied:

- **Session-carried instructions live in `CLAUDE.md`, kept short.** Claude Code loads it every
  session; long instructions get skimmed. So the *full* principles live here, on demand, and the
  *one-line* form lives in `CLAUDE.md` (the generated app's, the orchestrator's, this repo's).
- **Re-told, never remembered.** This repo's own drive-mode design: the per-prompt inject
  re-delivers the protocol every turn so it cannot decay over a long session. The four rules that
  govern in-the-moment behaviour ride that inject as one line.
- **Verify with a fresh context.** An agent cannot review its own blind spot; Anthropic's guidance
  and this repo's last two days agree. Where a rule can be a command, it is a command
  (`prove-change`, `refusal-demo`, the lane). Where it needs eyes, they are a second agent's.

The repo already contains two conventions of this kind — *"a gate you haven't seen fail is a
gate you don't trust"* and *"instrument before you police"* — that were correct, written down,
and prevented nothing. That is the failure mode this document is designed against: every rule
names its enforcement, and a rule with no enforcement is marked as such rather than assumed.

---

## 1. Derived, never claimed

**A verdict, a status, a cost, a "done" is computed from the tree and the run — never asserted
by an agent. If you cannot name the command that proves a claim, you do not know it.**

*Episode.* A commit message said the lane's spine "knows nothing about composeApp/". One grep
disproved it; the spine hardcoded a Compose app's verified surface and returned the sha256 of
the empty string for any other repo. A serializer change shipped with a hand-derived baseline
nobody had run. Six capabilities landed with two tests.

*Requires.* Every claim in a brief or commit names its proving command. Doneness is the
receipt, bound by hash, never a sentence. Cost is quoted from the journal, never estimated.

*Enforced by.* The receipt and inputs hash (mechanical). `prove-change` tier 1 greps the claim's
subject (mechanical, planned). The reviewer runs the named commands (a second agent).

## 2. Prove the instrument before you read it

**Before any real work runs against a new framework or gate: the smallest end-to-end version
must produce a deterministic pass and a deterministic failure, fast, with a bound short enough
that a hang is obvious. Then every gate is watched failing BY NAME once, in a real artifact, and
its measured cost picks its tier. A gate that has only ever passed is an unread instrument.**

*Episode.* `specCoverage` returned PASS on a spec file it could not parse — two promises on
disk, zero read. detekt matched a `test` path segment and silently ran none of its rules for a
phase. `androidChecks` sat at 0.5% CPU for hours with no bound. A twenty-minute suite-scaled
step was wired per-change and discovered four hours in.

*Requires.* Two moments, kept apart: **before adoption** (R0) the smallest harness proves it
returns, both ways, in seconds; **at each gate's adoption** (R1) plant the violation in the real
template, watch it fail naming the thing, revert, watch it pass, record the runtime beside the
step. The runtime chooses the stage: change / merge / nightly.

*Enforced by.* `qa/refusal-demo.mjs` (R1, mechanical — plants in a real scaffold, asserts the
clause id in the output). The smallest-harness proof (R0, mechanical, planned as the next step).
Runtimes live in the flight journal, which the lane already reads to set deadlines, so drift is
detectable. Detail and evidence: `docs/GATE-RULES.md`.

## 3. The layer you changed cannot certify itself

**A change is proven only by running it where it will actually run. Green at the layer you
edited is evidence about that layer and nothing else.** Library change → the full suite.
Template or harness change → a fresh app stamped. Environment-sensitive change → the
environment.

*Episode.* Three in two days. A thread-count change passed locally and was SIGTERMed on the CI
runner. Three patches passed their own unit tests and broke every consumer — the studio console
could no longer approve anything. A citation rule passed a 1,244-test suite and reddened a
fresh scaffold, because the suite never stamps one. The reviewer had run the full suite and
still missed it the first time.

*Requires.* Before "done": name what consumes what you changed and run it. Touching `template/`
or `packages/` means stamping a scratch app. The check that catches this class costs 294 ms.

*Enforced by.* `scripts/fleet-check.mjs` at release (mechanical). `prove-change` tiers 1–2 on
every finish (mechanical, planned). Independent review by a fresh agent, not self-review.

## 4. Proof costs what the change costs, and never runs silent

**The price of a change is the price of checking that change — never the price of the slowest
step in the lane. And a running step is never indistinguishable from a hung one.**

*Episode.* A doc-link fix cost twenty minutes because a suite-scaled step sat in the per-change
lane and the receipt bound the whole tree. Signing an approval cost nine. A release build ran
fourteen minutes without a byte of output; the only way to tell grinding from wedged was to
check the daemon's CPU by hand.

*Requires.* Stages: inner loop on save (seconds), change (~90 s), merge (minutes), nightly
(unbounded), release. Suite-scaled proofs go nightly the day they are measured. Every step has a
deadline from its own history and a pulse while it runs. Cost is quoted as last / typical /
worst, never from a cache hit.

*Enforced by.* Profiles and the receipt's `stage`; per-step deadlines; the narrator; the cost
distribution — all mechanical, shipped in 0.19.0.

## 5. Never wait on nothing

**Every wait is bounded and named. A tier that did not run is reported, never counted as green.
An agent that is blocked says what it is blocked on within the bound and stops — it does not arm
a waiter, retry blind, or narrate progress it cannot observe.**

*Episode.* `e2eSmoke` skipped on all 37 recorded runs because Maestro was never installed, and
the lane said PASS every time; the end-to-end flow had never run. Background waiters armed to
survive twenty-minute lanes died with the session as exit 143/144. A step that executed zero
tests reported "your behaviour is broken — fix the behaviour, not the test."

*Requires.* `ERROR` is a verdict: could not run, not accusing anyone, not evidence. Never-run
tiers are named on every lane. A blocked agent's next message names the blocker; it never fills
the wait with activity.

*Enforced by.* The `ERROR` verdict, per-step deadlines, the never-run report, the in-flight
Stop-hook message — mechanical. The "say you are blocked" half is convention, re-told by the
inject.

## 6. A signature binds content; a decision, once made, is closed

**Re-ask only what changed, and prove it changed by hash. Never reopen what did not move. Never
re-litigate a settled decision, tag it as debt, or list it as a finding.**

*Episode.* Amending one clause reopened twelve governed artifacts; every one came back
byte-identical. Twelve signatures for zero changes trains the signer to approve without
reading — the exact habit approvals exist to prevent. Separately, decided designs were
repeatedly resurfaced as "outstanding" until the human said stop.

*Requires.* A reopen walks back only what the change amends; declared blast radius stays signed
and the hash demands a fresh signature only if bytes move. A settled decision is cited, never
re-asked.

*Enforced by.* `reopenFeature` scoping and hash-bound approvals (mechanical). The grill's
"signed briefs are closed" rule (convention).

## 7. One record, read first, updated when state changes

**Across sessions there is exactly one document of record for the work in flight. It is read
before anything else and updated when state changes — not at the end. A finding not in it does
not exist.**

*Episode.* An analysis artifact grew from ten findings to thirteen; a session worked for hours
against the ten. A session-state file went untouched for seven weeks while the product changed
underneath it. Three sessions across three repos held three different pictures of what had
landed.

*Requires.* The plan doc carries status per slice and a dated log; every session touching the
work reads it first and writes to it when a slice lands or a decision changes. Handoffs to other
sessions name the exact commands and the exact state.

*Enforced by.* Convention only, and stated as such. `docs/EVIDENCE-ECONOMICS-PLAN.md` is the
current instance; `docs/SESSION-STATE.md` points at it.

---

## The one-line form

Carried into every session. Do not expand it there; expand it here.

```
Principles (docs/PRINCIPLES.md): derived, never claimed · prove the instrument before you
read it · the layer you changed cannot certify itself · proof costs what the change costs
and never runs silent · never wait on nothing · a signature binds content, a decision is
closed · one record, read first.
```
