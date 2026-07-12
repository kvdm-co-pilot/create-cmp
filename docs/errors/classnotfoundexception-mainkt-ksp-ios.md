# "ClassNotFoundException: org.jetbrains.kotlin.cli.utilities.MainKt" — Room + KSP on iOS (Kotlin/Native)

```text
java.lang.ClassNotFoundException: org.jetbrains.kotlin.cli.utilities.MainKt
```

Typically thrown while a `kspKotlinIosArm64` / `kspKotlinIosSimulatorArm64` / `kspKotlinIosX64` task runs — i.e. the moment Room's annotation processor executes for an iOS target.

## Why this happens

Room's KSP processor on Kotlin/Native (iOS targets) requires **KSP2**. The older KSP1 execution model tries to invoke the Kotlin/Native compiler through an entry point (`org.jetbrains.kotlin.cli.utilities.MainKt`) that is not on its classpath in current Kotlin releases, so the processor dies with this `ClassNotFoundException` before generating anything. It only bites when all three are true — Room, KSP, and an iOS/native target — which is why the same project builds fine for Android. This is the KSP2/iOS catch-22: nothing in your code is wrong, one Gradle property is missing.

## Fix it manually

1. Open `gradle.properties` at the project root.
2. Add:

   ```properties
   ksp.useKSP2=true
   ```

3. Also confirm Room is at least **2.7.0** in `gradle/libs.versions.toml` — Room gained Kotlin Multiplatform (native) support in 2.7.0; anything older cannot target iOS at all, KSP2 or not. A known-green pairing is `room = "2.8.4"` with `sqlite = "2.6.2"` (the bundled SQLite driver).
4. Re-run the iOS build (`./gradlew :composeApp:compileKotlinIosSimulatorArm64` or your Xcode build).

## Or let the tool do it

`npx create-cmp-cli doctor --fix` detects the Room + iOS + missing `ksp.useKSP2=true` combination and writes the property for you (it is one of the two heals safe enough to automate); it also flags Room < 2.7 with the exact upgrade path. If you are starting a new project, `npx create-cmp-cli my-app` scaffolds with KSP2 already enabled and Room pinned at a version-set that builds green on iOS in CI.
