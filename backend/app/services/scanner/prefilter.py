"""
Stage 1 — technical prefilter for the 24/7 market scanner (ADR 0003).

Zero LLM cost: this stage is pure indicator computation over free yfinance
batch OHLCV data. It scores every symbol in the universe 0-100 from ADX/DI,
RSI, Stochastic %K, MACD histogram, OBV trend and volume confirmation, and
returns only the candidates that clear ``MIN_SCORE_THRESHOLD`` (40), sorted by
score. Only these candidates are forwarded to the (paid) Sonnet deep analysis.

Reusing ``app.api.routes.analysis._compute_indicators`` keeps the indicator math
identical to the live single-symbol analysis feature — one source of truth.
"""
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# A candidate must score at least this to be forwarded to Stage 2 (Sonnet).
MIN_SCORE_THRESHOLD = 40.0
# yfinance batch size per download call.
CHUNK_SIZE = 50

# Score weights (max composite ~100).
_WEIGHT_ADX = 25.0
_WEIGHT_RSI = 20.0
_WEIGHT_STOCH = 15.0
_WEIGHT_MACD = 10.0
_WEIGHT_OBV = 20.0
_WEIGHT_VOLUME = 10.0

# OBV moving-average window (periods).
_OBV_AVG_WINDOW = 20


@dataclass
class Candidate:
    """A symbol that cleared the prefilter, with its score and evidence."""

    symbol: str
    score: float
    direction: str
    reasons: list[str] = field(default_factory=list)
    last_price: Optional[float] = None
    indicators: dict = field(default_factory=dict)


def _obv_trend(hist_df):
    """
    20-period moving average of On-Balance Volume, computed directly from
    the OHLCV frame.

    ``_compute_indicators`` returns the latest OBV point; here we also need its
    moving average to judge whether OBV is trending up or down. Returns
    (obv_last, obv_avg_last); on any failure returns (0.0, 0.0).
    """
    import numpy as np

    try:
        close = hist_df["Close"].astype(float)
        volume = hist_df["Volume"].astype(float)
        direction = np.sign(close.diff().fillna(0.0))
        obv = (direction * volume).cumsum()
        obv_avg = obv.rolling(_OBV_AVG_WINDOW).mean()
        obv_last = float(obv.iloc[-1])
        avg_last = obv_avg.iloc[-1]
        avg_last = float(avg_last) if avg_last == avg_last else obv_last  # NaN guard
        return obv_last, avg_last
    except Exception:
        return 0.0, 0.0


