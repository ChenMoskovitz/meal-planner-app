from datetime import date
TODAY = date.today().isoformat()

def test_save_weekly_plan_api(authenticated_api_user):
    user = authenticated_api_user

    # First create a recipe that can be added to the plan
    recipe_response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/recipes',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "name": "Weekly Plan Test Recipe",
            "user_id": user["user_id"]
        }
    )

    assert recipe_response.ok

    recipe = recipe_response.json()[0]

    # Add that recipe to the weekly plan
    plan_response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/plan_recipes',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "day_of_week": TODAY,
            "recipe_id": recipe["id"],
            "slot_type": "main"
        }
    )

    assert plan_response.ok

    data = plan_response.json()

    assert len(data) == 1
    assert data[0]["recipe_id"] == recipe["id"]
    assert data[0]["day_of_week"] == TODAY
    assert data[0]["slot_type"] == "main"


def test_get_weekly_plan_api(authenticated_api_user):
    user = authenticated_api_user

    # Create a recipe
    recipe_response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/recipes',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "name": "Weekly Plan Get Test",
            "user_id": user["user_id"]
        }
    )

    assert recipe_response.ok

    recipe = recipe_response.json()[0]

    # Add it to the plan
    create_plan_response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/plan_recipes',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "day_of_week": TODAY,
            "recipe_id": recipe["id"],
            "slot_type": "main"
        }
    )

    assert create_plan_response.ok

    # Get the saved plan entry
    get_response = user["request"].get(
        f'{user["supabase_url"]}/rest/v1/plan_recipes'
        f'?recipe_id=eq.{recipe["id"]}',
        headers={
            "Authorization": f'Bearer {user["access_token"]}'
        }
    )

    assert get_response.ok

    data = get_response.json()

    assert len(data) >= 1
    assert any(
        row["recipe_id"] == recipe["id"]
        and row["day_of_week"] == TODAY
        and row["slot_type"] == "main"
        for row in data
    )