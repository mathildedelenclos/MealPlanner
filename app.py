import os
import io
import gzip
import json
import re
import zipfile
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from recipe_scrapers import scrape_html
from google import genai

import models

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key")

# Initialise the database on startup
models.init_db()

# Gemini client (lazy – only used when the chat endpoint is hit)
_gemini_client = None


def _get_gemini():
    global _gemini_client
    if _gemini_client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key or api_key == "your-api-key-here":
            return None
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


# ──────────────────────────────────────
# Pages
# ──────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ──────────────────────────────────────
# Recipe API
# ──────────────────────────────────────

@app.route("/api/recipes", methods=["GET"])
def api_get_recipes():
    return jsonify(models.get_all_recipes())


@app.route("/api/recipes/<int:recipe_id>", methods=["GET"])
def api_get_recipe(recipe_id):
    recipe = models.get_recipe(recipe_id)
    if recipe is None:
        return jsonify({"error": "Recipe not found"}), 404
    return jsonify(recipe)


@app.route("/api/recipes", methods=["POST"])
def api_create_recipe():
    data = request.get_json(force=True)
    title = data.get("title", "").strip()
    ingredients = data.get("ingredients", [])
    instructions = data.get("instructions", [])
    if not title or not ingredients:
        return jsonify({"error": "Title and ingredients are required"}), 400
    recipe_id = models.create_recipe(
        title=title,
        ingredients=ingredients,
        instructions=instructions,
        source_url=data.get("source_url"),
        image_url=data.get("image_url"),
        total_time=data.get("total_time"),
        servings=data.get("servings"),
        categories=data.get("categories"),
    )
    return jsonify({"id": recipe_id}), 201


@app.route("/api/recipes/<int:recipe_id>", methods=["DELETE"])
def api_delete_recipe(recipe_id):
    models.delete_recipe(recipe_id)
    return jsonify({"ok": True})


# ──────────────────────────────────────
# URL Recipe Scraper
# ──────────────────────────────────────

@app.route("/api/scrape", methods=["POST"])
def api_scrape_url():
    data = request.get_json(force=True)
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL is required"}), 400

    try:
        html = requests.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                              "AppleWebKit/537.36 (KHTML, like Gecko) "
                              "Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
            timeout=15,
        ).text
        scraper = scrape_html(html=html, org_url=url)

        title = scraper.title() or "Untitled Recipe"
        ingredients = scraper.ingredients() or []
        instructions_raw = scraper.instructions() or ""

        # instructions() returns a single string – split into steps
        if isinstance(instructions_raw, str):
            instructions = [
                s.strip() for s in re.split(r"\n+", instructions_raw) if s.strip()
            ]
        else:
            instructions = list(instructions_raw)

        image = None
        try:
            image = scraper.image()
        except Exception:
            pass

        total_time = None
        try:
            total_time = str(scraper.total_time()) + " min"
        except Exception:
            pass

        servings = None
        try:
            servings = str(scraper.yields())
        except Exception:
            pass

        return jsonify({
            "title": title,
            "ingredients": ingredients,
            "instructions": instructions,
            "image_url": image,
            "total_time": total_time,
            "servings": servings,
            "source_url": url,
        })

    except Exception as exc:
        return jsonify({"error": f"Could not scrape recipe: {exc}"}), 400


# ──────────────────────────────────────
# Import Paprika
# ──────────────────────────────────────

