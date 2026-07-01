package __PACKAGE__.core.connectivity

import kotlinx.coroutines.flow.StateFlow

expect class NetworkMonitor(context: Any?) {
    val isOnline: StateFlow<Boolean>
}
