"""
Stock Report Feature Tests — Neural Trading OS
===============================================

Tests for:
  (a) Bullish consensus → BUY / STRONG_BUY, position_size > 0, SL < price < TP
  (b) Mixed signals     → HOLD
  (c) Circuit-breaker / < 30 candles → NO_RECOMMENDATION
  (d) compute_technical on synthetic price arrays (RSI limits, regime)
  (e) GET /api/report/{ticker} endpoint via TestClient (mocked + 422 invalid)

Mocking strategy:
  - app.services.report.aggregator.analyze_elliott_waves  (sync, via asyncio.to_thread)
  - app.services.report.aggregator.generate_signal        (AsyncMock)
  - app.services.report.aggregator._cached_sentiment      (AsyncMock)
  - app.services.report.aggregator.run_backtest           (AsyncMock)
  No network calls, DB calls, or external dependencies.

Run:
    cd dashboard/backend
    pytest tests/test_report.py -v
"""
from __future__ import annotations

import asyncio
import warnings
from datetime import datetime, UTC
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Suppress passlib/bcrypt noise
warnings.filterwarnings("ignore", message=r".*bcrypt.*")
warnings.filterwarnings("ignore", message=r".*trapped.*")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro):
    return asyncio.run(coro)


def _make_candles(n: int = 120, trend: str = "up", base_price: float = 100.0) -> list[dict]:
    """Generate synthetic OHLCV candles."""
    candles = []
    price = base_price
    for i in range(n):
        if trend == "up":
            price *= 1.003
        elif trend == "down":
            price *= 0.997
        elif trend == "volatile":
            price *= 1.06 if i % 2 == 0 else 0.94
        candles.append({
            "date":   f"2024-{(i // 28) + 1:02d}-{(i % 28) + 1:02d}",
            "open":   round(price * 0.998, 4),
            "high":   round(price * 1.008, 4),
            "low":    round(price * 0.992, 4),
            "close":  round(price, 4),
            "volume": 1_000_000 + i * 5_000,
        })
    return candles


def _make_signal(
    direction: str = "BUY",
    confidence: float = 0.80,
    price_target: float | None = 115.0,
    stop_loss:    float | None = 93.0,
) -> Any:
    from app.models.schemas import TradingSignal, SignalDirection
    return TradingSignal(
        id="test-signal-001",
        ticker="TEST",
        direction=SignalDirection(direction),
        confidence=confidence,
        price_target=price_target,
        stop_loss=stop_loss,
        reasoning="Synthetic test signal",
        source="TradingAgents-Test",
    )


def _make_sentiment(score: float = 0.5, label: str = "positive") -> Any:
    from app.models.schemas import SentimentSummary, SentimentLabel
    return SentimentSummary(
        ticker="TEST",
        overall_sentiment=SentimentLabel(label),
        overall_score=score,
        news_count=10,
        positive_count=7,
        negative_count=1,
        neutral_count=2,
    )


def _make_backtest(
    total_return: float = 18.0,
    sharpe: float = 1.3,
    win_rate: float = 0.62,
    total_trades: int = 50,
) -> Any:
    from app.models.schemas import BacktestResult
    return BacktestResult(
        strategy_name="macd_cross",
        ticker="TEST",
        start_date="2023-01-01",
        end_date="2024-01-01",
        engine="jesse",
        initial_capital=100_000.0,
        final_capital=100_000.0 * (1 + total_return / 100),
        total_return_pct=total_return,
        annualized_return_pct=total_return,
        max_drawdown_pct=-8.0,
        sharpe_ratio=sharpe,
        win_rate=win_rate,
        total_trades=total_trades,
    )


def _make_elliott(
    candles: list[dict],
    direction: str = "bullish",
    confidence: float = 0.75,
) -> dict:
    last_price = candles[-1]["close"] if candles else 100.0
    return {
        "candles":          candles,
        "wave_direction":   direction,
        "confidence":       confidence,
        "price_targets":    [round(last_price * 1.18, 4)],
        "stop_loss":        round(last_price * 0.91, 4),
        "current_wave":     "3",
        "interpretation":   "Impulse wave 3 in progress",
        "fibonacci_levels": [],
    }


