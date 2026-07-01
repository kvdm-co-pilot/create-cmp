package __PACKAGE__.presentation.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import __PACKAGE__.presentation.components.BaseScreen
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Colors
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens

/**
 * Generic bottom-nav shell. Parameterized by a [tabs] list — NOT role-hardcoded.
 * Hosts the selected tab's content inside a [BaseScreen] so each tab gets correct insets;
 * the bottom bar reserves the navigation-bar inset exactly once.
 */
@Composable
fun AppShell(tabs: List<AppTab>) {
    var selected by rememberSaveable { mutableIntStateOf(0) }

    BaseScreen(
        // The bottom bar owns the navigation-bar inset; the body must not also pad it.
        applyNavBarPadding = false,
        bottomBar = {
            AppBottomNav(
                tabs = tabs,
                selectedIndex = selected,
                onSelect = { selected = it },
            )
        },
    ) {
        Box(Modifier.fillMaxSize()) {
            tabs.getOrNull(selected)?.content?.invoke()
        }
    }
}

@Composable
private fun AppBottomNav(
    tabs: List<AppTab>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(__THEME_PREFIX__Colors.OutlineVariant)
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(__THEME_PREFIX__Colors.Surface)
                // Lift tabs above the gesture pill / 3-button nav (maps to iOS safe area).
                .navigationBarsPadding()
                .height(__THEME_PREFIX__Tokens.BottomNavHeight)
                .padding(bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            tabs.forEachIndexed { index, tab ->
                NavItem(
                    label = tab.label,
                    selected = selectedIndex == index,
                    onClick = { onSelect(index) },
                ) {
                    Icon(
                        imageVector = tab.icon,
                        contentDescription = tab.label,
                        tint = if (selectedIndex == index) __THEME_PREFIX__Colors.Primary
                               else __THEME_PREFIX__Colors.OnSurfaceVariant.copy(alpha = 0.55f),
                        modifier = Modifier.size(24.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun NavItem(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        icon()
        Text(
            text = label,
            fontSize = 10.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            color = if (selected) __THEME_PREFIX__Colors.Primary else __THEME_PREFIX__Colors.OnSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
