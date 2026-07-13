---
name: cmp-dev-client
description: >-
  Run a create-cmp Compose Multiplatform app's shared UI in a live desktop window with Compose
  Hot Reload — the daily dev loop. Use this when the user wants to run their CMP app on desktop,
  preview the app while developing, iterate on Compose UI without an emulator, or asks "run my
  CMP app on desktop", "hot reload compose", "preview my app while developing", "dev client",
  "desktop target", "compose hot reload not working", or "see my UI changes live". Covers the
  hotRunDesktop/run Gradle tasks, how reload triggers, the desktop DI fakes (no Firebase on
  desktop), and adding desktop fakes for new repositories.
---

# cmp-dev-client — the desktop dev loop for a stamped CMP app

Every app stamped by `create-cmp` (unless `--no-dev-client`) ships a pre-wired `jvm("desktop")`
target inside `composeApp`: the whole `commonMain` UI — screens, ViewModels, navigation, theme,
Koin DI — in a live, clickable, phone-sized JVM window, with **Compose Hot Reload** attached.
This is the daily-driver loop; the Android emulator / iOS simulator are for platform
verification, not for iterating on UI.

## 1. The run loop

From the generated project root:

```bash
# Hot reload + auto-reload on save (recommended):
./gradlew :composeApp:hotRunDesktop --auto

# Hot reload, explicit mode (trigger with `./gradlew reload` or the IDE's Reload UI button):
./gradlew :composeApp:hotRunDesktop

# Plain run — no hot reload, no JetBrains Runtime needed, any JDK 17+:
./gradlew :composeApp:run
```

Loop: keep the window open → edit a composable in `commonMain` → save → the window updates in
place. No reinstall, no restart, state largely preserved.

Notes you should relay when relevant:

- The task is `hotRunDesktop` because the target is named `desktop` (`hotRunJvm` is the
  default-name variant you'll see in JetBrains docs).
- Hot reload runs the app on the **JetBrains Runtime**. The scaffold pre-wires the
  `foojay-resolver-convention` settings plugin, so Gradle auto-downloads a JBR on first
  `hotRunDesktop` if none is installed — a one-time download; don't let the user think it hangs.
- Structural changes (new `expect`/`actual`, Gradle edits, new modules) need a task restart;
  in-function/UI edits hot-swap.
- The window is phone-sized (411×891 dp, titled `<AppName> dev-client`) so what the user sees
  approximates the device layout.

## 2. What's faked on desktop (and how to extend it)

Desktop platform seams live in `composeApp/src/desktopMain/kotlin/<package>/`:

| Seam | Desktop implementation |
|---|---|
| `NetworkMonitor` | Always-online stub |
| Room | Real Room (BundledSQLiteDriver) writing to the OS temp dir — disposable cache |
| Firebase | **Never initialized** — zero Firebase code, config, or network on desktop |
| Example `ItemRepository` | The same in-memory `ItemRepositoryImpl` all platforms bind |

`di/DesktopModule.kt` mirrors `AppApplication` (Android) / `KoinHelper` (iOS). **The rule to
teach:** when the app gains a real remote-backed repository, bind an in-memory fake for it in
`DesktopModule.kt` so the dev-client keeps running without a backend. GitLive Firebase does
publish JVM artifacts (so the target compiles with Firebase enabled), but the dev-client
deliberately never calls them — desktop is an offline dev surface, not a fourth platform.

## 3. Same module, three jobs

The JVM/desktop runtime this feature adds is the same tier the **inspector** uses for headless
rendering (see the cmp-inspect skill): one proven JVM surface hosts the dev window, the headless
semantics renderer, and future screen previews. If the user asks to "see" the app as structured
data while it runs, hand off to **cmp-inspect**.

## 4. Troubleshooting

- `hotRunDesktop` not found → the app was stamped `--no-dev-client`, or the target/plugin was
  removed. Check `composeApp/build.gradle.kts` for `jvm("desktop")` and
  `libs.plugins.compose.hot.reload`; re-stamp or wire them back per the template.
- First `hotRunDesktop` is slow → JBR auto-provisioning download; subsequent runs are fast.
- `compileKotlinDesktop` fails after adding a library → the new commonMain dependency may not
  publish a JVM artifact. Either pick a KMP library with JVM support or move the dependency to
  `androidMain`/`iosMain` and put a desktop fake behind an interface.
- Version bumps: Compose Hot Reload 1.1.1 needs Kotlin ≥ 2.1.20 and CMP ≥ 1.8.2; the 1.2.x line
  needs CMP ≥ 1.10. Never bump it in isolation from the pinned set — run `create-cmp upgrade`.

## Related

- **cmp-preview** — stills of EVERY screen at once, auto-refreshed on save, with per-screen
  changed-attribution and compile-error surfacing for the agent (`preview` →
  `preview_status {waitForRender:true}` → `preview_diff`). The dev-client is one live clickable
  window; cmp-preview is the whole app at a glance and the agent's verification loop — most
  sessions want both.
- **cmp-inspect** — structured inspection of the RUNNING app (tier 1: real navigation state,
  on-device data).