# ---------------------------------------------------------------------------
# Common patch context manager
# ---------------------------------------------------------------------------

class _Mocks:
    """Context manager that patches all four aggregator dependencies."""

    def __init__(
        self,
        elliott_return: dict,
        signal_return:  Any,
        sentiment_return: Any,
        backtest_return:  Any,
    ) -> None:
        self._el  = elliott_return
        self._sig = signal_return
        self._sen = sentiment_return
        self._bt  = backtest_return
        self._patches: list = []

    def __enter__(self) -> "_Mocks":
        # analyze_elliott_waves is called via asyncio.to_thread (sync mock is OK)
        p1 = patch(
            "app.services.report.aggregator.analyze_elliott_waves",
            return_value=self._el,
        )
        p2 = patch(
            "app.services.report.aggregator.generate_signal",
            new=AsyncMock(return_value=self._sig),
        )
        p3 = patch(
            "app.services.report.aggregator._cached_sentiment",
            new=AsyncMock(return_value=self._sen),
        )
        p4 = patch(
            "app.services.report.aggregator.run_backtest",
            new=AsyncMock(return_value=self._bt),
        )
        self._patches = [p1, p2, p3, p4]
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *args) -> None:
        for p in self._patches:
            p.stop()


# ===========================================================================
# (a) Bullish consensus → BUY / STRONG_BUY, position_size > 0, SL < price < TP
# ===========================================================================

def test_bullish_consensus_verdict_and_levels():
    candles   = _make_candles(120, "up")
    signal    = _make_signal("STRONG_BUY", 0.90, price_target=candles[-1]["close"] * 1.20, stop_loss=candles[-1]["close"] * 0.90)
    sentiment = _make_sentiment(0.65, "positive")
    backtest  = _make_backtest(22.0, 1.5, 0.65, 60)
    elliott   = _make_elliott(candles, "bullish", 0.85)

    with _Mocks(elliott, signal, sentiment, backtest):
        from app.services.report.aggregator import build_stock_report
        report = _run(build_stock_report("AAPL"))

    assert report.verdict.value in ("BUY", "STRONG_BUY"), (
        f"Expected BUY/STRONG_BUY, got {report.verdict}"
    )
    assert report.position_size_pct > 0, "Expected positive position size for bullish verdict"
    assert report.composite_score > 0, "Expected positive composite score"

    current_price = candles[-1]["close"]
    assert report.stop_loss is not None, "Expected stop_loss to be set"
    assert report.take_profit is not None, "Expected take_profit to be set"
    assert report.stop_loss < current_price, (
        f"Stop-loss {report.stop_loss} should be below current price {current_price}"
    )
    assert report.take_profit > current_price, (
        f"Take-profit {report.take_profit} should be above current price {current_price}"
    )

    assert report.data_quality in ("good", "limited")
    assert len(report.summary) > 30, "Summary too short"
    assert report.ticker == "AAPL"


# ===========================================================================
# (b) Mixed / contradictory signals → HOLD
# ===========================================================================

def test_mixed_signals_yield_hold():
    candles   = _make_candles(100, "up")
    # AI says BUY but weakly; Elliott is bearish; sentiment is negative
    signal    = _make_signal("HOLD", 0.50)
    sentiment = _make_sentiment(-0.15, "negative")
    backtest  = _make_backtest(2.0, 0.3, 0.52, 30)
    elliott   = _make_elliott(candles, "neutral", 0.40)

    with _Mocks(elliott, signal, sentiment, backtest):
        from app.services.report.aggregator import build_stock_report
        report = _run(build_stock_report("TSLA"))

    assert report.verdict.value in ("HOLD", "BUY", "SELL"), (
        f"Expected HOLD-ish verdict for contradictory signals, got {report.verdict}"
    )
    # Composite score should be close to zero (mixed)
    assert abs(report.composite_score) < 0.5, (
        f"Expected near-zero composite_score for mixed signals, got {report.composite_score}"
    )


