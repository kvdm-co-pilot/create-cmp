# The Genesis Flow — design of record

Companion to `VERIFICATION-LAYER-DESIGN.md` (VL). VL built the second half of
the product — verify what was built, sign what you saw. This document is the
first half, built second: **defining the app interactively before the harness
enforces it**. Approved as the product direction 2026-07-19.

## 0. The product

### The gap, named honestly

The verification layer as shipped assumes the governed artifacts pre-exist:
the scaffold decides, the human reviews. On a brand-new app that inverts
ownership — the user is invited to approve *our* taste (a generic palette, a
lorem exemplar, an architecture they never discussed). VL refuses
*cryptographically* vacuous approvals; the genesis flow refuses the
**semantically** vacuous kind: a signature on something the signer never
shaped. The signature is real; the consent isn't.

### The principle

> **Nothing generic ever gets signed.** Every governed artifact reaches
> "approved" through the user's own choices — or through an explicit, visible
> "the defaults are fine", which is itself a recorded choice.

The ordered walk stays, but it becomes a **definition order**, not just an
approval order: each artifact is the vocabulary the next is written in, so
each step is a conversation that *ends* in an approval.

### The walk as six conversations

0. **Intent.** Before anything renders, the agent interviews: what is this
   app, who is it for, which platforms, what brand feel, which reference
   apps, what are the first screens you see in your head? Output: the
   **intent brief** — the root artifact everything else traces to.
1. **Design language.** A workbench, not a swatch grid: 2–3 candidate
   languages (palette + type + shape), each shown **applied to the user's own
   screens**, side by side. The human reacts in their language ("warmer",
   "rounder"); the agent regenerates; the loop runs until "this is mine".
   Approval freezes the tokens. Rule: **choices are shown rendered, never as
   hex codes.**
2. **Architecture.** The harness *is* the opinion here — that's its value.
   This step is comprehension + configuration, not open-ended choice: the
   layer map drawn with *their* feature names, the real decisions surfaced
   (local DB? auth? which tabs?), each reflected in the tree. Approval means
   "I understand and accept this shape for my app."
3. **Components.** From the brief + the frozen design language, the agent
   proposes the component vocabulary *this* app will speak in; the human
   shapes each in place. Once approved, the registry is law: future features
   reuse these or explicitly propose additions.
4. **The exemplar is THEIR first feature.** The exemplar is the DNA every
   future feature is cloned from — it must never stay "home items". Genesis
   writes the spec for the user's *actual* first feature, builds it, verifies
   it with the runtime eyes, approves it — and from then on the stamper
   clones *their* pattern in *their* domain language.
5. **Every next feature** — a spec conversation in the frozen vocabulary
   (the VL walk as already built).

(The shell/navigation is shaped in conversation 2's tab decisions and the
exemplar's rendered screens; it is governed by `app-base.spec.md` + the
exemplar rather than as a separate artifact.)

### Two modes, one console, per-artifact

- **Genesis mode** — artifact fluid; its tab is a workbench (propose →
  compare → react → iterate → approve).
- **Steward mode** — artifact frozen; its tab is the VL surface (drift
  detection, hash-bound re-approval, comments to closure).

An artifact moves genesis→steward the moment it is approved; an app can be
part-fluid, part-frozen. The door swings back deliberately: **reopen for
redesign** returns one artifact to genesis. Redesign is a decision; drift is
an accident — the ledger records which was which.

### Two personas, both honest

- **The prototyper**: express lane — accept all defaults in one visible act,
  recorded as *defaults accepted, unshaped*; build now, walk the definition
  later. The ledger never pretends the defaults were designed.
- **The owner**: the guided walk, because everything agents build afterward
  is governed by what got frozen.

Same artifacts, same gates — different pacing.

### The loop of ownership

**Define interactively → freeze by approval → enforce by hash → observe at
runtime → evolve by comment → reopen deliberately.** The human authors the
standards; the AI builds inside them; the harness holds the receipts.

## 1. Artifact set changes (the contract)

