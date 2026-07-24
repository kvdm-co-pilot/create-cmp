package com.createcmp.inspector

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlin.math.roundToInt

/**
 * Walks a Compose [SemanticsNode] tree and serialises it to JSON matching the inspector
 * contract (schemaVersion 1, source "headless-jvm"). Every node carries pixel, root-relative
 * [bounds] and a (possibly empty) `children` array; testTag/text/contentDescription/designToken
 * are nullable.
 *
 * Additive contract extension (still schemaVersion 1 — optional fields, absent/null-safe for
 * old consumers):
 *  - `role`      string|null — [SemanticsProperties.Role] (e.g. "Button", "Checkbox").
 *  - `clickable` boolean     — presence of [SemanticsActions.OnClick].
 *  - `disabled`  boolean     — presence of [SemanticsProperties.Disabled].
 */
object SemanticsJson {

    private val prettyJson = Json { prettyPrint = true }

    /** Serialises [root] as the top-level contract document string. */
    fun dumpTree(root: SemanticsNode): String {
        val doc = buildJsonObject {
            put("schemaVersion", JsonPrimitive(1))
            put("source", JsonPrimitive("headless-jvm"))
            put("root", nodeToJson(root))
        }
        return prettyJson.encodeToString(JsonElement.serializer(), doc)
    }

    private fun nodeToJson(node: SemanticsNode): JsonObject = buildJsonObject {
        put("testTag", node.testTag().toJson())
        put("text", node.text().toJson())
        put("contentDescription", node.contentDescription().toJson())
        put("role", node.roleName().toJson())
        put("clickable", JsonPrimitive(node.isClickable()))
        put("disabled", JsonPrimitive(node.isDisabled()))
        put("bounds", node.boundsJson())
        put("size", node.sizeJson())
        put("designToken", node.designTokenJson())
        put("children", buildJsonArray {
            node.children.forEach { add(nodeToJson(it)) }
        })
    }

    private fun SemanticsNode.testTag(): String? =
        config.getOrNull(SemanticsProperties.TestTag)

    private fun SemanticsNode.text(): String? =
        config.getOrNull(SemanticsProperties.Text)
            ?.joinToString(separator = " ") { it.text }
            ?.takeIf { it.isNotEmpty() }

    private fun SemanticsNode.contentDescription(): String? =
        config.getOrNull(SemanticsProperties.ContentDescription)
            ?.joinToString(separator = " ")
            ?.takeIf { it.isNotEmpty() }

    private fun SemanticsNode.roleName(): String? =
        config.getOrNull(SemanticsProperties.Role)?.toString()

    private fun SemanticsNode.isClickable(): Boolean =
        config.contains(SemanticsActions.OnClick)

    private fun SemanticsNode.isDisabled(): Boolean =
        config.contains(SemanticsProperties.Disabled)

    /** Full composed (unclipped) size — additive contract field; `bounds` is the clipped slice. */
    private fun SemanticsNode.sizeJson(): JsonObject = buildJsonObject {
        put("width", JsonPrimitive(size.width))
        put("height", JsonPrimitive(size.height))
    }

    private fun SemanticsNode.boundsJson(): JsonObject {
        val rect = boundsInRoot
        return buildJsonObject {
            put("x", JsonPrimitive(rect.left.roundToInt()))
            put("y", JsonPrimitive(rect.top.roundToInt()))
            put("width", JsonPrimitive(rect.width.roundToInt()))
            put("height", JsonPrimitive(rect.height.roundToInt()))
        }
    }

    private fun SemanticsNode.designTokenJson(): JsonElement {
        val info = config.getOrNull(DesignTokenKey) ?: return JsonNull
        return buildJsonObject {
            put("tokens", buildJsonArray { info.tokens.forEach { add(JsonPrimitive(it)) } })
            put("resolved", buildJsonObject {
                info.resolved.forEach { (k, v) -> put(k, JsonPrimitive(v)) }
            })
        }
    }

    private fun String?.toJson(): JsonElement =
        if (this == null) JsonNull else JsonPrimitive(this)
}
