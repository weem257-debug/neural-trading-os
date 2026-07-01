"""
Live Market Analysis + Watchlist Tests (new feature — API contract).

GET /api/analysis/live/{symbol}   — technical snapshot (RSI/MACD/Bollinger/
                                     regime/signal), yfinance mocked (no
                                     network calls; CI can be slow/offline).
GET/PUT /api/analysis/watchlist   — per-user, owner_username-isolated CRUD.

Uses its own isolated app + throwaway SQLite DB (same bootstrap pattern as
test_billing_webhook.py / test_multi_tenancy.py).

Run:
    cd dashboard/backend
    pytest tests/test_analysis_live.py -v
"""
import os
import tempfile
import uuid
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def app_module():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_analysis_live_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)

    from app.main import app
    app.state.limiter.enabled = False
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.state.limiter.enabled = True

    try:
        os.remove(db_path)
    except OSError:
        pass


@pytest.fixture
def client(app_module):
    app_module.cookies.clear()
    yield app_module
    app_module.cookies.clear()


def _auth(client) -> dict:
    resp = client.post(
        "/api/auth/token",
        data={"username": "admin", "password": "neural123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    client.cookies.clear()
    return {"Authorization": f"Bearer {token}"}


def _trader_auth(client) -> dict:
    uname = f"trader_{uuid.uuid4().hex[:10]}"
    reg = client.post("/api/auth/register", json={
        "username": uname,
        "email": f"{uname}@example.com",
        "password": "Password1!",
        "gdpr_consent": True,
    })
    assert reg.status_code in (200, 201), reg.text
    tok = client.post(
        "/api/auth/token",
        data={"username": uname, "password": "Password1!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert tok.status_code == 200, tok.text
    client.cookies.clear()
    return {"Authorization": f"Bearer {tok.json()['access_token']}"}


def _make_history(days: int = 260, start: float = 150.0, trend: float = 0.15, seed: int = 42) -> pd.DataFrame:
    """Build a synthetic, deterministic OHLCV DataFrame with a mild uptrend."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2024-01-02", periods=days, freq="B")
    closes = [start]
    for _ in range(days - 1):
        closes.append(closes[-1] * (1 + trend / days + rng.normal(0, 0.01)))
    closes = np.array(closes)
    highs = closes * 1.01
    lows = closes * 0.99
    opens = closes * 0.999
    volumes = rng.integers(1_000_000, 5_000_000, size=days).astype(float)
    return pd.DataFrame(
        {"Open": opens, "High": highs, "Low": lows, "Close": closes, "Volume": volumes},
        index=dates,
    )


# ---------------------------------------------------------------------------
# GET /api/analysis/live/{symbol}
# ---------------------------------------------------------------------------

class TestLiveAnalysis:
    def test_requires_auth(self, client):
        resp = client.get("/api/analysis/live/AAPL")
        assert resp.status_code == 401

    def test_returns_full_contract_shape(self, client):
        headers = _auth(client)
        hist = _make_history()
        with patch("app.api.routes.analysis._fetch_live_history", return_value=hist):
            resp = client.get("/api/analysis/live/AAPL", headers=headers)

        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["symbol"] == "AAPL"
        assert "as_of" in data

        price = data["price"]
        for field in ("last", "change", "change_pct", "day_high", "day_low", "volume"):
            assert field in price, f"price.{field} missing"

        ind = data["indicators"]
        for field in ("rsi_14", "macd", "bollinger", "sma_20", "sma_50", "sma_200", "atr_14", "volume_avg_20"):
            assert field in ind, f"indicators.{field} missing"
        assert set(ind["macd"].keys()) == {"macd", "signal", "hist"}
        assert set(ind["bollinger"].keys()) == {"upper", "middle", "lower", "pct_b"}

        assert data["regime"] in {"trending_up", "trending_down", "ranging", "volatile"}

        signal = data["signal"]
        assert signal["bias"] in {"bullish", "bearish", "neutral"}
        assert -100 <= signal["score"] <= 100
        assert isinstance(signal["reasons"], list)

        assert "regulatory_notice" in data
        assert data["regulatory_notice"]["not_investment_advice"] is True

    def test_sma200_populated_with_enough_history(self, client):
        """260 trading days (~1y) is enough for a real SMA200 value."""
        headers = _auth(client)
        hist = _make_history(days=260)
        with patch("app.api.routes.analysis._fetch_live_history", return_value=hist):
            resp = client.get("/api/analysis/live/MSFT", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["indicators"]["sma_200"] is not None

    def test_indicators_gracefully_null_with_short_history(self, client):
        """A very young listing (few bars) must not crash — long-window
        indicators degrade to null instead of raising."""
        headers = _auth(client)
        hist = _make_history(days=10)
        with patch("app.api.routes.analysis._fetch_live_history", return_value=hist):
            resp = client.get("/api/analysis/live/NEWCO", headers=headers)
        assert resp.status_code == 200, resp.text
        ind = resp.json()["indicators"]
        assert ind["sma_200"] is None
        assert ind["sma_50"] is None

    def test_unknown_symbol_returns_404(self, client):
        headers = _auth(client)
        with patch("app.api.routes.analysis._fetch_live_history", return_value=None):
            resp = client.get("/api/analysis/live/NOPE", headers=headers)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "symbol_not_found"

    def test_malformed_symbol_returns_404(self, client):
        headers = _auth(client)
        resp = client.get("/api/analysis/live/" + ("x" * 40), headers=headers)
        assert resp.status_code == 404

    def test_provider_failure_returns_502(self, client):
        from app.api.routes.analysis import _MarketDataError
        headers = _auth(client)
        # Distinct symbol from other tests — _fetch_cached_live_history caches
        # by symbol for 45s, and a shared symbol could return another test's
        # cached (successful) result instead of hitting this mock.
        with patch("app.api.routes.analysis._fetch_live_history", side_effect=_MarketDataError("boom")):
            resp = client.get("/api/analysis/live/FAILSYM", headers=headers)
        assert resp.status_code == 502
        assert resp.json()["detail"] == "market_data_unavailable"

    def test_bullish_signal_reasons_are_german(self, client):
        headers = _auth(client)
        # Strong, steady uptrend → expect at least one German-language reason.
        hist = _make_history(days=260, start=100.0, trend=0.6, seed=7)
        with patch("app.api.routes.analysis._fetch_live_history", return_value=hist):
            resp = client.get("/api/analysis/live/UPTREND", headers=headers)
        assert resp.status_code == 200
        reasons = resp.json()["signal"]["reasons"]
        assert len(reasons) >= 1


# ---------------------------------------------------------------------------
# GET/PUT /api/analysis/watchlist
# ---------------------------------------------------------------------------

class TestWatchlist:
    def test_get_requires_auth(self, client):
        resp = client.get("/api/analysis/watchlist")
        assert resp.status_code == 401

    def test_put_requires_auth(self, client):
        resp = client.put("/api/analysis/watchlist", json={"symbols": ["AAPL"]})
        assert resp.status_code == 401

    def test_empty_watchlist_by_default(self, client):
        headers = _trader_auth(client)
        resp = client.get("/api/analysis/watchlist", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {"symbols": []}

    def test_put_replaces_list_normalizes_and_dedupes(self, client):
        headers = _trader_auth(client)
        resp = client.put(
            "/api/analysis/watchlist",
            json={"symbols": [" aapl ", "msft", "AAPL", "btc-usd"]},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["symbols"] == ["AAPL", "MSFT", "BTC-USD"]

        get_resp = client.get("/api/analysis/watchlist", headers=headers)
        assert get_resp.json()["symbols"] == ["AAPL", "MSFT", "BTC-USD"]

    def test_put_over_max_symbols_rejected(self, client):
        headers = _trader_auth(client)
        symbols = [f"SYM{i}" for i in range(51)]
        resp = client.put("/api/analysis/watchlist", json={"symbols": symbols}, headers=headers)
        assert resp.status_code == 422

    def test_watchlist_is_isolated_per_user(self, client):
        headers_a = _trader_auth(client)
        headers_b = _trader_auth(client)

        client.put("/api/analysis/watchlist", json={"symbols": ["AAPL"]}, headers=headers_a)
        client.put("/api/analysis/watchlist", json={"symbols": ["TSLA", "NVDA"]}, headers=headers_b)

        data_a = client.get("/api/analysis/watchlist", headers=headers_a).json()
        data_b = client.get("/api/analysis/watchlist", headers=headers_b).json()

        assert data_a["symbols"] == ["AAPL"]
        assert data_b["symbols"] == ["TSLA", "NVDA"]
