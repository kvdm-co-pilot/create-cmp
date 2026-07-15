# Proven-green version sets

create-cmp pins a **mutually-agreeing set** of Kotlin / KSP / Compose Multiplatform / Room /
AGP / Gradle versions — the reproducibility moat. These do not move independently: bump one
without its partners and a KMP build dies (the kotlin↔ksp lockstep, the KSP2/iOS Room
catch-22, the compileSdk↔AGP coupling). So create-cmp ships **version *sets*** that are only
declared "proven-green" after a full app scaffolded on them **builds green on Android + iOS**.

- **Source of truth:** [`src/versions/registry.json`](../src/versions/registry.json) — an
  ordered list of proven-green sets, oldest → newest. The **last** entry is the default
  `create-cmp upgrade` target.
- **How a set earns "proven-green":** the canary (`scripts/promote-set.mjs`) scaffolds a
  full-featured app pinned to a candidate, runs a **real** build — `:composeApp:assembleDebug`
  + the device-free lane gates (`desktopTest`) + the iOS framework link
  (`linkDebugFrameworkIosSimulatorArm64`) — and only on **all-green** appends it to the
  registry. A red build promotes nothing.

## The sets

| Set | Kotlin | KSP | Compose MP | AGP | Gradle | compileSdk | Notes |
|---|---|---|---|---|---|---|---|
| `2026.06` | 2.2.20 | 2.2.20-2.0.4 | 1.10.3 | 8.7.3 | 8.11.1 | 35 | Frozen baseline — the golden template ships this. |
| `2026.07c` | 2.2.20 | 2.2.20-2.0.4 | 1.10.3 | 8.7.3 | 8.11.1 | 35 | Conservative: coil 3.2.0 + kotlinx-serialization 1.9.0; lockstep held. |
| **`2026.07r`** | **2.3.10** | **2.3.10** | **1.11.1** | **8.13.2** | **8.14.3** | **36** | **July 2026 recommended — the current default `upgrade` target.** |

> KSP2 note: from the Kotlin 2.3 line, KSP dropped the `-<kspVersion>` suffix — the KSP
> version now **equals** the Kotlin version (`kotlin 2.3.10 ↔ ksp 2.3.10`). Both schemes are
> accepted by the lockstep validator.

## `2026.07r` — the July 2026 recommended set (full)

The current default upgrade target, certified green on Android + desktop + iOS (2026-07-15).
Every version is the newest that is **mutually compatible** — not merely the newest that exists.

| Coordinate | Version | | Coordinate | Version |
|---|---|---|---|---|
| kotlin | 2.3.10 | | kotlinx-serialization | 1.9.0 |
| ksp | 2.3.10 | | kotlinx-datetime | 0.7.0 |
| compose-multiplatform | 1.11.1 | | coil | 3.2.0 |
| agp | 8.13.2 | | koin | 4.2.2 |
| gradle (wrapper) | 8.14.3 | | ktor | 3.1.0 |
| compileSdk | 36 | | room | 2.8.4 |
| targetSdk | 35 | | sqlite | 2.7.0 |
| google-services | 4.5.0 | | firebase-gitlive | 2.4.0 |
| androidx-core | 1.15.0 | | lifecycle | 2.10.0 |
| androidx-activity | 1.10.1 | | navigation | 2.9.2 |

### Why some libraries are *held*, not bumped

"Latest-of-each" is **not** the same as "recommended-stable." Three deliberate holds, each
found by a real canary build:

- **ktor stays 3.1.0.** ktor-client-core 3.2.0 ships a backtick identifier with a space
  (`` `use streaming syntax` ``) that needs DEX version 040, which D8 only emits at a much
  higher `minSdk` than 24 — even AGP 8.13.2's R8 8.13.19 can't dex it. Not adoptable at a
  normal `minSdk` yet.
- **androidx-core (1.15.0) and lifecycle (2.10.0) stay put.** Their latest (core 1.19.0,
  lifecycle 2.11.0) require `compileSdk 37` — an unreleased-stable API. The recommended set
  targets `compileSdk 36` (Android 16, the latest stable), so these are held to their
  SDK-36-safe versions. Revisit when a `compileSdk 37` set is warranted.
- **targetSdk stays 35** (compileSdk moves to 36) for runtime-behaviour stability.

## compileSdk / targetSdk are managed

`compileSdk` and `targetSdk` live in `composeApp/build.gradle.kts`, not the version catalog —
but they are coupled to the set (a dependency built against a newer Android API forces a higher
`compileSdk`, which forces a newer AGP). So each set carries an `androidSdk: { compileSdk,
targetSdk }` block, and **`create-cmp upgrade` rewrites `composeApp/build.gradle.kts`** (with a
backup) alongside the catalog, gradle.properties, and the wrapper.

## Upgrading a project

```bash
# Move to the newest proven-green set (the default target):
create-cmp upgrade --target-dir .           # dry-run diff; add --yes to apply, --verify to prove the build

# Or pin a specific set:
create-cmp upgrade --set 2026.07r --target-dir . --yes --verify
```

`upgrade` shows a diff (catalog + compileSdk/targetSdk + gradle.properties + wrapper), writes
`*.bak-upgrade` backups, guards the kotlin↔ksp lockstep, and leaves anything not in the set
untouched. Works on **any** Gradle project with a version catalog — not just create-cmp-stamped
ones. `create-cmp doctor` reports a project's drift against the nearest proven-green set.
