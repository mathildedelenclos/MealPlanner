FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create the data directory for the SQLite database
RUN mkdir -p /data

ENV DATABASE_PATH=/data/mealplanner.db
ENV FLASK_ENV=production

EXPOSE 5001

CMD ["python", "app.py"]
