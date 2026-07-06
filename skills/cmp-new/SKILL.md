---
name: cmp-new
description: >-
  Scaffold a new Kotlin Multiplatform / Compose Multiplatform (CMP/KMP) app from scratch.
  Use this when the user wants to start, create, bootstrap, or set up a new Kotlin Multiplatform
  project, a Compose Multiplatform app, a cross-platform Android + iOS app in Kotlin, or asks
  "create a CMP app", "scaffold a KMP app", "new Kotlin Multiplatform project", "start a Compose
  Multiplatform app", "KMP from scratch", "set up KMP Android and iOS", "Kotlin shared mobile app",
  or compares options like "React Native vs KMP", "should I use Compose Multiplatform or React
  Native", "Flutter vs KMP". Runs a short interview (platforms, app name, package, Firebase/auth,
  Room, Appium, bottom-nav tabs), then stamps a frozen version-locked template via the create-cmp
  engine (navigation/insets pre-solved, Clean Architecture wired) and generates the requested tab
  screens. Proves a GREEN build before reporting success.
---

# cmp-new — scaffold a Compose/Kotlin Multiplatform app

Your job: turn a request to start a new CMP/KMP app into a green-building project. You run a short
interview, assemble the engine config object, **shell out to the deterministic `create-cmp` engine**
(never hand-author the skeleton), then do the small bespoke layer — generating the user's tab
screens from the example-feature pattern the template ships.

> **Determinism rule.** The 90% of a CMP project that is identical every time is a frozen,
> CI-verified template that the engine *stamps* — copy → token-replace → toggle. Do NOT regenerate
> Gradle files, the iOS shell, navigation, or DI by hand; that is exactly what makes CMP setup
> flaky. You only author the per-app screens after the engine has run.

## 1. Interview

Ask these, accepting sensible defaults. Keep it to one compact round of questions; don't
interrogate. Defaults shown in brackets.

| Option | Question | Default |
|---|---|---|
| `appName` | Display name? | required |
| `package` | Reverse-DNS package id (e.g. `com.acme.app`)? | derived from appName |
| `iosBundleId` | iOS bundle id? | same as `package` |
| `platforms.ios` | Include iOS (Android is always on)? | `true` |
| `region` | Firebase region? | `us-central1` |
| `firebase.enabled` | Use Firebase (GitLive KMP)? | `true` |
| `firebase.auth` | Auth: `email` / `phone` / `both` / `none`? | `both` |
| `firebase.firestore/storage/functions/fcm` | Which Firebase services? | all on if Firebase on |
| `room` | Room local cache? | `true` |
| `appium` | E2E test harness (Maestro flows in `qa/e2e/`; key `appium` is the legacy name, renamed in 0.3.0)? | `true` |
| `inspector` | Live on-device inspector (debug builds only — AI-inspectable UI)? | `true` |
| `devClient` | Desktop dev-client window with Compose Hot Reload? | `true` |
| `tabs` | Bottom-nav tabs — label + icon each (e.g. Home/home, Profile/person)? | `[Home, Profile]` |
| `targetDir` | Output directory? | `./<kebab appName>` |

`themePrefix` is the PascalCase form of the app name (the prefix in `<Prefix>Theme` etc.) —
derive it, don't ask.

## 2. Assemble the engine config object

Build exactly the shape from `docs/CONTRACT.md` (validated by `options.schema.json`):

```json
{
  "appName": "Acme", "package": "com.acme.app", "iosBundleId": "com.acme.app",
  "region": "us-central1", "themePrefix": "Acme",
  "platforms": { "android": true, "ios": true },
  "firebase": { "enabled": true, "auth": "both", "firestore": true, "storage": true, "functions": true, "fcm": true },
  "room": true, "appium": true, "inspector": true, "devClient": true,
  "tabs": [{ "label": "Home", "icon": "home" }, { "label": "Profile", "icon": "person" }],
  "targetDir": "./acme"
}
```

## 3. Shell out to the engine

Invoke the bundled engine — never reimplement scaffolding. From the plugin/repo root, the entry
point is `bin/create-cmp.mjs` (CONTRACT). Two equivalent invocations:

```bash
# Preferred when the engine is installed in this repo / plugin:
node <repo>/bin/create-cmp.mjs \
  --name "Acme" \
  --package com.acme.app \
  --bundle-id com.acme.app \
  --region us-central1 \
  --theme-prefix Acme \
  --ios --firebase --auth both --room --appium --inspector --dev-client \
  --tabs "Home:home,Profile:person" \
  --target-dir ./acme \
  --verify \
  --yes

# Or, for any machine, via npm (once published):
npx create-cmp-cli@latest --name "Acme" --package com.acme.app --yes
```

Notes:
- Pass `--yes` so the engine runs unattended (no re-prompting — you already interviewed).
- Pass `--verify` so the engine runs its north-star gate: the first Gradle build
  (`./gradlew :composeApp:assembleDebug`, plus the iOS build on macOS when iOS is enabled) and
  reports **GREEN/FAIL**. Do not claim success without this verdict.
- For toggles that are off, pass the negative flag (e.g. `--no-ios`, `--no-firebase`, `--no-room`,
  `--no-appium`, `--no-inspector`, `--no-dev-client`) or `--auth none`.
- If the engine exposes a config-file entry instead of flags, write the config object from §2 to a
  temp JSON and pass it through the engine's config flag. **Reconcile the exact flag spelling with
  the engine's `--help` / `options.schema.json`** before depending on a specific flag name; the
  config-object *shape* in §2 is the stable contract, individual CLI flag names are the engine
  agent's surface.

## 4. Bespoke layer — generate the tab screens

After the engine reports GREEN, generate one screen per tab the user requested, copying the
**example feature** the template ships (`presentation/<feature>/` + its ViewModel/state, wired into
navigation and the Koin DI module). For each tab:

1. Copy the example-feature screen + ViewModel pattern, renaming to the tab label.
2. Register the route in the type-safe `Screen`/`Routes` and add it to the `tabs` list the generic
   `AppShell`/bottom-nav consumes (the shell is data-driven, not role-hardcoded — just extend the
   list).
3. Hook the ViewModel into the existing Koin module.
4. Keep each screen inside the template's `BaseScreen` Scaffold so insets/edge-to-edge stay solved.

Match the template's existing style exactly — Clean Architecture boundaries
(`data/domain/presentation/di`), theme tokens (`<Prefix>Tokens`/`<Prefix>Theme`), DM Sans.

## 5. Report

Tell the user: the target directory, the GREEN/FAIL verdict from the engine, which tabs/screens you
generated, and the next commands — drop in `google-services.json` / `GoogleService-Info.plist`
(intentionally not templated), then `./gradlew :composeApp:installDebug` (Android) and, on macOS,
the iOS build. If they want a device run + smoke, point them at the **cmp-qa-prep** skill; if their
toolchain is incomplete, point them at **cmp-doctor** first.
