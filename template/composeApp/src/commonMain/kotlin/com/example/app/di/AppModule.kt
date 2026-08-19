package __PACKAGE__.di

import __PACKAGE__.data.remote.ItemRepositoryImpl
import __PACKAGE__.domain.repository.ItemRepository
import __PACKAGE__.domain.usecase.GetItemsUseCase
import __PACKAGE__.presentation.home.HomeViewModel
// cmp:anchor di-imports
import org.koin.core.module.dsl.viewModel
import org.koin.dsl.module

val repositoryModule = module {
    single<ItemRepository> { ItemRepositoryImpl() }
    // cmp:anchor di-repositories
}

val useCaseModule = module {
    factory { GetItemsUseCase(get()) }
    // cmp:anchor di-usecases
}

val viewModelModule = module {
    // Explicit factories only — never reflection-based viewModelOf (ARCH-14): it silently
    // ignores constructor default parameter values, turning a compile-time wiring error
    // into a runtime resolution crash. One get() per constructor dependency.
    viewModel { HomeViewModel(get()) }
    // cmp:anchor di-viewmodels
}

// Aggregated common modules, started from AppApplication (Android) and KoinHelper (iOS).
val appModules = listOf(repositoryModule, useCaseModule, viewModelModule)
