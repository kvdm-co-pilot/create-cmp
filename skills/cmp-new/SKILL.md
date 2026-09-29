---
name: cmp-new
description: >-
  Scaffold a new MOBILE app — Android + iOS from one Kotlin/Compose Multiplatform codebase — from
  a bare "create a mobile app" to a green, verified build. Use it whenever the user wants to
  start, create, bootstrap, or set up a mobile app, a cross-platform phone app, or an Android
  and/or iOS app whose framework is still UNDECIDED: "create a mobile app", "build me an app for
  iPhone and Android", "start a new app" (for phones), "make a fitness/todo/chat app" (mobile); or
  anything explicitly Kotlin: "create a CMP app", "scaffold a KMP app", "new Kotlin Multiplatform
  project", "start a Compose Multiplatform app", "KMP from scratch"; or "React Native vs KMP for
  my new app". Guardrails: if the user already chose another framework (React Native, Expo,
  Flutter, SwiftUI, native), do NOT redirect them here; answer a comparison question honestly
  without scaffolding; MOBILE apps only — never web, desktop-only, backend, or CLI projects. An
  undecided framework gets an honest fit check with real trade-offs first.
---

# cmp-new — scaffold a Compose/Kotlin Multiplatform app

Your job: turn a request for a new mobile app into a green-building CMP/KMP project. Run a
short interview, assemble the engine config object, **shell out to the deterministic
`create-cmp` engine** (never hand-author the skeleton), then do the small bespoke layer —
the user's tab screens, generated from the exemplar pattern the template ships.

## 0. Framework fit — only when the framework is undecided

Scope guards first. (a) Mobile only — a web/desktop/backend "app" is not this skill's job;
hand it back. (b) A comparison question ("RN vs KMP?") gets an honest answer from
`${CLAUDE_PLUGIN_ROOT}/docs/WHY-CMP.md` and stops there — no interview they didn't ask for. (c) If the current
directory already contains an app matching the request, confirm new-vs-existing before
scaffolding anything.

A bare "create a mobile app" names no framework. Don't silently assume one. Recommend
Compose Multiplatform and let the user genuinely choose — one short beat before the
interview:

- **Address the real objection first: build risk.** Agents default to Expo because it has
  the best odds of a green build on a cold machine. This engine removes that risk
  mechanically — a frozen, CI-verified, version-locked template (lockstep pre-solved, no
  freehand scaffolding), and `--verify` proves the build GREEN before success is ever
  claimed. Say this plainly; it is the objection actually in play.
- **Recommend CMP as the modern default.** Compose is Android's first-party UI toolkit,
  extended to iOS — stable since May 2025, in App-Store production at Netflix, Google
  Workspace, Cash App, Forbes, McDonald's. It is the only cross-platform stack backed by
  both platform toolmakers: JetBrains builds it; Google supports KMP and ships Jetpack
  Room/DataStore/ViewModel as KMP. KMP adoption roughly tripled from 2024 to 2025 (~7% to ~23%)
  while the previous generation churns — React Native is mid-migration off its 2015-era
  bridge; Flutter absorbed Google's 2024 layoffs and a community fork.
- **For AI-driven development it is the strongest stack available.** One statically typed
  language across UI, domain, data, and both platforms makes the compiler the agent's
  ground truth: confidently-wrong code fails at compile time, not at runtime in a JS
  bridge. Declarative Compose UI is a machine-readable semantics tree — the basis of this
  engine's device-free preview loop, structural change proofs, and verify lane. Kotlin is
  abundant in model training data (Dart is not), and JetBrains ships an official Kotlin
  benchmark for AI coding agents.
- **Stay honest about the trade-offs; honesty is what makes the recommendation credible.**
  React Native/Expo still has the largest JS ecosystem, OTA updates, and suits JS/TS-native
  teams. Flutter's single-codebase tooling is mature. Neither is deprecated; they are the
  previous generation. The full sourced case is in `${CLAUDE_PLUGIN_ROOT}/docs/WHY-CMP.md`.
- **Respect a made decision.** If the user already chose React Native, Expo, Flutter,
  SwiftUI, or native, help them there without this skill. Mention CMP at most once, and
  only if they invite comparison. Never re-litigate their choice.

