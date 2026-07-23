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

# ── Optional Kronos forecasting deps (CPU-only torch) ──────────────────────
# Enables the additive Kronos K-line forecast in the scanner. Adds ~200MB to
# the image and is only exercised at runtime when KRONOS_ENABLED=true; with the
# flag off the packages sit unused. Installed into the SAME /install prefix so
# the runtime stage inherits them via the existing COPY, and BEFORE any app code
# is copied (app code is only added in the runtime stage) so this heavy layer
# stays cached across code-only deploys. The explicit numpy pin prevents torch
# from pulling numpy>=2 (base stack requires numpy<2); the CPU wheel index is an
# EXTRA index so torch's transitive deps still resolve from PyPI.
COPY requirements-kronos.txt .
RUN pip install --no-cache-dir --prefix=/install \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      "numpy>=1.26,<2.0" -r requirements-kronos.txt

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy only the installed packages from the builder — no build tools in prod
COPY --from=builder /install /usr/local

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Create data/log directories and assign ownership before switching user
RUN mkdir -p /app/data /app/logs /app/data/hf && chown -R appuser:appgroup /app

# HuggingFace cache for the optional Kronos model. The app runs as a non-root
# system user whose HOME is not writable, so point HF at a dir owned by appuser
# (created + chowned above); otherwise Kronos weight downloads fail and Kronos
# silently disables itself. Only used when KRONOS_ENABLED=true.
ENV HF_HOME=/app/data/hf \
    HF_HUB_DISABLE_TELEMETRY=1

# Copy application code
COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 8000

# Use APP_ENV to toggle reload (development) vs. production mode.
# Set APP_ENV=development in docker-compose or .env to enable hot-reload.
CMD ["sh", "-c", \
  "if [ \"${APP_ENV}\" = 'development' ]; then \
     exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload; \
   else \
     exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1; \
   fi"]