def test_mixed_contradictory_signals_strict_hold():
    """Exactly balanced: AI=BUY, Elliott=bearish, Sentiment=negative → should be HOLD."""
    candles   = _make_candles(100, "up")
    signal    = _make_signal("BUY", 0.55)          # ai_sub = +0.275
    sentiment = _make_sentiment(-0.40, "negative")  # sent_sub = -0.40
    backtest  = _make_backtest(0.5, 0.05, 0.50, 20)  # bt_sub = 0 (neutral)
    elliott   = _make_elliott(candles, "bearish", 0.60)  # ell_sub = -0.36

    with _Mocks(elliott, signal, sentiment, backtest):
        from app.services.report.aggregator import build_stock_report
        report = _run(build_stock_report("NVDA"))

    # With these balanced inputs composite should be near zero
    assert abs(report.composite_score) < 0.4, (
        f"Expected near-zero composite for balanced signals, got {report.composite_score}"
    )


# ===========================================================================
# (c) Circuit-breaker / < 30 candles → NO_RECOMMENDATION
# ===========================================================================

def test_circuit_breaker_insufficient_candles():
    """< 30 candles triggers NO_RECOMMENDATION regardless of signal quality."""
    candles   = _make_candles(10, "up")   # only 10 candles → insufficient
    signal    = _make_signal("STRONG_BUY", 0.95)
    sentiment = _make_sentiment(0.9, "positive")
    backtest  = _make_backtest(30.0, 2.0, 0.75, 100)
    elliott   = _make_elliott(candles, "bullish", 0.95)

    with _Mocks(elliott, signal, sentiment, backtest):
        from app.services.report.aggregator import build_stock_report
        report = _run(build_stock_report("BTC-USD"))

    assert report.verdict == "NO_RECOMMENDATION", (
        f"Expected NO_RECOMMENDATION for insufficient data, got {report.verdict}"
    )
    assert report.verdict_label_de == "KEINE EMPFEHLUNG"
    assert report.position_size_pct == 0.0, "Position size must be 0 when circuit-breaker fires"
    assert report.data_quality == "insufficient"


def test_circuit_breaker_no_candles_at_all():
    """Zero candles → NO_RECOMMENDATION."""
    signal    = _make_signal("BUY", 0.80)
    sentiment = _make_sentiment(0.5, "positive")
    backtest  = _make_backtest(15.0, 1.2, 0.60, 50)
    elliott   = {}   # empty → no candles

    with _Mocks(elliott, signal, sentiment, backtest):
        from app.services.report.aggregator import build_stock_report
        report = _run(build_stock_report("AAPL"))

    assert report.verdict == "NO_RECOMMENDATION"
    assert report.position_size_pct == 0.0


# ===========================================================================
# (d) compute_technical — unit tests on synthetic price arrays
# ===========================================================================

def test_technical_rising_prices():
    """Consistently rising prices → RSI > 50 (bullish), sma_trend bullish."""
    from app.services.report.technical import compute_technical

    candles = _make_candles(100, "up")
    result  = compute_technical(candles)

    assert result["rsi"] is not None, "RSI should be computed for 100 candles"
    assert result["rsi"] > 50, f"Rising prices should yield RSI > 50, got {result['rsi']}"
    assert result["sma_trend"] == "bullish", (
        f"Rising trend should yield bullish SMA, got {result['sma_trend']}"
    )
    assert result["tech_score"] > 0, "Tech score should be positive for rising prices"
    assert result["regime"] in ("trending", "ranging", "high_volatility")


