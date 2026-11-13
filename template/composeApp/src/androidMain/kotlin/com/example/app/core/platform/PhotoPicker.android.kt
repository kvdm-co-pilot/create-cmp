package __PACKAGE__.core.platform

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext

@Composable
actual fun rememberPhotoPicker(onResult: (PickedPhoto?) -> Unit): PhotoPicker {
    val context = LocalContext.current
    val deliver by rememberUpdatedState(onResult)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        deliver(uri?.let { readPhoto(context, it) })
    }
    return remember(launcher) {
        PhotoPicker { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
    }
}

// Read on the caller's thread: one photo, once. Move it to Dispatchers.IO if photos get large.
private fun readPhoto(context: Context, uri: Uri): PickedPhoto? =
    runCatching {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
        PickedPhoto(bytes, context.contentResolver.getType(uri), name = null)
    }.getOrNull()
