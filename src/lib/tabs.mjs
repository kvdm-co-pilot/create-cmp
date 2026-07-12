// Tab-driven surface regeneration (scaffold pipeline step b.3).
//
// The template ships the DEFAULT tabs (Home:home, Profile:person) baked into
// three surfaces; this module rewrites them from `config.tabs` at stamp time
// so a non-default tabs config can never go stale:
//   - presentation/navigation/AppTab.kt      (the appTabs() list — one entry per tab)
//   - presentation/navigation/AppNavHost.kt  (the appTabs(...) call-site wiring)
//   - qa/e2e/smoke.yaml                      (Maestro taps/asserts per tab)
// Tabs without a shipped feature screen (anything that doesn't slug to
// `home`/`profile`) get a generated PlaceholderScreen stub carrying the
// `<slug>_title` testTag the smoke flow asserts.
//
// Everything is written in TEMPLATE-TOKEN form (__PACKAGE__ contents, literal
// com/example/app paths) BEFORE token replacement / package rename, so the
// normal pipeline stamps these files like any other template file. For the
// default tabs config the output is byte-identical to the static template
// files — golden/deterministic scaffolding is a core product property.

import fs from "node:fs";
import path from "node:path";

// --- slug + naming ------------------------------------------------------------

/**
 * Nav-item tag slug for a tab label.
 * MUST MIRROR `navItemTag` in
 * template/composeApp/src/commonMain/kotlin/com/example/app/presentation/navigation/AppShell.kt:
 * lowercase, every run of chars outside [a-z0-9] collapsed to a single "_",
 * leading/trailing "_" trimmed. ("My Stuff!" → "my_stuff")
 * @param {string} label
 * @returns {string}
 */
