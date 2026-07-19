# Architecture

Clean Architecture, three layers, one rule: **dependencies point inward.**

```
┌─────────────────────────────────────────────────────┐
│ presentation   Screens (Compose) · ViewModels        │
│                └─ depends on domain only             │
├─────────────────────────────────────────────────────┤
│ domain         models · repository INTERFACES ·      │
│                use cases — imports nothing app-internal │
├─────────────────────────────────────────────────────┤
│ data           repository implementations ·          │
│                remote/local sources                  │
└─────────────────────────────────────────────────────┘
           di/ wires implementations to interfaces (Koin)
```

- `presentation` never imports `data`. ViewModels call **use cases**, not repositories.
- `domain` is pure Kotlin — no Compose, no Koin, no platform types.
- `data` implements the domain's repository interfaces; sources stay behind them.

## Data flow (unidirectional)

`Screen` collects `StateFlow<UiState>` from its ViewModel → user intent calls a ViewModel
function → the ViewModel invokes a use case → repository → sources → new immutable `UiState`
is emitted. No state lives in composables beyond UI-local concerns.

## Error handling (crosscutting policy)

Failures cross layer boundaries as **typed results, never exceptions** — the pattern the
conformance gates enforce (`specs/app-base.spec.md` ARCH-06..08):

- **`AppResult<T>`** (`domain/result/AppResult.kt`) is the boundary type: `Success(value)` or
  `Failure(error: DomainError)`. One-shot repository operations return it; they never throw.
  (Deliberately not `kotlin.Result` — its untyped `Throwable` would put raw exceptions right
  back on the boundary.)
- **`DomainError`** (`domain/model/DomainError.kt`) is the typed failure vocabulary — KINDS
  only (`Network`, `NotFound`, `Unexpected(cause)`), no message strings. Extend it with the
  kinds your sources actually produce.
- **The repository implementation is the only translation point.** I/O runs inside
  `suspendRunCatching` (`data/AppResultCatching.kt`), which maps infrastructure exceptions to
  `DomainError` via its `mapError` classifier and **always rethrows `CancellationException`**
  — swallowing cancellation breaks structured concurrency (a closed screen would render an
  error instead of just stopping). `suspendRunCatching` is the data layer's *only* allowed
  catch mechanism (enforced: ARCH-08); ad-hoc `try`/`catch` in `data/` fails the gate.
- **ViewModels contain no `try`/`catch`** (enforced: ARCH-07). They `when` over the
  `AppResult` into a **sealed UiState** (`Loading` / `Content` / `Empty` / `Error`) —
  impossible states are unrepresentable. User-facing error copy is mapped in presentation
  from the `DomainError` kind (see the exemplar's `toUserMessage()`); a raw
  `Throwable.message` never reaches the UI.

Enforced vs advisory: ARCH-06/07/08 are mechanical gates (source scans in
`ArchitectureConformanceTest.kt`). The sealed-UiState shape and the `toUserMessage()`
placement are advisory convention, carried by the exemplar and its tests.

## Threading (main-safety policy)

**Repositories are main-safe by delegation, not by ceremony.** Every I/O path the scaffold
ships is main-safe under its own library's contract, so the template injects no dispatcher:

- **Room suspend DAO calls** (`data/local/ItemDao.kt` — all `suspend fun`s): Room executes
  suspending queries on its own background executor; calling them from `Dispatchers.Main` is
  safe by Room's documented contract.
- **GitLive Firebase suspend APIs** (when you wire them into `data/remote/`): suspending
  wrappers over the async native SDKs — main-safe by the SDK's contract.
- **The example source** (`data/remote/ItemRepositoryImpl.kt`): only `delay()` (a suspension,
  not a block) and list construction.

The rule when you add a source that does NOT carry such a guarantee (JDBC, direct file I/O,
heavy parsing, any blocking call): inject a `CoroutineDispatcher` into the repository via
Koin (default `Dispatchers.IO`) and wrap the blocking work in `withContext(dispatcher)` —
injected, not hardcoded, so tests can pass a test dispatcher. Do **not** add `withContext`
around calls that are already main-safe by contract; it's dead weight that hides where the
real guarantee lives.

## The exemplar feature (`home` by default, configurable)

The **configured exemplar** — `exemplarFeature` in `qa/approvals.json`, `home` on a fresh
scaffold — is the **reference implementation** of the pattern, including its tests
(`commonTest`). The genesis walk typically promotes your own first feature to exemplar
(see `CLAUDE.md`'s genesis section); `qa/scaffold-feature.mjs` then clones from *it*, and
`home` demotes to a regular feature. To add a feature, mirror the exemplar exactly:

1. Domain: model + repository interface + use case (+ tests).
2. Data: repository implementation (+ test through the domain contract).
3. Presentation: `<Feature>Screen` (testTag-rooted) + `<Feature>ViewModel` with a
   `StateFlow` of a **sealed** UiState (`Loading`/`Content`/`Empty`/`Error` — no
   `try`/`catch`, fold over `AppResult`) (+ test using a fake from `testing/fakes/`).
4. DI: register in `di/AppModule.kt`.
5. Navigation: add the route in `presentation/navigation/`.
6. Run `node qa/verify.mjs` — done means PASS + committed receipt.

## Conventions

- **Theme tokens** (`presentation/theme/`) are the only source of design values — no hardcoded
  colors/spacing/radii in screens.
- **testTags** on every screen root and interactive element (`TestTagAutomation` exposes them
  to E2E tooling on both platforms).
- **Insets** are owned by `BaseScreen` — new screens compose inside it and never re-solve
  edge-to-edge padding.
- Significant decisions get an ADR in [`docs/adr/`](./adr/) — see the template there.
