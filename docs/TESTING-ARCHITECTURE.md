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
| 3a | **Structural / golden — inner loop** | Rendered screen structure + resolved design tokens match committed baselines | **cmp-inspector** golden-tree JSON diff (`snapshot_diff` / `prove_change`) | sec · JVM, no device |
| 3b | **Screen behavior — durable** | A screen renders and reacts (clicks, state) as specified | **Compose UI Test** (first-party `runComposeUiTest`), testTag selectors, **spec-driven** | sec · JVM/instrumented |
| 4 | **E2E smoke** (tip: few, critical flows) | The real app boots and core journeys work on a real OS | **Maestro** (Apache-2.0 CLI, free local+CI), YAML flows, testTag selectors, one flow drives Android + iOS | min · headless emulator/simulator |

**The two-tier structural model (founder decision, 2026-07-06).** Layers 3a and 3b are
complementary, not redundant, and serve different moments:

- **3a — inner loop / dev workflow:** the AI's fast, device-free instrument. It *reads* the
  running/rendered UI as a semantics tree and diffs structure + tokens. No interaction, no
  compile step — this is what `prove_change` and the dev loop use while iterating.
- **3b — durable regression:** first-party Compose UI Test — compile-checked, committed, can
  *interact* (click, assert reactions). These are the long-lived tests, and they are
  **specification-driven** (see §7): each derives from a committed behavior spec clause, not
  from ad-hoc observation.

The AI-specific twist vs a classic pyramid: layer 3a does the job screenshot-testing does
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

### 3.1 One runner: Maestro (consolidation decision, re-amended 2026-07-06)

The template today ships two runners — Node `qa/appium` smoke and pytest `tests/appium` —
legacy of two phases. Earlier this doc proposed a Kotlin `e2e/` Appium module; that was
superseded after weighing the actual industry + AI standards per layer:

- Device E2E is the *least* AI-load-bearing layer here — the AI's real instrument is the
  structural inspector (3a), not black-box UI driving. So the E2E layer should optimize for
  **least brittleness and cross-platform reach**, not language uniformity.
- **Maestro** is the current low-brittleness standard: Apache-2.0 CLI, **free** to run locally
  and in CI on Android *and* iOS simulators (only the hosted Maestro Cloud device farm is
  paid — we bring our own emulator, so we never need it). Auto-waits eliminate most flake; one
  YAML flow drives both platforms; trivial to invoke from the verify lane.
- Trade-off accepted: YAML flows are not compile-checked. We compensate by keeping E2E *thin*
  (boot + a few critical journeys) and putting compile-checked, interaction-level assertions in
  Compose UI Test (3b) instead.

**Both the Node runner and the pytest suite retire.** Flows live in `qa/e2e/*.yaml`; selectors
reference testTags (surfaced as resource-ids on Android / accessibility ids on iOS via
`TestTagAutomation`). Sections below referring to pytest fixtures/markers map to Maestro flow
equivalents (a shared setup flow, tags via flow config, `--platform` via the launch profile).

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

## 7. Specification-driven testing (the durable layer's source of truth)

> **Founder decision, 2026-07-06:** the durable tests (3b Compose UI Test, and the E2E flows)
> are not authored ad-hoc — they are **derived from and checked against a committed behavior
> specification.** This gets its own roadmap pillar and workflow integration
> (see `HARNESS-ROADMAP.md` → "Specification-driven testing"). It is the create-cmp-scoped
> instance of the platform thesis's machine-readable behavior contract (the Domain Ledger idea
> in miniature): the spec is the durable artifact, tests are its executable projection.

**The artifact.** Each feature carries `specs/<feature>.spec.md` — behavior clauses in
Given/When/Then form, each with a **stable clause id** (e.g. `HOME-03`). The spec is the source
of truth for *intended* behavior; humans and AI extend the spec first, code and tests follow.

**The projection.** Every clause maps to at least one durable test:
- screen-behavior clauses → a Compose UI Test (3b) tagged with the clause id,
- journey clauses → a Maestro flow (4) tagged with the clause id.
The inspector (3a) closes the loop: it confirms the *rendered structure* the test drives
matches what the spec asserts — spec → test → running app → structural proof.

**The gate (in the verify lane).** A `specCoverage` step: every clause has ≥1 linked test, and
every durable test links to a live clause. Orphans fail — a clause with no test (unverified
behavior) or a test with no clause (untraceable assertion) both break the lane. This is what
makes the spec *load-bearing* rather than decorative.

**Workflow integration.**
- `add-feature` (M3) writes the spec clauses first (AI proposes, human confirms), then
  generates durable test stubs bound to those ids.
- `cmp-test` is elevated: from *"derive tests from observed structure"* to *"derive tests from
  the spec, and verify them against observed structure."*
- The generated `CLAUDE.md` contract gains a line: **new behavior begins as a spec clause.**
- Reporting: spec clauses become the report's spine (living documentation — the Allure/BDD
  report reads as the spec with pass/fail per clause).

**Sequencing note.** M2 ships Compose UI Test capability with a *hand-written* exemplar durable
test so the layer exists and the lane can run it. The spec layer (its own pillar, after the
core harness) then makes those tests *generated-from-spec* and adds the coverage gate. Build
the durable tests "spec-shaped" (one behavior per test, clause-id-taggable) from M2 so the
later spec binding is mechanical, not a rewrite.

## 8. What this added to M0/M1 scope (historical)

- M0: unit + fakes foundation shipped (unchanged by later decisions).
- M1: verify lane + committed receipts + honest SKIPs shipped. The device-E2E consolidation
  (→ Maestro) and the receipt-matches-HEAD CI check are deferred to M2/M4 respectively.
- Retired (superseded, not yet deleted from the template): `qa/appium` Node runner and
  `tests/appium` pytest suite — both replaced by Maestro flows in M2.
