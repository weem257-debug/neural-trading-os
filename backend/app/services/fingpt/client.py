"""
FinGPT Sentiment Service
------------------------
Sentiment pipeline for financial news:

  1. Fetch news headlines via yfinance (free, no API key required)
  2. Score each headline via Anthropic claude-haiku (if ANTHROPIC_API_KEY set)
  3. Keyword-based fallback if API key is absent or call fails
  4. Aggregate into a SentimentSummary

No crash on missing API key — the service always returns a result.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import uuid
from datetime import datetime, UTC
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional Anthropic import — graceful if not installed or key absent
# ---------------------------------------------------------------------------
try:
    import anthropic as _anthropic_lib
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False
    logger.warning("anthropic package not installed — keyword fallback only")

# ---------------------------------------------------------------------------
# Optional yfinance import — graceful if not installed
# ---------------------------------------------------------------------------
try:
    import yfinance as yf
    _YFINANCE_AVAILABLE = True
except ImportError:
    _YFINANCE_AVAILABLE = False
    logger.warning("yfinance not installed — stub news will be used")

from app.core.config import settings, anthropic_key_configured
from app.models.schemas import SentimentSummary, NewsItem, SentimentLabel


# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------
_anthropic_client: Optional["_anthropic_lib.AsyncAnthropic"] = None  # type: ignore[name-defined]

# Keywords for rule-based fallback sentiment
_POSITIVE_KEYWORDS = {
    "buy", "bullish", "surge", "soar", "beat", "strong", "upgrade",
    "rally", "gain", "profit", "growth", "record", "outperform",
    "revenue", "exceed", "positive", "rise", "boost", "raised",
}
_NEGATIVE_KEYWORDS = {
    "sell", "bearish", "crash", "plunge", "miss", "weak", "downgrade",
    "decline", "loss", "drop", "fall", "risk", "lawsuit", "debt",
    "warning", "cut", "layoff", "recall", "fraud", "investigation",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _has_api_key() -> bool:
    return anthropic_key_configured()


def _get_anthropic() -> "_anthropic_lib.AsyncAnthropic":  # type: ignore[name-defined]
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = _anthropic_lib.AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY
        )
    return _anthropic_client


def _ensure_fingpt_on_path() -> bool:
    repo_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../../../FinGPT")
    )
    if not os.path.isdir(repo_path):
        return False
    if repo_path not in sys.path:
        sys.path.insert(0, repo_path)
    return True


# ---------------------------------------------------------------------------
# News fetching via yfinance
# ---------------------------------------------------------------------------

def _fetch_yfinance_news(ticker: str) -> list[dict]:
    """Fetch recent news headlines for a ticker via yfinance (no API key needed)."""
    if not _YFINANCE_AVAILABLE:
        return []
    try:
        t = yf.Ticker(ticker)
        raw_news = t.news or []
        results: list[dict] = []
        for item in raw_news[:20]:
            content = item.get("content", {})
            # yfinance >= 0.2.x wraps content in a nested dict
            headline = (
                content.get("title")
                or item.get("title")
                or ""
            )
            provider = (
                content.get("provider", {}).get("displayName")
                or item.get("publisher")
                or "unknown"
            )
            link = (
                content.get("canonicalUrl", {}).get("url")
                or item.get("link")
                or None
            )
            pub_ts = item.get("providerPublishTime") or item.get("pubDate")
            if pub_ts and isinstance(pub_ts, (int, float)):
                published_at = datetime.fromtimestamp(pub_ts, tz=UTC).isoformat()
            else:
                published_at = datetime.now(UTC).isoformat()

            if headline:
                results.append({
                    "headline": headline,
                    "source": provider,
                    "url": link,
                    "published_at": published_at,
                })
        logger.info("yfinance returned %d news items for %s", len(results), ticker)
        return results
    except Exception as exc:
        logger.warning("yfinance news fetch failed for %s: %s", ticker, exc)
        return []


# ---------------------------------------------------------------------------
# Keyword-based sentiment (no API key required)
# ---------------------------------------------------------------------------

def _keyword_sentiment(headline: str) -> tuple[SentimentLabel, float]:
    """Rule-based sentiment from keyword matching. Returns (label, score)."""
    lower = headline.lower()
    pos_hits = sum(1 for kw in _POSITIVE_KEYWORDS if kw in lower)
    neg_hits = sum(1 for kw in _NEGATIVE_KEYWORDS if kw in lower)

    if pos_hits > neg_hits:
        score = min(0.3 + 0.1 * pos_hits, 1.0)
        return SentimentLabel.POSITIVE, round(score, 4)
    elif neg_hits > pos_hits:
        score = max(-0.3 - 0.1 * neg_hits, -1.0)
        return SentimentLabel.NEGATIVE, round(score, 4)
    else:
        return SentimentLabel.NEUTRAL, 0.0


def _keyword_fallback_summary(ticker: str, news_items: list[dict]) -> SentimentSummary:
    """Build a SentimentSummary using pure keyword-based scoring."""
    processed: list[NewsItem] = []
    for item in news_items:
        label, score = _keyword_sentiment(item.get("headline", ""))
        processed.append(NewsItem(
            id=str(uuid.uuid4()),
            headline=item.get("headline", ""),
            source=item.get("source", "unknown"),
            url=item.get("url"),
            published_at=datetime.fromisoformat(
                item.get("published_at", datetime.now(UTC).isoformat())
            ),
            tickers=[ticker],
            sentiment=label,
            sentiment_score=score,
        ))

    return _build_summary(ticker, processed)


# ---------------------------------------------------------------------------
# Anthropic claude-haiku sentiment
# ---------------------------------------------------------------------------

async def _anthropic_sentiment(ticker: str, news_items: list[dict]) -> SentimentSummary:
    """Use ANTHROPIC_MODEL_FAST (claude-haiku-4-5-20251001) for fast, precise sentiment scoring."""
    client = _get_anthropic()

    headlines = "\n".join(
        f"- {item.get('headline', '')}" for item in news_items[:20]
    )

    prompt = f"""You are a financial sentiment analyst. Analyze the following news headlines for {ticker}.

