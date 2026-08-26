# Walk legibility — the walk speaks human, the console carries it, and the console is always there

Status: **approved in chat (Karel, 2026-08-26 — "do all the above"), built same day.**
Evidence base: [`docs/proposals/walk-status-chat-legibility.md`](../proposals/walk-status-chat-legibility.md)
— the week-on report over three governed walks in the showcase. Companion:
[`docs/features/walk-status.md`](walk-status.md) — every decision there **stands**; this
changes renderings, one pairing lookup, and process lifetime. Never state.

```json cmp:feature
{ "touches": [], "screens": false }
```

## The problem, restated whole

Walk-status stopped the *agent* drifting (measured: 20+ prompts → ~8, five orientation
questions → one) and did not make the *process* legible to the human reading chat. The
report shows the gap is not one thing but three, plus a defect:

1. **Chat carries no position by design** — CLAUDE.md's "do not repeat it in prose"
   follows correctly from D5 and produces the experience Karel reported. The rule, not
   the agent, is what needs to change.
2. **No time anywhere** — six equal pips imply equal stages; Contract took 2 minutes and
   Build 50. The lane's own ledgers hold every timing and no surface reads them; the
   agent misquoted the lane 3× and lost a run.
3. **CLI incantations where the product ships buttons** — the stop card's `→` is
   `node qa/approve.mjs …` while the console renders the exact Approve control.
4. **Defect (P1):** brief→spec pairing is by filename only, so a two-spec brief
   (`catalog-and-editing`) renders a **standing false instruction** on the primary
   surface — an agent that trusts it writes duplicate clauses.

And beneath all four: the console is D5's second layer, yet nothing guarantees it is
running. It dies with the MCP process that hosted it (the 07-28 respawn class), only a
hand-typed `nohup` resurrects it, and its absence is silent.

## Decisions

**L1 — Briefs name their specs; the filename stays the default.** The `cmp:feature`
block gains optional `"specs": ["catalog", "entry-editing"]`; absent that, the brief's
`**Spec:**` header line is read; absent both, today's filename pairing holds. ONE
pairing function, consumed by the board derivation, spec coverage, and the walk — the
walk never re-derives it. This closes the false instruction and is ordered first
because it is the only defect in the set.

**L2 — Chat becomes a walk surface: the header line, machinery-authored.** Reverses
CLAUDE.md's "do not repeat it in prose." During any open walk, the agent opens every
reply with the walk's one-line header — the same string `renderStatusline` emits,
delivered fresh each turn by the existing `--inject` (its output gains a marked header
line the agent pastes **verbatim**). Pasted, never composed: it cannot drift, and it
persists in the transcript, which the statusline never does. Between headers, quiet
stays quiet; stop cards at gates are unchanged. D5 gains chat as its fourth layer;
D6 stands — no new hook, no enforcement.

**L3 — Translate at the boundary; ids underneath.** One vocabulary map in `walk.mjs`,
used by every rendering: Contract → "agreeing what it promises", Prove → "checking
every promise", Sign-off → "your sign-off", `feature-spec:x` → "the promises for x".
The Stop hook's message is re-worded through the same map — same fact, same
enforcement, the walk's words. Ledger ids never change (D1: rendering only).

**L4 — Time is part of position.** `walk.mjs` reads `qa/flight-recorder.jsonl` and the
receipt's per-step `durationMs`; cards and the console show observed durations per
stage where history exists ("Prove — ~2 min warm, no input needed"), and ANY surface
quoting the lane quotes the recorder, never agent memory. The statusline stays one
line — D5 untouched.

**L5 — The console leads every call to action.** Stop cards render "Approve in the
console — <url>" first, CLI beneath as the fallback. The In-flight card grows into the
walk's primary human rendering: the promise list itself with kept/current/pending
(walk.mjs already derives titles; `walksHtml` currently collapses them to a count),
per-stage durations (L4), the signature control on the your-turn row (the wiring
exists — `.approve-btn`/`.feature-accept-btn`; one approve path, refusals stay the
server's), and arrivals whose now-or-after choice is two buttons, not prose.

**L6 — The console is a resident, not a passenger.** Three layers, all fail-open:
- **(a) Detach by default.** The MCP `preview` tool stops hosting the console
  in-process; it spawns the standalone `console.mjs` detached and adopts it — the
  human's window structurally survives every agent respawn. Adoption already exists;
  this makes it the only path.
- **(b) Session start ensures it.** On session start (SessionStart hook / MCP
  connect): `findLiveConsole` → adopt, else spawn detached and forget. Never blocks,
  never waits for boot.
- **(c) Absence is loud where presence is assumed.** The statusline appends
  `· console down` when the registry probe fails, and `create-cmp doctor` gains a
  console finding with `--fix`. The always-visible surface reports the other
  surface's death — silence ends.
- Out of scope, deliberately: surviving reboots (launchd/systemd). The guarantee is
  "running whenever anyone is working," which is what every surface above assumes.

## What does not change

- **D1.** Every item above is a rendering, a pairing lookup, or process lifetime.
- **The statusline's one line** and its `loudest()` choice — it did its job (§2.1).
- **Arrivals** — the report's single most effective piece; L5 only gives its
  question buttons.
- **No second Stop hook** — L2 rides the existing inject; L3 re-words, never re-gates.
- **The receipt/inputs-hash projection.** §2.7 (a signature forces a full lane re-run)
  is real but is *evidence semantics*, not legibility — tracked separately, decided
  separately, never as a rider on a rendering change.

## Order

L1 (defect) → L6 (the surface must reliably exist before anything leads with it) →
L2+L3+L5 (one vocabulary change, three renderings, landed together so the words match
everywhere at once) → L4 (recorder plumbing last; it decorates the rest).
