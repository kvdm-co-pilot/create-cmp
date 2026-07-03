<div align="center">

# create-cmp

**Scaffold a green-building Kotlin/Compose Multiplatform app (Android + iOS) in minutes — not hours.**

Toolchain auto-bootstrapped · Navigation & insets pre-solved · Clean Architecture wired · Appium harness ready.

[![CI](https://github.com/kvdm-co-pilot/create-cmp/actions/workflows/ci.yml/badge.svg)](https://github.com/kvdm-co-pilot/create-cmp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Kotlin Multiplatform](https://img.shields.io/badge/Kotlin-Multiplatform-7F52FF.svg?logo=kotlin&logoColor=white)](https://kotlinlang.org/docs/multiplatform.html)
[![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757.svg)](#use-it-from-claude-code)

</div>

---

Starting a Compose Multiplatform project is slow and flaky — not because the knowledge is hard, but
because it isn't *reproducible*. Kotlin ↔ KSP ↔ CMP ↔ Room ↔ AGP must all agree or the build dies;
the iOS shell (XcodeGen + CocoaPods + Firebase pods + AppDelegate + framework embedding) is a
multi-step minefield; edge-to-edge insets get re-debugged on every project; and the toolchain itself
is a cliff most scaffolders leave to you. That friction is why greenfield mobile apps quietly default
to React Native.

**`create-cmp` removes the friction.** It *stamps* a frozen, CI-verified golden template (it does not
freehand-generate your project), bootstraps the toolchain, and **proves a green build** before it
reports success.

## Contents

- [Quick start](#quick-start)
- [Commands](#commands)
- [What you get](#what-you-get-the-pre-solved-moat)
- [Options](#options)
- [Use it from Claude Code](#use-it-from-claude-code)
- [Why CMP, not React Native](#why-cmp-not-react-native)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

## Quick start

```bash
npx create-cmp-cli@latest
```

…or non-interactively:

```bash
npx create-cmp-cli@latest --name Acme --package com.acme.app --yes --verify
```

The scaffolder interviews you (or takes flags), runs the toolchain doctor, stamps the template, and
builds the app to prove it's green.

> **On the package name:** it publishes as `create-cmp-cli` — the bare name `create-cmp` is held by
> an unrelated placeholder, and `create-cmp-app` is a real, unrelated CMP generator, so we didn't
> reuse either. The installed *command* is still `create-cmp`. You can also run straight from GitHub
> with no install: `npx github:kvdm-co-pilot/create-cmp`, or use the
> [Claude Code plugin](#use-it-from-claude-code).

## Commands

`create-cmp` is useful across the whole life of a project, not just day one — and every command
except `create` works on **any** KMP project, not only ones it scaffolded:

| Command | What it does |
|---|---|
| `create-cmp [dir]` / `create-cmp create` | Scaffold a new app from the frozen golden template (the default command). |
| `create-cmp doctor [--fix]` | Toolchain preflight (JDK/SDK/Xcode/Appium, consent-gated installs) **plus** project diagnosis when run inside a Gradle project: kotlin↔ksp lockstep, drift vs proven-green sets, the KSP2/iOS catch-22, sdk.dir, `~/.konan` bloat, disk space. `--fix` applies the safe heals. |
| `create-cmp upgrade [--dry-run]` | Migrate `gradle/libs.versions.toml` to the next proven-green version set — diff table first, surgical in-place edits with `.bak-upgrade` backups, kotlin↔ksp lockstep guardrail, `--verify` to prove the result. |
| `create-cmp clean` | Cache & build-output hygiene: stale `~/.konan` toolchains + project `build/`/`.gradle/` dirs (sizes shown, consent-gated); `~/.gradle/caches` is size-reported only. |
| `create-cmp verify [--target-dir .]` | Run the green-build gate (Android, and iOS on macOS) against an existing project. |

> **North-star (a goal, measured honestly — not a benchmark):** *time-to-green* — a running app on
> the Android emulator **and** the iOS simulator, smoke-passing, with zero manual steps modulo the
> one Xcode App Store install. Target: **under 5 minutes on a clean machine.** Every scaffold ends
> with a `--verify` build gate, so success is *proven*, not assumed.

## What you get (the pre-solved moat)

Everything below is **stamped from a template that builds green on Android + iOS** — not regenerated
per run, so it can't silently drift:

- **A pinned, version-locked dependency set** — Kotlin, KSP, Compose Multiplatform, Room, AGP, Koin,
  Ktor, GitLive Firebase KMP, Navigation Compose, Lifecycle — chosen to actually agree with each
  other, including the iOS Room/KSP2 catch-22 (`ksp.useKSP2=true`). Frozen and CI-gated.
- **The iOS shell, in the order that builds** — `project.yml` (XcodeGen), `Podfile` (Firebase static
  linkage), `Info.plist`, `iOSApp.swift` (AppDelegate + `FirebaseApp.configure()` before Koin),
  `ContentView.swift` (ComposeUIViewController bridge).
- **The Android shell** — `AndroidManifest`, `MainActivity` with `enableEdgeToEdge()`, `Application`
  starting Koin + Room, adaptive-icon structure.
- **Navigation + insets, solved once** — a generic `BaseScreen` Scaffold owning window insets /
  status- and nav-bar padding, plus a data-driven `AppShell` + bottom nav fed by your `tabs` list
  (not role-hardcoded), with type-safe routes.
- **Clean Architecture, wired** — `core / data{local,remote} / domain{model,repository,usecase} /
  presentation{components,theme,navigation,<feature>} / di` with Koin modules registered and **one
  example feature wired end-to-end** as the copy-paste pattern.
- **Theme & tokens** — `<Prefix>Theme`, `<Prefix>Tokens`, `<Prefix>Colors`, DM Sans.
- **An Appium harness** — an Appium client + smoke runner and a sample smoke asserting the bottom nav
  renders, so "done" can be proven on a device.
- **A toolchain doctor** — diagnoses *and* heals JDK, Android SDK + AVD, Xcode/CLT, CocoaPods,
  XcodeGen, Appium + drivers, Node. Idempotent, OS-aware, consent-gated.

`google-services.json` / `GoogleService-Info.plist` are intentionally **not** real — you get
placeholders and clear "drop your Firebase config here" instructions.

## Options

| Option | Choices | Default |
|---|---|---|
| Platforms | Android (always) + iOS | iOS on |
| App name / package / iOS bundle id | — | required / derived |
| Firebase region | any Firebase region | `us-central1` |
| Firebase (GitLive KMP) | on / off | on |
| Auth | `email` / `phone` / `both` / `none` | `both` |
| Firebase services | Firestore · Storage · Functions · FCM | all on |
| Room local cache | on / off | on |
| Appium harness | on / off | on |
| Bottom-nav tabs | label + icon, any count | Home, Profile |

_(Web/PWA is intentionally out of scope — Android + iOS only.)_

## Use it from Claude Code

`create-cmp` also ships as a [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin — one
shared engine, two front doors. Install from the bundled marketplace:

```text
/plugin marketplace add kvdm-co-pilot/create-cmp
/plugin install create-cmp
```

It bundles five skills (plus the `cmp-inspector` MCP server), each with a deterministic engine
behind it:

- **cmp-new** — conversational interview, then shells out to the same engine to scaffold, and
  generates your tab screens from the example-feature pattern.
- **cmp-doctor** — toolchain bootstrap + project diagnosis on any KMP project (consent-gated).
- **cmp-upgrade** — migrate to the next proven-green version set (diff → apply → verify).
- **cmp-inspect** — read a rendered Compose UI as structured JSON: hierarchy, geometry, resolved
  design tokens, token-drift diffs, golden-tree snapshots, a11y audit — no screenshots.
- **cmp-qa-prep** — brings up the emulator + Appium session + smoke.

## Why CMP, not React Native

This isn't a knock on React Native — it's about defaults. The only place CMP loses to RN on a new
app is **time-to-first-green-build**, and that's a tooling problem, not a merits problem. With
`create-cmp`, CMP's `npx`-and-go is competitive:

- **One language, real native UI.** Kotlin shared logic *and* Compose UI across Android and iOS — no
  JS bridge, no separate native-module dance for the common case.
- **Native performance and platform access** without the RN bridge tax.
- **Reproducible by construction.** A frozen, version-locked, CI-gated template means the build that
  was green yesterday is green today — the exact property ad-hoc CMP setups lack.
- **Proven, not assumed.** Every scaffold ends on a real build (and an Appium smoke), with a
  GREEN/FAIL verdict.

If `create-next-app` made React the default for the web by removing setup friction, the goal here is
the same for multiplatform mobile.

## How it works

```
Front doors:  npx create-cmp-cli   +   Claude Code plugin (cmp-new / cmp-doctor / cmp-qa-prep)
                                  │  one shared engine, two front doors
Engine (Node, deterministic):     copy → token-replace → rename packages → toggle features → VERIFY
Golden template (frozen, CI'd):   pinned versions · iOS shell · nav+insets · Clean Arch · DI · Appium
```

The engine never puts an LLM in the hot path: it copies the template, replaces placeholders in file
contents *and* paths, atomically renames package directories, toggles features (Firebase / auth type
/ Room / Appium), and runs the verify build. Determinism is the moat. See
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full design.

## Requirements

- **Node.js ≥ 18** to run the scaffolder.
- **macOS** for iOS output (Xcode, CocoaPods, XcodeGen). Android output works on macOS or Linux.
- Everything else — JDK 17, Android SDK + emulator, CocoaPods, XcodeGen, Appium + drivers — the
  built-in `doctor` detects and (with your consent) installs. Xcode itself must be installed from the
  App Store; the doctor surfaces that as the one manual step.

## Roadmap

The full plan — six pillars from scaffold to store release, and the sequencing — lives in
[`docs/ROADMAP.md`](./docs/ROADMAP.md). Near-term:

- [ ] Publish to npm as `create-cmp-cli` (`npx create-cmp-cli`) — release cut, publish pending.
- [ ] Record the asciinema demo (`npx create-cmp-cli` → green Android + iOS).
- [ ] Full Android + iOS build matrix in CI (currently CI runs the engine unit tests).
- [ ] More example features and nav shapes.
- **AI-native Compose inspector** — read a running app's hierarchy, geometry, and *resolved design
  tokens* as structured JSON (no screenshots). **Phase 0 (headless host-JVM render → inspect) is
  built and verified**; live-emulator inspection is next. See
  [`docs/INSPECTOR-PLAN.md`](./docs/INSPECTOR-PLAN.md).

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md). The golden template is CI-gated: an upstream version bump
must fail CI, not your generated project.

## License

[MIT](./LICENSE) © Karel van der Merwe and create-cmp contributors.
