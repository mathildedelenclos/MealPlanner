# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal meal planning and recipe management web app. Flask backend with a vanilla JS SPA frontend. Supports recipe scraping, calendar scheduling, shopping list generation, and AI-powered features (Gemini).

## Tech Stack

- **Backend:** Python 3.9+ / Flask 3.1.0, SQLite (raw SQL via `sqlite3`, no ORM)
- **Auth:** Google & Facebook OAuth2 via Authlib
- **AI:** Google Gemini API (optional)
- **Frontend:** Vanilla HTML/CSS/JS (no framework), URL-based SPA routing, PWA (service worker + manifest)
- **Container:** Docker + Docker Compose

## Running the App

**Local development:**
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py        # runs on http://localhost:5001
```

**Production (Docker):**
```bash
docker-compose up -d
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | Flask session secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth credentials |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | No | Enables Facebook login |
| `GEMINI_API_KEY` | No | Enables AI features |
| `BASE_URL` | Production | OAuth redirect URI base (e.g. `https://meal-planner.ddns.net`) |
| `DATABASE_PATH` | No | Default: `./mealplanner.db` (Docker: `/data/mealplanner.db`) |
| `FLASK_ENV` | No | Set to `production` to disable debug mode |
| `FLASK_TEST_MODE` | No | Set to `1` to expose `/test/login` and `/test/reset` (E2E only) |
| `PORT` | No | Override Flask port (default 5001) |

## Key Files

| File | Purpose |
|---|---|
| `app.py` | All Flask routes, OAuth, and the E2E test harness (~1,500 lines) |
| `models.py` | Database layer — all SQL queries and schema migrations (~900 lines) |
| `templates/index.html` | Main SPA shell |
| `templates/login.html` | OAuth login page |
| `static/js/app.js` | Client-side routing, state, and all UI logic (~3,100 lines) |
| `static/js/i18n.js` | English/French localization |
| `static/sw.js`, `static/manifest.json` | PWA service worker and manifest |
| `tests/test_app.py` | Pytest backend integration suite |
| `tests/e2e/*.spec.js` | Playwright E2E suite (desktop + mobile) |

## Architecture Notes

- **No ORM** — all queries are raw SQL with parameterized inputs. Add new queries in `models.py`.
- **Database migrations** happen automatically in `models.init_db()` on startup. Add new columns/tables there — there is no separate migration tool.
- **User isolation** — every table has a `user_id` FK. All queries must filter by `user_id` from the session.
- **Auth middleware** — use `@login_required_api` on all API routes that need authentication. It returns 401 JSON when there is no session or the user no longer exists.
- **Orphan data adoption** — anonymous data (`user_id IS NULL`) gets assigned to the first user who logs in. Don't break this logic.
- **ProxyFix** — Werkzeug `ProxyFix` is applied for correct OAuth redirects behind a reverse proxy. Don't remove it.
- **Test harness routes** — `/test/login` and `/test/reset` are only registered when `FLASK_TEST_MODE=1`. They must never be enabled in production.
- **Instruction parsing** — `_split_instructions` in `app.py` handles multiple recipe formats (`||`, `Step N:`, numbered, paragraph-separated). Reuse it instead of re-parsing.

## API Structure

All API routes return JSON. Routes are grouped:
- `/auth/*` — OAuth flows (Google, Facebook)
- `/api/recipes*` — Recipe CRUD, including `/api/recipes/rescrape-missing-images`
- `/api/calendar*` — Meal calendar entries
- `/api/shopping-list`, `/api/custom-shopping-items` — Shopping list
- `/api/chat`, `/api/generate-meal-plan`, `/api/regenerate-recipe` — AI (Gemini)
- `/api/scrape`, `/api/import-*` — Recipe import (URL via `recipe-scrapers`, Paprika `.paprikarecipes`, Excel `.xlsx`)
- `/api/settings` — Per-user key/value settings
- `/test/*` — Only registered when `FLASK_TEST_MODE=1`

## Data Model

Core tables: `users`, `recipes`, `calendar_entries`, `custom_shopping_items`, `settings`.
- `recipes.ingredients` and `recipes.instructions` are stored as JSON arrays.
- `settings` is a per-user key/value table.
- Calendar entries reference a recipe and store their own `servings` so a slot's portion size is independent of the recipe default.

## Testing

**Backend (pytest)** — every test runs against an isolated temp SQLite file via the `fresh_db` autouse fixture; the real `mealplanner.db` is never touched. Sessions are injected directly through Flask's test client (no OAuth flow).

```bash
python -m pytest tests/test_app.py -v
python -m pytest tests/test_app.py::test_name -v   # single test
```

**E2E (Playwright)** — spins up the Flask app on port 5002 with `FLASK_TEST_MODE=1` against `/tmp/meal_e2e.db` (see `playwright.config.js`). Tests use `/test/reset` + `/test/login` between cases (`tests/e2e/helpers.js`). Runs in two projects: `desktop` (Chrome) and `mobile` (iPhone 12).

```bash
npm install
npx playwright install chromium webkit
npm run test:e2e                          # both projects
npx playwright test --project=desktop
npx playwright test --project=mobile
npx playwright test tests/e2e/calendar.spec.js   # single file
```

The pytest suite also runs on every push via `.github/workflows/tests.yml`.
