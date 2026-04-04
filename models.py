import sqlite3
import json
import os
import re as _re
from datetime import datetime, date, timedelta
import calendar as _calendar

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "mealplanner.db"))


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            google_id TEXT UNIQUE,
            facebook_id TEXT UNIQUE,
            email TEXT NOT NULL,
            name TEXT,
            picture TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            source_url TEXT,
            image_url TEXT,
            total_time TEXT,
            servings TEXT,
            categories TEXT NOT NULL DEFAULT '[]',
            ingredients TEXT NOT NULL,
            instructions TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS calendar_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_date TEXT NOT NULL,
            meal_type TEXT NOT NULL,
            recipe_id INTEGER,
            note TEXT,
            servings INTEGER NOT NULL DEFAULT 2,
            user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS custom_shopping_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Other',
            checked INTEGER NOT NULL DEFAULT 0,
            user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            user_id INTEGER NOT NULL REFERENCES users(id),
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
        );
    """)
    # Migration: add user_id column to existing tables that lack it
    for table in ("recipes", "calendar_entries", "custom_shopping_items"):
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id)")
        except Exception:
            pass  # column already exists
    # Migration: add is_favourite column to recipes
    try:
        conn.execute("ALTER TABLE recipes ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass  # column already exists
    # Migration: add week_start column to custom_shopping_items
    try:
        conn.execute("ALTER TABLE custom_shopping_items ADD COLUMN week_start TEXT")
    except Exception:
        pass  # column already exists
    # Migration: add facebook_id column to users table
    try:
        conn.execute("ALTER TABLE users ADD COLUMN facebook_id TEXT UNIQUE")
    except Exception:
        pass  # column already exists
    # Recovery: if a previous migration left users_old behind (failed midway),
    # restore its data into the current users table so no user IDs are lost.
    try:
        if conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users_old'"
        ).fetchone():
            old_cols = [r[1] for r in conn.execute("PRAGMA table_info(users_old)").fetchall()]
            if "facebook_id" in old_cols:
                conn.execute("""
                    INSERT OR IGNORE INTO users (id, google_id, facebook_id, email, name, picture, created_at)
                    SELECT id, google_id, facebook_id, email, name, picture, created_at FROM users_old
                """)
            else:
                conn.execute("""
                    INSERT OR IGNORE INTO users (id, google_id, email, name, picture, created_at)
                    SELECT id, google_id, email, name, picture, created_at FROM users_old
                """)
            conn.execute("DROP TABLE users_old")
    except Exception:
        pass
    # Migration: relax google_id NOT NULL constraint
    try:
        cur = conn.execute("PRAGMA table_info(users)")
        cols = {row[1]: row[3] for row in cur.fetchall()}  # name -> notnull
        if cols.get("google_id") == 1:  # NOT NULL is set
            conn.execute("ALTER TABLE users RENAME TO users_old")
            conn.execute("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    google_id TEXT UNIQUE,
                    facebook_id TEXT UNIQUE,
                    email TEXT NOT NULL,
                    name TEXT,
                    picture TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                INSERT INTO users (id, google_id, facebook_id, email, name, picture, created_at)
                SELECT id, google_id, facebook_id, email, name, picture, created_at FROM users_old
            """)
            conn.execute("DROP TABLE users_old")
    except Exception:
        pass
    # Migration: fix FK references pointing to users_old → users in all tables.
    # This happened because SQLite auto-updates FK refs when a table is renamed;
    # renaming users→users_old rewrote recipes.user_id to REFERENCES users_old(id).
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        for tbl, recreate_sql, insert_sql in (
            (
                "recipes",
                """CREATE TABLE recipes_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL, source_url TEXT, image_url TEXT,
                    total_time TEXT, servings TEXT,
                    categories TEXT NOT NULL DEFAULT '[]',
                    ingredients TEXT NOT NULL, instructions TEXT NOT NULL,
                    user_id INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )""",
                """INSERT INTO recipes_new
                   SELECT id, title, source_url, image_url, total_time, servings,
                          categories, ingredients, instructions, user_id, created_at FROM recipes""",
            ),
            (
                "calendar_entries",
                """CREATE TABLE calendar_entries_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entry_date TEXT NOT NULL, meal_type TEXT NOT NULL,
                    recipe_id INTEGER, note TEXT, servings INTEGER NOT NULL DEFAULT 2,
                    user_id INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
                )""",
                """INSERT INTO calendar_entries_new
                   SELECT id, entry_date, meal_type, recipe_id, note, servings, user_id, created_at
                   FROM calendar_entries""",
            ),
            (
                "custom_shopping_items",
                """CREATE TABLE custom_shopping_items_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Other',
                    checked INTEGER NOT NULL DEFAULT 0,
                    user_id INTEGER REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    week_start TEXT
                )""",
                """INSERT INTO custom_shopping_items_new
                   SELECT id, text, category, checked, user_id, created_at, week_start FROM custom_shopping_items""",
            ),
        ):
            fk_list = conn.execute(f"PRAGMA foreign_key_list({tbl})").fetchall()
            if any(row[2] == "users_old" for row in fk_list):
                conn.execute(recreate_sql)
                conn.execute(insert_sql)
                conn.execute(f"DROP TABLE {tbl}")
                conn.execute(f"ALTER TABLE {tbl}_new RENAME TO {tbl}")
        # Drop users_old now that FKs are fixed and data is safe in users
        if conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users_old'"
        ).fetchone():
            conn.execute("DROP TABLE users_old")
        conn.execute("PRAGMA foreign_keys = ON")
    except Exception:
        conn.execute("PRAGMA foreign_keys = ON")
    # Migrate old settings table (key PK) to new schema (user_id+key PK)
    try:
        cur = conn.execute("PRAGMA table_info(settings)")
        cols = [row[1] for row in cur.fetchall()]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE settings RENAME TO settings_old")
            conn.execute("""
                CREATE TABLE settings (
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    PRIMARY KEY (user_id, key)
                )
            """)
            conn.execute("DROP TABLE settings_old")
    except Exception:
        pass
    conn.commit()
    conn.close()


