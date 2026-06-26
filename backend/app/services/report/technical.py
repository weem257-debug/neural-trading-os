"""
Technical Indicator Engine
--------------------------
Computes RSI, MACD histogram, Bollinger %B, SMA-trend, volume-trend, ATR,
market regime, and a composite tech_score in [-1, +1].

All calculations use only numpy/pandas on pre-fetched OHLCV candles (no
additional network calls).  Designed to be offline- and CI-safe.

Public API:
    compute_technical(candles: list[dict]) -> dict
"""
from __future__ import annotations

import logging
import math
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def compute_technical(candles: list[dict]) -> dict:
    """
    Compute a suite of technical indicators from OHLCV candles.

    Parameters
    ----------
    candles : list[dict]
        Each dict must contain at least: date, open, high, low, close.
        'volume' is optional.

    Returns
    -------
    dict with keys:
        rsi             float | None    (14-period Wilder's RSI)
        macd_hist       float | None    (MACD histogram: MACD - Signal)
        bollinger_pct_b float | None    (Bollinger %B, 0..1 clamped)
        sma_trend       str             "bullish" | "bearish" | "neutral"
        volume_trend    str             "rising" | "falling" | "neutral"
        atr             float | None    (14-period ATR)
        regime          str             "trending" | "ranging" | "high_volatility"
        tech_score      float           composite score in [-1, +1]
        notes           list[str]       human-readable observations
    """
    notes: list[str] = []

    # Guard: too few candles
    if not candles or len(candles) < 5:
        notes.append(f"Zu wenige Kerzen ({len(candles) if candles else 0}); Analyse nicht möglich.")
        return _empty_result(notes)

    # Build DataFrame — coerce dtypes defensively
    try:
        df = pd.DataFrame(candles)
        closes   = df["close"].astype(float)
        highs    = df["high"].astype(float)
        lows     = df["low"].astype(float)
        volumes  = df["volume"].astype(float) if "volume" in df.columns else pd.Series(
            np.zeros(len(df)), dtype=float
        )
    except Exception as exc:
        logger.warning("technical_df_build_error: %s", exc)
        notes.append(f"Datenfehler beim Aufbau der Zeitreihe: {exc}")
        return _empty_result(notes)

    n = len(closes)
    current_price = float(closes.iloc[-1]) if n > 0 else 1.0

    # --- RSI (14, Wilder's smoothing via EWM com=13) ---
    rsi: Optional[float] = None
    if n >= 15:
        try:
            delta = closes.diff()
            gains = delta.clip(lower=0.0)
            losses = (-delta).clip(lower=0.0)
            avg_gain = gains.ewm(com=13, adjust=False, min_periods=14).mean()
            avg_loss = losses.ewm(com=13, adjust=False, min_periods=14).mean()
            # Compute on the last bar only to handle edge cases cleanly
            ag_last = float(avg_gain.iloc[-1])
            al_last = float(avg_loss.iloc[-1])
            if not (math.isfinite(ag_last) and math.isfinite(al_last)):
                rsi = 50.0
            elif al_last <= 0.0 and ag_last <= 0.0:
                rsi = 50.0   # no movement
            elif al_last <= 0.0:
                rsi = 100.0  # all gains, no losses → fully overbought
            elif ag_last <= 0.0:
                rsi = 0.0    # all losses, no gains → fully oversold
            else:
                rs = ag_last / al_last
                val = 100.0 - 100.0 / (1.0 + rs)
                rsi = val if math.isfinite(val) else 50.0
        except Exception as exc:
            logger.debug("rsi_error: %s", exc)

    # --- MACD (12/26/9) ---
    macd_hist: Optional[float] = None
    if n >= 35:
        try:
            ema12 = closes.ewm(span=12, adjust=False).mean()
            ema26 = closes.ewm(span=26, adjust=False).mean()
            macd_line   = ema12 - ema26
            signal_line = macd_line.ewm(span=9, adjust=False).mean()
            hist_series = macd_line - signal_line
            val = float(hist_series.iloc[-1])
            macd_hist = val if math.isfinite(val) else 0.0
        except Exception as exc:
            logger.debug("macd_error: %s", exc)

    # --- Bollinger Bands %B (SMA20 ± 2σ) ---
    bollinger_pct_b: Optional[float] = None
    if n >= 20:
        try:
            sma20  = closes.rolling(20).mean()
            std20  = closes.rolling(20).std(ddof=1)
            upper  = sma20 + 2.0 * std20
            lower  = sma20 - 2.0 * std20
            bw     = float((upper - lower).iloc[-1])
            if bw > 1e-10:
                raw = float((closes.iloc[-1] - lower.iloc[-1]) / bw)
                bollinger_pct_b = max(0.0, min(1.0, raw)) if math.isfinite(raw) else 0.5
        except Exception as exc:
            logger.debug("bollinger_error: %s", exc)

    # --- SMA Trend (SMA20 vs SMA50) ---
    sma_trend = "neutral"
    sma20_val: Optional[float] = None
    sma50_val: Optional[float] = None
    if n >= 20:
        try:
            sma20_val = float(closes.rolling(20).mean().iloc[-1])
        except Exception:
            pass
    if n >= 50:
        try:
            sma50_val = float(closes.rolling(50).mean().iloc[-1])
        except Exception:
            pass

    if sma20_val is not None and sma50_val is not None:
        spread = (sma20_val - sma50_val) / max(abs(sma50_val), 1e-10)
        if spread > 0.005:
            sma_trend = "bullish"
        elif spread < -0.005:
            sma_trend = "bearish"
    elif sma20_val is not None and n >= 30:
        # Fallback: compare recent SMA20 to SMA20 from 10 bars ago
        try:
            sma20_lagged = float(closes.iloc[-min(n, 30):-10].mean())
            if sma20_val > sma20_lagged * 1.005:
                sma_trend = "bullish"
            elif sma20_val < sma20_lagged * 0.995:
                sma_trend = "bearish"
        except Exception:
            pass

    # --- Volume Trend (recent 5d vs. prior 20d baseline) ---
    volume_trend = "neutral"
    if n >= 25:
        try:
            recent_vol   = float(volumes.iloc[-5:].mean())
            baseline_vol = float(volumes.iloc[-25:-5].mean())
            if baseline_vol > 1e-10:
                ratio = recent_vol / baseline_vol
                if ratio > 1.25:
                    volume_trend = "rising"
                elif ratio < 0.75:
                    volume_trend = "falling"
        except Exception as exc:
            logger.debug("volume_trend_error: %s", exc)

    # --- ATR (14, Wilder's EWM) ---
    atr: Optional[float] = None
    if n >= 15:
        try:
            prev_close = closes.shift(1)
            hl   = highs - lows
            hc   = (highs - prev_close).abs()
            lc   = (lows  - prev_close).abs()
            tr   = pd.concat([hl, hc, lc], axis=1).max(axis=1)
            atr_series = tr.ewm(com=13, adjust=False, min_periods=14).mean()
            val = float(atr_series.iloc[-1])
            atr = val if (math.isfinite(val) and val >= 0) else None
        except Exception as exc:
            logger.debug("atr_error: %s", exc)

    # --- Regime detection ---
    regime = "ranging"
    if atr is not None and current_price > 1e-10:
        atr_pct = atr / current_price
        if atr_pct > 0.030:
            regime = "high_volatility"
            notes.append(f"Hohe Volatilität: ATR {atr_pct * 100:.1f}% des Kurses.")
        elif sma_trend != "neutral":
            regime = "trending"
    elif sma_trend != "neutral" and n >= 20:
        regime = "trending"

    # --- Notes for extreme RSI ---
    if rsi is not None:
        if rsi <= 30:
            notes.append(f"RSI: starke Abwärtsdynamik ({rsi:.1f}) — Bärischer Impuls.")
        elif rsi >= 70:
            notes.append(f"RSI: starke Aufwärtsdynamik ({rsi:.1f}) — Bullischer Impuls.")

    # --- Composite tech_score in [-1, +1] ---
    # Scoring uses MOMENTUM interpretation (not mean-reversion):
    #   RSI > 70 = bullish momentum, RSI < 30 = bearish momentum.
    #   Bollinger %B near upper band = bullish, near lower band = bearish.
    # This is appropriate for signal aggregation alongside trend-following AI agents.
    sub_scores: list[float] = []

    # RSI contribution (momentum)
    if rsi is not None:
        if rsi >= 70:
            sub_scores.append(0.8)    # strong upward momentum
        elif rsi >= 55:
            sub_scores.append(0.3)
        elif rsi >= 45:
            sub_scores.append(0.0)
        elif rsi >= 30:
            sub_scores.append(-0.3)
        else:
            sub_scores.append(-0.8)   # strong downward momentum

    # MACD histogram (normalized by 1% of price to scale to ~[-1, +1])
    if macd_hist is not None and current_price > 1e-10:
        norm = macd_hist / (current_price * 0.01)
        sub_scores.append(max(-1.0, min(1.0, norm)))

    # Bollinger %B (momentum interpretation)
    if bollinger_pct_b is not None:
        if bollinger_pct_b >= 0.80:
            sub_scores.append(0.5)    # near upper band → bullish momentum
        elif bollinger_pct_b <= 0.20:
            sub_scores.append(-0.5)   # near lower band → bearish momentum
        else:
            # Linear scale: 0.5 = neutral → 0, 1.0 = max bullish, 0.0 = max bearish
            sub_scores.append((bollinger_pct_b - 0.5) * 2.0)

    # SMA trend
    sub_scores.append({"bullish": 0.6, "bearish": -0.6, "neutral": 0.0}[sma_trend])

    # Volume trend (mild confirmation signal)
    sub_scores.append({"rising": 0.2, "falling": -0.2, "neutral": 0.0}[volume_trend])

    tech_score = float(np.mean(sub_scores)) if sub_scores else 0.0
    tech_score = max(-1.0, min(1.0, tech_score))
    if not math.isfinite(tech_score):
        tech_score = 0.0

    return {
        "rsi":              _r2(rsi),
        "macd_hist":        _r4(macd_hist),
        "bollinger_pct_b":  _r4(bollinger_pct_b),
        "sma_trend":        sma_trend,
        "volume_trend":     volume_trend,
        "atr":              _r4(atr),
        "regime":           regime,
        "tech_score":       round(tech_score, 4),
        "notes":            notes,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _empty_result(notes: list[str]) -> dict:
    return {
        "rsi": None,
        "macd_hist": None,
        "bollinger_pct_b": None,
        "sma_trend": "neutral",
        "volume_trend": "neutral",
        "atr": None,
        "regime": "ranging",
        "tech_score": 0.0,
        "notes": notes,
    }


def _r2(v: Optional[float]) -> Optional[float]:
    return round(v, 2) if v is not None and math.isfinite(v) else None


def _r4(v: Optional[float]) -> Optional[float]:
    return round(v, 4) if v is not None and math.isfinite(v) else None
