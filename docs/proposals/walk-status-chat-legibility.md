# Walk status, one week on: what it fixed, and the gap it left in chat

**Status:** proposal — no decision taken.
**Evidence base:** the `create-cmp-showcase` (Fuelled) session of 2026-08-22..26, which ran
three governed walks end to end — `navigation-ia` (before walk-status existed),
`workouts`, and `app-updates` (after). Plus `qa/flight-recorder.jsonl` (19 lane runs),
`qa/approvals.log.jsonl` (33 governance events), and the shipped
`qa/lib/walk.mjs` / `qa/walk-status.mjs` at harness 0.15.0.
**Companion:** [`docs/features/walk-status.md`](../features/walk-status.md) — the design this
report is measured against. Read its D5 first; several findings here are about whether that
decision held in practice.

---

## 1. The verdict up front

Walk-status **worked at the job it was designed for** and **did not solve the problem the user
articulated a week later.** Those are different problems and the doc should say so.

Designed job (`walk-status.md`, the problem statement): *"Narration discipline decays across
long sessions… Position-keeping must live in machinery, not agent memory."* That held. In the
same repo, before and after:

| | `navigation-ia` (pre-walk) | `app-updates` (post-walk) |
|---|---|---|
| Prompts to reach Sign-off | 20+ | ~8 |
| User orientation questions | 5 (*"is everything done now"*, *"what is outstanding"*, *"the session stalled"*, *"you are stuck"*, *"what were you about to run"*) | 1 |
| Interleaved walks | 3, unframed | 0 — arrivals rendered and deferred |

The unprompted user report afterwards was nonetheless: *"I would have really liked more of a
hand holding experience… especially in the chat, clear structure and clear in-chat header of
what is being worked on and where in the process we are."*

Both things are true. The feature stopped the **agent** drifting. It did not make the
**process** legible to someone who does not already know the harness.

---

## 2. What the evidence actually shows

### 2.1 The statusline works as designed — this is not the gap

Worth stating plainly because it was the first hypothesis and it was wrong.
`renderStatusline` → `loudest(walks)` → `walks.find(w => w.you.turn === "you") ?? walks[0]`.
During `app-updates`' Build and Prove stages that resolved to `app-updates`; at Sign-off it
resolved to `app-updates` again as the your-turn walk. The surface pointed at the right
feature throughout. D5's *"cannot drift, cannot be forgotten"* claim held.

### 2.2 The real statusline defect: phantom walks occupy it

The moment `app-updates` was accepted, the statusline became:

```
catalog-and-editing ●·◐○○○ Contract · you: nothing · +1 walk
```

`catalog-and-editing` has **nothing outstanding**. Its promises live in
`specs/catalog.spec.md` (CAT-01..03) and `specs/entry-editing.spec.md` (ENTRY-01..03) — both
approved, every clause cited, lane green. The walk cannot see them because a brief pairs to
`specs/<name>.spec.md` **by filename**, and no key exists to redirect it (`feature-brief.mjs`
accepts `touches`, `screens`, `unrouted` — nothing else). Same for `supplement-schedules`,
whose brief names `specs/supplements.spec.md` (SUPP-08..13) on line 3 in prose the derivation
never reads.

So the user's designated primary surface now displays a **false instruction**, indefinitely,
for two of the project's features. This is worse than silence: an agent handed *"Now: write
the clauses in specs/catalog-and-editing.spec.md"* will write them, producing a second
definition of behaviour already specified — the exact failure the spec layout exists to
prevent. In the observed session the agent stopped and diagnosed it instead, but only because
it had context from having read both files.

**A brief whose blast radius spans two specs cannot satisfy a one-spec-per-brief pairing.**
`catalog-and-editing` is not misnamed; S2 and S3 genuinely shared a schema change rather than
a contract. Renaming cannot fix it.

### 2.3 CLAUDE.md forbids the thing the user asked for

> **While working — quiet:** one line per stage transition, nothing per-file. The statusline
> carries the position continuously; **do not repeat it in prose.**

This follows logically from D5 — if the statusline is the primary surface, duplicating it in
chat is noise. But the consequence is that **between gates, chat contains no position
information at all**, by design. The user reads chat. The chat is where the reasoning,
the trade-offs and the surprises appear, and it is what gets scrolled back through. A single
line beneath the input box is a different kind of artefact: it is glanceable, not narrative,
and it does not persist in the transcript.

The rule is not being violated. Following it produces the experience being complained about.

### 2.4 The vocabulary assumes the reader built the harness

Every user-facing string is internal. A representative stop card as actually rendered:

```
■ YOUR TURN — app-updates · stage 3 of 6: Contract
→  node qa/approve.mjs feature-spec:navigation-ia
```

