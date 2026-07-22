# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-07-21

This release is the **studio** — the generated project's console is rebuilt as a
documentation site where every section is the professional artifact its discipline
authors, derived from the live tree, with drift shown in place — plus the runtime
eyes, the ordered human-approval layer, the genesis definition flow, and a tiered
verify workflow that stops the agent re-running the heavy lane on every edit.

### Added

- **The studio console — the preview gallery rebuilt as a documentation site.** One
  shell (`inspector/mcp/src/lib/console-shell.mjs`) frames a single design system
  (ink/paper + one accent; semantic red/amber/green reserved for drift, reopened, and
  signed) with a sidebar coverage rail whose glyphs read at a glance — ● signed,
  ○ unsigned, ◐ reopened, ⚠ drifted. The sections follow the genesis definition order —
  **Intent → Design language → Architecture → Components → Screens → Specs → Evidence** —
  and each is a spec, a mirror of the live tree, and a drift surface at once: the
  Screen×State matrix, the Intent brief, the Architecture document as derived truth, the
  Design-language token/contrast proof pages, and a **visual render for every component**
  via `ComponentStories.kt` (14 stories) with a parity gate so a component can never
  appear on the bar without its render.
- **The Evidence audit trail — the committed receipt history, reconstructed from git.**
  `qa/evidence/latest.json` is the single receipt-of-record; the console's Evidence
  section walks `git log` of that one file to show the full signed history (verdict,
  profile, commit, author, age) — the git history *is* the ledger, nothing extra to
  retain or trust.
- **Runtime eyes + ordered, hash-bound human approvals (VL-1…VL-7).** The debug app's
  `/inspect/*` endpoints expose live nav, a11y contrast, ANR/crashes, logs, and the DB as
  MCP structure (`connect_live` + the cmp-inspector tools); approvals are hash-bound gates
  the console renders as a two-way surface, with a comments ledger the agent and human
  both write to.
- **The genesis definition flow.** `cmp-new` becomes a six-conversation walk in which
  nothing generic is ever signed: a definition layer sits under the approvals, the
  exemplar is configurable, an express lane exists for the impatient, and reopen-vs-drift
  is an explicit asymmetry.
- **The component vocabulary (CV-1) and the architecture-document standard (AD-1).** Both
  land as derived truth — on the console page and enforced in the lane (new conformance
  clauses, incl. ARCH-11) — rather than as standing prose.
- **Tiered verify workflow — the full lane is a checkpoint, not an inner loop.**
  `template/CLAUDE.md` now teaches two tiers: iterate with the preview + targeted
  `:composeApp:desktopTest`; run `node qa/verify.mjs` once, at the done checkpoint. A new
  opt-in **pre-push gate** (`.githooks/pre-push`, enabled by `node qa/setup-hooks.mjs`)
  runs only the cheap receipt-check — the same predicate CI enforces — so an unverified
  push is caught locally without rebuilding anything. Bypassable with `git push
  --no-verify`; CI still enforces.

### Changed

- **Typed-result error flow at the foundation (template + exemplar).** Exceptions no longer
  cross layer boundaries in generated apps: repositories return `AppResult<T>`
  (`Success`/`Failure(DomainError)` — new shared `domain/result/AppResult.kt` +
  `domain/model/DomainError.kt`), the data layer's new `suspendRunCatching` helper
  (`data/AppResultCatching.kt`) is the single exception-translation point and **always
  rethrows `CancellationException`** (the old `catch (e: Exception)` in the exemplar
  ViewModel swallowed cancellation and leaked raw `e.message` to the UI), and
  `HomeUiState` is now a sealed `Loading`/`Content`/`Empty`/`Error` hierarchy with
  presentation-mapped error copy plus a new `home_empty` state (spec clause HOME-07).
  Three new conformance gates enforce the policy as `specs/app-base.spec.md` clauses
  ARCH-06 (repository interfaces return `AppResult`), ARCH-07 (ViewModels contain no
  `try`/`catch`), and ARCH-08 (the data layer's only catch mechanism is
  `suspendRunCatching`, cancellation-guard verified). The `add-feature` stamper clones the
  new pattern (spec set is now `<FEATURE>-01..07`, incl. the empty state), and
  `docs/ARCHITECTURE.md` gains explicit **Error handling** and **Threading (main-safety)**
  policy sections.

## [0.8.0] - 2026-07-15

### Added

