package __PACKAGE__.inspector

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import __PACKAGE__.domain.model.DomainError
import __PACKAGE__.domain.model.Item
import __PACKAGE__.domain.repository.ItemRepository
import __PACKAGE__.domain.result.AppResult
import __PACKAGE__.domain.usecase.GetItemsUseCase
import __PACKAGE__.presentation.components.BaseScreen
import __PACKAGE__.presentation.home.DetailScreen
import __PACKAGE__.presentation.home.HomeScreen
import __PACKAGE__.presentation.home.HomeViewModel
import __PACKAGE__.presentation.navigation.AppShell
import __PACKAGE__.presentation.navigation.appTabs
import __PACKAGE__.presentation.profile.ProfileScreen
import kotlinx.coroutines.awaitCancellation

/**
 * One previewable screen: a stable [id] (the `-Pscreen=` selector and output directory
 * name), a human [title] for the gallery, and the composable [content] exactly as the
 * app hosts it.
 *
 * The `@Preview` analog for the create-cmp inspector: the registry makes "render screen
 * X" a closed, enumerable operation. The scaffolder regenerates the tab entries from the
 * configured `tabs`, and the feature stamper (`qa/scaffold-feature.mjs`, via the
 * `add-feature`/`add-screen` skills) auto-appends a stamped screen at the
 * `// cmp:anchor preview-registry` marker below; when you add a screen by hand, add it
 * there too — the renderScreens harness, the gallery, and golden baselines pick it up by id.
 *
 * State variants (the Storybook "story" analog): a screen in a specific UI state is just
 * another entry with a derived id — e.g. `ScreenPreview("home@empty", "Home — empty")`
 * hosting the screen with that state forced (a state-first overload of the screen, or
 * preview-only fakes behind its usual parameters). Every entry renders the same way
 * (gallery card, `-Pscreen=` selector, golden baseline), so loading/empty/error states
 * sit side by side with the default seeded state.
 */
data class ScreenPreview(
    val id: String,
    val title: String,
    val content: @Composable () -> Unit,
)

/** Every registered screen, in gallery order. Ids must be unique and filesystem-safe. */
fun previewRegistry(): List<ScreenPreview> = listOf(
    ScreenPreview("shell", "App shell — bottom nav (first tab selected)") {
        AppShell(
            tabs = appTabs(
                home = { HomeScreen(onItemClick = {}) },
                profile = { ProfileScreen() },
            ),
        )
    },
    ScreenPreview("home", "Home tab") { TabHost { HomeScreen(onItemClick = {}) } },
    ScreenPreview("profile", "Profile tab") { TabHost { ProfileScreen() } },
    ScreenPreview("detail", "Detail (nav destination)") { DetailScreen(itemId = "1", onBack = {}) },
    // State variants (§6.5, component-system-deep-dive.md): the same ContentUiState arms
    // ContentStateContainer dispatches on, forced via a preview-only repository — the
    // console's genesis workbench and the golden baselines get loading/empty/error as
    // first-class screens beside the default seeded "home" entry.
    ScreenPreview("home@loading", "Home — loading") {
        TabHost { HomeScreen(onItemClick = {}, viewModel = previewHomeViewModel { awaitCancellation() }) }
    },
    ScreenPreview("home@empty", "Home — empty") {
        TabHost { HomeScreen(onItemClick = {}, viewModel = previewHomeViewModel { AppResult.Success(emptyList()) }) }
    },
    ScreenPreview("home@error", "Home — error") {
        TabHost { HomeScreen(onItemClick = {}, viewModel = previewHomeViewModel { AppResult.Failure(DomainError.Network) }) }
    },
    // cmp:anchor preview-registry
)

/**
 * Hosts a single tab's content the way [AppShell] does — inside [BaseScreen] — minus the
 * bottom bar, so a tab previews with the same insets/background it gets in the shell.
 */
@Composable
private fun TabHost(content: @Composable () -> Unit) {
    BaseScreen {
        Box(Modifier.fillMaxSize()) { content() }
    }
}

/**
 * Forces one `ContentUiState` arm on a real [HomeViewModel] for the state-variant previews
 * above. `desktopMain` cannot depend on `commonTest`'s `FakeItemRepository` (test sources
 * never leak into main), so this is a minimal, self-contained equivalent — the real
 * ViewModel and screen render unmodified, only the repository result is forced.
 */
private fun previewHomeViewModel(result: suspend () -> AppResult<List<Item>>): HomeViewModel =
    HomeViewModel(GetItemsUseCase(object : ItemRepository {
        override suspend fun getItems(): AppResult<List<Item>> = result()
    }))
