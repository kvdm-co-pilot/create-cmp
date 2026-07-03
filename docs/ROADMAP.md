# create-cmp Roadmap

> **The goal:** make Kotlin/Compose Multiplatform the obvious choice for cross-platform mobile by
> removing every point of friction — from first scaffold to store release — and make `create-cmp`
> the tool the ecosystem reaches for by default. Not just at project creation: across the whole
> life of the project.

The roadmap is organised as six pillars. The strategic through-line: `create-cmp` must be useful
**repeatedly** (maintenance, generators, CI gates, inspection) and useful to **existing** KMP
projects, not only greenfield ones.

## Pillars

### 1. Scaffold ✅ *(shipped)*

The deterministic stamp: frozen CI-verified golden template, toolchain doctor + bootstrap, and the
`--verify` green-build gate. See [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### 2. Maintain 🔜 *(next major focus)*

The recurring pain of KMP is that **Kotlin / KSP / Compose / Room / AGP move in lockstep or the
build dies**. Planned commands:

- **`create-cmp upgrade`** — migrate an existing project to the next *proven-green* version set,
  with a diff preview and the verify gate. One command instead of a day of dependency archaeology.
- **`create-cmp doctor` for any KMP project** — not just ours. Diagnose *and heal*: `~/.konan`
  bloat, version-set mismatches, the KSP2/native catch-22, missing toolchain pieces. If your KMP
  build is broken, this should be the first thing you run — whoever scaffolded the project.
- **`create-cmp clean`** — Gradle/konan cache hygiene (disk-space failures are a real KMP
  build-killer).

### 3. Extend 🔜

- **`create-cmp add <thing>`** — additive generators for existing apps: `add ios` (wire the
  XcodeGen/Pods shell into an Android-only app), `add feature <Name>` (screen + ViewModel + state +
  DI + navigation + test, following the template's example-feature pattern), `add firebase`,
  `add room`, `add appium`.
- **Recipes** — individually CI-verified, additive feature packs: auth flows, push notifications +
  deep links end-to-end, permission patterns (camera/location/notifications), RevenueCat paywall,
  maps, localization, analytics, crash reporting (with the Crashlytics plugin wired correctly).
- The core template stays opinionated and small — recipes are additive so the verification matrix
  stays tractable.
- *(Later)* `add desktop` — the inspector harness already proves the JVM/Desktop runtime works with
  our exact version set.

### 4. Inspect 🚧 *(Phase 0 shipped)*

The AI-native Compose inspector — read a running app's hierarchy, geometry, and *resolved design
tokens* as structured JSON, never screenshots. Phase 0 (headless host-JVM render → MCP tools) is
built and verified; see [`INSPECTOR-PLAN.md`](./INSPECTOR-PLAN.md) for phases 1–3 (token
enrichment, live on-device inspection, plugin default).

Cheap, high-value additions on the same tree contract:

- **Golden-tree snapshot testing** — commit the semantics JSON as regression fixtures; diffs are
  human-readable, no pixel flakiness.
- **Accessibility auditor** — the tree already carries geometry + text: check touch targets
  (≥ 48dp), contentDescription coverage, and text-contrast against the declared token catalog.

### 5. Ship 📦 *(planned)*

- **`create-cmp release`** — the store-release lane: keystore/signing setup, versionCode/semver
  bump, Play Console / TestFlight / Firebase App Distribution upload, store-listing metadata
  scaffold. Painful, recurring, and mostly mechanical — exactly what this tool is for.

### 6. Trust 🔒 *(the moat's maintenance machinery)*

- **Full Android + iOS build matrix in CI** — every PR stamps and builds a real app on both
  platforms (currently CI runs the engine unit tests).
- **Nightly canary** against the latest upstream releases → a public **compatibility dashboard** of
  which Kotlin/CMP/KSP/AGP sets are green. The frozen set must never rot silently.
- **Template ships a CI workflow** — generated projects get a GitHub Actions workflow that runs the
  verify gate on every push, so *their* green build is protected too.
- **Time-to-green benchmark** published from CI, so the north-star claim is measured, not asserted.

## Research-validated additions (2026-07)

An evidence pass over the ecosystem (JetBrains survey data, YouTrack vote counts, competitor
motion) confirmed the pillars above and added the following:

- **Desktop dev-client with Compose Hot Reload** *(new; low effort, daily-use)* — pre-wire the
  separate JVM run target that JetBrains' own docs tell every mobile CMP dev to hand-assemble, with
  Compose Hot Reload 1.0 configured. The closest thing KMP has to an Expo-style dev loop — and the
  same JVM module hosts the inspector's headless tier. Slots alongside the inspector work.
- **RevenueCat paywall promoted to first recipe** — the KMP SDK is stable and demand is proven.
- **Brownfield `add shared-module`** — add a KMP shared module to an *existing* native Android+iOS
  app, with the XCFramework/SPM publishing lane wired. The largest underserved audience (the
  enterprise adoption path has docs, not tooling). High effort; scheduled after `upgrade`.
- **Version-pinned AI knowledge pack** — ship `llms-full.txt` + docs for the exact pinned stack
  with the plugin, so assistants reason about the template from ground truth.
- **Small high-demand recipes** — locale switching, `testTagsAsResourceId` QA wiring.
- **Explicit non-goals (published as docs, honesty as a feature):** OTA/code-push for Compose
  (structurally unavailable: Kotlin/Native AOT on iOS has no patchable interpreter tier, and
  store policy forbids the workaround — we document why and point to a server-driven-UI recipe
  instead) and a hosted build farm (CI templates capture the value without the company-sized
  liability).
- **Watch items:** JetBrains' new default KMP project structure (template conformance review) and
  the Kotlin Toolchain/Amper evolution (keep the engine's build-system assumptions isolated).

## Sequencing

| Order | Work | Why first |
|---|---|---|
| 1 | npm publish + release hygiene | Nothing else matters while it's uninstallable |
| 2 | CI matrix + canary + shipped CI workflow | Protects the moat; starts the compounding install base |
| 3 | **Inspector complete: Phase 1 (token-enriched kit), snapshots + a11y, then Phase 2 (live on-device inspection) + the uiautomator fallback tier** | **The product-maker: AI that can *see* a running Compose app as structured design data — no one else has this** |
| 4 | `upgrade` | The recurring-use engine (fed by the canary's proven-green sets) |
| 5 | `add` generators + first recipes (auth, push, paywall) | Serves existing projects, not just greenfield |
| 6 | Release lane + docs site + demo + announcements | Distribution wave once the surface is strong |

## Contributing

Recipes and generators are designed to be community-contributable: each is a self-contained,
CI-verified unit. If you want one that doesn't exist, open an issue — see
[CONTRIBUTING.md](../CONTRIBUTING.md).
