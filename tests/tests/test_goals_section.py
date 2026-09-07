from playwright.sync_api import Page, expect


def test_user_goals_section_is_visible(page: Page, signed_in_user):
    expect(
        page.get_by_role("heading", name="🎯 Set Nutritional Targets")
    ).to_be_visible()

    expect(page.get_by_label("Max Calories")).to_be_visible()
    expect(page.get_by_label("Min Protein")).to_be_visible()
    expect(page.get_by_label("Min Fiber")).to_be_visible()
    expect(page.get_by_label("Max Fat")).to_be_visible()
    expect(page.get_by_role("button", name="Update Targets")).to_be_visible()


def test_update_nutrition_goals(page: Page, signed_in_user):
    page.on("console", lambda msg: print("BROWSER:", msg.type, msg.text))

    page.get_by_label("Max Calories").fill("2200")
    page.get_by_label("Min Protein").fill("120")
    page.get_by_label("Min Fiber").fill("30")
    page.get_by_label("Max Fat").fill("65")
    page.get_by_role("button", name="Update Targets").click()

    expect(page.get_by_text("Goals updated successfully! 🚀")).to_be_visible()


def test_goals_persist_after_reload(page: Page, signed_in_user):
    page.get_by_label("Max Calories").fill("2100")
    page.get_by_label("Min Protein").fill("115")
    page.get_by_label("Min Fiber").fill("28")
    page.get_by_label("Max Fat").fill("68")

    page.get_by_role("button", name="Update Targets").click()

    # Wait until save completed
    expect(page.get_by_text("Goals updated successfully! 🚀")).to_be_visible()

    # Force the app to fetch the values again
    page.reload()

    expect(page.get_by_label("Max Calories")).to_have_value("2100")
    expect(page.get_by_label("Min Protein")).to_have_value("115")
    expect(page.get_by_label("Min Fiber")).to_have_value("28")
    expect(page.get_by_label("Max Fat")).to_have_value("68")