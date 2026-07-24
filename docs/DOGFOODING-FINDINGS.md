# Dogfooding findings — harness & plugin fixes

A living log of create-cmp **harness / plugin** defects and improvements surfaced by building
real apps on top of it. Each item: what's wrong, the evidence, the proposed fix, and status.
This is the fix backlog for the engine/template/console — **not** showcase-app work.

> Source run: **Fuelled** showcase rebuilt end-to-end on create-cmp-cli@0.9.0, 2026-07-23/24 —
> genesis walk → Room-backed exemplar → three more features (all spec-first) → on-device e2e →
> live walkthrough. Final state committed at showcase `87d072a` (9/9 approved, lane green on-device).
> The showcase is the flagship demo; every rough edge it hits, a real user hits first.

Severity: **P1** = blocks/embarrasses a new user out of the box · **P2** = real friction, workaround exists · **P3** = polish.

---

## Design quality — the template ships sub-premium defaults

The single biggest finding: **a fresh scaffold's first `preview` does not look like a product.**
That reaction ("this is not premium … wtf is the back button") came from a real user seeing
the raw stubs. The template's defaults set the ceiling for what people believe the tool makes.

- **[P1] AppHeader back affordance is a text link, not Material.**
  `template/composeApp/**/components/AppHeader.kt` renders `AppTextButton("← Back")`. Reads
  cheap and is not Material Design. **Fix:** ship a Material `IconButton` +
  `Icons.AutoMirrored.Filled.ArrowBack`, 48 dp, rendered only when `onBack != null` (never on
  a tab root). *Proven in Fuelled; port to template.*

- **[P1] Material 3 `IconButton` defaults to 40×40 — below the 48 px touch-target floor.**
  Any raw `IconButton` fails the harness's **own** `audit_a11y` (`touch-target-too-small`,
  40×40). This is almost certainly why the template dodged a Material back button with a text
  link. **Fix:** ship an `AppIconButton` in the component vocabulary that enforces 48 dp (the
  way `AppButton` already does for filled/text buttons), so icon buttons are a11y-safe by
  construction. Evidence: AppHeader story + detail both regressed to 1 violation until an
  explicit `Modifier.size(48.dp)` was added.

- **[P1] Default tab screens are bare `PlaceholderScreen` stubs.**
  Today/Foods/etc. render "This is a generated stub tab." The first thing a user previews looks
  like a form, not an app. **Fix:** ship a genuinely designed exemplar (a real dashboard-style
  home with a data-viz element) so the first render reads as a product. This is the root cause
  of the "not premium" reaction.

- **[P2] No brand/logo primitive.**
  A new app has no mark; "we need a logo" is an unguided gap. **Fix:** ship a `BrandMark`
  placeholder component (a drawn mark + wordmark) and a header slot for it, so branding is a
  guided step. *A working reference exists: Fuelled's `presentation/brand/FuelledLogo.kt`
  (Canvas bolt badge + wordmark).*

- **[P2] Type ramp is thin.**
  `rememberFuelledTypography()` ships only 6 styles. A data-forward app needs display/headline/
  title/body/label at several sizes with real tracking on the big numerics. **Fix:** ship a
  fuller ramp as the default. *Reference: the 12-style ramp built for Fuelled.*

## a11y audit correctness