New ordered registry (supersedes VL §1's numbering; `qa/lib/approvals.mjs` is
the single source of truth):

| # | id | files |
|---|---|---|
| 0 | `intent` | `specs/intent.md` |
| 1 | `design-system` | `presentation/theme/Theme.kt`, `Tokens.kt` (unchanged) |
| 2 | `architecture` | `specs/app-base.spec.md` (unchanged) |
| 3 | `components` | `presentation/components/*.kt` (dynamic glob, sorted) |
| 4 | `exemplar-feature` | the 11-file set of the **configured** exemplar |
| 5 | `exemplar-spec` | `specs/<exemplar>.spec.md` |
| 6+ | `feature-spec:<name>` | per non-base, non-exemplar spec (unchanged) |

- **Intent brief:** template ships `specs/intent.md` as a structured seed
  (purpose / audience / platforms / brand feel / reference apps / first
  screens) with placeholder prose clearly marked as unfilled. The cmp-new
  interview fills it. Rendered in the console's Specs tab like any spec file
  (no clause grammar required — prose sections are fine).
- **Configurable exemplar:** `qa/approvals.json` gains a top-level
  `"exemplarFeature": "home"` config key (absent ⇒ `"home"`, so every
  existing ledger keeps meaning what it meant). `approvals.mjs` derives the
  exemplar-feature file set and exemplar-spec path from it by the established
  name pattern (Home→<F> / home→<f> — the same whole-word pattern
  `scaffold-feature.mjs` stamps, so a stamped feature always matches).
  `scaffold-feature.mjs` clones from the configured exemplar too: its rename
  map is generated from the source feature's name instead of hardcoding
  `home`. If the exemplar has grown files beyond the canonical 11, the
  stamper clones the canonical set and **warns, listing what it skipped** —
  never silently.
- **Components as law:** the glob-based hash means adding/changing any common
  component after approval → `changed-since-approval` → gate FAIL until
  re-approved. (A "no one-off components outside the registry" conformance
  gate is deferred, documented in §6.)

## 2. Mechanics

### Express lane
`node qa/approve.mjs --accept-defaults` approves every *resolvable* artifact
in one command, each entry stamped `"mode": "defaults-accepted"`. Unresolvable
artifacts are skipped with the standard refusal printed (never a silent
skip). The console renders these as **approved · defaults accepted —
unshaped** (visually distinct from a shaped approval). A later real approval
(after shaping) clears the mode. Schema stays `cmp-approvals/1` (additive).

### Reopen for redesign
`node qa/approve.mjs --reopen <artifact>` moves an **approved** artifact to
status `"reopened"` (recording `reopenedAt`; refuses unknown ids and
non-approved states — reopening the unreviewed is meaningless). Gate
semantics: `reopened` behaves like `unreviewed` — **SKIP with warning,
non-blocking** — while `changed-since-approval` stays FAIL. That asymmetry is
the whole point: sanctioned redesign never trips the gate; unsanctioned drift
always does. Console: a Reopen control beside Approve on approved rows
(`POST /api/reopen`), same bridge pattern.

### Design-language candidates (variants)
The loop reuses what exists — the preview pipeline renders, the comments
channel decides:
1. Agent writes candidate tokens (edits `Tokens.kt`), preview re-renders.
2. New MCP tool **`snapshot_variant { name }`** stashes the current renders
   under `composeApp/build/previews/variants/<name>/` (plus the variant's
   `design-system.json`).
3. Repeat per candidate; restore or apply as needed.
4. The Design System tab in genesis mode shows a **candidates strip** — each
   variant's screens side by side with a **Pick** button.
5. Pick posts a structured comment (`target {type:"design-system",
   token:"variant:<name>"}` — the token field is required by §7.3's contract
   for design-system targets — text `pick:<name>`, author `human-console`)
   — observed by the agent's existing
   `review_comments { waitForComment }`, who applies the chosen tokens,
   resolves the comment with a note, and walks to approval.
No new decision machinery: pixels flow to the human, the pick flows back
through the comments ledger, consent stays in the approvals ledger.

