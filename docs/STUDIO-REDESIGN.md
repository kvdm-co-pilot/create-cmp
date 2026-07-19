# The studio redesign — design of record (blank slate)

Status: **design of record** · Author: Fable, from a blank slate, 2026-07-19 ·
Supersedes the *presentation* of everything console/docs/content-shaped built
2026-07-18/19. Companion to `VERIFICATION-LAYER-DESIGN.md` (mechanics),
`GENESIS-FLOW-DESIGN.md` (the walk), and the spec-mirror-drift principle:
every section is simultaneously the signed spec, the live mirror, and the
drift surface — the delta between the first two readings IS the third.

**Why this document exists.** The last two days' UI, layout, and content were
produced by long-running Sonnet waves. The verdict of record (Karel): the
results are not at the bar, and the model tier was the cause. This document
is the from-scratch rethink — what the studio *should* be, designed once,
properly — and the execution plan to redo it. Design and content work is
frontier-model work from here on; Sonnet is used only for micro-scoped
mechanical tasks (≤10-line briefs, zero judgment).

**What "redo everything" means precisely.** Everything a human *reads or
sees* is redone from this blank slate: the console (all sections, shell,
layout, voice), the generated docs' prose, the genesis conversation scripts,
component KDoc, clause wording. The invisible mechanics underneath (typed
errors, conformance gates, the stamper, the arch-doc walker, the scan
libraries) were correctness-proven by negative proofs — they get a **hostile
frontier audit** (R7) with keep/fix/rebuild verdicts per unit rather than a
blind rewrite, because redoing proven mechanics without a design reason is
motion, not progress. If the audit finds mediocrity there too, it gets
rebuilt too.

---

## 1. What the console is

The project's **living documentation set**, written in the forms real
specialists hand over, derived from the live tree so it cannot rot, with
approval and drift rendered inside each document. One sentence per audience:

- To the **AI** building the app: the operative build instructions.
- To a **visiting professional**: their own discipline's handover doc,
  instantly navigable.
- To the **owner**: the signing surface and the drift alarm.

The reference feel is a serious internal documentation site — Stripe-docs /
arc42-published / Storybook-Docs-mode calibre — **not** a dev-tool dashboard.
The current tab-row-over-gallery chrome is retired.

## 2. The shell (one, for everything)

```
┌────────────┬──────────────────────────────────────────────┐
│ APP NAME   │  Section title                    [artifact] │
│ exemplar   │  status line: ●signed a1b2c3 · 2h ago · ✎3   │
│            │──────────────────────────────────────────────│
│ ● Intent   │                                              │
│ ● Design   │   The document body — the professional's     │
│ ◐ Archit.  │   artifact, readable measure, generous       │
│ ○ Compon.  │   whitespace, evidence chips in place        │
│ ⚠ Screens  │                                              │
│ ○ Specs    │   [margin: comment affordances on hover]     │
│ ○ Evidence │                                              │
│            │──────────────────────────────────────────────│
│ verify ✓2h │  derived from tree @b2a4339 · 41 facts ·     │
└────────────┴──────────────────────────────────────────────┘
```

- **Left sidebar = the ordering and coverage rail.** Sections listed in the
  six-artifact genesis order, each with its state glyph: ● signed · ○ unsigned
  · ◐ reopened (sanctioned redesign) · ⚠ drifted. The dashboard function is
  ambient and permanent — never a separate tab. Bottom of the rail: last
  verify receipt verdict + age.
- **Header block, identical on every page:** section title, artifact chip
  (short hash · approvedAt · steward), open-comment count. One glance answers
  "what is this, is it signed, has it moved."
- **Typography and color:** system UI stack; a 4-step type ramp; an 8px
  spacing scale; ink/paper neutrals with ONE accent, and semantic
  red/amber/green reserved exclusively for drift/reopened/signed. Readable
  measure (~75ch) for prose; full-bleed only for galleries and diagrams.
  Light + dark via `prefers-color-scheme`. All of this lives in one shared
  stylesheet module — sections may not invent their own chrome.
- **Comments** move to the margin, docs-review style: hover an anchorable
  element → a quiet affordance in the right margin → threaded panel. No
  floating emoji buttons over content. Same ledger, same MCP tools.
- **Evidence chips:** `file.kt:41` as monospace pills at the point of claim.
  Click = copy path. The provenance footer on every page:
  *"derived from tree @<hash> · <n> facts · absence = not derivable"*.
- **Implementation constraint unchanged:** server-rendered pure HTML/CSS,
  zero external dependencies. The redesign is an information-architecture and
  design-system change, not a framework change. One `console-shell.mjs`
  renders the frame; each section contributes only a document body.

## 3. The sections — each one, the professional's artifact

**Every page follows the same grammar:** header block → the document body in
that profession's canonical structure → drift rendered *at the exact spot in
the document where the violated rule lives* → provenance footer. What varies
is only the profession.

