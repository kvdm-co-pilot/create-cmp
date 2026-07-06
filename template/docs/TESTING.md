# Testing

The pyramid this project uses, bottom-up. The `home` feature's tests are the exemplar —
copy their shape.

| Layer | Where | Run |
|---|---|---|
| Unit (majority) | `composeApp/src/commonTest` | `./gradlew :composeApp:desktopTest` |
<!-- >>> cmp:feature appium -->
| E2E smoke (few) | `tests/appium`, `qa/appium` | see `qa/appium/README.md` |
<!-- <<< cmp:feature appium -->
| The lane (all of it) | `qa/verify.mjs` | `node qa/verify.mjs` |

## Unit conventions

- **Frameworks:** `kotlin-test` assertions · `kotlinx-coroutines-test` (`runTest`,
  `StandardTestDispatcher`) · **Turbine** for Flow/StateFlow.
- **Fakes, never mocks.** Every repository/source interface gets a hand-written fake in
  `commonTest/…/testing/fakes/` — configurable (`shouldFail`, seeded data) and
  call-recording. Mocking frameworks are banned: they're JVM-only in KMP and hide bad seams.
- **Style:** Arrange-Act-Assert; behavior-named backtick tests
  (`` `emits error message when repository fails` ``); one behavior per test; no shared
  mutable state between tests.
- **ViewModels:** install a `StandardTestDispatcher` as Main (`@BeforeTest setMain` /
  `@AfterTest resetMain`) because `viewModelScope` launches on Main; assert state with
  `state.test { … }` (Turbine).
- **Suspend/delay:** always under `runTest` — virtual time makes `delay` free.

## What every new piece of code brings

| You added | You also add |
|---|---|
| a ViewModel | a `*ViewModelTest` (states: loading, success, failure, retry) |
| a use case | a `*UseCaseTest` (behavior + failure propagation) |
| a repository impl | a test through its DOMAIN interface |
| a screen | a testTag root (E2E reachable) |

Never delete, weaken, or `@Ignore` a failing test to get green. Fix the behavior — or if the
test is genuinely wrong, change it and say so explicitly in your PR/summary.

<!-- >>> cmp:feature appium -->
## E2E

Appium smoke covers boot + bottom-nav. Selectors go by **testTag** (surfaced as resource-ids
on Android via `TestTagAutomation`), never by display text. Extend with intent-level page
objects; keep the E2E tip small — behavior belongs in unit tests.
<!-- <<< cmp:feature appium -->

## The verify lane

`node qa/verify.mjs` is the definition of done: build → unit tests → (conformance, golden
trees, token drift, a11y — as they ship) → E2E smoke when a device is attached. It writes the
evidence receipt to `qa/evidence/latest.json`; **commit the receipt with your change.**
SKIPped steps are recorded honestly — green-with-gaps is visible, never silent.