### Mode presentation
Per-artifact banners derived from status: `unreviewed`/`reopened` ⇒ genesis
(workbench affordances + a one-line "what shapes this artifact" guide);
`approved` ⇒ steward; `defaults-accepted` ⇒ steward with the unshaped badge.
No global mode switch — the per-artifact status IS the mode.

### The genesis walk in cmp-new
The skill's flow becomes: interview (→ `specs/intent.md`) → scaffold
parameterized by intent (tabs, features) → offer the fork: **express lane**
(`--accept-defaults`, build now) or **guided walk** (conversations 1–4 above,
each ending in its approval) → first feature stamped as THEIR exemplar →
`exemplarFeature` set → walk closes. The generated CLAUDE.md documents both
lanes and the reopen contract for in-project agents.

## 3. Build plan: waves, ownership, seams

| Wave | Agent | Scope | Owns | Must NOT touch |
|---|---|---|---|---|
| G1 | **T — template/engine** | §1 registry (intent, components, configurable exemplar), stamper clone-source refactor, §2 express lane + reopen (lib + CLI), seeds, engine tests | `template/qa/**`, `template/specs/intent.md`, `template/.claude/skills/add-feature/**`, `template/CLAUDE.md`, `test/**` | `inspector/mcp/**`, `template/qa/verify.mjs` beyond the reopened-status line |
| G1 | **C — console/mcp** | ORDER_BY_ID + new statuses/badges, genesis/steward banners, Reopen button + `POST /api/reopen`, candidates strip + Pick, `snapshot_variant` tool (25→26), tests | `inspector/mcp/**` | `template/**` (bridge, never fork) |
| G2 | **S — skills/docs** | cmp-new genesis walk rewrite, README/llms.txt/docs/USAGE.md sweep | `skills/cmp-new/SKILL.md`, README/llms/docs | engine internals, template/qa |
| — | Orchestrator | commits per wave, independent gate (suite, scaffold smoke, browser genesis walk incl. pick/reopen/express), PR at the end | — | — |

Library contract additions (binding, mirror §7.3's style):
- `approveAllDefaults(root) -> {ok, approved: string[], skipped: {id, reason}[]}`
- `reopenArtifact(root, id) -> {ok:true, artifact} | {ok:false, reason}`
- `resolveArtifactStatus` entries gain optional `mode` (`"defaults-accepted"`)
  and `reopenedAt`; status enum gains `"reopened"`.
- `getExemplarFeature(root) -> string` (config with `"home"` fallback).

## 4. Definition of done

1. **Registry:** fresh scaffold resolves intent(0) + components(3); legacy
   ledgers without `exemplarFeature` behave identically to before; suite
   green.
2. **Exemplar:** set `exemplarFeature` to a stamped feature → registry
   hashes THAT feature's 11 files + spec; `scaffold-feature.mjs` clones from
   it (proven by stamping a third feature from a renamed exemplar, building
   green); extras-warning proven.
3. **Express lane:** one command approves all resolvable artifacts with the
   mode recorded; console shows the unshaped badge; a later real approval
   clears it.
4. **Reopen:** approved → reopened → lane SKIP-warns (not FAIL); drift on a
   *different* approved artifact still FAILs in the same run; console button
   writes the same ledger the CLI writes.
5. **Variants:** two candidate token sets snapshotted; strip renders both;
   Pick lands in the comments ledger and is observed by a blocked
   `review_comments`; agent applies + resolves; approval closes genesis.
6. **Walk:** cmp-new's rewritten flow rehearsed end-to-end on the showcase —
   interview → intent brief → fork offered → guided path to a shaped,
   fully-approved app whose exemplar is a user-named feature.

## 5. Deferred (documented, not built)

In-console shell reorder/rename UI; structured choice cards beyond
pick-comments; the no-one-off-components conformance gate; per-role/team
approvals; a richer architecture configurator; variant rendering via
theme-override in the Kotlin harness (v1 does sequential token edits, which
is honest and simpler).
