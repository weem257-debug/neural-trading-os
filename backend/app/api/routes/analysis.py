"""
/api/analysis — Technical analysis endpoints.

Currently provides:
  GET /api/analysis/elliott/{ticker}   — Elliott Wave analysis
  GET /api/analysis/elliott/demo       — Demo analysis (no real data needed)
"""
import asyncio
import logging
import re
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select

from app.models.schemas import (
    ElliottWaveAnalysis, ErrorResponse,
    LiveMarketAnalysis, LiveAnalysisPrice, LiveAnalysisIndicators,
    LiveAnalysisMACD, LiveAnalysisBollinger, LiveAnalysisSignal,
    WatchlistResponse, WatchlistUpdateRequest,
    MarketSymbol, MarketCategory, MarketsResponse,
)
from app.services.elliott.client import analyze_elliott_waves
from app.core.cache import cache_get, cache_set, cached as _cached
from app.core.disclaimer import mar_disclosure
from app.api.auth import get_current_user, UserInfo
from app.db.database import get_session
from app.db.models import AnalysisWatchlist

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["Analysis"])

VALID_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y"}


async def _cached_elliott(ticker: str, period: str) -> dict:
    key = f"elliott:{ticker}:{period}"
    cached = cache_get(key)
    if cached is not None:
        return cached
    result = analyze_elliott_waves(ticker=ticker, period=period)
    # Only cache non-empty analyses. An empty result (no market data — e.g.
    # offline/CI, or yfinance throttling) is still a valid-shaped payload, so
    # return it as a 200 rather than a 500; just don't cache it, so the next
    # call retries once data is available.
    if result.get("candles"):
        cache_set(key, result, ttl_seconds=600)
    return result


@router.get(
    "/elliott/demo",
    response_model=ElliottWaveAnalysis,
    summary="Elliott Wave demo — uses SPY, no API key required",
)
async def get_elliott_demo() -> ElliottWaveAnalysis:
    """
    Returns an Elliott Wave analysis for SPY (S&P 500 ETF) over 6 months.
    Useful for testing the UI without a custom ticker.
    """
    try:
        result = await _cached_elliott("SPY", "6mo")
        return ElliottWaveAnalysis(**result)
    except Exception as e:
        logger.error("elliott_demo_error: %s", e)
        raise HTTPException(status_code=500, detail="Analyse fehlgeschlagen")