- **[P1] Touch-target audit doesn't discount scroll-clipped nodes.**
  A `LazyColumn`'s last partially-visible row (clipped by the viewport bottom) is measured at
  its **clipped** height and fails `touch-target-too-small`. **Every real list screen hits
  this.** Evidence: Fuelled Foods list — a full-height row reported 371×**36** px at the 891 px
  fold → 1 false violation; "fixed" only by trimming sample data so nothing bisects the fold.
  **Fix:** in the a11y audit (`template/qa/lib/a11y.mjs` and the inspector's `audit_a11y`), skip
  or relax the touch-target check for nodes clipped by an ancestor scroll container (judge the
  node's full composed height, not its visible slice).

## Console / studio UX

- **[P2] Shell title uses the project directory name, not the app name.**
  Console reads "create-cmp-showcase · studio" instead of "Fuelled · studio". **Fix:** derive
  the shell app label from `rootProject.name` / the engine's `appName`, not the directory
  basename.

- **[P2] Design-language candidates strip hides the live-matching variant.**
  The variant whose `design-system.json` equals the current live tokens is omitted, so you can
  never see all N candidates side-by-side — you must revert live to a neutral state to compare
  them all (had to do exactly this in the walk). **Fix:** render every snapshotted variant and
  badge the current one as "current" rather than dropping it.

- **[P2] Type ramp is not a governed token.**
  Design-language page: "Type ramp — Not derivable statically — the design-system catalog
  carries no typography tokens." Typography is invisible to approval/drift. **Fix:** emit
  typography into the design-system catalog (inspector `designToken` self-report or a static
  extractor) so the ramp is a first-class, drift-checked artifact.

## Build / eyes reliability

- **[P1] MCP-spawned Gradle (preview service) can't find `JAVA_HOME`.**
  First render failed ("BUILD FAILED in 11s") until `JAVA_HOME` was hand-injected into
  `./gradlew` line 2. Recurring across sessions. **Fix:** the preview service/daemon must
  propagate `JAVA_HOME` (or resolve a JDK via `org.gradle.java.home` / a Gradle toolchain) so
  the eyes work on a fresh clone with zero hand-editing.
  - **[P1, sharper — the workaround mutates a *tracked* file.]** The de-facto fix in play is an
    `export JAVA_HOME=…  # LOCAL DEV: MCP-spawned gradle JAVA_HOME (do not commit)` line injected
    at the top of the **committed** `gradlew`. That leaves the repo *permanently dirty* (a
    verify-lane `inputsHash` always lists `gradlew` as dirty) and is one `git add -A` from
    shipping a machine-specific path into the template — the "do not commit" comment is the only
    guard. The JDK resolution must **never** touch a tracked file: use env propagation to the
    spawned process, or a **git-ignored** `gradle.properties`/`local.properties`
    (`org.gradle.java.home`), so a clean checkout stays clean.

- **[P1] Preview daemon ↔ verify lane collide — the core loop can't run both without hand-juggling.**
  The preview service (the eyes) and `qa/verify.mjs` (the gate) both spawn Gradle against the
  same project and share `composeApp/build/kspCaches/…`; KSP's incremental storage is a single
  mutable dir, so two concurrent invocations throw
  `Storage for [...symbolLookups/file-to-id.tab] is already registered` → `render-failed` /
  lane FAIL. Aggravators: the lane **forces `--rerun-tasks`** (re-runs KSP), and a stale Gradle
  daemon can hold the storage lock. Hit **4×** this session; each time the only recovery was
  manual `preview_stop` → `./gradlew --stop` → `rm -rf composeApp/build/kspCaches` → run lane →
  restart the preview. That manual dance is undiscoverable and defeats the "eyes + gate always
  on" promise. **This must be automated in the harness.** Fix, in order:
  1. **Isolate (structural, primary).** The preview daemon runs Gradle with a dedicated build /
     KSP cache dir (e.g. a separate `--project-cache-dir` / Gradle user home / `buildDir`), so it
     never shares `kspCaches` with the lane → the two **coexist**, no stop/start.
  2. **Self-heal (cheap backstop).** Both the preview service and `qa/verify.mjs` catch this exact
     error, `rm -rf composeApp/build/kspCaches`, and retry once. Proven to work this session.
  3. **Coordinate (if isolation is deferred).** The harness owns both, so `qa/verify.mjs`
     auto-pauses the preview daemon for the lane's duration (or the daemon skips renders while a
     `build/.cmp-lane-in-progress` marker is set), then resumes — zero manual juggling.
  **Acceptance:** `node qa/verify.mjs` runs to green while the preview daemon is live and
  rendering, with **no** manual stop/start and no KSP collision; a deliberately-forced collision
  self-heals and still passes.

## Release / tooling

- **[P2] `npm version` doesn't bump `plugin.json` / `marketplace.json`.**
  The version-lockstep test caught package.json@0.9.0 vs the two manifests still at 0.8.0; the
  publish aborted mid-flight (caught by `prepublishOnly`, nothing shipped). **Fix:** the
  npm-publish flow (or a `version` npm script / preversion hook) must bump all three manifests
  atomically.

- **[P3] Installed-plugin cache update is fully manual.**
  Moving the installed plugin 0.6.1 → 0.9.0 needed hand-editing `installed_plugins.json` plus
  `git archive` of a new version dir; the marketplace clone auto-refreshed but the installed
  plugin did not. (Plugin-platform surface, not create-cmp proper — noted for completeness.)

## Genesis-flow design insight — the design-system ↔ screens ordering [P1, headline]

**The walk asks you to lock the design system before any real screen exists.** You swatch
palette candidates on empty `PlaceholderScreen` stubs, which are unjudgeable and read as "not
premium." We resolved it only by *skipping* design-system, building the real screens, and
coming back — at which point the palette was a **one-line token swap**. That is the tell.

**Diagnosis — not chicken-or-egg, but *substrate + order*.** A design system is *extracted
from* an exemplar, not authored before one; tokens are the last thing to freeze, not the
first. Two separable defects:

1. **Substrate:** nothing real to render candidates on (stubs). → *Ship a designed exemplar.*
2. **Order:** the token *lock* is demanded before the exemplar exists. → *Lock after.*

**Recommendations (in priority order):**

1. **[P1] Ship a real, designed exemplar in the template (not stubs).** Fixes the chicken-egg
   *and* the "not premium" first impression at once: the design-language conversation always
   has a representative real screen to render candidates on — the egg ships in the box.
2. **[P1] Reorder so the design-system *lock* follows the exemplar.** Seed a *provisional*
   palette from intent's brand-feel words; sequence
   `Intent → Architecture → Components → Exemplar (on provisional palette) → Design-system
   (pick + lock on the real exemplar) → Specs`. Use the **existing reopen contract** to
   re-approve the exemplar if the lock changed its look. Sequencing change, not new machinery.
3. **[P2] Candidates render on the exemplar + component gallery, never blank tab stubs** — both
   always exist by that point.
4. **Governance stays intact.** This is order + substrate, not weaker approval. The walk should
   model the tokens↔screens co-evolution as a **loop** (provisional → build → lock → reopen),
   not a line.

Evidence: the entire Fuelled build — screens first, palette locked as a trivial token swap
afterward — is the natural order the flow should encode.

- **[P2] Golden-tree regen ergonomics when a screen is redesigned.**
  Redesigning a screen invalidates its golden tree; the "accept the new golden"
  (`UPDATE_GOLDEN=1 ./gradlew :composeApp:desktopTest --tests "*XGoldenTree*"`) loop should be
  documented and surfaced in the preview→approve flow, not folklore.

## Codify the UI-first pattern (stateless screen over a preview sample) [P1]

The Fuelled build worked by writing screens as **stateless composables with a `sampleX`
default** (`TodayScreen(model = sampleToday)`), rendering them in the preview gallery with zero
ViewModel/Room wiring, and deferring the data layer. **This pattern is the mechanism that makes
the corrected genesis flow possible** — "screens before the design-system lock" only works if a
screen can exist before its data layer. It deserves to be first-class in the harness.

Codify with substance (not "prefer stateless" prose):
1. **Stateless screen** — `XScreen(state, onEvent)`, owns no data (the exemplar already is this).
2. **Preview seam** — a `sampleX` default so it renders in the gallery before a ViewModel exists.
3. **Wiring obligation** — the sample default is scaffolding; the screen must end up ViewModel-driven.
4. **The hazard → a GATE.** Sample/fixture data must NOT be referenced by production wiring; it
   lives in preview/test sources only. Proposed clause (ARCH-12): *"a `sample*`/fixture symbol is
   never referenced outside the preview registry or test sources."*

**Evidence the gate is real — Fuelled violates it right now:** `sampleFoods` sits in `commonMain`
and `AppNavHost` reads it directly for the Food-detail route
(`sampleFoods.firstOrNull { it.id == foodId }`) — fake data driving production navigation. The gate
would have caught it; it resolves when Foods becomes the Room-backed exemplar.

**Where:** template `ARCHITECTURE.md` §7 (advisory policy) + one conformance clause (the anti-leak
gate) + demonstrated in the exemplar. Fold into the genesis-flow-fix task — the flow reorder and
this pattern are two halves of one idea (UI-first construction).

## Exemplar feature is built before its spec — genesis order violates spec-first [P1]

The harness's own first law (`CLAUDE.md`): *"New behavior begins as a spec clause… propose the
clause, get it confirmed, then implement."* But the genesis definition order sequences
**`exemplar-feature`(4) BEFORE `exemplar-spec`(5)** (confirmed in `template/qa/lib/approvals.mjs`
and `docs/GENESIS-FLOW-DESIGN.md`). So building the showcase exemplar means writing the entire
vertical slice (VM/repo/Room/tests) before any behavior clause is proposed or confirmed — the exact
inversion of the harness's core discipline, committed by the exemplar itself (*the* teaching case
for spec-first).

