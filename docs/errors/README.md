# Common Kotlin/Compose Multiplatform build errors — and how to fix them

Each page below targets one real KMP/CMP failure mode: the exact error text (paste yours into search — that is how you probably got here), why it happens, the manual fix, and the one-liner that automates it. Every failure mode here is something `npx create-cmp-cli doctor` actually detects in any Gradle/KMP project — not just ones create-cmp scaffolded.

| Error you're seeing | Page |
| --- | --- |
| `ksp-2.1.20-2.0.1 is too old for kotlin-2.2.20. Please upgrade ksp or downgrade kotlin-gradle-plugin` | [ksp-too-old-for-kotlin.md](ksp-too-old-for-kotlin.md) |
| `java.lang.ClassNotFoundException: org.jetbrains.kotlin.cli.utilities.MainKt` (during `kspKotlinIos*`) | [classnotfoundexception-mainkt-ksp-ios.md](classnotfoundexception-mainkt-ksp-ios.md) |
| `SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable or by setting the sdk.dir path…` | [sdk-location-not-found.md](sdk-location-not-found.md) |
| `No space left on device` (mid-build; `~/.konan` is huge) | [no-space-left-on-device-konan.md](no-space-left-on-device-konan.md) |
| Build broke after bumping one dependency — no single error, many symptoms | [version-catalog-drift.md](version-catalog-drift.md) |

## The two commands these pages keep mentioning

```sh
npx create-cmp-cli doctor --fix   # diagnose any KMP project + auto-apply the safe heals
npx create-cmp-cli my-app         # scaffold a new CMP project on a CI-proven-green version set
```

`doctor` exits non-zero when it finds blocking issues, so it works unattended (CI, agents). `--fix` only automates the two heals that are provably safe (writing `local.properties` from `ANDROID_HOME`, adding `ksp.useKSP2=true`); everything else prints the exact manual step.
