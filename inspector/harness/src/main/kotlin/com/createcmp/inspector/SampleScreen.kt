package com.createcmp.inspector

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp

/**
 * A sample screen mirroring the template's HomeScreen look: a title Text plus a couple
 * of card Surfaces. Visual nodes carry [designToken] so the headless dump is
 * design-system-aware. Colors come from the template's seed palette so resolved values
 * are real.
 */

// Template seed colours (see template Theme.kt __THEME_PREFIX__Colors).
private object SeedColors {
    val Primary = Color(0xFF0A2540)
    val OnPrimary = Color(0xFFFFFFFF)
    val Secondary = Color(0xFF00B96B)
    val Error = Color(0xFFDC2626)
    val Background = Color(0xFFF7F9FC)
    val Surface = Color(0xFFFFFFFF)
    val OnSurface = Color(0xFF1A1A1A)
    val OnSurfaceVariant = Color(0xFF6B7280)
}

private val SampleColorScheme = lightColorScheme(
    primary = SeedColors.Primary,
    onPrimary = SeedColors.OnPrimary,
    secondary = SeedColors.Secondary,
    error = SeedColors.Error,
    background = SeedColors.Background,
    surface = SeedColors.Surface,
    onBackground = SeedColors.OnSurface,
    onSurface = SeedColors.OnSurface,
    onSurfaceVariant = SeedColors.OnSurfaceVariant,
)

private data class SampleItem(val title: String, val subtitle: String)

private val sampleItems = listOf(
    SampleItem("First card", "A representative card subtitle"),
    SampleItem("Second card", "Another representative subtitle"),
)

@Composable
fun SampleScreen() {
    MaterialTheme(colorScheme = SampleColorScheme) {
        Column(
            Modifier
                .fillMaxSize()
                .designToken(
                    tokens = listOf("PaddingPage"),
                    resolved = mapOf("padding" to "16dp"),
                )
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Home",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier
                    .semantics { testTag = "home_title" }
                    .padding(bottom = 12.dp),
            )

            sampleItems.forEach { item ->
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = MaterialTheme.shapes.medium,
                    tonalElevation = 2.dp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .designToken(
                            tokens = listOf("RadiusCard", "ElevationCard", "PaddingCard"),
                            resolved = mapOf(
                                "radius" to "16dp",
                                "elevation" to "2dp",
                                "padding" to "16dp",
                                "color" to "#FFFFFFFF",
                            ),
                        ),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(item.title, style = MaterialTheme.typography.titleMedium)
                        Text(
                            item.subtitle,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
