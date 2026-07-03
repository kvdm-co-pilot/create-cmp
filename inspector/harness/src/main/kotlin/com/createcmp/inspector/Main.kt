package com.createcmp.inspector

import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.runComposeUiTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import java.io.File

/**
 * Headless CLI entrypoint. Composes [SampleScreen] with no window/emulator/device via
 * `runComposeUiTest`, walks the semantics tree, and writes the contract JSON. Also emits
 * the declared design-system catalog. Exits 0 with no manual interaction.
 *
 * Usage:
 *   ./gradlew run --args="--out out/tree.json --tokens-out out/design-system.json"
 */
@OptIn(ExperimentalTestApi::class)
fun main(args: Array<String>) {
    val outPath = args.argValue("--out") ?: "out/tree.json"
    val tokensOutPath = args.argValue("--tokens-out") ?: "out/design-system.json"

    var treeJson = ""
    runComposeUiTest {
        setContent { SampleScreen() }
        val root = onRoot().fetchSemanticsNode()
        treeJson = SemanticsJson.dumpTree(root)
    }

    writeFile(outPath, treeJson)
    writeFile(tokensOutPath, designSystemCatalog())

    // Print the tree to stdout for immediate inspection.
    println(treeJson)
    System.err.println("Wrote tree      -> ${File(outPath).absolutePath}")
    System.err.println("Wrote catalog   -> ${File(tokensOutPath).absolutePath}")
}

private fun Array<String>.argValue(flag: String): String? {
    val i = indexOf(flag)
    return if (i >= 0 && i + 1 < size) this[i + 1] else null
}

private fun writeFile(path: String, content: String) {
    val file = File(path)
    file.parentFile?.mkdirs()
    file.writeText(content)
}

/**
 * The declared design-system catalog for the sample — the template's seed colors + dimen
 * tokens. The MCP diffs a rendered tree's resolved values against this.
 */
private fun designSystemCatalog(): String {
    val pretty = Json { prettyPrint = true }
    val doc = buildJsonObject {
        put("colors", buildJsonObject {
            put("Primary", str("#0A2540"))
            put("OnPrimary", str("#FFFFFF"))
            put("Accent", str("#00E676"))
            put("OnAccent", str("#0A2540"))
            put("Secondary", str("#00B96B"))
            put("Error", str("#DC2626"))
            put("Success", str("#16A34A"))
            put("Warning", str("#F59E0B"))
            put("Info", str("#2563EB"))
            put("Background", str("#F7F9FC"))
            put("Surface", str("#FFFFFF"))
            put("SurfaceVariant", str("#E8EDF3"))
            put("OnSurface", str("#1A1A1A"))
            put("OnSurfaceVariant", str("#6B7280"))
            put("Outline", str("#9CA3AF"))
            put("OutlineVariant", str("#E5E7EB"))
            put("Divider", str("#E5E7EB"))
        })
        put("dimens", buildJsonObject {
            put("ElevationCard", str("2dp"))
            put("ElevationModal", str("8dp"))
            put("PaddingPage", str("16dp"))
            put("PaddingCard", str("16dp"))
            put("GapCard", str("12dp"))
            put("BottomNavHeight", str("72dp"))
            put("RadiusCard", str("16dp"))
            put("RadiusPill", str("999dp"))
            put("RadiusModal", str("24dp"))
            put("RadiusInput", str("14dp"))
        })
    }
    return pretty.encodeToString(JsonElement.serializer(), doc)
}

private fun str(v: String): JsonElement = JsonPrimitive(v)
