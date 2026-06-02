"""
Learning Background Scheduler
===============================
APScheduler AsyncIOScheduler for:
  - Daily YouTube batch processing (02:00 UTC)
  - Weekly trade review (Sunday 03:00 UTC)
  - Manual trigger support

Usage in main.py lifespan:
    from app.services.learning.scheduler import start_scheduler, stop_scheduler
    scheduler = await start_scheduler()
    yield
    await stop_scheduler(scheduler)
"""
import asyncio
import logging
from datetime import datetime, UTC

logger = logging.getLogger(__name__)

_scheduler = None


async def _run_youtube_batch_job() -> None:
    """Daily YouTube batch job."""
    from app.db.database import get_session
    from app.db.models import LearningJob
    from app.services.learning import youtube_learner

    async with get_session() as session:
        job = LearningJob(
            job_type="youtube_batch",
            status="running",
            started_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
        )
        session.add(job)
        await session.commit()
        job_id = job.id

    try:
        result = await youtube_learner.run_batch()
        async with get_session() as session:
            from sqlalchemy import select
            q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
            j = q.scalar_one()
            j.status = "done"
            j.finished_at = datetime.now(UTC)
            j.items_processed = result["processed"]
            await session.commit()
        logger.info("YouTube batch complete: %s", result)
    except Exception as e:
        async with get_session() as session:
            from sqlalchemy import select
            q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
            j = q.scalar_one_or_none()
            if j:
                j.status = "failed"
                j.finished_at = datetime.now(UTC)
                j.error = str(e)[:500]
            await session.commit()
        logger.error("YouTube batch failed: %s", e)


async def _run_confidence_decay_job() -> None:
    """Weekly confidence decay job."""
    from app.db.database import get_session
    from app.db.models import LearningJob
    from app.services.learning import confidence_decay

    async with get_session() as session:
        job = LearningJob(
            job_type="confidence_decay",
            status="running",
            started_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
        )
        session.add(job)
        await session.commit()
        job_id = job.id

    try:
        result = await confidence_decay.run_confidence_decay()
        async with get_session() as session:
            from sqlalchemy import select
            q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
            j = q.scalar_one()
            j.status = "done"
            j.finished_at = datetime.now(UTC)
            j.items_processed = result["insights_decayed"]
            await session.commit()
        logger.info("Confidence decay complete: %s", result)
    except Exception as e:
        async with get_session() as session:
            from sqlalchemy import select
            q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
            j = q.scalar_one_or_none()
            if j:
                j.status = "failed"
                j.finished_at = datetime.now(UTC)
                j.error = str(e)[:500]
            await session.commit()
        logger.error("Confidence decay failed: %s", e)


async def _run_trade_review_job() -> None:
    """Weekly trade review job."""
    from app.db.database import get_session
    from app.db.models import LearningJob
    from app.services.learning import trade_reviewer

    async with get_session() as session:
        job = LearningJob(
            job_type="trade_review",
            status="running",
            started_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
        )
        session.add(job)
        await session.commit()
        job_id = job.id

    try:
        result = await trade_reviewer.run_weekly_review()
        async with get_session() as session:
            from sqlalchemy import select
            q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
            j = q.scalar_one()
            j.status = "done"
            j.finished_at = datetime.now(UTC)
            j.items_processed = result["learnings_created"]
            await session.commit()
        logger.info("Trade review complete: %s", result)
    except Exception as e:
        async with get_session() as session:
            from sqlalchemy import select
            q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
            j = q.scalar_one_or_none()
            if j:
                j.status = "failed"
                j.finished_at = datetime.now(UTC)
                j.error = str(e)[:500]
            await session.commit()
        logger.error("Trade review failed: %s", e)


def start_scheduler():
    """Start the APScheduler instance. Returns the scheduler."""
    global _scheduler
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = AsyncIOScheduler()

        # Daily YouTube batch at 02:00 UTC
        scheduler.add_job(
            _run_youtube_batch_job,
            trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
            id="youtube_batch",
            name="Daily YouTube Trading Knowledge Batch",
            replace_existing=True,
        )

        # Weekly trade review every Sunday 03:00 UTC
        scheduler.add_job(
            _run_trade_review_job,
            trigger=CronTrigger(day_of_week="sun", hour=3, minute=0, timezone="UTC"),
            id="trade_review",
            name="Weekly Trade Outcome Review",
            replace_existing=True,
        )

        # Weekly confidence decay every Sunday 04:00 UTC (after trade review)
        scheduler.add_job(
            _run_confidence_decay_job,
            trigger=CronTrigger(day_of_week="sun", hour=4, minute=0, timezone="UTC"),
            id="confidence_decay",
            name="Weekly Insight Confidence Decay",
            replace_existing=True,
        )

        scheduler.start()
        _scheduler = scheduler
        logger.info(
            "Learning scheduler started — YouTube daily 02:00 UTC, "
            "trade review Sundays 03:00 UTC, confidence decay Sundays 04:00 UTC"
        )
        return scheduler

    except ImportError:
        logger.warning("APScheduler not installed — learning background jobs disabled")
        return None
    except Exception as e:
        logger.error("Scheduler start failed: %s", e)
        return None


def stop_scheduler(scheduler) -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if scheduler:
        try:
            scheduler.shutdown(wait=False)
            logger.info("Learning scheduler stopped")
        except Exception:
            pass
    _scheduler = None


async def trigger_job(job_type: str) -> dict:
    """Manually trigger a job by type. Returns immediately with job status."""
    if job_type == "youtube_batch":
        asyncio.create_task(_run_youtube_batch_job())
        return {"triggered": True, "job_type": job_type}
    elif job_type == "trade_review":
        asyncio.create_task(_run_trade_review_job())
        return {"triggered": True, "job_type": job_type}
    elif job_type == "confidence_decay":
        asyncio.create_task(_run_confidence_decay_job())
        return {"triggered": True, "job_type": job_type}
    else:
        return {"triggered": False, "error": f"Unknown job type: {job_type}"}
