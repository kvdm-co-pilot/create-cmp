package __PACKAGE__.data.remote

import __PACKAGE__.domain.model.Item
import __PACKAGE__.domain.repository.ItemRepository
import kotlinx.coroutines.delay

// Example data source for the `home` feature. This is intentionally dependency-light
// (no Firebase / no Room coupling) so the scaffold builds in every feature combination.
//
// Real apps swap this for a Firestore/Ktor source and add a Room cache (see data/local).
// The Clean Architecture seam is the ItemRepository interface in the domain layer.
class ItemRepositoryImpl : ItemRepository {
    override suspend fun getItems(): List<Item> {
        delay(300) // simulate I/O
        return listOf(
            Item("1", "Welcome to __APP_NAME__", "Your Compose Multiplatform app is wired end-to-end."),
            Item("2", "Clean Architecture", "presentation → domain → data, with Koin DI."),
            Item("3", "Edge-to-edge, pre-solved", "BaseScreen owns the window insets for you."),
            Item("4", "Android + iOS", "One codebase, two green builds."),
        )
    }
}
