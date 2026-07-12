# "No space left on device" during a Kotlin Multiplatform build — the ~/.konan cache is usually why

```text
No space left on device
```

Usually wrapped in a `java.io.IOException` and surfaced by whichever task happened to be writing at the time — a Kotlin/Native `linkDebugFrameworkIos*` task, a KSP task, or Gradle's own cache. The task name varies; the root cause rarely does.

## Why this happens

Kotlin/Native keeps its toolchains and dependency cache in `~/.konan`. Every Kotlin version you have ever built with leaves behind its own multi-gigabyte `kotlin-native-prebuilt-<os>-<arch>-<version>` directory, and nothing ever cleans them up — after a few Kotlin upgrades, 10+ GB of stale toolchains is normal. Combined with `~/.gradle/caches`, this quietly eats the disk until a KMP build (which needs roughly 3 GB of headroom to link an iOS framework) fails mid-package.

## Fix it manually

1. Check the damage: `du -sh ~/.konan` and `df -h ~`.
2. List the toolchains: `ls ~/.konan`. Your project's Kotlin version is the `kotlin` entry in `gradle/libs.versions.toml`.
3. Delete only the **stale versioned toolchain dirs** — the `kotlin-native-prebuilt-…-<version>` entries whose version does **not** match your project's Kotlin. For example, with `kotlin = "2.2.20"`:

   ```sh
   rm -rf ~/.konan/kotlin-native-prebuilt-macos-aarch64-2.1.20
   ```

4. Do **not** delete `~/.konan/dependencies` or `~/.konan/cache` (shared, re-downloaded expensively) or the toolchain matching your current Kotlin version.
5. Still tight? Project `build/` dirs and `.gradle/` are safe to remove, and `rm -rf ~/.gradle/caches` is a last resort (everything re-downloads on the next build).

## Or let the tool do it

`npx create-cmp-cli doctor` measures `~/.konan` and free disk space and warns before the build fails; `npx create-cmp-cli clean` applies exactly the conservative policy above — it removes only versioned `kotlin-native` toolchains that don't match your project's Kotlin version, never touches the shared `dependencies`/`cache` dirs, and only reports (never deletes) `~/.gradle/caches`.
