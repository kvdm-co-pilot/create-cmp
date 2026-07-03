---
name: cmp-firebase-connect
description: >-
  Wire a freshly scaffolded CMP/KMP app to its OWN real Firebase project — the #1 post-scaffold
  manual step. Use this when the user wants to connect their app to Firebase, or asks "connect my
  app to firebase", "set up google-services.json", "wire firebase", "create a firebase project for
  this app", "replace the placeholder firebase config", "get a real GoogleService-Info.plist",
  "my app still has the REPLACE_ME firebase config", or right after cmp-new as post-scaffold
  onboarding. Drives the Firebase CLI end-to-end — login, project create/reuse, Android app
  registration, real google-services.json in place of the placeholder — every cloud-mutating
  command consent-gated, then proves it with a green assembleDebug. Android-first; iOS branch
  optional/deferred.
---

# cmp-firebase-connect — wire a stamped CMP app to its own Firebase project

Your job: take a CMP app that `create-cmp` stamped with a **placeholder** `google-services.json`
(`REPLACE_ME_PROJECT_ID`, zeroed app id) and connect it to a **real Firebase project on the user's
account**, using the Firebase CLI — no console clicking for anything the CLI can do. You finish by
proving the wiring with a green build.

> **Consent rule.** Every command that creates or mutates a cloud resource on the user's Google
> account (`projects:create`, `apps:create`, `firestore:databases:create`, `apps:android:sha:create`)
> is shown to the user **verbatim first** and run only after an explicit yes. Read-only commands
> (`--version`, `login:list`, `projects:list`, `apps:list`, `apps:sdkconfig`, `firestore:locations`,
> `--help`) need no gate. Never batch a mutation behind a read.

> **Cost honesty.** A fresh Firebase project starts on the **Spark (free)** plan. Nothing in this
> flow enables billing, attaches a card, or upgrades to Blaze — and the CLI *cannot* silently do so.
> Auth (email/phone within free quota), Firestore, and the free-tier services all work on Spark.
> Say this to the user up front so "create a cloud project" doesn't read as "spend money".

## 1. Preflight

Run these checks before touching anything; fix in order.

1. **CLI present** — `firebase --version`. If missing, offer (consent-gated — it's a global
   install on their machine): `npm i -g firebase-tools`, then re-check.
2. **Logged in** — `firebase login:list`. If it reports no accounts, run `firebase login`.
   **Tell the user first**: this opens an interactive browser OAuth flow they must complete
   themselves; you cannot do it for them. On a headless/remote box use
   `firebase login --no-localhost`. Do not proceed until `login:list` shows an account.
3. **Read the app's identity from the stamped project** (never ask the user to retype what the
   repo already knows):
   - Android `applicationId` — from `composeApp/build.gradle.kts` (the `applicationId = "..."`
     line inside `android { defaultConfig { … } }`).
   - iOS bundle id — from `iosApp/project.yml` (`PRODUCT_BUNDLE_IDENTIFIER` /
     `bundleIdPrefix`). **iOS is optional and currently deferred product-wide** — do the
     Android wiring first and only take the iOS branch (§5) if the user explicitly wants it now.
