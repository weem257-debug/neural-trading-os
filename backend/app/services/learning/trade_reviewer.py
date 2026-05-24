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
            ).join(
                SignalRecord, SignalRecord.id == SignalPerformance.signal_id, isouter=True
            )
        )
        rows = result.all()

    if not rows:
        return {"learnings_created": 0, "patterns_analyzed": 0}

    # Group by (ticker, direction, conf_bucket)
    groups: dict = {}
    for ticker, direction, confidence, return_pct in rows:
        conf = confidence or 0.5
        bucket = _confidence_bucket(conf)
        key = (ticker, direction, bucket)
        if key not in groups:
            groups[key] = []
        groups[key].append(return_pct)

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

            if record:
                record.learning_text = learning_text
                record.conditions_json = json.dumps(conditions)
                record.win_rate = win_rate
                record.sample_count = len(returns)
                record.avg_return_pct = avg_return * 100
                record.last_updated = datetime.now(UTC)
            else:
                record = TradeLearning(
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


async def process_new_performance(signal_id: str, ticker: str, direction: str, return_pct: float, confidence: float = 0.5) -> None:
    """
    Called after a new SignalPerformance is written.
    Updates the running tally for this (ticker, direction, bucket).
    """
    from sqlalchemy import select
    from app.db.database import get_session
    from app.db.models import TradeLearning

    bucket = _confidence_bucket(confidence)
    win = return_pct > 0

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
            n = conditions.get("n", 1)
            old_win_rate = conditions.get("win_rate", 0.5)
            # Incremental update
            new_n = n + 1
            new_win_rate = (old_win_rate * n + (1 if win else 0)) / new_n
            conditions.update({"n": new_n, "win_rate": round(new_win_rate, 3)})
            record.conditions_json = json.dumps(conditions)
            record.sample_count = new_n
            record.win_rate = new_win_rate
            record.last_updated = datetime.now(UTC)
            await session.commit()
        # Full rephrase is done by weekly review — post-trade just updates counts
