package __PACKAGE__.presentation.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens

/**
 * The centerpiece of the component vocabulary (§3): a general state container, not a
 * list-specific `ListBase`. Loading/Error/Empty/Content is the lifecycle of any
 * data-backed screen — the container owns the three non-content arms' UI; the screen
 * supplies its own content shape in the trailing slot.
 *
 * `screenTag` is required (a deliberate deviation from "everything else is optional"):
 * the harness's tests, golden trees, Maestro flows, and `audit_a11y` all key on
 * deterministic testTags (`<screenTag>_loading` / `_error` / `_retry` / `_empty`) — leaving
 * tags to each caller is how the template ended up with an untagged Profile body.
 */
@Composable
fun <T> ContentStateContainer(
    state: ContentUiState<T>,
    screenTag: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
    loading: @Composable () -> Unit = { ContentStateDefaults.ListSkeleton(screenTag) },
    error: @Composable (message: String) -> Unit = { ErrorState(message = it, screenTag = screenTag, onRetry = onRetry) },
    empty: @Composable () -> Unit = { EmptyState(screenTag = screenTag) },
    content: @Composable (data: T) -> Unit,
) {
    Box(modifier.fillMaxSize()) {
        when (state) {
            is ContentUiState.Loading -> loading()
            is ContentUiState.Error -> error(state.message)
            is ContentUiState.Empty -> empty()
            is ContentUiState.Content -> content(state.data)
        }
    }
}

/** Namespaced defaults, per the Compose guidelines' `ComponentDefaults` pattern. */
object ContentStateDefaults {

    /**
     * The default loading slot: a skeleton shaped like [ListItemCard], because the
     * exemplar is a list (§2: skeletons for content-shaped loads, per NN/g and Chung's
     * skeleton-screen research). The container carries the tag + a "Loading"
     * `contentDescription`; the individual bars stay semantics-silent (decorative).
     */
    @Composable
    fun ListSkeleton(screenTag: String, rows: Int = 3) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .semantics {
                    testTag = "${screenTag}_loading"
                    contentDescription = "Loading"
                },
            verticalArrangement = Arrangement.spacedBy(__THEME_PREFIX__Tokens.GapCard),
        ) {
            repeat(rows) { ListItemSkeleton() }
        }
    }

    /** A centered spinner for non-content-shaped waits (a short, single-module operation). */
    @Composable
    fun Spinner(screenTag: String) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .semantics {
                    testTag = "${screenTag}_loading"
                    contentDescription = "Loading"
                },
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator()
        }
    }
}
