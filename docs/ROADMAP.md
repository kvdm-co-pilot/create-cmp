# create-cmp Roadmap

> **The goal:** make `create-cmp` the **complete AI delivery harness for Kotlin/Compose
> Multiplatform** — industry best practices at every layer, from the UI tools to the verification
> layer to the testing architecture base, encoded as executable patterns and gates that AI
> assistants are mechanically bound to. Scaffolding (removing every point of friction from first
> scaffold to store release) is how the harness arrives; the harness is the product. Full product
> definition: [`HARNESS-PLAN.md`](./HARNESS-PLAN.md).

The roadmap is organised as seven pillars. The strategic through-line: `create-cmp` must be useful
**repeatedly** (maintenance, generators, CI gates, inspection, verification) and useful to
**existing** KMP projects, not only greenfield ones.

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
  `add room`, `add appium` (the e2e harness — feature key `appium`, legacy name, renamed in 0.3.0).
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

### 5. Verify 🧭 *(the harness — CURRENT FOCUS)*

The layer that makes this an **AI delivery harness** rather than a toolbox — see
[`HARNESS-PLAN.md`](./HARNESS-PLAN.md) for the full design. In the generated project:

- **Exemplars** — the example feature carries idiomatic tests at every architectural layer, so
  "follow the pattern" includes the tests.
- **Conformance gates** — best practices as executable checks (Konsist dependency-direction and
  layer rules, testTag/golden-tree/ViewModel-test presence, no hardcoded design values), green at
  scaffold time.
- **In-project generation skills** — `add-feature` / `add-screen` / `add-repository` shipped into
  the generated repo's `.claude/skills/`, stamping pattern + test skeletons + golden baseline:
  right-by-construction.
- **The verify lane** — one command: build → tests → conformance → golden-tree diff → token
  drift → a11y → smoke, producing a typed PASS/FAIL verdict + **evidence-pack JSON**.
- **Claude Code binding** — generated `CLAUDE.md` contract ("not done until the verify lane
  passes") + Stop-hook enforcement in the generated `.claude/settings.json`.

### 6. Ship 📦 *(planned)*

- **`create-cmp release`** — the store-release lane: keystore/signing setup, versionCode/semver
  bump, Play Console / TestFlight / Firebase App Distribution upload, store-listing metadata
  scaffold. Painful, recurring, and mostly mechanical — exactly what this tool is for.

### 7. Trust 🔒 *(the moat's maintenance machinery)*

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
| 1 | ~~npm publish + release hygiene~~ ✅ | Shipped (`create-cmp-cli@0.2.0`) |
| 2 | ~~CI matrix + canary + shipped CI workflow~~ ✅ | Shipped (Android per push; iOS manual dispatch) |
| 3 | ~~Inspector: token-enriched kit, snapshots + a11y, live on-device inspection~~ ✅ | Shipped — AI that *sees* a running Compose app as structured design data |
| 4 | **The harness (pillar 5): contract → conformance gates → in-project skills → enforcement** | **The product: AI-driven delivery with independent, evidenced verification — see [`HARNESS-PLAN.md`](./HARNESS-PLAN.md)** |
| 5 | Docs site + demo + announcements | Distribution wave, told as the harness story |
| 6 | `add` generators + first recipes (auth, push, paywall) | Parked until demand is proven externally |
| 7 | Release lane | Parked |

## Contributing

Recipes and generators are designed to be community-contributable: each is a self-contained,
CI-verified unit. If you want one that doesn't exist, open an issue — see
[CONTRIBUTING.md](../CONTRIBUTING.md).
