"""
Money-critical foundation tests for the 24/7 market scanner (ADR 0003):
cost table, fail-closed daily cap gate, atomic spend ledger, threshold alerts
and the single-runner advisory-lock guard.
"""
import asyncio
import os
import tempfile

import pytest


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(scope="module")
def scanner_db():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_scanner_cost_")
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
# Helpers
# ---------------------------------------------------------------------------

async def _clear_daily(get_session, models):
    from sqlalchemy import delete
    async with get_session() as session:
        await session.execute(delete(models.ScanCostDaily))
        await session.execute(delete(models.ScanCostEntry))
        await session.commit()


async def _seed_spent(get_session, models, amount):
    from app.services.scanner.cost_guard import _today_utc
    async with get_session() as session:
        session.add(models.ScanCostDaily(date_utc=_today_utc(), spent_usd=amount, analyses_count=1))
        await session.commit()


async def _daily_row(get_session, models):
    from sqlalchemy import select
    from app.services.scanner.cost_guard import _today_utc
    async with get_session() as session:
        res = await session.execute(
            select(models.ScanCostDaily).where(models.ScanCostDaily.date_utc == _today_utc())
        )
        return res.scalar_one_or_none()


# ===========================================================================
class TestCostOfUsage:
    def test_sonnet_input_output_only(self):
        from app.services.scanner.cost import cost_of_usage
        # 1000 * 3.0/1e6 + 500 * 15.0/1e6 = 0.003 + 0.0075
        assert cost_of_usage("claude-sonnet-4-6", 1000, 500) == pytest.approx(0.0105)

    def test_sonnet_includes_cache_read_and_write(self):
        from app.services.scanner.cost import cost_of_usage
        c = cost_of_usage("claude-sonnet-4-6", 1000, 500, 2000, 400)
        # + 2000 * 0.3/1e6 + 400 * 3.75/1e6 = 0.0006 + 0.0015
        assert c == pytest.approx(0.0105 + 0.0006 + 0.0015)

    def test_sonnet_5_alias_prices_identically_to_sonnet_4_6(self):
        from app.services.scanner.cost import cost_of_usage
        assert cost_of_usage("claude-sonnet-5", 1234, 567, 89, 10) == pytest.approx(
            cost_of_usage("claude-sonnet-4-6", 1234, 567, 89, 10)
        )

    def test_haiku_pricing(self):
        from app.services.scanner.cost import cost_of_usage
        # 1000 * 1.0/1e6 + 500 * 5.0/1e6 = 0.001 + 0.0025
        assert cost_of_usage("claude-haiku-4-5-20251001", 1000, 500) == pytest.approx(0.0035)

    def test_zero_tokens_zero_cost(self):
        from app.services.scanner.cost import cost_of_usage
        assert cost_of_usage("claude-sonnet-4-6", 0, 0, 0, 0) == 0.0

    def test_unknown_model_falls_back_to_most_expensive_known_rate_never_zero(self):
        from app.services.scanner.cost import cost_of_usage
        unknown = cost_of_usage("brand-new-model", 1000, 500)
        sonnet = cost_of_usage("claude-sonnet-4-6", 1000, 500)
        haiku = cost_of_usage("claude-haiku-4-5-20251001", 1000, 500)
        assert unknown == pytest.approx(sonnet)
        assert unknown >= haiku
        assert unknown > 0

    def test_unknown_model_with_small_usage_still_nonzero(self):
        from app.services.scanner.cost import cost_of_usage
        assert cost_of_usage("who-knows", 1, 1) > 0


# ===========================================================================
class TestCanSpendFailClosed:
    def test_db_error_returns_false(self, scanner_db, monkeypatch):
        from app.services.scanner import cost_guard

        class _BoomSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def execute(self, *a, **k):
                raise RuntimeError("db down")

        def _boom():
            return _BoomSession()

        monkeypatch.setattr(cost_guard, "get_session", _boom)
        assert _run(cost_guard.can_spend(0.01)) is False

    def test_no_ledger_row_yet_is_zero_spent(self, scanner_db, monkeypatch):
        from app.services.scanner import cost_guard
        _run(_clear_daily(scanner_db["get_session"], scanner_db["models"]))
        monkeypatch.setattr(cost_guard.settings, "SCAN_DAILY_CAP_USD", 5.0)
        # nothing spent yet -> a 1.0 estimate is fine
        assert _run(cost_guard.can_spend(1.0)) is True


