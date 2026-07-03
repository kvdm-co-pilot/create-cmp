---
name: cmp-doctor
description: >-
  Diagnose and heal both the toolchain AND the project a Kotlin/Compose Multiplatform (CMP/KMP)
  build needs. Use this when the user wants to set up or fix their CMP/KMP toolchain, install
  the Android SDK / AVD / emulator for KMP, install Appium and its drivers for a Compose
  Multiplatform app, set up JDK 17 / Xcode / CocoaPods / XcodeGen for KMP, or asks "set up CMP
  toolchain", "install Appium for KMP", "install Android SDK for Compose Multiplatform", "why won't
  my KMP project build", "my Compose Multiplatform build fails", "kotlin and ksp version mismatch",
  "check my version catalog", "prepare my machine for KMP Android + iOS", or "fix my Kotlin
  Multiplatform environment". When run inside ANY Gradle/KMP project (not just create-cmp-scaffolded
  ones) it additionally diagnoses the project itself: kotlin↔ksp lockstep, drift vs proven-green
  version sets, the KSP2/iOS Room catch-22, local.properties/SDK wiring, ~/.konan bloat, and free
  disk space — with --fix applying the safe heals. Idempotent, OS-aware, and consent-gated — shows
  each exact command and asks before installing. Ends with a per-dependency GREEN/FAIL verdict.
---

# cmp-doctor — bootstrap the CMP toolchain & diagnose the project

Your job: get the machine to a state where a CMP/KMP project can build (Android, and iOS on macOS)
and run Appium tests — and, when run inside a project, get the *project* to a buildable state too.
You wrap the engine's bootstrap (`src/doctor.mjs` per CONTRACT/DESIGN; exposed on the CLI as the
`doctor` subcommand). **Do not hand-roll installs in bash** when the engine can do
it — the engine is idempotent and verifies each tool. Use this skill to drive it and to relay its
consent prompts.

## What it checks, then offers to install

- **JDK 17** (Temurin, via Homebrew or SDKMAN).
- **Android SDK + cmdline-tools** via `sdkmanager` (platform, build-tools, platform-tools, emulator,
  a system image) and a bootable **AVD**.
- **Xcode + Command Line Tools** — checks `xcode-select`. Xcode itself cannot be installed from the
  CLI; the App Store step is surfaced as the *one* unavoidable manual action and handled gracefully.
- **CocoaPods** and **XcodeGen** (Homebrew).
- **Node + Appium 3.x** and its **drivers** (`appium driver install uiautomator2`, and `xcuitest`
  on macOS), each verified.
- **adb / emulator reverse-port** wiring for the test harness.

On **Linux**, it scopes to Android-only and says so explicitly (no iOS toolchain).

## Project diagnosis — works on ANY KMP project

When doctor runs inside (or is pointed at, via `--target-dir`) a directory with Gradle files, it
adds a **project diagnosis** section on top of the toolchain checks. This works on any KMP project
with a `gradle/libs.versions.toml` — whoever scaffolded it:

- **kotlin ↔ ksp lockstep** — `ksp` must be `<kotlin>-<kspVersion>`; a mismatch is the classic
  KMP build-killer and is reported as a FAIL.
- **Drift vs the nearest proven-green version set** — which catalog versions differ from a
  CI-verified set, with `create-cmp upgrade` as the one-command fix.
- **The KSP2/iOS catch-22** — Room + an iOS target without `ksp.useKSP2=true` in gradle.properties
  dies at link time with `ClassNotFoundException: …MainKt`; doctor flags it (and `--fix` heals it).
- **local.properties / sdk.dir** — missing file, missing key, or a path that doesn't exist.
- **Environment** — `~/.konan` size (reported when over 10 GB) and free disk space (warned under
  3 GB — a real KMP build-killer).

`--fix` applies only the SAFE heals (write `local.properties` from `ANDROID_HOME`, add
`ksp.useKSP2=true`); everything else prints the exact manual command instead.

## How to run it

```bash
# Diagnose + heal, consent-gated (default — asks before each install):
node <repo>/bin/create-cmp.mjs doctor

# Unattended / CI — auto-accept every install:
node <repo>/bin/create-cmp.mjs doctor --yes

# Inside (or pointed at) a KMP project — adds the project diagnosis;
# --fix applies the safe heals:
node <repo>/bin/create-cmp.mjs doctor --target-dir . --fix
```

(If invoked from the published package: `npx create-cmp-cli@latest doctor`.)

## Consent gating — the hard rule

This skill installs system software. **It is consent-gated by design:**

- In interactive use, the engine shows the **exact command** for each missing tool and asks before
  running it. Relay that prompt to the user and wait for approval — do not pass `--yes` unless the
  user explicitly asked for an unattended/CI run.
- Never install Xcode silently — surface the App Store action and let the user do it.
- It is idempotent: already-present tools are detected and skipped, so re-running is safe.

## Report

Relay the engine's per-dependency **GREEN/FAIL verdict** verbatim, and the project-diagnosis
findings when it ran inside a project. For anything FAIL, give the user the precise next step
(e.g. "install Xcode from the App Store, then re-run"; for version drift or a lockstep violation,
point them at **cmp-upgrade**). When everything is GREEN, point them at **cmp-new** to scaffold an
app or **cmp-qa-prep** to bring up the test harness.
