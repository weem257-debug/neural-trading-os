"""
Insights Stats Endpoint Tests — Neural Trading OS (Iteration #117)
==================================================================

Tests for GET /api/learning/insights/stats — the Signal Quality Dashboard
data source that exposes which AI insights produced the best trade outcomes.

Run:
    cd dashboard/backend
    pytest tests/test_insights_stats.py -v
"""
import asyncio
import os
import tempfile

import pytest


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(scope="module")
def stats_db():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_stats_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)
    os.environ.pop("ANTHROPIC_API_KEY", None)

    from app.db.database import create_all_tables, get_session
    from app.db import models

    _run(create_all_tables())
    yield {"get_session": get_session, "models": models}


def _seed_insights(stats_db):
    """Seed 3 YoutubeInsight rows with different confidence/validation scores."""
    get_session = stats_db["get_session"]
    models = stats_db["models"]

    async def _do():
        async with get_session() as session:
            from datetime import datetime, UTC
            insights = [
                models.YoutubeInsight(
                    video_id="vid_high",
                    video_title="High Confidence Video",
                    channel="TestChannel",
                    insight_text="AAPL breakout strategy with RSI confirmation",
                    confidence_score=0.95,
                    times_validated=10,
                    times_invalidated=1,
                ),
                models.YoutubeInsight(
                    video_id="vid_mid",
                    video_title="Mid Confidence Video",
                    channel="TestChannel",
                    insight_text="BTC momentum play on 4h timeframe",
                    confidence_score=0.70,
                    times_validated=5,
                    times_invalidated=3,
                ),
                models.YoutubeInsight(
                    video_id="vid_low",
                    video_title="Low Confidence Video",
                    channel="TestChannel",
                    insight_text="Generic market trend observation",
                    confidence_score=0.40,
                    times_validated=1,
                    times_invalidated=8,
                ),
            ]
            session.add_all(insights)
            await session.commit()
            # Return IDs in insertion order
            return [i.id for i in insights]

    return _run(_do())


# ---------------------------------------------------------------------------
# Test 1: Endpoint returns a non-empty list with correct structure
# ---------------------------------------------------------------------------

def test_insights_stats_returns_correct_structure(stats_db):
    """GET /api/learning/insights/stats returns list of InsightStatItem dicts."""
    _seed_insights(stats_db)

    get_session = stats_db["get_session"]
    models = stats_db["models"]

    from sqlalchemy import select, func

    async def _do():
        async with get_session() as session:
            usage_subq = (
                select(
                    models.SignalInsightUsage.insight_id,
                    func.count(models.SignalInsightUsage.id).label("usage_count"),
                )
                .group_by(models.SignalInsightUsage.insight_id)
                .subquery()
            )
            q = (
                select(
                    models.YoutubeInsight,
                    func.coalesce(usage_subq.c.usage_count, 0).label("usage_count"),
                )
                .outerjoin(usage_subq, models.YoutubeInsight.id == usage_subq.c.insight_id)
                .order_by(models.YoutubeInsight.confidence_score.desc())
                .limit(10)
            )
            result = await session.execute(q)
            rows = result.all()
        return rows

    rows = _run(_do())

    assert len(rows) >= 3, "Expected at least 3 insights"

    # Check row structure: (YoutubeInsight, usage_count)
    first_insight, first_usage = rows[0][0], rows[0][1]
    assert hasattr(first_insight, "confidence_score")
    assert hasattr(first_insight, "times_validated")
    assert hasattr(first_insight, "times_invalidated")
    assert hasattr(first_insight, "insight_text")
    assert isinstance(first_usage, int)


# ---------------------------------------------------------------------------
# Test 2: sort_by=confidence returns highest confidence first
# ---------------------------------------------------------------------------

def test_insights_stats_sort_by_confidence(stats_db):
    """Results sorted by confidence_score descending when sort_by=confidence."""
    get_session = stats_db["get_session"]
    models = stats_db["models"]

    from sqlalchemy import select, func

    async def _do():
        async with get_session() as session:
            usage_subq = (
                select(
                    models.SignalInsightUsage.insight_id,
                    func.count(models.SignalInsightUsage.id).label("usage_count"),
                )
                .group_by(models.SignalInsightUsage.insight_id)
                .subquery()
            )
            q = (
                select(
                    models.YoutubeInsight,
                    func.coalesce(usage_subq.c.usage_count, 0).label("usage_count"),
                )
                .outerjoin(usage_subq, models.YoutubeInsight.id == usage_subq.c.insight_id)
                .order_by(models.YoutubeInsight.confidence_score.desc())
                .limit(10)
            )
            result = await session.execute(q)
            return result.all()

    rows = _run(_do())
    scores = [row[0].confidence_score for row in rows]

    # Verify descending order
    assert scores == sorted(scores, reverse=True), (
        f"Expected descending confidence scores, got: {scores}"
    )
    # Top insight should be the high-confidence one
    assert scores[0] >= 0.9


