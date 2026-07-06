# M3 — `add-feature` design (the in-project generation skill)

Status: plan/spec · Established: 2026-07-06 · Milestone: M3 (HARNESS-ROADMAP)

> The deterministic feature generator that ships **inside** every scaffolded project. A plain
> Claude Code session (no create-cmp plugin) runs it to add a conforming vertical slice —
> right-by-construction, spec-first, gate-proven. This is Layer 3 of the harness (generation
> tools) and the direct payoff of SD2 (the stamped tests are born clause-bound).

Approved decisions (founder, 2026-07-06): **deterministic stamper + skill** (not pure-skill);
**default clause set then refine** (not propose-from-scratch); **add-feature only this session**
(add-screen / add-repository are later subset variants). MVP generates a **pushed nav route**,
not a bottom-nav tab (`--tab` promotion deferred to v2 — see §7).

---

## 1. Philosophy — why a stamper, not an instruction-skill

The project thesis is *determinism is the moat; keep the LLM out of the hot path*
([ADR-0001], [ADR-0004]). If `add-feature` were prose telling Claude to hand-write 12 files,
every file is a drift chance and we'd undercut our own argument. Instead a thin Node script in
the generated repo (`qa/scaffold-feature.mjs`) copies the `home` exemplar file set and does a
**mechanical whole-word identifier rename** → a conforming skeleton by construction. The skill
orchestrates; the AI only refines the spec wording and customizes feature behavior; the lane
(compile + conformance + golden + **specCoverage**) is the proof. Mirrors the engine philosophy
exactly: **skills instruct, scripts stamp** (HARNESS-ROADMAP M3).

## 2. Surface

```
node qa/scaffold-feature.mjs <FeatureName> [--entity <EntityName>] [--dry-run]
```

- `<FeatureName>` — PascalCase, plural-ish, the feature/screen noun (e.g. `Favorites`). Drives
  the `Home`→`<Feature>` / `home`→`<feature>` renames.
- `--entity <EntityName>` — PascalCase singular domain entity (e.g. `Favorite`). Default:
  `FeatureName` with a trailing `s` stripped (`Favorites`→`Favorite`). The skill proposes it and
  the human confirms (naive de-pluralization is unreliable — `Categories`→`Category` etc).
- `--dry-run` — print the file plan + injection diffs, write nothing. (Used by the skill to show
  the human the plan before committing.)
- Exit non-zero with an actionable message if: target files already exist (feature name taken),
  a required anchor marker is missing from a shared file, or the entity/feature names aren't
  valid Kotlin identifiers.

## 3. The rename contract (THE crux — get this exactly right)

Kotlin identifiers are camelCase compounds, so **substring replacement is unsafe**: a blind
`Item`→`Favorite` corrupts Turbine's `awaitItem()` → `awaitFavorite()`, and the Compose
`items()` LazyColumn DSL collides with the `state.items` field. The rename is therefore a
**curated whole-word (`\b`-delimited) identifier map**, applied longest-key-first, over the
**known fixed file set** only.

**Rename (whole-word, on copied per-feature file CONTENTS and on PATHS):**

| From | To | Notes |
|---|---|---|
| `HomeScreen` | `<F>Screen` | |
| `HomeViewModel` | `<F>ViewModel` | |
| `HomeUiState` | `<F>UiState` | |
| `HomeScreenTest` | `<F>ScreenTest` | |
| `HomeViewModelTest` | `<F>ViewModelTest` | |
| `HomeGoldenTreeTest` | `<F>GoldenTreeTest` | |
| `home_title` / `home_error` | `<f>_title` / `<f>_error` | testTags |
| `home` (whole word) | `<f>` | package segment `presentation.home`, path `presentation/home/`, golden `home.json`, `qa/golden/home.json` |
| `"Home"` / `Home` (whole word) | `"<F>"` / `<F>` | display text + KDoc prose |
| `FakeItemRepository` | `Fake<E>Repository` | |
| `ItemRepositoryImpl` | `<E>RepositoryImpl` | |
| `ItemRepository` | `<E>Repository` | |
| `GetItemsUseCase` | `Get<E>sUseCase` | plural |
| `getItemsCallCount` | `get<E>sCallCount` | |
| `getItems` (whole word) | `get<E>s` | interface method + call sites |
| `Item` (whole word) | `<E>` | domain model class + constructor calls `Item(...)` |

**LEAVE GENERIC — never rename** (verified against the exemplar; renaming these breaks framework
APIs or needlessly churns generic names):

- `awaitItem` (Turbine), `items` (Compose LazyColumn DSL **and** the `state.items` field),
  `item` (lambda var), `goldenItems`, `itemId`, `onItemClick`, `id`, `title`, `subtitle`.
