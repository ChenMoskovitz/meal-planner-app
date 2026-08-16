import time
import os
import uuid
import pytest
from dotenv import load_dotenv
from playwright.sync_api import Playwright, Page, expect

load_dotenv()

@pytest.fixture
def signed_up_user(page: Page):
    email = f"test_{uuid.uuid4()}@example.com"

    page.goto("http://localhost:5173")
    page.get_by_role("button", name="Sign Up").click()

    page.get_by_placeholder("you@example.com").fill(email)
    page.get_by_placeholder("••••••••").fill("Password123!")
    page.get_by_role("button", name="Sign Up").click()

    # Wait until signup really finished
    expect(
        page.get_by_role("heading", name="📅 Weekly Dinner Plan")
    ).to_be_visible()

    return email

@pytest.fixture
def new_user_credentials():
    email = f"test_{int(time.time())}@example.com"

    return {
        "email": email,
        "password": "Password123!"
    }

@pytest.fixture
def authenticated_api_user(playwright: Playwright):
    supabase_url = os.environ["VITE_SUPABASE_URL"]
    anon_key = os.environ["VITE_SUPABASE_ANON_KEY"]

    email = f"test_{uuid.uuid4()}@example.com"
    password = "Password123!"

    request = playwright.request.new_context(
        extra_http_headers={
            "apikey": anon_key,
            "Content-Type": "application/json"
        }
    )

    signup_response = request.post(
        f"{supabase_url}/auth/v1/signup",
        data={
            "email": email,
            "password": password
        }
    )

    assert signup_response.ok

    signup_data = signup_response.json()

    yield {
        "request": request,
        "supabase_url": supabase_url,
        "access_token": signup_data["access_token"],
        "user_id": signup_data["user"]["id"]
    }

    request.dispose()