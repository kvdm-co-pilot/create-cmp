package __PACKAGE__.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
// Nav 2.9 (multiplatform): backStackEntry.arguments is a SavedState, not an Android Bundle.
// Read it via the androidx.savedstate.read extension, NOT Bundle.getString().
import androidx.savedstate.read
import __PACKAGE__.presentation.home.HomeScreen
import __PACKAGE__.presentation.profile.ProfileScreen

@Composable
fun AppNavHost() {
    val navController = rememberNavController()

    // Report every back-stack change to the common inspection seam — a no-op unless the
    // androidDebug inspector registered a listener (see NavInspectionHook.kt). Best-effort:
    // `currentBackStack` is a live snapshot, not a durable history.
    LaunchedEffect(navController) {
        // The jump half of the same seam: lets the debug inspector navigate by route
        // (its navigate endpoint) so walkthrough coverage enumerates the graph instead of
        // synthesizing taps. Registered/cleared with the controller's composition lifetime;
        // NavController rejects unknown routes itself (IllegalArgumentException).
        NavInspectionHook.navigator = { route -> navController.navigate(route) }
        try {
            navController.currentBackStack.collect { stack ->
                NavInspectionHook.listener?.invoke(
                    navController.currentDestination?.route,
                    stack.mapNotNull { it.destination.route },
                )
            }
        } finally {
            NavInspectionHook.navigator = null
        }
    }

    NavHost(navController = navController, startDestination = Screen.Shell.route) {
        composable(Screen.Shell.route) {
            val tabs = appTabs(
                home = {
                    HomeScreen(
                        onItemClick = { itemId -> navController.navigate(Routes.detail(itemId)) },
                    )
                },
                profile = { ProfileScreen() },
            )
            AppShell(tabs = tabs)
        }

        composable(
            route = Screen.Detail.route,
            arguments = listOf(navArgument("itemId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val itemId = backStackEntry.arguments?.read { getStringOrNull("itemId") }.orEmpty()
            __PACKAGE__.presentation.home.DetailScreen(
                itemId = itemId,
                onBack = { navController.popBackStack() },
            )
        }
        // cmp:anchor nav-destinations
    }
}
