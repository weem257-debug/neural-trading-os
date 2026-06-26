"""
Single-Asset Risk Engine
------------------------
Computes historical VaR, CVaR, annualized volatility, Kelly fraction, and
position sizing from OHLCV candles + backtest results.

Includes circuit-breaker logic that prevents recommendations when data or
market conditions are extreme.

Public API:
    compute_single_asset_risk(candles, backtest_result, confidence, regime,
                              account_equity, settings) -> dict
"""
from __future__ import annotations

import logging
import math
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)

# Circuit-breaker thresholds
_MIN_CANDLES     = 30
_EXTREME_VOL_PCT = 100.0   # ann. vol > 100 % → circuit breaker
_EXTREME_VAR99   = -0.05   # daily VaR99 < -5 % → circuit breaker

# Assumed avg loss per losing trade used to estimate payoff ratio (2 %)
_ASSUMED_AVG_LOSS = 0.02

# Default max position size if settings attribute is missing
_DEFAULT_MAX_POS  = 0.10   # 10 %

# Regime multipliers for position sizing
_REGIME_MULTIPLIERS = {
    "trending":       1.0,
    "ranging":        0.7,
    "high_volatility": 0.5,
}


def compute_single_asset_risk(
    candles: list[dict],
    backtest_result: Any,
    confidence: float,
    regime: str,
    account_equity: float,
    settings: Any = None,
) -> dict:
    """
    Compute single-asset risk metrics.

    Parameters
    ----------
    candles         : OHLCV list from Elliott/yfinance (no additional download).
    backtest_result : BacktestResult schema instance or None.
    confidence      : Signal confidence in [0, 1].
    regime          : "trending" | "ranging" | "high_volatility".
    account_equity  : Total account value in base currency.
    settings        : App settings object (MAX_POSITION_SIZE_PCT optional).

    Returns
    -------
    dict with keys:
        var_95_pct, var_99_pct, cvar_95_pct (in %)
        ann_vol_pct (in %)
        kelly_fraction (raw)
        recommended_position_pct  (fraction of equity, e.g. 0.05 = 5 %)
        recommended_position_value (in base currency)
        stop_loss, take_profit     (None — set by aggregator)
        circuit_breaker            bool
        circuit_breaker_reasons    list[str]
    """
    circuit_breaker_reasons: list[str] = []

    # --- Minimum data check ---
    n_candles = len(candles) if candles else 0
    if n_candles < _MIN_CANDLES:
        return _safe_default(
            [f"Zu wenig historische Daten ({n_candles} Kerzen, Minimum {_MIN_CANDLES})."]
        )

    # --- Build closes array ---
    try:
        closes = np.array([float(c["close"]) for c in candles], dtype=np.float64)
    except (KeyError, ValueError, TypeError) as exc:
        return _safe_default([f"Ungültige Preisdaten: {exc}"])

    if np.any(closes <= 0) or len(closes) < 2:
        return _safe_default(["Ungültige oder fehlende Schlusskurse in den Candlestick-Daten."])

    # --- Log-returns ---
    log_returns = np.diff(np.log(closes))
    log_returns = log_returns[np.isfinite(log_returns)]

    if len(log_returns) < 10:
        return _safe_default(["Zu wenig auswertbare tägliche Renditen."])

    # --- Historical VaR (5th and 1st percentile of daily log-returns) ---
    var_95_raw = float(np.percentile(log_returns, 5))   # negative = loss
    var_99_raw = float(np.percentile(log_returns, 1))

    # --- CVaR (Expected Shortfall at 95 %) ---
    tail = log_returns[log_returns <= var_95_raw]
    cvar_95_raw = float(np.mean(tail)) if len(tail) > 0 else var_95_raw

    # --- Annualized volatility ---
    ann_vol_raw = float(np.std(log_returns, ddof=1)) * math.sqrt(252.0)

    # Convert to pct strings (×100), guard NaN/Inf
    def _pct(v: float) -> float:
        v100 = v * 100.0
        return round(v100, 3) if math.isfinite(v100) else 0.0

    var_95_pct  = _pct(var_95_raw)
    var_99_pct  = _pct(var_99_raw)
    cvar_95_pct = _pct(cvar_95_raw)
    ann_vol_pct = _pct(ann_vol_raw)

    # --- Circuit-breakers ---
    if ann_vol_raw > (_EXTREME_VOL_PCT / 100.0):
        circuit_breaker_reasons.append(
            f"Extreme annualisierte Volatilität ({ann_vol_pct:.1f} %). "
            "Positionierung nicht empfohlen."
        )

    if var_99_raw < _EXTREME_VAR99:
        circuit_breaker_reasons.append(
            f"Extremes Tagesrisiko — VaR99 = {var_99_pct:.1f} %. "
            "Risikotoleranz überschritten."
        )

    # --- Kelly Fraction ---
    kelly_fraction = 0.0
    if backtest_result is not None:
        try:
            win_rate      = _sf(getattr(backtest_result, "win_rate",         0.5))
            total_trades  = max(int(getattr(backtest_result, "total_trades",  1)), 1)
            total_ret_pct = _sf(getattr(backtest_result, "total_return_pct", 0.0))

            # avg PnL per trade as fraction of initial capital
            avg_pnl = (total_ret_pct / 100.0) / total_trades

            # Estimate payoff ratio
            # E[PnL] = win_rate * avg_win - (1 - win_rate) * avg_loss = avg_pnl
            # avg_win = (avg_pnl + (1 - win_rate) * avg_loss) / win_rate
            if win_rate > 0.01:
                avg_win = (avg_pnl + (1.0 - win_rate) * _ASSUMED_AVG_LOSS) / win_rate
                payoff_ratio = max(avg_win / _ASSUMED_AVG_LOSS, 0.01)
            else:
                payoff_ratio = 1.0

            # Kelly: W - (1-W)/R
            kelly_raw = win_rate - (1.0 - win_rate) / max(payoff_ratio, 0.01)
            kelly_fraction = max(kelly_raw, 0.0)
        except Exception as exc:
            logger.warning("kelly_calculation_error: %s", exc)
            kelly_fraction = 0.0

    # Half-Kelly for safety
    half_kelly = kelly_fraction / 2.0

    # Max position from settings
    max_pos_pct = _sf(getattr(settings, "MAX_POSITION_SIZE_PCT", _DEFAULT_MAX_POS)) \
        if settings is not None else _DEFAULT_MAX_POS

    # Regime multiplier
    regime_mult = _REGIME_MULTIPLIERS.get(regime, 0.7)

    # Final position sizing: half_kelly × confidence × regime_mult, capped
    raw_pos = half_kelly * max(0.0, min(1.0, confidence)) * regime_mult
    recommended_position_pct = round(min(max(raw_pos, 0.0), max_pos_pct), 6)
    recommended_position_value = round(
        max(0.0, _sf(account_equity)) * recommended_position_pct, 2
    )

    return {
        "var_95_pct":               var_95_pct,
        "var_99_pct":               var_99_pct,
        "cvar_95_pct":              cvar_95_pct,
        "ann_vol_pct":              ann_vol_pct,
        "kelly_fraction":           round(kelly_fraction, 6),
        "recommended_position_pct": recommended_position_pct,
        "recommended_position_value": recommended_position_value,
        "stop_loss":                None,   # set by aggregator
        "take_profit":              None,   # set by aggregator
        "circuit_breaker":          len(circuit_breaker_reasons) > 0,
        "circuit_breaker_reasons":  circuit_breaker_reasons,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sf(v: Any, default: float = 0.0) -> float:
    """Safe float conversion — returns default on NaN/Inf/error."""
    try:
        f = float(v)
        return f if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default


def _safe_default(reasons: list[str]) -> dict:
    return {
        "var_95_pct":               0.0,
        "var_99_pct":               0.0,
        "cvar_95_pct":              0.0,
        "ann_vol_pct":              0.0,
        "kelly_fraction":           0.0,
        "recommended_position_pct": 0.0,
        "recommended_position_value": 0.0,
        "stop_loss":                None,
        "take_profit":              None,
        "circuit_breaker":          True,
        "circuit_breaker_reasons":  reasons,
    }