@app.route("/api/import-paprika", methods=["POST"])
def api_import_paprika():
    """Import recipes from a .paprikarecipes file."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "No file selected"}), 400

    imported = []
    try:
        raw = f.read()

        recipes_json = []

        # Try ZIP-inside-gzip first (.paprikarecipes)
        try:
            decompressed = gzip.decompress(raw)
            zf = zipfile.ZipFile(io.BytesIO(decompressed))
            for name in zf.namelist():
                entry_data = zf.read(name)
                try:
                    recipe_data = gzip.decompress(entry_data)
                except Exception:
                    recipe_data = entry_data
                recipes_json.append(json.loads(recipe_data))
        except Exception:
            try:
                zf = zipfile.ZipFile(io.BytesIO(raw))
                for name in zf.namelist():
                    entry_data = zf.read(name)
                    try:
                        recipe_data = gzip.decompress(entry_data)
                    except Exception:
                        recipe_data = entry_data
                    recipes_json.append(json.loads(recipe_data))
            except Exception:
                try:
                    decompressed = gzip.decompress(raw)
                    recipes_json.append(json.loads(decompressed))
                except Exception:
                    recipes_json.append(json.loads(raw))

        for r in recipes_json:
            title = r.get("name", "").strip()
            if not title:
                continue
            ingredients_raw = r.get("ingredients", "")
            ingredients = [line.strip() for line in ingredients_raw.split("\n") if line.strip()]
            directions_raw = r.get("directions", "")
            instructions = [line.strip() for line in directions_raw.split("\n") if line.strip()]
            servings = r.get("servings", None)
            total_time = r.get("total_time", None)
            source_url = r.get("source_url") or r.get("url") or None
            image_url = r.get("image_url") or r.get("photo_url") or None
            cat_raw = r.get("categories", "")
            categories = [c.strip() for c in cat_raw.split("\n") if c.strip()] if isinstance(cat_raw, str) else (cat_raw or [])

            recipe_id = models.create_recipe(
                title=title,
                ingredients=ingredients if ingredients else [""],
                instructions=instructions if instructions else [""],
                source_url=source_url,
                image_url=image_url,
                total_time=total_time,
                servings=servings,
                categories=categories,
            )
            imported.append({"id": recipe_id, "title": title})

    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 400

    return jsonify({"imported": imported, "count": len(imported)})


@app.route("/api/categories", methods=["GET"])
def api_get_categories():
    """Return all unique categories used across recipes."""
    recipes = models.get_all_recipes()
    cats = set()
    for r in recipes:
        for c in r.get("categories", []):
            cats.add(c)
    return jsonify(sorted(cats))


# ──────────────────────────────────────
# Calendar API
# ──────────────────────────────────────

@app.route("/api/calendar", methods=["GET"])
def api_get_calendar():
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return jsonify({"error": "year and month are required"}), 400
    entries = models.get_entries_for_month(year, month)
    return jsonify(entries)


@app.route("/api/calendar/entries", methods=["POST"])
def api_add_calendar_entry():
    data = request.get_json(force=True)
    entry_date = data.get("entry_date", "").strip()
    meal_type = data.get("meal_type", "").lower()
    recipe_id = data.get("recipe_id")
    note = data.get("note")
    servings = data.get("servings", 2)
    if not entry_date or not meal_type:
        return jsonify({"error": "entry_date and meal_type are required"}), 400
    if not recipe_id and not note:
        return jsonify({"error": "Either recipe_id or note is required"}), 400
    entry_id = models.add_calendar_entry(entry_date, meal_type,
                                         recipe_id=recipe_id, note=note,
                                         servings=servings)
    return jsonify({"id": entry_id}), 201


@app.route("/api/calendar/entries/<int:entry_id>", methods=["DELETE"])
def api_remove_calendar_entry(entry_id):
    models.remove_calendar_entry(entry_id)
    return jsonify({"ok": True})


@app.route("/api/calendar/entries/<int:entry_id>/move", methods=["PATCH"])
def api_move_calendar_entry(entry_id):
    data = request.get_json(force=True)
    entry_date = data.get("entry_date", "").strip()
    meal_type = data.get("meal_type", "").lower()
    if not entry_date or not meal_type:
        return jsonify({"error": "entry_date and meal_type are required"}), 400
    models.move_calendar_entry(entry_id, entry_date, meal_type)
    return jsonify({"ok": True})


@app.route("/api/calendar/entries/<int:entry_id>/copy", methods=["POST"])
def api_copy_calendar_entry(entry_id):
    data = request.get_json(force=True)
    entry_date = data.get("entry_date", "").strip()
    meal_type = data.get("meal_type", "").lower()
    if not entry_date or not meal_type:
        return jsonify({"error": "entry_date and meal_type are required"}), 400
    new_id = models.copy_calendar_entry(entry_id, entry_date, meal_type)
    if new_id is None:
        return jsonify({"error": "Entry not found"}), 404
    return jsonify({"id": new_id}), 201


@app.route("/api/shopping-list", methods=["GET"])
def api_shopping_list():
    start = request.args.get("start", "").strip()
    end = request.args.get("end", "").strip()
    if not start or not end:
        return jsonify({"error": "start and end dates are required"}), 400
    items = models.get_shopping_list_for_range(start, end)
    return jsonify(items)


@app.route("/api/generate-meal-plan", methods=["POST"])
def api_generate_meal_plan():
    """Take an AI-generated meal_plan object, save all recipes, create calendar entries."""
    from datetime import datetime, timedelta
    data = request.get_json(force=True)
    entries = data.get("entries", [])
    if not entries:
        return jsonify({"error": "No entries provided"}), 400

    # Collect unique dates from entries, or default to next 7 days
    today = datetime.now().date()
    entry_dates = sorted(set(e.get("day", "") for e in entries if e.get("day")))
    if not entry_dates:
        days_until_monday = (7 - today.weekday()) % 7 or 7
        start = today + timedelta(days=days_until_monday)
        entry_dates = [(start + timedelta(days=i)).isoformat() for i in range(7)]

    saved = []
    for entry in entries:
        recipe_data = entry.get("recipe", {})
        title = recipe_data.get("title", "").strip()
        if not title:
            continue
        ingredients = recipe_data.get("ingredients", [])
        instructions = recipe_data.get("instructions", [])
        recipe_id = models.create_recipe(
            title=title,
            ingredients=ingredients if ingredients else [""],
            instructions=instructions if instructions else [""],
            source_url=recipe_data.get("source_url"),
            image_url=recipe_data.get("image_url"),
            total_time=recipe_data.get("total_time"),
            servings=recipe_data.get("servings"),
            categories=recipe_data.get("categories"),
        )
        day = entry.get("day", "")
        meal = entry.get("meal", "").lower()
        servings_num = 2
        try:
            s = recipe_data.get("servings", "")
            m = re.search(r'(\d+)', str(s))
            if m:
                servings_num = int(m.group(1))
        except Exception:
            pass
        models.add_calendar_entry(day, meal, recipe_id=recipe_id, servings=servings_num)
        saved.append({"title": title, "day": day, "meal": meal})

    return jsonify({"entries_created": len(saved), "saved": saved}), 201


@app.route("/api/regenerate-recipe", methods=["POST"])
def api_regenerate_recipe():
    """Ask AI to generate one replacement recipe for a specific meal slot."""
    client = _get_gemini()
    if client is None:
        return jsonify({"error": "Gemini API key not configured."}), 503

    data = request.get_json(force=True)
    day = data.get("day", "")
    meal = data.get("meal", "")
    old_title = data.get("old_title", "")
    context = data.get("context", "")

    prompt = (
        f"I need a replacement recipe for {meal} on {day}. "
        f"The previous recipe was \"{old_title}\" and I'd like something different. "
        f"{context} "
        "The recipe MUST come from a real recipe website (e.g. BBC Good Food, RecipeTin Eats, Mob Kitchen, Serious Eats, etc). "
        "You MUST provide the real source_url to the specific recipe page. "
        "Return ONLY a JSON object (no markdown) with this structure: "
        '{"recipe": {"title": "...", "ingredients": ["..."], "instructions": ["..."], '
        '"total_time": "...", "servings": "...", "source_url": "https://...", "categories": ["..."]}}'
    )

    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config={
                "system_instruction": "You are a creative chef. Always use METRIC measurements. Every recipe must come from a real, well-known recipe website with a valid source_url. Never invent recipes. Return only valid JSON, no markdown fences.",
                "temperature": 0.9,
                "max_output_tokens": 2000,
            },
        )
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)
        return jsonify(parsed)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ──────────────────────────────────────
# Scrape Recipe Image from source URL
# ──────────────────────────────────────

@app.route("/api/scrape-recipe-image", methods=["POST"])
def api_scrape_recipe_image():
    """Scrape the hero image from a recipe source URL with multiple fallbacks."""
    data = request.get_json(force=True)
    url = data.get("source_url", "").strip()
    if not url:
        return jsonify({"error": "source_url is required"}), 400

    try:
        resp = requests.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                              "AppleWebKit/537.36 (KHTML, like Gecko) "
                              "Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
            },
            timeout=15,
            allow_redirects=True,
        )
        if resp.status_code >= 400:
            return jsonify({"error": f"URL returned {resp.status_code}"}), 404
        html_text = resp.text
        image_url = None

        # Attempt 1: recipe-scrapers
        try:
            scraper = scrape_html(html=html_text, org_url=url)
            image_url = scraper.image()
        except Exception:
            pass

        # Attempt 2: Open Graph / meta tags fallback
        if not image_url:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_text, "html.parser")
            og = soup.find("meta", property="og:image")
            if og and og.get("content"):
                image_url = og["content"]
            if not image_url:
                tw = soup.find("meta", attrs={"name": "twitter:image"})
                if tw and tw.get("content"):
                    image_url = tw["content"]
            if not image_url:
                for img in soup.find_all("img", src=True):
                    src = img["src"]
                    if any(skip in src.lower() for skip in [".svg", "icon", "logo", "avatar", "1x1", "pixel"]):
                        continue
                    if src.startswith("data:"):
                        continue
                    image_url = src
                    break

        if image_url:
            if image_url.startswith("//"):
                image_url = "https:" + image_url
            elif image_url.startswith("/"):
                from urllib.parse import urlparse
                parsed = urlparse(url)
                image_url = f"{parsed.scheme}://{parsed.netloc}{image_url}"
            return jsonify({"image_url": image_url})
        return jsonify({"error": "No image found on page"}), 404
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ──────────────────────────────────────
# AI Chatbot
# ──────────────────────────────────────

SYSTEM_PROMPT = """You are a friendly and creative meal-planning assistant.
When the user asks you to suggest meals, generate a structured JSON response.
Always use METRIC measurements (grams, kilograms, millilitres, litres, Celsius) — never use cups, ounces, pounds, or Fahrenheit.

