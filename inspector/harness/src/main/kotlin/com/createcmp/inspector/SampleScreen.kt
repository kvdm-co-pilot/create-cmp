package com.createcmp.inspector

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * A sample screen mirroring the template's annotated kit: [BaseScreenMirror] is a
 * concrete-package copy of the template's `BaseScreen` (insets moat + inset-fact
 * designToken), [SampleBottomNav] mirrors `AppShell`'s `AppBottomNav` (BottomNavHeight
 * token + `app_bottom_nav` testTag), and the body mirrors `HomeScreen` (page padding +
 * card tokens) plus a small clickable icon-button so the rendered tree exercises the
 * `role` / `clickable` contract fields. These mirrors ARE the compile proof for the
 * template's placeholder-form Kotlin (same code, concrete package).
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
    val OutlineVariant = Color(0xFFE5E7EB)
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
        BaseScreenMirror(
            // The bottom bar owns the navigation-bar inset; the body must not also pad it.
            applyNavBarPadding = false,
            bottomBar = { SampleBottomNav(labels = listOf("Home", "Profile")) },
        ) {
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
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Home",
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.semantics { testTag = "home_title" },
                    )
                    // Small icon-button: exercises role=Button + clickable in the dump.
                    // Sized to the 48dp a11y minimum explicitly — IconButton's default
                    // layout bounds are 40dp (its 48dp touch target is an interaction-area
                    // extension that does not appear in boundsInRoot).
                    IconButton(
                        onClick = {},
                        modifier = Modifier
                            .size(48.dp)
                            .semantics {
                                testTag = "home_action"
                                contentDescription = "Add item"
                            },
                    ) {
                        Text("+", style = MaterialTheme.typography.titleLarge)
                    }
                }

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
}

/**
 * Concrete-package mirror of the template's `BaseScreen` (components/BaseScreen.kt),
 * including the inset-fact designToken on the content Box — compile proof for the
 * template's annotated version.
 */
@Composable
private fun BaseScreenMirror(
    modifier: Modifier = Modifier,
    containerColor: Color = Color.Unspecified,
    applyStatusBarPadding: Boolean = true,
    applyNavBarPadding: Boolean = true,
    topBar: @Composable () -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        containerColor = if (containerColor == Color.Unspecified)
            MaterialTheme.colorScheme.background else containerColor,
        topBar = topBar,
        bottomBar = bottomBar,
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding)
                .then(if (applyStatusBarPadding) Modifier.statusBarsPadding() else Modifier)
                .then(if (applyNavBarPadding) Modifier.navigationBarsPadding() else Modifier)
                // Inspector: self-report the inset facts this Box actually applies. No dimen
                // token is used here — the padding comes from Scaffold insets, not the design
                // system — so the tokens list is empty and only the resolved facts are emitted.
                .designToken(
                    tokens = emptyList(),
                    resolved = mapOf(
                        "statusBarPadding" to applyStatusBarPadding.toString(),
                        "navBarPadding" to applyNavBarPadding.toString(),
                    ),
                )
        ) {
            content(innerPadding)
        }
    }
}

/**
 * Concrete-package mirror of the template's `AppBottomNav` (navigation/AppShell.kt):
 * BottomNavHeight designToken + `app_bottom_nav` testTag on the nav Row, clickable
 * nav items — compile proof for the template's annotated version.
 */
@Composable
private fun SampleBottomNav(
    labels: List<String>,
    selectedIndex: Int = 0,
    onSelect: (Int) -> Unit = {},
) {
    Column(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(SeedColors.OutlineVariant)
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(SeedColors.Surface)
                // Lift tabs above the gesture pill / 3-button nav (maps to iOS safe area).
                .navigationBarsPadding()
                .height(72.dp)
                // Inspector: the bottom-nav container self-reports its height token.
                .designToken(
                    tokens = listOf("BottomNavHeight"),
                    resolved = mapOf("height" to "72dp"),
                )
                .semantics { testTag = "app_bottom_nav" }
                .padding(bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            labels.forEachIndexed { index, label ->
                NavItemMirror(
                    label = label,
                    selected = selectedIndex == index,
                    onClick = { onSelect(index) },
                )
            }
        }
    }
}

@Composable
private fun NavItemMirror(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            // a11y: guarantee the 48dp minimum touch target regardless of label width
            // (the inspector's audit_a11y flags anything smaller).
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = label,
            fontSize = 10.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            color = if (selected) SeedColors.Primary else SeedColors.OnSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
