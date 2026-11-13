package __PACKAGE__.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.usePinned
import platform.Foundation.NSData
import platform.PhotosUI.PHPickerConfiguration
import platform.PhotosUI.PHPickerFilter
import platform.PhotosUI.PHPickerResult
import platform.PhotosUI.PHPickerViewController
import platform.PhotosUI.PHPickerViewControllerDelegateProtocol
import platform.UIKit.UIApplication
import platform.UIKit.UIViewController
import platform.darwin.NSObject
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_main_queue
import platform.posix.memcpy

@Composable
actual fun rememberPhotoPicker(onResult: (PickedPhoto?) -> Unit): PhotoPicker {
    val deliver by rememberUpdatedState(onResult)
    return remember { IosPhotoPicker { deliver(it) } }
}

private class IosPhotoPicker(private val deliver: (PickedPhoto?) -> Unit) : PhotoPicker {

    // PHPickerViewController holds its delegate weakly, so the picker keeps it alive here.
    private var delegate: PickerDelegate? = null

    override fun launch() {
        val presenter = topViewController() ?: return deliver(null)
        val configuration = PHPickerConfiguration().apply {
            filter = PHPickerFilter.imagesFilter
            selectionLimit = 1
        }
        val picker = PHPickerViewController(configuration = configuration)
        val pickerDelegate = PickerDelegate(deliver)
        delegate = pickerDelegate
        picker.delegate = pickerDelegate
        presenter.presentViewController(picker, animated = true, completion = null)
    }
}

private class PickerDelegate(
    private val deliver: (PickedPhoto?) -> Unit,
) : NSObject(), PHPickerViewControllerDelegateProtocol {

    override fun picker(picker: PHPickerViewController, didFinishPicking: List<*>) {
        picker.dismissViewControllerAnimated(true, completion = null)
        val result = didFinishPicking.firstOrNull() as? PHPickerResult ?: return deliver(null)
        // "public.jpeg" asks the provider to convert (HEIC included), so every photo arrives as JPEG.
        result.itemProvider.loadDataRepresentationForTypeIdentifier("public.jpeg") { data, _ ->
            val photo = data?.toByteArray()?.let { PickedPhoto(it, "image/jpeg", name = null) }
            dispatch_async(dispatch_get_main_queue()) { deliver(photo) }
        }
    }
}

private fun topViewController(): UIViewController? {
    var top = UIApplication.sharedApplication.keyWindow?.rootViewController ?: return null
    while (true) top = top.presentedViewController ?: return top
}

private fun NSData.toByteArray(): ByteArray {
    val size = length.toInt()
    val out = ByteArray(size)
    if (size > 0) out.usePinned { memcpy(it.addressOf(0), bytes, length) }
    return out
}