- Every `androidx.*` / `kotlinx.*` / `org.koin.*` / `kotlin.*` import and identifier.
- `__PACKAGE__`, `__THEME_PREFIX__`, `__APP_NAME__` tokens (they belong to the engine, and the
  stamper runs POST-scaffold when they're already resolved — the stamper must read the resolved
  package from the target project, see §5).

> Why whole-word is safe here: `\bItem\b` does not match inside `awaitItem`, `goldenItems`, or
> `ItemRepository` (no word boundary between `Item` and the adjacent letters), so the map's
> explicit compound entries (`ItemRepository`, `GetItemsUseCase`, …) do the compound renames and
> the bare `\bItem\b` catches only the standalone model class. Applied longest-first so
> `ItemRepositoryImpl` resolves before `ItemRepository` before `Item`.

## 4. The file set

**Copied + renamed (per-feature — deterministic):**

| Source (relative to project root) | Dest |
|---|---|
| `composeApp/src/commonMain/kotlin/<pkg>/domain/model/Item.kt` | `.../model/<E>.kt` |
| `.../domain/repository/ItemRepository.kt` | `.../repository/<E>Repository.kt` |
| `.../domain/usecase/GetItemsUseCase.kt` | `.../usecase/Get<E>sUseCase.kt` |
| `.../data/remote/ItemRepositoryImpl.kt` | `.../data/remote/<E>RepositoryImpl.kt` |
| `.../presentation/home/HomeScreen.kt` | `.../presentation/<f>/<F>Screen.kt` |
| `.../presentation/home/HomeViewModel.kt` | `.../presentation/<f>/<F>ViewModel.kt` |
| `commonTest/.../presentation/home/HomeViewModelTest.kt` | `.../<f>/<F>ViewModelTest.kt` |
| `commonTest/.../testing/fakes/FakeItemRepository.kt` | `.../fakes/Fake<E>Repository.kt` |
| `desktopTest/.../presentation/home/HomeScreenTest.kt` | `.../<f>/<F>ScreenTest.kt` |
| `desktopTest/.../presentation/home/HomeGoldenTreeTest.kt` | `.../<f>/<F>GoldenTreeTest.kt` |
| `specs/home.spec.md` → default clause set (§6) | `specs/<f>.spec.md` |

NOT copied: `DetailScreen.kt` (the exemplar's detail route is home-specific; a new feature's
"tap → detail" is optional and out of MVP scope). `ItemDao.kt` (Room-gated; the new feature uses
the dependency-light `RepositoryImpl` pattern, no Room coupling — matches the exemplar's own
`ItemRepositoryImpl` comment).

**Injected at anchor markers (shared files — mechanical, NOT copied):** see §5.

## 5. Shared-file injection via anchor markers

Add `// cmp:anchor <name>` comments to three template shared files (part of this milestone). The
stamper inserts before each anchor. Injection is idempotent (skip if the feature's line already
present) and fails loudly if an anchor is missing.

**`di/AppModule.kt`** — three anchors + imports anchor:
```kotlin
// cmp:anchor di-imports
val repositoryModule = module {
    single<ItemRepository> { ItemRepositoryImpl() }
    // cmp:anchor di-repositories
}
val useCaseModule = module {
    factory { GetItemsUseCase(get()) }
    // cmp:anchor di-usecases
}
val viewModelModule = module {
    viewModelOf(::HomeViewModel)
    // cmp:anchor di-viewmodels
}
```
Injects: `single<<E>Repository> { <E>RepositoryImpl() }`, `factory { Get<E>sUseCase(get()) }`,
`viewModelOf(::<F>ViewModel)`, plus the three imports.

**`presentation/navigation/Screen.kt`** — route registry:
```kotlin
sealed class Screen(val route: String) {
    data object Shell : Screen(Routes.SHELL)
    data object Detail : Screen(Routes.DETAIL)
    // cmp:anchor screen-objects
}
object Routes {
    const val SHELL  = "shell"
    const val DETAIL = "detail/{itemId}"
    // cmp:anchor route-consts
    fun detail(itemId: String) = "detail/$itemId"
}
```
Injects a `data object <F> : Screen(Routes.<F_UPPER>)` and `const val <F_UPPER> = "<f>"`.

**`presentation/navigation/AppNavHost.kt`** — composable destination:
```kotlin
        composable(Screen.Detail.route, …) { … }
        // cmp:anchor nav-destinations
```
Injects a `composable(Screen.<F>.route) { <F>Screen(onItemClick = {}) }` block + the import.
(The screen is registered/reachable; wiring it into a tab or a specific caller is the human's
call — see §7.)

> The stamper reads the resolved package from the target project (parse `namespace` in
> `composeApp/build.gradle.kts`, or the `package` line of any source file) to build source paths
> and any fully-qualified references — it runs POST-scaffold, so `__PACKAGE__` is already the
> real package.

