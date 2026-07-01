"""
Trading-Safety Tests — P0-1 / P0-2 (pre-trade risk limits) + P1 hardening.

Exercises app.services.nautilus.client.NautilusExecutionClient directly
(unit-level) so no real yfinance/network calls are needed — `_fetch_price`
is monkeypatched per test. Also covers the real-leverage computation in
app.services.jesse.client.compute_risk_metrics (RiskMetrics.leverage).

Run:
    cd dashboard/backend
    pytest tests/test_trading_safety.py -v
"""
import asyncio
from unittest.mock import patch

import pytest

from app.core.config import settings
from app.models.schemas import OrderRequest, OrderSide, OrderType
from app.services.nautilus.client import NautilusExecutionClient


def _run(coro):
    return asyncio.run(coro)


def _buy(ticker="AAPL", quantity=1.0, order_type=OrderType.MARKET, limit_price=None):
    return OrderRequest(
        ticker=ticker, side=OrderSide.BUY, quantity=quantity,
        order_type=order_type, limit_price=limit_price,
    )


def _sell(ticker="AAPL", quantity=1.0):
    return OrderRequest(ticker=ticker, side=OrderSide.SELL, quantity=quantity, order_type=OrderType.MARKET)


# ---------------------------------------------------------------------------
# (a) Cash check
# ---------------------------------------------------------------------------

class TestCashCheck:
    def test_buy_beyond_cash_is_rejected(self):
        """BUY whose cost exceeds available cash must be rejected, cash untouched."""
        client = NautilusExecutionClient()
        assert client._cash == client.INITIAL_CAPITAL

        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            # cost = 100 * 2000 = 200,000 > 100,000 cash
            resp = _run(client.submit_order(_buy(quantity=2000.0)))

        assert resp.status == "rejected"
        assert resp.reject_reason == "insufficient_cash"
        assert client._cash == client.INITIAL_CAPITAL, "cash must never go negative / must stay untouched on reject"
        assert "AAPL" not in client._positions

    def test_buy_within_cash_is_filled(self):
        """Sanity check: a well within-limits BUY still fills normally."""
        client = NautilusExecutionClient()
        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            # cost = 100*10 = 1,000 — well under 5% position limit (5,000) and cash.
            resp = _run(client.submit_order(_buy(quantity=10.0)))
        assert resp.status == "filled"
        assert client._cash == pytest.approx(client.INITIAL_CAPITAL - 1000.0)


# ---------------------------------------------------------------------------
# (b) Position-size limit (MAX_POSITION_SIZE_PCT, default 5%)
# ---------------------------------------------------------------------------

class TestPositionSizeLimit:
    def test_position_over_5pct_is_rejected(self):
        """A single BUY whose resulting position exceeds 5% of equity is rejected."""
        client = NautilusExecutionClient()
        # equity = 100,000 → 5% limit = 5,000. cost = 100*51 = 5,100 > limit,
        # but well within cash (100,000) and within default 1.0x leverage.
        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_buy(quantity=51.0)))

        assert resp.status == "rejected"
        assert resp.reject_reason == "position_size_exceeded"
        assert "AAPL" not in client._positions
        assert client._cash == client.INITIAL_CAPITAL

    def test_position_at_5pct_boundary_is_filled(self):
        """A position exactly at (not over) the 5% limit must be allowed."""
        client = NautilusExecutionClient()
        # cost = 100*50 = 5,000 == 5% of 100,000 exactly — must NOT be rejected.
        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_buy(quantity=50.0)))
        assert resp.status == "filled"


# ---------------------------------------------------------------------------
# (c) Leverage limit (MAX_LEVERAGE)
# ---------------------------------------------------------------------------

