# drive-narration — the chain tells the truth about time, and wears its provenance

**Follows:** docs/features/studio-drive-mode.md (the chain exists, D8) and
docs/features/walk-legibility.md (the vocabulary). This brief upgrades the chain from a
position marker to a live narration, grounded in an industry sweep (2026-08-29, in-session):
Devin's step-grouped Progress tab, Replit's plan-approve loop, Claude Code's three-state todo
bar, ChatGPT deep research's live narration, Copilot's session log, and the NN/g result that
waits with feedback read 11–15% shorter.

**The differentiator we lean into:** every competitor's progress display is self-reported —
the agent grading its own homework. Ours already distinguishes what the agent *declared* from
what the machine *observed* (the three provenance tiers, plan.mjs). These six decisions make
that distinction visible and make the observed tier rich enough to carry the wait.

## Decisions

**N1 — chain steps carry real states and real time.** `setPlan` stamps `createdAt` and the
first step's `startedAt`; `markStep` stamps `doneAt` on steps it closes and `startedAt` on the
step it opens. Renderers show `✓ label (8s)` for done, elapsed on the current step, plain `○`
for pending. Derived from the declaration's own write times — no new claims, just the
timestamps the writes already imply. Old plan files without timestamps render as before.

**N2 — the lane narrates itself through the marker it already stamps.** verify.mjs rewrites
`.cmp-lane-in-progress` at each step start with JSON: current step name, index/total,
step start time, and expected durations read from the flight journal's last full run. Every
marker consumer is mtime-only (watch.mjs, preview daemon), so content is free to carry
meaning. `deriveChain` parses it fail-soft (`busy.lane` becomes an object; legacy `pid iso`
content still reads as busy). The busy line becomes `full check — unitTests (10/16) · 12s,
usually ~52s total` instead of "running NOW". Rewriting per step also refreshes mtime, so a
>5-min lane no longer goes stale mid-run to its own watchers — a bug this fixes in passing.

**N3 — provenance badges.** Drive's chain strip labels each tier as what it is: the request
`recorded` (from the human's own prompt), the steps `declared` (already aged), the busy line
`observed`. Quiet chips, not prose. The chat rendering keeps its existing words and gains the
`observed:` prefix on the corroboration line. No competitor separates claim from observation;
this is the thesis rendered as UI.

**N4 — expected durations from the journal, never from memory.** The flight entry's per-step
records gain `durationMs` (additive; schema id unchanged, old entries stay readable). N2's
"usually ~Ns" quotes only this — walk-legibility L4's rule extended from the lane total to
each step. Until one new-format full run exists, the narration simply omits the estimate.

**N5 — closed chains leave a local trail.** Closing a chain (`--done` / marking past the end)
appends one line to `qa/.plan-history.jsonl`: request text, title, steps, wall time, and the
receipt's verdict+rung at close (read fail-soft). Capped at the last 50. LOCAL AND EPHEMERAL
— gitignored and hash-excluded like `.plan.json`, because it carries raw human prompts; the
committed journal for lane runs stays the flight recorder. Drive renders the last five as a
collapsed "Recent requests" fold under the chain strip: request → chain → outcome.

**N6 — the chain is an offer, not an announcement.** Kickoff protocol (template CLAUDE.md +
the inject's instruction): declare the chain, show it in the first reply *as an offer* — the
human can redirect and the agent re-declares (`--set` again) without ceremony. Work starts
immediately; the chain still gates nothing. This is Replit's editable plan without the gate,
because our gate already lives where it belongs (signatures, receipts).

## Non-goals

No percent bars (a lane step is not linear); no committed request history; no new console
state or decision machinery; no change to what the walk owns (doneness stays the walk's).
