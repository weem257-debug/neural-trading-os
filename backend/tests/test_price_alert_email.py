"""Regression test: the price-alert e-mail path must reach send_mail.

Before 648bc8c `_send_price_alert_email` imported a non-existent
`get_settings` from app.core.config; the ImportError was swallowed by the
function's own `except Exception` and no e-mail was ever sent.
"""
from __future__ import annotations

import pytest

from app.services.price_alerts import manager


class _Result:
    def __init__(self, user):
        self._user = user

    def scalar_one_or_none(self):
        return self._user


class _Session:
    def __init__(self, user):
        self._user = user

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, _stmt):
        return _Result(self._user)


class _User:
    username = "alice"
    email = "alice@example.com"


@pytest.mark.asyncio
async def test_price_alert_email_is_handed_to_send_mail(monkeypatch):
    import app.api.auth as auth_mod
    import app.core.email as email_mod
    import app.db.database as db_mod
    from app.core.config import settings

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.test", raising=False)
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://app.example.test", raising=False)
    monkeypatch.setattr(auth_mod, "_is_unsubscribed", lambda _u: False)
    monkeypatch.setattr(auth_mod, "_unsubscribe_url", lambda _u: "https://app.example.test/unsubscribe?t=x")
    monkeypatch.setattr(db_mod, "_AsyncSessionFactory", lambda: _Session(_User()))

    calls: list[dict] = []

    async def fake_send_mail(to, subject, text, html=None, unsub_url=None, **kwargs):
        calls.append({"to": to, "subject": subject, "text": text, "html": html, "unsub_url": unsub_url, **kwargs})
        return True

    monkeypatch.setattr(email_mod, "send_mail", fake_send_mail)

    await manager._send_price_alert_email(
        "alice",
        {"ticker": "AAPL", "condition": "above", "threshold": 200, "fired_price": 201.5},
    )

    assert len(calls) == 1, "send_mail was not called — the price-alert e-mail path is broken again"
    sent = calls[0]
    assert sent["to"] == "alice@example.com"
    assert "AAPL" in sent["subject"]
    assert "201.5" in sent["html"]
    assert sent["unsub_url"] == "https://app.example.test/unsubscribe?t=x"


@pytest.mark.asyncio
async def test_price_alert_email_skipped_without_smtp(monkeypatch):
    import app.core.email as email_mod
    from app.core.config import settings

    monkeypatch.setattr(settings, "SMTP_HOST", "", raising=False)
    called = []

    async def fake_send_mail(*a, **k):
        called.append(1)
        return True

    monkeypatch.setattr(email_mod, "send_mail", fake_send_mail)
    await manager._send_price_alert_email("alice", {"ticker": "AAPL"})
    assert called == []
