"""
Trade Outcome Learner
======================
Analyzes historical trade performance (SignalPerformance table) and generates
structured learnings: "BUY NVDA after earnings with >80% confidence had 73% win rate".

Two modes:
  1. Batch weekly review: groups all signals by (ticker, direction, confidence_bucket)
  2. Post-trade hook: called after a single new SignalPerformance row is written

Claude Haiku phrases the pattern naturally. Results are stored in TradeLearning.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, UTC
from typing import Optional

logger = logging.getLogger(__name__)

_REVIEW_PROMPT = """You are a trading performance analyst. Analyze this group of past trading signals and their outcomes.

Pattern analyzed:
- Ticker: {ticker}
- Direction: {direction}
- Confidence bucket: {conf_bucket}
- Sample count: {n}
- Win rate: {win_rate:.1%}
- Average return: {avg_return:+.2f}%
- Best return: {best_return:+.2f}%
- Worst return: {worst_return:+.2f}%

Write ONE concise, actionable learning (2-3 sentences max) that a trader can use.
Focus on: when this setup works, when it doesn't, key risk considerations.

Examples of good learnings:
- "BUY signals on NVDA with confidence >80% show 73% win rate (n=11) with avg +4.2% return. Performance degrades in high-VIX environments. Best results seen in momentum-driven markets."
- "SELL signals on BTC-USD have been premature 67% of the time — price tends to recover within 3 days. Consider tighter stops."

Write the learning now (one short paragraph, no headers):"""


async def _phrase_with_claude(ticker: str, direction: str, conf_bucket: str, stats: dict) -> str:
    """Use Claude Haiku to phrase the pattern as natural language."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        # Fallback: template-based phrasing
        win_rate = stats["win_rate"]
        n = stats["n"]
        avg = stats["avg_return"]
        return (
            f"{direction} signals on {ticker} (confidence {conf_bucket}) show "
            f"{win_rate:.0%} win rate over {n} samples, avg return {avg:+.2f}%. "
            f"{'Consider as high-confidence setup.' if win_rate >= 0.6 else 'Use caution — mixed results.'}"
        )

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": _REVIEW_PROMPT.format(
                    ticker=ticker,
                    direction=direction,
                    conf_bucket=conf_bucket,
                    n=stats["n"],
                    win_rate=stats["win_rate"],
                    avg_return=stats["avg_return"],
                    best_return=stats["best_return"],
                    worst_return=stats["worst_return"],
                ),
            }],
        )
        return msg.content[0].text.strip()[:500]
    except Exception as e:
        logger.error("Claude trade review failed: %s", e)
        return f"{direction} {ticker}: {stats['win_rate']:.0%} win rate, avg {stats['avg_return']:+.2f}% ({stats['n']} samples)"


def _confidence_bucket(conf: float) -> str:
    if conf >= 0.8:
        return "≥80%"
    elif conf >= 0.6:
        return "60-80%"
    elif conf >= 0.4:
        return "40-60%"
    else:
        return "<40%"


