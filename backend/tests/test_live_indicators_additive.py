"""
Tests for the additive live-analysis indicators (2026-07): ADX(14),
slow Stochastic(14,3,3) and OBV — added WITHOUT touching the existing
RSI/MACD/Bollinger/SMA/ATR math.

Covers:
  * new indicators present, correctly typed, in valid ranges
  * first-principles correctness (OBV on monotonic series, stochastic/ADX
    directionality)
  * REGRESSION: existing indicators are numerically unchanged vs an inline
    reference of the pre-change formulas.
"""
import numpy as np
import pandas as pd
import pytest


def _compute_indicators(df):
    """Lazy delegator — import the app module at CALL time, not at collection
    time. A module-level app import would initialise the DB engine during
    pytest collection, before the other test files' module-scoped fixtures set
    TRADING_DB_PATH, breaking their DB isolation in the full-suite run. All
    other test files import the app lazily inside fixtures for the same reason.
    """
    from app.api.routes.analysis import _compute_indicators as _impl
    return _impl(df)


def _ohlcv(closes: list[float], vols: list[float] | None = None) -> pd.DataFrame:
    """Build a deterministic OHLCV frame from a close series (high=+1, low=-1)."""
    n = len(closes)
    vols = vols if vols is not None else [1000.0 + (i % 5) * 100 for i in range(n)]
    close = pd.Series(closes, dtype=float)
    return pd.DataFrame({
        "Open": close.shift(1).fillna(close.iloc[0]),
        "High": close + 1.0,
        "Low": close - 1.0,
        "Close": close,
        "Volume": pd.Series(vols, dtype=float),
    })


def _trend_frame(n: int = 260, slope: float = 0.5, wobble: float = 8.0) -> pd.DataFrame:
    # Deterministic: trend + sine wobble, no RNG.
    closes = [100.0 + slope * i + wobble * np.sin(i / 9.0) for i in range(n)]
    return _ohlcv(closes)


# ---------------------------------------------------------------------------
# Presence + ranges
# ---------------------------------------------------------------------------

def test_new_indicators_present_and_valid():
    ind = _compute_indicators(_trend_frame())
    assert set(("adx", "stochastic", "obv")).issubset(ind.keys())

    stoch = ind["stochastic"]
    assert 0.0 <= stoch.k <= 100.0 and 0.0 <= stoch.d <= 100.0

    adx = ind["adx"]
    assert adx.adx >= 0.0 and adx.di_plus >= 0.0 and adx.di_minus >= 0.0
    assert np.isfinite(adx.adx) and np.isfinite(adx.di_plus) and np.isfinite(adx.di_minus)

    assert ind["obv"] is not None and np.isfinite(ind["obv"])


# ---------------------------------------------------------------------------
# First-principles correctness
# ---------------------------------------------------------------------------

def test_obv_equals_total_volume_on_strict_uptrend():
    # Every close > previous → OBV adds every volume (the first diff is NaN→0).
    vols = [500.0] * 60
    ind = _compute_indicators(_ohlcv([100.0 + i for i in range(60)], vols))
    # First bar contributes 0 (no prior close); the remaining 59 add +500 each.
    assert ind["obv"] == pytest.approx(sum(vols[1:]), rel=1e-9)


def test_obv_subtracts_on_strict_downtrend():
    vols = [500.0] * 60
    ind = _compute_indicators(_ohlcv([200.0 - i for i in range(60)], vols))
    assert ind["obv"] == pytest.approx(-sum(vols[1:]), rel=1e-9)


def test_stochastic_high_on_uptrend_low_on_downtrend():
    up = _compute_indicators(_ohlcv([100.0 + i for i in range(60)]))
    down = _compute_indicators(_ohlcv([200.0 - i for i in range(60)]))
    assert up["stochastic"].k > 80.0      # closing near period highs
    assert down["stochastic"].k < 20.0    # closing near period lows


def test_adx_directional_on_strong_uptrend():
    ind = _compute_indicators(_ohlcv([100.0 + i for i in range(80)]))
    assert ind["adx"].di_plus > ind["adx"].di_minus   # up-move dominates
    assert ind["adx"].adx > 20.0                       # a real trend registers


# ---------------------------------------------------------------------------
# REGRESSION — existing indicators unchanged by the additive change
# ---------------------------------------------------------------------------

def test_existing_indicators_match_reference():
    df = _trend_frame()
    ind = _compute_indicators(df)

    close = df["Close"].astype(float)
    high = df["High"].astype(float)
    low = df["Low"].astype(float)

    # Reference = the pre-change formulas, recomputed independently.
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    ref_rsi = (100 - (100 / (1 + rs))).where(avg_loss != 0, 100.0).dropna().iloc[-1]

    ref_sma20 = close.rolling(20).mean().dropna().iloc[-1]
    ref_sma50 = close.rolling(50).mean().dropna().iloc[-1]

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    ref_macd_hist = ((ema12 - ema26) - (ema12 - ema26).ewm(span=9, adjust=False).mean()).iloc[-1]

    prev_close = close.shift(1)
    tr = pd.concat([(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    ref_atr = tr.rolling(14).mean().dropna().iloc[-1]

    assert ind["rsi_14"] == pytest.approx(round(float(ref_rsi), 4), abs=1e-4)
    assert ind["sma_20"] == pytest.approx(round(float(ref_sma20), 4), abs=1e-4)
    assert ind["sma_50"] == pytest.approx(round(float(ref_sma50), 4), abs=1e-4)
    assert ind["macd"].hist == pytest.approx(round(float(ref_macd_hist), 4), abs=1e-4)
    assert ind["atr_14"] == pytest.approx(round(float(ref_atr), 4), abs=1e-4)
