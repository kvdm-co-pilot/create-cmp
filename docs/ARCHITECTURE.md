# create-cmp — Architecture

`create-cmp` is a **deterministic scaffolder**: the parts of a Compose Multiplatform project that
are identical every time are shipped as a frozen, CI-verified template and *stamped*, not
regenerated. The small project-specific slice is parameterized. This is what makes the output
reproducible — the property ad-hoc CMP setups lack.

## Three layers

```
┌─ Front doors ────────────────────────────────────────────────────────┐
│   (a) npx create-cmp        ← the CLI, usable by anyone               │
│   (b) Claude Code plugin    ← conversational interview + screen-gen,  │
│        (cmp-new/-doctor/-qa-prep)  shells out to the SAME engine      │
├─ Engine (Node, deterministic — no LLM in the hot path) ──────────────┤
│   doctor → bootstrap → verify   +   scaffold pipeline                 │
├─ Golden template (frozen, CI-verified) ── the moat ──────────────────┤
│   pinned versions · iOS shell · nav+insets · Clean Arch · DI · Maestro│
└──────────────────────────────────────────────────────────────────────┘
```

## Layer 1 — the golden template

A generic CMP skeleton with **one example feature wired end-to-end** (data → domain → presentation →
DI) and a data-driven bottom-nav shell. Ships a pinned, mutually-agreeing version set (Kotlin, KSP,
Compose Multiplatform, Room, AGP, Koin, Ktor, GitLive Firebase, Navigation Compose) including
`ksp.useKSP2=true` for the iOS Room/native path, plus the full iOS shell (XcodeGen `project.yml`,
CocoaPods `Podfile`, `Info.plist`, `iOSApp.swift`, `ContentView.swift`) and the Android shell
(`AndroidManifest`, edge-to-edge `MainActivity`, Koin/Room `Application`).

Identifiers are placeholders the engine substitutes:

| Token | Meaning |
|---|---|
| `__APP_NAME__` | human display name |
| `__PACKAGE__` | reverse-DNS package id |
| `__PACKAGE_PATH__` | slash form for directory layout |
| `__IOS_BUNDLE_ID__` | iOS bundle id |
| `__REGION__` | Firebase region |
| `__THEME_PREFIX__` | PascalCase symbol prefix |

Optional regions are wrapped in `// >>> cmp:feature <name>` / `// <<< cmp:feature <name>` markers
(supporting negation `!name` and nesting) so the engine can strip them when a feature is off.

## Layer 2 — the engine

**Toolchain doctor** (`doctor → bootstrap → verify`): detects JDK 17, Android SDK + cmdline-tools +
system image + AVD, Xcode + CLT, CocoaPods, XcodeGen, Node, Appium 3.x + uiautomator2/xcuitest (the
legacy e2e path). Missing dependencies print the exact install command and are **consent-gated**
(`--yes` for CI); idempotent; OS-aware (Linux → Android-only). Ends with a per-dependency GREEN/FAIL
verdict. The E2E flows themselves run on Maestro, installed separately
(`curl -fsSL https://get.maestro.mobile.dev | bash`).

**Scaffold pipeline:** validate config against `options.schema.json` → copy template → token-replace
(contents *and* paths) → atomically rename package source directories → strip disabled feature
marker-blocks and their paths → run the verify gate.

**Verify gate (north-star):** runs the Android build (and the iOS build on macOS when iOS is enabled)
and returns GREEN/FAIL. The CLI refuses to claim success without it unless `--no-verify` is passed.

## Layer 3 — front doors

The CLI and the Claude Code plugin share one engine. The plugin's `cmp-new` skill runs the interview,
builds the engine config, invokes the engine, then generates the requested tab screens from the
example-feature pattern. `cmp-doctor` wraps the toolchain bootstrap; `cmp-qa-prep` brings up the
emulator + Maestro flow run + smoke.

## Reproducibility guarantee

The template is CI-gated: an upstream version bump must fail CI here, not a user's generated project.
The engine is unit-tested (token replacement, package-directory rename correctness and idempotency,
feature-marker stripping including negation/nesting), and integration is proven by stamping a demo app
and building it green on both platforms.