4. **Confirm this is a placeholder situation** — open `composeApp/google-services.json`. If
   `project_id` is `REPLACE_ME_PROJECT_ID` (or `mobilesdk_app_id` is all zeros), proceed. If it
   already looks real, stop and ask whether they want to **re-point** the app at a different
   project (same flow, but be explicit that you're replacing a live config).

## 2. Choose or create the Firebase project

First show what they already have:

```bash
firebase projects:list
```

Offer both paths and let the user pick:

- **Reuse** an existing project → take its Project ID, skip to §3.
- **Create** a new one. Show the exact command and get consent — this creates a real Google
  Cloud project on their account:

```bash
firebase projects:create <project-id> --display-name "<App Name>"
```

Notes (verified against CLI 15.x help):
- `<project-id>` is globally unique, lowercase, digits and hyphens (e.g. `acme-app-dev`). If the
  id is taken the command fails cleanly — pick another (suffix `-dev`, `-2026`, etc.); nothing
  was created.
- The flag is `-n, --display-name <displayName>` (optional). `--organization` / `--folder` exist
  for org-managed accounts; don't pass them unless the user asks.
- Run without a positional id and the CLI prompts interactively — fine if the user is driving,
  but prefer the explicit form so the consent you showed matches what runs.

## 3. Register the Android app and install the real config

Three steps: create the app record, pull its SDK config, put it where Gradle looks.

**3a. Create the Android app** (consent-gated — cloud mutation):

```bash
firebase apps:create ANDROID "<App Name>" --package-name <applicationId> --project <project-id>
```

- `--package-name` (alias `-a`) must be the **exact** `applicationId` from preflight — a mismatch
  is the classic silent-failure later.
- The output prints the new **App ID** (`1:<number>:android:<hex>`). Capture it; you need it next.
  If the output scrolled away: `firebase apps:list ANDROID --project <project-id>` re-shows it.

**3b. Pull the real config** (read-only). Back up the placeholder first, then write straight to
the Gradle location with `--out`:

```bash
cp composeApp/google-services.json composeApp/google-services.json.placeholder.bak
firebase apps:sdkconfig ANDROID <appId> --project <project-id> --out composeApp/google-services.json
```

- `-o, --out [file]` writes the config to the file (verified in `apps:sdkconfig --help`);
  prefer it over redirecting stdout, which can pick up CLI progress lines.
- If the project has exactly one Android app you may omit `<appId>`; with several the CLI
  prompts (or errors under `--non-interactive`) — pass the id explicitly.

**3c. Verify before building** — both checks, mechanically:

```bash
python3 -c "import json;d=json.load(open('composeApp/google-services.json'));print(d['project_info']['project_id']);print(d['client'][0]['client_info']['android_client_info']['package_name'])"
```

Assert: JSON parses, `project_id` is the real project (not `REPLACE_ME…`), and `package_name`
equals the `applicationId` from preflight. Fix mismatches now (see troubleshooting), not at
build time.

## 4. Console-only steps — be honest about what the CLI can't do

The CLI registers apps and delivers config; it does **not** enable most services. Tell the user
exactly which switches still need a human in the [Firebase console](https://console.firebase.google.com):

| Service | CLI? | What to do |
|---|---|---|
| **Auth sign-in providers** (email/password, phone, Google, …) | **No** — `auth:*` only exports/imports users | Console → Authentication → Sign-in method → enable each provider. Auth calls fail with `CONFIGURATION_NOT_FOUND` / `OPERATION_NOT_ALLOWED` until done. |
| **Firestore database** | **Yes** (CLI ≥ v13-ish; verified on 15.18.0) | `firebase firestore:databases:create "(default)" --location <loc> --project <project-id>` — consent-gated. Run `firebase firestore:locations` first to pick `<loc>` (e.g. `nam5`, `eur3`, or the region matching the app's `region` option from cmp-new). Console fallback: Firestore → Create database. |
| **Storage default bucket** | **No** — no provisioning command in the CLI | Console → Storage → Get started. (Deploying `storage.rules` via `firebase deploy` also requires the bucket to exist first.) |
| **FCM** | Auto | Enabled by app registration; nothing to toggle for basic push. |
| **SHA-1/SHA-256 fingerprints** (needed for phone auth & Google Sign-In on Android) | **Yes** | `./gradlew :composeApp:signingReport` → copy the debug SHA-1 → consent-gated: `firebase apps:android:sha:create <appId> <shaHash>`. Then **re-download** the config (§3b) — adding a SHA changes `google-services.json` (`oauth_client` / `certificate_hash`). |

If the scaffold enabled phone auth (`--auth phone`/`both`), flag the SHA row as **required, not
optional**, and point at the **cmp-firebase-auth** knowledge if the plugin/user has it — iOS phone
auth especially is a minefield.

## 5. Optional iOS branch (deferred by default)

Only on explicit request — iOS is deferred product-wide right now. Same shape as §3:

```bash
firebase apps:create IOS "<App Name>" --bundle-id <bundleId> --project <project-id>   # consent-gated
firebase apps:sdkconfig IOS <iosAppId> --project <project-id> --out iosApp/iosApp/GoogleService-Info.plist
```

- `--bundle-id` (alias `-b`) is the required flag for IOS (verified in `apps:create --help`);
  `--app-store-id` exists but is optional.
- Back up the placeholder plist first, same as Android
  (`iosApp/iosApp/GoogleService-Info.plist.placeholder.bak`).
- Verify: `plutil -lint iosApp/iosApp/GoogleService-Info.plist` and check `BUNDLE_ID` matches.
- Remind the user: iOS phone auth additionally needs the `REVERSED_CLIENT_ID` URL scheme and
  APNs setup — out of scope here; that's **cmp-firebase-auth** territory.

## 6. Prove it — the build IS the verification

The `google-services` Gradle plugin parses the config at build time and **fails the build** if the
JSON is malformed or no client entry matches the module's `applicationId`. So:

```bash
./gradlew :composeApp:assembleDebug
```

- **GREEN** → the real config is structurally valid and matched to the app. Report success.
- **FAIL** with `No matching client found for package name '<pkg>'` → the registered package and
  the `applicationId` differ; see troubleshooting.

Optional runtime smoke (recommended when Auth/Firestore are already enabled in console): install
and launch (`./gradlew :composeApp:installDebug`), exercise one real call (e.g. an email sign-up),
and confirm it hits **this** project — a **small, fixed, bounded** number of live ops, never a loop.
If the toolchain or device setup isn't ready, hand off to **cmp-doctor** / **cmp-qa-prep** rather
than debugging the environment here.

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Error: Authentication Error` / `Command requires authentication` | Login expired or never done | `firebase login --reauth` (browser flow — user must complete it). Headless: `--no-localhost`. Re-check with `firebase login:list`. |
| `projects:create` fails: id unavailable/taken | Project IDs are globally unique | Pick a new id (`-dev`, `-app`, year suffix). Nothing was created on failure. |
| `apps:create` fails: package name already exists | That package is registered in this (or another of their) project | `firebase apps:list ANDROID --project <id>` — if the app already exists, skip to §3b with its appId. |
| Build: `No matching client found for package name '…'` | `google-services.json` package ≠ `applicationId` | Recheck the `applicationId` in `composeApp/build.gradle.kts`; re-register with the correct `--package-name` (or fix the Gradle id), re-pull config. |
| Build: `File google-services.json is missing` | Config written to the wrong path | It must sit at `composeApp/google-services.json` (module root, next to `build.gradle.kts`), not the repo root or `src/`. |
| Build: JSON parse error in google-services task | stdout redirect captured CLI noise, or truncated file | Re-pull with `--out` (§3b); run the §3c parse check. |
| Auth runtime error `CONFIGURATION_NOT_FOUND` | Sign-in provider not enabled | Console → Authentication → Sign-in method (§4 — CLI can't do this). |
| Firestore runtime `NOT_FOUND` / permission error | No database created yet, or default locked-mode rules | `firestore:databases:create` (§4), then deploy/adjust rules. |
| Phone auth fails on a real Android device | Missing SHA fingerprint | §4 SHA row: `signingReport` → `apps:android:sha:create` → **re-download** the config. |

**Rollback** (undo the local change any time):

```bash
mv composeApp/google-services.json.placeholder.bak composeApp/google-services.json
# iOS, if taken: mv iosApp/iosApp/GoogleService-Info.plist.placeholder.bak iosApp/iosApp/GoogleService-Info.plist
```

The cloud side needs no rollback for a mistake here — an unused Firebase project/app record on
Spark costs nothing; the user can delete it in console → Project settings if they want it gone.

## 8. Report

Tell the user: the project id (created or reused), the Android App ID registered, that the
placeholder was backed up and replaced, the **GREEN/FAIL** build verdict, which console toggles
remain (§4 list, tailored to the services their scaffold enabled), and — if they're heading to a
device run — point them at **cmp-qa-prep** (or **cmp-doctor** if the toolchain is suspect).
