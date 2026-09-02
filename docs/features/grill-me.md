# grill-me — settle the load-bearing questions before the first line of work

**Follows:** docs/CHANGE-FLOW-DESIGN.md §3 (the router) and docs/GENESIS-FLOW-DESIGN.md step 0
(Intent). Requested 2026-09-02 (Karel): a grill step that settles outstanding questions before
the intent and the rest of the workflow, as a documented change to the workflow.

**The pattern:** Matt Pocock's `grill-me` — interrogate the plan one load-bearing question at a
time, a recommended answer attached, nothing built until confirmed; the output is the plan with
its hidden parts surfaced. The 2026 agent-UX literature converges on the same shape (ask when the
human can supply the missing fact cheaply; otherwise state the assumption; log every assumption
where it can be reviewed).

**Why it exists here:** this harness already refuses to *sign* anything generic. Requests still
arrive with hidden parts — the unarticulated assumption, the step to be "figured out as we go",
two adjacent choices that contradict — and the agent settles them silently mid-build. They come
back as a redesign or a re-litigated decision. The grill is the same refusal applied one step
earlier: it refuses to *start* on unsettled ground.

## Decisions

**G1 — It is the Decide stage's opening act, not a seventh stage.** The walk stays six stages;
the grill gates nothing and signs nothing. During it the chain's first step reads `settle the
open questions` so the studio shows position, and the chain is re-declared when answers reshape
the steps (drive-narration N6 already permits this).

**G2 — Fires on genesis and the brief lane; never on the direct lane.** Genesis: before the
intent interview collects a single config answer. Brief lane: after the triage restatement (the
human must see the lane before the questions), before the brief is drafted (a brief on unsettled
ground is a brief that gets rewritten). Direct lane: one inline question at most, only when the
restatement cannot be made unambiguous. Bug fix, emergency fix, spike: never — the clause already
says the behavior, an emergency is not a seminar, a spike is free.

**G3 — Read before asking; signed is closed.** Evidence-or-silence applied to questions: a
question the tree already answers is a routing error — cite the artifact. A signed brief or spec
is a closed decision — never re-asked, never listed as open. Reopening one is a *named* proposal.

**G4 — The frontier, in bounded rounds.** Unsettled decisions form a tree; the frontier is the
set whose prerequisites are settled. Each round asks the whole frontier as a numbered list of at
most five, ordered by load (most downstream change first), each item one sentence + why it
matters + a recommended answer with its reason. The agent WAITS. Stop when no remaining answer
would change the work. Three rounds is the ceiling — a request still growing questions after
fifteen has not been scoped; propose the split.

**G5 — No new artifact.** Answers land where the harness already keeps decisions: genesis → the
intent brief's sections; brief lane → the feature brief's **Decisions** (each with its why, in the
human's domain language) and **Open decisions** (the human's own calls that stayed open). The
brief's signature closes them. "You decide" is a valid answer: the recommendation is recorded as
agent-chosen, and the signature is what makes it the human's — never disguised as their words.

**G6 — Config is not grill material.** The genesis interview's option table has defaults for a
reason. The grill asks about the app; the interview collects the config from settled ground. The
two must not merge into a twenty-question genesis.

## Surfaces changed

`skills/grill-me/SKILL.md` (new plugin skill) · `.claude-plugin/plugin.json` + marketplace
description · `docs/CHANGE-FLOW-DESIGN.md` §3 · `docs/GENESIS-FLOW-DESIGN.md` step 0 ·
`template/CLAUDE.md` §After genesis (the rule holds in generated apps without the plugin) ·
`skills/cmp-new/SKILL.md` §1 · README / USAGE / llms.txt skill counts and table ·
`test/grill-me.test.mjs` pins the surfaces to agreement.

## Non-goals

No question bank (the frontier is derived per request, not read from a list); no gate, no
signature, no ledger entry of its own; no change to what the walk owns.
