import os
import time
import pytest
from dotenv import load_dotenv
from playwright.sync_api import Playwright, Page, expect

load_dotenv()

BASE_URL = "http://localhost:5173"

# Everything the shared account accumulates, in delete order.
# recipe_ingredients is missing on purpose: deleting a recipe cascades to it.
OWNED_TABLES = ["plan_recipes", "shopping_list", "recipes", "user_goals"]


@pytest.fixture(scope="session")
def test_user(playwright: Playwright):
    """Sign in once as the shared CI account and hand out its token.

    The suite used to sign up a throwaway user per test, which left 23
    permanent users in Supabase on every run. One seeded account replaces
    them; TEST_USER_EMAIL and TEST_USER_PASSWORD point at it.
    """
    supabase_url = os.environ["VITE_SUPABASE_URL"]
    anon_key = os.environ["VITE_SUPABASE_ANON_KEY"]
    email = os.environ["TEST_USER_EMAIL"]
    password = os.environ["TEST_USER_PASSWORD"]

    request = playwright.request.new_context(
        extra_http_headers={
            "apikey": anon_key,
            "Content-Type": "application/json"
        }
    )

    response = request.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        data={
            "email": email,
            "password": password
        }
    )

    assert response.ok, (
        f"Could not sign in as the shared test account ({email}). "
        "Check TEST_USER_EMAIL and TEST_USER_PASSWORD, and that the "
        f"account exists in this Supabase project. Got {response.status}."
    )

    session = response.json()

    yield {
        "request": request,
        "supabase_url": supabase_url,
        "access_token": session["access_token"],
        "user_id": session["user"]["id"],
        "email": email,
        "password": password
    }

    request.dispose()


@pytest.fixture(autouse=True)
def clean_account(test_user):
    """Empty the shared account before every test.

    This runs on setup, not teardown, on purpose. The workflow cancels
    in-progress runs, and a cancelled job never reaches its teardown — so
    cleaning up on the way out would leave rows behind exactly when a run
    dies, and poison the next one. Cleaning on the way in means a crashed
    run is repaired by whatever runs next.
    """
    for table in OWNED_TABLES:
        response = test_user["request"].delete(
            f"{test_user['supabase_url']}/rest/v1/{table}"
            f"?user_id=eq.{test_user['user_id']}",
            headers={
                "Authorization": f"Bearer {test_user['access_token']}"
            }
        )
        assert response.ok, (
            f"Could not clear {table} before the test: {response.status}. "
            "The account needs a DELETE policy on this table."
        )


@pytest.fixture
def signed_in_user(page: Page, test_user):
    """Log the browser in as the shared account, landing on the meal plan."""
    page.goto(BASE_URL)

    page.get_by_placeholder("you@example.com").fill(test_user["email"])
    page.get_by_placeholder("••••••••").fill(test_user["password"])
    page.get_by_role("button", name="Sign In").click()

    # Wait until login really finished
    expect(
        page.get_by_role("heading", name="📅 Weekly Dinner Plan")
    ).to_be_visible()

    return test_user["email"]


@pytest.fixture
def new_user_email():
    """A throwaway address for the one test that has to sign up for real."""
    return f"test_{int(time.time())}@example.com"


@pytest.fixture
def authenticated_api_user(test_user):
    """The shared account's REST session, for the API tests."""
    return test_user
