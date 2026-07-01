package __PACKAGE__.domain.repository

import __PACKAGE__.domain.model.Item

// Domain-facing contract. Presentation depends on THIS, never on a concrete data source.
interface ItemRepository {
    suspend fun getItems(): List<Item>
}