Headlines:
{headlines}

For each headline provide a JSON object with:
  "headline": str,
  "sentiment": "positive" | "negative" | "neutral",
  "score": float between -1.0 (very negative) and 1.0 (very positive)

Return a JSON array of these objects. Return ONLY valid JSON, no explanation."""

    try:
        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL_FAST,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = getattr(response.content[0], "text", "").strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        scored = json.loads(raw.strip())
    except Exception as exc:
        logger.warning("Anthropic sentiment call failed (%s) — using keyword fallback", exc)
        return _keyword_fallback_summary(ticker, news_items)

    processed: list[NewsItem] = []
    for original, result in zip(news_items, scored):
        label_str = result.get("sentiment", "neutral")
        try:
            label = SentimentLabel(label_str)
        except ValueError:
            label = SentimentLabel.NEUTRAL
        processed.append(NewsItem(
            id=str(uuid.uuid4()),
            headline=original.get("headline", ""),
            source=original.get("source", "unknown"),
            url=original.get("url"),
            published_at=datetime.fromisoformat(
                original.get("published_at", datetime.now(UTC).isoformat())
            ),
            tickers=[ticker],
            sentiment=label,
            sentiment_score=float(result.get("score", 0.0)),
        ))

    return _build_summary(ticker, processed)


# ---------------------------------------------------------------------------
# FinGPT (local model path — kept for future use)
# ---------------------------------------------------------------------------

async def _fingpt_sentiment(ticker: str, news_items: list[dict]) -> SentimentSummary:
    """Use FinGPT pipeline for sentiment (requires local model or API)."""
    from fingpt.FinGPT_Forecaster.base_prompt import make_prompt  # type: ignore
    raise NotImplementedError("FinGPT direct integration pending model download")


# ---------------------------------------------------------------------------
# Aggregation helper
# ---------------------------------------------------------------------------

def _build_summary(ticker: str, processed: list[NewsItem]) -> SentimentSummary:
    pos = sum(1 for n in processed if n.sentiment == SentimentLabel.POSITIVE)
    neg = sum(1 for n in processed if n.sentiment == SentimentLabel.NEGATIVE)
    neu = len(processed) - pos - neg
    avg_score = sum(n.sentiment_score for n in processed) / max(len(processed), 1)

    overall = (
        SentimentLabel.POSITIVE if avg_score > 0.1
        else SentimentLabel.NEGATIVE if avg_score < -0.1
        else SentimentLabel.NEUTRAL
    )

    return SentimentSummary(
        ticker=ticker.upper(),
        overall_sentiment=overall,
        overall_score=round(avg_score, 4),
        news_count=len(processed),
        positive_count=pos,
        negative_count=neg,
        neutral_count=neu,
        news_items=processed,
    )


# ---------------------------------------------------------------------------
# Mock summary for when no data is available at all
# ---------------------------------------------------------------------------

def _mock_summary(ticker: str) -> SentimentSummary:
    """Minimal neutral mock returned when no news and no API key are available."""
    mock_item = NewsItem(
        id=str(uuid.uuid4()),
        headline=f"No live news available for {ticker} — sentiment service running in mock mode",
        source="mock",
        url=None,
        published_at=datetime.now(UTC),
        tickers=[ticker],
        sentiment=SentimentLabel.NEUTRAL,
        sentiment_score=0.0,
    )
    return SentimentSummary(
        ticker=ticker.upper(),
        overall_sentiment=SentimentLabel.NEUTRAL,
        overall_score=0.0,
        news_count=1,
        positive_count=0,
        negative_count=0,
        neutral_count=1,
        news_items=[mock_item],
    )


# ---------------------------------------------------------------------------
# Stub news (testing only)
# ---------------------------------------------------------------------------

def _stub_news(ticker: str) -> list[dict]:
    """Return stub news items for testing when no news fetcher is available."""
    return [
        {
            "headline": f"{ticker} reports strong quarterly earnings, beats estimates",
            "source": "Reuters",
            "url": None,
            "published_at": datetime.now(UTC).isoformat(),
        },
        {
            "headline": f"Analysts raise price target for {ticker} after product launch",
            "source": "Bloomberg",
            "url": None,
            "published_at": datetime.now(UTC).isoformat(),
        },
        {
            "headline": f"Market volatility weighs on {ticker} amid macro uncertainty",
            "source": "WSJ",
            "url": None,
            "published_at": datetime.now(UTC).isoformat(),
        },
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def analyze_sentiment(
    ticker: str,
    news_items: Optional[list[dict]] = None,
) -> SentimentSummary:
    """
    Analyze sentiment for a ticker.

    Pipeline (in priority order):
      1. yfinance news fetch (free, no key) — unless news_items provided externally
      2. Anthropic claude-haiku-4-5 scoring — if ANTHROPIC_API_KEY is present
      3. Keyword-based fallback — always available, never crashes
      4. Mock neutral summary — if no news at all could be fetched

    Parameters
    ----------
    ticker     : Stock/crypto symbol (e.g. "AAPL", "BTC-USD")
    news_items : Pre-fetched news dicts [{headline, source, url, published_at}]
                 If None, yfinance is used; stub news as last resort.

    Returns
    -------
    SentimentSummary — aggregated sentiment, never raises.
    """
    # Step 1: Acquire news
    if news_items is None:
        # yfinance news fetch is blocking network I/O — run it off the event
        # loop so it can't stall concurrent requests (P1 audit finding).
        news_items = await asyncio.to_thread(_fetch_yfinance_news, ticker)
        if not news_items:
            logger.info("No yfinance news for %s — using stub data", ticker)
            news_items = _stub_news(ticker)

    if not news_items:
        logger.warning("No news available for %s — returning mock summary", ticker)
        return _mock_summary(ticker)

    # Step 2: Try FinGPT (local model, rarely available)
    if _ensure_fingpt_on_path():
        try:
            return await _fingpt_sentiment(ticker, news_items)
        except NotImplementedError:
            pass  # expected — local model not downloaded
        except Exception as exc:
            logger.warning("FinGPT failed (%s), continuing to next fallback", exc)

    # Step 3: Anthropic claude-haiku if API key present
    if _ANTHROPIC_AVAILABLE and _has_api_key():
        logger.info("Using Anthropic claude-haiku for %s sentiment", ticker)
        return await _anthropic_sentiment(ticker, news_items)

    # Step 4: Keyword fallback — no API key or package needed
    logger.info("No ANTHROPIC_API_KEY — using keyword-based sentiment for %s", ticker)
    return _keyword_fallback_summary(ticker, news_items)
