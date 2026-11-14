package __PACKAGE__.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import kotlinx.browser.document
import org.w3c.dom.HTMLIFrameElement

@Composable
actual fun rememberDocumentPrinter(): DocumentPrinter = remember { WebDocumentPrinter() }

// The document is laid out in a hidden iframe and printed from there, so the browser's print
// window shows the document alone and not the app's canvas. Any printer the browser can reach
// works, label printers included: size the page with CSS `@page { size: 62mm 29mm; margin: 0 }`.
private class WebDocumentPrinter : DocumentPrinter {
    override fun printHtml(title: String, html: String): PrintOutcome {
        val body = document.body ?: return PrintOutcome.Failed("the page has no body to print from")
        val frame = document.createElement("iframe") as HTMLIFrameElement
        frame.setAttribute("aria-hidden", "true")
        frame.setAttribute("style", "position:fixed;right:0;bottom:0;width:0;height:0;border:0")
        frame.addEventListener("load") {
            val window = frame.contentWindow
            if (window == null) {
                frame.remove()
            } else {
                frame.contentDocument?.title = title
                window.addEventListener("afterprint") { frame.remove() }
                window.focus()
                window.print()
            }
        }
        frame.srcdoc = html
        body.appendChild(frame)
        return PrintOutcome.Sent
    }
}
