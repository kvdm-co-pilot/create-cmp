# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kvdm-co-pilot/create-cmp/releases/tag/v0.1.0