- **`create-cmp upgrade` now manages `compileSdk` / `targetSdk`, and ships the July 2026
  recommended version set (`2026.07r`).** A version set can carry an `androidSdk`
  block, and `upgrade` rewrites `composeApp/build.gradle.kts` (with a backup) alongside the
  catalog — because the Android SDK level is coupled to the set (newer AGP + newer androidx
  force a higher `compileSdk`). The new default upgrade target `2026.07r` is a sourced,
  canary-certified jump: **Kotlin 2.3.10 / KSP 2.3.10 / Compose Multiplatform 1.11.1 /
  AGP 8.13.2 / Gradle 8.14.3 / compileSdk 36**, plus koin 4.2.2, sqlite 2.7.0, firebase 2.4.0,
  google-services 4.5.0 (coil 3.2.0 + serialization 1.9.0 from 2026.07c). Built green on
  Android + desktop + iOS. The lockstep validator now accepts KSP2's aligned scheme
  (`ksp == kotlin`, e.g. `2.3.10`) as well as the classic `<kotlin>-<kspVersion>` form.
  Documented in the new [docs/VERSIONS.md](docs/VERSIONS.md). Deliberate holds, each found by a
  canary build: ktor stays 3.1.0 (3.2.0 isn't dexable at `minSdk 24`), and androidx-core /
  lifecycle stay at their SDK-36-safe versions (their latest demand an unreleased `compileSdk 37`).

- **Second proven-green version set (`2026.07c`) + the canary promotion gate.**
  `scripts/promote-set.mjs` scaffolds a full app pinned to a candidate (staged in the new
  `src/versions/candidates.json`), builds it for real — Android `assembleDebug`, the
  device-free lane gates (`desktopTest`), and the iOS framework link — and ONLY on all-green
  appends it into `src/versions/registry.json` as the new default `create-cmp upgrade` target;
  a red build leaves the registry untouched. The first promoted set, `2026.07c`, bumps
  coil 3.1.0→3.2.0 and kotlinx-serialization 1.7.3→1.9.0 with the entire Kotlin/KSP/Compose/Room/AGP
  lockstep held. The gate earned itself on the first run: it caught ktor 3.2.0 shipping a
  DEX-040 backtick identifier (`use streaming syntax`) that AGP 8.7.3's R8 rejects at
  `mergeExtDexDebug`, and refused to promote it. `create-cmp upgrade` now has a real target
  beyond the frozen baseline. (Complements the existing `scripts/canary.mjs` freshness probe.)

- **New official alias: `create-mobile`** (`packages/aliases/create-mobile`, published
  separately, starts at 0.1.0) — the honest front door to a new mobile app. Unlike the
  pure-passthrough `create-kmp` / `create-compose-multiplatform` shims, `npm create mobile`
  opens with a fit check: Compose Multiplatform as the modern default, the real trade-offs vs
  React Native/Flutter (their strengths named too), and a genuine choice — interactive runs get
  a `Continue with Compose Multiplatform? [Y/n]` prompt that writes nothing and points to Expo /
  Flutter on decline; `--yes`/CI runs print the note and proceed. The generic name earns itself
  rather than silently redirecting. README + llms.txt now list it alongside the other aliases.

## [0.7.1] - 2026-07-14

### Fixed

- **The feature stamper now auto-registers a stamped screen in `inspector/PreviewRegistry.kt`.**
  `add-feature` / `add-screen` (and `qa/scaffold-feature.mjs` directly) previously wired the
  nav route and DI but left the new screen invisible to the preview loop, the gallery, and the
  golden baselines until you hand-added a `ScreenPreview(...)` entry — a drift the harness's own
  philosophy ("extend right-by-construction") shouldn't allow. The stamper now appends that entry
  and its import at a new `// cmp:anchor preview-registry` marker, for both the `feature` and
  `screen` presets, mirroring the nav/DI anchor discipline: idempotent, and a clean no-op when the
  inspector feature is disabled (no `PreviewRegistry.kt`). The engine's generated registry and the
  static template stay byte-identical (pinned by `test/tab-surfaces.test.mjs`), and a new parity
  test (`test/stamped-preview-registration.test.mjs`) locks stamp → registration so the two can't
  drift again.

## [0.7.0] - 2026-07-14

### Added

- **`packages/receipts/` — the receipt-validation logic is now ONE package**
  (`cmp-receipts`, not yet published). The inputs-hash algorithm and the
  receipt predicate (binding present → not FAIL → hash matches the tree →
  PASS) were extracted from the template into `packages/receipts/src/`, which
  is now the single source of truth; the template's `qa/lib/inputs-hash.mjs`
  and new `qa/lib/receipt-validate.mjs` are byte-identical vendored copies
  (`node scripts/sync-receipts.mjs` re-vendors; `test/receipts-parity.test.mjs`
  pins package ↔ template ↔ fresh-scaffold byte-equality), so generated
  projects stay dependency-free while any hosted validator consumes the exact
  same logic from the package. `qa/receipt-check.mjs` now imports the vendored
  predicate — identical CLI behavior, refusal strings, and exit codes. The
  package adds service-grade checks the local predicate deliberately doesn't
  enforce: freshness windows, execution plausibility (impossibly-fast receipts
  are named — evidence must attest execution), SKIP listing, and a composite
  `validateReceiptForTree()` that reports repos without a receipt as `missing`,
  never as failing.

### Changed

- **The package README now leads with the one-line promise.** The README (the first thing
  npm and coding agents read) opens with "gives AI coding agents *eyes* and a
  *machine-enforced definition of done* on mobile," surfacing the preview/inspector "eyes"
  and the verify lane's "definition of done" in the subtitle instead of below the fold.

### Fixed

- **The feature stamper now stamps a SHELL-05-conforming screen out of the box.**
  `qa/scaffold-feature.mjs` clones the `home` exemplar — a tab screen whose BaseScreen
  comes from AppShell — but registers the clone as a pushed NavHost destination, so the
  very next `node qa/verify.mjs` failed SHELL-05 naming the new screen (reproduced against
  released 0.6.1: stamp Favorites → verify → FAIL). The stamper now wraps the cloned
  screen's root container in `BaseScreen { … }` at stamp time (DetailScreen's pattern),
  for both the `feature` and `screen` presets, anchored on the exemplar's shape and
  failing loudly on template drift. The only post-stamp step left is the by-design golden
  capture: stamp → `UPDATE_GOLDEN=1` → verify now PASSes with zero hand edits (pinned by
  `test/stamped-feature-conformance.test.mjs`, which fails against the old stamper).

