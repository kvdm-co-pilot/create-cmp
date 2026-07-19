package __PACKAGE__.presentation.home

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import __PACKAGE__.presentation.components.AppHeader
import __PACKAGE__.presentation.components.BaseScreen
import __PACKAGE__.presentation.components.ScreenColumn

@Composable
fun DetailScreen(
    itemId: String,
    onBack: () -> Unit,
) {
    BaseScreen {
        ScreenColumn(screenTag = "detail") {
            AppHeader(title = "Detail", screenTag = "detail", onBack = onBack)
            Text(
                text = "Item id: $itemId",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
