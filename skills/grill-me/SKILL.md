---
name: grill-me
description: >-
  Settle the load-bearing questions about a request BEFORE the first line of work — the
  decide step's opening act. Walks the decision tree one frontier at a time: reads what the
  repo already answers (signed briefs and specs are closed — cited, never re-asked), then
  asks the unsettled decisions whose prerequisites are settled, in numbered rounds of at most
  five, each question carrying WHY it matters and a RECOMMENDED answer, and waits. Stops when
  no remaining question would change the work. Fires automatically at genesis (before the
  intent interview) and on every brief-lane request (before the brief is drafted); the human
  can invoke it anytime with "grill me", "interrogate this plan", "poke holes in this", "what
  am I missing", "ask me the hard questions", "settle the open questions before we start".
  Never grills the direct lane, a bug fix, an emergency fix, or a spike. Produces no new
  artifact: answers land in the intent brief or the feature brief — settled decisions with
  their why, the human's own calls under Open decisions — and the brief's signature is what
  closes them.
---

# grill-me — settle the load-bearing questions before the first line of work

Your job: find the decisions this request rests on that nobody has actually made, and get
them made — by the human where the call is theirs, by a recommended default where it is
not — before any tool touches the tree. The output is not a transcript of questions; it is
a decide-layer artifact written from settled ground.

Why this exists. Every request arrives with hidden parts: the assumption the human never
articulated, the step they were going to "figure out as we go", the two adjacent choices
that contradict each other. Left unasked, the agent makes those calls silently mid-build,
and they surface weeks later as a redesign, a re-litigated decision, or a spec that says
one thing while the code does another. This harness already refuses to *sign* anything
generic; the grill is the same refusal applied one step earlier — it refuses to *start*
on anything unsettled. The pattern is Matt Pocock's `grill-me` (one load-bearing question
at a time, recommended answer attached, nothing built until confirmed), adapted to this
harness's artifacts and its standing rules: evidence-or-silence, and settled decisions are
closed.

## 0. When it fires — and when it must not

| Entry | Grill? | Where the answers land |
|---|---|---|
| **Genesis** (cmp-new) | Always — before the intent interview collects a single config answer | `specs/intent.md` sections |
| **Brief lane** (new feature, change to signed behavior, architecture change) | Always — after the triage restatement, before the brief is drafted | `docs/features/<name>.md` — Decisions + Open decisions |
| **Direct lane** (tweak, copy, redesign, component, upgrade) | No. At most ONE inline question, only when the triage restatement cannot be made unambiguous | the chat confirmation the lane already uses |
| **Bug fix · emergency fix · spike** | Never. The clause already says the correct behavior; an emergency is not a seminar; a spike is free | — |
| **Human says "grill me"** | Yes, on whatever they point at, any time | the artifact that owns the decision, or chat if none does |

The grill happens *inside* the walk's Decide stage, never as a stage of its own — the walk
stays six stages and the grill gates nothing. Declare the chain first so the studio shows
position: `node qa/plan.mjs --set "settle the open questions | <the rest as you currently
see it>" --title "<the ask, restated>"`, then re-declare when the answers reshape the steps
(the chain is an offer, not an announcement).

## 1. Read before you ask — evidence-or-silence

Before the first question, read what already decides things: `specs/intent.md`, every
signed `docs/features/*.md`, the specs the request touches, `docs/ARCHITECTURE.md`, and the
approvals ledger. Then apply two rules without exception:

- **A question the tree already answers is a routing error.** Cite the artifact and its
  line; do not ask.
