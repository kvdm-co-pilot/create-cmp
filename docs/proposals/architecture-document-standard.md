# Proposal: the architecture document standard for generated apps

Status: **proposal** · Author: principal-architect deep dive · Date: 2026-07-19 ·
Branch context: `feat/verification-layer` (post VL-7 / genesis design of record) ·
Refreshed 2026-07-19 after the **EH-1 wave** landed in the working tree (typed
`AppResult` error handling + threading policy — see §3 rows 8/13 and Appendix A for
what it closed and what it renumbered).

> **The verdict this answers.** User feedback: the current architecture presentation
> "is not industry standard — it looks thrown together, bits and pieces." This document
> defines what a lead architect would actually hand a team as the architecture document
> for a generated app, measures the current state against that bar, and lays out a
> retrofit plan. It proposes **one document standard, three tiers of truth, and four
> retrofit waves** — no code is changed by this proposal.

---

## 0. The thesis, in four sentences

1. The current `template/docs/ARCHITECTURE.md` is a **conventions cheat-sheet grown
   into a policy sheet** (53 lines at first survey; 102 after EH-1 added real
   error-handling and threading policy sections, working tree 2026-07-19) — still not
   an architecture document: it answers "how do I add a feature?" and "how do errors
   travel?", and nothing else a reviewer, auditor, or new senior hire would ask next
   (no context, no quality goals, no platform boundary, no deployment view).
2. create-cmp's genuinely differentiated asset — **spec clauses enforced by conformance
   gates, hash-bound to a human approval** — is exactly the thing most industry
   architecture documents lack, and the current doc barely leverages it.
3. The fix is not "write more prose": prose rots. The fix is a document with **three
   labeled tiers of truth** — *enforced* (backed by a named gate), *governed*
   (hash-bound approved), *advisory* (honest about being unenforced) — with derived
   sections regenerated from the real tree, the same way the console's Architecture tab
   already works.
