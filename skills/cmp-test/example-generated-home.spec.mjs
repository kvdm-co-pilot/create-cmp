// Generated regression suite — HOME screen (__APP_NAME__).
//
// ═══ HOW THIS FILE WAS GENERATED (the cmp-test pattern — copy it) ═══════════════════════
// Every testTag / text / contentDescription asserted below was READ FROM A REAL SEMANTICS
// TREE (the committed harness render of the template Home screen,
// inspector/harness/sample-tree.json) — observed, not guessed from source. Each assertion
// cites the tree node it came from. To regenerate after a UI change: connect_live →
// inspect_tree → re-derive (the cmp-test skill, §1–§3).
//
// Harness match: same client, capabilities, and shape as qa/appium/run-android-smoke.mjs —
// plain Node script, sequential awaits, try/finally session teardown, exit 1 on failure.
// Run (from qa/appium/):  node example-generated-home.spec.mjs
// Prereqs: Appium 3.x on http://127.0.0.1:4723, emulator-5554, debug APK installed
// (./gradlew :composeApp:installDebug).
//
// SELECTOR POLICY (cmp-test skill, §3):
//   1. resource-id == Compose testTag  — ONLY after the one-line
//      `Modifier.semantics { testTagsAsResourceId = true }` opt-in on the AppShell root
//      (the stock template does NOT set it). Gate: TEST_TAGS_AS_RESOURCE_ID=1.
//   2. accessibility id == contentDescription — works out of the box.
//   3. text xpath — works out of the box; last resort, brittle against copy changes.
// NO coordinates, NO pixels: taps go through semantic selectors; geometry claims (48dp
// touch targets, card gaps) live in the inspector layer (audit_a11y / golden trees).
// ═════════════════════════════════════════════════════════════════════════════════════════

import { AppiumClient } from './lib/appium-client.mjs';

const APP_PACKAGE = '__PACKAGE__';
const APP_ACTIVITY = '__PACKAGE__.MainActivity';

// Set to 1 once AppShell opts into testTagsAsResourceId (SKILL.md §3) — enables the
// strongest selectors (resource-id == testTag). Everything else passes without it.
const TAGS_AS_IDS = process.env.TEST_TAGS_AS_RESOURCE_ID === '1';

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
    // the 48x48 touch-target GEOMETRY is the inspector's job (audit_a11y + the golden
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

    // ── 3. TAG SELECTORS (optional until the one-line opt-in lands) ────────────────────
    // Tree tags: home_title, home_action, app_bottom_nav — exposed as resource-id only
    // when testTagsAsResourceId is set on the shell root (SKILL.md §3).
    if (TAGS_AS_IDS) {
      for (const tag of ['home_title', 'home_action', 'app_bottom_nav']) {
        const found = await client.elementExists('id', tag);
        if (!found) {
          throw new Error(`testTag "${tag}" not exposed as resource-id`);
        }
      }
      console.log('PASS 3/5: all observed testTags resolve as resource-ids');
    } else {
      console.log('SKIP 3/5: tag selectors (set TEST_TAGS_AS_RESOURCE_ID=1 after the AppShell opt-in)');
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
