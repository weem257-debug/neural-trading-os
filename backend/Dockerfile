# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# System build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into an isolated prefix for easy copy
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy only the installed packages from the builder — no build tools in prod
COPY --from=builder /install /usr/local

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Create data/log directories and assign ownership before switching user
RUN mkdir -p /app/data /app/logs && chown -R appuser:appgroup /app

# Copy application code
COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 8000

# Use APP_ENV to toggle reload (development) vs. production mode.
# Set APP_ENV=development in docker-compose or .env to enable hot-reload.
CMD ["sh", "-c", \
  "if [ \"${APP_ENV}\" = 'development' ]; then \
     exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload; \
   else \
     exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2; \
   fi"]
