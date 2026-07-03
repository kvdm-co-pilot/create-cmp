package __PACKAGE__.inspector

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Colors
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The declared design-system catalog, served on GET /inspect/design-system in the shape the
 * cmp-inspector MCP consumes: `{ "colors": {name: "#RRGGBB"}, "dimens": {name: "16dp"} }`.
 *
 * Hand-registry by design (no kotlin-reflect, no codegen): values are read from the REAL
 * `__THEME_PREFIX__Colors` / `__THEME_PREFIX__Tokens` objects — never string-literal
 * duplicates — so renaming a token breaks this file at compile time. If you ADD a token to
 * the theme, add it here too (`create-cmp doctor` warns when a declared token is missing).
 */
object InspectorCatalog {

    private val prettyJson = Json { prettyPrint = true }

    fun json(): String {
        val doc = buildJsonObject {
            put("colors", buildJsonObject {
                put("Primary", __THEME_PREFIX__Colors.Primary.toHex())
                put("OnPrimary", __THEME_PREFIX__Colors.OnPrimary.toHex())
                put("Accent", __THEME_PREFIX__Colors.Accent.toHex())
                put("OnAccent", __THEME_PREFIX__Colors.OnAccent.toHex())
                put("Secondary", __THEME_PREFIX__Colors.Secondary.toHex())
                put("Error", __THEME_PREFIX__Colors.Error.toHex())
                put("Success", __THEME_PREFIX__Colors.Success.toHex())
                put("Warning", __THEME_PREFIX__Colors.Warning.toHex())
                put("Info", __THEME_PREFIX__Colors.Info.toHex())
                put("Background", __THEME_PREFIX__Colors.Background.toHex())
                put("Surface", __THEME_PREFIX__Colors.Surface.toHex())
                put("SurfaceVariant", __THEME_PREFIX__Colors.SurfaceVariant.toHex())
                put("OnSurface", __THEME_PREFIX__Colors.OnSurface.toHex())
                put("OnSurfaceVariant", __THEME_PREFIX__Colors.OnSurfaceVariant.toHex())
                put("Outline", __THEME_PREFIX__Colors.Outline.toHex())
                put("OutlineVariant", __THEME_PREFIX__Colors.OutlineVariant.toHex())
                put("Divider", __THEME_PREFIX__Colors.Divider.toHex())
            })
            put("dimens", buildJsonObject {
                put("ElevationCard", __THEME_PREFIX__Tokens.ElevationCard.token())
                put("ElevationModal", __THEME_PREFIX__Tokens.ElevationModal.token())
                put("PaddingPage", __THEME_PREFIX__Tokens.PaddingPage.token())
                put("PaddingCard", __THEME_PREFIX__Tokens.PaddingCard.token())
                put("GapCard", __THEME_PREFIX__Tokens.GapCard.token())
                put("BottomNavHeight", __THEME_PREFIX__Tokens.BottomNavHeight.token())
                put("RadiusCard", __THEME_PREFIX__Tokens.RadiusCard.token())
                put("RadiusPill", __THEME_PREFIX__Tokens.RadiusPill.token())
                put("RadiusModal", __THEME_PREFIX__Tokens.RadiusModal.token())
                put("RadiusInput", __THEME_PREFIX__Tokens.RadiusInput.token())
            })
        }
        return prettyJson.encodeToString(JsonElement.serializer(), doc)
    }

    /** "#RRGGBB" for fully-opaque colours (the catalog convention), "#AARRGGBB" otherwise. */
    private fun Color.toHex(): String {
        val argb = toArgb()
        val alpha = (argb ushr 24) and 0xFF
        return if (alpha == 0xFF) {
            "#%06X".format(argb and 0xFFFFFF)
        } else {
            "#%08X".format(argb)
        }
    }

    /** "16dp" (integer dp values render without the decimal point). */
    private fun Dp.token(): String {
        val v = value
        return if (v == v.toInt().toFloat()) "${v.toInt()}dp" else "${v}dp"
    }
}
