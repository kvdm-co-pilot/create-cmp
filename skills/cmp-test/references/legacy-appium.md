# cmp-test — the legacy Appium harness

Read this file only when the app carries `qa/appium/` or `tests/appium/` — a project stamped before
the Maestro harness. Current stamps have `qa/e2e/*.yaml` and no Appium; for them, SKILL.md §3 and
§5 are the whole story. Everything else in SKILL.md (observe, plan, the missing-tag protocol, the
heal loop, golden trees) applies to both harnesses.

Contents: §3 (legacy) Generate · §5 (legacy) Run · Worked example: a generated Home suite.

## §3 (legacy) Generate — match the Appium harness exactly

Write into whichever runner the app actually uses (default: the JS runner — it is what
`npm --prefix qa/appium run smoke` executes):

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
   when the app exposes testTags as resource-ids (next paragraph).
2. **accessibility id == contentDescription** (`clickByAccessibilityId('Add item')`) — works out
   of the box; Compose maps `contentDescription` straight to the a11y bridge.
3. **text xpath** (`waitForText`, `clickByText`) — works out of the box; last resort for untagged,
   description-less nodes, and brittle against copy changes.

Whether selector 1 works is SKILL.md §3's `testTagsAsResourceId` box: it does when the app has
`TestTagAutomation.kt`; without it, port the shim in or use selectors 2–3 and say so in the file's
header (the example below then runs with `TEST_TAGS_AS_RESOURCE_ID=0`).

## §5 (legacy) Run

Run through the harness's own front door — Appium 3.x server on `:4723`, `emulator-5554`, debug
APK installed (the `cmp-qa-prep` skill brings all of this up):

```bash
npm --prefix qa/appium run smoke          # the shipped gate — keep it green
node qa/appium/<flow>.spec.mjs            # your generated flows (add npm scripts to match)
pytest tests/appium/cmp -v                # the pytest variant
```

Then heal as SKILL.md §5 describes.

## Worked example: a generated Home suite

A complete generated suite for the template's Home screen, derived node by node from the committed
`${CLAUDE_PLUGIN_ROOT}/inspector/harness/sample-tree.json` and written in the shipped
`run-android-smoke.mjs` style — copy its structure for every flow you generate. Save it as
`qa/appium/<flow>.spec.mjs`.

