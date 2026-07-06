---
name: cmp-test
description: >-
  Generate a regression test suite for a Compose Multiplatform app by OBSERVING it — read the
  running app's semantics tree as structured JSON via the cmp-inspector MCP (testTags, text,
  clickables, bounds, nav state), derive a test plan from what actually rendered, and write
  tests into the app's shipped harness. Use this when the user says "write tests for my
  app", "generate appium tests", "create a regression suite", "test this screen", "BDD tests for
  my CMP app", "cover this flow with tests", "add UI tests to my CMP app", or "generate tests
  from the running app". Tests are derived from the rendered structure — never guessed from
  source, never from screenshots — and land in the shipped harness: current scaffolds carry
  Maestro flows (qa/e2e/*.yaml, testTag selectors); legacy pre-Maestro scaffolds carry the
  qa/appium AppiumClient runner or tests/appium pytest suite. Both are complemented by golden-tree
  snapshots (snapshot_save / snapshot_diff / prove_change) as the device-free CI regression layer.
---

# cmp-test — generate the regression suite from the rendered tree

> **Which harness? Look before you write.** Current scaffolds ship **Maestro** flows
> (`qa/e2e/*.yaml` — `# SPEC:`-cited, testTag `id:` selectors; see `smoke.yaml` for the shape)
> and NO Appium directories. The Appium mechanics below apply only to **legacy pre-Maestro
> projects** that actually contain `qa/appium/` or `tests/appium/` — check which exists in the
> target repo first and emit tests for THAT harness. Durable screen behavior belongs in Compose
> UI Tests (spec-cited) either way; E2E stays a thin smoke layer.

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
emulator is available; `inspector/harness/sample-tree.json` shows the shape.

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
| **Structural (CI)** | a golden-tree snapshot per screen (`snapshot_save`), diffed on every change (`snapshot_diff`) | the normalized tree itself — see §6 |

Rules that make the plan durable:

- Assert on **testTags and semantics**, never on pixels and never on coordinates.
- Geometry claims (a 48dp touch target, a 12dp card gap) belong to the **inspector layer**
  (`audit_a11y`, `layout_gaps`, golden trees), not to Appium — don't bend the Appium client into
  measuring rects.
- Prefer a screen's **tagged marker node** (e.g. `home_title`) as its "I am here" assertion;
  fall back to a distinctive text only when no tag exists (then see §4).

## 3. Generate — match the shipped harness exactly

Current scaffolds ship Maestro only (`qa/e2e/*.yaml`) — write flows there. The mechanics below
(JS runner / pytest suite) apply only to **legacy pre-Maestro** projects that still carry
`qa/appium/` or `tests/appium/`; write into whichever the app actually uses (legacy default: the
JS runner — it's what `npm --prefix qa/appium run smoke` executes):

- **JS runner** — `qa/appium/run-android-smoke.mjs` + `qa/appium/lib/appium-client.mjs`: a plain
  Node script (no test framework), `new AppiumClient({ serverUrl, capabilities })` with
  UiAutomator2 capabilities against `http://127.0.0.1:4723` / `emulator-5554`, sequential awaits
  inside `async function main()` with `try { … } finally { await client.stop(); }`, and
  `main().catch(…exit 1)`. Helpers you may call (they exist — do not invent others):
  `waitForText`, `waitForTextContaining`, `waitForTextGone`, `clickByText`,
  `clickByTextContaining`, `clickByAccessibilityId`, `clickByXPath`, `waitForElement(using,
  value)`, `elementExists(using, value)`, `back()`, `pause(ms)`, `swipeUp()`, `screenshot(path)`
  (evidence to disk only — never into context).
- **pytest suite** — `tests/appium/cmp/conftest.py` (the `driver` fixture: raw WebDriver REST via
  `requests`, helpers `find_by_text` / `text_exists` / `click_text` / `screenshot`) +
  `test_smoke.py`. Same capabilities, same assertion style (`assert driver.text_exists(...)`).

New files: `qa/appium/<flow>.spec.mjs` (add a matching script to `qa/appium/package.json`) or
`tests/appium/cmp/test_<flow>.py`. Copy the smoke file's header-comment style and prereq notes.

**Selector preference order:**

1. **resource-id == testTag** (`waitForElement('id', 'home_title')`) — the strongest selector,
   BUT read the box below first.
2. **accessibility id == contentDescription** (`clickByAccessibilityId('Add item')`) — works out
   of the box; Compose maps `contentDescription` straight to the a11y bridge.
3. **text xpath** (`waitForText`, `clickByText`) — works out of the box; last resort for untagged,
   description-less nodes, and brittle against copy changes.

> **`testTagsAsResourceId` — stock apps HAVE it (via the shim).** The template's `AppShell` passes
> `Modifier.exposeTestTagsForAutomation()` to `BaseScreen` — an expect/actual shim
> (`presentation/components/TestTagAutomation.kt`) whose Android actual sets
> `semantics { testTagsAsResourceId = true }` for the whole subtree (desktop/iOS actuals are
> no-ops; the flag is Android-only at CMP 1.10.3, so do NOT set it in common code — it won't
> compile for the other targets). Verified live: `uiautomator dump` resolves `home_title` /
> `app_bottom_nav` as `resource-id`s on a stock stamp, so `id`-based selectors work out of the box.
> On an app stamped BEFORE the shim existed (no `TestTagAutomation.kt`), either port the shim in
> or fall back to selectors 2–3 (raw UiAutomator equivalent:
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

## 5. Run + heal (legacy Appium path)

Run through the harness's own front door — Appium 3.x server on `:4723`, `emulator-5554`, debug
APK installed (the `cmp-qa-prep` skill brings all of this up):

```bash
npm --prefix qa/appium run smoke          # the shipped gate — keep it green
node qa/appium/<flow>.spec.mjs            # your generated flows (add npm scripts to match)
pytest tests/appium/cmp -v                # the pytest variant
```

A failing **generated** test is yours to heal, in-loop: re-fetch a fresh tree of the screen the
failure happened on, compare it to the assertion (wrong tag? text changed? screen never reached
because a tap missed?), fix the selector or expectation, re-run. **Bounded**: at most three
heal iterations per test; if it still fails, the app is genuinely broken — report it as a product
bug with the before/after trees as evidence, don't weaken the assertion to force green.

## 6. Golden-tree CI tie-in — regression without a device

The Maestro suite (or, on legacy projects, the Appium suite) proves flows on a device. The
**golden-tree layer** catches structural
regressions in CI with no emulator at all — generate it alongside:

1. Per screen: render headlessly (or fetch live once) → `snapshot_save { treePath, snapshotPath:
   "qa/goldens/<screen>.tree.json" }` → **commit the golden** (it's normalized and reviewable).
2. In CI / after any change: re-render → `snapshot_diff { treePath, snapshotPath }`. Empty diffs
   = pass. A diff entry like `clickable-changed` is a button silently losing its handler — a
   class of regression the Appium suite only catches if it happens to tap that button.
3. For a verified dev loop in one call: `prove_change { before: <golden>, after:
   {kind:"live"} }` — structural diff + design-system drift check + a11y audit, returning a
   `proven-clean | changed-with-regressions | no-change` verdict.
4. Intentional UI change → re-bless with `snapshot_save`; the golden's git diff is
   human-readable JSON, unlike a pixel snapshot.

The two layers complement: golden trees are fast, device-free, and structural; the E2E suite
proves the app really launches, navigates, and responds on device. Ship both.

## Worked example

`example-generated-home.spec.mjs` (bundled next to this file) is a complete generated suite for
the template's Home screen, derived node-by-node from the real committed
`inspector/harness/sample-tree.json` and written in the shipped `run-android-smoke.mjs` style —
copy its structure for every flow you generate.
