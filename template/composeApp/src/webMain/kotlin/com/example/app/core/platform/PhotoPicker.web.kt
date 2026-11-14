package __PACKAGE__.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import kotlinx.browser.document
import org.khronos.webgl.ArrayBuffer
import org.khronos.webgl.Int8Array
import org.khronos.webgl.get
import org.w3c.dom.HTMLInputElement
import org.w3c.files.FileReader
import org.w3c.files.get

@Composable
actual fun rememberPhotoPicker(onResult: (PickedPhoto?) -> Unit): PhotoPicker {
    val deliver by rememberUpdatedState(onResult)
    return remember { PhotoPicker { openFileInput { deliver(it) } } }
}

// A file input for images. With no `capture` attribute a phone browser offers the camera AND the
// photo library; add `capture="environment"` to go straight to the back camera instead.
@OptIn(ExperimentalWasmJsInterop::class) // reader.result is a JsAny; unsafeCast reads it as the ArrayBuffer it is
private fun openFileInput(deliver: (PickedPhoto?) -> Unit) {
    val input = document.createElement("input") as HTMLInputElement
    input.type = "file"
    input.accept = "image/*"
    input.addEventListener("change") {
        val file = input.files?.get(0)
        if (file == null) {
            deliver(null)
        } else {
            val reader = FileReader()
            reader.addEventListener("load") {
                val buffer = reader.result?.unsafeCast<ArrayBuffer>()
                deliver(buffer?.let { PickedPhoto(it.toByteArray(), file.type.ifEmpty { null }, file.name) })
            }
            reader.addEventListener("error") { deliver(null) }
            reader.readAsArrayBuffer(file)
        }
    }
    // A dismissed chooser fires `cancel` and never `change`: the contract's null for a cancel.
    input.addEventListener("cancel") { deliver(null) }
    input.click()
}

private fun ArrayBuffer.toByteArray(): ByteArray {
    val view = Int8Array(this)
    return ByteArray(view.length) { view[it] }
}
