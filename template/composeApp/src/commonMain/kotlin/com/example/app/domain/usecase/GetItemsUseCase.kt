package __PACKAGE__.domain.usecase

import __PACKAGE__.domain.model.Item
import __PACKAGE__.domain.repository.ItemRepository

// A use case is a single business action. ViewModels depend on use cases, not repositories
// directly, so business rules stay testable and out of the presentation layer.
class GetItemsUseCase(
    private val repository: ItemRepository,
) {
    suspend operator fun invoke(): List<Item> = repository.getItems()
}
