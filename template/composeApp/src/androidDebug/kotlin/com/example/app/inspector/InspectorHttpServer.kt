package __PACKAGE__.inspector

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlinx.serialization.json.JsonPrimitive

/**
 * Debug-only, zero-dependency inspection server: a hand-rolled HTTP/1.1 responder over a
 * plain [ServerSocket]. Binds LOOPBACK ONLY (never on the LAN); the host reaches it via
 * `adb forward tcp:9500 tcp:9500`.
 *
 * Routes (all `application/json; charset=utf-8`, `Connection: close`):
 *   GET /inspect/health         → { status, schemaVersion, source, appId, buildType }
 *   GET /inspect/tree           → the semantics-tree contract document (source "live-android"),
 *                                 read from the topmost Compose root ON THE MAIN THREAD.
 *                                 503 while no Compose root is attached yet (cold start).
 *   GET /inspect/design-system  → the declared token catalog { colors, dimens }.
 *
 * Single-threaded accept loop on a daemon thread = one client at a time = bounded by design.
 * Failure to bind logs a warning and gives up — the inspector must never crash or block
 * app startup. This class exists only in the androidDebug source set; release builds do
 * not compile it at all.
 */
object InspectorHttpServer {

    const val PORT = 9500
    private const val TAG = "CmpInspector"

    // The main thread is busy during cold start (first setContent/layout) — be generous.
    private const val MAIN_THREAD_TIMEOUT_MS = 5_000L

    @Volatile private var started = false

    fun start(appId: String) {
        if (started) return
        started = true
        val thread = Thread({ serve(appId) }, "cmp-inspector-http")
        thread.isDaemon = true
        thread.start()
    }

    private fun serve(appId: String) {
        val socket = try {
            ServerSocket(PORT, 1, InetAddress.getLoopbackAddress())
        } catch (t: Throwable) {
            Log.w(TAG, "inspector server failed to bind 127.0.0.1:$PORT — giving up", t)
            return
        }
        Log.i(TAG, "inspector server listening on 127.0.0.1:$PORT (debug build only)")
        while (true) {
            val client = try {
                socket.accept()
            } catch (t: Throwable) {
                Log.w(TAG, "inspector accept failed — stopping", t)
                return
            }
            try {
                client.use { handle(it, appId) }
            } catch (t: Throwable) {
                // Never let a bad request take the app (or the accept loop) down.
                Log.w(TAG, "inspector request failed", t)
            }
        }
    }

    private fun handle(client: Socket, appId: String) {
        client.soTimeout = 5_000
        val reader = BufferedReader(InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8))
        val requestLine = reader.readLine() ?: return
        // Drain headers (we never need them).
        while (true) {
            val line = reader.readLine() ?: break
            if (line.isEmpty()) break
        }
        val parts = requestLine.split(" ")
        val method = parts.getOrNull(0) ?: ""
        val path = (parts.getOrNull(1) ?: "").substringBefore('?')

        val (status, body) = when {
            method != "GET" -> 405 to errorJson("method not allowed")
            path == "/inspect/health" -> 200 to healthJson(appId)
            path == "/inspect/tree" -> treeResponse()
            path == "/inspect/design-system" -> 200 to InspectorCatalog.json()
            else -> 404 to errorJson("unknown path")
        }
        writeResponse(client, status, body)
    }

    private fun healthJson(appId: String): String =
        """{"status":"ok","schemaVersion":1,"source":"live-android","appId":${JsonPrimitive(appId)},"buildType":"debug"}"""

    private fun treeResponse(): Pair<Int, String> {
        val root = ComposeRootRegistry.current()
            ?: return 503 to errorJson(
                "compose root not ready yet — no Compose root attached (cold start?). Retry shortly."
            )
        // Semantics/layout nodes are not thread-safe: read the tree on the main thread and
        // await with a generous timeout (the main thread is busy during first composition).
        val result = AtomicReference<Pair<Int, String>>()
        val latch = CountDownLatch(1)
        Handler(Looper.getMainLooper()).post {
            result.set(
                try {
                    // Merged tree — matches the Phase 0 harness (onRoot() default).
                    200 to LiveSemanticsJson.dumpTree(root.semanticsOwner.rootSemanticsNode)
                } catch (t: Throwable) {
                    500 to errorJson("failed to walk semantics tree: ${t.message}")
                }
            )
            latch.countDown()
        }
        return if (latch.await(MAIN_THREAD_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            result.get()
        } else {
            503 to errorJson("main thread did not respond within ${MAIN_THREAD_TIMEOUT_MS}ms — app busy (cold start?). Retry.")
        }
    }

    private fun errorJson(message: String): String =
        """{"error":${JsonPrimitive(message)}}"""

    private fun writeResponse(client: Socket, status: Int, body: String) {
        val reason = when (status) {
            200 -> "OK"
            404 -> "Not Found"
            405 -> "Method Not Allowed"
            503 -> "Service Unavailable"
            else -> "Internal Server Error"
        }
        val bytes = body.toByteArray(StandardCharsets.UTF_8)
        val head = buildString {
            append("HTTP/1.1 ").append(status).append(' ').append(reason).append("\r\n")
            append("Content-Type: application/json; charset=utf-8\r\n")
            append("Content-Length: ").append(bytes.size).append("\r\n")
            append("Connection: close\r\n")
            append("\r\n")
        }
        val out = client.getOutputStream()
        out.write(head.toByteArray(StandardCharsets.UTF_8))
        out.write(bytes)
        out.flush()
    }
}
