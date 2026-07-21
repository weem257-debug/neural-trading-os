"""
Tests for the 24/7 market scanner (ADR 0003) scan-loop orchestration:
single-runner gating, cap-gate mid-run stop, dedup, and ledger recording.
"""
import asyncio
import os
import tempfile
from datetime import datetime, timedelta, UTC

import pytest


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(scope="module")
def loop_db():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_scan_loop_")
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


def _candidate(symbol, score=80.0, direction="BUY"):
    from app.services.scanner.prefilter import Candidate
    return Candidate(
        symbol=symbol,
        score=score,
        direction=direction,
        reasons=[f"{symbol} reason"],
        last_price=100.0,
        indicators={"rsi_14": 25.0},
    )


def _fake_result(direction="BUY"):
    return {
        "direction": direction,
        "confidence": 0.8,
        "price_target": 120.0,
        "stop_loss": 90.0,
        "time_horizon": "1w",
        "reasoning": "Solide Bestätigung.",
        "model": "claude-sonnet-4-6",
    }


_FAKE_USAGE = {"input_tokens": 1000, "output_tokens": 500, "cache_read_tokens": 0, "cache_write_tokens": 0}


async def _clear(get_session, models):
    from sqlalchemy import delete
    async with get_session() as s:
        await s.execute(delete(models.SignalRecord))
        await s.execute(delete(models.ScanCostDaily))
        await s.execute(delete(models.ScanCostEntry))
        await s.commit()


async def _count_signals(get_session, models):
    from sqlalchemy import select, func
    async with get_session() as s:
        res = await s.execute(select(func.count()).select_from(models.SignalRecord))
        return res.scalar()


def _patch_common(monkeypatch, candidates):
    """Patch prefilter + deep_analyze + no-op delivery on the scan_loop module."""
    from app.services.scanner import scan_loop

    async def fake_prefilter(symbols, top_n=None):
        return candidates[:top_n] if top_n else candidates

    async def fake_deep(cand):
        return _fake_result(cand.direction), dict(_FAKE_USAGE)

    async def fake_deliver(signal, now=None):
        return 0

    monkeypatch.setattr(scan_loop, "run_prefilter", fake_prefilter)
    monkeypatch.setattr(scan_loop, "deep_analyze", fake_deep)
    monkeypatch.setattr(scan_loop, "deliver_signal", fake_deliver)
    monkeypatch.setattr(scan_loop, "estimate_call_cost", lambda: 0.01)


# ===========================================================================
class TestSingleRunnerGate:
    def test_cycle_skips_when_lock_not_acquired(self, loop_db, monkeypatch):
        from app.services.scanner import scan_loop
        _run(_clear(loop_db["get_session"], loop_db["models"]))
        _patch_common(monkeypatch, [_candidate("AAPL")])

        async def no_lock(session):
            return False

        monkeypatch.setattr(scan_loop, "try_acquire_scan_lock", no_lock)
        out = _run(scan_loop.run_scan_cycle(deliver=False))
        assert out["status"] == "skipped_locked"
        assert out["analyzed"] == 0
        assert _run(_count_signals(loop_db["get_session"], loop_db["models"])) == 0


# ===========================================================================
class TestCapGateMidRun:
    def test_cap_reached_midrun_stops_and_does_not_overspend(self, loop_db, monkeypatch):
        from app.services.scanner import scan_loop
        gs, models = loop_db["get_session"], loop_db["models"]
        _run(_clear(gs, models))
        _patch_common(monkeypatch, [_candidate("AAA"), _candidate("BBB"), _candidate("CCC")])
        monkeypatch.setattr(scan_loop, "try_acquire_scan_lock", lambda s: _true())

        # can_spend allows exactly 2 calls, then blocks.
        calls = {"n": 0}

        async def gated(estimate):
            calls["n"] += 1
            return calls["n"] <= 2

        monkeypatch.setattr(scan_loop, "can_spend", gated)
        out = _run(scan_loop.run_scan_cycle(deliver=False))
        assert out["cap_reached"] is True
        assert out["analyzed"] == 2  # third blocked before any spend
        assert _run(_count_signals(gs, models)) == 2

    def test_cap_blocks_all_when_estimate_never_fits(self, loop_db, monkeypatch):
        from app.services.scanner import scan_loop
        gs, models = loop_db["get_session"], loop_db["models"]
        _run(_clear(gs, models))
        _patch_common(monkeypatch, [_candidate("AAA"), _candidate("BBB")])
        monkeypatch.setattr(scan_loop, "try_acquire_scan_lock", lambda s: _true())

        async def never(estimate):
            return False

        monkeypatch.setattr(scan_loop, "can_spend", never)
        out = _run(scan_loop.run_scan_cycle(deliver=False))
        assert out["cap_reached"] is True
        assert out["analyzed"] == 0
        assert _run(_count_signals(gs, models)) == 0