4. The document is also the **consent artifact** for genesis conversation 2
   (`GENESIS-FLOW-DESIGN.md` §0: "comprehension + configuration, not open-ended
   choice" — approval means "I understand and accept this shape for my app"):
   what the human reads before signing artifact 2 must therefore *be* the architecture
   document, not a spec file they've never opened.

---

## 1. The bar: what a lead architect draws on

Surveyed 2026-07-19. Items marked **[verified]** were checked against the primary
source today; items marked **[recall]** are standard practice cited from professional
knowledge.

### 1.1 arc42 **[verified — arc42.org/overview]**

The de-facto template for pragmatic architecture documentation. Twelve sections:
1 Introduction & Goals (incl. **quality goals**) · 2 Constraints · 3 Context & Scope ·
4 Solution Strategy · 5 Building Block View · 6 Runtime View · 7 Deployment View ·
8 Crosscutting Concepts · 9 Architectural Decisions · 10 Quality Requirements ·
11 Risks & Technical Debt · 12 Glossary. arc42's stance is economy — fill only what
earns its keep — which suits a generated project: we ship the sections that are true
by construction and seed the ones only the owner can fill.

### 1.2 C4 model **[verified — c4model.com]**

Hierarchical views: **System Context → Container → Component → Code**, plus supporting
diagrams (system landscape, dynamic, deployment). Explicitly **notation- and
tooling-independent** — which matters here, because the console renders pure HTML/CSS
(no CDN, no mermaid-js): C4 does not require any particular diagramming tech, so
"structured HTML/CSS boxes derived from a real tree walk" is a legitimate C4 rendering,
not a compromise.

For a single mobile app the mapping is:
- **L1 Context** = the app, its humans, and the external systems it talks to
  (Firebase, the on-device DB, the debug-build inspector endpoint).
- **L2 Container** = the deployable/runtime units: `composeApp` per target
  (Android APK, iOS framework inside `iosApp`, desktop JVM as harness
  infrastructure — repo ADR-0003), plus the Room database and Firebase as backing
  containers.
- **L3 Component** = the layer/package model — what the console's layer map already
  derives.
- **L4 Code** = deliberately not documented (C4 itself calls this level optional and
  usually not worth maintaining; the exemplar feature *is* our code-level view).

### 1.3 ADRs — Nygard practice **[recall]** + MADR **[verified in-repo]**

Michael Nygard, "Documenting Architecture Decisions" (2011): short records with
Context / Decision / Status / Consequences, kept in the repo, never rewritten —
superseded. The repo already practices this well (`docs/adr/0001–0006`, MADR-trimmed
per template ADR-0001). The **generated project gets exactly one ADR** — that is the
gap, not the practice.

### 1.4 ISO/IEC 25010:2023 quality model **[verified — iso.org/standard/78176.html + search]**

Nine product-quality characteristics in the 2023 revision: functional suitability,
performance efficiency, compatibility, **interaction capability** (née usability),
reliability, **security**, maintainability, **flexibility** (née portability), and
**safety** (new). An architecture document that never states its quality goals cannot
justify a single one of its decisions — arc42 puts quality goals in section 1 for that
reason. We do not need the full model: the standard move is to pick the **top 3–5**
characteristics and make them concrete as scenarios.

### 1.5 Android official architecture guidance **[verified — developer.android.com/topic/architecture]**

UI layer + Data layer required, **Domain layer optional**; named principles:
separation of concerns, **single source of truth**, **unidirectional data flow**,
drive UI from data models (offline resilience), DI. Two consequences for us:
- Our template's always-on domain layer is a *stricter* stance than Google's — that is
  a **decision** and should be recorded as one (an ADR), not silently assumed.
- Google's "drive UI from data models" is an offline/process-death argument — a
  *quality scenario* our doc never states, even though the template ships Room and a
  `NetworkMonitor`.

### 1.6 KMP-specific practice **[recall — JetBrains KMP docs]**

The KMP-shaped questions a reviewer asks that single-platform guidance doesn't cover:
what is shared vs platform-specific (source-set map), where the `expect`/`actual`
boundary lies, how iOS interop works (framework export, CocoaPods), and what the
platform entry points are. The template has real answers in code
(`NetworkMonitor`, `DatabaseBuilder`, `TestTagAutomation` expect/actuals;
`MainViewController.kt`/`KoinHelper.kt` for iOS) — and zero words of documentation
for any of it.

---

## 2. Current state — the honest inventory

What a generated app actually ships today (surveyed from `template/**`,
`inspector/mcp/src/lib/architecture.mjs`, `VERIFICATION-LAYER-DESIGN.md` §7.1,
`GENESIS-FLOW-DESIGN.md`):

| Artifact | What it is | Size |
|---|---|---|
| `docs/ARCHITECTURE.md` | ASCII 3-layer box, one UDF paragraph, **error-handling + threading policy sections (EH-1, working tree)**, exemplar how-to, 4 convention bullets | 102 lines |
| `specs/app-base.spec.md` | 8 ARCH + 5 SHELL clauses, Given/When/Then, stable ids (ARCH-06..08 = EH-1's typed-result clauses) | 13 clauses |
| `conformance/ArchitectureConformanceTest.kt` | Dependency-free source-scan gates for ARCH-01…08, SHELL-03, SHELL-05 | 10 gates |
| `conformance/A11yConformanceTest.kt` | Accessibility gates on the rendered exemplar | — |
| `docs/adr/` | ADR-0001 (adopt harness conventions) + template.md | 1 ADR |
| Console **Architecture tab** | layer map (real fs walk), app-base clauses (shared parser), exemplar 11-file shape — all derived, honest empty states | 3 sections |
| Governed `architecture` artifact (#2) | `specs/app-base.spec.md` **only** | 1 file |

And what exists in code with **no documentation surface at all**: `core/`
(connectivity, format), `data/local` (Room: `AppDatabase`, `ItemDao`,
`DatabaseBuilder`), `data/remote` (`FirebaseConfig`, repository impl), four
expect/actual declarations across three platform source sets, the `androidDebug`
inspector HTTP server (a debug-build network listener!), the iOS shell
(XcodeGen + CocoaPods), and the desktop target's harness role.

---

## 3. Gap analysis — brutal, in table form

Rubric: arc42's twelve sections + C4 views + ADR/quality practice, scored against
*everything* the generated project ships (doc + spec + gates + console), not just the
markdown file.

| # | Industry expectation | Current state | Verdict |
|---|---|---|---|
| 1 | **Intro & quality goals** (arc42 §1; ISO 25010 top-N) | `specs/intent.md` seed exists (genesis conv. 0) but `ARCHITECTURE.md` never links it; **zero stated quality goals** anywhere | **Missing.** The doc cannot say *why* three layers, offline-first Room, or testTags exist, because it never states what qualities they buy. |
| 2 | **Constraints** (arc42 §2) | Frozen version set is the harness's core moat (repo `VERSIONS.md`, cmp-upgrade) — the generated doc never mentions it; KMP/CMP choice, min platform versions unstated | **Missing in-project.** The single most binding constraint on the codebase is undocumented where the team works. |
| 3 | **System context** (arc42 §3 / C4 L1) | Nothing. Firebase, Room, NetworkMonitor, the debug inspector server: invisible | **Missing.** A reviewer cannot see what the app talks to. The debug-build HTTP inspector is a *security-relevant* context element shipped silently. |
| 4 | **Solution strategy** (arc42 §4) | Implied ("Clean Architecture, one rule") but never argued | Thin. One honest paragraph would fix it. |
| 5 | **Building block view** (arc42 §5 / C4 L2–L3) | ASCII 3-layer diagram + console layer map (real walk — good) | **Partial, and wrong by omission**: `core/` exists on disk but is absent from the diagram, the spec, and the layer model — the console demotes it to "other packages". The shipped diagram documents a codebase that doesn't quite exist. |
| 6 | **Runtime view** (arc42 §6 / C4 dynamic) | One UDF paragraph | **Missing.** No named scenarios: cold start + DI graph build, load-with-offline-fallback, navigation/back-stack, process death. UDF matches Google's guidance [verified] but is asserted, not shown. |
| 7 | **Deployment view** (arc42 §7) | Nothing. Android APK / iOS framework via XcodeGen+CocoaPods / desktop-as-harness (repo ADR-0003 — *not shipped to the project*) | **Missing.** The iOS build topology is the #1 "how does this even work" question on any KMP team. |
| 8 | **Crosscutting concepts** (arc42 §8) | At first survey: 4 bullets (tokens, testTags, insets, ADR pointer) — no threading, no error handling, no logging, no DI conventions, no expect/actual policy, no persistence/sync policy. **Error handling + threading: closed by EH-1 (working tree 2026-07-19, gradle gate #75 pending)** — `ARCHITECTURE.md` now carries both policies, clause-backed (ARCH-06..08) | **Was the worst prose gap; now half-closed.** Historical finding kept: the original doc asserted nothing about the two questions an AI collaborator asks every session. Still missing: logging, DI conventions (module shape, scoping), expect/actual policy, persistence/sync policy. |
| 9 | **Decisions** (arc42 §9 / Nygard) | 1 generic ADR. The real decisions — Koin over Hilt, Room, GitLive Firebase, always-on domain layer (stricter than Google's optional), fakes-not-mocks, Maestro over Appium (repo ADR-0002), no-Konsist gates (repo ADR-0004) — live in the *harness* repo the project's team will never read | **Missing where it matters.** Decisions exist; the generated project doesn't receive them. |
| 10 | **Quality requirements as scenarios** (arc42 §10) | A11y gates exist (genuinely good) but are cited nowhere as a quality requirement; nothing else | **Missing.** |
| 11 | **Risks & tech debt** (arc42 §11) | Nothing | Missing; acceptable to seed empty with instructions. |
| 12 | **Glossary** (arc42 §12) | Nothing; genesis explicitly builds a domain vocabulary ("their feature names", "their domain language") and then never writes it down | **Missing — and uniquely cheap for us**, since the intent interview already collects it. |
| 13 | **Dependency rules — complete** | ARCH-01 (presentation↛data), ARCH-02 (domain pure); EH-1's ARCH-06..08 govern the *error boundary*, not imports | **Hole in the ruleset itself: still no clause bans `data` → `presentation` or `data` → `di`.** Re-verified against the working-tree `ArchitectureConformanceTest.kt` (gates ARCH-01..08 — none scans data-layer imports; ARCH-08 restricts *catching*, not *referencing*). The one rule the doc states ("dependencies point inward") is only two-thirds enforced. `core/`'s import discipline is entirely undefined. Proposed fix: ARCH-09/10 (Appendix A). |
| 14 | **Doc governance** | The `architecture` artifact hashes `app-base.spec.md` only; `docs/ARCHITECTURE.md` is ungoverned and drift-invisible | **Self-contradiction.** The product's thesis is "drift is an accident, the ledger records it" — and its own architecture prose can rot with no detection. The human "signs" artifact 2 without the doc they'd naturally read being covered. |

### What is genuinely good — keep and build on it

Being brutal cuts both ways; three things here beat most industry architecture docs:

1. **Enforced clauses with stable ids.** `ARCH-01 … SHELL-05` are testable
   Given/When/Then constraints, mechanically enforced, spec-cited from tests
   (`// SPEC:` tags), coverage-checked by the lane. Most companies' architecture
   documents are wishes; this one is (partially) *law*. The target document's spine is
   exactly this: **document the enforced, label the rest.**
2. **The console's derived rendering.** `architecture.mjs` builds the layer map from a
   real fs walk and shares the spec parser with the verify lane — never fabricates,
   degrades honestly. That is the "true by construction" property the whole target
   document should inherit.
3. **The approval mechanics.** Hash-bound sign-off + reopen-vs-drift asymmetry is a
   governance model arc42 §9 can only dream of. The gap is *coverage* (what artifact 2
   hashes), not mechanism.

### The three worst gaps (ranked)

1. **No system-context or platform-boundary documentation at all** (rows 3, 7): Firebase,
   Room, expect/actual, the iOS build topology, and a debug-build network listener are
   all invisible to the person whose approval of artifact 2 is supposed to mean
   "I understand and accept this shape for my app."
2. **The enforced ruleset undersells its own headline** (row 13): "dependencies point
   inward" has no gate on the data layer's imports, and `core/` sits outside the
   documented and governed model entirely.
3. **The architecture doc itself is ungoverned and quality-goal-free** (rows 1, 10, 14):
   the prose can rot undetected in the one product whose thesis is drift detection, and
   no stated quality goals means no section of it can justify itself.

---

## 4. The target document — `docs/ARCHITECTURE.md` standard, v2

### 4.1 Design principles

- **Three tiers of truth, always labeled.** Every normative statement carries one of:
  - `[enforced: ARCH-01]` — a named gate fails the lane if violated;
  - `[governed]` — inside the hash-bound approval, drift FAILs the approvals gate;
  - `[advisory]` — honest convention, no enforcement (yet).
  This is the single biggest "not thrown together" move: the reader always knows
  whether a sentence is law, signed intent, or advice. No industry doc does this;
  create-cmp uniquely can.
- **Derived sections are generated, prose sections are governed.** Anything a tree walk
  can produce (file inventories, expect/actual table, clause table, module map) is
  emitted between markers — `<!-- cmp:generated <section> -->` … `<!-- /cmp:generated -->`
  — by a lane step, exactly the anchor-marker pattern the template already uses
  (`// cmp:anchor`, `<!-- >>> cmp:feature e2e -->`). Hand-maintained prose is limited
  to what only a human/agent conversation can know. The AI-eyes principle applied to
  docs: *structure flows into the document; the human writes only judgment.*
- **arc42 skeleton, trimmed to eight sections.** arc42's own economy rule: a generated
  mobile app doesn't need 12 sections on day one. Sections 4/11 fold into neighbors;
  section 12 (glossary) is seeded by genesis.
- **Length discipline.** Target ≤ 350 lines including generated tables. One screen of
  prose per section. If a section wants more, it's an ADR or a spec, not more prose.
- **Text-first diagrams.** See §4.3.

### 4.2 The section standard

Each section below names the practice that justifies it and the current failure it fixes.

**1. Purpose & quality goals** *(arc42 §1; ISO 25010; fixes rows 1, 10)*
One paragraph linking `specs/intent.md` as the root brief. Then the **top 3–5 quality
goals as concrete scenarios**, each naming its enforcement if any. Scaffold defaults
(genesis conversation 2 edits this list — see §5):

| Quality (ISO 25010) | Scenario | Backing |
|---|---|---|
| Maintainability | An AI session adds a feature; the lane names any layer violation as a clause, not a style nit | `[enforced: ARCH-01..05]` |
| Reliability | A source fails; the failure crosses layers as a typed `DomainError`, never a raw exception, and the screen shows a mapped error state | `[enforced: ARCH-06/07/08 — landed with EH-1]` |
| Reliability (offline) | Network drops mid-session; cached Room data still renders, UI shows degraded state | `[advisory]` today → clause candidate |
| Interaction capability (a11y) | Every interactive element is perceivable by assistive tech and automation | `[enforced: SHELL-04 + A11y gates]` |
| Security | Debug inspector endpoint never ships in release builds | `[advisory]` today → clause candidate |

**2. Constraints** *(arc42 §2; fixes row 2)*
The frozen, lockstep version set (Kotlin/KSP/Compose/Room/AGP move as one; upgrades
via proven-green sets only), KMP/CMP as the platform commitment, min OS versions, and
"the harness contract lives in this repo" (mirror of repo ADR-0001). Mostly static
prose; version numbers referenced from `gradle/libs.versions.toml`, never duplicated.

**3. System context** *(arc42 §3 / C4 L1; fixes row 3 — worst gap #1)*
One diagram + one table: the app; the user; **Firebase** (auth/data, GitLive SDK);
**Room** (on-device SSOT); **NetworkMonitor** (platform connectivity); **the debug
inspector HTTP server** (androidDebug only — explicitly documented as absent from
release); the QA harness (Maestro, preview daemon) as development-time actors. The
table is generated where possible (integrations detected from DI module + gradle deps).

**4. Platform & deployment view** *(arc42 §7 / C4 L2; KMP practice; fixes row 7)*
The KMP source-set map (commonMain / androidMain / iosMain / desktopMain /
androidDebug + test sets) with each set's role; the **generated expect/actual table**
(declaration → per-platform actual file, from a tree walk); iOS topology (framework →
XcodeGen project → CocoaPods → `iosApp`); desktop's honest role (harness
infrastructure, mirror of repo ADR-0003, shipped as project ADR). This section is
mostly `cmp:generated`.

**5. Building blocks — the layer model** *(arc42 §5 / C4 L3; fixes rows 5, 13)*
Today's diagram, upgraded: **`core/` becomes an official layer** ("leaf utilities;
importable by all layers; imports domain at most" — exact rule to be decided in the
clause work, see Wave A), `data` split shown as `local`/`remote`, DI and navigation as
rails. Every arrow in the diagram cites its clause: presentation→domain
`[enforced: ARCH-01]`, domain purity `[enforced: ARCH-02]`, the typed error boundary
`[enforced: ARCH-06..08 — landed with EH-1]`, **data→presentation ban
`[enforced: ARCH-09 — new]`**, core discipline `[enforced: ARCH-10 — new]`. The
file-level inventory under each layer is `cmp:generated` (same walk as the console —
one implementation, two renderings).

**6. Runtime view** *(arc42 §6; Google UDF [verified]; fixes row 6)*
The UDF loop (kept, one paragraph) plus **three named scenarios** in numbered-step
text form: *Cold start* (Application/MainViewController → Koin graph → NavHost →
first tab), *Load with offline fallback* (use case → repository → remote fail mapped
by `suspendRunCatching` → Room cache or typed `AppResult.Failure` → sealed UiState
fold), *Navigate + process death* (state ownership). Text-first;
no diagram tooling required, greppable, reviewable in diffs.

**7. Crosscutting policies** *(arc42 §8; fixes row 8 — half-closed by EH-1; the target
doc absorbs the two landed policies verbatim and adds the four still missing)*
Six short, decisive policies, each tier-labeled:
- **Error handling** *(landed with EH-1 — `ARCHITECTURE.md` "Error handling
  (crosscutting policy)" is ground truth; the target doc keeps it)*: failures cross
  layer boundaries as **typed results, never exceptions**. Sealed
  `AppResult<T>` (`domain/result/AppResult.kt` — deliberately not `kotlin.Result`,
  whose untyped `Throwable` would put raw exceptions back on the boundary) carries a
  sealed `DomainError` kind (`Network`/`NotFound`/`Unexpected` —
  `domain/model/DomainError.kt`; kinds only, no message strings). One-shot repository
  operations declare `AppResult` returns `[enforced: ARCH-06 — landed with EH-1]`.
  `suspendRunCatching` (`data/AppResultCatching.kt`) is the data layer's **only**
  catch mechanism, mapping infrastructure exceptions via its `mapError` classifier and
  **always rethrowing `CancellationException`** — cancellation is never a failure
  state `[enforced: ARCH-08 — landed with EH-1]`. ViewModels contain zero
  `try`/`catch`/`runCatching`: they fold the `AppResult` into a **sealed UiState**
  (`Loading`/`Content`/`Empty`/`Error`, per the exemplar's `HomeUiState`) and map
  `DomainError` kinds to copy presentation-side (`toUserMessage()`) — a raw
  `Throwable.message` never reaches the UI `[enforced: ARCH-07 — landed with EH-1]`.
  The sealed-UiState shape and `toUserMessage()` placement stay `[advisory]`, carried
  by the exemplar and its tests (as the shipped doc itself states).
- **Threading** *(landed with EH-1 — `ARCHITECTURE.md` "Threading (main-safety
  policy)" is ground truth)*: repositories are **main-safe by documented delegation,
  not by ceremony** — every shipped I/O path is main-safe under its own library's
  contract (Room suspend DAO queries run on Room's executor; GitLive Firebase suspend
  APIs wrap async native SDKs), so the template injects no dispatcher. The rule for a
  source with no such guarantee (JDBC, file I/O, heavy parsing): inject a
  `CoroutineDispatcher` via Koin and `withContext` the blocking work — injected, never
  hardcoded; and no ceremonial `withContext` around already-main-safe calls, which
  would hide where the real guarantee lives `[advisory — documented policy, no gate;
  THREAD-01 staged in Appendix A]`.
- **DI:** one Koin module per concern in `di/`; constructor injection only; platform
  modules provide actuals `[advisory]`.
- **Design tokens:** theme catalog only `[enforced: ARCH-05]`.
- **Automation reachability:** testTags on every screen root/interactive element
  `[enforced: ARCH-04, SHELL-04]`.
- **Insets:** solved once in `BaseScreen`/shell `[enforced: SHELL-03, SHELL-05]`.

**8. Decisions & glossary** *(arc42 §9+§12; Nygard; fixes rows 9, 12)*
A generated index of `docs/adr/` + the glossary table genesis seeds from the intent
interview (domain nouns = "their feature names"). See Wave D for ADR seeding.

### 4.3 Diagram strategy — decided honestly

Constraint: the console renders pure HTML/CSS (no CDN, no mermaid-js). Options weighed:

| Option | Verdict |
|---|---|
| Mermaid fences in the .md | **Rejected as canonical.** Renders on GitHub but not in the console or a terminal; two renderers = two truths. |
| Static SVG shipped in template | **Rejected.** Hand-drawn SVG is the fastest-rotting artifact in any repo; contradicts true-by-construction. |
| **Text-first (ASCII boxes + tables) in the .md; live HTML/CSS boxes in the console, both derived from the same walk** | **Adopted.** C4 is explicitly notation-independent [verified]; the console already proves the derived-HTML pattern; ASCII renders identically in terminal, GitHub, diff view, and the console's `<pre>`. One generator (`qa/lib/arch-doc.mjs`) emits both the markdown tables/ASCII and feeds the console's JSON — single source, two projections. |

The only diagrams that exist are ones a tree walk can regenerate (context table, layer
map, source-set map, expect/actual table) or that are stable prose (runtime scenarios
as numbered steps). Nothing is drawn that cannot be verified.

### 4.4 Governance — should the doc itself be governed? Yes, with one precision

Extend the `architecture` artifact (#2) to hash **`specs/app-base.spec.md` +
`docs/ARCHITECTURE.md` with `cmp:generated` blocks stripped before hashing**.

- Why include the doc: the human's consent in conversation 2 is consent to *this
  document*; leaving it ungoverned reproduces the exact "signature without the thing
  signed" problem VL exists to kill (row 14).
- Why strip generated blocks: adding one feature file changes the generated inventory —
  that must **not** invalidate the architecture approval (it would make artifact 2
  un-keepable). Staleness of generated blocks is instead caught by the lane's
  regenerate-and-diff step (Wave B), which is drift detection of the mechanical kind —
  precisely the golden-tree pattern already in use.
- Ledger compatibility: additive file-list change under `cmp-approvals/1`; existing
  ledgers re-resolve to `changed-since-approval` once, which is honest — the artifact
  genuinely grew.

---

## 5. The genesis fit — conversation 2 walks *this* document

`GENESIS-FLOW-DESIGN.md` §0: "comprehension + configuration, not open-ended choice …
Approval means 'I understand and accept this shape for my app.'" The document standard
makes that walk concrete. Order matters — each step produces the vocabulary of the next:

1. **Quality goals first** (§1 of the doc): the agent proposes the default four; the
   human promotes/demotes ("offline matters more than a11y for a field-work app").
   This is the *configuration* input everything later cites.
2. **Context** (§3): the real integration decisions, surfaced as questions with visible
   consequences in the diagram — *Local DB?* (Room stays or the `data/local` branch and
   its expect/actuals go) · *Auth?* (Firebase auth in or out of the context diagram) ·
   *Backend?* — each answer redraws the generated context table live in the console tab.
3. **Shell** (feeds §5/§6): *which tabs?* — the decision the genesis doc already assigns
   to conversation 2; reflected in the layer map's presentation package names.
4. **The layer map with their names** (§5): the console re-renders the walk with the
   user's feature nouns from the intent brief; the clause arrows are read as
   plain-language promises: "your UI will never touch the database directly — the lane
   fails if it does. This is enforced, not aspirational."
5. **The policies** (§7): read-through, each labeled enforced/advisory — informed
   consent includes knowing which promises are mechanical and which are manners.
6. **Approve artifact 2** — now covering spec + doc (§4.4). Every configuration made in
   steps 2–3 that changed the shape gets **an auto-seeded ADR** (e.g.
   `0002-room-local-persistence.md`, status *accepted*, context quoting the intent
   brief) — decisions recorded at the moment they're made, in Nygard form, by the agent.

The express lane (`--accept-defaults`) is unchanged: the doc ships fully valid for the
default shape; the mode badge already records that it was accepted unshaped.

---

## 6. Retrofit plan — four waves

Aligned with the G-wave convention in `GENESIS-FLOW-DESIGN.md` §3 (template/engine vs
console/mcp vs skills/docs ownership; bridge, never fork).

| Wave | Scope | Owns | Cost | Risk | 
|---|---|---|---|---|
| **A — prose + clauses** (template) | Rewrite `template/docs/ARCHITECTURE.md` to the §4.2 standard (static prose, placeholders where Wave B will generate; the EH-1-landed error-handling and threading sections carry over verbatim); **add ARCH-09** (data never references presentation/di) and **ARCH-10** (core import discipline) to `app-base.spec.md` + `ArchitectureConformanceTest.kt`; make `core/` an official documented layer; add the four remaining crosscutting policies (DI, logging, expect/actual, persistence — error/threading already landed); ship project ADRs (desktop-as-harness and Maestro ported from repo ADRs 0003/0002 into the project's universe per the DOCUMENTATION.md two-universes rule; fakes-not-mocks is mandated by the template's CLAUDE.md testing contract but has NO repo ADR today — write it fresh as a project ADR rather than porting one that doesn't exist) | `template/docs/**`, `template/specs/app-base.spec.md`, conformance test | ~1 session | **Low** — new gates could catch latent violations in the template itself (that's a feature); template must pass its own new clauses before shipping |
| **B — generation + governance** (template/qa) | `qa/lib/arch-doc.mjs`: one walker emitting the `cmp:generated` sections (layer inventory, expect/actual table, context table, ADR index); a lane step `archDoc` that regenerates and FAILs on staleness (golden-tree pattern); extend the `architecture` artifact to spec + stripped-doc hash in `qa/lib/approvals.mjs` | `template/qa/**` | ~1–2 sessions | **Medium** — hash-stripping must be deterministic (normalize line endings, marker grammar fixed); ledger migration note required |
| **C — console tab v2** (inspector/mcp) | Architecture tab renders the governed doc's sections (marked-up HTML from the same data `arch-doc.mjs` emits, via the bridge — never fork); dependency **edges** drawn from a real import scan (port of the conformance scan's regex, shared clause ids); per-clause gate status from the last receipt (`qa/evidence/latest.json`); conversation-2 affordances: the context-decision toggles render their consequence live | `inspector/mcp/**` | ~2 sessions | **Medium** — JS import-scan must not *diverge* from the Kotlin gates: same clause ids, and the console labels its scan "advisory preview; the lane is the law" |
| **D — genesis integration** (skills) | cmp-new conversation 2 rewritten to walk §5's order; ADR auto-seeding from configuration decisions; glossary seeded from intent nouns; generated CLAUDE.md points to the doc as the architecture entry | `skills/cmp-new/**`, `template/CLAUDE.md` | ~1 session | **Low** — pure flow/prose; depends on A–C landing |

**Explicit deferrals** (documented, not built — matching the genesis doc's deferral
discipline): C4 L4/code-level rendering; static SVG export; measured performance
budgets (startup-time scenario stays advisory until the harness can measure it);
mermaid anywhere; the threading policy as an *enforced* clause (error handling is
already enforced — EH-1's ARCH-06..08; threading stays advisory until a reliable
dispatcher-literal scan lands as THREAD-01); risks/tech-debt section beyond a seeded stub;
richer architecture configurator (already deferred in GENESIS-FLOW-DESIGN §5).

**Sequencing note:** A is independently shippable and fixes the "thrown together"
verdict on its own. B before C (the console renders what the generator emits). D last.

---

## Appendix A — proposed new clauses (Wave A)

> **Renumbering note (2026-07-19).** This proposal originally assigned these clauses
> ARCH-06 and ARCH-07. The EH-1 wave has since landed and **took ARCH-06/07/08** for
> the typed-result clauses (`app-base.spec.md`: AppResult repository returns /
> no-try-catch ViewModels / suspendRunCatching-only with the cancellation guard).
> Ids are never reused, so the proposed clauses move to the next free ids:

- **ARCH-09** — Given any file in `data`, When its imports and fully-qualified inline
  references are inspected, Then none resolve into `presentation` or `di` (data serves
  domain contracts; it never reaches upward). *Closes the inward-dependency hole — the
  headline rule becomes fully enforced.*
- **ARCH-10** — Given any file in `core`, When its imports and fully-qualified inline
  references are inspected, Then none resolve into `presentation`, `data`, or `di`
  (core is leaf utility code; `domain` at most). *Brings the undocumented layer under
  law.*

Clause candidates staged behind Wave A (advisory first, promote later): DEBUG-01
(inspector server sources exist only in `androidDebug`), THREAD-01 (no
`Dispatchers.Main`/hardcoded dispatcher literals outside injected parameters).
A previously staged ERR-01 ("no empty catch") is **withdrawn as subsumed**: EH-1's
ARCH-08 already forbids any catch mechanism in `data/` other than
`suspendRunCatching`, and ARCH-07 bans catching in ViewModels outright.

## Appendix B — sources

Verified today: [arc42 overview](https://arc42.org/overview) ·
[C4 model](https://c4model.com/) ·
[Android app architecture guide](https://developer.android.com/topic/architecture) ·
[ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) (characteristic list
cross-checked via [Sonar's summary](https://www.sonarsource.com/resources/library/iso-iec-25010-explained/)).
From professional recall (flagged inline): Nygard ADR practice
(cognitect.com/blog/2011/11/15/documenting-architecture-decisions), MADR
(adr.github.io/madr — already cited by template ADR-0001), JetBrains KMP
expect/actual guidance.