async def run_weekly_review() -> dict:
    """
    Query all SignalPerformance records, group by (ticker, direction, conf_bucket),
    generate learnings for groups with n >= 3.
    """
    from sqlalchemy import select, func
    from app.db.database import get_session
    from app.db.models import SignalPerformance, SignalRecord, TradeLearning

    logger.info("Starting weekly trade review")

    async with get_session() as session:
        # Join SignalPerformance with SignalRecord to get confidence
        result = await session.execute(
            select(
                SignalPerformance.ticker,
                SignalPerformance.direction,
                SignalRecord.confidence,
                SignalPerformance.return_pct,
                SignalRecord.user_id,
            ).join(
                SignalRecord, SignalRecord.id == SignalPerformance.signal_id, isouter=True
            )
        )
        rows = result.all()

    if not rows:
        return {"learnings_created": 0, "patterns_analyzed": 0}

    # Group by (ticker, direction, conf_bucket)
    groups: dict = {}
    owners: dict = {}
    for ticker, direction, confidence, return_pct, user_id in rows:
        conf = confidence or 0.5
        bucket = _confidence_bucket(conf)
        key = (ticker, direction, bucket)
        if key not in groups:
            groups[key] = []
        groups[key].append(return_pct)
        # Remember the owner for this (ticker, direction) so the learning stays
        # tenant-scoped and the RAG retriever / API can filter correctly.
        owners.setdefault((ticker, direction), user_id)

    learnings_created = 0

    for (ticker, direction, bucket), returns in groups.items():
        if len(returns) < 3:
            continue  # Need at least 3 data points

        wins = [r for r in returns if r > 0]
        win_rate = len(wins) / len(returns)
        avg_return = sum(returns) / len(returns)
        stats = {
            "n": len(returns),
            "win_rate": win_rate,
            "avg_return": avg_return * 100,
            "best_return": max(returns) * 100,
            "worst_return": min(returns) * 100,
        }

        # Generate learning text
        learning_text = await _phrase_with_claude(ticker, direction, bucket, stats)

        conditions = {
            "ticker": ticker,
            "direction": direction,
            "confidence_bucket": bucket,
            "n": len(returns),
            "win_rate": round(win_rate, 3),
            "avg_return_pct": round(avg_return * 100, 2),
        }

        # Upsert: update if same (ticker, direction) exists, else create
        async with get_session() as session:
            existing = await session.execute(
                select(TradeLearning).where(
                    TradeLearning.ticker == ticker,
                    TradeLearning.direction == direction,
                )
            )
            record = existing.scalar_one_or_none()

            owner = owners.get((ticker, direction))
            if record:
                record.learning_text = learning_text
                record.conditions_json = json.dumps(conditions)
                record.win_rate = win_rate
                record.sample_count = len(returns)
                record.avg_return_pct = avg_return * 100
                record.last_updated = datetime.now(UTC)
                if owner and not record.owner_username:
                    record.owner_username = owner
            else:
                record = TradeLearning(
                    owner_username=owner,
                    ticker=ticker,
                    direction=direction,
                    learning_text=learning_text,
                    conditions_json=json.dumps(conditions),
                    win_rate=win_rate,
                    sample_count=len(returns),
                    avg_return_pct=avg_return * 100,
                    created_at=datetime.now(UTC),
                    last_updated=datetime.now(UTC),
                )
                session.add(record)

            await session.commit()
        learnings_created += 1
        await asyncio.sleep(0.5)  # Rate limit Claude calls

    logger.info(
        "Weekly review complete: %d learnings across %d patterns",
        learnings_created, len(groups),
    )
    return {"learnings_created": learnings_created, "patterns_analyzed": len(groups)}


async def process_new_performance(
    signal_id: str,
    ticker: str,
    direction: str,
    return_pct: float,
    confidence: float = 0.5,
    owner_username: Optional[str] = None,
) -> dict:
    """
    Online-learning hook. Called after a new SignalPerformance row is written.

    Closes the self-learning feedback loop in two ways:
      1. Incrementally updates (or seeds) the running TradeLearning tally for
         this (ticker, direction) — no weekly batch needed for the counters.
      2. Validates/invalidates the YouTube insights whose strategy informed this
         trade, nudging their confidence_score so the RAG retriever learns which
         knowledge actually pays off.

    Returns a small dict describing what was updated (handy for tests/logging).
    """
    from sqlalchemy import select
    from app.db.database import get_session
    from app.db.models import TradeLearning

    bucket = _confidence_bucket(confidence)
    win = return_pct > 0
    result = {"learning_updated": False, "learning_created": False, "insights_touched": 0}

    async with get_session() as session:
        existing = await session.execute(
            select(TradeLearning).where(
                TradeLearning.ticker == ticker,
                TradeLearning.direction == direction,
            )
        )
        record = existing.scalar_one_or_none()

        if record and record.conditions_json:
            conditions = json.loads(record.conditions_json)
            n = conditions.get("n", record.sample_count or 1)
            old_win_rate = conditions.get("win_rate", record.win_rate or 0.5)
            old_avg = conditions.get("avg_return_pct", record.avg_return_pct or 0.0)
            # Incremental (online) update of win rate + avg return
            new_n = n + 1
            new_win_rate = (old_win_rate * n + (1 if win else 0)) / new_n
            new_avg = (old_avg * n + return_pct * 100) / new_n
            conditions.update({
                "n": new_n,
                "win_rate": round(new_win_rate, 3),
                "avg_return_pct": round(new_avg, 2),
                "confidence_bucket": bucket,
            })
            record.conditions_json = json.dumps(conditions)
            record.sample_count = new_n
            record.win_rate = new_win_rate
            record.avg_return_pct = new_avg
            record.last_updated = datetime.now(UTC)
            if owner_username and not record.owner_username:
                record.owner_username = owner_username
            await session.commit()
            result["learning_updated"] = True
        else:
            # Seed a fresh learning so the counter starts accumulating immediately,
            # instead of waiting for the weekly batch (n>=3) to first create it.
            conditions = {
                "ticker": ticker,
                "direction": direction,
                "confidence_bucket": bucket,
                "n": 1,
                "win_rate": 1.0 if win else 0.0,
                "avg_return_pct": round(return_pct * 100, 2),
            }
            seed = TradeLearning(
                owner_username=owner_username,
                ticker=ticker,
                direction=direction,
                learning_text=(
                    f"{direction} {ticker}: tracking started — "
                    f"first outcome {return_pct * 100:+.2f}%. "
                    f"Needs more samples for a reliable pattern."
                ),
                conditions_json=json.dumps(conditions),
                win_rate=1.0 if win else 0.0,
                sample_count=1,
                avg_return_pct=round(return_pct * 100, 2),
                created_at=datetime.now(UTC),
                last_updated=datetime.now(UTC),
            )
            session.add(seed)
            await session.commit()
            result["learning_created"] = True

    # Close the loop on the knowledge that informed this trade. Prefer the exact
    # insights attributed to this signal; fall back to recency for legacy signals
    # that predate attribution tracking.
    touched = await apply_insight_feedback(ticker=ticker, won=win, signal_id=signal_id)
    result["insights_touched"] = touched

    # Full natural-language rephrase remains the weekly review's job.
    return result


