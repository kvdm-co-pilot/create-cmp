package __PACKAGE__.presentation.profile

import androidx.compose.foundation.layout.Arrangement
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
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens

// Feature stub. Copy the `home` feature's data→domain→presentation→DI wiring to flesh this out.
@Composable
fun ProfileScreen() {
    Column(
        modifier = Modifier.fillMaxSize().padding(__THEME_PREFIX__Tokens.PaddingPage),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            text = "Profile",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.semantics { testTag = "profile_title" },
        )
        Text(
            text = "This is a stub screen. Wire it up like the Home feature.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
