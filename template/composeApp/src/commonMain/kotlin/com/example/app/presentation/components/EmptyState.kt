package __PACKAGE__.presentation.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp

/**
 * The Empty arm of the four-state contract (§3, §4.7) — not a standalone invention, but
 * the extraction of the landed EH-1 empty-state UI (`HomeScreen`'s hand-rolled `Box` +
 * `Text`), keeping its `<screenTag>_empty` tag and adding the icon/action anatomy an
 * empty state grows next.
 */
@Composable
fun EmptyState(
    screenTag: String,
    modifier: Modifier = Modifier,
    title: String = "Nothing here yet",
    body: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Box(
        modifier = modifier.fillMaxSize().semantics { testTag = "${screenTag}_empty" },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (body != null) {
                Text(
                    text = body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            if (action != null) {
                Box(Modifier.padding(top = 12.dp)) { action() }
            }
        }
    }
}