async def _attributed_insight_ids(signal_id: Optional[str]) -> list[int]:
    """Return the insight IDs that were actually injected into this signal's prompt."""
    if not signal_id:
        return []
    from sqlalchemy import select
    from app.db.database import get_session
    from app.db.models import SignalInsightUsage

    async with get_session() as session:
        res = await session.execute(
            select(SignalInsightUsage.insight_id)
            .where(SignalInsightUsage.signal_id == signal_id)
            .order_by(SignalInsightUsage.rank.asc())
        )
        return [row[0] for row in res.all()]


async def apply_insight_feedback(
    ticker: str,
    won: bool,
    signal_id: Optional[str] = None,
    max_insights: int = 5,
) -> int:
    """
    Adjust the validation counters and confidence of the YouTube insights that
    actually informed a trade, based on whether that trade won or lost.

    Attribution-precise: when ``signal_id`` is given and the signal recorded which
    insights were injected into its prompt (SignalInsightUsage), only those exact
    insights are updated. This is the correct learning signal — unrelated insights
    that merely happened to be recent are never rewarded or punished.

    Falls back to the legacy recency-based candidate set only when no attribution
    exists for the signal (e.g. signals generated before attribution tracking, or
    signals where no YouTube insights were injected at all but we still want a
    best-effort nudge for the ticker).

    Confidence is clamped to [0.05, 0.99] and moved with a small learning rate so a
    single trade never dominates. Returns the number of insights updated.
    """
    from sqlalchemy import select
    from app.db.database import get_session
    from app.db.models import YoutubeInsight

    LEARNING_RATE = 0.03

    attributed_ids = await _attributed_insight_ids(signal_id)

    async with get_session() as session:
        if attributed_ids:
            # Precise path: only the insights that actually fed this signal's prompt.
            res = await session.execute(
                select(YoutubeInsight).where(YoutubeInsight.id.in_(attributed_ids))
            )
        else:
            # Legacy fallback: mirror the retriever's recency-based candidate set.
            res = await session.execute(
                select(YoutubeInsight)
                .order_by(YoutubeInsight.created_at.desc())
                .limit(max_insights)
            )
        insights = res.scalars().all()
        if not insights:
            return 0

        for yi in insights:
            if won:
                yi.times_validated = (yi.times_validated or 0) + 1
                yi.confidence_score = min(0.99, (yi.confidence_score or 0.5) + LEARNING_RATE)
            else:
                yi.times_invalidated = (yi.times_invalidated or 0) + 1
                yi.confidence_score = max(0.05, (yi.confidence_score or 0.5) - LEARNING_RATE)
        await session.commit()
        return len(insights)
