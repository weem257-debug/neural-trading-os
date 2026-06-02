"""
Confidence-Decay Tests — Neural Trading OS (Iteration #114)
=============================================================

Validates the confidence-decay mechanism introduced in #114:

  - Pure math: compute_decayed_confidence + weeks_since (no DB)
  - Grace-period: insights < 1 week old are never touched
  - Floor enforcement: confidence never drops below 0.05
  - DB-level decay: run_confidence_decay writes correct new scores
  - Multi-insight decay: each insight decays independently by its own age
  - Dry-run mode: no rows modified when dry_run=True
  - Scheduler registration: 'confidence_decay' is a known job_type

Run:
    cd dashboard/backend
    pytest tests/test_confidence_decay.py -v
"""
import asyncio
import os
import tempfile
from datetime import datetime, UTC, timedelta

import pytest

from app.services.learning.confidence_decay import (
    compute_decayed_confidence,
    weeks_since,
    CONFIDENCE_FLOOR,
    DECAY_RATE_PER_WEEK,
)


def _run(coro):
    """Run an async coroutine on a fresh event loop."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Isolated throwaway-DB fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def decay_db():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_decay_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)
    os.environ.pop("ANTHROPIC_API_KEY", None)

    from app.db.database import create_all_tables, get_session
    from app.db import models

    _run(create_all_tables())

    yield {"get_session": get_session, "models": models}

    try:
        os.remove(db_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Helper: insert a YoutubeInsight with controllable created_at
# ---------------------------------------------------------------------------

async def _add_insight(get_session, models, *, video_id, confidence=0.7, weeks_ago=0.0):
    """Insert an insight whose created_at is set to *weeks_ago* weeks in the past."""
    created = datetime.now(UTC) - timedelta(weeks=weeks_ago)
    async with get_session() as session:
        yi = models.YoutubeInsight(
            video_id=video_id,
            video_title=f"Video {video_id}",
            channel="TestChannel",
            insight_text="Some trading insight",
            confidence_score=confidence,
        )
        session.add(yi)
        await session.commit()
        # Overwrite created_at after flush so we control age precisely
        from sqlalchemy import update
        await session.execute(
            update(models.YoutubeInsight)
            .where(models.YoutubeInsight.video_id == video_id)
            .values(created_at=created)
        )
        await session.commit()


async def _get_insight(get_session, models, video_id):
    from sqlalchemy import select
    async with get_session() as session:
        res = await session.execute(
            select(models.YoutubeInsight).where(models.YoutubeInsight.video_id == video_id)
        )
        return res.scalar_one_or_none()


# ===========================================================================
# 1. Pure-math tests (no DB required)
# ===========================================================================

class TestComputeDecayedConfidence:
    """Unit-test the pure decay formula — no database involved."""

    def test_no_decay_within_grace_period(self):
        """Insights inactive for < 1 full week must not lose confidence."""
        result = compute_decayed_confidence(0.8, weeks_inactive=0.9)
        assert result == 0.8

    def test_single_week_decay(self):
        """After exactly 1 full week, confidence drops by DECAY_RATE_PER_WEEK."""
        result = compute_decayed_confidence(0.8, weeks_inactive=1.0)
        expected = 0.8 - DECAY_RATE_PER_WEEK  # 0.79
        assert abs(result - expected) < 1e-9

    def test_multi_week_decay_is_linear(self):
        """After N full weeks, confidence drops by N * DECAY_RATE_PER_WEEK."""
        result = compute_decayed_confidence(0.8, weeks_inactive=5.0)
        expected = 0.8 - 5 * DECAY_RATE_PER_WEEK  # 0.75
        assert abs(result - expected) < 1e-9

    def test_floor_is_enforced(self):
        """Confidence must never go below CONFIDENCE_FLOOR regardless of age."""
        # 100-week-old insight with default 1 %/week would go negative without floor
        result = compute_decayed_confidence(0.5, weeks_inactive=100.0)
        assert result == CONFIDENCE_FLOOR

    def test_floor_at_exactly_minimum(self):
        """An insight already at the floor stays at the floor."""
        result = compute_decayed_confidence(CONFIDENCE_FLOOR, weeks_inactive=52.0)
        assert result == CONFIDENCE_FLOOR

    def test_fractional_weeks_only_counts_full_weeks(self):
        """1.9 weeks → only 1 full week of decay applied."""
        result = compute_decayed_confidence(0.8, weeks_inactive=1.9)
        expected = 0.8 - DECAY_RATE_PER_WEEK
        assert abs(result - expected) < 1e-9

    def test_custom_decay_rate(self):
        """Custom rate parameter is respected."""
        result = compute_decayed_confidence(0.8, weeks_inactive=2.0, decay_rate=0.05)
        expected = 0.8 - 2 * 0.05  # 0.70
        assert abs(result - expected) < 1e-9

    def test_custom_floor(self):
        """Custom floor parameter is respected."""
        result = compute_decayed_confidence(0.1, weeks_inactive=20.0, floor=0.09)
        assert result == 0.09


class TestWeeksSince:
    """Unit-test the helper that converts a datetime to elapsed weeks."""

    def test_zero_weeks_for_now(self):
        now = datetime.now(UTC)
        assert weeks_since(now, now=now) == 0.0

    def test_one_week_exactly(self):
        now = datetime.now(UTC)
        past = now - timedelta(weeks=1)
        result = weeks_since(past, now=now)
        assert abs(result - 1.0) < 1e-6

    def test_naive_datetime_treated_as_utc(self):
        """Naive datetimes (no tzinfo) should not raise; treated as UTC."""
        now = datetime.now(UTC)
        past_naive = (now - timedelta(weeks=2)).replace(tzinfo=None)
        result = weeks_since(past_naive, now=now)
        assert abs(result - 2.0) < 1e-4


# ===========================================================================
# 2. DB-level tests
# ===========================================================================

class TestRunConfidenceDecay:
    """Integration tests for run_confidence_decay against a real SQLite DB."""

    def test_grace_period_insight_not_touched(self, decay_db):
        """An insight created < 1 week ago must NOT be decayed."""
        get_session = decay_db["get_session"]
        models = decay_db["models"]

        _run(_add_insight(get_session, models, video_id="GRACE001", confidence=0.8, weeks_ago=0.5))

        from app.services.learning.confidence_decay import run_confidence_decay
        result = _run(run_confidence_decay())

        insight = _run(_get_insight(get_session, models, "GRACE001"))
        assert insight.confidence_score == pytest.approx(0.8, abs=1e-6)
        # The insight is counted as evaluated but skipped
        assert result["insights_skipped"] >= 1

    def test_old_insight_is_decayed(self, decay_db):
        """An insight 4 weeks old at 0.8 confidence should drop to 0.76."""
        get_session = decay_db["get_session"]
        models = decay_db["models"]

        _run(_add_insight(get_session, models, video_id="OLD004W", confidence=0.8, weeks_ago=4.0))

        from app.services.learning.confidence_decay import run_confidence_decay
        _run(run_confidence_decay())

        insight = _run(_get_insight(get_session, models, "OLD004W"))
        expected = 0.8 - 4 * DECAY_RATE_PER_WEEK  # 0.76
        assert insight.confidence_score == pytest.approx(expected, abs=1e-6)

    def test_floor_enforced_in_db(self, decay_db):
        """A very old low-confidence insight must be clamped to CONFIDENCE_FLOOR."""
        get_session = decay_db["get_session"]
        models = decay_db["models"]

        _run(_add_insight(get_session, models, video_id="VERYOLD", confidence=0.1, weeks_ago=52.0))

        from app.services.learning.confidence_decay import run_confidence_decay
        _run(run_confidence_decay())

        insight = _run(_get_insight(get_session, models, "VERYOLD"))
        assert insight.confidence_score == pytest.approx(CONFIDENCE_FLOOR, abs=1e-6)

    def test_dry_run_does_not_write(self, decay_db):
        """dry_run=True must not modify any confidence_score in the DB."""
        get_session = decay_db["get_session"]
        models = decay_db["models"]

        _run(_add_insight(get_session, models, video_id="DRYRUN1", confidence=0.9, weeks_ago=10.0))

        from app.services.learning.confidence_decay import run_confidence_decay
        result = _run(run_confidence_decay(dry_run=True))

        assert result["dry_run"] is True
        insight = _run(_get_insight(get_session, models, "DRYRUN1"))
        # Score must be unchanged
        assert insight.confidence_score == pytest.approx(0.9, abs=1e-6)

    def test_result_counts_are_consistent(self, decay_db):
        """evaluated == decayed + skipped for every run."""
        from app.services.learning.confidence_decay import run_confidence_decay
        result = _run(run_confidence_decay())
        assert result["insights_evaluated"] == result["insights_decayed"] + result["insights_skipped"]

    def test_multiple_insights_decay_independently(self, decay_db):
        """Two insights of different ages each decay by their own elapsed weeks."""
        get_session = decay_db["get_session"]
        models = decay_db["models"]

        _run(_add_insight(get_session, models, video_id="MULTI_2W", confidence=0.8, weeks_ago=2.0))
        _run(_add_insight(get_session, models, video_id="MULTI_6W", confidence=0.8, weeks_ago=6.0))

        from app.services.learning.confidence_decay import run_confidence_decay
        _run(run_confidence_decay())

        i2 = _run(_get_insight(get_session, models, "MULTI_2W"))
        i6 = _run(_get_insight(get_session, models, "MULTI_6W"))

        expected_2w = 0.8 - 2 * DECAY_RATE_PER_WEEK  # 0.78
        expected_6w = 0.8 - 6 * DECAY_RATE_PER_WEEK  # 0.74
        assert i2.confidence_score == pytest.approx(expected_2w, abs=1e-5)
        assert i6.confidence_score == pytest.approx(expected_6w, abs=1e-5)


# ===========================================================================
# 3. Scheduler integration test
# ===========================================================================

class TestSchedulerKnowsDecayJob:
    """confidence_decay must be a recognised job type in the trigger_job helper."""

    def test_trigger_job_accepts_confidence_decay(self):
        from app.services.learning.scheduler import trigger_job

        # Patch create_task so no actual DB job is launched
        import asyncio as _aio
        original = _aio.create_task

        tasks_created = []

        def _fake_create_task(coro):
            # Close the coroutine immediately (avoid ResourceWarning)
            coro.close()
            tasks_created.append(True)

        _aio.create_task = _fake_create_task
        try:
            result = _run(trigger_job("confidence_decay"))
        finally:
            _aio.create_task = original

        assert result.get("triggered") is True
        assert result.get("job_type") == "confidence_decay"