**0 · Intent — the product brief** (product strategist's artifact).
Problem, users, jobs-to-be-done, success criteria, glossary — the
working-backwards brief, one readable page. Unfilled sections state
themselves plainly ("Not yet captured — conversation 0 pending"), styled as
the document's own placeholder, not an error box.

**1 · Design language — the designer's handoff spec.**
Token tables with live swatches and the scale's rationale; a type-ramp
specimen rendered in the app's actual tokens; the spacing scale drawn to
scale; a WCAG 2.2 contrast matrix computed from the real token values;
per-token usage counts from the tree. Genesis mode appends the candidates
strip (rendered variants + pick). This is what a design team hands
engineering — not a color-chip gallery.

**2 · Architecture — the lead architect's document.**
Mirrors `docs/ARCHITECTURE.md`'s own section order: quality goals · context
(C4 level 1, clean CSS boxes/arrows) · platform view · building blocks with
the real per-layer inventories · runtime scenarios · crosscutting policies ·
decisions (ADR index). The dependency matrix carries clause chips
(`ARCH-01`…) with their last-receipt verdicts; a violating import draws red
at its exact edge with file:line. The console's own live scan is labeled in
place: *advisory preview — the lane is the law.*

**3 · Components — the platform engineer's library reference.**
Per component, in library-docs order: live render (its states across the
top, from the `@state` preview variants) · signature rendered as a *params
table* (name / type / default / notes-from-KDoc), not a raw code dump ·
state contract and what the component owns (insets, a11y floor, derived
tags) · do/don't · used-in. Approval/drift chips per card. A component the
scanner half-understands shows name + file + an honest "signature not
parsed" — never a guess.

**4 · Screens — the design-review gallery.**
The screen × state matrix: rows = screens, columns = states
(default/loading/empty/error), each cell the live render; row-end chips for
tags/tokens/a11y. Click-through to a per-screen page: render + wireframe +
semantics tree + its spec clauses with receipt status. This is how a design
review is actually run.

**5 · Specs — the QA lead's traceability matrix.**
The RTM as a real document: clause ↔ test(s) ↔ gate ↔ last-receipt verdict,
coverage counts stated at top, withdrawn clauses struck-through and kept,
orphans (either direction) surfaced as the defects they are. No prose
padding — the matrix *is* the artifact.

**6 · Evidence — the SDET's release-readiness report.**
Receipt timeline (newest first): per-step verdicts with honest SKIPs and
their reasons, inputsHash binding vs current tree (stale receipts say
"stale", visually demoted), links from every verdict to the section it
governs. The page a release manager reads before shipping.

## 4. The content bar (applies to every generated word)

1. **Authored form:** each page must read as if its professional wrote it —
   structure, ordering, and vocabulary of that discipline's real artifact.
2. **Evidence-or-silence:** every rendered fact traces to a scan; what can't
   be derived is stated as absent in one standardized form ("Not derivable
   statically — <reason>"). No negative claims from silence, no padding, no
   "comprehensive/robust" filler anywhere.
3. **Drift in place:** violations and staleness render where the rule lives
   in the document — never only in a status bar.
4. Voice is calm and declarative. Short sentences. The document never
   congratulates itself.

The same bar governs the template's generated prose: `ARCHITECTURE.md`,
`CLAUDE.md`, SKILL.md conversation scripts, component KDoc, spec clause
wording. All of it is re-read and rewritten to this bar by the frontier
model in R6 — these words are performed by agents and read by professionals;
they are design surface, not plumbing.

## 5. Execution plan

Frontier model (Fable) designs and writes everything visible. Sonnet
appears only for micro-tasks with ≤10-line fully-mechanical briefs (run this
script, apply this exact diff list, regen these fixtures). Every redo task
ends with the standard independent gate; console tasks additionally get a
browser walk of the rendered page before commit.

| # | Task | Contents |
|---|------|----------|
| R1 | **Quarantine audit** | The three uncommitted closing-wave changesets (approvals doc-hash, Wave D genesis, the killed receipt-status run): hunk-by-hunk frontier review — salvage what passes the bar, revert the rest. Tree returns to a clean, intentional state. |
| R2 | **Console shell** | `console-shell.mjs` + the design system of §2: sidebar rail, header grammar, typography/spacing/color, margin comments, provenance footers. All existing sections temporarily render inside it unchanged. |
| R3 | **Design-language + Components sections** | Rebuilt to §3.1/§3.3. Components is the proof page — it goes to Karel first. |
| R4 | **Architecture + Specs + Evidence sections** | Rebuilt to §3.2/§3.5/§3.6, including receipt-status wiring (the killed agent's scope, redone at the bar). |
| R5 | **Screens + Intent sections** | The state-matrix gallery and the brief page (§3.4/§3.0). |
| R6 | **Template content voice pass** | ARCHITECTURE.md prose, CLAUDE.md, cmp-new conversation scripts, component KDoc, clause wording — reread and rewritten by Fable to §4's bar. |
| R7 | **Mechanical-foundation audit** | Hostile frontier review of EH-1, the conformance gates, the stamper, arch-doc walker, scan libs: keep/fix/rebuild per unit, gates re-run either way. |
| R8 | **Showcase rebuild + review** | Fresh showcase app, console booted, full browser walk, presented to Karel section by section. |

Order: R1 → R2 → R3 → (R4 ∥ R6) → R5 → R7 → R8. Karel's judgment gate sits
after R3 (the proof pages) before the pattern fans out — same discipline the
genesis flow itself enforces: nothing generic ever gets signed.