export function navSlug(label) {
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Kotlin hard keywords — a derived parameter name colliding with one must be backticked.
const KOTLIN_HARD_KEYWORDS = new Set([
  "as", "break", "class", "continue", "do", "else", "false", "for", "fun",
  "if", "in", "interface", "is", "null", "object", "package", "return",
  "super", "this", "throw", "true", "try", "typealias", "typeof", "val",
  "var", "when", "while",
]);

/**
 * Kotlin parameter name for a tab: camelCase of the slug ("my_stuff" → "myStuff"),
 * backticked when it collides with a hard keyword or starts with a digit.
 * @param {string} slug
 * @returns {string}
 */
export function kotlinParamName(slug) {
  const parts = slug.split("_").filter(Boolean);
  const name = parts
    .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join("");
  if (KOTLIN_HARD_KEYWORDS.has(name) || /^[0-9]/.test(name)) return `\`${name}\``;
  return name;
}

/**
 * Material icon symbol for a CLI icon key: PascalCase the key's alphanumeric
 * parts ("home" → "Home", "shopping_cart" → "ShoppingCart", "ShoppingCart"
 * stays as-is). The template depends on compose.materialIconsExtended, so any
 * `Icons.Filled.*` symbol from the extended set resolves.
 * @param {string} key
 * @returns {string}
 */
export function iconSymbol(key) {
  return String(key)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
}

/** Escape a label for use inside a Kotlin double-quoted string literal. */
function kotlinString(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$");
}

/**
 * Derive per-tab info (slug, param, icon) and validate the set: every label
 * must produce a non-empty, unique slug (the slug is the nav testTag AND the
 * Kotlin parameter name — collisions or empties cannot compile/automate).
 * @param {Array<{label:string, icon:string}>} tabs
 */
export function tabInfos(tabs) {
  const seen = new Map();
  return tabs.map((tab) => {
    const slug = navSlug(tab.label);
    if (!slug) {
      throw new Error(
        `tab label ${JSON.stringify(tab.label)} produces an empty nav slug — labels need at least one [a-z0-9] character`
      );
    }
    if (seen.has(slug)) {
      throw new Error(
        `tab labels ${JSON.stringify(seen.get(slug))} and ${JSON.stringify(tab.label)} both slug to "${slug}" — nav testTags must be unique`
      );
    }
    seen.set(slug, tab.label);
    return { label: tab.label, slug, param: kotlinParamName(slug), icon: iconSymbol(tab.icon) };
  });
}

// --- generators ----------------------------------------------------------------

/**
 * Render AppTab.kt (template-token form). For the default tabs this reproduces
 * the static template file byte-for-byte.
 * @param {ReturnType<typeof tabInfos>} infos
 */
export function renderAppTabsKt(infos) {
  const iconImports = [...new Set(infos.map((t) => t.icon))]
    .sort()
    .map((i) => `import androidx.compose.material.icons.filled.${i}`)
    .join("\n");
  const params = infos.map((t) => `    ${t.param}: @Composable () -> Unit,`).join("\n");
  const entries = infos
    .map((t) => `    AppTab("${kotlinString(t.label)}", Icons.Filled.${t.icon}, ${t.param}),`)
    .join("\n");

  return `package __PACKAGE__.presentation.navigation

import androidx.compose.material.icons.Icons
${iconImports}
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector

// A single bottom-nav tab: its label, icon, and the screen it renders.
data class AppTab(
    val label: String,
    val icon: ImageVector,
    val content: @Composable () -> Unit,
)

// The tab list drives AppShell + AppBottomNav generically (no role-hardcoded shells).
// The scaffolder regenerates this list from the configured \`tabs\`.
@Composable
fun appTabs(
${params}
): List<AppTab> = listOf(
${entries}
)
`;
}

/**
 * Render qa/e2e/smoke.yaml (template-token form): launch, wait for the first
 * tab's content, then for each subsequent tab tap nav_<slug> and assert its
 * <slug>_title + the shell, then return to the first tab. Byte-identical to
 * the static template file for the default tabs.
 * @param {ReturnType<typeof tabInfos>} infos
 */
export function renderSmokeYaml(infos) {
  const [first, ...rest] = infos;
  const lines = [];
  lines.push(`# E2E smoke — Maestro flow. SPEC: SHELL-01, SHELL-02.
#
# Proves the real app boots on a device/emulator and the bottom-nav shell works.
# Selectors go by testTag (surfaced as resource-ids on Android via TestTagAutomation),
# never by display text. Nav-item ids are nav_<label-slug> — the slug rule lives in
# AppShell.kt's navItemTag (lowercase, non-[a-z0-9] runs collapsed to "_", trimmed);
# keep these ids in sync with it if the configured tabs change.
#
# Run:  maestro test qa/e2e/smoke.yaml      (device/emulator attached)
# The verify lane's e2eSmoke step runs this automatically when maestro + a device are present.
appId: __PACKAGE__
---
- launchApp:
    clearState: true

# SPEC: SHELL-01 — the app boots and the first tab renders inside the shell, bottom nav visible.
# Cold-start after clearState can take longer than a bare assert's default window on a slow/CI
# emulator (first Compose frame under load). Waiting for the first frame IS the SHELL-01 boot
# proof, so wait explicitly with a generous budget rather than asserting immediately.
- extendedWaitUntil:
    visible:
      id: "${first.slug}_title"
    timeout: 60000
- assertVisible:
    id: "app_bottom_nav"`);

  rest.forEach((tab, i) => {
    lines.push("");
    if (i === 0) lines.push("# SPEC: SHELL-02 — switching tabs keeps the shell");
    lines.push(`- tapOn:
    id: "nav_${tab.slug}"
- assertVisible:
    id: "${tab.slug}_title"
- assertVisible:
    id: "app_bottom_nav"`);
  });

  if (rest.length > 0) {
    lines.push("");
    lines.push(`# and back
- tapOn:
    id: "nav_${first.slug}"
- assertVisible:
    id: "${first.slug}_title"`);
  }

  return `${lines.join("\n")}\n`;
}

/** Call-site content lambda for one tab in AppNavHost's appTabs(...) call. */
function navHostTabArg(tab) {
  if (tab.slug === "home") {
    return `                ${tab.param} = {
                    HomeScreen(
                        onItemClick = { itemId -> navController.navigate(Routes.detail(itemId)) },
                    )
                },`;
  }
  if (tab.slug === "profile") {
    return `                ${tab.param} = { ProfileScreen() },`;
  }
  return `                ${tab.param} = { PlaceholderScreen(title = "${kotlinString(tab.label)}", titleTag = "${tab.slug}_title") },`;
}

// The exact template blocks AppNavHost rewriting anchors on. If the template
// drifts, rewriteNavHost throws instead of silently shipping stale wiring.
const NAVHOST_IMPORTS_ANCHOR = `import __PACKAGE__.presentation.home.HomeScreen
import __PACKAGE__.presentation.profile.ProfileScreen`;
const NAVHOST_TABS_OPEN = "            val tabs = appTabs(\n";
const NAVHOST_TABS_CLOSE = "\n            )\n";

/**
 * Rewrite AppNavHost.kt content: the screen imports and the appTabs(...) call
 * site, one argument per configured tab. Home/Profile slugs wire the shipped
 * feature screens; anything else wires a PlaceholderScreen stub.
 * @param {string} content template-token AppNavHost.kt content
 * @param {ReturnType<typeof tabInfos>} infos
 * @returns {string}
 */
export function rewriteNavHost(content, infos) {
  if (!content.includes(NAVHOST_IMPORTS_ANCHOR)) {
    throw new Error("AppNavHost.kt: screen-imports block not found — template drifted from the tab rewriter");
  }
  const start = content.indexOf(NAVHOST_TABS_OPEN);
  const end = start === -1 ? -1 : content.indexOf(NAVHOST_TABS_CLOSE, start);
  if (start === -1 || end === -1) {
    throw new Error("AppNavHost.kt: `val tabs = appTabs(` block not found — template drifted from the tab rewriter");
  }

  const imports = [];
  if (infos.some((t) => t.slug !== "home" && t.slug !== "profile")) {
    imports.push("import __PACKAGE__.presentation.components.PlaceholderScreen");
  }
  if (infos.some((t) => t.slug === "home")) {
    imports.push("import __PACKAGE__.presentation.home.HomeScreen");
  }
  if (infos.some((t) => t.slug === "profile")) {
    imports.push("import __PACKAGE__.presentation.profile.ProfileScreen");
  }

  const tabsBlock =
    NAVHOST_TABS_OPEN + infos.map(navHostTabArg).join("\n") + NAVHOST_TABS_CLOSE;

  return (
    content.slice(0, start) + tabsBlock + content.slice(end + NAVHOST_TABS_CLOSE.length)
  ).replace(NAVHOST_IMPORTS_ANCHOR, () => imports.join("\n"));
}

/**
 * Render the PlaceholderScreen stub (template-token form) — written only when
 * a configured tab has no shipped feature screen, so the default scaffold's
 * output is unchanged. Mirrors ProfileScreen's stub shape; the title testTag
 * is what qa/e2e/smoke.yaml asserts for the tab.
 */
export function renderPlaceholderScreenKt() {
  return `package __PACKAGE__.presentation.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import __PACKAGE__.presentation.theme.__THEME_PREFIX__Tokens

// Generated stub for a configured bottom-nav tab that has no feature yet.
// Build the real feature with the add-feature skill (qa/scaffold-feature.mjs),
// then swap this out in AppNavHost. The title testTag (\`<slug>_title\`) is what
// qa/e2e/smoke.yaml asserts for this tab — keep it when you replace the stub.
@Composable
fun PlaceholderScreen(title: String, titleTag: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(__THEME_PREFIX__Tokens.PaddingPage),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.semantics { testTag = titleTag },
        )
        Text(
            text = "This is a generated stub tab. Wire it up like the Home feature.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
`;
}

// --- pipeline entry --------------------------------------------------------------

const APPTAB_REL =
  "composeApp/src/commonMain/kotlin/com/example/app/presentation/navigation/AppTab.kt";
const NAVHOST_REL =
  "composeApp/src/commonMain/kotlin/com/example/app/presentation/navigation/AppNavHost.kt";
const PLACEHOLDER_REL =
  "composeApp/src/commonMain/kotlin/com/example/app/presentation/components/PlaceholderScreen.kt";
const SMOKE_REL = "qa/e2e/smoke.yaml";

/**
 * Rewrite every tab-driven surface present in the copied project dir. Runs
 * BEFORE token replacement and the package rename (files are addressed at
 * their literal com/example/app template paths and written in token form).
 * Surfaces missing from the tree (feature-stripped qa/e2e, synthetic test
 * templates) are skipped; a PRESENT AppNavHost that no longer contains the
 * expected blocks throws.
 * @param {string} projectDir
 * @param {Array<{label:string, icon:string}>} tabs
 * @param {(msg:string)=>void} [log]
 */
export function rewriteTabSurfaces(projectDir, tabs, log = () => {}) {
  const infos = tabInfos(tabs);

  const appTabPath = path.join(projectDir, APPTAB_REL);
  if (fs.existsSync(appTabPath)) {
    fs.writeFileSync(appTabPath, renderAppTabsKt(infos));
    log(`  tabs → ${APPTAB_REL}`);
  }

  const navHostPath = path.join(projectDir, NAVHOST_REL);
  if (fs.existsSync(navHostPath)) {
    const rewritten = rewriteNavHost(fs.readFileSync(navHostPath, "utf8"), infos);
    fs.writeFileSync(navHostPath, rewritten);
    log(`  tabs → ${NAVHOST_REL}`);
  }

  if (infos.some((t) => t.slug !== "home" && t.slug !== "profile")) {
    const placeholderPath = path.join(projectDir, PLACEHOLDER_REL);
    if (fs.existsSync(path.dirname(placeholderPath))) {
      fs.writeFileSync(placeholderPath, renderPlaceholderScreenKt());
      log(`  tabs → ${PLACEHOLDER_REL}`);
    }
  }

  const smokePath = path.join(projectDir, SMOKE_REL);
  if (fs.existsSync(smokePath)) {
    fs.writeFileSync(smokePath, renderSmokeYaml(infos));
    log(`  tabs → ${SMOKE_REL}`);
  }
}
