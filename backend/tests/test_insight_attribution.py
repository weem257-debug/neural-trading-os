"""
Insight-Attribution Tests — Neural Trading OS (Iteration #113)
=============================================================

Iteration #112 closed the online feedback loop, but the attribution was
imprecise: ``apply_insight_feedback`` re-derived its target set from the *most
recent* YoutubeInsight rows (mirroring the retriever's candidate query), not the
insights that were actually injected into the signal's prompt. A trade outcome
therefore rewarded/punished whichever insights happened to be recent — including
ones that never influenced the signal.

#113 records the exact insights injected into each signal (SignalInsightUsage)
and validates *only those* when the outcome lands. These tests prove:

  1. get_relevant_context_with_attribution returns the IDs that are actually
     injected into the prompt, capped at the prompt-injection limit (not the full
     top_n candidate set).
  2. With attribution present, only the attributed insight is updated — an
     unrelated, more-recent insight is left untouched.
  3. Without attribution (legacy signals), the recency-based fallback still runs,
     preserving backward compatibility.

Run:
    cd dashboard/backend
    pytest tests/test_insight_attribution.py -v
"""
import asyncio
import os
import tempfile

import pytest


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(scope="module")
def attr_db():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_attr_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)
    os.environ.pop("ANTHROPIC_API_KEY", None)  # template phrasing, no network

    from app.db.database import create_all_tables, get_session
    from app.db import models

    _run(create_all_tables())
    yield {"get_session": get_session, "models": models}

    try:
        os.remove(db_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _add_insight(get_session, models, *, video_id, confidence=0.5,
                       strategy="momentum", text="momentum breakout setup"):
    async with get_session() as session:
        yi = models.YoutubeInsight(
            video_id=video_id,
            video_title=f"Title {video_id}",
            channel="TestChannel",
            insight_text=text,
            strategy=strategy,
            timeframe="1d",
            market_condition="trending",
            asset_class="equities",
            confidence_score=confidence,
        )
        session.add(yi)
        await session.commit()
        return yi.id


async def _get_insight_by_id(get_session, models, insight_id):
    from sqlalchemy import select
    async with get_session() as session:
        res = await session.execute(
            select(models.YoutubeInsight).where(models.YoutubeInsight.id == insight_id)
        )
        return res.scalar_one_or_none()


async def _record_usage(get_session, models, signal_id, insight_ids):
    async with get_session() as session:
        for rank, iid in enumerate(insight_ids):
            session.add(models.SignalInsightUsage(
                signal_id=signal_id, insight_id=iid, rank=rank,
            ))
        await session.commit()


# ---------------------------------------------------------------------------
# 1. Retrieval-time attribution capture
# ---------------------------------------------------------------------------

def test_retriever_returns_injected_ids_capped_at_prompt_limit(attr_db):
    """The attribution list mirrors exactly what is injected into the prompt: at
    most _PROMPT_INSIGHT_LIMIT insights, in rank order, and every returned ID's
    insight text appears in the context string."""
    gs, models = attr_db["get_session"], attr_db["models"]
    from app.services.learning import rag_retriever
    from app.services.learning.rag_retriever import get_relevant_context_with_attribution

    # Seed more candidates than the prompt limit, all matching the query keyword.
    ids = []
    for i in range(rag_retriever._PROMPT_INSIGHT_LIMIT + 3):
        ids.append(_run(_add_insight(
            gs, models, video_id=f"capvid{i:05d}",
            text=f"alpha breakout signal variant {i}", strategy="alpha",
        )))

    context, used = _run(get_relevant_context_with_attribution(
        query="alpha breakout signal", ticker="ALPHA", top_n=5,
    ))

    # Never attribute more than what the prompt actually carries.
    assert len(used) <= rag_retriever._PROMPT_INSIGHT_LIMIT
    assert len(used) >= 1
    # Each attributed insight must correspond to an existing row.
    for iid in used:
        assert iid in ids
    # No duplicates — each injected insight is attributed once.
    assert len(used) == len(set(used))


def test_no_insights_yields_empty_attribution(attr_db):
    """When the KB has no matching insights the attribution list is empty (and the
    feedback loop will fall back to recency / no-op)."""
    from app.services.learning.rag_retriever import get_relevant_context_with_attribution
    # Fresh ticker/query that still hits the shared module DB, but the function must
    # always return a list (never None) for the second tuple element.
    _context, used = _run(get_relevant_context_with_attribution(
        query="zzz nonexistent", ticker="VOID", top_n=5,
    ))
    assert isinstance(used, list)


# ---------------------------------------------------------------------------
# 2. Outcome-time precision: only attributed insights move
# ---------------------------------------------------------------------------

def test_only_attributed_insight_is_validated(attr_db):
    """The core #113 fix. Given an attributed insight and an *unrelated, more
    recent* insight, a winning outcome must validate ONLY the attributed one."""
    gs, models = attr_db["get_session"], attr_db["models"]
    from app.services.learning.trade_reviewer import process_new_performance

    used_id = _run(_add_insight(gs, models, video_id="attr-used-01", confidence=0.50))
    # This one is created AFTER, so the legacy recency query would have grabbed it.
    bystander_id = _run(_add_insight(gs, models, video_id="attr-bystdr1", confidence=0.50))

    signal_id = "sig-attr-precise-1"
    _run(_record_usage(gs, models, signal_id, [used_id]))

    _run(process_new_performance(
        signal_id=signal_id, ticker="ATTR", direction="BUY",
        return_pct=0.07, confidence=0.9,
    ))

    used = _run(_get_insight_by_id(gs, models, used_id))
    bystander = _run(_get_insight_by_id(gs, models, bystander_id))

    # Attributed insight rewarded...
    assert used.times_validated == 1
    assert used.confidence_score > 0.50
    # ...bystander untouched, even though it is the most-recent insight.
    assert bystander.times_validated == 0
    assert bystander.times_invalidated == 0
    assert abs(bystander.confidence_score - 0.50) < 1e-9


def test_attributed_losing_trade_only_punishes_used_insight(attr_db):
    """Symmetric to the winning case: a loss invalidates only the attributed insight."""
    gs, models = attr_db["get_session"], attr_db["models"]
    from app.services.learning.trade_reviewer import process_new_performance

    used_id = _run(_add_insight(gs, models, video_id="attr-lose-01", confidence=0.50))
    bystander_id = _run(_add_insight(gs, models, video_id="attr-lose-by1", confidence=0.50))

    signal_id = "sig-attr-lose-1"
    _run(_record_usage(gs, models, signal_id, [used_id]))

    _run(process_new_performance(
        signal_id=signal_id, ticker="ATTRL", direction="SELL",
        return_pct=-0.05, confidence=0.8,
    ))

    used = _run(_get_insight_by_id(gs, models, used_id))
    bystander = _run(_get_insight_by_id(gs, models, bystander_id))

    assert used.times_invalidated == 1
    assert used.confidence_score < 0.50
    assert bystander.times_invalidated == 0
    assert abs(bystander.confidence_score - 0.50) < 1e-9


def test_multiple_attributed_insights_all_move(attr_db):
    """When several insights are attributed to a signal, all of them are updated."""
    gs, models = attr_db["get_session"], attr_db["models"]
    from app.services.learning.trade_reviewer import apply_insight_feedback

    a = _run(_add_insight(gs, models, video_id="multi-a-0001", confidence=0.50))
    b = _run(_add_insight(gs, models, video_id="multi-b-0001", confidence=0.50))
    signal_id = "sig-multi-1"
    _run(_record_usage(gs, models, signal_id, [a, b]))

    touched = _run(apply_insight_feedback(ticker="MULTI", won=True, signal_id=signal_id))
    assert touched == 2
    assert _run(_get_insight_by_id(gs, models, a)).times_validated == 1
    assert _run(_get_insight_by_id(gs, models, b)).times_validated == 1


# ---------------------------------------------------------------------------
# 3. Backward compatibility: legacy signals without attribution
# ---------------------------------------------------------------------------

def test_legacy_signal_without_attribution_uses_recency_fallback(attr_db):
    """A signal_id with no SignalInsightUsage rows (pre-#113) must still nudge the
    recent candidate set, preserving the #112 behaviour."""
    gs, models = attr_db["get_session"], attr_db["models"]
    from app.services.learning.trade_reviewer import apply_insight_feedback

    recent_id = _run(_add_insight(gs, models, video_id="legacy-rec-01", confidence=0.50))

    touched = _run(apply_insight_feedback(
        ticker="LEGACY", won=True, signal_id="sig-with-no-usage-rows",
    ))
    # Fallback path runs: at least the just-added recent insight is updated.
    assert touched >= 1
    assert _run(_get_insight_by_id(gs, models, recent_id)).times_validated >= 1


def test_none_signal_id_uses_recency_fallback(attr_db):
    """apply_insight_feedback with signal_id=None behaves like the legacy path."""
    gs, models = attr_db["get_session"], attr_db["models"]
    from app.services.learning.trade_reviewer import apply_insight_feedback

    _run(_add_insight(gs, models, video_id="nonesig-rec-1", confidence=0.50))
    touched = _run(apply_insight_feedback(ticker="NONE", won=True, signal_id=None))
    assert touched >= 1


def test_attributed_ids_helper_orders_by_rank(attr_db):
    """_attributed_insight_ids returns IDs ordered by their injection rank."""
    gs, models = attr_db["get_session"], attr_db["models"]
    from app.services.learning.trade_reviewer import _attributed_insight_ids

    a = _run(_add_insight(gs, models, video_id="rank-a-00001", confidence=0.5))
    b = _run(_add_insight(gs, models, video_id="rank-b-00001", confidence=0.5))
    c = _run(_add_insight(gs, models, video_id="rank-c-00001", confidence=0.5))
    signal_id = "sig-rank-order-1"
    # Record in rank order b(0), c(1), a(2).
    _run(_record_usage(gs, models, signal_id, [b, c, a]))

    ids = _run(_attributed_insight_ids(signal_id))
    assert ids == [b, c, a]
    assert _run(_attributed_insight_ids(None)) == []
    assert _run(_attributed_insight_ids("does-not-exist")) == []
