# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kvdm-co-pilot/create-cmp/releases/tag/v0.1.0
