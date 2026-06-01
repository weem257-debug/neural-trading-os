"""
Learning API Routes
====================
Manage the self-learning trading knowledge base.

YouTube:
  POST /api/learning/youtube/process   — process a specific video URL/ID
  GET  /api/learning/youtube/insights  — list extracted insights

Trade Learnings:
  GET  /api/learning/trade-learnings   — list trade pattern learnings
  POST /api/learning/trade-review      — trigger immediate trade review

Background Jobs:
  POST /api/learning/jobs/trigger      — trigger a batch job
  GET  /api/learning/jobs              — list recent job runs

RAG Context Preview:
  GET  /api/learning/context           — preview what context a query would get
"""
import re
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.auth import get_current_user, UserInfo
from app.core.rate_limits import limiter
from app.db.database import get_session
from app.db.models import YoutubeInsight, TradeLearning, LearningJob

router = APIRouter(prefix="/learning", tags=["Learning"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class YoutubeProcessRequest(BaseModel):
    video_url: str = Field(..., description="YouTube URL or video ID (11 chars)")


class TriggerJobRequest(BaseModel):
    job_type: str = Field(..., description="'youtube_batch' or 'trade_review'")
    video_ids: Optional[list[str]] = Field(None, description="Specific video IDs for youtube_batch")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_video_id(url_or_id: str) -> str:
    """Extract 11-char video ID from URL or return as-is if already an ID."""
    url_or_id = url_or_id.strip()
    if len(url_or_id) == 11 and re.match(r'^[A-Za-z0-9_-]{11}$', url_or_id):
        return url_or_id
    # youtu.be/xxxxx
    m = re.search(r'youtu\.be/([A-Za-z0-9_-]{11})', url_or_id)
    if m:
        return m.group(1)
    # youtube.com/watch?v=xxxxx
    m = re.search(r'[?&]v=([A-Za-z0-9_-]{11})', url_or_id)
    if m:
        return m.group(1)
    # youtube.com/shorts/xxxxx or /embed/xxxxx
    m = re.search(r'(?:shorts|embed)/([A-Za-z0-9_-]{11})', url_or_id)
    if m:
        return m.group(1)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Konnte keine gültige YouTube-Video-ID aus der URL extrahieren.",
    )


# ---------------------------------------------------------------------------
# YouTube endpoints
# ---------------------------------------------------------------------------

@router.post("/youtube/process", status_code=202)
@limiter.limit("5/minute")
async def process_youtube_video(
    request: Request,
    body: YoutubeProcessRequest,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Trigger processing of a YouTube video.
    Returns immediately — processing happens in the background.
    """
    video_id = _extract_video_id(body.video_url)

    # Create a job record
    async with get_session() as session:
        job = LearningJob(
            owner_username=user.username,
            job_type="youtube_single",
            status="pending",
            created_at=datetime.now(UTC),
        )
        session.add(job)
        await session.commit()
        job_id = job.id

    # Process in background
    import asyncio
    from app.services.learning import youtube_learner

    async def _bg():
        async with get_session() as session:
            from sqlalchemy import select as sa_select
            q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
            j = q.scalar_one()
            j.status = "running"
            j.started_at = datetime.now(UTC)
            await session.commit()
        try:
            result = await youtube_learner.process_video(video_id, get_session())
            async with get_session() as session:
                from sqlalchemy import select as sa_select
                q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
                j = q.scalar_one()
                j.status = "done"
                j.finished_at = datetime.now(UTC)
                j.items_processed = 1 if result else 0
                await session.commit()
        except Exception as e:
            async with get_session() as session:
                from sqlalchemy import select as sa_select
                q = await session.execute(select(LearningJob).where(LearningJob.id == job_id))
                j = q.scalar_one_or_none()
                if j:
                    j.status = "failed"
                    j.finished_at = datetime.now(UTC)
                    j.error = str(e)[:500]
                await session.commit()

    asyncio.create_task(_bg())

    return {
        "accepted": True,
        "video_id": video_id,
        "job_id": job_id,
        "message": f"Processing started for video {video_id}. Check /api/learning/jobs/{job_id} for status.",
    }


@router.get("/youtube/insights")
async def list_youtube_insights(
    strategy: Optional[str] = Query(None),
    asset_class: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    async with get_session() as session:
        q = select(YoutubeInsight).order_by(YoutubeInsight.created_at.desc()).limit(limit)
        if strategy:
            q = q.where(YoutubeInsight.strategy == strategy)
        if asset_class:
            q = q.where(YoutubeInsight.asset_class == asset_class)
        result = await session.execute(q)
        insights = result.scalars().all()

    return [
        {
            "id": yi.id,
            "video_id": yi.video_id,
            "video_title": yi.video_title,
            "channel": yi.channel,
            "insight_text": yi.insight_text,
            "strategy": yi.strategy,
            "timeframe": yi.timeframe,
            "market_condition": yi.market_condition,
            "asset_class": yi.asset_class,
            "confidence_score": yi.confidence_score,
            "times_validated": yi.times_validated,
            "times_invalidated": yi.times_invalidated,
            "youtube_url": f"https://youtube.com/watch?v={yi.video_id}",
            "created_at": yi.created_at.isoformat(),
        }
        for yi in insights
    ]


# ---------------------------------------------------------------------------
# Trade Learnings
# ---------------------------------------------------------------------------

@router.get("/trade-learnings")
async def list_trade_learnings(
    ticker: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    min_win_rate: Optional[float] = Query(None, ge=0.0, le=1.0),
    min_samples: int = Query(3, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    async with get_session() as session:
        q = (
            select(TradeLearning)
            .where(
                TradeLearning.owner_username == user.username,
                TradeLearning.sample_count >= min_samples,
            )
            .order_by(TradeLearning.last_updated.desc())
            .limit(limit)
        )
        if ticker:
            q = q.where(TradeLearning.ticker == ticker.upper())
        if direction:
            q = q.where(TradeLearning.direction == direction.upper())
        if min_win_rate is not None:
            q = q.where(TradeLearning.win_rate >= min_win_rate)
        result = await session.execute(q)
        learnings = result.scalars().all()

    return [
        {
            "id": tl.id,
            "ticker": tl.ticker,
            "direction": tl.direction,
            "learning_text": tl.learning_text,
            "win_rate": tl.win_rate,
            "sample_count": tl.sample_count,
            "avg_return_pct": tl.avg_return_pct,
            "created_at": tl.created_at.isoformat(),
            "last_updated": tl.last_updated.isoformat(),
        }
        for tl in learnings
    ]


@router.post("/trade-review", status_code=202)
async def trigger_trade_review(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Trigger immediate trade review (runs in background)."""
    from app.services.learning.scheduler import trigger_job
    result = await trigger_job("trade_review")
    return result


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

@router.post("/jobs/trigger", status_code=202)
async def trigger_job_endpoint(
    body: TriggerJobRequest,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    from app.services.learning.scheduler import trigger_job

    if body.job_type == "youtube_batch" and body.video_ids:
        import asyncio
        from app.services.learning import youtube_learner
        asyncio.create_task(youtube_learner.run_batch(body.video_ids))
        return {"triggered": True, "job_type": "youtube_batch", "video_count": len(body.video_ids)}

    return await trigger_job(body.job_type)


@router.get("/jobs")
async def list_jobs(
    limit: int = Query(20, ge=1, le=100),
    user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    async with get_session() as session:
        result = await session.execute(
            select(LearningJob)
            .where(LearningJob.owner_username == user.username)
            .order_by(LearningJob.created_at.desc())
            .limit(limit)
        )
        jobs = result.scalars().all()

    return [
        {
            "id": j.id,
            "job_type": j.job_type,
            "status": j.status,
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
            "items_processed": j.items_processed,
            "error": j.error,
            "created_at": j.created_at.isoformat(),
        }
        for j in jobs
    ]


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: int,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    async with get_session() as session:
        result = await session.execute(
            select(LearningJob).where(
                LearningJob.id == job_id,
                LearningJob.owner_username == user.username,
            )
        )
        j = result.scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")
    return {
        "id": j.id,
        "job_type": j.job_type,
        "status": j.status,
        "started_at": j.started_at.isoformat() if j.started_at else None,
        "finished_at": j.finished_at.isoformat() if j.finished_at else None,
        "items_processed": j.items_processed,
        "error": j.error,
        "created_at": j.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# RAG Context Preview
# ---------------------------------------------------------------------------

@router.get("/context")
async def preview_context(
    ticker: str = Query(..., min_length=1, max_length=20),
    query: str = Query("signal generation trading strategy"),
    top_n: int = Query(5, ge=1, le=10),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Preview the RAG context that would be injected into a signal generation prompt
    for the given ticker and query.
    """
    from app.services.learning.rag_retriever import get_relevant_context
    context = await get_relevant_context(
        query=query,
        ticker=ticker.upper(),
        top_n=top_n,
    )
    return {
        "ticker": ticker.upper(),
        "query": query,
        "context": context,
        "has_context": bool(context),
        "context_length": len(context),
    }


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/stats")
async def learning_stats(
    user: UserInfo = Depends(get_current_user),
) -> dict:
    from sqlalchemy import func
    async with get_session() as session:
        yt_count = await session.execute(select(func.count(YoutubeInsight.id)))
        tl_count = await session.execute(
            select(func.count(TradeLearning.id))
            .where(TradeLearning.owner_username == user.username)
        )
        job_count = await session.execute(
            select(func.count(LearningJob.id))
            .where(LearningJob.owner_username == user.username)
        )
        best_learnings = await session.execute(
            select(TradeLearning)
            .where(
                TradeLearning.owner_username == user.username,
                TradeLearning.win_rate >= 0.6,
                TradeLearning.sample_count >= 5,
            )
            .order_by(TradeLearning.win_rate.desc())
            .limit(5)
        )

        yt_n = yt_count.scalar() or 0
        tl_n = tl_count.scalar() or 0
        job_n = job_count.scalar() or 0
        top_patterns = best_learnings.scalars().all()

    return {
        "youtube_insights_total": yt_n,
        "trade_learnings_total": tl_n,
        "learning_jobs_total": job_n,
        "top_performing_patterns": [
            {
                "ticker": tl.ticker,
                "direction": tl.direction,
                "win_rate": tl.win_rate,
                "sample_count": tl.sample_count,
                "avg_return_pct": tl.avg_return_pct,
            }
            for tl in top_patterns
        ],
    }
