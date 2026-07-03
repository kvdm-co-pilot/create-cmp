package __PACKAGE__.di

import __PACKAGE__.core.connectivity.NetworkMonitor
// >>> cmp:feature room
import __PACKAGE__.data.local.AppDatabase
import __PACKAGE__.data.local.buildDatabase
// <<< cmp:feature room
import org.koin.core.context.startKoin
import org.koin.dsl.module

// Desktop (JVM) DI bindings for the dev-client window.
//
// No Firebase here — the dev-client runs fully offline. The example feature's data source
// (ItemRepositoryImpl, bound in appModules) is already an in-memory implementation serving the
// same sample data on every platform, so nothing needs swapping out of the box. When you add a
// real remote-backed repository, bind its desktop fake in THIS module so the dev-client keeps
// working without a backend:
//
//   single<MyRepository> { InMemoryMyRepository() }   // shadows the remote binding on desktop
val desktopModule = module {
    // >>> cmp:feature room
    single<AppDatabase> { buildDatabase() }
    // <<< cmp:feature room
    single { NetworkMonitor(null) }
}

// Mirrors AppApplication (Android) / KoinHelper (iOS) — Koin start for the desktop entry point.
fun initDesktopKoin() {
    startKoin {
        modules(desktopModule, *appModules.toTypedArray())
    }
}