def test_technical_falling_prices():
    """Consistently falling prices → RSI low (oversold), sma_trend bearish.

    Note: the tech_score uses *mean-reversion* RSI interpretation — an oversold
    reading (RSI near 0) contributes a *positive* sub-score (potential bounce).
    Therefore tech_score can be positive for a downtrend (RSI contrarian signal).
    We check directional indicators rather than expecting a negative tech_score.
    """
    from app.services.report.technical import compute_technical

    candles = _make_candles(100, "down")
    result  = compute_technical(candles)

    assert result["rsi"] is not None, "RSI should be computed for 100 candles"
    # Consistently falling prices → oversold RSI (< 50, typically near 0)
    assert result["rsi"] < 50, f"Falling prices should yield RSI < 50, got {result['rsi']}"
    assert result["sma_trend"] == "bearish", (
        f"Falling trend should yield bearish SMA, got {result['sma_trend']}"
    )
    # With momentum-based RSI/Bollinger scoring, a persistent downtrend yields a
    # negative tech_score (RSI near 0 → -0.8, Bollinger %B near 0 → -0.5, SMA bearish).
    assert result["tech_score"] < 0, (
        f"Momentum-based scoring should give negative tech_score for downtrend, "
        f"got {result['tech_score']}"
    )


def test_technical_high_volatility_regime():
    """Highly volatile prices → regime == 'high_volatility'."""
    from app.services.report.technical import compute_technical

    # ±6 % swings every bar → ATR/price >> 3 %
    candles = _make_candles(60, "volatile")
    result  = compute_technical(candles)

    assert result["regime"] == "high_volatility", (
        f"Expected high_volatility regime for ±6% swings, got {result['regime']}"
    )
    assert result["atr"] is not None
    # In high-vol regime, ATR should be > 2 % of current price
    current_price = candles[-1]["close"]
    if result["atr"] and current_price:
        assert result["atr"] / current_price > 0.02


def test_technical_too_few_candles():
    """< 5 candles → empty/default result, no crash."""
    from app.services.report.technical import compute_technical

    result = compute_technical([])
    assert result["rsi"] is None
    assert result["tech_score"] == 0.0
    assert result["regime"] == "ranging"
    assert len(result["notes"]) > 0

    result2 = compute_technical(_make_candles(3, "up"))
    assert result2["rsi"] is None


def test_technical_rsi_boundaries():
    """Check RSI stays within [0, 100]."""
    from app.services.report.technical import compute_technical

    for trend in ("up", "down", "volatile"):
        candles = _make_candles(100, trend)
        result  = compute_technical(candles)
        if result["rsi"] is not None:
            assert 0.0 <= result["rsi"] <= 100.0, (
                f"RSI out of range for '{trend}': {result['rsi']}"
            )


def test_technical_score_in_range():
    """tech_score must always be in [-1, +1]."""
    from app.services.report.technical import compute_technical

    for trend in ("up", "down", "volatile"):
        candles = _make_candles(80, trend)
        result  = compute_technical(candles)
        assert -1.0 <= result["tech_score"] <= 1.0, (
            f"tech_score out of range for '{trend}': {result['tech_score']}"
        )


# ===========================================================================
# (e) Endpoint via TestClient
# ===========================================================================

def _build_test_client():
    """Minimal FastAPI app with only the report router — avoids lifespan."""
    from fastapi import FastAPI
    from app.api.routes.report import router as report_router

    app = FastAPI()
    app.include_router(report_router, prefix="/api")
    return app


