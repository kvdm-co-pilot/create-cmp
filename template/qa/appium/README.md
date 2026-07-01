# Appium harness — __APP_NAME__

On-device UI testing for the Android app via Appium 3.x + UiAutomator2.

## Prerequisites
- Appium 3.x server + the `uiautomator2` driver (`appium driver install uiautomator2`).
- A running Android emulator named `emulator-5554`.
- The debug build installed: `./gradlew :composeApp:installDebug`.

## Run the smoke (JS)
```bash
appium &                       # start the server on :4723
npm --prefix qa/appium run smoke
```

## Run the BDD suite (Python)
```bash
pip install pytest requests
pytest tests/appium/cmp -v
```

Both assert the generic bottom-nav shell renders (Home + Profile tabs) — the `--verify`
gate the scaffolder runs to prove the stamped app is alive.
