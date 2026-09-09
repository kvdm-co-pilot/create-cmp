# The console tells the work as it happens — a live front door

- **Status:** proposal — unsigned. Drafted 2026-09-09 as product owner and UX, on Karel's ask:
  *"present the harness (working) flows and work to the user live … easy to follow, concise,
  uncluttered, understandable."*
- **Scope:** the front door of the existing console (`packages/harness/src/console/`). No new
  product, no new section type, no infrastructure stood up. Extends `STUDIO-REDESIGN.md` §2/§4.

## 1. Why this is the third time, and what that means

The same failure has been reported three times, and patched twice:

| when | the report | the patch |
|---|---|---|
| 2026-07-28 audit | "I should be able to see the status at all times" | a governance strip in the rail |
| 2026-08-22 | *"not easy to see and use … there is so much happening all over the place"* | the Overview page — one section allowed to aggregate |
| 2026-09-09 | *"easy to follow, concise, uncluttered, understandable"* | this proposal |

Both patches were right about **ownership** — facts stay in the section that owns them — and
right that nine peer sections need an entry above them. What neither changed is the **shape of
the entry**: the Overview composes roll-ups of *artifacts* (specs, architecture, screens,
approvals…). A person arriving does not ask about artifacts. They ask, in this order:

1. Is this tree proven right now?
2. What is happening?
3. What is waiting on me?
4. Can I trust the lane that says so?
5. What would earn the next rung?

Five questions, in time order — the past run, the present run, my next action, the instrument's
integrity, the future. **A front door that answers these five, live, one line each, is the
concept.** Everything else already exists and stays where it is.

## 2. The concept — the lane as a story, told live

One page. Five rows. Each row is one line when idle and expands in place. Nothing on it is
authored; every value is read from an artifact the harness already writes and links to it.

### Idle (the state 95% of the time — it must fit above the fold on a phone)

```
PASS · L2 device · pack cmp · 4 min ago · commit a1b2c3d · tree unchanged since ✓
────────────────────────────────────────────────────────────────────────────────
now         idle — last run 17 steps · 0 FAIL · 3 SKIP · 2m 14s          ▸
waiting     2 approvals · design language drifted · next: verify           ▸
trust       Rule 0 — 7 plants failed by name · tree byte-identical · 2h ago ▸
ladder      L0 ● L1 ● L2 ● L3 ○   L3 needs: a release build on device      ▸
────────────────────────────────────────────────────────────────────────────────
derived from the live tree at a1b2c3d · inputs 615b2c9 · absence = not derivable
```

### Running (the moment the person actually came to watch)

```
RUNNING · step 9 of 17 · build · 6.2s …          last: PASS L2 cmp, 4 min ago
────────────────────────────────────────────────────────────────────────────────
now         harnessIntegrity   PASS    10ms
            specCoverage       PASS    24ms
            approvals          SKIP    18ms   awaiting human approval (non-blocking)
            …
            build              …       6.2s
            unitTests          —
            (rows append as steps finish — nothing scrolls, nothing spins)
```

### Failing (the only time colour appears)

```
FAIL · build · 2 min ago · commit a1b2c3d
────────────────────────────────────────────────────────────────────────────────
now         build              FAIL    41s
            > error: unresolved reference `Foo` (src/…/bar:12)
            > fix: the harness printed none — see the step log ↗
```

The FAIL row shows the tool's own reason and its own fix, verbatim. The console never rewrites
what the lane said.

### The flow rail

`define → preview → approve → verify → report → drive` is the harness's working flow today
(preview-service.mjs). It is shown as a thin rail under the strip with the current step marked
and its ONE command beside it. It is descriptive — where the tree is — never a wizard; it blocks
nothing and has no buttons.

## 3. Rules it inherits, and the four it adds

Inherited without restatement — the shell (§2): one accent, red/amber/green reserved for three
meanings, 4-step type ramp, 8px scale, provenance footer, light+dark, zero external dependencies,
server-rendered HTML. The content bar (§4): authored form, evidence-or-silence, drift in place,
calm voice. The Overview's own law: **composition only — it owns no facts.**

Added, because a live page can lie in ways a document cannot:

1. **Stale is not PASS.** A receipt whose commit is not this tree's HEAD, or whose inputs hash no
   longer matches, renders as *stale* in the strip — never green. The strip's last clause ("tree
   unchanged since ✓") is the derived check, not a decoration.
2. **A step is not-yet, running, or done — never "pending".** Running shows elapsed; done shows
   verdict and duration. A step that completed impossibly fast is flagged by its duration
   (a cache replay is the tell — `evidence-must-attest-execution`).
