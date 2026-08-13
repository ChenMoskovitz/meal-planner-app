from playwright.sync_api import Page, expect
import time


def test_recipes_section_is_visible(page: Page, signed_up_user):
    expect(page.get_by_text("My Recipes")).to_be_visible()
    expect(page.get_by_placeholder("Recipe Title (e.g. Pasta)")).to_be_visible()
    expect(page.get_by_role("button", name="Create Recipe")).to_be_visible()

def test_create_recipe(page: Page, signed_up_user):
    recipe_name = f"Recipe {int(time.time())}"

    # Fill recipe name
    page.get_by_placeholder("Recipe Title (e.g. Pasta)").fill(recipe_name)

    # Create recipe
    page.get_by_role("button", name="Create Recipe").click()

    # Verify the recipe appears
    expect(page.get_by_text(recipe_name)).to_be_visible()

def test_select_recipe(page: Page, signed_up_user):
    recipe_name = f"Recipe {int(time.time())}"

    # Create recipe
    page.get_by_placeholder("Recipe Title (e.g. Pasta)").fill(recipe_name)
    page.get_by_role("button", name="Create Recipe").click()

    # Click the recipe from the list
    page.get_by_text(recipe_name).click()

    # Verify the empty-state message disappears
    expect(page.get_by_text("Select a recipe to start cooking")).not_to_be_visible()

    # Verify the selected recipe is shown
    expect(
        page.get_by_role("heading", name=recipe_name)
    ).to_be_visible()

def test_add_cooking_instructions(page: Page, signed_up_user):
    recipe_name = f"Recipe {int(time.time())}"
    instructions = "Boil water. Add pasta. Cook for 10 minutes."

    # Create recipe
    page.get_by_placeholder("Recipe Title (e.g. Pasta)").fill(recipe_name)
    page.get_by_role("button", name="Create Recipe").click()

    # Select recipe
    page.get_by_text(recipe_name).click()

    # Add cooking instructions
    page.get_by_placeholder("Write your recipe steps here...").fill(instructions)

    # Save
    page.get_by_role("button", name="Save Changes").click()

    # Verify the instructions were saved
    expect(
        page.get_by_placeholder("Write your recipe steps here...")
    ).to_have_value(instructions)

def test_save_recipe_changes(page: Page, signed_up_user):
    page.on("console", lambda msg: print("BROWSER:", msg.type, msg.text))
    recipe_name = f"Recipe {int(time.time())}"
    instructions = "Boil water. Add pasta. Cook for 10 minutes."

    # Create recipe
    page.get_by_placeholder("Recipe Title (e.g. Pasta)").fill(recipe_name)
    page.get_by_role("button", name="Create Recipe").click()

    # Select recipe
    page.get_by_text(recipe_name).click()

    # Enter instructions
    page.get_by_placeholder(
        "Write your recipe steps here..."
    ).fill(instructions)

    # Save and wait until the DB update finished
    with page.expect_event("dialog") as dialog_info:
        page.get_by_role("button", name="Save Changes").click()

    dialog = dialog_info.value
    assert dialog.message == "Updated!"
    dialog.accept()

    # Close the recipe
    page.get_by_role("button", name="Close selected recipe").click()

    # Reload so recipes are fetched again from the DB
    page.reload()

    # Re-select the recipe
    page.get_by_text(recipe_name).click()

    # Verify the instructions were saved
    expect(
        page.get_by_placeholder("Write your recipe steps here...")
    ).to_have_value(instructions)