# The component vocabulary — a deep dive

**Status:** proposal (no code changed), revised after adversarial review and re-based on
the working tree **after the EH-1 typed-error wave landed** (sealed `HomeUiState`, `AppResult`
boundary, ARCH-06..08 — all file:line anchors below are against that tree). Companion to
`GENESIS-FLOW-DESIGN.md` (whose §1 makes `presentation/components/*.kt` governed artifact 3 —
"the registry is law") and `VERIFICATION-LAYER-DESIGN.md` §7.2 (the console's Components
section that renders it).

**The question:** the governed components registry currently contains exactly two files —
`BaseScreen.kt` (the insets moat) and `TestTagAutomation.kt` (an expect fun, not even a
composable). Genesis conversation 3 promises the user "the component vocabulary *this* app
will speak in"; today that conversation would show one card. Meanwhile every screen in the
template hand-rolls its header, its loading state, its error state, and its list rows.
This document proposes the vocabulary, its exact APIs, and how it lands without breaking
the harness's own gates.

**The starting thesis (user's):** beyond BaseScreen, the vocabulary should include the
bottom tab bar as a component; a `ListBase` container with pre-handled loading/shimmer,
error, and empty states; reusable list item(s); a reusable header — leaving screens very
dumb: bind state, compose components, done.

**Verdict on the thesis:** accepted in substance, amended in one structural place — the
state container should be a general `ContentStateContainer`, not a list-specific
`ListBase` (§3 argues why). One thesis item is scoped down (the header is a lightweight
app header, not a Material TopAppBar), and the inventory grows by three components the
thesis missed but the template measurably hand-rolls (§4.7–§4.9).

---

## 1. The measured pain — what screens hand-roll today

All numbers from the template at `template/composeApp/src/commonMain/kotlin/com/example/app/`.

| File | Lines | Hand-rolled today (with lines) |
|---|---|---|
| `presentation/home/HomeScreen.kt` | 107 | page column + padding (35–43), title header (44–48), loading spinner (52–55), error box (57–64), empty box (66–73), LazyColumn + card list item — Surface + shape + elevation + two Texts (75–104), two `designToken` blocks (38–41, 83–91) |
| `presentation/home/DetailScreen.kt` | 54 | page column + padding (25–32), back button **with a hand-applied 48 dp `sizeIn` a11y fix** (34–41), title header (42–46), one `designToken` block (28–31) |
| `presentation/profile/ProfileScreen.kt` | 43 | page column + padding (21–28), title header (32–36), one `designToken` block (24–27) |
| `navigation/AppShell.kt` | 150 | the entire bottom nav as **private** composables — `AppBottomNav` (68–115), `NavItem` (121–150), `navItemTag` (117–119) — a real, well-built component trapped inside the shell file |

Concrete duplication and defects this creates:

1. **The header pattern is written three times** — `HomeScreen.kt:44-48`
   (`home_title`), `DetailScreen.kt:42-46` (`detail_title`), `ProfileScreen.kt:32-36`
   (`profile_title`): same `Text(style = headlineMedium, modifier = semantics{testTag})`
   shape, three hand-copies.
2. **The page-column pattern is written three times** (`HomeScreen.kt:35-43`,
   `DetailScreen.kt:25-32`, `ProfileScreen.kt:21-28`): `Column(Modifier.fillMaxSize()
   .designToken(...).padding(Tokens.PaddingPage))` — and none of the three screens tags its
   *root*, despite `template/CLAUDE.md`'s Architecture section promising "Every screen: a
   `*Screen` composable with a `testTag`ged root". The contract over-promises what the code
   does.
3. **`designToken` self-reporting is hand-duplicated with literal resolved values**
   (`"padding" to "16dp"` at `HomeScreen.kt:40`, `DetailScreen.kt:30`,
   `ProfileScreen.kt:26`; `"radius"/"elevation"/"padding"` at `HomeScreen.kt:85-89`;
   `"height" to "72dp"` at `AppShell.kt:91`). If a genesis design-language pass changes
   `Tokens.PaddingPage` to 20 dp, every screen's *declared* resolved value silently lies
   at "16dp" until each call site is hand-fixed — the exact drift the inspector exists to
   catch, seeded by the template itself.
4. **The state machine was a boolean grab-bag — CLOSED by the landed EH-1 wave.**
   Historical finding, kept for the record: the pre-EH-1 `HomeUiState(isLoading, items,
   errorMessage)` data class represented loaded-empty only *implicitly* (an empty `items`
   list rendered a blank `LazyColumn`, unmodeled and unspecced) and could represent
   loading-and-error simultaneously. EH-1 fixed the *state type*: `HomeUiState` is now
   sealed with explicit `Loading/Content/Empty/Error` arms (`HomeViewModel.kt:19-24`),
   `home_empty` renders (`HomeScreen.kt:66-73`), and **HOME-07** covers it
   (`specs/home.spec.md:20-21`, tested at `HomeScreenTest.kt:62`). What remains open —
   and is this proposal's job — is that the *rendering* of all four arms is still
   hand-rolled per screen (`HomeScreen.kt:52-105`) and will be photocopied into every
   stamped feature.
5. **There is no retry affordance — still open post-EH-1.** Spec clause **HOME-04**
   (`specs/home.spec.md:13-14`) says "the user triggers a reload" — but `HomeScreen`'s
   error branch (`HomeScreen.kt:57-64`) renders a `Text` and nothing else. The clause is
   satisfied only at the ViewModel-test tier; the rendered UI cannot actually deliver it.
6. **The a11y minimum is a per-call-site workaround.** `DetailScreen.kt:34-38` carries a
   comment explaining that M3 `TextButton`'s 40 dp default fails the harness's own
   `audit_a11y` (SHELL-04's audit tier), fixed inline with `sizeIn(48.dp)`. Every future
   button written by an agent will either re-discover this or fail the audit.
   `AppShell.kt:132-134` fixes the same thing a second way (`defaultMinSize`).
7. **A stamped feature clones all of this.** `qa/scaffold-feature.mjs:308` clones
   `HomeScreen.kt` verbatim (modulo whole-word renames), so every hand-rolled pattern
   above is photocopied into every future feature — the exemplar's flaws are the DNA's
   flaws.

The vocabulary below is justified line-item by line-item against this list; nothing is
proposed "because design systems have one".

---

## 2. Prior art this proposal stands on

Verified this session (fetched and read):

- **Jetpack Compose component API guidelines** ([androidx source of record](https://android.googlesource.com/platform/frameworks/support/+/androidx-main/compose/docs/compose-component-api-guidelines.md)):
  parameter order = required → `modifier: Modifier = Modifier` ("first optional
  parameter", applied once to the root-most layout) → optionals → trailing `@Composable`
  content; prefer plain slot lambdas over DSLs; hoist state — no `MutableState<T>`
  params; defaults namespaced in `ComponentDefaults` objects; avoid grab-bag boolean/color
  params in favor of dedicated state/`ComponentColors` types. Every signature in §4
  follows this ordering exactly.
- **WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA** ([w3.org understanding doc](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)):
  pointer targets ≥ 24×24 CSS px, with spacing/equivalent/inline exceptions. From recall
  (not re-verified): SC 2.5.5 (AAA) is 44×44, and Material's own guidance is 48×48 dp —
  which is the bar the template's `audit_a11y` and `DetailScreen`'s inline fix already
  target. The vocabulary bakes **48 dp** in as the component-owned floor, which clears AA
  with margin and matches the harness's existing audit tier.
- **Skeleton/shimmer practice** ([NN/g Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/),
  [Bill Chung's skeleton research](https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a),
  surveyed via search): skeletons for content-shaped loads (feeds/lists), spinners for
  short single-module operations; the skeleton must match the final layout's structure;
  left-to-right shimmer is perceived as faster than pulse; don't flash a loading state
  that resolves in under ~300 ms.
- **Now in Android's design-system layering** (module docs surveyed via
  [DeepWiki's NiA UI-layer page](https://deepwiki.com/android/nowinandroid/4-ui-layer) and
  the [nowinandroid repo](https://github.com/android/nowinandroid); component *names*
  below from recall, not re-fetched): a `core:designsystem` module of app-branded atoms
  (`NiaButton`, `NiaNavigationBar`, `NiaTab`, `NiaLoadingWheel`, …) that wrap and
  constrain Material 3, distinct from `core:ui` for feature-agnostic *composites* that
  know the data model (`NewsFeed`). Feature screens compose these and stay thin. NiA also
  models screen state as sealed `UiState` interfaces, not boolean flags.

Recalled with high confidence (not re-verified): Material 3's own component APIs are
slot-driven (`Scaffold(topBar/bottomBar/content)`, `ListItem(headlineContent/
supportingContent/leadingContent/trailingContent)`) — the template's `BaseScreen` already
mirrors this, and §4's components continue the same slot idiom. Accompanist's
`placeholder`/shimmer artifact is deprecated and was never multiplatform — the shimmer in
§4.6 is therefore hand-rolled on `InfiniteTransition` + a gradient brush, zero new
dependencies, consistent with the template's documented no-new-pins stance (see the
Konsist note in `ArchitectureConformanceTest.kt`).

One deliberate divergence from the Compose guidelines: they advise against module/company
prefixes for *library* components. NiA prefixes everything anyway (`Nia*`) because an
in-app design system needs to be unambiguous next to Material's own names in
autocomplete. The template already made this call — `AppShell`, `AppTab`, `AppNavHost` —
so the vocabulary keeps the **`App*` prefix for chrome** and uses **plain role names**
(`ContentStateContainer`, `ListItemCard`, `EmptyState`) where no Material name collides.

---

## 3. The core abstraction: `ContentStateContainer`, not `ListBase`

The thesis proposes "a ListBase container with pre-handled loading/shimmer, error and
empty states". The *states* belong in the vocabulary; binding them to *lists* does not.

- **The state machine is not list-shaped.** Loading/Error/Empty/Content is the lifecycle
  of any data-backed screen. `DetailScreen` will grow a repository fetch (it already takes
  an `itemId`); a stamped `screen`-preset feature may render a form or a chart. A
  `ListBase` leaves every non-list screen hand-rolling the exact states we just
  centralized — the current defect list (§1 items 4–5) would simply migrate.
- **The list is a slot concern, not a container concern.** What varies per screen is the
  *content* branch: LazyColumn here, a detail pane there. Slot-based APIs exist precisely
  for this (Compose guidelines: "single `content` slot overloads maximize flexibility").
  The container owns the state dispatch; the screen supplies content in its trailing
  lambda; a list *convenience* can sit on top without being the foundation.
- **The sealed-state half of this argument has already won — in the repo.** The EH-1
  wave landed exactly the state modeling this proposal would otherwise have had to argue
  for: `HomeUiState` is now a sealed `Loading/Content/Empty/Error` interface
  (`HomeViewModel.kt:19-24`, comment: "sealed so impossible states are unrepresentable"),
  matching NiA's UI-state practice and the Compose guidelines' preference for dedicated
  state types over boolean grab-bags. What EH-1 deliberately did *not* do is centralize
  the **rendering**: every feature still hand-folds its own `when` over its own sealed
  quadruple (`HomeScreen.kt:52-105`), and the stamper photocopies both the state type and
  the fold into every feature. `ContentUiState<T>` is therefore positioned as the
  **generalization of the landed pattern** — the same four arms, made generic once, so a
  shared container can own the three non-content arms' UI.

**Decision:** one shared sealed state type + one general container, plus a skeleton
default tuned for lists (because the exemplar is a list) — not a list-specific base
class. `ContentUiState<List<Item>>` replaces the per-feature `HomeUiState` (a mechanical
generalization: same arms, same fold, `toUserMessage()` mapping stays feature-side per
ARCH-07's copy-ownership rule). A feature whose state machine genuinely outgrows the
quadruple defines its own sealed type and skips the container — the registry is the
default, not a cage; that divergence is visible in review because the screen stops
calling `ContentStateContainer`.

```kotlin
// presentation/components/ContentUiState.kt
/** The four-way lifecycle of any data-backed screen. Sealed so a `when` is exhaustive —
 *  a screen cannot forget a state, and cannot render two at once. */
sealed interface ContentUiState<out T> {
    data object Loading : ContentUiState<Nothing>
    data class Error(val message: String) : ContentUiState<Nothing>
    data object Empty : ContentUiState<Nothing>
    data class Content<T>(val data: T) : ContentUiState<T>
}

/** ViewModel-side helper: the Empty/Content decision made once, not per screen. */
fun <E> List<E>.toContentState(): ContentUiState<List<E>> =
    if (isEmpty()) ContentUiState.Empty else ContentUiState.Content(this)
```

```kotlin
// presentation/components/ContentStateContainer.kt
@Composable
fun <T> ContentStateContainer(
    state: ContentUiState<T>,
    screenTag: String,                              // "home" → tags home_loading/home_error/home_retry/home_empty
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,                  // non-null → error state renders a retry button (HOME-04)
    loading: @Composable () -> Unit = { ContentStateDefaults.ListSkeleton(screenTag) },
    error: @Composable (message: String) -> Unit = { ErrorState(it, screenTag, onRetry) },
    empty: @Composable () -> Unit = { EmptyState(screenTag) },
    content: @Composable (data: T) -> Unit,
)

/** Namespaced defaults, per the Compose guidelines' ComponentDefaults pattern. */
object ContentStateDefaults {
    @Composable fun ListSkeleton(screenTag: String, rows: Int = 3) { /* ListItemSkeleton × rows */ }
    @Composable fun Spinner(screenTag: String) { /* centered CircularProgressIndicator, for non-content-shaped waits */ }
}
```

Why `screenTag: String` as a **required** parameter (a deviation worth defending): the
harness's tests, golden trees, Maestro flows, and `audit_a11y` all key on deterministic
testTags. Leaving tags to each caller is how the template ended up with a tagless Profile
body and untagged screen roots. The precedent is already in the codebase — `AppShell`'s
`navItemTag(label)` derives tags mechanically and documents that the engine's
`src/lib/tabs.mjs` `navSlug` must mirror it. Component-derived tags (`<screenTag>_loading`,
`<screenTag>_error`, …) keep the existing names exactly — `home_error` stays `home_error`,
`home_empty` stays `home_empty`, so **HOME-03's and HOME-07's tag-selecting tests survive
unchanged** — while making the convention unforgettable by construction. The golden
*trees* do not survive: wrapping content in components changes the rendered structure, so
`qa/golden/home.json` is regenerated once (`UPDATE_GOLDEN=1`, declared — budgeted in
Wave 1). Tag stability and tree stability are different promises; this proposal keeps the
first and prices the second.

---

## 4. The component inventory

Nine files in `presentation/components/` — up from the two the template ships, though
the governed glob can already hold a third: the engine writes
`components/PlaceholderScreen.kt` into any scaffold configured with custom tabs
(`src/lib/tabs.mjs:432-433`, `renderPlaceholderScreenKt`), so "the registry" and "what
the template ships" are not the same set today, and the console scan/genesis walk must
expect the engine-resident file alongside the vocabulary. One public component per file —
that is the unit the governed glob hashes, the console's Components section renders as a
card, and a genesis conversation can approve or reshape individually.

Conventions that apply to every entry below, stated once:

- **API shape:** Compose guidelines ordering (required → modifier → optional → trailing
  slot); no `MutableState` params; slots are plain `@Composable` lambdas.
- **Tokens:** every color from `MaterialTheme.colorScheme` / `__THEME_PREFIX__Colors`,
  every dimension from `__THEME_PREFIX__Tokens`. **No new tokens are required** — the
  vocabulary is expressible in the existing catalog, which matters for genesis ordering:
  tokens freeze in conversation 1, components are *built from* them in conversation 3.
  The one addition worth making: components stop hand-writing `designToken` resolved
  literals and pass `Tokens.PaddingPage.toString()`-derived values, so the self-report
  can never drift from the catalog (§1 item 3). The `designToken` call sites move from
  screens into components — declared once per component, correct everywhere it's used.
- **A11y contract:** every interactive component enforces its own 48 dp minimum target
  (clears WCAG 2.2 SC 2.5.8 AA's 24 px floor with Material margin); every state view is
  perceivable (tag + text) so `A11yConformanceTest`/SHELL-04 passes by construction.
- **What the audits see:** stable substructure under a component-owned tag. A change to a
  component's emitted tree drifts *every* consuming screen's golden — that is the
  "registry is law" invariant given runtime teeth: you cannot quietly reshape a shared
  component, the golden gate and the `components` artifact hash both name it.

### 4.1 `ScreenColumn.kt` — the page container

```kotlin
@Composable
fun ScreenColumn(
    screenTag: String,                       // tags the root: "<screenTag>_screen"
    modifier: Modifier = Modifier,
    scrollable: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
)
```

Absorbs the thrice-copied `Column(fillMaxSize().designToken(...).padding(PaddingPage))`
block and finally delivers CLAUDE.md's "testTagged root" promise (`home_screen`,
`detail_screen`, …). The `designToken` self-report for `PaddingPage` lives here, once.

### 4.2 `AppHeader.kt` — the screen header

```kotlin
@Composable
fun AppHeader(
    title: String,
    screenTag: String,                       // tags: "<screenTag>_title", "<screenTag>_back"
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,            // non-null → 48dp back affordance, left of title
    actions: @Composable RowScope.() -> Unit = {},   // trailing slot, M3-style
)
```

Replaces the three hand-copied headline `Text`s and DetailScreen's back-button-plus-fix.
Emitted tags reproduce today's names exactly (`home_title`, `detail_title`,
`detail_back`), so `HomeScreenTest`'s and Maestro's tag selectors survive (goldens
regenerate once, per §4's conventions).
Deliberately **not** an M3 `TopAppBar`: no scroll behaviors, no center-aligned variants,
no window-inset handling (BaseScreen owns insets — SHELL-03). It is a `Row` with a
headline and slots. If a real app needs collapsing toolbars, that is a registry
*addition* proposed through the governed flow, not a default.

### 4.3 `AppBottomBar.kt` — the tab bar, promoted (thesis: accepted)

The thesis is right for a reason beyond reuse: the bottom bar is **already** a mature
component — 48 dp targets, deterministic `nav_*` tags, token-bound colors, the
`BottomNavHeight` self-report — but as a `private` composable inside `AppShell.kt` it is
invisible to the governed glob, the console's component scan, and genesis conversation 3.
The user is asked to approve a component registry that hides one of its two real
components. Promotion is an extraction, not a redesign:

```kotlin
// presentation/components/AppBottomBar.kt   (from AppShell's private AppBottomNav + NavItem)
@Composable
fun AppBottomBar(
    tabs: List<AppTab>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
)
```

**`AppTab.kt` stays in `navigation/` — deliberately.** An earlier draft moved it into
`components/` for glob completeness; the engine kills that move: `AppTab.kt` is not
hand-written vocabulary but **engine-generated per-app configuration** — the create-cmp
engine writes it from the user's tab choices at a hardcoded path
(`src/lib/tabs.mjs:428-429` `APPTAB_REL = ".../presentation/navigation/AppTab.kt"`), and
`renderAppTabsKt` emits `package __PACKAGE__.presentation.navigation`
(`src/lib/tabs.mjs:126`), with the preview-registry renderer and the engine's tab-surface
tests pinned to the same location. Moving the file means four coordinated engine edits to
relocate *configuration* into a glob that governs *vocabulary* — hashing engine output
under the components artifact would make every scaffold-time tab choice look like a
component change. Wrong on cost and wrong on category. The bar takes `List<AppTab>`
across the package boundary (one import), exactly as `AppShell` does today
(`AppShell.kt:44`).

`navItemTag` does move with the extraction, and its sync-contract comment with the
engine's `navSlug` (`src/lib/tabs.mjs`) moves with it — that comment is load-bearing; the
extraction must keep tag output byte-identical or the generated `qa/e2e/smoke.yaml`
selectors break. `AppShell` shrinks to ~55 lines of pure composition (BaseScreen +
selected-tab state + `AppBottomBar`).

### 4.4 `ContentStateContainer.kt` + `ContentUiState.kt` — §3, the centerpiece.

### 4.5 `ListItemCard.kt` — the list row (thesis: accepted)

```kotlin
@Composable
fun ListItemCard(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,            // caller adds per-item testTag here — ids are domain data
    subtitle: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
)
```

Absorbs HomeScreen's `Surface(shape/elevation/designToken/clickable) { Column { Text;
Text } }` block (`HomeScreen.kt:77-103`) — the largest single hand-rolled chunk, 27
lines. Binds `RadiusCard`,
`ElevationCard`, `PaddingCard`; enforces `defaultMinSize(minHeight = 48.dp)`; the
`clickable` sits on the Surface so the whole row is the target (rows are full-width —
comfortably past SC 2.5.8). One card type is enough for the template; two-line +
leading/trailing slots cover the M3 `ListItem` anatomy without importing its API surface.
Item-level tags stay caller-side (`Modifier.testTag("home_item_$id")`) because ids are
data, not component structure.

### 4.6 `Shimmer.kt` — `Modifier.shimmer()` + `ListItemSkeleton`

```kotlin
fun Modifier.shimmer(): Modifier        // InfiniteTransition + linear-gradient brush sweep, L→R
@Composable
fun ListItemSkeleton(modifier: Modifier = Modifier)   // RadiusCard-shaped grey card, title+subtitle bars
```

Replaces `HomeScreen.kt:53-55` — a centered spinner shown while a *list* loads, which is
precisely the case the verified skeleton practice (§2: NN/g, Chung) assigns to skeletons,
not spinners. The skeleton mirrors `ListItemCard`'s real geometry (same tokens) so the
loaded layout doesn't jump; the sweep animates left-to-right (perceived-faster per the
cited research). Hand-rolled, zero dependencies (accompanist's
placeholder is deprecated and Android-only anyway — no desktop/iOS artifacts, so it was
never an option for this template's commonMain). Skeletons are decorative non-interactive
nodes — the loading *container* carries `<screenTag>_loading` and a "Loading"
`contentDescription`; the bars themselves stay semantics-silent so `audit_a11y` and
SHELL-04 (which govern *interactive* nodes) are untouched. The ~300 ms no-flash rule is
explicitly **not** built in v1 (it needs a delay policy and makes goldens time-dependent);
documented as deferred (§8).

### 4.7 `EmptyState.kt` — the empty-state view (thesis gap #1)

Not a standalone invention: it is the Empty arm of §3's four-state contract (the sealed
state practice EH-1 just landed, NiA's UI-state modeling). Post-EH-1 the empty *state* is
modeled and rendered — but as a hand-rolled `Box` + `Text` inside HomeScreen
(`HomeScreen.kt:66-73`) that the stamper will photocopy per feature. This component
extracts that landed UI, keeping its `<screenTag>_empty` tag (`home_empty` survives,
HOME-07's test with it) and adding the icon/action anatomy an empty state grows next.

```kotlin
@Composable
fun EmptyState(
    screenTag: String,                        // tag: "<screenTag>_empty"
    modifier: Modifier = Modifier,
    title: String = "Nothing here yet",
    body: String? = null,
    action: (@Composable () -> Unit)? = null, // e.g. AppTextButton("Add your first …")
)
```

Closes the residual half of §1 item 4 (the per-screen rendering). Default copy is
deliberately generic (the sketch's "Nothing here yet" mirrors the landed
`HomeScreen.kt:68` copy) — genesis conversation 3 is where
an app makes it theirs; a stamped feature's spec conversation fills `title`/`body` in the
feature's domain language.

### 4.8 `ErrorState.kt` — the error + retry view (thesis gap #2)

```kotlin
@Composable
fun ErrorState(
    message: String,
    screenTag: String,                        // tags: "<screenTag>_error", "<screenTag>_retry"
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
)
```

The Error arm of the same four-state contract. Fixes §1 item 5: HOME-04
(`specs/home.spec.md:13-14`) finally has a rendered affordance (`home_retry`, 48 dp per
SC 2.5.8's floor and the audit's 48 dp bar), testable at the screen tier and drivable by
Maestro, not just provable on the ViewModel.

### 4.9 `AppButton.kt` — two buttons, no more (thesis gap #3)

```kotlin
@Composable
fun AppPrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true)
@Composable
fun AppTextButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true)
```

Justified solely by §1 item 6: M3 buttons fail the harness's own 48 dp audit by default,
and the fix currently lives as a copy-me comment in DetailScreen. These wrap M3, apply
`sizeIn(minWidth = 48.dp, minHeight = 48.dp)` once, and bind label styling to the theme.
A full button system (icons, loading buttons, destructive variants, FABs) is *not*
proposed — no measured pain, and every speculative variant is future registry churn the
human must re-approve. This is where the line against gold-plating is drawn.

**Not in the inventory, deliberately:** pull-to-refresh (no refresh affordance exists or
is specced today; retry covers HOME-04), snackbars/dialogs/sheets, text inputs, and
pagination — all deferred (§8) until a spec clause or stamped feature actually needs them.

---

## 5. The dumb screen — HomeScreen before and after

Before: 107 lines (the current post-EH-1 working-tree file, four-arm `when` fold
included), of which ~80 are presentation mechanics. After, in full:

```kotlin
package __PACKAGE__.presentation.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import __PACKAGE__.presentation.components.AppHeader
import __PACKAGE__.presentation.components.ContentStateContainer
import __PACKAGE__.presentation.components.ListItemCard
import __PACKAGE__.presentation.components.ScreenColumn
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens
import org.koin.compose.viewmodel.koinViewModel

@Composable
fun HomeScreen(
    onItemClick: (String) -> Unit,
    viewModel: HomeViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ScreenColumn(screenTag = "home") {
        AppHeader(title = "Home", screenTag = "home")
        ContentStateContainer(state = state, screenTag = "home", onRetry = viewModel::load) { items ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(__THEME_PREFIX__Tokens.GapCard)) {
                items(items, key = { it.id }) { item ->
                    ListItemCard(
                        title = item.title,
                        subtitle = item.subtitle,
                        onClick = { onItemClick(item.id) },
                        modifier = Modifier.semantics { testTag = "home_item_${item.id}" },
                    )
                }
            }
        }
    }
}
```

**41 lines (107 → 41, −62%), 15 of them imports.** The judgment that remains in a screen —
and this is the design goal, not just the byproduct — is exactly the four things only this
feature knows: its copy ("Home"), its state binding (`viewModel.state`, `viewModel::load`),
its content shape (a spaced LazyColumn of cards), and its navigation intent
(`onItemClick(item.id)`). Everything an agent could get *wrong the same way twice* —
insets, states, tags, tokens, touch targets — now has exactly one implementation.
`ProfileScreen` drops to ~20 lines; `DetailScreen` to ~28; and gains: loading/error/empty
render on every future screen for free, in the app's approved visual language.

`HomeViewModel` changes shape but barely size (65 lines today): the sealed per-feature
`HomeUiState` (`HomeViewModel.kt:19-24`) is replaced by the shared
`StateFlow<ContentUiState<List<Item>>>`; `load()`'s fold (`HomeViewModel.kt:46-51`) keeps
its exact EH-1 form — `when` over `AppResult`, `Success → toContentState()`,
`Failure → Error(error.toUserMessage())` — with **no `try`/`catch`/`runCatching`
anywhere**, preserving ARCH-07 by construction, and `toUserMessage()`
(`HomeViewModel.kt:61-65`) stays feature-side because presentation owns user-facing copy.
Tests change mechanically (`HomeUiState.Loading` → `ContentUiState.Loading`).

---

## 6. Integration with the harness

### 6.1 The governed `components` artifact

No registry change needed — `GENESIS-FLOW-DESIGN.md` §1 already defines artifact 3 as the
dynamic sorted glob of `presentation/components/*.kt`. Nine files land in the glob; the
artifact's hash changes; on the template's own showcase that means one re-approval, and on
*generated* projects nothing changes until they regenerate. From then on the invariant
does real work: an agent adding a tenth component or editing `ListItemCard` flips the
artifact to `changed-since-approval`, the verify lane FAILs naming it, and a human either
re-approves (registry evolution) or reverts (drift). Genesis conversation 3 stops being
theoretical: the console renders nine cards with real signatures and used-in lists, and
"shape each in place" has actual material.

### 6.2 The stamper and the exemplar (measured impact)

The 11-file canonical shape (`ALL_FILES` in `qa/scaffold-feature.mjs`) is **unchanged in
count and in paths** — components are shared vocabulary, not per-feature files, so they
are never cloned. What changes is the *content* the stamper photocopies:

| Cloned file | Change |
|---|---|
| `HomeScreen.kt` | rewritten as §5 — stamped screens are born consuming the vocabulary |
| `HomeViewModel.kt` | the sealed `HomeUiState` generalizes to `ContentUiState<List<Item>>`; the EH-1 `AppResult` fold and `toUserMessage()` stay as-is |
| `HomeViewModelTest.kt` / `HomeScreenTest.kt` | assertions retarget the shared sealed type; empty coverage already exists (HOME-07, `HomeScreenTest.kt:62`); **+1 test** for the retry affordance |
| `specs/home.spec.md` | HOME-04 gains the `home_retry` tag reference (HOME-07 already landed with EH-1, `specs/home.spec.md:20-21`) |
| other 6 files | untouched |

The whole-word rename pattern (`Home→<F>`, `Item→<E>`) passes through the new code
unharmed — `ContentUiState<List<Item>>` renames cleanly, `screenTag = "home"` renames via
the existing lowercase pattern (and the now-orphaned `${SOURCE_F}UiState` entry at
`scaffold-feature.mjs:256` matches nothing, which is harmless — remove it in passing).

The clone mechanics themselves need three named edits — the stamper is anchored to the
exemplar's current *shape*, and this proposal changes that shape:

1. **`wrapScreenInBaseScreen`'s root matcher.** The injection locates the screen body's
   root by the literal line `"    Column("` (`qa/scaffold-feature.mjs:419`) and `die`s
   with a "exemplar drifted from the shape this stamper wraps" error otherwise. The §5
   rewrite makes the root `    ScreenColumn(` — the matcher must be updated in the same
   change that lands the rewrite, or every subsequent `--preset feature/screen` stamp
   fails at the wrap step.
2. **`RENAME_MAP` gains the new tag families.** The map already renames `home_title` /
   `home_error` / `home_empty` per feature (`qa/scaffold-feature.mjs:258-260`); the
   vocabulary adds `home_loading` and `home_retry` (emitted by components but referenced
   as string literals in the cloned tests/golden assertions), and compound tags aren't
   reachable by the bare `\bhome\b` fallback — two new entries, same pattern.
3. **`defaultSpec()` is generated, not cloned.** The feature spec the stamper writes is a
   template string (`qa/scaffold-feature.mjs:366`), not a copy of `specs/home.spec.md` —
   EH-1 already updated its clause text once (typed `DomainError` copy in the generated
   -03, a generated -07). The vocabulary's spec-visible changes (the `_retry` tag in -04)
   must be edited there too, or stamped specs drift from stamped code.

Net effect: **every stamped feature now ships loading/empty/error/retry behavior, specced
and tested, for the same 11 files** — the stamper's value proposition grows at the cost
of three localized, testable stamper edits (pinned by the existing
`test/stamper-clone-source.test.mjs` plus one new wrap-shape case).

### 6.3 Specs grammar

No grammar change. Component *contracts* become clauses in `specs/app-base.spec.md`
(governed under the architecture artifact — deliberately not a new spec file, which would
require a new registry id for marginal benefit):

- **COMP-01** — Given any screen with a data-backed state, When it renders, Then
  loading/error/empty are presented by `ContentStateContainer` with tags
  `<screen>_loading` / `<screen>_error` / `<screen>_empty`.
- **COMP-02** — Given a recoverable load failure and a retry handler, When the error state
  renders, Then a `<screen>_retry` control of at least 48 dp is present.
- **COMP-03** — Given any interactive registry component, When it renders, Then its
  pointer target is at least 48×48 dp.

Feature clauses (HOME-01…07) keep citing *feature* behavior; they get thinner over time
because state mechanics are covered once by COMP clauses. The `specCoverage` step needs
COMP tests carrying `// SPEC: COMP-NN` tags — a components conformance/UI test file in
`desktopTest`, same pattern as `A11yConformanceTest`.

### 6.4 Verify-lane gates worth adding — and the one interplay to fix

**Add ARCH-11** ("screens must not hand-roll a loading state"). The id matters: an
earlier draft of this proposal claimed ARCH-06, but the landed EH-1 wave took ARCH-06,
ARCH-07, and ARCH-08 for the typed-error clauses (`specs/app-base.spec.md:24-34`,
enforced at `ArchitectureConformanceTest.kt:155-224`) — ids are never reused
(`specs/README.md`'s stable-id rule). The companion architecture-document-standard
proposal allocates the next two free ids (ARCH-09 data-import ban, ARCH-10 core import
discipline — its Appendix A), so this proposal's gate takes ARCH-11. Whichever proposal
lands first, the allocation holds: 09/10 are the architecture proposal's, 11 is this one's.
Enforced in `ArchitectureConformanceTest` in the template's established dependency-free
source-scanning style — Konsist stays rejected for the documented reason
(`ArchitectureConformanceTest.kt:12-14`: a kotlin-compiler pin to track; "swap in Konsist
if you want richer queries — keep the clause ids"), and this rule doesn't need it:

```
ARCH-11 — Given any file in a presentation feature package (components/ excluded),
When its source is inspected, Then it references neither CircularProgressIndicator nor
LinearProgressIndicator directly (loading is presented through the components registry).
```

That is a two-filter scan, same shape as ARCH-05. It is deliberately *narrow*: banning
hand-rolled error/empty layouts by scan would be heuristic guesswork (any Column with a
Text is a potential "error state"), and this codebase's gates are honest or absent. The
broad "no one-off components outside the registry" gate stays deferred exactly as
`GENESIS-FLOW-DESIGN.md` §5 already records.

**Fix the ARCH-04 interplay (this is the one place the proposal touches an existing
gate):** ARCH-04 requires every feature composable file to contain the literal `testTag`.
A minimal stamped screen that gets all its tags via `screenTag =` parameters would fail
ARCH-04 despite being *more* automation-reachable than today. Amend the clause and scan:
a feature composable file passes if it declares a `testTag` **or** passes a `screenTag`
argument to a registry component. Clause text updates in `app-base.spec.md` (invalidating
the architecture artifact's approval — correctly: the contract changed and a human should
sign it), clause id stays ARCH-04 per the never-renumber rule.

### 6.5 Golden trees and the a11y audit

Goldens for `home` regenerate once (`UPDATE_GOLDEN=1`, declared) — the tree gains
`home_screen`/`home_item_*` tags and the card substructure moves under `ListItemCard`.
Wave 2 registers the state variants in the preview registry (`"home@loading"`,
`"home@empty"`, `"home@error"` — the forced-state mechanism already exists in
`inspector/PreviewRegistry.kt`, documented in `template/CLAUDE.md`'s preview section),
giving the console's genesis workbench the states as first-class screens to react to and
each a golden of its own. One engine caveat: `PreviewRegistry.kt` is **engine-written**
when tabs are configured (`renderPreviewRegistryKt`, `src/lib/tabs.mjs:349`, target path
at `:434-435`) — the variant entries must be added to that renderer, not only to the
template file, or a custom-tab scaffold regenerates the registry without them. `audit_a11y` results *improve* by construction: every
interactive node in the vocabulary carries a tag and ≥48 dp.

### 6.6 The console (VL §7.2)

Zero console work required for the core: `inspector/mcp/src/lib/components.mjs` already
scans `presentation/components/*.kt` for `@Composable fun` signatures with paren-depth
parsing and greps call sites across `presentation/**`. Nine cards render instead of one,
and the **used-in list becomes an adoption metric** — `ContentStateContainer` used-in
every screen is the visible proof the vocabulary took. The proposed signatures are
scanner-friendly (balanced parens, conventional defaults — `components.mjs`'s paren-depth
parser handles `= Modifier` and lambda defaults; anything it can't bound it reports with
`parseError:true`, and nothing in §4 comes near that).

### 6.7 Enforcement map — where every rule lands

Per the harness's own stance (gates are honest or absent), each rule this proposal
introduces is either machine-enforced by a named gate or explicitly a human-judgment
item. There is no third category.

| Rule | Enforced by |
|---|---|
| Registry membership & change control (9 files) | `approvals` gate — `components` artifact glob hash → `changed-since-approval` FAIL |
| Screens don't hand-roll loading indicators | **new ARCH-11** scan, `conformance` step |
| Every feature UI file automation-reachable | **amended ARCH-04** scan (`testTag` literal *or* `screenTag =` to a registry component) |
| 48 dp targets on all interactive components | `a11y` step (`A11yConformanceTest`, SHELL-04) + `audit_a11y` runtime tier + **COMP-03** UI test |
| State tags `<screen>_loading/_error/_empty/_retry` present | **COMP-01/COMP-02** spec clauses + citing UI tests; `specCoverage` fails orphans |
| Component substructure stability | `goldenTrees` step — any component reshape drifts every consumer's golden |
| Token binding inside components (no color literals) | existing ARCH-05 (`ArchitectureConformanceTest.kt:138-153`) — already covers `components/` |
| Typed failures reach screens as `DomainError` kinds, never raw messages | existing ARCH-06..08 (landed with EH-1, `ArchitectureConformanceTest.kt:155-224`) — the container renders what the fold produces; no new gate needed |
| `designToken` resolved values match the catalog | `tokenDrift` live tier + `assert_token`/`find_drift` inspector tools — now one call site per component instead of per screen |
| navItemTag ↔ engine `navSlug` sync after extraction | existing engine test + W1's E2E smoke gate |
| Vocabulary fit for a given app (copy, shape, additions) | **human judgment** — genesis conversation 3 approval; reopen-for-redesign thereafter |
| EmptyState/ErrorState default copy | **human judgment** — spec conversation per feature; generic defaults are the recorded fallback |

---

## 7. Migration plan — three waves, template first

| Wave | Scope | Gate |
|---|---|---|
| **W1 — vocabulary** | Add the 7 new component files; extract `AppBottomBar` (`AppTab` stays in `navigation/` per §4.3, `navItemTag` output byte-identical); rewrite Home/Detail/Profile/AppShell as consumers; generalize the landed sealed `HomeUiState` → `ContentUiState`; update unit/screen tests (+ the retry test); HOME-04 `_retry` amendment + COMP-01..03 clauses + citing tests; regenerate goldens (declared); re-approve `components` + `architecture` + `exemplar-*` on the showcase | full `node qa/verify.mjs` PASS; showcase E2E smoke green (nav tags unchanged); `audit_a11y` clean |
| **W2 — stamper + skills** | The three stamper edits from §6.2 (root matcher `"    ScreenColumn("`, `RENAME_MAP` `_loading`/`_retry`, `defaultSpec()` clause text), proven by stamping a feature from the rewritten exemplar (build + test green); sweep `add-feature`/`add-screen` SKILL.md and `template/CLAUDE.md` ("compose the registry vocabulary; propose registry additions explicitly"); `@loading/@empty/@error` variants in the template `PreviewRegistry.kt` **and** the engine's `renderPreviewRegistryKt` | engine `node --test` green incl. `stamper-clone-source` + new wrap-shape case; stamped-feature build green |
| **W3 — gates + genesis wiring** | ARCH-11 scan + ARCH-04 amendment in `ArchitectureConformanceTest` (+ clause text); cmp-new genesis conversation-3 script gains real material (propose/reshape the nine, per-component) | verify lane green with new gates; console shows 9 components with used-in lists on the showcase |

W1 must not be split: a half-migrated template (vocabulary exists, exemplar doesn't use
it) is worse than either endpoint — the stamper would photocopy the old pattern while the
registry advertises the new one.

### Cost / risk table (honest)

| Risk | Severity | Mitigation |
|---|---|---|
| Golden churn: every future component edit drifts all consuming screens' goldens | Medium, **by design** | This is the enforcement working. Cost is `UPDATE_GOLDEN=1` + re-approval per intentional registry change; document in CLAUDE.md so agents expect it |
| `navItemTag`/`navSlug` divergence during the AppBottomBar extraction breaks generated Maestro selectors | High if hit | Extraction moves code verbatim; W1 gate includes the E2E smoke; the sync comment moves with the function. (The larger engine risk — relocating `AppTab.kt` — is eliminated by §4.3's decision to keep it in `navigation/`) |
| Stamper `die`s on the new screen shape (root matcher pinned to `"    Column("`, `scaffold-feature.mjs:419`) | Certain if unedited | §6.2 edit 1 lands in the same change as the screen rewrite; new wrap-shape test case gates W2 |
| Template `PreviewRegistry.kt` variants stomped on custom-tab scaffolds (engine regenerates the file) | Medium | §6.5: variants added to `renderPreviewRegistryKt` in the engine, not only the template file |
| `ContentUiState` migration breaks ViewModel/screen tests in generated *older* projects that later copy new skills | Low | Vocabulary ships only in newly generated projects; nothing retrofits existing apps |
| ARCH-04 amendment weakens the tag gate if the `screenTag =` acceptance is sloppily scanned | Medium | Scan requires `screenTag\s*=` in a call argument position AND the file to import from `presentation.components`; covered by a negative-case conformance test |
| Sealed-generic (`ContentUiState<List<Item>>`) trips the stamper's whole-word rename in an exotic feature name | Low | Same rename surface as today's `List<Item>`; `stamper-clone-source` test pins it |
| Skeleton animation makes previews/goldens non-deterministic | Medium | Golden trees assert structure, not pixels — the shimmer is a draw-layer brush, invisible to the semantics tree; `@loading` variant renders frame-independently |
| Vocabulary over-fits the seed app; real genesis apps reshape heavily | Expected, priced in | That is what conversation 3 and reopen-for-redesign are *for*; components are small and slot-based precisely so reshaping is cheap |

---

## 8. Explicitly deferred

- **Pull-to-refresh, snackbars/dialogs/sheets, text inputs, pagination, FAB** — no
  measured pain, no citing spec clause yet; each enters as a governed registry addition
  when a feature needs it.
- **The ~300 ms no-flash loading delay** — needs a policy decision and time-dependent
  behavior in tests; revisit with real app telemetry.
- **"No one-off components outside the registry" conformance gate** — stays deferred per
  `GENESIS-FLOW-DESIGN.md` §5.
- **Isolated per-component preview rendering in the console** — stays deferred per
  `VERIFICATION-LAYER-DESIGN.md` §7.2; the screen-level previews + used-in lists carry
  genesis conversation 3 for now.
- **Dark theme / dynamic color variants of components** — blocked on the design-system
  artifact growing a dark scheme first (tokens before components, always).
- **Konsist adoption** — re-evaluate only if a proposed gate exceeds what honest source
  scanning can express; ARCH-11 does not.

---

## Appendix: thesis scorecard

| Thesis item | Verdict |
|---|---|
| Bottom tab bar as a component | **Accepted** — extraction of the existing private `AppBottomNav`; governance visibility is the main win (§4.3) |
| `ListBase` with pre-handled loading/shimmer/error/empty | **Amended** — states yes, list-binding no: general `ContentStateContainer` + sealed `ContentUiState`, list skeleton as the default loading slot (§3) |
| Reusable list item(s) | **Accepted**, singular — one `ListItemCard` with slots; a second variant is future registry churn without measured need (§4.5) |
| Reusable header | **Accepted, scoped down** — lightweight `AppHeader`, not M3 TopAppBar (§4.2) |
| "Screens very dumb: bind state, compose components, done" | **Accepted and measured** — 107 → 41 lines against the post-EH-1 tree; remaining judgment = copy, binding, content shape, navigation (§5) |
| (unstated by thesis) | **Added:** `ScreenColumn`, `EmptyState`, `ErrorState` + retry, `AppButton` pair, `Modifier.shimmer()` — each traced to a named defect in §1 |