```js
// Generated regression suite — HOME screen (__APP_NAME__).
//
// ═══ HOW THIS FILE WAS GENERATED (the cmp-test pattern — copy it) ═══════════════════════
// Every testTag / text / contentDescription asserted below was READ FROM A REAL SEMANTICS
// TREE (the committed harness render of the template Home screen,
// create-cmp's inspector/harness/sample-tree.json) — observed, not guessed from source. Each assertion
// cites the tree node it came from. To regenerate after a UI change: connect_live →
// inspect_tree → re-derive (the cmp-test skill, §1–§3).
//
// Harness match: same client, capabilities, and shape as qa/appium/run-android-smoke.mjs —
// plain Node script, sequential awaits, try/finally session teardown, exit 1 on failure.
// Run (from qa/appium/):  node home.spec.mjs
// Prereqs: Appium 3.x on http://127.0.0.1:4723, emulator-5554, debug APK installed
// (./gradlew :composeApp:installDebug).
//
// SELECTOR POLICY (cmp-test skill, §3):
//   1. resource-id == Compose testTag  — works on a stock stamp: the template's AppShell
//      applies Modifier.exposeTestTagsForAutomation() (TestTagAutomation.kt), whose Android
//      actual sets testTagsAsResourceId. On an app stamped before that shim, set
//      TEST_TAGS_AS_RESOURCE_ID=0 (or port the shim in) and rely on 2–3.
//   2. accessibility id == contentDescription — works out of the box.
//   3. text xpath — works out of the box; last resort, brittle against copy changes.
// NO coordinates, NO pixels: taps go through semantic selectors; geometry claims (48dp
// touch targets, card gaps) live in the inspector layer (the lane's a11y step / golden trees).
// ═════════════════════════════════════════════════════════════════════════════════════════

import { AppiumClient } from './lib/appium-client.mjs';

const APP_PACKAGE = '__PACKAGE__';
const APP_ACTIVITY = '__PACKAGE__.MainActivity';

// On by default — stock stamps expose testTags as resource-ids (SKILL.md §3). Set
// TEST_TAGS_AS_RESOURCE_ID=0 on an app stamped before the shim; everything else passes without it.
const TAGS_AS_IDS = process.env.TEST_TAGS_AS_RESOURCE_ID !== '0';

const client = new AppiumClient({
  serverUrl: 'http://127.0.0.1:4723',
  capabilities: {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'emulator-5554',
    'appium:udid': 'emulator-5554',
    'appium:appPackage': APP_PACKAGE,
    'appium:appActivity': APP_ACTIVITY,
    'appium:forceAppLaunch': true,
    'appium:newCommandTimeout': 120,
  },
});

async function main() {
  await client.start();
  try {
    // ── 1. EXISTENCE — Home renders its observed nodes ─────────────────────────────────
    // Tree: node testTag="home_title" text="Home" (sample-tree.json).
    await client.waitForText('Home', 20000);
    // Tree: first card's child texts — text="First card" / "A representative card subtitle".
    await client.waitForText('First card', 10000);
    await client.waitForText('A representative card subtitle', 10000);
    // Tree: second card — text="Second card" / "Another representative subtitle".
    await client.waitForText('Second card', 10000);
    await client.waitForText('Another representative subtitle', 10000);
    console.log('PASS 1/5: Home existence — title + both cards render');

    // ── 2. THE ACTION BUTTON — observed as a labeled clickable ─────────────────────────
    // Tree: testTag="home_action" contentDescription="Add item" role="Button"
    // clickable=true bounds=48x48. Presence + clickability are asserted semantically here;
    // the 48x48 touch-target GEOMETRY is the inspector's job (the lane's a11y step + the golden
    // tree), not Appium's.
    await client.waitForElement('accessibility id', 'Add item', 10000);
    const actionIsClickable = await client.elementExists(
      'xpath',
      "//*[@content-desc='Add item' and @clickable='true']",
    );
    if (!actionIsClickable) {
      throw new Error('home_action ("Add item") is present but not clickable');
    }
    console.log('PASS 2/5: home_action button present and clickable');

    // ── 3. TAG SELECTORS (on by default; off for an app stamped before the shim) ───────
    // Tree tags: home_title, home_action, app_bottom_nav — exposed as resource-ids by the
    // template's TestTagAutomation shim (SKILL.md §3).
    if (TAGS_AS_IDS) {
      for (const tag of ['home_title', 'home_action', 'app_bottom_nav']) {
        const found = await client.elementExists('id', tag);
        if (!found) {
          throw new Error(`testTag "${tag}" not exposed as resource-id`);
        }
      }
      console.log('PASS 3/5: all observed testTags resolve as resource-ids');
    } else {
      console.log('SKIP 3/5: tag selectors (TEST_TAGS_AS_RESOURCE_ID=0: this app predates the TestTagAutomation shim)');
    }

    // ── 4. NAVIGATION — bottom-nav round-trip ──────────────────────────────────────────
    // Tree: app_bottom_nav children — clickable text="Home" and clickable text="Profile".
    // Profile content expectation ("This is a stub screen.") comes from the template's
    // ProfileScreen.kt — the same marker the shipped smoke test uses.
    await client.clickByText('Profile', 10000);
    await client.waitForTextContaining('stub screen', 10000);
    // Round-trip back: Home tab restores the Home content (card text, observed in tree).
    await client.clickByText('Home', 10000);
    await client.waitForText('First card', 10000);
    console.log('PASS 4/5: bottom-nav round-trip Home → Profile → Home');

    // ── 5. INTERACTION — card tap → Detail appears, back → Home restored ───────────────
    // The tap targets the card's child text; the click lands inside the card Surface
    // (parent bounds 16,88 992x76 contain the text bounds 32,104 — verified in the tree).
    // The card's clickability is wired in the template's HomeScreen.kt
    // (`.clickable { onItemClick(item.id) }` — the static harness render shows it
    // clickable:false because the sample screen stubs the handler; a LIVE tree shows
    // clickable:true). Detail expectations ("Detail", "Item id:") come from the template's
    // DetailScreen.kt; re-observe live (inspect_tree after the tap) when regenerating.
    await client.clickByText('First card', 10000);
    await client.waitForText('Detail', 10000);
    await client.waitForTextContaining('Item id:', 10000);
    // Structural nav proof, harness-style: the Home title text is GONE on Detail…
    await client.waitForTextGone('First card', 10000);
    // …and back() restores it.
    await client.back();
    await client.waitForText('First card', 10000);
    console.log('PASS 5/5: card tap opens Detail; back restores Home');

    console.log('SUITE PASS: Home screen regression suite green.');
  } finally {
    await client.stop();
  }
}

main().catch((err) => {
  console.error('SUITE FAIL:', err.message);
  process.exit(1);
});
```
