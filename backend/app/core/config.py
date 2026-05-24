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
    ALPACA_API_KEY: Optional[str] = None
    ALPACA_SECRET_KEY: Optional[str] = None
    ALPACA_BASE_URL: str = "https://paper-api.alpaca.markets"
    INTERACTIVE_BROKERS_HOST: str = "127.0.0.1"
    INTERACTIVE_BROKERS_PORT: int = 7497

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

    # Demo credentials (override via env in production)
    DEMO_USERNAME: str = "admin"
    DEMO_PASSWORD: str = "neural123"

    # Risk limits
    MAX_POSITION_SIZE_PCT: float = 0.05   # 5% of portfolio per position
    MAX_DAILY_LOSS_PCT: float = 0.02      # 2% daily stop-loss
    MAX_LEVERAGE: float = 1.0             # No leverage by default

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
