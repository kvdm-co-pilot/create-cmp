// Android smoke runner — asserts the app launches and the bottom-nav shell renders.
// Prereqs: an Appium 3.x server on http://127.0.0.1:4723 and a running emulator-5554
// with the debug APK installed (./gradlew :composeApp:installDebug).
import { AppiumClient } from './lib/appium-client.mjs';

const APP_PACKAGE = '__PACKAGE__';
const APP_ACTIVITY = '__PACKAGE__.MainActivity';

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
    await client.waitForText('Home', 20000);
    await client.waitForText('Profile', 10000);
    await client.clickByText('Profile', 10000);
    await client.waitForTextContaining('stub screen', 10000);
    console.log('SMOKE PASS: bottom-nav shell rendered and tab switch works.');
  } finally {
    await client.stop();
  }
}

main().catch((err) => {
  console.error('SMOKE FAIL:', err.message);
  process.exit(1);
});
