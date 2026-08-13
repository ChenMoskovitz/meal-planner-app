import time
import uuid

import pytest
from playwright.sync_api import Page, expect



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