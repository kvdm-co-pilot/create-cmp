# "SDK location not found" — Gradle cannot find the Android SDK (local.properties / ANDROID_HOME)

```text
SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable or by setting the sdk.dir path in your project's local properties file at '/path/to/your/project/local.properties'.
```

## Why this happens

The Android Gradle Plugin resolves the SDK from two places, in order: the `sdk.dir` property in `local.properties` at the project root, then the `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) environment variable. If neither exists — common on a fresh clone, a CI runner, or a machine where only Android Studio has ever known the SDK path — every Android task fails immediately with this error. A stale `sdk.dir` pointing at a directory that no longer exists fails the same way. `local.properties` is machine-specific and correctly gitignored, which is exactly why cloning a working project still hits this.

## Fix it manually

1. Find your SDK. Conventional locations: `~/Library/Android/sdk` (macOS), `~/Android/Sdk` (Linux), `%LOCALAPPDATA%\Android\Sdk` (Windows).
2. Create (or fix) `local.properties` in the project root:

   ```properties
   sdk.dir=/Users/you/Library/Android/sdk
   ```

   On Windows, escape the path: `sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk`.
3. Alternatively, export the environment variable instead: `export ANDROID_HOME="$HOME/Library/Android/sdk"` in your shell profile (preferred for CI).
4. If no SDK is installed at all, install one first (Android Studio, or the command-line tools + `sdkmanager`).

## Or let the tool do it

`npx create-cmp-cli doctor --fix` checks `local.properties` in any Gradle/KMP project — missing file, missing `sdk.dir`, or `sdk.dir` pointing at a nonexistent directory — and writes it from `ANDROID_HOME`/the conventional SDK path automatically when one exists; when no SDK is present, its toolchain preflight prints the exact install command and asks before running it. `npx create-cmp-cli my-app` writes a correct `local.properties` at scaffold time on machines that have the SDK.
