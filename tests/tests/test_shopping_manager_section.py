from playwright.sync_api import Page, expect


def test_shopping_manager_section_is_visible(page: Page, signed_up_user):
    # Main section
    expect(
        page.get_by_role("heading", name="🛒 Shopping Manager")
    ).to_be_visible()

    expect(
        page.get_by_text("Review your week and build your final grocery list")
    ).to_be_visible()

    # Generate review button
    expect(
        page.get_by_role("button", name="🔍 1. Generate Review from Plan")
    ).to_be_visible()

    # Empty ingredient review
    expect(
        page.get_by_text("Click the button above to see what you need...")
    ).to_be_visible()

    # Final list
    expect(
        page.get_by_role("heading", name="📝 2. Final List")
    ).to_be_visible()

    expect(
        page.get_by_text("Your list is empty. Add items from the left!")
    ).to_be_visible()


def test_generate_review_without_plan(page: Page, signed_up_user):

    def handle_dialog(dialog):
        assert dialog.message == "Add some meals to your plan first!"
        dialog.accept()

    page.once("dialog", handle_dialog)

    page.get_by_role(
        "button",
        name="🔍 1. Generate Review from Plan"
    ).click()