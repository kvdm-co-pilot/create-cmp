package __PACKAGE__.core.platform

import java.util.concurrent.ConcurrentHashMap

// The JVM tier is harness infrastructure (tests, preview renders, the dev-client window), so the
// store lives in memory: nothing a render or a test writes outlives the process or lands on the host.
actual class KeyValueStore actual constructor(context: Any?) {

    private val values = ConcurrentHashMap<String, String>()

    actual fun getString(key: String): String? = values[key]

    actual fun putString(key: String, value: String) {
        values[key] = value
    }

    actual fun remove(key: String) {
        values.remove(key)
    }
}