# ===========================================================================
class TestCanSpendCapEnforcement:
    def test_blocks_when_estimate_would_exceed_cap(self, scanner_db, monkeypatch):
        from app.services.scanner import cost_guard
        gs, models = scanner_db["get_session"], scanner_db["models"]
        _run(_clear_daily(gs, models))
        monkeypatch.setattr(cost_guard.settings, "SCAN_DAILY_CAP_USD", 10.0)
        _run(_seed_spent(gs, models, 9.5))
        assert _run(cost_guard.can_spend(1.0)) is False

    def test_allows_when_estimate_stays_within_cap(self, scanner_db, monkeypatch):
        from app.services.scanner import cost_guard
        gs, models = scanner_db["get_session"], scanner_db["models"]
        _run(_clear_daily(gs, models))
        monkeypatch.setattr(cost_guard.settings, "SCAN_DAILY_CAP_USD", 10.0)
        _run(_seed_spent(gs, models, 5.0))
        assert _run(cost_guard.can_spend(1.0)) is True

    def test_exactly_at_cap_boundary_is_allowed(self, scanner_db, monkeypatch):
        from app.services.scanner import cost_guard
        gs, models = scanner_db["get_session"], scanner_db["models"]
        _run(_clear_daily(gs, models))
        monkeypatch.setattr(cost_guard.settings, "SCAN_DAILY_CAP_USD", 10.0)
        _run(_seed_spent(gs, models, 9.0))
        # 9.0 + 1.0 == 10.0 exactly -> inclusive boundary allows it
        assert _run(cost_guard.can_spend(1.0)) is True


# ===========================================================================
class TestRecordSpendAtomicIncrement:
    def test_single_call_writes_entry_and_daily_aggregate(self, scanner_db, monkeypatch):
        from app.services.scanner import cost_guard
        gs, models = scanner_db["get_session"], scanner_db["models"]
        _run(_clear_daily(gs, models))
        monkeypatch.setattr(cost_guard.settings, "SCAN_DAILY_CAP_USD", 1000.0)
        out = _run(cost_guard.record_spend("AAPL", "claude-sonnet-4-6", {"input_tokens": 1000, "output_tokens": 500}))
        assert out["cost_usd"] == pytest.approx(0.0105)
        row = _run(_daily_row(gs, models))
        assert row is not None
        assert float(row.spent_usd) == pytest.approx(0.0105)
        assert row.analyses_count == 1

    def test_multiple_calls_increment_atomically_not_lost(self, scanner_db, monkeypatch):
        from app.services.scanner import cost_guard
        gs, models = scanner_db["get_session"], scanner_db["models"]
        _run(_clear_daily(gs, models))
        monkeypatch.setattr(cost_guard.settings, "SCAN_DAILY_CAP_USD", 1000.0)

        async def _many():
            await asyncio.gather(*[
                cost_guard.record_spend("SYM", "claude-sonnet-4-6", {"input_tokens": 1000, "output_tokens": 500})
                for _ in range(5)
            ])

        _run(_many())
        row = _run(_daily_row(gs, models))
        assert row.analyses_count == 5
        assert float(row.spent_usd) == pytest.approx(0.0105 * 5)

    def test_first_call_of_day_creates_row_second_call_increments_it(self, scanner_db, monkeypatch):
        from app.services.scanner import cost_guard
        gs, models = scanner_db["get_session"], scanner_db["models"]
        _run(_clear_daily(gs, models))
        monkeypatch.setattr(cost_guard.settings, "SCAN_DAILY_CAP_USD", 1000.0)
        _run(cost_guard.record_spend("A", "claude-haiku-4-5-20251001", {"input_tokens": 1000, "output_tokens": 500}))
        _run(cost_guard.record_spend("B", "claude-haiku-4-5-20251001", {"input_tokens": 1000, "output_tokens": 500}))
        row = _run(_daily_row(gs, models))
        assert row.analyses_count == 2
        assert float(row.spent_usd) == pytest.approx(0.0035 * 2)


# ===========================================================================
class TestThresholdAlerts:
    def test_crossing_50_percent_logs_warning(self, caplog):
        from app.services.scanner.cost_guard import _check_thresholds
        import logging
        with caplog.at_level(logging.WARNING):
            _check_thresholds(prev_spent=4.0, new_spent=6.0, cap=10.0)
        assert any("scan_cost_threshold_alert" in r.message for r in caplog.records)

    def test_no_alert_when_no_threshold_crossed(self, caplog):
        from app.services.scanner.cost_guard import _check_thresholds
        import logging
        with caplog.at_level(logging.WARNING):
            _check_thresholds(prev_spent=1.0, new_spent=2.0, cap=10.0)
        assert not any("scan_cost_threshold_alert" in r.message for r in caplog.records)


# ===========================================================================
class TestSingleRunnerGuard:
    def test_sqlite_always_acquires(self, scanner_db):
        from app.services.scanner.single_runner import try_acquire_scan_lock

        async def _check():
            async with scanner_db["get_session"]() as session:
                return await try_acquire_scan_lock(session)

        assert _run(_check()) is True
