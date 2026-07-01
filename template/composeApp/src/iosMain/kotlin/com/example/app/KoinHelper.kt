package __PACKAGE__

import __PACKAGE__.core.connectivity.NetworkMonitor
// >>> cmp:feature room
import __PACKAGE__.data.local.AppDatabase
import __PACKAGE__.data.local.buildDatabase
// <<< cmp:feature room
// >>> cmp:feature firebase
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
private fun configureFirebaseEmulators() {
    val host = "127.0.0.1"
    runCatching {
        Firebase.auth.useEmulator(host, 9099)
        Firebase.firestore.useEmulator(host, 8080)
        Firebase.functions(FIREBASE_FUNCTIONS_REGION).useEmulator(host, 5001)
        Firebase.storage.useEmulator(host, 9199)
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
