"""
Central configuration for the Trading Dashboard backend.
All settings are loaded from environment variables via .env file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import os


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Trading Dashboard API"
    APP_VERSION: str = "0.7.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # Server
    HOST: str = "0.0.0.0"  # nosec B104 — intentional for containerised deployment
    PORT: int = 8000
    # Comma-separated list of allowed CORS origins.
    # In production set via env: ALLOWED_ORIGINS=https://your-app.up.railway.app,https://yourdomain.com
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    # Additional production origin injected via single env var (convenience)
    # e.g. PRODUCTION_URL=https://neural-trading-os.up.railway.app
    PRODUCTION_URL: str = ""

    # LLM Providers
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL_ANALYSIS: str = "claude-sonnet-4-6"
    ANTHROPIC_MODEL_FAST: str = "claude-haiku-4-5-20251001"
    OPENAI_API_KEY: Optional[str] = None

    # Market Data
    FINNHUB_API_KEY: Optional[str] = None
    ALPHA_VANTAGE_API_KEY: Optional[str] = None
    POLYGON_API_KEY: Optional[str] = None
    YAHOO_FINANCE_ENABLED: bool = True

    # Crypto Exchanges
    BINANCE_API_KEY: Optional[str] = None
    BINANCE_SECRET_KEY: Optional[str] = None
    BYBIT_API_KEY: Optional[str] = None
    BYBIT_SECRET_KEY: Optional[str] = None
    COINBASE_API_KEY: Optional[str] = None
    COINBASE_SECRET_KEY: Optional[str] = None

    # Stock Brokers
    # Geschäftsmodell "Weg A" (reines Signal-/Analyse-Tool, kein Order-Routing,
    # keine Kundengelder): Alpaca dient AUSSCHLIESSLICH als Paper-Trading-Sandbox
    # zum internen Testen der Signal-Logik. ALPACA_BASE_URL zeigt bewusst auf
    # paper-api.alpaca.markets — niemals auf die Live-URL umstellen.
    ALPACA_API_KEY: Optional[str] = None
    ALPACA_SECRET_KEY: Optional[str] = None
    ALPACA_BASE_URL: str = "https://paper-api.alpaca.markets"
    INTERACTIVE_BROKERS_HOST: str = "127.0.0.1"
    INTERACTIVE_BROKERS_PORT: int = 7497

    # ---- Phase 1: Offizielle APIs ----
    # HINWEIS (Weg A): Die folgenden Broker-Credential-Felder (Comdirect, DEGIRO,
    # Flatex, Crowdestor, Trade Republic, WH SelfInvest) sind für ECHTES
    # Order-Routing vorgesehen und werden unter Weg A NICHT für Order-Ausführung
    # genutzt. Der Nutzer handelt selbst bei seinem eigenen Broker. Falls diese
    # Felder künftig verwendet werden, dann nur für READ-ONLY Portfolio-Sync
    # (Depotbestand abrufen, keine Order-Endpunkte ansprechen).
    # Bitpanda
    BITPANDA_API_KEY: Optional[str] = None

    # Comdirect (OAuth2 + PHOTO-TAN)
    COMDIRECT_CLIENT_ID: Optional[str] = None
    COMDIRECT_CLIENT_SECRET: Optional[str] = None
    COMDIRECT_ACCESS_TOKEN: Optional[str] = None   # Läuft ab — via DB/UI setzen

    # ---- Phase 2: Community-Bibliotheken ----
    # DEGIRO
    DEGIRO_USERNAME: Optional[str] = None
    DEGIRO_PASSWORD: Optional[str] = None
    DEGIRO_TOTP_TOKEN: Optional[str] = None         # Nur wenn 2FA aktiviert

    # Flatex (FinTS/HBCI)
    FLATEX_FINTS_USER: Optional[str] = None
    FLATEX_FINTS_PIN: Optional[str] = None           # NIE in DB speichern
    FLATEX_FINTS_ACCOUNT: Optional[str] = None       # Ziel-IBAN (optional)

    # Crowdestor (inoffizielle Web-API)
    CROWDESTOR_EMAIL: Optional[str] = None
    CROWDESTOR_PASSWORD: Optional[str] = None

    # ---- Phase 3: Reverse Engineering ----
    # Trade Republic (pytr / WebSocket)
    TR_PHONE_NUMBER: Optional[str] = None
    TR_PIN: Optional[str] = None

    # WH SelfInvest (cTrader Open API)
    WH_CTRADER_CLIENT_ID: Optional[str] = None
    WH_CTRADER_CLIENT_SECRET: Optional[str] = None
    WH_CTRADER_ACCESS_TOKEN: Optional[str] = None
    WH_CTRADER_ACCOUNT_ID: Optional[str] = None

    # Database
    DATABASE_URL: str = "sqlite:///./trading_dashboard.db"
    REDIS_URL: str = "redis://localhost:6379"

    # TradingAgents repo path
    TRADINGAGENTS_PATH: str = str(
        os.path.join(os.path.dirname(__file__), "../../../../TradingAgents")
    )
    # All repo paths
    AI_TRADER_PATH: str = "../AI-Trader"
    DAILY_ANALYSIS_PATH: str = "../daily_stock_analysis"
    VIBE_TRADING_PATH: str = "../Vibe-Trading"
    QLIB_PATH: str = "../qlib"
    NAUTILUS_PATH: str = "../nautilus_trader"
    FINGPT_PATH: str = "../FinGPT"
    FINROBOT_PATH: str = "../FinRobot"
    JESSE_PATH: str = "../jesse"

    # Stripe Billing
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_BASIC: str = ""           # price_xxx — Basic €29/mo
    STRIPE_PRICE_PRO: str = ""             # price_xxx — Pro €99/mo
    STRIPE_PRICE_INST: str = ""            # price_xxx — Institutional €299/mo
    STRIPE_PRICE_SIGNALS: str = ""         # price_xxx — Signal Marketplace €19/mo
    STRIPE_PRICE_BASIC_ANNUAL: str = ""    # price_xxx — Basic €290/yr (2 months free)
    STRIPE_PRICE_PRO_ANNUAL: str = ""      # price_xxx — Pro €990/yr
    STRIPE_PRICE_INST_ANNUAL: str = ""     # price_xxx — Institutional €2990/yr
    STRIPE_PRICE_SIGNALS_ANNUAL: str = ""  # price_xxx — Signals €190/yr
    # Public URL of the frontend — used in emails and Stripe redirect URLs.
    # Override via FRONTEND_URL env var. Default points to the Railway deployment.
    FRONTEND_URL: str = "https://frontend-production-8a00.up.railway.app"
    # Public URL of the backend API — used in one-click unsubscribe links (RFC 8058).
    # Must point to the FastAPI service, not the Next.js frontend.
    # Override via BACKEND_URL env var.
    BACKEND_URL: str = "https://neural-trading-os-production.up.railway.app"

    # Feature flags
    ENABLE_LIVE_TRADING: bool = False
    ENABLE_PAPER_TRADING: bool = True
    ENABLE_BACKTESTING: bool = True
    ENABLE_SENTIMENT: bool = True
    ENABLE_AI_SIGNALS: bool = True

    # JWT Auth
    JWT_SECRET_KEY: str = "neural-trading-os-secret-key-change-in-production-2024"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_HOURS: int = 24

    # Cookie settings (P1-3 httpOnly-Cookie migration)
    # AUTH_COOKIE_NAME: name of the httpOnly JWT cookie
    # CSRF_COOKIE_NAME: name of the JS-readable CSRF cookie (Double-Submit pattern)
    # COOKIE_SECURE: False in dev; set True via env in production (also auto-enabled
    #                in is_hardened_environment() regardless of this flag)
    AUTH_COOKIE_NAME: str = "access_token"
    CSRF_COOKIE_NAME: str = "csrf_token"
    COOKIE_SECURE: bool = False
    # SameSite for auth/CSRF cookies. Default "lax" — the browser only talks
    # to the API same-origin (Next rewrite proxy). Set COOKIE_SAMESITE=none
    # only for cross-site clients (e.g. Capacitor WebView); "none" forces
    # Secure, browsers reject it otherwise.
    COOKIE_SAMESITE: str = "lax"

    # At-rest credential encryption (Fernet). See app/core/crypto.py.
    # Empty in dev → credentials stored as clear text (with a warning).
    # Required in production (startup guard in main.py aborts if missing).
    APP_ENCRYPTION_KEY: str = ""
    APP_ENCRYPTION_KEYS_OLD: str = ""  # comma-separated old keys for rotation

    # Demo credentials (override via env in production)
    DEMO_USERNAME: str = "admin"
    DEMO_PASSWORD: str = "neural123"

    # On startup: promote this registered username to role=admin (idempotent).
    # Set to your registered username to gain admin access without the demo account.
    INITIAL_ADMIN_USERNAME: str = ""

    # SMTP (optional — password reset emails)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""  # falls leer → SMTP_USER
    # E-Mail-Adresse für Admin-Benachrichtigungen (neue Registrierungen etc.)
    ADMIN_NOTIFICATION_EMAIL: str = ""

    # Report Share Token (optional) — if set, GET /api/report/* requires ?key=<token>
    # or header X-Report-Key:<token>. Leave empty to keep the endpoint open.
    REPORT_SHARE_TOKEN: str = ""

    # Risk limits
    MAX_POSITION_SIZE_PCT: float = 0.05   # 5% of portfolio per position
    MAX_DAILY_LOSS_PCT: float = 0.02      # 2% daily stop-loss
    MAX_LEVERAGE: float = 1.0             # No leverage by default

    # Outbound webhook HMAC signing secret (P1 audit finding). Dedicated key —
    # NEVER reuse JWT_SECRET_KEY here (that key also signs session tokens; a
    # leaked webhook payload/signature must not help an attacker probe it).
    # Empty in dev → app/services/webhooks/client.py falls back to a random
    # process-local secret (signatures still HMAC'd, just not stable across
    # restarts). Set explicitly in production for stable, verifiable signatures.
    WEBHOOK_SIGNING_SECRET: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()

_KEY_PLACEHOLDERS = {
    "your-anthropic-api-key-here",
    "sk-ant-placeholder",
    "placeholder",
    "changeme",
    "your-api-key",
    "your_api_key",
}

_JWT_WEAK_KEYS = {
    "neural-trading-os-secret-key-change-in-production-2024",
    "secret",
    "changeme",
    "your-jwt-secret",
}

# Known default/demo passwords that must never reach a production deployment.
_DEFAULT_DEMO_PASSWORDS = {
    "neural123",
    "admin",
    "password",
    "changeme",
    "demo",
}

# Environments treated as "hardened" (no demo fallbacks, fail-closed checks).
_HARDENED_ENVIRONMENTS = {"production", "prod", "staging"}


def is_hardened_environment() -> bool:
    """True for production/staging — used to disable demo fallbacks and
    enforce fail-closed startup checks. Reads the live ENVIRONMENT value."""
    import os as _os
    env = (_os.getenv("ENVIRONMENT", settings.ENVIRONMENT) or "").strip().lower()
    return env in _HARDENED_ENVIRONMENTS


def demo_password_is_default() -> bool:
    """True when DEMO_PASSWORD is empty or a well-known default."""
    pw = (settings.DEMO_PASSWORD or "").strip()
    return (not pw) or pw.lower() in _DEFAULT_DEMO_PASSWORDS


def demo_login_enabled() -> bool:
    """
    The built-in demo/admin account is only available outside hardened
    environments, OR in a hardened environment when DEMO_PASSWORD has been
    explicitly overridden with a non-default value.

    In production with a default password the account is fully disabled
    (the startup guard in main.py additionally aborts the boot).
    """
    if not is_hardened_environment():
        return True
    return not demo_password_is_default()


def anthropic_key_configured() -> bool:
    """Return True only when ANTHROPIC_API_KEY is set and not a known placeholder."""
    key = (settings.ANTHROPIC_API_KEY or "").strip()
    if not key:
        return False
    lower = key.lower()
    return not any(p in lower for p in _KEY_PLACEHOLDERS)


def jwt_key_is_secure() -> bool:
    """Return True when JWT_SECRET_KEY is not a known-weak default and is ≥32 chars."""
    key = (settings.JWT_SECRET_KEY or "").strip()
    if len(key) < 32:
        return False
    return key not in _JWT_WEAK_KEYS


def stripe_billing_enabled() -> bool:
    """True when Stripe billing is switched on (a live secret key is configured).

    Stripe is opt-in: an instance with no STRIPE_SECRET_KEY runs without any
    billing surface (the /webhook route returns 503). This mirrors the
    ``_stripe_enabled()`` check in app/api/routes/billing.py and is the
    precondition for the webhook-secret startup guard.
    """
    return bool((settings.STRIPE_SECRET_KEY or "").strip())


def stripe_webhook_secret_missing() -> bool:
    """True when a webhook signing secret is required but absent.

    The Stripe webhook handler authenticates inbound events purely via the
    ``STRIPE_WEBHOOK_SECRET`` signature. If billing is enabled but the secret
    is unset, ``stripe.Webhook.construct_event`` runs against an empty secret
    and every signature check fails — i.e. the cash-critical upgrade/downgrade
    path is silently dead. We treat that as a fail-closed startup condition in
    hardened environments rather than discovering it on the first live event.
    """
    return stripe_billing_enabled() and not (settings.STRIPE_WEBHOOK_SECRET or "").strip()
