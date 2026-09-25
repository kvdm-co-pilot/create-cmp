# Libraries in, services out — the default template after the wave

**Status:** decided by the owner 2026-09-22, in conversation, and its open questions answered
2026-09-24. Decision 2 built 2026-09-25 on branch `firebase-out`, with the corrections and the one
deviation recorded under it; Decision 3 built 2026-09-25 on branch `minimal-preset`, as
`--preset lean`, with the name correction recorded under it. Three slices, in this
order, each one thing. This document records the decisions and their reasons so the slices are
briefed from settled ground rather than from a chat transcript.

## The test for what belongs in the default stamp

The harness is the product (NORTH-STAR). The scaffold is the front door: it exists so an agent can
reach a green-building app in one command, and the harness then has something to enforce. An agent
recommends this plugin when the description matches "create a mobile app" and the first build is
green. Nothing else about the scaffold earns a recommendation; anything about it can lose one.

So the default template must **build green and run to first frame with no external account, no
credential file, and no service to configure.** Libraries pass that test. Services do not.

- **Libraries stay, all of them:** Ktor client, Room, Koin, Navigation, Compose, the preview loop,
  the inspector, the dev client, E2E, the harness. Each is a dependency Gradle resolves and that runs
  against nothing.
- **Firebase is the only option in `options.schema.json` that is a service.** It needs a Google
  project, a console, and two config files the template ships as `REPLACE_ME_…` placeholders. A
  `--firebase` stamp builds against fake credentials, and whether it reaches first frame under
  Firebase Installations' key check was not settled by reading (wave/firebase hand-off). There is no
  honest default state for a service the adopter has not signed up for.

