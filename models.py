import sqlite3
import json
import os
import re as _re
from datetime import datetime, date, timedelta
import calendar as _calendar

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "mealplanner.db"))


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS calendar_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_date TEXT NOT NULL,
            meal_type TEXT NOT NULL,
            recipe_id INTEGER,
            note TEXT,
            servings INTEGER NOT NULL DEFAULT 2,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
        );
    """)
    conn.commit()
    conn.close()


# ---------- Recipe CRUD ----------

def create_recipe(title, ingredients, instructions, source_url=None,
                  image_url=None, total_time=None, servings=None, categories=None):
    conn = get_db()
    cur = conn.execute(
        """INSERT INTO recipes (title, source_url, image_url, total_time,
           servings, categories, ingredients, instructions)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, source_url, image_url, total_time, servings,
         json.dumps(categories or []), json.dumps(ingredients), json.dumps(instructions))
    )
    conn.commit()
    recipe_id = cur.lastrowid
    conn.close()
    return recipe_id


def get_recipe(recipe_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    conn.close()
    if row is None:
        return None
    return _recipe_row_to_dict(row)


def get_all_recipes():
    conn = get_db()
    rows = conn.execute("SELECT * FROM recipes ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_recipe_row_to_dict(r) for r in rows]


def delete_recipe(recipe_id):
    conn = get_db()
    conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    conn.commit()
    conn.close()


def update_recipe(recipe_id, title, ingredients, instructions,
                  source_url=None, image_url=None, total_time=None,
                  servings=None, categories=None):
    conn = get_db()
    conn.execute(
        """UPDATE recipes SET title=?, source_url=?, image_url=?,
           total_time=?, servings=?, categories=?, ingredients=?, instructions=?
           WHERE id=?""",
        (title, source_url, image_url, total_time, servings,
         json.dumps(categories or []), json.dumps(ingredients),
         json.dumps(instructions), recipe_id))
    conn.commit()
    conn.close()


def update_recipe_image(recipe_id, image_url):
    conn = get_db()
    conn.execute("UPDATE recipes SET image_url = ? WHERE id = ?", (image_url, recipe_id))
    conn.commit()
    conn.close()


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
    }


# ---------- Calendar CRUD ----------

def get_entries_for_month(year, month):
    """Return all calendar entries for a given year/month, joined with recipe info."""
    first_day = date(year, month, 1)
    last_day = date(year, month, _calendar.monthrange(year, month)[1])
    return get_entries_for_range(first_day.isoformat(), last_day.isoformat())


def get_entries_for_range(start_date, end_date):
    """Return all calendar entries between start_date and end_date (inclusive)."""
    conn = get_db()
    rows = conn.execute("""
        SELECT ce.id, ce.entry_date, ce.meal_type, ce.recipe_id,
               ce.note, ce.servings, ce.created_at,
               r.title as recipe_title, r.image_url, r.servings as recipe_servings
        FROM calendar_entries ce
        LEFT JOIN recipes r ON r.id = ce.recipe_id
        WHERE ce.entry_date >= ? AND ce.entry_date <= ?
        ORDER BY ce.entry_date,
            CASE ce.meal_type
                WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 END
    """, (start_date, end_date)).fetchall()
    conn.close()
    return [dict(e) for e in rows]


def add_calendar_entry(entry_date, meal_type, recipe_id=None, note=None, servings=2):
    conn = get_db()
    cur = conn.execute(
        """INSERT INTO calendar_entries
           (entry_date, meal_type, recipe_id, note, servings)
           VALUES (?, ?, ?, ?, ?)""",
        (entry_date, meal_type, recipe_id, note, servings)
    )
    conn.commit()
    entry_id = cur.lastrowid
    conn.close()
    return entry_id


def remove_calendar_entry(entry_id):
    conn = get_db()
    conn.execute("DELETE FROM calendar_entries WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()


def move_calendar_entry(entry_id, entry_date, meal_type):
    conn = get_db()
    conn.execute(
        "UPDATE calendar_entries SET entry_date = ?, meal_type = ? WHERE id = ?",
        (entry_date, meal_type, entry_id)
    )
    conn.commit()
    conn.close()


def copy_calendar_entry(entry_id, entry_date, meal_type):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM calendar_entries WHERE id = ?", (entry_id,)
    ).fetchone()
    if row is None:
        conn.close()
        return None
    cur = conn.execute(
        """INSERT INTO calendar_entries
           (entry_date, meal_type, recipe_id, note, servings)
           VALUES (?, ?, ?, ?, ?)""",
        (entry_date, meal_type, row["recipe_id"], row["note"], row["servings"])
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


def get_shopping_list_for_range(start_date, end_date):
    """Aggregate all ingredients across calendar entries in the date range, scaled by servings."""
    conn = get_db()
    rows = conn.execute("""
        SELECT r.title as recipe_title, r.ingredients, r.servings as recipe_servings,
               ce.servings as planned_servings
        FROM calendar_entries ce
        JOIN recipes r ON r.id = ce.recipe_id
        WHERE ce.entry_date >= ? AND ce.entry_date <= ?
              AND ce.recipe_id IS NOT NULL
    """, (start_date, end_date)).fetchall()
    conn.close()
    ingredient_map = {}  # ingredient_text -> list of recipe titles
    ingredient_order = []  # preserve insertion order
    for row in rows:
        recipe_title = row["recipe_title"]
        ingredients = json.loads(row["ingredients"])
        recipe_servings = _parse_servings(row["recipe_servings"])
        planned_servings = row["planned_servings"] or 2
        if recipe_servings and recipe_servings != planned_servings:
            ratio = planned_servings / recipe_servings
            ingredients = [_scale_ingredient(i, ratio) for i in ingredients]
        for ing in ingredients:
            if ing not in ingredient_map:
                ingredient_map[ing] = []
                ingredient_order.append(ing)
            if recipe_title not in ingredient_map[ing]:
                ingredient_map[ing].append(recipe_title)
    return [{"text": ing, "recipes": ingredient_map[ing], "category": categorize_ingredient(ing)} for ing in ingredient_order]


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
