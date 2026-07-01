# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kvdm-co-pilot/create-cmp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kvdm-co-pilot/create-cmp/releases/tag/v0.1.0
