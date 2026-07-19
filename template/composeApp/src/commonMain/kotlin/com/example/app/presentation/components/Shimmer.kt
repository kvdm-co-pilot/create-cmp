package __PACKAGE__.presentation.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens

/**
 * Left-to-right shimmer sweep on an [androidx.compose.animation.core.InfiniteTransition] +
 * a linear-gradient brush — perceived-faster than a pulse per the skeleton-screen research
 * surveyed in §2 (NN/g, Chung). Hand-rolled, zero new dependencies: Accompanist's
 * `placeholder` artifact is deprecated and Android-only, never an option for this
 * template's commonMain.
 */
fun Modifier.shimmer(): Modifier = composed {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateX by transition.animateFloat(
        initialValue = -1000f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shimmerTranslate",
    )
    background(
        Brush.linearGradient(
            colors = listOf(
                MaterialTheme.colorScheme.surfaceVariant,
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                MaterialTheme.colorScheme.surfaceVariant,
            ),
            start = Offset(translateX, 0f),
            end = Offset(translateX + 400f, 400f),
        ),
    )
}

/**
 * A card-shaped skeleton row mirroring [ListItemCard]'s real geometry (same tokens) so the
 * loaded layout doesn't jump. Decorative and non-interactive: semantics-silent by design —
 * the loading *container* carries the `<screenTag>_loading` tag and a "Loading"
 * `contentDescription` (see `ContentStateDefaults.ListSkeleton`), so `audit_a11y`/SHELL-04
 * (which govern interactive nodes) are untouched.
 */
@Composable
fun ListItemSkeleton(modifier: Modifier = Modifier) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = __THEME_PREFIX__Tokens.ElevationCard,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(__THEME_PREFIX__Tokens.PaddingCard)) {
            Box(
                Modifier
                    .fillMaxWidth(0.6f)
                    .height(16.dp)
                    .clip(MaterialTheme.shapes.small)
                    .shimmer(),
            )
            Box(
                Modifier
                    .padding(top = 8.dp)
                    .fillMaxWidth(0.4f)
                    .height(12.dp)
                    .clip(MaterialTheme.shapes.small)
                    .shimmer(),
            )
        }
    }
}
