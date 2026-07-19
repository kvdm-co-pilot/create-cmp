package __PACKAGE__.presentation.components

import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Two buttons, no more (§4.9) — justified solely by §1 item 6: M3 buttons fail the
 * harness's own 48 dp `audit_a11y` bar by default, and the fix used to live as a
 * copy-me comment in `DetailScreen`. These wrap M3 once, apply the 48 dp minimum
 * pointer target (WCAG 2.2 SC 2.5.8 AA clears with Material margin), and bind label
 * styling to the theme. A full button system (icons, loading buttons, destructive
 * variants, FABs) is not proposed — no measured pain.
 */
@Composable
fun AppPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.sizeIn(minWidth = AppButtonDefaults.MinTouchTarget, minHeight = AppButtonDefaults.MinTouchTarget),
    ) {
        Text(text)
    }
}

@Composable
fun AppTextButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.sizeIn(minWidth = AppButtonDefaults.MinTouchTarget, minHeight = AppButtonDefaults.MinTouchTarget),
    ) {
        Text(text)
    }
}

/** Namespaced defaults, per the Compose guidelines' `ComponentDefaults` pattern. */
object AppButtonDefaults {
    val MinTouchTarget = 48.dp
}
