package __PACKAGE__.di

import __PACKAGE__.data.remote.ItemRepositoryImpl
import __PACKAGE__.domain.repository.ItemRepository
import __PACKAGE__.domain.usecase.GetItemsUseCase
import __PACKAGE__.presentation.home.HomeViewModel
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

val repositoryModule = module {
    single<ItemRepository> { ItemRepositoryImpl() }
}

val useCaseModule = module {
    factory { GetItemsUseCase(get()) }
}

val viewModelModule = module {
    viewModelOf(::HomeViewModel)
}

// Aggregated common modules, started from AppApplication (Android) and KoinHelper (iOS).
val appModules = listOf(repositoryModule, useCaseModule, viewModelModule)