## 6. Default spec clause set (spec-first, then refine)

The stamper writes `specs/<f>.spec.md` with the home-shaped clause set (the reusable list-feature
pattern), ids `<F_UPPER>-01..06`, and tags the copied tests to match (the rename already retargets
the `// SPEC: HOME-0N` tags → `<F_UPPER>-0N` **only if** we also map `HOME`→`<F_UPPER>` in the tag
lines; add `HOME` (whole word) → `<F_UPPER>` and `HOME-0` → `<F_UPPER>-0` to the rename map for
`.spec.md` + test files). Default clauses:

- `<F_UPPER>-01` loading · `-02` success (items listed) · `-03` error · `-04` reload-after-failure
  · `-05` tap navigates · `-06` golden tree.

The SKILL step then has the AI **rewrite the clause prose** for the real feature (AI proposes,
human confirms) — ids stay, wording changes — before `verify`. specCoverage guarantees the tests
stay bound.

## 7. The skill flow (`template/.claude/skills/add-feature/SKILL.md`)

1. **Interview**: feature name → propose entity (singularized) → human confirms.
2. **Dry-run**: `node qa/scaffold-feature.mjs <F> --entity <E> --dry-run` → show the file plan +
   injection diffs → confirm.
3. **Stamp**: run for real.
4. **Refine spec**: AI rewrites `specs/<f>.spec.md` clause prose for the real behavior (ids
   fixed); human confirms. Customize the entity fields in `<E>.kt` + the `<E>RepositoryImpl`
   sample data if the feature isn't list-of-{title,subtitle}-shaped (update the screen + tests to
   match — the gate will tell you what you missed).
5. **Capture golden**: `UPDATE_GOLDEN=1 ./gradlew :composeApp:desktopTest --tests "*<F>GoldenTree*"`
   → commit `qa/golden/<f>.json`.
6. **Gate**: `node qa/verify.mjs` → must PASS (specCoverage now sees `<F_UPPER>-01..06` bound).
   Not done until PASS + receipt committed (the generated CLAUDE.md contract).

Must respect the toggles the project was stamped with, and must work with NO plugin installed
(script + SKILL.md both ship in the template).

## 8. Gate = C5 rehearsal

In a freshly scaffolded app, a plain Claude Code session (no plugin) runs `add-feature Favorites`
→ conforming feature (passes ARCH-01..05, SHELL-03/04), green tests every layer, `specCoverage`
binds `FAVORITES-01..06`, lane PASS. This is the M3 acceptance test and a direct rehearsal of the
canonical scenario (HARNESS-ROADMAP §1, C5).

## 9. Delivered vs deferred

- **Delivered (M3):** `qa/scaffold-feature.mjs` + anchors in the three shared files +
  `add-feature/SKILL.md`, C5 proven clean-room (`add-feature Favorites` → lane PASS, 6 clauses
  bound).
- **Delivered (M3 subsets, `--preset`):** `add-screen` and `add-repository` as filter presets on
  the *same* stamper (one mechanism, three front-doors; `feature` = `repository` + `screen` +
  spanning nav):
  - `--preset repository <Entity>` — the 5 data/domain files + repo/usecase DI only. **Zero
    clauses, zero SPEC tags** (a bare repository has no behavior to specify) → cannot orphan
    specCoverage in either direction. Gate: `add-repository Tag` → lane PASS, clause/tag count
    unchanged (0-delta).
  - `--preset screen <Feature> --entity <E>` — presentation + tests + spec only; viewModel DI +
    nav; binds `<F>-01..06`. **Validates the entity's data layer exists before writing** (die
    early, no half-stamp). Gate: `add-repository Tag` then `add-screen Tags --entity Tag` → lane
    PASS, +6 clauses/+6 tags bound; missing-entity → exit 1, clean tree.
  - Ships as `add-screen/SKILL.md` + `add-repository/SKILL.md` (thin preset drivers).
- **Deferred:** `--tab` promotion (edit `appTabs()` signature + AppShell wiring); "tap → detail"
  route for generated features; standalone use-case/repository unit test (the exemplar covers the
  use case via the VM test + fake, so the subset mirrors that rather than diverging).

> Env note: under this sandbox's Node 24.7.0 the stamper occasionally exits 139 (segfault) *after*
> `process.exit(0)` has already run and printed — pre-existing/environmental (the unmodified
> script does it too, nondeterministically), not a code defect. File-state is the source of
> truth; the skills gate on the verify lane, not on the stamper's exit code.

[ADR-0001]: ./adr/0001-the-contract-lives-in-the-generated-project.md
[ADR-0004]: ./adr/0004-conformance-gates-without-konsist.md