CRITICAL RULE: Every recipe you suggest MUST come from a real, existing recipe on a well-known recipe website. You MUST provide the actual source_url to the original recipe page. Never invent recipes — always reference real ones from sites like BBC Good Food, RecipeTin Eats, Mob Kitchen, Delicious Magazine, Taste.com.au, Budget Bytes, Serious Eats, Cookie and Kate, Simply Recipes, etc.
The source_url MUST be a real, working URL to the specific recipe page (not just the homepage). This is mandatory for every recipe.

You can respond in two modes:

1. RECIPE SUGGESTIONS — when the user asks for recipe ideas:
{
  "message": "A friendly text response",
  "recipes": [
    {
      "title": "Recipe Name",
      "ingredients": ["ingredient 1", "ingredient 2"],
      "instructions": ["Step 1", "Step 2"],
      "total_time": "30 min",
      "servings": "4 servings",
      "source_url": "https://www.bbcgoodfood.com/recipes/example",
      "categories": ["Dinner", "Pasta"]
    }
  ]
}

2. MEAL PLAN — when the user asks you to create/generate/plan a meal plan or weekly meals:
{
  "message": "A friendly text response",
  "meal_plan": {
    "entries": [
      {
        "day": "2026-04-06",
        "meal": "lunch",
        "recipe": {
          "title": "Recipe Name",
          "ingredients": ["ingredient 1"],
          "instructions": ["Step 1"],
          "total_time": "30 min",
          "servings": "4 servings",
          "source_url": "https://www.bbcgoodfood.com/recipes/example",
          "categories": ["Lunch"]
        }
      },
      {
        "day": "2026-04-06",
        "meal": "dinner",
        "recipe": { ... }
      }
    ]
  },
  "recipes": []
}

