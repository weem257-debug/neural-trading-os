"""
Confidence Decay
================
Insights that haven't been used or validated for a long time gradually lose
confidence, preventing stale knowledge from dominating the RAG ranking.

Decay model
-----------
- Granularity : per-week since ``created_at`` (or since last validation if that
  column were tracked — currently we key off ``created_at``)
- Rate        : -1 % per week of inactivity (DECAY_RATE_PER_WEEK = 0.01)
- Floor       : 0.05 — confidence never drops to zero
- Trigger     : weekly APScheduler job **and** a manual POST endpoint

An insight is considered "active" when it was created (or validated/invalidated)
recently enough that the elapsed weeks < 1.  We skip decay for those rows.

Multi-tenant safety
-------------------
YoutubeInsight has no ``owner_username`` column (insights are shared knowledge).
Decay therefore applies globally; tenant isolation exists at the signal /
TradeLearning retrieval layer, not here.  This matches how ``apply_insight_feedback``
works — it touches any insight regardless of owner.
"""
from __future__ import annotations

import logging
from datetime import datetime, UTC, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DECAY_RATE_PER_WEEK: float = 0.01   # −1 % per inactivity week
CONFIDENCE_FLOOR: float = 0.05      # never go below this
ACTIVITY_GRACE_WEEKS: float = 1.0   # skip insights touched within this window


# ---------------------------------------------------------------------------
# Core logic (pure, no DB) — easy to unit-test
# ---------------------------------------------------------------------------

def compute_decayed_confidence(
    current_confidence: float,
    weeks_inactive: float,
    decay_rate: float = DECAY_RATE_PER_WEEK,
    floor: float = CONFIDENCE_FLOOR,
) -> float:
    """
    Return the new confidence after applying compound-ish linear decay.

    We apply *integer* weeks of decay so that calling this function twice for
    0.5 weeks each equals calling it once for 0.5 weeks — i.e., we only decay
    for fully elapsed weeks.  This avoids drift when the job runs slightly late.

    Args:
        current_confidence: Current score in [0, 1].
        weeks_inactive: Elapsed weeks since last activity.
        decay_rate: Fractional reduction per week (default 0.01).
        floor: Minimum score (default 0.05).

    Returns:
        New confidence clamped to [floor, 1.0].
    """
    full_weeks = int(weeks_inactive)
    if full_weeks < 1:
        return current_confidence  # grace period — no change

    # Linear compound decay: subtract decay_rate once per full week
    reduction = decay_rate * full_weeks
    new_conf = current_confidence - reduction
    return max(floor, min(1.0, new_conf))


def weeks_since(dt: datetime, now: Optional[datetime] = None) -> float:
    """Return fractional weeks elapsed since *dt*."""
    if now is None:
        now = datetime.now(UTC)
    # Ensure both are timezone-aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    delta: timedelta = now - dt
    return delta.total_seconds() / (7 * 24 * 3600)


# ---------------------------------------------------------------------------
# DB-level decay runner
# ---------------------------------------------------------------------------

async def run_confidence_decay(
    dry_run: bool = False,
    decay_rate: float = DECAY_RATE_PER_WEEK,
    floor: float = CONFIDENCE_FLOOR,
    grace_weeks: float = ACTIVITY_GRACE_WEEKS,
) -> dict:
    """
    Apply confidence decay to all YoutubeInsight rows.

    Fetches every insight, computes weeks since creation (proxy for last
    activity), and writes back the decayed score for rows outside the grace
    window.

    Args:
        dry_run: If True, compute changes but do NOT write to DB.
        decay_rate: Override the default per-week decay rate.
        floor: Override the minimum confidence floor.
        grace_weeks: Insights created within this many weeks are skipped.

    Returns:
        {
            "insights_evaluated": int,
            "insights_decayed": int,
            "insights_skipped": int,   # within grace window
            "dry_run": bool,
        }
    """
    from sqlalchemy import select
    from app.db.database import get_session
    from app.db.models import YoutubeInsight

    now = datetime.now(UTC)
    insights_evaluated = 0
    insights_decayed = 0
    insights_skipped = 0

    async with get_session() as session:
        result = await session.execute(select(YoutubeInsight))
        insights = result.scalars().all()

        for yi in insights:
            insights_evaluated += 1
            w = weeks_since(yi.created_at, now=now)

            if w < grace_weeks:
                insights_skipped += 1
                continue

            current = yi.confidence_score or 0.5
            new_conf = compute_decayed_confidence(
                current_confidence=current,
                weeks_inactive=w,
                decay_rate=decay_rate,
                floor=floor,
            )

            if new_conf == current:
                # compute_decayed_confidence returned unchanged (< 1 full week)
                insights_skipped += 1
                continue

            insights_decayed += 1
            if not dry_run:
                yi.confidence_score = new_conf

        if not dry_run and insights_decayed > 0:
            await session.commit()

    logger.info(
        "Confidence decay run: evaluated=%d decayed=%d skipped=%d dry_run=%s",
        insights_evaluated, insights_decayed, insights_skipped, dry_run,
    )
    return {
        "insights_evaluated": insights_evaluated,
        "insights_decayed": insights_decayed,
        "insights_skipped": insights_skipped,
        "dry_run": dry_run,
    }
