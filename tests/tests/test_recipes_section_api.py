def test_create_recipe_api(authenticated_api_user):
    user = authenticated_api_user

    response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/recipes',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "name": "API Test Recipe",
            "user_id": user["user_id"]
        }
    )

    assert response.ok

    data = response.json()

    assert len(data) == 1
    assert data[0]["name"] == "API Test Recipe"
    assert data[0]["user_id"] == user["user_id"]


def test_get_user_recipes_api(authenticated_api_user):
    user = authenticated_api_user

    # Create one recipe first
    create_response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/recipes',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "name": "API Test Recipe",
            "user_id": user["user_id"]
        }
    )

    assert create_response.ok

    # Get only this user's recipes
    get_response = user["request"].get(
        f'{user["supabase_url"]}/rest/v1/recipes?user_id=eq.{user["user_id"]}',
        headers={
            "Authorization": f'Bearer {user["access_token"]}'
        }
    )

    assert get_response.ok

    data = get_response.json()

    assert len(data) >= 1
    assert any(
        recipe["name"] == "API Test Recipe"
        and recipe["user_id"] == user["user_id"]
        for recipe in data
    )