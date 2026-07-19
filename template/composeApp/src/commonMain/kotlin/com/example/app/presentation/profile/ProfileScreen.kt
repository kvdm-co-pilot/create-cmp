package __PACKAGE__.presentation.profile

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import __PACKAGE__.presentation.components.AppHeader
import __PACKAGE__.presentation.components.ScreenColumn

// Feature stub. Copy the `home` feature's data→domain→presentation→DI wiring to flesh this out.
@Composable
fun ProfileScreen() {
    ScreenColumn(screenTag = "profile") {
        AppHeader(title = "Profile", screenTag = "profile")
        Text(
            text = "This is a stub screen. Wire it up like the Home feature.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics { testTag = "profile_body" },
        )
    }
}
