# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kvdm-co-pilot/create-cmp/releases/tag/v0.1.0
