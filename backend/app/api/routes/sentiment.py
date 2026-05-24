"""
/api/sentiment — News sentiment analysis via FinGPT / Anthropic fallback.

Route order: specific paths (/) before parametrised (/{ticker}) to avoid
FastAPI matching the query-param route as a ticker.
"""
from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import SentimentSummary, ErrorResponse
from app.services.fingpt.client import analyze_sentiment
from app.core.cache import async_cached
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sentiment", tags=["Sentiment"])


@router.get(
    "/",
    response_model=list[SentimentSummary],
    summary="Sentiment for multiple tickers",
)
async def get_multi_sentiment(
    tickers: str = Query(description="Comma-separated tickers, e.g. AAPL,TSLA,BTC"),
) -> list[SentimentSummary]:
    """
    Batch sentiment analysis for multiple tickers.
    Runs in parallel via asyncio.gather.
    """
    import asyncio
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=422, detail="No valid tickers provided")
    if len(ticker_list) > 10:
        raise HTTPException(status_code=422, detail="Max 10 tickers per request")

    try:
        raw = await asyncio.gather(
            *[_cached_sentiment(t) for t in ticker_list],
            return_exceptions=True,
        )
        return [r for r in raw if isinstance(r, SentimentSummary)]
    except Exception as e:
        raise HTTPException(status_code=500, detail="Sentiment analysis failed")


@async_cached(ttl_seconds=300)
async def _cached_sentiment(ticker: str) -> SentimentSummary:
    """Cached sentiment analysis per ticker — TTL 5 min."""
    return await analyze_sentiment(ticker=ticker)


@router.get(
    "/{ticker}",
    response_model=SentimentSummary,
    summary="Get news sentiment for a ticker",
    responses={500: {"model": ErrorResponse}},
)
async def get_sentiment(
    ticker: str,
    limit: int = Query(default=20, ge=1, le=100, description="Max news items"),
) -> SentimentSummary:
    """
    Analyze recent news sentiment for the given ticker.

    Pipeline:
    1. Fetch latest news (wire up Finnhub/Polygon/Alpha Vantage)
    2. Score each headline with FinGPT or Claude Haiku
    3. Return aggregated sentiment + individual news items

    Result is cached per ticker for 5 minutes (TTL 300s).
    """
    try:
        return await _cached_sentiment(ticker.upper())
    except Exception as e:
        logger.error("Sentiment analysis error for %s: %s", ticker, e)
        raise HTTPException(status_code=500, detail="Sentiment analysis failed")
