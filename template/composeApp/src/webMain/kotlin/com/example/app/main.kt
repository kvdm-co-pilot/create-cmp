package __PACKAGE__

import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.window.ComposeViewport
import __PACKAGE__.core.connectivity.NetworkMonitor
import __PACKAGE__.core.platform.KeyValueStore
import __PACKAGE__.di.appModules
import kotlinx.browser.document
import org.koin.core.context.startKoin
import org.koin.dsl.module

// The browser app: the shared commonMain UI drawn into the page by Compose (Kotlin/Wasm).
//
//   ./gradlew :composeApp:wasmJsBrowserDevelopmentRun     # dev server, opens the browser
//   ./gradlew :composeApp:wasmJsBrowserDistribution       # release build
//
// See docs/web.md for the run loop, the seams on the web, and the size and load numbers.
@OptIn(ExperimentalComposeUiApi::class)
fun main() {
    initWebKoin()
    ComposeViewport(document.body!!) {
        App()
    }
}

// Mirrors AppApplication (Android) / KoinHelper (iOS) — the web's platform bindings.
fun initWebKoin() {
    startKoin {
        modules(
            module {
                single { NetworkMonitor(null) }
                single { KeyValueStore(null) }
            },
            *appModules.toTypedArray(),
        )
    }
}