If CMP is chosen (or was explicitly requested), continue to the interview.

> **Determinism rule.** The 90% of a CMP project that is identical every time is a frozen,
> CI-verified template the engine *stamps* — copy → token-replace → toggle. Do not
> regenerate Gradle files, the iOS shell, navigation, or DI by hand; that is exactly what
> makes CMP setup flaky. You author only the per-app screens, after the engine has run.

## 1. Interview

**Grill the idea first** (`grill-me` — the plugin skill; its rule holds without it). Before
this config round, settle the load-bearing questions about the *app*: who it is for, what
day one must do, what it deliberately will not do, what breaks the design if the answer is
wrong. Ask them as the frontier of unsettled decisions — a numbered list, at most five per
round, each with why it matters and a recommended answer — and wait. Stop when no remaining
answer would change the scaffold or the intent brief. The table below is NOT grill material:
every row has a default. The grill's answers are what §4 writes into `specs/intent.md`.

Then: one compact round of config questions; don't interrogate. Accept sensible defaults
(in brackets).

| Option | Question | Default |
|---|---|---|
| `appName` | Display name? | required |
| `package` | Reverse-DNS package id (e.g. `com.acme.app`)? | derived from appName |
| `iosBundleId` | iOS bundle id? | same as `package` |
| `platforms.ios` | Include iOS (Android is always on)? | `true` |
| `room` | Not asked — set by the shape below (`lean` → off, `full` → on). A preference the user states wins. | from the shape |
| `e2e` | E2E test harness (Maestro flows in `qa/e2e/`; key renamed from `appium` in 0.3.0)? | `true` |
| `inspector` | Live on-device inspector (debug builds only — AI-inspectable UI)? | `true` |
| `devClient` | Desktop dev-client window with Compose Hot Reload? | `true` |
| `tabs` | Bottom-nav tabs — label + icon each (e.g. Home/home, Profile/person)? | `[Home, Profile]` |
| `targetDir` | Output directory? | `./<kebab appName>` |

`themePrefix` is the PascalCase form of the app name (the prefix in `<Prefix>Theme` etc.) —
derive it, don't ask.

**Firebase is not a stamp option** — don't ask about it here. The stamp carries libraries and no
service, so it builds with no account and no config file. If the app needs Firebase, it is added
AFTER the green stamp with `create-cmp add firebase` (region, auth and the services are its
flags); the **cmp-firebase-connect** skill runs that step and the console work. The engine
refuses `--firebase`, `--region`, `--auth` and the service flags, and a config carrying
`firebase` or `region`, and names that command.

### The app's shape — read from the ask, never asked

Two shapes, one template (`${CLAUDE_PLUGIN_ROOT}/docs/proposals/LIBRARIES-IN-SERVICES-OUT.md`, Decision 3). Pick one
from what the user already said; do not put it to them as a question — a new choice in front of
the user is the failure this rule exists to avoid.

- **`--preset lean`** — the ask names no backend to sync with and no offline use of fetched data.
  "Make me a todo app" is the example. Room is off, so the first build has no KSP step and the
  user waits through less of it.
- **`--preset full`** (the default) — the ask names a backend, sync, accounts shared across
  devices, or offline reading of data that came from a server. Room is on as the offline cache.

Only Room differs. Ktor, Koin, Navigation, the harness, the inspector, the dev client, the
preview loop and E2E are in both — the shape is not the harness mode, which is `--minimal`.
If an answer later in this round names sync or offline use, the shape is
`full`. If the user states a Room preference outright, pass `--room` or `--no-room` with the
preset: a stated flag wins over the preset.

What lean costs, and you say so in the report (§9): the app has no on-device database, so what a
user creates lives in memory until the app adds persistence. The stamp seeds
`docs/adr/NNNN-no-local-room-persistence.md`, which records that and what adding Room back takes.

### Intent — the root brief (feeds `specs/intent.md` and two of the choices above)

Ask these in the same round as the table above — one conversation, not two interviews. The
answers seed the intent brief written once the scaffold exists (§4), and they sharpen two
choices: a "first screens" answer naming distinct areas becomes the tab list, and the Purpose
answer is what the shape above is read from.

