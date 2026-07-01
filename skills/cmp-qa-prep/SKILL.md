---
name: cmp-qa-prep
description: >-
  Bring up the Appium test harness for a Kotlin/Compose Multiplatform (CMP/KMP) app — start the
  Android emulator, install the debug build, launch an Appium session, and run the bottom-nav smoke
  test. Use this when the user wants to run Appium tests on their CMP/KMP app, prepare or set up the
  KMP test environment, smoke-test a Compose Multiplatform app on an emulator, or asks "run Appium
  tests on my CMP app", "prep my KMP test environment", "smoke test my Compose Multiplatform app",
  "start the emulator and Appium for my KMP project", or "verify my CMP app runs on a device".
  Assumes the toolchain is already installed (see cmp-doctor) and an app already exists (see
  cmp-new).
---

# cmp-qa-prep — Appium harness bring-up for a CMP app

Your job: take an already-scaffolded CMP/KMP project to a running, smoke-passing app on an Android
emulator, driven by Appium. This wraps the template's `qa/appium/` client + smoke runner and the
`tests/appium/cmp/` config the engine ships.

## Preconditions

- Toolchain present (JDK, Android SDK + AVD, Appium 3.x + `uiautomator2` driver). If not, run
  **cmp-doctor** first.
- A scaffolded project with the Appium harness enabled (the `appium` toggle in **cmp-new**). If the
  project was scaffolded with Appium off, say so — there is no harness to bring up.

## Bring-up sequence

1. **Disk check first** (builds fail with "No space left on device"): `df -h ~` — want ≥ 3 GB free.
2. **Boot an emulator** from the AVD that `cmp-doctor` created (`emulator -avd <name>` /
   `adb wait-for-device`).
3. **Build + install** the debug app: `./gradlew :composeApp:installDebug` (exit 0 = success).
4. **Reverse-port** any local services the harness needs (`adb reverse`), if applicable.
5. **Start Appium + create a session.** Prefer the Appium MCP tools (`appium_session_management`
   with `action=create`, UiAutomator2 caps) over raw CLI when an MCP session is available; otherwise
   start `appium` and connect the harness client in `qa/appium/`.
6. **Run the smoke** — the sample smoke that asserts the bottom nav renders
   (`tests/appium/cmp/`). This is the same north-star proof the engine's `--verify` uses.

## Locator hygiene (Appium)

Prefer accessibility id / id over long XPath. Use `scroll_to_element` for off-screen targets rather
than re-querying. Use gestures for taps/drags. Don't assert on screenshots/pixels — assert on the
element tree.

## Report

Report: disk headroom, emulator/AVD used, install exit code, Appium session status, and the smoke
**PASS/FAIL** with the asserted element. On failure, give the concrete next step (e.g. low disk →
clean Gradle caches; no AVD → run **cmp-doctor**; build error → surface the Gradle failure).
