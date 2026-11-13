package __PACKAGE__.core.connectivity

import kotlinx.browser.window
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// The browser's own answer: navigator.onLine, kept current by the online/offline events. It says
// whether the device has a network, not whether your server answers.
actual class NetworkMonitor actual constructor(context: Any?) {

    private val _isOnline = MutableStateFlow(window.navigator.onLine)
    actual val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    init {
        window.addEventListener("online") { _isOnline.value = true }
        window.addEventListener("offline") { _isOnline.value = false }
    }
}
