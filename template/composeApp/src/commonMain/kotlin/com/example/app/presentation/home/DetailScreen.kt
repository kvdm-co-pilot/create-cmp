package __PACKAGE__.presentation.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import __PACKAGE__.presentation.components.BaseScreen
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens
import __PACKAGE__.presentation.theme.designToken

@Composable
fun DetailScreen(
    itemId: String,
    onBack: () -> Unit,
) {
    BaseScreen {
        Column(
            Modifier
                .fillMaxSize()
                .designToken(
                    tokens = listOf("PaddingPage"),
                    resolved = mapOf("padding" to "16dp"),
                )
                .padding(__THEME_PREFIX__Tokens.PaddingPage),
        ) {
            // sizeIn(48dp): a11y minimum touch target (SHELL-04's audit tier flags anything
            // smaller) — TextButton's 40dp visual default fails the harness's own audit.
            TextButton(
                onClick = onBack,
                modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).semantics { testTag = "detail_back" },
            ) {
                Text("← Back")
            }
            Text(
                "Detail",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { testTag = "detail_title" },
            )
            Text(
                "Item id: $itemId",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
