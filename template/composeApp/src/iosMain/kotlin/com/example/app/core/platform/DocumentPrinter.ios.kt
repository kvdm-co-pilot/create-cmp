package __PACKAGE__.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import platform.UIKit.UIMarkupTextPrintFormatter
import platform.UIKit.UIPrintInfo
import platform.UIKit.UIPrintInfoOutputType
import platform.UIKit.UIPrintInteractionController

@Composable
actual fun rememberDocumentPrinter(): DocumentPrinter = remember { IosDocumentPrinter() }

private class IosDocumentPrinter : DocumentPrinter {
    override fun printHtml(title: String, html: String): PrintOutcome {
        if (!UIPrintInteractionController.isPrintingAvailable()) {
            return PrintOutcome.Unsupported("printing is not available on this device")
        }
        val info = UIPrintInfo.printInfo()
        info.jobName = title
        info.outputType = UIPrintInfoOutputType.UIPrintInfoOutputGeneral
        val controller = UIPrintInteractionController.sharedPrintController
        controller.printInfo = info
        controller.printFormatter = UIMarkupTextPrintFormatter(markupText = html)
        val shown = controller.presentAnimated(true, completionHandler = null)
        return if (shown) PrintOutcome.Sent else PrintOutcome.Failed("the print dialog did not open")
    }
}