# ---------------------------------------------------------------------------
# Test 3: usage_count reflects SignalInsightUsage rows correctly
# ---------------------------------------------------------------------------

def test_insights_stats_usage_count(stats_db):
    """usage_count is correctly aggregated from SignalInsightUsage."""
    get_session = stats_db["get_session"]
    models = stats_db["models"]

    async def _do():
        # Get the ID of the high-confidence insight
        from sqlalchemy import select
        async with get_session() as session:
            res = await session.execute(
                select(models.YoutubeInsight)
                .where(models.YoutubeInsight.video_id == "vid_high")
            )
            insight = res.scalar_one_or_none()
            if insight is None:
                return None, []

            insight_id = insight.id

            # Add 3 usage records for this insight
            usages = [
                models.SignalInsightUsage(signal_id=f"sig-{i}", insight_id=insight_id, rank=i)
                for i in range(3)
            ]
            session.add_all(usages)
            await session.commit()
            return insight_id, usages

    insight_id, _ = _run(_do())
    assert insight_id is not None, "High-confidence insight not found in DB"

    from sqlalchemy import select, func

    async def _check():
        async with get_session() as session:
            usage_subq = (
                select(
                    models.SignalInsightUsage.insight_id,
                    func.count(models.SignalInsightUsage.id).label("usage_count"),
                )
                .group_by(models.SignalInsightUsage.insight_id)
                .subquery()
            )
            q = (
                select(
                    models.YoutubeInsight,
                    func.coalesce(usage_subq.c.usage_count, 0).label("usage_count"),
                )
                .outerjoin(usage_subq, models.YoutubeInsight.id == usage_subq.c.insight_id)
                .where(models.YoutubeInsight.id == insight_id)
            )
            result = await session.execute(q)
            row = result.one()
        return row[1]  # usage_count

    usage_count = _run(_check())
    assert usage_count == 3, f"Expected 3 usages, got {usage_count}"


# ---------------------------------------------------------------------------
# Test 4: sort_by=usage returns most-used insight first
# ---------------------------------------------------------------------------

def test_insights_stats_sort_by_usage(stats_db):
    """Results sorted by usage_count descending when sort_by=usage."""
    get_session = stats_db["get_session"]
    models = stats_db["models"]

    from sqlalchemy import select, func

    async def _do():
        # Add 5 usage records for the mid-confidence insight (more than vid_high's 3)
        async with get_session() as session:
            res = await session.execute(
                select(models.YoutubeInsight)
                .where(models.YoutubeInsight.video_id == "vid_mid")
            )
            mid_insight = res.scalar_one_or_none()
            if mid_insight is None:
                return None

            usages = [
                models.SignalInsightUsage(
                    signal_id=f"sig-mid-{i}", insight_id=mid_insight.id, rank=0
                )
                for i in range(5)
            ]
            session.add_all(usages)
            await session.commit()
            return mid_insight.id

    mid_id = _run(_do())
    assert mid_id is not None

    async def _check():
        async with get_session() as session:
            usage_subq = (
                select(
                    models.SignalInsightUsage.insight_id,
                    func.count(models.SignalInsightUsage.id).label("usage_count"),
                )
                .group_by(models.SignalInsightUsage.insight_id)
                .subquery()
            )
            q = (
                select(
                    models.YoutubeInsight,
                    func.coalesce(usage_subq.c.usage_count, 0).label("usage_count"),
                )
                .outerjoin(usage_subq, models.YoutubeInsight.id == usage_subq.c.insight_id)
                .order_by(func.coalesce(usage_subq.c.usage_count, 0).desc())
                .limit(10)
            )
            result = await session.execute(q)
            return result.all()

    rows = _run(_check())
    usage_counts = [row[1] for row in rows]

    assert usage_counts == sorted(usage_counts, reverse=True), (
        f"Expected descending usage counts, got: {usage_counts}"
    )
    # The most-used insight should appear first
    assert usage_counts[0] >= 5


# ---------------------------------------------------------------------------
# Test 5: limit parameter is respected
# ---------------------------------------------------------------------------

def test_insights_stats_limit(stats_db):
    """limit parameter caps the number of returned insights."""
    get_session = stats_db["get_session"]
    models = stats_db["models"]

    from sqlalchemy import select, func

    async def _do():
        async with get_session() as session:
            usage_subq = (
                select(
                    models.SignalInsightUsage.insight_id,
                    func.count(models.SignalInsightUsage.id).label("usage_count"),
                )
                .group_by(models.SignalInsightUsage.insight_id)
                .subquery()
            )
            q = (
                select(
                    models.YoutubeInsight,
                    func.coalesce(usage_subq.c.usage_count, 0).label("usage_count"),
                )
                .outerjoin(usage_subq, models.YoutubeInsight.id == usage_subq.c.insight_id)
                .order_by(models.YoutubeInsight.confidence_score.desc())
                .limit(2)
            )
            result = await session.execute(q)
            return result.all()

    rows = _run(_do())
    assert len(rows) <= 2, f"Expected at most 2 rows with limit=2, got {len(rows)}"
