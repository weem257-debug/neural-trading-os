"""
/api/analysis — Technical analysis endpoints.

Currently provides:
  GET /api/analysis/elliott/{ticker}   — Elliott Wave analysis
  GET /api/analysis/elliott/demo       — Demo analysis (no real data needed)
"""
import logging
from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import ElliottWaveAnalysis, ErrorResponse
from app.services.elliott.client import analyze_elliott_waves
from app.core.cache import async_cached

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["Analysis"])

VALID_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y"}


@async_cached(ttl_seconds=600)
async def _cached_elliott(ticker: str, period: str) -> dict:
    result = analyze_elliott_waves(ticker=ticker, period=period)
    # Don't cache empty results — let the next call retry
    if not result.get("candles"):
        raise ValueError("Empty analysis result — skip cache")
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
        raise HTTPException(status_code=500, detail="Analysis failed")


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
        raise HTTPException(status_code=422, detail="Invalid ticker symbol")
    if period not in VALID_PERIODS:
        raise HTTPException(status_code=422, detail=f"Invalid period. Choose from: {sorted(VALID_PERIODS)}")

    try:
        result = await _cached_elliott(ticker, period)
        return ElliottWaveAnalysis(**result)
    except Exception as e:
        logger.error("elliott_analysis_error ticker=%s: %s", ticker, e)
        raise HTTPException(status_code=500, detail="Analysis failed")
