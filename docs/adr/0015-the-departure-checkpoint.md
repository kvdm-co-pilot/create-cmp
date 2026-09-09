# ADR-0015: A long task checks in at its plan and at every departure — not on a timer

- **Status:** accepted — 2026-09-09, Karel van der Merwe (signed by his instruction in session — *"build the midway checkpoint too (I'm worried by the fact that you stopped here not our intention)"*; designed by the architect under his standing delegation to resolve as product owner and lead architect)
- **Implementation:** landed with this ADR — the *Checkpoints* section of `.claude/agents/deep-worker.md` and the briefing duty in `agents/cmp-orchestrator.md`. No gate, no hook, no artifact: this is a contract about work in flight, and nothing about it decides what merges.
- **Date:** 2026-09-09

## Context

ADR-0014 put a reader at the exit of Build. It does nothing for the fifty minutes before that exit.

On 2026-09-09 four subsystems ran as delegated agents, between eleven and fifty-five minutes each. Every one reported honestly, and every one surfaced the same class of thing only in its **final** report:

- Live Console Phase B moved its artifact out of `qa/evidence/` because a gate pinned that directory's ignorable set. Correct call — visible at minute 50.
- Phases C and D found that writing the Rule 0 record unconditionally would turn three gates red, one of them a **green Stage 2 exit criterion**, so it shipped the record behind a flag and handed the decision up. Correct call — visible at minute 55.
- The `fuelled-api` adoption found `prooflane init` refuses an occupied `qa/`, and ran `prooflane upgrade` on its own initiative. Correct call, and it rewrote 28 machine-owned files. Visible at the end.

**Three for three, the agent hit a decision that was not its own, decided it, and carried it to the final report.** Each was right, which is luck we should not spend again: the same shape with a wrong answer costs the whole run, and the orchestrator finds out when the work is finished and expensive to redo.

The obvious mechanism is a timer — check in every N minutes. It is the wrong one. A timer interrupts work that is going fine, which is most work, and it fires when there is nothing to say. Worse, it trains both sides to treat the checkpoint as noise, and a checkpoint that is routinely empty is a checkpoint nobody reads.

## Decision

**A long task checks in twice, and neither is a clock.**

**1 — At the plan, unconditionally.** Before writing code, the agent states the approach it is about to take and the questions its brief did not settle, and stops. This is the cheap one and the important one: it costs a single round trip, it fires whether or not the agent has noticed a problem, and it catches the case a departure check cannot — an agent that is **confidently wrong** and therefore never feels itself depart. Minute two instead of minute fifty.

**2 — At every departure, event-driven.** When the work requires something the brief did not authorise — a different path, a gate in the way, a decision the brief left open, a file outside scope — the agent **stops and reports the departure instead of deciding it**. Not a note in the final report; a stop, at the moment, before the time is spent.

Both resume with context intact rather than restarting, so the cost of a checkpoint is one message, not one run.

**This is a briefing contract, not a gate.** Nothing about it decides what merges, so it needs no plant, no record and no hook. Its only enforcement is that the orchestrator does not have a result until the checkpoint clears — and the orchestrator is the one who wanted the answer.

**The brief must make departure detectable.** An agent can only notice it is departing if it was told what was settled. A brief that names what is decided, what is deliberately open, and what is out of scope gives the agent a list to check itself against; a vague brief makes the departure check unenforceable by construction. That duty is the orchestrator's, and it is now written into its definition.

## Consequences

- **The blast radius of a wrong direction drops from a run to a checkpoint.** That is the whole benefit and it is worth one round trip.
- **The plan checkpoint is unconditional and the departure checkpoint is not**, deliberately. The first catches confident wrongness; the second catches recognised uncertainty. Neither catches unrecognised uncertainty, and nothing in this design pretends to.
- **It depends on the agent's honesty**, exactly as ADR-0014's reviewer does. That dependency is acceptable here for the reason it was not there: a missed checkpoint costs time, while a missed review ships a defect. Different stakes, different tolerance.
- **A vague brief silently disables half of it.** The strongest lever on this ADR's value is not the agent's contract but the brief's quality, which is why the duty landed in the orchestrator too.
- **It costs latency on every long task**, including the ones that needed nothing. One round trip at the plan is the price, and it is charged whether or not it pays that time.
- **Nothing is measurable here.** Unlike review-authored tests, a checkpoint leaves no artifact to count. If this proves not to work we will find out anecdotally, which is a real weakness of the design and not a reason to add ceremony that would.

## Alternatives considered

- **A timer — check in every N minutes.** Rejected: it interrupts work that is fine, fires with nothing to say, and trains both sides to skim it.
- **Progress reports at fixed step counts.** Rejected for the same reason, plus a step count is a worse proxy for risk than a departure is.
- **The orchestrator polls the agent's transcript.** Rejected: the transcript is enormous, reading it costs the context the delegation was protecting, and it makes the orchestrator a monitor rather than a decider.
- **Let the agent decide and report at the end** — the status quo. Rejected on 2026-09-09's evidence: three for three, decisions that were not the agent's were taken by the agent and surfaced only when the work was done.
- **Make the checkpoint a gate with a record.** Rejected: it decides nothing about what merges, so a gate would be ceremony, and ADR-0014's reasoning about uncalibrated instruments applies with less justification here, not more.

## What would make this wrong

- If agents stop at things that are not departures, the checkpoint becomes an interruption tax and gets waived — the timer's failure mode, arrived at by a different road.
- If briefs stay vague, the departure half never fires and this ADR bought one round trip per task and nothing else.
- If the plan checkpoint turns into a rubber stamp — approved without reading — it is worse than absent, because it launders a direction nobody checked.

## Related

- ADR-0014 — the reader at Build's exit; this is its complement, covering the time before that exit
- `skills/grill-me` — the same instinct at the decide layer: settle what is load-bearing before the work, not after
- `agents/cmp-orchestrator.md` — "every brief must be SELF-CONTAINED", now also: every brief must say what is settled
