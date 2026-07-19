package __PACKAGE__.presentation.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
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
 * The screen header — replaces the three hand-copied headline `Text`s (`home_title`,
 * `detail_title`, `profile_title`) and `DetailScreen`'s back-button-plus-a11y-fix (§1
 * items 1 and 6). Emitted tags reproduce today's names exactly, so existing selectors
 * survive.
 *
 * Deliberately **not** an M3 `TopAppBar`: no scroll behaviors, no center-aligned variants,
 * no window-inset handling — `BaseScreen` owns insets (SHELL-03). It is a `Row` with a
 * headline and slots.
 */
@Composable
fun AppHeader(
    title: String,
    screenTag: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            AppTextButton(
                text = "← Back",
                onClick = onBack,
                modifier = Modifier.semantics { testTag = "${screenTag}_back" },
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.weight(1f).semantics { testTag = "${screenTag}_title" },
        )
        actions()
    }
}
