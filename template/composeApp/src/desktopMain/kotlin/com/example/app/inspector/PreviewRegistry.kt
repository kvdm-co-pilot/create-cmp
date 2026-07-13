package __PACKAGE__.inspector

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import __PACKAGE__.presentation.components.BaseScreen
import __PACKAGE__.presentation.home.DetailScreen
import __PACKAGE__.presentation.home.HomeScreen
import __PACKAGE__.presentation.navigation.AppShell
import __PACKAGE__.presentation.navigation.appTabs
import __PACKAGE__.presentation.profile.ProfileScreen

/**
 * One previewable screen: a stable [id] (the `-Pscreen=` selector and output directory
 * name), a human [title] for the gallery, and the composable [content] exactly as the
 * app hosts it.
 *
 * The `@Preview` analog for the create-cmp inspector: the registry makes "render screen
 * X" a closed, enumerable operation. The scaffolder regenerates the tab entries from the
 * configured `tabs`; when you add a screen by hand, add it here — the renderScreens
 * harness, the gallery, and golden baselines pick it up by id.
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