class TestLeverageLimit:
    def test_leverage_over_limit_is_rejected(self, monkeypatch):
        """
        With MAX_LEVERAGE tightened below 1.0, an order that stays well within
        cash and the (disabled) position-size limit must still be rejected once
        gross exposure / equity would exceed MAX_LEVERAGE.
        """
        monkeypatch.setattr(settings, "MAX_LEVERAGE", 0.3)
        monkeypatch.setattr(settings, "MAX_POSITION_SIZE_PCT", 1.0)  # isolate leverage check

        client = NautilusExecutionClient()
        # cost = 100*310 = 31,000 → well under 100,000 cash and under the 100%
        # position-size limit, but 31,000 / 100,000 = 31% > MAX_LEVERAGE 30%.
        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_buy(quantity=310.0)))

        assert resp.status == "rejected"
        assert resp.reject_reason == "leverage_exceeded"
        assert client._cash == client.INITIAL_CAPITAL

    def test_leverage_at_limit_boundary_is_filled(self, monkeypatch):
        monkeypatch.setattr(settings, "MAX_LEVERAGE", 0.3)
        monkeypatch.setattr(settings, "MAX_POSITION_SIZE_PCT", 1.0)

        client = NautilusExecutionClient()
        # cost = 100*300 = 30,000 == exactly 30% of 100,000 — must be allowed.
        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_buy(quantity=300.0)))
        assert resp.status == "filled"

    def test_default_max_leverage_1x_blocks_overdraft_style_orders(self):
        """
        At the default MAX_LEVERAGE=1.0, any order that would exceed cash also
        (mathematically) exceeds leverage — the cash check catches it first.
        This documents the invariant: with no margin allowed, cash-secured
        buying can never itself push leverage past 1.0x.
        """
        client = NautilusExecutionClient()
        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_buy(quantity=2000.0)))
        assert resp.status == "rejected"
        assert resp.reject_reason == "insufficient_cash"


# ---------------------------------------------------------------------------
# (d) Daily-loss limit
# ---------------------------------------------------------------------------

class TestDailyLossLimit:
    def test_buy_blocked_after_daily_loss_breach(self):
        """
        Once day_pnl <= -MAX_DAILY_LOSS_PCT * day_start_value, new BUY orders
        (risk-increasing) must be rejected — even a small, otherwise-compliant one.
        """
        client = NautilusExecutionClient()
        # Simulate a 3% intraday loss (> default 2% MAX_DAILY_LOSS_PCT) by
        # directly reducing cash — day_start_value stays at INITIAL_CAPITAL.
        client._cash = client.INITIAL_CAPITAL - 3_000.0  # -3% day pnl

        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_buy(ticker="MSFT", quantity=1.0)))

        assert resp.status == "rejected"
        assert resp.reject_reason == "daily_loss_limit"

    def test_sell_still_allowed_after_daily_loss_breach(self):
        """SELL orders (always closing — no shorting) remain allowed even
        after the daily-loss circuit breaker has tripped."""
        client = NautilusExecutionClient()
        # Give the client an existing AAPL position to close.
        client._positions["AAPL"] = {"quantity": 10.0, "avg_price": 100.0, "realized_pnl": 0.0}
        # Now simulate the daily loss breach.
        client._cash = client.INITIAL_CAPITAL - 3_000.0 - 1_000.0  # extra buffer for the position cost basis

        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_sell(ticker="AAPL", quantity=5.0)))

        assert resp.status == "filled", f"SELL must remain allowed during daily-loss lockout: {resp.reject_reason}"

    def test_no_rejection_when_within_daily_loss_budget(self):
        """A normal day (no breach) must not trigger the daily-loss gate."""
        client = NautilusExecutionClient()
        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_buy(ticker="MSFT", quantity=1.0)))
        assert resp.status == "filled"


# ---------------------------------------------------------------------------
# P1: fill-price fallback removed — no fabricated $100 price
# ---------------------------------------------------------------------------