# ---------- Users ----------

def get_or_create_user(google_id, email, name=None, picture=None):
    """Find an existing user by google_id or create a new one. Returns user dict."""
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE google_id = ?", (google_id,)).fetchone()
    if row:
        # Update profile info in case it changed
        conn.execute(
            "UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?",
            (email, name, picture, row["id"]),
        )
        conn.commit()
        user_id = row["id"]
    else:
        cur = conn.execute(
            "INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)",
            (google_id, email, name, picture),
        )
        conn.commit()
        user_id = cur.lastrowid
    user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
    conn.close()
    return user


def get_or_create_user_facebook(facebook_id, email, name=None, picture=None):
    """Find an existing user by facebook_id or create a new one. Returns user dict."""
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE facebook_id = ?", (facebook_id,)).fetchone()
    if row:
        conn.execute(
            "UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?",
            (email, name, picture, row["id"]),
        )
        conn.commit()
        user_id = row["id"]
    else:
        # Link to existing account with same email
        existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone() if email else None
        if existing:
            conn.execute("UPDATE users SET facebook_id = ?, name = COALESCE(name, ?), picture = COALESCE(picture, ?) WHERE id = ?",
                         (facebook_id, name, picture, existing["id"]))
            conn.commit()
            user_id = existing["id"]
        else:
            cur = conn.execute(
                "INSERT INTO users (facebook_id, email, name, picture) VALUES (?, ?, ?, ?)",
                (facebook_id, email or "", name, picture),
            )
            conn.commit()
            user_id = cur.lastrowid
    user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
    conn.close()
    return user


