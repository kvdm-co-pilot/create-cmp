# Studio drive mode — one driving surface, pages that answer first, and a live chain

Status: **approved in chat (Karel, 2026-08-27 — "that sounds perfect go and make it"),
built same day.** Companion: [`docs/features/walk-legibility.md`](walk-legibility.md)
(the wave this builds on) and [`docs/features/walk-status.md`](walk-status.md) — D8's
itinerary is what part three promotes from kickoff prose to a tracked object.

```json cmp:feature
{ "touches": [], "screens": false }
```

## The problem

Third report of the same failure class, in Karel's words: *"there is way too much going
on on the studio … all pages are just a mess of information"* and *"we still need a live
view that tells the user what step the agent is on in the current request … 1 → 2 → 3."*
The two prior fixes (the 07-28 governance strip, the 08-24 Overview) each ADDED an
aggregation layer and removed nothing: thirteen peer sections still greet the reader,
and every page renders its complete corpus unconditionally — the corpus grows
monotonically, the day's delta doesn't, so pages get worse with project age. And no
surface anywhere answers "what is the agent doing in THIS request right now" — the walk
is feature-altitude; Build can be fifty opaque minutes.

## Part one — Drive: the studio's driving surface

**D1 — The front door is retitled Drive and leads with motion.** Top to bottom: the
live chain (part three) · the rich In-flight walk cards (walk-legibility L5) · the
what-needs-you queue with its buttons · the standing proven line. Its own tails (the
digest, the history) fold. The section id stays `overview` — it is pinned by
GOVERNED_PANELS, sessionStorage, and the strip's jump; the NAME is human-facing, the id
is plumbing.

## Part two — Page anatomy: pages answer first

**D2 — Every mirror section renders verdict-first, corpus-folded.** Three layers, one
order, no exceptions per page: the verdict (the section's own status line, already
derived) · the exceptions (what moved / what waits) · the complete mirror behind ONE
disclosure ("Read the full …"). The spec-mirror principle is untouched — the mirror
stays byte-complete, derived, and the drift surface; only its DEFAULT EXPANSION
changes. Tool sections (Drive, Screens, Live device) are instruments, not documents,
and never fold.

**D3 — An exception opens its own fold.** A section the human queue currently points
at renders open (its exception IS why the human is coming); Comments opens when
threads are open; the gov-jump "take me there" opens every ancestor fold so it still
lands ON the row. Nothing waiting → the fold is closed and the page is its verdict.

**D4 — v1 is the generic wrap; bespoke exception layers land per-section as they earn
it.** The wrap is mechanical (one flag in the shell renderer), reversible per section,
and pinned by test. Per-page curation (walk-scoped Specs, latest-receipt-first
Evidence) is follow-up work inside this decision, not a new one.

## Part three — The live chain: request · step · next

**D5 — The chain is D8's itinerary, tracked.** `Request: <the ask>` ·
`✓ 1. sign the brief → ◉ 2. build → ○ 3. full check` · `now: step 2 of 3`. Rendered in
the studio's Drive strip, the per-prompt inject, and `node qa/walk-status.mjs`.

**D6 — Three provenance tiers, each rendered as what it is.** This is the one
not-purely-derived surface in the harness, and the design says so out loud:
- **Tier 1, the request — machinery-owned.** The UserPromptSubmit hook records the
  human's own prompt verbatim (`qa/.request.json`); the agent never words it.
- **Tier 2, the steps — agent-declared, age-stamped.** Declared at kickoff
  (`node qa/plan.mjs --set "… | … | …" --title "…"`, mirroring the printed itinerary),
  advanced with `--step N` / `--done`. Every rendering carries *"declared by the
  agent, updated Ns ago"* — a stale chain reads as stale, never as true. The inject
  re-tells the keep-it-current rule every prompt (decay-proof by re-delivery, D5/D6 of
  walk-status).
- **Tier 3, corroboration — derived, overriding.** The lane/render markers
  (`.cmp-lane-in-progress` / `.cmp-render-in-progress`, mtime-bounded) say what is
  ACTUALLY running, regardless of the declaration.

**D7 — The chain gates nothing.** The walk stays the load-bearing truth for doneness;
the chain is a windshield, not an instrument. Its files are ephemeral
(`qa/.plan.json`, `qa/.request.json`): gitignored on fresh scaffolds AND hard-excluded
from the receipt's hashed input surface — a request recorded on every prompt must
never invalidate a receipt. (Upgraded apps keep their own .gitignore; the hash
exclusion is the load-bearing one, and the two files at worst show as untracked.)

## Part four — the studio is a standing check

**D8 — The inject states the studio's status every prompt** — `[studio: running at
<url>]` / `DOWN (crashed)` / `not running` — and the contract makes restoring it a
standing instruction: call the cmp-inspector `preview` tool (which now starts a
detached resident console, walk-legibility L6) or surface it to the human. A missing
window is a fault to heal, never something to work silently past. Combined with L6's
session-start ensure, statusline `· console down`, and doctor's `console-liveness`
finding, absence is now loud on four surfaces.

## What does not change

- **The walk's D1.** The chain is separate, labeled, and subordinate — nothing
  agent-declared enters the walk, the board, or any gate.
- **The spec-mirror principle.** Mirrors stay complete; folds are default state only.
- **One approve path, one fact one place, evidence-or-silence** — Drive composes what
  the owning sections derived, exactly as the Overview did.
- **The statusline** — still the walk's one line; the chain lives where there is room.

## Edge cases

- **No declared chain** → the strip and inject say so honestly ("no declared step
  chain for this request yet") and the inject carries the declare instruction; nothing
  is fabricated from the walk.
- **Stale chain** → rendered with its age, worse-than-no-chain is stated in the
  contract; the request line stays fresh regardless (tier 1 updates every prompt).
- **Follow-up prompts ("yes", "fix that")** overwrite the recorded request — the
  declared `--title` (the agent's triage restatement) therefore leads the strip when
  present, so a two-word reply doesn't retitle the work.
- **Non-cmp directory / missing plan lib** → every surface fails open, as ever.
