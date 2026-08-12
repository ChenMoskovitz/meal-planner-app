from playwright.sync_api import Page, expect
import time


def test_open_meal_plan(page: Page):
    page.goto("http://localhost:5173")

    expect(page).to_have_title("Meal Planner")

# Login page tests
def test_login_page_elements_are_visible(page: Page):
    page.goto("http://localhost:5173")

    # Main heading
    expect(page.get_by_role("heading", name="Welcome Back")).to_be_visible()

    # Subtitle
    expect(page.get_by_text("Log in to manage your meals")).to_be_visible()

    # Email input
    expect(page.get_by_text("Email Address")).to_be_visible()
    expect(page.get_by_placeholder("you@example.com")).to_be_visible()

    # Password input
    expect(page.get_by_text("Password")).to_be_visible()
    expect(page.get_by_placeholder("••••••••")).to_be_visible()

    # Sign In button
    expect(page.get_by_role("button", name="Sign In")).to_be_visible()

    # Sign up section
    expect(page.get_by_text("Don't have an account?")).to_be_visible()
    expect(page.get_by_role("button", name="Sign Up")).to_be_visible()

def test_sign_up_page_elements_are_visible(page: Page):
    page.goto("http://localhost:5173")

    # Navigate to Sign Up page
    page.get_by_role("button", name="Sign Up").click()

    # Main heading
    expect(page.get_by_role("heading", name="Create Account")).to_be_visible()

    # Subtitle
    expect(page.get_by_text("Start your healthy journey today")).to_be_visible()

    # Email
    expect(page.get_by_text("Email Address")).to_be_visible()
    expect(page.get_by_placeholder("you@example.com")).to_be_visible()

    # Password
    expect(page.get_by_text("Password")).to_be_visible()
    expect(page.get_by_placeholder("••••••••")).to_be_visible()

    # Sign Up button
    expect(page.get_by_role("button", name="Sign Up")).to_be_visible()

    # Sign In section
    expect(page.get_by_text("Already have an account?")).to_be_visible()
    expect(page.get_by_role("button", name="Sign In")).to_be_visible()

# log in test loginin
def test_login_with_valid_credentials(page: Page, new_user_credentials):
    email = new_user_credentials["email"]
    password = new_user_credentials["password"]

    # Create the user first
    page.goto("http://localhost:5173")
    page.get_by_role("button", name="Sign Up").click()

    page.get_by_placeholder("you@example.com").fill(email)
    page.get_by_placeholder("••••••••").fill(password)
    page.get_by_role("button", name="Sign Up").click()

    # Verify signup/login succeeded
    expect(page.get_by_text(email.upper())).to_be_visible()

    # Logout
    page.get_by_role("button", name="Logout").click()
    expect(page.get_by_role("heading", name="Welcome Back")).to_be_visible()

    # Now test login
    page.get_by_placeholder("you@example.com").fill(email)
    page.get_by_placeholder("••••••••").fill(password)
    page.get_by_role("button", name="Sign In").click()

    # Verify the correct user logged in
    expect(page.get_by_text(email.upper())).to_be_visible()

# Sign up with new user:
def test_sign_up_with_new_user(page: Page):
    email = f"test_{int(time.time())}@example.com"
    page.goto("http://localhost:5173")

    page.get_by_role("button", name="Sign Up").click()

    page.get_by_placeholder("you@example.com").fill(email)
    page.get_by_placeholder("••••••••").fill("Password123!")

    page.get_by_role("button", name="Sign Up").click()
    expect(
        page.get_by_role("heading", name="📅 Weekly Dinner Plan")
    ).to_be_visible()
    expect(page.get_by_text(email.upper())).to_be_visible()

def test_logout(page: Page, signed_up_user):
    # Verify login
    expect(page.get_by_text(signed_up_user.upper())).to_be_visible()

    # Logout
    page.get_by_role("button", name="Logout").click()

    # Verify returned to login page
    expect(page.get_by_role("heading", name="Welcome Back")).to_be_visible()
    expect(page.get_by_role("button", name="Sign In")).to_be_visible()