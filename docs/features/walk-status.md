# Walk status — you always know what it's doing and what it needs from you

Status: **approved in chat (Karel, 2026-08-24), built same day.** Companion problem
report: the fuelled/create-cmp-showcase navigation-ia session — 20+ prompts, three
interleaved walks (the feature, a harness-upgrade wave, golden regen), zero shared map.
"I have no idea where we are or what the agent is doing at any given time."

```json cmp:feature
{ "touches": [], "screens": false }
```

## The problem

The flow exists in three disconnected forms: documented (CHANGE-FLOW-DESIGN §4's
stations), derived (`getFeatureBoard`'s phase + `nextStep`), enforced (the lane's
gates) — but no runtime object that chat, the console, and the agent all read.
Narration discipline decays across long sessions (the template already mandated
triage-visibility on the first reply; by prompt 15 it meant nothing). Position-keeping
must live in machinery, not agent memory.

## Decisions

**D1 — The walk is a projection, not new state.** `qa/lib/walk.mjs` re-projects the
EXISTING `getFeatureBoard` derivation (phase, nextStep, coverage, provenDone) into six
stages. No new ledger, no agent-declared status, nothing to forget to update. If a
number here could disagree with the board, the module is wrong.

**D2 — Six stages, human vocabulary:** **Decide · Design · Contract · Build · Prove ·
Sign-off** — replacing brief/spec/provenDone-speak everywhere the user looks. Learned
once, shown whole from the start (the pizza-tracker principle). A pure-logic feature
shows Design as "skipped — no UI surface", honestly, never silently.

**D3 — Clauses are *promises*.** Contract = "the feature makes N promises"; Build =
"keeping promise k of N: <the clause's own words>"; Prove = "all promises kept —
evidence attached". Mechanically exact (clause = behavioral promise, citing green test
= kept, `provenDone` = all kept + receipt attests the tree) and legible to anyone.

**D4 — One grammar, four slots**, every rendering generated from the same object:
WHAT (feature + stage) · NOW (present-tense, from the current promise's title) ·
YOU (exactly one of: `YOUR TURN: <act>` / `nothing needed — next stop <stage>`) ·
machinery collapsed below. Calm is a designed state, never silence.

**D5 — Reliability layering: state in the environment, not the conversation.**
- **Statusline** (`walk-status --statusline`, template `.claude/settings.json`
  `statusLine`): always-visible position under the input box. No agent involved —
  cannot drift, cannot be forgotten. This is the user's primary surface.
- **Console In-flight** (Overview): per-walk stage tracker + promise bar + whose-turn
  chip + arrivals. Reads the ledgers; survives any CLI failure.
- **UserPromptSubmit hook** (`walk-status --inject`): the derived position prepended
  to EVERY prompt — the agent is mechanically re-anchored each turn, including after
  compaction. Fail-open (any error → exit 0, empty output); <300ms budget.
- **Chat header** (added by walk-legibility L2, 2026-08-26): every reply opens
  with the statusline's own string, delivered via the inject and pasted
  verbatim — the transcript-persistent fourth layer. Reverses the original
  "do not repeat it in prose" rule, which produced a chat with no position
  information at all between gates (the week-on report's central finding).
- CLAUDE.md carries tone and the stop-card/itinerary grammar only — nothing
  load-bearing.

**D6 — No second Stop hook (deviation from the chat design, with reason).** The chat
design had a Stop hook blocking turn-end without a position footer. Rejected here:
(a) the repo's settled, test-pinned rule is *Stop = the receipt gate, not something
else* (hooks-split.test.mjs) — a second enforcement hook is a deliberate product
change, not a rider; (b) verifying a footer means parsing the session transcript in a
hook — exactly the fragile-hook mess this feature exists to end. The footer's job
(position always visible at turn end) is done better by the statusline, which is
visible during the turn too. Stop cards at human gates remain contract-mandated, and
their instruction arrives fresh every turn via the inject — decay-proof because it is
re-delivered, not remembered.

**D7 — Arrivals are a designed state.** Work that lands mid-walk and belongs to no
open walk (undeclared drift, rule-change reopens from a harness upgrade) renders as
`ARRIVED, UNPLANNED — <what> · now, or after <current walk> lands?` — visually
distinct in console and chat. The nav-ia mess was three walks nobody framed; the
interleave becomes a visible choice at the moment it happens. Default: one walk at a
time; maintenance waves are offered before/after, never silently during.

**D8 — The itinerary is shown upfront.** At kickoff (triage), the agent prints the
journey: six stages, which ones stop for the human ("Stops for you: 3 — Decide (now),
Contract, Sign-off. Build and Prove never stop for you."), first stop opened
immediately. The console Overview carries the standing six-stage explainer.

**D9 — Signature-load measurement rides on D8** (ROADMAP.md "Tracked follow-ups"):
declared stops-for-you vs stops experienced becomes countable per feature; gate
pruning then happens on evidence, not feel. Out of scope here; unblocked by this.

## Out of scope (deliberate)

Genesis-walk rendering (the six-artifact definition order already has the front door's
queue; a genesis tracker can reuse walk.mjs later). Workflow *engine* semantics —
ordering is derived from artifacts, never scheduled. Retro-briefs for legacy features.

## Edge cases

- **Brief exists, spec file absent** → Build/Prove render pending, NOW = "drafting the
  contract"; promises total honestly 0, never "0 kept of 0" as progress.
- **All clauses withdrawn** (live total 0 after amendments) → Contract shows "no live
  promises — the spec needs clauses before Build means anything" (vacuous-doneness
  stance carried through).
- **Brief drifted after acceptance** → the walk REOPENS in the display (phase
  changed-since-approval outranks accepted; sneaky post-acceptance edits surface).
- **walk-status run in a non-cmp directory / broken ledger** → exit 0, statusline
  prints nothing, inject prints nothing. A broken hook may never block work.
- **Two open walks** → statusline shows the one whose turn-state is loudest (YOUR TURN
  beats agent-working), with `+1 walk` suffix; the card and console show all.
- **Reopened design belonging to an OPEN walk** (e.g. wiring stubs to real state) →
  renders on that walk's card as its Design stage, never as an arrival.
- **Machinery installed, wiring absent** → `qa/walk-status.mjs` is lane code (replaced
  wholesale on upgrade) but the statusLine + UserPromptSubmit entries live in
  `.claude/settings.json`, which is app-owned and never clobbered. An app that
  hand-edited its settings can therefore take the walk and lose its two surfaces, and
  the failure mode is silence — the exact thing this feature exists to end. Nothing in
  the walk can notice itself missing, so `create-cmp doctor` carries a `walk-wiring`
  finding (warn, `--fix`-healable from the engine template; it claims only unclaimed
  slots and never rewrites the app's own hooks). Minimal mode is the mirror image: it
  deletes the lane, so `minimalHookSettings` drops a lane-referencing `statusLine`
  too — the lane-reference rule applies to every settings surface that carries a
  command, not only to `hooks`.
