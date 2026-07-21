"""
Tests for the 24/7 market scanner (ADR 0003) per-user delivery:
watchlist matching, quiet-hours suppression, and Telegram fanout.
"""
import asyncio
import os
import tempfile
import uuid
from datetime import datetime, UTC

import pytest


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(scope="module")
def deliv_db():
    db_fd, db_path = tempfile.mkstemp(suffix=".db", prefix="test_scan_deliv_")
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


async def _clear(gs, models):
    from sqlalchemy import delete
    async with gs() as s:
        await s.execute(delete(models.AnalysisWatchlist))
        await s.execute(delete(models.TelegramChat))
        await s.execute(delete(models.SignalRecord))
        await s.commit()


async def _add_watch(gs, models, username, symbol):
    async with gs() as s:
        s.add(models.AnalysisWatchlist(owner_username=username, symbol=symbol))
        await s.commit()


async def _add_chat(gs, models, username, chat_id):
    async with gs() as s:
        s.add(models.TelegramChat(user_id=username, chat_id=chat_id))
        await s.commit()


def _signal(ticker="AAPL", direction="BUY"):
    from app.db.models import SignalRecord
    return SignalRecord(
        id=str(uuid.uuid4()), ticker=ticker, direction=direction, confidence=0.82,
        reasoning="Bestätigter Aufwärtstrend.", source="scanner:claude-sonnet-4-6",
        generated_at=datetime.now(UTC), price_target=120.0, stop_loss=90.0, time_horizon="1w",
    )


# ===========================================================================
class TestQuietHours:
    def test_wrapping_window_night_is_quiet(self, monkeypatch):
        from app.services.scanner import delivery
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 22)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 6)
        assert delivery.in_quiet_hours(datetime(2025, 1, 8, 23, 0, tzinfo=UTC)) is True
        assert delivery.in_quiet_hours(datetime(2025, 1, 8, 3, 0, tzinfo=UTC)) is True

    def test_wrapping_window_day_is_active(self, monkeypatch):
        from app.services.scanner import delivery
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 22)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 6)
        assert delivery.in_quiet_hours(datetime(2025, 1, 8, 12, 0, tzinfo=UTC)) is False

    def test_equal_start_end_disables_quiet_hours(self, monkeypatch):
        from app.services.scanner import delivery
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 0)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 0)
        assert delivery.in_quiet_hours(datetime(2025, 1, 8, 3, 0, tzinfo=UTC)) is False

    def test_non_wrapping_window(self, monkeypatch):
        from app.services.scanner import delivery
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 1)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 5)
        assert delivery.in_quiet_hours(datetime(2025, 1, 8, 3, 0, tzinfo=UTC)) is True
        assert delivery.in_quiet_hours(datetime(2025, 1, 8, 6, 0, tzinfo=UTC)) is False


# ===========================================================================
class TestDelivery:
    def test_delivers_to_matching_watcher_with_chat(self, deliv_db, monkeypatch):
        from app.services.scanner import delivery
        gs, models = deliv_db["get_session"], deliv_db["models"]
        _run(_clear(gs, models))
        _run(_add_watch(gs, models, "alice", "AAPL"))
        _run(_add_chat(gs, models, "alice", "chat-alice"))

        sent_to = []

        async def fake_send(chat_id, text, **kwargs):
            sent_to.append(chat_id)
            return True

        monkeypatch.setattr(delivery, "send_message", fake_send)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 0)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 0)

        n = _run(delivery.deliver_signal(_signal("AAPL"), now=datetime(2025, 1, 8, 12, 0, tzinfo=UTC)))
        assert n == 1
        assert sent_to == ["chat-alice"]

    def test_no_watchlist_match_delivers_nothing(self, deliv_db, monkeypatch):
        from app.services.scanner import delivery
        gs, models = deliv_db["get_session"], deliv_db["models"]
        _run(_clear(gs, models))
        _run(_add_watch(gs, models, "alice", "TSLA"))
        _run(_add_chat(gs, models, "alice", "chat-alice"))

        async def fake_send(chat_id, text, **kwargs):
            raise AssertionError("should not send")

        monkeypatch.setattr(delivery, "send_message", fake_send)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 0)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 0)

        n = _run(delivery.deliver_signal(_signal("AAPL"), now=datetime(2025, 1, 8, 12, 0, tzinfo=UTC)))
        assert n == 0

    def test_watcher_without_telegram_chat_is_not_counted(self, deliv_db, monkeypatch):
        from app.services.scanner import delivery
        gs, models = deliv_db["get_session"], deliv_db["models"]
        _run(_clear(gs, models))
        _run(_add_watch(gs, models, "bob", "AAPL"))  # bob has no telegram chat

        async def fake_send(chat_id, text, **kwargs):
            raise AssertionError("should not send")

        monkeypatch.setattr(delivery, "send_message", fake_send)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 0)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 0)

        n = _run(delivery.deliver_signal(_signal("AAPL"), now=datetime(2025, 1, 8, 12, 0, tzinfo=UTC)))
        assert n == 0

    def test_quiet_hours_suppresses_push(self, deliv_db, monkeypatch):
        from app.services.scanner import delivery
        gs, models = deliv_db["get_session"], deliv_db["models"]
        _run(_clear(gs, models))
        _run(_add_watch(gs, models, "alice", "AAPL"))
        _run(_add_chat(gs, models, "alice", "chat-alice"))

        async def fake_send(chat_id, text, **kwargs):
            raise AssertionError("must not send during quiet hours")

        monkeypatch.setattr(delivery, "send_message", fake_send)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 22)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 6)

        n = _run(delivery.deliver_signal(_signal("AAPL"), now=datetime(2025, 1, 8, 3, 0, tzinfo=UTC)))
        assert n == 0

    def test_multiple_watchers_each_get_one_push(self, deliv_db, monkeypatch):
        from app.services.scanner import delivery
        gs, models = deliv_db["get_session"], deliv_db["models"]
        _run(_clear(gs, models))
        _run(_add_watch(gs, models, "alice", "AAPL"))
        _run(_add_chat(gs, models, "alice", "chat-alice"))
        _run(_add_watch(gs, models, "carol", "AAPL"))
        _run(_add_chat(gs, models, "carol", "chat-carol"))

        sent = []

        async def fake_send(chat_id, text, **kwargs):
            sent.append(chat_id)
            return True

        monkeypatch.setattr(delivery, "send_message", fake_send)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_START_UTC", 0)
        monkeypatch.setattr(delivery.settings, "SCAN_QUIET_HOURS_END_UTC", 0)

        n = _run(delivery.deliver_signal(_signal("AAPL"), now=datetime(2025, 1, 8, 12, 0, tzinfo=UTC)))
        assert n == 2
        assert set(sent) == {"chat-alice", "chat-carol"}
