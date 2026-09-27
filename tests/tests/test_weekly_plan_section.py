from playwright.sync_api import Page, expect


def test_weekly_plan_section_is_visible(page: Page, signed_in_user):
    expect(
        page.get_by_role("heading", name="Weekly Dinner Plan")
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
        page.get_by_role("heading", name="Weekly Dinner Plan")
    ).to_be_visible()

    page.get_by_role("button", name="Prev").click()

    expect(
        page.get_by_role("heading", name="Weekly Dinner Plan")
    ).to_be_visible()


def test_weekly_summary_shows_every_tracked_nutrient(page: Page, visit):
    """The summary is only rendered once goals exist, so set them here rather
    than relying on another test file having run first.

    Fat is the one this covers: the goals form has always asked for a fat
    ceiling, but the summary showed only calories, protein and fiber, so the
    number the user entered was never compared against the plan.
    """
    visit("/goals")

    page.get_by_label("Max Calories").fill("2000")
    page.get_by_label("Min Protein").fill("100")
    page.get_by_label("Min Fiber").fill("25")
    page.get_by_label("Max Fat").fill("70")
    page.get_by_role("button", name="Update Targets").click()
    expect(page.get_by_text("Goals updated successfully.")).to_be_visible()

    visit("/plan")
    page.get_by_role("button", name="Show Stats").click()

    expect(page.get_by_role("heading", name="Weekly Summary (Per Person)")).to_be_visible()

    for label in ["Avg Calories", "Avg Protein", "Avg Fiber", "Avg Fat"]:
        expect(page.get_by_text(label, exact=True)).to_be_visible()

    # Each card states the goal it is measured against.
    expect(page.get_by_text("Goal: 70g", exact=True)).to_be_visible()
