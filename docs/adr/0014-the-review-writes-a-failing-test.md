# ADR-0014: A review's output is a failing test; its EXISTENCE is gated, its content never is

- **Status:** accepted — 2026-09-09, Karel van der Merwe (signed by his instruction in session — *"gating its existence, never its content"*, choosing between three options the architect put; the output contract below was decided by the architect under his standing delegation to resolve as product owner and lead architect)
- **Implementation:** landed with this ADR — `.claude/agents/staff-reviewer.md` (the output contract) and a `review` obligation in `scripts/proof-plan.mjs` / `scripts/hooks/proof-gate.mjs` (the existence gate), modelled on the device tier. No new stage, and no gate that judges anything.
- **Date:** 2026-09-09

## Context

The walk has six stages — `decide, design, contract, build, prove, signoff` (`packages/harness/src/lib/walk.mjs:26`) — and an `audit` rung that maps into `design` (`walk.mjs:66`), which attacks the DESIGN while it is still unsigned and cheap to change. That position is a decision of Karel's from 2026-07-27 with measurement behind it: on `meal-plan`, auditing last meant nine gaps found after three signing rounds.

What has no adversarial pass is the **implementation**, between Build and Prove. On 2026-09-09 three subsystems were delegated to agents in parallel and every one of them reported honestly — but the orchestrator's checks landed on the claims the agents chose to flag. Two of three overstated claims were examined only *because the author volunteered them*. A review that depends on the author's honesty is not an independent review, and this project refuses that dependency everywhere else.

The obvious designs were put up and all three fail on this project's own rules:

- **Block on findings.** `PRINCIPLES.md` §2 requires every gate be watched failing BY NAME once in a real artifact, and GATE-RULES §8.8 forbids a new gate without a kept plant. An LLM reviewer catches the planted defect *this* run; its findings vary. Blocking puts an uncalibrated instrument in the refusal path, which is the one thing this product refuses.
- **Advise only.** The review nobody must read is the review that stops happening.
- **Gate that the review EXISTS, never its content.** Checkable — and shallow: an agent writes "looks fine" and the gate is satisfied.

Two of those three fail outright. The third is shallow but not hollow, and the architect's objection to it rested on an unexamined assumption — that a review's output is prose. Remove that assumption and the third option's weakness shrinks to something worth paying for.

## Decision

**A review's output is a failing test.** Not a verdict, not a report, not an approval.

A finding expressible as a test is written as one, named for the defect and watched failing on this tree. A finding that genuinely cannot be a test becomes a **named human decision** — one paragraph, handed up — which is the landing rule `cmp-audit` already applies to subsystem audits, pointed here at our own diff. A review that finds nothing writes nothing, and that is the correct output for most small changes.

The reviewer reads the **diff, not the author's report**, and reads any summary last and only to check whether the author described what they did.

**And a qualifying slice owes a review record, whose EXISTENCE is gated and whose content never is.** This is Karel's call, and it fixes the hole the output contract alone leaves: with output settled but nothing requiring the review to happen, the reviewer is still skippable. The record is another thing a slice owes, discharged exactly as the device tier is — read from a record bound to this tree, never asserted by the caller — and `gh pr merge` refuses while it is owed.

The two halves do different jobs and neither substitutes for the other. **The output contract decides what a review is worth**: a failing test is checkable, so no one has to judge the reviewer. **The existence gate decides that it happened**: a habit nobody must keep is a habit that stops. The gate never reads the findings, because a gate that judged a review's quality would be the uncalibrated instrument in the refusal path that the first half exists to avoid.

The reviewer holds no verb: it cannot approve, pass, block, or sign — `PRINCIPLES.md`'s "the agent produces, and holds no signing verb", applied to review. Its only marks on the world are a tree redder than it found it, and a record that it looked.

It sits at the **exit of Build**, and the walk stays six stages. It runs on delegated work and on changes touching a trigger path or a signed artifact; not on a doc-only slice.

## Consequences

- **No gate judges anything**, so §8.8 is not triggered and no kept plant is owed for judgement. The existence check is the same shape as the device-tier discharge — does a record exist, does its hash describe this tree — and that is mechanical, not an opinion. The calibrated instrument in the refusal path remains the suite.
- **The trilemma dissolves rather than being resolved.** Blocking-vs-advisory is a question about how much to trust a reviewer's judgement. A failing test moves the question out of judgement: it fails or it does not.
- **A ritual cannot satisfy it.** "Looks good" produces no test and changes nothing, which is the honest outcome for a change with nothing wrong.
- **The failure mode is real, accepted, and stated: a lazy reviewer writes "nothing found" and the gate lets it through.** That is exactly the failure mode of a lazy human reviewer. Two things make it better than a ritual rather than merely equal to one: the record is *bound to a tree*, so it cannot be recycled across changes, and review-authored tests can be *counted over time*. A ritual leaves no measurable trace; this does. We are buying the habit, not the judgement, and the ADR says so rather than pretending the gate is deeper than it is.
- **Prose output is deliberately expensive.** A reviewer whose output is mostly named decisions is commenting, not reviewing, and the shape of its report says so.
- **Findings arrive as work, not as opinions.** A failing test is already the first half of the fix, and `cmp-audit`'s failing-test-first rule means the author cannot close it by disagreeing.
- **Running it IS enforced, for qualifying slices only.** A docs-only change owes no review; a change that can alter behaviour does. The trigger set is the lever if that proves wrong in either direction.

## Alternatives considered

- **Block the merge on findings.** Rejected: uncalibrated instrument in the refusal path (§2, §8.8).
- **Advisory report.** Rejected: it stops happening, and this document would be its epitaph.
- **A seventh walk stage, "Review".** Rejected: the walk is six in the program, four documents say six, one design doc's arrow diagram says seven, and adding an eighth spelling to a fact already spelled inconsistently is how drift is manufactured. The reviewer is a role invoked at Build's exit, not a stage.
- **Extend the existing `audit` rung.** Rejected: `audit` attacks the design pre-signature and its position is load-bearing and measured. Making one word mean both "attack the design before signing" and "attack the code after building" costs the clarity that decision bought.

## What would make this wrong

- If most findings turn out to be unexpressible as tests, the prose path becomes the main path and this ADR has built an advisory review with extra steps.
- If reviewers write tests that pass — asserting what the suite already asserts — the suite grows without the tree getting safer, and the count of review-authored tests becomes a vanity metric rather than a measure.
- If the reviewer is slow enough to be skipped. A review that costs more than the fix it finds is not run, and an unrun reviewer finds nothing.

## Related

- `PRINCIPLES.md` §2 — prove the instrument before you read it; the calibration rule that rules out a blocking LLM reviewer
- `docs/GATE-RULES.md` §8.8 — no new gate without a kept plant
- `docs/CHANGE-FLOW-DESIGN.md` — the walk, and why `audit` sits inside Design
- `skills/cmp-audit` — the failing-test-first-or-a-named-decision landing rule this ADR reuses
- ADR-0013 — agents author, and an existing program refuses; this is the same shape applied to review