@router.get(
    "/elliott/{ticker}",
    response_model=ElliottWaveAnalysis,
    summary="Elliott Wave analysis for a ticker",
    responses={
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def get_elliott_analysis(
    ticker: str,
    period: str = Query(
        default="6mo",
        description=f"Data period. Valid: {sorted(VALID_PERIODS)}",
    ),
) -> ElliottWaveAnalysis:
    """
    Compute Elliott Wave analysis for the given ticker.

    The engine:
    1. Downloads OHLCV via yfinance (no API key required)
    2. Detects ZigZag pivot points with a 3% minimum swing filter
    3. Labels wave sequences (impulse 1-2-3-4-5 or corrective A-B-C)
    4. Validates with Fibonacci ratios (Wave 2: 38.2–78.6% of W1, Wave 3 >= 161.8% of W1, etc.)
    5. Returns wave points, Fibonacci levels, current position + price targets

    Result is cached per ticker+period for 5 minutes.
    """
    ticker = ticker.upper().strip()
    if not ticker or len(ticker) > 10:
        raise HTTPException(status_code=422, detail="Ungültiges Ticker-Symbol")
    if period not in VALID_PERIODS:
        raise HTTPException(status_code=422, detail=f"Ungültiger Zeitraum. Erlaubt: {sorted(VALID_PERIODS)}")

    try:
        result = await _cached_elliott(ticker, period)
        return ElliottWaveAnalysis(**result)
    except Exception as e:
        logger.error("elliott_analysis_error ticker=%s: %s", ticker, e)
        raise HTTPException(status_code=500, detail="Analyse fehlgeschlagen")


# ---------------------------------------------------------------------------
# Live Market Analysis — GET /api/analysis/live/{symbol}
# ---------------------------------------------------------------------------

# Loose symbol format guard — rejects obviously malformed input before ever
# calling yfinance (equities, indices, FX pairs and crypto pairs like
# "BTC-USD" all fit this shape). Leading "^" covers index symbols (^GDAXI).
_SYMBOL_RE = re.compile(r"^[\^A-Z0-9][A-Z0-9.\-=^]{0,14}$")


class _MarketDataError(Exception):
    """Raised when the upstream market-data provider itself fails (network,
    parse error, etc.) — mapped to HTTP 502. Distinct from "no data returned
    for this symbol" (empty history), which is treated as an unknown symbol
    (HTTP 404) since that's how yfinance signals an invalid ticker in
    practice."""


def _fetch_live_history(symbol: str):
    """
    Fetch ~1y of daily OHLCV history for `symbol` via yfinance.

    NOTE: the audit spec's example period ("6 Monate") is not long enough to
    compute a 200-day SMA (needs >= 200 trading days ≈ 10 months); we fetch
    1 year instead so sma_200/atr_14/etc. are populated whenever the
    instrument has enough trading history, while sma_20/sma_50/rsi_14/macd/
    bollinger only need a fraction of that and degrade gracefully (None) for
    very young listings.

    Returns None when the symbol yields no data (→ 404 symbol_not_found).
    Raises _MarketDataError on a hard provider failure (→ 502).
    """
    try:
        import yfinance as yf
        hist = yf.Ticker(symbol).history(period="1y", interval="1d")
    except Exception as exc:  # network / parsing failure — provider is down
        raise _MarketDataError(str(exc)) from exc
    if hist is None or hist.empty:
        return None
    return hist


def _last_valid(series) -> Optional[float]:
    """Return the last non-NaN value of a pandas Series as float, or None."""
    import pandas as pd
    if series is None or len(series) == 0:
        return None
    value = series.iloc[-1]
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    return round(float(value), 4)


def _compute_indicators(hist) -> dict:
    """Compute RSI(14), MACD(12,26,9), Bollinger(20,2), SMA(20/50/200),
    ATR(14) and 20-period average volume from an OHLCV DataFrame."""
    import numpy as np
    import pandas as pd

    close = hist["Close"].astype(float)
    high = hist["High"].astype(float)
    low = hist["Low"].astype(float)
    volume = hist["Volume"].astype(float)

    # RSI(14) — simple rolling-mean gain/loss (Wilder-style approximation)
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi_series = 100 - (100 / (1 + rs))
    # avg_loss == 0 (all gains) → RSI should read 100, not NaN
    rsi_series = rsi_series.where(avg_loss != 0, 100.0)
    rsi_14 = _last_valid(rsi_series)

    # MACD(12, 26, 9)
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    hist_line = macd_line - signal_line
    macd = LiveAnalysisMACD(
        macd=_last_valid(macd_line) or 0.0,
        signal=_last_valid(signal_line) or 0.0,
        hist=_last_valid(hist_line) or 0.0,
    )

    # Bollinger Bands(20, 2)
    sma20_series = close.rolling(20).mean()
    std20_series = close.rolling(20).std()
    upper_series = sma20_series + 2 * std20_series
    lower_series = sma20_series - 2 * std20_series
    last_close = float(close.iloc[-1])
    upper_v = _last_valid(upper_series)
    lower_v = _last_valid(lower_series)
    middle_v = _last_valid(sma20_series)
    if upper_v is not None and lower_v is not None and upper_v != lower_v:
        pct_b = round((last_close - lower_v) / (upper_v - lower_v), 4)
    else:
        pct_b = 0.5
    bollinger = LiveAnalysisBollinger(
        upper=upper_v if upper_v is not None else last_close,
        middle=middle_v if middle_v is not None else last_close,
        lower=lower_v if lower_v is not None else last_close,
        pct_b=pct_b,
    )

    sma_20 = _last_valid(close.rolling(20).mean())
    sma_50 = _last_valid(close.rolling(50).mean())
    sma_200 = _last_valid(close.rolling(200).mean())

    # ATR(14) — simple rolling mean of True Range
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    atr_14 = _last_valid(tr.rolling(14).mean())

    volume_avg_20 = _last_valid(volume.rolling(20).mean())

    return {
        "rsi_14": rsi_14,
        "macd": macd,
        "bollinger": bollinger,
        "sma_20": sma_20,
        "sma_50": sma_50,
        "sma_200": sma_200,
        "atr_14": atr_14,
        "volume_avg_20": volume_avg_20,
        "_last_close": last_close,
    }


def _classify_regime(price: float, sma_50: Optional[float], sma_200: Optional[float], atr_14: Optional[float]) -> str:
    """Simple, explainable regime heuristic."""
    if atr_14 is not None and price > 0 and (atr_14 / price) > 0.03:
        return "volatile"
    if sma_50 is not None and sma_200 is not None:
        if price > sma_50 > sma_200:
            return "trending_up"
        if price < sma_50 < sma_200:
            return "trending_down"
    return "ranging"


def _build_signal(
    price: float,
    rsi_14: Optional[float],
    macd_hist: float,
    sma_50: Optional[float],
    sma_200: Optional[float],
    pct_b: float,
    volume: float,
    volume_avg_20: Optional[float],
) -> LiveAnalysisSignal:
    """Weighted, explainable bull/bear scoring heuristic — reasons in German."""
    score = 0
    reasons: list[str] = []

    if rsi_14 is not None:
        if rsi_14 < 30:
            score += 20
            reasons.append(f"RSI({rsi_14:.1f}) im überverkauften Bereich (<30) — mögliches Kaufsignal")
        elif rsi_14 > 70:
            score -= 20
            reasons.append(f"RSI({rsi_14:.1f}) im überkauften Bereich (>70) — mögliches Verkaufssignal")

    if macd_hist > 0:
        score += 15
        reasons.append("MACD-Histogramm positiv — bullisches Momentum")
    elif macd_hist < 0:
        score -= 15
        reasons.append("MACD-Histogramm negativ — bärisches Momentum")

    if sma_50 is not None and sma_200 is not None:
        if price > sma_50 > sma_200:
            score += 20
            reasons.append("Preis über SMA50 über SMA200 — intakter Aufwärtstrend")
        elif price < sma_50 < sma_200:
            score -= 20
            reasons.append("Preis unter SMA50 unter SMA200 — intakter Abwärtstrend")

    if pct_b > 1.0:
        score -= 10
        reasons.append("Preis über oberem Bollinger-Band — überkauft")
    elif pct_b < 0.0:
        score += 10
        reasons.append("Preis unter unterem Bollinger-Band — überverkauft")

    if volume_avg_20 and volume_avg_20 > 0 and volume > 1.5 * volume_avg_20:
        if score > 0:
            score += 10
            reasons.append("Überdurchschnittliches Volumen bestätigt die Aufwärtsbewegung")
        elif score < 0:
            score -= 10
            reasons.append("Überdurchschnittliches Volumen bestätigt die Abwärtsbewegung")
        else:
            reasons.append("Erhöhtes Volumen ohne klare Richtung")

    score = max(-100, min(100, score))
    if score > 15:
        bias = "bullish"
    elif score < -15:
        bias = "bearish"
    else:
        bias = "neutral"

    if not reasons:
        reasons.append("Keine ausgeprägten Signale erkennbar — neutrale Marktlage")

    return LiveAnalysisSignal(bias=bias, score=score, reasons=reasons)


@router.get(
    "/live/{symbol}",
    response_model=LiveMarketAnalysis,
    summary="Live technical analysis for a symbol (RSI, MACD, Bollinger, regime, signal)",
    responses={
        404: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
async def get_live_analysis(
    symbol: str,
    _: UserInfo = Depends(get_current_user),
) -> LiveMarketAnalysis:
    """
    Compute a live technical snapshot for `symbol`: current price/volume,
    RSI(14), MACD(12,26,9), Bollinger Bands(20,2), SMA(20/50/200), ATR(14),
    20-period average volume, a simple regime classification, and a weighted
    bull/bear signal with German-language reasons.

    Backed by yfinance (1y daily history), cached ~45s per symbol to bound
    upstream load. Every response includes the standard MAR/AI-Act
    `regulatory_notice` — this is informational technical analysis, not
    investment advice.
    """
    symbol = symbol.upper().strip()
    if not symbol or not _SYMBOL_RE.match(symbol):
        raise HTTPException(status_code=404, detail="symbol_not_found")

    loop = asyncio.get_event_loop()
    try:
        hist = await loop.run_in_executor(None, _fetch_cached_live_history, symbol)
    except _MarketDataError as exc:
        logger.warning("live_analysis_market_data_error symbol=%s: %s", symbol, exc)
        raise HTTPException(status_code=502, detail="market_data_unavailable")

    if hist is None or hist.empty:
        raise HTTPException(status_code=404, detail="symbol_not_found")

    try:
        ind = _compute_indicators(hist)
        last_row = hist.iloc[-1]
        last_close = ind["_last_close"]
        prev_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else last_close
        change = round(last_close - prev_close, 4)
        change_pct = round((change / prev_close) * 100, 4) if prev_close else 0.0

        price = LiveAnalysisPrice(
            last=round(last_close, 4),
            change=change,
            change_pct=change_pct,
            day_high=round(float(last_row["High"]), 4),
            day_low=round(float(last_row["Low"]), 4),
            volume=float(last_row["Volume"]),
        )

        indicators = LiveAnalysisIndicators(
            rsi_14=ind["rsi_14"],
            macd=ind["macd"],
            bollinger=ind["bollinger"],
            sma_20=ind["sma_20"],
            sma_50=ind["sma_50"],
            sma_200=ind["sma_200"],
            atr_14=ind["atr_14"],
            volume_avg_20=ind["volume_avg_20"],
        )

        regime = _classify_regime(last_close, ind["sma_50"], ind["sma_200"], ind["atr_14"])
        signal = _build_signal(
            price=last_close,
            rsi_14=ind["rsi_14"],
            macd_hist=ind["macd"].hist,
            sma_50=ind["sma_50"],
            sma_200=ind["sma_200"],
            pct_b=ind["bollinger"].pct_b,
            volume=price.volume,
            volume_avg_20=ind["volume_avg_20"],
        )

        return LiveMarketAnalysis(
            symbol=symbol,
            as_of=datetime.now(UTC).isoformat(),
            price=price,
            indicators=indicators,
            regime=regime,
            signal=signal,
            regulatory_notice=mar_disclosure(ai_generated=False),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("live_analysis_error symbol=%s: %s", symbol, exc)
        raise HTTPException(status_code=502, detail="market_data_unavailable")


@_cached(ttl_seconds=45)
def _fetch_cached_live_history(symbol: str):
    """TTL-cached wrapper around _fetch_live_history (bounds yfinance load)."""
    return _fetch_live_history(symbol)


# ---------------------------------------------------------------------------
# Market presets — GET /api/analysis/markets
# ---------------------------------------------------------------------------

# Curated market categories for the analysis UI. Every symbol must be valid
# for yfinance AND pass _SYMBOL_RE (leading "^" = index, "=X" = FX, "=F" =
# futures, ".DE" = XETRA listing).
_MARKET_PRESETS: list[MarketCategory] = [
    MarketCategory(id="us_stocks", label="US-Aktien", symbols=[
        MarketSymbol(symbol="AAPL", name="Apple"),
        MarketSymbol(symbol="MSFT", name="Microsoft"),
        MarketSymbol(symbol="NVDA", name="NVIDIA"),
        MarketSymbol(symbol="AMZN", name="Amazon"),
        MarketSymbol(symbol="GOOGL", name="Alphabet"),
        MarketSymbol(symbol="META", name="Meta Platforms"),
        MarketSymbol(symbol="TSLA", name="Tesla"),
        MarketSymbol(symbol="BRK-B", name="Berkshire Hathaway"),
        MarketSymbol(symbol="JPM", name="JPMorgan Chase"),
        MarketSymbol(symbol="V", name="Visa"),
    ]),
    MarketCategory(id="dax", label="DAX (Deutschland)", symbols=[
        MarketSymbol(symbol="SAP.DE", name="SAP"),
        MarketSymbol(symbol="SIE.DE", name="Siemens"),
        MarketSymbol(symbol="ALV.DE", name="Allianz"),
        MarketSymbol(symbol="DTE.DE", name="Deutsche Telekom"),
        MarketSymbol(symbol="AIR.DE", name="Airbus"),
        MarketSymbol(symbol="BAS.DE", name="BASF"),
        MarketSymbol(symbol="BMW.DE", name="BMW"),
        MarketSymbol(symbol="MBG.DE", name="Mercedes-Benz Group"),
        MarketSymbol(symbol="VOW3.DE", name="Volkswagen Vz."),
        MarketSymbol(symbol="ADS.DE", name="Adidas"),
    ]),
    MarketCategory(id="indices", label="Indizes", symbols=[
        MarketSymbol(symbol="^GSPC", name="S&P 500"),
        MarketSymbol(symbol="^NDX", name="Nasdaq 100"),
        MarketSymbol(symbol="^DJI", name="Dow Jones"),
        MarketSymbol(symbol="^GDAXI", name="DAX 40"),
        MarketSymbol(symbol="^STOXX50E", name="EURO STOXX 50"),
        MarketSymbol(symbol="^N225", name="Nikkei 225"),
    ]),
    MarketCategory(id="crypto", label="Krypto", symbols=[
        MarketSymbol(symbol="BTC-USD", name="Bitcoin"),
        MarketSymbol(symbol="ETH-USD", name="Ethereum"),
        MarketSymbol(symbol="SOL-USD", name="Solana"),
        MarketSymbol(symbol="XRP-USD", name="XRP"),
        MarketSymbol(symbol="BNB-USD", name="BNB"),
        MarketSymbol(symbol="ADA-USD", name="Cardano"),
        MarketSymbol(symbol="DOGE-USD", name="Dogecoin"),
    ]),
    MarketCategory(id="forex", label="Forex", symbols=[
        MarketSymbol(symbol="EURUSD=X", name="EUR/USD"),
        MarketSymbol(symbol="GBPUSD=X", name="GBP/USD"),
        MarketSymbol(symbol="USDJPY=X", name="USD/JPY"),
        MarketSymbol(symbol="USDCHF=X", name="USD/CHF"),
        MarketSymbol(symbol="AUDUSD=X", name="AUD/USD"),
    ]),
    MarketCategory(id="commodities", label="Rohstoffe", symbols=[
        MarketSymbol(symbol="GC=F", name="Gold"),
        MarketSymbol(symbol="SI=F", name="Silber"),
        MarketSymbol(symbol="CL=F", name="WTI Rohöl"),
        MarketSymbol(symbol="NG=F", name="Erdgas"),
        MarketSymbol(symbol="HG=F", name="Kupfer"),
    ]),
]


@router.get(
    "/markets",
    response_model=MarketsResponse,
    summary="Curated market categories with selectable symbols for analysis",
)
async def get_markets(
    _: UserInfo = Depends(get_current_user),
) -> MarketsResponse:
    """
    Returns the curated market categories (US stocks, DAX, indices, crypto,
    forex, commodities) with their preset symbols. Static server-side list —
    every symbol is analyzable via GET /api/analysis/live/{symbol} and
    addable to the user's watchlist.
    """
    return MarketsResponse(markets=_MARKET_PRESETS)


# ---------------------------------------------------------------------------
# Watchlist — GET/PUT /api/analysis/watchlist (per-user, owner_username-isolated)
# ---------------------------------------------------------------------------

_MAX_WATCHLIST_SYMBOLS = 50


@router.get(
    "/watchlist",
    response_model=WatchlistResponse,
    summary="Get the current user's analysis watchlist",
)
async def get_watchlist(
    current_user: UserInfo = Depends(get_current_user),
) -> WatchlistResponse:
    async with get_session() as session:
        result = await session.execute(
            select(AnalysisWatchlist)
            .where(AnalysisWatchlist.owner_username == current_user.username)
            .order_by(AnalysisWatchlist.id.asc())
        )
        rows = result.scalars().all()
    return WatchlistResponse(symbols=[r.symbol for r in rows])


@router.put(
    "/watchlist",
    response_model=WatchlistResponse,
    summary="Replace the current user's analysis watchlist",
    responses={422: {"model": ErrorResponse}},
)
async def put_watchlist(
    body: WatchlistUpdateRequest,
    current_user: UserInfo = Depends(get_current_user),
) -> WatchlistResponse:
    """
    Replaces the entire watchlist for the authenticated user.
    Symbols are trimmed + uppercased; duplicates removed (order preserved);
    max 50 symbols.
    """
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in body.symbols:
        sym = (raw or "").strip().upper()
        if not sym:
            continue
        if not _SYMBOL_RE.match(sym):
            raise HTTPException(status_code=422, detail=f"Ungültiges Symbol: {raw!r}")
        if sym not in seen:
            seen.add(sym)
            cleaned.append(sym)

    if len(cleaned) > _MAX_WATCHLIST_SYMBOLS:
        raise HTTPException(
            status_code=422,
            detail=f"Maximal {_MAX_WATCHLIST_SYMBOLS} Symbole erlaubt (erhalten: {len(cleaned)})",
        )

    async with get_session() as session:
        await session.execute(
            delete(AnalysisWatchlist).where(AnalysisWatchlist.owner_username == current_user.username)
        )
        for sym in cleaned:
            session.add(AnalysisWatchlist(owner_username=current_user.username, symbol=sym))
        await session.commit()

    return WatchlistResponse(symbols=cleaned)
