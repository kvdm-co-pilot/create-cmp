# cmp-new — the guided walk (§7)

Read this file only when the user picked the **guided walk** at cmp-new §6. The express lane never
needs it. Section numbers match the references in cmp-new's SKILL.md (§7.0–§7.4); §8 (the reopen
contract) and §9 (the report) stay in SKILL.md.

Contents: the walk's order and principles · 7.0 Intent, plus the provisional palette · 7.0.5 First
feature brief · 7.1 Architecture · 7.2 The exemplar, spec first · 7.3 Design language · 7.4 Components.

## 7. The guided walk — the conversations, each ending in its approval

Walk the artifacts **in registry order** (`node qa/approve.mjs --status` always lists them
in this order) — each is expressed in the vocabulary of the ones before it. For each step:
say what you're about to show and why, do the step, then either they click **Approve** in
the console or — on their confirmed word — you run `node qa/approve.mjs <artifact>`. Block
on each decision with `approval_status { waitForDecision: true }` instead of polling.

The order encodes two principles, one per artifact kind (learned the hard way in the first
full dogfood run): **behavior is spec-first** — the exemplar's clauses are confirmed before
the slice is built; **visuals are UI-first** — the design system and component vocabulary
are *distilled from* the real screens, never locked before them. You cannot judge a palette
on placeholder stubs, and a component library authored before the screens governs the wrong
thing.

### 7.0 Intent — plus the provisional palette
Already written (§4). Show it back to them — the console renders it like any other spec
file (prose sections, no clause grammar). Confirm nothing reads wrong, then approve
`intent`.

Then seed a **provisional palette**: one honest `Tokens.kt` edit toward the brand-feel
words ("calm, trustworthy" → muted blues; "energetic, bold" → high contrast + saturated
accent). Say plainly it is provisional — the design-system *lock* happens in §7.3, on the
real exemplar. Do NOT approve `design-system` now; it stays `unreviewed` until then.

### 7.0.5 First feature brief — the decide step, before any contract

The moment intent is signed, turn the interview's "first screens" answer into the first
feature's **brief**: `docs/features/<exemplar-name>.md` — the feature's decisions and
their why, in the human's domain language, with an **Open decisions** section for every
call that is genuinely theirs. It appears in the console's Features section (directly
after Intent on the rail) as `proposed` the moment the file exists — the rail glyph turns
until they sign. Close the open decisions conversationally, then they approve
`feature-brief:<name>` (console Approve, or `node qa/approve.mjs feature-brief:<name>`).
Signed BEFORE §7.2 writes a single clause — genesis runs the same decide → contract →
build → prove → sign loop the app will live in forever (CHANGE-FLOW-DESIGN.md), and the
one feature every future feature is cloned from must not skip the decide step.

Boundaries: brief only the feature(s) actually being shaped — placeholder tabs earn a
brief when they become real. And on the express lane there is NO brief: never fabricate
decision prose; the Features section shows its honest empty state instead.

### 7.1 Architecture — comprehension, not open-ended choice
The harness *is* the opinion here, and `docs/ARCHITECTURE.md` is the document that opinion
lives in — approving `architecture` hashes it alongside `specs/app-base.spec.md`
(`cmp:generated` sections stripped first, so a later regeneration never invalidates the
approval). Walk the document in **its own section order** — each section is the vocabulary
the next is read in — asking the questions a lead architect asks at project start, not
narrating a diagram:

1. **Quality goals (§1).** Read the four shipped goals in plain language — maintainability
   via the lane's clause gates, typed-error reliability, offline reliability, a11y. Ask:
   does anything rank differently for *their* app ("offline matters more than a11y for a
   field-work app")? A promotion or demotion is a real edit to §1's table, made now, in
   their words.
2. **Constraints (§2).** One line: the version set is frozen and moves as one set; upgrades
   go through `npx create-cmp-cli upgrade`, never a one-off bump.
3. **System context (§3) — the integration questions.** "What does this app talk to?" gets
   answered here for real, using the interview's choices, not re-litigating them. *Local
   DB?* — Room is wired (on-device SSOT) in the `full` shape, or absent in `lean`; point at the
   seeded `docs/adr/NNNN-no-local-room-persistence.md` (see point 7) as the record.
   *Backend and other integrations?* — none is stamped; if the app needs Firebase, say that
   `create-cmp add firebase` (via **cmp-firebase-connect**) adds it next. And the debug
   inspector server (dev-only, never in a release build). Read §3's table together so
   nothing the app talks to is a surprise later.
4. **Shell — which tabs (feeds §5/§6).** The interview's tab list is already live in the
   layer map's presentation package names; confirm it reads right in their vocabulary.
5. **Building blocks, layer by layer (§5) — *their* names.** Walk the layer box top to
   bottom — `presentation → domain ← data`, then `core` (leaf utilities, importable by
   every layer above, never the reverse), then `di` as the wiring rail — reading each arrow
   as the plain-language promise it is, and naming its gate: "your UI never calls a
   repository directly — ARCH-01 fails the lane if it does"; "domain stays pure Kotlin —
   ARCH-02"; "data never reaches up into presentation or di — ARCH-09"; "core never reaches
   into presentation, data, or di — ARCH-10". Once real feature names exist (post §7.2),
   use the intent brief's first-screens vocabulary for the presentation packages, not
   `home`/`profile`.
6. **The policies (§7) — enforced vs. advisory, read straight.** One pass down the
   crosscutting list (error handling, threading, DI, design tokens, automation
   reachability, insets). Each already carries its `[enforced: ...]` / `[advisory]` tag;
   read a few aloud so "which promises are mechanical and which are manners" is explicit.
7. **Decisions & glossary (§8) — point, don't re-decide.** The ADR index is a generated
   table: every configuration choice that deviated from the interview default (minimal
   mode, Room off, iOS off) already has its own numbered ADR, auto-seeded by the
   engine at stamp time (`${CLAUDE_PLUGIN_ROOT}/src/lib/adr-seed.mjs` — deterministic wording and numbering for a
   given config). Point at them as the record of *why* rather than asking the human to
   justify the choice again. A decision not covered by a seeded ADR — something they
   changed by hand later — gets a fresh one from `docs/adr/template.md`.

Before asking for the approval, say plainly what it means: "I understand and accept this
shape for my app," not "I designed it." Approve `architecture`.

### 7.2 The exemplar is THEIR first feature — spec first, then build
The exemplar is the DNA every future feature clones from — it must never stay generic
`home` items. This conversation is **two-phase, and the phase gate is the point**: the
human confirms the behavior before any of it is built (the same discipline `add-feature`
enforces post-genesis — genesis is not exempt from spec-first).

**Phase A — the spec, confirmed before the build:**

1. From the "first screens" answer, agree which one is their real first feature.
2. **Propose the behavior clauses in conversation** — Given/When/Then, in their domain
   words, before any code exists. Iterate until they say yes.
3. Stamp the feature (`node qa/scaffold-feature.mjs <Name>`; add `--entity <Entity>` if
   the naive de-pluralized guess is wrong — confirm the guess first), then immediately
   replace the seeded spec text in `specs/<name>.spec.md` with the confirmed clauses (the
   clause ids stay fixed).
4. Point `qa/approvals.json`'s `"exemplarFeature"` key at it — edit the JSON directly:
   `"exemplarFeature": "<name>"`. The registry's `exemplar-spec`/`exemplar-feature`
   artifacts now resolve to this feature; `home` demotes to an ordinary
   `feature-spec:home` (keep as reference or delete later; either is fine).
5. **Approve `exemplar-spec` now** — before the slice is shaped. That approval IS the
   spec-first gate.

**Phase B — build to the confirmed clauses:**

6. Shape the slice **UI-first on the provisional palette**: the stateless
   `XScreen(state)` over a same-file `sample*` default renders in the preview gallery
   before the ViewModel/data layer exists; the VM-backed `XRoute` wrapper becomes the nav
   destination once the layers land. ARCH-12 guards the seam — sample data never leaks
   into production wiring (see `docs/ARCHITECTURE.md` §7, "UI-first construction").
   Durable tests cite the confirmed clauses (`// SPEC: <ID>`).
7. **Refresh the architecture prose.** Retargeting the exemplar deletes the old feature's
   files, and `docs/ARCHITECTURE.md`'s AUTHORED prose (the §5 walkthrough, §3 tables) still
   names them while the `architecture` approval stays green (generated sections are
   stripped from its hash — correct, but the prose is now a lie). Update the prose to the
   new exemplar, `node qa/approve.mjs --reopen architecture`, and have them re-approve —
   the doc and the tree must agree under a fresh sign-off.
8. Capture the golden baseline fresh — never copied; it must reflect the shaped behavior:
   `UPDATE_GOLDEN=1 ./gradlew :composeApp:desktopTest --tests "*<Name>GoldenTree*"`.
9. Approve `exemplar-feature`.

### 7.3 Design language — the candidates loop, locked on the real exemplar
Now the palette lock has something real to be judged on — the exemplar screens. This is a
working session, not a swatch grid — every choice is shown **rendered on their real
screens**, never as hex codes and never on stubs:

1. Edit `Tokens.kt` toward one candidate direction, starting from the provisional palette
   and the brand-feel words.
2. `preview_status { waitForRender: true }` to confirm it rendered.
3. `snapshot_variant { name }` (e.g. `{name: "warmer"}`) stashes the current renders under
   `composeApp/build/previews/variants/<name>/`.
4. Repeat for 2–3 candidates total, moving `Tokens.kt` to a fresh direction before each
   next `snapshot_variant`.
5. Point the human at the console's Design System page — in genesis mode it shows the
   **candidates strip**: each variant's screens side by side, with a **Pick** button.
6. Block on `review_comments { waitForComment: true }` for their pick — clicking Pick posts
   a `pick:<name>` comment targeting `design-system`. Apply that candidate's tokens for
   real (if `Tokens.kt` isn't already on it), `resolve_comment { id, note }` saying what
   you applied, then approve `design-system`.

If they answer in words instead of clicking Pick ("warmer", "rounder"), that is another
round — regenerate, snapshot, ask again — until they say "this is mine."

**The lock loops back, by design.** If the locked tokens changed the exemplar's rendered
look, regenerate its golden (`UPDATE_GOLDEN=1 …`) and — if the change is structural enough
to invalidate the `exemplar-feature` hash — reopen and re-approve it. Provisional → build →
lock → reopen is the intended co-evolution loop, not a failure.

### 7.4 Components — distill from the screens, then approve
The registry (`presentation/components/*.kt`) starts as the template's starter kit — page
container, header, bottom bar, the loading/empty/error state machine, list row, skeleton,
buttons — but the artifact the human approves must be **the app's real vocabulary,
distilled from the screens that now exist**, not the starter kit rubber-stamped.

Run the distillation (`docs/ARCHITECTURE.md` §7, "Component vocabulary" — the inclusion
rubric and both guardrails live there):

1. Inventory every composable the screens define outside `components/` (the console's
   Components page lists them — the promotion queue — with cross-feature use counts).
2. **You make the rubric call for each — this is reasoning, never a mechanical
   threshold.** (No similarity metric can make this call: on the reference showcase, a
   true near-identical pair and a legitimately-different pair scored within 0.05 of each
   other.) Weigh the five questions for every entry:
   1. *Design-system decision or feature decision?* How the product presents something
      (ring/bar/tile/chip) → govern; how one screen arranges its data → local.
   2. *Stable/obvious or speculative?* Govern well-understood shapes; never invent a
      shape ("unify these rows") that doesn't exist.
   3. *Would uncontrolled divergence hurt?* Visible inconsistency if every screen
      reinvented it → govern; divergence fine → local.
   4. *Cross-cutting concern worth enforcing once?* a11y floor, token binding — earns
      membership independent of reuse count.
   5. *Cost of being wrong, both directions, for THIS thing?* Cheap-to-change stable
      primitive → bias govern; likely-to-diverge, feature-coupled → bias local.
   Reuse count is a *signal* feeding 2 and 3, never the rule. Resolutions: promote, keep
   local, generalize first (a domain-named composable like `MacroTag` is a smell — it
   becomes a real primitive like `Tag`, or stays local), or **unify locally** (two
   near-identical same-screen rows become one local composable — unification is not
   promotion). Guardrails: **never force similar-but-different shapes into one
   component** (over-parameterized god-components are worse than duplication — when in
   doubt, keep them separate), and check the registry *before* rolling anything new.
3. Implement the promotions — each moved into `presentation/components/`, each with a
   story in `ComponentStories.kt` (the `componentStories` lane step fails on a missing
   one).
4. Present the decided registry with one-line reasoning per call, walking the starter
   pieces too (rename `EmptyState` copy into their domain language, confirm `AppHeader`
   typography, etc.).

The human's move is the **approval** — ratify, reshape, or reject your calls; they are
never interrogated composable-by-composable. Once approved, the registry is law: any
component added or changed afterward invalidates the approval (`changed-since-approval`)
until a human re-approves. Approve `components`.
