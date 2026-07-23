"""
Tests for the additive Kronos forecasting signal (app/services/scanner/forecast.py).

These tests run WITHOUT torch or the vendored model being importable: they cover
the pure signal-derivation math, the OHLCV→Kronos input conversion, and — most
importantly for a live-capital scanner — the graceful-degradation guarantees:
when Kronos is disabled OR its model can't load, candidates are left untouched.
"""
import asyncio
from datetime import datetime, UTC

import numpy as np
import pandas as pd
import pytest

from app.services.scanner import forecast as fc
from app.services.scanner.prefilter import Candidate


def _run(coro):
    return asyncio.run(coro)


def _pred_df(closes):
    return pd.DataFrame({
        "open": closes, "high": closes, "low": closes,
        "close": closes, "volume": [1.0] * len(closes),
    })


def _yf_frame(closes):
    n = len(closes)
    closes = np.asarray(closes, dtype=float)
    idx = pd.date_range("2025-01-01", periods=n, freq="D")
    return pd.DataFrame(
        {"Open": closes, "High": closes * 1.01, "Low": closes * 0.99,
         "Close": closes, "Volume": np.full(n, 1_000_000.0)},
        index=idx,
    )


# ===========================================================================
class TestDeriveSignal:
    def test_upward_forecast_is_buy(self):
        sig = fc._derive_signal(100.0, _pred_df([101, 102, 103]), realized_vol=0.01)
        assert sig["direction"] == "BUY"
        assert sig["expected_return"] > 0
        assert 0.0 <= sig["score"] <= 1.0

    def test_downward_forecast_is_sell(self):
        sig = fc._derive_signal(100.0, _pred_df([99, 98, 97]), realized_vol=0.01)
        assert sig["direction"] == "SELL"
        assert sig["expected_return"] < 0

    def test_flat_forecast_below_threshold_is_neutral(self):
        # ~0.1% move, under the default 0.5% KRONOS_MIN_ABS_RETURN.
        sig = fc._derive_signal(100.0, _pred_df([100.1, 100.0, 100.1]), realized_vol=0.02)
        assert sig["direction"] == "NEUTRAL"

    def test_score_clipped_to_unit_interval(self):
        # Huge move on a calm asset -> score saturates at 1.0, never above.
        sig = fc._derive_signal(100.0, _pred_df([200, 200, 200]), realized_vol=0.001)
        assert sig["score"] == 1.0

    def test_vol_normalisation_makes_calm_asset_score_higher(self):
        calm = fc._derive_signal(100.0, _pred_df([101, 101, 101]), realized_vol=0.005)
        wild = fc._derive_signal(100.0, _pred_df([101, 101, 101]), realized_vol=0.05)
        # Same 1% forecast: the calm name must be trusted more.
        assert calm["score"] > wild["score"]

    def test_handles_degenerate_last_close(self):
        sig = fc._derive_signal(0.0, _pred_df([1, 2, 3]), realized_vol=0.01)
        assert sig["direction"] == "NEUTRAL"
        assert sig["score"] == 0.0


class TestOhlcvConversion:
    def test_converts_yfinance_frame(self):
        out = fc._ohlcv_to_kronos_inputs(_yf_frame(list(range(1, 60))), lookback=50, pred_len=12)
        assert out is not None
        df, x_ts, y_ts = out
        assert list(df.columns) == ["open", "high", "low", "close", "volume"]
        assert len(df) == 50
        assert len(y_ts) == 12
        # Future timestamps must be strictly after the last history stamp.
        assert y_ts.iloc[0] > x_ts.iloc[-1]

    def test_too_short_frame_returns_none(self):
        assert fc._ohlcv_to_kronos_inputs(_yf_frame([1, 2, 3]), lookback=200, pred_len=12) is None

    def test_none_frame_returns_none(self):
        assert fc._ohlcv_to_kronos_inputs(None, lookback=200, pred_len=12) is None


class TestRealizedVol:
    def test_positive_for_varying_series(self):
        v = fc._realized_vol(_pred_df([100, 101, 99, 102, 98, 103]))
        assert v is not None and v > 0

    def test_none_for_too_short(self):
        assert fc._realized_vol(_pred_df([100, 101])) is None


class TestGracefulDegradation:
    def test_noop_when_disabled(self, monkeypatch):
        monkeypatch.setattr(fc.settings, "KRONOS_ENABLED", False)
        cands = [Candidate(symbol="AAPL", score=80.0, direction="BUY")]
        _run(fc.attach_forecasts(cands))
        assert cands[0].forecast is None

    def test_noop_when_model_load_fails(self, monkeypatch):
        # Simulate torch/model unavailable: _load_predictor returns None.
        monkeypatch.setattr(fc.settings, "KRONOS_ENABLED", True)
        monkeypatch.setattr(fc, "_load_predictor", lambda: None)
        cands = [Candidate(symbol="AAPL", score=80.0, direction="BUY")]
        _run(fc.attach_forecasts(cands))
        # Candidate untouched — scanner proceeds technical-only.
        assert cands[0].forecast is None

    def test_warm_up_noop_when_disabled(self, monkeypatch):
        monkeypatch.setattr(fc.settings, "KRONOS_ENABLED", False)
        assert _run(fc.warm_up()) is False


class TestPromptIntegration:
    def test_forecast_block_appears_in_prompt(self):
        from app.services.scanner.deep_analysis import _build_prompt

        cand = Candidate(
            symbol="AAPL", score=80.0, direction="BUY", last_price=100.0,
            indicators={"rsi_14": 28.0},
            forecast={"available": True, "direction": "BUY", "score": 0.72,
                      "expected_return": 0.018, "horizon": 12},
        )
        prompt = _build_prompt(cand)
        assert "Kronos-Forecast" in prompt
        assert "BUY" in prompt

    def test_no_forecast_block_when_absent(self):
        from app.services.scanner.deep_analysis import _build_prompt

        cand = Candidate(symbol="AAPL", score=80.0, direction="BUY", last_price=100.0)
        prompt = _build_prompt(cand)
        assert "Kronos-Forecast" not in prompt