**Root cause — a conflation.** The feature-before-spec order is harmless *when the exemplar ships
pre-built with its spec* (`home` + `home.spec.md` as canned DNA — genesis just *retargets* a
coherent pair, nothing is built-before-spec). It breaks the moment genesis is used to **define a new
first feature from scratch** — which is the actual genesis use case ("run me through the wizard,
build my app"). The flow treats "retarget the canned exemplar" and "define my real first feature" as
the same step; only the first is safe under this order.

**The synthesis with the [distilled-from-screens] reorder finding below.** Two corrections to the
naïve linear order, in *opposite* directions, each following the right principle for its artifact
type:
- **Visual artifacts are UI-first** — `design-system` + `components` move *after* the screens
  (distilled *from* them). ← the components finding below.
- **Behavioral artifacts are spec-first** — `exemplar-spec` moves *before* `exemplar-feature`
  (the feature is written to satisfy confirmed clauses; its tests cite them). ← this finding.

**Fix:** the exemplar/first-feature step must be **spec → confirm → build → approve** — the behavior
clauses are proposed and human-confirmed *before* the slice is implemented, even in genesis. Either
reorder the governed artifacts (`exemplar-spec` before `exemplar-feature`) or make the walk's
exemplar step explicitly two-phase with the spec gate first. `add-feature` (post-genesis) already
does the right thing (seeds spec `unreviewed`, prompts to author clauses before wiring) — genesis
must match it.

**Does the currently-scoped genesis-reorder fix catch this? NO.** The deferred genesis-flow task
only moves `design-system`/`components` after the exemplar; it does **not** touch the
feature-before-spec sequencing. Spec-first-for-the-exemplar must be *added* to that task or the next
app hits this again. **This is the direct answer to "will the fixed harness still run into this?" —
not as scoped; only once this is folded in.**

**Reference (Fuelled):** the exemplar build wrote the Foods slice code-first and drafted
`specs/foods.spec.md` (FOODS-01…08) *alongside* the code — a clean spec, but never proposed/confirmed
first. Recovery path: treat the draft as the *proposal*, confirm the clauses with the human, conform
the (provisional) code to whatever is confirmed, then approve `exemplar-spec` **then**
`exemplar-feature`. The final artifact pair is order-agnostic; the *process* gate (human confirms
behavior before it's built) is what was skipped and must be restored.

## The live device view (`/inspect/remote`) is criminally under-documented [P1 — Karel: "critical, it's amazing"]

`connect_live` returns a `remoteUrl` (`http://127.0.0.1:9500/inspect/remote`) — a self-contained
browser page that mirrors the running device ~every 700ms and **click-to-tap drives the real app**
(clicks scale to device px → `POST /inspect/tap`). The human watches and drives the actual app from
a browser while the agent asserts on the tree — the "two audiences, one app" story in its purest
form. Karel's reaction on first contact: *"THIS FEATURE needs to be much more clearly documented on
the harness !!!! critical it's amazing!!"*

Today it surfaces only as a field in a tool result + a paragraph mid-way through the cmp-inspect
SKILL. Nobody finds it unless the agent happens to mention it. **Fix — make it a headline, not a
footnote:**
- README (harness + generated-project): a top-level "Watch and drive your app live from a browser"
  section with a screenshot/GIF — this is a marquee demo-able feature, front-door material
  alongside the preview gallery.
- Generated `CLAUDE.md`: the dev-loop section tells the agent to OFFER the remoteUrl whenever
  `connect_live` succeeds (it's in the tool result's hint, but the doc should make it a standing
  step, not a maybe).
- Console: when the live tier is connected, the studio should link to the remote view prominently
  (a "Live device" button/badge), so the human reaches it from the UI they already have open.
- cmp-qa-prep / e2e docs: mention it as the way to *watch* an e2e run.
- Launch content: this belongs in the demo GIF / Show HN pack — it is the most visceral "agent has
  eyes AND you keep yours" moment the harness has.

## `render_screen {kind:"live"}` serves a STALE cached frame — screenshots lie [P1]

During the full-app run-through, `render_screen { source:{kind:"live"} }` returned **byte-identical
PNGs** (same md5, same 186702 bytes) for two different screens (Today, then Foods after a proven
`navigate_and_inspect` tab change), while an independent `adb exec-out screencap` at the same moment
captured the correct, different frame. So `/inspect/screenshot` (or the MCP's handling of it) serves
a stale/cached first frame — every capture after the first silently shows the first screen's pixels.
Structural tools (`inspect_tree`, `navigate_and_inspect`) reflect the CURRENT screen correctly — the
bug is confined to the live pixel path. Dangerous failure mode: pixels are for the human, and these
lied while looking plausible; only a hash-compare caught it. **Fix:** make `/inspect/screenshot`
capture fresh per request (no caching, or cache-bust with a timestamp param); the MCP should also
never reuse a previous HTTP response body across calls. Add a regression proof: navigate → capture
→ navigate → capture → assert the two PNGs differ (hash), wired into the inspector's own tests.
Workaround until fixed: `adb exec-out screencap` for live pixels; the remote view (`/inspect/remote`)
refreshes correctly (~700ms poll) and was not observed stale.

## SHELL-05 conformance matcher is blind to `*Route` nav destinations [P2]

SHELL-05 ("nav destinations wrap `BaseScreen`") keys its source scan on `*Screen(` call sites. When
a feature splits into a stateless `FoodDetailScreen(...)` (preview seam) + a VM-backed
`FoodDetailRoute(...)` (the actual nav destination), the *destination* is the `Route`, which the
regex never inspects. The invariant still HELD in Fuelled (FoodDetailRoute does wrap `BaseScreen`),
but the gate passed **vacuously** — zero offenders because it looked at nothing, not because it
verified the wrap. As the `*Route` seam becomes the norm (it is how the UI-first preview pattern
wires VM-backed destinations — see [UI-first]), this blind spot widens. **Fix:** widen the SHELL-05
matcher to inspect nav-graph destinations (`composable(...) { XRoute() }` / the `Route` composables)
regardless of the `Screen`/`Route` suffix, so it actively asserts the wrap rather than skipping it.

## Retargeting the exemplar leaves `docs/ARCHITECTURE.md` authored prose stale while the approval stays valid [P2]

When genesis retargets the exemplar (`home`→`foods`, deleting the old `Item`/`home` files), the
`architecture` approval stays green — correctly, because `cmp:generated` sections are stripped before
hashing, and only the generated `layer-file-inventory` marker was regenerated. But the **authored
prose** still names the deleted exemplar (`ItemDao`, `ItemRepositoryImpl`, the `home` feature) — so
the approved document now describes a tree that no longer exists. The hash says "approved"; the
content is a lie. This is [spec-mirror-drift] in the authored layer, which no gate catches (by
design — authored prose is human's to change). **Fix:** the genesis exemplar-retarget step must
prompt an authored-prose refresh of `docs/ARCHITECTURE.md` (the §5 exemplar walkthrough, §3 tables)
and a `--reopen architecture` → re-approve, so the doc and the tree agree under a fresh sign-off.
The agent correctly refused to silently edit approved bytes; the flow must make the refresh an
explicit, human-gated step rather than leaving it to be noticed.

## A realistic exemplar exceeds the canonical "11-file" clone shape — the stamper under-clones it [P2]

The exemplar is meant to be the DNA `add-feature` clones. But a *realistic* first feature is richer
than the canonical 11-file skeleton: Foods (a searchable catalog **with a detail**) landed **three**
use-cases (`GetFoodsUseCase`, `SearchFoodsUseCase`, `GetFoodUseCase`) and **two** ViewModels
(`FoodsViewModel` list + `FoodDetailViewModel`) — legitimately, each is a distinct business action.
Per the template's own `CLAUDE.md`: *"if the configured exemplar has grown files beyond the canonical
11-file shape, the stamper clones the canonical set and warns, listing exactly what it skipped."* So
the moment the exemplar is a real feature, `qa/scaffold-feature.mjs` **under-clones** it — a new
feature gets one use-case + one ViewModel and silently loses the list+detail / search sub-pattern
that made the exemplar worth pointing at. The "11-file set" framing (still printed by
`approve.mjs --status`: *"foods — the 11-file set the stamper clones"*) is the tell — it describes a
skeleton, not the DNA we actually want propagated. **Fix (needs a decision):** either the stamper
clones the exemplar's *actual* file set (not a fixed canonical subset) — so detail/search patterns
carry — or the walk explicitly teaches that the exemplar is a *pattern reference to read*, not a
literal clone source, and the stamper stays skeleton-only. Right now it silently does the narrow
thing while the docs imply the broad one. (Verify the exact skip behaviour against
`qa/scaffold-feature.mjs` before implementing.)

## Components are pre-frozen, not distilled from screens [P1]

The `components` step (§7.3) governs only the template's **starter kit**; the real component
vocabulary the screens are actually built from is invisible to it. Same chicken-egg as the design
system, one level up: **a component library is distilled *from* screens, not authored before
them.** The Components-before-screens walk order governs the wrong thing and is structurally blind
to what got built.

**Evidence (Fuelled):** the registry governs **12** starter components, but the four screens
contain **~20 ungoverned composables** — `CalorieRing`, `MacroBar`, `StatTile`, `MacroTag`,
`FoodRow`, `SupplementRow`, `EntryRow`, `GoalRow`, `SettingsRow`, `HeroCard`, `MealCard`,
`TakenSummary`, `Divider`, … none in the registry → none approved, drift-checked, or storied.

**Active drift, not just a gap:** the screens **hand-rolled 5 different list rows**
(FoodRow/SupplementRow/EntryRow/GoalRow/SettingsRow) and their own `Divider` — **bypassing the
governed `ListItemCard` entirely**. The one row component that already existed was reinvented five
times. Building UI-first without a distillation step actively *fragments* the design system.

**Fix — three parts:**
1. **Reorder: `components` moves after the exemplar** (alongside `design-system`). Both are
   "distilled from the real screens" artifacts — this extends the genesis-flow reorder finding to
   cover components too.
2. **A distillation step** after building screens. Classify each inline composable against the
   inclusion rubric below (*What counts as a component*):
   - **Promote** a clean, genuinely-reusable primitive (ring/bar/tile/chip) → move into
     `presentation/components/` + a story → enters registry/approval/drift. What earns promotion is
     the five-part rubric, **never a bare reuse count**. (Rows are the counter-example — see the
     guardrail: genuinely-different shapes stay local.)
   - **Keep local** (a one-off composition of registry components for a single screen).
   - **Reuse first** — check the registry *before* rolling a new component (this is where "you
     hand-rolled 5 rows; `ListItemCard` exists" gets caught).
3. **Make the gap visible + gated:**
   - **Console:** the Components page lists *"composables used in your screens but not in the
     registry"* — a promotion queue that turns the invisible gap into an actionable surface
     (analogous to the existing componentStories parity gate).
   - ~~**Conformance clause(s):** flag cross-feature duplication / re-invention mechanically.~~
     **WITHDRAWN 2026-07-24, empirically.** Similarity metrics were measured against the real
     Fuelled corpus while implementing: symmetric LCS-over-tokens scores the true near-identical
     pair `GoalRow↔SettingsRow` at **0.776** and the legitimately-different `TakenSummary↔MealCard`
     at **0.734** — no threshold separates them (bag-of-tokens inverts them outright). A mechanical
     duplication gate is therefore *structurally* the bug the guardrail below warns about. The
     duplication surface is the console **promotion queue** (inventory + signals, no verdicts) and
     the classification is the **agent's rubric reasoning** in the distillation step, ratified at
     the Components approval — per Karel, in-session: "the agent must reason on components here,
     it's not a simple gate."

**Promotion heuristic:** superseded by *What counts as a component — the inclusion rubric* below.
Do NOT use a bare "≥2 uses" or "it's a primitive" shortcut in isolation — the five-part rubric is
the rule, and reuse count is only one signal feeding it.

**⚠ CRITICAL GUARDRAIL — do NOT force reuse (a first-class rule, not a footnote).**
Forcing genuinely-different composables into one over-parameterized component is a **worse**
antipattern than duplication: it produces god-components with leaky, ballooning parameter lists
(leading slot + trailing slot + toggle + chevron + tags + value…) and hidden coupling that causes
lasting headaches. **When in doubt, keep them separate.** "Both are rows" / "both are bars" is *not*
sufficient reason to unify — only genuinely near-identical shape AND behavior is. The distillation
step must **bias toward leaving things separate** and promote only clean, genuinely-reusable
primitives. This reframes the "5 rows bypassed ListItemCard" evidence above: that is real drift
*only* for rows that are genuinely identical to `ListItemCard`; rows that differ meaningfully
(macro-tags vs. a toggle vs. a chevron+value) are **correctly** separate, and must be left so.
**Corollary for the gate (critical):** the cross-feature-duplication / re-invention clause flags
**only near-identical copies** (true copy-paste of shape *and* behavior), **never**
similar-but-different composables — otherwise the gate itself pushes authors toward the
over-abstraction antipattern it is meant to prevent. A gate that nags "you have two rows, unify
them" is a bug in the gate. Also surface this rule in the walk's distillation prose and in
`docs/ARCHITECTURE.md` §7, so humans and agents are told plainly: **prefer separate over forced.**

**Reference implementation — IMPLEMENTED in the showcase at commit `67443f9`**
(create-cmp-showcase; diff `360aa8f..67443f9` is the exact before/after, verify lane green):
- **Promoted** (into `presentation/components/*.kt`, each with a story in
  `desktopMain/**/ComponentStories.kt`): `ProgressRing` (from `CalorieRing`), `StatBar`
  (single-fill labeled bar; label/value are *optional* adornments of the SAME shape),
  `StatTile`, and `Tag` — the last **generalized from a domain-named `MacroTag`** once the rubric's
  "a domain-named component is a smell" rule was applied (commit `5a7cddf`): the P/C/F macro chip
  became a generic `Tag(label, value, colour)`. This MacroTag→Tag reversal is the rubric in action.
- **Kept feature-local — deliberately, per the guardrail:** the five rows
  (FoodRow/SupplementRow/EntryRow/GoalRow/SettingsRow — genuinely different trailing content),
  the Foods **segmented** bar (different shape from `StatBar`), and the one-screen compositions
  `ProteinFocus`/`IdentityHeader`/`TimingGroup`/`MealCard`. NOTE: the original plan floated
  "unify the 5 rows into `ListItemCard`" and a `SectionCard` — both were **correctly dropped**
  once the do-not-force rule was made explicit. That reversal is itself the lesson.
- The **inclusion rubric** (what earns registry membership) is defined next — it must ship in the
  distillation-step prose, `docs/ARCHITECTURE.md` §7, and the console promotion-queue heuristic.

### What counts as a component — the inclusion rubric

**A count threshold is NOT the rule** — neither "promote every atom" nor "wait for ≥2 uses." In
enterprise the cost of being wrong is asymmetric and real in *both* directions: over-abstraction
couples every consumer and makes change a cross-team negotiation; under-abstraction ships divergent
duplicates, the design system never coheres, and restyling means hunting copies across the codebase.
This is **judgment, not arithmetic** — encode it as such.

A composable earns registry membership when — weighing all five — the answer is "govern it":

1. **Design-system decision vs feature decision.** Does it encode *how the product presents
   something* (progress, a metric, a chip) — a design-language decision — or *how one screen
   arranges its data* (a feature decision)? Govern the former; keep the latter local.
2. **Stable/obvious vs speculative abstraction.** A ring/bar/tile/chip is a stable, well-understood
   shape. "Unify these 5 rows" invents a shape that doesn't exist. Govern stable abstractions; never
   invent speculative ones (the do-not-force guardrail, at the right altitude).
3. **Would uncontrolled divergence hurt?** If every screen reinventing it would produce *visible
   inconsistency*, govern it — the value is consistency + drift-prevention. If divergence is fine,
   leave it local.
4. **Cross-cutting concern worth enforcing once?** a11y (48 dp), token binding, theming. `AppButton`
   earns its place by enforcing 48 dp once — independent of reuse count.
5. **Cost of being wrong — both directions, for THIS thing.** Cheap-to-change, obviously-stable
   primitive → bias to govern. Likely-to-diverge, feature-coupled → bias to local.

**Reuse count is a *signal*, not the rule** — ≥2 real cross-feature uses is strong evidence that
(3) divergence would hurt and (2) the abstraction is real, not speculative. But a single-use *stable
design-system primitive* is still a component, and a five-times-duplicated set of *genuinely
different* shapes is still not one.

**A domain-named "component" is a smell.** A composable named for a domain concept (e.g. `MacroTag`)
is usually a feature decision wearing design-system clothes. Resolve it one of two honest ways:
generalize to a real primitive (`Tag`/`Chip` = label + value + colour) OR keep it feature-local.
Never admit domain vocabulary into the registry.

**Brand is its own category.** Identity marks (logo/wordmark) are stable primitives but they are
*brand*, not generic design-system — keep them in `brand/`, governed separately from `components/`.

### How the harness applies the rubric

The rubric is JUDGMENT — and **the agent exercises it**. Division of labor: the agent applies the
rubric and *makes the call* (promote / keep local / generalize) for every screen composable, then
presents the resulting registry as a decided proposal with per-component reasoning; **the human
governs through the Components approval gate** — approve, reshape, or reject the proposed
vocabulary. That gate is *why* the agent can decide: nothing becomes law until the human signs it.
The walk is never a per-composable interrogation of the human, and the harness never auto-promotes
*past* the gate — the calls land in the registry as proposal, and the approval is where the human
rules on them.

- **Genesis walk — distillation step** (`cmp-new` SKILL.md + `docs/ARCHITECTURE.md` §7). After the
  screens exist, the agent classifies every ungoverned screen composable against the five questions,
  makes each promote/keep-local call under the guardrails (*prefer separate over forced; a
  domain-named component is a smell; when in doubt, keep local*), implements the promotions
  (stories included), and presents the decided registry — each call with its one-line rubric
  reasoning — as the Components artifact for approval. The human's move is the approval, not
  fifty micro-decisions.
- **Console — promotion queue** (cmp-inspector Components page). Lists composables used in screens
  but absent from the registry, annotated with **signals**: cross-feature use count and a heuristic
  atom-vs-composition hint. It is the drift surface that keeps the agent's calls honest — anything
  the agent left local is visible there with the evidence, so the human reviewing the approval can
  challenge a call without re-deriving the inventory.
- **Conformance gate — enforce only the mechanical, conservative parts.** (a) True near-identical
  cross-feature *duplication* → flag "promote or dedupe". (b) *Re-invention* of an existing registry
  primitive (a hand-rolled shape near-identical to a governed one). BOTH fire ONLY on near-identical
  shape AND behaviour — **never** on similar-but-different. *A gate that nags "you have two rows,
  unify them" is a bug in the gate.* The gate never enforces "this atom must be promoted" — that
  call is the agent's, ratified at the approval.

**Mechanical vs judgment, drawn explicitly:**
- **Mechanical** (a gate/console may assert): near-identical duplication; re-invention of a governed
  primitive; one story per registry component (the existing `componentStories` parity gate).
- **Judgment** (the agent's call, ratified at the Components approval — never mechanically forced
  by a gate): design-system-vs-feature, stable-vs-speculative, would-divergence-hurt, cross-cutting
  value, and the single-use-atom call.

**Acceptance:**
1. The Components registry/console reflects the app's real reusable vocabulary, not just the starter
   kit.
2. No feature file re-implements a component the registry already provides; a planted duplicate FAILS
   the new duplication/re-invention gate.
3. Every promoted component has a story (componentStories parity green).
4. The console surfaces any composable used in a screen but absent from the registry.
5. `node qa/verify.mjs` is green on a fresh scaffold after a distillation pass.

**Worked example from tonight's Foods/Profile audit — the gate's own test fixtures:**
- **Positive (gate SHOULD flag):** Profile's `GoalRow` and `SettingsRow` were near-identical —
  `Row(fillMaxWidth, clickable, padding(h18,v16)) { label weight(1) → [optional value] → chevron }`;
  `SettingsRow` is literally `GoalRow` with `value = null`. This is the near-identical-shape-AND-
  behaviour duplication clause (a). **But the resolution is NOT registry promotion** — only Profile
  uses it, so the right move is a *local* unify into one `DisclosureRow(label, value: String? = null,
  onClick)`, promoted to the registry only if a second screen later needs it. The example proves the
  gate flags duplication *without* implying "promote."
- **Negative (gate must NOT flag):** the feature rows across screens — `FoodRow`, `SupplementRow`,
  Today's meal/entry rows — are genuinely *different* shapes and behaviours; the do-not-force
  guardrail keeps them separate and local. A gate that flagged these would be the bug the section
  warns about.
Wire both as fixtures: the `GoalRow`/`SettingsRow` pair must FAIL the duplication check; the varied
feature rows must PASS it.

## Reference implementation & acceptance (for the flow-fix / template-uplift task)

**Lift-from source: the Fuelled showcase** at `/Users/test/dev/create-cmp-showcase`. The
**definitive reference is commit `87d072a`** — the COMPLETE app: all four tabs
(Foods/Today/Supplements/Profile) wired as full Room-backed vertical slices, each defined
**spec-first**, **9/9 governed artifacts approved**, verify lane green **with on-device e2e**
(Room v5, seeded). Waypoints: `ada72ad` (bare 0.9.0 scaffold) → `6b5cdb3` (premium UI) →
`fb5e1d9` (conformance + green lane) → `2f4f22f` (Foods = Room-backed exemplar, genesis walk
complete) → `87d072a` (Today/Supplements/Profile + on-device walkthrough). Diff `ada72ad..87d072a`
is the whole uplift.

Exact files that embody each fix (all under `composeApp/src/commonMain/kotlin/com/kvdm/fuelled/`
unless noted):

| Fix | Reference file(s) in Fuelled @ `87d072a` |
|---|---|
| Premium dark theme (graphite + lime, M3 container ladder) | `presentation/theme/Theme.kt` |
| Full numeric type ramp (12 styles, tracked display sizes) | `presentation/theme/Typography.kt` |
| Brand/logo primitive (drawn bolt badge + wordmark) | `presentation/brand/FuelledLogo.kt` |
| Material back button (IconButton + AutoMirrored ArrowBack, 48dp) | `presentation/components/AppHeader.kt` |
| UI-first: stateless-over-sample screen **+** VM-backed `*Route` nav seam | `presentation/{today,foods,supplements,profile}/*Screen.kt` (stateless, `sampleX` default) + the `*Route` composable in each (Koin VM) |
| Full Room-backed vertical slice — the exemplar layers to mirror | `domain/model/Food.kt`, `domain/repository/FoodRepository.kt`, `domain/usecase/{GetFoods,SearchFoods,GetFood}UseCase.kt`, `data/local/{FoodEntity,FoodDao}.kt`, `data/remote/FoodRepositoryImpl.kt` (typed `AppResult`, only translation point, idempotent seed), `presentation/foods/{FoodsViewModel,FoodDetailViewModel}.kt`, `di/AppModule.kt` |
| Spec-first feature specs (every clause cited by a durable test) | `specs/{foods,today,supplements,profile}.spec.md` + their `commonTest`/`desktopTest` suites |
| Distilled primitives (from screens, not authored first) | `presentation/components/{ProgressRing,StatBar,StatTile,Tag}.kt`, `desktopMain/.../inspector/ComponentStories.kt` |
| On-device e2e (search filter + tap-to-take, settle-hardened) | `qa/e2e/smoke.yaml` |
| Nav passes ids, not resolved entities | `presentation/navigation/AppNavHost.kt` + `Screen.kt` |

**Template targets to change (in `/Users/test/dev/create-cmp`):**
`template/composeApp/**/presentation/theme/*`, `**/components/AppHeader.kt`, `**/components/AppButton.kt`
(+ new `AppIconButton`), the exemplar feature files, `template/qa/lib/a11y.mjs` (scroll-clip fix),
`template/**/ArchitectureConformanceTest.kt` (new ARCH-12), `template/docs/ARCHITECTURE.md`
(§7 UI-first policy), and `.claude/skills/cmp-new/SKILL.md` + its plugin-cache copy (walk reorder).

**Acceptance criteria (the fix is done when):**
1. A fresh `create-cmp` scaffold's *first* `preview` renders a genuinely designed hero screen with a
   data-viz element — not `PlaceholderScreen` stubs.
2. `cmp-new` walk order locks `design-system` **after** the exemplar is shaped; the palette is seeded
   provisionally from intent's brand-feel words; reopen handles the post-lock exemplar re-approve.
3. `AppHeader`'s default back affordance is a Material `IconButton` (48dp); an `AppIconButton` exists
   in the component vocabulary and is used for icon buttons.
4. The a11y audit no longer flags scroll-clipped nodes — verified against a screen with a list longer
   than the viewport.
5. ARCH-12 (or equiv) exists, is green on the exemplar, and FAILS on a planted "sample data referenced
   from production wiring" violation.
6. Every pre-existing gate stays green on a fresh scaffold (`node qa/verify.mjs` PASS).

## E2E behaviour assertions must wait for async settle, not assert into the loading transition [P2]

The full lane's `e2eSmoke` FAILED on `assertVisible: foods_item_1` **after** typing a search query —
while the *identical* flow passed when run standalone on a warm emulator. Root cause (read from the
Maestro logs, not guessed): a search keystroke routes VM → use-case → Room, and the ViewModel passes
through a brief `Loading` arm that clears the list between keystrokes; on an emulator **loaded by the
lane's own Android build + APK install moments earlier**, that transition stretches (a 33 s gap just
to type + hide-keyboard, then a 17 s no-show), and a bare `assertVisible` races it. `verify.mjs`
already *documents* this ("a loaded emulator gives up too early under load") but the template's
`qa/e2e/smoke.yaml` still used bare asserts for behaviour. **Fix:** any assertion that follows an
interaction triggering an async state change (search, load, toggle) must use `extendedWaitUntil`
(wait for the settled result), reserving bare `assertVisible` for static post-nav elements. Port the
settle-wait pattern into the template `smoke.yaml` and the cmp-test/e2e authoring guidance, with a
one-line rule. *Proven fix in Fuelled `qa/e2e/smoke.yaml` @ `87d072a` — search + tap-to-take blocks
use `extendedWaitUntil`, and the lane went green on-device.* Relates to [C10] (deterministic app
lifecycle: the retained-ViewModel "Chickenoats" state that also came from a warm, un-relaunched app).

## Run-through flow — productization [collected 2026-07-24, from the live emulator walkthrough]

The genesis→exemplar→features flow was run end-to-end this session (build waves on desktop),
culminating in on-emulator e2e + a **live walkthrough** with a per-screen evidence report. Each item
below carries the concrete moment that surfaced it and the artifact form it should
take. Grouped by what it improves. **Priority: A1/A2/C6 are "the flow we just ran, productized";
D11+D12 make the strongest receipt reproducible instead of lucky; B4/B5 are the human trust surface;
C7–C10 deepen evidence quality; D13 ([preview↔lane isolation]) underwrites all of it.**

### A. The console as a single pane of glass
- **[A1] "Live device" as the console's final section.** The console arc (define → preview → approve
  → verify) should end **drive**: on live-tier connect, embed the `/inspect/remote` page (self-
  contained already — iframe/proxy) with a status chip (device · appId · `buildType:debug`) and a
  **"Start live session"** button that runs the chain the harness currently makes the agent hand-roll:
  boot headless AVD → `installDebug` → launch → `connect_live`. *Evidence:* tonight that was
  `nohup emulator` + `adb wait-for-device` + `monkey` + `curl /inspect/health` — four manual steps for
  something the harness fully owns. Also closes the [remote-view discoverability P1] — it becomes
  furniture, not a URL buried in a tool result.
- **[A2] The walkthrough report as a generated, committable artifact.** Productize the hand-built
  report into `qa/walkthrough.mjs` (+ an MCP verb): enumerate the nav graph, per screen capture
  **pixels + tree + a11y from the same frame**, prove each transition, emit
  `qa/evidence/walkthrough/<date>/report.html`, render it as a console "Walkthrough" section. Two
  points that make it a *template*, not a copy of tonight's file (reference copy committed at
  `docs/reference/walkthrough-report-2026-07-24/report.html` + its 7 emulator captures): (a) **styling is pulled from
  `design-system.json`** so every generated app's report is auto-branded in its own tokens — that is
  *why* tonight's report "felt like Fuelled"; codify it, don't hardcode it; (b) **it is evidence, not
  decoration** — same folder discipline as `latest.json`, each screen card deep-links its spec clauses
  + golden + stories. Per [spec-mirror-drift]: the report is derived truth; a card whose live capture
  disagrees with its approved spec/golden IS the drift surface.
- **[A3] Walkthrough-to-walkthrough diff.** Two runs (before/after a feature) side-by-side per screen:
  image pair + tree diff. *Evidence:* the golden tree catches structure, but the "this is not premium"
  judgement was invisible to every gate — a human needs the visual before/after.

### B. Human visibility into what the AI built
- **[B4] Session digest — "what happened since you last looked."** *Evidence:* Karel had to ASK "did
  you go through all screens with the components?" — the honest answer needed a re-audit. The console
  should answer mechanically: commits since last visit, artifacts approved/reopened, lane runs +
  verdicts, screens whose renders changed, findings logged. The Evidence timeline holds the receipt
  history already — this is the narrative layer over it.
- **[B5] Approval-anchored diffs on `changed-since-approval`.** *Evidence:* the architecture prose went
  stale while its approval stayed green (generated sections stripped from the hash — correct, but the
  console said "approved" about a doc describing deleted files). When an artifact drifts, show the diff
  *against the approved bytes*, not just a red chip.

### C. AI visibility into the running app
- **[C6] Fix + harden the live pixel path into one atomic verb.** `capture_screen{live}` returns
  pixels-path + tree + hash **from the same frame**, and refuses a frame whose hash equals the previous
  capture unless told. *Evidence:* the [render_screen stale-frame P1] produced byte-identical
  "screenshots" of two screens; only a hash-compare caught it, then I hand-juggled adb-for-pixels +
  MCP-for-tree and had to *trust* they were the same moment.
- **[C7] Navigation as API, not synthesized taps.** The READ half already exists — VL-1's
  `/inspect/nav` powers the `route: {before, after}` field `navigate_and_inspect` returned all night.
  The missing half is the JUMP: a debug-only `/inspect/navigate?route=food/3` so a walkthrough
  enumerates routes mechanically from the nav graph instead of tapping tag-centres with guessed
  `settleMs`. Taps stay for *behaviour* proofs (toggle, search); route-jumps are for *coverage*.
  *Evidence:* the whole walk was tap-choreography — one mistimed settle and a capture lies. Do not
  rebuild the read side; only add the jump.
- **[C8] Deterministic state arms in the report.** Live walk shows only the happy path without
  contriving failures; stitch **live happy-path + tier-0 rendered `@empty`/`@error` variants** per
  screen, labelled by source — full four-arm coverage, honestly sourced. *Evidence:* tonight's report
  covers error/empty only by *citation to tests*, not a rendered frame.
- **[C9] Use the runtime data eyes in evidence.** `db_query`/`db_schema` (VL-2) went unused — I proved
  SUPP-03 by reading the summary *text*. Stronger: the walkthrough appendix runs
  `SELECT id, taken FROM supplements` at capture time — the DB row IS the persistence receipt; same for
  Today's aggregation (sum rows, assert against the ring value).
- **[C10] Deterministic app lifecycle as a tool.** The "Chickenoats" incident: the process survived the
  e2e run, a retained ViewModel held stale query state, and the agent had no way to see it. Add a
  `relaunch{clearState?}` verb + process-start-time in `/inspect/health`, so every walk starts from a
  known state instead of `monkey`-and-hope.

### D. Performance / reproducibility
- **[D11] Device lifecycle owned by the lane.** `node qa/verify.mjs --with-device` boots the headless
  AVD, waits, runs, tears down. *Evidence:* e2eSmoke silently SKIPs unless a device *happens* to be
  attached — the strongest receipt is currently luck + a hand-rolled boot.
- **[D12] Receipt strength labelling.** Print `PASS (on-device: e2e+tokenDrift)` vs `PASS
  (desktop-only)` on the receipt and in the console. *Evidence:* we produced both kinds tonight and the
  distinction mattered every time we discussed "green" — it should not live only in the SKIP lines.
- **[D13] Preview↔lane isolation is the keystone.** Every "single pane of glass" idea dies if the
  daemon must be stopped for each build wave. The KSP-isolation fix ([Build/eyes reliability P1]) is
  what makes "the console never goes down" true. Already logged — flagged here as the dependency.

## Second wave — surfaced while mirroring the harness into the showcase [2026-07-24, later same day]

### Component stories rendered black-on-black — `StoryHost` provided no content colour [P1, FIXED]

Karel, reviewing the Components page: *"why is this blank?"* — pointing at `AppIconButton` and
`ScreenColumn`. Nothing was failing to draw. `StoryHost` wrapped every story in

```kotlin
Box(Modifier.fillMaxSize().background(<Prefix>Colors.Background)) { content() }
```

A `Box` **paints** a background; it does not **provide** one. `LocalContentColor` comes from
`Surface`, never from `MaterialTheme` — and real screens get it because `BaseScreen` roots in a
`Scaffold`, which is a Surface internally. So stories ran with `LocalContentColor`'s default of
BLACK on a near-black app background. The tell is which stories broke: everything passing an
explicit token (`AppTextButton`, `NavItem`'s tints) looked fine, while everything **correctly
inheriting** content colour vanished — `AppIconButton`'s default tint, `ScreenColumn`'s bare
`Text`, and `AppHeader`'s title once the template stopped hardcoding `color = onSurface`. The two
components behaving most correctly were the two that disappeared, and the story surface — the
thing whose whole job is to show a component honestly — was the liar. **Fix (landed, template +
showcase):** `StoryHost` is a `Surface(color = Background, contentColor = OnSurface)`, the same
content-colour context a screen has. Re-rendered proof: `AppIconButton` enabled arrow white with
the disabled arm correctly dimmed (that state had never been inspectable), `ScreenColumn` legible,
`AppHeader` white with the accent action. **Principle:** a story must sit in the same composition
context as the screens it documents, or it documents a lie.

### The console cannot show the type ramp — the design-system catalog carries no typography [P1, OPEN]

Same review pass. The Design language page renders colours, spacing, radii and elevation, then
prints: *"Not derivable statically — the design-system catalog carries no typography tokens."*
The console is being honest, exactly as `console-tabs.mjs` documents; the data never arrives.
`designSystemCatalog()` (PreviewHarness.kt) emits `colors` + `dimens` and nothing else —
confirmed empirically against Fuelled's generated file: `Object.keys(design-system.json)` →
`['colors','dimens']`. Meanwhile Fuelled's `Typography.kt` carries the full 12-style ramp
(`displayLarge` 56sp/-1.5 tracking … `labelSmall` 11sp/+0.8, all DM Sans). **The design exists;
it just never reaches the catalog.** This is worse than a missing table: §7.1 of the genesis walk
has the human judge the design language RENDERED, never as hex codes — and type is the one axis
that page structurally cannot show. We shipped the premium ramp as a headline template default and
made it invisible in the exact surface where it is meant to be approved. By [spec-mirror-drift],
Design language claims to mirror the design system while silently omitting a third of it.
**Fix:** (a) `PreviewHarness.kt` emits a `typography` block — per style: family, size, lineHeight,
weight, tracking; (b) `InspectorCatalog.kt` (androidDebug) emits the same so the live
`/inspect/design-system` tier matches; (c) `console-tabs.mjs` renders it as an actual ramp — each
style set in its own size and weight with metrics alongside, not a name/value table; (d) mirror to
the showcase. Side benefit: type tokens become assertable by `assert_token` / `find_drift`, which
today cannot see them at all. No approval is invalidated — the `design-system` artifact hashes
`Theme.kt` + `Tokens.kt` source, not the generated JSON.

### Story canvas renders a 48dp component on a full device-height frame [P2, OPEN]

Cosmetic sibling of the black-on-black bug, and part of why "blank" was the natural reading: every
story renders onto the full preview canvas, so a 48dp icon button occupies a sliver at the top and
~95% of the card is empty background. **Fix:** crop the story capture to its content bounds, or
render stories on a short frame sized to the component.

### `java_home` probe leaked its miss message into the MCP log [P3, FIXED]

Surfaced by exercising the new resolver through the showcase's dev pin. `jdk.mjs` called
`execFileSync("/usr/libexec/java_home")` without a `stdio` spec, so it inherited stderr — on a
machine where java_home has nothing registered, a probe *miss* printed `Unable to locate a Java
Runtime. Please visit http://www.java.com...` into the server log. Resolution itself was correct
(fell through to sdkman current). **Fixed** (`0a32118`): `stdio: ["ignore","pipe","ignore"]`; the
7 jdk tests still pass.

### DECISION — ARCH-12 stays maximally strict; each screen owns its fixture

Not a finding: a decision, recorded so it is not re-opened. Mirroring ARCH-12 into the showcase
failed on `FoodDetailScreen`'s `food: Food = sampleFoods.first()`, borrowing the fixture declared
in `FoodsScreen.kt`. Two options were put up — refine the clause to permit cross-file references in
default-parameter position, or give each screen its own fixture. **Karel chose the latter.**
`sampleFood` now lives in `FoodDetailScreen.kt`; ARCH-12 is unchanged and passes green. The
duplication of fixture data, and the same cost for every future screen, is the deliberate price of
a rule that cannot be argued with case by case — the guarantee is worth more than the keystrokes.

## Carried over (pre-showcase, already flagged)

- Exemplar-aware `featureShape` (spawned task `cc8eaa87`).
- Template `.gitattributes` CRLF hardening (spawned task `253c23bd`).

---

## Status

**Fix wave landed 2026-07-24** (single batch commit; gated once at the end: full suite 698/698
across engine + mcp — an earlier "407/407 each" claim in this log was wrong, it double-counted
one glob run twice from two directories; a fresh scaffold's full lane 11/11 green **on-device**;
and a planted ARCH-12 violation FAILing conformance):

- **FIXED:** stale live pixels (PixelCopy + sha256 tripwire, live-proven on the emulator at
  0.8s settle); a11y scroll-clip false positives (`size` field + max(bounds,size), live-proven
  on the Foods fold row); JAVA_HOME propagation (jdk.mjs, no tracked-file edits);
  preview↔lane coexistence (lane marker + KSP self-heal, both sides); genesis reorder
  (spec-first exemplar + UI-first design-system/components, registry + walk + docs);
  ARCH-12 + UI-first policy; SHELL-05 `*Route` widening; exemplar-retarget prose-refresh step
  (in the walk); promotion queue (console, signals-only); AppIconButton + Material back +
  12-style ramp + BrandMark; settle rule (template smoke + generator + TESTING.md);
  receipt strength label (D12); remote-view headlined (README + template README/CLAUDE.md);
  console shell title from rootProject.name.
- **WITHDRAWN:** the mechanical duplication/re-invention conformance clause — see the
  strike-through above (no metric separates the fixture pair from a legitimate pair;
  the call is the agent's rubric reasoning, ratified at the Components approval).
- **SECOND WAVE (same day):** `StoryHost` content-colour FIXED (template + showcase, re-render
  proven); `java_home` stderr leak FIXED; type-ramp catalog gap and story-canvas sizing OPEN
  (see the second-wave section above); ARCH-12 strictness settled as a DECISION, not an issue.
- **CORRECTION:** [C6] is only half done. The stale-frame *bug* is fixed, but its actual ask — one
  atomic `capture_screen{live}` returning pixels + tree + hash FROM THE SAME FRAME — was never
  built; pixels and tree are still hand-juggled across two calls and trusted to be the same moment.
  A1/A2 depend on it.
- **PRODUCTIZATION WAVE landed (same day, second batch — all A/B/C items):** A1 Live-device
  console section (embedded /inspect/remote + Start-live-session chain with per-step honest
  outcomes); A2 `qa/walkthrough.mjs` + manifest + auto-branded report.html + console
  Walkthrough section (live-proven on Fuelled: 4 tabs, same-frame captures, settle rule
  applied to the walk itself); A3 `--compare` run diff (proven on two real runs —
  byte-identical pixels across all 4 screens, a determinism proof in passing); B4 Digest
  section (lane verdicts read from each committed receipt's own bytes, approval events,
  commits, open comments); B5 approval-anchored diffs (anchor located by hashing historical
  commits with the PROJECT'S OWN approvals lib — proven: components drift anchored at
  5a7cddf, 81-line diff); C6 second half `capture_screen` (pixels→tree→pixels sandwich,
  stability proof + stale tripwire, live-proven incl. refusal); C7 `/inspect/navigate`
  route-jump (jump half only, read half untouched; parameterized routes honestly not
  walked); C8 tier-0 variant stitching, labelled by source; C9 DB appendix read at capture
  time (Fuelled: 5 tables with row counts); C10 `relaunch_app` verified by
  `processStartedAtMs` advancing + `pm clear` first-run option (live-proven). Gate:
  704/704 (exit code checked — an earlier 698 "green" was a tail-masked pipe; two real
  test-expectation updates + one flaky-IPC re-run isolated). NOT built (out of scope,
  D-level): D11 `--with-device`.
- **STILL OPEN:** the designed exemplar home screen + UI-first seam split of the template
  exemplar (held deliberately — it is the product's first impression and must be judged
  RENDERED by the human via the candidates loop, next session); D11 lane-owned device
  lifecycle; candidates strip hiding the live variant (P2);
  `npm version` manifest lockstep (P2); plugin cache refresh (P3); the stamper clone-shape
  decision (P2 — unchanged: canonical set + warning; revisit when the seam split lands).

This log is append-only during dogfooding runs; promote items into real tasks/issues when
scheduled.
