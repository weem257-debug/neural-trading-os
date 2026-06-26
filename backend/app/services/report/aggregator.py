"""
Stock Report Aggregator
-----------------------
Orchestrates Elliott Wave, AI signal, sentiment, backtesting, and risk modules
to produce a unified StockReport with a German-language Verdikt.

Public API:
    async build_stock_report(
        ticker, analysis_date=None, period="6mo",
        fast_mode=True, account_equity=100_000.0
    ) -> StockReport
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, UTC, date, timedelta
from typing import Any, Optional

import numpy as np

from app.models.schemas import (
    BacktestRequest,
    BacktestResult,
    SignalDirection,
    StockReport,
    StockReportVerdict,
    TradingSignal,
)
from app.services.elliott.client import analyze_elliott_waves
from app.services.tradingagents.client import generate_signal
from app.api.routes.sentiment import _cached_sentiment
from app.services.jesse.client import run_backtest
from app.services.report.technical import compute_technical
from app.services.report.risk_single import compute_single_asset_risk
from app.core.config import settings as _settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DIRECTION_SCORES: dict[SignalDirection, float] = {
    SignalDirection.STRONG_BUY:  1.0,
    SignalDirection.BUY:         0.5,
    SignalDirection.HOLD:        0.0,
    SignalDirection.SELL:       -0.5,
    SignalDirection.STRONG_SELL: -1.0,
}

_VERDICT_LABELS_DE: dict[StockReportVerdict, str] = {
    StockReportVerdict.STRONG_BUY:       "KAUFEN",
    StockReportVerdict.BUY:              "KAUFEN",
    StockReportVerdict.HOLD:             "HALTEN",
    StockReportVerdict.SELL:             "VERKAUFEN",
    StockReportVerdict.STRONG_SELL:      "VERKAUFEN",
    StockReportVerdict.NO_RECOMMENDATION: "KEINE EMPFEHLUNG",
}

_WEIGHTS = {"ai": 0.35, "technical": 0.25, "elliott": 0.15, "sentiment": 0.15, "backtest": 0.10}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def build_stock_report(
    ticker: str,
    analysis_date: Optional[str] = None,
    period: str = "6mo",
    fast_mode: bool = True,
    account_equity: float = 100_000.0,
) -> StockReport:
    """
    Orchestrate all sub-modules and produce a StockReport.

    Each sub-module runs in its own try/except; failures degrade gracefully.
    All I/O happens via asyncio.gather for maximum parallelism.

    Offline-safe: if Elliott returns no candles, verdict is NO_RECOMMENDATION.
    """
    ticker = ticker.upper().strip()

    # ------------------------------------------------------------------ #
    # Step 1 — Parallel I/O (Elliott in thread, rest are native async)    #
    # ------------------------------------------------------------------ #
    async def _do_elliott() -> dict:
        return await asyncio.to_thread(analyze_elliott_waves, ticker, period, 5, 0.03)

    async def _do_signal() -> Optional[TradingSignal]:
        return await generate_signal(ticker, analysis_date, fast_mode=fast_mode)

    async def _do_sentiment():
        return await _cached_sentiment(ticker)

    async def _do_backtest() -> Optional[BacktestResult]:
        end_dt   = date.today()
        start_dt = end_dt - timedelta(days=365)
        req = BacktestRequest(
            strategy_name="macd_cross",
            ticker=ticker,
            start_date=start_dt.isoformat(),
            end_date=end_dt.isoformat(),
            initial_capital=max(account_equity, 1.0),
            engine="jesse",
            params={"fast_period": 12, "slow_period": 26, "fee": 0.001},
        )
        return await run_backtest(req)

    raw_results = await asyncio.gather(
        _do_elliott(),
        _do_signal(),
        _do_sentiment(),
        _do_backtest(),
        return_exceptions=True,
    )

    # Unwrap results — exceptions become None/{}
    elliott_raw:   dict                   = raw_results[0] if not isinstance(raw_results[0], Exception) else {}
    signal_result: Optional[TradingSignal]  = raw_results[1] if not isinstance(raw_results[1], Exception) else None
    sentiment_result                       = raw_results[2] if not isinstance(raw_results[2], Exception) else None
    backtest_result: Optional[BacktestResult] = raw_results[3] if not isinstance(raw_results[3], Exception) else None

    if isinstance(raw_results[0], Exception):
        logger.warning("elliott_failed ticker=%s: %s", ticker, raw_results[0])
    if isinstance(raw_results[1], Exception):
        logger.warning("signal_failed ticker=%s: %s", ticker, raw_results[1])
    if isinstance(raw_results[2], Exception):
        logger.warning("sentiment_failed ticker=%s: %s", ticker, raw_results[2])
    if isinstance(raw_results[3], Exception):
        logger.warning("backtest_failed ticker=%s: %s", ticker, raw_results[3])

    candles: list[dict] = elliott_raw.get("candles", []) if isinstance(elliott_raw, dict) else []

    # ------------------------------------------------------------------ #
    # Step 2 — Data quality                                               #
    # ------------------------------------------------------------------ #
    n_candles = len(candles)
    if n_candles >= 100:
        data_quality = "good"
    elif n_candles >= 30:
        data_quality = "limited"
    else:
        data_quality = "insufficient"

    # ------------------------------------------------------------------ #
    # Step 3 — Technical indicators (CPU, no I/O)                        #
    # ------------------------------------------------------------------ #
    tech_result: dict = compute_technical(candles)

    # ------------------------------------------------------------------ #
    # Step 4 — Risk                                                       #
    # ------------------------------------------------------------------ #
    signal_confidence = _sf(
        getattr(signal_result, "confidence", 0.5) if signal_result else 0.5
    )
    risk_result: dict = compute_single_asset_risk(
        candles=candles,
        backtest_result=backtest_result,
        confidence=signal_confidence,
        regime=tech_result.get("regime", "ranging"),
        account_equity=account_equity,
        settings=_settings,
    )

    # ------------------------------------------------------------------ #
    # Step 5 — Sub-scores for each module                                 #
    # ------------------------------------------------------------------ #

    # AI Signal
    ai_sub = 0.0
    if signal_result is not None:
        dir_score = _DIRECTION_SCORES.get(signal_result.direction, 0.0)
        ai_sub = dir_score * _sf(signal_result.confidence, 0.5)

    # Technical
    tech_sub = _sf(tech_result.get("tech_score", 0.0))

    # Elliott
    elliott_direction  = elliott_raw.get("wave_direction", "neutral") if elliott_raw else "neutral"
    elliott_confidence = _sf(elliott_raw.get("confidence", 0.0) if elliott_raw else 0.0)
    _dir_map = {"bullish": 1.0, "bearish": -1.0, "neutral": 0.0}
    elliott_sub = _dir_map.get(elliott_direction, 0.0) * elliott_confidence

    # Sentiment
    sentiment_sub = 0.0
    if sentiment_result is not None:
        sentiment_sub = _sf(getattr(sentiment_result, "overall_score", 0.0))

    # Backtest confirmation (dampening factor)
    backtest_sub = 0.0
    if backtest_result is not None:
        total_return = _sf(getattr(backtest_result, "total_return_pct", 0.0))
        sharpe       = _sf(getattr(backtest_result, "sharpe_ratio",     0.0))
        if total_return > 0 and sharpe > 0:
            backtest_sub = 0.3
        elif total_return < 0 and sharpe < 0:
            backtest_sub = -0.3

    # ------------------------------------------------------------------ #
    # Step 6 — Composite score + agreement + confidence                  #
    # ------------------------------------------------------------------ #
    composite_score = (
        _WEIGHTS["ai"]        * ai_sub
        + _WEIGHTS["technical"] * tech_sub
        + _WEIGHTS["elliott"]   * elliott_sub
        + _WEIGHTS["sentiment"] * sentiment_sub
        + _WEIGHTS["backtest"]  * backtest_sub
    )
    composite_score = _clamp(composite_score)

    sub_scores_arr = np.array([ai_sub, tech_sub, elliott_sub, sentiment_sub, backtest_sub])
    std_raw = float(np.std(sub_scores_arr))
    # Normalize std: range of sub-scores is [-1, +1], so max std ≈ 1.
    # agreement = 1 - (std / 1.0) clamped to [0, 1]
    agreement = _clamp(1.0 - std_raw, 0.0, 1.0)

    confidence = _clamp(0.5 * abs(composite_score) + 0.5 * agreement, 0.0, 1.0)

    # ------------------------------------------------------------------ #
    # Step 7 — Verdict thresholds                                        #
    # ------------------------------------------------------------------ #
    if composite_score >= 0.5:
        verdict = StockReportVerdict.STRONG_BUY
    elif composite_score >= 0.2:
        verdict = StockReportVerdict.BUY
    elif composite_score >= -0.2:
        verdict = StockReportVerdict.HOLD
    elif composite_score >= -0.5:
        verdict = StockReportVerdict.SELL
    else:
        verdict = StockReportVerdict.STRONG_SELL

    verdict_label_de = _VERDICT_LABELS_DE[verdict]
    position_size_pct = _sf(risk_result.get("recommended_position_pct", 0.0))

    # ------------------------------------------------------------------ #
    # Step 8 — Circuit-breaker override                                  #
    # ------------------------------------------------------------------ #
    circuit_breaker: bool    = bool(risk_result.get("circuit_breaker", False))
    cb_reasons: list[str]    = list(risk_result.get("circuit_breaker_reasons", []))

    if data_quality == "insufficient":
        circuit_breaker = True
        if not any("Kerzen" in r or "Daten" in r for r in cb_reasons):
            cb_reasons.append(
                f"Unzureichende Datenmenge ({n_candles} Kerzen; Minimum 30 erforderlich)."
            )

    if circuit_breaker:
        verdict          = StockReportVerdict.NO_RECOMMENDATION
        verdict_label_de = "KEINE EMPFEHLUNG"
        position_size_pct = 0.0

    # ------------------------------------------------------------------ #
    # Step 9 — Stop-Loss and Take-Profit                                 #
    # ------------------------------------------------------------------ #
    current_price: Optional[float] = None
    if candles:
        try:
            current_price = float(candles[-1]["close"])
        except (KeyError, ValueError, TypeError):
            pass

    stop_loss:   Optional[float] = None
    take_profit: Optional[float] = None

    if current_price is not None and current_price > 0:
        # Priority 1 — AI signal
        if signal_result is not None:
            _sl = _sf(getattr(signal_result, "stop_loss",    None) or 0.0)
            _tp = _sf(getattr(signal_result, "price_target", None) or 0.0)
            if _sl > 0:
                stop_loss   = _sl
            if _tp > 0:
                take_profit = _tp

        # Priority 2 — Elliott
        if stop_loss is None and isinstance(elliott_raw, dict):
            _esl = _sf(elliott_raw.get("stop_loss", 0.0))
            if _esl > 0:
                stop_loss = _esl
        if take_profit is None and isinstance(elliott_raw, dict):
            targets = elliott_raw.get("price_targets", [])
            if targets:
                _etp = _sf(targets[0])
                if _etp > 0:
                    take_profit = _etp

        # Priority 3 — ATR-based (2 × ATR)
        atr = tech_result.get("atr")
        if atr and atr > 0:
            is_bullish = composite_score >= 0
            if stop_loss is None:
                stop_loss   = round(current_price - 2 * atr if is_bullish else current_price + 2 * atr, 4)
            if take_profit is None:
                take_profit = round(current_price + 2 * atr if is_bullish else current_price - 2 * atr, 4)

        # Sanity correction: ensure SL/TP make sense for direction
        if verdict in (StockReportVerdict.BUY, StockReportVerdict.STRONG_BUY):
            if stop_loss is not None and stop_loss >= current_price:
                stop_loss   = round(current_price * 0.95, 4)
            if take_profit is not None and take_profit <= current_price:
                take_profit = round(current_price * 1.10, 4)
        elif verdict in (StockReportVerdict.SELL, StockReportVerdict.STRONG_SELL):
            if stop_loss is not None and stop_loss <= current_price:
                stop_loss   = round(current_price * 1.05, 4)
            if take_profit is not None and take_profit >= current_price:
                take_profit = round(current_price * 0.90, 4)

    # ------------------------------------------------------------------ #
    # Step 10 — German summary (3-6 Sätze)                               #
    # ------------------------------------------------------------------ #
    summary = _build_summary(
        ticker=ticker,
        verdict=verdict,
        composite_score=composite_score,
        confidence=confidence,
        ai_sub=ai_sub,
        tech_sub=tech_sub,
        sentiment_sub=sentiment_sub,
        circuit_breaker=circuit_breaker,
        cb_reasons=cb_reasons,
        regime=tech_result.get("regime", "ranging"),
        ann_vol_pct=_sf(risk_result.get("ann_vol_pct", 0.0)),
    )

    # ------------------------------------------------------------------ #
    # Step 11 — Assemble components dict                                  #
    # ------------------------------------------------------------------ #
    components: dict[str, Any] = {
        "ai_signal": {
            "direction":   signal_result.direction.value if signal_result else "HOLD",
            "confidence":  round(_sf(getattr(signal_result, "confidence", 0.0)), 4),
            "reasoning":   getattr(signal_result, "reasoning", None),
            "sub_score":   round(ai_sub, 3),
        },
        "technical": {
            **tech_result,
            "sub_score": round(tech_sub, 3),
        },
        "elliott": {
            "wave_direction": elliott_direction,
            "confidence":    round(elliott_confidence, 3),
            "current_wave":  elliott_raw.get("current_wave", "") if isinstance(elliott_raw, dict) else "",
            "sub_score":     round(elliott_sub, 3),
        },
        "sentiment": {
            "overall_sentiment": (
                sentiment_result.overall_sentiment.value if sentiment_result else "neutral"
            ),
            "overall_score": round(_sf(
                getattr(sentiment_result, "overall_score", 0.0)
            ), 4),
            "news_count":    getattr(sentiment_result, "news_count", 0) or 0,
            "sub_score":     round(sentiment_sub, 3),
        },
        "backtest": {
            "total_return_pct": round(_sf(getattr(backtest_result, "total_return_pct", 0.0)), 3),
            "sharpe_ratio":     round(_sf(getattr(backtest_result, "sharpe_ratio",     0.0)), 3),
            "win_rate":         round(_sf(getattr(backtest_result, "win_rate",         0.0)), 4),
            "total_trades":     getattr(backtest_result, "total_trades", 0) or 0,
            "sub_score":        round(backtest_sub, 3),
        },
        "risk": dict(risk_result),
    }

    return StockReport(
        ticker=ticker,
        generated_at=datetime.now(UTC),
        verdict=verdict,
        verdict_label_de=verdict_label_de,
        confidence=round(confidence, 4),
        composite_score=round(composite_score, 4),
        position_size_pct=round(position_size_pct, 6),
        stop_loss=stop_loss,
        take_profit=take_profit,
        summary=summary,
        components=components,
        agreement=round(agreement, 4),
        data_quality=data_quality,
    )


# ---------------------------------------------------------------------------
# Summary builder
# ---------------------------------------------------------------------------

def _build_summary(
    ticker: str,
    verdict: StockReportVerdict,
    composite_score: float,
    confidence: float,
    ai_sub: float,
    tech_sub: float,
    sentiment_sub: float,
    circuit_breaker: bool,
    cb_reasons: list[str],
    regime: str,
    ann_vol_pct: float,
) -> str:
    if circuit_breaker:
        reasons_str = "; ".join(cb_reasons) if cb_reasons else "unzureichende Marktdaten"
        return (
            f"Für {ticker} kann derzeit keine Handelsempfehlung ausgesprochen werden. "
            f"Ursachen: {reasons_str}. "
            f"Bitte prüfen Sie die Datenverfügbarkeit und die Marktbedingungen erneut, "
            f"bevor Sie eine Entscheidung treffen."
        )

    regime_de = {
        "trending":       "trendfolgend",
        "ranging":        "seitwärtsgerichtet",
        "high_volatility": "hochvolatil",
    }.get(regime, "unbekannt")

    conf_label = "hoch" if confidence > 0.70 else "moderat" if confidence > 0.40 else "niedrig"

    # Opening sentence — verdict
    if verdict in (StockReportVerdict.STRONG_BUY, StockReportVerdict.BUY):
        strength = "starken Kauf" if verdict == StockReportVerdict.STRONG_BUY else "Kauf"
        base = (
            f"Das KI-Gesamtmodell signalisiert für {ticker} einen {strength} "
            f"mit {conf_label}er Überzeugung (Composite-Score: {composite_score:+.2f}). "
        )
    elif verdict in (StockReportVerdict.SELL, StockReportVerdict.STRONG_SELL):
        strength = "starken Verkauf" if verdict == StockReportVerdict.STRONG_SELL else "Verkauf"
        base = (
            f"Das KI-Gesamtmodell empfiehlt für {ticker} einen {strength} "
            f"mit {conf_label}er Überzeugung (Composite-Score: {composite_score:+.2f}). "
        )
    else:
        base = (
            f"Das KI-Gesamtmodell zeigt für {ticker} ein unklares Bild und empfiehlt, "
            f"die Position zu halten (Composite-Score: {composite_score:+.2f}). "
        )

    # Contributing factors
    parts: list[str] = []
    if ai_sub > 0.3:
        parts.append("Das KI-Analyse-Team bewertet die Lage bullisch.")
    elif ai_sub < -0.3:
        parts.append("Das KI-Analyse-Team bewertet die Lage bärisch.")

    if tech_sub > 0.2:
        parts.append("Technische Indikatoren unterstützen die bullische Einschätzung.")
    elif tech_sub < -0.2:
        parts.append("Technische Indikatoren deuten auf Schwäche hin.")

    if sentiment_sub > 0.2:
        parts.append("Die Nachrichtenlage ist positiv.")
    elif sentiment_sub < -0.2:
        parts.append("Die Nachrichtenlage ist negativ.")

    vol_note = f" (ann. Volatilität: {ann_vol_pct:.1f} %)" if ann_vol_pct > 0 else ""
    regime_sent = f"Das Marktregime ist {regime_de}{vol_note}."

    return base + " ".join(parts) + (" " if parts else "") + regime_sent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sf(v: Any, default: float = 0.0) -> float:
    try:
        f = float(v)
        return f if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default


def _clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))
