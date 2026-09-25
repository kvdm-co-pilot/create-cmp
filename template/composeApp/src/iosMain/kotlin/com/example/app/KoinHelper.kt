package __PACKAGE__

import __PACKAGE__.core.connectivity.NetworkMonitor
// >>> cmp:feature room
import __PACKAGE__.data.local.AppDatabase
import __PACKAGE__.data.local.buildDatabase
// <<< cmp:feature room
import __PACKAGE__.di.appModules
import org.koin.core.context.startKoin
import org.koin.dsl.module


fun initKoin() {
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
