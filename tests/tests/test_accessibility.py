"""Accessibility gate.

axe-core is run against every route and the build fails on a violation, so an
accessibility regression is caught the same way a broken button would be rather
than being noticed by a user months later.

Only WCAG 2.1 A and AA rules are enforced. axe also ships best-practice rules
that are advice rather than requirements, and failing a build on advice trains
people to ignore the failure.
"""
import pytest
from axe_playwright_python.sync_playwright import Axe
from playwright.sync_api import Page

WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

ROUTES = ["/plan", "/recipes", "/pantry", "/generator", "/goals"]


def describe(violations):
    """One readable line per violation, with the offending markup.

    axe's own payload is deeply nested, and a pytest failure that prints raw
    JSON is one nobody reads.
    """
    lines = []
    for v in violations:
        targets = ", ".join(
            str(target) for node in v["nodes"] for target in node["target"]
        )
        lines.append(f"  [{v['impact']}] {v['id']}: {v['help']}\n    at: {targets}")
    return "\n".join(lines)


@pytest.mark.parametrize("route", ROUTES)
def test_route_has_no_accessibility_violations(page: Page, visit, route):
    visit(route)

    results = Axe().run(page, options={"runOnly": {"type": "tag", "values": WCAG_AA}})
    violations = results.response["violations"]

    assert not violations, (
        f"{len(violations)} accessibility violation(s) on {route}:\n"
        + describe(violations)
    )


def test_signed_out_screen_has_no_accessibility_violations(page: Page):
    """The sign-in screen is the one page every visitor sees, and it renders
    before any session exists, so it is not covered by the routes above.
    """
    page.goto("http://localhost:5173")

    results = Axe().run(page, options={"runOnly": {"type": "tag", "values": WCAG_AA}})
    violations = results.response["violations"]

    assert not violations, (
        f"{len(violations)} accessibility violation(s) on the sign-in screen:\n"
        + describe(violations)
    )