Days must be ISO date strings (YYYY-MM-DD). When the user asks for a week of meals, start from the next upcoming Monday and generate 7 consecutive days.
Meals must be: lunch, dinner.
Include both lunch and dinner for each day requested.
REMEMBER: source_url is MANDATORY for every recipe. Always provide a real, specific URL to the recipe on a well-known recipe website. Never set it to null.
If the user is just chatting and not asking for recipes or meal plans, return an empty recipes array and no meal_plan.
Be creative, consider dietary preferences, and suggest balanced meals.
Keep ingredient lists practical and instructions clear."""


@app.route("/api/chat", methods=["POST"])
def api_chat():
    client = _get_gemini()
    if client is None:
        return jsonify({
            "error": "Gemini API key not configured. Add GEMINI_API_KEY to your .env file."
        }), 503

    data = request.get_json(force=True)
    user_message = data.get("message", "").strip()
    history = data.get("history", [])

    if not user_message:
        return jsonify({"error": "Message is required"}), 400

    contents = []
    for msg in history[-10:]:
        role = "model" if msg.get("role") == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=contents,
            config={
                "system_instruction": SYSTEM_PROMPT,
                "temperature": 0.8,
                "max_output_tokens": 8000,
            },
        )
        raw = response.text.strip()

        try:
            if raw.startswith("```"):
                raw = re.sub(r"^```(?:json)?\s*", "", raw)
                raw = re.sub(r"\s*```$", "", raw)
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"message": raw, "recipes": []}

        return jsonify(parsed)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ──────────────────────────────────────

if __name__ == "__main__":
    debug = os.getenv("FLASK_ENV", "development") != "production"
    app.run(host="0.0.0.0", debug=debug, port=5001)
