package __PACKAGE__

import android.app.Application
// >>> cmp:feature firebase
import __PACKAGE__.data.remote.FIREBASE_FUNCTIONS_REGION
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.auth.auth
import dev.gitlive.firebase.firestore.firestore
import dev.gitlive.firebase.functions.functions
import dev.gitlive.firebase.storage.storage
// <<< cmp:feature firebase
// >>> cmp:feature room
import __PACKAGE__.data.local.AppDatabase
import __PACKAGE__.data.local.appContext
import __PACKAGE__.data.local.buildDatabase
// <<< cmp:feature room
import __PACKAGE__.core.connectivity.NetworkMonitor
import __PACKAGE__.di.androidModule
import __PACKAGE__.di.appModules
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin
import org.koin.dsl.module

class AppApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // >>> cmp:feature room
        appContext = this
        // <<< cmp:feature room
        // >>> cmp:feature firebase
        configureFirebaseEmulators()
        // <<< cmp:feature firebase
        startKoin {
            androidLogger()
            androidContext(this@AppApplication)
            modules(
                module {
                    // >>> cmp:feature room
                    single<AppDatabase> { buildDatabase() }
                    // <<< cmp:feature room
                    single { NetworkMonitor(androidContext()) }
                },
                androidModule,
                *appModules.toTypedArray()
            )
        }
    }

    // >>> cmp:feature firebase
    // Debug builds talk to the local Firebase emulators (BuildConfig flags set in build.gradle.kts).
    private fun configureFirebaseEmulators() {
        if (!BuildConfig.USE_FIREBASE_EMULATORS) return
        val host = BuildConfig.FIREBASE_EMULATOR_HOST
        runCatching {
            Firebase.auth.useEmulator(host, BuildConfig.FIREBASE_AUTH_PORT)
            Firebase.firestore.useEmulator(host, BuildConfig.FIREBASE_FIRESTORE_PORT)
            Firebase.functions(FIREBASE_FUNCTIONS_REGION)
                .useEmulator(host, BuildConfig.FIREBASE_FUNCTIONS_PORT)
            Firebase.storage.useEmulator(host, BuildConfig.FIREBASE_STORAGE_PORT)
        }
    }
    // <<< cmp:feature firebase
}