def get_user_by_id(user_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def adopt_orphan_data(user_id):
    """Assign all rows with user_id IS NULL to the given user. Called on first login."""
    conn = get_db()
    for table in ("recipes", "calendar_entries", "custom_shopping_items"):
        conn.execute(f"UPDATE {table} SET user_id = ? WHERE user_id IS NULL", (user_id,))
    conn.commit()
    conn.close()


# ---------- Settings ----------

def get_settings(user_id):
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings WHERE user_id = ?", (user_id,)).fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


def get_setting(user_id, key, default=None):
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE user_id = ? AND key = ?", (user_id, key)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(user_id, key, value):
    conn = get_db()
    conn.execute(
        "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?",
        (user_id, key, value, value),
    )
    conn.commit()
    conn.close()


# ---------- Recipe CRUD ----------

def create_recipe(user_id, title, ingredients, instructions, source_url=None,
                  image_url=None, total_time=None, servings=None, categories=None):
    conn = get_db()
    cur = conn.execute(
        """INSERT INTO recipes (title, source_url, image_url, total_time,
           servings, categories, ingredients, instructions, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, source_url, image_url, total_time, servings,
         json.dumps(categories or []), json.dumps(ingredients), json.dumps(instructions), user_id)
    )
    conn.commit()
    recipe_id = cur.lastrowid
    conn.close()
    return recipe_id


def get_recipe(user_id, recipe_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM recipes WHERE id = ? AND user_id = ?", (recipe_id, user_id)).fetchone()
    conn.close()
    if row is None:
        return None
    return _recipe_row_to_dict(row)


def get_all_recipes(user_id):
    conn = get_db()
    rows = conn.execute("SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
    conn.close()
    return [_recipe_row_to_dict(r) for r in rows]


def delete_recipe(user_id, recipe_id):
    conn = get_db()
    conn.execute("DELETE FROM recipes WHERE id = ? AND user_id = ?", (recipe_id, user_id))
    conn.commit()
    conn.close()


def delete_recipes_bulk(user_id, recipe_ids):
    if not recipe_ids:
        return
    conn = get_db()
    placeholders = ",".join("?" for _ in recipe_ids)
    conn.execute(f"DELETE FROM recipes WHERE id IN ({placeholders}) AND user_id = ?", [*recipe_ids, user_id])
    conn.commit()
    conn.close()


def update_recipe(user_id, recipe_id, title, ingredients, instructions,
                  source_url=None, image_url=None, total_time=None,
                  servings=None, categories=None):
    conn = get_db()
    conn.execute(
        """UPDATE recipes SET title=?, source_url=?, image_url=?,
           total_time=?, servings=?, categories=?, ingredients=?, instructions=?
           WHERE id=? AND user_id=?""",
        (title, source_url, image_url, total_time, servings,
         json.dumps(categories or []), json.dumps(ingredients),
         json.dumps(instructions), recipe_id, user_id))
    conn.commit()
    conn.close()


def update_recipe_image(recipe_id, image_url):
    conn = get_db()
    conn.execute("UPDATE recipes SET image_url = ? WHERE id = ?", (image_url, recipe_id))
    conn.commit()
    conn.close()


def toggle_favourite(user_id, recipe_id):
    conn = get_db()
    row = conn.execute("SELECT is_favourite FROM recipes WHERE id = ? AND user_id = ?", (recipe_id, user_id)).fetchone()
    if row is None:
        conn.close()
        return None
    new_val = 0 if row["is_favourite"] else 1
    conn.execute("UPDATE recipes SET is_favourite = ? WHERE id = ? AND user_id = ?", (new_val, recipe_id, user_id))
    conn.commit()
    conn.close()
    return bool(new_val)


def _recipe_row_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "source_url": row["source_url"],
        "image_url": row["image_url"],
        "total_time": row["total_time"],
        "servings": row["servings"],
        "categories": json.loads(row["categories"]) if row["categories"] else [],
        "ingredients": json.loads(row["ingredients"]),
        "instructions": json.loads(row["instructions"]),
        "created_at": row["created_at"],
        "is_favourite": bool(row["is_favourite"]) if "is_favourite" in row.keys() else False,
    }


# ---------- Calendar CRUD ----------

def get_entries_for_month(user_id, year, month):
    """Return all calendar entries for a given year/month, joined with recipe info."""
    first_day = date(year, month, 1)
    last_day = date(year, month, _calendar.monthrange(year, month)[1])
    return get_entries_for_range(user_id, first_day.isoformat(), last_day.isoformat())


def get_entries_for_range(user_id, start_date, end_date):
    """Return all calendar entries between start_date and end_date (inclusive)."""
    conn = get_db()
    rows = conn.execute("""
        SELECT ce.id, ce.entry_date, ce.meal_type, ce.recipe_id,
               ce.note, ce.servings, ce.created_at,
               r.title as recipe_title, r.image_url, r.servings as recipe_servings
        FROM calendar_entries ce
        LEFT JOIN recipes r ON r.id = ce.recipe_id
        WHERE ce.user_id = ? AND ce.entry_date >= ? AND ce.entry_date <= ?
        ORDER BY ce.entry_date,
            CASE ce.meal_type
                WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 END
    """, (user_id, start_date, end_date)).fetchall()
    conn.close()
    return [dict(e) for e in rows]


def add_calendar_entry(user_id, entry_date, meal_type, recipe_id=None, note=None, servings=2):
    conn = get_db()
    cur = conn.execute(
        """INSERT INTO calendar_entries
           (entry_date, meal_type, recipe_id, note, servings, user_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (entry_date, meal_type, recipe_id, note, servings, user_id)
    )
    conn.commit()
    entry_id = cur.lastrowid
    conn.close()
    return entry_id


def remove_calendar_entry(user_id, entry_id):
    conn = get_db()
    conn.execute("DELETE FROM calendar_entries WHERE id = ? AND user_id = ?", (entry_id, user_id))
    conn.commit()
    conn.close()


def move_calendar_entry(user_id, entry_id, entry_date, meal_type):
    conn = get_db()
    conn.execute(
        "UPDATE calendar_entries SET entry_date = ?, meal_type = ? WHERE id = ? AND user_id = ?",
        (entry_date, meal_type, entry_id, user_id)
    )
    conn.commit()
    conn.close()


def update_calendar_entry_servings(user_id, entry_id, servings):
    conn = get_db()
    conn.execute(
        "UPDATE calendar_entries SET servings = ? WHERE id = ? AND user_id = ?",
        (servings, entry_id, user_id)
    )
    conn.commit()
    conn.close()


def update_calendar_entry_note(user_id, entry_id, note):
    conn = get_db()
    conn.execute(
        "UPDATE calendar_entries SET note = ? WHERE id = ? AND user_id = ?",
        (note, entry_id, user_id)
    )
    conn.commit()
    conn.close()


def copy_calendar_entry(user_id, entry_id, entry_date, meal_type):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM calendar_entries WHERE id = ? AND user_id = ?", (entry_id, user_id)
    ).fetchone()
    if row is None:
        conn.close()
        return None
    cur = conn.execute(
        """INSERT INTO calendar_entries
           (entry_date, meal_type, recipe_id, note, servings, user_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (entry_date, meal_type, row["recipe_id"], row["note"], row["servings"], user_id)
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


INGREDIENT_CATEGORIES = [
    ("Meat & Fish", [
        "chicken", "beef", "lamb", "pork", "bacon", "ham", "sausage", "mince",
        "salmon", "cod", "prawn", "prawns", "fish", "turkey", "duck", "steak",
        "chorizo", "pancetta", "anchovy", "anchovies", "tuna", "sea bass",
        "mackerel", "sardine", "haddock", "brisket", "venison", "serrano",
    ]),
    ("Dairy & Eggs", [
        "milk", "cream", "cheese", "butter", "yoghurt", "yogurt", "egg", "eggs",
        "cheddar", "mozzarella", "parmesan", "mascarpone", "ricotta",
        "creme fraiche", "halloumi", "feta", "gruyere", "brie", "camembert",
        "sour cream", "clotted cream", "ghee",
    ]),
    ("Bakery & Bread", [
        "bread", "naan", "tortilla", "pitta", "pita", "croissant", "baguette",
        "flatbread", "ciabatta", "crouton", "croutons", "sourdough", "brioche",
        "focaccia", "wrap", "wraps", "breadcrumb",
    ]),
    ("Pasta, Rice & Grains", [
        "pasta", "spaghetti", "penne", "fusilli", "fusilloni", "rice", "noodle",
        "noodles", "couscous", "quinoa", "orzo", "tortellini", "tortiglioni",
        "gnocchi", "risoni", "tagliatelle", "linguine", "fettuccine", "lasagne",
        "macaroni", "bulgur", "polenta", "oats", "flour", "cornflour",
    ]),
    ("Tins & Jars", [
        "chopped tomatoes", "finely chopped tomatoes", "coconut milk", "passata",
        "stock cube", "stock pot", "stock mix", "bouillon", "chickpeas", "lentils",
        "kidney beans", "cannellini", "black beans", "baked beans", "coconut cream",
        "tomato puree", "tomato paste", "harissa", "pesto", "tahini",
    ]),
    ("Herbs, Spices & Seasonings", [
        "black pepper", "white pepper", "cumin", "paprika", "oregano", "basil",
        "thyme", "rosemary", "parsley", "cinnamon", "turmeric", "chilli flakes",
        "chili flakes", "bay leaf", "bay leaves", "nutmeg", "mixed herbs",
        "dried herbs", "dried basil", "dried oregano", "italian seasoning",
        "cardamom", "fennel seed", "mustard seed", "star anise", "sumac",
        "garam masala", "curry powder", "five spice", "saffron", "dill",
        "tarragon", "sage", "mixed spice", "seasoning", "sesame seeds",
    ]),
    ("Oils, Sauces & Condiments", [
        "olive oil", "vegetable oil", "sesame oil", "coconut oil", "oil",
        "vinegar", "balsamic", "soy sauce", "worcestershire", "mustard",
        "ketchup", "mayonnaise", "honey", "maple syrup", "fish sauce",
        "oyster sauce", "sriracha", "mirin",
    ]),
    ("Fruits & Vegetables", [
        "onion", "garlic", "tomato", "tomatoes", "pepper", "peppers",
        "courgette", "aubergine", "carrot", "potato", "potatoes",
        "mushroom", "mushrooms", "lettuce", "spinach", "broccoli",
        "cucumber", "avocado", "lemon", "lime", "apple", "berry",
        "berries", "banana", "beetroot", "celery", "leek", "chilli",
        "ginger", "sweet potato", "butternut", "squash", "cabbage",
        "kale", "rocket", "watercress", "asparagus", "pea", "peas",
        "green beans", "runner beans", "mange tout", "radish", "turnip",
        "parsnip", "fennel", "spring onion", "shallot", "cherry tomatoes",
        "plum", "pear", "orange", "mango", "pineapple", "peach", "fig",
        "pomegranate", "raspberry", "strawberry", "blueberry", "cranberry",
        "grape", "coriander", "mint", "chestnut",
    ]),
]

_QUANTITY_UNIT_RE = _re.compile(
    r'^\d[\d/.\s]*(kg|g|mg|lb|oz|l|ml|cl|tsp|tbsp|cup|cups|pint|pints|'
    r'pinch|handful|bunch|slice|slices|can|cans|tin|tins|pack|packs|'
    r'bag|bags|head|heads|clove|cloves|sprig|sprigs|sheet|sheets|'
    r'stick|sticks|rasher|rashers)s?\b\.?\s*',
    _re.IGNORECASE
)


def categorize_ingredient(text):
    """Return the shopping category for an ingredient string."""
    cleaned = _QUANTITY_UNIT_RE.sub('', text)
    cleaned = _re.sub(r'^\d[\d/.\s]*\s+', '', cleaned)
    cleaned = cleaned.lower().strip()
    core = cleaned.split(',')[0].strip()

    for category, keywords in INGREDIENT_CATEGORIES:
        for kw in sorted(keywords, key=len, reverse=True):
            if kw in core:
                return category
    return "Other"


# ---------- Custom Shopping Items ----------

def get_custom_shopping_items(user_id, week_start=None):
    conn = get_db()
    if week_start:
        rows = conn.execute(
            "SELECT id, text, category, checked FROM custom_shopping_items WHERE user_id = ? AND week_start = ? ORDER BY created_at",
            (user_id, week_start)).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, text, category, checked FROM custom_shopping_items WHERE user_id = ? ORDER BY created_at",
            (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_custom_shopping_item(user_id, text, category="Other", week_start=None):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO custom_shopping_items (text, category, user_id, week_start) VALUES (?, ?, ?, ?)",
        (text, category, user_id, week_start)
    )
    conn.commit()
    item_id = cur.lastrowid
    conn.close()
    return item_id


def delete_custom_shopping_item(user_id, item_id):
    conn = get_db()
    conn.execute("DELETE FROM custom_shopping_items WHERE id = ? AND user_id = ?", (item_id, user_id))
    conn.commit()
    conn.close()


def clear_custom_shopping_items(user_id, week_start=None):
    conn = get_db()
    if week_start:
        conn.execute("DELETE FROM custom_shopping_items WHERE user_id = ? AND week_start = ?", (user_id, week_start))
    else:
        conn.execute("DELETE FROM custom_shopping_items WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()


def get_shopping_list_for_range(user_id, start_date, end_date):
    """Aggregate all ingredients across calendar entries in the date range, scaled by servings."""
    conn = get_db()
    rows = conn.execute("""
        SELECT r.title as recipe_title, r.ingredients, r.servings as recipe_servings,
               ce.servings as planned_servings
        FROM calendar_entries ce
        JOIN recipes r ON r.id = ce.recipe_id
        WHERE ce.user_id = ? AND ce.entry_date >= ? AND ce.entry_date <= ?
              AND ce.recipe_id IS NOT NULL
    """, (user_id, start_date, end_date)).fetchall()
    conn.close()

    # Merge map: normalised_name -> { qty, unit, raw_name, recipes }
    merge_map = {}   # key -> { qty: float|None, unit: str|None, name: str, recipes: [] }
    merge_order = [] # preserve first-seen order of keys

    for row in rows:
        recipe_title = row["recipe_title"]
        ingredients = json.loads(row["ingredients"])
        recipe_servings = _parse_servings(row["recipe_servings"])
        planned_servings = row["planned_servings"] or 2
        if recipe_servings and recipe_servings != planned_servings:
            ratio = planned_servings / recipe_servings
            ingredients = [_scale_ingredient(i, ratio) for i in ingredients]

        for ing in ingredients:
            qty, unit, name = _parse_ingredient(ing)
            clean_name = _clean_ingredient_name(name)
            norm = _normalise_name(name)
            if not norm:
                norm = ing.strip().lower()
                clean_name = ing.strip()

            # Use unit-qualified key so "400g tomatoes" and "1 can tomatoes" stay separate
            unit_key = (unit or "").lower()
            key = f"{norm}||{unit_key}"

            if key not in merge_map:
                merge_map[key] = {"qty": None, "unit": unit, "name": clean_name, "recipes": []}
                merge_order.append(key)

            entry = merge_map[key]
            if qty is not None:
                if entry["qty"] is not None:
                    entry["qty"] += qty
                else:
                    entry["qty"] = qty
                    entry["unit"] = unit
            if recipe_title not in entry["recipes"]:
                entry["recipes"].append(recipe_title)

    results = []
    for key in merge_order:
        entry = merge_map[key]
        text = _format_ingredient(entry["qty"], entry["unit"], entry["name"])
        results.append({
            "text": text,
            "recipes": entry["recipes"],
            "category": categorize_ingredient(entry["name"]),
        })
    return results


# Regex to parse "2 tbsp olive oil" → (2.0, "tbsp", "olive oil")
_INGREDIENT_PARSE_RE = _re.compile(
    r'^(\d[\d/.\s]*)\s*'
    r'(kg|g|mg|lb|oz|l|ml|cl|tsp|tbsp|cup|cups|pint|pints|'
    r'pinch|handful|bunch|slice|slices|can|cans|tin|tins|pack|packs|'
    r'bag|bags|head|heads|clove|cloves|sprig|sprigs|sheet|sheets|'
    r'stick|sticks|rasher|rashers)s?\b\.?\s*(.*)',
    _re.IGNORECASE
)

# Simpler: "2 onions" → (2.0, None, "onions")
_INGREDIENT_PLAIN_QTY_RE = _re.compile(
    r'^(\d[\d/.\s]*)\s+(.*)'
)


def _parse_fraction(s):
    """Parse a number string that may contain fractions like '1/2' or '1 1/2'."""
    s = s.strip()
    parts = s.split()
    total = 0.0
    for part in parts:
        if '/' in part:
            nums = part.split('/')
            try:
                total += float(nums[0]) / float(nums[1])
            except (ValueError, ZeroDivisionError):
                pass
        else:
            try:
                total += float(part)
            except ValueError:
                pass
    return total if total > 0 else None


def _parse_ingredient(text):
    """Parse an ingredient string into (quantity, unit, name). Any part may be None."""
    text = text.strip()
    m = _INGREDIENT_PARSE_RE.match(text)
    if m:
        qty = _parse_fraction(m.group(1))
        unit = m.group(2).lower().rstrip('s').rstrip('.')
        name = m.group(3).strip()
        name = _re.sub(r'^of\s+', '', name)
        return qty, unit, name if name else text

    m = _INGREDIENT_PLAIN_QTY_RE.match(text)
    if m:
        qty = _parse_fraction(m.group(1))
        name = m.group(2).strip()
        return qty, None, name

    return None, None, text


def _normalise_name(name):
    """Normalise an ingredient name for matching: lowercase, strip trailing commas and prep notes."""
    if not name:
        return ""
    n = name.lower().strip()
    # Strip trailing prep e.g. ", diced" / ", finely chopped"
    n = _re.split(r',\s', n)[0]
    # Strip leading "of " (from "of olive oil")
    n = _re.sub(r'^of\s+', '', n)
    # Basic plural → singular: "onions" → "onion", "tomatoes" → "tomato"
    if len(n) > 3:
        if n.endswith('oes'):
            n = n[:-2]       # tomatoes → tomato
        elif n.endswith('ies'):
            n = n[:-3] + 'y' # berries → berry
        elif n.endswith('s') and not n.endswith('ss'):
            n = n[:-1]       # onions → onion
    return n.strip()


def _clean_ingredient_name(name):
    """Strip preparation instructions from an ingredient name for display.
    E.g. 'aubergines, cut into 3cm chunks' → 'aubergines'
    """
    if not name:
        return name
    # Strip everything after a comma (prep instructions)
    n = _re.split(r',\s*', name)[0]
    # Strip parenthetical prep notes like "(diced)"
    n = _re.sub(r'\s*\(.*?\)\s*', ' ', n).strip()
    return n


def _units_compatible(u1, u2):
    """Check if two units can be summed directly."""
    if u1 == u2:
        return True
    if u1 is None or u2 is None:
        return True
    return False


def _format_ingredient(qty, unit, name):
    """Reconstruct an ingredient string from parts."""
    if qty is None:
        return name
    q = int(qty) if qty == int(qty) else round(qty, 1)
    if unit:
        return f"{q} {unit} {name}"
    return f"{q} {name}"


def _parse_servings(s):
    """Extract a number from a servings string like '4 servings' or '6'."""
    if not s:
        return None
    m = _re.search(r'(\d+)', str(s))
    return int(m.group(1)) if m else None


def _scale_ingredient(ingredient, ratio):
    """Scale the first number found in an ingredient string by ratio."""
    def _replace_num(match):
        num = float(match.group())
        scaled = num * ratio
        if scaled == int(scaled):
            return str(int(scaled))
        return f"{scaled:.1f}"
    result = _re.sub(r'\d+\.?\d*', _replace_num, ingredient, count=1)
    if result == ingredient and not _re.search(r'\d', ingredient):
        qty = str(int(ratio)) if ratio == int(ratio) else f"{ratio:.1f}"
        return f"{qty} {ingredient}"
    return result
