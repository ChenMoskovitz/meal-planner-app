from playwright.sync_api import Page, expect


def test_weekly_plan_section_is_visible(page: Page, signed_in_user):
    expect(
        page.get_by_role("heading", name="📅 Weekly Dinner Plan")
    ).to_be_visible()

    expect(page.get_by_role("button", name="Save Plan")).to_be_visible()
    expect(page.get_by_role("button", name="Show kcal")).to_be_visible()
    expect(page.get_by_role("button", name="Show Stats")).to_be_visible()

    expect(page.get_by_role("button", name="Prev")).to_be_visible()
    expect(page.get_by_role("button", name="Today")).to_be_visible()
    expect(page.get_by_role("button", name="Next")).to_be_visible()


def test_week_navigation_buttons_are_clickable(page: Page, signed_in_user):
    page.get_by_role("button", name="Next").click()

    expect(
        page.get_by_role("heading", name="📅 Weekly Dinner Plan")
    ).to_be_visible()

    page.get_by_role("button", name="Prev").click()

    expect(
        page.get_by_role("heading", name="📅 Weekly Dinner Plan")
    ).to_be_visible()