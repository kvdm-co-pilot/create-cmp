# "ksp is too old for kotlin" — Kotlin ↔ KSP version mismatch in a KMP build

```text
ksp-2.1.20-2.0.1 is too old for kotlin-2.2.20. Please upgrade ksp or downgrade kotlin-gradle-plugin to 2.1.20.
```

(Your version numbers will differ. The mirror-image variant is `ksp-… is too new for kotlin-…`. Depending on how far apart the versions are, the build may also fail later with unresolved symbols or an internal compiler error instead of this clean warning.)

## Why this happens

The KSP Gradle plugin version is not a single number — it is `"<kotlinVersion>-<kspVersion>"` (for example `2.2.20-2.0.4`). The prefix **must exactly match** the Kotlin version your project compiles with, because KSP links against compiler internals that change between Kotlin releases. The classic way to hit this: you bump `kotlin` in `gradle/libs.versions.toml` (or an IDE suggestion does) and leave `ksp` behind.

## Fix it manually

1. Open `gradle/libs.versions.toml` and find the `[versions]` table.
2. Make the `ksp` entry's prefix equal your `kotlin` entry, keeping a real published KSP release as the suffix:

   ```toml
   [versions]
   kotlin = "2.2.20"
   ksp = "2.2.20-2.0.4"   # must be "<kotlin>-<kspVersion>"
   ```

3. Check the [KSP releases page](https://github.com/google/ksp/releases) for the suffix that exists for your Kotlin version — not every combination is published.
4. Re-sync/re-build. Kotlin, KSP, Compose, Room, and AGP tend to move as one set; if the build still fails, other entries in the catalog probably drifted too (see [version-catalog-drift.md](version-catalog-drift.md)).

## Or let the tool do it

`npx create-cmp-cli doctor` detects this pairing violation in any Gradle/KMP project (not just ones it scaffolded) and prints the exact catalog line to change; `create-cmp upgrade` can move the whole catalog to a CI-proven-green set in one step. Starting fresh, `npx create-cmp-cli my-app` scaffolds a project whose kotlin/ksp pair is already pinned to a set that builds green on Android and iOS.
