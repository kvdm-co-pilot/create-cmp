package __PACKAGE__.core.platform

import androidx.compose.runtime.Composable

/**
 * Prints an HTML document through the platform's own print UI: the system print dialog on
 * Android and iOS, and the browser's print window on the web. HTML is the one format every
 * target can lay out, so a label, a receipt or an agreement is written once.
 *
 * Obtain it in composition (`val printer = rememberDocumentPrinter()`): Android needs the
 * Activity to show the dialog and iOS needs the presenting view controller, which only the
 * composition knows.
 */
fun interface DocumentPrinter {
    /** Hands [html] to the print UI. [title] names the job (and the PDF, when saved as one). */
    fun printHtml(title: String, html: String): PrintOutcome
}

/** What happened when a document was handed to the platform. */
sealed interface PrintOutcome {
    /** The print UI is open with the document. Whether the user then printed is theirs. */
    data object Sent : PrintOutcome

    /** This target cannot print at all, and says why (the desktop JVM tier, a device with no print service). */
    data class Unsupported(val reason: String) : PrintOutcome

    /** The target can print, but this attempt did not reach the print UI. */
    data class Failed(val reason: String) : PrintOutcome
}

@Composable
expect fun rememberDocumentPrinter(): DocumentPrinter
