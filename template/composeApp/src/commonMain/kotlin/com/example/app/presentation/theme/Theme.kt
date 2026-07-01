package __PACKAGE__.presentation.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Seed design tokens. Replace these with your own brand palette — every screen reads
// colours from here (or from MaterialTheme.colorScheme), never as raw hex.
object __THEME_PREFIX__Colors {
    val Primary          = Color(0xFF0A2540)
    val OnPrimary        = Color(0xFFFFFFFF)
    val Accent           = Color(0xFF00E676)
    val OnAccent         = Color(0xFF0A2540)
    val Secondary        = Color(0xFF00B96B)
    val Error            = Color(0xFFDC2626)
    val Success          = Color(0xFF16A34A)
    val Warning          = Color(0xFFF59E0B)
    val Info             = Color(0xFF2563EB)
    val Background       = Color(0xFFF7F9FC)
    val Surface          = Color(0xFFFFFFFF)
    val SurfaceVariant   = Color(0xFFE8EDF3)
    val OnSurface        = Color(0xFF1A1A1A)
    val OnSurfaceVariant = Color(0xFF6B7280)
    val Outline          = Color(0xFF9CA3AF)
    val OutlineVariant   = Color(0xFFE5E7EB)
    val Divider          = Color(0xFFE5E7EB)
}

private val __THEME_PREFIX__ColorScheme = lightColorScheme(
    primary              = __THEME_PREFIX__Colors.Primary,
    onPrimary            = __THEME_PREFIX__Colors.OnPrimary,
    secondary            = __THEME_PREFIX__Colors.Secondary,
    onSecondary          = __THEME_PREFIX__Colors.OnPrimary,
    tertiary             = __THEME_PREFIX__Colors.Accent,
    onTertiary           = __THEME_PREFIX__Colors.OnAccent,
    error                = __THEME_PREFIX__Colors.Error,
    background           = __THEME_PREFIX__Colors.Background,
    surface              = __THEME_PREFIX__Colors.Surface,
    surfaceVariant       = __THEME_PREFIX__Colors.SurfaceVariant,
    onBackground         = __THEME_PREFIX__Colors.OnSurface,
    onSurface            = __THEME_PREFIX__Colors.OnSurface,
    onSurfaceVariant     = __THEME_PREFIX__Colors.OnSurfaceVariant,
    outline              = __THEME_PREFIX__Colors.Outline,
    outlineVariant       = __THEME_PREFIX__Colors.OutlineVariant,
    inverseSurface       = __THEME_PREFIX__Colors.Primary,
    // Kill M3's tonal overlay so dialogs/menus/sheets stay on the design-system surface.
    surfaceTint              = Color.Transparent,
    surfaceContainerLowest   = __THEME_PREFIX__Colors.Surface,
    surfaceContainerLow      = __THEME_PREFIX__Colors.Surface,
    surfaceContainer         = __THEME_PREFIX__Colors.Surface,
    surfaceContainerHigh     = __THEME_PREFIX__Colors.Surface,
    surfaceContainerHighest  = __THEME_PREFIX__Colors.SurfaceVariant,
)

@Composable
fun __THEME_PREFIX__Theme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = __THEME_PREFIX__ColorScheme,
        typography  = remember__THEME_PREFIX__Typography(),
        shapes      = __THEME_PREFIX__Shapes,
        content     = content,
    )
}
