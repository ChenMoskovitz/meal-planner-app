import time

import pytest
from playwright.sync_api import Page


@pytest.fixture
def signed_up_user(page: Page):
    email = f"test_{int(time.time())}@example.com"

    page.goto("http://localhost:5173")
    page.get_by_role("button", name="Sign Up").click()

    page.get_by_placeholder("you@example.com").fill(email)
    page.get_by_placeholder("••••••••").fill("Password123!")
    page.get_by_role("button", name="Sign Up").click()

    return email

@pytest.fixture
def new_user_credentials():
    email = f"test_{int(time.time())}@example.com"

    return {
        "email": email,
        "password": "Password123!"
    }