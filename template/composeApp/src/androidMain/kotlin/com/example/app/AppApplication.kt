package __PACKAGE__

import android.app.Application
// >>> cmp:feature room
import __PACKAGE__.data.local.AppDatabase
import __PACKAGE__.data.local.appContext
import __PACKAGE__.data.local.buildDatabase
// <<< cmp:feature room
import __PACKAGE__.core.connectivity.NetworkMonitor
import __PACKAGE__.di.androidModule
// >>> cmp:feature inspector
import __PACKAGE__.inspector.startInspector
// <<< cmp:feature inspector
import __PACKAGE__.di.appModules
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin
import org.koin.dsl.module

class AppApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // >>> cmp:feature inspector
        // Debug builds only: the androidRelease twin is a no-op (see inspector/InspectorInit.kt).
        // Must run before any Activity so the Compose root registry catches every root.
        startInspector()
        // <<< cmp:feature inspector
        // >>> cmp:feature room
        appContext = this
        // <<< cmp:feature room
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

}