# ===========================================================================
class TestDedup:
    def test_recent_scanner_signal_is_skipped(self, loop_db, monkeypatch):
        from app.services.scanner import scan_loop
        gs, models = loop_db["get_session"], loop_db["models"]
        _run(_clear(gs, models))

        # Pre-seed a recent scanner signal for AAA.
        async def seed():
            import uuid
            async with gs() as s:
                s.add(models.SignalRecord(
                    id=str(uuid.uuid4()), ticker="AAA", direction="BUY", confidence=0.7,
                    reasoning="x", source="scanner:claude-sonnet-4-6",
                    generated_at=datetime.now(UTC) - timedelta(hours=1),
                ))
                await s.commit()
        _run(seed())

        _patch_common(monkeypatch, [_candidate("AAA"), _candidate("BBB")])
        monkeypatch.setattr(scan_loop, "try_acquire_scan_lock", lambda s: _true())
        monkeypatch.setattr(scan_loop, "can_spend", lambda e: _true())

        out = _run(scan_loop.run_scan_cycle(deliver=False))
        assert out["skipped_duplicate"] == 1
        assert out["analyzed"] == 1  # only BBB
        tickers = {sig["ticker"] for sig in out["signals"]}
        assert tickers == {"BBB"}

    def test_old_signal_outside_window_does_not_block(self, loop_db, monkeypatch):
        from app.services.scanner import scan_loop
        gs, models = loop_db["get_session"], loop_db["models"]
        _run(_clear(gs, models))

        async def seed():
            import uuid
            async with gs() as s:
                s.add(models.SignalRecord(
                    id=str(uuid.uuid4()), ticker="AAA", direction="BUY", confidence=0.7,
                    reasoning="x", source="scanner:claude-sonnet-4-6",
                    generated_at=datetime.now(UTC) - timedelta(hours=48),
                ))
                await s.commit()
        _run(seed())

        _patch_common(monkeypatch, [_candidate("AAA")])
        monkeypatch.setattr(scan_loop, "try_acquire_scan_lock", lambda s: _true())
        monkeypatch.setattr(scan_loop, "can_spend", lambda e: _true())

        out = _run(scan_loop.run_scan_cycle(deliver=False))
        assert out["skipped_duplicate"] == 0
        assert out["analyzed"] == 1


# ===========================================================================
class TestLedgerRecording:
    def test_spend_is_recorded_for_each_analysis(self, loop_db, monkeypatch):
        from app.services.scanner import scan_loop
        gs, models = loop_db["get_session"], loop_db["models"]
        _run(_clear(gs, models))
        _patch_common(monkeypatch, [_candidate("AAA"), _candidate("BBB")])
        monkeypatch.setattr(scan_loop, "try_acquire_scan_lock", lambda s: _true())
        monkeypatch.setattr(scan_loop, "can_spend", lambda e: _true())
        monkeypatch.setattr(scan_loop.settings, "SCAN_DAILY_CAP_USD", 1000.0)

        out = _run(scan_loop.run_scan_cycle(deliver=False))
        assert out["analyzed"] == 2

        from sqlalchemy import select
        from app.services.scanner.cost_guard import _today_utc

        async def daily():
            async with gs() as s:
                res = await s.execute(select(models.ScanCostDaily).where(models.ScanCostDaily.date_utc == _today_utc()))
                return res.scalar_one_or_none()

        row = _run(daily())
        assert row is not None
        assert row.analyses_count == 2
        assert float(row.spent_usd) == pytest.approx(0.0105 * 2)


# small awaitable-returning helper so lambdas can be async-compatible
def _true():
    async def _a():
        return True
    return _a()
