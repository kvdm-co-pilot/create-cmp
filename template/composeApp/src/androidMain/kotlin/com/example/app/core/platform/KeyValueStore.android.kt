package __PACKAGE__.core.platform

import android.content.Context

actual class KeyValueStore actual constructor(context: Any?) {

    private val prefs = (context as Context)
        .getSharedPreferences("app_key_value_store", Context.MODE_PRIVATE)

    actual fun getString(key: String): String? = prefs.getString(key, null)

    actual fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    actual fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }
}
