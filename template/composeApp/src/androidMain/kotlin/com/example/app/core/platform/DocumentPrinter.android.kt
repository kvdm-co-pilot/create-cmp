package __PACKAGE__.core.platform

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
actual fun rememberDocumentPrinter(): DocumentPrinter {
    // The composition's context is the Activity, which PrintManager.print requires.
    val context = LocalContext.current
    return remember(context) { AndroidDocumentPrinter(context) }
}

private class AndroidDocumentPrinter(private val context: Context) : DocumentPrinter {

    // Held for the life of the job: a WebView collected before the print framework has laid
    // the document out prints a blank page.
    private var layoutView: WebView? = null

    override fun printHtml(title: String, html: String): PrintOutcome {
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager
            ?: return PrintOutcome.Unsupported("this device has no print service")
        return runCatching {
            val view = WebView(context)
            layoutView = view
            view.webViewClient = object : WebViewClient() {
                override fun onPageFinished(page: WebView, url: String?) {
                    printManager.print(title, page.createPrintDocumentAdapter(title), PrintAttributes.Builder().build())
                }
            }
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
            PrintOutcome.Sent
        }.getOrElse { PrintOutcome.Failed(it.message ?: it::class.simpleName.orEmpty()) }
    }
}
