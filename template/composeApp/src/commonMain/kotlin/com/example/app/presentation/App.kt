package __PACKAGE__.presentation

import androidx.compose.runtime.Composable
import __PACKAGE__.presentation.navigation.AppNavHost
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Theme

// Root composable. Wraps the whole app in the theme and hosts navigation.
@Composable
fun App() {
    __THEME_PREFIX__Theme {
        AppNavHost()
    }
}