def _score_symbol(hist_df) -> Optional[Candidate]:
    """
    Score one symbol's OHLCV history for a technical trade setup.

    Aggregates ADX/DI, RSI, Stochastic %K, MACD-histogram, OBV trend and volume
    into a 0-100 score with an explainable German reason list, and infers a
    BUY/SELL direction. Returns a Candidate (symbol left blank for the caller to
    fill) when the score clears the threshold, else None. Never raises.
    """
    if hist_df is None or hist_df.empty:
        return None

    try:
        from app.api.routes.analysis import _compute_indicators

        ind = _compute_indicators(hist_df)
    except Exception:
        logger.debug("prefilter_indicator_computation_failed", exc_info=True)
        return None

    try:
        last_close = ind.get("_last_close")
        rsi = ind.get("rsi_14")
        macd_obj = ind.get("macd")
        adx_obj = ind.get("adx")
        stoch_obj = ind.get("stochastic")
        volume_avg_20 = ind.get("volume_avg_20")

        macd_hist = float(getattr(macd_obj, "hist", 0.0) or 0.0)
        adx = float(getattr(adx_obj, "adx", 0.0) or 0.0)
        di_plus = float(getattr(adx_obj, "di_plus", 0.0) or 0.0)
        di_minus = float(getattr(adx_obj, "di_minus", 0.0) or 0.0)
        stoch_k = float(getattr(stoch_obj, "k", 50.0) or 50.0)
        stoch_d = float(getattr(stoch_obj, "d", 50.0) or 50.0)

        volume = float(hist_df["Volume"].astype(float).iloc[-1])
        obv, obv_avg_20 = _obv_trend(hist_df)
    except Exception:
        logger.debug("prefilter_indicator_extraction_failed", exc_info=True)
        return None

    score = 0.0
    reasons: list[str] = []
    direction: Optional[str] = None

    # ADX/DI — trend strength + direction.
    if adx > 25 and di_plus > di_minus:
        score += _WEIGHT_ADX
        direction = "BUY"
        reasons.append(
            f"ADX({adx:.1f}) > 25 mit +DI({di_plus:.1f}) > -DI({di_minus:.1f}) "
            f"— Trend vorhanden, Richtung BUY"
        )
    elif adx > 25 and di_minus > di_plus:
        score += _WEIGHT_ADX
        direction = "SELL"
        reasons.append(
            f"ADX({adx:.1f}) > 25 mit -DI({di_minus:.1f}) > +DI({di_plus:.1f}) "
            f"— Trend vorhanden, Richtung SELL"
        )

    # RSI — over-sold / over-bought.
    if rsi is not None:
        if rsi < 30:
            score += _WEIGHT_RSI
            reasons.append(f"RSI({rsi:.1f}) < 30 — überverkauft")
            if direction is None:
                direction = "BUY"
        elif rsi > 70:
            score += _WEIGHT_RSI
            reasons.append(f"RSI({rsi:.1f}) > 70 — überkauft")
            if direction is None:
                direction = "SELL"

    # Stochastic %K — over-sold / over-bought.
    if stoch_k < 20:
        score += _WEIGHT_STOCH
        reasons.append(f"Stochastic %K({stoch_k:.1f}) < 20 — überverkauft")
        if direction is None:
            direction = "BUY"
    elif stoch_k > 80:
        score += _WEIGHT_STOCH
        reasons.append(f"Stochastic %K({stoch_k:.1f}) > 80 — überkauft")
        if direction is None:
            direction = "SELL"

    # MACD histogram — momentum confirmation aligned with the inferred direction.
    if direction == "BUY" and macd_hist > 0:
        score += _WEIGHT_MACD
        reasons.append(f"MACD-Histogramm ({macd_hist:.3f}) positiv — Momentum bestätigt BUY")
    elif direction == "SELL" and macd_hist < 0:
        score += _WEIGHT_MACD
        reasons.append(f"MACD-Histogramm ({macd_hist:.3f}) negativ — Momentum bestätigt SELL")

    # OBV trend — volume-flow confirmation aligned with the inferred direction.
    if direction == "BUY" and obv > obv_avg_20:
        score += _WEIGHT_OBV
        reasons.append("OBV über 20-Perioden-Ø — Kapitalzufluss bestätigt BUY")
    elif direction == "SELL" and obv < obv_avg_20:
        score += _WEIGHT_OBV
        reasons.append("OBV unter 20-Perioden-Ø — Kapitalabfluss bestätigt SELL")

    # Volume confirmation.
    if volume_avg_20 is not None and volume > volume_avg_20:
        score += _WEIGHT_VOLUME
        reasons.append(
            f"Volumen ({volume:,.0f}) über 20-Tage-Ø — Bestätigung"
        )

    if direction is None or score < MIN_SCORE_THRESHOLD:
        return None

    return Candidate(
        symbol="",
        score=round(score, 2),
        direction=direction,
        reasons=reasons,
        last_price=last_close,
        indicators={
            "rsi_14": rsi,
            "adx": adx,
            "di_plus": di_plus,
            "di_minus": di_minus,
            "stoch_k": stoch_k,
            "stoch_d": stoch_d,
            "macd_hist": macd_hist,
            "obv": obv,
            "obv_avg_20": obv_avg_20,
            "volume": volume,
            "volume_avg_20": volume_avg_20,
        },
    )


def _download_chunk(symbols):
    """Blocking yfinance batch download for one chunk of symbols."""
    import yfinance as yf

    return yf.download(
        symbols,
        period="6mo",
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        progress=False,
        threads=False,
    )


def _extract_symbol_frame(data, symbol, multi):
    """
    Pull one symbol's OHLCV sub-frame out of a ``yfinance.download()``
    result.

    With ``group_by="ticker"`` and more than one symbol the columns are a
    MultiIndex keyed by ticker; with a single symbol the frame is flat.
    Returns None on any failure or an empty frame.
    """
    try:
        frame = data[symbol] if multi else data
        if frame is None or frame.empty:
            return None
        return frame
    except Exception:
        return None


async def run_prefilter(symbols: list[str], top_n: Optional[int] = None) -> list[Candidate]:
    """
    Batch-fetch OHLCV for ``symbols`` and score each one with
    ``_score_symbol``, returning candidates sorted by score (desc). Optional
    ``top_n`` truncates the result. Network/parse errors on individual symbols
    are skipped, never raised — a broken symbol must not stall the scan.
    """
    if not symbols:
        return []

    candidates: list[Candidate] = []
    for start in range(0, len(symbols), CHUNK_SIZE):
        chunk = symbols[start : start + CHUNK_SIZE]
        multi = len(chunk) > 1
        try:
            data = await asyncio.to_thread(_download_chunk, chunk)
        except Exception:
            logger.debug("prefilter_chunk_download_failed", exc_info=True)
            continue

        for symbol in chunk:
            frame = _extract_symbol_frame(data, symbol, multi)
            if frame is None or frame.empty:
                continue
            cand = _score_symbol(frame)
            if cand is not None:
                cand.symbol = symbol
                candidates.append(cand)

    candidates.sort(key=lambda c: c.score, reverse=True)
    if top_n is not None:
        candidates = candidates[:top_n]
    return candidates
