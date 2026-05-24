"""
RAG Retriever — Insight Context for Signal Generation
=======================================================
Retrieves the most relevant trading insights from the knowledge base
(YoutubeInsight + TradeLearning) for a given ticker/query.

Uses BM25 keyword search (rank_bm25). Falls back gracefully to recency-based
retrieval if rank_bm25 is not installed.

The returned string is injected directly into Claude signal generation prompts.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def get_relevant_context(
    query: str,
    ticker: str,
    top_n: int = 5,
) -> str:
    """
    Retrieve top-N relevant insights and learnings for injection into a signal prompt.

    Returns an empty string if no insights exist yet (zero-cost on first run).
    """
    from sqlalchemy import select
    from app.db.database import get_session
    from app.db.models import YoutubeInsight, TradeLearning

    insights_text: list[str] = []
    learnings_text: list[str] = []

    async with get_session() as session:
        # Fetch recent YouTube insights
        yi_result = await session.execute(
            select(YoutubeInsight)
            .order_by(YoutubeInsight.created_at.desc())
            .limit(50)
        )
        yt_insights = yi_result.scalars().all()

        # Fetch trade learnings for this ticker first, then general
        tl_result = await session.execute(
            select(TradeLearning)
            .order_by(TradeLearning.last_updated.desc())
            .limit(50)
        )
        trade_learnings = tl_result.scalars().all()

    if not yt_insights and not trade_learnings:
        return ""

    # ---------------------------------------------------------------------------
    # BM25 retrieval over YouTube insights
    # ---------------------------------------------------------------------------
    if yt_insights:
        corpus = [f"{yi.strategy or ''} {yi.market_condition or ''} {yi.insight_text}" for yi in yt_insights]
        query_tokens = f"{ticker} {query}".lower().split()

        top_yt = _bm25_top_n(corpus, query_tokens, yt_insights, n=top_n)
        for yi in top_yt:
            insights_text.append(
                f"📹 [{yi.channel}] {yi.video_title[:60]}\n"
                f"Strategy: {yi.strategy} | Timeframe: {yi.timeframe} | Condition: {yi.market_condition}\n"
                f"{yi.insight_text[:400]}"
            )

    # ---------------------------------------------------------------------------
    # Trade learnings: ticker-specific first, then general
    # ---------------------------------------------------------------------------
    ticker_learnings = [tl for tl in trade_learnings if tl.ticker.upper() == ticker.upper()]
    general_learnings = [tl for tl in trade_learnings if tl.ticker.upper() != ticker.upper()]

    for tl in (ticker_learnings[:3] + general_learnings[:2]):
        win_info = f" (Win rate: {tl.win_rate:.0%}, n={tl.sample_count})" if tl.win_rate else ""
        learnings_text.append(
            f"📊 {tl.ticker} {tl.direction}{win_info}\n{tl.learning_text[:300]}"
        )

    # ---------------------------------------------------------------------------
    # Compose context block
    # ---------------------------------------------------------------------------
    if not insights_text and not learnings_text:
        return ""

    sections: list[str] = []

    if learnings_text:
        sections.append(
            "## Historical Trade Learnings\n"
            + "\n\n".join(learnings_text[:3])
        )

    if insights_text:
        sections.append(
            "## Trading Knowledge (from YouTube analysis)\n"
            + "\n\n".join(insights_text[:3])
        )

    return "\n\n".join(sections)


def _bm25_top_n(corpus: list[str], query_tokens: list[str], items: list, n: int) -> list:
    """BM25 ranking with graceful fallback."""
    if not corpus:
        return items[:n]
    try:
        from rank_bm25 import BM25Okapi
        tokenized = [doc.lower().split() for doc in corpus]
        bm25 = BM25Okapi(tokenized)
        scores = bm25.get_scores(query_tokens)
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        return [items[i] for i in ranked[:n]]
    except ImportError:
        # Fallback: recency order (most recent first)
        return items[:n]
    except Exception:
        return items[:n]
