"""
F-12 / F-17 — WebSocket owner-scoped broadcast tests.

Regression guard for a cross-tenant PII leak: a fired price alert (carrying the
owner's username/ticker/threshold/fired_price) was broadcast to EVERY
authenticated subscriber of the shared "alerts" channel. The manager must now
deliver owner-scoped messages only to the owning user's own connections.
"""
import asyncio
import json

from app.websocket.manager import WebSocketManager


class FakeWS:
    """Minimal async WebSocket stub capturing sent frames."""

    def __init__(self):
        self.sent: list[dict] = []
        self.accepted = False

    async def accept(self, subprotocol=None):
        self.accepted = True

    async def send_text(self, text: str):
        self.sent.append(json.loads(text))

    def alerts(self) -> list[dict]:
        return [m for m in self.sent if m.get("type") == "price_alert_fired"]


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_owner_scoped_alert_only_reaches_owner():
    mgr = WebSocketManager()
    alice = FakeWS()
    bob = FakeWS()

    async def scenario():
        await mgr.connect(alice, "alerts", username="alice")
        await mgr.connect(bob, "alerts", username="bob")
        await mgr.broadcast(
            "alerts",
            {"type": "price_alert_fired", "alert": {"username": "alice", "ticker": "AAPL"}},
            owner_username="alice",
        )

    _run(scenario())

    # Alice receives her alert; Bob must NOT (no cross-tenant leak).
    assert len(alice.alerts()) == 1
    assert alice.alerts()[0]["alert"]["ticker"] == "AAPL"
    assert bob.alerts() == []


def test_all_channel_subscriber_does_not_leak_other_users_alert():
    mgr = WebSocketManager()
    alice = FakeWS()
    eve = FakeWS()  # subscribes to the firehose "all" channel

    async def scenario():
        await mgr.connect(alice, "alerts", username="alice")
        await mgr.connect(eve, "all", username="eve")
        await mgr.broadcast(
            "alerts",
            {"type": "price_alert_fired", "alert": {"username": "alice"}},
            owner_username="alice",
        )

    _run(scenario())
    assert len(alice.alerts()) == 1
    assert eve.alerts() == []


def test_unscoped_broadcast_still_fans_out():
    """Non-private events (owner_username=None) keep broadcasting to everyone."""
    mgr = WebSocketManager()
    a = FakeWS()
    b = FakeWS()

    async def scenario():
        await mgr.connect(a, "signals", username="a")
        await mgr.connect(b, "signals", username="b")
        await mgr.broadcast("signals", {"type": "price_alert_fired", "alert": {}})

    _run(scenario())
    assert len(a.alerts()) == 1
    assert len(b.alerts()) == 1


def test_connection_without_known_owner_is_failed_closed():
    """A socket whose owner could not be decoded must not receive scoped data."""
    mgr = WebSocketManager()
    anon = FakeWS()

    async def scenario():
        await mgr.connect(anon, "alerts", username=None)
        await mgr.broadcast(
            "alerts",
            {"type": "price_alert_fired", "alert": {"username": "alice"}},
            owner_username="alice",
        )

    _run(scenario())
    assert anon.alerts() == []
