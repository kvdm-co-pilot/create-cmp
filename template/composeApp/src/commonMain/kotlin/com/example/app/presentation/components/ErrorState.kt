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
 * The Error arm of the four-state contract (§3, §4.8) — closes HOME-04 (`specs/home.spec.md`):
 * when a retry handler is supplied, a `<screenTag>_retry` control at least 48 dp renders
 * (SC 2.5.8 / the harness's `audit_a11y` bar), fixing the defect where the error branch
 * had no rendered affordance at all.
 */
@Composable
fun ErrorState(
    message: String,
    screenTag: String,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize().semantics { testTag = "${screenTag}_error" },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error,
            )
            if (onRetry != null) {
                AppTextButton(
                    text = "Retry",
                    onClick = onRetry,
                    modifier = Modifier.padding(top = 12.dp).semantics { testTag = "${screenTag}_retry" },
                )
            }
        }
    }
}