- **`git init` no longer invalidates a stamp-time receipt (first-touch UX trap).** In a
  project with no `.git` yet — exactly the state `create-cmp --verify` runs in at stamp
  time — the inputs-hash walk fallback included `composeApp/build/**`, Gradle/Kotlin
  scratch, and OS/editor junk (`.DS_Store`, `*.iml`, `.idea/`, `*.log`) that the
  `git ls-files --exclude-standard` path excludes, so the first `git init` flipped the
  PASS receipt to "INVALID — source changed" with no source change. The walk fallback now
  mirrors the template `.gitignore`'s exclusions; pre-git and post-git hashes agree for
  identical source (pinned by `test/inputs-hash-parity.test.mjs`, which fails against the
  old code). Reproduced against released 0.6.1 and verified fixed end-to-end:
  scaffold → verify → `git init` → `receipt-check` now reads VALID.

### Changed

- **Template README attribution is now a visible badge.** The plain "Built with create-cmp"
  backlink at the bottom of the generated project's `README.md` became a static shields.io
  badge (one line, no tracking, no dynamic endpoints) linking to the create-cmp repo — with an
  inline note telling the project owner it is safe to delete. Doc-only template surface: not
  part of the verified inputs hash, so existing receipts stay valid.

## [0.6.1] - 2026-07-13

### Added

