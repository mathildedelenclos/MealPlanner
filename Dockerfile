FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create the data directory for the SQLite database and let the non-root
# runtime user own it (and /app, so .pyc / log writes don't fail).
RUN mkdir -p /data \
    && useradd --system --uid 1000 --home-dir /app --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /data /app

ENV DATABASE_PATH=/data/mealplanner.db \
    FLASK_ENV=production \
    PORT=5001

EXPOSE 5001

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,os; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','5001')+'/login').read()" || exit 1

# 2 worker processes is plenty for a personal app on a small box.
# Use --preload so init_db() runs once before workers fork.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 2 --timeout 60 --preload app:app"]
