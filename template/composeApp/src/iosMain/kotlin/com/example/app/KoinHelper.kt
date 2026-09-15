package __PACKAGE__

import __PACKAGE__.core.connectivity.NetworkMonitor
// >>> cmp:feature room
import __PACKAGE__.data.local.AppDatabase
import __PACKAGE__.data.local.buildDatabase
// <<< cmp:feature room
// >>> cmp:feature firebase
import kotlin.experimental.ExperimentalNativeApi
import kotlin.native.Platform
import __PACKAGE__.data.remote.FIREBASE_FUNCTIONS_REGION
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.auth.auth
import dev.gitlive.firebase.firestore.firestore
import dev.gitlive.firebase.functions.functions
import dev.gitlive.firebase.storage.storage
// <<< cmp:feature firebase
import __PACKAGE__.di.appModules
import org.koin.core.context.startKoin
import org.koin.dsl.module

// >>> cmp:feature firebase
// Debug/QA: point GitLive Firebase at the local emulators. The iOS simulator shares the host
// network, so 127.0.0.1 reaches the emulators directly. Requires FirebaseApp.configure() to
// have run first (done in iOSApp.swift AppDelegate).
//
// TWO DEFECTS LIVED HERE, and the comment above described neither.
//
// There was NO BUILD GATE. Android has `if (!BuildConfig.USE_FIREBASE_EMULATORS) return`;
// Kotlin/Native has no BuildConfig and nothing took its place, so `initKoin()` — called from
// iOSApp.swift's AppDelegate on EVERY launch — pointed Firebase at 127.0.0.1 in release builds
// too. A shipped iOS app whose Firebase calls all go to a loopback address that is not there.
//
// And the redirect was wrapped in `runCatching { }` with the Result discarded, so neither that
// nor any other failure was ever visible.
@OptIn(ExperimentalNativeApi::class)
private fun configureFirebaseEmulators() {
    // `Platform.isDebugBinary` is the Kotlin/Native equivalent of the Android flag: true for a
    // debug binary, false for the release one an adopter ships.
    if (!Platform.isDebugBinary) return
    val host = "127.0.0.1"
    try {
        Firebase.auth.useEmulator(host, 9099)
        Firebase.firestore.useEmulator(host, 8080)
        Firebase.functions(FIREBASE_FUNCTIONS_REGION).useEmulator(host, 5001)
        Firebase.storage.useEmulator(host, 9199)
    } catch (cause: Throwable) {
        throw IllegalStateException(
            "Firebase emulator redirect to $host FAILED in a debug build. Refusing to start: " +
                "continuing would authenticate and write against the real project in " +
                "GoogleService-Info.plist. Check that FirebaseApp.configure() ran first (iOSApp.swift) " +
                "and that no Firebase client was used before initKoin().",
            cause,
        )
    }
}
// <<< cmp:feature firebase

fun initKoin() {
    // >>> cmp:feature firebase
    configureFirebaseEmulators()
    // <<< cmp:feature firebase
    startKoin {
        modules(
            module {
                // >>> cmp:feature room
                single<AppDatabase> { buildDatabase() }
                // <<< cmp:feature room
                single { NetworkMonitor(null) }
            },
            *appModules.toTypedArray()
        )
    }
}
