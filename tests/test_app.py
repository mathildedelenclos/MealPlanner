"""
Integration tests for the Recipe / Meal Planner app.

Each test runs against an in-memory SQLite database so the real
mealplanner.db is never touched.  A logged-in session is injected
directly via Flask's test client – no OAuth flows are exercised.
"""

import json
import os
import pytest

# ── point models at an in-memory DB before importing app ──────────────────────
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("DATABASE_PATH", ":memory:")

import models  # noqa: E402  (must come after env var)
import app as flask_app  # noqa: E402


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def fresh_db(monkeypatch, tmp_path):
    """Give every test its own isolated SQLite file."""
    db_file = str(tmp_path / "test.db")
    monkeypatch.setenv("DATABASE_PATH", db_file)
    monkeypatch.setattr(models, "DB_PATH", db_file)
    models.init_db()
    yield


@pytest.fixture()
def client():
    flask_app.app.config["TESTING"] = True
    flask_app.app.config["WTF_CSRF_ENABLED"] = False
    return flask_app.app.test_client()


@pytest.fixture()
def user(fresh_db):
    """Create a test user and return its dict."""
    return models.get_or_create_user(
        google_id="google-test-123",
        email="test@example.com",
        name="Test User",
        picture="https://example.com/pic.jpg",
    )


@pytest.fixture()
def auth_client(client, user):
    """A test client with an active session for *user*."""
    with client.session_transaction() as sess:
        sess["user_id"] = user["id"]
        sess["user_name"] = user["name"]
        sess["user_picture"] = user["picture"]
    return client


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def _json(resp):
    return json.loads(resp.data)


RECIPE_PAYLOAD = {
    "title": "Pasta Bolognese",
    "ingredients": ["400g pasta", "500g beef mince", "1 onion", "2 cloves garlic"],
    "instructions": ["Cook pasta.", "Brown mince.", "Combine and serve."],
    "servings": "4",
    "total_time": "30 min",
    "categories": ["Italian"],
}


# ─────────────────────────────────────────────────────────────────────────────
# Auth / session
# ─────────────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_unauthenticated_redirects_to_login(self, client):
        resp = client.get("/calendar")
        assert resp.status_code == 302
        assert "/login" in resp.headers["Location"]

    def test_login_page_renders(self, client):
        resp = client.get("/login")
        assert resp.status_code == 200

    def test_api_returns_401_when_not_logged_in(self, client):
        resp = client.get("/api/recipes")
        assert resp.status_code == 401

    def test_api_me_returns_user(self, auth_client, user):
        resp = auth_client.get("/api/me")
        assert resp.status_code == 200
        data = _json(resp)
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test User"

    def test_api_me_401_when_not_logged_in(self, client):
        resp = client.get("/api/me")
        assert resp.status_code == 401

    def test_logout_clears_session(self, auth_client):
        resp = auth_client.post("/auth/logout")
        assert resp.status_code == 302
        # After logout the API should return 401
        resp2 = auth_client.get("/api/recipes")
        assert resp2.status_code == 401

    def test_authenticated_user_redirected_away_from_login(self, auth_client):
        resp = auth_client.get("/login")
        assert resp.status_code == 302
        assert "/calendar" in resp.headers["Location"]


# ─────────────────────────────────────────────────────────────────────────────
# User model
# ─────────────────────────────────────────────────────────────────────────────

class TestUserModel:
    def test_create_and_retrieve_google_user(self, user):
        fetched = models.get_user_by_id(user["id"])
        assert fetched["email"] == "test@example.com"
        assert fetched["google_id"] == "google-test-123"

    def test_get_or_create_is_idempotent(self, user):
        u2 = models.get_or_create_user("google-test-123", "test@example.com")
        assert u2["id"] == user["id"]

    def test_google_user_profile_updated_on_relogin(self, user):
        updated = models.get_or_create_user(
            "google-test-123", "new@example.com", name="New Name"
        )
        assert updated["email"] == "new@example.com"
        assert updated["name"] == "New Name"

    def test_create_facebook_user(self):
        u = models.get_or_create_user_facebook(
            facebook_id="fb-999",
            email="fb@example.com",
            name="FB User",
        )
        assert u["facebook_id"] == "fb-999"
        assert u["email"] == "fb@example.com"

    def test_facebook_links_to_existing_email_account(self, user):
        """If a Google user later logs in with Facebook using the same email,
        they should be merged into one account."""
        linked = models.get_or_create_user_facebook(
            facebook_id="fb-link-123",
            email="test@example.com",
        )
        assert linked["id"] == user["id"]
        assert linked["facebook_id"] == "fb-link-123"

    def test_adopt_orphan_data(self, user):
        """Rows with user_id IS NULL should be assigned to the user on first login."""
        conn = models.get_db()
        conn.execute(
            "INSERT INTO recipes (title, ingredients, instructions, categories) "
            "VALUES ('Orphan Recipe', '[]', '[]', '[]')"
        )
        conn.commit()
        conn.close()

        models.adopt_orphan_data(user["id"])

        recipes = models.get_all_recipes(user["id"])
        titles = [r["title"] for r in recipes]
        assert "Orphan Recipe" in titles


