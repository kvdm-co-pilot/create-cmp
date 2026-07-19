package __PACKAGE__.presentation.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens
import __PACKAGE__.presentation.theme.designToken

/**
 * The list row (§4.5) — absorbs `HomeScreen`'s hand-rolled `Surface(shape/elevation/
 * designToken/clickable) { Column { Text; Text } }` block, the largest single hand-rolled
 * chunk (27 lines). Binds `RadiusCard`, `ElevationCard`, `PaddingCard`; enforces the 48 dp
 * a11y floor; the `clickable` sits on the `Surface` so the whole row is the target.
 *
 * Item-level tags stay caller-side (`Modifier.testTag("home_item_$id")`) because ids are
 * domain data, not component structure.
 */
@Composable
fun ListItemCard(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = __THEME_PREFIX__Tokens.ElevationCard,
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .designToken(
                tokens = listOf("RadiusCard", "ElevationCard", "PaddingCard"),
                resolved = mapOf(
                    "radius" to "${__THEME_PREFIX__Tokens.RadiusCard.value.toInt()}dp",
                    "elevation" to "${__THEME_PREFIX__Tokens.ElevationCard.value.toInt()}dp",
                    "padding" to "${__THEME_PREFIX__Tokens.PaddingCard.value.toInt()}dp",
                    "color" to "#FFFFFFFF",
                ),
            )
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(__THEME_PREFIX__Tokens.PaddingCard),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leading != null) leading()
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                if (subtitle != null) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (trailing != null) trailing()
        }
    }
}
