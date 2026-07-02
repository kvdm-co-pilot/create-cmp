---
name: cmp-doctor
description: >-
  Diagnose and install the toolchain a Kotlin/Compose Multiplatform (CMP/KMP) project needs to
  build and test. Use this when the user wants to set up or fix their CMP/KMP toolchain, install
  the Android SDK / AVD / emulator for KMP, install Appium and its drivers for a Compose
  Multiplatform app, set up JDK 17 / Xcode / CocoaPods / XcodeGen for KMP, or asks "set up CMP
  toolchain", "install Appium for KMP", "install Android SDK for Compose Multiplatform", "why won't
  my KMP project build", "my Compose Multiplatform build fails", "prepare my machine for KMP
  Android + iOS", or "fix my Kotlin Multiplatform environment". Idempotent, OS-aware, and
  consent-gated — shows each exact command and asks before installing. Ends with a per-dependency
  GREEN/FAIL verdict.
---

# cmp-doctor — bootstrap the CMP toolchain

Your job: get the machine to a state where a CMP/KMP project can build (Android, and iOS on macOS)
and run Appium tests. You wrap the engine's bootstrap (`src/doctor.mjs` per CONTRACT/DESIGN; exposed
on the CLI as the `doctor` subcommand). **Do not hand-roll installs in bash** when the engine can do
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

## How to run it

```bash
# Diagnose + heal, consent-gated (default — asks before each install):
node <repo>/bin/create-cmp.mjs doctor

# Unattended / CI — auto-accept every install:
node <repo>/bin/create-cmp.mjs doctor --yes
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

Relay the engine's per-dependency **GREEN/FAIL verdict** verbatim. For anything FAIL, give the user
the precise next step (e.g. "install Xcode from the App Store, then re-run"). When everything is
GREEN, point them at **cmp-new** to scaffold an app or **cmp-qa-prep** to bring up the test harness.
