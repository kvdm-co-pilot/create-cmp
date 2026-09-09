# ADR-0013: One convergence path — `init` adopts, upgrades and re-adopts; the agent authors the profile and Rule 0 refuses it

- **Status:** accepted — 2026-09-09, Karel van der Merwe (signed by his instruction in session — *"yes with the floor as precondition, write the ADR"*; drafted by the architect)
- **Implementation:** none, and that is the point — this decision is mostly about what will **not** be built. Its one executable consequence is a retirement: `attach`'s M0b scope is closed as superseded (`docs/features/attach-mode.md`). The precondition named at signing was found already met before this file was written — see *Consequences*.
- **Date:** 2026-09-09

## Context

Four commands converge a tree onto a lane, and three of them assume a tree this project
stamped: `harden` re-derives the `--minimal` subtraction, `upgrade --harness` three-way
merges engine-owned files, and both need a **base** — the bytes create-cmp originally gave
the app. The fourth, `attach`, is the only one aimed at a foreign repo, and it deliberately
stops before the lane: its header names previews, the lane and enforcement as *"NOT wired
(M0b's staged scope), never faked."* That staging was honest when it was written on
2026-08-21. It was overtaken on 2026-09-08, when `prooflane init` shipped a lane into a
foreign repo of **any** language — M0b's job, for a wider set of stacks than M0b scoped.

Meanwhile four repos on this machine carry lanes: `fuelled-api` (Kotlin/Ktor), `pantry-api`
(Python), `create-cmp-showcase` (CMP) and `brat-o-meter` (Gradle). They sit at four harness
versions — 0.14.1, 0.19.0, 0.19.0, 0.21.0 — none carries `qa/harness-source.json`, none
earns a rung, and all four still write `cmp-evidence/1`. That is not four problems. It is
one operation, wanted four times.

The four cases people actually arrive with — a new repo, a foreign repo with no lane, a
foreign repo with a stale lane, and many of those at once — are the same operation:
**converge a tree onto a current lane without clobbering what the tree already owns.** The
three-way walk already implements it. What a foreign repo cannot supply is the base, and
deriving one — where do this stack's tests live, how do its citations bind, what would a
real plant look like here — is per-stack judgment, not a diff.

## Decision

We will treat **`prooflane init` as the single convergence path** for every tree, greenfield
and foreign, lane-less and stale alike, and we will **not** build a separate upgrade command
or a version-pair migration matrix. The base a foreign repo cannot supply is **derived by an
agent**, which authors the profile — its grammar, layout, steps, ladder and plants.

We accept an AI-authored artifact in a load-bearing position because that artifact is not
trusted: it is **refused**. Rule 0 requires each of the profile's own plants to make the lane
FAIL *with the responsible gate naming what it caught*, and requires the lane to return PASS
once every plant is reverted — so the plants were the only cause. A profile that ships no
plants earns no rung at all. The agent writes; the instrument decides whether what it wrote
is an instrument.

Stage 3's *"one command upgrades the whole fleet"* is therefore a loop over this path, not
machinery of its own.

## Consequences

- **`attach`'s M0b is retired**, not deferred. `prooflane init` does its job for every
  language rather than for Compose alone; keeping both would mean two convergence paths that
  drift in one. `attach` keeps its M0a surfaces, which remain true.
- **The precondition named at signing was already met.** This decision was signed *"with the
  floor as precondition"* — a floor against a *vacuous* plant, one that fires and proves
  nothing. Reading `framework-check.mjs:23-28` before writing this file showed the floor is
  structural and already there: a plant that breaks nothing produces no FAIL and no gate
  naming what it caught, so it cannot clear the round trip. No new work is owed, and this
  ADR records the check rather than the intention, because a precondition written as future
  work when it is already satisfied is a fabricated constraint.
- **What is genuinely not floored is plant *coverage*.** One real plant clears the bar; a
  profile is never required to plant against every guard it could. That is a decision already
  taken and reasoned, not an oversight — `test/badge-floor.test.mjs:187` declines to require
  `unmeetableTier` because a correct single-tier stack can never make that plant, and
  requiring it would put the badge out of reach by construction. We accept the same trade
  here: an agent that writes one real plant clears the floor, and the rung it earns is a
  claim about a calibrated instrument, never about a thorough one.
- **The four local repos become a test corpus** rather than a chore: four stacks, four
  staleness levels, one already FAILing. No better convergence suite could be constructed on
  purpose.
- **`init` against an occupied `qa/` is now load-bearing and remains untested.** It is the
  first thing the corpus must answer, and `docs/proposals/FIRST-ADOPTION.md` §3 already flags
  it as unknown.
- **Provenance becomes the tell.** A converged tree carries `qa/harness-source.json` with
  `"source": "registry"` (ADR-0008); a tree without one was copied, not adopted. All four
  local repos are currently copies by that test.

## Alternatives considered

- **Build the upgrade command / migration matrix.** Rejected: it must know every version pair
  forever, and it is helpless on precisely the tree that matters — one this project never
  stamped, where no base exists to diff against.
- **Finish M0b as a separate Compose-only lane path.** Rejected: `prooflane init` already does
  more, for more stacks. Two paths to the same place is the drift this project exists to
  refuse.
- **Infer the profile deterministically — no agent.** Rejected: grammar and plants are
  per-stack judgment. A generator good enough to write them is an agent, and pretending
  otherwise buys a false determinism at the point where judgment is actually required.
- **Require plant coverage as a floor.** Rejected here for the reason it was already rejected
  at `badge-floor.test.mjs:187`: it makes a correct profile unable to earn a badge.
- **Refuse AI-authored profiles outright.** Rejected: it is the only way a foreign stack ever
  gets a lane, and the refusal that makes it safe is already built and already green.

## What would make this wrong

- A plant that fires **by name** and still proves nothing — the round trip would pass over an
  instrument that measures nothing, and the floor this ADR leans on would be an illusion.
- `init` against an occupied `qa/` turning out to need per-version knowledge after all. Then
  the migration matrix is real, it was merely hiding, and this decision bought nothing.
- An adopter who wants a lane but will not run an agent. This decision makes the agent the
  only supported author of a profile for a new stack.

## Related

- ADR-0008 — a resolved harness is still a vendored one; `harness-source.json` provenance
- ADR-0010 — the vacuous self-vouch has a floor (the *region* analogue of this ADR's plant floor)
- ADR-0011 — `pack` is load-bearing
- ADR-0012 — profiles inherit by declaration; an agent-authored heir is cheap because of it
- `docs/features/attach-mode.md` — M0b retired by this decision
- `docs/proposals/FIRST-ADOPTION.md` — §3's occupied-`qa/` unknown is now this path's first test
