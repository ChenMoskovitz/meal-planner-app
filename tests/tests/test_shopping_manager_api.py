from datetime import date


TODAY = date.today().isoformat()


def test_add_item_to_shopping_list_api(authenticated_api_user):
    user = authenticated_api_user

    response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/shopping_list',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "item_name": "Milk",
            "amount": "2 liters",
            "is_bought": False,
            "created_at": f"{TODAY}T12:00:00"
        }
    )

    assert response.ok

    data = response.json()

    assert len(data) == 1
    assert data[0]["item_name"] == "Milk"
    assert data[0]["amount"] == "2 liters"
    assert data[0]["is_bought"] is False


def test_mark_shopping_item_as_bought_api(authenticated_api_user):
    user = authenticated_api_user

    # First create an item
    create_response = user["request"].post(
        f'{user["supabase_url"]}/rest/v1/shopping_list',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "item_name": "Bread",
            "amount": "1 loaf",
            "is_bought": False,
            "created_at": f"{TODAY}T12:00:00"
        }
    )

    assert create_response.ok

    item = create_response.json()[0]

    # Mark it as bought
    update_response = user["request"].patch(
        f'{user["supabase_url"]}/rest/v1/shopping_list?id=eq.{item["id"]}',
        headers={
            "Authorization": f'Bearer {user["access_token"]}',
            "Prefer": "return=representation"
        },
        data={
            "is_bought": True
        }
    )

    assert update_response.ok

    data = update_response.json()

    assert len(data) == 1
    assert data[0]["id"] == item["id"]
    assert data[0]["is_bought"] is True