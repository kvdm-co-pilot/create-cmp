package __PACKAGE__.core.platform

import kotlinx.browser.localStorage

// The browser's localStorage: per origin, survives reloads, cleared with the site's data.
//
// Where the browser refuses it, every call throws: reading `localStorage` at all throws
// SecurityError when the user blocks site data or the app runs in a sandboxed iframe, and
// setItem throws QuotaExceededError when the origin is full. The store then keeps the value
// in memory for this page load instead of crashing the caller — the same thing the desktop
// store always does. A value read back is the newest one written either way.
actual class KeyValueStore actual constructor(context: Any?) {

    private val fallback = mutableMapOf<String, String>()

    actual fun getString(key: String): String? =
        fallback[key] ?: runCatching { localStorage.getItem(key) }.getOrNull()

    actual fun putString(key: String, value: String) {
        runCatching { localStorage.setItem(key, value) }
            .onSuccess { fallback.remove(key) }
            .onFailure { fallback[key] = value }
    }

    actual fun remove(key: String) {
        fallback.remove(key)
        runCatching { localStorage.removeItem(key) }
    }
}
