package __PACKAGE__.presentation.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import __PACKAGE__.domain.model.DomainError
import __PACKAGE__.domain.model.Item
import __PACKAGE__.domain.result.AppResult
import __PACKAGE__.domain.usecase.GetItemsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The screen's state machine, sealed so impossible states are unrepresentable — a screen
 * cannot be loading AND showing an error, and "successfully empty" is its own state, not
 * a bare list the UI has to reinterpret.
 */
sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Content(val items: List<Item>) : HomeUiState
    data object Empty : HomeUiState
    data class Error(val message: String) : HomeUiState
}

/**
 * No `try`/`catch` here — ever (ARCH-07). Failures arrive as typed [AppResult.Failure]
 * values from the use case; the ViewModel folds over the result and maps [DomainError]
 * KINDS to user-facing copy. A `CancellationException` thrown while suspended simply
 * cancels this coroutine (structured concurrency) — it never becomes an error state.
 */
class HomeViewModel(
    private val getItems: GetItemsUseCase,
) : ViewModel() {

    private val _state = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = HomeUiState.Loading
            _state.value = when (val result = getItems()) {
                is AppResult.Success ->
                    if (result.value.isEmpty()) HomeUiState.Empty
                    else HomeUiState.Content(result.value)
                is AppResult.Failure -> HomeUiState.Error(result.error.toUserMessage())
            }
        }
    }
}

/**
 * Presentation owns user-facing copy: error KINDS become strings here, next to the screen
 * that shows them. A raw `Throwable.message` never reaches the UI — the domain carries no
 * display text at all.
 */
internal fun DomainError.toUserMessage(): String = when (this) {
    DomainError.Network -> "Can't reach the server. Check your connection and try again."
    DomainError.NotFound -> "That content isn't available."
    is DomainError.Unexpected -> "Something went wrong. Please try again."
}
