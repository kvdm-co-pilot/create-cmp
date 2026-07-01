package __PACKAGE__.presentation.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import __PACKAGE__.presentation.components.BaseScreen
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens

@Composable
fun DetailScreen(
    itemId: String,
    onBack: () -> Unit,
) {
    BaseScreen {
        Column(Modifier.fillMaxSize().padding(__THEME_PREFIX__Tokens.PaddingPage)) {
            TextButton(onClick = onBack) { Text("← Back") }
            Text("Detail", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Item id: $itemId",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