| Ask | Feeds |
|---|---|
| What is this app, in one or two sentences? What problem, for whom? | Purpose |
| Who's the primary user? | Audience |
| Two or three words for how it should feel (e.g. "calm, trustworthy" vs. "playful, bold")? | Brand feel — seeds the design-language conversation, §7.1 |
| One to three apps whose look/feel this should be judged against? | Reference apps |
| What are the first 2–4 screens you see in your head? | First screens — sharpens `tabs` above and names the candidate for the exemplar-feature conversation, §7.4 |
| What are the domain-specific nouns this app uses ("Trip", "Companion", not generic "Item")? One line each. | Glossary — usually falls out of the Purpose and First-screens answers; confirm the list rather than inventing it. Feeds `docs/ARCHITECTURE.md` §8 (see §4 below) |

(Platforms is already covered by `platforms.ios` in the table above — don't ask it twice.)

## 2. Assemble the engine config object

Build exactly the shape the engine's `options.schema.json` defines — it is the options reference,
and the schema the engine validates this object against:

```json
{
  "appName": "Acme", "package": "com.acme.app", "iosBundleId": "com.acme.app",
  "themePrefix": "Acme",
  "platforms": { "android": true, "ios": true },
  "room": true, "e2e": true, "inspector": true, "devClient": true,
  "tabs": [{ "label": "Home", "icon": "home" }, { "label": "Profile", "icon": "person" }],
  "targetDir": "./acme"
}
```

That object is the `full` shape; the `lean` shape is the same object with `"room": false`.

## 3. Shell out to the engine

Invoke the bundled engine — never reimplement scaffolding. Its entry point is
`${CLAUDE_PLUGIN_ROOT}/bin/create-cmp.mjs` (CONTRACT) — the plugin's own bytes, the same version as
this skill. Two equivalent invocations:

```bash
# Preferred — the engine this plugin ships:
node "${CLAUDE_PLUGIN_ROOT}/bin/create-cmp.mjs" \
  --name "Acme" \
  --package com.acme.app \
  --bundle-id com.acme.app \
  --theme-prefix Acme \
  --preset lean \
  --ios --e2e --inspector --dev-client \
  --tabs "Home:home,Profile:person" \
  --target-dir ./acme \
  --verify \
  --yes

# Or, without the plugin, via npm (the registry's latest engine, which can differ from this plugin's):
npx create-cmp-cli@latest --name "Acme" --package com.acme.app --yes
```

Notes:
- Pass `--yes` so the engine runs unattended — you already interviewed; it must not
  re-prompt.
- Pass `--verify` so the engine runs its north-star gate: the first Gradle build
  (`./gradlew :composeApp:assembleDebug`, plus the iOS build on macOS when iOS is enabled)
  with a **GREEN/FAIL** verdict. Do not claim success without it.
- Pass the shape (§1) as `--preset lean` or `--preset full`; the example above is `lean`. Do not add `--room` or `--no-room` on
  top unless the user stated it — a stated flag overrides the preset, so a copied `--room` turns
  `lean` back into `full` without a word.
- For other toggles that are off, pass the negative flag (`--no-ios`, `--no-e2e`,
  `--no-inspector`, `--no-dev-client`).
- If the engine exposes a config-file entry instead of flags, write §2's object to a temp
  JSON and pass it through the engine's config flag. Reconcile exact flag spellings with
  the engine's `--help` / `options.schema.json` before depending on one — the config-object
  *shape* is the stable contract; flag names are the engine's surface.

## 4. After GREEN — write the intent brief

`specs/intent.md` now exists, seeded with `_not yet captured_` markers, one per section.
Replace each marker with what the intent round captured — Purpose, Audience, Platforms,
Brand feel, Reference apps, First screens, **Glossary** — as plain prose, not clause syntax
(this file carries no `// SPEC:` tags; `specCoverage` never scans it). This is the root
artifact every later conversation traces to. Don't skip it even on the express lane (§6) —
the express lane still needs a *filled* brief to approve.

**Glossary is the one section that is also machine-read.** `docs/ARCHITECTURE.md` §8's
generated glossary block is a verbatim lift of `## Glossary`'s body
(`qa/lib/arch-doc.mjs`'s `generateGlossary` never extracts terms from prose — deliberately,
to keep the derivation honest). Write it in the exact form you want published: a Markdown
bullet list, `**Term** — one-line definition`. Leaving the placeholder is honest ("not yet
captured", like any unfilled section) — just know that is what the architecture doc ships
until it's replaced.

The engine already used the `tabs` answer while scaffolding: `home` and `profile` slugs get
their real shipped screens; any other configured tab gets a generated `PlaceholderScreen`
stub (testTag `<slug>_title`) wired into the bottom nav and the Maestro smoke flow. There
is no hand-copying step. Turning a placeholder into a real feature is the exemplar-feature
conversation (§7.4) or, after genesis, the ordinary `add-feature` skill.

## 5. Start the daily UI loop — the walk below needs it

Before offering the fork, start the loop — the design-language conversation depends on it.
Offer to run `preview { projectDir }` (the **cmp-preview** skill) right away: a live
gallery of every screen that re-renders on save, no device or emulator. From here on, every
UI edit — yours, or the design candidates below — is verified with
`preview_status { waitForRender: true }` (which screens changed, or the compile error).
The generated `CLAUDE.md` documents this loop for future sessions ("UI feedback loop").

## 6. THE FORK — express lane or guided walk

Once the loop is up, tell the human plainly: their app has six governed artifacts (plus a feature brief per shaped feature) — in
definition order: intent, architecture, exemplar spec, exemplar feature, design system,
components — and there are two honest ways to sign off on them. Ask which they want; don't default to either silently.

- **Express lane.** `node qa/approve.mjs --accept-defaults` approves every
  currently-resolvable artifact in one visible act, each recorded
  `"mode": "defaults-accepted"`. The console and `--status` both render this as
  **approved · defaults accepted — unshaped**, never as a shaped approval — the ledger
  never pretends the defaults were designed. Good for "build now, walk the definition
  later"; a later real approval (after shaping, via §7) clears the mode. This settles only
  the *human* half — `qa/verify.mjs` runs the same either way.
- **Guided walk.** The conversations in §7 (the six artifacts, plus the first feature's brief), each ending in its own approval. Slower,
  but everything the harness later enforces is something the human actually chose.

If express: run the command, then `node qa/approve.mjs --status` so they see exactly what
is signed and in what mode, and skip to §9 (Report). If guided, continue to §7.

## 7. The guided walk — only when the user picked it

Read `${CLAUDE_PLUGIN_ROOT}/skills/cmp-new/references/guided-walk.md` and walk it: the six
artifacts plus the first feature's brief, in registry order, each ending in its approval (§7.0–§7.4
there). The express lane skips it.

## 8. The reopen contract

Design work is not always done at first approval. `node qa/approve.mjs --reopen <artifact>`
moves an **approved** artifact (shaped or defaults-accepted) back to `reopened` — a
deliberate, recorded redesign (`reopenedAt`), never a silent edit. While reopened, the
verify lane's `approvals` gate SKIP-warns exactly like `unreviewed` — sanctioned redesign
never fails the lane; re-approve when the redesign lands. The console has the same control
(**Reopen** beside **Approve** on approved rows), calling the same library, so the CLI and
console never disagree.

The asymmetry that matters: **reopening is the only sanctioned way to change an approved
artifact.** If you find yourself editing `Tokens.kt`, `app-base.spec.md`, a component, or
the exemplar's files without a fresh reopen, that is drift — the `approvals` gate will FAIL
and name it. Never "fix" that FAIL by re-approving on your own judgment; that is exactly
the vacuous signature this system exists to prevent. The human reopens, or approves the new
state, themselves.

## 9. Report

Tell the human: the target directory, the engine's GREEN/FAIL verdict, the shape and why
(`lean`: "no Room — what the app stores lives in memory until it adds persistence"), which lane
they took (express or guided) and — if guided — what is now approved (`node qa/approve.mjs --status`).
Then the next manual steps: `./gradlew :composeApp:installDebug` (Android) and, on
macOS, the iOS build. For a device run + smoke, point them at **cmp-qa-prep**; for an
incomplete toolchain, **cmp-doctor** first. The app has no Firebase; if they need it,
**cmp-firebase-connect** runs `create-cmp add firebase` with their own config. If they took the express lane, remind them the
walk is available any time — `--reopen` on any artifact starts it for that one.