# ─────────────────────────────────────────────────────────────────────────────
# Recipe CRUD
# ─────────────────────────────────────────────────────────────────────────────

class TestRecipeAPI:
    def test_create_recipe(self, auth_client):
        resp = auth_client.post(
            "/api/recipes",
            json=RECIPE_PAYLOAD,
        )
        assert resp.status_code == 201
        assert "id" in _json(resp)

    def test_create_recipe_missing_title(self, auth_client):
        payload = {**RECIPE_PAYLOAD, "title": ""}
        resp = auth_client.post("/api/recipes", json=payload)
        assert resp.status_code == 400

    def test_create_recipe_missing_ingredients(self, auth_client):
        payload = {**RECIPE_PAYLOAD, "ingredients": []}
        resp = auth_client.post("/api/recipes", json=payload)
        assert resp.status_code == 400

    def test_get_all_recipes_empty(self, auth_client):
        resp = auth_client.get("/api/recipes")
        assert resp.status_code == 200
        assert _json(resp) == []

    def test_get_all_recipes(self, auth_client):
        auth_client.post("/api/recipes", json=RECIPE_PAYLOAD)
        resp = auth_client.get("/api/recipes")
        data = _json(resp)
        assert len(data) == 1
        assert data[0]["title"] == "Pasta Bolognese"

    def test_get_recipe_by_id(self, auth_client):
        create_resp = auth_client.post("/api/recipes", json=RECIPE_PAYLOAD)
        recipe_id = _json(create_resp)["id"]
        resp = auth_client.get(f"/api/recipes/{recipe_id}")
        assert resp.status_code == 200
        assert _json(resp)["title"] == "Pasta Bolognese"

    def test_get_nonexistent_recipe_404(self, auth_client):
        resp = auth_client.get("/api/recipes/9999")
        assert resp.status_code == 404

    def test_update_recipe(self, auth_client):
        create_resp = auth_client.post("/api/recipes", json=RECIPE_PAYLOAD)
        recipe_id = _json(create_resp)["id"]
        updated = {**RECIPE_PAYLOAD, "title": "Spaghetti Bolognese"}
        resp = auth_client.put(f"/api/recipes/{recipe_id}", json=updated)
        assert resp.status_code == 200
        fetched = _json(auth_client.get(f"/api/recipes/{recipe_id}"))
        assert fetched["title"] == "Spaghetti Bolognese"

    def test_delete_recipe(self, auth_client):
        create_resp = auth_client.post("/api/recipes", json=RECIPE_PAYLOAD)
        recipe_id = _json(create_resp)["id"]
        resp = auth_client.delete(f"/api/recipes/{recipe_id}")
        assert resp.status_code == 200
        assert auth_client.get(f"/api/recipes/{recipe_id}").status_code == 404

    def test_bulk_delete_recipes(self, auth_client):
        ids = []
        for i in range(3):
            p = {**RECIPE_PAYLOAD, "title": f"Recipe {i}"}
            ids.append(_json(auth_client.post("/api/recipes", json=p))["id"])
        resp = auth_client.post("/api/recipes/bulk-delete", json={"ids": ids[:2]})
        assert resp.status_code == 200
        assert _json(resp)["deleted"] == 2
        remaining = _json(auth_client.get("/api/recipes"))
        assert len(remaining) == 1

    def test_bulk_delete_no_ids_returns_400(self, auth_client):
        resp = auth_client.post("/api/recipes/bulk-delete", json={"ids": []})
        assert resp.status_code == 400

    def test_user_isolation(self, auth_client, client):
        """User A should not see User B's recipes."""
        auth_client.post("/api/recipes", json=RECIPE_PAYLOAD)

        user_b = models.get_or_create_user("google-b", "b@example.com")
        with client.session_transaction() as sess:
            sess["user_id"] = user_b["id"]
        resp = client.get("/api/recipes")
        assert _json(resp) == []

    def test_categories_endpoint(self, auth_client):
        auth_client.post("/api/recipes", json=RECIPE_PAYLOAD)
        resp = auth_client.get("/api/categories")
        assert resp.status_code == 200
        assert "Italian" in _json(resp)


