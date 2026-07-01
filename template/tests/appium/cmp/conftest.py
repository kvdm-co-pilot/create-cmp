"""
Shared Appium session configuration for the __APP_NAME__ Android app.
Appium 3.x + UiAutomator2. Start an Appium server on 127.0.0.1:4723 and a running
emulator-5554 before invoking pytest.
"""
import base64
import os
import re
import time

import pytest
import requests

APPIUM_URL = "http://127.0.0.1:4723"
CAPABILITIES = {
    "platformName": "Android",
    "appium:automationName": "UiAutomator2",
    "appium:deviceName": "emulator-5554",
    "appium:udid": "emulator-5554",
    "appium:appPackage": "__PACKAGE__",
    "appium:appActivity": "__PACKAGE__.MainActivity",
    "appium:noReset": False,
    "appium:forceAppLaunch": True,
    "appium:newCommandTimeout": 120,
}
SCREENSHOTS_DIR = "qa-artifacts/appium-cmp"


def escape_xpath(text: str) -> str:
    if "'" not in text:
        return f"'{text}'"
    if '"' not in text:
        return f'"{text}"'
    parts = text.split("'")
    return "concat('" + "', \"'\", '".join(parts) + "')"


class AppiumDriver:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.base = f"{APPIUM_URL}/session/{session_id}"

    def _req(self, method: str, path: str, body=None, timeout: int = 30) -> dict:
        resp = requests.request(method, self.base + path, json=body, timeout=timeout)
        return resp.json() if resp.content else {}

    def source(self) -> str:
        return self._req("GET", "/source").get("value", "")

    def _find_xpath(self, xpath: str, timeout: int = 10) -> str:
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = requests.post(self.base + "/element",
                              json={"using": "xpath", "value": xpath}, timeout=10)
            if r.status_code == 200:
                val = r.json().get("value", {})
                if isinstance(val, dict) and val:
                    return next(iter(val.values()))
            time.sleep(0.5)
        raise TimeoutError(f"Element not found: {xpath}")

    def find_by_text(self, text: str, timeout: int = 10) -> str:
        return self._find_xpath(f"//*[@text={escape_xpath(text)}]", timeout)

    def text_exists(self, text: str, timeout: int = 5) -> bool:
        try:
            self.find_by_text(text, timeout)
            return True
        except TimeoutError:
            return False

    def click_text(self, text: str, timeout: int = 10):
        self._req("POST", f"/element/{self.find_by_text(text, timeout)}/click")

    def screenshot(self, name: str = "screenshot") -> str:
        os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
        r = self._req("GET", "/screenshot", timeout=15)
        if r.get("value"):
            path = f"{SCREENSHOTS_DIR}/{name}_{int(time.time())}.png"
            with open(path, "wb") as f:
                f.write(base64.b64decode(r["value"]))
            return path
        return ""


@pytest.fixture(scope="module")
def driver():
    resp = requests.post(f"{APPIUM_URL}/session",
                         json={"capabilities": {"alwaysMatch": CAPABILITIES}}, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    session_id = data.get("sessionId") or data.get("value", {}).get("sessionId")
    time.sleep(5)
    drv = AppiumDriver(session_id)
    yield drv
    requests.delete(f"{APPIUM_URL}/session/{session_id}", timeout=15)