D2 claims the six stages are *"human vocabulary… replacing brief/spec/provenDone-speak
everywhere the user looks."* They are certainly better than `provenDone`. But *Contract*,
*Prove* and *Sign-off* are terms of art, and the call to action is a CLI incantation for a
product that ships a console with buttons. D3's promise-framing (*"the feature makes N
promises"*) is the strongest piece of vocabulary work in the feature and is **absent from the
stop card entirely** — it appears only in the Build-stage line.

### 2.5 No sense of scale

`stage 3 of 6` implies halfway. In the observed session Contract took ~2 minutes and Build
took ~50. Six equal-looking pips encode no duration, and the user cannot tell whether to wait
or leave.

Compounding it: the agent told the user the verify lane took *"about five minutes"* while the
user was deciding whether it was worth running. Measured from the receipt's own
`durationMs`, warm, it is **98 seconds** — `e2eSmoke` 52s, `androidChecks` 21s, everything
else single digits. The user declined a run on a 3× overestimate. The lane knows its own
timings and the walk never surfaces them.

### 2.6 The Stop hook speaks a different language than the walk

`Not done: the committed receipt is a FAIL (attesting profile: local).` — correct, and
unintelligible without knowing what a receipt attests. It fired ~8 times in the session,
including three times when the only change was a human approval (see §2.7). The walk went to
real trouble to establish a vocabulary; the most frequently-seen enforcement surface does not
use it.

### 2.7 Approvals invalidate the receipt; acceptance does not

`inputs-hash.mjs` projects `qa/approvals.json` to `(artifact, status, hash)` precisely so that
*"the human clicking Accept on a provenDone feature"* cannot destroy the proof that permitted
the acceptance. Excellent, and it works — verified twice in-session.

But `approve` moves `status`, which **is** in the projection, so signing five artifacts forced
a full lane re-run whose only changed verdict was `approvals: SKIP → PASS`. Build, 340 tests,
release build, Maestro and instrumented tests all re-derived to prove a JSON file changed. The
approvals step reads a ledger and some file hashes; it needs no build. The same projection
insight that spared `accept` could re-evaluate that one step and patch the receipt.

---

## 3. What this suggests

Ordered by confidence, not by effort.

**P1 — Fix the phantom walks before anything cosmetic.** §2.2 is the only finding here that is
a defect rather than a gap: the primary surface is currently displaying a false instruction.
Options, cheapest first: let the `cmp:feature` block name its spec(s) explicitly
(`"specs": ["catalog", "entry-editing"]`), defaulting to today's filename pairing; or derive
the pairing from the brief's `**Spec:**` header, which `supplement-schedules` already carries
in exactly the right form and which humans already read correctly.

**P2 — Decide whether chat is a walk surface, and say so either way.** Today it is
deliberately not one (§2.3) and the resulting experience was reported as insufficient. If it
should be, D5's reliability layering needs a fourth entry and CLAUDE.md's *"do not repeat it in
prose"* must be reversed rather than quietly ignored — the current wording makes an agent that
does the right thing non-compliant. If it should not be, the statusline needs to carry more
than one line, and that is a client-surface question, not a harness one.

**P3 — Translate at the boundary, keep the ids underneath.** `Contract` → *"agreeing what it
will do"*; `Prove` → *"checking it works"*; `feature-spec:app-updates` → *"the promises for
in-app updates"*. The ledger keeps its ids; only rendering changes. D3's promise-framing should
lead the stop card, since it is already the most legible thing the feature produces.

**P4 — Lead with the console, keep the command as fallback.** The stop card's `→` should be
*"click Approve in the console"* with the CLI beneath it. The console is a shipped surface and
the walk's own D5 already treats it as a first-class renderer.

**P5 — Put duration where the pips are.** `qa/flight-recorder.jsonl` already holds per-run
timings and the receipt holds per-step `durationMs`. A stage that says *"~2 min"* or *"~50 min,
no input needed"* changes whether a human waits or leaves, and would have prevented §2.5's
3× misquote outright.

**P6 — Give the Stop hook the walk's vocabulary.** Same fact, same enforcement, words that
match the rest of the system.

---

## 4. What should not change

- **The projection principle (D1).** Nothing in this report argues for new state. Every
  proposal above is a rendering or a lookup change.
- **The statusline (D5).** It did its job (§2.1). Its problem is what it is pointed at, not
  what it is.
- **Arrivals.** `▲ ARRIVED, UNPLANNED` was the single most effective piece of the feature in
  the observed session — it converted three silent interleavings into one framed question with
  a default. Nothing here touches it.
- **No second Stop hook (D6).** The reasoning holds. P2 is a documentation and rendering
  change, not an enforcement one.

---

## 5. The honest one-line summary

Walk-status is an **agent-alignment feature that shipped wearing user-experience clothes**. It
succeeded at alignment — measurably, in the same repo, within a week. The vocabulary, the CLI
call-to-action, the all-walks collapse and the stay-quiet rule all optimise for keeping the
agent on rails; none of them were designed to keep a newcomer oriented, and the gap the user
reported is exactly the width of that difference.