# ─────────────────────────────────────────────────────────────────────────────
# Calendar
# ─────────────────────────────────────────────────────────────────────────────

class TestCalendarAPI:
    def _create_recipe(self, auth_client):
        return _json(auth_client.post("/api/recipes", json=RECIPE_PAYLOAD))["id"]

    def test_add_calendar_entry_with_recipe(self, auth_client):
        recipe_id = self._create_recipe(auth_client)
        resp = auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "servings": 2,
        })
        assert resp.status_code == 201
        assert "id" in _json(resp)

    def test_add_calendar_entry_with_note(self, auth_client):
        resp = auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "lunch",
            "note": "Leftovers",
        })
        assert resp.status_code == 201

    def test_add_entry_missing_fields(self, auth_client):
        resp = auth_client.post("/api/calendar/entries", json={
            "meal_type": "dinner",
            "recipe_id": 1,
        })
        assert resp.status_code == 400

    def test_add_entry_missing_recipe_and_note(self, auth_client):
        resp = auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
        })
        assert resp.status_code == 400

    def test_get_calendar_entries(self, auth_client):
        recipe_id = self._create_recipe(auth_client)
        auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
        })
        resp = auth_client.get("/api/calendar?year=2026&month=4")
        data = _json(resp)
        assert len(data) == 1
        assert data[0]["meal_type"] == "dinner"

    def test_get_calendar_requires_year_month(self, auth_client):
        resp = auth_client.get("/api/calendar")
        assert resp.status_code == 400

    def test_delete_calendar_entry(self, auth_client):
        recipe_id = self._create_recipe(auth_client)
        entry_id = _json(auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
        }))["id"]
        resp = auth_client.delete(f"/api/calendar/entries/{entry_id}")
        assert resp.status_code == 200
        entries = _json(auth_client.get("/api/calendar?year=2026&month=4"))
        assert entries == []

    def test_move_calendar_entry(self, auth_client):
        recipe_id = self._create_recipe(auth_client)
        entry_id = _json(auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
        }))["id"]
        resp = auth_client.patch(f"/api/calendar/entries/{entry_id}/move", json={
            "entry_date": "2026-04-08",
            "meal_type": "lunch",
        })
        assert resp.status_code == 200
        entries = _json(auth_client.get("/api/calendar?year=2026&month=4"))
        assert entries[0]["entry_date"] == "2026-04-08"
        assert entries[0]["meal_type"] == "lunch"

    def test_update_entry_servings(self, auth_client):
        recipe_id = self._create_recipe(auth_client)
        entry_id = _json(auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "servings": 2,
        }))["id"]
        resp = auth_client.patch(f"/api/calendar/entries/{entry_id}/servings",
                                 json={"servings": 6})
        assert resp.status_code == 200

    def test_update_entry_servings_invalid(self, auth_client):
        resp = auth_client.patch("/api/calendar/entries/999/servings",
                                 json={"servings": 0})
        assert resp.status_code == 400

    def test_update_entry_note(self, auth_client):
        entry_id = _json(auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "lunch",
            "note": "original note",
        }))["id"]
        resp = auth_client.patch(f"/api/calendar/entries/{entry_id}/note",
                                 json={"note": "updated note"})
        assert resp.status_code == 200

    def test_copy_calendar_entry(self, auth_client):
        recipe_id = self._create_recipe(auth_client)
        entry_id = _json(auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
        }))["id"]
        resp = auth_client.post(f"/api/calendar/entries/{entry_id}/copy", json={
            "entry_date": "2026-04-14",
            "meal_type": "dinner",
        })
        assert resp.status_code == 201
        entries = _json(auth_client.get("/api/calendar?year=2026&month=4"))
        assert len(entries) == 2

    def test_copy_nonexistent_entry_404(self, auth_client):
        resp = auth_client.post("/api/calendar/entries/9999/copy", json={
            "entry_date": "2026-04-14",
            "meal_type": "dinner",
        })
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# Shopping list
# ─────────────────────────────────────────────────────────────────────────────

