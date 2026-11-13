package __PACKAGE__.core.platform

/**
 * Small on-device key-value storage: a setting, a session token, the last tab. It is not a
 * database. Anything relational, large or shared between devices belongs on the server (or in
 * Room, on the targets that have it).
 *
 * One store per app. Keys are plain strings; values are strings, so encode anything richer
 * (kotlinx-serialization JSON is already on the classpath).
 *
 * | Target  | Backed by                                                       |
 * |---------|-----------------------------------------------------------------|
 * | Android | SharedPreferences (`context` is the Application)                |
 * | iOS     | NSUserDefaults                                                  |
 * | Desktop | an in-memory map: the JVM tier is harness infrastructure, and a |
 * |         | preview render or a test must leave nothing behind on the host  |
 * | Web     | the browser's `localStorage` (per origin); where the browser    |
 * |         | refuses it (site data blocked, quota full), memory for the page |
 */
expect class KeyValueStore(context: Any?) {
    fun getString(key: String): String?
    fun putString(key: String, value: String)
    fun remove(key: String)
}
