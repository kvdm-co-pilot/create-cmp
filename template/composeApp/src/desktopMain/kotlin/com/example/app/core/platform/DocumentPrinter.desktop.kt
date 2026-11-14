package __PACKAGE__.core.platform

import androidx.compose.runtime.Composable

// Not on desktop, by design: the JVM target is harness infrastructure, not a shipped app
// (docs/adr/0003), so it says so in the result instead of pretending to print.
private val notOnDesktop = DocumentPrinter { _, _ ->
    PrintOutcome.Unsupported("not on desktop: the JVM target is harness infrastructure, not a shipped app")
}

@Composable
actual fun rememberDocumentPrinter(): DocumentPrinter = notOnDesktop
