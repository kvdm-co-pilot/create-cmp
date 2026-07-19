package __PACKAGE__.presentation.components

/**
 * The four-way lifecycle of any data-backed screen. Sealed so a `when` is exhaustive — a
 * screen cannot forget a state, and cannot render two at once.
 *
 * This is the **generalization of the landed EH-1 pattern**: `HomeViewModel`'s
 * pre-generalization `HomeUiState` had exactly these four arms (Loading/Content/Empty/Error) —
 * the same fold, made generic once so a shared container ([ContentStateContainer]) can own
 * the three non-content arms' rendering instead of every feature hand-folding its own copy.
 */
sealed interface ContentUiState<out T> {
    data object Loading : ContentUiState<Nothing>
    data class Error(val message: String) : ContentUiState<Nothing>
    data object Empty : ContentUiState<Nothing>
    data class Content<T>(val data: T) : ContentUiState<T>
}

/** ViewModel-side helper: the Empty/Content decision made once, not per screen. */
fun <E> List<E>.toContentState(): ContentUiState<List<E>> =
    if (isEmpty()) ContentUiState.Empty else ContentUiState.Content(this)
