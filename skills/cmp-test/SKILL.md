---
name: cmp-test
description: >-
  Generate a regression test suite for a Compose Multiplatform app by OBSERVING it — read the running
  app's semantics tree as JSON via the cmp-inspector MCP (testTags, text, clickables, bounds, nav
  state), derive a test plan from what actually rendered, and write the tests into the app's shipped
  harness (Maestro flows in qa/e2e/*.yaml with testTag selectors, plus spec-cited Compose UI tests).
  Use this when the user says "write tests for my app", "create a regression suite", "test this
  screen", "cover this flow with tests", "add UI tests to my CMP app", or "generate tests from the
  running app". Tests are derived from the rendered structure — never guessed from source, never from
  screenshots.
---

# cmp-test — generate the regression suite from the rendered tree

> Current scaffolds ship **Maestro** flows (`qa/e2e/*.yaml` — `# SPEC:`-cited, testTag `id:` selectors;
> see `smoke.yaml` for the shape). Durable screen behavior belongs in Compose UI Tests (spec-cited);
> E2E stays a thin smoke layer. Only if the app carries `qa/appium/` or `tests/appium/` (a stamp from
> before Maestro): read `${CLAUDE_PLUGIN_ROOT}/skills/cmp-test/references/legacy-appium.md` for that
> harness's §3 and §5.

## Before anything: confirm the capability (fail loud)

The cmp-inspector MCP tools are a capability, not a given. Before your first inspector call,
confirm they resolve (ToolSearch for "cmp-inspector"). If no tools match, **STOP — do not fall
back to screenshots, raw adb, or uiautomator dumps silently.** Diagnose in order and REPORT to
the human:

1. **Plugin enabled?** Check `enabledPlugins` in `~/.claude/settings.json` (or the project's
   `.claude/settings.json`).
2. **Session older than the plugin's enablement?** MCP servers attach at session START — a
   session born without the plugin never gains its tools, and no amount of in-session
   retrying will surface them. The fix is restarting the session.
3. **Plugin copy stale or server broken?** Run cmp-doctor's inspector-MCP check group.

Only after reporting may the documented degraded path (tier-2 uiautomator page-source) be
used — and the report must name what is lost: structured semantics trees replaced by pixels
and raw XML.

Your job: turn "write tests for my app" into a committed, passing E2E suite — by **observing
the app, not guessing from source**. Every create-cmp app is AI-inspectable: the `cmp-inspector`
MCP reads the running UI as structured JSON (testTags, text, clickable nodes, bounds, navigation
state). You read that tree, enumerate what's actually on screen, derive the assertions, and emit
tests in the app's shipped harness style. Nothing else in the CMP ecosystem can close this loop.

> **Assert on structure, never pixels.** Selectors are testTags / contentDescription / text —
> semantics that survive layout changes. Coordinates are ONLY for driving taps while you observe,
> and are derived fresh from the tree each run — a coordinate or a screenshot in a committed test
> is a bug in the test.

## 1. Observe — get the tree, walk the app

**Preferred (live, tier 1):** the running debug app.

1. Build + launch the DEBUG app (`./gradlew :composeApp:installDebug`, launch it). The inspector
   server (`127.0.0.1:9500`, debug builds only) is on by default in scaffolded apps.
2. `connect_live { port?: 9500 }` — one bounded `adb forward` + health check; sets the session
   default source.
3. `inspect_tree` (or `{ source: { kind: "live" } }`) — the CURRENT screen as JSON.

**Fallback (file, tier 0):** a harness dump on disk — `inspect_tree { treePath }`. Use when no
emulator is available; `${CLAUDE_PLUGIN_ROOT}/inspector/harness/sample-tree.json` shows the shape.

From each tree, enumerate the raw material:

- **testTags** — every non-null `testTag` (e.g. `home_title`, `home_action`, `app_bottom_nav`).
- **Clickables** — every node with `clickable: true`, plus its label (text / contentDescription /
  descendant text).
- **Text content** — the stable, key strings (titles, list items, button labels).
- **Reachable screens** — navigate and re-fetch: tap a bottom-nav item or a clickable card **at
  the center of its tree-derived `bounds`** (`adb shell input tap x y`, or Appium), then
  `inspect_tree` again. The structural delta (old testTags gone, new content present) IS the
  navigation fact you'll later assert. Keep this **bounded**: the bottom-nav tabs plus one
  representative drill-down per list — a handful of screens, not a crawl.

## 2. Derive the test plan

Per observed screen, four layers:

| Layer | What to generate | Source of truth |
|---|---|---|
| **Existence** | every tagged node is present; key text renders (title, first list items) | the tree's `testTag` / `text` fields |
| **Interaction** | each clickable → its expected tree change (card tap → detail content appears, old title gone) | the before/after trees you observed in step 1 |
| **Navigation** | bottom-nav round-trips: tab A → tab B → back to A, asserting each screen's marker node | nav-state deltas observed live |
| **Structural (CI)** | a golden-tree baseline per screen (`qa/golden/`), diffed by the lane's `goldenTrees` step on every run | the normalized tree itself — see §6 |

Rules that make the plan durable:

- Assert on **testTags and semantics**, never on pixels and never on coordinates.
- Geometry claims (a 48dp touch target, a 12dp card gap) belong to the **inspector/lane layer**
  (the lane's `a11y` step, `inspect_tree { includeLayoutGaps: true }`, golden trees), not to an
  E2E flow — don't bend a flow runner into measuring rects.
- Prefer a screen's **tagged marker node** (e.g. `home_title`) as its "I am here" assertion;
  fall back to a distinctive text only when no tag exists (then see §4).

## 3. Generate — Maestro flows in `qa/e2e/`

Write each flow as a top-level `qa/e2e/<flow>.yaml` (a flow in a subfolder does not run and does
not count as coverage). Copy `qa/e2e/smoke.yaml`'s shape: a header naming the `# SPEC:` clauses
the flow proves, `appId` copied from `smoke.yaml`, then steps, each citing the tree node it came
from. The verify lane's `e2eSmoke` step runs every top-level flow; `qa/e2e/README.md` has the rest.

**Worked example** — a flow for the template's Home → Detail drill-down, derived from two
observed trees (Home, then Detail after tapping the first item). Every id below was read from a
tree, not from source:

```yaml
# Generated regression flow — Home → Detail drill-down. SPEC: <the Home/Detail clauses it proves>
# Derived from the rendered trees (connect_live → inspect_tree on Home, tap, inspect_tree again).
# Selectors by testTag only (resource-ids on Android via TestTagAutomation) — never coordinates.
appId: com.acme.app            # copy from qa/e2e/smoke.yaml
---
- launchApp:
    clearState: true

# Tree (Home): testTag="home_title" — the screen's "I am here" marker.
- extendedWaitUntil:
    visible:
      id: "home_title"
    timeout: 60000

# Tree (Home): testTag="home_item_1", clickable — rows appear after the Loading arm, so wait.
- extendedWaitUntil:
    visible:
      id: "home_item_1"
    timeout: 30000
- tapOn:
    id: "home_item_1"

# Tree delta (Detail): detail_title present, home_title gone — the navigation fact.
- assertVisible:
    id: "detail_title"
- assertNotVisible:
    id: "home_title"

# Tree (Detail): testTag="detail_back", clickable — and back.
- tapOn:
    id: "detail_back"
- assertVisible:
    id: "home_title"
```

`extendedWaitUntil` follows any interaction that triggers an async state change (the settle rule
in `smoke.yaml`'s header); a bare `assertVisible` is for static elements after navigation.

**Selector preference order:**

1. **`id:` == testTag** — the strongest selector; works on a stock stamp (the box below).
2. **`text:`** — a visible label; the last resort for an untagged node, and brittle against copy
   changes. An untagged node you need is better tagged in source (§4).

> **`testTagsAsResourceId` — stock apps HAVE it (via the shim).** The template's `AppShell` passes
> `Modifier.exposeTestTagsForAutomation()` to `BaseScreen` — an expect/actual shim
> (`presentation/components/TestTagAutomation.kt`) whose Android actual sets
> `semantics { testTagsAsResourceId = true }` for the whole subtree (desktop/iOS actuals are
> no-ops; the flag is Android-only in the Compose Multiplatform version the template pins, so do NOT
> set it in common code — it won't compile for the other targets). Verified live: `uiautomator dump` resolves `home_title` /
> `app_bottom_nav` as `resource-id`s on a stock stamp, so `id`-based selectors work out of the box.
> On an app stamped BEFORE the shim existed (no `TestTagAutomation.kt`), either port the shim in
> or fall back to selector 2 (raw UiAutomator equivalent:
> `new UiSelector().description("…")`), and say so in the generated file's header.

## 4. Missing-tag protocol

When the plan needs a node that has **no testTag** (the tree shows `testTag: null` and no
contentDescription — e.g. the template's `DetailScreen` title), **add the tag in source** rather
than writing a fragile xpath. The template's exact pattern (see `home_title` in `HomeScreen.kt`):

```kotlin
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag

Text(
    text = "Detail",
    modifier = Modifier.semantics { testTag = "detail_title" },
)
```

Naming: `<screen>_<element>` snake_case, matching the shipped `home_title` / `home_action` /
`app_bottom_nav` / `profile_title` convention. Rebuild, re-fetch the tree, confirm the tag
appears, then reference it. One tag per marker node — don't carpet-tag every Text.

## 5. Run + heal

Run through the lane or by hand, on the DEBUG build:

```bash
node qa/verify.mjs                    # e2eSmoke runs every top-level qa/e2e/*.yaml flow
maestro test qa/e2e/<flow>.yaml       # one flow, against what is installed (installDebug first)
```

A failing **generated** test is yours to heal, in-loop: re-fetch a fresh tree of the screen the
failure happened on, compare it to the assertion (wrong tag? text changed? screen never reached
because a tap missed?), fix the selector or expectation, re-run. **Bounded**: at most three
heal iterations per test; if it still fails, the app is genuinely broken — report it as a product
bug with the before/after trees as evidence, don't weaken the assertion to force green.

## 6. Golden-tree CI tie-in — regression without a device

The Maestro suite proves flows on a device. The
**golden-tree layer** catches structural
regressions in CI with no emulator at all — generate it alongside:

1. The lane's `goldenTrees` step owns this layer: per-screen normalized golden trees live in
   `qa/golden/` and are **committed** (human-readable JSON, reviewable in any diff).
2. In CI, and wherever your app's `CLAUDE.md` *Definition of done* runs the lane (a checkpoint
   over the finished work, not after each edit): `node qa/verify.mjs` diffs the current render against each
   golden. Empty diffs = pass. A diff entry like `clickable-changed` is a button silently
   losing its handler — a class of regression an E2E flow only catches if it happens
   to tap that button.
3. For an in-session verified dev loop: `preview_diff { screen }` after an edit returns a
   `proven-clean | changed-with-regressions | no-change` verdict against the previous render;
   live, `navigate_and_inspect`'s before/after delta is the proof.
4. Intentional UI change → re-bless with `UPDATE_GOLDEN=1` (declared, never silent); the
   golden's git diff is human-readable JSON, unlike a pixel snapshot.

The two layers complement: golden trees are fast, device-free, and structural; the E2E suite
proves the app really launches, navigates, and responds on device. Ship both.