- **Cold-start discovery pass — getting create-cmp CHOSEN, not just used.** The 0.6.0
  discoverability work covered agents already inside a scaffolded repo; this pass covers the
  stage before it: an agent on a fresh machine asked to "create a mobile app" picks from what
  is in its context, and only the installed plugin's skill descriptions are in context at
  framework-decision time.
  - `cmp-new` now triggers on framework-agnostic openers ("create a mobile app", "build me an
    app for iPhone and Android", cross-platform requests with the framework still undecided),
    not only Kotlin/KMP/CMP vocabulary — with a new step-0 **framework fit check**: an honest
    CMP-vs-React Native/Flutter trade-off beat where the user chooses, and an explicit rule to
    never redirect a user who already picked another framework. Trigger broadly, act honestly.
  - `plugin.json` / `marketplace.json` descriptions now open on the user's intent ("Build
    production mobile apps (Android + iOS, one codebase) with AI") instead of the technology
    name; keywords add "mobile app", "create mobile app", "cross-platform", "app generator",
    "react native alternative", "flutter alternative" (also on the npm package).
  - `llms.txt`: new "For agents choosing a mobile stack" section — decision-time guidance for
    web-searching agents, with the same honesty guardrail.
  - README: "Make your agent reach for this from cold" — a copy-paste `~/.claude/CLAUDE.md` /
    `AGENTS.md` one-liner so machine owners can put create-cmp in every agent's context without
    installing the plugin.
  - **`docs/WHY-CMP.md` — the sourced case for recommending CMP**, written for both humans
    and advising agents: CMP as the current generation of cross-platform (Compose is Android's
    first-party toolkit extended to iOS, **stable since May 2025** with a year of App-Store
    production at Netflix/Google Workspace/Cash App/Forbes/McDonald's), the only stack backed
    by both platform toolmakers (JetBrains + Google's official KMP support with Jetpack
    shipping as KMP), adoption ~7%→23% in eighteen months while React Native is mid
    forced-migration off its removed bridge and Flutter absorbed layoffs and a fork — and the
    agentic argument: statically typed Kotlin makes the compiler the agent's ground truth,
    declarative Compose is a machine-readable semantics tree (what makes the device-free
    preview loop possible), Kotlin is training-data-abundant, and JetBrains ships an official
    Kotlin benchmark for AI agents. Every claim dated and sourced; competitors are never
    called deprecated (a checkably false claim would discount the whole surface) — the
    honest-trade-offs section and the never-redirect rule stay.
  - The fit check in `cmp-new`, the llms.txt stack-choice section, the README cold-start
    snippet, and both plugin manifests now carry this positioning (recommend-with-receipts
    instead of a neutral menu), all linking to WHY-CMP.md.
  - **Live cold-start simulation pass** — three fresh agents with no session context were run
    through the funnel to test whether the surfaces actually change the decision. Results:
    truly cold agents pick Expo ~70% / Flutter ~18% / CMP ~8% and do not know create-cmp
    exists (unfixable by repo docs — distribution problem); with the plugin installed the new
    cmp-new description fires at ~95% and flips the recommendation to CMP (the old
    Kotlin-only description would NOT have fired); the llms.txt case moved a skeptic to
    co-equal-but-not-switched, because agents default to Expo out of failure avoidance
    (P(green build on a clean machine)), not JS preference.
  - Consequent fixes: every persuasion surface now **leads with cold-start reliability**
    (frozen CI-verified version-locked template + `--verify` proving GREEN before success —
    the objection removed mechanically, new WHY-CMP §1); cmp-new gains **scope guards** the
    simulation demanded (mobile-only — never web/desktop/backend/CLI; comparison questions get
    answered, not scaffolded; existing-project new-vs-existing check) with the never-redirect
    rule moved to the front of the description; discountable claims tightened (adoption stat
    attributed, RN bridge removal reframed as completed-modernization-with-forced-migration-cost,
    Dart's static typing conceded — differentiators are platform-nativeness and training-data
    density).
  - **GitHub repo surfaces**: description rewritten intent-first ("Create production mobile
    apps… with AI"); topics now include mobile-app, cross-platform, app-generator,
    react-native-alternative, flutter-alternative, ai-development (dropped redundant
    scaffolding/cmp to fit the 20-topic cap). npm description likewise intent-first (lands on
    the registry with the next publish).
  - `test/discovery-surfaces.test.mjs` pins all of the above: trigger phrases, honesty
    guardrail, intent-first descriptions, keywords, llms.txt guidance, the dated iOS-stable
    receipt, a "never claims competitors are deprecated" invariant, the simulation-derived
    scope guards, and the reliability-first opening.

### Fixed

- `marketplace.json` `plugins[0].version` was left at 0.5.0 by the 0.6.0 release (only
  `metadata.version` was bumped). Synced, and the new discovery-surfaces test now enforces
  lockstep across `package.json`, `plugin.json`, and both `marketplace.json` fields.
- Stale counts in docs: README's plugin badge anchor still pointed at
  `#the-claude-code-plugin-8-skills` (broken since the heading became "9 skills");
  `docs/USAGE.md` said "8 skills" and "cmp-inspector MCP (v0.4.0 — 14 tools)" in five places —
  now 9 skills / 18 tools, with the badge-anchor-matches-heading invariant pinned by test.

## [0.6.0] - 2026-07-13

### Added

- **Headless screen previews of the app's REAL screens (tier 0, "Android Studio previews"
  without the IDE)** — closing the gap where `render_screen` could only render the bundled
  demo SampleScreen. Every app scaffolded with the inspector feature now ships:
  - `inspector/PreviewRegistry.kt` (desktopMain) — the `@Preview` analog: a `ScreenPreview`
    entry for the shell, every bottom-nav tab, and the detail destination. Regenerated from
    the configured `--tabs` by pipeline step b.3 (default config reproduces the static
    template byte-for-byte, pinned by `test/tab-surfaces.test.mjs`).
  - `inspector/PreviewHarness.kt` + a `:composeApp:renderScreens` Gradle task — renders each
    registry entry with the app's real Koin DI, theme, and data (own Koin start, independent
    of the dev-client feature; provides the Lifecycle/ViewModelStore owners `koinViewModel()`
    and `collectAsStateWithLifecycle` need) to `composeApp/build/previews/<id>/`: the
    inspector-contract `tree.json` (phone viewport 411x891, density 1, px == dp, resolved
    design tokens via the PROJECT's DesignTokenKey) plus a `screen.png` pixel twin (@2x) from
    the same composition sources — no device, no emulator, no window. Parameters travel as
    `-P` properties (`-Pscreen=<id|all>`, `-PpreviewOut`, `-PpngScale`), never `--args`
    (Gradle's CLI parsing word-splits `--args` values into task names).
  - `qa/preview-gallery.mjs` — builds ONE self-contained `index.html` from the output
    (embedded PNGs for humans, wireframe SVG + a11y overlay per screen via the vendored
    pure-logic render libs in `qa/lib/`), dependency-free like the rest of `qa/`.
  - MCP: `render_screen` gains `projectDir` + `screen` — runs the generated task and returns
    the PNG metadata plus `treePath`/`previewsDir`; the bundled-SampleScreen `harness:true`
    path remains as the demo fallback and is labeled as such.
- **`preview` / `preview_stop` MCP tools + the `cmp-preview` skill (ninth skill) — the
  AI-native preview loop ("Storybook for CMP", phase 1)** — nobody runs Gradle or node
  scripts by hand: `preview { projectDir }` starts a resident service owned by the MCP
  server that renders every registry screen headlessly, serves a LIVE gallery at a local
  URL (pixels + inline wireframe SVG + a11y per screen; SSE-driven self-reload; changed
  screens flagged; render failures shown as a banner while the last good state stays up),
  and watches `composeApp/src` so every save re-renders automatically (debounced,
  serialized, one queued follow-up; recursive fs.watch with an mtime-poll fallback). The
  tool returns the same state structurally (`screens` with node/token/a11y counts + tree
  paths, `changedLastRender`) so the agent asserts while the human watches — pixels to
  the human, structure to the AI. Unit-tested via an injected render runner
  (`inspector/mcp/test/preview-service.test.mjs`).
- **Resident preview daemon (phase 2 — `@Preview` parity)** — the template ships
  `inspector/PreviewDaemon.kt`: a long-lived headless JVM serving loopback
  `/health|/screens|/render?screen=|/shutdown`, launched by the preview service under
  **Compose Hot Reload** (`hotRunDesktop --mainClass=<pkg>.inspector.PreviewDaemonKt
  --auto`; plain `runPreviewDaemon` JavaExec as the no-hot-swap variant). Saves recompile
  incrementally and hot-swap into the RUNNING daemon; `/render` re-reads the registry per
  request so fresh scenes compose from the swapped classes. The node service prefers the
  daemon when healthy (spawns it in the background, reuses an already-running one, falls
  back to the Gradle task transparently on any failure) and switches its render trigger
  to the compiled-classes dir so renders never race the swap (1.5s trailing debounce).
  Render settle is now ADAPTIVE (stop when two consecutive tree dumps match / two quiet
  invalidation checks) instead of fixed sleeps. Measured on a real 7-screen app: ~900ms
  single-screen, ~7s all screens, ~10s save→gallery-shows-the-change, vs 25–40s per
  change on the task path. `preview` gains `hot` (default true); `detectAppPackage`
  reads create-cmp.json (the 0.5.0 spec-of-record) with a namespace fallback.
- **Agent feedback loop hardening (dogfood review of the preview loop)** — the two P0
  gaps found by using the loop as an agent, plus the P1/P2 follow-ups:
  - **Compile failures are no longer silent in daemon mode** (P0): a broken edit under
    Compose Hot Reload produces no render (no classes written → no trigger), and the
    hot recompiler is a SEPARATE Gradle daemon whose output is unobservable — verified
    live, previously zero signal. The service now runs a **compile watchdog**: a save
    that produces no in-JVM reload within 20s triggers its own
    `:composeApp:compileKotlinDesktop` check, promoting the compiler's `e:` lines into
    `lastError` with `lastErrorSource: "compile"`, an SSE error broadcast (gallery pill
    "compile failed"), and immediate settlement of pending waiters (daemon-child output
    is also scanned for failure markers as belt-and-braces). `status()` also carries
    `lastActivity` ({what, at}: src-change / compile-failed / render-ok / render-stale…)
    so "quiet" and "stuck" are distinguishable.
  - **Swap-aware renders** (P0, found live): classes appearing on disk PRECEDE the
    in-JVM hot swap, so a classes-triggered render could compose pre-swap code and
    report a false `changed: []`. The daemon now registers an after-reload callback by
    reflecting on the Compose Hot Reload AGENT
    (`org.jetbrains.compose.reload.agent.ReloadHooksKt.invokeAfterHotReload` — the
    `-javaagent` jar is app-visible; the runtime-api facade is NOT, verified by CNFE.
    No compile-time dependency, so inspector stays independent of dev-client; plain
    JVMs report `reloadHooked: false`). `/health` and `/render` expose
    `reloadCount`/`reloadErrors`, and `GET /render?afterReload=<n>` holds the render
    (≤10s) until the swap actually lands. After every save the service passes its last
    seen reload count, retries stale renders on a bounded cadence (time-based when the
    hook is absent), and only settles waiters with the post-swap outcome — `changed:
    []` now really means "your edit reached no screen". A swap the agent REJECTS
    (structural change) bumps `reloadErrors` and surfaces as `lastErrorSource:
    "reload"` with a restart-to-heal message instead of silently rendering stale code.
  - **`preview_status` MCP tool** (P0): the agent's post-edit call.
    `{ waitForRender: true, timeoutMs? }` blocks until the next render cycle completes
    (success or failure) or a hot-recompile failure is detected — edit → one call →
    `changedLastRender`/`lastError` verdict; no HTTP polling, no sleeps. Result carries
    `timedOut` on expiry; waiters are settled (never left hanging) on `preview_stop`.
  - **`preview_diff` MCP tool** (P1): `prove_change` with zero bookkeeping — the service
    retains the previous generation of every screen's tree, so `{ screen }` diffs the
    last two renders and returns the full prove_change contract ({changes, regressions,
    verdict}), drift-checked against the previews dir's `design-system.json` when
    present. `snapshot_save` + `prove_change` remain for cross-session goldens.
  - **`render_screen` warm path** (P1): with `projectDir`, the tool now renders through
    the resident preview daemon when one is healthy (~1s vs the 25–40s task cycle) and
    reports `via: "daemon" | "gradle"`; unknown-screen errors surface the daemon's
    message instead of falling through.
  - **Gallery polish** (P2): per-card persistent "changed #N" badge (attribution
    outlives the next render; `lastChangedVersion` per screen in `/status` too), hover
    before/after compare on changed cards (`screen.prev.png` snapshotted before each
    render), and a screen filter box that survives the SSE self-reloads.
  - **State variants documented** (P2): the registry doc (template + `--tabs` codegen)
    now spells out the Storybook-"story" analog — a forced-state screen is just another
    `ScreenPreview("home@empty", …)` entry; loading/empty/error states render side by
    side with the default seeded state.
- **Agent discoverability pass — a clean-install agent now learns the preview loop from
  every surface it auto-loads** (industry anchors: the AGENTS.md open standard, MCP
  server `instructions`, task-shaped tool/skill descriptions with the key info first):
  - Generated **`CLAUDE.md`** gains a "UI feedback loop" section — the exact
    plugin-tool loop (`preview` → `preview_status {waitForRender:true}` →
    `preview_diff`) AND the no-plugin Gradle fallback, feature-markered so
    `--no-inspector` / `--no-dev-client` stamps stay truthful; generated **`AGENTS.md`**
    (new) points every non-Claude agent (Codex/Cursor/Copilot/…) at the same contract.
  - The **cmp-inspector MCP server now ships `instructions`** (injected into every
    connected agent's context): the default UI loop first, tier-1 inspection after;
    server version now read from package.json instead of a stale hardcode.
  - **cmp-preview's skill description is task-shaped**: it triggers on the agent's own
    workflow ("while building or editing ANY CMP screen", "verify a UI change") — not
    only on user phrases like "preview my app".
  - **cmp-new's report step hands over the daily loop** (offer to start `preview` right
    after scaffolding); **cmp-dev-client** cross-links the preview loop; the
    **cmp-orchestrator** agent gates delegated UI changes through
    `preview_status`/`preview_diff` alongside the verify lane.
  - Template README quick-start gains the headless preview one-liner; plugin +
    marketplace descriptions and the root README/USAGE now headline the loop
    ("the agent sees what it builds").

## [0.5.0] - 2026-07-12

Findings from a full field run of the plugin (HealthStack app: 5 tabs, Room, no Firebase,
Android + iOS) — each gap below was hit live, then reproduced and fixed against a stamped
fixture with negative proofs (injected violations caught by their named clauses).

### Added

- **`create-cmp.json` spec-of-record** — the scaffold persists the fully-resolved config
  (name, package, platforms, features, tabs, engine version, timestamp) into the project
  root. Until now the only pre-code spec in the system was validated, consumed, and
  discarded at stamp time; consistency tooling, `upgrade` intent, and re-stamp/resume all
  need it durable.
- **`core/format` KMP-safe helpers** (`pad2`, `clockLabel`, `fixed`) + tests — the
  `"%02d".format(...)` JVM-only trap is the most common first-week `commonMain` porting
  mistake; the template now ships the safe versions.
- **SHELL-05 conformance rule** — every non-shell NavHost destination must compose inside
  `BaseScreen`. A bare destination that never touches inset APIs passes SHELL-03 while
  rendering under the status bar; observed in the field on a generated app's Settings screen.
- **Machine-readable verify verdict** — `::create-cmp-verdict::{json}` as the last verify
  line (+ per-platform durations). Verify logs can exceed 170k lines where `-Werror=` clang
  flags and Xcode phase names false-positive naive error greps; agents anchor on the marker.

### Fixed

- **Room per-target schema directories** — the single shared `schemaDirectory` tripped
  `Inconsistency detected exporting Room schema files` on the *first entity edit after
  scaffold* (stale cross-target intermediates), i.e. for every user on the happy path.
  Schemas now export to `schemas/<target>/`.
- **ARCH-04 scoped by content, not filename** — `*Screen.kt` scoping missed untagged
  `FooContent.kt` split files and false-positived ViewModel-only `FooScreen.kt` files.
  Any presentation-feature file containing `@Composable` must declare a `testTag`.
- **ARCH-01/02 match fully-qualified inline references** — import-only matching left a
  one-edit evasion open (delete the import, qualify the name inline; gate stays green).
- **Non-empty target check allowlists harmless entries** (`.git`, `.claude`, `.DS_Store`,
  `.idea`, `.vscode`) and names the blocking entries — the documented doctor→create flow
  no longer poisons its own target dir into requiring `--force`.
- **Doctor JDK row label** states the actual requirement (`JDK (17+ required)`) and reports
  the resolved major — it previously read "JDK 17 (Temurin)" while accepting JDK 21.

## [0.4.0] - 2026-07-12

### Added

- **Tab surfaces are generated, not static** — the engine (new pipeline step b.3,
  `src/lib/tabs.mjs`) rewrites the tab-driven surfaces from the configured `--tabs` at stamp
  time, so a non-default tabs config can no longer ship stale defaults:
  - `AppTab.kt`: one `appTabs(...)` entry per configured tab (label + Material icon).
  - `AppNavHost.kt`: the `appTabs(...)` call site is wired per tab — `home`/`profile` slugs get
    the shipped feature screens, anything else gets a generated `PlaceholderScreen` stub carrying
    the `<slug>_title` testTag.
  - `qa/e2e/smoke.yaml`: Maestro taps/asserts per tab by `nav_<label-slug>` id; the JS slug rule
    (`navSlug`) mirrors `AppShell.kt`'s `navItemTag` and the two point at each other.
  The default tabs config (`Home:home,Profile:person`) reproduces the static template files
  byte-for-byte — pinned by `test/tab-surfaces.test.mjs`.
- **Agent discoverability pass** — `llms.txt` at the repo root (llmstxt.org convention: identity,
  the non-interactive one-liner, flag reference, doc/showcase links), shipped in the npm tarball
  and linked from the README. `package.json` and the plugin/marketplace manifests now carry the
  literal multi-word search keywords agents emit ("compose multiplatform", "kotlin multiplatform",
  "project generator", "claude code", "ai agent", …), and the npm description states the
  deterministic, non-interactive contract up front.
- **Alias packages** `create-compose-multiplatform` and `create-kmp` (`packages/aliases/`) — thin
  published shims delegating to `create-cmp-cli`, so `npm create compose-multiplatform` /
  `npm create kmp` land in this tool. Published separately from the main package (see the
  npm-publish skill's Alias packages section).
- **Attribution line in generated READMEs** — generated projects' README now ends with a single
  plain-markdown line, `Built with [create-cmp](…) — the AI delivery harness for Compose
  Multiplatform.`, below a `---` rule. One line, no image badge, no tracking, trivially
  deletable; README is outside the verified surface, so removing it never invalidates a receipt.
- **Error-message pages** (`docs/errors/`) — one page per real KMP/CMP build failure the doctor
  diagnoses (kotlin↔KSP lockstep, the KSP2/iOS `ClassNotFoundException: …MainKt` catch-22,
  `SDK location not found`, `~/.konan` disk exhaustion, version-catalog drift): the exact error
  text, why it happens, the manual fix, and the doctor/scaffold one-liners. Linked from the
  README and USAGE.

### Changed

- **README first screenful** now passes the 3-second agent test: the copy-pasteable
  non-interactive one-liner plus the deterministic / exits-non-zero / ships-its-own-verify-lane
  contract sit directly under the badges. Everything below is unchanged from the 0.3.2 rewrite.

## [0.3.2] - 2026-07-12

### Added

- **Bottom-nav testTags** — nav items derive a deterministic `nav_<label-slug>` testTag from
  their label at runtime, and both `qa/e2e/smoke.yaml` and `AppShellTest` now select by tag —
  bringing the shell in line with the template's own durable-test rule (never select by display
  text). Works for any `--tabs` configuration; golden trees unaffected.

### Fixed

- **Evidence receipts now attest test *execution*, not Gradle cache reuse** — the second shipped
  correctness bug caught by dogfooding the public showcase (the first was 0.3.1's inputs-hash gap).
  The verify lane trusted Gradle exit codes, but the build cache can restore a `desktopTest` PASS
  recorded against a *different* tree state: a deterministic re-scaffold produces byte-identical
  sources, and neither `qa/golden/` baselines nor the `UPDATE_GOLDEN` env var were declared task
  inputs. Observed live: an `UPDATE_GOLDEN` capture run was served from cache (so it never wrote
  the new feature's golden baseline), the lane then emitted a zero-SKIP PASS receipt in 81 seconds
  for tests that never executed — and CI, with a cold cache, correctly failed on the missing
  baseline.
  - `qa/verify.mjs`: both `desktopTest` invocations force `--rerun` — compilation stays cached,
    test execution is forced.
  - `composeApp/build.gradle.kts`: `qa/golden/*.json` and `UPDATE_GOLDEN` are declared `Test` task
    inputs, so Gradle caching is honest even outside the lane.
  - Engine regression guard pins both surfaces.
- **`qa/refusal-demo.mjs` now works in real generated repos** — it scaffolded its throwaway app
  via `<repo-parent>/bin/create-cmp.mjs`, a path that only exists inside the create-cmp dev tree;
  it now falls back to `npx --yes create-cmp-cli@latest`. Caught by the negative-proofs walk on
  the public showcase.

### Changed

- The CLI's `--help` banner leads with the AI-delivery-harness identity (matching README, plugin
  and package manifests — ADR-0006), and a long-dead `qa/appium/package.json` rename block was
  removed from the scaffolder (retired by the Maestro migration, ADR-0002).

## [0.3.1] - 2026-07-12

### Fixed

- **Evidence receipts now attest their own commit** — two gaps in the generated `.gitignore` +
  verify lane meant the committed receipt could never match `HEAD`, so CI's receipt-matches-HEAD
  gate would false-fail on the first change in any real repo. Found by dogfooding a full
  generated app (scaffold → add-feature → commit).
  - `.gitignore` ignored `/build` (root-anchored) — it missed module build dirs like
    `composeApp/build/`, which then got committed and destabilised the receipt's inputs hash.
    Now `build/` (unanchored) ignores build outputs at every level.
  - `qa/lib/inputs-hash.mjs` hashed only git-tracked files, so a freshly generated feature's
    files — untracked when the lane runs but committed *with* the receipt — were excluded. Now
    the surface is the **to-be-committed** set (`git ls-files --cached --others --exclude-standard`):
    tracked + untracked-not-ignored, still excluding gitignored scratch.

## [0.3.0] - 2026-07-11

create-cmp repositions from a scaffolder to an **AI CMP delivery harness**: every generated
project now ships a spec-driven verify lane, mechanical enforcement of the evidence contract, and
in-project generators so an AI session can extend the app without the plugin installed.

### Added

- **Spec-driven foundation** — `specs/*.spec.md` (Given/When/Then, stable clause ids) with the
  `home` feature as the fully-cited exemplar; the verify lane's new `specCoverage` step fails on
  orphan clauses (unverified behavior) and orphan tags (untraceable test citations).
- **Conformance + test pyramid (harness M0–M2)** — dependency-free architecture gates enforcing
  the layer boundaries, Compose UI Tests (spec-cited), golden-tree structural baselines, and a11y
  checks, all running on `:composeApp:desktopTest`.
- **In-project generation skills** — `add-feature`, `add-screen`, `add-repository` ship inside
  every generated project (`.claude/skills/`, backed by `qa/scaffold-feature.mjs` and its
  `--preset screen|repository` modes) and clone the `home` exemplar deterministically — no
  create-cmp plugin required to extend the app.
- **Mechanical enforcement (harness M4)** — an evidence-bound Stop hook that refuses to let a
  session end on unproven claims, evidence receipts bound to an inputs hash, CI that checks the
  committed receipt matches `HEAD`, and a refusal demo proving the gate actually blocks.
- **Maestro E2E hardened** — the `e2eSmoke` verify step tolerates slow/CI emulators, and the
  harness has its first green pack proven on-device.
- **`cmp-orchestrator` agent** — delegates low-level generation work and gates every hand-off
  through the verify lane before reporting done.
- **Repo-level ADRs** (`docs/adr/`) and a documentation charter/standards ledger recording where
  the project adopted, adapted, or rejected industry testing/spec practices.

### Changed

- **BREAKING (soft): feature key `appium` renamed to `e2e`.** The CLI flag (`--e2e/--no-e2e`),
  interview prompt, `options.schema.json` property, `template/manifest.json` feature key, and
  template `cmp:feature` markers all use the new name. The old `--appium`/`--no-appium` flags
  keep working as **deprecated aliases** for `--e2e`/`--no-e2e` (a one-line warning is printed);
  no existing script breaks. Recorded in
  [ADR-0002](docs/adr/0002-maestro-over-appium-for-e2e.md).

## [0.2.0] - 2026-07-04

**First release on the npm registry**, and the first feature-complete one: create-cmp goes from a
scaffolder to a whole-lifecycle CMP tool — scaffold, maintain, and inspect the running UI.

### Added

- **Maintain commands** — a subcommand router (`create` / `doctor` / `upgrade` / `clean` / `verify`);
  `upgrade` migrates `gradle/libs.versions.toml` to the next proven-green version set (diff → surgical
  in-place edits with backups → lockstep guardrail → optional verify); `doctor` gains project
  diagnosis on **any** KMP project (kotlin↔ksp lockstep, drift, the KSP2/iOS catch-22, sdk.dir, konan
  bloat, disk) with `--fix`; `clean` for konan/build hygiene; `verify` as a standalone green-build gate.
- **`cmp-inspector` MCP (14 tools)** — read a running Compose UI as a structured JSON tree
  (hierarchy, geometry, **resolved design tokens**, nav state), never screenshots. Tools:
  `inspect_tree`, `get_node`, `assert_token`, `layout_gaps`, `diff_against_design_system`,
  `find_drift`, `snapshot_save`, `snapshot_diff`, `audit_a11y`, `connect_live`,
  `navigate_and_inspect`, `render_tree`, `render_screen`, `prove_change`. One tree contract, three
  source tiers (file / live / uiautomator).
- **Live on-device inspection** — every generated app ships a debug-only, loopback-only inspector
  server (`127.0.0.1:9500`, structurally absent from release) exposing the tree, design-system
  catalog, screenshot, tap, and a same-origin live device-view page.
- **The verified dev loop** — `prove_change`: snapshot → edit → reload → one call proves what changed
  and that nothing regressed (structural diff + token-drift + a11y → verdict).
- **Desktop dev-client** — a phone-sized JVM window running the shared UI with Compose Hot Reload;
  Firebase never initializes on desktop (offline DI fakes).
- **New skills** — `cmp-inspect`, `cmp-upgrade`, `cmp-dev-client`, `cmp-firebase-connect` (wire an app
  to its own Firebase via the CLI), `cmp-test` (generate the Appium suite by observing the app).
- **Trust** — a real Android CI build matrix per push (iOS on manual dispatch), a nightly canary that
  re-verifies the frozen set and probes the next upstream one, and a `verify.yml` shipped into every
  generated project.
- **Docs** — [`docs/USAGE.md`](docs/USAGE.md), the single-entry-point guide to the whole surface.

### Fixed

- Feature toggles delete disabled-feature paths **before** the package rename, so every toggle
  combination (`--no-room`, `--no-firebase`, `--no-inspector`, `--no-dev-client`, …) builds green on
  any package id.
- `template/.gitignore` ships as `template/gitignore` and is restored on stamp (npm strips literal
  `.gitignore` files from tarballs).
- `testTagsAsResourceId` is exposed via an expect/actual shim (Android-only API kept out of
  `commonMain`), so Appium id-selectors resolve on a stock stamped app.

### Note

- `0.1.1` was tagged but never reached the registry (publishing was deferred); `0.2.0` is the first
  published version.

## [0.1.1] - 2026-07-03

Release cut, but publishing was deferred — superseded by `0.2.0`, the first release on the registry.

### Changed

- The npm package publishes as `create-cmp-cli` (the bare `create-cmp` name is an unrelated
  placeholder and `create-cmp-app` is a real, unrelated CMP generator). The installed command
  remains `create-cmp` — `npx create-cmp-cli@latest` works today.
- Added `.claude/skills/npm-publish`, the documented release procedure used to ship this version.

## [0.1.0] - 2026-06-18

Initial release.

### Added

- **Deterministic scaffolder** for Kotlin/Compose Multiplatform (Android + iOS) — stamps a frozen,
  CI-verified golden template rather than freehand-generating a project.
- **CLI** (`create-cmp`) with interactive prompts and non-interactive flags; runnable via
  `npx github:kvdm-co-pilot/create-cmp`.
- **Toolchain doctor** (`doctor → bootstrap → verify`) — detects and (consent-gated) installs JDK 17,
  Android SDK + AVD, Xcode/CLT, CocoaPods, XcodeGen, Node, Appium + uiautomator2/xcuitest drivers.
- **Golden template** — pinned version set (incl. the iOS Room/KSP2 path), full iOS + Android shells,
  a generic bottom-nav `AppShell` with insets pre-solved, Clean Architecture with one example feature
  wired end-to-end, Koin DI, theme tokens, and an Appium smoke harness.
- **Feature toggles** — iOS on/off, Firebase (GitLive) on/off with auth `email`/`phone`/`both`/`none`,
  Room on/off, Appium on/off, configurable bottom-nav tabs.
- **Verify gate** — every scaffold builds the generated app and reports a GREEN/FAIL verdict.
- **Claude Code plugin** — `cmp-new`, `cmp-doctor`, `cmp-qa-prep` skills over the same engine, plus a
  marketplace manifest.

[Unreleased]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kvdm-co-pilot/create-cmp/releases/tag/v0.1.0
