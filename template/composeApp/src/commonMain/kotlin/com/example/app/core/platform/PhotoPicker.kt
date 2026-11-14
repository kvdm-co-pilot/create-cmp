package __PACKAGE__.core.platform

import androidx.compose.runtime.Composable

/**
 * One photo chosen by the user, as bytes, ready to show (Coil reads a ByteArray) or upload.
 */
class PickedPhoto(
    val bytes: ByteArray,
    /** `image/jpeg`, `image/png`, … when the platform says; null when it does not. */
    val mimeType: String?,
    /** The file name when the platform has one (desktop, web); null for a library photo. */
    val name: String?,
)

/** Opens the platform's photo chooser. The result arrives in the callback given to [rememberPhotoPicker]. */
fun interface PhotoPicker {
    fun launch()
}

/**
 * The platform's own photo chooser, remembered in composition. [onResult] receives the photo,
 * or null when the user cancelled or the photo could not be read.
 *
 * | Target  | Chooser                                                                 |
 * |---------|-------------------------------------------------------------------------|
 * | Android | the system photo picker (no permission needed)                          |
 * | iOS     | PHPickerViewController (no permission needed), delivered as JPEG        |
 * | Desktop | an AWT file dialog filtered to images                                   |
 * | Web     | a file input for images; phone browsers offer the camera or the library |
 */
@Composable
expect fun rememberPhotoPicker(onResult: (PickedPhoto?) -> Unit): PhotoPicker