class TestShoppingList:
    def test_shopping_list_requires_dates(self, auth_client):
        resp = auth_client.get("/api/shopping-list")
        assert resp.status_code == 400

    def test_empty_shopping_list(self, auth_client):
        resp = auth_client.get("/api/shopping-list?start=2026-04-01&end=2026-04-07")
        assert resp.status_code == 200
        assert _json(resp) == []

    def test_shopping_list_aggregates_ingredients(self, auth_client):
        recipe_id = _json(auth_client.post("/api/recipes", json=RECIPE_PAYLOAD))["id"]
        auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
            "servings": 4,
        })
        resp = auth_client.get("/api/shopping-list?start=2026-04-01&end=2026-04-07")
        data = _json(resp)
        texts = [i["text"] for i in data]
        assert any("pasta" in t.lower() for t in texts)
        assert any("beef mince" in t.lower() or "mince" in t.lower() for t in texts)

    def test_shopping_list_ingredients_have_categories(self, auth_client):
        recipe_id = _json(auth_client.post("/api/recipes", json=RECIPE_PAYLOAD))["id"]
        auth_client.post("/api/calendar/entries", json={
            "entry_date": "2026-04-07",
            "meal_type": "dinner",
            "recipe_id": recipe_id,
        })
        resp = auth_client.get("/api/shopping-list?start=2026-04-01&end=2026-04-07")
        for item in _json(resp):
            assert "category" in item
            assert item["category"]  # not empty


# ─────────────────────────────────────────────────────────────────────────────
# Custom shopping items
# ─────────────────────────────────────────────────────────────────────────────

class TestCustomShoppingItems:
    def test_add_custom_item(self, auth_client):
        resp = auth_client.post("/api/custom-shopping-items", json={"text": "Almond milk"})
        assert resp.status_code == 201
        data = _json(resp)
        assert data["text"] == "Almond milk"
        assert "category" in data

    def test_add_custom_item_empty_text(self, auth_client):
        resp = auth_client.post("/api/custom-shopping-items", json={"text": "   "})
        assert resp.status_code == 400

    def test_get_custom_items(self, auth_client):
        auth_client.post("/api/custom-shopping-items", json={"text": "Almond milk"})
        resp = auth_client.get("/api/custom-shopping-items")
        data = _json(resp)
        assert len(data) == 1
        assert data[0]["text"] == "Almond milk"

    def test_delete_custom_item(self, auth_client):
        item_id = _json(
            auth_client.post("/api/custom-shopping-items", json={"text": "Butter"})
        )["id"]
        resp = auth_client.delete(f"/api/custom-shopping-items/{item_id}")
        assert resp.status_code == 200
        assert _json(auth_client.get("/api/custom-shopping-items")) == []

    def test_clear_all_custom_items(self, auth_client):
        for text in ["Milk", "Eggs", "Bread"]:
            auth_client.post("/api/custom-shopping-items", json={"text": text})
        resp = auth_client.delete("/api/custom-shopping-items")
        assert resp.status_code == 200
        assert _json(auth_client.get("/api/custom-shopping-items")) == []


# ─────────────────────────────────────────────────────────────────────────────
# Settings
# ─────────────────────────────────────────────────────────────────────────────

class TestSettings:
    def test_get_settings_empty(self, auth_client):
        resp = auth_client.get("/api/settings")
        assert resp.status_code == 200
        assert isinstance(_json(resp), dict)

    def test_update_and_get_settings(self, auth_client):
        resp = auth_client.put("/api/settings", json={"language": "fr", "week_start_day": "1"})
        assert resp.status_code == 200
        data = _json(auth_client.get("/api/settings"))
        assert data.get("language") == "fr"
        assert data.get("week_start_day") == "1"


# ─────────────────────────────────────────────────────────────────────────────
# Ingredient categorisation (unit tests on the model function)
# ─────────────────────────────────────────────────────────────────────────────

class TestIngredientCategorisation:
    @pytest.mark.parametrize("ingredient,expected_category", [
        ("400g chicken breast", "Meat & Fish"),
        ("2 salmon fillets", "Meat & Fish"),
        ("3 eggs", "Dairy & Eggs"),
        ("200ml milk", "Dairy & Eggs"),
        ("1 baguette", "Bakery & Bread"),
        ("300g spaghetti", "Pasta, Rice & Grains"),
        ("1 can chopped tomatoes", "Tins & Jars"),
        ("1 tsp cumin", "Herbs, Spices & Seasonings"),
        ("2 tbsp olive oil", "Oils, Sauces & Condiments"),
        ("1 onion, diced", "Fruits & Vegetables"),
        ("3 garlic cloves", "Fruits & Vegetables"),
        ("something exotic", "Other"),
    ])
    def test_categorize_ingredient(self, ingredient, expected_category):
        assert models.categorize_ingredient(ingredient) == expected_category

    def test_categorize_ingredient_api(self, auth_client):
        resp = auth_client.post(
            "/api/categorize-ingredient", json={"text": "500g beef mince"}
        )
        assert resp.status_code == 200
        assert _json(resp)["category"] == "Meat & Fish"

    def test_categorize_empty_returns_other(self, auth_client):
        resp = auth_client.post("/api/categorize-ingredient", json={"text": ""})
        assert resp.status_code == 200
        assert _json(resp)["category"] == "Other"


