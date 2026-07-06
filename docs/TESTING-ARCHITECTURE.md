# Testing Architecture — the harness's testing framework base

> **Normative for every generated project.** This defines the test pyramid, the frameworks, the
> patterns, the E2E/Appium layer (headless, cross-platform, with reports and screenshots as
> evidence), and how it all feeds the verify lane's evidence packs. Companion to
> [`HARNESS-PLAN.md`](./HARNESS-PLAN.md) (product definition) and
> [`HARNESS-ROADMAP.md`](./HARNESS-ROADMAP.md) (execution). Status: **design, pre-approval.**
> Date: 2026-07-06.

---

## 1. The pyramid (industry standard, adapted to KMP + AI-driven delivery)

| # | Layer | What it proves | Framework | Speed / where |
|---|---|---|---|---|
| 1 | **Unit** (majority) | ViewModel state, UseCase logic, Repository contracts | `kotlin-test` + `kotlinx-coroutines-test` + **Turbine**, hand-written **fakes** | ms · `commonTest`, run on JVM (`desktopTest`) |
| 2 | **Architecture conformance** | Dependency direction, layer placement, naming, test-presence, no hardcoded design values | **Konsist** (runs as unit tests) | ms · same source set *(M2)* |
| 3 | **Structural / golden** | Rendered screen structure + resolved design tokens match committed baselines | Inspector tier 0 headless render → golden-tree JSON diff | sec · JVM, no device |
| 4 | **E2E smoke** (tip: few, critical flows) | The real app boots and core journeys work on a real OS | **Appium + pytest**, Page Object Model, testTag selectors | min · headless emulator/simulator |

The AI-specific twist vs a classic pyramid: layer 3 does the job screenshot-testing does
elsewhere — but structurally (semantics-tree JSON, deterministic, no pixel flake) — and layer 2
exists because AI collaborators drift from unenforced conventions. Pixels appear only as
*evidence attachments* at layer 4, never as assertions.

## 2. Unit layer — conventions (the exemplar teaches these)

- **Style:** Arrange-Act-Assert with Given/When/Then backtick names — one behavior per test:
  `` fun `emits Loaded when repository succeeds`() ``. No test reads another's state.
