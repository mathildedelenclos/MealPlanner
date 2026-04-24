# Meal Planner

A personal meal planning and recipe management web app. Save recipes, plan your week on a calendar, and generate a shopping list automatically.

![Tests](https://github.com/mathildedelenclos/MealPlanner/actions/workflows/tests.yml/badge.svg)

## Features

- **Recipe library** — save recipes manually, scrape them from any URL, or import from Paprika or Excel
- **Meal calendar** — assign recipes to lunch/dinner slots, drag to move, adjust servings per slot
- **Shopping list** — auto-generated from your calendar, ingredients scaled to planned servings and grouped by category
- **AI assistant** — chat with Gemini, auto-generate a weekly meal plan, or regenerate a single meal slot
- **Google & Facebook login** — OAuth2 authentication with per-user data isolation
- **English / French** — full UI localisation

## Getting Started

### Prerequisites

- Python 3.9+
- A `.env` file (copy from `.env.example`)

### Local development

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open [http://localhost:5001](http://localhost:5001).

### Docker

```bash
docker-compose up -d
```

The app runs on port `5001` and stores data in a named Docker volume so it persists across restarts.

## Configuration

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | Random string used to sign Flask sessions |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `FACEBOOK_CLIENT_ID` | No | Facebook app ID (enables Facebook login) |
| `FACEBOOK_CLIENT_SECRET` | No | Facebook app secret |
| `GEMINI_API_KEY` | No | Enables AI features (meal plan generation, chat) |
| `BASE_URL` | Production | Full URL of your deployment, e.g. `https://meal-planner.ddns.net` — required for OAuth redirects behind a reverse proxy |
| `DATABASE_PATH` | No | Path to the SQLite file (default: `./mealplanner.db`) |
| `FLASK_ENV` | No | Set to `production` to disable debug mode |

## Importing Recipes

| Source | How |
|---|---|
| **URL** | Paste any recipe URL into the import dialog — supports 200+ sites via recipe-scrapers |
| **Paprika** | Export a `.paprikarecipes` file from Paprika and upload it |
| **Excel** | Upload an `.xlsx` file with columns: `Recipe Name`, `Ingredients`, `Method`, `Servings`, `Cook Time`, `Categories` |

## Running Tests

Backend API tests (pytest, isolated SQLite per test):

```bash
python -m pytest tests/test_app.py -v
```

End-to-end tests (Playwright, desktop + iPhone emulation):

```bash
npm install
npx playwright install chromium webkit
npm run test:e2e                 # both projects (desktop + mobile)
npx playwright test --project=desktop
npx playwright test --project=mobile
```

E2E tests spin up the Flask app on port 5002 with `FLASK_TEST_MODE=1` (activates `/test/login` and `/test/reset` routes) against a temp SQLite file at `/tmp/meal_e2e.db`, so the real database is never touched. The full pytest suite also runs automatically on every push via GitHub Actions.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python / Flask |
| Database | SQLite (raw SQL, no ORM) |
| Auth | Google & Facebook OAuth2 via Authlib |
| AI | Google Gemini API |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Container | Docker + Docker Compose |

## Project Structure

```
app.py                  # All Flask routes
models.py               # Database layer (queries, schema, migrations)
templates/
  index.html            # Main SPA shell
  login.html            # OAuth login page
static/
  js/app.js             # Client-side routing and state
  js/i18n.js            # English / French translations
  css/style.css
tests/
  test_app.py           # Full test suite (87 tests)
Dockerfile
docker-compose.yml
```
