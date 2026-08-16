def test_update_user_goals_api(authenticated_api_user):
    user = authenticated_api_user

    goals_response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/user_goals?on_conflict=user_id',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "resolution=merge-duplicates,return=representation"
        },
        data={
            "user_id": user["user_id"],
            "target_calories": 2200,
            "min_protein": 120,
            "min_fiber": 30,
            "max_fat": 65
        }
    )

    assert goals_response.ok

    data = goals_response.json()

    assert len(data) == 1
    assert data[0]["user_id"] == user["user_id"]


def test_get_user_goals_api(authenticated_api_user):
    user = authenticated_api_user

    # Create goals for this user
    create_response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/user_goals?on_conflict=user_id',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "resolution=merge-duplicates"
        },
        data={
            "user_id": user["user_id"],
            "target_calories": 2200,
            "min_protein": 120,
            "min_fiber": 30,
            "max_fat": 65
        }
    )

    assert create_response.ok

    # Get this user's goals
    get_response = user["request"].get(
        f'{user["supabase_url"]}/rest/v1/user_goals?user_id=eq.{user["user_id"]}',
        headers={
            "Authorization": f'Bearer {user["access_token"]}'
        }
    )

    assert get_response.ok

    data = get_response.json()

    assert len(data) == 1
    assert data[0]["user_id"] == user["user_id"]
    assert data[0]["target_calories"] == 2200
    assert data[0]["min_protein"] == 120
    assert data[0]["min_fiber"] == 30
    assert data[0]["max_fat"] == 65