3. **Disconnected is said, not hidden.** If the event stream drops, the strip says *"disconnected —
   showing last known, 40s ago"*. The page never presents a frozen state as live.
4. **One question per row, one row per question.** No row may grow a second fact. If a sixth
   question arrives, it is either one of the five in disguise or it belongs in a section.

## 4. What exists, and the two small gaps

| need | exists? | gap |
|---|---|---|
| live transport | **yes** — `/events` EventSource, panels refresh in place | none |
| receipt with verdict, rung, pack, commit, inputs, steps, durations | **yes** — `qa/evidence/latest.json` | none |
| the human queue ("waiting on me") | **yes** — `deriveHumanQueue` | none |
| the rung with its pack, one spelling | **yes** — `rungWithPack` | none |
| per-step progress **while** the lane runs | **no** — `verify --json` prints one object at the end | verify emits one NDJSON line per step in `--json` mode; the watcher relays it |
| Rule 0's last result for the *trust* row | **no** — framework-check persists nothing in an adopter tree | it writes `qa/evidence/framework-check.json` (plants, each name, duration, tree-identical) |
| "what would earn the next rung" | **partly** — the ladder is declared in the profile | the profile's unmet requirement is derived and named, not summarised |

Both gaps are small, and each is a *record*, not a gate — §8.8's rule (no new gate without a kept
plant) is not triggered. Each derived fact does need the derivation gated: the console's
`evidence-ladder.test.mjs` pattern — refuse any module that reads the fact another way.

## 5. Decisions — options and a recommendation

**D1 — Where does "live" live?**
- *a. Extend the Overview* (**recommended**). It is the one section permitted to aggregate; the
  five rows are its composition. No new tab, no second dashboard.
- *b. A new "Lane" section.* Rejected: a second aggregator re-creates the ambient-rule violation
  the Overview was carved out to contain.

**D2 — Transport for per-step progress.**
- *a. verify emits NDJSON step events; the watcher relays over the existing SSE* (**recommended**).
  Zero dependencies; one small change in one file; the same stream drives the CLI's human mode.
- *b. WebSocket.* Rejected: a dependency for a one-way stream.
- *c. Run-level only (no per-step).* Acceptable Phase B fallback; loses the moment people come for.

**D3 — A shareable snapshot.**
- *a. `node qa/verify.mjs --html` writes `qa/evidence/latest.html` alongside the receipt, opt-in,
  not committed by default* (**recommended**). One file, no server, attaches to a PR.
- *b. Commit it every run.* Rejected: churn on every lane run.
- *c. Gatekeeper hosts it.* Deferred by standing decision (`gatekeeper-host-deferred`).

**D4 — Rule 0 persistence.**
- *a. framework-check writes a small record* (**recommended**) — it already computes every field.
- *b. Re-run framework-check when the console asks.* Rejected: seconds of latency and a mutation
  of the tree on a page load.

## 6. Phasing

| phase | delivers | needs | cost |
|---|---|---|---|
| **A** | the strip (verdict · rung+pack · age · commit · stale check), *waiting*, the flow rail | nothing new — receipt + human queue + git | small; the page most people will ever see |
| **B** | *now* — per-step rows appended live | D2a: step events from verify, relayed | small; one emitter, one relay, one renderer |
| **C** | *trust* and *ladder* rows | D4a record; the profile's ladder read for its unmet requirement | small–medium |
| **D** | `--html` snapshot (D3a) | A–C | small |
| — | fleet view (many trees, one strip each) | Stage 3's trigger | not now; the strip is designed to tile |

A is worth shipping alone. It answers questions 1 and 3 with no new plumbing.

## 7. What it refuses

Health scores. Pass-rate percentages. Pie or donut charts. "All systems green" banners. Tiles.
Toasts. Auto-scrolling logs. Hand-written status text. Any badge not derived from an artifact.
Green for SKIP. A rung without its pack. A second accent colour. A "dashboard" tab. Rewording
what the lane printed.

## 8. How we know it worked

A stranger given the URL answers questions 1–3 in under ten seconds without scrolling, on a
phone. A failing lane's reason and fix are on screen without a click. The reload count stays at
zero during a run — rows append, the page does not blink. And the fourth report of *"so much
happening all over the place"* does not arrive.

## 9. Residue

- `console-overview.mjs` cites *"STUDIO-REDESIGN.md §3.7"*; no §3.7 exists in that document. The
  front door was added in code and never written into the design of record. Phase A should land
  the section it cites.
- The flow rail's six steps are named in `preview-service.mjs`, not declared anywhere a profile
  could vary. If a stack has no *drive*, the rail must derive that, not assume it.