# ─────────────────────────────────────────────────────────────────────────────
# Ingredient parsing & shopping list helpers (unit tests)
# ─────────────────────────────────────────────────────────────────────────────

class TestIngredientParsing:
    @pytest.mark.parametrize("text,expected_qty,expected_unit,expected_name", [
        ("400g pasta", 400.0, "g", "pasta"),
        ("2 tbsp olive oil", 2.0, "tbsp", "olive oil"),
        ("3 eggs", 3.0, None, "eggs"),
        ("1/2 tsp salt", 0.5, "tsp", "salt"),
        ("1 1/2 cups flour", 1.5, "cup", "flour"),
        ("a pinch of salt", None, None, "a pinch of salt"),
    ])
    def test_parse_ingredient(self, text, expected_qty, expected_unit, expected_name):
        qty, unit, name = models._parse_ingredient(text)
        assert qty == expected_qty
        assert unit == expected_unit
        assert name == expected_name

    @pytest.mark.parametrize("text,expected", [
        ("onions", "onion"),
        ("tomatoes", "tomato"),
        ("berries", "berry"),
        ("chicken breast, diced", "chicken breast"),
    ])
    def test_normalise_name(self, text, expected):
        assert models._normalise_name(text) == expected

    @pytest.mark.parametrize("text,expected", [
        ("aubergines, cut into 3cm chunks", "aubergines"),
        ("garlic cloves (crushed)", "garlic cloves"),
        ("onion", "onion"),
    ])
    def test_clean_ingredient_name(self, text, expected):
        assert models._clean_ingredient_name(text) == expected

    @pytest.mark.parametrize("ingredient,ratio,expected", [
        ("400g pasta", 0.5, "200g pasta"),
        ("2 onions", 2.0, "4 onions"),
        ("1 tbsp olive oil", 3.0, "3 tbsp olive oil"),
    ])
    def test_scale_ingredient(self, ingredient, ratio, expected):
        assert models._scale_ingredient(ingredient, ratio) == expected


# ─────────────────────────────────────────────────────────────────────────────
# Instruction splitting
# ─────────────────────────────────────────────────────────────────────────────

class TestInstructionSplitting:
    def test_split_by_pipe(self):
        text = "Boil water.||Add pasta.||Drain and serve."
        result = flask_app._split_instructions(text)
        assert result == ["Boil water.", "Add pasta.", "Drain and serve."]

    def test_split_by_numbered_steps(self):
        text = "1. Boil water.\n2. Add pasta.\n3. Drain and serve."
        result = flask_app._split_instructions(text)
        assert len(result) == 3
        assert result[0] == "Boil water."

    def test_split_step_prefix(self):
        text = "Step 1: Boil water. Step 2: Add pasta."
        result = flask_app._split_instructions(text)
        assert len(result) == 2
        assert "Step" not in result[0]

    def test_single_step_returned_as_list(self):
        text = "Just boil everything together."
        result = flask_app._split_instructions(text)
        assert result == ["Just boil everything together."]

    def test_empty_returns_empty(self):
        assert flask_app._split_instructions("") == []
        assert flask_app._split_instructions(None) == []


# ─────────────────────────────────────────────────────────────────────────────
# Fix instructions endpoint
# ─────────────────────────────────────────────────────────────────────────────

class TestFixInstructions:
    def test_fix_instructions_splits_single_blob(self, auth_client):
        # Create a recipe with all instructions crammed into one long step
        payload = {
            **RECIPE_PAYLOAD,
            "instructions": [
                "Step 1: Boil salted water. Step 2: Cook pasta until al dente. "
                "Step 3: Brown the mince in a pan with olive oil. "
                "Step 4: Add tomato sauce and simmer for 20 minutes. "
                "Step 5: Combine and serve immediately."
            ],
        }
        recipe_id = _json(auth_client.post("/api/recipes", json=payload))["id"]
        resp = auth_client.post("/api/fix-instructions")
        assert resp.status_code == 200
        assert _json(resp)["fixed"] >= 1
        recipe = _json(auth_client.get(f"/api/recipes/{recipe_id}"))
        assert len(recipe["instructions"]) > 1

    def test_fix_instructions_leaves_multi_step_unchanged(self, auth_client):
        auth_client.post("/api/recipes", json=RECIPE_PAYLOAD)
        resp = auth_client.post("/api/fix-instructions")
        assert _json(resp)["fixed"] == 0
