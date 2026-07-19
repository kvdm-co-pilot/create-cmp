package __PACKAGE__.domain.usecase

import __PACKAGE__.domain.model.Item
import __PACKAGE__.domain.repository.ItemRepository
import __PACKAGE__.domain.result.AppResult

// A use case is a single business action. ViewModels depend on use cases, not repositories
// directly, so business rules stay testable and out of the presentation layer.
// The typed result passes through untouched — a use case may combine or transform results,
// but it never unwraps them into exceptions.
class GetItemsUseCase(
    private val repository: ItemRepository,
) {
    suspend operator fun invoke(): AppResult<List<Item>> = repository.getItems()
}