The same line answers cert pinning and "PCI-compliant" logging: not services to add, but claims that
belong in the adopter's `specs/`, where the harness makes the agent prove them. A stamped default is
either wrong or a placeholder that reads as protection (KD-90's shape).

## Decision 1 — no nightly

A nightly proves a codebase that drifts on its own. The template is static bytes; its paths change
only when someone commits to them. This repo already schedules every other proof by whether the
thing under proof moved (GATE-RULES Rule 4). KD-45's "nightly" remedy reached for a calendar because
a per-slice Firebase run was too slow; the right answer was the trigger, not the cadence.

Landed in the wave (branch `wave/proof-output`): the device tier is owed when the **stamped app's
bytes** move — stamp into a temp dir with fleet-check's exact flags, hash every byte, compare to the
last PASS record — not when an input path moves. 334 ms over 242 files. A change to
`src/lib/args.mjs` no longer buys a 3.5-minute device run.

## Decision 2 — Firebase moves out of stamp-time

**Shape:** `create-cmp add firebase`, a deterministic program (this repo's rule: the agent authors, a
program refuses — a skill that hand-edits Gradle is the opposite). `cmp-firebase-connect` wraps it
and does the console work it already does today. `--firebase` at stamp time is refused at once, with
no deprecation release, and the refusal names `create-cmp add firebase`. `region` moves to the add
step.

**Measured footprint (2026-09-22, main @ 2bae414):** 16 template files branch on Firebase (both
`build.gradle.kts`, `settings.gradle.kts`, `libs.versions.toml`, proguard rules, the debug
network-security config, `AppApplication.kt`, `FirebaseConfig.kt`, `ItemRepositoryImpl.kt`,
`DesktopModule.kt`, `KoinHelper.kt`, `Podfile`, `GoogleService-Info.plist`, `PrivacyInfo.xcprivacy`,
`iOSApp.swift`, `manifest.json`); 9 scaffold source files switch on the option (`create.mjs` alone
11 sites); 5 skills mention it. `ItemRepositoryImpl.kt` already has a Room implementation and a
Firebase implementation behind one interface, switched at stamp time — that seam is what the add
step needs, and it exists.

**What it buys:** a faster default (no google-services plugin, no Firebase BOM / GitLive wrappers /
Play Services tree, no extra R8 rules, no placeholder configs); every path in the default is the
proven path; no placeholder that reads as a real config, because the add step uses the adopter's real
`google-services.json` and, without one, writes a mock config that says it is a mock; a shorter,
truer plugin description.

**What it costs:** an add step edits a tree the adopter may already have changed — additive edits
(catalog entries, plugin lines, new files, a Koin module, the repository switch), idempotent, refusing
on an unrecognised shape rather than guessing, ending in a verify run; riskiest file is the adopter's
`build.gradle.kts`. A CLI break at 0.x (minor bump; external adopters near zero). The iOS half of the
overlay stays unproven and must say so.

**Proof:** two, not one — the default stamp per slice (as now), and "stamp + add firebase" when the
add step's files move, both keyed on output bytes. The emulator-suite machinery built on
`wave/firebase` (demo- project id, no network, teardown on every exit path, record states coverage)
is that second proof, repointed. Its honest limit stands: nothing in `commonMain` crosses the
redirect, so the run proves compile + init + the four `useEmulator` calls, which is where both
escaped defects lived.

**Decided by the owner 2026-09-24** (the two questions this section left open): `--firebase` is
refused immediately, not deprecated for a release, and the refusal names `create-cmp add firebase`.
The add step uses the adopter's real `google-services.json`; without one it writes a mock config and
says it is a mock. It never writes a placeholder that reads as a real config.

**Not now:** a general "add anything" mechanism. Firebase is the only service the template carries;
the second service (push, analytics, crash reporting) is the moment to generalise.

**Built 2026-09-25 (branch `firebase-out`) — two corrections to the footprint above, and one
deviation from the proof above that is the owner's to accept.**

- *Correction: there is no repository switch.* `ItemRepositoryImpl.kt` is one in-memory
  implementation with no Firebase or Room coupling, and has been since the initial commit
  (`b3be307`). The "seam the add step needs" named above does not exist, and the add step does not
  touch a repository: nothing in `commonMain` uses a Firebase client (KD-210).
- *Correction: there is no Firebase Koin module.* The wiring was `androidMain/AppApplication.kt`'s
  `configureFirebaseEmulators`, `iosMain/KoinHelper.kt`, `iOSApp.swift`, the Podfile, both Gradle
  files, the version catalog and `FirebaseConfig.kt` (a region constant) — and four items that
  shipped UNMARKED in every stamp, `--no-firebase` included: the Firebase R8 rules, the catalog's
  GitLive and google-services entries, jitpack, and `FirebaseConfig.kt` itself. All of it left the
  template. The add step's edits are therefore new files, one marked block appended to the end of
  a file, anchored one-line insertions and catalog entries (`overlays/firebase/`,
  `src/lib/add-firebase.mjs`) — never an edit inside the adopter's own blocks.
- *Deviation: the runtime proof is deferred to its own slice.* The proof above has two parts. The
  first holds: the default stamp's L2 run is unchanged in kind. The second — the `wave/firebase`
  emulator-suite run, repointed at "stamp + add firebase" — was NOT built here, for three reasons:
  that branch is 113 commits behind main and its obligation is keyed on template PATHS (Firebase no
  longer has any), and KD-208 records that the proof-gate hook's time budget is fully spent, so a
  second stamp in the hook's answer has nowhere to come from. What this slice proves instead is
  COMPILE, on every PR: CI stamps the default, builds it, runs `add firebase` on the same app and
  builds again. KD-45's Firebase half is amended to say exactly that; init and the four
  `useEmulator` calls stay unexecuted until the repointed run lands.

## Decision 3 — a minimal preset over existing toggles

**Constraint that decides the cost:** a preset flips options that already exist (`room`, `e2e`,
`inspector`, `devClient`, `tabs`, `platforms`, the lighter `harness` mode) and adds **zero new
template branches**. It never removes a library that has no toggle (Ktor, Koin, Navigation). If a
library should be optional, make it a toggle first, as one proven slice.

**What it drops and why:** Room is the lever — it brings KSP, which is most of the first-build time
and the Kotlin↔KSP lockstep doctor polices. For "make me a todo app", dropping it is the difference
between a first build an agent waits through and one it doesn't. Ktor stays; it costs seconds.

**Full harness in both presets** (the owner's recommendation, confirmed 2026-09-24): the harness is
what the agent should notice; only app-side toggles differ.

**How it is chosen:** the `cmp-new` fit check picks it from the ask (todo app → minimal; app with
backend sync → full). No new choice is put in front of the agent — that is the failure mode of
adding options.

**Proof:** measure once (stamp minimal, build, run, time both shapes to first frame; if minimal does
not build today that is a template defect an adopter could already hit through the toggles); prove it
at the compile tier every slice (CI's "stamp + Android assembleDebug" job stamps both shapes); the
device badge stays on the default and the front door says so.

**Built 2026-09-25 (branch `minimal-preset`) — one name correction, and what "lean" resolved to.**

- *Correction: the preset is not called "minimal".* `--minimal` already names the harness mode
  (`src/commands/create.mjs`), a different axis, and the harness is full in both shapes — so the
  flag is `--preset lean|full`, default `full`, and the prose calls it the lean preset.
- *Lean turns `room` off, and nothing else.* Of the toggles listed above, `harness` is ruled out
  by the full-harness decision; `e2e`, `inspector` and `devClient` are the eyes, which stay on;
  `tabs` and `platforms` are the app's content and scope, not its build weight. Room is the one
  lever this section names. A stated flag still wins (`--preset lean --room` is the default app).
- *No new record field.* `create-cmp.json` already records `"room": false`, which is what
  `upgrade --harness` and `harden` rebuild from.
- *What lean costs:* no on-device database, so what a lean app stores lives in memory until it
  adds persistence; `cmp-new` says so in its report, and the stamp seeds the no-Room ADR.
- *Proof so far:* compile, on every PR — CI's stamp-android job stamps `--preset lean` and builds
  it. The measure-once (both shapes to first frame) is not yet taken.

## Sequence

1. **The wave** (this branch) — live adopter harms; ships as 0.27.1.
2. **Firebase out** — `create-cmp add firebase`. Built with a compile-tier proof in CI; the
   repointed runtime proof that closes KD-45's Firebase half is its own slice (see Decision 2).
3. **Minimal preset** — over a template that by then has only libraries in it. Built as
   `--preset lean` (see Decision 3).

Two front-door changes under one review would be two things in one slice; kept apart, each stays
refutable on its own.
