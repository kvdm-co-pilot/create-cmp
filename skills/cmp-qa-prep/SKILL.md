---
name: cmp-qa-prep
description: >-
  Bring up the E2E harness for a Kotlin/Compose Multiplatform app — boot the Android emulator,
  install the debug build, run the Maestro smoke — or, simpler, run the verify lane, which does all
  three itself. Use this when the user wants to run E2E/device tests on their CMP/KMP app, "prep my
  KMP test environment", "smoke test my Compose Multiplatform app", "run maestro on my CMP app", or
  "verify my CMP app runs on a device". Assumes the toolchain is installed (cmp-doctor) and an app
  exists (cmp-new).
---

# cmp-qa-prep — E2E harness bring-up for a CMP app

Current scaffolds ship **Maestro** flows (`qa/e2e/*.yaml`). Two ways to bring the harness up; the
first is almost always the one you want:

1. **Let the lane do it:** `node qa/verify.mjs`. With nothing attached it boots the project's AVD
   headless (`CMP_AVD` overrides), installs the debug build, runs every flow in `qa/e2e/`, writes
   the receipt, and shuts the emulator down. This is the done-gate; a green run here IS the proof.
2. **By hand, for an interactive session:** check disk first (`df -h ~`, ≥ 3 GB free — Gradle
   fails with "No space left on device"); boot **headless** —

   ```
   emulator -avd <name> -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect
   ```

   — then `adb wait-for-device` (the AVD `cmp-doctor` created; one AVD per app);
   `./gradlew :composeApp:installDebug`; `maestro test qa/e2e/smoke.yaml`
   (CLI: `curl -fsSL https://get.maestro.mobile.dev | bash`).
   Device proof is a checkpoint, never an inner loop — the project's PreToolUse hook reminds you.

**Headless is the rule, not a preference** (Karel, 2026-09-09: *"always run device tests in headless
mode"*). Those flags are `HEADLESS_ARGS` in the cmp profile's `device-provider.mjs`, and they are
what path 1 already uses — so **do not hand-boot a windowed emulator in front of a lane that would
have booted its own**. A window costs GPU and RAM the build wants, makes the run depend on a
desktop session, and differs from what CI does; `-no-snapshot` is there so every lane boots the same
cold device rather than inheriting yesterday's state. If a device is already attached the lane uses
it as-is, which is exactly how a windowed emulator quietly becomes the thing your proof ran on —
`node scripts/fleet-check.mjs` now says so when it finds one.

Preconditions: toolchain present (JDK, Android SDK + AVD — **cmp-doctor** heals it); a project
scaffolded with the `e2e` toggle on (otherwise say so — there is no harness to bring up).

Legacy pre-Maestro scaffolds (`qa/appium/`, `tests/appium/`; the toggle was renamed from `appium`
in 0.3.0) are not covered here — migrate with **cmp-upgrade**, or see the skill's history.

## Report

Disk headroom, emulator/AVD used, install exit code, and the smoke **PASS/FAIL** with the asserted
element. On failure, the concrete next step: low disk → clean Gradle caches; no AVD → **cmp-doctor**;
build error → surface the Gradle failure; `device offline` while `adb devices` is fine →
`adb kill-server && adb start-server`.
