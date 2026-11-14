package __PACKAGE__.core.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import java.awt.FileDialog
import java.awt.Frame
import java.nio.file.Files

private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "bmp")

@Composable
actual fun rememberPhotoPicker(onResult: (PickedPhoto?) -> Unit): PhotoPicker {
    val deliver by rememberUpdatedState(onResult)
    return remember {
        PhotoPicker {
            val dialog = FileDialog(null as Frame?, "Choose a photo", FileDialog.LOAD)
            dialog.setFilenameFilter { _, name -> name.substringAfterLast('.').lowercase() in IMAGE_EXTENSIONS }
            dialog.isVisible = true // blocks until the user chooses or cancels
            val file = dialog.files.firstOrNull()
            deliver(
                file?.let {
                    runCatching { PickedPhoto(it.readBytes(), Files.probeContentType(it.toPath()), it.name) }.getOrNull()
                },
            )
        }
    }
}
