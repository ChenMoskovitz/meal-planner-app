from playwright.sync_api import Page, expect


def test_sign_up_then_log_out(page: Page, signed_up_user):
    page.get_by_role("button", name="Logout").click()

    expect(page.get_by_placeholder("you@example.com")).to_be_visible()
    expect(page.get_by_role("button", name="Sign In")).to_be_visible()
