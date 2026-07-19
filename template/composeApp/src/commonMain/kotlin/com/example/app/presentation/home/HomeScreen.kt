package __PACKAGE__.presentation.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import __PACKAGE__.presentation.components.AppHeader
import __PACKAGE__.presentation.components.ContentStateContainer
import __PACKAGE__.presentation.components.ListItemCard
import __PACKAGE__.presentation.components.ScreenColumn
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens
import org.koin.compose.viewmodel.koinViewModel

@Composable
fun HomeScreen(
    onItemClick: (String) -> Unit,
    viewModel: HomeViewModel = koinViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ScreenColumn(screenTag = "home") {
        AppHeader(title = "Home", screenTag = "home")
        ContentStateContainer(state = state, screenTag = "home", onRetry = viewModel::load) { items ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(__THEME_PREFIX__Tokens.GapCard)) {
                items(items, key = { it.id }) { item ->
                    ListItemCard(
                        title = item.title,
                        subtitle = item.subtitle,
                        onClick = { onItemClick(item.id) },
                        modifier = Modifier.semantics { testTag = "home_item_${item.id}" },
                    )
                }
            }
        }
    }
}