- **Coroutines:** `runTest` everywhere; ViewModels take an injected `CoroutineDispatcher`
  (already the template's DI pattern) so tests pass a `StandardTestDispatcher` — no global
  `Dispatchers.Main` swap hacks in common code.
- **Flows:** Turbine — `state.test { assertEquals(Loading, awaitItem()); … }`.
- **Fakes, not mocks:** every repository/data-source interface gets a fake in
  `commonTest/…/fakes/`, shared with (and consistent with) the desktop-DI fakes. Fakes are
  configurable (`shouldFail = true`) and assertable (`recordedCalls`). No mocking framework —
  KMP-hostile (MockK is JVM-only) and architecturally weaker than interface-driven fakes.

**Exemplar draft — `HomeViewModelTest` (the pattern every generated test follows):**

```kotlin
class HomeViewModelTest {

    private val repository = FakeExampleRepository()
    private val dispatcher = StandardTestDispatcher()

    private fun viewModel() = HomeViewModel(GetExampleUseCase(repository), dispatcher)

    @Test
    fun `emits Loading then Loaded when repository succeeds`() = runTest(dispatcher) {
        repository.items = listOf(Example(id = "1", title = "First"))

        viewModel().state.test {
            assertEquals(HomeState.Loading, awaitItem())
            val loaded = awaitItem()
            assertIs<HomeState.Loaded>(loaded)
            assertEquals("First", loaded.items.single().title)
        }
    }

    @Test
    fun `emits Error with retry when repository fails`() = runTest(dispatcher) {
        repository.shouldFail = true

        viewModel().state.test {
            assertEquals(HomeState.Loading, awaitItem())
            assertIs<HomeState.Error>(awaitItem())
        }
    }
}
```

## 3. E2E layer — Appium, headless, cross-platform, evidence-first

### 3.1 One runner: Kotlin E2E module (consolidation decision, amended 2026-07-06)

The template today ships two runners — Node `qa/appium` smoke (used Node because the engine
guarantees that runtime) and pytest `tests/appium` (Appium's largest ecosystem) — legacy of two
phases. **Consolidate on a Kotlin `e2e/` Gradle module** (JUnit 5 + Appium `java-client`,
isolated from the app's classpath):

- **Compile-checked selectors** — page objects import the same `TestTags` constants the
  composables use (via the desktop-target artifact): rename a tag and E2E fails to *compile*.
  Mechanical, not conventional — the harness philosophy applied to selectors.
- **No third runtime** — JDK 17 is already required; Python would be a new toolchain burden in
  a product whose pitch is removing toolchain friction.
- **Reporting native** — JUnit XML from the JUnit platform, Gradle HTML report free, Allure via
  its standard JUnit 5 adapter (the approved CI report).
- **One language** — the team's and `cmp-test`'s generated tests read like the app code.
- Cost: E2E iteration pays a compile step; accepted.

Both the Node runner and the pytest suite retire (their jobs — boot smoke + generated suites —
move into `e2e/`). Sections below referring to pytest fixtures/markers map to their JUnit 5
equivalents (extensions, `@Tag("quarantine")`, `--platform` via a Gradle property).

### 3.2 Page Object Model + testTag selectors (the cross-platform key)

- **Page Object per screen**, 1:1 with Screen composables: `pages/home_page.py` exposes
  intent-level methods (`open_profile_tab()`, `favorite_first_item()`) — tests read as user
  journeys, never raw selectors. This is the standard POM discipline; it also gives `cmp-test`
  a deterministic place to put generated code.
- **Selectors: testTags only, never text.** The template already ships the
  `TestTagAutomation` shim: testTags surface as **resource-ids on Android**
  (`testTagsAsResourceId`) and as **accessibility identifiers on iOS**. Page objects declare the
  tag once; the driver maps it per platform. Text selectors (what both current runners use) are
  l10n-fragile and are *demoted to assertion helpers only*.
- **Cross-platform:** one test suite; a `--platform android|ios` pytest option selects the
  driver profile (UiAutomator2 / XCUITest). Page objects are platform-agnostic because tags are.
  Android is the required lane; iOS runs when a Mac + simulator profile is present (consistent
  with the parked-iOS-CI stance).

### 3.3 Headless execution

- **Android:** the standard CI recipe — emulator launched
  `-no-window -gpu swiftshader_indirect -no-audio -no-boot-anim -no-snapshot`, readiness gated
  on `sys.boot_completed`. Locally, `cmp-qa-prep` keeps the windowed flow; the verify lane and
  CI use the headless profile. Same AVD image both ways so behavior is identical.
- **iOS:** `xcrun simctl` booted simulators are headless by nature on CI (no window server
  needed); WDA via XCUITest.
- Appium server lifecycle owned by the lane (start if absent, reuse if healthy, teardown if it
  started it) — no "works on my machine" server assumptions.

### 3.4 Evidence: screenshots, page source, video, reports

Captured by pytest fixtures into `qa-artifacts/e2e/<run-id>/`:

- **Screenshot on every failure** (standard) **+ at named checkpoints** — page objects call
  `evidence.checkpoint("home-loaded")`; deterministic filenames.
- **Page-source XML alongside every screenshot** — the structural twin (and it feeds the
  inspector's uiautomator tier, so a failure can be inspected as a tree, not squinted at).
- **Video** (adb screenrecord / simulator recording) — optional flag, on in CI, off locally.
- **Reports, layered by consumer:**
  - **JUnit XML** — always emitted; the machine-interoperable standard every CI understands.
  - **pytest-html** — always; a single self-contained HTML report with embedded failure
    screenshots. Zero extra tooling.
  - **Allure** — optional profile (`--report allure`): the rich industry-standard report
    (steps, attachments, history, flake categories). Costs the Allure CLI dependency; JDK 17 is
    already present. Recommended ON in CI, optional locally.

### 3.5 Flake discipline

No blanket retries (they hide real defects and poison evidence). A test may be marked
`@pytest.mark.quarantine` (runs, reported separately, doesn't fail the lane) — the receipt
records quarantined counts so flake debt is visible, never silent. Waits are explicit
(`wait_for_tag`, bounded), never `sleep`.

## 4. Verify-lane semantics (PASS / FAIL / SKIP)

| Step | No device attached | Device present | Notes |
|---|---|---|---|
| build | runs | runs | FAIL stops the lane (nothing else is meaningful) |
| unitTests | runs | runs | includes Turbine/fake suites |
| conformance *(M2)* | runs | runs | per-rule failure messages |
| goldenTrees | runs (headless render) | runs | drift = FAIL; **never auto-regenerates** — the AI proposes a baseline update as an explicit, reviewable act; intended-change decisions belong to the human |
| tokenDrift / a11y | runs | runs | via inspector on the headless render |
| e2eSmoke | **SKIP** (recorded) | runs headless | SKIP ≠ PASS: the receipt says so |

- **Profiles:** `verify --profile local` (device optional → e2e may SKIP) vs
  `--profile ci` (e2e required; a SKIP is a FAIL). Generated CI uses `ci`.
- Lane verdict: PASS iff zero FAILs; SKIPs are listed in the receipt so "green with gaps" is
  visible, never silent.

## 5. Evidence packs — committed receipt, hashed artifacts

Per the approved decision, **the receipt is committed**: `qa/evidence/latest.json`, overwritten
per lane run, deterministic (stable ordering, single timestamp) so its diff is small and
reviewable. A change is complete only when its receipt is part of the commit — git history *is*
the audit ledger. Generated CI re-runs the lane and **fails if the committed receipt doesn't
match HEAD** (SHA mismatch, FAIL verdict, or missing) — an unverified change is mechanically
unmergeable.

**Binary evidence (screenshots, videos, HTML/Allure reports) is not committed** — it's hashed
into the receipt (path + sha256) and uploaded as CI artifacts. The receipt stays a small,
diffable source-of-truth; the heavy proof is content-addressed so it can't be quietly swapped.

Receipt schema (abridged):

```json
{
  "schema": "cmp-evidence/1",
  "commit": { "sha": "…", "dirty": ["…"] },
  "profile": "local|ci",
  "verdict": "PASS|FAIL",
  "steps": [
    { "name": "unitTests", "verdict": "PASS", "durationMs": 4180, "details": { "tests": 24 } },
    { "name": "e2eSmoke", "verdict": "SKIP", "reason": "no device (profile=local)" }
  ],
  "artifacts": [
    { "path": "qa-artifacts/e2e/…/failure-home.png", "sha256": "…" }
  ],
  "toolVersions": { "kotlin": "2.2.20", "appium": "3.x", "engine": "0.3.0" },
  "generatedAt": "…"
}
```

## 6. The generated CLAUDE.md contract (draft for review)

> Short and normative — the exemplar is the tutorial; this is the law. Full draft:

```markdown
# __APP_NAME__ — AI delivery contract

This project was generated by create-cmp with a verification harness. Any AI session working
here follows this contract.

## Definition of done
You are NOT done until `npm run verify` passes and `qa/evidence/latest.json` (the receipt) is
updated and included in your commit. Claiming completion without a PASS receipt is a failure.

## Architecture (enforced by conformance tests — they will name violations)
- Layers: presentation → domain ← data. `domain` imports nothing app-internal.
  `presentation` never imports `data`. DI wires implementations in `di/`.
- Every screen: a `*Screen` composable with a testTag root, a ViewModel with a test, and a
  committed golden tree in `qa/golden/`.
- Design values (colors/spacing/typography) come from the theme's token catalog — never
  hardcoded literals.

## Adding a feature
Use the `add-feature` skill (in `.claude/skills/`). It stamps the exemplar pattern — all
layers, DI, navigation, tests at every layer, golden baseline. Do not hand-roll the structure.
[Until the skill ships: copy the `home` exemplar feature INCLUDING its tests.]

## Testing
- Unit: kotlin-test + coroutines-test + Turbine, hand-written fakes (see
  `commonTest/…/fakes/`). No mocking frameworks.
- E2E: pytest + Appium page objects in `tests/appium/`, testTag selectors only.
- Golden trees: if verify reports drift you did not intend, fix your change. If the drift IS
  the intended change, regenerate the baseline explicitly and say so in your summary — never
  regenerate to silence a failure.

## Evidence
`npm run verify` writes the receipt. Commit it with your change. Binary artifacts
(screenshots/reports) are hashed into the receipt; do not commit them.
```

## 7. What this adds to M0/M1 scope

- M0 gains: pytest E2E consolidation groundwork is **deferred to its own workstream inside M1**
  (lane needs a single runner to call), but M0's unit/golden layers are unchanged.
- M1 gains: evidence-receipt CI check (receipt-matches-HEAD), pytest evidence fixtures
  (screenshot/page-source/JUnit XML/pytest-html), headless emulator profile in the lane,
  SKIP semantics + profiles. Allure lands as the optional CI report if approved.
- Retirement: `qa/appium` Node runner (pending approval).