class TestNoFabricatedFillPrice:
    def test_market_order_without_price_data_is_rejected(self):
        """
        MARKET order with no yfinance price AND no limit_price must be
        rejected with reject_reason='no_market_price' — never silently
        filled at a fabricated nominal price.
        """
        client = NautilusExecutionClient()
        with patch("app.services.nautilus.client._fetch_price", return_value=None):
            resp = _run(client.submit_order(_buy(ticker="NOPRICE", quantity=1.0)))
        assert resp.status == "rejected"
        assert resp.reject_reason == "no_market_price"
        assert resp.filled_price is None

    def test_limit_order_without_market_price_still_fills_at_limit(self):
        """A LIMIT order may still fill using its own limit_price even when
        no live market price is available."""
        client = NautilusExecutionClient()
        with patch("app.services.nautilus.client._fetch_price", return_value=None):
            resp = _run(client.submit_order(
                _buy(ticker="NOPRICE", quantity=1.0, order_type=OrderType.LIMIT, limit_price=42.0)
            ))
        assert resp.status == "filled"
        assert resp.filled_price == 42.0


# ---------------------------------------------------------------------------
# P0-safety: live orders are never silently simulated
# ---------------------------------------------------------------------------

class TestLiveOrderSafety:
    def test_live_mode_disabled_config_is_rejected(self, monkeypatch):
        monkeypatch.setattr(settings, "ENABLE_LIVE_TRADING", False)
        client = NautilusExecutionClient()
        client.set_mode("live")
        resp = _run(client.submit_order(_buy(quantity=1.0)))
        assert resp.status == "rejected"
        assert resp.reject_reason == "live_trading_disabled"

    def test_live_mode_enabled_but_uninitialized_engine_is_rejected(self, monkeypatch):
        """
        Even with ENABLE_LIVE_TRADING=True, a live order must NOT silently
        fall back to the paper simulator when no real broker engine is
        initialised (self._initialized/_engine unset — the live-engine
        integration is a documented follow-up, not built yet).
        """
        monkeypatch.setattr(settings, "ENABLE_LIVE_TRADING", True)
        client = NautilusExecutionClient()
        client.set_mode("live")
        assert client._initialized is False
        assert client._engine is None

        with patch("app.services.nautilus.client._fetch_price", return_value=100.0):
            resp = _run(client.submit_order(_buy(quantity=1.0)))

        assert resp.status == "rejected"
        assert resp.reject_reason == "live_execution_unavailable"
        # Must NOT have touched paper-trading state (no silent paper fill).
        assert client._cash == client.INITIAL_CAPITAL
        assert client._positions == {}


# ---------------------------------------------------------------------------
# Real leverage computation (was hardcoded 1.0)
# ---------------------------------------------------------------------------

class TestRealLeverageComputation:
    def test_leverage_zero_with_no_positions(self):
        from app.services.jesse.client import compute_risk_metrics
        metrics = _run(compute_risk_metrics(positions=[], portfolio_value=100_000.0))
        assert metrics.leverage == 0.0

    def test_leverage_computed_from_gross_exposure(self):
        from app.services.jesse.client import compute_risk_metrics
        positions = [
            {"market_value": 40_000.0},
            {"market_value": 20_000.0},
        ]
        metrics = _run(compute_risk_metrics(positions=positions, portfolio_value=100_000.0))
        # gross exposure = 60,000 / equity 100,000 = 0.6x — not the old hardcoded 1.0.
        assert metrics.leverage == pytest.approx(0.6)
        assert metrics.leverage != 1.0

    def test_leverage_alert_when_over_configured_max(self, monkeypatch):
        from app.services.jesse.client import compute_risk_metrics
        # compute_risk_metrics re-imports `settings` from app.core.config at
        # call time (fresh lookup) rather than using a module-level binding,
        # so the patch target must be the live dotted path — not the
        # `settings` object this test module imported at collection time,
        # which can be stale if another test module reloaded app.core.config
        # in between (see tests/test_stripe_webhook_guard.py).
        monkeypatch.setattr("app.core.config.settings.MAX_LEVERAGE", 0.5)
        positions = [{"market_value": 80_000.0}]
        metrics = _run(compute_risk_metrics(positions=positions, portfolio_value=100_000.0))
        assert metrics.leverage == pytest.approx(0.8)
        assert any("Hebel" in a for a in metrics.alerts), f"Expected a leverage alert, got: {metrics.alerts}"
