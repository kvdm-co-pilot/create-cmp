package __PACKAGE__.presentation.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens
import __PACKAGE__.presentation.theme.designToken

/**
 * The page container every screen roots itself in — absorbs the thrice-copied
 * `Column(fillMaxSize().designToken(...).padding(PaddingPage))` block (§1 item 2) and
 * finally delivers `template/CLAUDE.md`'s "every screen: a testTag'd root" promise
 * (`home_screen`, `detail_screen`, `profile_screen`, …).
 *
 * The `designToken` self-report for `PaddingPage` lives here, once — derived from the
 * token itself rather than a hand-written literal, so it can never drift from the catalog
 * (§1 item 3).
 */
@Composable
fun ScreenColumn(
    screenTag: String,
    modifier: Modifier = Modifier,
    scrollable: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val base = modifier
        .fillMaxSize()
        .semantics { testTag = "${screenTag}_screen" }
        .designToken(
            tokens = listOf("PaddingPage"),
            resolved = mapOf("padding" to "${__THEME_PREFIX__Tokens.PaddingPage.value.toInt()}dp"),
        )
        .padding(__THEME_PREFIX__Tokens.PaddingPage)

    Column(
        modifier = if (scrollable) base.verticalScroll(rememberScrollState()) else base,
        content = content,
    )
}
