"""
Self-Learning Feedback-Loop Tests — Neural Trading OS (Iteration #112)
=====================================================================

Up to #111 the learning subsystem could *extract* knowledge (YouTube insights)
and *batch-review* trade outcomes weekly, but the online feedback loop was never
wired:

  - ``process_new_performance`` (the post-trade hook) was never called from the
    signal-performance evaluation loop, so TradeLearning counters only moved once
    a week and only after n>=3 samples existed.
  - YoutubeInsight.times_validated / times_invalidated / confidence_score were
    declared on the model but never mutated, so the knowledge base could not
    learn which insights actually paid off.
  - TradeLearning.owner_username was left NULL, breaking tenant isolation in the
    RAG retriever and the /api/learning API.

These tests exercise the now-closed loop directly against a throwaway SQLite DB:

  1. First outcome seeds a TradeLearning immediately (no weekly-batch wait).
  2. Subsequent outcomes update win_rate / avg_return incrementally (online).
  3. A winning trade validates the surfaced insights and lifts their confidence;
     a losing trade invalidates them and lowers it (clamped).
  4. The RAG validation boost re-ranks validated insights above stale ones.

Run:
    cd dashboard/backend
    pytest tests/test_learning_feedback_loop.py -v
"""
import asyncio
import os
import tempfile

import pytest


def _run(coro):
    """Run an async coroutine on a fresh event loop (independent of any app loop)."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Isolated throwaway-DB fixture (no HTTP surface needed — pure service logic)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def learning_db():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_learning_")
    os.close(db_fd)
    os.environ["TRADING_DB_PATH"] = db_path
    os.environ.pop("DATABASE_URL", None)
    # Force template-based phrasing (no Claude/network) in trade_reviewer.
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
# Helpers
# ---------------------------------------------------------------------------

async def _add_insight(get_session, models, *, video_id, confidence=0.5,
                       strategy="momentum", text="momentum breakout setup"):
    async with get_session() as session:
        session.add(models.YoutubeInsight(
            video_id=video_id,
            video_title=f"Title {video_id}",
            channel="TestChannel",
            insight_text=text,
            strategy=strategy,
            timeframe="1d",
            market_condition="trending",
            asset_class="equities",
            confidence_score=confidence,
        ))
        await session.commit()


async def _get_learning(get_session, models, ticker, direction):
    from sqlalchemy import select
    async with get_session() as session:
        res = await session.execute(
            select(models.TradeLearning).where(
                models.TradeLearning.ticker == ticker,
                models.TradeLearning.direction == direction,
            )
        )
        return res.scalar_one_or_none()


async def _get_insight(get_session, models, video_id):
    from sqlalchemy import select
    async with get_session() as session:
        res = await session.execute(
            select(models.YoutubeInsight).where(
                models.YoutubeInsight.video_id == video_id
            )
        )
        return res.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_first_outcome_seeds_learning_immediately(learning_db):
    """A brand-new (ticker, direction) gets a TradeLearning on the very first
    outcome — no weekly batch / n>=3 wait."""
    gs, models = learning_db["get_session"], learning_db["models"]
    from app.services.learning.trade_reviewer import process_new_performance

    result = _run(process_new_performance(
        signal_id="sig-seed-1", ticker="SEED", direction="BUY",
        return_pct=0.05, confidence=0.82, owner_username="alice",
    ))
    assert result["learning_created"] is True

    rec = _run(_get_learning(gs, models, "SEED", "BUY"))
    assert rec is not None
    assert rec.sample_count == 1
    assert rec.win_rate == 1.0          # +5% counts as a win
    assert rec.owner_username == "alice"  # tenant scoping preserved
    assert abs(rec.avg_return_pct - 5.0) < 1e-6


def test_subsequent_outcomes_update_online(learning_db):
    """Win-rate and avg-return update incrementally as outcomes stream in."""
    gs, models = learning_db["get_session"], learning_db["models"]
    from app.services.learning.trade_reviewer import process_new_performance

    _run(process_new_performance(
        signal_id="sig-on-1", ticker="ONLINE", direction="BUY",
        return_pct=0.10, confidence=0.7, owner_username="bob",
    ))  # win
    _run(process_new_performance(
        signal_id="sig-on-2", ticker="ONLINE", direction="BUY",
        return_pct=-0.04, confidence=0.7, owner_username="bob",
    ))  # loss

    rec = _run(_get_learning(gs, models, "ONLINE", "BUY"))
    assert rec.sample_count == 2
    assert abs(rec.win_rate - 0.5) < 1e-6              # 1 win / 2
    assert abs(rec.avg_return_pct - 3.0) < 1e-6        # mean(+10, -4) = +3


def test_winning_trade_validates_insights(learning_db):
    """A winning outcome bumps times_validated and lifts insight confidence."""
    gs, models = learning_db["get_session"], learning_db["models"]
    from app.services.learning.trade_reviewer import process_new_performance

    _run(_add_insight(gs, models, video_id="winvid01234", confidence=0.50))

    _run(process_new_performance(
        signal_id="sig-win-1", ticker="WIN", direction="BUY",
        return_pct=0.08, confidence=0.9,
    ))

    yi = _run(_get_insight(gs, models, "winvid01234"))
    assert yi.times_validated == 1
    assert yi.times_invalidated == 0
    assert yi.confidence_score > 0.50      # nudged up


def test_losing_trade_invalidates_insights(learning_db):
    """A losing outcome bumps times_invalidated and lowers insight confidence."""
    gs, models = learning_db["get_session"], learning_db["models"]
    from app.services.learning.trade_reviewer import process_new_performance

    _run(_add_insight(gs, models, video_id="losevid0123", confidence=0.50))

    _run(process_new_performance(
        signal_id="sig-lose-1", ticker="LOSE", direction="BUY",
        return_pct=-0.06, confidence=0.9,
    ))

    yi = _run(_get_insight(gs, models, "losevid0123"))
    assert yi.times_invalidated >= 1
    assert yi.confidence_score < 0.50      # nudged down


def test_confidence_is_clamped(learning_db):
    """Repeated losses cannot drive confidence below the floor."""
    gs, models = learning_db["get_session"], learning_db["models"]
    from app.services.learning.trade_reviewer import apply_insight_feedback

    _run(_add_insight(gs, models, video_id="clampvid012", confidence=0.06))
    for _ in range(20):
        _run(apply_insight_feedback(ticker="CLAMP", won=False))

    yi = _run(_get_insight(gs, models, "clampvid012"))
    assert yi.confidence_score >= 0.05     # never underflows the floor


def test_rag_boost_prefers_validated_insights():
    """The retriever's validation boost ranks a well-validated insight above a
    repeatedly-invalidated one of equal keyword relevance."""
    from app.services.learning.rag_retriever import _validation_boost

    class _Fake:
        def __init__(self, v, iv, c):
            self.times_validated = v
            self.times_invalidated = iv
            self.confidence_score = c

    validated = _Fake(v=10, iv=0, c=0.9)
    invalidated = _Fake(v=0, iv=10, c=0.2)
    neutral = _Fake(v=0, iv=0, c=0.5)

    assert _validation_boost(validated) > _validation_boost(neutral)
    assert _validation_boost(invalidated) < _validation_boost(neutral)
    # Bounds hold.
    assert 0.5 <= _validation_boost(invalidated) <= 1.6
    assert 0.5 <= _validation_boost(validated) <= 1.6
