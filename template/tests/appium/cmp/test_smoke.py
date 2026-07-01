"""
Smoke test: the app launches and the generic bottom-nav shell renders.
This is the `--verify` Appium gate the scaffolder runs to prove the stamped app is alive.
"""


def test_bottom_nav_renders(driver):
    # Home tab title is present on first launch.
    assert driver.text_exists("Home", timeout=20), "Home screen did not render"
    # Both default tabs are present in the bottom nav.
    assert driver.text_exists("Profile", timeout=10), "Profile tab not found in bottom nav"


def test_can_switch_to_profile_tab(driver):
    driver.click_text("Profile", timeout=10)
    assert driver.text_exists("This is a stub screen.", timeout=10), \
        "Profile tab content did not render after tapping the tab"
