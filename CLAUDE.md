# Recipe App — CLAUDE.md

## Project Overview

A personal meal planning and recipe management web app. Flask backend with a vanilla JS SPA frontend. Supports recipe scraping, calendar scheduling, shopping list generation, and AI-powered features (Gemini).

## Tech Stack

- **Backend:** Python/Flask 3.1.0, SQLite (raw SQL via `sqlite3`, no ORM)
- **Auth:** Google & Facebook OAuth2 via Authlib
- **AI:** Google Gemini API (optional)
- **Frontend:** Vanilla HTML/CSS/JS (no framework), URL-based SPA routing
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
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Yes | Facebook OAuth credentials |
| `GEMINI_API_KEY` | No | Enables AI features |
| `BASE_URL` | Production | OAuth redirect URI base (e.g. `https://meal-planner.ddns.net`) |
| `DATABASE_PATH` | No | Default: `./mealplanner.db` (Docker: `/data/mealplanner.db`) |
| `FLASK_ENV` | No | Set to `production` to disable debug mode |

## Key Files

| File | Purpose |
|---|---|
| `app.py` | All Flask routes and OAuth logic (~1,100 lines) |
| `models.py` | Database layer — all SQL queries and schema migrations (~800 lines) |
| `templates/index.html` | Main SPA shell |
| `templates/login.html` | OAuth login page |
| `static/js/app.js` | Client-side routing and state |
| `static/js/i18n.js` | English/French localization |

## Architecture Notes

- **No ORM** — all queries are raw SQL with parameterized inputs. Add new queries in `models.py`.
- **Database migrations** happen automatically in `models.init_db()` on startup. Add new columns/tables there.
- **User isolation** — every table has a `user_id` FK. All queries must filter by `user_id` from the session.
- **Auth middleware** — use `@login_required_api` decorator on all API routes that need authentication.
- **Orphan data adoption** — anonymous data (user_id IS NULL) gets assigned to the first user who logs in. Don't break this logic.
- **ProxyFix** — Werkzeug ProxyFix is applied for correct OAuth redirects behind a reverse proxy. Don't remove it.

## API Structure

All API routes return JSON. Routes are grouped:
- `/auth/*` — OAuth flows
- `/api/recipes*` — Recipe CRUD
- `/api/calendar*` — Meal calendar
- `/api/shopping-list`, `/api/custom-shopping-items` — Shopping list
- `/api/chat`, `/api/generate-meal-plan`, `/api/regenerate-recipe` — AI (Gemini)
- `/api/scrape`, `/api/import-*` — Recipe import
- `/api/settings` — Per-user settings

## Data Model

Core tables: `users`, `recipes`, `calendar_entries`, `custom_shopping_items`, `settings`.
- `recipes.ingredients` and `recipes.instructions` are stored as JSON arrays.
- `settings` uses a key-value table per user.

## Testing

No test suite exists. Test manually via the browser or with `curl`/Postman against the local dev server.