- **A signed decision is closed.** A brief or spec the human signed settled that call.
  Never re-ask it, never list it as open, never re-explain it. If the request genuinely
  needs it reopened, that is a *named* proposal ("this asks us to reopen D3 of
  `meal-logging` — reopen, or scope around it?"), not a fresh question pretending the
  signature never happened.

What survives this pass is the tree of decisions the repo is genuinely silent on.

## 2. The frontier — which questions, in which order

Treat the unsettled decisions as a tree: some cannot be asked until others are answered
(you cannot pick the day boundary before deciding there *is* a daily rollup). The
**frontier** is every decision whose prerequisites are settled. Work in rounds:

1. Take the whole current frontier — the questions that can be answered *now*.
2. Order by **load**: the decision whose answer changes the most downstream steps or
   artifacts goes first. A question that changes nothing is not a question; drop it.
3. Ask the round as a numbered list, **at most five**. Each item is:
   - **one sentence**, one decision — never two questions joined by "and";
   - **why it matters** — which step, artifact, or clause its answer unblocks or reshapes;
   - **a recommended answer, with its reason** — the human should be able to say "1: yes,
     2: your call, 3: no, midnight" and be done.
4. **Wait.** Do not answer your own questions, do not start work "in the meantime". The
   round ends when the human answers, not when you finish typing it.
5. Fold the answers in; the frontier moves. Repeat.

**Stop** when no remaining question would change the work — say so in one line ("nothing
left that changes the shape; drafting the brief"). **Three rounds** is the default ceiling:
a request still growing questions after fifteen has not been scoped — propose the split
into two requests rather than a fourth round.

## 3. Discipline — non-negotiable

- **One round at a time.** Questions live in the numbered list, never buried in prose
  between tool calls where they read as rhetorical.
- **Vague twice is a decision.** A vague answer gets ONE push-back, as a concrete either/or
  with your recommendation. Vague again → record it verbatim under Open decisions and move
  on; the signature step will force it.
- **"You decide" is a real answer.** Take your recommended answer, record it in the brief
  as agent-chosen — the human's signature on the brief is what turns it into theirs. Never
  hide an agent-chosen default as if the human had said it.
- **No leading, no theatre.** A question whose only function is to make the plan *look*
  interrogated — obvious answer, no downstream consequence — is interrogation theatre.
  Cut it. Five sharp questions beat twelve thorough ones.
- **Config is not grill material.** At genesis, the interview's option table (package id,
  Firebase, Room, tabs…) has defaults for a reason. The grill asks about the *app*; the
  interview collects the *config*. Do not merge them into a twenty-question genesis.
- **Not sooner, not later.** After the triage restatement (the human must see the lane
  before the questions) and before the brief is drafted (a brief written on unsettled ground
  is a brief that will be rewritten).

## 4. Where the answers land — no new artifact

The grill creates nothing the harness does not already own:

- **Genesis →** the intent brief (`specs/intent.md`): purpose, audience, what day one must
  do, what it deliberately will not do, the reference apps, the brand feel. The interview
  then collects config *from* settled ground, and the tab list falls out of the "first
  screens" answer instead of being guessed.
- **Brief lane →** `docs/features/<name>.md`. Settled answers become **Decisions**, each
  with its why in the human's own domain language (`D3 — the day boundary is configurable,
  default 04:00. Why: shift workers log past midnight; midnight would split one night in
  two.`). The human's own calls that stayed open become the **Open decisions** section. The
  brief's signature (`feature-brief:<name>`) is what closes them — the grill itself signs
  nothing, gates nothing, and the walk stays the truth for doneness.
- **Human-invoked on something unowned →** answer in chat; if a decision emerged that a
  future contributor could plausibly unmake, say so and offer the brief lane.

## 5. In the chat and the studio

The chain's first step during a grill reads `settle the open questions`; the studio's Drive
strip shows it, the chat header line rule still applies, and each round is one reply. When
the grill closes, advance the chain (`node qa/plan.mjs --step 2`) — the human watching the
studio sees the request move from *deciding* to *drafting* the moment it happens.

## 6. Named anti-patterns

- **Re-asking the repo** — the single fastest way to lose the human's trust in the grill.
- **The silent default** — making a load-bearing call mid-build because asking felt slow.
  That is precisely the failure this skill exists to prevent; asking IS the work here.
- **The interrogation that never ends** — round four, question eighteen. Split the request.
- **Grilling the direct lane** — a copy edit does not need a decision tree.
- **Answering for the human** — recommending is required; deciding for them, on a call that
  is theirs, is not.
