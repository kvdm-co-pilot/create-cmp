package __PACKAGE__.presentation.components

import androidx.compose.ui.Modifier

/** Web: the UI is drawn on one canvas, so there is no DOM node to carry a test id — no-op. */
actual fun Modifier.exposeTestTagsForAutomation(): Modifier = this
