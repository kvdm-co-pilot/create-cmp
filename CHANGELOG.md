# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kvdm-co-pilot/create-cmp/releases/tag/v0.1.0
