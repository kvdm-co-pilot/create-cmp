# KMP build broke after upgrading one dependency — version drift in gradle/libs.versions.toml

There is no single error string for this one — that is the problem. Drift between Kotlin, KSP, Compose Multiplatform, Room, and AGP surfaces as whichever incompatibility you hit first: the [kotlin↔ksp lockstep error](ksp-too-old-for-kotlin.md), a Compose compiler/Kotlin mismatch, the [Room/KSP2 iOS failure](classnotfoundexception-mainkt-ksp-ios.md), or an AGP "requires Gradle version" refusal. What `create-cmp doctor` reports when it spots drift:

```text
! Drift vs proven-green set 2026.06 (3 versions)
    kotlin 2.1.20 → 2.2.20, ksp 2.1.20-2.0.1 → 2.2.20-2.0.4, room 2.7.1 → 2.8.4
    fix: Run `create-cmp upgrade --set 2026.06` to align (diff shown before anything is written).
```

## Why this happens

The KMP toolchain is a lattice of hard version constraints: KSP's version literally embeds the Kotlin version, the Compose compiler is tied to a Kotlin release, Room's KSP processor tracks KSP, and AGP pins a minimum Gradle wrapper (AGP 8.7 needs Gradle ≥ 8.9). Bumping any one entry in `gradle/libs.versions.toml` — because an IDE suggested it, or a changelog looked appealing — moves you off the tested combination, and the failure often appears in a *different* library than the one you touched. These versions move as one set or the build dies.

## Fix it manually

1. Pick a version set that is known to build together, and align **every** related entry in `gradle/libs.versions.toml` at once. One CI-proven combination (create-cmp's `2026.06` set, verified green on Android + iOS):

   ```toml
   [versions]
   kotlin = "2.2.20"
   agp = "8.7.3"
   compose-multiplatform = "1.10.3"
   ksp = "2.2.20-2.0.4"
   room = "2.8.4"
   sqlite = "2.6.2"
   ```

2. Keep the pair rules: `ksp` = `"<kotlin>-<kspVersion>"`; Room ≥ 2.7 for iOS; `ksp.useKSP2=true` in `gradle.properties` when Room runs on iOS.
3. Match the Gradle wrapper to AGP — for AGP 8.7.3, `gradle-wrapper.properties` should point at Gradle 8.11.1 (anything ≥ 8.9 works).
4. Rebuild both targets, not just Android — drift bugs love to hide on the iOS side.

## Or let the tool do it

`npx create-cmp-cli doctor` diffs your catalog against the nearest CI-proven-green set and lists every drifted entry; `create-cmp upgrade` applies the full set surgically (diff shown first, lockstep guarded, `gradle.properties` and wrapper included). `npx create-cmp-cli my-app` starts you on the proven set so there is nothing to drift from yet.