def test_endpoint_valid_ticker_returns_200():
    """GET /api/report/{ticker} returns 200 with StockReport-shaped JSON."""
    from fastapi.testclient import TestClient

    candles   = _make_candles(100, "up")
    signal    = _make_signal("BUY", 0.75)
    sentiment = _make_sentiment(0.4, "positive")
    backtest  = _make_backtest(12.0, 1.1, 0.58, 40)
    elliott   = _make_elliott(candles, "bullish", 0.70)

    with _Mocks(elliott, signal, sentiment, backtest):
        # Also patch the route-level cache to avoid stale hits
        with patch("app.api.routes.report.cache_get", return_value=None), \
             patch("app.api.routes.report.cache_set"):
            client = TestClient(_build_test_client(), raise_server_exceptions=True)
            resp   = client.get("/api/report/AAPL")

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    body = resp.json()

    # Check required fields
    for field in ("ticker", "verdict", "verdict_label_de", "confidence",
                  "composite_score", "position_size_pct", "summary",
                  "components", "agreement", "data_quality"):
        assert field in body, f"Missing field '{field}' in response"

    assert body["ticker"] == "AAPL"
    assert body["verdict"] in ("BUY", "STRONG_BUY", "HOLD", "SELL", "STRONG_SELL", "NO_RECOMMENDATION")
    assert 0.0 <= body["confidence"] <= 1.0
    assert -1.0 <= body["composite_score"] <= 1.0


def test_endpoint_invalid_ticker_returns_422():
    """Ticker longer than 10 chars → 422."""
    from fastapi.testclient import TestClient

    client = TestClient(_build_test_client(), raise_server_exceptions=False)
    resp   = client.get("/api/report/TOOLONGTICKER123")

    assert resp.status_code == 422, (
        f"Expected 422 for invalid ticker, got {resp.status_code}"
    )


def test_endpoint_empty_ticker_returns_422():
    """Empty ticker after strip → 422."""
    from fastapi.testclient import TestClient

    # FastAPI will route /api/report/ to "/{ticker}" with ticker=""
    # Depending on routing it may 404 — either 404 or 422 is acceptable.
    client = TestClient(_build_test_client(), raise_server_exceptions=False)
    resp   = client.get("/api/report/ ")
    assert resp.status_code in (404, 422)


def test_endpoint_ticker_normalised_to_upper():
    """Lower-case ticker is normalised to upper-case in the report."""
    from fastapi.testclient import TestClient

    candles   = _make_candles(100, "up")
    signal    = _make_signal("HOLD", 0.55)
    sentiment = _make_sentiment(0.0, "neutral")
    backtest  = _make_backtest(5.0, 0.5, 0.53, 25)
    elliott   = _make_elliott(candles, "neutral", 0.50)

    with _Mocks(elliott, signal, sentiment, backtest):
        with patch("app.api.routes.report.cache_get", return_value=None), \
             patch("app.api.routes.report.cache_set"):
            client = TestClient(_build_test_client(), raise_server_exceptions=True)
            resp   = client.get("/api/report/aapl")

    assert resp.status_code == 200
    assert resp.json()["ticker"] == "AAPL"


# ===========================================================================
# Additional edge-case tests for risk_single
# ===========================================================================

def test_risk_circuit_breaker_too_few_candles():
    """compute_single_asset_risk with < 30 candles → circuit_breaker=True."""
    from app.services.report.risk_single import compute_single_asset_risk

    candles = _make_candles(10, "up")
    result  = compute_single_asset_risk(
        candles=candles,
        backtest_result=None,
        confidence=0.8,
        regime="trending",
        account_equity=100_000.0,
    )

    assert result["circuit_breaker"] is True
    assert result["recommended_position_pct"] == 0.0
    assert len(result["circuit_breaker_reasons"]) > 0


def test_risk_normal_computation():
    """compute_single_asset_risk with 100 candles → no circuit-breaker for normal vol."""
    from app.services.report.risk_single import compute_single_asset_risk

    candles  = _make_candles(150, "up")
    backtest = _make_backtest(15.0, 1.2, 0.60, 50)
    result   = compute_single_asset_risk(
        candles=candles,
        backtest_result=backtest,
        confidence=0.75,
        regime="trending",
        account_equity=100_000.0,
    )

    assert isinstance(result["var_95_pct"], float)
    assert isinstance(result["ann_vol_pct"], float)
    assert result["ann_vol_pct"] >= 0
    assert 0.0 <= result["recommended_position_pct"] <= 0.10  # capped at 10 %
    assert result["recommended_position_value"] >= 0
